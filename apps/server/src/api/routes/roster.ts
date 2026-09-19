import { Router } from 'express';
import { z } from 'zod';
import type { PlanResult } from '@haeppi/shared';
import { addDays, assertIsoDate, startOfISOWeek } from '@haeppi/shared';
import { requireAdmin, requireAuth } from '../../auth/middleware.js';
import { listDayBlocks } from '../../db/repositories/dayBlocks.js';
import { listDutiesInRange } from '../../db/repositories/absences.js';
import {
  createAssignment,
  deleteAssignment,
  findTimeConflict,
  lastPlanRun,
  listAssignments,
  listTemplate,
  replaceTemplate,
  setAssignmentLock,
  templateFromWeek,
} from '../../db/repositories/roster.js';
import {
  countOpenProposals,
  decideProposal,
  getProposal,
  listProposals,
} from '../../db/repositories/proposals.js';
import { badRequest, notFound, parseBody, pathParam } from '../http.js';
import { writeAudit } from '../audit.js';
import { applyProposal, planWeek } from '../planning.js';

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const planSchema = z.enum(['doctor', 'pcm', 'mfa']);

const generateSchema = z.object({
  weekStart: ISO_DATE,
  /** Wie viele Wochen ab `weekStart` - fuer "die nächsten vier Wochen planen". */
  weeks: z.number().int().min(1).max(12).default(1),
  mode: z.enum(['fresh', 'replan']).default('fresh'),
  dryRun: z.boolean().optional(),
});

const assignmentSchema = z.object({
  date: ISO_DATE,
  dayBlockId: z.string(),
  workAreaId: z.string(),
  employeeId: z.string(),
  isLocked: z.boolean().optional(),
});

const templateSchema = z.object({
  entries: z
    .array(
      z.object({
        employeeId: z.string(),
        workAreaId: z.string(),
        dayBlockId: z.string(),
      }),
    )
    .max(1000),
});

export function rosterRouter(): Router {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    const from = assertIsoDate(String(req.query.from ?? ''));
    const to = assertIsoDate(String(req.query.to ?? ''));
    const parsedPlan = planSchema.safeParse(req.query.plan);
    res.json({
      assignments: listAssignments(
        req.db,
        from,
        to,
        parsedPlan.success ? parsedPlan.data : undefined,
      ),
    });
  });

  /** Notbesetzung an Schliesstagen im Zeitraum - fuer die Anzeige im Plan. */
  router.get('/duties', requireAuth, (req, res) => {
    const from = assertIsoDate(String(req.query.from ?? ''));
    const to = assertIsoDate(String(req.query.to ?? ''));
    res.json({ duties: listDutiesInRange(req.db, from, to) });
  });

  /**
   * Plant eine oder mehrere Wochen fuer alle Gruppen. Mit `dryRun` wird
   * nichts gespeichert - so laesst sich das Ergebnis erst ansehen und
   * dann uebernehmen. `replan` behaelt die bisherige Woche, soweit moeglich.
   */
  router.post('/generate', requireAdmin, (req, res) => {
    const { weekStart, weeks, mode, dryRun } = parseBody(generateSchema, req.body);
    const monday = startOfISOWeek(assertIsoDate(weekStart));

    const results: (PlanResult & { weekStart: string })[] = [];
    for (let index = 0; index < weeks; index++) {
      const start = addDays(monday, 7 * index);
      const result = planWeek(req.db, start, mode, {
        dryRun: dryRun === true,
        userId: req.user!.userId,
      });
      results.push({ weekStart: start, ...result });
    }

    res.json({
      weekStart: monday,
      weeks,
      mode,
      dryRun: dryRun === true,
      results,
    });
  });

  /** Auswertung des letzten gespeicherten Laufs einer Woche. */
  router.get('/runs/:weekStart', requireAuth, (req, res) => {
    const monday = startOfISOWeek(assertIsoDate(pathParam(req, 'weekStart')));
    res.json({ run: lastPlanRun(req.db, monday) });
  });

  // ------------------------------------------------ Umplanungsvorschlaege --

  router.get('/proposals', requireAdmin, (req, res) => {
    const status = z.enum(['open', 'applied', 'discarded']).safeParse(req.query.status);
    res.json({
      proposals: listProposals(req.db, status.success ? status.data : 'open'),
      openCount: countOpenProposals(req.db),
    });
  });

  router.get('/proposals/:id', requireAdmin, (req, res) => {
    const found = getProposal(req.db, pathParam(req, 'id'));
    if (!found) throw notFound('Diesen Vorschlag gibt es nicht.');
    res.json({
      proposal: found.proposal,
      assignments: found.payload.assignments,
      diagnostics: found.payload.diagnostics,
    });
  });

  router.post('/proposals/:id/apply', requireAdmin, (req, res) => {
    const proposal = applyProposal(req.db, pathParam(req, 'id'), req.user!.userId);
    if (!proposal) throw notFound('Diesen Vorschlag gibt es nicht oder er ist schon entschieden.');
    res.json({ proposal });
  });

  router.post('/proposals/:id/discard', requireAdmin, (req, res) => {
    const proposal = decideProposal(req.db, pathParam(req, 'id'), 'discarded', req.user!.userId);
    if (!proposal) throw notFound('Diesen Vorschlag gibt es nicht oder er ist schon entschieden.');
    writeAudit(req.db, req.user!.userId, 'discard', 'proposal', proposal.id);
    res.json({ proposal });
  });

  // -------------------------------------------------------- Zuweisungen --

  router.post('/assignments', requireAdmin, (req, res) => {
    const input = parseBody(assignmentSchema, req.body);

    const block = listDayBlocks(req.db).find((entry) => entry.id === input.dayBlockId);
    if (!block) throw badRequest('Diesen Zeitblock gibt es nicht.');
    const clash = findTimeConflict(
      req.db,
      input.employeeId,
      input.date,
      block.startMin,
      block.endMin,
    );
    if (clash) {
      throw badRequest('Diese Person ist in dem Zeitfenster bereits woanders eingeteilt.');
    }

    const assignment = createAssignment(req.db, {
      date: input.date,
      dayBlockId: input.dayBlockId,
      workAreaId: input.workAreaId,
      employeeId: input.employeeId,
      // Von Hand gesetzte Zuweisungen sind automatisch gesperrt: sonst
      // waeren sie beim naechsten Erzeugen wieder weg.
      isLocked: input.isLocked ?? true,
    });
    if (!assignment) {
      throw badRequest('Diese Person ist in dem Zeitfenster bereits woanders eingeteilt.');
    }
    res.status(201).json({ assignment });
  });

  router.delete('/assignments/:id', requireAdmin, (req, res) => {
    if (!deleteAssignment(req.db, pathParam(req, 'id')))
      throw notFound('Zuweisung nicht gefunden.');
    res.status(204).end();
  });

  router.post('/assignments/:id/lock', requireAdmin, (req, res) => {
    const locked = req.body?.locked !== false;
    const assignment = setAssignmentLock(req.db, pathParam(req, 'id'), locked);
    if (!assignment) throw notFound('Zuweisung nicht gefunden.');
    res.json({ assignment });
  });

  return router;
}

export function templateRouter(): Router {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    res.json({ entries: listTemplate(req.db) });
  });

  router.put('/', requireAdmin, (req, res) => {
    const { entries } = parseBody(templateSchema, req.body);
    const saved = replaceTemplate(req.db, entries);
    writeAudit(req.db, req.user!.userId, 'update', 'template', null, `${entries.length} Zeilen`);
    res.json({ entries: saved });
  });

  /** Eine konkrete Woche wird zur Musterwoche. */
  router.post('/from-week', requireAdmin, (req, res) => {
    const { weekStart } = parseBody(z.object({ weekStart: ISO_DATE }), req.body);
    const monday = startOfISOWeek(assertIsoDate(weekStart));
    const entries = templateFromWeek(req.db, monday, addDays(monday, 6));
    writeAudit(req.db, req.user!.userId, 'update', 'template', null, `aus KW ${monday}`);
    res.json({ entries });
  });

  return router;
}
