import { DEFAULT_HOLIDAY_SETTINGS, PRACTICE_WEEKDAYS, parseHHMM } from '@haeppi/shared';
import type { PracticeWeekday } from '@haeppi/shared';
import type { Db } from './index.js';

/**
 * Voreinstellung fuer eine hausaerztliche Praxis.
 *
 * Alles hier ist spaeter in der Oberflaeche aenderbar. Gesetzt werden nur
 * Struktur und Zeitmodell - keine Personen, keine Zugaenge.
 *
 * Seed-Datensaetze bekommen sprechende IDs statt UUIDs. Das erleichtert die
 * Fehlersuche erheblich; von Hand angelegte Datensaetze nutzen randomUUID().
 */

/**
 * Tage mit Nachmittagssprechstunde: Mo, Di, Do.
 * An den uebrigen Praxistagen (Mi, Fr) schliesst die Praxis mittags;
 * gearbeitet wird dann nur noch im Homeoffice.
 */
const FULL_DAYS: readonly PracticeWeekday[] = [1, 2, 4];

interface SeedBlock {
  id: string;
  weekday: PracticeWeekday;
  label: string;
  kind: 'consultation' | 'backoffice' | 'closed';
  startMin: number;
  endMin: number;
  sortOrder: number;
}

function buildDayBlocks(): SeedBlock[] {
  const blocks: SeedBlock[] = [];
  for (const weekday of PRACTICE_WEEKDAYS) {
    blocks.push({
      id: `blk-${weekday}-vm`,
      weekday,
      label: 'Vormittag',
      kind: 'consultation',
      startMin: parseHHMM('08:00'),
      endMin: parseHHMM('13:00'),
      sortOrder: 1,
    });

    if (FULL_DAYS.includes(weekday)) {
      // Praxis geschlossen, es wird aber gearbeitet: Abrechnung, Rezepte,
      // Befunde, Hausbesuche. Die Mittagspause liegt hier drin und wird
      // nur als Zeitabzug gerechnet, nicht verplant.
      blocks.push({
        id: `blk-${weekday}-id`,
        weekday,
        label: 'Innendienst',
        kind: 'backoffice',
        startMin: parseHHMM('13:00'),
        endMin: parseHHMM('16:00'),
        sortOrder: 2,
      });
      blocks.push({
        id: `blk-${weekday}-nm`,
        weekday,
        label: 'Nachmittag',
        kind: 'consultation',
        startMin: parseHHMM('16:00'),
        endMin: parseHHMM('18:00'),
        sortOrder: 3,
      });
    } else {
      // Mi und Fr nachmittags ist die Praxis zu; gearbeitet wird im Homeoffice.
      blocks.push({
        id: `blk-${weekday}-id`,
        weekday,
        label: 'Innendienst (Homeoffice)',
        kind: 'backoffice',
        startMin: parseHHMM('13:00'),
        endMin: parseHHMM('16:00'),
        sortOrder: 2,
      });
    }
  }
  return blocks;
}

const SEED_SKILLS = [
  ['skl-blutentnahme', 'Blutentnahme', 'Medizinisch', 'Venöse und kapillare Blutentnahme'],
  ['skl-impfen', 'Impfen', 'Medizinisch', 'Durchführung von Impfungen'],
  ['skl-ekg', 'EKG', 'Medizinisch', 'EKG anlegen und schreiben'],
  ['skl-lufu', 'Lungenfunktion', 'Medizinisch', 'Spirometrie durchführen'],
  ['skl-wunde', 'Wundversorgung', 'Medizinisch', 'Verbandswechsel und Wundmanagement'],
  ['skl-abrechnung', 'Abrechnung', 'Verwaltung', 'KV- und Privatabrechnung'],
  ['skl-rezeption', 'Rezeption', 'Verwaltung', 'Patientenannahme und Terminvergabe'],
  [
    'skl-verah',
    'VERAH',
    'Qualifikation',
    'Versorgungsassistentin in der Hausarztpraxis - Voraussetzung für Hausbesuche',
  ],
] as const;

interface SeedArea {
  id: string;
  plan: 'doctor' | 'mfa';
  name: string;
  description: string;
  kind: 'room' | 'service' | 'office' | 'homeoffice' | 'housecall';
  isCritical: boolean;
  minStaff: number;
  maxStaff: number | null;
  requiresHomeoffice: boolean;
  rotationMinPerWeek: number | null;
  icon: string;
  color: string;
  sortOrder: number;
  requiredSkills: readonly string[];
  /** Welche Blocktypen der Bereich bedient. */
  blockKinds: readonly ('consultation' | 'backoffice')[];
  /** Nur Vormittagsbloecke - fuer das Labor. */
  morningsOnly?: boolean;
  /** Abweichende Mindestbesetzung im Innendienst. */
  backofficeMinStaff?: number;
}

const SEED_AREAS: readonly SeedArea[] = [
  {
    id: 'wa-anmeldung',
    plan: 'mfa',
    name: 'Anmeldung',
    description: 'Patientenempfang, Telefon und Terminvergabe',
    kind: 'service',
    isCritical: true,
    minStaff: 2,
    maxStaff: 3,
    requiresHomeoffice: false,
    rotationMinPerWeek: null,
    icon: '📋',
    color: '#3b82f6',
    sortOrder: 1,
    requiredSkills: [],
    blockKinds: ['consultation', 'backoffice'],
    // Im Innendienst reicht eine Person am Telefon.
    backofficeMinStaff: 1,
  },
  {
    id: 'wa-labor',
    plan: 'mfa',
    name: 'Labor',
    description: 'Blutentnahme und Labordiagnostik',
    kind: 'service',
    isCritical: true,
    minStaff: 1,
    maxStaff: 2,
    requiresHomeoffice: false,
    // Jede MFA soll mindestens einmal pro Woche ins Labor, damit sie es
    // nicht verlernt. Pro Person in der Einsatz-Matrix uebersteuerbar.
    rotationMinPerWeek: 1,
    icon: '🔬',
    color: '#8b5cf6',
    sortOrder: 2,
    requiredSkills: ['skl-blutentnahme'],
    blockKinds: ['consultation'],
    morningsOnly: true,
  },
  {
    id: 'wa-notfall',
    plan: 'mfa',
    name: 'Notfallzimmer',
    description: 'Akutversorgung, EKG, Wundversorgung',
    kind: 'service',
    isCritical: true,
    minStaff: 1,
    maxStaff: 2,
    requiresHomeoffice: false,
    rotationMinPerWeek: null,
    icon: '🚑',
    color: '#ef4444',
    sortOrder: 3,
    requiredSkills: [],
    blockKinds: ['consultation'],
  },
  {
    id: 'wa-backoffice',
    plan: 'mfa',
    name: 'Backoffice',
    description: 'Abrechnung, Rezepte, Befunde, Post',
    kind: 'office',
    isCritical: false,
    minStaff: 0,
    maxStaff: null,
    requiresHomeoffice: false,
    rotationMinPerWeek: null,
    icon: '🗂️',
    color: '#f59e0b',
    sortOrder: 4,
    requiredSkills: [],
    blockKinds: ['backoffice'],
  },
  {
    id: 'wa-homeoffice',
    plan: 'mfa',
    name: 'Homeoffice',
    description: 'Innendienst von zu Hause - nur für berechtigte Mitarbeiterinnen',
    kind: 'homeoffice',
    isCritical: false,
    minStaff: 0,
    maxStaff: null,
    requiresHomeoffice: true,
    rotationMinPerWeek: null,
    icon: '🏠',
    color: '#10b981',
    sortOrder: 5,
    requiredSkills: [],
    blockKinds: ['backoffice'],
  },
  {
    id: 'wa-hausbesuche',
    plan: 'mfa',
    name: 'Hausbesuche',
    description: 'VERAH-Hausbesuche - setzt die VERAH-Qualifikation zwingend voraus',
    kind: 'housecall',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    requiresHomeoffice: false,
    rotationMinPerWeek: null,
    icon: '🩺',
    color: '#06b6d4',
    sortOrder: 6,
    requiredSkills: ['skl-verah'],
    blockKinds: ['backoffice'],
  },
];

/** Vier Behandlungszimmer - die harte Kapazitaetsgrenze der Praxis. */
const SEED_ROOMS: readonly SeedArea[] = [1, 2, 3, 4].map((number) => ({
  id: `wa-zimmer-${number}`,
  plan: 'doctor',
  name: `Zimmer ${number}`,
  description: 'Behandlungszimmer für Sprechstunde',
  kind: 'room',
  isCritical: false,
  minStaff: 0,
  // Ein Zimmer, eine Sprechstunde. Auch die PCM belegt genau eines davon.
  maxStaff: 1,
  requiresHomeoffice: false,
  rotationMinPerWeek: null,
  icon: '🚪',
  color: ['#6366f1', '#8b5cf6', '#ec4899', '#f97316'][number - 1] ?? '#6366f1',
  sortOrder: number,
  requiredSkills: [],
  blockKinds: ['consultation'],
}));

/**
 * Gewichte des Schedulers. Bewusst in der Datenbank statt als Zahlenliterale
 * im Code: in v1 standen 10000/5000/20/-50 mitten in der Planungsschleife und
 * waren ohne Neubau der Anwendung nicht anpassbar.
 * Negative Kosten sind erwuenscht, positive unerwuenscht.
 */
const DEFAULT_WEIGHTS = {
  /** Treue zur Musterwoche - der staerkste Zug, damit Wochen stabil bleiben. */
  templateMatch: -400,
  preferencePreferred: -40,
  preferenceNeutral: 0,
  preferenceDislike: 60,
  /** Sehr teuer, aber nicht unmoeglich - im Notfall geht es trotzdem. */
  preferenceNever: 600,
  /** Offene Pflichtrotation, z. B. "diese Woche noch nicht im Labor gewesen". */
  rotationUnmet: -300,
  /** Beantragter, noch nicht genehmigter Urlaub an dem Tag. */
  absenceRequested: 250,
  /** Ausgleich ueber die letzten Wochen. */
  fairness: 15,
  /** Wer noch Sollstunden offen hat, wird bevorzugt eingeteilt. */
  hoursDeficit: -8,
  /** Optionale Sitze erst fuellen, wenn alle Pflichtsitze besetzt sind. */
  optionalSeat: 120,
};

export function isSeeded(db: Db): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM day_blocks').get() as { n: number };
  return row.n > 0;
}

/** Legt Zeitmodell, Qualifikationen, Arbeitsbereiche und Einstellungen an. */
export function seedDatabase(db: Db): void {
  const blocks = buildDayBlocks();

  const insertBlock = db.prepare(
    `INSERT INTO day_blocks (id, weekday, label, kind, start_min, end_min, sort_order)
     VALUES (@id, @weekday, @label, @kind, @startMin, @endMin, @sortOrder)`,
  );
  const insertSkill = db.prepare(
    `INSERT INTO skills (id, name, category, description) VALUES (?, ?, ?, ?)`,
  );
  const insertArea = db.prepare(
    `INSERT INTO work_areas
       (id, plan, name, description, kind, is_critical, min_staff, max_staff,
        requires_homeoffice, rotation_min_per_week, icon, color, sort_order)
     VALUES
       (@id, @plan, @name, @description, @kind, @isCritical, @minStaff, @maxStaff,
        @requiresHomeoffice, @rotationMinPerWeek, @icon, @color, @sortOrder)`,
  );
  const insertAreaSkill = db.prepare(
    `INSERT INTO work_area_skills (work_area_id, skill_id) VALUES (?, ?)`,
  );
  const insertAreaBlock = db.prepare(
    `INSERT INTO work_area_blocks (work_area_id, day_block_id, min_staff) VALUES (?, ?, ?)`,
  );
  const insertSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);

  const run = db.transaction(() => {
    for (const block of blocks) insertBlock.run(block);
    for (const [id, name, category, description] of SEED_SKILLS) {
      insertSkill.run(id, name, category, description);
    }

    for (const area of [...SEED_AREAS, ...SEED_ROOMS]) {
      insertArea.run({
        ...area,
        isCritical: area.isCritical ? 1 : 0,
        requiresHomeoffice: area.requiresHomeoffice ? 1 : 0,
        rotationMinPerWeek: area.rotationMinPerWeek ?? null,
        maxStaff: area.maxStaff ?? null,
      });
      for (const skillId of area.requiredSkills) {
        insertAreaSkill.run(area.id, skillId);
      }
      for (const block of blocks) {
        if (block.kind === 'closed') continue;
        if (!area.blockKinds.includes(block.kind)) continue;
        // Das Labor laeuft nur vormittags - sortOrder 1 ist der erste Block des Tages.
        if (area.morningsOnly && block.sortOrder !== 1) continue;
        const override = block.kind === 'backoffice' ? (area.backofficeMinStaff ?? null) : null;
        insertAreaBlock.run(area.id, block.id, override);
      }
    }

    insertSetting.run('practice.name', JSON.stringify('Hausarztpraxis'));
    insertSetting.run('holidays', JSON.stringify(DEFAULT_HOLIDAY_SETTINGS));
    insertSetting.run('scheduler.weights', JSON.stringify(DEFAULT_WEIGHTS));
    // Wie viel eines Blocks eine Person abdecken muss, um dort einsetzbar zu
    // sein. 0.5 bedeutet: wer um 09:00 anfaengt, ist im Block 08:00-13:00
    // mit 80 % Abdeckung klar einsetzbar.
    insertSetting.run('scheduler.minOverlapRatio', JSON.stringify(0.5));
    insertSetting.run('scheduler.fairnessWeeks', JSON.stringify(6));
  });

  run();
}
