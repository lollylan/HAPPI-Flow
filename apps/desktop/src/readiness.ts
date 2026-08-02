/**
 * Wartet, bis der Server tatsaechlich antwortet.
 *
 * Die Vorgaengerversion wartete blind eine Sekunde und lud dann die Seite.
 * War der Rechner langsam oder die Datenbank gross, sah man ein weisses
 * Fenster mit einem Verbindungsfehler - ohne Hinweis, was los ist.
 */
export interface ReadinessOptions {
  readonly url: string;
  /** Wie lange insgesamt gewartet wird. */
  readonly timeoutMs?: number;
  /** Abstand zwischen zwei Versuchen. */
  readonly intervalMs?: number;
  /** Injizierbar fuer Tests. */
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Zeitquelle. Tests geben eine eigene Uhr mit, statt die globale zu
   * verstellen - eine manipulierte Systemzeit macht den Testlauf sonst
   * unberechenbar.
   */
  readonly now?: () => number;
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly attempts: number;
  readonly lastError?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForServer(options: ReadinessOptions): Promise<ReadinessResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const doFetch = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => Date.now());

  const deadline = now() + timeoutMs;
  let attempts = 0;
  let lastError = '';

  while (now() < deadline) {
    attempts += 1;
    try {
      const response = await doFetch(options.url);
      if (response.ok) return { ready: true, attempts };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(intervalMs);
  }

  return { ready: false, attempts, lastError };
}

/** Fehlerseite statt eines weissen Fensters. */
export function errorPage(detail: string): string {
  const escaped = detail.replace(/[<>&]/g, (character) =>
    character === '<' ? '&lt;' : character === '>' ? '&gt;' : '&amp;',
  );
  return `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>HÄPPI-Flow konnte nicht starten</title>
<style>
  body { font-family: "Segoe UI", system-ui, sans-serif; background:#f1f5f9; color:#0f172a;
         display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
  .card { max-width: 34rem; background:#fff; padding:2rem; border-radius:.75rem;
          box-shadow:0 1px 3px rgba(0,0,0,.1); }
  h1 { margin:0 0 .5rem; font-size:1.25rem; }
  p { line-height:1.5; color:#475569; }
  code { background:#f1f5f9; padding:.15rem .35rem; border-radius:.25rem; font-size:.85em; }
</style></head><body><div class="card">
  <h1>HÄPPI-Flow konnte nicht starten</h1>
  <p>Der interne Dienst hat nicht geantwortet. Das passiert meist, wenn eine zweite
     Instanz von HÄPPI-Flow noch läuft oder ein anderes Programm den Port belegt.</p>
  <p><strong>Was hilft:</strong> Anwendung schließen, im Task-Manager prüfen, ob noch ein
     Eintrag „HÄPPI-Flow“ läuft, und neu starten.</p>
  <p style="margin-top:1.5rem;font-size:.85em;color:#94a3b8">Technische Angabe: <code>${escaped}</code></p>
</div></body></html>`)}`;
}
