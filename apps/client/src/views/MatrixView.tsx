import { useMemo, useState } from 'react';
import { Ban, Check, Eye, Heart, Loader2, Minus, ThumbsDown, X } from 'lucide-react';
import type { Clearance, Employee, MatrixEntry, Preference, WorkArea } from '@haeppi/shared';
import {
  CLEARANCE_LABELS,
  DEFAULT_MATRIX_ENTRY,
  PREFERENCE_LABELS,
  STAFF_TYPE_LABELS,
  effectiveMinPerWeek,
  matrixKey,
  shortName,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import type { MatrixEntryInput } from '../api/queries';
import { useEmployees, useMatrix, useSaveMatrixRow, useWorkAreas } from '../api/queries';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Select,
  TextInput,
} from '../components/ui';

type Plan = 'mfa' | 'doctor';

const CLEARANCE_STYLE: Record<Clearance, string> = {
  solo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  supervised: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  blocked: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
};

const CLEARANCE_ICON: Record<Clearance, typeof Check> = {
  solo: Check,
  supervised: Eye,
  blocked: Ban,
};

const PREFERENCE_ICON: Record<Preference, typeof Heart | null> = {
  preferred: Heart,
  neutral: null,
  dislike: ThumbsDown,
  never: X,
};

export function MatrixView() {
  const [plan, setPlan] = useState<Plan>('mfa');
  const [editing, setEditing] = useState<{ employee: Employee; area: WorkArea } | null>(null);

  const { data: employees, isLoading: loadingEmployees } = useEmployees();
  const { data: workAreas, isLoading: loadingAreas } = useWorkAreas();
  const { data: entries, isLoading: loadingMatrix } = useMatrix();

  const byKey = useMemo(() => {
    const map = new Map<string, MatrixEntry>();
    for (const entry of entries ?? [])
      map.set(matrixKey(entry.employeeId, entry.workAreaId), entry);
    return map;
  }, [entries]);

  if (loadingEmployees || loadingAreas || loadingMatrix) {
    return (
      <div className="p-8 text-slate-500">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  // Aerzte planen in Zimmern, MFA in Funktionsbereichen - die Matrix zeigt
  // immer nur eine der beiden Welten, sonst wird das Raster unlesbar.
  const rows = (employees ?? []).filter((employee) =>
    plan === 'doctor' ? employee.staffType === 'doctor' : employee.staffType !== 'doctor',
  );
  const columns = (workAreas ?? []).filter((area) => area.plan === plan);

  return (
    <div className="p-8">
      <PageHeader
        title="Einsatz-Matrix"
        subtitle="Wer darf wo arbeiten, wie gerne – und wie oft muss es sein?"
        action={
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
        }
      />

      <Legend />

      {rows.length === 0 || columns.length === 0 ? (
        <EmptyState
          title="Noch nichts zu verteilen"
          hint="Für die Matrix braucht es mindestens eine Person und einen Arbeitsbereich in diesem Plan."
        />
      ) : (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-slate-200 bg-white px-4 py-3 text-left font-medium dark:border-slate-800 dark:bg-slate-900">
                  Mitarbeiter
                </th>
                {columns.map((area) => (
                  <th
                    key={area.id}
                    className="border-b border-slate-200 px-2 py-3 text-center align-bottom dark:border-slate-800"
                  >
                    <div className="mx-auto w-24 text-xs leading-tight">
                      <div className="text-base">{area.icon}</div>
                      <div className="mt-1 font-medium">{area.name}</div>
                      {area.rotationMinPerWeek !== null && (
                        <div
                          className="mt-0.5 text-[11px] text-blue-600 dark:text-blue-400"
                          title={`Pflichtrotation: jede Person mindestens ${area.rotationMinPerWeek}× pro Woche`}
                        >
                          Pflicht {area.rotationMinPerWeek}×
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((employee) => (
                <tr key={employee.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: employee.color }}
                      />
                      <div>
                        <div className="font-medium whitespace-nowrap">{shortName(employee)}</div>
                        <div className="text-xs text-slate-500">
                          {STAFF_TYPE_LABELS[employee.staffType]}
                        </div>
                      </div>
                    </div>
                  </td>
                  {columns.map((area) => (
                    <td
                      key={area.id}
                      className="border-b border-slate-100 px-2 py-2 text-center dark:border-slate-800"
                    >
                      <MatrixCell
                        entry={byKey.get(matrixKey(employee.id, area.id))}
                        area={area}
                        onClick={() => setEditing({ employee, area })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <CellEditor
          employee={editing.employee}
          area={editing.area}
          allEntries={entries ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <Check className="size-3.5 text-emerald-600" /> Eigenständig
      </span>
      <span className="flex items-center gap-1.5">
        <Eye className="size-3.5 text-amber-600" /> Nur mit Betreuung
      </span>
      <span className="flex items-center gap-1.5">
        <Ban className="size-3.5 text-slate-400" /> Nicht einsetzbar
      </span>
      <span className="ml-2 flex items-center gap-1.5">
        <Heart className="size-3.5 text-rose-500" /> gerne
      </span>
      <span className="flex items-center gap-1.5">
        <ThumbsDown className="size-3.5 text-slate-500" /> ungern
      </span>
      <span className="flex items-center gap-1.5">
        <X className="size-3.5 text-red-500" /> möglichst gar nicht
      </span>
    </div>
  );
}

function MatrixCell({
  entry,
  area,
  onClick,
}: {
  entry: MatrixEntry | undefined;
  area: WorkArea;
  onClick: () => void;
}) {
  const clearance = entry?.clearance ?? DEFAULT_MATRIX_ENTRY.clearance;
  const preference = entry?.preference ?? DEFAULT_MATRIX_ENTRY.preference;
  const ClearanceIcon = CLEARANCE_ICON[clearance];
  const PreferenceIcon = PREFERENCE_ICON[preference];

  const min = effectiveMinPerWeek(entry ?? { ...DEFAULT_MATRIX_ENTRY }, area.rotationMinPerWeek);
  const max = entry?.maxPerWeek ?? null;

  const title =
    `${CLEARANCE_LABELS[clearance]} · ${PREFERENCE_LABELS[preference]}` +
    (min > 0 ? ` · mind. ${min}×/Woche` : '') +
    (max !== null ? ` · höchstens ${max}×/Woche` : '');

  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-11 w-24 flex-col items-center justify-center gap-0.5 rounded-lg transition hover:ring-2 hover:ring-blue-500/40 ${CLEARANCE_STYLE[clearance]}`}
    >
      <span className="flex items-center gap-1">
        <ClearanceIcon className="size-4" />
        {PreferenceIcon && <PreferenceIcon className="size-3.5 opacity-80" />}
      </span>
      {(min > 0 || max !== null) && (
        <span className="text-[11px] leading-none opacity-90">
          {min > 0 ? `min ${min}` : ''}
          {min > 0 && max !== null ? ' · ' : ''}
          {max !== null ? `max ${max}` : ''}
        </span>
      )}
    </button>
  );
}

function CellEditor({
  employee,
  area,
  allEntries,
  onClose,
}: {
  employee: Employee;
  area: WorkArea;
  allEntries: readonly MatrixEntry[];
  onClose: () => void;
}) {
  const existing = allEntries.find(
    (entry) => entry.employeeId === employee.id && entry.workAreaId === area.id,
  );
  const [draft, setDraft] = useState<MatrixEntryInput>(() => ({
    workAreaId: area.id,
    clearance: existing?.clearance ?? DEFAULT_MATRIX_ENTRY.clearance,
    preference: existing?.preference ?? DEFAULT_MATRIX_ENTRY.preference,
    minPerWeek: existing?.minPerWeek ?? null,
    maxPerWeek: existing?.maxPerWeek ?? null,
    exemptRotation: existing?.exemptRotation ?? false,
  }));

  const save = useSaveMatrixRow();
  const message = save.error instanceof ApiError ? save.error.message : null;

  // Der Bereich hat eine Pflichtrotation, wenn nichts anderes gesetzt ist.
  const inheritedMin = area.rotationMinPerWeek;

  const submit = () => {
    // Die Route ersetzt immer die ganze Zeile, deshalb die uebrigen
    // Eintraege der Person unveraendert mitschicken.
    const others = allEntries
      .filter((entry) => entry.employeeId === employee.id && entry.workAreaId !== area.id)
      .map(({ employeeId: _employeeId, ...rest }) => rest);

    save.mutate({ employeeId: employee.id, entries: [...others, draft] }, { onSuccess: onClose });
  };

  const missingSkills = area.requiredSkillIds.filter((id) => !employee.skillIds.includes(id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md p-5">
        <div className="mb-1 text-sm text-slate-500">
          {employee.firstName} {employee.lastName}
        </div>
        <h2 className="mb-4 text-lg font-semibold">
          {area.icon} {area.name}
        </h2>

        {missingSkills.length > 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            Für diesen Bereich fehlt eine Pflichtqualifikation. Die Person ist hier unabhängig von
            der Freigabe nicht einplanbar.
          </p>
        )}

        <div className="space-y-4">
          <Field label="Freigabe">
            <Select
              value={draft.clearance}
              onChange={(event) =>
                setDraft({ ...draft, clearance: event.target.value as Clearance })
              }
            >
              <option value="solo">Eigenständig</option>
              <option value="supervised">Nur mit Betreuung</option>
              <option value="blocked">Nicht einsetzbar</option>
            </Select>
          </Field>

          <Field
            label="Vorliebe"
            hint={
              draft.preference === 'never'
                ? 'Wird nur im Notfall eingeteilt und im Plan sichtbar markiert.'
                : undefined
            }
          >
            <Select
              value={draft.preference}
              onChange={(event) =>
                setDraft({ ...draft, preference: event.target.value as Preference })
              }
            >
              <option value="preferred">Bevorzugt</option>
              <option value="neutral">Neutral</option>
              <option value="dislike">Ungern</option>
              <option value="never">Möglichst gar nicht</option>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Mindestens pro Woche"
              hint={
                draft.minPerWeek === null && inheritedMin !== null
                  ? `Aus der Bereichsregel: ${inheritedMin}×`
                  : undefined
              }
            >
              <TextInput
                type="number"
                min={0}
                max={20}
                placeholder={inheritedMin === null ? '–' : String(inheritedMin)}
                value={draft.minPerWeek ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    minPerWeek: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              />
            </Field>
            <Field label="Höchstens pro Woche">
              <TextInput
                type="number"
                min={0}
                max={20}
                placeholder="unbegrenzt"
                value={draft.maxPerWeek ?? ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    maxPerWeek: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>

          {inheritedMin !== null && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.exemptRotation}
                onChange={(event) => setDraft({ ...draft, exemptRotation: event.target.checked })}
                className="size-4 rounded border-slate-300 text-blue-600 dark:border-slate-600"
              />
              Von der Pflichtrotation dieses Bereichs befreien
            </label>
          )}

          {message && <ErrorNote>{message}</ErrorNote>}
        </div>

        <div className="mt-6 flex justify-between">
          <Button
            variant="ghost"
            onClick={() =>
              setDraft({
                workAreaId: area.id,
                ...DEFAULT_MATRIX_ENTRY,
              })
            }
          >
            <Minus className="size-4" /> Zurücksetzen
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>Abbrechen</Button>
            <Button variant="primary" onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Speichern
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
