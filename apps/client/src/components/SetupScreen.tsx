import { useState } from 'react';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import { ApiError } from '../api/client';
import { useCompleteSetup } from '../api/queries';
import { Button, Card, ErrorNote, Field, TextInput } from './ui';

const MIN_LENGTH = 10;

/**
 * Ersteinrichtung.
 *
 * Erscheint nur, solange es kein einziges Konto gibt. Ohne diesen
 * Bildschirm musste man das erzeugte Startpasswort aus einer
 * Protokolldatei suchen - fuer eine Anwendung, die per Doppelklick
 * gestartet wird, keine zumutbare Huerde.
 */
export function SetupScreen() {
  const [practiceName, setPracticeName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');

  const setup = useCompleteSetup();

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = repeat.length > 0 && password !== repeat;
  const canSubmit =
    practiceName.trim().length > 0 &&
    username.trim().length >= 3 &&
    password.length >= MIN_LENGTH &&
    password === repeat;

  const message = setup.error instanceof ApiError ? setup.error.message : null;

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-100 p-6 dark:bg-slate-950">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <ShieldCheck className="mx-auto mb-3 size-9 text-blue-600" />
          <h1 className="text-2xl font-semibold tracking-tight">HÄPPI-Flow einrichten</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Das ist der erste Start. Lege den Zugang für die Praxisleitung fest – danach ist dieser
            Bildschirm verschwunden.
          </p>
        </div>

        <Card className="p-6">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSubmit) {
                setup.mutate({
                  practiceName: practiceName.trim(),
                  username: username.trim(),
                  password,
                });
              }
            }}
          >
            <Field label="Name der Praxis" hint="Erscheint auf den Ausdrucken.">
              <TextInput
                value={practiceName}
                onChange={(event) => setPracticeName(event.target.value)}
                placeholder="Hausarztpraxis Dr. …"
                autoFocus
              />
            </Field>

            <Field
              label="Benutzername"
              hint="Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich."
            >
              <TextInput
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="chefin"
              />
            </Field>

            <Field
              label={`Passwort (mindestens ${MIN_LENGTH} Zeichen)`}
              hint={
                tooShort
                  ? `Noch ${MIN_LENGTH - password.length} Zeichen nötig.`
                  : 'Länge schützt besser als Sonderzeichen. Ein Satz funktioniert gut.'
              }
            >
              <TextInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>

            <Field
              label="Passwort wiederholen"
              hint={mismatch ? 'Die beiden Eingaben stimmen nicht überein.' : undefined}
            >
              <TextInput
                type="password"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                autoComplete="new-password"
              />
            </Field>

            {message && <ErrorNote>{message}</ErrorNote>}

            <Button
              type="submit"
              variant="primary"
              disabled={!canSubmit || setup.isPending}
              className="w-full"
            >
              {setup.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Einrichten und anmelden
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Bewahre das Passwort sicher auf. Falls es doch einmal verloren geht, lässt sich der Zugang
          über eine Datei im Datenverzeichnis zurücksetzen – nachzulesen in der README unter „Zugang
          wiederherstellen“.
        </p>
      </div>
    </div>
  );
}
