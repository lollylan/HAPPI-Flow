import { randomUUID } from 'node:crypto';
import type { BlockKind, DayBlock, Id, PlanKind, PracticeWeekday } from '@haeppi/shared';
import {
  PLAN_KINDS,
  PLAN_LABELS,
  PRACTICE_WEEKDAYS,
  WEEKDAY_LABELS,
  findOverlappingPair,
  formatHHMM,
} from '@haeppi/shared';
import type { Db } from '../index.js';

interface DayBlockRow {
  id: string;
  plan: PlanKind;
  weekday: PracticeWeekday;
  label: string;
  kind: BlockKind;
  start_min: number;
  end_min: number;
  sort_order: number;
}

const toDayBlock = (row: DayBlockRow): DayBlock => ({
  id: row.id,
  plan: row.plan,
  weekday: row.weekday,
  label: row.label,
  kind: row.kind,
  startMin: row.start_min,
  endMin: row.end_min,
  sortOrder: row.sort_order,
});

const PLAN_ORDER = `CASE plan WHEN 'doctor' THEN 0 WHEN 'pcm' THEN 1 ELSE 2 END`;

export function listDayBlocks(db: Db): DayBlock[] {
  return (
    db
      .prepare(`SELECT * FROM day_blocks ORDER BY ${PLAN_ORDER}, weekday, start_min`)
      .all() as DayBlockRow[]
  ).map(toDayBlock);
}

export type DayBlockInput = Omit<DayBlock, 'id'> & { readonly id?: Id };

/**
 * Prueft, dass sich die Bloecke einer Gruppe an einem Tag nicht
 * ueberschneiden. Zwischen den Gruppen duerfen sie es - die Aerzte teilen
 * den Vormittag anders als die MFA.
 *
 * SQLite kann das nicht deklarativ; ohne diese Pruefung koennte ein Tag
 * mit zwei sich ueberlappenden Sprechstunden gepflegt werden, und der
 * Scheduler wuerde dieselbe Person doppelt verplanen.
 */
export function findBlockConflict(blocks: readonly DayBlockInput[]): string | null {
  for (const plan of PLAN_KINDS) {
    for (const weekday of PRACTICE_WEEKDAYS) {
      const ofDay = blocks.filter((block) => block.plan === plan && block.weekday === weekday);
      const clash = findOverlappingPair(ofDay);
      if (clash) {
        const [first, second] = clash;
        return (
          `${PLAN_LABELS[plan]}, ${WEEKDAY_LABELS[weekday]}: zwei Blöcke überschneiden sich - ` +
          `"${first.label}" (${formatHHMM(first.startMin)}–${formatHHMM(first.endMin)}) und ` +
          `"${second.label}" (${formatHHMM(second.startMin)}–${formatHHMM(second.endMin)}).`
        );
      }
    }
  }
  return null;
}

/**
 * Ersetzt das Wochenmodell **einer Gruppe** in einer Transaktion.
 *
 * Bloecke, deren ID erhalten bleibt, behalten ihre Verknuepfungen zu
 * Arbeitsbereichen und zur Musterwoche. Entfernte Bloecke nehmen ihre
 * Zuweisungen per Kaskade mit - deshalb meldet die Route vorher, was
 * daran haengt.
 */
export function replaceDayBlocks(
  db: Db,
  plan: PlanKind,
  blocks: readonly DayBlockInput[],
): DayBlock[] {
  db.transaction(() => {
    const keep = new Set(blocks.map((block) => block.id).filter(Boolean) as string[]);
    const existing = db.prepare(`SELECT id FROM day_blocks WHERE plan = ?`).all(plan) as {
      id: string;
    }[];

    const remove = db.prepare(`DELETE FROM day_blocks WHERE id = ?`);
    for (const row of existing) {
      if (!keep.has(row.id)) remove.run(row.id);
    }

    const upsert = db.prepare(
      `INSERT INTO day_blocks (id, plan, weekday, label, kind, start_min, end_min, sort_order)
       VALUES (@id, @plan, @weekday, @label, @kind, @startMin, @endMin, @sortOrder)
       ON CONFLICT (id) DO UPDATE SET
         plan = excluded.plan, weekday = excluded.weekday, label = excluded.label,
         kind = excluded.kind, start_min = excluded.start_min, end_min = excluded.end_min,
         sort_order = excluded.sort_order`,
    );
    for (const block of blocks) {
      if (block.plan !== plan) continue;
      upsert.run({
        id: block.id ?? randomUUID(),
        plan: block.plan,
        weekday: block.weekday,
        label: block.label,
        kind: block.kind,
        startMin: block.startMin,
        endMin: block.endMin,
        sortOrder: block.sortOrder,
      });
    }
  })();

  return listDayBlocks(db);
}

export interface DayBlockUsage {
  readonly blockId: Id;
  readonly label: string;
  readonly templateAssignments: number;
  readonly assignments: number;
}

/** Was an den Bloecken der Gruppe haengt, die beim Speichern wegfallen wuerden. */
export function usageOfRemovedBlocks(
  db: Db,
  plan: PlanKind,
  blocks: readonly DayBlockInput[],
): DayBlockUsage[] {
  const keep = new Set(blocks.map((block) => block.id).filter(Boolean) as string[]);
  const usage: DayBlockUsage[] = [];

  for (const row of db.prepare(`SELECT id, label FROM day_blocks WHERE plan = ?`).all(plan) as {
    id: string;
    label: string;
  }[]) {
    if (keep.has(row.id)) continue;
    const template = db
      .prepare(`SELECT COUNT(*) AS n FROM template_assignments WHERE day_block_id = ?`)
      .get(row.id) as { n: number };
    const assignments = db
      .prepare(`SELECT COUNT(*) AS n FROM assignments WHERE day_block_id = ?`)
      .get(row.id) as { n: number };
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
