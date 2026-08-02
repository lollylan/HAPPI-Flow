import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Inbox,
  Palmtree,
  Thermometer,
  Users,
} from 'lucide-react';
import type {
  Absence,
  Employee,
  IsoDate,
  PublicAbsence,
  SessionUser,
  WorkArea,
} from '@haeppi/shared';
import {
  ABSENCE_TYPE_ICONS,
  ABSENCE_TYPE_LABELS,
  DEFAULT_HOLIDAY_SETTINGS,
  WEEKDAY_SHORT,
  addDays,
  contractedHoursPerWeek,
  countWorkingDays,
  formatHHMM,
  fullName,
  holidayName,
  isWithinRange,
  isoWeekNumber,
  isoWeekday,
  minStaffFor,
  practiceWeekDates,
  roundHours,
  shortName,
  startOfISOWeek,
  todayLocal,
} from '@haeppi/shared';
import {
  useAbsences,
  useDayBlocks,
  useEmployees,
  useRoster,
  useSettings,
  useVacationBalance,
  useWorkAreas,
} from '../api/queries';
import { Card, PageHeader } from '../components/ui';

export function DashboardView({ user }: { user: SessionUser }) {
  const today = todayLocal();
  const weekStart = startOfISOWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const { data: employees } = useEmployees();
  const { data: absences } = useAbsences(weekStart, weekEnd);
  const { data: settings } = useSettings();

  const holidays = settings?.holidays ?? DEFAULT_HOLIDAY_SETTINGS;
  const todayHoliday = holidayName(today, holidays.state, holidays.options);

  const absentToday = (absences ?? []).filter((entry) =>
    isWithinRange(today, entry.startDate, entry.endDate),
  );
  const absentIds = new Set(absentToday.map((entry) => entry.employeeId));

  const presentToday = (employees ?? []).filter((employee) => {
    if (absentIds.has(employee.id)) return false;
    const weekday = isoWeekday(today);
    return weekday <= 5 && employee.workTimes[weekday as 1]?.isWorking;
  });

  return (
    <div className="p-8">
      <PageHeader
        title={`Guten Tag, ${user.displayName.split(' ')[0]}`}
        subtitle={`${new Date(`${today}T12:00:00`).toLocaleDateString('de-DE', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })} · KW ${isoWeekNumber(today)}${todayHoliday ? ` · ${todayHoliday}` : ''}`}
      />

      {user.role === 'admin' ? (
        <AdminDashboard
          today={today}
          weekStart={weekStart}
          presentCount={presentToday.length}
          absentToday={absentToday}
          employees={employees ?? []}
        />
      ) : (
        <EmployeeDashboard user={user} today={today} weekStart={weekStart} />
      )}
    </div>
  );
}

// ------------------------------------------------------------- Admin --

function AdminDashboard({
  today,
  weekStart,
  presentCount,
  absentToday,
  employees,
}: {
  today: IsoDate;
  weekStart: IsoDate;
  presentCount: number;
  absentToday: readonly (Absence | PublicAbsence)[];
  employees: readonly Employee[];
}) {
  const year = Number(today.slice(0, 4));
  const { data: workAreas } = useWorkAreas();
  const { data: dayBlocks } = useDayBlocks();
  const { data: mfaRoster } = useRoster(weekStart, addDays(weekStart, 6), 'mfa');
  const { data: yearAbsences } = useAbsences(`${year}-01-01`, `${year}-12-31`);

  const requests = useMemo(
    () =>
      ((yearAbsences ?? []) as Absence[]).filter(
        (entry) => 'status' in entry && entry.status === 'requested',
      ),
    [yearAbsences],
  );

  const sickStats = useMemo(() => {
    const sick = ((yearAbsences ?? []) as Absence[]).filter(
      (entry) => 'type' in entry && entry.type === 'sick',
    );
    const perEmployee = new Map<string, number>();
    for (const entry of sick) {
      // Kalendertage genuegen fuer die Uebersicht; die genaue
      // Arbeitstagsrechnung haengt am Arbeitszeitmodell der Person.
      const days = countWorkingDays(
        { startDate: entry.startDate, endDate: entry.endDate },
        { 1: WORK, 2: WORK, 3: WORK, 4: WORK, 5: WORK },
      );
      perEmployee.set(entry.employeeId, (perEmployee.get(entry.employeeId) ?? 0) + days);
    }
    const total = [...perEmployee.values()].reduce((sum, value) => sum + value, 0);
    return { total, cases: sick.length, perEmployee };
  }, [yearAbsences]);

  const coverage = useMemo(() => {
    if (!workAreas || !dayBlocks || !mfaRoster) return null;
    const critical = workAreas.filter((area) => area.plan === 'mfa' && area.isCritical);
    const gaps: {
      date: IsoDate;
      area: WorkArea;
      blockLabel: string;
      have: number;
      need: number;
    }[] = [];

    for (const date of practiceWeekDates(weekStart)) {
      for (const block of dayBlocks.filter(
        (entry) => entry.weekday === isoWeekday(date) && entry.kind !== 'closed',
      )) {
        for (const area of critical) {
          if (!area.blockIds.includes(block.id)) continue;
          const need = minStaffFor(area, block.id);
          const have = mfaRoster.filter(
            (entry) =>
              entry.date === date && entry.dayBlockId === block.id && entry.workAreaId === area.id,
          ).length;
          if (have < need) {
            gaps.push({
              date,
              area,
              blockLabel: `${formatHHMM(block.startMin)}–${formatHHMM(block.endMin)}`,
              have,
              need,
            });
          }
        }
      }
    }
    return gaps;
  }, [workAreas, dayBlocks, mfaRoster, weekStart]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Users}
          label="Heute im Dienst"
          value={String(presentCount)}
          hint={`von ${employees.length} im Team`}
        />
        <Stat
          icon={Palmtree}
          label="Heute abwesend"
          value={String(absentToday.length)}
          hint={absentToday.length === 0 ? 'niemand fehlt' : 'siehe Abwesenheiten'}
          to="/abwesenheiten"
        />
        <Stat
          icon={Inbox}
          label="Offene Anträge"
          value={String(requests.length)}
          hint={requests.length > 0 ? 'warten auf Entscheidung' : 'nichts offen'}
          tone={requests.length > 0 ? 'amber' : undefined}
          to="/abwesenheiten"
        />
        <Stat
          icon={Thermometer}
          label={`Krankheitstage ${year}`}
          value={String(sickStats.total)}
          hint={`${sickStats.cases} Fälle im Team`}
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-1 font-medium">Kritische Bereiche diese Woche</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          KW {isoWeekNumber(weekStart)} · MFA-Plan
        </p>

        {coverage === null ? (
          <p className="text-sm text-slate-500">Wird geladen …</p>
        ) : coverage.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            Alle Pflichtplätze sind besetzt.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {coverage.slice(0, 12).map((gap, index) => (
              <li key={index} className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0 text-red-500" />
                <span className="font-medium">
                  {gap.area.icon} {gap.area.name}
                </span>
                <span className="text-slate-500">
                  {WEEKDAY_SHORT[isoWeekday(gap.date)]}, {gap.blockLabel}
                </span>
                <span className="ml-auto rounded bg-red-100 px-1.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                  {gap.have}/{gap.need}
                </span>
              </li>
            ))}
            {coverage.length > 12 && (
              <li className="pt-1 text-xs text-slate-500">… und {coverage.length - 12} weitere.</li>
            )}
            <li className="pt-2">
              <Link
                to="/dienstplan"
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Zum Dienstplan →
              </Link>
            </li>
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-medium">Wochenstunden laut Arbeitszeitmodell</h2>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {employees.map((employee) => {
            const contracted = roundHours(contractedHoursPerWeek(employee.workTimes));
            const deviates = Math.abs(contracted - employee.targetHoursPerWeek) > 0.25;
            return (
              <li key={employee.id} className="flex items-center gap-2 py-1.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: employee.color }}
                />
                {shortName(employee)}
                <span className="tabular ml-auto">
                  <span className={deviates ? 'text-amber-600 dark:text-amber-400' : ''}>
                    {contracted.toLocaleString('de-DE')} h
                  </span>
                  <span className="ml-1 text-xs text-slate-400">
                    / {employee.targetHoursPerWeek} h
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

const WORK = { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 } as const;

// -------------------------------------------------------- Mitarbeiter --

function EmployeeDashboard({
  user,
  today,
  weekStart,
}: {
  user: SessionUser;
  today: IsoDate;
  weekStart: IsoDate;
}) {
  const { data: mfaRoster } = useRoster(weekStart, addDays(weekStart, 6), 'mfa');
  const { data: doctorRoster } = useRoster(weekStart, addDays(weekStart, 6), 'doctor');
  const { data: workAreas } = useWorkAreas();
  const { data: dayBlocks } = useDayBlocks();
  const { data: balance } = useVacationBalance(user.employeeId, Number(today.slice(0, 4)));

  const mine = [...(mfaRoster ?? []), ...(doctorRoster ?? [])].filter(
    (entry) => entry.employeeId === user.employeeId,
  );

  const describe = (dayBlockId: string) => {
    const block = dayBlocks?.find((entry) => entry.id === dayBlockId);
    return block ? `${formatHHMM(block.startMin)}–${formatHHMM(block.endMin)}` : '';
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h2 className="mb-3 font-medium">Meine Woche</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">Für diese Woche ist noch kein Plan hinterlegt.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-5">
            {practiceWeekDates(weekStart).map((date) => {
              const entries = mine
                .filter((entry) => entry.date === date)
                .sort((a, b) => describe(a.dayBlockId).localeCompare(describe(b.dayBlockId)));
              return (
                <div
                  key={date}
                  className={`rounded-xl border p-3 ${
                    date === today
                      ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="mb-2 text-xs font-medium text-slate-500">
                    {WEEKDAY_SHORT[isoWeekday(date)]}, {date.slice(8)}.{date.slice(5, 7)}.
                  </div>
                  {entries.length === 0 ? (
                    <div className="text-xs text-slate-400">frei</div>
                  ) : (
                    <ul className="space-y-1.5">
                      {entries.map((entry) => {
                        const area = workAreas?.find((item) => item.id === entry.workAreaId);
                        return (
                          <li key={entry.id} className="text-xs">
                            <div className="font-medium">
                              {area?.icon} {area?.name ?? 'Bereich'}
                            </div>
                            <div className="tabular text-slate-500">
                              {describe(entry.dayBlockId)}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Link
          to="/dienstplan"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Kompletten Dienstplan ansehen →
        </Link>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-medium">Mein Urlaub</h2>
        {balance ? (
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Anspruch</dt>
              <dd className="tabular">{balance.balance.entitlement} Tage</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Übertrag</dt>
              <dd className="tabular">{balance.balance.carryover} Tage</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Genommen</dt>
              <dd className="tabular">{balance.balance.used} Tage</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-medium dark:border-slate-800">
              <dt>Noch offen</dt>
              <dd
                className={`tabular ${
                  balance.balance.remaining < 0 ? 'text-red-600 dark:text-red-400' : ''
                }`}
              >
                {balance.balance.remaining} Tage
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">Kein Urlaubskonto hinterlegt.</p>
        )}
        <Link
          to="/abwesenheiten"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Urlaub beantragen →
        </Link>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------- Bausteine --

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  to,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  tone?: 'amber';
  to?: string;
}) {
  const content = (
    <Card
      className={`p-5 transition ${to ? 'hover:border-slate-300 dark:hover:border-slate-700' : ''} ${
        tone === 'amber' ? 'border-amber-300 dark:border-amber-800' : ''
      }`}
    >
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className={`size-4 ${tone === 'amber' ? 'text-amber-500' : ''}`} />
        <span className="text-sm">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>
    </Card>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

export { ABSENCE_TYPE_ICONS, ABSENCE_TYPE_LABELS, CalendarClock, fullName };
