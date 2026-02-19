import { useState } from 'react';
import { useStore, store } from '../store';
import { Absence, AbsenceType, AbsenceStatus } from '../types';
import { Calendar, ChevronLeft, ChevronRight, Plus, Palmtree, Thermometer, GraduationCap, HelpCircle, X, Check, Search, Clock } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export function VacationView() {
    const { employees, absences } = useStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showModal, setShowModal] = useState(false);
    const [editingAbsence, setEditingAbsence] = useState<Absence | null>(null);

    // Month Navigation
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-11

    function prevMonth() {
        setCurrentDate(new Date(year, month - 1, 1));
    }

    function nextMonth() {
        setCurrentDate(new Date(year, month + 1, 1));
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(year, month, i + 1);
        const pad = (n: number) => String(n).padStart(2, '0');
        return {
            date: i + 1,
            dayOfWeek: d.toLocaleDateString('de-DE', { weekday: 'short' }),
            iso: `${year}-${pad(month + 1)}-${pad(i + 1)}`,
            isWeekend: d.getDay() === 0 || d.getDay() === 6
        };
    });

    const monthLabel = currentDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    // Absences for current month
    const startOfMonth = new Date(year, month, 1).toISOString().split('T')[0];
    const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

    // Helper to check if absence overlaps with current month
    function getAbsenceStyle(absence: Absence) {
        // Calculate position and width
        const absStart = new Date(absence.startDate);
        const absEnd = new Date(absence.endDate);
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month, daysInMonth);

        // Clip dates to current month view
        const displayStart = absStart < monthStart ? monthStart : absStart;
        const displayEnd = absEnd > monthEnd ? monthEnd : absEnd;

        // If completely outside
        if (displayStart > displayEnd) return null;

        const startDay = displayStart.getDate();
        const endDay = displayEnd.getDate();
        const duration = endDay - startDay + 1;

        let bg = 'bg-slate-600';
        let border = 'border-slate-500';
        let text = 'text-slate-200';
        let icon = <HelpCircle size={10} />;

        switch (absence.type) {
            case 'vacation':
                bg = 'bg-emerald-500/20'; border = 'border-emerald-500/50'; text = 'text-emerald-400';
                icon = <Palmtree size={10} />;
                break;
            case 'sick':
                bg = 'bg-rose-500/20'; border = 'border-rose-500/50'; text = 'text-rose-400';
                icon = <Thermometer size={10} />;
                break;
            case 'training':
                bg = 'bg-blue-500/20'; border = 'border-blue-500/50'; text = 'text-blue-400';
                icon = <GraduationCap size={10} />;
                break;
            case 'overtime':
                bg = 'bg-amber-500/20'; border = 'border-amber-500/50'; text = 'text-amber-400';
                icon = <Clock size={10} />;
                break;
        }

        let className = `absolute top-1 h-6 rounded ${bg} border ${border} ${text} text-[10px] flex items-center gap-1 px-1 overflow-hidden whitespace-nowrap z-10 hover:brightness-110 cursor-pointer`;

        if (absence.status === 'requested') {
            className += ' opacity-80 border-dashed border-2 bg-stripes';
        }

        return {
            left: `${(startDay - 1) * 100 / daysInMonth}%`,
            width: `${duration * 100 / daysInMonth}%`,
            className,
            icon
        };
    }

    // Modal Form State
    const [formData, setFormData] = useState<{
        employeeId: string, startDate: string, endDate: string, type: AbsenceType, status: AbsenceStatus, notes: string
    }>({
        employeeId: '', startDate: '', endDate: '', type: 'vacation', status: 'approved', notes: ''
    });

    function openCreate() {
        setFormData({
            employeeId: employees.filter(e => e.isActive)[0]?.id || '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            type: 'vacation',
            status: 'approved',
            notes: ''
        });
        setEditingAbsence(null);
        setShowModal(true);
    }

    function openCreateForDate(empId: string, dateIso: string) {
        setFormData({
            employeeId: empId,
            startDate: dateIso,
            endDate: dateIso,
            type: 'vacation',
            status: 'approved',
            notes: ''
        });
        setEditingAbsence(null);
        setShowModal(true);
    }

    function openEdit(abs: Absence) {
        setFormData({
            employeeId: abs.employeeId,
            startDate: abs.startDate,
            endDate: abs.endDate,
            type: abs.type,
            status: abs.status,
            notes: abs.notes || ''
        });
        setEditingAbsence(abs);
        setShowModal(true);
    }

    function save() {
        if (!formData.employeeId) return;

        const newAbsence: Absence = {
            id: editingAbsence ? editingAbsence.id : uuidv4(),
            employeeId: formData.employeeId,
            startDate: formData.startDate,
            endDate: formData.endDate,
            type: formData.type,
            status: formData.status,
            notes: formData.notes
        };

        if (editingAbsence) {
            store.updateAbsence(editingAbsence.id, newAbsence);
        } else {
            store.addAbsence(newAbsence);
        }
        setShowModal(false);
    }

    function remove() {
        if (editingAbsence) {
            store.deleteAbsence(editingAbsence.id);
            setShowModal(false);
        }
    }

    return (
        <div className="animate-fade-in h-screen flex flex-col p-6 absolute inset-0 overflow-hidden">
            <div className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Urlaubsplanung</h2>
                    <p className="text-slate-400 text-sm">Abwesenheiten verwalten</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <button onClick={prevMonth} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
                        <span className="w-40 text-center font-medium text-slate-200">{monthLabel}</span>
                        <button onClick={nextMonth} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ChevronRight size={20} /></button>
                    </div>
                    <button onClick={openCreate} className="btn btn-primary flex items-center gap-2">
                        <Plus size={18} /> Neuer Antrag
                    </button>
                </div>
            </div>

            {/* Gantt Chart Container */}
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl flex-1 flex flex-col overflow-hidden">
                {/* Header Row */}
                <div className="flex border-b border-slate-700/50 bg-slate-900 z-20">
                    <div className="w-56 p-4 text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 border-r border-slate-700/50 bg-slate-900 sticky left-0 z-30">
                        Mitarbeiter
                    </div>
                    <div className="flex-1 flex overflow-hidden">
                        {days.map(d => (
                            <div key={d.date} className={`flex-1 min-w-[30px] border-r border-slate-800/50 flex flex-col items-center justify-center py-2 ${d.isWeekend ? 'bg-slate-800/30' : ''}`}>
                                <span className={`text-[10px] font-bold ${d.isWeekend ? 'text-rose-400' : 'text-slate-400'}`}>{d.dayOfWeek}</span>
                                <span className={`text-sm font-medium ${d.isWeekend ? 'text-rose-200' : 'text-slate-200'}`}>{d.date}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Rows Scrollable Area */}
                <div className="overflow-y-auto overflow-x-hidden flex-1 custom-scrollbar">
                    {[{ id: 'praxis', firstName: 'Praxisurlaub', lastName: '🏥', isActive: true } as any, ...employees.filter(e => e.isActive)].map((emp, idx) => (
                        <div key={emp.id} className={`flex border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors h-10 group relative ${idx % 2 === 0 ? 'bg-slate-800/10' : ''}`}>
                            {/* Hover Guide - helps to see which row you are tracking */}
                            <div className="absolute inset-0 pointer-events-none group-hover:bg-slate-600/10 z-0"></div>

                            {/* Name Column */}
                            <div className={`w-56 px-4 flex items-center gap-3 shrink-0 border-r border-slate-700/50 sticky left-0 z-10 transition-colors ${emp.id === 'praxis' ? 'bg-indigo-900/40 group-hover:bg-indigo-900/60' : 'bg-slate-900/95 group-hover:bg-slate-800/95'}`}>
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${emp.id === 'praxis' ? 'bg-indigo-500/20 text-indigo-400 text-sm' : 'bg-slate-800 text-slate-400'}`}>
                                    {emp.id === 'praxis' ? '🏥' : `${emp.firstName[0]}${emp.lastName[0]}`}
                                </div>
                                <span className={`text-sm truncate ${emp.id === 'praxis' ? 'font-bold text-indigo-300' : 'text-slate-300'}`}>
                                    {emp.id === 'praxis' ? 'Allgemeiner Praxisurlaub' : `${emp.firstName} ${emp.lastName}`}
                                </span>
                            </div>

                            {/* Timeline Columns */}
                            <div className="flex-1 relative overflow-hidden">
                                {/* Watermark */}
                                <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-slate-300/5 pointer-events-none tracking-[0.5em] uppercase whitespace-nowrap z-0 selection:bg-transparent">
                                    {emp.id === 'praxis' ? 'PRAXISURLAUB' : `${emp.firstName} ${emp.lastName}`}
                                </div>

                                {/* Grid Lines Background and Interaction */}
                                <div className="absolute inset-0 flex z-0">
                                    {days.map(d => (
                                        <div
                                            key={d.date}
                                            onClick={() => openCreateForDate(emp.id, d.iso)}
                                            title={`Klick: Neuer Eintrag für ${emp.id === 'praxis' ? 'Praxisurlaub' : emp.firstName} am ${d.date}.${month + 1}.`}
                                            className={`flex-1 border-r border-slate-800/50 cursor-pointer hover:bg-white/5 transition-colors ${d.isWeekend ? 'bg-slate-800/20' : ''}`}
                                        />
                                    ))}
                                </div>

                                {/* Bars */}
                                {absences
                                    .filter(a => a.employeeId === emp.id)
                                    .map(absence => {
                                        const style = getAbsenceStyle(absence);
                                        if (!style) return null;
                                        return (
                                            <div
                                                key={absence.id}
                                                style={{ left: style.left, width: style.width }}
                                                className={style.className}
                                                onClick={() => openEdit(absence)}
                                                title={`${emp.id === 'praxis' ? 'Praxisurlaub' : emp.firstName} (${absence.status === 'requested' ? 'Wunsch' : 'Fest'}): ${absence.notes || (absence.type === 'vacation' ? 'Urlaub' : absence.type === 'sick' ? 'Krank' : absence.type === 'overtime' ? 'Überstundenabbau' : 'Fortbildung')}\n${new Date(absence.startDate).toLocaleDateString()} - ${new Date(absence.endDate).toLocaleDateString()}`}
                                            >
                                                {style.icon}
                                                <span className="truncate flex-1">{(absence.status === 'requested' ? 'Wunsch: ' : '') + (absence.type === 'vacation' ? 'Urlaub' : absence.type === 'sick' ? 'Krank' : absence.type === 'overtime' ? 'Überstunden' : 'Fortbildung')}</span>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                            <h3 className="text-lg font-bold text-white">{editingAbsence ? 'Eintrag bearbeiten' : 'Neue Abwesenheit'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Employee Select */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mitarbeiter</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                                    value={formData.employeeId}
                                    onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                                    disabled={!!editingAbsence}
                                >
                                    <option value="praxis">🏥 Allgemeiner Praxisurlaub</option>
                                    {employees.filter(e => e.isActive).map(e => (
                                        <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Type Select */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Art</label>
                                <div className="grid grid-cols-4 gap-2">
                                    <button
                                        onClick={() => setFormData({ ...formData, type: 'vacation' })}
                                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${formData.type === 'vacation' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <Palmtree size={16} /> <span className="text-[10px] font-medium truncate w-full text-center">Urlaub</span>
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, type: 'sick' })}
                                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${formData.type === 'sick' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <Thermometer size={16} /> <span className="text-[10px] font-medium truncate w-full text-center">Krank</span>
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, type: 'training' })}
                                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${formData.type === 'training' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <GraduationCap size={16} /> <span className="text-[10px] font-medium truncate w-full text-center">Fortbildung</span>
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, type: 'overtime' })}
                                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${formData.type === 'overtime' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                        title="Überstundenabbau"
                                    >
                                        <Clock size={16} /> <span className="text-[10px] font-medium truncate w-full text-center">Überstd.</span>
                                    </button>
                                </div>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Von</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                                        value={formData.startDate}
                                        onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Bis</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                                        value={formData.endDate}
                                        onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Status and Notes Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Status */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</label>
                                    <select
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value as AbsenceStatus })}
                                    >
                                        <option value="approved">✅ Genehmigt / Fest geplant</option>
                                        <option value="requested">❓ Urlaubswunsch</option>
                                    </select>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        Urlaubswünsche werden vom System versucht zu erfüllen, aber bei Personalmangel überschrieben.
                                    </p>
                                </div>

                                {/* Notes */}
                                <div className="space-y-1.5 flex-1">
                                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notiz</label>
                                    <textarea
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none resize-none h-full"
                                        value={formData.notes}
                                        onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                        placeholder="Optional..."
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex justify-between">
                            {editingAbsence ? (
                                <button onClick={remove} className="text-rose-400 hover:bg-rose-500/10 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                                    Löschen
                                </button>
                            ) : <div></div>}
                            <div className="flex gap-3">
                                <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 font-medium text-sm transition-colors">
                                    Abbrechen
                                </button>
                                <button onClick={save} className="btn btn-primary px-6 py-2 text-sm">
                                    Dienstplan Eintrag speichern
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
