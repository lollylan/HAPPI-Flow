import { describe, expect, it } from 'vitest';
import { assessAbsence, requiredHeadcount } from './coverage.js';
import { MONDAY, area, employee, fullWeek, morningBlocks } from './testFixtures.js';

const TUESDAY = '2026-08-04';

describe('Antragsprüfung', () => {
  const areas = [
    area('anmeldung', { minStaff: 2, maxStaff: 3, isCritical: true }),
    area('labor', { minStaff: 1, maxStaff: 1, isCritical: true }),
    area('backoffice', { minStaff: 3, maxStaff: null, isCritical: false }),
  ];

  it('errechnet den Kopfbedarf aus den kritischen Bereichen', () => {
    // Anmeldung 2 + Labor 1 = 3; das unkritische Backoffice zählt nicht.
    expect(requiredHeadcount('mfa', 1, areas, morningBlocks())).toBe(3);
  });

  it('meldet den Tag, an dem es eng wird', () => {
    const result = assessAbsence({
      employeeId: 'a',
      startDate: MONDAY,
      endDate: TUESDAY,
      employees: ['a', 'b', 'c', 'd'].map((id) => employee(id)),
      // Montag fehlt zusätzlich b: 4 - a - b = 2 von 3.
      absences: [{ employeeId: 'b', startDate: MONDAY, endDate: MONDAY }],
      workAreas: areas,
      dayBlocks: morningBlocks(),
      closedDates: new Set(),
    });

    expect(result.workingDays).toBe(2);
    expect(result.criticalDays).toBe(1);
    expect(result.days[0]).toMatchObject({
      date: MONDAY,
      present: 2,
      required: 3,
      shortfall: 1,
      othersAbsent: ['b'],
    });
    expect(result.days[1]).toMatchObject({ date: TUESDAY, present: 3, shortfall: 0 });
  });

  it('zählt Tage nicht, an denen die Person ohnehin frei hat', () => {
    const teilzeit = employee('a', {
      workTimes: { ...fullWeek(), 2: { ...fullWeek()[2], isWorking: false } },
    });
    const result = assessAbsence({
      employeeId: 'a',
      startDate: MONDAY,
      endDate: TUESDAY,
      employees: [teilzeit, employee('b')],
      absences: [],
      workAreas: areas,
      dayBlocks: morningBlocks(),
      closedDates: new Set(),
    });
    expect(result.workingDays).toBe(1);
    expect(result.days[1]?.offAnyway).toBe(true);
    expect(result.days[1]?.shortfall).toBe(0);
  });

  it('lässt Ärzte bei einer MFA-Anfrage außen vor', () => {
    const result = assessAbsence({
      employeeId: 'a',
      startDate: MONDAY,
      endDate: MONDAY,
      employees: [employee('a'), employee('dr', { staffType: 'doctor' })],
      absences: [],
      workAreas: areas,
      dayBlocks: morningBlocks(),
      closedDates: new Set(),
    });
    expect(result.plan).toBe('mfa');
    expect(result.days[0]?.present).toBe(0);
  });
});
