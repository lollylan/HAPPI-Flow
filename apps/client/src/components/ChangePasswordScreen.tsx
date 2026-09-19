import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { useChangePassword } from '../api/queries';

const MIN_LENGTH = 10;

/**
 * Erzwungener Passwortwechsel nach dem ersten Anmelden.
 *
 * Die Vorgaengerversion lieferte ein fest eingebautes admin/admin aus, das
 * in der Praxis nie geaendert wurde. Hier kommt niemand daran vorbei.
 */
export function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const changePassword = useChangePassword();

  const mismatch = repeat.length > 0 && newPassword !== repeat;
  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const canSubmit = newPassword.length >= MIN_LENGTH && newPassword === repeat && !!currentPassword;

  const serverMessage =
    changePassword.error instanceof ApiError ? changePassword.error.message : null;

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <KeyRound className="mx-auto mb-3 size-8 text-blue-600" />
          <h1 className="text-xl font-semibold tracking-tight">Passwort ändern</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Das Startpasswort muss einmalig ersetzt werden.
          </p>
        </div>

        <form
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) changePassword.mutate({ currentPassword, newPassword });
          }}
        >
          <Field
            label="Aktuelles Passwort"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <Field
            label={`Neues Passwort (mind. ${MIN_LENGTH} Zeichen)`}
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            hint={tooShort ? `Noch ${MIN_LENGTH - newPassword.length} Zeichen nötig.` : undefined}
          />
          <Field
            label="Neues Passwort wiederholen"
            value={repeat}
            onChange={setRepeat}
            autoComplete="new-password"
            hint={mismatch ? 'Die beiden Eingaben stimmen nicht überein.' : undefined}
          />

          {serverMessage && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {serverMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || changePassword.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {changePassword.isPending && <Loader2 className="size-4 animate-spin" />}
            Passwort speichern
          </button>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nach dem Wechsel werden alle Sitzungen beendet und du meldest dich neu an.
          </p>
        </form>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}

function Field({ label, value, onChange, autoComplete, hint }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        type="password"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
      />
      {hint && (
        <span className="mt-1 block text-xs text-amber-600 dark:text-amber-400">{hint}</span>
      )}
    </label>
  );
}
