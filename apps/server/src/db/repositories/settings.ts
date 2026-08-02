import type { HolidaySettings } from '@haeppi/shared';
import { DEFAULT_HOLIDAY_SETTINGS } from '@haeppi/shared';
import type { Db } from '../index.js';

/**
 * Einstellungen liegen als JSON-Werte in einer Schluessel/Wert-Tabelle.
 *
 * Das ist bewusst so: die Menge waechst mit jeder Etappe (Scheduler-Gewichte,
 * Druckoptionen, Praxisdaten), und jedes neue Feld haette sonst eine
 * Migration gekostet. Gelesen wird immer mit Fallback, damit ein fehlender
 * Schluessel die Anwendung nicht anhaelt.
 */
export function readSetting<T>(db: Db, key: string, fallback: T): T {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    // Beschaedigter Eintrag darf die Praxis nicht lahmlegen.
    return fallback;
  }
}

export function writeSetting(db: Db, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value));
}

export const SETTING_KEYS = {
  practiceName: 'practice.name',
  holidays: 'holidays',
  schedulerWeights: 'scheduler.weights',
  minOverlapRatio: 'scheduler.minOverlapRatio',
  fairnessWeeks: 'scheduler.fairnessWeeks',
} as const;

export interface PracticeSettings {
  readonly practiceName: string;
  readonly holidays: HolidaySettings;
  readonly minOverlapRatio: number;
  readonly fairnessWeeks: number;
}

export function readPracticeSettings(db: Db): PracticeSettings {
  return {
    practiceName: readSetting(db, SETTING_KEYS.practiceName, 'Hausarztpraxis'),
    holidays: readSetting(db, SETTING_KEYS.holidays, DEFAULT_HOLIDAY_SETTINGS),
    minOverlapRatio: readSetting(db, SETTING_KEYS.minOverlapRatio, 0.5),
    fairnessWeeks: readSetting(db, SETTING_KEYS.fairnessWeeks, 6),
  };
}
