import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import type {
  Absence,
  AbsenceType,
  Employee,
  IsoDate,
  PublicAbsence,
  SessionUser,
} from '@haeppi/shared';
import {
  ABSENCE_TYPE_ICONS,
  ABSENCE_TYPE_LABELS,
  DEFAULT_HOLIDAY_SETTINGS,
  addDays,
  eachDateInRange,
  fullName,
  holidayName,
  isWeekend,
  isWithinRange,
  shortName,
  todayLocal,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import {
  useAbsences,
  useCreateAbsence,
  useDecideAbsence,
  useDeleteAbsence,
  useEmployees,
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

  const monthStart = month;
  const monthEnd = lastDayOfMonth(month);

  const { data: employees } = useEmployees();
  const { data: absences, isLoading } = useAbsences(monthStart, monthEnd);
  const { data: settings } = useSettings();
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
                  <span className="ml-auto flex gap-2">
                    <Button
                      variant="primary"
                      onClick={() => decide.mutate({ id: entry.id, status: 'approved' })}
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
                  return (
                    <th
                      key={date}
                      title={holiday ?? undefined}
                      className={`w-6 border-b border-slate-200 py-2 text-center text-[11px] font-normal dark:border-slate-800 ${
                        weekend || holiday
                          ? 'bg-slate-100 text-slate-400 dark:bg-slate-800/60'
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
                      weekend={
                        isWeekend(date) ||
                        holidayName(date, holidays.state, holidays.options) !== null
                      }
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

      {creating && (
        <AbsenceEditor user={user} employees={employees ?? []} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function DayCell({
  date,
  entries,
  weekend,
  canDelete,
  onDelete,
}: {
  date: IsoDate;
  entries: readonly (Absence | PublicAbsence)[];
  weekend: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  const entry = entries.find((item) => isWithinRange(date, item.startDate, item.endDate));

  if (!entry) {
    return (
      <td
        className={`border-b border-slate-100 dark:border-slate-800 ${
          weekend ? 'bg-slate-50 dark:bg-slate-800/40' : ''
        }`}
      />
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
        title={`${label} · ${formatRange(entry.startDate, entry.endDate)}`}
        onClick={canDelete ? () => onDelete(entry.id) : undefined}
        disabled={!canDelete}
        className={`h-5 w-full rounded-sm ${color} ${
          detailed && entry.status === 'requested' ? 'opacity-50' : ''
        } ${canDelete ? 'hover:ring-2 hover:ring-slate-400' : 'cursor-default'}`}
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
}: {
  user: SessionUser;
  employees: readonly Employee[];
  onClose: () => void;
}) {
  const isAdmin = user.role === 'admin';
  const today = todayLocal();
  const [employeeId, setEmployeeId] = useState(user.employeeId ?? employees[0]?.id ?? '');
  const [startDate, setStartDate] = useState<IsoDate>(today);
  const [endDate, setEndDate] = useState<IsoDate>(today);
  const [type, setType] = useState<AbsenceType>('vacation');
  const [note, setNote] = useState('');

  const create = useCreateAbsence();
  const message = create.error instanceof ApiError ? create.error.message : null;

  // Mitarbeiter tragen nur für sich selbst und nur Urlaub oder Krankheit ein.
  const types: AbsenceType[] = isAdmin
    ? (Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[])
    : ['vacation', 'sick'];

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
              create.mutate({ employeeId, startDate, endDate, type, note }, { onSuccess: onClose })
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

        <Field label="Notiz (freiwillig)">
          <TextInput value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        {!isAdmin && type === 'vacation' && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            Der Antrag geht an die Praxisleitung. Bis zur Entscheidung versucht die Planung, den
            Zeitraum bereits freizuhalten.
          </p>
        )}
        {type === 'sick' && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Eine Krankmeldung gilt sofort. Kolleginnen sehen nur, dass du abwesend bist – nicht
            warum.
          </p>
        )}

        {message && <ErrorNote>{message}</ErrorNote>}
      </div>
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
