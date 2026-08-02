import type { Id, MatrixEntry } from '@haeppi/shared';
import type { Db } from '../index.js';
/**
 * Liefert nur die tatsaechlich gepflegten Felder.
 *
 * Fehlende Kombinationen gelten als Standard (`solo` / `neutral`) und
 * werden nicht gespeichert - sonst haette jede neue Person sofort
 * Dutzende bedeutungsloser Zeilen.
 */
export declare function listMatrix(db: Db): MatrixEntry[];
export declare function listMatrixForEmployee(db: Db, employeeId: Id): MatrixEntry[];
export type MatrixEntryInput = Omit<MatrixEntry, 'employeeId'>;
/** Ersetzt die Matrixzeile einer Person vollstaendig. */
export declare function replaceMatrixForEmployee(db: Db, employeeId: Id, entries: readonly MatrixEntryInput[]): MatrixEntry[];
//# sourceMappingURL=matrix.d.ts.map