import { useState } from 'react';
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DayBlock, Skill, WorkArea } from '@haeppi/shared';
import {
  AREA_ICONS,
  AREA_KIND_LABELS,
  SKILL_CATEGORIES,
  WEEKDAY_SHORT,
  formatHHMM,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import type { SkillInput, WorkAreaInput } from '../api/queries';
import {
  useDayBlocks,
  useDeleteSkill,
  useDeleteWorkArea,
  useSaveSkill,
  useSaveWorkArea,
  useSkills,
  useWorkAreas,
} from '../api/queries';
import {
  Button,
  Card,
  Checkbox,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Select,
  TextInput,
} from '../components/ui';

type Tab = 'areas' | 'skills';

export function AreasView() {
  const [tab, setTab] = useState<Tab>('areas');

  return (
    <div className="p-8">
      <PageHeader
        title="Arbeitsbereiche & Qualifikationen"
        subtitle="Wo gearbeitet wird und was dafür nötig ist"
        action={
          <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
            {(
              [
                ['areas', 'Bereiche'],
                ['skills', 'Qualifikationen'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  tab === value
                    ? 'bg-blue-600 font-medium text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {tab === 'areas' ? <AreaList /> : <SkillList />}
    </div>
  );
}

// ------------------------------------------------------------- Bereiche --

function AreaList() {
  const { data: areas, isLoading } = useWorkAreas(true);
  const { data: skills } = useSkills();
  const { data: dayBlocks } = useDayBlocks();
  const remove = useDeleteWorkArea();
  const [editing, setEditing] = useState<WorkArea | null | undefined>(undefined);

  if (isLoading) return <Loader2 className="size-5 animate-spin text-slate-400" />;

  const byPlan = (plan: 'mfa' | 'doctor') => (areas ?? []).filter((area) => area.plan === plan);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing(null)}>
          <Plus className="size-4" /> Bereich anlegen
        </Button>
      </div>

      {(
        [
          ['mfa', 'MFA'],
          ['doctor', 'Ärzte'],
        ] as const
      ).map(([plan, label]) => (
        <section key={plan}>
          <h2 className="mb-2 text-sm font-medium tracking-wide text-slate-500 uppercase">
            {label}
          </h2>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {byPlan(plan).length === 0 ? (
              <p className="p-6 text-sm text-slate-500">Keine Bereiche angelegt.</p>
            ) : (
              byPlan(plan).map((area) => (
                <div key={area.id} className="flex items-start gap-3 p-4">
                  <span className="text-xl">{area.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{area.name}</span>
                      {area.isCritical && (
                        <Badge tone="red" title="Muss besetzt sein">
                          kritisch
                        </Badge>
                      )}
                      {!area.isActive && <Badge tone="slate">inaktiv</Badge>}
                      {area.rotationMinPerWeek !== null && (
                        <Badge tone="blue" title="Jede Person mindestens so oft pro Woche">
                          Pflicht {area.rotationMinPerWeek}×/Woche
                        </Badge>
                      )}
                      {area.requiresHomeoffice && <Badge tone="emerald">Homeoffice nötig</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">{area.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {AREA_KIND_LABELS[area.kind]} · Besetzung {area.minStaff}
                      {area.maxStaff === null ? '+' : `–${area.maxStaff}`} · {area.blockIds.length}{' '}
                      Zeitfenster
                      {area.requiredSkillIds.length > 0 && (
                        <>
                          {' '}
                          · setzt voraus:{' '}
                          {area.requiredSkillIds
                            .map((id) => skills?.find((s) => s.id === id)?.name ?? '?')
                            .join(', ')}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <IconButton onClick={() => setEditing(area)} title="Bearbeiten">
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      danger
                      title="Löschen"
                      onClick={() => {
                        remove.mutate(
                          { id: area.id },
                          {
                            onError: (error) => {
                              if (
                                error instanceof ApiError &&
                                window.confirm(`${error.message}\n\nTrotzdem löschen?`)
                              ) {
                                remove.mutate({ id: area.id, force: true });
                              }
                            },
                          },
                        );
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
              ))
            )}
          </Card>
        </section>
      ))}

      {editing !== undefined && (
        <AreaEditor
          area={editing}
          skills={skills ?? []}
          dayBlocks={dayBlocks ?? []}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}

function emptyArea(): WorkAreaInput {
  return {
    plan: 'mfa',
    name: '',
    description: '',
    kind: 'service',
    isCritical: false,
    minStaff: 1,
    maxStaff: 1,
    requiresHomeoffice: false,
    rotationMinPerWeek: null,
    icon: '🏥',
    color: '#3b82f6',
    sortOrder: 50,
    isActive: true,
    requiredSkillIds: [],
    blockIds: [],
    blockMinStaff: {},
  };
}

function AreaEditor({
  area,
  skills,
  dayBlocks,
  onClose,
}: {
  area: WorkArea | null;
  skills: readonly Skill[];
  dayBlocks: readonly DayBlock[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WorkAreaInput>(() => {
    if (!area) return emptyArea();
    const { id: _id, ...rest } = area;
    return rest;
  });
  const save = useSaveWorkArea();
  const patch = (changes: Partial<WorkAreaInput>) => setDraft((old) => ({ ...old, ...changes }));
  const message = save.error instanceof ApiError ? save.error.message : null;

  const toggleBlock = (blockId: string) =>
    patch({
      blockIds: draft.blockIds.includes(blockId)
        ? draft.blockIds.filter((id) => id !== blockId)
        : [...draft.blockIds, blockId],
    });

  const byWeekday = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    blocks: dayBlocks
      .filter((block) => block.weekday === weekday && block.kind !== 'closed')
      .sort((a, b) => a.startMin - b.startMin),
  }));

  return (
    <Modal
      wide
      title={area ? `${area.name} bearbeiten` : 'Neuer Arbeitsbereich'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { ...(area ? { id: area.id } : {}), input: draft },
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
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextInput
              value={draft.name}
              onChange={(event) => patch({ name: event.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Dienstplan">
            <Select
              value={draft.plan}
              onChange={(event) => patch({ plan: event.target.value as 'mfa' | 'doctor' })}
            >
              <option value="mfa">MFA</option>
              <option value="doctor">Ärzte</option>
            </Select>
          </Field>
          <Field label="Beschreibung" className="sm:col-span-2">
            <TextInput
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </Field>
          <Field label="Art">
            <Select
              value={draft.kind}
              onChange={(event) => patch({ kind: event.target.value as WorkArea['kind'] })}
            >
              {Object.entries(AREA_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Symbol">
            <div className="flex flex-wrap gap-1">
              {AREA_ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => patch({ icon })}
                  className={`rounded px-1.5 py-1 text-lg ${
                    draft.icon === icon ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-slate-100'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Mindestbesetzung">
            <TextInput
              type="number"
              min={0}
              max={20}
              value={draft.minStaff}
              onChange={(event) => patch({ minStaff: Number(event.target.value) })}
            />
          </Field>
          <Field label="Obergrenze" hint="leer = unbegrenzt">
            <TextInput
              type="number"
              min={0}
              max={20}
              value={draft.maxStaff ?? ''}
              onChange={(event) =>
                patch({ maxStaff: event.target.value === '' ? null : Number(event.target.value) })
              }
            />
          </Field>
          <Field
            label="Pflichtrotation pro Woche"
            hint="leer = keine. Gilt für jede Person des Plans."
          >
            <TextInput
              type="number"
              min={0}
              max={10}
              value={draft.rotationMinPerWeek ?? ''}
              onChange={(event) =>
                patch({
                  rotationMinPerWeek: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </Field>
          <Field label="Reihenfolge im Plan">
            <TextInput
              type="number"
              min={0}
              value={draft.sortOrder}
              onChange={(event) => patch({ sortOrder: Number(event.target.value) })}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <Checkbox
            label="Kritischer Bereich (muss besetzt sein)"
            checked={draft.isCritical}
            onChange={(value) => patch({ isCritical: value })}
          />
          <Checkbox
            label="Setzt Homeoffice-Berechtigung voraus"
            checked={draft.requiresHomeoffice}
            onChange={(value) => patch({ requiresHomeoffice: value })}
          />
          <Checkbox
            label="Aktiv"
            checked={draft.isActive}
            onChange={(value) => patch({ isActive: value })}
          />
        </div>

        <section>
          <h3 className="mb-2 text-sm font-medium">Pflichtqualifikationen</h3>
          <p className="mb-2 text-xs text-slate-500">
            Ohne diese Qualifikation ist niemand hier einplanbar – unabhängig von der Freigabe.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {skills
              .filter((skill) => skill.isActive)
              .map((skill) => (
                <Checkbox
                  key={skill.id}
                  label={skill.name}
                  checked={draft.requiredSkillIds.includes(skill.id)}
                  onChange={(value) =>
                    patch({
                      requiredSkillIds: value
                        ? [...draft.requiredSkillIds, skill.id]
                        : draft.requiredSkillIds.filter((id) => id !== skill.id),
                    })
                  }
                />
              ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">Betriebszeiten</h3>
          <p className="mb-2 text-xs text-slate-500">
            In welchen Zeitfenstern der Bereich läuft. Das Labor zum Beispiel nur vormittags.
          </p>
          <div className="space-y-2">
            {byWeekday.map(({ weekday, blocks }) => (
              <div key={weekday} className="flex flex-wrap items-center gap-2">
                <span className="w-8 text-sm font-medium">{WEEKDAY_SHORT[weekday as 1]}</span>
                {blocks.map((block) => {
                  const active = draft.blockIds.includes(block.id);
                  return (
                    <button
                      key={block.id}
                      onClick={() => toggleBlock(block.id)}
                      className={`rounded-lg border px-2 py-1 text-xs transition ${
                        active
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
                      }`}
                    >
                      {formatHHMM(block.startMin)}–{formatHHMM(block.endMin)}
                      {active && draft.blockMinStaff[block.id] !== undefined && (
                        <span className="ml-1 font-medium">
                          (min {draft.blockMinStaff[block.id]})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {message && <ErrorNote>{message}</ErrorNote>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------- Qualifikationen --

function SkillList() {
  const { data: skills, isLoading } = useSkills();
  const { data: areas } = useWorkAreas(true);
  const remove = useDeleteSkill();
  const [editing, setEditing] = useState<Skill | null | undefined>(undefined);

  if (isLoading) return <Loader2 className="size-5 animate-spin text-slate-400" />;

  const usedBy = (skillId: string) =>
    (areas ?? []).filter((area) => area.requiredSkillIds.includes(skillId));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing(null)}>
          <Plus className="size-4" /> Qualifikation anlegen
        </Button>
      </div>

      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {(skills ?? []).map((skill) => {
          const required = usedBy(skill.id);
          return (
            <div key={skill.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{skill.name}</span>
                  <Badge tone="slate">{skill.category}</Badge>
                  {!skill.isActive && <Badge tone="slate">inaktiv</Badge>}
                  {required.length > 0 && (
                    <Badge tone="amber" title="Pflichtvoraussetzung">
                      Pflicht in {required.map((area) => area.name).join(', ')}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-500">{skill.description}</p>
              </div>
              <div className="flex gap-1">
                <IconButton onClick={() => setEditing(skill)} title="Bearbeiten">
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  danger
                  title="Löschen"
                  onClick={() =>
                    remove.mutate(
                      { id: skill.id },
                      {
                        onError: (error) => {
                          if (
                            error instanceof ApiError &&
                            window.confirm(`${error.message}\n\nTrotzdem löschen?`)
                          ) {
                            remove.mutate({ id: skill.id, force: true });
                          }
                        },
                      },
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          );
        })}
      </Card>

      {editing !== undefined && (
        <SkillEditor skill={editing} onClose={() => setEditing(undefined)} />
      )}
    </div>
  );
}

function SkillEditor({ skill, onClose }: { skill: Skill | null; onClose: () => void }) {
  const [draft, setDraft] = useState<SkillInput>(() =>
    skill
      ? {
          name: skill.name,
          category: skill.category,
          description: skill.description,
          isActive: skill.isActive,
        }
      : { name: '', category: 'Medizinisch', description: '', isActive: true },
  );
  const save = useSaveSkill();
  const message = save.error instanceof ApiError ? save.error.message : null;

  return (
    <Modal
      title={skill ? `${skill.name} bearbeiten` : 'Neue Qualifikation'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { ...(skill ? { id: skill.id } : {}), input: draft },
                { onSuccess: onClose },
              )
            }
          >
            Speichern
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <TextInput
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Kategorie">
          <Select
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
          >
            {SKILL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Beschreibung">
          <TextInput
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </Field>
        <Checkbox
          label="Aktiv"
          checked={draft.isActive}
          onChange={(value) => setDraft({ ...draft, isActive: value })}
        />
        {message && <ErrorNote>{message}</ErrorNote>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- Bausteine --

function Badge({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone: 'red' | 'blue' | 'amber' | 'emerald' | 'slate';
  title?: string;
}) {
  const styles = {
    red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  }[tone];
  return (
    <span title={title} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${styles}`}>
      {children}
    </span>
  );
}

function IconButton({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-lg p-1.5 text-slate-400 transition ${
        danger
          ? 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50'
          : 'hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

export { AlertTriangle };
