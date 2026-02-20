import { AppState, Employee, WorkArea, Skill, Assignment, Absence, WeeklySlotTimes, DEFAULT_AVAILABILITY, PracticeClosure } from './types';
import { v4 as uuidv4 } from 'uuid';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'happi-flow-data';

// ===== SEED DATA =====
const seedSkills: Skill[] = [
    { id: uuidv4(), name: 'Blutentnahme', description: 'Venöse und kapillare Blutentnahme', category: 'Medizinisch' },
    { id: uuidv4(), name: 'Impfen', description: 'Durchführung von Impfungen', category: 'Medizinisch' },
    { id: uuidv4(), name: 'EKG', description: 'EKG schreiben und anlegen', category: 'Medizinisch' },
    { id: uuidv4(), name: 'Lungenfunktion', description: 'Spirometrie durchführen', category: 'Medizinisch' },
    { id: uuidv4(), name: 'Abrechnung', description: 'KV- und Privatabrechnung', category: 'Verwaltung' },
    { id: uuidv4(), name: 'Rezeption', description: 'Patientenannahme und Terminvergabe', category: 'Verwaltung' },
    { id: uuidv4(), name: 'Wundversorgung', description: 'Verbandswechsel und Wundmanagement', category: 'Medizinisch' },
];

const seedWorkAreas: WorkArea[] = [
    {
        id: uuidv4(), name: 'Anmeldung', description: 'Patientenempfang und Terminmanagement', isCritical: true, minStaff: 2, requiredSkills: [], icon: '📋', color: '#3b82f6',
        operatingHours: { monday: ['morning', 'noon', 'afternoon'], tuesday: ['morning', 'noon', 'afternoon'], wednesday: ['morning', 'noon', 'afternoon'], thursday: ['morning', 'noon', 'afternoon'], friday: ['morning', 'noon', 'afternoon'] }
    },
    {
        id: uuidv4(), name: 'Labor', description: 'Blutentnahme und Labordiagnostik', isCritical: true, minStaff: 1, requiredSkills: [], icon: '🔬', color: '#8b5cf6',
        operatingHours: { monday: ['morning'], tuesday: ['morning'], wednesday: ['morning'], thursday: ['morning'], friday: ['morning'] }
    },
    {
        id: uuidv4(), name: 'Notfall-Zimmer', description: 'Akutversorgung und Notfälle', isCritical: true, minStaff: 1, requiredSkills: [], icon: '🚑', color: '#ef4444',
        operatingHours: { monday: ['morning', 'noon', 'afternoon'], tuesday: ['morning', 'noon', 'afternoon'], wednesday: ['morning', 'noon', 'afternoon'], thursday: ['morning', 'noon', 'afternoon'], friday: ['morning', 'noon', 'afternoon'] }
    },
    {
        id: uuidv4(), name: 'Backoffice', description: 'Verwaltungsaufgaben und Abrechnung', isCritical: false, minStaff: 0, requiredSkills: [], icon: '🗂️', color: '#f59e0b',
        operatingHours: { monday: ['morning', 'noon', 'afternoon'], tuesday: ['morning', 'noon', 'afternoon'], wednesday: ['morning', 'noon', 'afternoon'], thursday: ['morning', 'noon', 'afternoon'], friday: ['morning', 'noon', 'afternoon'] }
    },
    {
        id: uuidv4(), name: 'Homeoffice', description: 'Remote-Arbeit von Zuhause', isCritical: false, minStaff: 0, requiredSkills: [], icon: '🏠', color: '#10b981',
        operatingHours: { monday: ['morning', 'noon', 'afternoon'], tuesday: ['morning', 'noon', 'afternoon'], wednesday: ['morning', 'noon', 'afternoon'], thursday: ['morning', 'noon', 'afternoon'], friday: ['morning', 'noon', 'afternoon'] }
    },
];

const defaultSlotSettings: WeeklySlotTimes = {
    monday: { morning: { isActive: true, start: '08:00', end: '12:00' }, noon: { isActive: true, start: '12:00', end: '14:00' }, afternoon: { isActive: true, start: '14:00', end: '18:00' } },
    tuesday: { morning: { isActive: true, start: '08:00', end: '12:00' }, noon: { isActive: true, start: '12:00', end: '14:00' }, afternoon: { isActive: true, start: '14:00', end: '18:00' } },
    wednesday: { morning: { isActive: true, start: '08:00', end: '12:00' }, noon: { isActive: true, start: '12:00', end: '14:00' }, afternoon: { isActive: true, start: '14:00', end: '18:00' } },
    thursday: { morning: { isActive: true, start: '08:00', end: '12:00' }, noon: { isActive: true, start: '12:00', end: '14:00' }, afternoon: { isActive: true, start: '14:00', end: '18:00' } },
    friday: { morning: { isActive: true, start: '08:00', end: '12:00' }, noon: { isActive: true, start: '12:00', end: '14:00' }, afternoon: { isActive: true, start: '14:00', end: '18:00' } },
};

function migrateData(data: any): AppState {
    if (!data || typeof data !== 'object') data = {};
    if (!Array.isArray(data.employees)) data.employees = [];
    if (!Array.isArray(data.workAreas) || data.workAreas.length === 0) data.workAreas = seedWorkAreas;
    if (!Array.isArray(data.skills)) data.skills = seedSkills;
    if (!Array.isArray(data.assignments)) data.assignments = [];
    if (!Array.isArray(data.absences)) data.absences = [];
    if (!Array.isArray(data.closures)) data.closures = [];
    if (!data.activeView) data.activeView = 'dashboard';
    if (!data.adminPasswordHash) data.adminPasswordHash = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918'; // hash for "admin"

    if (data.workAreas) {
        data.workAreas.forEach((area: any) => {
            if (!area.requiredSkills) area.requiredSkills = [];

            // Re-structure to ensure array
            const defaultHours = {
                monday: ['morning', 'noon', 'afternoon'],
                tuesday: ['morning', 'noon', 'afternoon'],
                wednesday: ['morning', 'noon', 'afternoon'],
                thursday: ['morning', 'noon', 'afternoon'],
                friday: ['morning', 'noon', 'afternoon']
            };

            if (!area.operatingHours || typeof area.operatingHours !== 'object') {
                area.operatingHours = defaultHours;
            } else {
                ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
                    if (!Array.isArray(area.operatingHours[day])) {
                        area.operatingHours[day] = defaultHours[day as keyof typeof defaultHours];
                    }
                });
            }
        });
    }

    if (!data.slotSettings) {
        data.slotSettings = defaultSlotSettings;
    } else {
        // Migrate to add isActive flag
        const days: (keyof WeeklySlotTimes)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        days.forEach(day => {
            const slots: ('morning' | 'noon' | 'afternoon')[] = ['morning', 'noon', 'afternoon'];
            slots.forEach(slot => {
                if (data.slotSettings[day] && data.slotSettings[day][slot] && data.slotSettings[day][slot].isActive === undefined) {
                    data.slotSettings[day][slot].isActive = true;
                }
            });
        });
    }

    if (data.employees) {
        // Migrate and inject missing properties for older employee states
        data.employees.forEach((emp: any) => {
            if (emp.username === undefined) emp.username = '';
            if (emp.passwordHash === undefined) emp.passwordHash = '';
            if (emp.vacationDaysTotal === undefined) emp.vacationDaysTotal = 30;
            if (emp.vacationDaysCarryover === undefined) emp.vacationDaysCarryover = 0;
            if (emp.vacationDaysUsed === undefined) emp.vacationDaysUsed = 0;
            if (emp.overtimeBalance === undefined) emp.overtimeBalance = 0;
            if (emp.targetHoursPerWeek === undefined) emp.targetHoursPerWeek = 40;
            if (emp.status === undefined) emp.status = 'fulltime';
            if (emp.isActive === undefined) emp.isActive = true;
            if (emp.canHomeoffice === undefined) emp.canHomeoffice = false;
            if (!emp.areaPreferences) emp.areaPreferences = {};
            if (!emp.rules) emp.rules = [];
            if (!emp.skills) emp.skills = [];
            if (!emp.availability || typeof emp.availability.monday === 'string') {
                emp.availability = JSON.parse(JSON.stringify(DEFAULT_AVAILABILITY));
            }
        });
    }

    return data;
}

function getInitialState(): AppState {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            const data = JSON.parse(stored);
            return migrateData(data);
        } catch {
            // corrupt data
        }
    }
    return {
        employees: [],
        workAreas: seedWorkAreas,
        skills: seedSkills,
        assignments: [],
        absences: [],
        closures: [],
        activeView: 'dashboard',
        slotSettings: defaultSlotSettings,
        adminPasswordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    };
}

// ===== STORE =====
type Listener = () => void;

class Store {
    private state: AppState;
    private listeners: Set<Listener> = new Set();
    private syncTimeout: any = null;
    private isInitializing = true;

    constructor() {
        this.state = getInitialState();
        this.initBackendSync();
    }

    private async initBackendSync() {
        try {
            const BACKEND_URL = `http://${window.location.hostname}:3001/api/sync`;
            const res = await fetch(BACKEND_URL);
            if (res.ok) {
                const serverData = await res.json();
                if (serverData && Object.keys(serverData).length > 0) {
                    // Preserve local activeView but take server truth for everything else
                    const localView = this.state.activeView;
                    const migratedServerData = migrateData(serverData);
                    this.state = { ...this.state, ...migratedServerData, activeView: localView };
                    this.persist(false); // save to local storage, don't trigger push back
                    this.listeners.forEach(l => l());
                } else if (this.state.employees.length > 0 || this.state.assignments.length > 0) {
                    // Server is completely empty but local has data -> Seed server
                    this.pushToBackend();
                }
            }
        } catch (e) {
            console.error("Backend offline, running in read-only/local cache mode", e);
        } finally {
            this.isInitializing = false;
        }
    }

    private pushToBackend() {
        try {
            const BACKEND_URL = `http://${window.location.hostname}:3001/api/sync`;
            fetch(BACKEND_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.state)
            }).catch(e => console.error("Sync push failed", e));
        } catch (e) {
            // ignore
        }
    }

    getState(): AppState {
        return this.state;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private update(partial: Partial<AppState>) {
        this.state = { ...this.state, ...partial };
        this.persist(true);
        this.listeners.forEach(l => l());
    }

    private persist(pushToServer = true) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));

        if (pushToServer && !this.isInitializing) {
            if (this.syncTimeout) clearTimeout(this.syncTimeout);
            this.syncTimeout = setTimeout(() => {
                this.pushToBackend();
            }, 1000);
        }
    }

    // ----- View -----
    setActiveView(view: AppState['activeView']) {
        this.update({ activeView: view });
    }

    // ----- Settings -----
    updateSlotSettings(settings: WeeklySlotTimes) {
        this.update({ slotSettings: settings });
    }

    setAdminPasswordHash(hash: string) {
        this.update({ adminPasswordHash: hash });
    }

    // ----- Employees -----
    addEmployee(emp: Employee) {
        this.update({ employees: [...this.state.employees, emp] });
    }

    updateEmployee(id: string, data: Partial<Employee>) {
        this.update({
            employees: this.state.employees.map(e =>
                e.id === id ? { ...e, ...data } : e
            ),
        });
    }

    deleteEmployee(id: string) {
        this.update({
            employees: this.state.employees.filter(e => e.id !== id),
        });
    }

    // ----- Work Areas -----
    addWorkArea(area: WorkArea) {
        this.update({ workAreas: [...this.state.workAreas, area] });
    }

    updateWorkArea(id: string, data: Partial<WorkArea>) {
        this.update({
            workAreas: this.state.workAreas.map(a =>
                a.id === id ? { ...a, ...data } : a
            ),
        });
    }

    deleteWorkArea(id: string) {
        this.update({
            workAreas: this.state.workAreas.filter(a => a.id !== id),
            assignments: this.state.assignments.filter(a => a.workAreaId !== id)
        });
    }

    moveWorkArea(id: string, direction: 'up' | 'down') {
        const index = this.state.workAreas.findIndex(a => a.id === id);
        if (index === -1) return;
        const newAreas = [...this.state.workAreas];
        if (direction === 'up' && index > 0) {
            [newAreas[index - 1], newAreas[index]] = [newAreas[index], newAreas[index - 1]];
        } else if (direction === 'down' && index < newAreas.length - 1) {
            [newAreas[index + 1], newAreas[index]] = [newAreas[index], newAreas[index + 1]];
        }
        this.update({ workAreas: newAreas });
    }

    // ----- Skills -----
    addSkill(skill: Skill) {
        this.update({ skills: [...this.state.skills, skill] });
    }

    updateSkill(id: string, data: Partial<Skill>) {
        this.update({
            skills: this.state.skills.map(s =>
                s.id === id ? { ...s, ...data } : s
            ),
        });
    }

    deleteSkill(id: string) {
        // Also remove from employees and work areas
        this.update({
            skills: this.state.skills.filter(s => s.id !== id),
            employees: this.state.employees.map(e => ({
                ...e,
                skills: e.skills.filter(sid => sid !== id),
            })),
            workAreas: this.state.workAreas.map(a => ({
                ...a,
                requiredSkills: a.requiredSkills.filter(sid => sid !== id),
            })),
        });
    }

    // ----- Assignments -----
    setAssignments(assignments: Assignment[]) {
        this.update({ assignments });
    }

    addAssignment(assignment: Assignment) {
        this.update({ assignments: [...this.state.assignments, assignment] });
    }

    updateAssignment(id: string, data: Partial<Assignment>) {
        this.update({
            assignments: this.state.assignments.map(a =>
                a.id === id ? { ...a, ...data } : a
            ),
        });
    }

    deleteAssignment(id: string) {
        this.update({
            assignments: this.state.assignments.filter(a => a.id !== id),
        });
    }

    toggleAssignmentLock(id: string) {
        const assignment = this.state.assignments.find(a => a.id === id);
        if (assignment) {
            this.updateAssignment(id, { isLocked: !assignment.isLocked });
        }
    }

    // ----- Absences -----
    addAbsence(absence: Absence) {
        this.update({ absences: [...this.state.absences, absence] });
    }

    updateAbsence(id: string, data: Partial<Absence>) {
        this.update({
            absences: this.state.absences.map(a =>
                a.id === id ? { ...a, ...data } : a
            ),
        });
    }

    deleteAbsence(id: string) {
        this.update({
            absences: this.state.absences.filter(a => a.id !== id),
        });
    }

    // ----- Closures -----
    addClosure(closure: PracticeClosure) {
        this.update({ closures: [...this.state.closures, closure] });
    }

    updateClosure(id: string, data: Partial<PracticeClosure>) {
        this.update({
            closures: this.state.closures.map(c =>
                c.id === id ? { ...c, ...data } : c
            ),
        });
    }

    deleteClosure(id: string) {
        this.update({
            closures: this.state.closures.filter(c => c.id !== id),
        });
    }

    // ----- Reset -----
    resetAll() {
        localStorage.removeItem(STORAGE_KEY);
        this.state = {
            employees: [],
            workAreas: seedWorkAreas.map(a => ({ ...a, id: uuidv4() })),
            skills: seedSkills.map(s => ({ ...s, id: uuidv4() })),
            assignments: [],
            absences: [],
            closures: [],
            activeView: 'dashboard',
            slotSettings: defaultSlotSettings,
        };
        this.persist();
        this.listeners.forEach(l => l());
    }

    // ----- Backup / Restore -----
    exportData(): string {
        const exportPayload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            data: {
                employees: this.state.employees,
                workAreas: this.state.workAreas,
                skills: this.state.skills,
                assignments: this.state.assignments,
                absences: this.state.absences,
                closures: this.state.closures,
            },
        };
        return JSON.stringify(exportPayload, null, 2);
    }

    importData(jsonString: string): { success: boolean; message: string } {
        try {
            const parsed = JSON.parse(jsonString);
            if (!parsed.data || !Array.isArray(parsed.data.employees)) {
                return { success: false, message: 'Ungültiges Dateiformat. Erwartete Struktur nicht gefunden.' };
            }
            this.update({
                employees: parsed.data.employees || [],
                workAreas: parsed.data.workAreas || [],
                skills: parsed.data.skills || [],
                assignments: parsed.data.assignments || [],
                absences: parsed.data.absences || [],
                closures: parsed.data.closures || [],
            });
            return { success: true, message: `Import erfolgreich: ${parsed.data.employees.length} Mitarbeiter geladen.` };
        } catch {
            return { success: false, message: 'Die Datei konnte nicht gelesen werden. Bitte prüfen Sie das JSON-Format.' };
        }
    }
}

export const store = new Store();

export function useStore(): AppState {
    return useSyncExternalStore(
        (cb) => store.subscribe(cb),
        () => store.getState()
    );
}
