import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import type {
  DayBlock,
  Employee,
  MatrixEntry,
  PlanKind,
  PracticeWeekday,
  TemplateAssignment,
  WorkArea,
} from '@haeppi/shared';
import {
  PLAN_KINDS,
  PLAN_LABELS,
  PRACTICE_WEEKDAYS,
  WEEKDAY_SHORT,
  formatHHMM,
  matrixKey,
  minStaffFor,
  planForStaffType,
  shortName,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import {
  useDayBlocks,
  useEmployees,
  useMatrix,
  useSaveTemplate,
  useTemplate,
  useWorkAreas,
} from '../api/queries';
import { Button, Card, ErrorNote, PageHeader } from '../components/ui';

type Draft = Omit<TemplateAssignment, 'id'>;

/**
 * Die Musterwoche: wer ist normalerweise wo.
 *
 * Jede konkrete Woche entsteht daraus; nur was diese Woche anders ist
 * (Urlaub, Krankheit, Berufsschule), plant der Scheduler nach. Deshalb
 * ist das hier der wichtigste Bildschirm fuer stabile Wochen.
 */
export function TemplateView() {
  const { data: employees } = useEmployees();
  const { data: workAreas } = useWorkAreas();
  const { data: dayBlocks } = useDayBlocks();
  const { data: matrix } = useMatrix();
  const { data: saved, isLoading } = useTemplate();

  if (isLoading || !saved || !employees || !workAreas || !dayBlocks) {
    return (
      <div className="p-8">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <TemplateEditor
      saved={saved}
      employees={employees}
      workAreas={workAreas}
      dayBlocks={dayBlocks}
      matrix={matrix ?? []}
    />
  );
}

function TemplateEditor({
  saved,
  employees,
  workAreas,
  dayBlocks,
  matrix,
}: {
  saved: readonly TemplateAssignment[];
  employees: readonly Employee[];
  workAreas: readonly WorkArea[];
  dayBlocks: readonly DayBlock[];
  matrix: readonly MatrixEntry[];
}) {
  const [draft, setDraft] = useState<Draft[]>(() => saved.map(({ id: _id, ...rest }) => rest));
  const [dialog, setDialog] = useState<{ block: DayBlock; area: WorkArea } | null>(null);
  const save = useSaveTemplate();

  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const matrixMap = useMemo(() => {
    const map = new Map<string, MatrixEntry>();
    for (const entry of matrix) map.set(matrixKey(entry.employeeId, entry.workAreaId), entry);
    return map;
  }, [matrix]);

  const savedKey = JSON.stringify(
    [...saved].map(({ id: _id, ...rest }) => rest).sort(compareDraft),
  );
  const dirty = JSON.stringify([...draft].sort(compareDraft)) !== savedKey;
  const message = save.error instanceof ApiError ? save.error.message : null;

  const entriesIn = (blockId: string, areaId: string) =>
    draft.filter((row) => row.dayBlockId === blockId && row.workAreaId === areaId);

  const remove = (row: Draft) =>
    setDraft((old) =>
      old.filter(
        (entry) =>
          !(
            entry.employeeId === row.employeeId &&
            entry.dayBlockId === row.dayBlockId &&
            entry.workAreaId === row.workAreaId
          ),
      ),
    );

  const add = (row: Draft) =>
    setDraft((old) => [
      // Eine Person kann pro Block nur an einem Ort sein.
      ...old.filter(
        (entry) => !(entry.employeeId === row.employeeId && entry.dayBlockId === row.dayBlockId),
      ),
      row,
    ]);

  const groups = PLAN_KINDS.map((plan) => ({
    plan,
    areas: workAreas.filter((area) => area.plan === plan),
  })).filter((group) => group.areas.length > 0);

  const blocksOf = (plan: PlanKind, weekday: PracticeWeekday) =>
    dayBlocks
      .filter(
        (block) => block.plan === plan && block.weekday === weekday && block.kind !== 'closed',
      )
      .sort((a, b) => a.startMin - b.startMin);

  return (
    <div className="p-6">
      <PageHeader
        title="Musterwoche"
        subtitle="Wer ist normalerweise wo – die Grundlage jeder Woche"
        action={
          <Button
            variant="primary"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Speichern
          </Button>
        }
      />

      <Card className="mb-4 p-4 text-sm text-slate-600 dark:text-slate-400">
        Jede Woche wird aus dieser Vorlage erzeugt. Fällt jemand aus, plant die Anwendung nur die
        betroffenen Plätze nach – alles andere bleibt, wie es hier steht. Eine gelungene Woche lässt
        sich im Dienstplan mit »Als Musterwoche übernehmen« hierher kopieren.
      </Card>

      {message && (
        <div className="mb-4">
          <ErrorNote>{message}</ErrorNote>
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-44 border-b border-slate-200 bg-white px-3 py-2 text-left font-medium dark:border-slate-800 dark:bg-slate-900">
                Bereich
              </th>
              {PRACTICE_WEEKDAYS.map((weekday) => (
                <th
                  key={weekday}
                  className="border-b border-slate-200 px-2 py-2 text-center text-xs text-slate-500 dark:border-slate-800"
                >
                  {WEEKDAY_SHORT[weekday]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <GroupRows
                key={group.plan}
                plan={group.plan}
                areas={group.areas}
                blocksOf={(weekday) => blocksOf(group.plan, weekday)}
                entriesIn={entriesIn}
                employees={byId}
                onAdd={(block, area) => setDialog({ block, area })}
                onRemove={remove}
              />
            ))}
          </tbody>
        </table>
      </Card>

      {dialog && (
        <PickDialog
          block={dialog.block}
          area={dialog.area}
          employees={employees}
          matrix={matrixMap}
          taken={draft
            .filter((row) => row.dayBlockId === dialog.block.id)
            .map((row) => row.employeeId)}
          onPick={(employeeId) => {
            add({ employeeId, dayBlockId: dialog.block.id, workAreaId: dialog.area.id });
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function compareDraft(a: Draft, b: Draft): number {
  return (
    a.dayBlockId.localeCompare(b.dayBlockId) ||
    a.workAreaId.localeCompare(b.workAreaId) ||
    a.employeeId.localeCompare(b.employeeId)
  );
}

function GroupRows({
  plan,
  areas,
  blocksOf,
  entriesIn,
  employees,
  onAdd,
  onRemove,
}: {
  plan: PlanKind;
  areas: readonly WorkArea[];
  blocksOf: (weekday: PracticeWeekday) => DayBlock[];
  entriesIn: (blockId: string, areaId: string) => Draft[];
  employees: Map<string, Employee>;
  onAdd: (block: DayBlock, area: WorkArea) => void;
  onRemove: (row: Draft) => void;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={6}
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
              <div className="font-medium">{area.name}</div>
            </div>
          </td>
          {PRACTICE_WEEKDAYS.map((weekday) => {
            const blocks = blocksOf(weekday).filter((block) => area.blockIds.includes(block.id));
            return (
              <td
                key={weekday}
                className="border-b border-l border-slate-100 p-1 align-top dark:border-slate-800"
              >
                {blocks.length === 0 ? (
                  <div className="py-2 text-center text-xs text-slate-300 dark:text-slate-700">
                    –
                  </div>
                ) : (
                  <div className="space-y-1">
                    {blocks.map((block) => {
                      const rows = entriesIn(block.id, area.id);
                      const required = minStaffFor(area, block.id);
                      return (
                        <div
                          key={block.id}
                          className="rounded-lg border border-slate-100 p-1.5 dark:border-slate-800"
                        >
                          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              {formatHHMM(block.startMin)}–{formatHHMM(block.endMin)}
                            </span>
                            {required > 0 && (
                              <span
                                className={
                                  rows.length >= required ? 'text-emerald-600' : 'text-amber-600'
                                }
                              >
                                {rows.length}/{required}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1">
                            {rows.map((row) => {
                              const employee = employees.get(row.employeeId);
                              return (
                                <div
                                  key={row.employeeId}
                                  className="group flex items-center gap-1 rounded bg-slate-100 px-1.5 py-1 text-xs dark:bg-slate-800"
                                >
                                  <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: employee?.color ?? '#94a3b8' }}
                                  />
                                  <span className="truncate">
                                    {employee ? shortName(employee) : 'Unbekannt'}
                                  </span>
                                  <button
                                    onClick={() => onRemove(row)}
                                    title="Entfernen"
                                    className="ml-auto p-0.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </div>
                              );
                            })}
                            <button
                              onClick={() => onAdd(block, area)}
                              className="flex w-full items-center justify-center rounded border border-dashed border-slate-200 py-0.5 text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              <Plus className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
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

/** Person fuer einen Platz der Musterwoche waehlen - mit Grund, wer nicht passt. */
function PickDialog({
  block,
  area,
  employees,
  matrix,
  taken,
  onPick,
  onClose,
}: {
  block: DayBlock;
  area: WorkArea;
  employees: readonly Employee[];
  matrix: Map<string, MatrixEntry>;
  taken: readonly string[];
  onPick: (employeeId: string) => void;
  onClose: () => void;
}) {
  const candidates = employees
    .map((employee) => {
      const entry = matrix.get(matrixKey(employee.id, area.id));
      let reason: string | null = null;
      if (
        planForStaffType(employee.staffType) !== area.plan &&
        (!entry || entry.clearance === 'blocked')
      ) {
        reason = 'andere Gruppe';
      } else if (!employee.workTimes[block.weekday].isWorking) {
        reason = 'arbeitet an diesem Tag nicht';
      } else if (entry?.clearance === 'blocked') {
        reason = 'nicht freigegeben';
      } else if (
        employee.workTimes[block.weekday].location === 'home' &&
        area.location === 'practice'
      ) {
        reason = 'Homeoffice-Tag';
      } else if (area.location === 'home' && !employee.canHomeoffice) {
        reason = 'kein Homeoffice';
      } else if (area.requiredSkillIds.some((id) => !employee.skillIds.includes(id))) {
        reason = 'Qualifikation fehlt';
      } else if (taken.includes(employee.id)) {
        reason = 'in diesem Block schon eingeteilt';
      }
      return { employee, reason };
    })
    .filter(({ reason }) => reason !== 'andere Gruppe')
    .sort((a, b) => {
      if ((a.reason === null) !== (b.reason === null)) return a.reason === null ? -1 : 1;
      return a.employee.lastName.localeCompare(b.employee.lastName, 'de');
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="flex max-h-[80vh] w-full max-w-md flex-col">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div>
            <h2 className="font-semibold">
              {area.icon} {area.name}
            </h2>
            <p className="text-sm text-slate-500">
              {WEEKDAY_SHORT[block.weekday]} · {formatHHMM(block.startMin)}–
              {formatHHMM(block.endMin)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {candidates.map(({ employee, reason }) => (
              <li key={employee.id}>
                <button
                  disabled={reason !== null}
                  onClick={() => onPick(employee.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                    reason === null
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
                  {reason && <span className="ml-auto text-xs text-slate-500">{reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
