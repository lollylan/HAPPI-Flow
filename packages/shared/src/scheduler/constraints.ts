import type { Id, IsoDate } from '../types/common.js';
import { isPracticeWeekday } from '../types/common.js';
import type { DayBlock } from '../types/dayBlock.js';
import type { MatrixEntry } from '../types/matrix.js';
import type { WorkArea } from '../types/workArea.js';
import { planForStaffType } from '../types/employee.js';
import { HALF_DAY_SPLIT_MIN } from '../types/absence.js';
import type { TimeInterval } from '../time/minutes.js';
import { coverageRatio, intervalsOverlap } from '../time/minutes.js';
import { isoWeekday, isWithinRange } from '../time/dates.js';
import type { AbsenceSpan, PlanEmployee, RejectionCode } from './types.js';

export interface SeatSlot {
  readonly date: IsoDate;
  readonly block: DayBlock;
  readonly area: WorkArea;
}

/** Ein bereits belegtes Zeitfenster einer Person. */
export interface OccupiedSpan extends TimeInterval {
  readonly date: IsoDate;
}

export interface EligibilityContext {
  /** Bereits belegte Zeitfenster der Person. */
  readonly occupied: readonly OccupiedSpan[];
  /** Einsaetze der Person je Bereich in dieser Woche. */
  readonly weekCounts: ReadonlyMap<string, number>;
  readonly matrix: ReadonlyMap<string, MatrixEntry>;
  readonly absences: readonly AbsenceSpan[];
  readonly minOverlapRatio: number;
}

export const blockKey = (date: IsoDate, dayBlockId: Id): string => `${date}|${dayBlockId}`;
export const areaKey = (employeeId: Id, workAreaId: Id): string => `${employeeId}|${workAreaId}`;

/**
 * Ob eine Abwesenheit den Block trifft. Ein halber Tag sperrt nur die
 * Bloecke seiner Tageshaelfte: "vormittags frei" laesst den Nachmittag zu.
 */
export function absenceCoversBlock(
  absence: Pick<AbsenceSpan, 'halfDay'>,
  block: Pick<DayBlock, 'startMin' | 'endMin'>,
): boolean {
  if (absence.halfDay === null) return true;
  if (absence.halfDay === 'am') return block.startMin < HALF_DAY_SPLIT_MIN;
  return block.endMin > HALF_DAY_SPLIT_MIN;
}

/** Genehmigte Abwesenheit in diesem Block - sperrt hart. */
export function hasApprovedAbsence(
  absences: readonly AbsenceSpan[],
  employeeId: Id,
  date: IsoDate,
  block: Pick<DayBlock, 'startMin' | 'endMin'>,
): boolean {
  return absences.some(
    (absence) =>
      absence.employeeId === employeeId &&
      absence.status === 'approved' &&
      isWithinRange(date, absence.startDate, absence.endDate) &&
      absenceCoversBlock(absence, block),
  );
}

/** Beantragter, noch nicht entschiedener Urlaub - macht den Einsatz nur teuer. */
export function hasRequestedAbsence(
  absences: readonly AbsenceSpan[],
  employeeId: Id,
  date: IsoDate,
  block: Pick<DayBlock, 'startMin' | 'endMin'>,
): boolean {
  return absences.some(
    (absence) =>
      absence.employeeId === employeeId &&
      absence.status === 'requested' &&
      isWithinRange(date, absence.startDate, absence.endDate) &&
      absenceCoversBlock(absence, block),
  );
}

/** Ob die Person in diesem Zeitfenster schon woanders steht. */
export function isOccupied(
  occupied: readonly OccupiedSpan[],
  date: IsoDate,
  block: TimeInterval,
): boolean {
  return occupied.some((span) => span.date === date && intervalsOverlap(span, block));
}

/**
 * Prueft alle harten Bedingungen und liefert den Grund der Ablehnung
 * oder `null`, wenn die Person eingesetzt werden darf.
 *
 * Die Ablehnungscodes sind keine Deko: aus ihrer Verteilung entsteht die
 * Diagnose, die einen unbesetzten Pflichtplatz erklaert. Die
 * Vorgaengerversion scheiterte hier stillschweigend.
 *
 * `NEEDS_SUPERVISION` wird bewusst **nicht** hier geprueft - ob eine
 * Betreuung anwesend ist, haengt vom Rest der Loesung ab und wird im
 * zweiten Zuordnungsdurchlauf entschieden.
 */
export function checkEligibility(
  employee: PlanEmployee,
  slot: SeatSlot,
  context: EligibilityContext,
): RejectionCode | null {
  const entry = context.matrix.get(areaKey(employee.id, slot.area.id));

  // Fremde Gruppe nur mit ausdruecklicher Freigabe in der Einsatz-Matrix:
  // so kann die PCM fuer einen einzelnen MFA-Bereich freigegeben sein,
  // ohne zum MFA-Pool zu gehoeren.
  if (planForStaffType(employee.staffType) !== slot.area.plan) {
    if (!entry || entry.clearance === 'blocked') return 'WRONG_PLAN';
  }

  const weekday = isoWeekday(slot.date);
  if (!isPracticeWeekday(weekday)) return 'NOT_WORKING';

  const workTime = employee.workTimes[weekday];
  if (!workTime.isWorking) return 'NOT_WORKING';

  // Der Fix des zentralen Fehlers aus v1: echter Intervallschnitt statt
  // Textvergleich. Wer um 09:00 anfaengt, deckt den Block 08:00-13:00 zu
  // 80 % ab und ist damit klar einsetzbar.
  if (coverageRatio(workTime, slot.block) < context.minOverlapRatio) {
    return 'INSUFFICIENT_OVERLAP';
  }

  if (hasApprovedAbsence(context.absences, employee.id, slot.date, slot.block)) return 'ABSENT';

  if (isOccupied(context.occupied, slot.date, slot.block)) return 'ALREADY_ASSIGNED';

  // Homeoffice-Tag: nur Bereiche, die von zu Hause gehen.
  if (workTime.location === 'home' && slot.area.location === 'practice') {
    return 'WRONG_LOCATION';
  }
  if (slot.area.location === 'home' && !employee.canHomeoffice) return 'NO_HOMEOFFICE';

  for (const skillId of slot.area.requiredSkillIds) {
    if (!employee.skillIds.includes(skillId)) return 'MISSING_SKILL';
  }

  if (entry?.clearance === 'blocked') return 'BLOCKED';

  const maxPerWeek = entry?.maxPerWeek ?? null;
  if (maxPerWeek !== null) {
    const done = context.weekCounts.get(areaKey(employee.id, slot.area.id)) ?? 0;
    if (done >= maxPerWeek) return 'MAX_PER_WEEK';
  }

  return null;
}

/** Ob die Person in diesem Bereich eine Betreuung braucht. */
export function needsSupervision(
  employee: PlanEmployee,
  area: WorkArea,
  matrix: ReadonlyMap<string, MatrixEntry>,
): boolean {
  return matrix.get(areaKey(employee.id, area.id))?.clearance === 'supervised';
}
