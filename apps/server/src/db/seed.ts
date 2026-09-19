import {
  DEFAULT_HOLIDAY_SETTINGS,
  DEFAULT_WEIGHTS,
  PRACTICE_WEEKDAYS,
  parseHHMM,
} from '@haeppi/shared';
import type { AreaKind, AreaLocation, PlanKind, PracticeWeekday } from '@haeppi/shared';
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
 * gearbeitet wird dann nur noch im Innendienst oder Homeoffice.
 */
const FULL_DAYS: readonly PracticeWeekday[] = [1, 2, 4];

interface SeedBlock {
  id: string;
  plan: PlanKind;
  weekday: PracticeWeekday;
  label: string;
  kind: 'consultation' | 'backoffice' | 'closed';
  startMin: number;
  endMin: number;
  sortOrder: number;
  /** Kennung fuer die Zuordnung der Bereiche. */
  tag: string;
}

/**
 * Zeitmodell je Gruppe.
 *
 * MFA und PCM: Vormittag 08-13, Innendienst 13-16, Nachmittag 16-18 (Mo/Di/Do).
 * Aerzte: der Vormittag ist geteilt - bis 11 normale Sprechstunde, 11-13
 * Infektsprechstunde und parallel Videosprechstunde.
 */
function buildDayBlocks(): SeedBlock[] {
  const blocks: SeedBlock[] = [];

  const push = (
    plan: PlanKind,
    prefix: string,
    weekday: PracticeWeekday,
    tag: string,
    label: string,
    kind: SeedBlock['kind'],
    from: string,
    to: string,
    sortOrder: number,
  ) =>
    blocks.push({
      id: `${prefix}-${weekday}-${tag}`,
      plan,
      weekday,
      label,
      kind,
      startMin: parseHHMM(from),
      endMin: parseHHMM(to),
      sortOrder,
      tag,
    });

  for (const weekday of PRACTICE_WEEKDAYS) {
    const full = FULL_DAYS.includes(weekday);

    // MFA - die IDs ohne Praefix bleiben aus Kompatibilitaet erhalten.
    push('mfa', 'blk', weekday, 'vm', 'Vormittag', 'consultation', '08:00', '13:00', 1);
    push(
      'mfa',
      'blk',
      weekday,
      'id',
      full ? 'Innendienst' : 'Innendienst (Homeoffice)',
      'backoffice',
      '13:00',
      '16:00',
      2,
    );
    if (full) push('mfa', 'blk', weekday, 'nm', 'Nachmittag', 'consultation', '16:00', '18:00', 3);

    // PCM
    push('pcm', 'blk-pcm', weekday, 'vm', 'Vormittag', 'consultation', '08:00', '13:00', 1);
    push('pcm', 'blk-pcm', weekday, 'id', 'Innendienst', 'backoffice', '13:00', '16:00', 2);
    if (full) {
      push('pcm', 'blk-pcm', weekday, 'nm', 'Nachmittag', 'consultation', '16:00', '18:00', 3);
    }

    // Aerzte
    push('doctor', 'blk-doc', weekday, 'fr', 'Sprechstunde', 'consultation', '08:00', '11:00', 1);
    push(
      'doctor',
      'blk-doc',
      weekday,
      'iv',
      'Infekt-/Videosprechstunde',
      'consultation',
      '11:00',
      '13:00',
      2,
    );
    push('doctor', 'blk-doc', weekday, 'id', 'Innendienst', 'backoffice', '13:00', '16:00', 3);
    if (full) {
      push('doctor', 'blk-doc', weekday, 'nm', 'Nachmittag', 'consultation', '16:00', '18:00', 4);
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
  plan: PlanKind;
  name: string;
  description: string;
  kind: AreaKind;
  isCritical: boolean;
  minStaff: number;
  maxStaff: number | null;
  location: AreaLocation;
  rotationMinPerWeek: number | null;
  followUpAreaId: string | null;
  icon: string;
  color: string;
  sortOrder: number;
  requiredSkills: readonly string[];
  /** Welche Block-Kennungen der Gruppe der Bereich bedient. */
  blockTags: readonly string[];
  /** Abweichende Mindestbesetzung je Block-Kennung. */
  minStaffByTag?: Readonly<Record<string, number>>;
}

const SEED_AREAS: readonly SeedArea[] = [
  // ------------------------------------------------------------- MFA --
  {
    id: 'wa-anmeldung',
    plan: 'mfa',
    name: 'Anmeldung',
    description: 'Patientenempfang, Terminvergabe, Praxis-App',
    kind: 'service',
    isCritical: true,
    minStaff: 2,
    maxStaff: 3,
    location: 'practice',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '📋',
    color: '#3b82f6',
    sortOrder: 1,
    requiredSkills: [],
    blockTags: ['vm', 'id', 'nm'],
    // Im Innendienst reicht eine Person.
    minStaffByTag: { id: 1 },
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
    location: 'practice',
    // Jede MFA soll mindestens einmal pro Woche ins Labor, damit sie es
    // nicht verlernt. Pro Person in der Einsatz-Matrix uebersteuerbar.
    rotationMinPerWeek: 1,
    followUpAreaId: null,
    icon: '🔬',
    color: '#8b5cf6',
    sortOrder: 2,
    requiredSkills: ['skl-blutentnahme'],
    blockTags: ['vm'],
  },
  {
    id: 'wa-telefon',
    plan: 'mfa',
    name: 'Telefon / E-Mail / Fax',
    description: 'Concierge: Telefon, E-Mail-Postfach und Faxe - immer dieselbe Person',
    kind: 'service',
    isCritical: true,
    minStaff: 1,
    maxStaff: 1,
    location: 'any',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '📞',
    color: '#06b6d4',
    sortOrder: 3,
    requiredSkills: [],
    blockTags: ['vm', 'id', 'nm'],
  },
  {
    id: 'wa-backoffice',
    plan: 'mfa',
    name: 'Backoffice',
    description: 'Abrechnung, Rezepte, Medikations- und Impfpläne, Post',
    kind: 'office',
    isCritical: false,
    minStaff: 0,
    maxStaff: null,
    location: 'any',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🗂️',
    color: '#f59e0b',
    sortOrder: 4,
    requiredSkills: [],
    blockTags: ['id'],
  },
  {
    id: 'wa-hausbesuche',
    plan: 'mfa',
    name: 'VERAH-Hausbesuche',
    description: 'Hausbesuche - setzt die VERAH-Qualifikation zwingend voraus',
    kind: 'housecall',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    location: 'practice',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🩺',
    color: '#10b981',
    sortOrder: 5,
    requiredSkills: ['skl-verah'],
    blockTags: ['id'],
  },
  {
    id: 'wa-hausbesuche-schreiben',
    plan: 'mfa',
    name: 'Hausbesuche schreiben',
    description: 'Dokumentation der Hausbesuche vom Vortag',
    kind: 'office',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    location: 'any',
    rotationMinPerWeek: null,
    followUpAreaId: 'wa-hausbesuche',
    icon: '✍️',
    color: '#84cc16',
    sortOrder: 6,
    requiredSkills: [],
    blockTags: ['id'],
  },
  {
    id: 'wa-mfa-sprechstunde',
    plan: 'mfa',
    name: 'MFA-Sprechstunde',
    description: 'Eigene Sprechstunde der MFA, z. B. montags ab 15 Uhr',
    kind: 'room',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    location: 'practice',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🧑‍⚕️',
    color: '#ec4899',
    sortOrder: 7,
    requiredSkills: [],
    blockTags: ['nm'],
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
    location: 'home',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🏠',
    color: '#64748b',
    sortOrder: 8,
    requiredSkills: [],
    blockTags: ['id'],
  },

  // ------------------------------------------------------------- PCM --
  {
    id: 'wa-pcm-sprechstunde',
    plan: 'pcm',
    name: 'PCM-Sprechstunde',
    description: 'Eigene Sprechstunde der Primary Care Managerin',
    kind: 'room',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    location: 'practice',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🩺',
    color: '#8b5cf6',
    sortOrder: 1,
    requiredSkills: [],
    blockTags: ['vm', 'nm'],
  },
  {
    id: 'wa-pcm-hausbesuche',
    plan: 'pcm',
    name: 'PCM-Hausbesuche',
    description: 'Hausbesuche und Heimvisiten der PCM',
    kind: 'housecall',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    location: 'practice',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🚑',
    color: '#06b6d4',
    sortOrder: 2,
    requiredSkills: [],
    blockTags: ['vm', 'id'],
  },
  {
    id: 'wa-pcm-innendienst',
    plan: 'pcm',
    name: 'PCM-Innendienst',
    description: 'Fallmanagement, Dokumentation, Koordination',
    kind: 'office',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    location: 'any',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🗂️',
    color: '#f59e0b',
    sortOrder: 3,
    requiredSkills: [],
    blockTags: ['id'],
  },

  // ----------------------------------------------------------- Aerzte --
  {
    id: 'wa-infekt',
    plan: 'doctor',
    name: 'Infektsprechstunde',
    description: 'Akut- und Infektsprechstunde 11-13 Uhr',
    kind: 'room',
    isCritical: true,
    minStaff: 1,
    maxStaff: 2,
    location: 'practice',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🤧',
    color: '#ef4444',
    sortOrder: 5,
    requiredSkills: [],
    blockTags: ['iv'],
  },
  {
    id: 'wa-video',
    plan: 'doctor',
    name: 'Videosprechstunde',
    description: 'Parallel zur Infektsprechstunde 11-13 Uhr',
    kind: 'service',
    isCritical: false,
    minStaff: 0,
    maxStaff: 1,
    location: 'any',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '📹',
    color: '#0ea5e9',
    sortOrder: 6,
    requiredSkills: [],
    blockTags: ['iv'],
  },
  {
    id: 'wa-arzt-innendienst',
    plan: 'doctor',
    name: 'Innendienst / Hausbesuche',
    description: 'Befunde, Briefe, Hausbesuche der Ärzte',
    kind: 'office',
    isCritical: false,
    minStaff: 0,
    maxStaff: null,
    location: 'any',
    rotationMinPerWeek: null,
    followUpAreaId: null,
    icon: '🗂️',
    color: '#f59e0b',
    sortOrder: 7,
    requiredSkills: [],
    blockTags: ['id'],
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
  // Ein Zimmer, eine Sprechstunde.
  maxStaff: 1,
  location: 'practice',
  rotationMinPerWeek: null,
  followUpAreaId: null,
  icon: '🚪',
  color: ['#6366f1', '#8b5cf6', '#ec4899', '#f97316'][number - 1] ?? '#6366f1',
  sortOrder: number,
  requiredSkills: [],
  blockTags: ['fr', 'nm'],
}));

export function isSeeded(db: Db): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM day_blocks').get() as { n: number };
  return row.n > 0;
}

/** Legt Zeitmodell, Qualifikationen, Arbeitsbereiche und Einstellungen an. */
export function seedDatabase(db: Db): void {
  const blocks = buildDayBlocks();

  const insertBlock = db.prepare(
    `INSERT INTO day_blocks (id, plan, weekday, label, kind, start_min, end_min, sort_order)
     VALUES (@id, @plan, @weekday, @label, @kind, @startMin, @endMin, @sortOrder)`,
  );
  const insertSkill = db.prepare(
    `INSERT INTO skills (id, name, category, description) VALUES (?, ?, ?, ?)`,
  );
  const insertArea = db.prepare(
    `INSERT INTO work_areas
       (id, plan, name, description, kind, is_critical, min_staff, max_staff, location,
        rotation_min_per_week, follow_up_area_id, icon, color, sort_order)
     VALUES
       (@id, @plan, @name, @description, @kind, @isCritical, @minStaff, @maxStaff, @location,
        @rotationMinPerWeek, @followUpAreaId, @icon, @color, @sortOrder)`,
  );
  const insertAreaSkill = db.prepare(
    `INSERT INTO work_area_skills (work_area_id, skill_id) VALUES (?, ?)`,
  );
  const insertAreaBlock = db.prepare(
    `INSERT INTO work_area_blocks (work_area_id, day_block_id, min_staff) VALUES (?, ?, ?)`,
  );
  const insertSetting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);

  const run = db.transaction(() => {
    for (const block of blocks) {
      // Bewusst nur die Felder, die im SQL vorkommen: node:sqlite lehnt
      // unbekannte benannte Parameter ab - das faengt Tippfehler auf.
      insertBlock.run({
        id: block.id,
        plan: block.plan,
        weekday: block.weekday,
        label: block.label,
        kind: block.kind,
        startMin: block.startMin,
        endMin: block.endMin,
        sortOrder: block.sortOrder,
      });
    }
    for (const [id, name, category, description] of SEED_SKILLS) {
      insertSkill.run(id, name, category, description);
    }

    // Folgeaufgaben verweisen auf andere Bereiche - die muessen zuerst da sein.
    const ordered = [...SEED_ROOMS, ...SEED_AREAS].sort(
      (a, b) => Number(a.followUpAreaId !== null) - Number(b.followUpAreaId !== null),
    );
    for (const area of ordered) {
      insertArea.run({
        id: area.id,
        plan: area.plan,
        name: area.name,
        description: area.description,
        kind: area.kind,
        isCritical: area.isCritical ? 1 : 0,
        minStaff: area.minStaff,
        maxStaff: area.maxStaff ?? null,
        location: area.location,
        rotationMinPerWeek: area.rotationMinPerWeek ?? null,
        followUpAreaId: area.followUpAreaId ?? null,
        icon: area.icon,
        color: area.color,
        sortOrder: area.sortOrder,
      });
      for (const skillId of area.requiredSkills) {
        insertAreaSkill.run(area.id, skillId);
      }
      for (const block of blocks) {
        if (block.plan !== area.plan || block.kind === 'closed') continue;
        if (!area.blockTags.includes(block.tag)) continue;
        insertAreaBlock.run(area.id, block.id, area.minStaffByTag?.[block.tag] ?? null);
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
