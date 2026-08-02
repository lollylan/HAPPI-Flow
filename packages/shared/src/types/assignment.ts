import type { Id, IsoDate } from './common.js';

/**
 * Woher eine Zuweisung stammt.
 *
 * - `template`: aus der Musterwoche uebernommen (der Normalfall)
 * - `auto`: vom Scheduler ergaenzt, weil die Musterwoche eine Luecke liess
 * - `manual`: von Hand gesetzt
 */
export type AssignmentSource = 'template' | 'auto' | 'manual';

export interface Assignment {
  readonly id: Id;
  readonly date: IsoDate;
  readonly dayBlockId: Id;
  readonly workAreaId: Id;
  readonly employeeId: Id;
  readonly source: AssignmentSource;
  /** Gesperrte Zuweisungen ueberleben jede Neuberechnung unveraendert. */
  readonly isLocked: boolean;
  /** Begruendung des Schedulers, als Tooltip sichtbar. */
  readonly reason: string;
}

/** Ein Eintrag der Musterwoche - wer ist normalerweise wo. */
export interface TemplateAssignment {
  readonly id: Id;
  readonly employeeId: Id;
  readonly workAreaId: Id;
  readonly dayBlockId: Id;
}

/** Besetzungsstand eines Bereichs in einem Block - fuer die Ampel im Plan. */
export interface Coverage {
  readonly date: IsoDate;
  readonly dayBlockId: Id;
  readonly workAreaId: Id;
  readonly assigned: number;
  readonly required: number;
}

export type CoverageLevel = 'empty' | 'under' | 'met';

export function coverageLevel(coverage: Coverage): CoverageLevel {
  if (coverage.required === 0) return 'met';
  if (coverage.assigned === 0) return 'empty';
  return coverage.assigned < coverage.required ? 'under' : 'met';
}
