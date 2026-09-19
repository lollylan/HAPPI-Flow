import { Router } from 'express';
import { z } from 'zod';
import type { AbsenceType, ClosurePlan, VacationBalance } from '@haeppi/shared';
import {
  addDays,
  assertIsoDate,
  assessAbsence,
  calculateVacationBalance,
  closedDateSet,
  consumesVacationDays,
  planClosure,
} from '@haeppi/shared';
import { requireAdmin, requireAuth } from '../../auth/middleware.js';
import type { Db } from '../../db/index.js';
import {
  countOpenRequests,
  createAbsence,
  createClosure,
  createRecurringAbsence,
  decideAbsence,
  deleteAbsence,
  deleteClosure,
  deleteRecurringAbsence,
  dutyHistory,
  getAbsence,
  getClosure,
  getVacationAccount,
  listAbsences,
  listAbsencesOfEmployee,
  listClosureDuties,
  listClosures,
  listRecurringAbsences,
  replaceClosureDuties,
  setVacationAccount,
  updateClosure,
} from '../../db/repositories/absences.js';
import { getEmployee, listEmployees } from '../../db/repositories/employees.js';
import { listWorkAreas } from '../../db/repositories/workAreas.js';
import { listDayBlocks } from '../../db/repositories/dayBlocks.js';
import { readPracticeSettings } from '../../db/repositories/settings.js';
import { badRequest, notFound, parseBody, pathParam } from '../http.js';
import { serializeAbsences } from '../serializers/absenceSerializer.js';
import { closureSchema } from '../schemas.js';
import { writeAudit } from '../audit.js';
import { absenceSpansFor, closedDatesFor, proposeReplanForAbsence } from '../planning.js';

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Erwartet ein Datum im Format JJJJ-MM-TT');

const absenceSchema = z
  .object({
    employeeId: z.string(),
    startDate: ISO_DATE,
    endDate: ISO_DATE,
    type: z.enum(['vacation', 'sick', 'training', 'school', 'special', 'timeoff']),
    halfDay: z.enum(['am', 'pm']).nullable().default(null),
    note: z.string().max(500).default(''),
  })
  .refine((input) => input.endDate >= input.startDate, {
    message: 'Das Ende darf nicht vor dem Beginn liegen.',
    path: ['endDate'],
  })
  .refine((input) => input.halfDay === null || input.startDate === input.endDate, {
    message: 'Ein halber Tag ist nur bei eintägigen Abwesenheiten möglich.',
    path: ['halfDay'],
  });

const recurringSchema = z.object({
  employeeId: z.string(),
  weekday: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  type: z.enum(['vacation', 'sick', 'training', 'school', 'special', 'timeoff']).default('school'),
  validFrom: ISO_DATE,
  validTo: ISO_DATE.nullable().default(null),
  note: z.string().max(200).default(''),
});

/** Welche Abwesenheiten Mitarbeiter fuer sich selbst eintragen duerfen. */
const SELF_SERVICE_TYPES: readonly AbsenceType[] = ['vacation', 'sick'];

export function absencesRouter(): Router {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    const from = assertIsoDate(String(req.query.from ?? ''));
    const to = assertIsoDate(String(req.query.to ?? ''));
    // Die Projektion entscheidet, wer den Grund sieht - nicht die Oberflaeche.
    res.json({ absences: serializeAbsences(listAbsences(req.db, from, to), req.user) });
  });

  router.get('/open-requests', requireAdmin, (req, res) => {
    res.json({ count: countOpenRequests(req.db) });
  });

  /**
   * Antragspruefung: wird es an den Tagen eng? Fuer die eigene Person
   * und fuer die Praxisleitung. Kolleginnen sehen dabei nur Kopfzahlen,
   * keine Gruende.
   */
  router.get('/check', requireAuth, (req, res) => {
    const employeeId = String(req.query.employeeId ?? '');
    const startDate = assertIsoDate(String(req.query.startDate ?? ''));
    const endDate = assertIsoDate(String(req.query.endDate ?? ''));
    const user = req.user!;
    if (user.role !== 'admin' && user.employeeId !== employeeId) {
      throw badRequest('Die Prüfung gibt es nur für die eigene Person.');
    }
    if (endDate < startDate) throw badRequest('Das Ende darf nicht vor dem Beginn liegen.');

    const result = assessAbsence({
      employeeId,
      startDate,
      endDate,
      employees: listEmployees(req.db),
      // Inklusive Berufsschultage - die fehlen sonst in der Kopfzahl.
      absences: absenceSpansFor(req.db, startDate, endDate),
      workAreas: listWorkAreas(req.db),
      dayBlocks: listDayBlocks(req.db),
      closedDates: closedDatesFor(req.db, startDate, endDate),
    });
    res.json({ check: result });
  });

  router.post('/', requireAuth, (req, res) => {
    const input = parseBody(absenceSchema, req.body);
    const user = req.user!;
    const isOwn = user.employeeId !== null && user.employeeId === input.employeeId;

    if (user.role !== 'admin') {
      if (!isOwn)
        throw badRequest('Abwesenheiten lassen sich nur für die eigene Person eintragen.');
      if (!SELF_SERVICE_TYPES.includes(input.type)) {
        throw badRequest('Diese Art der Abwesenheit trägt die Praxisleitung ein.');
      }
    }

    if (!getEmployee(req.db, input.employeeId)) throw notFound('Diesen Mitarbeiter gibt es nicht.');

    // Urlaub der Praxisleitung ist sofort genehmigt; ein Urlaubsantrag einer
    // Mitarbeiterin wartet auf Entscheidung. Eine Krankmeldung ist keine
    // Bitte - sie gilt sofort.
    const status =
      user.role === 'admin' || input.type === 'sick'
        ? ('approved' as const)
        : ('requested' as const);

    const absence = createAbsence(req.db, { ...input, status }, user.userId);
    writeAudit(req.db, user.userId, 'create', 'absence', absence.id, input.type);

    // Der Plan aendert sich nicht von selbst: fuer betroffene, schon
    // geplante Wochen entsteht ein Vorschlag fuer die Praxisleitung.
    const proposals = proposeReplanForAbsence(req.db, absence, user.userId);
    res.status(201).json({ absence, proposals });
  });

  router.post('/:id/decide', requireAdmin, (req, res) => {
    const status = z.enum(['approved', 'rejected']).parse(req.body?.status);
    const absence = decideAbsence(req.db, pathParam(req, 'id'), status, req.user!.userId);
    if (!absence) throw notFound('Diese Abwesenheit gibt es nicht.');
    writeAudit(req.db, req.user!.userId, status, 'absence', absence.id);
    const proposals = proposeReplanForAbsence(req.db, absence, req.user!.userId);
    res.json({ absence, proposals });
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const id = pathParam(req, 'id');
    const absence = getAbsence(req.db, id);
    if (!absence) throw notFound('Diese Abwesenheit gibt es nicht.');

    const user = req.user!;
    if (user.role !== 'admin') {
      if (user.employeeId !== absence.employeeId) {
        throw badRequest('Fremde Abwesenheiten lassen sich nicht löschen.');
      }
      // Was bereits genehmigt ist, nimmt die Praxisleitung zurueck.
      if (absence.status === 'approved' && absence.type !== 'sick') {
        throw badRequest('Genehmigten Urlaub kann nur die Praxisleitung zurücknehmen.');
      }
    }

    deleteAbsence(req.db, id);
    writeAudit(req.db, user.userId, 'delete', 'absence', id);
    res.status(204).end();
  });

  /** Urlaubskonto einer Person - nur fuer sie selbst und die Praxisleitung. */
  router.get('/vacation/:employeeId', requireAuth, (req, res) => {
    const employeeId = pathParam(req, 'employeeId');
    const user = req.user!;
    if (user.role !== 'admin' && user.employeeId !== employeeId) {
      throw badRequest('Kein Zugriff auf fremde Urlaubskonten.');
    }

    const employee = getEmployee(req.db, employeeId);
    if (!employee) throw notFound('Diesen Mitarbeiter gibt es nicht.');

    const year = Number(req.query.year ?? new Date().getFullYear());
    const account = getVacationAccount(req.db, employeeId, year);
    const settings = readPracticeSettings(req.db);
    const closed = closedDateSet(settings.holidays, year, year);

    const approved = listAbsencesOfEmployee(req.db, employeeId, year).filter(
      (absence) => absence.status === 'approved' && consumesVacationDays(absence.type),
    );

    const balance: VacationBalance = calculateVacationBalance(
      { entitlement: account.entitlement, carryover: account.carryover },
      approved,
      employee.workTimes,
      closed,
    );

    res.json({ year, account, balance });
  });

  router.put('/vacation/:employeeId', requireAdmin, (req, res) => {
    const employeeId = pathParam(req, 'employeeId');
    const input = z
      .object({
        year: z.number().int().min(2000).max(2100),
        entitlement: z.number().min(0).max(99),
        carryover: z.number().min(-99).max(99),
        carryoverExpires: ISO_DATE.nullable().default(null),
      })
      .parse(req.body);

    setVacationAccount(req.db, { employeeId, ...input });
    res.json({ account: getVacationAccount(req.db, employeeId, input.year) });
  });

  return router;
}

/** Rechnet die Notbesetzung einer Schliessung aus dem aktuellen Datenbestand. */
function computeClosurePlan(db: Db, closureId: string): ClosurePlan | null {
  const closure = getClosure(db, closureId);
  if (!closure) return null;
  const settings = readPracticeSettings(db);
  const year = Number(closure.startDate.slice(0, 4));
  return planClosure({
    closure,
    employees: listEmployees(db),
    absences: listAbsences(db, addDays(closure.startDate, -1), addDays(closure.endDate, 1)),
    dutyHistory: dutyHistory(db, closure.startDate),
    closedDates: closedDateSet(settings.holidays, year, year + 1),
  });
}

export function closuresRouter(): Router {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    res.json({ closures: listClosures(req.db) });
  });

  router.post('/', requireAdmin, (req, res) => {
    const closure = createClosure(req.db, parseBody(closureSchema, req.body));
    writeAudit(req.db, req.user!.userId, 'create', 'closure', closure.id);
    res.status(201).json({ closure });
  });

  router.put('/:id', requireAdmin, (req, res) => {
    const closure = updateClosure(req.db, pathParam(req, 'id'), parseBody(closureSchema, req.body));
    if (!closure) throw notFound('Schließzeit nicht gefunden.');
    writeAudit(req.db, req.user!.userId, 'update', 'closure', closure.id);
    res.json({ closure });
  });

  router.delete('/:id', requireAdmin, (req, res) => {
    if (!deleteClosure(req.db, pathParam(req, 'id'))) throw notFound('Schließzeit nicht gefunden.');
    res.status(204).end();
  });

  router.get('/:id/duties', requireAuth, (req, res) => {
    if (!getClosure(req.db, pathParam(req, 'id'))) throw notFound('Schließzeit nicht gefunden.');
    res.json({ duties: listClosureDuties(req.db, pathParam(req, 'id')) });
  });

  /**
   * Notbesetzung und Urlaub verteilen. Mit `dryRun` nur die Vorschau; sonst
   * werden Notdienste gespeichert, offene Urlaubswuensche im Zeitraum
   * genehmigt und fuer alle uebrigen Tage Urlaub eingetragen.
   */
  router.post('/:id/plan', requireAdmin, (req, res) => {
    const id = pathParam(req, 'id');
    const dryRun = req.body?.dryRun === true;
    const closure = getClosure(req.db, id);
    if (!closure) throw notFound('Schließzeit nicht gefunden.');

    if (dryRun) {
      res.json({ plan: computeClosurePlan(req.db, id), applied: false });
      return;
    }

    const userId = req.user!.userId;
    const plan = req.db.transaction(() => {
      // Wuensche zuerst genehmigen, damit sie in der Verteilung als fest gelten.
      const requests = listAbsences(req.db, closure.startDate, closure.endDate).filter(
        (absence) => absence.status === 'requested' && absence.type === 'vacation',
      );
      for (const request of requests) decideAbsence(req.db, request.id, 'approved', userId);

      const computed = computeClosurePlan(req.db, id);
      if (!computed) throw notFound('Schließzeit nicht gefunden.');

      replaceClosureDuties(req.db, id, computed.duties);
      for (const vacation of computed.vacations) {
        createAbsence(
          req.db,
          {
            employeeId: vacation.employeeId,
            startDate: vacation.startDate,
            endDate: vacation.endDate,
            type: 'vacation',
            status: 'approved',
            halfDay: null,
            note: `Praxisschließung${closure.description ? `: ${closure.description}` : ''}`,
          },
          userId,
        );
      }
      return computed;
    })();

    writeAudit(req.db, userId, 'plan', 'closure', id, `${plan.duties.length} Notdienste`);
    res.json({ plan, applied: true });
  });

  return router;
}

export function recurringAbsencesRouter(): Router {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    res.json({ entries: listRecurringAbsences(req.db) });
  });

  router.post('/', requireAdmin, (req, res) => {
    const entry = createRecurringAbsence(req.db, parseBody(recurringSchema, req.body));
    res.status(201).json({ entry });
  });

  router.delete('/:id', requireAdmin, (req, res) => {
    if (!deleteRecurringAbsence(req.db, pathParam(req, 'id'))) throw notFound('Nicht gefunden.');
    res.status(204).end();
  });

  return router;
}
