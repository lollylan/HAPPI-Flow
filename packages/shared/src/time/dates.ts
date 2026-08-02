import type { IsoDate, IsoWeekday } from '../types/common.js';

const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MS_PER_DAY = 86_400_000;

/**
 * Alle Datumsrechnungen laufen ueber 12:00 Ortszeit.
 *
 * Mitternacht waere anfaellig: an den Zeitumstellungstagen verschiebt eine
 * Stunde das Datum. Der Mittag ist von beiden Umstellungen (02:00/03:00)
 * elf Stunden entfernt und damit immun.
 */
const NOON_HOUR = 12;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  // Faengt den 31. Februar ab: das Pattern allein laesst ihn durch.
  return toLocalISODate(fromISODate(value)) === value;
}

export function assertIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new RangeError(`Ungueltiges Datum: "${value}" (erwartet YYYY-MM-DD)`);
  }
  return value;
}

/**
 * Formatiert ein Date als Ortsdatum.
 *
 * Bewusst ueber getFullYear/getMonth/getDate statt ueber toISOString():
 * `new Date(2026, 2, 29).toISOString().split('T')[0]` liefert in
 * Europe/Berlin "2026-03-28" - einen Tag zu frueh. Dieser Fehler steckte
 * in der Vorgaengerversion an acht Stellen.
 */
export function toLocalISODate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Wandelt ein ISO-Datum in ein Date um, verankert auf 12:00 Ortszeit. */
export function fromISODate(iso: IsoDate): Date {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Date(year, month - 1, day, NOON_HOUR, 0, 0, 0);
}

/** Heutiges Ortsdatum. `now` ist injizierbar, damit Tests nicht von der Uhr abhaengen. */
export function todayLocal(now: Date = new Date()): IsoDate {
  return toLocalISODate(now);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

/** Anzahl Tage von `from` bis `to`; negativ, wenn `to` frueher liegt. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  const ms = fromISODate(to).getTime() - fromISODate(from).getTime();
  // Runden faengt die eine Stunde Differenz an Umstellungstagen ab.
  return Math.round(ms / MS_PER_DAY);
}

export function isoWeekday(iso: IsoDate): IsoWeekday {
  const jsDay = fromISODate(iso).getDay(); // 0 = Sonntag
  return (jsDay === 0 ? 7 : jsDay) as IsoWeekday;
}

export function isWeekend(iso: IsoDate): boolean {
  return isoWeekday(iso) >= 6;
}

/** Montag der Woche, in der `iso` liegt. */
export function startOfISOWeek(iso: IsoDate): IsoDate {
  return addDays(iso, -(isoWeekday(iso) - 1));
}

/** Sonntag der Woche, in der `iso` liegt. */
export function endOfISOWeek(iso: IsoDate): IsoDate {
  return addDays(startOfISOWeek(iso), 6);
}

/** Kalenderwoche nach ISO 8601 (1-53). */
export function isoWeekNumber(iso: IsoDate): number {
  // Der Donnerstag entscheidet, zu welchem Jahr und welcher Woche ein Datum gehoert.
  const thursday = fromISODate(addDays(iso, 4 - isoWeekday(iso)));
  const yearStart = new Date(thursday.getFullYear(), 0, 1, NOON_HOUR, 0, 0, 0);
  const days = Math.round((thursday.getTime() - yearStart.getTime()) / MS_PER_DAY);
  return Math.floor(days / 7) + 1;
}

/** Jahr, zu dem die ISO-Woche gehoert - am Jahreswechsel nicht identisch mit dem Kalenderjahr. */
export function isoWeekYear(iso: IsoDate): number {
  return fromISODate(addDays(iso, 4 - isoWeekday(iso))).getFullYear();
}

/** Alle Daten von `from` bis `to`, beide einschliesslich. */
export function eachDateInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const total = diffDays(from, to);
  if (total < 0) return [];
  const dates: IsoDate[] = [];
  for (let offset = 0; offset <= total; offset++) {
    dates.push(addDays(from, offset));
  }
  return dates;
}

/** Die fuenf Praxistage (Mo-Fr) der Woche, in der `iso` liegt. */
export function practiceWeekDates(iso: IsoDate): IsoDate[] {
  const monday = startOfISOWeek(iso);
  return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
}

export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  // ISO-Datumsstrings sind lexikografisch sortierbar - hier ist der
  // Textvergleich korrekt, anders als bei Uhrzeiten mit Overlap-Semantik.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ob `date` im Zeitraum [from, to] liegt (beide einschliesslich). */
export function isWithinRange(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to;
}

/** Ob sich zwei Datumszeitraeume ueberschneiden (beide Grenzen einschliesslich). */
export function rangesOverlap(aFrom: IsoDate, aTo: IsoDate, bFrom: IsoDate, bTo: IsoDate): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}
