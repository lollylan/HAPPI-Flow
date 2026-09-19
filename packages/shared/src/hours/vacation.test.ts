import { describe, expect, it } from 'vitest';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import { calculateVacationBalance, countVacationDays, countWorkingDays } from './vacation.js';

const day = (startMin: number, endMin: number) => ({
  isWorking: true,
  startMin,
  endMin,
  breakMin: 60,
});
const off = { isWorking: false, startMin: 0, endMin: 0, breakMin: 0 };

/** Vollzeit: Mo-Fr 08:00-17:00. */
const fulltime: WeeklyWorkTimes = {
  1: day(480, 1020),
  2: day(480, 1020),
  3: day(480, 1020),
  4: day(480, 1020),
  5: day(480, 1020),
};

/** Teilzeit: nur Montag, Dienstag, Donnerstag. */
const partTime: WeeklyWorkTimes = {
  1: day(480, 1020),
  2: day(480, 1020),
  3: off,
  4: day(480, 1020),
  5: off,
};

// KW 32/2026: Montag 03.08. bis Freitag 07.08.
const week = { startDate: '2026-08-03', endDate: '2026-08-07' };

describe('countWorkingDays', () => {
  it('zaehlt fuer Vollzeit fuenf Tage pro Woche', () => {
    expect(countWorkingDays(week, fulltime)).toBe(5);
  });

  it('zaehlt fuer Teilzeit nur die tatsaechlichen Arbeitstage', () => {
    // Mo, Di, Do - Mittwoch und Freitag arbeitet sie nicht.
    expect(countWorkingDays(week, partTime)).toBe(3);
  });

  it('ignoriert Wochenenden', () => {
    // Montag bis Sonntag: die beiden Wochenendtage zaehlen nicht mit.
    expect(countWorkingDays({ startDate: '2026-08-03', endDate: '2026-08-09' }, fulltime)).toBe(5);
  });

  it('rechnet ueber zwei Wochen', () => {
    expect(countWorkingDays({ startDate: '2026-08-03', endDate: '2026-08-14' }, fulltime)).toBe(10);
    expect(countWorkingDays({ startDate: '2026-08-03', endDate: '2026-08-14' }, partTime)).toBe(6);
  });

  it('laesst ausgeschlossene Tage weg (Feiertage)', () => {
    // Mariae Himmelfahrt faellt 2026 auf einen Samstag, deshalb hier
    // beispielhaft der 05.08. als ausgeschlossener Tag.
    const holidays = new Set(['2026-08-05']);
    expect(countWorkingDays(week, fulltime, holidays)).toBe(4);
    // Fuer die Teilzeitkraft aendert sich nichts - mittwochs arbeitet sie ohnehin nicht.
    expect(countWorkingDays(week, partTime, holidays)).toBe(3);
  });
});

describe('countVacationDays', () => {
  it('entspricht bei ganzen Tagen den Arbeitstagen', () => {
    expect(countVacationDays(week, fulltime)).toBe(5);
    expect(countVacationDays(week, partTime)).toBe(3);
  });

  it('zaehlt einen halben Tag als 0,5', () => {
    const single = { startDate: '2026-08-03', endDate: '2026-08-03' };
    expect(countVacationDays(single, fulltime, { halfDay: 'am' })).toBe(0.5);
    expect(countVacationDays(single, fulltime, { halfDay: 'pm' })).toBe(0.5);
    expect(countVacationDays(single, fulltime)).toBe(1);
  });

  it('ignoriert die Halbtagsangabe bei mehrtaegigen Zeitraeumen', () => {
    // Bei einem Zeitraum waere "halber Tag" mehrdeutig.
    expect(countVacationDays(week, fulltime, { halfDay: 'am' })).toBe(5);
  });

  it('zaehlt einen freien Tag der Teilzeitkraft nicht als Urlaub', () => {
    const wednesday = { startDate: '2026-08-05', endDate: '2026-08-05' };
    expect(countVacationDays(wednesday, partTime)).toBe(0);
  });
});

describe('calculateVacationBalance', () => {
  it('rechnet Anspruch, Uebertrag und Verbrauch zusammen', () => {
    const balance = calculateVacationBalance(
      { entitlement: 30, carryover: 5 },
      [week, { startDate: '2026-08-10', endDate: '2026-08-14' }],
      fulltime,
    );
    expect(balance.available).toBe(35);
    expect(balance.used).toBe(10);
    expect(balance.remaining).toBe(25);
  });

  it('kann ins Minus laufen und zeigt das an', () => {
    const balance = calculateVacationBalance({ entitlement: 4, carryover: 0 }, [week], fulltime);
    expect(balance.remaining).toBe(-1);
  });

  it('ohne Abwesenheiten bleibt alles stehen', () => {
    const balance = calculateVacationBalance({ entitlement: 28, carryover: 2 }, [], partTime);
    expect(balance.used).toBe(0);
    expect(balance.remaining).toBe(30);
  });
});
