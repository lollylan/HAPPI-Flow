import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarOff,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type {
  Absence,
  AbsenceType,
  Closure,
  ClosurePlan,
  CoverageResult,
  Employee,
  IsoDate,
  PublicAbsence,
  SessionUser,
} from '@haeppi/shared';
import {
  ABSENCE_TYPE_ICONS,
  ABSENCE_TYPE_LABELS,
  DEFAULT_HOLIDAY_SETTINGS,
  WEEKDAY_SHORT,
  addDays,
  eachDateInRange,
  fullName,
  holidayName,
  isWeekend,
  isWithinRange,
  isoWeekday,
  shortName,
  todayLocal,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import type { ClosureInput } from '../api/queries';
import {
  useAbsenceCheck,
  useAbsences,
  useClosureDuties,
  useClosures,
  useCreateAbsence,
  useDecideAbsence,
  useDeleteAbsence,
  useDeleteClosure,
  useDuties,
  useEmployees,
  usePlanClosure,
  useSaveClosure,
  useSettings,
  useVacationBalance,
} from '../api/queries';
import {
  Button,
  Card,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Select,
  TextInput,
} from '../components/ui';

/** Ob der Eintrag den Grund enthaelt - fuer Kollegen liefert die API ihn nicht. */
function hasDetails(absence: Absence | PublicAbsence): absence is Absence {
  return 'type' in absence;
}

const TYPE_COLOR: Record<AbsenceType, string> = {
  vacation: 'bg-emerald-400',
  sick: 'bg-red-400',
  training: 'bg-blue-400',
  school: 'bg-violet-400',
  special: 'bg-amber-400',
  timeoff: 'bg-slate-400',
};

export function AbsencesView({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'admin';
  const [month, setMonth] = useState<IsoDate>(() => `${todayLocal().slice(0, 7)}-01`);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const monthStart = month;
  const monthEnd = lastDayOfMonth(month);

  const { data: employees } = useEmployees();
  const { data: absences, isLoading } = useAbsences(monthStart, monthEnd);
  const { data: settings } = useSettings();
  const { data: closures } = useClosures();
  const { data: duties } = useDuties(monthStart, monthEnd);
  const decide = useDecideAbsence();
  const remove = useDeleteAbsence();

  const holidays = settings?.holidays ?? DEFAULT_HOLIDAY_SETTINGS;
  const days = eachDateInRange(monthStart, monthEnd);

  const pending = useMemo(
    () => (absences ?? []).filter((entry) => hasDetails(entry) && entry.status === 'requested'),
    [absences],
  ) as Absence[];

  const byEmployee = useMemo(() => {
    const map = new Map<string, (Absence | PublicAbsence)[]>();
    for (const entry of absences ?? []) {
      map.set(entry.employeeId, [...(map.get(entry.employeeId) ?? []), entry]);
    }
    return map;
  }, [absences]);

  const closureOf = (date: IsoDate) =>
    (closures ?? []).find((closure) => isWithinRange(date, closure.startDate, closure.endDate));

  const describeProposals = (count: number) =>
    count === 0
      ? null
      : count === 1
        ? 'Für die betroffene Woche liegt jetzt ein Umplanungsvorschlag im Dienstplan.'
        : `Für ${count} betroffene Wochen liegen jetzt Umplanungsvorschläge im Dienstplan.`;

  return (
    <div className="p-6">
      <PageHeader
        title="Abwesenheiten"
        subtitle={new Date(`${month}T12:00:00`).toLocaleDateString('de-DE', {
          month: 'long',
          year: 'numeric',
        })}
        action={
          <div className="flex items-center gap-2">
            <Button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Voriger Monat">
              <ChevronLeft className="size-4" />
            </Button>
            <Button onClick={() => setMonth(`${todayLocal().slice(0, 7)}-01`)}>Heute</Button>
            <Button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Nächster Monat">
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {isAdmin ? 'Eintragen' : 'Beantragen'}
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0" />
          {notice}
          <Link to="/dienstplan" className="font-medium underline">
            Zum Dienstplan
          </Link>
          <button className="ml-auto" onClick={() => setNotice(null)} aria-label="Schließen">
            <X className="size-4" />
          </button>
        </div>
      )}

      {isAdmin && pending.length > 0 && (
        <Card className="mb-4 p-4">
          <h2 className="mb-2 font-medium">
            Offene Anträge <span className="text-slate-500">({pending.length})</span>
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pending.map((entry) => {
              const employee = employees?.find((person) => person.id === entry.employeeId);
              return (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="font-medium">{employee ? fullName(employee) : 'Unbekannt'}</span>
                  <span className="text-slate-500">
                    {ABSENCE_TYPE_ICONS[entry.type]} {ABSENCE_TYPE_LABELS[entry.type]} ·{' '}
                    {formatRange(entry.startDate, entry.endDate)}
                  </span>
                  {entry.note && <span className="text-slate-400">„{entry.note}"</span>}
                  <RequestCheck
                    employeeId={entry.employeeId}
                    startDate={entry.startDate}
                    endDate={entry.endDate}
                  />
                  <span className="ml-auto flex gap-2">
                    <Button
                      variant="primary"
                      onClick={() =>
                        decide.mutate(
                          { id: entry.id, status: 'approved' },
                          {
                            onSuccess: (result) =>
                              setNotice(describeProposals(result.proposals.length)),
                          },
                        )
                      }
                    >
                      <Check className="size-4" /> Genehmigen
                    </Button>
                    <Button onClick={() => decide.mutate({ id: entry.id, status: 'rejected' })}>
                      <X className="size-4" /> Ablehnen
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-slate-400" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-40 border-b border-slate-200 bg-white px-3 py-2 text-left font-medium dark:border-slate-800 dark:bg-slate-900">
                  Mitarbeiter
                </th>
                {days.map((date) => {
                  const weekend = isWeekend(date);
                  const holiday = holidayName(date, holidays.state, holidays.options);
                  const closure = closureOf(date);
                  return (
                    <th
                      key={date}
                      title={
                        holiday ?? (closure ? `Schließzeit ${closure.description}` : undefined)
                      }
                      className={`w-6 border-b border-slate-200 py-2 text-center text-[11px] font-normal dark:border-slate-800 ${
                        weekend || holiday
                          ? 'bg-slate-100 text-slate-400 dark:bg-slate-800/60'
                          : closure
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40'
                            : 'text-slate-500'
                      } ${date === todayLocal() ? 'bg-blue-100 font-medium dark:bg-blue-950' : ''}`}
                    >
                      {date.slice(8)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(employees ?? []).map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-1.5 whitespace-nowrap dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: employee.color }}
                      />
                      {shortName(employee)}
                    </div>
                  </td>
                  {days.map((date) => (
                    <DayCell
                      key={date}
                      date={date}
                      entries={byEmployee.get(employee.id) ?? []}
                      onDuty={(duties ?? []).some(
                        (duty) => duty.employeeId === employee.id && duty.date === date,
                      )}
                      closed={
                        isWeekend(date) ||
                        holidayName(date, holidays.state, holidays.options) !== null
                      }
                      inClosure={closureOf(date) !== undefined}
                      canDelete={isAdmin}
                      onDelete={(id) => remove.mutate(id)}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Legend />

      {user.employeeId && <OwnVacationCard employeeId={user.employeeId} />}

      {isAdmin && <ClosuresSection closures={closures ?? []} employees={employees ?? []} />}

      {creating && (
        <AbsenceEditor
          user={user}
          employees={employees ?? []}
          onClose={() => setCreating(false)}
          onCreated={(proposalCount) => setNotice(describeProposals(proposalCount))}
        />
      )}
    </div>
  );
}

function DayCell({
  date,
  entries,
  onDuty,
  closed,
  inClosure,
  canDelete,
  onDelete,
}: {
  date: IsoDate;
  entries: readonly (Absence | PublicAbsence)[];
  onDuty: boolean;
  closed: boolean;
  inClosure: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const entry = entries.find((item) => isWithinRange(date, item.startDate, item.endDate));

  if (!entry) {
    return (
      <td
        className={`border-b border-slate-100 p-0.5 dark:border-slate-800 ${
          closed
            ? 'bg-slate-50 dark:bg-slate-800/40'
            : inClosure
              ? 'bg-amber-50/60 dark:bg-amber-950/20'
              : ''
        }`}
        title={onDuty ? 'Notbesetzung in der Schließzeit' : undefined}
      >
        {onDuty && (
          <div className="flex h-5 items-center justify-center rounded-sm bg-emerald-100 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            N
          </div>
        )}
      </td>
    );
  }

  // Kolleginnen bekommen vom Server nur "abwesend" - ohne Grund und ohne Farbe.
  const detailed = hasDetails(entry);
  const color = detailed ? TYPE_COLOR[entry.type] : 'bg-slate-400';
  const label = detailed
    ? `${ABSENCE_TYPE_LABELS[entry.type]}${entry.status === 'requested' ? ' (beantragt)' : ''}`
    : 'abwesend';

  return (
    <td className="border-b border-slate-100 p-0.5 dark:border-slate-800">
      <button
        title={`${label} · ${formatRange(entry.startDate, entry.endDate)}${
          entry.halfDay ? (entry.halfDay === 'am' ? ' · vormittags' : ' · nachmittags') : ''
        }`}
        onClick={canDelete ? () => onDelete(entry.id) : undefined}
        disabled={!canDelete}
        className={`h-5 w-full rounded-sm ${color} ${
          detailed && entry.status === 'requested' ? 'opacity-50' : ''
        } ${entry.halfDay ? 'h-2.5' : ''} ${canDelete ? 'hover:ring-2 hover:ring-slate-400' : 'cursor-default'}`}
      />
    </td>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
      {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((type) => (
        <span key={type} className="flex items-center gap-1.5">
          <span className={`size-3 rounded-sm ${TYPE_COLOR[type]}`} />
          {ABSENCE_TYPE_LABELS[type]}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-sm bg-emerald-400 opacity-50" />
        beantragt, noch nicht entschieden
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex size-3 items-center justify-center rounded-sm bg-emerald-100 text-[8px] font-bold text-emerald-800">
          N
        </span>
        Notbesetzung in der Schließzeit
      </span>
    </div>
  );
}

/** Kurze Ampel fuer einen offenen Antrag: wird es eng? */
function RequestCheck({
  employeeId,
  startDate,
  endDate,
}: {
  employeeId: string;
  startDate: IsoDate;
  endDate: IsoDate;
}) {
  const { data } = useAbsenceCheck(employeeId, startDate, endDate);
  if (!data) return null;
  if (data.criticalDays === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3.5" /> Besetzung reicht
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-xs text-red-700 dark:text-red-400"
      title={data.days
        .filter((day) => day.shortfall > 0)
        .map((day) => `${formatDate(day.date)}: ${day.present} von ${day.required} da`)
        .join('\n')}
    >
      <AlertTriangle className="size-3.5" /> an {data.criticalDays}{' '}
      {data.criticalDays === 1 ? 'Tag' : 'Tagen'} zu wenige
    </span>
  );
}

/** Die Antragspruefung im Detail - Tag fuer Tag. */
function CoveragePanel({
  check,
  employees,
}: {
  check: CoverageResult;
  employees: readonly Employee[];
}) {
  const relevant = check.days.filter((day) => !day.closed && !day.offAnyway);
  if (relevant.length === 0) {
    return (
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        In dem Zeitraum liegt kein Arbeitstag dieser Person.
      </p>
    );
  }
  const nameOf = (id: string) => {
    const employee = employees.find((entry) => entry.id === id);
    return employee ? shortName(employee) : '?';
  };
  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ${
        check.criticalDays > 0
          ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
          : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
      }`}
    >
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Users className="size-4" />
        {check.criticalDays === 0
          ? `Besetzung reicht an allen ${check.workingDays} Arbeitstagen.`
          : `An ${check.criticalDays} von ${check.workingDays} Arbeitstagen fehlen Leute.`}
      </div>
      <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2">
        {relevant.map((day) => (
          <li key={day.date} className="flex gap-2">
            <span className="w-16 shrink-0">
              {WEEKDAY_SHORT[isoWeekday(day.date)]} {formatDate(day.date)}
            </span>
            <span className={day.shortfall > 0 ? 'font-semibold' : ''}>
              {day.present} von {day.required} da
              {day.othersAbsent.length > 0 && (
                <span className="opacity-80">
                  {' '}
                  · fehlt schon: {day.othersAbsent.map(nameOf).join(', ')}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OwnVacationCard({ employeeId }: { employeeId: string }) {
  const year = new Date().getFullYear();
  const { data } = useVacationBalance(employeeId, year);
  if (!data) return null;

  const { balance } = data;
  return (
    <Card className="mt-6 max-w-md p-5">
      <h2 className="mb-3 font-medium">Mein Urlaubskonto {year}</h2>
      <dl className="space-y-1 text-sm">
        <Row label="Jahresanspruch" value={balance.entitlement} />
        <Row label="Übertrag aus dem Vorjahr" value={balance.carryover} />
        <Row label="Bereits genommen" value={balance.used} />
        <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
          <Row label="Noch offen" value={balance.remaining} strong />
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-500">
        Feiertage und Praxis-Schließtage werden nicht angerechnet.
      </p>
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className={strong ? 'font-medium' : 'text-slate-500'}>{label}</dt>
      <dd
        className={`tabular ${strong ? 'font-medium' : ''} ${
          value < 0 ? 'text-red-600 dark:text-red-400' : ''
        }`}
      >
        {value.toLocaleString('de-DE')} Tage
      </dd>
    </div>
  );
}

function AbsenceEditor({
  user,
  employees,
  onClose,
  onCreated,
}: {
  user: SessionUser;
  employees: readonly Employee[];
  onClose: () => void;
  onCreated: (proposalCount: number) => void;
}) {
  const isAdmin = user.role === 'admin';
  const today = todayLocal();
  const [employeeId, setEmployeeId] = useState(user.employeeId ?? employees[0]?.id ?? '');
  const [startDate, setStartDate] = useState<IsoDate>(today);
  const [endDate, setEndDate] = useState<IsoDate>(today);
  const [type, setType] = useState<AbsenceType>('vacation');
  const [halfDay, setHalfDay] = useState<'' | 'am' | 'pm'>('');
  const [note, setNote] = useState('');

  const create = useCreateAbsence();
  const { data: check } = useAbsenceCheck(employeeId, startDate, endDate);
  const { data: vacation } = useVacationBalance(
    type === 'vacation' ? employeeId : null,
    Number(startDate.slice(0, 4)),
  );
  const message = create.error instanceof ApiError ? create.error.message : null;

  // Mitarbeiter tragen nur für sich selbst und nur Urlaub oder Krankheit ein.
  const types: AbsenceType[] = isAdmin
    ? (Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[])
    : ['vacation', 'sick'];

  const singleDay = startDate === endDate;

  return (
    <Modal
      title={isAdmin ? 'Abwesenheit eintragen' : 'Abwesenheit melden'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={create.isPending || !employeeId}
            onClick={() =>
              create.mutate(
                {
                  employeeId,
                  startDate,
                  endDate,
                  type,
                  halfDay: singleDay && halfDay ? halfDay : null,
                  note,
                },
                {
                  onSuccess: (result) => {
                    onCreated(result.proposals.length);
                    onClose();
                  },
                },
              )
            }
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            {isAdmin || type === 'sick' ? 'Eintragen' : 'Antrag stellen'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {isAdmin && (
          <Field label="Person">
            <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {fullName(employee)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Art">
          <Select value={type} onChange={(event) => setType(event.target.value as AbsenceType)}>
            {types.map((value) => (
              <option key={value} value={value}>
                {ABSENCE_TYPE_ICONS[value]} {ABSENCE_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Von">
            <TextInput
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (event.target.value > endDate) setEndDate(event.target.value);
              }}
            />
          </Field>
          <Field label="Bis">
            <TextInput
              type="date"
              min={startDate}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>

        {singleDay && (
          <Field label="Halber Tag" hint="Nur bei einem einzelnen Tag möglich.">
            <Select
              value={halfDay}
              onChange={(event) => setHalfDay(event.target.value as '' | 'am' | 'pm')}
            >
              <option value="">Ganzer Tag</option>
              <option value="am">Nur vormittags abwesend</option>
              <option value="pm">Nur nachmittags abwesend</option>
            </Select>
          </Field>
        )}

        <Field label="Notiz (freiwillig)">
          <TextInput value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        {check && <CoveragePanel check={check} employees={employees} />}

        {vacation && type === 'vacation' && check && (
          <p className="text-xs text-slate-500">
            Urlaubskonto {vacation.year}: noch {vacation.balance.remaining.toLocaleString('de-DE')}{' '}
            Tage offen, dieser Antrag kostet {check.workingDays}.
            {vacation.balance.remaining - check.workingDays < 0 && (
              <span className="ml-1 font-medium text-red-600"> Das reicht nicht.</span>
            )}
          </p>
        )}

        {!isAdmin && type === 'vacation' && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            Der Antrag geht an die Praxisleitung. Bis zur Entscheidung versucht die Planung, den
            Zeitraum bereits freizuhalten.
          </p>
        )}
        {type === 'sick' && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Eine Krankmeldung gilt sofort. Kolleginnen sehen nur, dass du abwesend bist – nicht
            warum. Ist die Woche schon geplant, bekommt die Praxisleitung einen Umplanungsvorschlag.
          </p>
        )}

        {message && <ErrorNote>{message}</ErrorNote>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------- Schliesszeiten --

function ClosuresSection({
  closures,
  employees,
}: {
  closures: readonly Closure[];
  employees: readonly Employee[];
}) {
  const [editing, setEditing] = useState<Closure | null | undefined>(undefined);
  const [planning, setPlanning] = useState<Closure | null>(null);
  const remove = useDeleteClosure();

  const upcoming = [...closures].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <Card className="mt-6 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <CalendarOff className="size-4 text-slate-400" />
            Praxisschließzeiten
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Alle haben Urlaub, eine Notbesetzung bereitet die letzten Tage vor der Wiedereröffnung
            vor. Die Verteilung rotiert fair und achtet auf Urlaubswünsche.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing(null)}>
          <Plus className="size-4" /> Schließzeit
        </Button>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-sm text-slate-500">Keine Schließzeiten hinterlegt.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {upcoming.map((closure) => (
            <ClosureRow
              key={closure.id}
              closure={closure}
              employees={employees}
              onEdit={() => setEditing(closure)}
              onPlan={() => setPlanning(closure)}
              onDelete={() => {
                if (
                  window.confirm(
                    `Schließzeit ${formatRange(closure.startDate, closure.endDate)} löschen?\n\nBereits eingetragene Urlaube bleiben bestehen, die Notbesetzung wird entfernt.`,
                  )
                ) {
                  remove.mutate(closure.id);
                }
              }}
            />
          ))}
        </ul>
      )}

      {editing !== undefined && (
        <ClosureEditor closure={editing} onClose={() => setEditing(undefined)} />
      )}
      {planning && (
        <ClosurePlanDialog
          closure={planning}
          employees={employees}
          onClose={() => setPlanning(null)}
        />
      )}
    </Card>
  );
}

function ClosureRow({
  closure,
  employees,
  onEdit,
  onPlan,
  onDelete,
}: {
  closure: Closure;
  employees: readonly Employee[];
  onEdit: () => void;
  onPlan: () => void;
  onDelete: () => void;
}) {
  const { data: duties } = useClosureDuties(closure.id);
  const names = [...new Set((duties ?? []).map((duty) => duty.employeeId))]
    .map((id) => employees.find((employee) => employee.id === id))
    .filter((employee): employee is Employee => employee !== undefined)
    .map(shortName);

  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {formatRange(closure.startDate, closure.endDate)}
          {closure.description && <span className="text-slate-500"> · {closure.description}</span>}
        </div>
        <div className="text-xs text-slate-500">
          {closure.prepStaff} {closure.prepStaff === 1 ? 'Person' : 'Personen'} an den letzten{' '}
          {closure.prepDays} Arbeitstagen
          {closure.skeletonStaff > 0 ? `, sonst ${closure.skeletonStaff} an jedem Tag` : ''}
          {names.length > 0 ? ` · Notbesetzung: ${names.join(', ')}` : ' · noch nicht verteilt'}
        </div>
      </div>
      <Button onClick={onPlan}>
        <Users className="size-4" /> {names.length > 0 ? 'Neu verteilen' : 'Verteilen'}
      </Button>
      <button
        onClick={onEdit}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        title="Bearbeiten"
      >
        <Pencil className="size-4" />
      </button>
      <button
        onClick={onDelete}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
        title="Löschen"
      >
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

function ClosureEditor({ closure, onClose }: { closure: Closure | null; onClose: () => void }) {
  const today = todayLocal();
  const [draft, setDraft] = useState<ClosureInput>(() =>
    closure
      ? {
          startDate: closure.startDate,
          endDate: closure.endDate,
          description: closure.description,
          skeletonStaff: closure.skeletonStaff,
          prepDays: closure.prepDays,
          prepStaff: closure.prepStaff,
        }
      : {
          startDate: today,
          endDate: today,
          description: '',
          skeletonStaff: 0,
          prepDays: 2,
          prepStaff: 1,
        },
  );
  const save = useSaveClosure();
  const message = save.error instanceof ApiError ? save.error.message : null;
  const patch = (changes: Partial<ClosureInput>) => setDraft((old) => ({ ...old, ...changes }));

  return (
    <Modal
      title={closure ? 'Schließzeit bearbeiten' : 'Neue Schließzeit'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { ...(closure ? { id: closure.id } : {}), input: draft },
                { onSuccess: onClose },
              )
            }
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Speichern
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Von">
            <TextInput
              type="date"
              value={draft.startDate}
              onChange={(event) => {
                patch({ startDate: event.target.value });
                if (event.target.value > draft.endDate) patch({ endDate: event.target.value });
              }}
            />
          </Field>
          <Field label="Bis">
            <TextInput
              type="date"
              min={draft.startDate}
              value={draft.endDate}
              onChange={(event) => patch({ endDate: event.target.value })}
            />
          </Field>
        </div>
        <Field label="Bezeichnung">
          <TextInput
            value={draft.description}
            placeholder="Weihnachten, Betriebsausflug …"
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Vorbereitungstage" hint="Arbeitstage vor der Wiedereröffnung">
            <TextInput
              type="number"
              min={0}
              max={20}
              value={draft.prepDays}
              onChange={(event) => patch({ prepDays: Number(event.target.value) })}
            />
          </Field>
          <Field label="Personen dabei" hint="Notbesetzung an diesen Tagen">
            <TextInput
              type="number"
              min={0}
              max={20}
              value={draft.prepStaff}
              onChange={(event) => patch({ prepStaff: Number(event.target.value) })}
            />
          </Field>
          <Field label="An allen Tagen" hint="meist 0">
            <TextInput
              type="number"
              min={0}
              max={20}
              value={draft.skeletonStaff}
              onChange={(event) => patch({ skeletonStaff: Number(event.target.value) })}
            />
          </Field>
        </div>
        {message && <ErrorNote>{message}</ErrorNote>}
      </div>
    </Modal>
  );
}

/** Vorschau der Verteilung, dann Uebernahme mit einem Klick. */
function ClosurePlanDialog({
  closure,
  employees,
  onClose,
}: {
  closure: Closure;
  employees: readonly Employee[];
  onClose: () => void;
}) {
  const plan = usePlanClosure();
  const [preview, setPreview] = useState<ClosurePlan | null>(null);
  const [applied, setApplied] = useState(false);
  const { mutate: runPreview } = plan;

  // Beim Oeffnen einmal die Vorschau rechnen - ohne etwas zu speichern.
  useEffect(() => {
    runPreview(
      { id: closure.id, dryRun: true },
      { onSuccess: (result) => setPreview(result.plan) },
    );
  }, [closure.id, runPreview]);

  const nameOf = (id: string) => {
    const employee = employees.find((entry) => entry.id === id);
    return employee ? fullName(employee) : '?';
  };
  const message = plan.error instanceof ApiError ? plan.error.message : null;

  return (
    <Modal
      title={`Notbesetzung ${formatRange(closure.startDate, closure.endDate)}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{applied ? 'Schließen' : 'Abbrechen'}</Button>
          {!applied && (
            <Button
              variant="primary"
              disabled={!preview || plan.isPending}
              onClick={() =>
                plan.mutate(
                  { id: closure.id, dryRun: false },
                  {
                    onSuccess: (result) => {
                      setPreview(result.plan);
                      setApplied(true);
                    },
                  },
                )
              }
            >
              {plan.isPending && <Loader2 className="size-4 animate-spin" />}
              Übernehmen
            </Button>
          )}
        </>
      }
    >
      {!preview ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Verteilung wird berechnet …
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          {applied && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              Übernommen: Notbesetzung gespeichert, Urlaub für alle übrigen Tage eingetragen, offene
              Urlaubswünsche im Zeitraum genehmigt.
            </p>
          )}
          <p className="text-slate-600 dark:text-slate-400">
            {preview.workingDates.length} Arbeitstage
            {preview.prepDates.length > 0 && (
              <>
                , Vorbereitungstage: {preview.prepDates.map((date) => formatDate(date)).join(', ')}
              </>
            )}
          </p>

          {preview.understaffed.length > 0 && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800 dark:bg-red-950/40 dark:text-red-300">
              An {preview.understaffed.length} Tagen fehlt jemand für die Notbesetzung:{' '}
              {preview.understaffed.map((entry) => formatDate(entry.date)).join(', ')}.
            </p>
          )}

          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Person</th>
                <th className="py-1 font-medium">Notbesetzung</th>
                <th className="py-1 text-right font-medium">Urlaubstage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {preview.summary.map((entry) => (
                <tr key={entry.employeeId}>
                  <td className="py-1.5">{nameOf(entry.employeeId)}</td>
                  <td className="py-1.5 text-slate-600 dark:text-slate-400">
                    {entry.dutyDates.length > 0
                      ? entry.dutyDates.map((date) => formatDate(date)).join(', ')
                      : entry.note === 'vacation_requested'
                        ? 'hat Urlaub beantragt'
                        : entry.note === 'already_absent'
                          ? 'ohnehin abwesend'
                          : '–'}
                  </td>
                  <td className="tabular py-1.5 text-right">{entry.vacationDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {message && <ErrorNote>{message}</ErrorNote>}
        </div>
      )}
    </Modal>
  );
}

// --------------------------------------------------------------- Hilfen --

function lastDayOfMonth(monthStart: IsoDate): IsoDate {
  const [year, month] = [Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7))];
  const next =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return addDays(next, -1);
}

function shiftMonth(monthStart: IsoDate, delta: number): IsoDate {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(5, 7)) + delta;
  const targetYear = year + Math.floor((month - 1) / 12);
  const targetMonth = ((((month - 1) % 12) + 12) % 12) + 1;
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
}

function formatRange(from: IsoDate, to: IsoDate): string {
  const format = (date: IsoDate) => new Date(`${date}T12:00:00`).toLocaleDateString('de-DE');
  return from === to ? format(from) : `${format(from)} – ${format(to)}`;
}

function formatDate(iso: IsoDate): string {
  return `${iso.slice(8)}.${iso.slice(5, 7)}.`;
}
