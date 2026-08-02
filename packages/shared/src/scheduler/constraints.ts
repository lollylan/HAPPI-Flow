import type { Id, IsoDate } from '../types/common.js';
import { isPracticeWeekday } from '../types/common.js';
import type { DayBlock } from '../types/dayBlock.js';
import type { MatrixEntry } from '../types/matrix.js';
import type { WorkArea } from '../types/workArea.js';
import { planForStaffType } from '../types/employee.js';
import { coverageRatio } from '../time/minutes.js';
import { isoWeekday, isWithinRange } from '../time/dates.js';
import type { AbsenceSpan, PlanEmployee, RejectionCode } from './types.js';

export interface SeatSlot {
  readonly date: IsoDate;
  readonly block: DayBlock;
  readonly area: WorkArea;
}

export interface EligibilityContext {
  /** Bereits belegte (Datum|Block)-Kombinationen der Person. */
  readonly occupiedBlocks: ReadonlySet<string>;
  /** Einsaetze der Person je Bereich in dieser Woche. */
  readonly weekCounts: ReadonlyMap<string, number>;
  readonly matrix: ReadonlyMap<string, MatrixEntry>;
  readonly absences: readonly AbsenceSpan[];
  readonly pcmBusy: ReadonlySet<string>;
  readonly minOverlapRatio: number;
}

export const blockKey = (date: IsoDate, dayBlockId: Id): string => `${date}|${dayBlockId}`;
export const areaKey = (employeeId: Id, workAreaId: Id): string => `${employeeId}|${workAreaId}`;

/** Genehmigte Abwesenheit an diesem Tag - sperrt hart. */
export function hasApprovedAbsence(
  absences: readonly AbsenceSpan[],
  employeeId: Id,
  date: IsoDate,
): boolean {
  return absences.some(
    (absence) =>
      absence.employeeId === employeeId &&
      absence.status === 'approved' &&
      // Halbtags sperrt den Tag nicht komplett; die Feinheit greift erst,
      // wenn die Blockzeiten mit der Tageshaelfte abgeglichen werden.
      absence.halfDay === null &&
      isWithinRange(date, absence.startDate, absence.endDate),
  );
}

/** Beantragter, noch nicht entschiedener Urlaub - macht den Einsatz nur teuer. */
export function hasRequestedAbsence(
  absences: readonly AbsenceSpan[],
  employeeId: Id,
  date: IsoDate,
): boolean {
  return absences.some(
    (absence) =>
      absence.employeeId === employeeId &&
      absence.status === 'requested' &&
      isWithinRange(date, absence.startDate, absence.endDate),
  );
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
  if (planForStaffType(employee.staffType) !== slot.area.plan) return 'WRONG_PLAN';

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

  if (hasApprovedAbsence(context.absences, employee.id, slot.date)) return 'ABSENT';

  if (context.occupiedBlocks.has(blockKey(slot.date, slot.block.id))) return 'ALREADY_ASSIGNED';

  // Die PCM haelt in diesem Zeitfenster Sprechstunde und faellt damit aus
  // dem MFA-Pool - sie kann nicht an zwei Orten sein.
  if (employee.isPcm && context.pcmBusy.has(blockKey(slot.date, slot.block.id))) {
    return 'PCM_BUSY';
  }

  if (slot.area.requiresHomeoffice && !employee.canHomeoffice) return 'NO_HOMEOFFICE';

  for (const skillId of slot.area.requiredSkillIds) {
    if (!employee.skillIds.includes(skillId)) return 'MISSING_SKILL';
  }

  const entry = context.matrix.get(areaKey(employee.id, slot.area.id));
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
