import { useState, useRef } from 'react';
import { RefreshCw, AlertTriangle, Check, Database, Info, Download, Upload, X, Clock } from 'lucide-react';
import { store, useStore } from '../store';
import { DAY_FULL_LABELS, WeeklyAvailability, DailySlotTimes } from '../types';

export function SettingsView() {
    const { employees, workAreas, skills, slotSettings } = useStore();
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [resetDone, setResetDone] = useState(false);
    const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function handleReset() {
        store.resetAll();
        setShowResetConfirm(false);
        setResetDone(true);
        setTimeout(() => setResetDone(false), 3000);
    }

    function updateTime(day: keyof WeeklyAvailability, slot: keyof DailySlotTimes, field: 'start' | 'end' | 'isActive', value: string | boolean) {
        const newSettings = JSON.parse(JSON.stringify(slotSettings));
        newSettings[day][slot][field] = value;
        store.updateSlotSettings(newSettings);
    }

    function handleExport() {
        const json = store.exportData();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        a.href = url;
        a.download = `happi-flow-backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleImportClick() {
        fileInputRef.current?.click();
    }

    function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const result = store.importData(text);
            setImportMessage({
                type: result.success ? 'success' : 'error',
                text: result.message,
            });
            setTimeout(() => setImportMessage(null), 5000);
        };
        reader.readAsText(file);

        // Reset input so same file can be re-selected
        e.target.value = '';
    }

    const storageSize = new Blob([localStorage.getItem('happi-flow-data') || '']).size;
    const storageSizeKB = (storageSize / 1024).toFixed(1);

    return (
        <div className="animate-fade-in max-w-2xl">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-white mb-1">Einstellungen</h2>
                <p className="text-slate-400 text-sm">System-Konfiguration und Datenverwaltung</p>
            </div>

            {/* Import Message */}
            {importMessage && (
                <div className={`mb-6 p-4 rounded-xl flex items-center justify-between animate-fade-in ${importMessage.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-rose-500/10 border border-rose-500/20'
                    }`}>
                    <div className="flex items-center gap-2">
                        {importMessage.type === 'success'
                            ? <Check size={16} className="text-emerald-400" />
                            : <AlertTriangle size={16} className="text-rose-400" />
                        }
                        <span className={`text-sm ${importMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {importMessage.text}
                        </span>
                    </div>
                    <button
                        className="p-1 rounded hover:bg-slate-700/50 text-slate-400"
                        onClick={() => setImportMessage(null)}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Practice Hours Info */}
            <div className="glass-card rounded-xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <Clock size={16} className="text-primary-400" />
                    <h3 className="text-sm font-semibold text-white">Zeiten für Schichten (Täglich)</h3>
                </div>

                <div className="overflow-x-auto bg-slate-900/30 border border-slate-700/50 rounded-lg">
                    <table className="w-full text-xs text-left text-slate-400">
                        <thead className="text-[10px] font-bold uppercase bg-slate-800/80 text-slate-400 border-b border-slate-700/50">
                            <tr>
                                <th className="px-3 py-2 border-r border-slate-700/50">Tag</th>
                                <th className="px-3 py-2 text-center border-r border-slate-700/50">Vormittag</th>
                                <th className="px-3 py-2 text-center border-r border-slate-700/50">Mittag</th>
                                <th className="px-3 py-2 text-center">Nachmittag</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(Object.keys(DAY_FULL_LABELS) as Array<keyof WeeklyAvailability>).map(day => (
                                <tr key={day} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-800/30 text-xs">
                                    <td className="px-3 py-2 font-medium text-slate-300 border-r border-slate-700/50">{DAY_FULL_LABELS[day]}</td>
                                    {(['morning', 'noon', 'afternoon'] as Array<keyof DailySlotTimes>).map((slot) => {
                                        const time = slotSettings[day][slot];
                                        return (
                                            <td key={slot} className="px-2 py-2 text-center border-r border-slate-700/50 last:border-0">
                                                <div className="flex flex-col items-center justify-center gap-1.5">
                                                    <div className="flex items-center gap-1">
                                                        <input type="checkbox" checked={time.isActive} onChange={(e) => updateTime(day, slot, 'isActive', e.target.checked)} className="cursor-pointer" title="Schicht an diesem Tag aktivieren/deaktivieren" />
                                                        <span className="text-[10px] text-slate-500">Aktiv</span>
                                                    </div>
                                                    <div className={`flex items-center justify-center gap-1 ${!time.isActive ? 'opacity-30' : ''}`}>
                                                        <input type="time" disabled={!time.isActive} value={time.start} onChange={(e) => updateTime(day, slot, 'start', e.target.value)} className="bg-slate-800 text-slate-300 border border-slate-600 rounded px-1.5 py-1 w-[70px] focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-slate-900" />
                                                        <span className="text-slate-500">-</span>
                                                        <input type="time" disabled={!time.isActive} value={time.end} onChange={(e) => updateTime(day, slot, 'end', e.target.value)} className="bg-slate-800 text-slate-300 border border-slate-600 rounded px-1.5 py-1 w-[70px] focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-slate-900" />
                                                    </div>
                                                </div>
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/15">
                    <p className="text-[10px] text-amber-400/80">
                        💡 Diese Zeiten definieren für den Algorithmus, von wann bis wann die Schichten Vormittag/Mittag/Nachmittag genau gehen. Mitarbeiter werden nur eingeteilt, wenn ihre Verfügbarkeit diese Zeiten abdeckt, bzw. zum Start-Zeitpunkt anwesend sind.
                    </p>
                </div>
            </div>

            {/* Backup & Restore */}
            <div className="glass-card rounded-xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <Database size={16} className="text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Datensicherung</h3>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                    Sichern Sie Ihre Daten als JSON-Datei oder stellen Sie eine vorherige Sicherung wieder her.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                        id="btn-export-data"
                        className="btn-primary flex justify-center"
                        onClick={handleExport}
                    >
                        <Download size={16} />
                        Backup erstellen
                    </button>
                    <button
                        id="btn-import-data"
                        className="btn-secondary flex justify-center"
                        onClick={handleImportClick}
                    >
                        <Upload size={16} />
                        Backup importieren
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        onChange={handleImportFile}
                    />
                </div>
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/15">
                    <p className="text-[10px] text-amber-400/80">
                        ⚠️ Beim Import werden alle aktuellen Daten überschrieben. Erstellen Sie vorher ein Backup!
                    </p>
                </div>
            </div>

            {/* Data Summary */}
            <div className="glass-card rounded-xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <Database size={16} className="text-primary-400" />
                    <h3 className="text-sm font-semibold text-white">Datenspeicher</h3>
                </div>
                <div className="grid grid-cols-4 gap-3">
                    <div className="text-center p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
                        <div className="text-lg font-bold text-primary-400">{employees.length}</div>
                        <div className="text-[10px] text-slate-500">Mitarbeiter</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
                        <div className="text-lg font-bold text-accent-400">{workAreas.length}</div>
                        <div className="text-[10px] text-slate-500">Bereiche</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
                        <div className="text-lg font-bold text-emerald-400">{skills.length}</div>
                        <div className="text-[10px] text-slate-500">Skills</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
                        <div className="text-lg font-bold text-amber-400">{storageSizeKB}</div>
                        <div className="text-[10px] text-slate-500">KB Speicher</div>
                    </div>
                </div>
                <p className="text-[10px] text-slate-600 mt-3">
                    Alle Daten werden lokal in Ihrem Browser gespeichert (localStorage).
                </p>
            </div>

            {/* Phase Info */}
            <div className="glass-card rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-white mb-3">Entwicklungs-Roadmap</h3>
                <div className="space-y-3">
                    {[
                        { phase: 'Phase 1', title: 'Stammdaten-Verwaltung', status: 'active', desc: 'CRUD für Mitarbeiter, Arbeitsbereiche und Fähigkeiten' },
                        { phase: 'Phase 2', title: 'Schichtplanungs-Algorithmus', status: 'upcoming', desc: 'Automatische Besetzung, Rotation, Wochenansicht' },
                        { phase: 'Phase 3', title: 'Urlaubs- & Schließzeit-Management', status: 'upcoming', desc: 'Praxisschließzeiten, Überstundenabbau, Verwaltungsdienst' },
                        { phase: 'Phase 4', title: 'Drag & Drop Planung', status: 'upcoming', desc: 'Interaktive Wochenansicht mit manuellen Korrekturen' },
                    ].map(item => (
                        <div key={item.phase} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-700/15">
                            <div className={`w-2 h-2 rounded-full mt-1.5 ${item.status === 'active' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'
                                }`} />
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-300">{item.phase}</span>
                                    <span className="text-xs text-slate-400">– {item.title}</span>
                                    {item.status === 'active' && <span className="badge badge-success text-[9px]">Aktuell</span>}
                                </div>
                                <p className="text-[10px] text-slate-600 mt-0.5">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Reset */}
            <div className="glass-card rounded-xl p-5 border-rose-500/10">
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-rose-400" />
                    <h3 className="text-sm font-semibold text-white">Gefahrenzone</h3>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                    Setzt alle Daten auf den Ausgangszustand zurück. Mitarbeiter werden gelöscht, Bereiche und Skills auf die Standardwerte zurückgesetzt.
                </p>

                {resetDone ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <Check size={16} />
                        Daten erfolgreich zurückgesetzt!
                    </div>
                ) : showResetConfirm ? (
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-rose-400">Sind Sie sicher?</span>
                        <button className="btn-danger text-xs" onClick={handleReset}>
                            <RefreshCw size={14} />
                            Ja, zurücksetzen
                        </button>
                        <button className="btn-secondary text-xs" onClick={() => setShowResetConfirm(false)}>
                            Abbrechen
                        </button>
                    </div>
                ) : (
                    <button className="btn-danger" onClick={() => setShowResetConfirm(true)}>
                        <RefreshCw size={14} />
                        Alle Daten zurücksetzen
                    </button>
                )}
            </div>
        </div>
    );
}
