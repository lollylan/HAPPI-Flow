import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { IsoDate } from '@haeppi/shared';
import {
  DEFAULT_HOLIDAY_SETTINGS,
  PLAN_KINDS,
  PLAN_LABELS,
  WEEKDAY_LABELS,
  addDays,
  formatHHMM,
  fullName,
  holidayName,
  isWithinRange,
  isoWeekNumber,
  isoWeekday,
  practiceWeekDates,
  shortName,
  startOfISOWeek,
  todayLocal,
} from '@haeppi/shared';
import {
  useAbsences,
  useClosures,
  useDayBlocks,
  useDuties,
  useEmployees,
  useRoster,
  useSettings,
  useWorkAreas,
} from '../api/queries';

/**
 * Druckansichten.
 *
 * Bewusst eigene Routen statt eines PDF-Bastelwegs: die Vorgaengerversion
 * rasterte den Bildschirm mit html-to-image und legte das Bild in ein PDF -
 * das Ergebnis war unscharf und nicht durchsuchbar. Hier druckt der Browser
 * echten Text.
 */

function usePrintTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    // Der Dateiname beim "Als PDF speichern" kommt aus dem Dokumenttitel.
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

function useWeekParam(): IsoDate {
  const [params] = useSearchParams();
  return startOfISOWeek(params.get('woche') ?? todayLocal());
}

const SHEET =
  'mx-auto max-w-[277mm] bg-white p-8 text-black print:max-w-none print:p-0 dark:bg-white';

function PrintButton() {
  return (
    <div className="mx-auto mb-4 max-w-[277mm] print:hidden">
      <button
        onClick={() => window.print()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Drucken
      </button>
    </div>
  );
}

/** Übersichtsplan für das schwarze Brett – A4 quer, alle Gruppen auf einem Blatt. */
export function PrintWeekPlan() {
  const weekStart = useWeekParam();
  const weekEnd = addDays(weekStart, 6);
  const days = practiceWeekDates(weekStart);

  const { data: employees } = useEmployees();
  const { data: workAreas } = useWorkAreas();
  const { data: dayBlocks } = useDayBlocks();
  const { data: settings } = useSettings();
  const { data: assignments } = useRoster(weekStart, weekEnd);
  const { data: absences } = useAbsences(weekStart, weekEnd);
  const { data: closures } = useClosures();
  const { data: duties } = useDuties(weekStart, weekEnd);

  usePrintTitle(`Dienstplan KW ${isoWeekNumber(weekStart)}`);

  const holidays = settings?.holidays ?? DEFAULT_HOLIDAY_SETTINGS;
  const byId = new Map((employees ?? []).map((employee) => [employee.id, employee]));
  const groups = PLAN_KINDS.map((plan) => ({
    plan,
    areas: (workAreas ?? []).filter((area) => area.plan === plan),
  })).filter((group) => group.areas.length > 0);

  const closureOf = (date: IsoDate) =>
    (closures ?? []).find((closure) => isWithinRange(date, closure.startDate, closure.endDate));

  return (
    <>
      <style>{'@page { size: A4 landscape; margin: 12mm; }'}</style>
      <PrintButton />
      <div className={SHEET}>
        <header className="mb-4 flex items-baseline justify-between border-b-2 border-black pb-2">
          <h1 className="text-xl font-bold">Dienstplan · KW {isoWeekNumber(weekStart)}</h1>
          <span className="text-sm">
            {settings?.practiceName ?? 'Praxis'} ·{' '}
            {new Date(`${weekStart}T12:00:00`).toLocaleDateString('de-DE')} –{' '}
            {new Date(`${addDays(weekStart, 4)}T12:00:00`).toLocaleDateString('de-DE')}
          </span>
        </header>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-slate-400 bg-slate-100 p-1 text-left">Bereich</th>
              {days.map((date) => {
                const holiday = holidayName(date, holidays.state, holidays.options);
                const closure = closureOf(date);
                return (
                  <th key={date} className="border border-slate-400 bg-slate-100 p-1">
                    {WEEKDAY_LABELS[isoWeekday(date)]}
                    <div className="font-normal">
                      {date.slice(8)}.{date.slice(5, 7)}.
                    </div>
                    {holiday && <div className="font-normal italic">{holiday}</div>}
                    {!holiday && closure && (
                      <div className="font-normal italic">
                        Schließzeit{closure.description ? ` ${closure.description}` : ''}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className="border border-slate-400 p-1 text-left align-top whitespace-nowrap">
                Abwesend
              </th>
              {days.map((date) => {
                const names = (absences ?? [])
                  .filter((absence) => isWithinRange(date, absence.startDate, absence.endDate))
                  .map((absence) => {
                    const employee = byId.get(absence.employeeId);
                    const suffix =
                      absence.halfDay === 'am'
                        ? ' (vorm.)'
                        : absence.halfDay === 'pm'
                          ? ' (nachm.)'
                          : '';
                    return employee ? `${shortName(employee)}${suffix}` : '?';
                  });
                const onDuty = (duties ?? [])
                  .filter((duty) => duty.date === date)
                  .map((duty) => byId.get(duty.employeeId))
                  .map((employee) => (employee ? shortName(employee) : '?'));
                return (
                  <td key={date} className="border border-slate-400 p-1 align-top">
                    {names.length === 0 && onDuty.length === 0 ? (
                      <span className="italic text-slate-400">—</span>
                    ) : (
                      <>
                        {names.map((name) => (
                          <div key={name}>{name}</div>
                        ))}
                        {onDuty.length > 0 && <div>Notbesetzung: {onDuty.join(', ')}</div>}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
            {groups.map((group) => (
              <GroupPrintRows
                key={group.plan}
                label={PLAN_LABELS[group.plan]}
                areas={group.areas}
                days={days}
                blocks={(dayBlocks ?? []).filter((block) => block.plan === group.plan)}
                assignments={assignments ?? []}
                byId={byId}
                closedOn={(date) =>
                  holidayName(date, holidays.state, holidays.options) !== null ||
                  closureOf(date) !== undefined
                }
              />
            ))}
          </tbody>
        </table>

        <footer className="mt-3 text-[9px] text-slate-500">
          Erstellt am {new Date().toLocaleDateString('de-DE')} · HÄPPI-Flow
        </footer>
      </div>
    </>
  );
}

function GroupPrintRows({
  label,
  areas,
  days,
  blocks,
  assignments,
  byId,
  closedOn,
}: {
  label: string;
  areas: readonly { id: string; icon: string; name: string; blockIds: readonly string[] }[];
  days: readonly IsoDate[];
  blocks: readonly {
    id: string;
    weekday: number;
    kind: string;
    startMin: number;
    endMin: number;
  }[];
  assignments: readonly {
    date: string;
    dayBlockId: string;
    workAreaId: string;
    employeeId: string;
  }[];
  byId: Map<string, { firstName: string; lastName: string }>;
  closedOn: (date: IsoDate) => boolean;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={days.length + 1}
          className="border border-slate-400 bg-slate-200 p-1 text-left text-[10px] font-bold tracking-wide uppercase"
        >
          {label}
        </th>
      </tr>
      {areas.map((area) => (
        <tr key={area.id}>
          <th className="border border-slate-400 p-1 text-left align-top whitespace-nowrap">
            {area.icon} {area.name}
          </th>
          {days.map((date) => {
            const dayBlocks = blocks
              .filter(
                (block) =>
                  block.weekday === isoWeekday(date) &&
                  block.kind !== 'closed' &&
                  area.blockIds.includes(block.id),
              )
              .sort((a, b) => a.startMin - b.startMin);

            return (
              <td key={date} className="border border-slate-400 p-1 align-top">
                {closedOn(date) ? (
                  <span className="italic text-slate-400">—</span>
                ) : (
                  dayBlocks.map((block) => {
                    const names = assignments
                      .filter(
                        (entry) =>
                          entry.date === date &&
                          entry.dayBlockId === block.id &&
                          entry.workAreaId === area.id,
                      )
                      .map((entry) => {
                        const employee = byId.get(entry.employeeId);
                        return employee ? shortName(employee) : '?';
                      });

                    return (
                      <div key={block.id} className="mb-1 last:mb-0">
                        <div className="text-[9px] text-slate-500">
                          {formatHHMM(block.startMin)}–{formatHHMM(block.endMin)}
                        </div>
                        {names.length === 0 ? (
                          <div className="italic text-slate-400">—</div>
                        ) : (
                          names.map((name) => <div key={name}>{name}</div>)
                        )}
                      </div>
                    );
                  })
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/** Persönlicher Wochenplan – A4 hoch, einer je Mitarbeiter. */
export function PrintEmployeePlan() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const weekStart = useWeekParam();
  const days = practiceWeekDates(weekStart);

  const { data: employees } = useEmployees();
  const { data: workAreas } = useWorkAreas();
  const { data: dayBlocks } = useDayBlocks();
  const { data: settings } = useSettings();
  const { data: assignments } = useRoster(weekStart, addDays(weekStart, 6));

  const employee = employees?.find((entry) => entry.id === employeeId);
  usePrintTitle(
    employee ? `Wochenplan ${fullName(employee)} KW ${isoWeekNumber(weekStart)}` : 'Wochenplan',
  );

  const holidays = settings?.holidays ?? DEFAULT_HOLIDAY_SETTINGS;
  const mine = (assignments ?? []).filter((entry) => entry.employeeId === employeeId);

  if (!employee) {
    return <div className="p-8">Diese Person gibt es nicht.</div>;
  }

  return (
    <>
      <style>{'@page { size: A4 portrait; margin: 15mm; }'}</style>
      <PrintButton />
      <div className="mx-auto max-w-[180mm] bg-white p-8 text-black print:max-w-none print:p-0 dark:bg-white">
        <header className="mb-5 border-b-2 border-black pb-2">
          <h1 className="text-xl font-bold">{fullName(employee)}</h1>
          <p className="text-sm">
            Wochenplan KW {isoWeekNumber(weekStart)} ·{' '}
            {new Date(`${weekStart}T12:00:00`).toLocaleDateString('de-DE')} –{' '}
            {new Date(`${addDays(weekStart, 4)}T12:00:00`).toLocaleDateString('de-DE')}
          </p>
        </header>

        <div className="space-y-3">
          {days.map((date) => {
            const holiday = holidayName(date, holidays.state, holidays.options);
            const weekday = isoWeekday(date);
            const work = weekday <= 5 ? employee.workTimes[weekday as 1] : undefined;
            const entries = mine
              .filter((entry) => entry.date === date)
              .map((entry) => ({
                entry,
                block: dayBlocks?.find((block) => block.id === entry.dayBlockId),
                area: workAreas?.find((area) => area.id === entry.workAreaId),
              }))
              .sort((a, b) => (a.block?.startMin ?? 0) - (b.block?.startMin ?? 0));

            return (
              <section key={date} className="border border-slate-400">
                <div className="flex items-baseline justify-between border-b border-slate-300 bg-slate-100 px-3 py-1.5">
                  <span className="font-semibold">
                    {WEEKDAY_LABELS[weekday]},{' '}
                    {new Date(`${date}T12:00:00`).toLocaleDateString('de-DE')}
                  </span>
                  <span className="text-xs">
                    {holiday
                      ? holiday
                      : work?.isWorking
                        ? `Arbeitszeit ${formatHHMM(work.startMin)}–${formatHHMM(work.endMin)}, Pause ${work.breakMin} Min.${work.location === 'home' ? ' · Homeoffice' : ''}`
                        : 'frei'}
                  </span>
                </div>

                {entries.length === 0 ? (
                  <p className="px-3 py-2 text-sm italic text-slate-500">
                    {holiday
                      ? 'Feiertag'
                      : work?.isWorking
                        ? 'Keine Einteilung'
                        : 'Kein Arbeitstag'}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {entries.map(({ entry, block, area }) => (
                        <tr key={entry.id} className="border-b border-slate-200 last:border-0">
                          <td className="w-32 px-3 py-1.5 align-top whitespace-nowrap">
                            {block
                              ? `${formatHHMM(block.startMin)}–${formatHHMM(block.endMin)}`
                              : ''}
                          </td>
                          <td className="px-3 py-1.5 font-medium">
                            {area?.icon} {area?.name ?? 'Bereich'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>

        <footer className="mt-4 text-[9px] text-slate-500">
          {settings?.practiceName ?? 'Praxis'} · erstellt am{' '}
          {new Date().toLocaleDateString('de-DE')} · HÄPPI-Flow
        </footer>
      </div>
    </>
  );
}
