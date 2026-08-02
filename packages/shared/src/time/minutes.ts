import type { Minutes } from '../types/common.js';

const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const MINUTES_PER_DAY = 24 * 60;

/** Halboffenes Zeitintervall [startMin, endMin) innerhalb eines Tages. */
export interface TimeInterval {
  readonly startMin: Minutes;
  readonly endMin: Minutes;
}

/** Wandelt "08:30" in 510 um. Wirft bei ungueltiger Eingabe. */
export function parseHHMM(value: string): Minutes {
  if (!HHMM_PATTERN.test(value)) {
    throw new RangeError(`Ungueltige Uhrzeit: "${value}" (erwartet HH:MM)`);
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

/** Wandelt 510 in "08:30" um. 1440 ergibt "24:00" (Tagesende). */
export function formatHHMM(minutes: Minutes): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new RangeError(`Minutenwert ausserhalb des Tages: ${minutes}`);
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** Laenge des Intervalls in Minuten, nie negativ. */
export function durationMinutes(interval: TimeInterval): number {
  return Math.max(0, interval.endMin - interval.startMin);
}

/**
 * Schnittmenge zweier Zeitintervalle in Minuten.
 *
 * Das ist die Korrektur des zentralen Fehlers der Vorgaengerversion. Dort
 * wurde die Verfuegbarkeit als Textvergleich geprueft:
 *
 *     if (avail.start > slot.start || avail.end <= slot.start) return false;
 *
 * Damit musste jemand exakt zum Blockbeginn schon anwesend sein. Eine Kraft
 * mit Arbeitsbeginn 09:00 galt fuer den Block 08:00-13:00 als gar nicht da,
 * statt als zu 80 % anwesend - daher die vielen unbesetzten Bereiche.
 */
export function overlapMinutes(a: TimeInterval, b: TimeInterval): number {
  return Math.max(0, Math.min(a.endMin, b.endMin) - Math.max(a.startMin, b.startMin));
}

/**
 * Anteil von `target`, der durch `cover` abgedeckt wird (0 bis 1).
 *
 * Beispiel: Arbeitszeit 09:00-17:00 deckt den Block 08:00-13:00
 * zu 240 von 300 Minuten ab, also 0.8.
 */
export function coverageRatio(cover: TimeInterval, target: TimeInterval): number {
  const span = durationMinutes(target);
  if (span === 0) return 0;
  return overlapMinutes(cover, target) / span;
}

export function intervalsOverlap(a: TimeInterval, b: TimeInterval): boolean {
  return overlapMinutes(a, b) > 0;
}

/** Prueft, ob sich zwei Intervalle einer Liste ueberlappen (z. B. Tagesbloecke). */
export function findOverlappingPair<T extends TimeInterval>(
  intervals: readonly T[],
): readonly [T, T] | null {
  const sorted = [...intervals].sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (previous && current && intervalsOverlap(previous, current)) {
      return [previous, current];
    }
  }
  return null;
}
