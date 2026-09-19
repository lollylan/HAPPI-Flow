import type {
  Absence,
  AbsenceSpan,
  IsoDate,
  PlanInput,
  PlanMode,
  PlanProposal,
  PlanResult,
} from '@haeppi/shared';
import {
  addDays,
  closedDateSet,
  eachDateInRange,
  fullName,
  generateWeekPlan,
  isoWeekday,
  startOfISOWeek,
} from '@haeppi/shared';
import type { Db } from '../db/index.js';
import { listEmployees, getEmployee } from '../db/repositories/employees.js';
import { listWorkAreas } from '../db/repositories/workAreas.js';
import { listDayBlocks } from '../db/repositories/dayBlocks.js';
import { listMatrix } from '../db/repositories/matrix.js';
import { readPracticeSettings } from '../db/repositories/settings.js';
import { listClosuresInRange } from '../db/repositories/absences.js';
import {
  hasAssignments,
  historyCounts,
  listAssignments,
  listLockedAssignments,
  listTemplate,
  listUnlockedAssignments,
  replaceWeek,
  savePlanRun,
} from '../db/repositories/roster.js';
import {
  createProposal,
  decideProposal,
  discardOpenProposalsForWeek,
  getProposal,
} from '../db/repositories/proposals.js';
import { writeAudit } from './audit.js';

/**
 * Planungsdienst: baut die Eingabe des Schedulers aus dem Datenbestand,
 * fuehrt ihn aus und legt das Ergebnis ab. Die Routen bleiben duenn.
 */

/** Abwesenheiten im Zeitraum, auf die Felder reduziert, die der Scheduler braucht. */
export function absenceSpansFor(db: Db, from: IsoDate, to: IsoDate): AbsenceSpan[] {
  const rows = db
    .prepare(
      `SELECT employee_id, start_date, end_date, status, half_day
         FROM absences
        WHERE status IN ('approved', 'requested')
          AND start_date <= ? AND end_date >= ?`,
    )
    .all(to, from) as {
    employee_id: string;
    start_date: string;
    end_date: string;
    status: 'approved' | 'requested';
    half_day: 'am' | 'pm' | null;
  }[];

  const spans: AbsenceSpan[] = rows.map((row) => ({
    employeeId: row.employee_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    halfDay: row.half_day,
  }));

  // Wiederkehrende Abwesenheiten (Berufsschule) als konkrete Tage.
  const recurring = db
    .prepare(
      `SELECT employee_id, weekday, valid_from, valid_to
         FROM recurring_absences
        WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)`,
    )
    .all(to, from) as {
    employee_id: string;
    weekday: number;
    valid_from: string;
    valid_to: string | null;
  }[];

  for (const date of eachDateInRange(from, to)) {
    const weekday = isoWeekday(date);
    for (const row of recurring) {
      if (row.weekday !== weekday) continue;
      if (date < row.valid_from || (row.valid_to !== null && date > row.valid_to)) continue;
      spans.push({
        employeeId: row.employee_id,
        startDate: date,
        endDate: date,
        status: 'approved',
        halfDay: null,
      });
    }
  }
  return spans;
}

/** Feiertage plus Praxis-Schliesstage: an ihnen wird nicht geplant. */
export function closedDatesFor(db: Db, from: IsoDate, to: IsoDate): Set<IsoDate> {
  const settings = readPracticeSettings(db);
  const fromYear = Number(from.slice(0, 4));
  const toYear = Number(to.slice(0, 4));
  const closed = closedDateSet(settings.holidays, fromYear - 1, toYear + 1);
  for (const closure of listClosuresInRange(db, from, to)) {
    for (const date of eachDateInRange(closure.startDate, closure.endDate)) closed.add(date);
  }
  return closed;
}

/** Baut die Eingabe fuer den Scheduler aus dem Datenbestand. */
export function buildPlanInput(db: Db, weekStart: IsoDate, mode: PlanMode): PlanInput {
  const settings = readPracticeSettings(db);
  const weekEnd = addDays(weekStart, 6);

  const employees = listEmployees(db).map((employee) => ({
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    staffType: employee.staffType,
    canHomeoffice: employee.canHomeoffice,
    skillIds: employee.skillIds,
    workTimes: employee.workTimes,
    targetHoursPerWeek: employee.targetHoursPerWeek,
    sortOrder: employee.sortOrder,
  }));

  return {
    weekStart,
    mode,
    dayBlocks: listDayBlocks(db),
    employees,
    workAreas: listWorkAreas(db),
    matrix: listMatrix(db),
    template: listTemplate(db),
    absences: absenceSpansFor(db, weekStart, weekEnd),
    pinned: listLockedAssignments(db, weekStart, weekEnd),
    previous: mode === 'replan' ? listUnlockedAssignments(db, weekStart, weekEnd) : [],
    recent: listAssignments(db, addDays(weekStart, -7), addDays(weekStart, -1)).map((entry) => ({
      date: entry.date,
      dayBlockId: entry.dayBlockId,
      workAreaId: entry.workAreaId,
      employeeId: entry.employeeId,
    })),
    closedDates: closedDatesFor(db, weekStart, weekEnd),
    history: historyCounts(db, weekStart, settings.fairnessWeeks),
    weights: settings.weights,
    minOverlapRatio: settings.minOverlapRatio,
  };
}

export interface PlanWeekOptions {
  readonly dryRun: boolean;
  readonly userId: string | null;
}

/** Plant eine Woche und speichert sie, wenn es kein Probelauf ist. */
export function planWeek(
  db: Db,
  weekStart: IsoDate,
  mode: PlanMode,
  options: PlanWeekOptions,
): PlanResult {
  const monday = startOfISOWeek(weekStart);
  const result = generateWeekPlan(buildPlanInput(db, monday, mode));

  if (!options.dryRun) {
    db.transaction(() => {
      replaceWeek(db, monday, addDays(monday, 6), result.assignments);
      // Ein neuer Plan macht offene Vorschlaege fuer die Woche gegenstandslos.
      discardOpenProposalsForWeek(db, monday, options.userId);
      savePlanRun(db, {
        weekStart: monday,
        mode,
        dryRun: false,
        userId: options.userId,
        diagnostics: result.diagnostics,
        score: result.score,
      });
    })();
    writeAudit(db, options.userId, 'generate', 'roster', `${mode}:${monday}`);
  }

  return result;
}

const unfilledCount = (result: PlanResult): number =>
  result.diagnostics.filter((entry) => entry.kind === 'unfilled_required').length;

/**
 * Rechnet fuer jede geplante Woche, die eine Abwesenheit trifft, einen
 * Umplanungsvorschlag. Der Plan selbst bleibt unveraendert - die
 * Praxisleitung entscheidet.
 */
export function proposeReplanForAbsence(
  db: Db,
  absence: Absence,
  userId: string | null,
): PlanProposal[] {
  if (absence.status !== 'approved') return [];
  const employee = getEmployee(db, absence.employeeId);
  const proposals: PlanProposal[] = [];

  let monday = startOfISOWeek(absence.startDate);
  const lastMonday = startOfISOWeek(absence.endDate);
  for (let guard = 0; monday <= lastMonday && guard < 60; guard++, monday = addDays(monday, 7)) {
    const weekEnd = addDays(monday, 6);
    if (!hasAssignments(db, monday, weekEnd)) continue;

    const result = generateWeekPlan(buildPlanInput(db, monday, 'replan'));
    if (result.changes.length === 0) continue;

    const range =
      absence.startDate === absence.endDate
        ? formatDate(absence.startDate)
        : `${formatDate(absence.startDate)} – ${formatDate(absence.endDate)}`;
    const title = `Ausfall ${employee ? fullName(employee) : 'unbekannt'} (${range})`;

    discardOpenProposalsForWeek(db, monday, userId);
    proposals.push(
      createProposal(db, {
        weekStart: monday,
        trigger: 'absence',
        triggerRef: absence.id,
        title,
        payload: {
          assignments: result.assignments,
          diagnostics: result.diagnostics,
          changes: result.changes,
        },
        unfilledRequired: unfilledCount(result),
      }),
    );
  }
  return proposals;
}

/** Uebernimmt einen Vorschlag als Wochenplan. */
export function applyProposal(db: Db, id: string, userId: string): PlanProposal | null {
  const found = getProposal(db, id);
  if (!found || found.proposal.status !== 'open') return null;

  const { proposal, payload } = found;
  const monday = proposal.weekStart;
  db.transaction(() => {
    replaceWeek(db, monday, addDays(monday, 6), payload.assignments);
    savePlanRun(db, {
      weekStart: monday,
      mode: 'replan',
      dryRun: false,
      userId,
      diagnostics: payload.diagnostics,
      score: 0,
    });
    decideProposal(db, id, 'applied', userId);
  })();
  writeAudit(db, userId, 'apply', 'proposal', id, monday);
  return getProposal(db, id)?.proposal ?? null;
}

function formatDate(iso: IsoDate): string {
  return `${iso.slice(8)}.${iso.slice(5, 7)}.`;
}
