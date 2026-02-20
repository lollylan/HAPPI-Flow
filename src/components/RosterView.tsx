import { useState, useMemo } from 'react';
import { useStore, store } from '../store';
import { Assignment, WeeklyAvailability, Employee } from '../types';
import { Sparkles, RefreshCw, X, AlertTriangle, Lock, Unlock, Plus, Trash2, User, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export function RosterView() {
    const { employees, workAreas, assignments, absences, slotSettings } = useStore();
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<{ areaId: string, day: keyof WeeklyAvailability, slot: 'morning' | 'noon' | 'afternoon' } | null>(null);
    const [rosterWarnings, setRosterWarnings] = useState<string[]>([]);

    // State for Week Selection (Default: This week's Monday)
    const [currentWeekStart, setCurrentWeekStart] = useState(() => {
        const d = new Date();
        const day = d.getDay(); // 0 (Sun) to 6 (Sat)
        // Adjust to Monday. If Sun(0), go back 6 days to prev Mon. If Mon(1), 0 diff. If Tue(2), -1 diff.
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
    });

    const days: (keyof WeeklyAvailability)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const timeSlots: ('morning' | 'noon' | 'afternoon')[] = ['morning', 'noon', 'afternoon'];
    const DAY_LABELS: Record<string, string> = {
        monday: 'Montag',
        tuesday: 'Dienstag',
        wednesday: 'Mittwoch',
        thursday: 'Donnerstag',
        friday: 'Freitag'
    };

    // Helper to get Date object from "YYYY-MM-DD"
    const getWeekDate = (offsetDays: number) => {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() + offsetDays);
        // Manual YYYY-MM-DD
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    // Map weekday to date string for current view
    const weekDates = useMemo(() => {
        return {
            monday: getWeekDate(0),
            tuesday: getWeekDate(1),
            wednesday: getWeekDate(2),
            thursday: getWeekDate(3),
            friday: getWeekDate(4),
        };
    }, [currentWeekStart]);

    // Navigation
    function prevWeek() {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() - 7);
        setCurrentWeekStart(d.toISOString().split('T')[0]);
    }

    function nextWeek() {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() + 7);
        setCurrentWeekStart(d.toISOString().split('T')[0]);
    }

    // Jump to "Today"
    function jumpToToday() {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        setCurrentWeekStart(monday.toISOString().split('T')[0]);
    }

    function getAbsenceStatus(empId: string, dateStr: string) {
        const absence = absences.find(a =>
            a.employeeId === empId &&
            a.startDate <= dateStr &&
            a.endDate >= dateStr
        );
        return absence ? absence.status : null;
    }

    // Filter assignments for current view
    const currentAssignments = assignments.filter(a => {
        if (a.date) {
            return a.date >= weekDates.monday && a.date <= weekDates.friday;
        }
        return false;
    });

    // Helper to find assignment needed for cell
    function getAssignment(areaId: string, day: keyof WeeklyAvailability, slot: 'morning' | 'noon' | 'afternoon') {
        const date = weekDates[day];
        return currentAssignments.find(a =>
            a.workAreaId === areaId &&
            a.timeSlot === slot &&    // Match Slot
            (a.date === date)         // Match Date
        );
    }

    function generateRoster() {
        setIsGenerating(true);
        setRosterWarnings([]);
        setTimeout(() => {
            const warnings: string[] = [];
            // Keep locked assignments for THIS week
            const lockedAssignments = currentAssignments.filter(a => a.isLocked);
            const newAssignmentsForWeek: Assignment[] = [...lockedAssignments];

            // Setup Rule Counts (Global or Weekly)
            const ruleCounts = new Map<string, number>();
            for (const ass of lockedAssignments) {
                const key = `${ass.employeeId}-${ass.workAreaId}`;
                ruleCounts.set(key, (ruleCounts.get(key) || 0) + 1);
            }

            // Iterate days of THIS week
            for (const day of days) {
                const dateStr = weekDates[day];

                const assignedSets = {
                    morning: new Set<string>(),
                    noon: new Set<string>(),
                    afternoon: new Set<string>()
                };

                // Pre-fill locked
                for (const ass of lockedAssignments) {
                    if (ass.date === dateStr) {
                        assignedSets[ass.timeSlot].add(ass.employeeId);
                    }
                }

                for (const slot of timeSlots) {
                    const assignedSet = assignedSets[slot];

                    const availableForSlot = employees.filter(emp => {
                        if (!emp.isActive) return false;
                        const avail = emp.availability[day];
                        if (!avail || !avail.isWorking) return false;

                        const slotDef = slotSettings[day][slot];
                        if (!slotDef || avail.start > slotDef.start || avail.end <= slotDef.start) return false;

                        const absStatus = getAbsenceStatus(emp.id, dateStr);
                        if (absStatus === 'approved') return false;
                        return true;
                    });

                    const areaCounts = new Map<string, number>();
                    workAreas.forEach(a => {
                        const count = lockedAssignments.filter(ass => ass.workAreaId === a.id && ass.date === dateStr && ass.timeSlot === slot).length;
                        areaCounts.set(a.id, count);
                    });

                    let madeAssignment = true;
                    while (madeAssignment) {
                        madeAssignment = false;

                        const sortedAreas = [...workAreas].filter(a => a.operatingHours?.[day]?.includes(slot)).sort((a, b) => {
                            const aCount = areaCounts.get(a.id) || 0;
                            const bCount = areaCounts.get(b.id) || 0;
                            const aNeedsMin = aCount < a.minStaff;
                            const bNeedsMin = bCount < b.minStaff;

                            if (aNeedsMin && !bNeedsMin) return -1;
                            if (!aNeedsMin && bNeedsMin) return 1;

                            if (a.isCritical && !b.isCritical) return -1;
                            if (!a.isCritical && b.isCritical) return 1;

                            const urgencyA = employees.reduce((sum, emp) => {
                                if (!emp.isActive) return sum;
                                const rule = emp.rules?.find(r => r.workAreaId === a.id && r.type === 'min');
                                const current = ruleCounts.get(`${emp.id}-${a.id}`) || 0;
                                return (rule && current < rule.count) ? sum + 1 : sum;
                            }, 0);
                            const urgencyB = employees.reduce((sum, emp) => {
                                if (!emp.isActive) return sum;
                                const rule = emp.rules?.find(r => r.workAreaId === b.id && r.type === 'min');
                                const current = ruleCounts.get(`${emp.id}-${b.id}`) || 0;
                                return (rule && current < rule.count) ? sum + 1 : sum;
                            }, 0);
                            if (urgencyA !== urgencyB) return urgencyB - urgencyA;

                            return aCount - bCount;
                        });

                        for (const area of sortedAreas) {
                            const candidates = availableForSlot.filter(emp => {
                                if (assignedSet.has(emp.id)) return false;

                                if (area.requiredSkills.length > 0) {
                                    if (!area.requiredSkills.every(s => emp.skills.includes(s))) return false;
                                }

                                const currentCount = ruleCounts.get(`${emp.id}-${area.id}`) || 0;
                                const maxRule = emp.rules?.find(r => r.workAreaId === area.id && r.type === 'max');
                                if (maxRule && currentCount >= maxRule.count) return false;

                                return true;
                            });

                            if (candidates.length > 0) {
                                const scored = candidates.map(emp => {
                                    let score = 0;
                                    const currentCount = ruleCounts.get(`${emp.id}-${area.id}`) || 0;
                                    const absStatus = getAbsenceStatus(emp.id, dateStr);
                                    if (absStatus === 'requested') score -= 10000;

                                    const minRule = emp.rules?.find(r => r.workAreaId === area.id && r.type === 'min');
                                    if (minRule && currentCount < minRule.count) score += 5000;

                                    const pref = emp.areaPreferences?.[area.id] || 'neutral';
                                    if (pref === 'preferred') score += 20;
                                    if (pref === 'neutral') score += 10;
                                    if (pref === 'dislike') score -= 10;
                                    if (pref === 'avoid') score -= 50;

                                    // Distribute evenly if area is already fully staffed
                                    if (areaCounts.get(area.id)! >= area.minStaff) {
                                        score -= 5;
                                    }

                                    return { emp, score };
                                });

                                scored.sort((a, b) => b.score - a.score);
                                const winner = scored[0].emp;

                                newAssignmentsForWeek.push({
                                    id: uuidv4(),
                                    workAreaId: area.id,
                                    employeeId: winner.id,
                                    day,
                                    date: dateStr,
                                    timeSlot: slot,
                                    isLocked: false
                                });

                                assignedSet.add(winner.id);
                                const key = `${winner.id}-${area.id}`;
                                ruleCounts.set(key, (ruleCounts.get(key) || 0) + 1);
                                areaCounts.set(area.id, areaCounts.get(area.id)! + 1);

                                madeAssignment = true;
                                break;
                            }
                        }
                    }

                    const leftovers = availableForSlot.filter(emp => !assignedSet.has(emp.id));
                    if (leftovers.length > 0) {
                        const names = leftovers.map(emp => `${emp.firstName} ${emp.lastName}`).join(', ');
                        warnings.push(`Am ${DAY_LABELS[day]} (${slot === 'morning' ? 'Vormittag' : slot === 'noon' ? 'Mittag' : 'Nachmittag'}) blieben Mitarbeiter ohne Aufgabe: ${names}`);
                    }
                }
            }

            // Update Store: Remove assignments for this week, add new ones
            const otherAssignments = assignments.filter(a => !(a.date >= weekDates.monday && a.date <= weekDates.friday));
            store.setAssignments([...otherAssignments, ...newAssignmentsForWeek]);
            setRosterWarnings(warnings);
            setIsGenerating(false);
        }, 800);
    }

    function handleAddManual(areaId: string, day: keyof WeeklyAvailability, slot: 'morning' | 'noon' | 'afternoon') {
        setSelectedSlot({ areaId, day, slot });
    }

    function confirmManualAssignment(empId: string) {
        if (!selectedSlot) return;
        const { areaId, day, slot } = selectedSlot;
        const dateStr = weekDates[day];

        // Remove existing in this CELL
        const existing = getAssignment(areaId, day, slot);
        if (existing) {
            store.deleteAssignment(existing.id);
        }

        // Add clash prevention: remove this employee from *any* other assignment in the same slot on this day
        const existingEmpAss = assignments.find(a => a.employeeId === empId && a.date === dateStr && a.timeSlot === slot);
        if (existingEmpAss) {
            store.deleteAssignment(existingEmpAss.id);
        }

        const newAss: Assignment = {
            id: uuidv4(),
            workAreaId: areaId,
            employeeId: empId,
            day: day,
            date: dateStr,
            timeSlot: slot,
            isLocked: true
        };
        store.addAssignment(newAss);
        setSelectedSlot(null);
    }

    function deleteFromSlot(id: string) {
        if (!id) return;
        store.deleteAssignment(id);
    }

    return (
        <div className="animate-fade-in space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Dienstplan</h2>
                    <p className="text-slate-400 text-sm">Automatische Zuweisung mit Regeln & Fixierung</p>
                </div>

                <div className="flex items-center gap-4">
                    {/* Week Picker */}
                    <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <button onClick={prevWeek} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
                        <div className="flex flex-col items-center w-40 px-2 cursor-pointer relative group" onClick={jumpToToday} title="Klicken: Diese Woche">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Planungswoche</span>
                            <div className="flex items-center gap-2">
                                <CalendarIcon size={14} className="text-blue-500" />
                                <span className="text-sm font-bold text-slate-200">KW {getWeekNumber(new Date(currentWeekStart))}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                                {new Date(weekDates.monday).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })} - {new Date(weekDates.friday).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                            </div>
                        </div>
                        <button onClick={nextWeek} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ChevronRight size={20} /></button>
                    </div>

                    <button
                        onClick={generateRoster}
                        disabled={isGenerating}
                        className={`btn btn-primary flex items-center gap-2 ${isGenerating ? 'opacity-50 cursor-wait' : ''}`}
                    >
                        {isGenerating ? <RefreshCw className="animate-spin" size={20} /> : <Sparkles size={20} />}
                        <span>{isGenerating ? 'Generiere...' : 'Automatisch befüllen'}</span>
                    </button>

                    {/* Clear Week Button */}
                    <button
                        onClick={() => {
                            if (confirm('Alle Einträge dieser Woche löschen?')) {
                                const other = assignments.filter(a => !(a.date >= weekDates.monday && a.date <= weekDates.friday));
                                store.setAssignments(other);
                            }
                        }}
                        className="p-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/30 transition-colors"
                        title="Woche leeren"
                    >
                        <Trash2 size={20} />
                    </button>
                </div>
            </div>

            {rosterWarnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 shadow-sm animate-fade-in relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                    <div className="flex items-center gap-2 mb-2 text-amber-500 font-bold">
                        <AlertTriangle size={18} />
                        Planungshinweise
                    </div>
                    <ul className="list-disc list-inside text-sm text-amber-200/90 space-y-1">
                        {rosterWarnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}

            {/* Roster Table */}
            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr>
                                <th className="p-4 border-b border-slate-700/50 text-slate-400 font-medium text-xs uppercase tracking-wider min-w-[200px] w-[200px] bg-slate-900 sticky left-0 z-20">Arbeitsbereich</th>
                                {days.map(day => {
                                    const date = new Date(weekDates[day]);
                                    const isToday = new Date().toISOString().split('T')[0] === weekDates[day];
                                    return (
                                        <th key={day} className={`p-4 border-b border-slate-700/50 font-medium text-xs uppercase tracking-wider min-w-[180px] ${isToday ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-900 text-slate-400'}`}>
                                            <div className="flex flex-col gap-1 items-center">
                                                <span>{DAY_LABELS[day]}</span>
                                                <span className={`${isToday ? 'text-blue-300 font-bold' : 'opacity-50'}`}>{date.getDate()}.{date.getMonth() + 1}.</span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {workAreas.map(area => (
                                <tr key={area.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="p-4 border-r border-slate-700/50 sticky left-0 bg-slate-900 group-hover:bg-slate-900 z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-inner" style={{ backgroundColor: `${area.color}20`, color: area.color }}>
                                                {area.icon}
                                            </div>
                                            <div>
                                                <div className="font-bold text-slate-200">{area.name}</div>
                                                {area.isCritical && (
                                                    <div className="flex items-center gap-1 text-[10px] text-rose-400 mt-1 font-medium bg-rose-500/10 px-1.5 py-0.5 rounded w-fit">
                                                        <AlertTriangle size={10} /> Kritisch
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    {days.map(day => (
                                        <td key={day} className="p-2 border-r border-slate-700/30 bg-slate-900/30 vertical-top h-32 relative">
                                            <div className="flex flex-col h-full gap-2">
                                                {/* Morning Slot */}
                                                {(area.operatingHours?.[day]?.includes('morning')) && (
                                                    <SlotCell
                                                        label="VM"
                                                        assignment={getAssignment(area.id, day, 'morning')}
                                                        employees={employees}
                                                        isCritical={area.isCritical}
                                                        onLock={(id: string) => store.toggleAssignmentLock(id)}
                                                        onDelete={deleteFromSlot}
                                                        onAdd={() => handleAddManual(area.id, day, 'morning')}
                                                    />
                                                )}

                                                {/* Noon Slot */}
                                                {(area.operatingHours?.[day]?.includes('noon')) && (
                                                    <SlotCell
                                                        label="MI"
                                                        assignment={getAssignment(area.id, day, 'noon')}
                                                        employees={employees}
                                                        isCritical={area.isCritical}
                                                        onLock={(id: string) => store.toggleAssignmentLock(id)}
                                                        onDelete={deleteFromSlot}
                                                        onAdd={() => handleAddManual(area.id, day, 'noon')}
                                                    />
                                                )}

                                                {/* Afternoon Slot */}
                                                {(area.operatingHours?.[day]?.includes('afternoon')) && (
                                                    <SlotCell
                                                        label="NM"
                                                        assignment={getAssignment(area.id, day, 'afternoon')}
                                                        employees={employees}
                                                        isCritical={area.isCritical}
                                                        onLock={(id: string) => store.toggleAssignmentLock(id)}
                                                        onDelete={deleteFromSlot}
                                                        onAdd={() => handleAddManual(area.id, day, 'afternoon')}
                                                    />
                                                )}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Manual Selection Modal */}
            {selectedSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedSlot(null)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-800 bg-slate-900">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <User size={20} className="text-blue-400" />
                                Mitarbeiter auswählen
                            </h3>
                            <p className="text-xs text-slate-400 mt-1">
                                {DAY_LABELS[selectedSlot.day]} {selectedSlot.slot === 'morning' ? 'Vormittag' : selectedSlot.slot === 'noon' ? 'Mittag' : 'Nachmittag'} · {weekDates[selectedSlot.day]}
                            </p>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-2">
                            {employees.filter(e => e.isActive).map(emp => {
                                // Check availability/absence for styling
                                const absStatus = getAbsenceStatus(emp.id, weekDates[selectedSlot.day]);
                                const isAbsFull = absStatus === 'approved';
                                const isAbsRequested = absStatus === 'requested';
                                const avail = emp.availability[selectedSlot.day];
                                let isUnavail = !avail || !avail.isWorking;
                                if (!isUnavail) {
                                    const slotDef = slotSettings[selectedSlot.day][selectedSlot.slot];
                                    if (!slotDef || avail.start > slotDef.start || avail.end <= slotDef.start) {
                                        isUnavail = true;
                                    }
                                }

                                return (
                                    <button
                                        key={emp.id}
                                        onClick={() => confirmManualAssignment(emp.id)}
                                        disabled={isAbsFull}
                                        className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left border mb-1
                                            ${isAbsFull ? 'opacity-50 grayscale cursor-not-allowed bg-slate-800 border-transparent' :
                                                isAbsRequested ? 'bg-amber-900/20 border-amber-500/30 text-slate-200 hover:bg-amber-500/40' :
                                                    isUnavail ? 'bg-slate-800/50 text-slate-400 border-transparent hover:bg-slate-800' :
                                                        'bg-slate-800 text-slate-200 border-slate-700 hover:bg-blue-600 hover:border-blue-500 hover:text-white group'
                                            }
                                        `}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isAbsFull ? 'bg-slate-700' : isAbsRequested ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 group-hover:bg-blue-500 text-slate-300 group-hover:text-white'}`}>
                                            {emp.firstName[0]}{emp.lastName[0]}
                                        </div>
                                        <div>
                                            <div className="font-medium">{emp.firstName} {emp.lastName}</div>
                                            <div className="text-[10px] opacity-70">
                                                {isAbsFull ? 'Abwesend (Urlaub/Krank)' : isAbsRequested ? 'Urlaubswunsch für diesen Tag' : isUnavail ? 'Nicht verfügbar' : 'Verfügbar'}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Sub-Component for Cell
function SlotCell({ label, assignment, employees, isCritical, onLock, onDelete, onAdd }: any) {
    const emp = assignment ? employees.find((e: Employee) => e.id === assignment.employeeId) : null;
    const isLocked = assignment?.isLocked;

    return (
        <div
            className={`
                flex-1 rounded-lg border p-1.5 relative group transition-all duration-200 min-h-[42px] flex items-center
                ${emp
                    ? (isLocked ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-800 border-slate-700 hover:border-slate-600')
                    : 'bg-slate-800/20 border-slate-800/50 border-dashed hover:border-slate-600 hover:bg-slate-800/40 cursor-pointer'
                }
            `}
            // Allow adding by clicking empty cell
            onClick={!emp ? onAdd : undefined}
        >
            <div className="absolute left-1.5 top-1.5 bottom-1.5 w-0.5 rounded-full bg-slate-700/50 group-hover:bg-blue-500/50 transition-colors"></div>

            {/* Label (VM/NM) */}
            <span className="absolute right-1.5 top-1 text-[8px] text-slate-600 font-bold uppercase tracking-wider group-hover:text-slate-500">{label}</span>

            {emp ? (
                <div className="pl-3 w-full pr-4">
                    <div className="text-xs font-bold text-slate-200 truncate">{emp.firstName} {emp.lastName}</div>
                    {/* Lock Icon */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onLock(assignment.id); }}
                        className={`absolute right-1 bottom-1 p-0.5 rounded hover:bg-slate-700 transition-colors ${isLocked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100'}`}
                        title={isLocked ? "Fixierung aufheben" : "Fixieren"}
                    >
                        {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                    </button>
                    {/* Delete Icon */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(assignment.id); }}
                        className="absolute right-6 bottom-1 p-0.5 rounded hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                        title="Entfernen"
                    >
                        <X size={10} />
                    </button>
                </div>
            ) : (
                <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus size={14} className="text-slate-500" />
                </div>
            )}
        </div>
    );
}

function getWeekNumber(d: Date) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}
