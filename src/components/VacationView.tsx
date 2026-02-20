import React, { useState } from 'react';
import { useStore, store } from '../store';
import { Absence, AbsenceType, AbsenceStatus, PracticeClosure, Employee, WeeklyAvailability } from '../types';
import { Calendar, ChevronLeft, ChevronRight, Plus, Palmtree, Thermometer, GraduationCap, HelpCircle, X, Check, Search, Clock, Home, Sparkles, Printer, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

export function VacationView() {
    const { employees, absences, closures } = useStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [showModal, setShowModal] = useState(false);
    const [editingAbsence, setEditingAbsence] = useState<Absence | null>(null);
    const [editingClosure, setEditingClosure] = useState<PracticeClosure | null>(null);
    const [isClosureForm, setIsClosureForm] = useState(false);

    const [selectedView, setSelectedView] = useState<string>('all');
    const [isExporting, setIsExporting] = useState(false);
    const pdfRef = React.useRef<HTMLDivElement>(null);

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

    // Helper to check if date range overlaps with current month
    function getStyleForDates(startDate: string, endDate: string, bg: string, border: string, text: string, icon: React.ReactNode, extraClass: string = '') {
        const absStart = new Date(startDate);
        const absEnd = new Date(endDate);
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month, daysInMonth);

        const displayStart = absStart < monthStart ? monthStart : absStart;
        const displayEnd = absEnd > monthEnd ? monthEnd : absEnd;

        if (displayStart > displayEnd) return null;

        const startDay = displayStart.getDate();
        const endDay = displayEnd.getDate();
        const duration = endDay - startDay + 1;

        let className = `absolute top-1 h-6 rounded ${bg} border ${border} ${text} text-[10px] flex items-center gap-1 px-1 overflow-hidden whitespace-nowrap z-10 hover:brightness-110 cursor-pointer ${extraClass}`;

        return {
            left: `${(startDay - 1) * 100 / daysInMonth}%`,
            width: `${duration * 100 / daysInMonth}%`,
            className,
            icon
        };
    }

    function getAbsenceStyle(absence: Absence) {
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

        let extraClass = '';
        if (absence.status === 'requested') {
            extraClass = 'opacity-80 border-dashed border-2 bg-stripes';
        }

        return getStyleForDates(absence.startDate, absence.endDate, bg, border, text, icon, extraClass);
    }

    function getClosureStyle(closure: PracticeClosure) {
        return getStyleForDates(
            closure.startDate,
            closure.endDate,
            'bg-indigo-500/20',
            'border-indigo-500/50',
            'text-indigo-400',
            <Home size={10} />,
            'opacity-90 font-bold'
        );
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
        setEditingClosure(null);
        setIsClosureForm(false);
        setShowModal(true);
    }

    function openEditClosure(closure: PracticeClosure) {
        setFormData({
            employeeId: 'praxis',
            startDate: closure.startDate,
            endDate: closure.endDate,
            type: 'vacation',
            status: 'approved',
            notes: closure.description
        });
        setEditingClosure(closure);
        setEditingAbsence(null);
        setIsClosureForm(true);
        setShowModal(true);
    }

    function save() {
        if (isClosureForm || formData.employeeId === 'praxis') {
            const newClosure: PracticeClosure = {
                id: editingClosure ? editingClosure.id : uuidv4(),
                startDate: formData.startDate,
                endDate: formData.endDate,
                description: formData.notes
            };
            if (editingClosure) store.updateClosure(editingClosure.id, newClosure);
            else store.addClosure(newClosure);
        } else {
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
        }
        setShowModal(false);
    }

    function autoPlanAllClosures() {
        if (!window.confirm("Der Algorithmus wird nun Urlaubstage für ALLE Praxisschließzeiten verteilen und notwendige Notbesetzungen einteilen. Fortfahren?")) return;

        const previousAutos = absences.filter(a => a.notes === 'Automatisch (Schließzeit)');
        const currentAbsences = absences.filter(a => !previousAutos.some(p => p.id === a.id));

        const remainingVac = new Map<string, number>();
        employees.forEach(emp => {
            let used = emp.vacationDaysUsed || 0;
            const empAbs = currentAbsences.filter(a => a.employeeId === emp.id && a.type === 'vacation' && a.status === 'approved');
            empAbs.forEach(absence => {
                let current = new Date(absence.startDate + "T12:00:00");
                const aEnd = new Date(absence.endDate + "T12:00:00");
                while (current <= aEnd) {
                    const dayOfWeek = current.getDay();
                    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                        const dayMap: Record<number, keyof WeeklyAvailability> = { 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday' };
                        const dayName = dayMap[dayOfWeek];
                        if (dayName && emp.availability[dayName]?.isWorking) used++;
                    }
                    current.setDate(current.getDate() + 1);
                }
            });
            remainingVac.set(emp.id, (emp.vacationDaysTotal + emp.vacationDaysCarryover) - used);
        });

        const sortedClosures = [...closures].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const newAbsences: Absence[] = [];

        sortedClosures.forEach(closure => {
            let d = new Date(closure.startDate + "T12:00:00");
            const end = new Date(closure.endDate + "T12:00:00");

            const workedYesterday = new Set<string>();
            const vacationGrants: { empId: string, date: string }[] = [];

            while (d <= end) {
                const isoDate = d.toISOString().split('T')[0];
                const dayOfWeek = d.getDay();

                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const dayMap: Record<number, keyof WeeklyAvailability> = {
                        1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday'
                    };
                    const dayName = dayMap[dayOfWeek];

                    const candidates = employees.filter(e => e.isActive && e.availability[dayName]?.isWorking);

                    const mustWork: Employee[] = [];
                    const canWork: { emp: Employee, cost: number }[] = [];

                    const dailyAbsences = [...currentAbsences, ...newAbsences].filter(a => a.startDate <= isoDate && a.endDate >= isoDate);

                    candidates.forEach(emp => {
                        const existingAbs = dailyAbsences.find(a => a.employeeId === emp.id);
                        if (existingAbs?.status === 'approved') {
                            workedYesterday.delete(emp.id);
                            return;
                        }

                        let rem = remainingVac.get(emp.id) || 0;
                        if (rem <= 0) {
                            mustWork.push(emp);
                        } else {
                            let cost = rem * 100;
                            if (existingAbs?.status === 'requested') cost += 10000;
                            if (workedYesterday.has(emp.id)) cost -= 5000;
                            canWork.push({ emp, cost });
                        }
                    });

                    const workers = new Set<string>(mustWork.map(e => e.id));
                    if (workers.size < 1 && canWork.length > 0) {
                        canWork.sort((a, b) => a.cost - b.cost);
                        workers.add(canWork[0].emp.id);
                    }

                    workedYesterday.clear();

                    candidates.forEach(emp => {
                        const existingAbs = dailyAbsences.find(a => a.employeeId === emp.id);
                        if (workers.has(emp.id)) {
                            workedYesterday.add(emp.id);
                        } else if (!existingAbs || existingAbs.status !== 'approved') {
                            vacationGrants.push({ empId: emp.id, date: isoDate });
                            remainingVac.set(emp.id, (remainingVac.get(emp.id) || 0) - 1);
                        }
                    });
                }
                d.setDate(d.getDate() + 1);
            }

            employees.forEach(emp => {
                const grants = vacationGrants.filter(g => g.empId === emp.id).map(g => g.date).sort();
                if (grants.length === 0) return;

                let blockStart = grants[0];
                let prevDate = new Date(blockStart + "T12:00:00");

                for (let i = 1; i <= grants.length; i++) {
                    const currentStr = grants[i];
                    const currDate = currentStr ? new Date(currentStr + "T12:00:00") : null;

                    let canMerge = false;
                    if (currDate) {
                        canMerge = true;
                        let check = new Date(prevDate);
                        check.setDate(check.getDate() + 1);
                        while (check < currDate) {
                            const dayOfWeek = check.getDay();
                            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                                const dayMap: Record<number, keyof WeeklyAvailability> = {
                                    1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday'
                                };
                                const dayName = dayMap[dayOfWeek];
                                if (dayName && emp.availability[dayName]?.isWorking) {
                                    canMerge = false;
                                    break;
                                }
                            }
                            check.setDate(check.getDate() + 1);
                        }
                    }

                    if (!canMerge || !currDate) {
                        newAbsences.push({
                            id: uuidv4(),
                            employeeId: emp.id,
                            startDate: blockStart,
                            endDate: prevDate.toISOString().split('T')[0],
                            type: 'vacation',
                            status: 'approved',
                            notes: 'Automatisch (Schließzeit)'
                        });
                        if (currentStr) {
                            blockStart = currentStr;
                            prevDate = new Date(currentStr + "T12:00:00");
                        }
                    } else {
                        if (currDate) prevDate = currDate;
                    }
                }
            });
        });

        const toDeleteIds = previousAutos.map(a => a.id);
        toDeleteIds.forEach(id => store.deleteAbsence(id));
        newAbsences.forEach(abs => store.addAbsence(abs));

        setShowModal(false);
    }

    function remove() {
        if (editingAbsence) {
            store.deleteAbsence(editingAbsence.id);
            setShowModal(false);
        } else if (editingClosure) {
            store.deleteClosure(editingClosure.id);
            setShowModal(false);
        }
    }

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
                        1: 'monday',
                        2: 'tuesday',
                        3: 'wednesday',
                        4: 'thursday',
                        5: 'friday'
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

    function renderVacationCounter(employee: Employee) {
        const totalAvailable = employee.vacationDaysTotal + employee.vacationDaysCarryover;
        const used = calculateVacationDaysUsed(employee);
        const remaining = totalAvailable - used;

        let colorClass = "text-slate-500";
        let bgClass = "bg-transparent";
        let isNegative = false;

        if (remaining < 0) {
            colorClass = "text-rose-100";
            bgClass = "bg-rose-600 shadow-md";
            isNegative = true;
        } else if (remaining <= 5) {
            colorClass = "text-amber-400";
        } else {
            colorClass = "text-emerald-400";
        }

        return (
            <div className={`flex flex-col items-end shrink-0 px-2 py-0.5 rounded ${bgClass}`} title={`Urlaubsanspruch: ${totalAvailable} (${employee.vacationDaysTotal} + ${employee.vacationDaysCarryover} Übertrag)\nGenommen/Geplant: ${used} (${remaining} übrig)`}>
                <span className={`text-[11px] font-bold ${colorClass}`}>{remaining} / {totalAvailable}</span>
                <span className={`text-[8px] uppercase tracking-widest ${isNegative ? 'text-rose-200' : 'text-slate-500 opacity-60'} mt-[1px]`}>Tage</span>
            </div>
        )
    }

    const exportPDF = async () => {
        if (!pdfRef.current) return;
        setIsExporting(true);
        // Let React re-render without overflow hidden and wait for layout paint
        await new Promise(r => setTimeout(r, 400));

        try {
            const dataUrl = await toJpeg(pdfRef.current, {
                quality: 0.95,
                backgroundColor: '#ffffff',
                pixelRatio: 2
            });

            const pdf = new jsPDF('l', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pxWidth = pdfRef.current.scrollWidth;
            const pxHeight = pdfRef.current.scrollHeight;
            const pdfHeight = (pxHeight * pdfWidth) / pxWidth;

            pdf.addImage(dataUrl, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            const employeeName = selectedView !== 'all' ? (employees.find(e => e.id === selectedView)?.lastName || '') : 'Alle';
            pdf.save(`Urlaubsplan_${year}_${employeeName}.pdf`);
        } catch (e: any) {
            console.error("PDF Export failed", e);
            alert("Fehler beim PDF-Export aufgetreten:\n" + (e?.message || e?.toString() || "Unbekannter Fehler"));
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="animate-fade-in flex flex-col h-full overflow-hidden pb-20">
            <div className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Urlaubsplanung</h2>
                    <p className="text-slate-400 text-sm">Abwesenheiten verwalten</p>
                </div>
                <div className="flex gap-4">
                    <select
                        className="bg-slate-800 rounded-lg p-2 text-sm text-slate-200 border border-slate-700 outline-none"
                        value={selectedView}
                        onChange={(e) => setSelectedView(e.target.value)}
                        disabled={isExporting}
                    >
                        <option value="all">Monatsansicht (Alle Mitarbeiter)</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>Jahresansicht ({emp.firstName} {emp.lastName})</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <button onClick={() => selectedView === 'all' ? prevMonth() : setCurrentDate(new Date(year - 1, month, 1))} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ChevronLeft size={20} /></button>
                        <span className="w-40 text-center font-medium text-slate-200">
                            {selectedView === 'all' ? monthLabel : `Jahr ${year}`}
                        </span>
                        <button onClick={() => selectedView === 'all' ? nextMonth() : setCurrentDate(new Date(year + 1, month, 1))} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white"><ChevronRight size={20} /></button>
                    </div>
                    {closures.length > 0 && selectedView === 'all' && (
                        <button onClick={autoPlanAllClosures} disabled={isExporting} className="btn bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 hover:bg-indigo-500/30 flex items-center gap-2">
                            <Sparkles size={18} /> Alle Schließzeiten verteilen
                        </button>
                    )}
                    <button onClick={exportPDF} disabled={isExporting} className="btn border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-2 w-32 justify-center" title="Als PDF exportieren">
                        {isExporting ? (
                            <span className="flex items-center gap-2"><RefreshCw size={16} className="animate-spin" /> Lädt...</span>
                        ) : (
                            <span className="flex items-center gap-2"><Printer size={16} /> Export</span>
                        )}
                    </button>
                    <button onClick={openCreate} disabled={isExporting} className="btn btn-primary flex items-center gap-2">
                        <Plus size={18} /> Neuer Antrag
                    </button>
                </div>
            </div>

            {/* Gantt Chart Container */}
            <div ref={pdfRef} className={`${isExporting ? 'pdf-export-theme bg-white' : 'bg-slate-900/50'} border border-slate-700/50 rounded-xl flex-1 flex flex-col ${isExporting ? 'overflow-visible h-auto max-h-none' : 'overflow-hidden'}`}>
                {selectedView === 'all' ? (
                    <>
                        {/* PDF Header for Month View */}
                        {isExporting && (
                            <div className="bg-white border-b border-slate-700/50 flex justify-between items-center px-8 pb-4 pt-6">
                                <div>
                                    <h2 className="text-3xl font-black text-slate-800 tracking-tight">Urlaubsplan</h2>
                                    <div className="text-slate-500 font-medium text-lg mt-1">{monthLabel}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded inline-block mb-1">HÄPPI-Flow</div>
                                    <div className="text-xs text-slate-500">Druckdatum: {new Date().toLocaleDateString('de-DE')}</div>
                                </div>
                            </div>
                        )}
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
                            {/* Praxis Closure Row */}
                            <div className="flex border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors h-10 group relative bg-indigo-900/10">
                                <div className="absolute inset-0 pointer-events-none group-hover:bg-indigo-900/20 z-0"></div>
                                <div className="w-56 px-4 flex items-center gap-3 shrink-0 border-r border-slate-700/50 sticky left-0 z-10 bg-indigo-900/40 group-hover:bg-indigo-900/60 transition-colors">
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center bg-indigo-500/20 text-indigo-400 text-sm">🏥</div>
                                    <span className="text-sm truncate font-bold text-indigo-300">Praxisschließzeiten</span>
                                </div>
                                <div className="flex-1 relative overflow-hidden">
                                    <div className={`absolute inset-0 ${isExporting ? 'hidden' : 'flex'} items-center justify-center text-4xl font-black text-indigo-300/5 pointer-events-none tracking-[0.5em] uppercase whitespace-nowrap z-0 selection:bg-transparent`}>
                                        PRAXISSCHLIESSZEITEN
                                    </div>
                                    <div className="absolute inset-0 flex z-0">
                                        {days.map(d => (
                                            <div
                                                key={d.date}
                                                onClick={() => openCreateForDate('praxis', d.iso)}
                                                title={`Klick: Neue Praxisschließzeit am ${d.date}.${month + 1}.`}
                                                className={`flex-1 border-r border-slate-800/50 cursor-pointer hover:bg-white/5 transition-colors ${d.isWeekend ? 'bg-slate-800/20' : ''}`}
                                            />
                                        ))}
                                    </div>
                                    {closures.map(closure => {
                                        const style = getClosureStyle(closure);
                                        if (!style) return null;
                                        return (
                                            <div
                                                key={closure.id}
                                                style={{ left: style.left, width: style.width }}
                                                className={style.className}
                                                onClick={() => openEditClosure(closure)}
                                                title={`Praxisschließzeit: ${closure.description}\n${new Date(closure.startDate).toLocaleDateString()} - ${new Date(closure.endDate).toLocaleDateString()}`}
                                            >
                                                {style.icon}
                                                <span className="truncate flex-1">Praxis geschlossen</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Employee Rows */}
                            {employees.filter(e => e.isActive).map((emp, idx) => (
                                <div key={emp.id} className={`flex border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors h-10 group relative ${idx % 2 === 0 ? 'bg-slate-800/10' : ''}`}>
                                    {/* Hover Guide - helps to see which row you are tracking */}
                                    <div className="absolute inset-0 pointer-events-none group-hover:bg-slate-600/10 z-0"></div>

                                    {/* Name Column */}
                                    <div className={`w-56 px-4 flex items-center justify-between shrink-0 border-r border-slate-700/50 sticky left-0 z-10 transition-colors bg-slate-900/95 group-hover:bg-slate-800/95`}>
                                        <div className="flex items-center gap-2 truncate">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-slate-800 text-slate-400 shrink-0`}>
                                                {emp.firstName[0]}{emp.lastName[0]}
                                            </div>
                                            <span className="text-sm truncate text-slate-300">
                                                {emp.firstName} {emp.lastName}
                                            </span>
                                        </div>
                                        {renderVacationCounter(emp)}
                                    </div>

                                    {/* Timeline Columns */}
                                    <div className="flex-1 relative overflow-hidden">
                                        {/* Watermark */}
                                        <div className={`absolute inset-0 ${isExporting ? 'hidden' : 'flex'} items-center justify-center text-4xl font-black text-slate-300/5 pointer-events-none tracking-[0.5em] uppercase whitespace-nowrap z-0 selection:bg-transparent`}>
                                            {emp.firstName} {emp.lastName}
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
                                                        title={`${emp.firstName} (${absence.status === 'requested' ? 'Wunsch' : 'Fest'}): ${absence.notes || (absence.type === 'vacation' ? 'Urlaub' : absence.type === 'sick' ? 'Krank' : absence.type === 'overtime' ? 'Überstundenabbau' : 'Fortbildung')}\n${new Date(absence.startDate).toLocaleDateString()} - ${new Date(absence.endDate).toLocaleDateString()}`}
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
                    </>
                ) : (
                    /* YEAR VIEW FOR SINGLE EMPLOYEE */
                    <div className={`flex flex-col flex-1 ${isExporting ? 'overflow-visible' : 'overflow-x-auto overflow-y-hidden'}`}>
                        <div className="flex flex-col flex-1 min-w-[1024px]">
                            {/* PDF Header for Year View */}
                            {isExporting && (
                                <div className="bg-white border-b border-slate-700/50 flex justify-between items-center px-8 pb-4 pt-6">
                                    <div>
                                        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Urlaubsplan {year}</h2>
                                        <div className="text-slate-500 font-medium text-lg mt-1">
                                            {employees.find(e => e.id === selectedView)?.firstName} {employees.find(e => e.id === selectedView)?.lastName}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded inline-block mb-1">HÄPPI-Flow</div>
                                        <div className="text-xs text-slate-500">Druckdatum: {new Date().toLocaleDateString('de-DE')}</div>
                                    </div>
                                </div>
                            )}
                            <div className="flex border-b border-slate-700/50 bg-slate-900 z-20">
                                <div className="w-40 p-4 text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 border-r border-slate-700/50 bg-slate-900 sticky left-0 z-30">
                                    Monat
                                </div>
                                <div className="flex-1 flex overflow-hidden">
                                    {Array.from({ length: 31 }, (_, i) => (
                                        <div key={i} className="flex-1 min-w-[30px] border-r border-slate-800/50 flex flex-col items-center justify-center py-2">
                                            <span className="text-[10px] font-bold text-slate-400">{i + 1}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className={`flex-1 ${isExporting ? 'overflow-visible' : 'overflow-y-auto overflow-x-hidden custom-scrollbar'}`}>
                                {Array.from({ length: 12 }, (_, m) => {
                                    const mmName = new Date(year, m, 1).toLocaleDateString('de-DE', { month: 'long' });
                                    const dInMonth = new Date(year, m + 1, 0).getDate();
                                    const empAbsences = absences.filter(a => a.employeeId === selectedView);

                                    return (
                                        <div key={m} className={`flex border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors h-10 group relative ${m % 2 === 0 ? 'bg-slate-800/10' : ''}`}>
                                            <div className="absolute inset-0 pointer-events-none group-hover:bg-slate-600/10 z-0"></div>
                                            <div className={`w-40 px-4 flex items-center gap-3 shrink-0 border-r border-slate-700/50 sticky left-0 z-10 transition-colors bg-slate-900/95 group-hover:bg-slate-800/95`}>
                                                <span className="text-sm truncate text-slate-300 font-medium">
                                                    {mmName}
                                                </span>
                                            </div>
                                            <div className="flex-1 relative overflow-hidden">
                                                {/* Grid Lines */}
                                                <div className="absolute inset-0 flex z-0">
                                                    {Array.from({ length: 31 }, (_, dayIndex) => {
                                                        const isValid = dayIndex < dInMonth;
                                                        const d = isValid ? new Date(year, m, dayIndex + 1) : null;
                                                        const isWe = d ? (d.getDay() === 0 || d.getDay() === 6) : false;
                                                        const iso = d ? `${year}-${String(m + 1).padStart(2, '0')}-${String(dayIndex + 1).padStart(2, '0')}` : '';

                                                        return (
                                                            <div
                                                                key={dayIndex}
                                                                onClick={() => isValid && openCreateForDate(selectedView, iso)}
                                                                className={`flex-1 border-r border-slate-800/50 ${!isValid ? 'bg-slate-800/80 pointer-events-none' : isWe ? 'bg-slate-800/20' : 'cursor-pointer hover:bg-white/5 transition-colors'}`}
                                                            />
                                                        );
                                                    })}
                                                </div>

                                                {/* Bars */}
                                                {empAbsences.map(absence => {
                                                    const mStart = new Date(year, m, 1);
                                                    const mEnd = new Date(year, m, dInMonth);
                                                    const aStart = new Date(absence.startDate);
                                                    const aEnd = new Date(absence.endDate);
                                                    const dispStart = aStart < mStart ? mStart : aStart;
                                                    const dispEnd = aEnd > mEnd ? mEnd : aEnd;

                                                    if (dispStart > dispEnd) return null;

                                                    const sDay = dispStart.getDate();
                                                    const eDay = dispEnd.getDate();
                                                    const dur = eDay - sDay + 1;

                                                    let bg = 'bg-slate-600';
                                                    let border = 'border-slate-500';
                                                    let text = 'text-slate-200';
                                                    let icon = <HelpCircle size={10} />;

                                                    switch (absence.type) {
                                                        case 'vacation': bg = 'bg-emerald-500/20'; border = 'border-emerald-500/50'; text = 'text-emerald-400'; icon = <Palmtree size={10} />; break;
                                                        case 'sick': bg = 'bg-rose-500/20'; border = 'border-rose-500/50'; text = 'text-rose-400'; icon = <Thermometer size={10} />; break;
                                                        case 'training': bg = 'bg-blue-500/20'; border = 'border-blue-500/50'; text = 'text-blue-400'; icon = <GraduationCap size={10} />; break;
                                                        case 'overtime': bg = 'bg-amber-500/20'; border = 'border-amber-500/50'; text = 'text-amber-400'; icon = <Clock size={10} />; break;
                                                    }
                                                    let extra = '';
                                                    if (absence.status === 'requested') extra = 'opacity-80 border-dashed border-2 bg-stripes';

                                                    return (
                                                        <div
                                                            key={absence.id}
                                                            style={{ left: `${(sDay - 1) * 100 / 31}%`, width: `${dur * 100 / 31}%` }}
                                                            className={`absolute top-1 h-6 rounded ${bg} border ${border} ${text} text-[10px] flex items-center gap-1 px-1 overflow-hidden whitespace-nowrap z-10 hover:brightness-110 cursor-pointer ${extra}`}
                                                            onClick={() => openEdit(absence)}
                                                            title={`${(absence.status === 'requested' ? 'Wunsch: ' : '') + (absence.type === 'vacation' ? 'Urlaub' : absence.type === 'sick' ? 'Krank' : absence.type === 'overtime' ? 'Überstunden' : 'Fortbildung')}\n${absence.notes ? absence.notes + '\n' : ''}${new Date(absence.startDate).toLocaleDateString()} - ${new Date(absence.endDate).toLocaleDateString()}`}
                                                        >
                                                            {icon}
                                                            <span className="truncate flex-1">
                                                                {(absence.status === 'requested' ? 'Wunsch: ' : '') + (absence.type === 'vacation' ? 'Urlaub' : absence.type === 'sick' ? 'Krank' : absence.type === 'overtime' ? 'Überstunden' : 'Fortbildung')}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                            <h3 className="text-lg font-bold text-white">{(editingAbsence || editingClosure) ? 'Eintrag bearbeiten' : 'Neue Abwesenheit'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Employee Select */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mitarbeiter / Geltungsbereich</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none"
                                    value={formData.employeeId}
                                    onChange={e => {
                                        setFormData({ ...formData, employeeId: e.target.value });
                                        setIsClosureForm(e.target.value === 'praxis');
                                    }}
                                    disabled={!!editingAbsence || !!editingClosure}
                                >
                                    <option value="praxis">🏥 Allgemeiner Praxisurlaub</option>
                                    {employees.filter(e => e.isActive).map(e => (
                                        <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Type Select */}
                            {!isClosureForm && (
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
                                </div>)}

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
                            <div className={`grid ${!isClosureForm ? 'grid-cols-1 md:grid-cols-2 gap-4' : 'grid-cols-1 space-y-4'}`}>
                                {/* Status */}
                                {!isClosureForm && (
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
                                    </div>)}

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
                        <div className="p-5 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                                {(editingAbsence || editingClosure) && (
                                    <button onClick={remove} className="text-rose-400 hover:bg-rose-500/10 px-3 py-2 rounded-lg font-medium transition-colors">
                                        Löschen
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 font-medium transition-colors">
                                    Abbrechen
                                </button>
                                <button onClick={save} className="btn btn-primary px-6 py-2">
                                    {isClosureForm ? 'Schließzeit speichern' : 'Eintrag speichern'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
