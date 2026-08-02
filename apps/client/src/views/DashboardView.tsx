import { CalendarClock, CircleCheck, Users } from 'lucide-react';
import type { SessionUser } from '@haeppi/shared';
import {
  DEFAULT_HOLIDAY_SETTINGS,
  addDays,
  germanStateName,
  holidayName,
  isoWeekNumber,
  practiceWeekDates,
  todayLocal,
} from '@haeppi/shared';
import { useEmployees } from '../api/queries';

/**
 * Vorlaeufiges Dashboard. Die eigentlichen Kacheln (Besetzungsampel, offene
 * Urlaubsantraege, Krankenstand, Ist/Soll-Stunden) kommen in Etappe 6 - sie
 * setzen den Dienstplan voraus, den es noch nicht gibt.
 */
export function DashboardView({ user }: { user: SessionUser }) {
  const today = todayLocal();
  const { data: employees } = useEmployees();
  const week = practiceWeekDates(today);

  return (
    <div className="p-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">
          Guten Tag, {user.displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Kalenderwoche {isoWeekNumber(today)} ·{' '}
          {new Date(today + 'T12:00:00').toLocaleDateString('de-DE', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          icon={Users}
          label="Team"
          value={employees ? String(employees.length) : '–'}
          hint="aktive Mitarbeiterinnen und Mitarbeiter"
        />
        <Card
          icon={CalendarClock}
          label="Feiertagsregion"
          value={germanStateName(DEFAULT_HOLIDAY_SETTINGS.state)}
          hint="in den Einstellungen änderbar"
        />
        <Card
          icon={CircleCheck}
          label="Aufbaustand"
          value="Etappe 1"
          hint="Fundament, Anmeldung, Stammdaten"
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Diese Woche
        </h2>
        <div className="grid gap-2 sm:grid-cols-5">
          {week.map((date) => {
            const holiday = holidayName(
              date,
              DEFAULT_HOLIDAY_SETTINGS.state,
              DEFAULT_HOLIDAY_SETTINGS.options,
            );
            return (
              <div
                key={date}
                className={`rounded-xl border p-3 ${
                  date === today
                    ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
                    : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </div>
                <div className="mt-1 text-sm">
                  {holiday ? (
                    <span className="text-amber-600 dark:text-amber-400">{holiday}</span>
                  ) : (
                    <span className="text-slate-400">Kein Plan hinterlegt</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Nächster gesetzlicher Feiertag:{' '}
          {(() => {
            for (let offset = 1; offset <= 400; offset++) {
              const date = addDays(today, offset);
              const name = holidayName(
                date,
                DEFAULT_HOLIDAY_SETTINGS.state,
                DEFAULT_HOLIDAY_SETTINGS.options,
              );
              if (name) {
                return `${name} am ${new Date(date + 'T12:00:00').toLocaleDateString('de-DE')}`;
              }
            }
            return 'unbekannt';
          })()}
        </p>
      </section>
    </div>
  );
}

interface CardProps {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}

function Card({ icon: Icon, label, value, hint }: CardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className="size-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
    </div>
  );
}
