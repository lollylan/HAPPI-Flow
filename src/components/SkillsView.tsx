import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, Trash2, X, Check, Search, Tag } from 'lucide-react';
import { Skill } from '../types';
import { store, useStore } from '../store';
import { v4 as uuidv4 } from 'uuid';

const SKILL_CATEGORIES = ['Medizinisch', 'Verwaltung', 'Sonstiges'];

interface SkillFormData {
    name: string;
    description: string;
    category: string;
}

const emptyForm: SkillFormData = {
    name: '',
    description: '',
    category: 'Medizinisch',
};

export function SkillsView() {
    const { skills, employees, workAreas } = useStore();
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<SkillFormData>(emptyForm);
    const [searchQuery, setSearchQuery] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>('all');

    const filteredSkills = skills
        .filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .filter(s => filterCategory === 'all' || s.category === filterCategory);

    // Group by category
    const grouped = filteredSkills.reduce((acc, skill) => {
        const cat = skill.category || 'Sonstiges';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(skill);
        return acc;
    }, {} as Record<string, Skill[]>);

    function openCreate() {
        setForm(emptyForm);
        setEditingId(null);
        setShowModal(true);
    }

    function openEdit(skill: Skill) {
        setForm({
            name: skill.name,
            description: skill.description,
            category: skill.category,
        });
        setEditingId(skill.id);
        setShowModal(true);
    }

    function handleSave() {
        if (!form.name.trim()) return;

        if (editingId) {
            store.updateSkill(editingId, form);
        } else {
            store.addSkill({
                id: uuidv4(),
                ...form,
            });
        }
        setShowModal(false);
    }

    function handleDelete(id: string) {
        store.deleteSkill(id);
        setDeleteConfirm(null);
    }

    function getSkillUsage(skillId: string) {
        const empCount = employees.filter(e => e.skills.includes(skillId)).length;
        const areaCount = workAreas.filter(a => a.requiredSkills.includes(skillId)).length;
        return { empCount, areaCount };
    }

    const categoryColors: Record<string, string> = {
        'Medizinisch': 'from-rose-500/20 to-rose-500/5 border-rose-500/20',
        'Verwaltung': 'from-primary-500/20 to-primary-500/5 border-primary-500/20',
        'Sonstiges': 'from-slate-500/20 to-slate-500/5 border-slate-500/20',
    };

    const categoryIcons: Record<string, string> = {
        'Medizinisch': '💉',
        'Verwaltung': '📋',
        'Sonstiges': '🔧',
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Fähigkeiten & Skills</h2>
                    <p className="text-slate-400 text-sm">
                        {skills.length} Qualifikationen verwalten
                    </p>
                </div>
                <button id="btn-add-skill" className="btn-primary" onClick={openCreate}>
                    <Plus size={16} />
                    Neue Fähigkeit
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Skills durchsuchen..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="input-field pl-10"
                        id="search-skills"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterCategory === 'all'
                            ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                            : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'
                            }`}
                        onClick={() => setFilterCategory('all')}
                    >
                        Alle
                    </button>
                    {SKILL_CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filterCategory === cat
                                ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700/50'
                                }`}
                            onClick={() => setFilterCategory(cat)}
                        >
                            {categoryIcons[cat]} {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Skills grouped by category */}
            {Object.keys(grouped).length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/30 flex items-center justify-center mx-auto">
                        <Tag size={28} className="text-slate-600" />
                    </div>
                    <p className="text-slate-400 mt-4 text-sm">
                        {searchQuery ? 'Keine Skills gefunden.' : 'Noch keine Fähigkeiten angelegt.'}
                    </p>
                    {!searchQuery && (
                        <button className="btn-primary mt-4" onClick={openCreate}>
                            <Plus size={16} />
                            Erste Fähigkeit anlegen
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(grouped).map(([category, catSkills]) => (
                        <div key={category}>
                            <div className="flex items-center gap-2 mb-3">
                                <span>{categoryIcons[category] || '🔧'}</span>
                                <h3 className="text-sm font-semibold text-slate-300">{category}</h3>
                                <span className="text-xs text-slate-500">({catSkills.length})</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {catSkills.map((skill, i) => {
                                    const usage = getSkillUsage(skill.id);
                                    return (
                                        <div
                                            key={skill.id}
                                            className={`glass-card rounded-xl p-4 animate-fade-in bg-gradient-to-br ${categoryColors[category] || categoryColors['Sonstiges']}`}
                                            style={{ animationDelay: `${i * 40}ms` }}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <h4 className="font-semibold text-white text-sm">{skill.name}</h4>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
                                                        onClick={() => openEdit(skill)}
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    {deleteConfirm === skill.id ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400"
                                                                onClick={() => handleDelete(skill.id)}
                                                            >
                                                                <Check size={12} />
                                                            </button>
                                                            <button
                                                                className="p-1.5 rounded-lg hover:bg-slate-700/50 text-slate-400"
                                                                onClick={() => setDeleteConfirm(null)}
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                                                            onClick={() => setDeleteConfirm(skill.id)}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {skill.description && (
                                                <p className="text-xs text-slate-400 mb-3">{skill.description}</p>
                                            )}
                                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                                <span>{usage.empCount} Mitarbeiter</span>
                                                <span>•</span>
                                                <span>{usage.areaCount} Bereiche</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="text-lg font-bold text-white">
                                {editingId ? 'Fähigkeit bearbeiten' : 'Neue Fähigkeit'}
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
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Name *</label>
                                    <input
                                        type="text"
                                        value={form.name}
                                        onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="input-field"
                                        placeholder="z.B. Blutentnahme, EKG..."
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Kategorie</label>
                                    <select
                                        value={form.category}
                                        onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                                        className="input-field"
                                    >
                                        {SKILL_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Beschreibung</label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                        className="input-field resize-none"
                                        rows={2}
                                        placeholder="Was beinhaltet diese Qualifikation?"
                                    />
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
