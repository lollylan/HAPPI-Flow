import { describe, expect, it } from 'vitest';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import {
  calculateHoursBalance,
  contractedHoursPerWeek,
  netHoursForDay,
  netMinutesForDay,
  roundHours,
  workingWeekdays,
} from './balance.js';

const off = { isWorking: false, startMin: 0, endMin: 0, breakMin: 0 };

describe('netMinutesForDay', () => {
  it('zieht die Pause ab', () => {
    // 08:00-17:00 = 540 Minuten, minus 60 Minuten Pause.
    expect(netMinutesForDay({ isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 })).toBe(
      480,
    );
    expect(netHoursForDay({ isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 })).toBe(8);
  });

  it('beruecksichtigt abweichende Pausenlaengen', () => {
    const gross = { isWorking: true as const, startMin: 480, endMin: 1020 };
    expect(netMinutesForDay({ ...gross, breakMin: 30 })).toBe(510);
    expect(netMinutesForDay({ ...gross, breakMin: 90 })).toBe(450);
  });

  it('liefert 0 an freien Tagen', () => {
    expect(netMinutesForDay(off)).toBe(0);
  });

  it('wird nicht negativ, wenn die Pause laenger als der Tag ist', () => {
    // Fehleingabe im Stammdatenblatt darf keine negativen Stunden erzeugen.
    expect(netMinutesForDay({ isWorking: true, startMin: 480, endMin: 510, breakMin: 60 })).toBe(0);
  });
});

describe('contractedHoursPerWeek', () => {
  it('rechnet Vollzeit auf 40 Stunden', () => {
    const fulltime: WeeklyWorkTimes = {
      1: { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 },
      2: { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 },
      3: { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 },
      4: { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 },
      5: { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 },
    };
    expect(contractedHoursPerWeek(fulltime)).toBe(40);
    expect(workingWeekdays(fulltime)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rechnet eine realistische Teilzeitkraft', () => {
    // Mo/Di ganztags 08-17 (je 8 h), Do nur vormittags 08-13 ohne Pause (5 h).
    const partTime: WeeklyWorkTimes = {
      1: { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 },
      2: { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 },
      3: off,
      4: { isWorking: true, startMin: 480, endMin: 780, breakMin: 0 },
      5: off,
    };
    expect(contractedHoursPerWeek(partTime)).toBe(21);
    expect(workingWeekdays(partTime)).toEqual([1, 2, 4]);
  });
});

describe('calculateHoursBalance', () => {
  it('weist Ueber- und Unterdeckung aus', () => {
    expect(calculateHoursBalance(40, 42).difference).toBe(2);
    expect(calculateHoursBalance(40, 37.5).difference).toBe(-2.5);
    expect(calculateHoursBalance(40, 40).difference).toBe(0);
  });
});

describe('roundHours', () => {
  it('haelt Fliesskomma-Artefakte aus der Oberflaeche', () => {
    expect(roundHours(7.499999999999999)).toBe(7.5);
    expect(roundHours(8.333333)).toBe(8.33);
  });
});
