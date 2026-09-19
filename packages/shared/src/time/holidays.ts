import type { IsoDate } from '../types/common.js';
import { addDays, isoWeekday } from './dates.js';

/** Amtliche Laenderkuerzel nach ISO 3166-2:DE. */
export type GermanState =
  | 'BW'
  | 'BY'
  | 'BE'
  | 'BB'
  | 'HB'
  | 'HH'
  | 'HE'
  | 'MV'
  | 'NI'
  | 'NW'
  | 'RP'
  | 'SL'
  | 'SN'
  | 'ST'
  | 'SH'
  | 'TH';

export const GERMAN_STATES: readonly { readonly code: GermanState; readonly name: string }[] = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
];

export function germanStateName(state: GermanState): string {
  return GERMAN_STATES.find((entry) => entry.code === state)?.name ?? state;
}

/**
 * Feiertage, die nicht im ganzen Bundesland gelten, sondern von der Gemeinde
 * abhaengen. Sie muessen deshalb einzeln zuschaltbar sein.
 */
export interface HolidayOptions {
  /**
   * Bayern: Mariae Himmelfahrt (15.08.) ist nur in Gemeinden mit ueberwiegend
   * katholischer Bevoelkerung gesetzlicher Feiertag - in Wuerzburg also ja.
   * Im Saarland gilt der Tag ohnehin landesweit und ist von dieser Option
   * nicht betroffen.
   */
  readonly assumptionOfMary?: boolean;
  /**
   * Sachsen und Thueringen: Fronleichnam gilt nur in einzelnen katholisch
   * gepraegten Gemeinden. In BW, BY, HE, NW, RP und SL gilt er landesweit.
   */
  readonly corpusChristi?: boolean;
  /** Nur im Stadtgebiet Augsburg: Hohes Friedensfest am 08.08. */
  readonly augsburgPeaceFestival?: boolean;
}

export type HolidayScope =
  /** In ganz Deutschland gesetzlicher Feiertag. */
  | 'national'
  /** Im ganzen Bundesland gesetzlicher Feiertag. */
  | 'state'
  /** Nur in Teilen des Bundeslandes - haengt an den HolidayOptions. */
  | 'regional';

export interface Holiday {
  readonly date: IsoDate;
  readonly name: string;
  readonly scope: HolidayScope;
}

/** Standard fuer diese Praxis: Wuerzburg, Bayern, katholisch gepraegte Gemeinde. */
export const DEFAULT_STATE: GermanState = 'BY';
export const DEFAULT_HOLIDAY_OPTIONS: HolidayOptions = {
  assumptionOfMary: true,
  corpusChristi: false,
  augsburgPeaceFestival: false,
};

const pad = (value: number) => String(value).padStart(2, '0');
const fixed = (year: number, month: number, day: number): IsoDate =>
  `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;

/**
 * Ostersonntag nach dem anonymen gregorianischen Verfahren
 * (Meeus/Jones/Butcher). Gueltig fuer alle Jahre ab 1583.
 *
 * Alle beweglichen Feiertage haengen daran, deshalb wird hier gerechnet
 * statt eine Tabelle zu pflegen - die waere nach zehn Jahren abgelaufen.
 */
export function easterSunday(year: number): IsoDate {
  if (!Number.isInteger(year) || year < 1583) {
    throw new RangeError(`Osterdatum nur ab 1583 definiert, erhalten: ${year}`);
  }
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return fixed(year, month, day);
}

// --- Zuordnung der Feiertage zu den Bundeslaendern -------------------------

const EPIPHANY: readonly GermanState[] = ['BW', 'BY', 'ST'];
const INTERNATIONAL_WOMENS_DAY: readonly GermanState[] = ['BE', 'MV'];
const CORPUS_CHRISTI_STATEWIDE: readonly GermanState[] = ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'];
const CORPUS_CHRISTI_REGIONAL: readonly GermanState[] = ['SN', 'TH'];
const ASSUMPTION_STATEWIDE: readonly GermanState[] = ['SL'];
const ASSUMPTION_REGIONAL: readonly GermanState[] = ['BY'];
const WORLD_CHILDRENS_DAY: readonly GermanState[] = ['TH'];
const REFORMATION_DAY: readonly GermanState[] = [
  'BB',
  'HB',
  'HH',
  'MV',
  'NI',
  'SN',
  'ST',
  'SH',
  'TH',
];
const ALL_SAINTS: readonly GermanState[] = ['BW', 'BY', 'NW', 'RP', 'SL'];
const REPENTANCE_DAY: readonly GermanState[] = ['SN'];
/** Brandenburg ist das einzige Land, in dem Oster- und Pfingstsonntag gesetzliche Feiertage sind. */
const EASTER_AND_WHIT_SUNDAY: readonly GermanState[] = ['BB'];

/**
 * Buss- und Bettag: der letzte Mittwoch vor dem 23. November,
 * liegt also immer zwischen dem 16. und dem 22. November.
 */
export function repentanceDay(year: number): IsoDate {
  const anchor = fixed(year, 11, 22);
  const daysBack = (isoWeekday(anchor) - 3 + 7) % 7; // 3 = Mittwoch
  return addDays(anchor, -daysBack);
}

/** Alle gesetzlichen Feiertage eines Jahres, nach Datum sortiert. */
export function holidaysForYear(
  year: number,
  state: GermanState,
  options: HolidayOptions = DEFAULT_HOLIDAY_OPTIONS,
): Holiday[] {
  const easter = easterSunday(year);
  const holidays: Holiday[] = [
    { date: fixed(year, 1, 1), name: 'Neujahr', scope: 'national' },
    { date: addDays(easter, -2), name: 'Karfreitag', scope: 'national' },
    { date: addDays(easter, 1), name: 'Ostermontag', scope: 'national' },
    { date: fixed(year, 5, 1), name: 'Tag der Arbeit', scope: 'national' },
    { date: addDays(easter, 39), name: 'Christi Himmelfahrt', scope: 'national' },
    { date: addDays(easter, 50), name: 'Pfingstmontag', scope: 'national' },
    { date: fixed(year, 10, 3), name: 'Tag der Deutschen Einheit', scope: 'national' },
    { date: fixed(year, 12, 25), name: '1. Weihnachtsfeiertag', scope: 'national' },
    { date: fixed(year, 12, 26), name: '2. Weihnachtsfeiertag', scope: 'national' },
  ];

  if (EPIPHANY.includes(state)) {
    holidays.push({ date: fixed(year, 1, 6), name: 'Heilige Drei Könige', scope: 'state' });
  }
  if (INTERNATIONAL_WOMENS_DAY.includes(state)) {
    holidays.push({ date: fixed(year, 3, 8), name: 'Internationaler Frauentag', scope: 'state' });
  }
  if (EASTER_AND_WHIT_SUNDAY.includes(state)) {
    holidays.push({ date: easter, name: 'Ostersonntag', scope: 'state' });
    holidays.push({ date: addDays(easter, 49), name: 'Pfingstsonntag', scope: 'state' });
  }
  if (CORPUS_CHRISTI_STATEWIDE.includes(state)) {
    holidays.push({ date: addDays(easter, 60), name: 'Fronleichnam', scope: 'state' });
  } else if (CORPUS_CHRISTI_REGIONAL.includes(state) && options.corpusChristi) {
    holidays.push({ date: addDays(easter, 60), name: 'Fronleichnam', scope: 'regional' });
  }
  if (state === 'BY' && options.augsburgPeaceFestival) {
    holidays.push({ date: fixed(year, 8, 8), name: 'Augsburger Friedensfest', scope: 'regional' });
  }
  if (ASSUMPTION_STATEWIDE.includes(state)) {
    holidays.push({ date: fixed(year, 8, 15), name: 'Mariä Himmelfahrt', scope: 'state' });
  } else if (ASSUMPTION_REGIONAL.includes(state) && options.assumptionOfMary) {
    holidays.push({ date: fixed(year, 8, 15), name: 'Mariä Himmelfahrt', scope: 'regional' });
  }
  if (WORLD_CHILDRENS_DAY.includes(state)) {
    holidays.push({ date: fixed(year, 9, 20), name: 'Weltkindertag', scope: 'state' });
  }
  if (REFORMATION_DAY.includes(state)) {
    holidays.push({ date: fixed(year, 10, 31), name: 'Reformationstag', scope: 'state' });
  }
  if (ALL_SAINTS.includes(state)) {
    holidays.push({ date: fixed(year, 11, 1), name: 'Allerheiligen', scope: 'state' });
  }
  if (REPENTANCE_DAY.includes(state)) {
    holidays.push({ date: repentanceDay(year), name: 'Buß- und Bettag', scope: 'state' });
  }

  return holidays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Feiertage von `fromYear` bis `toYear`, beide Jahre einschliesslich. */
export function holidaysForYears(
  fromYear: number,
  toYear: number,
  state: GermanState,
  options: HolidayOptions = DEFAULT_HOLIDAY_OPTIONS,
): Holiday[] {
  const all: Holiday[] = [];
  for (let year = fromYear; year <= toYear; year++) {
    all.push(...holidaysForYear(year, state, options));
  }
  return all;
}

/**
 * Feiertagsdaten als Set - genau die Form, die `countVacationDays()` und
 * der Scheduler als `excludedDates` erwarten.
 */
export function holidayDateSet(
  fromYear: number,
  toYear: number,
  state: GermanState,
  options: HolidayOptions = DEFAULT_HOLIDAY_OPTIONS,
): Set<IsoDate> {
  return new Set(holidaysForYears(fromYear, toYear, state, options).map((entry) => entry.date));
}

function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

export function isHoliday(
  date: IsoDate,
  state: GermanState,
  options: HolidayOptions = DEFAULT_HOLIDAY_OPTIONS,
): boolean {
  return holidaysForYear(yearOf(date), state, options).some((entry) => entry.date === date);
}

/** Name des Feiertags oder `null`, wenn es keiner ist. */
export function holidayName(
  date: IsoDate,
  state: GermanState,
  options: HolidayOptions = DEFAULT_HOLIDAY_OPTIONS,
): string | null {
  return (
    holidaysForYear(yearOf(date), state, options).find((entry) => entry.date === date)?.name ?? null
  );
}
