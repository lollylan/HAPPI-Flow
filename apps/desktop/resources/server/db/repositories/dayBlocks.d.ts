import type { DayBlock, Id } from '@haeppi/shared';
import type { Db } from '../index.js';
export declare function listDayBlocks(db: Db): DayBlock[];
export type DayBlockInput = Omit<DayBlock, 'id'> & {
    readonly id?: Id;
};
/**
 * Prueft, dass sich die Bloecke eines Tages nicht ueberschneiden.
 *
 * SQLite kann das nicht deklarativ; ohne diese Pruefung koennte ein Tag
 * mit zwei sich ueberlappenden Sprechstunden gepflegt werden, und der
 * Scheduler wuerde dieselbe Person doppelt verplanen.
 */
export declare function findBlockConflict(blocks: readonly DayBlockInput[]): string | null;
/**
 * Ersetzt das gesamte Wochenmodell in einer Transaktion.
 *
 * Bloecke, deren ID erhalten bleibt, behalten ihre Verknuepfungen zu
 * Arbeitsbereichen und zur Musterwoche. Entfernte Bloecke nehmen ihre
 * Zuweisungen per Kaskade mit - deshalb meldet die Route vorher, was
 * daran haengt.
 */
export declare function replaceDayBlocks(db: Db, blocks: readonly DayBlockInput[]): DayBlock[];
export interface DayBlockUsage {
    readonly blockId: Id;
    readonly label: string;
    readonly templateAssignments: number;
    readonly assignments: number;
}
/** Was an den Bloecken haengt, die beim Speichern wegfallen wuerden. */
export declare function usageOfRemovedBlocks(db: Db, blocks: readonly DayBlockInput[]): DayBlockUsage[];
//# sourceMappingURL=dayBlocks.d.ts.map