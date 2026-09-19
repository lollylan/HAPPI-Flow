import { useState } from 'react';
import { Check, Clock, Loader2, Plus, Trash2 } from 'lucide-react';
import type { BlockKind, DayBlock, PlanKind, PracticeWeekday } from '@haeppi/shared';
import {
  BLOCK_KIND_LABELS,
  PLAN_KINDS,
  PLAN_LABELS,
  PRACTICE_WEEKDAYS,
  WEEKDAY_LABELS,
  formatHHMM,
  parseHHMM,
} from '@haeppi/shared';
import { ApiError } from '../api/client';
import { useDayBlocks, useSaveDayBlocks } from '../api/queries';
import { Button, Card, ErrorNote, PageHeader, Select, TextInput } from '../components/ui';

type DraftBlock = Omit<DayBlock, 'id'> & { id?: string };

const KIND_STYLE: Record<BlockKind, string> = {
  consultation: 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40',
  backoffice: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60',
  closed: 'border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900',
};

export function TimeModelView() {
  const { data: dayBlocks, isLoading } = useDayBlocks();
  const [plan, setPlan] = useState<PlanKind>('mfa');

  if (isLoading || !dayBlocks) {
    return (
      <div className="p-8">
        <Loader2 className="size-5 animate-spin text-slate-400" />
      </div>
    );
  }
  // Der Schluessel erzwingt ein frisches Formular je Gruppe - sonst blieben
  // ungespeicherte Aenderungen der einen Gruppe im Entwurf der anderen.
  return (
    <TimeModelForm
      key={plan}
      plan={plan}
      onPlanChange={setPlan}
      saved={dayBlocks.filter((block) => block.plan === plan)}
    />
  );
}

function TimeModelForm({
  plan,
  onPlanChange,
  saved,
}: {
  plan: PlanKind;
  onPlanChange: (plan: PlanKind) => void;
  saved: readonly DayBlock[];
}) {
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => saved.map((block) => ({ ...block })));
  const save = useSaveDayBlocks();

  const dirty = JSON.stringify(blocks) !== JSON.stringify(saved);
  const message = save.error instanceof ApiError ? save.error.message : null;

  const ofDay = (weekday: PracticeWeekday) =>
    blocks
      .map((block, index) => ({ block, index }))
      .filter((entry) => entry.block.weekday === weekday)
      .sort((a, b) => a.block.startMin - b.block.startMin);

  const patch = (index: number, changes: Partial<DraftBlock>) =>
    setBlocks((old) => old.map((block, i) => (i === index ? { ...block, ...changes } : block)));

  const addBlock = (weekday: PracticeWeekday) => {
    const existing = ofDay(weekday);
    const last = existing.at(-1)?.block;
    setBlocks((old) => [
      ...old,
      {
        plan,
        weekday,
        label: 'Neuer Block',
        kind: 'consultation',
        startMin: last ? last.endMin : parseHHMM('08:00'),
        endMin: last ? Math.min(1440, last.endMin + 180) : parseHHMM('13:00'),
        sortOrder: existing.length + 1,
      },
    ]);
  };

  const submit = (force: boolean) => {
    // sortOrder aus der zeitlichen Reihenfolge ableiten - so entspricht der
    // Plan der gelebten Reihenfolge, ohne dass jemand Zahlen pflegen muss.
    const normalized = PRACTICE_WEEKDAYS.flatMap((weekday) =>
      ofDay(weekday).map((entry, position) => ({ ...entry.block, sortOrder: position + 1 })),
    );
    save.mutate({ plan, blocks: normalized, force });
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Zeitmodell"
        subtitle={`Zeitfenster der Gruppe ${PLAN_LABELS[plan]} – jede Gruppe hat ihr eigenes`}
        action={
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">
              {PLAN_KINDS.map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm('Ungespeicherte Änderungen verwerfen und Gruppe wechseln?')
                    ) {
                      onPlanChange(value);
                    }
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${
                    plan === value
                      ? 'bg-blue-600 font-medium text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {PLAN_LABELS[value]}
                </button>
              ))}
            </div>
            <Button
              variant="primary"
              disabled={!dirty || save.isPending}
              onClick={() => submit(false)}
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Speichern
            </Button>
          </div>
        }
      />

      <Card className="mb-4 p-4 text-sm text-slate-600 dark:text-slate-400">
        <p className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <span>
            <strong className="font-medium text-slate-900 dark:text-slate-100">Sprechstunde</strong>{' '}
            heißt Patientenbetrieb – hier müssen kritische Bereiche besetzt sein.{' '}
            <strong className="font-medium text-slate-900 dark:text-slate-100">Innendienst</strong>{' '}
            heißt Praxis zu, aber Abrechnung, Rezepte, Befunde und Hausbesuche laufen weiter. Die
            Mittagspause liegt im Innendienst und wird nur von der Arbeitszeit abgezogen, nicht
            verplant. Die Ärzte teilen den Vormittag in Sprechstunde (08–11) und Infekt-/
            Videosprechstunde (11–13); die MFA arbeiten durchgehend – deshalb hat jede Gruppe ihr
            eigenes Zeitmodell.
          </span>
        </p>
      </Card>

      {message && (
        <div className="mb-4">
          <ErrorNote>
            {message}
            {message.includes('bestätigen') && (
              <button
                onClick={() => submit(true)}
                className="ml-2 font-medium underline underline-offset-2"
              >
                Trotzdem speichern
              </button>
            )}
          </ErrorNote>
        </div>
      )}

      <div className="space-y-4">
        {PRACTICE_WEEKDAYS.map((weekday) => (
          <Card key={weekday} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">{WEEKDAY_LABELS[weekday]}</h2>
              <Button onClick={() => addBlock(weekday)}>
                <Plus className="size-4" /> Block
              </Button>
            </div>

            {ofDay(weekday).length === 0 ? (
              <p className="text-sm text-slate-500">Geschlossen – kein Block hinterlegt.</p>
            ) : (
              <div className="space-y-2">
                {ofDay(weekday).map(({ block, index }) => (
                  <div
                    key={block.id ?? `neu-${index}`}
                    className={`flex flex-wrap items-end gap-3 rounded-lg border p-3 ${KIND_STYLE[block.kind]}`}
                  >
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">Bezeichnung</span>
                      <TextInput
                        value={block.label}
                        onChange={(event) => patch(index, { label: event.target.value })}
                        className="w-40"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">Art</span>
                      <Select
                        value={block.kind}
                        onChange={(event) =>
                          patch(index, { kind: event.target.value as BlockKind })
                        }
                        className="w-40"
                      >
                        {Object.entries(BLOCK_KIND_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">Von</span>
                      <TextInput
                        type="time"
                        step={300}
                        value={formatHHMM(Math.min(block.startMin, 1439))}
                        onChange={(event) =>
                          event.target.value &&
                          patch(index, { startMin: parseHHMM(event.target.value) })
                        }
                        className="w-28"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">Bis</span>
                      <TextInput
                        type="time"
                        step={300}
                        value={formatHHMM(Math.min(block.endMin, 1439))}
                        onChange={(event) =>
                          event.target.value &&
                          patch(index, { endMin: parseHHMM(event.target.value) })
                        }
                        className="w-28"
                      />
                    </label>
                    <button
                      onClick={() => setBlocks((old) => old.filter((_, i) => i !== index))}
                      title="Block entfernen"
                      className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
