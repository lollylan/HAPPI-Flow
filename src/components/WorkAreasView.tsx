import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, X, Check, Search, AlertCircle, Users, Clock } from 'lucide-react';
import { WorkArea, CriticalTimeSlot, AREA_COLORS, AREA_ICONS, CRITICAL_TIMESLOT_OPTIONS, CRITICAL_TIMESLOT_LABELS } from '../types';
import { store, useStore } from '../store';
import { v4 as uuidv4 } from 'uuid';

interface AreaFormData {
    name: string;
    description: string;
    isCritical: boolean;
    criticalTimeSlot: CriticalTimeSlot;
    minStaff: number;
    requiredSkills: string[];
    icon: string;
    color: string;
}

const emptyForm: AreaFormData = {
    name: '',
    description: '',
    isCritical: false,
    criticalTimeSlot: 'allday',
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

    const filteredAreas = workAreas.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    function openCreate() {
        setForm(emptyForm);
        setEditingId(null);
        setShowModal(true);
    }

    function openEdit(area: WorkArea) {
        setForm({
            name: area.name,
            description: area.description,
            isCritical: area.isCritical,
            criticalTimeSlot: area.criticalTimeSlot || 'allday',
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

    const criticalCount = workAreas.filter(a => a.isCritical).length;
    const optionalCount = workAreas.filter(a => !a.isCritical).length;

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Arbeitsbereiche</h2>
                    <p className="text-slate-400 text-sm">
                        {workAreas.length} Bereiche · {criticalCount} kritisch · {optionalCount} optional
                    </p>
                </div>
                <button id="btn-add-area" className="btn-primary" onClick={openCreate}>
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
                                        <div className="grid grid-cols-2 gap-3 p-2.5 rounded-lg bg-rose-500/5 border border-rose-500/10 animate-fade-in">
                                            <div>
                                                <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                                                    <Users size={12} />
                                                    Min. Pers.
                                                </label>
                                                <input
                                                    type="number"
                                                    value={form.minStaff}
                                                    onChange={e => setForm(prev => ({ ...prev, minStaff: Math.max(1, Number(e.target.value)) }))}
                                                    className="input-field py-1.5"
                                                    min={1}
                                                    max={10}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                                                    <Clock size={12} />
                                                    Zeitfenster
                                                </label>
                                                <select
                                                    value={form.criticalTimeSlot}
                                                    onChange={e => setForm(prev => ({ ...prev, criticalTimeSlot: e.target.value as CriticalTimeSlot }))}
                                                    className="input-field py-1.5"
                                                >
                                                    {CRITICAL_TIMESLOT_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Required Skills */}
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Benötigte Fähigkeiten</label>
                                    <div className="bg-slate-900/30 rounded-xl p-3 border border-slate-700/30 max-h-60 overflow-y-auto custom-scrollbar">
                                        {skills.length === 0 ? (
                                            <p className="text-xs text-slate-600">Keine Skills zugewiesen.</p>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {skills.map(skill => (
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
