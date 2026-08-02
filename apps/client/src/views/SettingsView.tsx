import { useState } from 'react';
import { CalendarOff, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { GermanState, HolidaySettings } from '@haeppi/shared';
import { GERMAN_STATES, holidaysForYear, isIsoDate } from '@haeppi/shared';
import { ApiError } from '../api/client';
import { useSaveHolidaySettings, useSettings } from '../api/queries';
import { Button, Card, ErrorNote, Field, PageHeader, Select, TextInput } from '../components/ui';

/** Bundeslaender, in denen einzelne Tage von der Gemeinde abhaengen. */
const REGIONAL_HINTS: Partial<Record<GermanState, string[]>> = {
  BY: ['assumptionOfMary', 'augsburgPeaceFestival'],
  SN: ['corpusChristi'],
  TH: ['corpusChristi'],
};

export function SettingsView() {
  const { data: settings, isLoading } = useSettings();

  if (isLoading || !settings) {
    return (
      <div className="p-8 text-slate-500">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  // Das Formular bekommt den gespeicherten Stand als Anfangswert. So braucht
  // es keinen Effect, der den Entwurf nachtraeglich aus der Abfrage befuellt.
  return <HolidayForm saved={settings.holidays} />;
}

function HolidayForm({ saved }: { saved: HolidaySettings }) {
  const save = useSaveHolidaySettings();
  const [draft, setDraft] = useState<HolidaySettings>(saved);
  const [newDate, setNewDate] = useState('');

  const year = new Date().getFullYear();
  const preview = holidaysForYear(year, draft.state, draft.options);
  const regional = REGIONAL_HINTS[draft.state] ?? [];
  const message = save.error instanceof ApiError ? save.error.message : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const addDate = () => {
    if (!isIsoDate(newDate) || draft.additionalClosedDates.includes(newDate)) return;
    setDraft({
      ...draft,
      additionalClosedDates: [...draft.additionalClosedDates, newDate].sort(),
    });
    setNewDate('');
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Einstellungen"
        subtitle="Feiertage und Schließtage der Praxis"
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-medium">Bundesland</h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Die gesetzlichen Feiertage unterscheiden sich erheblich – zwischen neun und dreizehn
            Tagen je nach Land.
          </p>

          <Field label="Praxisstandort">
            <Select
              value={draft.state}
              onChange={(event) => setDraft({ ...draft, state: event.target.value as GermanState })}
            >
              {GERMAN_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.name}
                </option>
              ))}
            </Select>
          </Field>

          {regional.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-medium">Von der Gemeinde abhängig</h3>
              <div className="space-y-2">
                {regional.includes('assumptionOfMary') && (
                  <Toggle
                    label="Mariä Himmelfahrt (15.08.)"
                    hint="Gilt in Bayern nur in überwiegend katholischen Gemeinden – in Würzburg ja."
                    checked={draft.options.assumptionOfMary ?? false}
                    onChange={(value) =>
                      setDraft({ ...draft, options: { ...draft.options, assumptionOfMary: value } })
                    }
                  />
                )}
                {regional.includes('corpusChristi') && (
                  <Toggle
                    label="Fronleichnam"
                    hint="Gilt hier nur in einzelnen katholisch geprägten Gemeinden."
                    checked={draft.options.corpusChristi ?? false}
                    onChange={(value) =>
                      setDraft({ ...draft, options: { ...draft.options, corpusChristi: value } })
                    }
                  />
                )}
                {regional.includes('augsburgPeaceFestival') && (
                  <Toggle
                    label="Augsburger Friedensfest (08.08.)"
                    hint="Nur im Stadtgebiet Augsburg."
                    checked={draft.options.augsburgPeaceFestival ?? false}
                    onChange={(value) =>
                      setDraft({
                        ...draft,
                        options: { ...draft.options, augsburgPeaceFestival: value },
                      })
                    }
                  />
                )}
              </div>
            </div>
          )}

          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium">
              Eigene Schließtage
              <span className="ml-2 font-normal text-slate-500">
                Heiligabend, Silvester, Betriebsausflug …
              </span>
            </h3>
            <div className="mb-3 flex gap-2">
              <TextInput
                type="date"
                value={newDate}
                onChange={(event) => setNewDate(event.target.value)}
              />
              <Button onClick={addDate} disabled={!isIsoDate(newDate)}>
                <Plus className="size-4" />
              </Button>
            </div>
            {draft.additionalClosedDates.length === 0 ? (
              <p className="text-sm text-slate-500">Keine hinterlegt.</p>
            ) : (
              <ul className="space-y-1">
                {draft.additionalClosedDates.map((date) => (
                  <li
                    key={date}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-800/60"
                  >
                    <span className="tabular">
                      {new Date(`${date}T12:00:00`).toLocaleDateString('de-DE', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
                    <button
                      onClick={() =>
                        setDraft({
                          ...draft,
                          additionalClosedDates: draft.additionalClosedDates.filter(
                            (entry) => entry !== date,
                          ),
                        })
                      }
                      className="text-slate-400 hover:text-red-600"
                      aria-label="Entfernen"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {message && <div className="mt-4">{<ErrorNote>{message}</ErrorNote>}</div>}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 flex items-center gap-2 font-medium">
            <CalendarOff className="size-4 text-slate-400" />
            Gesetzliche Feiertage {year}
          </h2>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            {preview.length} Tage – wird sofort mit der Auswahl aktualisiert. An diesen Tagen wird
            kein Dienstplan erzeugt und kein Urlaubstag abgezogen.
          </p>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {preview.map((holiday) => (
              <li key={holiday.date + holiday.name} className="flex justify-between py-1.5">
                <span>
                  {holiday.name}
                  {holiday.scope === 'regional' && (
                    <span
                      className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      title="Gilt nicht im ganzen Bundesland"
                    >
                      regional
                    </span>
                  )}
                </span>
                <span className="tabular text-slate-500">
                  {new Date(`${holiday.date}T12:00:00`).toLocaleDateString('de-DE', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 dark:border-slate-600"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </label>
  );
}
