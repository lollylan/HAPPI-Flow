import { describe, expect, it, vi } from 'vitest';
import { errorPage, waitForServer } from './readiness.js';

const noSleep = () => Promise.resolve();

describe('waitForServer', () => {
  it('meldet Erfolg beim ersten Treffer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true } as Response);
    const result = await waitForServer({
      url: 'http://localhost:4173/api/health',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    });

    expect(result.ready).toBe(true);
    expect(result.attempts).toBe(1);
  });

  it('wartet, bis der Server hochgefahren ist', async () => {
    // Genau der Fall, an dem v1 scheiterte: die Vorgaengerversion wartete
    // blind eine Sekunde und lud dann ins Leere.
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls < 5) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true } as Response);
    });

    const result = await waitForServer({
      url: 'http://localhost:4173/api/health',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    });

    expect(result.ready).toBe(true);
    expect(result.attempts).toBe(5);
  });

  it('gibt nach der Frist auf und nennt den letzten Fehler', async () => {
    // Eigene Uhr statt vi.setSystemTime: die globale Zeit zu verstellen
    // machte den Testlauf unberechenbar.
    let clock = 0;
    const result = await waitForServer({
      url: 'http://localhost:4173/api/health',
      timeoutMs: 1000,
      intervalMs: 250,
      fetchImpl: (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
    });

    expect(result.ready).toBe(false);
    expect(result.attempts).toBe(4); // 1000 ms / 250 ms
    expect(result.lastError).toContain('ECONNREFUSED');
  });

  it('wertet einen Fehlerstatus nicht als bereit', async () => {
    let clock = 0;
    const result = await waitForServer({
      url: 'http://localhost:4173/api/health',
      timeoutMs: 100,
      intervalMs: 50,
      fetchImpl: (() =>
        Promise.resolve({ ok: false, status: 503 } as Response)) as unknown as typeof fetch,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
      now: () => clock,
    });
    expect(result.ready).toBe(false);
    expect(result.lastError).toBe('HTTP 503');
  });
});

describe('errorPage', () => {
  it('erklärt das Problem auf Deutsch statt ein weißes Fenster zu zeigen', () => {
    const page = decodeURIComponent(errorPage('ECONNREFUSED'));
    expect(page).toContain('konnte nicht starten');
    expect(page).toContain('Task-Manager');
    expect(page).toContain('ECONNREFUSED');
  });

  it('maskiert Sonderzeichen aus der Fehlermeldung', () => {
    const page = decodeURIComponent(errorPage('<script>alert(1)</script>'));
    expect(page).not.toContain('<script>alert');
    expect(page).toContain('&lt;script&gt;');
  });
});
