import { describe, expect, it } from 'vitest';
import type { Closure } from '../types/absence.js';
import { closureWorkingDates, planClosure } from './closure.js';
import { dayOff, employee, fullWeek } from './testFixtures.js';

/** Weihnachtsschließung: Mo 21.12. bis Do 31.12.2026, Feiertage 25./26.12. */
const closure: Closure = {
  id: 'c1',
  startDate: '2026-12-21',
  endDate: '2026-12-31',
  description: 'Weihnachten',
  skeletonStaff: 0,
  prepDays: 2,
  prepStaff: 1,
};
const HOLIDAYS = new Set(['2026-12-25', '2026-12-26']);

const person = (id: string, sortOrder: number, workTimes = fullWeek()) => ({
  ...employee(id, { sortOrder, workTimes }),
  isActive: true,
});

describe('Schließzeit planen', () => {
  it('kennt die Arbeitstage ohne Wochenende und Feiertage', () => {
    expect(closureWorkingDates(closure, HOLIDAYS)).toEqual([
      '2026-12-21',
      '2026-12-22',
      '2026-12-23',
      '2026-12-24',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
    ]);
  });

  it('gibt jedem Urlaub und setzt eine Notbesetzung auf die letzten Tage', () => {
    const plan = planClosure({
      closure,
      employees: [person('a', 1), person('b', 2), person('c', 3)],
      absences: [],
      dutyHistory: [],
      closedDates: HOLIDAYS,
    });

    expect(plan.prepDates).toEqual(['2026-12-30', '2026-12-31']);
    // a hat den kleinsten Sortierschlüssel und keine Historie.
    expect(plan.duties).toEqual([
      { employeeId: 'a', date: '2026-12-30', kind: 'prep' },
      { employeeId: 'a', date: '2026-12-31', kind: 'prep' },
    ]);

    const a = plan.summary.find((s) => s.employeeId === 'a');
    expect(a?.vacationDays).toBe(6);
    expect(a?.note).toBe('duty');
    const b = plan.summary.find((s) => s.employeeId === 'b');
    expect(b?.vacationDays).toBe(8);
    expect(b?.note).toBe('vacation');
    expect(plan.understaffed).toEqual([]);
  });

  it('rotiert fair: wer schon oft dran war, wird verschont', () => {
    const plan = planClosure({
      closure,
      employees: [person('a', 1), person('b', 2)],
      absences: [],
      dutyHistory: [{ employeeId: 'a', days: 4 }],
      closedDates: HOLIDAYS,
    });
    expect(plan.duties.every((d) => d.employeeId === 'b')).toBe(true);
  });

  it('respektiert Urlaubswünsche: wer beantragt hat, wird nicht Notbesetzung', () => {
    const plan = planClosure({
      closure,
      employees: [person('a', 1), person('b', 2)],
      absences: [
        {
          employeeId: 'a',
          startDate: '2026-12-28',
          endDate: '2027-01-03',
          status: 'requested',
          type: 'vacation',
        },
      ],
      dutyHistory: [],
      closedDates: HOLIDAYS,
    });
    expect(plan.duties.every((d) => d.employeeId === 'b')).toBe(true);
    expect(plan.summary.find((s) => s.employeeId === 'a')?.note).toBe('vacation_requested');
  });

  it('fasst den Urlaub zu einer Spanne zusammen und lässt Notdiensttage aus', () => {
    const plan = planClosure({
      closure,
      employees: [person('a', 1)],
      absences: [],
      dutyHistory: [],
      closedDates: HOLIDAYS,
    });
    expect(plan.vacations).toEqual([
      { employeeId: 'a', startDate: '2026-12-21', endDate: '2026-12-29', workingDays: 6 },
    ]);
  });

  it('meldet, wenn die Notbesetzung nicht voll wird', () => {
    const plan = planClosure({
      closure: { ...closure, prepStaff: 2 },
      employees: [person('a', 1)],
      absences: [],
      dutyHistory: [],
      closedDates: HOLIDAYS,
    });
    expect(plan.understaffed).toEqual([
      { date: '2026-12-30', missing: 1 },
      { date: '2026-12-31', missing: 1 },
    ]);
  });

  it('füllt tageweise auf, wenn die Teilzeitkraft an einem Vorbereitungstag frei hat', () => {
    // b arbeitet donnerstags nicht (31.12. ist ein Donnerstag).
    const plan = planClosure({
      closure,
      employees: [person('b', 1, { ...fullWeek(), 4: dayOff }), person('a', 2)],
      absences: [],
      dutyHistory: [],
      closedDates: HOLIDAYS,
    });
    // a kann an allen Vorbereitungstagen und wird deshalb als Team gewählt.
    expect(plan.duties.map((d) => d.employeeId)).toEqual(['a', 'a']);
  });

  it('lässt Ärzte standardmäßig außen vor', () => {
    const plan = planClosure({
      closure,
      employees: [{ ...person('dr', 1), staffType: 'doctor' }, person('a', 2)],
      absences: [],
      dutyHistory: [],
      closedDates: HOLIDAYS,
    });
    expect(plan.summary.map((s) => s.employeeId)).toEqual(['a']);
  });
});
