import { describe, expect, it } from 'vitest';
import {
  addDays,
  assertIsoDate,
  compareIsoDates,
  diffDays,
  eachDateInRange,
  endOfISOWeek,
  fromISODate,
  isIsoDate,
  isoWeekNumber,
  isoWeekYear,
  isoWeekday,
  isWeekend,
  isWithinRange,
  practiceWeekDates,
  rangesOverlap,
  startOfISOWeek,
  toLocalISODate,
  todayLocal,
} from './dates.js';

// Diese Suite laeuft mit TZ=Europe/Berlin (gesetzt im npm-Skript).
// 2026: Zeitumstellung am 29.03. (vor) und am 25.10. (zurueck).

describe('toLocalISODate', () => {
  it('liefert das Ortsdatum', () => {
    expect(toLocalISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toLocalISODate(new Date(2026, 7, 2, 23, 30))).toBe('2026-08-02');
  });

  it('weicht am Tag der Zeitumstellung bewusst von toISOString() ab', () => {
    // Genau hier lag der Fehler der Vorgaengerversion: lokale Mitternacht
    // am Umstellungstag ist in UTC noch der Vortag.
    const springForward = new Date(2026, 2, 29);
    expect(springForward.toISOString().slice(0, 10)).toBe('2026-03-28'); // der alte Fehler
    expect(toLocalISODate(springForward)).toBe('2026-03-29'); // korrekt

    const fallBack = new Date(2026, 9, 25);
    expect(fallBack.toISOString().slice(0, 10)).toBe('2026-10-24'); // der alte Fehler
    expect(toLocalISODate(fallBack)).toBe('2026-10-25'); // korrekt
  });

  it('ist mit fromISODate verlustfrei umkehrbar', () => {
    for (const iso of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31', '2028-02-29']) {
      expect(toLocalISODate(fromISODate(iso))).toBe(iso);
    }
  });
});

describe('addDays / diffDays', () => {
  it('rechnet ueber die Zeitumstellung hinweg korrekt', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');

    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('rechnet ueber Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29'); // Schaltjahr
  });

  it('liefert negative Differenzen rueckwaerts', () => {
    expect(diffDays('2026-08-10', '2026-08-03')).toBe(-7);
    expect(diffDays('2026-08-03', '2026-08-03')).toBe(0);
  });
});

describe('isIsoDate / assertIsoDate', () => {
  it('akzeptiert echte Daten', () => {
    expect(isIsoDate('2026-08-02')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true); // Schaltjahr
  });

  it('lehnt Unsinn ab', () => {
    expect(isIsoDate('2026-02-31')).toBe(false); // gibt es nicht
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-8-2')).toBe(false);
    expect(isIsoDate('02.08.2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(() => assertIsoDate('2026-02-31')).toThrow(RangeError);
  });
});

describe('Wochenlogik', () => {
  it('bestimmt den Wochentag nach ISO (1 = Montag)', () => {
    expect(isoWeekday('2026-08-03')).toBe(1); // Montag
    expect(isoWeekday('2026-08-07')).toBe(5); // Freitag
    expect(isoWeekday('2026-08-02')).toBe(7); // Sonntag
    expect(isWeekend('2026-08-02')).toBe(true);
    expect(isWeekend('2026-08-03')).toBe(false);
  });

  it('findet Wochenanfang und -ende', () => {
    expect(startOfISOWeek('2026-08-05')).toBe('2026-08-03'); // Mittwoch -> Montag
    expect(startOfISOWeek('2026-08-03')).toBe('2026-08-03');
    expect(startOfISOWeek('2026-08-02')).toBe('2026-07-27'); // Sonntag gehoert zur Vorwoche
    expect(endOfISOWeek('2026-08-05')).toBe('2026-08-09');
  });

  it('liefert die fuenf Praxistage', () => {
    expect(practiceWeekDates('2026-08-05')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
  });

  it('berechnet die Kalenderwoche nach ISO 8601', () => {
    expect(isoWeekNumber('2026-01-01')).toBe(1); // Donnerstag -> KW 1
    expect(isoWeekNumber('2026-08-03')).toBe(32);
    expect(isoWeekNumber('2026-08-02')).toBe(31); // Sonntag der Vorwoche
  });

  it('ordnet den Jahreswechsel der richtigen ISO-Woche zu', () => {
    // 2027-01-01 ist ein Freitag und gehoert noch zur KW 53 von 2026.
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekYear('2027-01-01')).toBe(2026);
    expect(isoWeekYear('2026-08-03')).toBe(2026);
  });
});

describe('Bereiche', () => {
  it('zaehlt beide Grenzen mit', () => {
    expect(eachDateInRange('2026-08-03', '2026-08-05')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ]);
    expect(eachDateInRange('2026-08-03', '2026-08-03')).toEqual(['2026-08-03']);
    expect(eachDateInRange('2026-08-05', '2026-08-03')).toEqual([]);
  });

  it('laeuft auch ueber die Zeitumstellung durch', () => {
    const dates = eachDateInRange('2026-03-28', '2026-03-30');
    expect(dates).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
  });

  it('prueft Enthaltensein und Ueberschneidung', () => {
    expect(isWithinRange('2026-08-04', '2026-08-03', '2026-08-07')).toBe(true);
    expect(isWithinRange('2026-08-03', '2026-08-03', '2026-08-07')).toBe(true);
    expect(isWithinRange('2026-08-08', '2026-08-03', '2026-08-07')).toBe(false);

    // Urlaub 03.-07. und Schliesszeit 07.-10. beruehren sich am 07.
    expect(rangesOverlap('2026-08-03', '2026-08-07', '2026-08-07', '2026-08-10')).toBe(true);
    expect(rangesOverlap('2026-08-03', '2026-08-06', '2026-08-07', '2026-08-10')).toBe(false);
  });

  it('sortiert Datumsstrings', () => {
    expect(compareIsoDates('2026-08-03', '2026-08-04')).toBe(-1);
    expect(compareIsoDates('2026-08-04', '2026-08-03')).toBe(1);
    expect(compareIsoDates('2026-08-03', '2026-08-03')).toBe(0);
  });
});

describe('todayLocal', () => {
  it('nimmt eine injizierte Uhrzeit entgegen, damit Tests nicht von der Systemuhr abhaengen', () => {
    expect(todayLocal(new Date(2026, 2, 29, 0, 30))).toBe('2026-03-29');
  });
});
