import { describe, expect, it } from 'vitest';
import type { HolidaySettings } from '../types/settings.js';
import { DEFAULT_HOLIDAY_SETTINGS } from '../types/settings.js';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import { countVacationDays } from '../hours/vacation.js';
import { closedDateSet, describeClosedDay } from './closedDays.js';

const wuerzburg: HolidaySettings = DEFAULT_HOLIDAY_SETTINGS;

const workDay = { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 };
const fulltime: WeeklyWorkTimes = { 1: workDay, 2: workDay, 3: workDay, 4: workDay, 5: workDay };

describe('closedDateSet', () => {
  it('enthaelt die gesetzlichen Feiertage des gewaehlten Bundeslandes', () => {
    const closed = closedDateSet(wuerzburg, 2026, 2026);
    expect(closed.has('2026-01-06')).toBe(true); // Heilige Drei Könige, nur BW/BY/ST
    expect(closed.has('2026-11-01')).toBe(true); // Allerheiligen
    expect(closed.has('2026-10-31')).toBe(false); // Reformationstag gilt in Bayern nicht
  });

  it('nimmt selbst gepflegte Schliesstage dazu', () => {
    const settings: HolidaySettings = {
      ...wuerzburg,
      additionalClosedDates: ['2026-12-24', '2026-12-31'],
    };
    const closed = closedDateSet(settings, 2026, 2026);
    expect(closed.has('2026-12-24')).toBe(true); // Heiligabend ist kein gesetzlicher Feiertag
    expect(closed.has('2026-12-31')).toBe(true);
  });

  it('folgt der Bundeslandauswahl', () => {
    const hamburg: HolidaySettings = { ...wuerzburg, state: 'HH' };
    const closed = closedDateSet(hamburg, 2026, 2026);
    expect(closed.has('2026-10-31')).toBe(true); // Reformationstag
    expect(closed.has('2026-11-01')).toBe(false); // Allerheiligen gilt in Hamburg nicht
    expect(closed.size).toBe(10);
  });

  it('deckt zehn Jahre ab', () => {
    const closed = closedDateSet(wuerzburg, 2026, 2035);
    expect(closed.size).toBe(130);
    expect(closed.has('2035-04-27')).toBe(false);
    expect(closed.has('2035-05-01')).toBe(true);
  });
});

describe('Zusammenspiel mit der Urlaubsrechnung', () => {
  it('rechnet einen Feiertag nicht als Urlaubstag an', () => {
    // Pfingstmontag 2026 ist der 25.05. - die Urlaubswoche kostet nur vier Tage.
    const week = { startDate: '2026-05-25', endDate: '2026-05-29' };
    const closed = closedDateSet(wuerzburg, 2026, 2026);

    expect(countVacationDays(week, fulltime)).toBe(5);
    expect(countVacationDays(week, fulltime, { excludedDates: closed })).toBe(4);
  });

  it('rechnet die Weihnachtswoche mit beiden Feiertagen und Heiligabend', () => {
    // 2026: 24.12. Donnerstag, 25.12. Freitag. Mo-Mi normal, Do als
    // Praxis-Schliesstag, Fr gesetzlicher Feiertag - bleiben drei Urlaubstage.
    const settings: HolidaySettings = { ...wuerzburg, additionalClosedDates: ['2026-12-24'] };
    const week = { startDate: '2026-12-21', endDate: '2026-12-25' };
    const closed = closedDateSet(settings, 2026, 2026);

    expect(countVacationDays(week, fulltime, { excludedDates: closed })).toBe(3);
  });
});

describe('describeClosedDay', () => {
  it('nennt den Feiertagsnamen fuer den Tooltip', () => {
    expect(describeClosedDay('2026-08-15', wuerzburg)).toEqual({
      date: '2026-08-15',
      holiday: 'Mariä Himmelfahrt',
      isClosed: true,
    });
  });

  it('kennzeichnet selbst gepflegte Tage ohne Feiertagsnamen', () => {
    const settings: HolidaySettings = { ...wuerzburg, additionalClosedDates: ['2026-12-24'] };
    expect(describeClosedDay('2026-12-24', settings)).toEqual({
      date: '2026-12-24',
      holiday: null,
      isClosed: true,
    });
  });

  it('meldet normale Arbeitstage als offen', () => {
    expect(describeClosedDay('2026-08-04', wuerzburg).isClosed).toBe(false);
  });
});
