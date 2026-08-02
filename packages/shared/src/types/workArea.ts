import type { Id } from './common.js';

/** Es gibt zwei getrennte Dienstplaene. */
export type PlanKind = 'doctor' | 'mfa';

export const PLAN_LABELS: Readonly<Record<PlanKind, string>> = {
  doctor: 'Ärzte',
  mfa: 'MFA',
};

/**
 * Art des Einsatzortes. Steuert Sonderlogik:
 * - `room` zaehlt gegen die Zimmerkapazitaet (vier Behandlungszimmer)
 * - `homeoffice` verlangt die Homeoffice-Berechtigung
 * - `housecall` ist der VERAH-Bereich fuer Hausbesuche
 */
export type AreaKind = 'room' | 'service' | 'office' | 'homeoffice' | 'housecall';

export const AREA_KIND_LABELS: Readonly<Record<AreaKind, string>> = {
  room: 'Behandlungszimmer',
  service: 'Funktionsbereich',
  office: 'Innendienst',
  homeoffice: 'Homeoffice',
  housecall: 'Hausbesuche',
};

export interface WorkArea {
  readonly id: Id;
  readonly plan: PlanKind;
  readonly name: string;
  readonly description: string;
  readonly kind: AreaKind;
  /** Kritische Bereiche muessen besetzt sein - Anmeldung, Labor vormittags. */
  readonly isCritical: boolean;
  /** Pflichtsitze: so viele Personen muessen hier sein. */
  readonly minStaff: number;
  /** Obergrenze; `null` = unbegrenzt. */
  readonly maxStaff: number | null;
  readonly requiresHomeoffice: boolean;
  /**
   * Pflichtrotation: jede Person des Plans soll hier mindestens so oft pro
   * Woche eingesetzt werden - damit niemand das Labor verlernt.
   * `null` = keine Pflichtrotation. Pro Person uebersteuerbar.
   */
  readonly rotationMinPerWeek: number | null;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  /** Pflichtqualifikationen: ohne sie ist niemand einsetzbar (z. B. VERAH). */
  readonly requiredSkillIds: readonly Id[];
  /** In welchen Tagesbloecken der Bereich betrieben wird. */
  readonly blockIds: readonly Id[];
}

export interface Skill {
  readonly id: Id;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly isActive: boolean;
}

export const SKILL_CATEGORIES = ['Medizinisch', 'Verwaltung', 'Qualifikation'] as const;

export const AREA_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#6366f1',
] as const;

export const AREA_ICONS = [
  '🏥',
  '💉',
  '🔬',
  '📋',
  '💊',
  '🏠',
  '📞',
  '🩺',
  '🧪',
  '🖥️',
  '📦',
  '🚑',
  '🗂️',
  '🧑‍⚕️',
  '💳',
] as const;
