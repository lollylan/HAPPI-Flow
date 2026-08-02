import { randomUUID } from 'node:crypto';
import { PRACTICE_WEEKDAYS, findOverlappingPair, formatHHMM } from '@haeppi/shared';
const toDayBlock = (row) => ({
    id: row.id,
    weekday: row.weekday,
    label: row.label,
    kind: row.kind,
    startMin: row.start_min,
    endMin: row.end_min,
    sortOrder: row.sort_order,
});
export function listDayBlocks(db) {
    return db.prepare(`SELECT * FROM day_blocks ORDER BY weekday, start_min`).all().map(toDayBlock);
}
/**
 * Prueft, dass sich die Bloecke eines Tages nicht ueberschneiden.
 *
 * SQLite kann das nicht deklarativ; ohne diese Pruefung koennte ein Tag
 * mit zwei sich ueberlappenden Sprechstunden gepflegt werden, und der
 * Scheduler wuerde dieselbe Person doppelt verplanen.
 */
export function findBlockConflict(blocks) {
    for (const weekday of PRACTICE_WEEKDAYS) {
        const ofDay = blocks.filter((block) => block.weekday === weekday);
        const clash = findOverlappingPair(ofDay);
        if (clash) {
            const [first, second] = clash;
            return (`Am selben Wochentag überschneiden sich zwei Blöcke: ` +
                `"${first.label}" (${formatHHMM(first.startMin)}–${formatHHMM(first.endMin)}) und ` +
                `"${second.label}" (${formatHHMM(second.startMin)}–${formatHHMM(second.endMin)}).`);
        }
    }
    return null;
}
/**
 * Ersetzt das gesamte Wochenmodell in einer Transaktion.
 *
 * Bloecke, deren ID erhalten bleibt, behalten ihre Verknuepfungen zu
 * Arbeitsbereichen und zur Musterwoche. Entfernte Bloecke nehmen ihre
 * Zuweisungen per Kaskade mit - deshalb meldet die Route vorher, was
 * daran haengt.
 */
export function replaceDayBlocks(db, blocks) {
    db.transaction(() => {
        const keep = new Set(blocks.map((block) => block.id).filter(Boolean));
        const existing = db.prepare(`SELECT id FROM day_blocks`).all();
        const remove = db.prepare(`DELETE FROM day_blocks WHERE id = ?`);
        for (const row of existing) {
            if (!keep.has(row.id))
                remove.run(row.id);
        }
        const upsert = db.prepare(`INSERT INTO day_blocks (id, weekday, label, kind, start_min, end_min, sort_order)
       VALUES (@id, @weekday, @label, @kind, @startMin, @endMin, @sortOrder)
       ON CONFLICT (id) DO UPDATE SET
         weekday = excluded.weekday, label = excluded.label, kind = excluded.kind,
         start_min = excluded.start_min, end_min = excluded.end_min,
         sort_order = excluded.sort_order`);
        for (const block of blocks) {
            upsert.run({ ...block, id: block.id ?? randomUUID() });
        }
    })();
    return listDayBlocks(db);
}
/** Was an den Bloecken haengt, die beim Speichern wegfallen wuerden. */
export function usageOfRemovedBlocks(db, blocks) {
    const keep = new Set(blocks.map((block) => block.id).filter(Boolean));
    const usage = [];
    for (const row of db.prepare(`SELECT id, label FROM day_blocks`).all()) {
        if (keep.has(row.id))
            continue;
        const template = db
            .prepare(`SELECT COUNT(*) AS n FROM template_assignments WHERE day_block_id = ?`)
            .get(row.id);
        const assignments = db
            .prepare(`SELECT COUNT(*) AS n FROM assignments WHERE day_block_id = ?`)
            .get(row.id);
        if (template.n > 0 || assignments.n > 0) {
            usage.push({
                blockId: row.id,
                label: row.label,
                templateAssignments: template.n,
                assignments: assignments.n,
            });
        }
    }
    return usage;
}
//# sourceMappingURL=dayBlocks.js.map