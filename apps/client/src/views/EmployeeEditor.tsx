import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { DayWorkTime, Employee, PracticeWeekday, Skill } from '@haeppi/shared';
import {
  PRACTICE_WEEKDAYS,
  STAFF_TYPE_LABELS,
  WEEKDAY_LABELS,
  contractedHoursPerWeek,
  formatHHMM,
  parseHHMM,
  roundHours,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import type { EmployeeInput } from '../api/queries';
import { useSaveEmployee } from '../api/queries';
import { Button, Checkbox, ErrorNote, Field, Modal, Select, TextInput } from '../components/ui';

const DEFAULT_DAY: DayWorkTime = {
  isWorking: true,
  startMin: 480,
  endMin: 1020,
  breakMin: 60,
  location: 'practice',
};

function emptyEmployee(): EmployeeInput {
  return {
    firstName: '',
    lastName: '',
    staffType: 'mfa',
    employment: 'fulltime',
    targetHoursPerWeek: 40,
    canHomeoffice: false,
    color: '#3b82f6',
    entryDate: null,
    exitDate: null,
    isActive: true,
    sortOrder: 0,
    notes: '',
    workTimes: {
      1: DEFAULT_DAY,
      2: DEFAULT_DAY,
      3: DEFAULT_DAY,
      4: DEFAULT_DAY,
      5: DEFAULT_DAY,
    },
    skillIds: [],
  };
}

function toInput(employee: Employee): EmployeeInput {
  const { id: _id, version: _version, ...rest } = employee;
  return rest;
}

export function EmployeeEditor({
  employee,
  skills,
  onClose,
}: {
  employee: Employee | null;
  skills: readonly Skill[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EmployeeInput>(() =>
    employee ? toInput(employee) : emptyEmployee(),
  );
  const save = useSaveEmployee();

  const patch = (changes: Partial<EmployeeInput>) => setDraft((old) => ({ ...old, ...changes }));

  const patchDay = (weekday: PracticeWeekday, changes: Partial<DayWorkTime>) =>
    setDraft((old) => ({
      ...old,
      workTimes: { ...old.workTimes, [weekday]: { ...old.workTimes[weekday], ...changes } },
    }));

  const computed = roundHours(contractedHoursPerWeek(draft.workTimes));
  const deviates = Math.abs(computed - draft.targetHoursPerWeek) > 0.25;
  const message = save.error instanceof ApiError ? save.error.message : null;

  const submit = () => {
    save.mutate(
      {
        ...(employee ? { id: employee.id, version: employee.version } : {}),
        input: draft,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      wide
      title={employee ? `${employee.firstName} ${employee.lastName} bearbeiten` : 'Neue Person'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Speichern
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vorname">
            <TextInput
              value={draft.firstName}
              onChange={(event) => patch({ firstName: event.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Nachname">
            <TextInput
              value={draft.lastName}
              onChange={(event) => patch({ lastName: event.target.value })}
            />
          </Field>

          <Field
            label="Gruppe"
            hint={
              draft.staffType === 'pcm'
                ? 'Eigene Gruppe mit eigenen Bereichen. Aushilfe in MFA-Bereichen nur mit Freigabe in der Einsatz-Matrix.'
                : undefined
            }
          >
            <Select
              value={draft.staffType}
              onChange={(event) =>
                patch({ staffType: event.target.value as EmployeeInput['staffType'] })
              }
            >
              {(Object.keys(STAFF_TYPE_LABELS) as EmployeeInput['staffType'][]).map((value) => (
                <option key={value} value={value}>
                  {STAFF_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Beschäftigung">
            <Select
              value={draft.employment}
              onChange={(event) =>
                patch({ employment: event.target.value as EmployeeInput['employment'] })
              }
            >
              <option value="fulltime">Vollzeit</option>
              <option value="parttime">Teilzeit</option>
            </Select>
          </Field>

          <Field
            label="Vertragliche Sollstunden pro Woche"
            hint={
              deviates
                ? `Das Arbeitszeitmodell unten ergibt ${computed.toLocaleString('de-DE')} h.`
                : undefined
            }
          >
            <TextInput
              type="number"
              min={0}
              max={80}
              step={0.5}
              value={draft.targetHoursPerWeek}
              onChange={(event) => patch({ targetHoursPerWeek: Number(event.target.value) })}
              className={deviates ? 'border-amber-400' : ''}
            />
          </Field>

          <Field label="Farbe im Dienstplan">
            <input
              type="color"
              value={draft.color}
              onChange={(event) => patch({ color: event.target.value })}
              className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-950"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <Checkbox
            label="Darf im Homeoffice arbeiten"
            checked={draft.canHomeoffice}
            onChange={(value) => patch({ canHomeoffice: value })}
          />
          <Checkbox
            label="Aktiv"
            checked={draft.isActive}
            onChange={(value) => patch({ isActive: value })}
          />
        </div>

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-medium">Arbeitszeiten</h3>
            <span className="text-xs text-slate-500">
              ergibt{' '}
              <span className={deviates ? 'font-medium text-amber-600' : 'font-medium'}>
                {computed.toLocaleString('de-DE')} h
              </span>{' '}
              pro Woche
            </span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">Arbeitet</th>
                  <th className="px-3 py-2 font-medium">Von</th>
                  <th className="px-3 py-2 font-medium">Bis</th>
                  <th className="px-3 py-2 font-medium">Pause (Min.)</th>
                  <th className="px-3 py-2 font-medium">Ort</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {PRACTICE_WEEKDAYS.map((weekday) => {
                  const day = draft.workTimes[weekday];
                  return (
                    <tr key={weekday}>
                      <td className="px-3 py-2 font-medium">{WEEKDAY_LABELS[weekday]}</td>
                      <td className="px-3 py-2">
                        <Checkbox
                          label=""
                          checked={day.isWorking}
                          onChange={(value) => patchDay(weekday, { isWorking: value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <TimeInput
                          value={day.startMin}
                          disabled={!day.isWorking}
                          onChange={(value) => patchDay(weekday, { startMin: value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <TimeInput
                          value={day.endMin}
                          disabled={!day.isWorking}
                          onChange={(value) => patchDay(weekday, { endMin: value })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <TextInput
                          type="number"
                          min={0}
                          max={240}
                          step={15}
                          disabled={!day.isWorking}
                          value={day.breakMin}
                          onChange={(event) =>
                            patchDay(weekday, { breakMin: Number(event.target.value) })
                          }
                          className="w-24"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          disabled={!day.isWorking}
                          value={day.location}
                          onChange={(event) =>
                            patchDay(weekday, {
                              location: event.target.value as DayWorkTime['location'],
                            })
                          }
                          className="w-32"
                        >
                          <option value="practice">Praxis</option>
                          <option value="home" disabled={!draft.canHomeoffice}>
                            Homeoffice
                          </option>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Die Pause wird nur von der Arbeitszeit abgezogen und nicht verplant. An einem
            Homeoffice-Tag kommen nur Bereiche in Frage, die von zu Hause gehen.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">Qualifikationen</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {skills
              .filter((skill) => skill.isActive)
              .map((skill) => (
                <Checkbox
                  key={skill.id}
                  label={<span title={skill.description}>{skill.name}</span>}
                  checked={draft.skillIds.includes(skill.id)}
                  onChange={(value) =>
                    patch({
                      skillIds: value
                        ? [...draft.skillIds, skill.id]
                        : draft.skillIds.filter((id) => id !== skill.id),
                    })
                  }
                />
              ))}
          </div>
        </section>

        <Field label="Notiz (nur für die Praxisleitung sichtbar)">
          <textarea
            value={draft.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            rows={2}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950"
          />
        </Field>

        {message && <ErrorNote>{message}</ErrorNote>}
      </div>
    </Modal>
  );
}

function TimeInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  return (
    <TextInput
      type="time"
      step={300}
      disabled={disabled}
      value={formatHHMM(Math.min(value, 1439))}
      onChange={(event) => {
        // Leert der Browser das Feld, bleibt der alte Wert stehen -
        // sonst springt die Zeit beim Tippen auf 00:00.
        if (!event.target.value) return;
        onChange(parseHHMM(event.target.value));
      }}
      className="w-28"
    />
  );
}
