import type { Id } from './common.js';

/**
 * Die drei Gruppen des Dienstplans. Sie stehen in **einem** Plan
 * untereinander, jede mit eigenem Zeitmodell und eigenen Bereichen.
 */
export type PlanKind = 'doctor' | 'pcm' | 'mfa';

export const PLAN_KINDS: readonly PlanKind[] = ['doctor', 'pcm', 'mfa'];

export const PLAN_LABELS: Readonly<Record<PlanKind, string>> = {
  doctor: 'Ärzte',
  pcm: 'PCM',
  mfa: 'MFA',
};

/**
 * Art des Einsatzortes. Steuert Sonderlogik:
 * - `room` zaehlt gegen die Zimmerkapazitaet (vier Behandlungszimmer)
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

/**
 * Wo der Bereich erledigt wird.
 * - `practice`: nur vor Ort - wer an dem Tag im Homeoffice arbeitet, faellt aus
 * - `home`: nur von zu Hause - setzt die Homeoffice-Berechtigung voraus
 * - `any`: egal
 */
export type AreaLocation = 'practice' | 'home' | 'any';

export const AREA_LOCATION_LABELS: Readonly<Record<AreaLocation, string>> = {
  practice: 'Nur in der Praxis',
  home: 'Nur im Homeoffice',
  any: 'Praxis oder Homeoffice',
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
  readonly location: AreaLocation;
  /**
   * Pflichtrotation: jede Person der Gruppe soll hier mindestens so oft pro
   * Woche eingesetzt werden - damit niemand das Labor verlernt.
   * `null` = keine Pflichtrotation. Pro Person uebersteuerbar.
   */
  readonly rotationMinPerWeek: number | null;
  /**
   * Folgeaufgabe: bevorzugt wird, wer am vorigen Arbeitstag in diesem
   * Bereich war. Beispiel: "Hausbesuche schreiben" folgt auf "Hausbesuche".
   */
  readonly followUpAreaId: Id | null;
  readonly icon: string;
  readonly color: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  /** Pflichtqualifikationen: ohne sie ist niemand einsetzbar (z. B. VERAH). */
  readonly requiredSkillIds: readonly Id[];
  /** In welchen Tagesbloecken der Bereich betrieben wird. */
  readonly blockIds: readonly Id[];
  /**
   * Abweichende Mindestbesetzung je Block; fehlt der Eintrag, gilt `minStaff`.
   * Beispiel: die Anmeldung braucht in der Sprechstunde zwei Personen,
   * im Innendienst genuegt eine am Telefon.
   */
  readonly blockMinStaff: Readonly<Record<Id, number>>;
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
  '📹',
  '🤧',
  '✍️',
  '🚪',
] as const;
