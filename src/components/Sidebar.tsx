import React from 'react';
import {
    LayoutDashboard,
    Users,
    MapPin,
    Award,
    Settings,
    Activity,
    Calendar,
    Palmtree,
    LogOut,
    Moon,
    Sun,
} from 'lucide-react';
import { ActiveView } from '../types';
import { useState, useEffect } from 'react';
import { store, useStore } from '../store';
import { useAuth } from '../AuthContext';

function NavItem({
    id,
    label,
    icon,
    active,
    onClick
}: {
    id: ActiveView,
    label: string,
    icon: React.ReactNode,
    active: boolean,
    onClick: () => void
}) {
    return (
        <button
            id={`nav-${id}`}
            className={`nav-item w-full ${active ? 'active' : ''}`}
            onClick={onClick}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}

export function Sidebar() {
    const { activeView } = useStore();
    const { role, logout } = useAuth();
    const isAdmin = role === 'admin';

    const [isLightMode, setIsLightMode] = useState(() => {
        return localStorage.getItem('theme') === 'light';
    });

    useEffect(() => {
        if (isLightMode) {
            document.body.classList.add('light-mode');
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('light-mode');
            localStorage.setItem('theme', 'dark');
        }
    }, [isLightMode]);

    return (
        <aside className="w-64 h-screen fixed left-0 top-0 glass flex flex-col z-40">
            {/* Logo */}
            <div className="p-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    H
                </div>
                <div>
                    <h1 className="text-lg font-bold text-white tracking-tight">HÄPPI-Flow</h1>
                    <p className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Praxisplanung</p>
                </div>
            </div>

            {/* Status Indicator */}
            <div className="mx-4 mb-4 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-medium">Verbunden</span>
                </div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {isAdmin ? 'Admin' : 'Mitarbeiter'}
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar">
                <NavItem
                    id="dashboard"
                    icon={<LayoutDashboard size={20} />}
                    label="Dashboard"
                    active={activeView === 'dashboard'}
                    onClick={() => store.setActiveView('dashboard')}
                />

                <div className="pt-4 pb-2">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">Planung</div>
                </div>

                <NavItem
                    id="roster"
                    icon={<Calendar size={20} />}
                    label="Dienstplan"
                    active={activeView === 'roster'}
                    onClick={() => store.setActiveView('roster')}
                />
                <NavItem
                    id="vacation"
                    icon={<Palmtree size={20} />}
                    label="Urlaubsplanung"
                    active={activeView === 'vacation'}
                    onClick={() => store.setActiveView('vacation')}
                />

                {isAdmin && (
                    <>
                        <div className="pt-4 pb-2">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">Verwaltung</div>
                        </div>

                        <NavItem
                            id="employees"
                            icon={<Users size={20} />}
                            label="Mitarbeiter"
                            active={activeView === 'employees'}
                            onClick={() => store.setActiveView('employees')}
                        />
                        <NavItem
                            id="workAreas"
                            icon={<MapPin size={20} />}
                            label="Arbeitsbereiche"
                            active={activeView === 'workAreas'}
                            onClick={() => store.setActiveView('workAreas')}
                        />
                        <NavItem
                            id="skills"
                            icon={<Award size={20} />}
                            label="Fähigkeiten"
                            active={activeView === 'skills'}
                            onClick={() => store.setActiveView('skills')}
                        />
                    </>
                )}
            </nav>

            {/* Bottom Actions */}
            <div className="p-3 border-t border-slate-700/50 space-y-1">
                {isAdmin && (
                    <NavItem
                        id="settings"
                        icon={<Settings size={20} />}
                        label="Einstellungen"
                        active={activeView === 'settings'}
                        onClick={() => store.setActiveView('settings')}
                    />
                )}
                <button
                    className="nav-item w-full text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    onClick={() => {
                        logout();
                        store.setActiveView('dashboard');
                    }}
                >
                    <LogOut size={20} />
                    <span>Abmelden</span>
                </button>
                <div className="pt-2">
                    <button
                        className="nav-item w-full text-slate-400 hover:text-white hover:bg-slate-700/50"
                        onClick={() => setIsLightMode(!isLightMode)}
                    >
                        {isLightMode ? <Moon size={20} /> : <Sun size={20} />}
                        <span>{isLightMode ? 'Nachtmodus' : 'Tagmodus'}</span>
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-700/30">
                <p className="text-[10px] text-slate-500 text-center">
                    HÄPPI-Flow v1.1
                </p>
            </div>
        </aside>
    );
}
