import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Lock,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type {
  Absence,
  Assignment,
  DayBlock,
  Diagnostic,
  Employee,
  IsoDate,
  MatrixEntry,
  PlanKind,
  PublicAbsence,
  SessionUser,
  WorkArea,
} from '@haeppi/shared';
import {
  DEFAULT_HOLIDAY_SETTINGS,
  REJECTION_LABELS,
  WEEKDAY_SHORT,
  addDays,
  areaKey,
  checkEligibility,
  formatHHMM,
  holidayName,
  isoWeekNumber,
  isoWeekday,
  matrixKey,
  minStaffFor,
  needsSupervision,
  planForStaffType,
  practiceWeekDates,
  shortName,
  startOfISOWeek,
  todayLocal,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import {
  useAbsences,
  useCreateAssignment,
  useDayBlocks,
  useDeleteAssignment,
  useEmployees,
  useGenerateRoster,
  useMatrix,
  useRoster,
  useSettings,
  useTemplate,
  useToggleLock,
  useWorkAreas,
} from '../api/queries';
import { Button, Card, ErrorNote, PageHeader } from '../components/ui';

export function RosterView({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'admin';
  const [plan, setPlan] = useState<PlanKind>(user.employeeId ? 'mfa' : 'mfa');
  const [weekStart, setWeekStart] = useState<IsoDate>(() => startOfISOWeek(todayLocal()));
  const [dialog, setDialog] = useState<{ date: IsoDate; block: DayBlock; area: WorkArea } | null>(
    null,
  );
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  const weekEnd = addDays(weekStart, 6);
  const days = practiceWeekDates(weekStart);

  const { data: employees } = useEmployees();
  const { data: workAreas } = useWorkAreas();
  const { data: dayBlocks } = useDayBlocks();
  const { data: matrix } = useMatrix();
  const { data: template } = useTemplate(plan);
  const { data: settings } = useSettings();
  const { data: absences } = useAbsences(weekStart, weekEnd);
  const { data: assignments, isLoading } = useRoster(weekStart, weekEnd, plan);

  const generate = useGenerateRoster();
  const deleteAssignment = useDeleteAssignment();
  const toggleLock = useToggleLock();

  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  const areas = useMemo(
    () => (workAreas ?? []).filter((area) => area.plan === plan),
    [workAreas, plan],
  );
  const byId = useMemo(
    () => new Map((employees ?? []).map((employee) => [employee.id, employee])),
    [employees],
  );

  const holidays = settings?.holidays ?? DEFAULT_HOLIDAY_SETTINGS;

  const blocksOfDay = (date: IsoDate) =>
    (dayBlocks ?? [])
      .filter((block) => block.weekday === isoWeekday(date) && block.kind !== 'closed')
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

  const runGenerate = (dryRun: boolean) => {
    generate.mutate(
      { weekStart, plan, dryRun },
      { onSuccess: (result) => setDiagnostics(result.diagnostics) },
    );
  };

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;

  return (
    <div className="p-6">
      <PageHeader
        title="Dienstplan"
        subtitle={`KW ${isoWeekNumber(weekStart)} · ${formatRange(weekStart)}`}
        action={
          isAdmin ? (
            <div className="flex items-center gap-2">
              <Button onClick={() => runGenerate(true)} disabled={generate.isPending}>
                Probelauf
              </Button>
              <Button
                variant="primary"
                onClick={() => runGenerate(false)}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Woche erzeugen
              </Button>
            </div>
          ) : undefined
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

        <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
          {(['mfa', 'doctor'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setPlan(value)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                plan === value
                  ? 'bg-blue-600 font-medium text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {value === 'mfa' ? 'MFA' : 'Ärzte'}
            </button>
          ))}
        </div>
      </div>

      {generate.error instanceof ApiError && (
        <div className="mb-4">
          <ErrorNote>{generate.error.message}</ErrorNote>
        </div>
      )}

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-slate-400" />
      ) : areas.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">
          Für diesen Plan sind keine Arbeitsbereiche angelegt.
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
                  const holiday = holidayName(date, holidays.state, holidays.options);
                  const closed = holiday !== null || holidays.additionalClosedDates.includes(date);
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
                      {closed && (
                        <div className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          {holiday ?? 'geschlossen'}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id} className="align-top">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-start gap-2">
                      <span>{area.icon}</span>
                      <div>
                        <div className="font-medium">{area.name}</div>
                        {area.isCritical && (
                          <span className="text-[11px] text-red-600 dark:text-red-400">
                            kritisch
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {days.map((date) => {
                    const blocks = blocksOfDay(date).filter((block) =>
                      area.blockIds.includes(block.id),
                    );
                    return (
                      <td
                        key={date}
                        className="border-b border-l border-slate-100 p-1 align-top dark:border-slate-800"
                      >
                        {blocks.length === 0 ? (
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
                                assignments={assignmentsIn(date, block.id, area.id)}
                                employees={byId}
                                isAdmin={isAdmin}
                                isTemplateMatch={isTemplateMatch}
                                onAdd={() => setDialog({ date, block, area })}
                                onDelete={(id) => deleteAssignment.mutate(id)}
                                onToggleLock={(id, locked) => toggleLock.mutate({ id, locked })}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {diagnostics.length > 0 && (
        <DiagnosticsPanel
          diagnostics={diagnostics}
          errorCount={errorCount}
          open={showDiagnostics}
          onToggle={() => setShowDiagnostics((value) => !value)}
          onClose={() => setDiagnostics([])}
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
          minOverlapRatio={settings?.minOverlapRatio ?? 0.5}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function formatRange(weekStart: IsoDate): string {
  const format = (date: IsoDate) =>
    new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${format(weekStart)} – ${format(addDays(weekStart, 4))}`;
}

interface SlotCellProps {
  area: WorkArea;
  block: DayBlock;
  assignments: Assignment[];
  employees: Map<string, Employee>;
  isAdmin: boolean;
  isTemplateMatch: (assignment: Assignment) => boolean;
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
  assignments,
  employees,
  isAdmin,
  isTemplateMatch,
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
          return (
            <div
              key={assignment.id}
              title={assignment.reason}
              className={`group flex items-center gap-1 rounded px-1.5 py-1 text-xs ${
                deviating
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
  minOverlapRatio,
  onClose,
}: {
  date: IsoDate;
  block: DayBlock;
  area: WorkArea;
  employees: readonly Employee[];
  matrix: readonly MatrixEntry[];
  absences: readonly (Absence | PublicAbsence)[];
  assignments: readonly Assignment[];
  minOverlapRatio: number;
  onClose: () => void;
}) {
  const create = useCreateAssignment();

  const matrixMap = useMemo(() => {
    const map = new Map<string, MatrixEntry>();
    for (const entry of matrix) map.set(matrixKey(entry.employeeId, entry.workAreaId), entry);
    return map;
  }, [matrix]);

  const occupied = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const entry of assignments) {
      if (entry.date !== date || entry.dayBlockId !== block.id) continue;
      const set = map.get(entry.employeeId) ?? new Set<string>();
      set.add(`${date}|${block.id}`);
      map.set(entry.employeeId, set);
    }
    return map;
  }, [assignments, date, block.id]);

  const soloPresent = assignments.some(
    (entry) =>
      entry.date === date &&
      entry.dayBlockId === block.id &&
      entry.workAreaId === area.id &&
      matrixMap.get(areaKey(entry.employeeId, area.id))?.clearance !== 'supervised',
  );

  const candidates = employees
    .filter((employee) => planForStaffType(employee.staffType) === area.plan)
    .map((employee) => {
      let rejection = checkEligibility(
        {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          staffType: employee.staffType,
          isPcm: employee.isPcm,
          canHomeoffice: employee.canHomeoffice,
          skillIds: employee.skillIds,
          workTimes: employee.workTimes,
          targetHoursPerWeek: employee.targetHoursPerWeek,
          sortOrder: employee.sortOrder,
        },
        { date, block, area },
        {
          occupiedBlocks: occupied.get(employee.id) ?? new Set(),
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
          pcmBusy: new Set<string>(),
          minOverlapRatio,
        },
      );

      if (
        rejection === null &&
        needsSupervision(
          { ...employee, sortOrder: employee.sortOrder } as never,
          area,
          matrixMap,
        ) &&
        !soloPresent
      ) {
        rejection = 'NEEDS_SUPERVISION';
      }

      return { employee, rejection };
    })
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
  open,
  onToggle,
  onClose,
}: {
  diagnostics: readonly Diagnostic[];
  errorCount: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...diagnostics].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <Card className="mt-4">
      <button
        onClick={onToggle}
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
          {diagnostics.length} Hinweise
        </span>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="ml-auto p-1 text-slate-400 hover:text-slate-700"
          aria-label="Ausblenden"
        >
          <X className="size-4" />
        </button>
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
