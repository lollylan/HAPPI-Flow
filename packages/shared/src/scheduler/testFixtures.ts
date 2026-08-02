import type { DayBlock } from '../types/dayBlock.js';
import type { MatrixEntry } from '../types/matrix.js';
import type { WorkArea } from '../types/workArea.js';
import type { WeeklyWorkTimes } from '../types/worktime.js';
import { parseHHMM } from '../time/minutes.js';
import { DEFAULT_WEIGHTS, type PlanEmployee, type PlanInput } from './types.js';

/**
 * Bausteine fuer die Scheduler-Tests. Bewusst als eigene Datei: die Tests
 * sollen den Fall beschreiben, nicht das Aufbauen der Stammdaten.
 */

/** KW 32/2026 - Montag 03.08. bis Freitag 07.08. */
export const MONDAY = '2026-08-03';

export function workDay(from = '08:00', to = '17:00', breakMin = 60) {
  return { isWorking: true, startMin: parseHHMM(from), endMin: parseHHMM(to), breakMin };
}
export const dayOff = { isWorking: false, startMin: 0, endMin: 0, breakMin: 0 };

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
    isPcm: false,
    canHomeoffice: false,
    skillIds: [],
    workTimes: fullWeek(),
    targetHoursPerWeek: 40,
    sortOrder: 0,
    ...overrides,
  };
}

/** Ein Block je Wochentag, 08:00-13:00. */
export function morningBlocks(): DayBlock[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    id: `blk-${weekday}`,
    weekday: weekday as 1 | 2 | 3 | 4 | 5,
    label: 'Vormittag',
    kind: 'consultation' as const,
    startMin: parseHHMM('08:00'),
    endMin: parseHHMM('13:00'),
    sortOrder: 1,
  }));
}

export function area(id: string, overrides: Partial<WorkArea> = {}): WorkArea {
  return {
    id,
    plan: 'mfa',
    name: id,
    description: '',
    kind: 'service',
    isCritical: false,
    minStaff: 1,
    maxStaff: 1,
    requiresHomeoffice: false,
    rotationMinPerWeek: null,
    icon: '🔬',
    color: '#000000',
    sortOrder: 0,
    isActive: true,
    requiredSkillIds: [],
    blockIds: morningBlocks().map((block) => block.id),
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
    plan: 'mfa',
    dayBlocks: morningBlocks(),
    employees: [],
    workAreas: [],
    matrix: [],
    template: [],
    absences: [],
    pinned: [],
    closedDates: new Set(),
    history: [],
    pcmBusy: [],
    weights: DEFAULT_WEIGHTS,
    minOverlapRatio: 0.5,
    ...overrides,
  };
}
