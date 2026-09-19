import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Lock,
  Loader2,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type {
  Absence,
  Assignment,
  ClosureDuty,
  DayBlock,
  Diagnostic,
  Employee,
  IsoDate,
  MatrixEntry,
  PlanChange,
  PlanKind,
  PlanProposal,
  PublicAbsence,
  SessionUser,
  WorkArea,
} from '@haeppi/shared';
import {
  DEFAULT_HOLIDAY_SETTINGS,
  PLAN_KINDS,
  PLAN_LABELS,
  REJECTION_LABELS,
  WEEKDAY_SHORT,
  absenceCoversBlock,
  addDays,
  areaKey,
  checkEligibility,
  formatHHMM,
  holidayName,
  isWithinRange,
  isoWeekNumber,
  isoWeekday,
  matrixKey,
  minStaffFor,
  needsSupervision,
  practiceWeekDates,
  shortName,
  startOfISOWeek,
  todayLocal,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import type { GenerateResult } from '../api/queries';
import {
  useAbsences,
  useClosures,
  useCreateAssignment,
  useDayBlocks,
  useDecideProposal,
  useDeleteAssignment,
  useDuties,
  useEmployees,
  useGenerateRoster,
  useLastPlanRun,
  useMatrix,
  useProposals,
  useRoster,
  useSettings,
  useTemplate,
  useTemplateFromWeek,
  useToggleLock,
  useWorkAreas,
} from '../api/queries';
import { Button, Card, ErrorNote, PageHeader } from '../components/ui';

type AnyAbsence = Absence | PublicAbsence;

export function RosterView({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'admin';
  const [weekStart, setWeekStart] = useState<IsoDate>(() => startOfISOWeek(todayLocal()));
  const [dialog, setDialog] = useState<{ date: IsoDate; block: DayBlock; area: WorkArea } | null>(
    null,
  );
  const [preview, setPreview] = useState<GenerateResult | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const weekEnd = addDays(weekStart, 6);
  const days = practiceWeekDates(weekStart);

  const { data: employees } = useEmployees();
  const { data: workAreas } = useWorkAreas();
  const { data: dayBlocks } = useDayBlocks();
  const { data: matrix } = useMatrix();
  const { data: template } = useTemplate();
  const { data: settings } = useSettings();
  const { data: absences } = useAbsences(weekStart, weekEnd);
  const { data: closures } = useClosures();
  const { data: duties } = useDuties(weekStart, weekEnd);
  const { data: assignments, isLoading } = useRoster(weekStart, weekEnd);
  const { data: lastRun } = useLastPlanRun(weekStart);
  const { data: proposals } = useProposals(isAdmin);

  const generate = useGenerateRoster();
  const deleteAssignment = useDeleteAssignment();
  const toggleLock = useToggleLock();
  const adoptTemplate = useTemplateFromWeek();

  const byId = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id, employee])),
    [employees],
  );
  const areaById = useMemo(
    () => new Map((workAreas ?? []).map((area) => [area.id, area])),
    [workAreas],
  );
  const blockById = useMemo(
    () => new Map((dayBlocks ?? []).map((block) => [block.id, block])),
    [dayBlocks],
  );

  const holidays = settings?.holidays ?? DEFAULT_HOLIDAY_SETTINGS;

  const closureOf = (date: IsoDate) =>
    (closures ?? []).find((closure) => isWithinRange(date, closure.startDate, closure.endDate));

  const dayInfo = (date: IsoDate) => {
    const holiday = holidayName(date, holidays.state, holidays.options);
    const closure = closureOf(date);
    const additional = holidays.additionalClosedDates.includes(date);
    return {
      holiday,
      closure,
      closed: holiday !== null || additional || closure !== undefined,
      label:
        holiday ??
        (closure
          ? `Schließzeit${closure.description ? `: ${closure.description}` : ''}`
          : additional
            ? 'geschlossen'
            : null),
    };
  };

  const blocksOfDay = (date: IsoDate, plan: PlanKind) =>
    (dayBlocks ?? [])
      .filter(
        (block) =>
          block.plan === plan && block.weekday === isoWeekday(date) && block.kind !== 'closed',
      )
      .sort((a, b) => a.startMin - b.startMin);

  const assignmentsIn = (date: IsoDate, blockId: string, areaId: string) =>
    (assignments ?? []).filter(
      (entry) => entry.date === date && entry.dayBlockId === blockId && entry.workAreaId === areaId,
    );

  const isTemplateMatch = (assignment: Assignment) =>
    (template ?? []).some(
      (row) =>
        row.employeeId === assignment.employeeId &&
        row.workAreaId === assignment.workAreaId &&
        row.dayBlockId === assignment.dayBlockId,
    );

  const absentIn = (employeeId: string, date: IsoDate, block: DayBlock) =>
    (absences ?? []).some(
      (absence) =>
        absence.employeeId === employeeId &&
        isWithinRange(date, absence.startDate, absence.endDate) &&
        absenceCoversBlock(absence, block),
    );

  const run = (options: { mode: 'fresh' | 'replan'; weeks?: number; dryRun: boolean }) => {
    setMenuOpen(false);
    generate.mutate(
      { weekStart, ...options },
      { onSuccess: (result) => setPreview(result.dryRun ? result : null) },
    );
  };

  const weekProposals = (proposals?.proposals ?? []).filter((p) => p.weekStart === weekStart);
  const otherProposals = (proposals?.proposals ?? []).filter((p) => p.weekStart !== weekStart);

  // Die Auswertung: der Probelauf hat Vorrang, sonst der letzte gespeicherte Lauf.
  const diagnostics: readonly Diagnostic[] =
    preview?.results[0]?.diagnostics ?? lastRun?.diagnostics ?? [];
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  const groups = PLAN_KINDS.map((plan) => ({
    plan,
    areas: (workAreas ?? []).filter((area) => area.plan === plan),
  })).filter((group) => group.areas.length > 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Dienstplan"
        subtitle={`KW ${isoWeekNumber(weekStart)} · ${formatRange(weekStart)}`}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/druck/woche?woche=${weekStart}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              title="Übersichtsplan zum Aushängen"
            >
              <Printer className="size-4" /> Drucken
            </a>
            {isAdmin && (
              <>
                <Button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Diese Woche (KW ${isoWeekNumber(weekStart)}) als Musterwoche übernehmen?\n\nDie bisherige Musterwoche wird ersetzt.`,
                      )
                    ) {
                      adoptTemplate.mutate(weekStart);
                    }
                  }}
                  disabled={adoptTemplate.isPending || (assignments ?? []).length === 0}
                  title="Was diese Woche steht, wird zum Normalfall für alle künftigen Wochen"
                >
                  Als Musterwoche übernehmen
                </Button>
                <div className="relative">
                  <Button
                    variant="primary"
                    onClick={() => setMenuOpen((value) => !value)}
                    disabled={generate.isPending}
                  >
                    {generate.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Planen
                    <ChevronDown className="size-4" />
                  </Button>
                  {menuOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                      <MenuItem
                        title="Probelauf"
                        hint="Nur ansehen, nichts speichern"
                        onClick={() => run({ mode: 'fresh', dryRun: true })}
                      />
                      <MenuItem
                        title="Lücken füllen (Umplanung)"
                        hint="Bestehende Woche bleibt, nur Offenes wird besetzt"
                        onClick={() => run({ mode: 'replan', dryRun: false })}
                      />
                      <MenuItem
                        title="Woche neu aus der Musterwoche"
                        hint="Alles Ungesperrte wird neu verteilt"
                        onClick={() => run({ mode: 'fresh', dryRun: false })}
                      />
                      <MenuItem
                        title="Nächste 4 Wochen planen"
                        hint="Ab dieser Woche, jeweils aus der Musterwoche"
                        onClick={() => run({ mode: 'fresh', weeks: 4, dryRun: false })}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Vorige Woche">
            <ChevronLeft className="size-4" />
          </Button>
          <Button onClick={() => setWeekStart(startOfISOWeek(todayLocal()))}>Diese Woche</Button>
          <Button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Nächste Woche">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {preview && (
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            <Info className="size-4" />
            Probelauf: {preview.results[0]?.assignments.length ?? 0} Zuweisungen, nichts
            gespeichert.
            <button
              className="font-medium underline"
              onClick={() => run({ mode: 'fresh', dryRun: false })}
            >
              Übernehmen
            </button>
            <button
              className="text-blue-600"
              onClick={() => setPreview(null)}
              aria-label="Schließen"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      {generate.error instanceof ApiError && (
        <div className="mb-4">
          <ErrorNote>{generate.error.message}</ErrorNote>
        </div>
      )}
      {adoptTemplate.isSuccess && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          Die Musterwoche wurde aus dieser Woche übernommen.
        </div>
      )}

      {isAdmin && weekProposals.length > 0 && (
        <ProposalsPanel
          proposals={weekProposals}
          employees={byId}
          areas={areaById}
          blocks={blockById}
        />
      )}
      {isAdmin && otherProposals.length > 0 && (
        <div className="mb-4 text-sm text-slate-500">
          {otherProposals.length === 1
            ? 'Ein weiterer Umplanungsvorschlag wartet in KW '
            : `${otherProposals.length} weitere Umplanungsvorschläge warten in KW `}
          {[...new Set(otherProposals.map((p) => isoWeekNumber(p.weekStart)))].join(', ')}.{' '}
          <button
            className="font-medium text-blue-600 underline"
            onClick={() => setWeekStart(otherProposals[0]!.weekStart)}
          >
            Dorthin
          </button>
        </div>
      )}

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-slate-400" />
      ) : groups.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">
          Es sind keine Arbeitsbereiche angelegt.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-44 border-b border-slate-200 bg-white px-3 py-2 text-left font-medium dark:border-slate-800 dark:bg-slate-900">
                  Bereich
                </th>
                {days.map((date) => {
                  const info = dayInfo(date);
                  return (
                    <th
                      key={date}
                      className={`border-b border-slate-200 px-2 py-2 text-center dark:border-slate-800 ${
                        date === todayLocal() ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                      }`}
                    >
                      <div className="text-xs text-slate-500">
                        {WEEKDAY_SHORT[isoWeekday(date)]}, {date.slice(8)}.{date.slice(5, 7)}.
                      </div>
                      {info.label && (
                        <div className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {info.label}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <AbsenceRow
                days={days}
                absences={absences ?? []}
                duties={duties ?? []}
                employees={byId}
                closureOf={closureOf}
              />
              {groups.map((group) => (
                <GroupRows
                  key={group.plan}
                  plan={group.plan}
                  areas={group.areas}
                  days={days}
                  dayInfo={dayInfo}
                  blocksOfDay={(date) => blocksOfDay(date, group.plan)}
                  assignmentsIn={assignmentsIn}
                  employees={byId}
                  isAdmin={isAdmin}
                  isTemplateMatch={isTemplateMatch}
                  absentIn={absentIn}
                  onAdd={(date, block, area) => setDialog({ date, block, area })}
                  onDelete={(id) => deleteAssignment.mutate(id)}
                  onToggleLock={(id, locked) => toggleLock.mutate({ id, locked })}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {diagnostics.length > 0 && (
        <DiagnosticsPanel
          diagnostics={diagnostics}
          errorCount={errorCount}
          source={preview ? 'Probelauf' : lastRun ? `letzter Lauf, ${formatStamp(lastRun.at)}` : ''}
        />
      )}

      {dialog && (
        <AssignDialog
          date={dialog.date}
          block={dialog.block}
          area={dialog.area}
          employees={employees ?? []}
          matrix={matrix ?? []}
          absences={absences ?? []}
          assignments={assignments ?? []}
          dayBlocks={dayBlocks ?? []}
          minOverlapRatio={settings?.minOverlapRatio ?? 0.5}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function MenuItem({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </button>
  );
}

function formatRange(weekStart: IsoDate): string {
  const format = (date: IsoDate) =>
    new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${format(weekStart)} – ${format(addDays(weekStart, 4))}`;
}

function formatStamp(utc: string): string {
  // SQLite liefert "YYYY-MM-DD HH:MM:SS" in UTC.
  const date = new Date(`${utc.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? utc
    : date.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

// ------------------------------------------------------------ Zeilen --

/** Wer an dem Tag fehlt und wer an Schliesstagen als Notbesetzung da ist. */
function AbsenceRow({
  days,
  absences,
  duties,
  employees,
  closureOf,
}: {
  days: readonly IsoDate[];
  absences: readonly AnyAbsence[];
  duties: readonly ClosureDuty[];
  employees: Map<string, Employee>;
  closureOf: (date: IsoDate) => { id: string } | undefined;
}) {
  return (
    <tr className="bg-slate-50/60 dark:bg-slate-800/30">
      <td className="sticky left-0 z-10 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-800/60">
        Abwesend
      </td>
      {days.map((date) => {
        const absent = absences
          .filter((absence) => isWithinRange(date, absence.startDate, absence.endDate))
          .map((absence) => ({ absence, employee: employees.get(absence.employeeId) }))
          .filter((entry) => entry.employee !== undefined);
        const onDuty = closureOf(date)
          ? duties
              .filter((duty) => duty.date === date)
              .map((duty) => employees.get(duty.employeeId))
          : [];
        return (
          <td
            key={date}
            className="border-b border-l border-slate-100 p-1 align-top dark:border-slate-800"
          >
            <div className="flex flex-wrap gap-1">
              {absent.map(({ absence, employee }) => (
                <span
                  key={absence.id}
                  className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  title={
                    'type' in absence
                      ? `${absence.type === 'sick' ? 'Krank' : absence.type === 'vacation' ? 'Urlaub' : 'Abwesend'}${absence.status === 'requested' ? ' (beantragt)' : ''}`
                      : 'abwesend'
                  }
                >
                  {employee ? shortName(employee) : '?'}
                  {absence.halfDay === 'am'
                    ? ' (vorm.)'
                    : absence.halfDay === 'pm'
                      ? ' (nachm.)'
                      : ''}
                  {'status' in absence && absence.status === 'requested' ? ' ?' : ''}
                </span>
              ))}
              {onDuty.length > 0 && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  Notbesetzung: {onDuty.map((e) => (e ? shortName(e) : '?')).join(', ')}
                </span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

interface GroupRowsProps {
  plan: PlanKind;
  areas: readonly WorkArea[];
  days: readonly IsoDate[];
  dayInfo: (date: IsoDate) => { closed: boolean };
  blocksOfDay: (date: IsoDate) => DayBlock[];
  assignmentsIn: (date: IsoDate, blockId: string, areaId: string) => Assignment[];
  employees: Map<string, Employee>;
  isAdmin: boolean;
  isTemplateMatch: (assignment: Assignment) => boolean;
  absentIn: (employeeId: string, date: IsoDate, block: DayBlock) => boolean;
  onAdd: (date: IsoDate, block: DayBlock, area: WorkArea) => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
}

function GroupRows(props: GroupRowsProps) {
  const { plan, areas, days, dayInfo, blocksOfDay, assignmentsIn } = props;
  return (
    <>
      <tr>
        <td
          colSpan={days.length + 1}
          className="border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
        >
          {PLAN_LABELS[plan]}
        </td>
      </tr>
      {areas.map((area) => (
        <tr key={area.id} className="align-top">
          <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-2">
              <span>{area.icon}</span>
              <div>
                <div className="font-medium">{area.name}</div>
                {area.isCritical && (
                  <span className="text-[11px] text-red-600 dark:text-red-400">kritisch</span>
                )}
              </div>
            </div>
          </td>
          {days.map((date) => {
            const blocks = blocksOfDay(date).filter((block) => area.blockIds.includes(block.id));
            const closed = dayInfo(date).closed;
            return (
              <td
                key={date}
                className={`border-b border-l border-slate-100 p-1 align-top dark:border-slate-800 ${
                  closed ? 'bg-slate-50 dark:bg-slate-800/40' : ''
                }`}
              >
                {blocks.length === 0 || closed ? (
                  <div className="py-2 text-center text-xs text-slate-300 dark:text-slate-700">
                    –
                  </div>
                ) : (
                  <div className="space-y-1">
                    {blocks.map((block) => (
                      <SlotCell
                        key={block.id}
                        area={area}
                        block={block}
                        date={date}
                        assignments={assignmentsIn(date, block.id, area.id)}
                        employees={props.employees}
                        isAdmin={props.isAdmin}
                        isTemplateMatch={props.isTemplateMatch}
                        absentIn={props.absentIn}
                        onAdd={() => props.onAdd(date, block, area)}
                        onDelete={props.onDelete}
                        onToggleLock={props.onToggleLock}
                      />
                    ))}
                  </div>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

interface SlotCellProps {
  area: WorkArea;
  block: DayBlock;
  date: IsoDate;
  assignments: Assignment[];
  employees: Map<string, Employee>;
  isAdmin: boolean;
  isTemplateMatch: (assignment: Assignment) => boolean;
  absentIn: (employeeId: string, date: IsoDate, block: DayBlock) => boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onToggleLock: (id: string, locked: boolean) => void;
}

/**
 * Eine Zelle zeigt eine **Liste** von Personen, nicht eine einzelne.
 *
 * In der Vorgaengerversion holte die Oberflaeche die Belegung per `.find()`
 * und zeigte damit immer nur die erste Person - bei der Anmeldung mit zwei
 * Plaetzen war die zweite unsichtbar, obwohl sie im Datenbestand stand.
 */
function SlotCell({
  area,
  block,
  date,
  assignments,
  employees,
  isAdmin,
  isTemplateMatch,
  absentIn,
  onAdd,
  onDelete,
  onToggleLock,
}: SlotCellProps) {
  const required = minStaffFor(area, block.id);
  const missing = Math.max(0, required - assignments.length);
  const level =
    required === 0 ? 'none' : missing === 0 ? 'ok' : assignments.length === 0 ? 'empty' : 'under';

  const badgeStyle = {
    ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    under: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    empty: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    none: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  }[level];

  return (
    <div className="rounded-lg border border-slate-100 p-1.5 dark:border-slate-800">
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-[11px] text-slate-400">
          {formatHHMM(block.startMin)}–{formatHHMM(block.endMin)}
        </span>
        {required > 0 && (
          <span className={`rounded px-1.5 text-[11px] font-medium ${badgeStyle}`}>
            {assignments.length}/{required}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {assignments.map((assignment) => {
          const employee = employees.get(assignment.employeeId);
          const deviating = !isTemplateMatch(assignment);
          const absent = absentIn(assignment.employeeId, date, block);
          return (
            <div
              key={assignment.id}
              title={
                absent
                  ? 'Abwesend, aber noch eingeplant – Umplanungsvorschlag prüfen'
                  : assignment.reason
              }
              className={`group flex items-center gap-1 rounded px-1.5 py-1 text-xs ${
                absent
                  ? 'border border-red-400 bg-red-50 line-through dark:bg-red-950/40'
                  : deviating
                    ? 'border border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/30'
                    : 'bg-slate-100 dark:bg-slate-800'
              }`}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: employee?.color ?? '#94a3b8' }}
              />
              <span className="truncate">{employee ? shortName(employee) : 'Unbekannt'}</span>
              {isAdmin && (
                <span className="ml-auto flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => onToggleLock(assignment.id, !assignment.isLocked)}
                    title={assignment.isLocked ? 'Sperre lösen' : 'Festhalten'}
                    className="p-0.5 text-slate-400 hover:text-blue-600"
                  >
                    {assignment.isLocked ? (
                      <Lock className="size-3" />
                    ) : (
                      <Unlock className="size-3" />
                    )}
                  </button>
                  <button
                    onClick={() => onDelete(assignment.id)}
                    title="Entfernen"
                    className="p-0.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              )}
              {assignment.isLocked && !isAdmin && (
                <Lock className="ml-auto size-3 text-slate-400" />
              )}
            </div>
          );
        })}

        {/* Leere Pflichtplaetze bleiben sichtbar, statt einfach zu fehlen. */}
        {Array.from({ length: missing }).map((_, index) => (
          <button
            key={`missing-${index}`}
            onClick={isAdmin ? onAdd : undefined}
            disabled={!isAdmin}
            className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-red-300 px-1.5 py-1 text-[11px] text-red-500 hover:bg-red-50 disabled:cursor-default dark:border-red-800 dark:hover:bg-red-950/40"
          >
            <Plus className="size-3" /> offen
          </button>
        ))}

        {isAdmin && missing === 0 && (
          <button
            onClick={onAdd}
            className="flex w-full items-center justify-center rounded py-0.5 text-[11px] text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-slate-800"
          >
            <Plus className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------- Vorschlaege --

function ProposalsPanel({
  proposals,
  employees,
  areas,
  blocks,
}: {
  proposals: readonly PlanProposal[];
  employees: Map<string, Employee>;
  areas: Map<string, WorkArea>;
  blocks: Map<string, DayBlock>;
}) {
  const decide = useDecideProposal();
  const [openId, setOpenId] = useState<string | null>(proposals[0]?.id ?? null);

  return (
    <Card className="mb-4 border-amber-300 dark:border-amber-700">
      {proposals.map((proposal) => {
        const open = openId === proposal.id;
        const removed = proposal.changes.filter((c) => c.kind === 'removed').length;
        const added = proposal.changes.filter((c) => c.kind === 'added').length;
        return (
          <div
            key={proposal.id}
            className="border-b border-slate-100 last:border-0 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <AlertTriangle className="size-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">Umplanungsvorschlag: {proposal.title}</div>
                <div className="text-xs text-slate-500">
                  {removed} entfällt, {added} neu
                  {proposal.unfilledRequired > 0
                    ? ` · ${proposal.unfilledRequired} Pflichtplätze bleiben offen`
                    : ' · alle Pflichtplätze besetzt'}
                </div>
              </div>
              <Button onClick={() => setOpenId(open ? null : proposal.id)}>
                {open ? 'Einklappen' : 'Ansehen'}
              </Button>
              <Button
                onClick={() => decide.mutate({ id: proposal.id, action: 'discard' })}
                disabled={decide.isPending}
              >
                <X className="size-4" /> Verwerfen
              </Button>
              <Button
                variant="primary"
                onClick={() => decide.mutate({ id: proposal.id, action: 'apply' })}
                disabled={decide.isPending}
              >
                <Check className="size-4" /> Übernehmen
              </Button>
            </div>
            {open && (
              <ChangeList
                changes={proposal.changes}
                employees={employees}
                areas={areas}
                blocks={blocks}
              />
            )}
          </div>
        );
      })}
      {decide.error instanceof ApiError && (
        <div className="px-4 pb-3">
          <ErrorNote>{decide.error.message}</ErrorNote>
        </div>
      )}
    </Card>
  );
}

function ChangeList({
  changes,
  employees,
  areas,
  blocks,
}: {
  changes: readonly PlanChange[];
  employees: Map<string, Employee>;
  areas: Map<string, WorkArea>;
  blocks: Map<string, DayBlock>;
}) {
  // Nach Datum, Block und Bereich gruppieren: "Di 08–13 Labor: – Anna, + Clara".
  const groups = new Map<string, PlanChange[]>();
  for (const change of changes) {
    const key = `${change.date}|${change.dayBlockId}|${change.workAreaId}`;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  const name = (id: string) => {
    const employee = employees.get(id);
    return employee ? shortName(employee) : '?';
  };

  return (
    <ul className="divide-y divide-slate-100 border-t border-slate-100 px-4 text-sm dark:divide-slate-800 dark:border-slate-800">
      {[...groups.entries()].map(([key, entries]) => {
        const first = entries[0]!;
        const block = blocks.get(first.dayBlockId);
        const area = areas.get(first.workAreaId);
        return (
          <li key={key} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="w-40 text-slate-500">
              {WEEKDAY_SHORT[isoWeekday(first.date)]}{' '}
              {block ? `${formatHHMM(block.startMin)}–${formatHHMM(block.endMin)}` : ''}
            </span>
            <span className="w-44 font-medium">
              {area?.icon} {area?.name ?? 'Bereich'}
            </span>
            {entries
              .filter((c) => c.kind === 'removed')
              .map((c) => (
                <span
                  key={`r-${c.employeeId}`}
                  className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 line-through dark:bg-red-950 dark:text-red-300"
                >
                  {name(c.employeeId)}
                </span>
              ))}
            {entries
              .filter((c) => c.kind === 'added')
              .map((c) => (
                <span
                  key={`a-${c.employeeId}`}
                  className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  + {name(c.employeeId)}
                </span>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------- Dialog --

/**
 * Zuweisungsdialog mit Begruendung.
 *
 * Nicht waehlbare Personen werden nicht versteckt, sondern mit dem Grund
 * angezeigt - sonst raetselt man, warum jemand fehlt. Die Pruefung laeuft
 * mit derselben Funktion wie im Scheduler, nur hier im Browser.
 */
function AssignDialog({
  date,
  block,
  area,
  employees,
  matrix,
  absences,
  assignments,
  dayBlocks,
  minOverlapRatio,
  onClose,
}: {
  date: IsoDate;
  block: DayBlock;
  area: WorkArea;
  employees: readonly Employee[];
  matrix: readonly MatrixEntry[];
  absences: readonly AnyAbsence[];
  assignments: readonly Assignment[];
  dayBlocks: readonly DayBlock[];
  minOverlapRatio: number;
  onClose: () => void;
}) {
  const create = useCreateAssignment();

  const matrixMap = useMemo(() => {
    const map = new Map<string, MatrixEntry>();
    for (const entry of matrix) map.set(matrixKey(entry.employeeId, entry.workAreaId), entry);
    return map;
  }, [matrix]);

  // Belegte Zeitfenster je Person - auch aus anders geschnittenen Bloecken.
  const occupied = useMemo(() => {
    const blockById = new Map(dayBlocks.map((entry) => [entry.id, entry]));
    const map = new Map<string, { date: IsoDate; startMin: number; endMin: number }[]>();
    for (const entry of assignments) {
      const other = blockById.get(entry.dayBlockId);
      if (!other || entry.date !== date) continue;
      const list = map.get(entry.employeeId) ?? [];
      list.push({ date, startMin: other.startMin, endMin: other.endMin });
      map.set(entry.employeeId, list);
    }
    return map;
  }, [assignments, dayBlocks, date]);

  const soloPresent = assignments.some(
    (entry) =>
      entry.date === date &&
      entry.dayBlockId === block.id &&
      entry.workAreaId === area.id &&
      matrixMap.get(areaKey(entry.employeeId, area.id))?.clearance !== 'supervised',
  );

  const candidates = employees
    .map((employee) => {
      const planEmployee = {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        staffType: employee.staffType,
        canHomeoffice: employee.canHomeoffice,
        skillIds: employee.skillIds,
        workTimes: employee.workTimes,
        targetHoursPerWeek: employee.targetHoursPerWeek,
        sortOrder: employee.sortOrder,
      };
      let rejection = checkEligibility(
        planEmployee,
        { date, block, area },
        {
          occupied: occupied.get(employee.id) ?? [],
          weekCounts: new Map(),
          matrix: matrixMap,
          // Kolleginnen sehen den Grund nicht; fuer die Sperre genuegt,
          // dass jemand abwesend ist.
          absences: absences.map((absence) => ({
            employeeId: absence.employeeId,
            startDate: absence.startDate,
            endDate: absence.endDate,
            status: 'approved' as const,
            halfDay: absence.halfDay,
          })),
          minOverlapRatio,
        },
      );

      if (rejection === null && needsSupervision(planEmployee, area, matrixMap) && !soloPresent) {
        rejection = 'NEEDS_SUPERVISION';
      }

      return { employee, rejection };
    })
    // Fremde Gruppen ohne Freigabe gar nicht erst anbieten - das Raster
    // waere sonst voll mit "gehoert zu einer anderen Gruppe".
    .filter(({ rejection }) => rejection !== 'WRONG_PLAN')
    .sort((a, b) => {
      if ((a.rejection === null) !== (b.rejection === null)) return a.rejection === null ? -1 : 1;
      return a.employee.lastName.localeCompare(b.employee.lastName, 'de');
    });

  const message = create.error instanceof ApiError ? create.error.message : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="flex max-h-[80vh] w-full max-w-md flex-col">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div>
            <h2 className="font-semibold">
              {area.icon} {area.name}
            </h2>
            <p className="text-sm text-slate-500">
              {WEEKDAY_SHORT[isoWeekday(date)]}, {date.slice(8)}.{date.slice(5, 7)}. ·{' '}
              {formatHHMM(block.startMin)}–{formatHHMM(block.endMin)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {message && (
            <div className="mb-2">
              <ErrorNote>{message}</ErrorNote>
            </div>
          )}
          <ul className="space-y-1">
            {candidates.map(({ employee, rejection }) => (
              <li key={employee.id}>
                <button
                  disabled={rejection !== null || create.isPending}
                  onClick={() =>
                    create.mutate(
                      {
                        date,
                        dayBlockId: block.id,
                        workAreaId: area.id,
                        employeeId: employee.id,
                      },
                      { onSuccess: onClose },
                    )
                  }
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    rejection === null
                      ? 'hover:bg-blue-50 dark:hover:bg-blue-950/40'
                      : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: employee.color }}
                  />
                  <span className="font-medium">
                    {employee.firstName} {employee.lastName}
                  </span>
                  {rejection !== null && (
                    <span className="ml-auto text-xs text-slate-500">
                      {REJECTION_LABELS[rejection]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function DiagnosticsPanel({
  diagnostics,
  errorCount,
  source,
}: {
  diagnostics: readonly Diagnostic[];
  errorCount: number;
  source: string;
}) {
  const [open, setOpen] = useState(true);
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...diagnostics].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <Card className="mt-4">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium"
      >
        {errorCount > 0 ? (
          <AlertTriangle className="size-4 text-red-600" />
        ) : (
          <Info className="size-4 text-blue-600" />
        )}
        Auswertung der Planung
        <span className="text-sm font-normal text-slate-500">
          {errorCount > 0 ? `${errorCount} kritisch, ` : ''}
          {diagnostics.length} Hinweise{source ? ` · ${source}` : ''}
        </span>
        <ChevronDown
          className={`ml-auto size-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
          {sorted.map((entry, index) => (
            <li key={index} className="flex gap-2 px-4 py-2">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  entry.severity === 'error'
                    ? 'bg-red-500'
                    : entry.severity === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-slate-300'
                }`}
              />
              <span>{entry.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
