import { useState } from 'react';
import { useStore, store } from '../store';
import { Absence, AbsenceType, AbsenceStatus } from '../types';
import { Calendar, ChevronLeft, ChevronRight, Plus, Palmtree, Thermometer, GraduationCap, HelpCircle, X, Check, Search } from 'lucide-react';
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
        return {
            date: i + 1,
            dayOfWeek: d.toLocaleDateString('de-DE', { weekday: 'short' }),
            iso: d.toISOString().split('T')[0],
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
        }

        return {
            left: `${(startDay - 1) * 100 / daysInMonth}%`,
            width: `${duration * 100 / daysInMonth}%`,
            className: `absolute top-1 h-6 rounded ${bg} border ${border} ${text} text-[10px] flex items-center gap-1 px-1 overflow-hidden whitespace-nowrap z-10 hover:brightness-110 cursor-pointer`,
            icon
        };
    }

    // Modal Form State
    const [formData, setFormData] = useState<{
        employeeId: string, startDate: string, endDate: string, type: AbsenceType, notes: string
    }>({
        employeeId: '', startDate: '', endDate: '', type: 'vacation', notes: ''
    });

    function openCreate() {
        setFormData({
            employeeId: employees.filter(e => e.isActive)[0]?.id || '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            type: 'vacation',
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
            status: editingAbsence ? editingAbsence.status : 'approved', // Auto-approve for now
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
                    {employees.filter(e => e.isActive).map(emp => (
                        <div key={emp.id} className="flex border-b border-slate-700/30 hover:bg-slate-800/10 transition-colors h-10 group">
                            {/* Name Column */}
                            <div className="w-56 px-4 flex items-center gap-3 shrink-0 border-r border-slate-700/50 bg-slate-900/95 sticky left-0 z-10 group-hover:bg-slate-800/95 transition-colors">
                                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                    {emp.firstName[0]}{emp.lastName[0]}
                                </div>
                                <span className="text-sm text-slate-300 truncate">{emp.firstName} {emp.lastName}</span>
                            </div>

                            {/* Timeline Columns */}
                            <div className="flex-1 relative">
                                {/* Grid Lines Background */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                    {days.map(d => (
                                        <div key={d.date} className={`flex-1 border-r border-slate-800/50 ${d.isWeekend ? 'bg-slate-800/20' : ''}`} />
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
                                                title={`${absence.notes || ''} (${new Date(absence.startDate).toLocaleDateString()} - ${new Date(absence.endDate).toLocaleDateString()})`}
                                            >
                                                {style.icon}
                                                <span className="truncate flex-1">{absence.type === 'vacation' ? 'Urlaub' : absence.type === 'sick' ? 'Krank' : 'Fortbildung'}</span>
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
                                    {employees.filter(e => e.isActive).map(e => (
                                        <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Type Select */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Art</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        onClick={() => setFormData({ ...formData, type: 'vacation' })}
                                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${formData.type === 'vacation' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <Palmtree size={16} /> <span className="text-xs font-medium">Urlaub</span>
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, type: 'sick' })}
                                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${formData.type === 'sick' ? 'bg-rose-500/20 border-rose-500/50 text-rose-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <Thermometer size={16} /> <span className="text-xs font-medium">Krank</span>
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, type: 'training' })}
                                        className={`p-2 rounded-lg border flex flex-col items-center gap-1 transition-all ${formData.type === 'training' ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                                    >
                                        <GraduationCap size={16} /> <span className="text-xs font-medium">Fortbildung</span>
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

                            {/* Notes */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Notiz</label>
                                <textarea
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none resize-none h-20"
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Optional..."
                                />
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
