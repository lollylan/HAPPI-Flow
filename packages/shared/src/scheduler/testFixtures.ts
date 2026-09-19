import type { DayBlock } from '../types/dayBlock.js';
import type { MatrixEntry } from '../types/matrix.js';
import type { PlanKind, WorkArea } from '../types/workArea.js';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import { parseHHMM } from '../time/minutes.js';
import { DEFAULT_WEIGHTS, type PlanEmployee, type PlanInput } from './types.js';

/**
 * Bausteine fuer die Scheduler-Tests. Bewusst als eigene Datei: die Tests
 * sollen den Fall beschreiben, nicht das Aufbauen der Stammdaten.
 */

/** KW 32/2026 - Montag 03.08. bis Freitag 07.08. */
export const MONDAY = '2026-08-03';

export function workDay(
  from = '08:00',
  to = '17:00',
  breakMin = 60,
  location = 'practice' as const,
) {
  return {
    isWorking: true,
    startMin: parseHHMM(from),
    endMin: parseHHMM(to),
    breakMin,
    location,
  };
}
export const dayOff = {
  isWorking: false,
  startMin: 0,
  endMin: 0,
  breakMin: 0,
  location: 'practice' as const,
};

export function fullWeek(from = '08:00', to = '17:00'): WeeklyWorkTimes {
  const day = workDay(from, to);
  return { 1: day, 2: day, 3: day, 4: day, 5: day };
}

export function employee(id: string, overrides: Partial<PlanEmployee> = {}): PlanEmployee {
  return {
    id,
    firstName: id,
    lastName: 'Test',
    staffType: 'mfa',
    canHomeoffice: false,
    skillIds: [],
    workTimes: fullWeek(),
    targetHoursPerWeek: 40,
    sortOrder: 0,
    ...overrides,
  };
}

/** Ein Block je Wochentag, 08:00-13:00, fuer eine Gruppe. */
export function morningBlocks(plan: PlanKind = 'mfa', suffix = ''): DayBlock[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    id: `blk-${weekday}${suffix}`,
    plan,
    weekday: weekday as 1 | 2 | 3 | 4 | 5,
    label: 'Vormittag',
    kind: 'consultation' as const,
    startMin: parseHHMM('08:00'),
    endMin: parseHHMM('13:00'),
    sortOrder: 1,
  }));
}

/** Zusaetzlich ein Nachmittagsblock 13:00-17:00 je Wochentag. */
export function afternoonBlocks(plan: PlanKind = 'mfa', suffix = ''): DayBlock[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    id: `blk-${weekday}-nm${suffix}`,
    plan,
    weekday: weekday as 1 | 2 | 3 | 4 | 5,
    label: 'Nachmittag',
    kind: 'backoffice' as const,
    startMin: parseHHMM('13:00'),
    endMin: parseHHMM('17:00'),
    sortOrder: 2,
  }));
}

export function area(id: string, overrides: Partial<WorkArea> = {}): WorkArea {
  const plan = overrides.plan ?? 'mfa';
  return {
    id,
    plan,
    name: id,
    description: '',
    kind: 'service',
    isCritical: false,
    minStaff: 1,
    maxStaff: 1,
    location: 'practice',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🔬',
    color: '#000000',
    sortOrder: 0,
    isActive: true,
    requiredSkillIds: [],
    blockIds: morningBlocks(plan).map((block) => block.id),
    blockMinStaff: {},
    ...overrides,
  };
}

export function matrixEntry(
  employeeId: string,
  workAreaId: string,
  overrides: Partial<MatrixEntry> = {},
): MatrixEntry {
  return {
    employeeId,
    workAreaId,
    clearance: 'solo',
    preference: 'neutral',
    minPerWeek: null,
    maxPerWeek: null,
    exemptRotation: false,
    ...overrides,
  };
}

export function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    weekStart: MONDAY,
    mode: 'fresh',
    dayBlocks: morningBlocks(),
    employees: [],
    workAreas: [],
    matrix: [],
    template: [],
    absences: [],
    pinned: [],
    previous: [],
    recent: [],
    closedDates: new Set(),
    history: [],
    weights: DEFAULT_WEIGHTS,
    minOverlapRatio: 0.5,
    ...overrides,
  };
}
