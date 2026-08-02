import type { Id, Minutes, PracticeWeekday } from './common.js';

/**
 * Art eines Tagesblocks.
 *
 * - `consultation`: Sprechstunde, Patientenbetrieb. Kritische Bereiche
 *   muessen besetzt sein.
 * - `backoffice`: Praxis geschlossen, aber es wird gearbeitet -
 *   Abrechnung, Rezepte, Befunde, Hausbesuche. Bei Mo/Di/Do liegt hier
 *   auch die Mittagspause (reiner Zeitabzug, kein Planungsposten).
 * - `closed`: keine Planung.
 */
export type BlockKind = 'consultation' | 'backoffice' | 'closed';

export const BLOCK_KIND_LABELS: Readonly<Record<BlockKind, string>> = {
  consultation: 'Sprechstunde',
  backoffice: 'Innendienst',
  closed: 'Geschlossen',
};

export interface DayBlock {
  readonly id: Id;
  readonly weekday: PracticeWeekday;
  readonly label: string;
  readonly kind: BlockKind;
  readonly startMin: Minutes;
  readonly endMin: Minutes;
  readonly sortOrder: number;
}

/** Ob in diesem Block ueberhaupt geplant wird. */
export function isPlannableBlock(block: DayBlock): boolean {
  return block.kind !== 'closed';
}
