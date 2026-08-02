import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, X, Check, Search, AlertCircle, Users, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { WorkArea, AREA_COLORS, AREA_ICONS, WeeklyAvailability, DAY_FULL_LABELS, EmployeeRole } from '../types';
import { store, useStore } from '../store';
import { v4 as uuidv4 } from 'uuid';

interface AreaFormData {
    role: EmployeeRole;
    name: string;
    description: string;
    isCritical: boolean;
    operatingHours: Record<keyof WeeklyAvailability, ('morning' | 'noon' | 'afternoon')[]>;
    minStaff: number;
    requiredSkills: string[];
    icon: string;
    color: string;
}

const emptyOperatingHours = {
    monday: ['morning', 'noon', 'afternoon'],
    tuesday: ['morning', 'noon', 'afternoon'],
    wednesday: ['morning', 'noon', 'afternoon'],
    thursday: ['morning', 'noon', 'afternoon'],
    friday: ['morning', 'noon', 'afternoon'],
} as Record<keyof WeeklyAvailability, ('morning' | 'noon' | 'afternoon')[]>;

const emptyForm: AreaFormData = {
    role: 'mfa',
    name: '',
    description: '',
    isCritical: false,
    operatingHours: JSON.parse(JSON.stringify(emptyOperatingHours)),
    minStaff: 1,
    requiredSkills: [],
    icon: '🏥',
    color: AREA_COLORS[0],
};

export function WorkAreasView() {
    const { workAreas, skills } = useStore();
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<AreaFormData>(emptyForm);
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [activeRole, setActiveRole] = useState<EmployeeRole>('mfa');

    const roleAreas = workAreas.filter(a => (a.role || 'mfa') === activeRole);

    const filteredAreas = roleAreas.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    function openCreate() {
        setForm({ ...emptyForm, role: activeRole });
        setEditingId(null);
        setShowModal(true);
    }

    function openEdit(area: WorkArea) {
        setForm({
            role: area.role || 'mfa',
            name: area.name,
            description: area.description,
            isCritical: area.isCritical,
            operatingHours: JSON.parse(JSON.stringify(area.operatingHours || emptyOperatingHours)),
            minStaff: area.minStaff || 1,
            requiredSkills: [...area.requiredSkills],
            icon: area.icon,
            color: area.color,
        });
        setEditingId(area.id);
        setShowModal(true);
    }

    function handleSave() {
        if (!form.name.trim()) return;

        if (editingId) {
            store.updateWorkArea(editingId, form);
        } else {
            store.addWorkArea({
                id: uuidv4(),
                ...form,
            });
        }
        setShowModal(false);
    }

    function handleDelete(id: string) {
        store.deleteWorkArea(id);
        setDeleteConfirm(null);
    }

    function toggleSkill(skillId: string) {
        setForm(prev => ({
            ...prev,
            requiredSkills: prev.requiredSkills.includes(skillId)
                ? prev.requiredSkills.filter(s => s !== skillId)
                : [...prev.requiredSkills, skillId],
        }));
    }

    function toggleOperatingHour(day: keyof WeeklyAvailability, slot: 'morning' | 'noon' | 'afternoon') {
        setForm(prev => {
            const currentSlots = prev.operatingHours[day];
            const newSlots = currentSlots.includes(slot)
                ? currentSlots.filter(s => s !== slot)
                : [...currentSlots, slot];
            return {
                ...prev,
                operatingHours: {
                    ...prev.operatingHours,
                    [day]: newSlots
                }
            };
        });
    }

    const criticalCount = roleAreas.filter(a => a.isCritical).length;
    const optionalCount = roleAreas.filter(a => !a.isCritical).length;

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex flex-col gap-3">
                    <h2 className="text-2xl font-bold text-white mb-1">Arbeitsbereiche</h2>

                    {/* Role Tabs */}
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700 w-fit">
                        <button
                            onClick={() => setActiveRole('mfa')}
                            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeRole === 'mfa' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >MFA</button>
                        <button
                            onClick={() => setActiveRole('doctor')}
                            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeRole === 'doctor' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >Ärzte</button>
                    </div>

                    <p className="text-slate-400 text-sm">
                        {roleAreas.length} Bereiche · {criticalCount} kritisch · {optionalCount} optional
                    </p>
                </div>
                <button id="btn-add-area" className="btn-primary self-start" onClick={openCreate}>
                    <Plus size={16} />
                    Neuer Bereich
                </button>
            </div>

            {/* Search */}
            <div className="relative mb-6">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                    type="text"
                    placeholder="Bereiche durchsuchen..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="input-field pl-10"
                    id="search-areas"
                />
            </div>

            {/* Area Cards Grid */}
            {filteredAreas.length === 0 ? (
                <div className="text-center py-16">
                    <MapPinIcon />
                    <p className="text-slate-400 mt-4 text-sm">
                        {searchQuery ? 'Keine Bereiche gefunden.' : 'Noch keine Arbeitsbereiche angelegt.'}
                    </p>
                    {!searchQuery && (
                        <button className="btn-primary mt-4" onClick={openCreate}>
                            <Plus size={16} />
                            Ersten Bereich anlegen
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredAreas.map((area, i) => (
                        <div
                            key={area.id}
                            className="glass-card rounded-xl p-5 animate-fade-in"
                            style={{
                                animationDelay: `${i * 50}ms`,
                                borderColor: `${area.color}25`,
                            }}
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div
                                        className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                                        style={{ background: `${area.color}20` }}
                                    >
                                        {area.icon}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white text-sm">{area.name}</h3>
                                        <span className={area.isCritical ? 'badge badge-critical' : 'badge badge-optional'}>
                                            {area.isCritical ? '⚠ Kritisch' : '◎ Optional'}
                                        </span>
                                        {/* Removed detailed time slot badge as it is now complex per day */}
                                        {area.isCritical && area.minStaff > 1 && (
                                            <span className="badge badge-skill text-[10px] mt-0.5">
                                                <Users size={8} />
                                                Min. {area.minStaff}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <div className="flex flex-col mr-1">
                                        <button className={`p-0 text-slate-500 transition-colors ${i === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:text-white'}`} onClick={() => i > 0 && store.moveWorkArea(area.id, 'up')} title="Nach oben" disabled={i === 0}>
                                            <ChevronUp size={16} />
                                        </button>
                                        <button className={`p-0 text-slate-500 transition-colors ${i === filteredAreas.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:text-white'}`} onClick={() => i < filteredAreas.length - 1 && store.moveWorkArea(area.id, 'down')} title="Nach unten" disabled={i === filteredAreas.length - 1}>
                                            <ChevronDown size={16} />
                                        </button>
                                    </div>
                                    <button
                                        className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                                        onClick={() => openEdit(area)}
                                        title="Bearbeiten"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    {deleteConfirm === area.id ? (
                                        <div className="flex items-center gap-1">
                                            <button
                                                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 transition-colors"
                                                onClick={() => handleDelete(area.id)}
                                                title="Bestätigen"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 transition-colors"
                                                onClick={() => setDeleteConfirm(null)}
                                                title="Abbrechen"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                            onClick={() => setDeleteConfirm(area.id)}
                                            title="Löschen"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Description */}
                            {area.description && (
                                <p className="text-xs text-slate-400 mb-3 line-clamp-2">{area.description}</p>
                            )}

                            {/* Required Skills */}
                            {area.requiredSkills.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {area.requiredSkills.map(sid => {
                                        const skill = skills.find(s => s.id === sid);
                                        return skill ? (
                                            <span key={sid} className="badge badge-skill text-[10px]">{skill.name}</span>
                                        ) : null;
                                    })}
                                </div>
                            )}
                            {area.requiredSkills.length === 0 && (
                                <p className="text-[10px] text-slate-600">Keine spezifischen Skills benötigt</p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-bold text-white">
                                {editingId ? 'Bereich bearbeiten' : 'Neuer Arbeitsbereich'}
                            </h3>
                            <button
                                className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400"
                                onClick={() => setShowModal(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="space-y-4">
                                {/* Icon & Color Selection */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-2">Icon</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {AREA_ICONS.map(icon => (
                                                <button
                                                    key={icon}
                                                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all ${form.icon === icon
                                                        ? 'bg-primary-500/20 border border-primary-500/40 scale-110'
                                                        : 'bg-slate-800/50 border border-slate-700/30 hover:bg-slate-700/50'
                                                        }`}
                                                    onClick={() => setForm(prev => ({ ...prev, icon }))}
                                                >
                                                    {icon}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-2">Farbe</label>
                                        <div className="flex flex-wrap gap-1.5">
                                            {AREA_COLORS.map(color => (
                                                <button
                                                    key={color}
                                                    className={`w-8 h-8 rounded-lg transition-all ${form.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : 'hover:scale-105'
                                                        }`}
                                                    style={{ background: color }}
                                                    onClick={() => setForm(prev => ({ ...prev, color }))}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Name & Description */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Name *</label>
                                        <input
                                            type="text"
                                            value={form.name}
                                            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                            className="input-field py-1.5"
                                            placeholder="z.B. Anmeldung"
                                            autoFocus
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1">Beschreibung</label>
                                        <input
                                            type="text"
                                            value={form.description}
                                            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                            className="input-field py-1.5"
                                            placeholder="Kurzbeschreibung..."
                                        />
                                    </div>
                                </div>

                                {/* Critical Section */}
                                <div>
                                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/30 mb-2">
                                        <div>
                                            <div className="text-xs font-medium text-white flex items-center gap-2">
                                                <AlertCircle size={14} className={form.isCritical ? 'text-rose-400' : 'text-slate-500'} />
                                                Kritischer Bereich
                                            </div>
                                        </div>
                                        <button
                                            className={`toggle-switch scale-90 ${form.isCritical ? 'active' : ''}`}
                                            onClick={() => setForm(prev => ({ ...prev, isCritical: !prev.isCritical }))}
                                        />
                                    </div>

                                    {form.isCritical && (
                                        <div className="grid grid-cols-1 gap-3 p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10 animate-fade-in mb-3">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                                                    <Users size={12} />
                                                    Min. Pers.
                                                </label>
                                                <input
                                                    type="number"
                                                    value={form.minStaff}
                                                    onChange={e => setForm(prev => ({ ...prev, minStaff: Math.max(1, Number(e.target.value)) }))}
                                                    className="input-field py-1.5 w-full md:w-1/2"
                                                    min={1}
                                                    max={10}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Operating Hours (Einsatzzeiten) */}
                                    <div className="mt-4">
                                        <label className="block text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                                            <Clock size={12} />
                                            Einsatzzeiten (wann existiert dieser Bereich?)
                                        </label>
                                        <div className="bg-slate-900/30 border border-slate-700/50 rounded-lg overflow-hidden">
                                            <div className="flex bg-slate-800/80 text-[10px] font-bold text-slate-400 border-b border-slate-700/50">
                                                <div className="w-24 p-2 border-r border-slate-700/50">Tag</div>
                                                <div className="flex-1 p-2 text-center border-r border-slate-700/50">Vormittag</div>
                                                <div className="flex-1 p-2 text-center border-r border-slate-700/50">Mittag</div>
                                                <div className="flex-1 p-2 text-center">Nachmittag</div>
                                            </div>
                                            {(Object.keys(DAY_FULL_LABELS) as Array<keyof WeeklyAvailability>).map(day => (
                                                <div key={day} className="flex border-b border-slate-700/30 last:border-0 hover:bg-slate-800/30 text-xs">
                                                    <div className="w-24 p-2 font-medium text-slate-300 border-r border-slate-700/50 flex items-center">
                                                        {DAY_FULL_LABELS[day]}
                                                    </div>
                                                    <div className="flex-1 border-r border-slate-700/50 flex items-center justify-center p-1.5 hover:bg-slate-800/40 cursor-pointer" onClick={() => toggleOperatingHour(day, 'morning')}>
                                                        <input type="checkbox" checked={form.operatingHours[day].includes('morning')} onChange={() => { }} className="pointer-events-none" />
                                                    </div>
                                                    <div className="flex-1 border-r border-slate-700/50 flex items-center justify-center p-1.5 hover:bg-slate-800/40 cursor-pointer" onClick={() => toggleOperatingHour(day, 'noon')}>
                                                        <input type="checkbox" checked={form.operatingHours[day].includes('noon')} onChange={() => { }} className="pointer-events-none" />
                                                    </div>
                                                    <div className="flex-1 flex items-center justify-center p-1.5 hover:bg-slate-800/40 cursor-pointer" onClick={() => toggleOperatingHour(day, 'afternoon')}>
                                                        <input type="checkbox" checked={form.operatingHours[day].includes('afternoon')} onChange={() => { }} className="pointer-events-none" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Required Skills */}
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Benötigte Fähigkeiten</label>
                                    <div className="bg-slate-900/30 rounded-xl p-3 border border-slate-700/30 max-h-60 overflow-y-auto custom-scrollbar">
                                        {skills.filter(s => (s.role || 'mfa') === form.role).length === 0 ? (
                                            <p className="text-xs text-slate-600">Keine Skills zugewiesen.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {skills.filter(s => (s.role || 'mfa') === form.role).map(skill => (
                                                    <button
                                                        key={skill.id}
                                                        className={`chip py-0.5 px-2 text-[10px] ${form.requiredSkills.includes(skill.id)
                                                            ? '!bg-accent-500/25 !border-accent-500/40'
                                                            : 'opacity-50'
                                                            }`}
                                                        onClick={() => toggleSkill(skill.id)}
                                                    >
                                                        {form.requiredSkills.includes(skill.id) && <Check size={10} />}
                                                        {skill.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
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
                                disabled={!form.name.trim()}
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

function MapPinIcon() {
    return (
        <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/30 flex items-center justify-center mx-auto">
            <span className="text-3xl">🏥</span>
        </div>
    );
}
