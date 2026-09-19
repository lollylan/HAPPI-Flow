import type { Id, IsoDate } from '../types/common.js';
import { isPracticeWeekday } from '../types/common.js';
import type { DayBlock } from '../types/dayBlock.js';
import type { WorkArea, PlanKind } from '../types/workArea.js';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import type { StaffType } from '../types/employee.js';
import { planForStaffType } from '../types/employee.js';
import { eachDateInRange, isWeekend, isoWeekday, isWithinRange } from '../time/dates.js';
import { minStaffFor } from './index.js';

/**
 * Antragspruefung: was passiert mit der Besetzung, wenn diese Person an
 * diesen Tagen fehlt?
 *
 * Bewusst eine grobe Kopfzahl-Rechnung und kein Probelauf des Schedulers:
 * die Praxisleitung will beim Genehmigen in einer Sekunde sehen, ob der
 * Tag eng wird - nicht, wer dann genau wo sitzt.
 */

export interface CoverageEmployee {
  readonly id: Id;
  readonly staffType: StaffType;
  readonly workTimes: WeeklyWorkTimes;
}

export interface CoverageAbsence {
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
}

export interface CoverageInput {
  /** Wer fehlen wuerde. */
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly employees: readonly CoverageEmployee[];
  /** Bereits bekannte Abwesenheiten (genehmigt oder beantragt). */
  readonly absences: readonly CoverageAbsence[];
  readonly workAreas: readonly WorkArea[];
  readonly dayBlocks: readonly DayBlock[];
  readonly closedDates: ReadonlySet<IsoDate>;
}

export interface DayCoverage {
  readonly date: IsoDate;
  /** Feiertag oder Schliesstag - zaehlt nicht. */
  readonly closed: boolean;
  /** Die Person haette an dem Tag ohnehin frei. */
  readonly offAnyway: boolean;
  /** Wer aus derselben Gruppe an dem Tag sonst noch fehlt. */
  readonly othersAbsent: readonly Id[];
  /** Wie viele der Gruppe nach dem Antrag noch da waeren. */
  readonly present: number;
  /** Was die kritischen Bereiche der Gruppe an dem Tag mindestens brauchen. */
  readonly required: number;
  /** Positiv = es fehlen so viele Personen. */
  readonly shortfall: number;
}

export interface CoverageResult {
  readonly plan: PlanKind;
  readonly days: readonly DayCoverage[];
  /** Tage mit Unterdeckung. */
  readonly criticalDays: number;
  /** Arbeitstage, die der Antrag tatsaechlich kostet. */
  readonly workingDays: number;
}

/** Hoechster Bedarf kritischer Bereiche einer Gruppe an einem Wochentag. */
export function requiredHeadcount(
  plan: PlanKind,
  weekday: number,
  workAreas: readonly WorkArea[],
  dayBlocks: readonly DayBlock[],
): number {
  let max = 0;
  for (const block of dayBlocks) {
    if (block.plan !== plan || block.weekday !== weekday || block.kind === 'closed') continue;
    let sum = 0;
    for (const area of workAreas) {
      if (area.plan !== plan || !area.isActive || !area.isCritical) continue;
      if (!area.blockIds.includes(block.id)) continue;
      sum += minStaffFor(area, block.id);
    }
    max = Math.max(max, sum);
  }
  return max;
}

export function assessAbsence(input: CoverageInput): CoverageResult {
  const requester = input.employees.find((employee) => employee.id === input.employeeId);
  const plan: PlanKind = requester ? planForStaffType(requester.staffType) : 'mfa';
  const group = input.employees.filter((employee) => planForStaffType(employee.staffType) === plan);

  const days: DayCoverage[] = [];
  let criticalDays = 0;
  let workingDays = 0;

  for (const date of eachDateInRange(input.startDate, input.endDate)) {
    if (isWeekend(date)) continue;
    const weekday = isoWeekday(date);
    if (!isPracticeWeekday(weekday)) continue;
    const closed = input.closedDates.has(date);
    const offAnyway = !requester || !requester.workTimes[weekday].isWorking;

    const absentIds = new Set(
      input.absences
        .filter(
          (absence) =>
            absence.employeeId !== input.employeeId &&
            isWithinRange(date, absence.startDate, absence.endDate),
        )
        .map((absence) => absence.employeeId),
    );
    const othersAbsent = group
      .filter((employee) => absentIds.has(employee.id))
      .map((employee) => employee.id);

    const present = closed
      ? 0
      : group.filter(
          (employee) =>
            employee.id !== input.employeeId &&
            employee.workTimes[weekday].isWorking &&
            !absentIds.has(employee.id),
        ).length;
    const required = closed
      ? 0
      : requiredHeadcount(plan, weekday, input.workAreas, input.dayBlocks);
    const shortfall = closed || offAnyway ? 0 : Math.max(0, required - present);

    if (!closed && !offAnyway) workingDays += 1;
    if (shortfall > 0) criticalDays += 1;

    days.push({ date, closed, offAnyway, othersAbsent, present, required, shortfall });
  }

  return { plan, days, criticalDays, workingDays };
}
