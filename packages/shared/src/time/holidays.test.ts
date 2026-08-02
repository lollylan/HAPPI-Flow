import { describe, expect, it } from 'vitest';
import { addDays, isoWeekday } from './dates.js';
import type { GermanState } from './holidays.js';
import {
  DEFAULT_HOLIDAY_OPTIONS,
  DEFAULT_STATE,
  GERMAN_STATES,
  easterSunday,
  germanStateName,
  holidayDateSet,
  holidayName,
  holidaysForYear,
  holidaysForYears,
  isHoliday,
  repentanceDay,
} from './holidays.js';

const ALL_STATES = GERMAN_STATES.map((entry) => entry.code);
const namesIn = (year: number, state: GermanState, options = DEFAULT_HOLIDAY_OPTIONS) =>
  holidaysForYear(year, state, options).map((entry) => entry.name);

describe('easterSunday', () => {
  it('trifft die naechsten zehn Jahre', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(easterSunday(2028)).toBe('2028-04-16');
    expect(easterSunday(2029)).toBe('2029-04-01');
    expect(easterSunday(2030)).toBe('2030-04-21');
    expect(easterSunday(2031)).toBe('2031-04-13');
    expect(easterSunday(2032)).toBe('2032-03-28');
    expect(easterSunday(2033)).toBe('2033-04-17');
    expect(easterSunday(2034)).toBe('2034-04-09');
    expect(easterSunday(2035)).toBe('2035-03-25');
  });

  it('faellt ueber 200 Jahre hinweg immer auf einen Sonntag zwischen 22.03. und 25.04.', () => {
    for (let year = 1900; year <= 2100; year++) {
      const easter = easterSunday(year);
      expect(isoWeekday(easter)).toBe(7);
      expect(easter >= `${year}-03-22`).toBe(true);
      expect(easter <= `${year}-04-25`).toBe(true);
    }
  });

  it('lehnt Jahre vor der gregorianischen Reform ab', () => {
    expect(() => easterSunday(1500)).toThrow(RangeError);
  });
});

describe('bundesweite Feiertage', () => {
  const NATIONAL = [
    'Neujahr',
    'Karfreitag',
    'Ostermontag',
    'Tag der Arbeit',
    'Christi Himmelfahrt',
    'Pfingstmontag',
    'Tag der Deutschen Einheit',
    '1. Weihnachtsfeiertag',
    '2. Weihnachtsfeiertag',
  ];

  it('gelten in allen sechzehn Bundeslaendern', () => {
    for (const state of ALL_STATES) {
      const names = namesIn(2026, state);
      for (const holiday of NATIONAL) {
        expect(names, `${holiday} fehlt in ${state}`).toContain(holiday);
      }
    }
  });

  it('liegen an den richtigen Daten relativ zu Ostern', () => {
    const easter = easterSunday(2026); // 05.04.2026
    const byDate = new Map(holidaysForYear(2026, 'BY').map((h) => [h.name, h.date]));
    expect(byDate.get('Karfreitag')).toBe(addDays(easter, -2));
    expect(byDate.get('Ostermontag')).toBe(addDays(easter, 1));
    expect(byDate.get('Christi Himmelfahrt')).toBe(addDays(easter, 39));
    expect(byDate.get('Pfingstmontag')).toBe(addDays(easter, 50));
    expect(byDate.get('Fronleichnam')).toBe(addDays(easter, 60));
  });
});

describe('Bayern (Praxisstandort Würzburg)', () => {
  it('ist die Voreinstellung', () => {
    expect(DEFAULT_STATE).toBe('BY');
    expect(DEFAULT_HOLIDAY_OPTIONS.assumptionOfMary).toBe(true);
  });

  it('hat dreizehn Feiertage inklusive Mariä Himmelfahrt', () => {
    const names = namesIn(2026, 'BY');
    expect(names).toContain('Heilige Drei Könige');
    expect(names).toContain('Fronleichnam');
    expect(names).toContain('Mariä Himmelfahrt');
    expect(names).toContain('Allerheiligen');
    expect(names).not.toContain('Reformationstag');
    expect(names).not.toContain('Buß- und Bettag');
    expect(names).toHaveLength(13);
  });

  it('laesst Mariä Himmelfahrt abschalten, wo die Gemeinde nicht katholisch gepraegt ist', () => {
    const withoutMary = namesIn(2026, 'BY', { assumptionOfMary: false });
    expect(withoutMary).not.toContain('Mariä Himmelfahrt');
    expect(withoutMary).toHaveLength(12);
  });

  it('kennt das Augsburger Friedensfest nur auf Wunsch', () => {
    expect(namesIn(2026, 'BY')).not.toContain('Augsburger Friedensfest');
    expect(namesIn(2026, 'BY', { augsburgPeaceFestival: true })).toContain(
      'Augsburger Friedensfest',
    );
  });
});

describe('Besonderheiten anderer Bundeslaender', () => {
  it('Saarland: Mariä Himmelfahrt gilt landesweit, unabhaengig von der Option', () => {
    const names = namesIn(2026, 'SL', { assumptionOfMary: false });
    expect(names).toContain('Mariä Himmelfahrt');
    expect(holidaysForYear(2026, 'SL').find((h) => h.name === 'Mariä Himmelfahrt')?.scope).toBe(
      'state',
    );
  });

  it('Bayern: Mariä Himmelfahrt ist nur regional', () => {
    expect(holidaysForYear(2026, 'BY').find((h) => h.name === 'Mariä Himmelfahrt')?.scope).toBe(
      'regional',
    );
  });

  it('Sachsen: Buß- und Bettag nur dort', () => {
    expect(namesIn(2026, 'SN')).toContain('Buß- und Bettag');
    for (const state of ALL_STATES.filter((code) => code !== 'SN')) {
      expect(namesIn(2026, state), state).not.toContain('Buß- und Bettag');
    }
  });

  it('Sachsen und Thueringen: Fronleichnam nur bei gesetzter Option', () => {
    expect(namesIn(2026, 'SN')).not.toContain('Fronleichnam');
    expect(namesIn(2026, 'SN', { corpusChristi: true })).toContain('Fronleichnam');
    expect(namesIn(2026, 'TH', { corpusChristi: true })).toContain('Fronleichnam');
    // In Nordrhein-Westfalen gilt er ohnehin landesweit.
    expect(namesIn(2026, 'NW')).toContain('Fronleichnam');
  });

  it('Brandenburg: einziges Land mit Oster- und Pfingstsonntag', () => {
    expect(namesIn(2026, 'BB')).toContain('Ostersonntag');
    expect(namesIn(2026, 'BB')).toContain('Pfingstsonntag');
    expect(namesIn(2026, 'HE')).not.toContain('Ostersonntag');
  });

  it('Berlin und Mecklenburg-Vorpommern: Internationaler Frauentag', () => {
    expect(namesIn(2026, 'BE')).toContain('Internationaler Frauentag');
    expect(namesIn(2026, 'MV')).toContain('Internationaler Frauentag');
    expect(namesIn(2026, 'HH')).not.toContain('Internationaler Frauentag');
  });

  it('Thueringen: Weltkindertag', () => {
    expect(namesIn(2026, 'TH')).toContain('Weltkindertag');
  });

  it('Reformationstag gilt in den neun noerdlichen und oestlichen Laendern', () => {
    for (const state of ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'] as GermanState[]) {
      expect(namesIn(2026, state), state).toContain('Reformationstag');
    }
    for (const state of ['BW', 'BY', 'BE', 'HE', 'NW', 'RP', 'SL'] as GermanState[]) {
      expect(namesIn(2026, state), state).not.toContain('Reformationstag');
    }
  });
});

describe('repentanceDay', () => {
  it('ist immer der Mittwoch zwischen dem 16. und 22. November', () => {
    for (let year = 2026; year <= 2035; year++) {
      const date = repentanceDay(year);
      expect(isoWeekday(date), `${year}`).toBe(3);
      expect(date >= `${year}-11-16`).toBe(true);
      expect(date <= `${year}-11-22`).toBe(true);
    }
  });
});

describe('Zehn-Jahres-Abdeckung', () => {
  it('liefert fuer 2026 bis 2035 jedes Jahr einen vollstaendigen Satz', () => {
    for (let year = 2026; year <= 2035; year++) {
      const holidays = holidaysForYear(year, 'BY');
      expect(holidays, `${year}`).toHaveLength(13);
      // Alle Datumsangaben liegen im richtigen Jahr und sind eindeutig.
      const dates = holidays.map((h) => h.date);
      expect(new Set(dates).size).toBe(dates.length);
      for (const date of dates) {
        expect(date.slice(0, 4)).toBe(String(year));
      }
    }
  });

  it('liefert alle sechzehn Laender ueber zehn Jahre ohne Fehler', () => {
    for (const state of ALL_STATES) {
      const holidays = holidaysForYears(2026, 2035, state);
      expect(holidays.length, state).toBeGreaterThanOrEqual(90); // mind. 9 pro Jahr
    }
  });

  it('gibt ein Set fuer die Urlaubs- und Planungsrechnung aus', () => {
    const dates = holidayDateSet(2026, 2035, 'BY');
    expect(dates.has('2026-01-06')).toBe(true); // Heilige Drei Könige
    expect(dates.has('2026-08-15')).toBe(true); // Mariä Himmelfahrt
    expect(dates.has('2035-12-25')).toBe(true);
    expect(dates.has('2026-08-14')).toBe(false); // ganz normaler Freitag
    expect(dates.size).toBe(130); // 13 Feiertage x 10 Jahre
  });

  it('sortiert die Feiertage eines Jahres aufsteigend', () => {
    const dates = holidaysForYear(2026, 'BY').map((h) => h.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('isHoliday / holidayName', () => {
  it('erkennt einzelne Tage', () => {
    expect(isHoliday('2026-10-03', 'BY')).toBe(true);
    expect(holidayName('2026-10-03', 'BY')).toBe('Tag der Deutschen Einheit');
    expect(isHoliday('2026-08-04', 'BY')).toBe(false);
    expect(holidayName('2026-08-04', 'BY')).toBeNull();
  });

  it('unterscheidet nach Bundesland', () => {
    expect(isHoliday('2026-11-01', 'BY')).toBe(true); // Allerheiligen
    expect(isHoliday('2026-11-01', 'HH')).toBe(false);
    expect(isHoliday('2026-10-31', 'HH')).toBe(true); // Reformationstag
    expect(isHoliday('2026-10-31', 'BY')).toBe(false);
  });
});

describe('germanStateName', () => {
  it('liefert die Klarnamen fuer die Auswahlliste', () => {
    expect(GERMAN_STATES).toHaveLength(16);
    expect(germanStateName('BY')).toBe('Bayern');
    expect(germanStateName('NW')).toBe('Nordrhein-Westfalen');
  });
});
