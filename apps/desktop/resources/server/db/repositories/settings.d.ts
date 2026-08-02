import type { HolidaySettings, SchedulerWeights } from '@haeppi/shared';
import type { Db } from '../index.js';
/**
 * Einstellungen liegen als JSON-Werte in einer Schluessel/Wert-Tabelle.
 *
 * Das ist bewusst so: die Menge waechst mit jeder Etappe (Scheduler-Gewichte,
 * Druckoptionen, Praxisdaten), und jedes neue Feld haette sonst eine
 * Migration gekostet. Gelesen wird immer mit Fallback, damit ein fehlender
 * Schluessel die Anwendung nicht anhaelt.
 */
export declare function readSetting<T>(db: Db, key: string, fallback: T): T;
export declare function writeSetting(db: Db, key: string, value: unknown): void;
export declare const SETTING_KEYS: {
    readonly practiceName: "practice.name";
    readonly holidays: "holidays";
    readonly schedulerWeights: "scheduler.weights";
    readonly minOverlapRatio: "scheduler.minOverlapRatio";
    readonly fairnessWeeks: "scheduler.fairnessWeeks";
};
export interface PracticeSettings {
    readonly practiceName: string;
    readonly holidays: HolidaySettings;
    readonly minOverlapRatio: number;
    readonly fairnessWeeks: number;
    readonly weights: SchedulerWeights;
}
export declare function readPracticeSettings(db: Db): PracticeSettings;
//# sourceMappingURL=settings.d.ts.map