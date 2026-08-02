import type { Id } from './common.js';

/**
 * Einsatzfreigabe fuer eine Person in einem Bereich.
 *
 * - `solo`: darf dort eigenstaendig arbeiten
 * - `supervised`: darf nur eingesetzt werden, wenn im selben Bereich und
 *   Block gleichzeitig eine Person mit `solo` sitzt
 * - `blocked`: darf dort gar nicht eingesetzt werden
 *
 * Die Freigabe haengt an Person **und** Bereich, nicht an der Rolle: von
 * zwei Auszubildenden darf die eine allein ins Labor und der andere nicht.
 */
export type Clearance = 'solo' | 'supervised' | 'blocked';

/**
 * Wunsch der Person. Anders als `blocked` ist `never` nur ein sehr hoher
 * Kostenaufschlag - im Notfall wird die Person trotzdem eingeteilt und der
 * Plan weist es sichtbar aus.
 */
export type Preference = 'preferred' | 'neutral' | 'dislike' | 'never';

export const CLEARANCE_LABELS: Readonly<Record<Clearance, string>> = {
  solo: 'Eigenständig',
  supervised: 'Nur mit Betreuung',
  blocked: 'Nicht einsetzbar',
};

export const PREFERENCE_LABELS: Readonly<Record<Preference, string>> = {
  preferred: 'Bevorzugt',
  neutral: 'Neutral',
  dislike: 'Ungern',
  never: 'Möglichst gar nicht',
};

/**
 * Ein Feld der Einsatz-Matrix (Mitarbeiter x Arbeitsbereich).
 *
 * Fasst zusammen, was in der Vorgaengerversion auf drei getrennte Konzepte
 * verteilt war: Qualifikation als Gate, `areaPreferences` und `AssignmentRule`.
 */
export interface MatrixEntry {
  readonly employeeId: Id;
  readonly workAreaId: Id;
  readonly clearance: Clearance;
  readonly preference: Preference;
  /** Persoenliches Wochenminimum; `null` = Bereichsregel gilt. */
  readonly minPerWeek: number | null;
  /** Persoenliches Wochenmaximum; `null` = unbegrenzt. */
  readonly maxPerWeek: number | null;
  /** Von der Pflichtrotation des Bereichs befreit. */
  readonly exemptRotation: boolean;
}

export const DEFAULT_MATRIX_ENTRY: Omit<MatrixEntry, 'employeeId' | 'workAreaId'> = {
  clearance: 'solo',
  preference: 'neutral',
  minPerWeek: null,
  maxPerWeek: null,
  exemptRotation: false,
};

export function matrixKey(employeeId: Id, workAreaId: Id): string {
  return `${employeeId}|${workAreaId}`;
}

/**
 * Wie oft die Person diese Woche mindestens in den Bereich muss.
 * Persoenliche Angabe schlaegt die Bereichsregel; eine Befreiung schlaegt beides.
 */
export function effectiveMinPerWeek(
  entry: Pick<MatrixEntry, 'minPerWeek' | 'exemptRotation' | 'clearance'>,
  areaRotationMinPerWeek: number | null,
): number {
  if (entry.clearance === 'blocked') return 0;
  if (entry.exemptRotation) return 0;
  return entry.minPerWeek ?? areaRotationMinPerWeek ?? 0;
}
