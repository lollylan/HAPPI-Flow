import type { Id, IsoDate } from '../types/common.js';
import { isPracticeWeekday } from '../types/common.js';
import type { Closure } from '../types/absence.js';
import type { StaffType } from '../types/employee.js';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import { eachDateInRange, isWeekend, isoWeekday, isWithinRange } from '../time/dates.js';

/**
 * Notbesetzung fuer eine Praxisschliessung verteilen.
 *
 * Grundsatz: alle haben Urlaub, ausser wer als Notbesetzung eingeteilt
 * ist. Wer fuer den Zeitraum ohnehin Urlaub beantragt hat, bekommt ihn -
 * Wuensche gehen vor. Aus den uebrigen wird fair rotierend gewaehlt: wer
 * bei frueheren Schliessungen am seltensten dran war, kommt zuerst.
 *
 * Reine Funktion, deterministisch, ohne Datenbank.
 */

export interface ClosureEmployee {
  readonly id: Id;
  readonly staffType: StaffType;
  readonly workTimes: WeeklyWorkTimes;
  readonly sortOrder: number;
  readonly isActive: boolean;
}

export interface ClosureAbsence {
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: 'requested' | 'approved' | 'rejected';
  readonly type: string;
}

export interface ClosureInput {
  readonly closure: Closure;
  readonly employees: readonly ClosureEmployee[];
  /** Alle Abwesenheiten, die den Zeitraum beruehren. */
  readonly absences: readonly ClosureAbsence[];
  /** Bisherige Notdienst-Tage je Person (aus frueheren Schliessungen). */
  readonly dutyHistory: readonly { readonly employeeId: Id; readonly days: number }[];
  /** Feiertage. */
  readonly closedDates: ReadonlySet<IsoDate>;
  /** Welche Gruppen die Notbesetzung stellen. Aerzte sind standardmaessig aussen vor. */
  readonly staffTypes?: readonly StaffType[];
}

export interface ClosureDutyPlan {
  readonly employeeId: Id;
  readonly date: IsoDate;
  /** Vorbereitungstag oder gewoehnlicher Schliesstag. */
  readonly kind: 'prep' | 'skeleton';
}

export interface ClosureVacationPlan {
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  /** Arbeitstage, die der Eintrag kostet. */
  readonly workingDays: number;
}

export interface ClosurePersonSummary {
  readonly employeeId: Id;
  readonly dutyDates: readonly IsoDate[];
  readonly vacationDays: number;
  /** Warum die Person nicht als Notbesetzung in Frage kam. */
  readonly note: 'vacation_requested' | 'already_absent' | 'duty' | 'vacation';
}

export interface ClosurePlan {
  /** Arbeitstage der Schliessung (Mo-Fr, ohne Feiertage). */
  readonly workingDates: readonly IsoDate[];
  readonly prepDates: readonly IsoDate[];
  readonly duties: readonly ClosureDutyPlan[];
  readonly vacations: readonly ClosureVacationPlan[];
  readonly summary: readonly ClosurePersonSummary[];
  /** Tage, an denen die Notbesetzung nicht voll wurde. */
  readonly understaffed: readonly { readonly date: IsoDate; readonly missing: number }[];
}

const DEFAULT_STAFF: readonly StaffType[] = ['pcm', 'mfa', 'trainee'];

export function closureWorkingDates(
  closure: Pick<Closure, 'startDate' | 'endDate'>,
  closedDates: ReadonlySet<IsoDate>,
): IsoDate[] {
  return eachDateInRange(closure.startDate, closure.endDate).filter(
    (date) => !isWeekend(date) && !closedDates.has(date),
  );
}

export function planClosure(input: ClosureInput): ClosurePlan {
  const { closure } = input;
  const staffTypes = input.staffTypes ?? DEFAULT_STAFF;
  const workingDates = closureWorkingDates(closure, input.closedDates);
  const prepDates = workingDates.slice(Math.max(0, workingDates.length - closure.prepDays));
  const prepSet = new Set(prepDates);

  const pool = [...input.employees]
    .filter((employee) => employee.isActive && staffTypes.includes(employee.staffType))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

  const overlapsClosure = (absence: ClosureAbsence) =>
    absence.startDate <= closure.endDate && absence.endDate >= closure.startDate;

  const hasVacationWish = (employeeId: Id) =>
    input.absences.some(
      (absence) =>
        absence.employeeId === employeeId &&
        absence.type === 'vacation' &&
        absence.status !== 'rejected' &&
        overlapsClosure(absence),
    );

  const isAbsent = (employeeId: Id, date: IsoDate) =>
    input.absences.some(
      (absence) =>
        absence.employeeId === employeeId &&
        absence.status === 'approved' &&
        isWithinRange(date, absence.startDate, absence.endDate),
    );

  const worksOn = (employee: ClosureEmployee, date: IsoDate) => {
    const weekday = isoWeekday(date);
    return isPracticeWeekday(weekday) && employee.workTimes[weekday].isWorking;
  };

  // Laufender Zaehler: Historie plus die Tage, die in dieser Schliessung
  // schon vergeben wurden. So rotiert es auch innerhalb der Schliessung.
  const load = new Map<Id, number>();
  for (const employee of pool) {
    load.set(employee.id, input.dutyHistory.find((h) => h.employeeId === employee.id)?.days ?? 0);
  }

  const duties: ClosureDutyPlan[] = [];
  const understaffed: { date: IsoDate; missing: number }[] = [];

  // Vorbereitungstage zuerst: dieselben Personen fuer alle Vorbereitungstage,
  // damit niemand fuer einen einzelnen Tag aus dem Urlaub muss.
  const candidatesFor = (date: IsoDate) =>
    pool.filter(
      (employee) =>
        !hasVacationWish(employee.id) && worksOn(employee, date) && !isAbsent(employee.id, date),
    );

  const pickLowest = (
    candidates: readonly ClosureEmployee[],
    count: number,
    exclude: ReadonlySet<Id>,
  ) =>
    [...candidates]
      .filter((employee) => !exclude.has(employee.id))
      .sort(
        (a, b) =>
          (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) ||
          a.sortOrder - b.sortOrder ||
          a.id.localeCompare(b.id),
      )
      .slice(0, count);

  if (prepDates.length > 0 && closure.prepStaff > 0) {
    // Wer an allen Vorbereitungstagen kann, wird bevorzugt als Team gewaehlt.
    const everyDay = pool.filter((employee) =>
      prepDates.every((date) => candidatesFor(date).includes(employee)),
    );
    const team = pickLowest(everyDay, closure.prepStaff, new Set());
    for (const date of prepDates) {
      const chosen = new Set(team.map((employee) => employee.id));
      // Fehlt jemand (Teilzeit), tageweise auffuellen.
      const missing = closure.prepStaff - chosen.size;
      if (missing > 0) {
        for (const extra of pickLowest(candidatesFor(date), missing, chosen)) chosen.add(extra.id);
      }
      for (const employeeId of chosen) {
        duties.push({ employeeId, date, kind: 'prep' });
      }
      if (chosen.size < closure.prepStaff) {
        understaffed.push({ date, missing: closure.prepStaff - chosen.size });
      }
    }
    for (const employee of team) {
      load.set(employee.id, (load.get(employee.id) ?? 0) + prepDates.length);
    }
  }

  if (closure.skeletonStaff > 0) {
    for (const date of workingDates) {
      if (prepSet.has(date)) continue;
      const chosen = pickLowest(candidatesFor(date), closure.skeletonStaff, new Set());
      for (const employee of chosen) {
        duties.push({ employeeId: employee.id, date, kind: 'skeleton' });
        load.set(employee.id, (load.get(employee.id) ?? 0) + 1);
      }
      if (chosen.length < closure.skeletonStaff) {
        understaffed.push({ date, missing: closure.skeletonStaff - chosen.length });
      }
    }
  }

  // Urlaub fuer alle uebrigen Arbeitstage - zusammenhaengend, damit im
  // Abwesenheitskalender ein Balken steht und nicht zehn.
  const dutyDates = new Map<Id, Set<IsoDate>>();
  for (const duty of duties) {
    const set = dutyDates.get(duty.employeeId) ?? new Set<IsoDate>();
    set.add(duty.date);
    dutyDates.set(duty.employeeId, set);
  }

  const vacations: ClosureVacationPlan[] = [];
  const summary: ClosurePersonSummary[] = [];

  for (const employee of pool) {
    const onDuty = dutyDates.get(employee.id) ?? new Set<IsoDate>();
    const vacationDates = workingDates.filter(
      (date) => worksOn(employee, date) && !onDuty.has(date) && !isAbsent(employee.id, date),
    );

    // In Spannen zusammenfassen: Kalendertage dazwischen (Wochenende,
    // Feiertag, Notdiensttag) unterbrechen die Spanne nur bei Notdienst.
    let start: IsoDate | null = null;
    let last: IsoDate | null = null;
    let count = 0;
    const flush = () => {
      if (start && last)
        vacations.push({
          employeeId: employee.id,
          startDate: start,
          endDate: last,
          workingDays: count,
        });
      start = null;
      last = null;
      count = 0;
    };
    for (const date of eachDateInRange(closure.startDate, closure.endDate)) {
      if (onDuty.has(date)) {
        flush();
        continue;
      }
      if (vacationDates.includes(date)) {
        if (!start) start = date;
        last = date;
        count += 1;
      }
    }
    flush();

    summary.push({
      employeeId: employee.id,
      dutyDates: [...onDuty].sort(),
      vacationDays: vacationDates.length,
      note:
        onDuty.size > 0
          ? 'duty'
          : hasVacationWish(employee.id)
            ? 'vacation_requested'
            : vacationDates.length === 0
              ? 'already_absent'
              : 'vacation',
    });
  }

  return {
    workingDates,
    prepDates,
    duties: duties.sort(
      (a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId),
    ),
    vacations,
    summary,
    understaffed,
  };
}
