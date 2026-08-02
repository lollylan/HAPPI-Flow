import { DEFAULT_HOLIDAY_SETTINGS, DEFAULT_WEIGHTS } from '@haeppi/shared';
/**
 * Einstellungen liegen als JSON-Werte in einer Schluessel/Wert-Tabelle.
 *
 * Das ist bewusst so: die Menge waechst mit jeder Etappe (Scheduler-Gewichte,
 * Druckoptionen, Praxisdaten), und jedes neue Feld haette sonst eine
 * Migration gekostet. Gelesen wird immer mit Fallback, damit ein fehlender
 * Schluessel die Anwendung nicht anhaelt.
 */
export function readSetting(db, key, fallback) {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    if (!row)
        return fallback;
    try {
        return JSON.parse(row.value);
    }
    catch {
        // Beschaedigter Eintrag darf die Praxis nicht lahmlegen.
        return fallback;
    }
}
export function writeSetting(db, key, value) {
    db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(key, JSON.stringify(value));
}
export const SETTING_KEYS = {
    practiceName: 'practice.name',
    holidays: 'holidays',
    schedulerWeights: 'scheduler.weights',
    minOverlapRatio: 'scheduler.minOverlapRatio',
    fairnessWeeks: 'scheduler.fairnessWeeks',
};
export function readPracticeSettings(db) {
    return {
        practiceName: readSetting(db, SETTING_KEYS.practiceName, 'Hausarztpraxis'),
        holidays: readSetting(db, SETTING_KEYS.holidays, DEFAULT_HOLIDAY_SETTINGS),
        minOverlapRatio: readSetting(db, SETTING_KEYS.minOverlapRatio, 0.5),
        fairnessWeeks: readSetting(db, SETTING_KEYS.fairnessWeeks, 6),
        // Gespeicherte Werte ueber die Standardgewichte legen: kommt spaeter ein
        // neues Gewicht dazu, laufen bestehende Praxen ohne Migration weiter.
        weights: {
            ...DEFAULT_WEIGHTS,
            ...readSetting(db, SETTING_KEYS.schedulerWeights, {}),
        },
    };
}
//# sourceMappingURL=settings.js.map