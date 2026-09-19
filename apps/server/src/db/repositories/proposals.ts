import { randomUUID } from 'node:crypto';
import type {
  Diagnostic,
  Id,
  IsoDate,
  PlanChange,
  PlanProposal,
  PlannedAssignment,
  ProposalStatus,
} from '@haeppi/shared';
import type { Db } from '../index.js';

/**
 * Umplanungsvorschlaege.
 *
 * Der Vorschlag traegt den kompletten neuen Wochenplan in seiner Nutzlast;
 * beim Uebernehmen wird die Woche damit ersetzt. Zwischen Erstellen und
 * Entscheiden kann sich die Woche geaendert haben - das nimmt die Route
 * in Kauf und weist es aus, statt zu raten.
 */

interface ProposalRow {
  id: string;
  week_start: string;
  trigger: 'absence' | 'manual';
  trigger_ref: string | null;
  title: string;
  status: ProposalStatus;
  payload: string;
  unfilled_required: number;
  created_at: string;
  decided_at: string | null;
}

export interface ProposalPayload {
  readonly assignments: readonly PlannedAssignment[];
  readonly diagnostics: readonly Diagnostic[];
  readonly changes: readonly PlanChange[];
}

function parsePayload(text: string): ProposalPayload {
  try {
    return JSON.parse(text) as ProposalPayload;
  } catch {
    return { assignments: [], diagnostics: [], changes: [] };
  }
}

const toProposal = (row: ProposalRow): PlanProposal => ({
  id: row.id,
  weekStart: row.week_start,
  trigger: row.trigger,
  title: row.title,
  status: row.status,
  createdAt: row.created_at,
  decidedAt: row.decided_at,
  changes: parsePayload(row.payload).changes,
  unfilledRequired: row.unfilled_required,
});

export function listProposals(db: Db, status?: ProposalStatus): PlanProposal[] {
  const rows = status
    ? (db
        .prepare(`SELECT * FROM plan_proposals WHERE status = ? ORDER BY week_start, created_at`)
        .all(status) as ProposalRow[])
    : (db
        .prepare(`SELECT * FROM plan_proposals ORDER BY created_at DESC LIMIT 100`)
        .all() as ProposalRow[]);
  return rows.map(toProposal);
}

export function getProposal(
  db: Db,
  id: Id,
): { proposal: PlanProposal; payload: ProposalPayload } | null {
  const row = db.prepare(`SELECT * FROM plan_proposals WHERE id = ?`).get(id) as
    ProposalRow | undefined;
  if (!row) return null;
  return { proposal: toProposal(row), payload: parsePayload(row.payload) };
}

export function createProposal(
  db: Db,
  input: {
    weekStart: IsoDate;
    trigger: 'absence' | 'manual';
    triggerRef: string | null;
    title: string;
    payload: ProposalPayload;
    unfilledRequired: number;
  },
): PlanProposal {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO plan_proposals
       (id, week_start, trigger, trigger_ref, title, payload, unfilled_required)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.weekStart,
    input.trigger,
    input.triggerRef,
    input.title,
    JSON.stringify(input.payload),
    input.unfilledRequired,
  );
  return getProposal(db, id)!.proposal;
}

/** Offene Vorschlaege derselben Woche werden durch einen neuen ueberholt. */
export function discardOpenProposalsForWeek(
  db: Db,
  weekStart: IsoDate,
  decidedBy: Id | null,
): void {
  db.prepare(
    `UPDATE plan_proposals
        SET status = 'discarded', decided_at = datetime('now'), decided_by = ?
      WHERE week_start = ? AND status = 'open'`,
  ).run(decidedBy, weekStart);
}

export function decideProposal(
  db: Db,
  id: Id,
  status: 'applied' | 'discarded',
  decidedBy: Id,
): PlanProposal | null {
  const result = db
    .prepare(
      `UPDATE plan_proposals
          SET status = ?, decided_at = datetime('now'), decided_by = ?
        WHERE id = ? AND status = 'open'`,
    )
    .run(status, decidedBy, id);
  return result.changes > 0 ? (getProposal(db, id)?.proposal ?? null) : null;
}

export function countOpenProposals(db: Db): number {
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM plan_proposals WHERE status = 'open'`).get() as {
      n: number;
    }
  ).n;
}
