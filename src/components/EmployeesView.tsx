import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Plus, Pencil, Trash2, X, Check, Search, UserPlus,
    Clock, Briefcase, ChevronDown, ChevronUp, Home,
    Heart, ThumbsUp, ThumbsDown, Ban
} from 'lucide-react';
import {
    Employee, DEFAULT_AVAILABILITY, DAY_LABELS, DAY_FULL_LABELS,
    AVAILABILITY_OPTIONS, WeeklyAvailability, DayAvailability,
    PreferenceLevel, WorkArea, AssignmentRule, WeeklyWorkTimes, DayWorkTime
} from '../types';
import { store, useStore } from '../store';
import { v4 as uuidv4 } from 'uuid';

interface EmployeeFormData {
    firstName: string;
    lastName: string;
    status: 'fulltime' | 'parttime';
    targetHoursPerWeek: number;
    vacationDaysTotal: number;
    vacationDaysCarryover: number;
    vacationDaysUsed: number;
    overtimeBalance: number;
    skills: string[];
    availability: WeeklyWorkTimes;
    isActive: boolean;
    canHomeoffice: boolean;
    areaPreferences: Record<string, PreferenceLevel>;
    rules: AssignmentRule[];
    notes: string;
}

const emptyForm: EmployeeFormData = {
    firstName: '',
    lastName: '',
    status: 'fulltime',
    targetHoursPerWeek: 40,
    vacationDaysTotal: 30,
    vacationDaysCarryover: 0,
    vacationDaysUsed: 0,
    overtimeBalance: 0,
    skills: [],
    availability: JSON.parse(JSON.stringify(DEFAULT_AVAILABILITY)),
    isActive: true,
    canHomeoffice: false,
    areaPreferences: {},
    rules: [],
    notes: '',
};

export function EmployeesView() {
    const { employees, skills, workAreas, absences } = useStore();
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<EmployeeFormData>(emptyForm);
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

    const filteredEmployees = employees
        .filter(e => {
            if (filterStatus === 'active') return e.isActive;
            if (filterStatus === 'inactive') return !e.isActive;
            return true;
        })
        .filter(e => (e.firstName + ' ' + e.lastName).toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
            return a.lastName.localeCompare(b.lastName);
        });

    function calculateVacationDaysUsed(employee: Employee) {
        let used = employee.vacationDaysUsed || 0;
        const empAbsences = absences.filter(a => a.employeeId === employee.id && a.type === 'vacation' && a.status === 'approved');

        empAbsences.forEach(absence => {
            let current = new Date(absence.startDate + "T12:00:00");
            const end = new Date(absence.endDate + "T12:00:00");

            while (current <= end) {
                const dayOfWeek = current.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const dayMap: Record<number, keyof WeeklyAvailability> = {
                        1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday'
                    };
                    const dayName = dayMap[dayOfWeek];
                    if (dayName && employee.availability[dayName]?.isWorking) {
                        used += 1;
                    }
                }
                current.setDate(current.getDate() + 1);
            }
        });
        return used;
    }

    function openCreate() {
        setForm(emptyForm);
        setEditingId(null);
        setShowModal(true);
    }

    function openEdit(emp: Employee) {
        setForm({
            firstName: emp.firstName,
            lastName: emp.lastName,
            status: emp.status,
            targetHoursPerWeek: emp.targetHoursPerWeek,
            vacationDaysTotal: emp.vacationDaysTotal,
            vacationDaysCarryover: emp.vacationDaysCarryover,
            vacationDaysUsed: emp.vacationDaysUsed,
            overtimeBalance: emp.overtimeBalance,
            skills: [...emp.skills],
            availability: JSON.parse(JSON.stringify(emp.availability)),
            isActive: emp.isActive,
            canHomeoffice: emp.canHomeoffice,
            areaPreferences: emp.areaPreferences || {},
            rules: emp.rules || [],
            notes: emp.notes,
        });
        setEditingId(emp.id);
        setShowModal(true);
    }

    function handleSave() {
        if (!form.firstName.trim() || !form.lastName.trim()) return;

        if (editingId) {
            store.updateEmployee(editingId, form);
        } else {
            store.addEmployee({
                id: uuidv4(),
                ...form,
            });
        }
        setShowModal(false);
    }

    function handleDelete(id: string) {
        store.deleteEmployee(id);
        setDeleteConfirm(null);
    }

    function toggleSkill(skillId: string) {
        setForm(prev => ({
            ...prev,
            skills: prev.skills.includes(skillId)
                ? prev.skills.filter(s => s !== skillId)
                : [...prev.skills, skillId],
        }));
    }

    function setAvailabilityDayWork(day: keyof WeeklyAvailability, field: keyof DayWorkTime, value: any) {
        setForm(prev => ({
            ...prev,
            availability: {
                ...prev.availability,
                [day]: {
                    ...prev.availability[day],
                    [field]: value
                }
            },
        }));
    }

    function setPreference(areaId: string, level: PreferenceLevel) {
        setForm(prev => ({
            ...prev,
            areaPreferences: {
                ...prev.areaPreferences,
                [areaId]: level
            }
        }));
    }

    function addRule(workAreaId: string, type: 'min' | 'max', count: number) {
        const newRule: AssignmentRule = {
            id: uuidv4(),
            workAreaId,
            type,
            count
        };
        setForm(prev => ({
            ...prev,
            rules: [...prev.rules, newRule]
        }));
    }

    function removeRule(ruleId: string) {
        setForm(prev => ({
            ...prev,
            rules: prev.rules.filter(r => r.id !== ruleId)
        }));
    }

    const activeCount = employees.filter(e => e.isActive).length;
    const inactiveCount = employees.filter(e => !e.isActive).length;

    const availabilityColor = (val: DayWorkTime) => {
        if (!val.isWorking) return 'text-rose-400 bg-rose-500/15';
        return 'text-emerald-400 bg-emerald-500/15';
    };

    const availabilityShort = (val: DayWorkTime) => {
        if (!val.isWorking) return '—';
        return `${val.start}-${val.end}`;
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Mitarbeiter</h2>
                    <p className="text-slate-400 text-sm">
                        {employees.length} gesamt · {activeCount} aktiv · {inactiveCount} inaktiv
                    </p>
                </div>
                <button id="btn-add-employee" className="btn-primary" onClick={openCreate}>
                    <UserPlus size={16} />
                    Neuer Mitarbeiter
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Mitarbeiter suchen..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-field pl-10"
                        id="search-employees"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'active', 'inactive'] as const).map(status => (
                        <button
                            key={status}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterStatus === status
                                ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'
                                }`}
                            onClick={() => setFilterStatus(status)}
                        >
                            {status === 'all' ? 'Alle' : status === 'active' ? '✓ Aktiv' : '✗ Inaktiv'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Employee List */}
            {filteredEmployees.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/30 flex items-center justify-center mx-auto">
                        <UserPlus size={28} className="text-slate-600" />
                    </div>
                    <p className="text-slate-400 mt-4 text-sm">
                        {searchQuery ? 'Keine Mitarbeiter gefunden.' : 'Noch keine Mitarbeiter angelegt.'}
                    </p>
                    {!searchQuery && filterStatus === 'all' && (
                        <button className="btn-primary mt-4" onClick={openCreate}>
                            <UserPlus size={16} />
                            Ersten Mitarbeiter anlegen
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredEmployees.map((emp, i) => {
                        const used = calculateVacationDaysUsed(emp);
                        const remaining = emp.vacationDaysTotal + emp.vacationDaysCarryover - used;
                        const isExpanded = expandedId === emp.id;

                        return (
                            <div
                                key={emp.id}
                                className="glass-card rounded-xl overflow-hidden animate-fade-in"
                                style={{ animationDelay: `${i * 40}ms` }}
                            >
                                {/* Main Row */}
                                <div className="p-4 flex items-center gap-4">
                                    {/* Avatar */}
                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold ${emp.isActive
                                        ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white'
                                        : 'bg-slate-700/50 text-slate-400'
                                        }`}>
                                        {emp.firstName[0]}{emp.lastName[0]}
                                    </div>

                                    {/* Name & Status */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-white text-sm truncate">
                                                {emp.firstName} {emp.lastName}
                                            </h4>
                                            {!emp.isActive && <span className="badge bg-slate-700/50 text-slate-400 border-slate-600/30">Inaktiv</span>}
                                            {emp.canHomeoffice && (
                                                <span className="badge badge-success">
                                                    <Home size={10} />
                                                    HO
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className={`text-xs ${emp.status === 'fulltime' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                {emp.status === 'fulltime' ? 'Vollzeit' : 'Teilzeit'} · {emp.targetHoursPerWeek}h/Woche
                                            </span>
                                        </div>
                                    </div>

                                    {/* Quick Stats */}
                                    <div className="hidden md:flex items-center gap-4">
                                        <div className="text-center" title={`Urlaubsanspruch gesamt: ${emp.vacationDaysTotal + emp.vacationDaysCarryover}\nGenommen/Verplant: ${used}`}>
                                            <div className="text-xs text-slate-500">Urlaub Übrig</div>
                                            <div className={`text-sm font-semibold ${remaining > 5 ? 'text-emerald-400' : remaining > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                {remaining}T
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs text-slate-500">Überst.</div>
                                            <div className={`text-sm font-semibold ${emp.overtimeBalance > 0 ? 'text-amber-400' : emp.overtimeBalance < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                                {emp.overtimeBalance > 0 ? '+' : ''}{emp.overtimeBalance}h
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs text-slate-500">Skills</div>
                                            <div className="text-sm font-semibold text-accent-400">{emp.skills.length}</div>
                                        </div>
                                    </div>

                                    {/* Availability Mini */}
                                    <div className="hidden lg:flex items-center gap-1">
                                        {(Object.entries(emp.availability) as [keyof WeeklyAvailability, DayWorkTime][]).map(([day, val]) => (
                                            <div
                                                key={day}
                                                className={`w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${availabilityColor(val)}`}
                                                title={`${DAY_FULL_LABELS[day]}: ${availabilityShort(val)}`}
                                            >
                                                {val.isWorking ? 'Ja' : '—'}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                                            onClick={() => setExpandedId(isExpanded ? null : emp.id)}
                                        >
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                                            onClick={() => openEdit(emp)}
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        {deleteConfirm === emp.id ? (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400"
                                                    onClick={() => handleDelete(emp.id)}
                                                >
                                                    <Check size={14} />
                                                </button>
                                                <button
                                                    className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400"
                                                    onClick={() => setDeleteConfirm(null)}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                                onClick={() => setDeleteConfirm(emp.id)}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 pt-0 border-t border-slate-700/30 animate-fade-in">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                            {/* Vacation */}
                                            <div className="space-y-2">
                                                <h5 className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                                                    <Briefcase size={12} />
                                                    Urlaub
                                                </h5>
                                                <div className="space-y-1.5 text-xs">
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Anspruch</span>
                                                        <span className="text-slate-300">{emp.vacationDaysTotal} Tage</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Resturlaub Vorjahr</span>
                                                        <span className="text-slate-300">{emp.vacationDaysCarryover} Tage</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-slate-500">Verplant/Genommen</span>
                                                        <span className="text-slate-300">{used} Tage</span>
                                                    </div>
                                                    <div className="flex justify-between pt-1 border-t border-slate-700/50">
                                                        <span className="text-slate-400 font-medium">Verbleibend</span>
                                                        <span className={`font-bold ${remaining > 5 ? 'text-emerald-400' : remaining > 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                            {remaining} Tage
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Skills */}
                                            <div className="space-y-2">
                                                <h5 className="text-xs font-semibold text-slate-400">Fähigkeiten</h5>
                                                {emp.skills.length === 0 ? (
                                                    <p className="text-xs text-slate-600">Keine Skills zugewiesen</p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {emp.skills.map(sid => {
                                                            const skill = skills.find(s => s.id === sid);
                                                            return skill ? (
                                                                <span key={sid} className="badge badge-skill text-[10px]">{skill.name}</span>
                                                            ) : null;
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Availability */}
                                            <div className="space-y-2">
                                                <h5 className="text-xs font-semibold text-slate-400">Verfügbarkeit</h5>
                                                <div className="space-y-1">
                                                    {(Object.entries(emp.availability) as [keyof WeeklyAvailability, DayWorkTime][]).map(([day, val]) => (
                                                        <div key={day} className="flex items-center justify-between text-xs">
                                                            <span className="text-slate-500">{DAY_FULL_LABELS[day]}</span>
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${availabilityColor(val)}`}>
                                                                {availabilityShort(val)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Rules & Preferences Preview */}
                                        {(emp.rules?.length > 0 || Object.keys(emp.areaPreferences).some(k => emp.areaPreferences[k] !== 'neutral')) && (
                                            <div className="mt-4 pt-4 border-t border-slate-700/30">
                                                <h5 className="text-xs font-semibold text-slate-400 mb-2">Regeln & Wichtige Präferenzen</h5>
                                                <div className="flex flex-wrap gap-2">
                                                    {emp.rules?.map(rule => {
                                                        const area = workAreas.find(a => a.id === rule.workAreaId);
                                                        return area ? (
                                                            <span key={rule.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400">
                                                                <Briefcase size={10} />
                                                                {rule.type === 'min' ? 'Mind.' : 'Max.'} {rule.count}x {area.name}
                                                            </span>
                                                        ) : null;
                                                    })}
                                                    {Object.entries(emp.areaPreferences).filter(([_, p]) => p !== 'neutral').map(([aid, p]) => {
                                                        const area = workAreas.find(a => a.id === aid);
                                                        if (!area) return null;
                                                        let color = 'text-slate-400';
                                                        let icon = null;
                                                        if (p === 'preferred') { color = 'text-pink-400 border-pink-500/20 bg-pink-500/5'; icon = '❤️'; }
                                                        if (p === 'dislike') { color = 'text-slate-500 border-slate-600/30 bg-slate-800'; icon = '👎'; }
                                                        if (p === 'avoid') { color = 'text-rose-500 border-rose-500/20 bg-rose-500/5'; icon = '🚫'; }
                                                        return (
                                                            <span key={aid} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] ${color}`}>
                                                                {icon} {area.name}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Notes */}
                                        {emp.notes && (
                                            <div className="mt-3 p-2.5 rounded-lg bg-slate-900/40 border border-slate-700/20">
                                                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Notizen</span>
                                                <p className="text-xs text-slate-400 mt-0.5">{emp.notes}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content min-h-[600px] flex flex-col" style={{ width: '95vw', maxWidth: '1400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-bold text-white">
                                {editingId ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}
                            </h3>
                            <button
                                className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400"
                                onClick={() => setShowModal(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="modal-body flex-1">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
                                {/* LEFT COLUMN: Stammdaten & Vertrag */}
                                <div className="lg:col-span-3 space-y-6">
                                    {/* Linke Spalte Header */}
                                    <div className="flex items-center gap-2 text-primary-400 border-b border-white/5 pb-2">
                                        <Briefcase size={16} />
                                        <h4 className="font-semibold text-sm uppercase tracking-wider">Vertragsdaten</h4>
                                    </div>

                                    {/* Basic Info */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Vorname *</label>
                                            <input
                                                type="text"
                                                value={form.firstName}
                                                onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                                                className="input-field"
                                                placeholder="Vorname"
                                                autoFocus
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Nachname *</label>
                                            <input
                                                type="text"
                                                value={form.lastName}
                                                onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                                                className="input-field"
                                                placeholder="Nachname"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                                            <select
                                                value={form.status}
                                                onChange={e => setForm(prev => ({
                                                    ...prev,
                                                    status: e.target.value as 'fulltime' | 'parttime',
                                                    targetHoursPerWeek: e.target.value === 'fulltime' ? 40 : prev.targetHoursPerWeek,
                                                }))}
                                                className="input-field"
                                            >
                                                <option value="fulltime">Vollzeit</option>
                                                <option value="parttime">Teilzeit</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-slate-400 mb-1">Stunden / Woche</label>
                                            <input
                                                type="number"
                                                value={form.targetHoursPerWeek}
                                                onChange={e => setForm(prev => ({ ...prev, targetHoursPerWeek: Number(e.target.value) }))}
                                                className="input-field"
                                                min={1}
                                                max={48}
                                            />
                                        </div>
                                    </div>

                                    {/* Toggles */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/30">
                                            <div>
                                                <div className="text-xs font-medium text-white">Aktiv</div>
                                            </div>
                                            <button
                                                className={`toggle-switch scale-90 ${form.isActive ? 'active' : ''}`}
                                                onClick={() => setForm(prev => ({ ...prev, isActive: !prev.isActive }))}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/30">
                                            <div>
                                                <div className="text-xs font-medium text-white flex items-center gap-1.5">
                                                    <Home size={12} />
                                                    Homeoffice
                                                </div>
                                            </div>
                                            <button
                                                className={`toggle-switch scale-90 ${form.canHomeoffice ? 'active' : ''}`}
                                                onClick={() => setForm(prev => ({ ...prev, canHomeoffice: !prev.canHomeoffice }))}
                                            />
                                        </div>
                                    </div>

                                    {/* Vacation & Overtime */}
                                    <div className="pt-2">
                                        <div className="flex items-center gap-2 text-primary-400 border-b border-white/5 pb-2 mb-3">
                                            <Clock size={16} />
                                            <h4 className="font-semibold text-sm uppercase tracking-wider">Urlaub & Zeit</h4>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-400 mb-1">Urlaubsanspruch</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={form.vacationDaysTotal}
                                                        onChange={e => setForm(prev => ({ ...prev, vacationDaysTotal: Number(e.target.value) }))}
                                                        className="input-field"
                                                        min={0}
                                                    />
                                                    <span className="text-[10px] text-slate-500 whitespace-nowrap">Tage/Jahr</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-400 mb-1">Überstunden</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={form.overtimeBalance}
                                                        onChange={e => setForm(prev => ({ ...prev, overtimeBalance: Number(e.target.value) }))}
                                                        className="input-field"
                                                        step={0.5}
                                                    />
                                                    <span className="text-[10px] text-slate-500 whitespace-nowrap">Stunden</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-400 mb-1">Resturlaub (VJ)</label>
                                                <input
                                                    type="number"
                                                    value={form.vacationDaysCarryover}
                                                    onChange={e => setForm(prev => ({ ...prev, vacationDaysCarryover: Number(e.target.value) }))}
                                                    className="input-field"
                                                    min={0}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-400 mb-1">Genommen</label>
                                                <input
                                                    type="number"
                                                    value={form.vacationDaysUsed}
                                                    onChange={e => setForm(prev => ({ ...prev, vacationDaysUsed: Number(e.target.value) }))}
                                                    className="input-field"
                                                    min={0}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: Skills & Availability */}
                                <div className="lg:col-span-5 space-y-5">
                                    {/* Rechte Spalte Header */}
                                    <div className="flex items-center gap-2 text-accent-400 border-b border-white/5 pb-2">
                                        <Check size={16} />
                                        <h4 className="font-semibold text-sm uppercase tracking-wider">Einsatzplanung</h4>
                                    </div>

                                    {/* Skills */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-2">Fähigkeiten</label>
                                        <div className="bg-slate-900/30 rounded-xl p-3 border border-slate-700/30">
                                            {skills.length === 0 ? (
                                                <p className="text-xs text-slate-600">Keine Skills definiert.</p>
                                            ) : (
                                                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                                                    {skills.map(skill => (
                                                        <button
                                                            key={skill.id}
                                                            className={`chip py-0.5 px-2 text-[10px] ${form.skills.includes(skill.id)
                                                                ? '!bg-accent-500/25 !border-accent-500/40 opacity-100'
                                                                : 'opacity-50 hover:opacity-75'
                                                                }`}
                                                            onClick={() => toggleSkill(skill.id)}
                                                        >
                                                            {form.skills.includes(skill.id) && <Check size={10} />}
                                                            {skill.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Availability */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-2">Wöchentliche Verfügbarkeit</label>
                                        <div className="day-grid">
                                            {(Object.keys(form.availability) as (keyof WeeklyAvailability)[]).map(day => (
                                                <div key={day} className={`space-y-1 p-2 rounded-lg border ${form.availability[day].isWorking ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-900/30 border-slate-800/50'}`}>
                                                    <label className="block text-[10px] font-medium text-center text-slate-400 uppercase mb-2">
                                                        {DAY_FULL_LABELS[day].substring(0, 2)}
                                                    </label>
                                                    <div className="flex items-center justify-center mb-2">
                                                        <input type="checkbox" checked={form.availability[day].isWorking} onChange={e => setAvailabilityDayWork(day, 'isWorking', e.target.checked)} className="cursor-pointer" />
                                                    </div>
                                                    <input type="time" disabled={!form.availability[day].isWorking} value={form.availability[day].start} onChange={e => setAvailabilityDayWork(day, 'start', e.target.value)} className="input-field text-[10px] text-center !py-1 !px-0 h-6 mb-1 disabled:opacity-30 border-slate-700 bg-slate-900" />
                                                    <input type="time" disabled={!form.availability[day].isWorking} value={form.availability[day].end} onChange={e => setAvailabilityDayWork(day, 'end', e.target.value)} className="input-field text-[10px] text-center !py-1 !px-0 h-6 disabled:opacity-30 border-slate-700 bg-slate-900" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5">Notizen</label>
                                        <textarea
                                            value={form.notes}
                                            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                                            className="input-field resize-none text-xs"
                                            rows={2}
                                            placeholder="Interner Vermerk..."
                                        />
                                    </div>
                                </div>

                                {/* RIGHT COLUMN: Preferences */}
                                <div className="lg:col-span-4 space-y-6">
                                    <div className="flex items-center gap-2 text-rose-400 border-b border-white/5 pb-2">
                                        <Heart size={16} />
                                        <h4 className="font-semibold text-sm uppercase tracking-wider">Präferenzen</h4>
                                    </div>

                                    <div className="grid gap-3">
                                        {workAreas.map(area => {
                                            const pref = form.areaPreferences[area.id] || 'neutral';
                                            return (
                                                <div key={area.id} className="p-3 bg-slate-900/40 rounded-xl border border-slate-700/30 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-lg bg-slate-800/80">
                                                            {area.icon}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-slate-200">{area.name}</div>
                                                            <div className="text-[10px] text-slate-500">{pref === 'preferred' ? 'Bevorzugt' : pref === 'avoid' ? 'Vermeiden' : pref === 'dislike' ? 'Ungern' : 'Neutral'}</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex bg-slate-900/80 rounded-lg p-0.5 border border-slate-700/50">
                                                        <button
                                                            onClick={() => setPreference(area.id, 'preferred')}
                                                            className={`p-1.5 rounded-md transition-all ${pref === 'preferred' ? 'bg-rose-500/20 text-rose-400 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                                                            title="Bevorzugt"
                                                        >
                                                            <Heart size={14} className={pref === 'preferred' ? 'fill-current' : ''} />
                                                        </button>
                                                        <button
                                                            onClick={() => setPreference(area.id, 'neutral')}
                                                            className={`p-1.5 rounded-md transition-all ${pref === 'neutral' ? 'bg-slate-700/50 text-slate-300 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                                                            title="Neutral"
                                                        >
                                                            <ThumbsUp size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => setPreference(area.id, 'dislike')}
                                                            className={`p-1.5 rounded-md transition-all ${pref === 'dislike' ? 'bg-amber-500/20 text-amber-400 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                                                            title="Ungern"
                                                        >
                                                            <ThumbsDown size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => setPreference(area.id, 'avoid')}
                                                            className={`p-1.5 rounded-md transition-all ${pref === 'avoid' ? 'bg-rose-500/20 text-rose-500 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}
                                                            title="Vermeiden"
                                                        >
                                                            <Ban size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {workAreas.length === 0 && (
                                            <div className="text-center p-8 text-slate-500 text-xs border border-dashed border-slate-700/50 rounded-xl">
                                                Keine Arbeitsbereiche definiert.
                                            </div>
                                        )}
                                    </div>

                                    {/* Rules Section */}
                                    <div className="pt-4 border-t border-white/5">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2 text-amber-400">
                                                <Briefcase size={16} />
                                                <h4 className="font-semibold text-sm uppercase tracking-wider">Regeln</h4>
                                            </div>
                                            <button
                                                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded border border-slate-600/50 transition-colors"
                                                onClick={() => {
                                                    // Simple prompt for now, or expand inline logic later
                                                    // But wait, prompt is ugly. Let's add a small inline form if we can.
                                                    // Since I can't easily add state here inside the render block for the "adding" temporary state without modifying the component body properly, 
                                                    // I will assume I added `isAddingRule` state or I will just add a dummy rule directly and let user edit it? No.
                                                    // Let's us a simple approach: Just add a default rule and let them delete it? No.
                                                    // I'll keep it simple: Add a new rule for the first available area.
                                                    if (workAreas.length > 0) addRule(workAreas[0].id, 'min', 1);
                                                }}
                                            >
                                                + Regel
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {form.rules.map(rule => {
                                                const area = workAreas.find(a => a.id === rule.workAreaId);
                                                if (!area) return null;
                                                return (
                                                    <div key={rule.id} className="flex items-center gap-2 bg-slate-900/40 p-2 rounded-lg border border-slate-700/30 text-xs">
                                                        <select
                                                            className="bg-transparent text-slate-300 border-none outline-none font-medium p-0 w-24 truncate"
                                                            value={rule.workAreaId}
                                                            onChange={e => {
                                                                const updated = form.rules.map(r => r.id === rule.id ? { ...r, workAreaId: e.target.value } : r);
                                                                setForm(prev => ({ ...prev, rules: updated }));
                                                            }}
                                                        >
                                                            {workAreas.map(wa => (
                                                                <option key={wa.id} value={wa.id} className="bg-slate-800 text-slate-200">
                                                                    {wa.name}
                                                                </option>
                                                            ))}
                                                        </select>

                                                        <select
                                                            className="bg-slate-800/50 text-amber-400 border border-slate-700/50 rounded px-1 py-0.5 outline-none"
                                                            value={rule.type}
                                                            onChange={e => {
                                                                const updated = form.rules.map(r => r.id === rule.id ? { ...r, type: e.target.value as 'min' | 'max' } : r);
                                                                setForm(prev => ({ ...prev, rules: updated }));
                                                            }}
                                                        >
                                                            <option value="min">Mind.</option>
                                                            <option value="max">Max.</option>
                                                        </select>

                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="number"
                                                                className="w-8 bg-slate-800/50 text-center text-slate-200 border border-slate-700/50 rounded py-0.5 outline-none"
                                                                min={1}
                                                                max={10}
                                                                value={rule.count}
                                                                onChange={e => {
                                                                    const val = parseInt(e.target.value) || 1;
                                                                    const updated = form.rules.map(r => r.id === rule.id ? { ...r, count: val } : r);
                                                                    setForm(prev => ({ ...prev, rules: updated }));
                                                                }}
                                                            />
                                                            <span className="text-slate-500">x / Wo.</span>
                                                        </div>

                                                        <button
                                                            className="ml-auto text-slate-500 hover:text-rose-400"
                                                            onClick={() => removeRule(rule.id)}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                            {form.rules.length === 0 && (
                                                <p className="text-[10px] text-slate-600 italic px-2">Keine Regeln definiert.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setShowModal(false)}>
                                Abbrechen
                            </button>
                            <button
                                className="btn-success"
                                onClick={handleSave}
                                disabled={!form.firstName.trim() || !form.lastName.trim()}
                            >
                                <Check size={16} />
                                {editingId ? 'Speichern' : 'Anlegen'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
