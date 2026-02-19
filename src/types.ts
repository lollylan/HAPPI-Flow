export type CriticalTimeSlot = 'allday' | 'morning' | 'afternoon';

export interface WorkArea {
    id: string;
    name: string;
    description: string;
    isCritical: boolean;
    criticalTimeSlot: CriticalTimeSlot; // when the area must be staffed
    minStaff: number; // minimum required staff
    requiredSkills: string[]; // skill IDs
    icon: string; // emoji
    color: string; // hex color for UI
}

export interface Skill {
    id: string;
    name: string;
    description: string;
    category: string;
}

export type EmploymentStatus = 'fulltime' | 'parttime';

export type PreferenceLevel = 'preferred' | 'neutral' | 'dislike' | 'avoid';

export interface AssignmentRule {
    id: string;
    type: 'min' | 'max';
    workAreaId: string;
    count: number; // how many times per week
}

export type DayAvailability = 'full' | 'morning' | 'afternoon' | 'unavailable';

export interface WeeklyAvailability {
    monday: DayAvailability;
    tuesday: DayAvailability;
    wednesday: DayAvailability;
    thursday: DayAvailability;
    friday: DayAvailability;
}

export interface Employee {
    id: string;
    firstName: string;
    lastName: string;
    status: EmploymentStatus;
    targetHoursPerWeek: number;
    vacationDaysTotal: number; // Urlaubsanspruch aktuelles Jahr
    vacationDaysCarryover: number; // Resturlaub aus dem Vorjahr
    vacationDaysUsed: number; // bereits genommene Urlaubstage
    overtimeBalance: number; // Überstundenkonto (Stunden)
    skills: string[]; // skill IDs
    availability: WeeklyAvailability;
    isActive: boolean;
    canHomeoffice: boolean;
    areaPreferences: Record<string, PreferenceLevel>; // WorkArea.id -> PreferenceLevel
    rules: AssignmentRule[];
    notes: string;
}

export interface Assignment {
    id: string;
    workAreaId: string;
    employeeId: string;
    day: keyof WeeklyAvailability; // Keep for backward compat / easy access
    date: string; // ISO Date YYYY-MM-DD. Mandatory for new logic.
    timeSlot: 'morning' | 'afternoon';
    isLocked: boolean;
}

export type AbsenceType = 'vacation' | 'sick' | 'training' | 'other';
export type AbsenceStatus = 'requested' | 'approved' | 'rejected';

export interface Absence {
    id: string;
    employeeId: string;
    startDate: string; // ISO Date YYYY-MM-DD
    endDate: string; // ISO Date YYYY-MM-DD
    type: AbsenceType;
    status: AbsenceStatus;
    notes?: string;
}

export type ActiveView = 'dashboard' | 'employees' | 'workAreas' | 'skills' | 'settings' | 'roster' | 'vacation';

export interface AppState {
    employees: Employee[];
    workAreas: WorkArea[];
    skills: Skill[];
    assignments: Assignment[];
    absences: Absence[];
    activeView: ActiveView;
}

export const DEFAULT_AVAILABILITY: WeeklyAvailability = {
    monday: 'full',
    tuesday: 'full',
    wednesday: 'full',
    thursday: 'full',
    friday: 'full',
};

export const DAY_LABELS: Record<keyof WeeklyAvailability, string> = {
    monday: 'Mo',
    tuesday: 'Di',
    wednesday: 'Mi',
    thursday: 'Do',
    friday: 'Fr',
};

export const DAY_FULL_LABELS: Record<keyof WeeklyAvailability, string> = {
    monday: 'Montag',
    tuesday: 'Dienstag',
    wednesday: 'Mittwoch',
    thursday: 'Donnerstag',
    friday: 'Freitag',
};

export const AVAILABILITY_LABELS: Record<DayAvailability, string> = {
    full: 'Ganztags',
    morning: 'Nur Vormittag',
    afternoon: 'Nur Nachmittag',
    unavailable: 'Nicht verfügbar',
};

export const AVAILABILITY_OPTIONS: { value: DayAvailability; label: string }[] = [
    { value: 'full', label: 'Ganztags' },
    { value: 'morning', label: 'Vormittag' },
    { value: 'afternoon', label: 'Nachmittag' },
    { value: 'unavailable', label: 'Nicht verfügbar' },
];

export const CRITICAL_TIMESLOT_OPTIONS: { value: CriticalTimeSlot; label: string }[] = [
    { value: 'allday', label: 'Ganztags' },
    { value: 'morning', label: 'Nur Vormittag (08:00–13:00)' },
    { value: 'afternoon', label: 'Nur Nachmittag (16:00–18:00)' },
];

export const CRITICAL_TIMESLOT_LABELS: Record<CriticalTimeSlot, string> = {
    allday: 'Ganztags',
    morning: 'Vormittag',
    afternoon: 'Nachmittag',
};

// Color presets for work areas
export const AREA_COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
];

export const AREA_ICONS = [
    '🏥', '💉', '🔬', '📋', '💊', '🏠', '📞', '🩺', '🧪', '🖥️',
    '📦', '🚑', '🗂️', '🧑‍⚕️', '💳',
];
