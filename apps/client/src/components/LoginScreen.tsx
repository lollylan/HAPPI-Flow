import { useState } from 'react';
import { Loader2, LogIn, ShieldAlert } from 'lucide-react';
import { ApiError } from '../api/client';
import { useLogin } from '../api/queries';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  const message =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'Der Server ist nicht erreichbar.'
        : null;

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">HÄPPI-Flow</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Dienstplanung der Praxis
          </p>
        </div>

        <form
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate({ username, password });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Benutzername</span>
            <input
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">Passwort</span>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {message && (
            <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {login.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogIn className="size-4" />
            )}
            Anmelden
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Beim allerersten Start steht das Zugangspasswort im Serverfenster.
        </p>
      </div>
    </div>
  );
}
