import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Grid3x3,
  LayoutDashboard,
  LogOut,
  Moon,
  Palmtree,
  Settings,
  Stethoscope,
  Sun,
  Users,
} from 'lucide-react';
import type { SessionUser } from '@haeppi/shared';
import { useLogout, useProposals } from '../api/queries';

interface NavEntry {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
  /** Noch nicht gebaut - wird ausgegraut statt versteckt. */
  planned?: boolean;
}

const NAV: readonly { section: string; entries: readonly NavEntry[] }[] = [
  {
    section: 'Übersicht',
    entries: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    section: 'Planung',
    entries: [
      { to: '/dienstplan', label: 'Dienstplan', icon: CalendarDays },
      { to: '/musterwoche', label: 'Musterwoche', icon: CalendarRange, adminOnly: true },
      { to: '/abwesenheiten', label: 'Abwesenheiten', icon: Palmtree },
    ],
  },
  {
    section: 'Verwaltung',
    entries: [
      { to: '/mitarbeiter', label: 'Mitarbeiter', icon: Users },
      { to: '/matrix', label: 'Einsatz-Matrix', icon: Grid3x3, adminOnly: true },
      { to: '/bereiche', label: 'Arbeitsbereiche', icon: Stethoscope, adminOnly: true },
    ],
  },
  {
    section: 'System',
    entries: [
      { to: '/zeitmodell', label: 'Zeitmodell', icon: Clock, adminOnly: true },
      { to: '/einstellungen', label: 'Einstellungen', icon: Settings, adminOnly: true },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('haeppi-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('haeppi-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return { dark, toggle: () => setDark((value) => !value) };
}

export function AppShell({ user }: { user: SessionUser }) {
  const logout = useLogout();
  const { dark, toggle } = useTheme();
  const { data: proposals } = useProposals(user.role === 'admin');
  const openProposals = proposals?.openCount ?? 0;

  return (
    <div className="flex min-h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="font-semibold tracking-tight">HÄPPI-Flow</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Dienstplanung</div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group) => {
            const entries = group.entries.filter(
              (entry) => !entry.adminOnly || user.role === 'admin',
            );
            if (entries.length === 0) return null;
            return (
              <div key={group.section} className="mb-5">
                <div className="mb-1 px-2 text-xs font-medium tracking-wide text-slate-400 uppercase">
                  {group.section}
                </div>
                {entries.map((entry) =>
                  entry.planned ? (
                    <div
                      key={entry.to}
                      title="Kommt in einer der nächsten Etappen"
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-400 dark:text-slate-600"
                    >
                      <entry.icon className="size-4" />
                      {entry.label}
                    </div>
                  ) : (
                    <NavLink
                      key={entry.to}
                      to={entry.to}
                      end={entry.to === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition ${
                          isActive
                            ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`
                      }
                    >
                      <entry.icon className="size-4" />
                      {entry.label}
                      {entry.to === '/dienstplan' && openProposals > 0 && (
                        <span
                          className="ml-auto rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white"
                          title="Offene Umplanungsvorschläge"
                        >
                          {openProposals}
                        </span>
                      )}
                    </NavLink>
                  ),
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="px-2 pb-2">
            <div className="truncate text-sm font-medium">{user.displayName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {user.role === 'admin' ? 'Praxisleitung' : 'Mitarbeiter/in'}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggle}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              title={dark ? 'Helles Design' : 'Dunkles Design'}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <button
              onClick={() => logout.mutate()}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              title="Abmelden"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
