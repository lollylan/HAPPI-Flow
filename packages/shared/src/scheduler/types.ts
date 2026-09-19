import type { Id, IsoDate } from '../types/common.js';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import type { StaffType } from '../types/employee.js';
import type { DayBlock } from '../types/dayBlock.js';
import type { WorkArea } from '../types/workArea.js';
import type { MatrixEntry } from '../types/matrix.js';
import type { AbsenceStatus, HalfDay } from '../types/absence.js';
import type { AssignmentSource, PlanChange, TemplateAssignment } from '../types/assignment.js';

/**
 * Gewichte des Kostenmodells. Negative Werte sind erwuenscht, positive
 * unerwuenscht. Sie stehen in der Datenbank, nicht im Code - in der
 * Vorgaengerversion standen Zahlen wie 10000 und -50 mitten in der
 * Planungsschleife und liessen sich ohne Neubau nicht anpassen.
 */
export interface SchedulerWeights {
  /** Pflichtsitze zuerst. Muss deutlich staerker sein als jede Abneigung. */
  readonly requiredSeat: number;
  /**
   * Wert davon, jemanden ueberhaupt einzuteilen. Wird erst im letzten
   * Durchlauf angesetzt, wenn alle Pflichtplaetze stehen.
   *
   * Ohne diesen Term bliebe jeder optionale Platz leer: "gar nicht
   * einsetzen" kostet nichts, und wer anwesend ist, stuende ohne Aufgabe
   * herum. Der Betrag ist bewusst kleiner als `preferenceNever`, damit
   * niemand fuer einen freiwilligen Platz in einen verhassten Bereich
   * gesteckt wird.
   */
  readonly fillIdleBonus: number;
  /** Treue zur Musterwoche - haelt die Wochen stabil. */
  readonly templateMatch: number;
  /**
   * Treue zur bisherigen Woche bei einer Umplanung. Staerker als die
   * Musterwoche: was einmal stand, soll stehen bleiben, solange es geht.
   */
  readonly stability: number;
  /** Folgeaufgabe: wer gestern Hausbesuche gefahren ist, schreibt sie heute. */
  readonly followUp: number;
  /** Einsatz in einem Bereich einer anderen Gruppe - moeglich, aber nachrangig. */
  readonly crossPlan: number;
  readonly preferencePreferred: number;
  readonly preferenceNeutral: number;
  readonly preferenceDislike: number;
  /** Teuer, aber nicht unmoeglich: im Notfall geht es trotzdem. */
  readonly preferenceNever: number;
  /** Offene Pflichtrotation, z. B. diese Woche noch nicht im Labor gewesen. */
  readonly rotationUnmet: number;
  /** Beantragter, noch nicht genehmigter Urlaub an diesem Tag. */
  readonly absenceRequested: number;
  /** Ausgleich ueber die letzten Wochen: wer oft dort war, kostet mehr. */
  readonly fairness: number;
  /** Wer diese Woche schon viel verplant ist, kostet mehr - verteilt die Last. */
  readonly workloadBalance: number;
}

export const DEFAULT_WEIGHTS: SchedulerWeights = {
  requiredSeat: -1000,
  fillIdleBonus: -150,
  templateMatch: -400,
  stability: -500,
  followUp: -200,
  crossPlan: 150,
  preferencePreferred: -40,
  preferenceNeutral: 0,
  preferenceDislike: 60,
  preferenceNever: 600,
  rotationUnmet: -300,
  absenceRequested: 250,
  fairness: 15,
  workloadBalance: 3,
};

export const WEIGHT_LABELS: Readonly<Record<keyof SchedulerWeights, string>> = {
  requiredSeat: 'Pflichtplatz besetzen',
  fillIdleBonus: 'Niemanden ohne Aufgabe lassen',
  templateMatch: 'Treue zur Musterwoche',
  stability: 'Bisherige Woche beibehalten (Umplanung)',
  followUp: 'Folgeaufgabe an dieselbe Person',
  crossPlan: 'Einsatz in fremder Gruppe (Aufschlag)',
  preferencePreferred: 'Bevorzugter Bereich',
  preferenceNeutral: 'Neutraler Bereich',
  preferenceDislike: 'Ungern (Aufschlag)',
  preferenceNever: 'Möglichst gar nicht (Aufschlag)',
  rotationUnmet: 'Offene Pflichtrotation',
  absenceRequested: 'Beantragter, offener Urlaub (Aufschlag)',
  fairness: 'Ausgleich über die Vorwochen (je Einsatz)',
  workloadBalance: 'Auslastung dieser Woche (je Stunde)',
};

export interface PlanEmployee {
  readonly id: Id;
  readonly firstName: string;
  readonly lastName: string;
  readonly staffType: StaffType;
  readonly canHomeoffice: boolean;
  readonly skillIds: readonly Id[];
  readonly workTimes: WeeklyWorkTimes;
  readonly targetHoursPerWeek: number;
  /** Stabiler Sortierschluessel - entscheidet bei Kostengleichstand. */
  readonly sortOrder: number;
}

export interface AbsenceSpan {
  readonly employeeId: Id;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  /** `approved` sperrt hart, `requested` ist nur teuer. */
  readonly status: AbsenceStatus;
  readonly halfDay: HalfDay | null;
}

/** Einsaetze der vergangenen Wochen - Grundlage fuer den Fairness-Ausgleich. */
export interface HistoryCount {
  readonly employeeId: Id;
  readonly workAreaId: Id;
  readonly count: number;
}

export interface FixedAssignment {
  readonly date: IsoDate;
  readonly dayBlockId: Id;
  readonly workAreaId: Id;
  readonly employeeId: Id;
}

/**
 * - `fresh`: die Woche entsteht neu aus der Musterwoche.
 * - `replan`: die bisherige Woche (`previous`) bleibt stehen, soweit sie
 *   noch gueltig ist; nur die Luecken werden gefuellt. Reicht das nicht
 *   fuer die Pflichtplaetze, werden einzelne Bloecke neu geloest.
 */
export type PlanMode = 'fresh' | 'replan';

export interface PlanInput {
  /** Montag der zu planenden Woche. */
  readonly weekStart: IsoDate;
  readonly mode: PlanMode;
  /** Alle Bloecke aller Gruppen. */
  readonly dayBlocks: readonly DayBlock[];
  readonly employees: readonly PlanEmployee[];
  readonly workAreas: readonly WorkArea[];
  readonly matrix: readonly MatrixEntry[];
  readonly template: readonly TemplateAssignment[];
  readonly absences: readonly AbsenceSpan[];
  /** Gesperrte Zuweisungen: sie ueberleben jede Neuberechnung unveraendert. */
  readonly pinned: readonly FixedAssignment[];
  /** Bisherige, ungesperrte Zuweisungen der Woche - nur bei `replan` gefuellt. */
  readonly previous: readonly FixedAssignment[];
  /** Zuweisungen der Vorwoche - fuer Folgeaufgaben ueber den Montag hinweg. */
  readonly recent: readonly FixedAssignment[];
  /** Feiertage und Praxis-Schliesstage. */
  readonly closedDates: ReadonlySet<IsoDate>;
  readonly history: readonly HistoryCount[];
  readonly weights: SchedulerWeights;
  /** Anteil des Blocks, den die Arbeitszeit abdecken muss (0 bis 1). */
  readonly minOverlapRatio: number;
}

/** Warum jemand fuer einen Platz nicht in Frage kommt. */
export type RejectionCode =
  | 'WRONG_PLAN'
  | 'NOT_WORKING'
  | 'INSUFFICIENT_OVERLAP'
  | 'ABSENT'
  | 'BLOCKED'
  | 'MISSING_SKILL'
  | 'NO_HOMEOFFICE'
  | 'WRONG_LOCATION'
  | 'MAX_PER_WEEK'
  | 'ALREADY_ASSIGNED'
  | 'NEEDS_SUPERVISION';

export const REJECTION_LABELS: Readonly<Record<RejectionCode, string>> = {
  WRONG_PLAN: 'gehört zu einer anderen Gruppe',
  NOT_WORKING: 'arbeitet an diesem Wochentag nicht',
  INSUFFICIENT_OVERLAP: 'ist in diesem Zeitfenster nur kurz da',
  ABSENT: 'abwesend',
  BLOCKED: 'für diesen Bereich nicht freigegeben',
  MISSING_SKILL: 'fehlende Pflichtqualifikation',
  NO_HOMEOFFICE: 'keine Homeoffice-Berechtigung',
  WRONG_LOCATION: 'arbeitet an diesem Tag im Homeoffice',
  MAX_PER_WEEK: 'Wochenmaximum für diesen Bereich erreicht',
  ALREADY_ASSIGNED: 'in diesem Zeitfenster schon woanders eingeteilt',
  NEEDS_SUPERVISION: 'darf hier nur mit Betreuung arbeiten',
};

export interface PlannedAssignment {
  readonly date: IsoDate;
  readonly dayBlockId: Id;
  readonly workAreaId: Id;
  readonly employeeId: Id;
  readonly source: AssignmentSource;
  readonly reason: string;
}

export type DiagnosticKind =
  | 'unfilled_required'
  | 'template_broken'
  | 'rotation_unmet'
  | 'unassigned'
  | 'supervision_dropped'
  /** Umplanung: eine bisherige Zuweisung faellt weg. */
  | 'dropped'
  /** Umplanung: ein Block wurde neu geloest, weil sonst ein Pflichtplatz offen bliebe. */
  | 'reshuffled';

export interface Diagnostic {
  readonly kind: DiagnosticKind;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly date?: IsoDate;
  readonly dayBlockId?: Id;
  readonly workAreaId?: Id;
  readonly employeeId?: Id;
}

export interface PlanResult {
  readonly assignments: readonly PlannedAssignment[];
  /** Was nicht aufging und warum - das Kernstueck der Nachvollziehbarkeit. */
  readonly diagnostics: readonly Diagnostic[];
  /** Unterschied zur bisherigen Woche (`previous` + `pinned`). */
  readonly changes: readonly PlanChange[];
  /** Summe der Kosten. Kleiner ist besser; nur zum Vergleich zweier Laeufe. */
  readonly score: number;
}
