import type { Id, IsoDate } from '../types/common.js';
import type { DayBlock } from '../types/dayBlock.js';
import type { MatrixEntry } from '../types/matrix.js';
import type { WorkArea, PlanKind } from '../types/workArea.js';
import { effectiveMinPerWeek } from '../types/matrix.js';
import { fullName, planForStaffType } from '../types/employee.js';
import type { PlanChange } from '../types/assignment.js';
import { formatHHMM } from '../time/minutes.js';
import { WEEKDAY_LABELS } from '../types/common.js';
import { addDays, isWeekend, isoWeekday, practiceWeekDates } from '../time/dates.js';
import { FORBIDDEN, solveAssignment } from './hungarian.js';
import { areaKey, checkEligibility, hasRequestedAbsence, needsSupervision } from './constraints.js';
import type { OccupiedSpan, SeatSlot } from './constraints.js';
import type {
  Diagnostic,
  FixedAssignment,
  PlanEmployee,
  PlanInput,
  PlanResult,
  PlannedAssignment,
  RejectionCode,
} from './types.js';
import { REJECTION_LABELS } from './types.js';

export * from './types.js';
export * from './constraints.js';
export { solveAssignment, FORBIDDEN } from './hungarian.js';

/** Mindestbesetzung eines Bereichs in einem bestimmten Block. */
export function minStaffFor(area: WorkArea, blockId: Id): number {
  return area.blockMinStaff[blockId] ?? area.minStaff;
}

const PLAN_ORDER: Readonly<Record<PlanKind, number>> = { doctor: 0, pcm: 1, mfa: 2 };

interface Seat {
  readonly area: WorkArea;
  readonly required: boolean;
}

interface State {
  readonly assignments: PlannedAssignment[];
  readonly diagnostics: Diagnostic[];
  /** employeeId -> belegte Zeitfenster. */
  readonly occupied: Map<Id, OccupiedSpan[]>;
  /** "employeeId|areaId" -> Einsätze in dieser Woche. */
  readonly weekCounts: Map<string, number>;
  /** "date|blockId|areaId" -> eingeteilte Personen. */
  readonly placed: Map<string, Id[]>;
  /** employeeId -> bereits verplante Minuten dieser Woche. */
  readonly minutes: Map<Id, number>;
  /** "employeeId|date" -> Bereiche, in denen die Person an dem Tag war. */
  readonly areasByDay: Map<string, Set<Id>>;
  score: number;
}

const slotKey = (date: IsoDate, blockId: Id, areaId: Id): string => `${date}|${blockId}|${areaId}`;
const fixedKey = (entry: FixedAssignment): string =>
  `${entry.date}|${entry.dayBlockId}|${entry.workAreaId}|${entry.employeeId}`;
const dayKey = (employeeId: Id, date: IsoDate): string => `${employeeId}|${date}`;

/**
 * Erzeugt den Wochenplan fuer alle Gruppen auf einmal.
 *
 * Rein und deterministisch: kein Datenbankzugriff, keine Systemzeit, kein
 * Zufall. Gleicher Input ergibt denselben Plan - sonst waere er weder
 * testbar noch erklaerbar.
 */
export function generateWeekPlan(input: PlanInput): PlanResult {
  const state: State = {
    assignments: [],
    diagnostics: [],
    occupied: new Map(),
    weekCounts: new Map(),
    placed: new Map(),
    minutes: new Map(),
    areasByDay: new Map(),
    score: 0,
  };

  const matrix = new Map<string, MatrixEntry>();
  for (const entry of input.matrix) matrix.set(areaKey(entry.employeeId, entry.workAreaId), entry);

  // Stabile Reihenfolge: der Sortierschluessel entscheidet bei
  // Kostengleichstand - nie ein Zufallswert.
  const employees = [...input.employees].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

  const areas = input.workAreas
    .filter((area) => area.isActive)
    .sort(
      (a, b) =>
        PLAN_ORDER[a.plan] - PLAN_ORDER[b.plan] ||
        a.sortOrder - b.sortOrder ||
        (a.id < b.id ? -1 : 1),
    );
  const areaById = new Map(areas.map((area) => [area.id, area]));
  const blockById = new Map(input.dayBlocks.map((block) => [block.id, block]));

  const fairnessAverage = averageHistory(input);
  const days = practiceWeekDates(input.weekStart).filter((date) => !input.closedDates.has(date));
  const previousSet = new Set(input.previous.map(fixedKey));

  // Vorwoche fuer Folgeaufgaben ueber den Montag hinweg.
  for (const entry of input.recent) {
    const key = dayKey(entry.employeeId, entry.date);
    const set = state.areasByDay.get(key) ?? new Set<Id>();
    set.add(entry.workAreaId);
    state.areasByDay.set(key, set);
  }

  const eligibilityFor = (employee: PlanEmployee, slot: SeatSlot): RejectionCode | null =>
    checkEligibility(employee, slot, {
      occupied: state.occupied.get(employee.id) ?? [],
      weekCounts: state.weekCounts,
      matrix,
      absences: input.absences,
      minOverlapRatio: input.minOverlapRatio,
    });

  const ctx: PlanContext = {
    input,
    employees,
    employeeById,
    areas,
    areaById,
    blockById,
    matrix,
    eligibilityFor,
    fairnessAverage,
    previousSet,
    days,
  };

  // ---------------------------------------------------------- Phase A --
  // Fixpunkte: gesperrte Zuweisungen, dann die bisherige Woche (bei
  // Umplanung), dann die Musterwoche (bei Neuplanung).

  for (const pin of input.pinned) {
    const block = blockById.get(pin.dayBlockId);
    const area = areaById.get(pin.workAreaId);
    if (!block || !area || !days.includes(pin.date)) continue;
    place(state, { ...pin, source: 'manual', reason: 'gesperrt' }, block);
  }

  if (input.mode === 'replan') {
    keepPrevious(state, ctx);
  } else {
    applyTemplate(state, ctx);
  }

  // ---------------------------------------------------------- Phase B --
  // Luecken blockweise fuellen, exakt statt gierig.

  const blocks = plannableBlocks(input, days);
  for (const group of groupByStart(blocks)) {
    // Erst die Pflichtplaetze aller Gruppen, die zur selben Zeit beginnen,
    // dann die Kuer. Sonst nimmt die PCM-Sprechstunde (freiwillig) die
    // PCM, bevor die MFA-Anmeldung (Pflicht) sie mit Freigabe bekommen kann.
    for (const pass of PASSES) {
      for (const { date, block } of group) fillBlockPass(state, ctx, date, block, pass);
    }
  }

  // ---------------------------------------------------------- Phase B2 --
  // Umplanung: bleibt ein Pflichtplatz offen, obwohl die Personen des
  // Blocks anders verteilt gehen wuerden, wird der Block neu geloest -
  // mit Praemie fuer alles, was bleiben kann.
  if (input.mode === 'replan') {
    for (const { date, block } of blocks) repairBlock(state, ctx, date, block);
  }

  // ---------------------------------------------------------- Phase C --
  // Betreuungspruefung, offene Pflichten melden, Unterschied ausweisen.

  enforceSupervision(state, ctx);
  reportUnfilledSeats(state, ctx, blocks);
  reportUnmetRotation(state, ctx);

  return {
    assignments: state.assignments,
    diagnostics: state.diagnostics,
    changes: diffAgainstPrevious(state, input),
    score: state.score,
  };
}

// ------------------------------------------------------------- Kontext --

interface PlanContext {
  readonly input: PlanInput;
  readonly employees: readonly PlanEmployee[];
  readonly employeeById: ReadonlyMap<Id, PlanEmployee>;
  readonly areas: readonly WorkArea[];
  readonly areaById: ReadonlyMap<Id, WorkArea>;
  readonly blockById: ReadonlyMap<Id, DayBlock>;
  readonly matrix: ReadonlyMap<string, MatrixEntry>;
  readonly eligibilityFor: (employee: PlanEmployee, slot: SeatSlot) => RejectionCode | null;
  readonly fairnessAverage: ReadonlyMap<Id, number>;
  readonly previousSet: ReadonlySet<string>;
  readonly days: readonly IsoDate[];
}

interface DatedBlock {
  readonly date: IsoDate;
  readonly block: DayBlock;
}

/** Bloecke mit gleichem Tag und gleicher Startzeit, in Eingabereihenfolge. */
function groupByStart(blocks: readonly DatedBlock[]): DatedBlock[][] {
  const groups: DatedBlock[][] = [];
  for (const entry of blocks) {
    const last = groups[groups.length - 1];
    const previous = last?.[0];
    if (
      previous &&
      previous.date === entry.date &&
      previous.block.startMin === entry.block.startMin
    ) {
      last.push(entry);
    } else {
      groups.push([entry]);
    }
  }
  return groups;
}

/** Alle planbaren (Tag, Block)-Paare der Woche in fester Reihenfolge. */
function plannableBlocks(input: PlanInput, days: readonly IsoDate[]): DatedBlock[] {
  const result: DatedBlock[] = [];
  for (const date of days) {
    const weekday = isoWeekday(date);
    const blocks = input.dayBlocks
      .filter((block) => block.weekday === weekday && block.kind !== 'closed')
      // Zeitlich, dann Aerzte vor PCM vor MFA: so bekommt die PCM zuerst
      // ihren eigenen Platz, bevor ein MFA-Bereich sie beansprucht.
      .sort(
        (a, b) =>
          a.startMin - b.startMin ||
          PLAN_ORDER[a.plan] - PLAN_ORDER[b.plan] ||
          (a.id < b.id ? -1 : 1),
      );
    for (const block of blocks) result.push({ date, block });
  }
  return result;
}

// ------------------------------------------------------------- Bausteine --

function place(state: State, assignment: PlannedAssignment, block: DayBlock): boolean {
  const occupied = state.occupied.get(assignment.employeeId) ?? [];
  // Eine Person, ein Ort je Zeitfenster - auch ueber Gruppengrenzen hinweg.
  if (
    occupied.some(
      (span) =>
        span.date === assignment.date &&
        span.startMin < block.endMin &&
        block.startMin < span.endMin,
    )
  ) {
    return false;
  }

  occupied.push({ date: assignment.date, startMin: block.startMin, endMin: block.endMin });
  state.occupied.set(assignment.employeeId, occupied);
  state.assignments.push(assignment);

  const counterKey = areaKey(assignment.employeeId, assignment.workAreaId);
  state.weekCounts.set(counterKey, (state.weekCounts.get(counterKey) ?? 0) + 1);

  const slot = slotKey(assignment.date, assignment.dayBlockId, assignment.workAreaId);
  state.placed.set(slot, [...(state.placed.get(slot) ?? []), assignment.employeeId]);

  state.minutes.set(
    assignment.employeeId,
    (state.minutes.get(assignment.employeeId) ?? 0) + (block.endMin - block.startMin),
  );

  const key = dayKey(assignment.employeeId, assignment.date);
  const set = state.areasByDay.get(key) ?? new Set<Id>();
  set.add(assignment.workAreaId);
  state.areasByDay.set(key, set);
  return true;
}

function remove(state: State, assignment: PlannedAssignment, block: DayBlock | undefined): void {
  const index = state.assignments.indexOf(assignment);
  if (index >= 0) state.assignments.splice(index, 1);

  if (block) {
    const spans = state.occupied.get(assignment.employeeId) ?? [];
    const at = spans.findIndex(
      (span) =>
        span.date === assignment.date &&
        span.startMin === block.startMin &&
        span.endMin === block.endMin,
    );
    if (at >= 0) spans.splice(at, 1);
    state.minutes.set(
      assignment.employeeId,
      Math.max(
        0,
        (state.minutes.get(assignment.employeeId) ?? 0) - (block.endMin - block.startMin),
      ),
    );
  }

  const counterKey = areaKey(assignment.employeeId, assignment.workAreaId);
  state.weekCounts.set(counterKey, Math.max(0, (state.weekCounts.get(counterKey) ?? 1) - 1));

  const slot = slotKey(assignment.date, assignment.dayBlockId, assignment.workAreaId);
  state.placed.set(
    slot,
    (state.placed.get(slot) ?? []).filter((id) => id !== assignment.employeeId),
  );

  // Bereiche des Tages nur streichen, wenn die Person dort nicht noch in
  // einem anderen Block des Tages steht.
  const stillThere = state.assignments.some(
    (entry) =>
      entry.employeeId === assignment.employeeId &&
      entry.date === assignment.date &&
      entry.workAreaId === assignment.workAreaId,
  );
  if (!stillThere) {
    state.areasByDay
      .get(dayKey(assignment.employeeId, assignment.date))
      ?.delete(assignment.workAreaId);
  }
}

function averageHistory(input: PlanInput): Map<Id, number> {
  const perArea = new Map<Id, number[]>();
  for (const entry of input.history) {
    perArea.set(entry.workAreaId, [...(perArea.get(entry.workAreaId) ?? []), entry.count]);
  }
  const averages = new Map<Id, number>();
  for (const [workAreaId, counts] of perArea) {
    averages.set(workAreaId, counts.reduce((sum, value) => sum + value, 0) / counts.length);
  }
  return averages;
}

/** Bisherige Woche uebernehmen, soweit sie noch gueltig ist. */
function keepPrevious(state: State, ctx: PlanContext): void {
  const { input, blockById, areaById, employeeById, eligibilityFor, days } = ctx;
  const ordered = [...input.previous].sort(
    (a, b) => a.date.localeCompare(b.date) || fixedKey(a).localeCompare(fixedKey(b)),
  );

  for (const entry of ordered) {
    const block = blockById.get(entry.dayBlockId);
    const area = areaById.get(entry.workAreaId);
    const employee = employeeById.get(entry.employeeId);
    if (!block || !area || !employee || !days.includes(entry.date)) continue;

    const rejection = eligibilityFor(employee, { date: entry.date, block, area });
    if (rejection === null) {
      place(state, { ...entry, source: 'kept', reason: 'beibehalten' }, block);
      state.score += input.weights.stability;
      continue;
    }
    if (rejection === 'ALREADY_ASSIGNED') continue;

    state.diagnostics.push({
      kind: 'dropped',
      severity: 'warning',
      message:
        `${fullName(employee)} war ${labelFor(block)} in ${area.name} eingeteilt und ` +
        `fällt dort weg: ${REJECTION_LABELS[rejection]}.`,
      date: entry.date,
      dayBlockId: block.id,
      workAreaId: area.id,
      employeeId: employee.id,
    });
  }
}

/** Musterwoche als Fixpunkte setzen, jede gebrochene Zeile benennen. */
function applyTemplate(state: State, ctx: PlanContext): void {
  const { input, blockById, areaById, employeeById, eligibilityFor, days } = ctx;

  for (const date of days) {
    const weekday = isoWeekday(date);
    for (const row of input.template) {
      const block = blockById.get(row.dayBlockId);
      if (!block || block.weekday !== weekday || block.kind === 'closed') continue;
      const area = areaById.get(row.workAreaId);
      const employee = employeeById.get(row.employeeId);
      if (!area || !employee) continue;

      // Die Musterwoche darf einen Bereich nicht ueber seine Obergrenze fuellen.
      const already = state.placed.get(slotKey(date, block.id, area.id))?.length ?? 0;
      if (area.maxStaff !== null && already >= area.maxStaff) continue;

      const rejection = eligibilityFor(employee, { date, block, area });
      if (rejection === null) {
        place(
          state,
          {
            date,
            dayBlockId: block.id,
            workAreaId: area.id,
            employeeId: employee.id,
            source: 'template',
            reason: 'aus der Musterwoche',
          },
          block,
        );
        state.score += input.weights.templateMatch;
      } else if (rejection !== 'ALREADY_ASSIGNED') {
        // Jede gebrochene Vorlagenzeile wird benannt - der Plan soll
        // zeigen, was vom Normalfall abweicht und warum.
        state.diagnostics.push({
          kind: 'template_broken',
          severity: 'info',
          message:
            `${fullName(employee)} ist ${WEEKDAY_LABELS[weekday]} normalerweise in ` +
            `${area.name}, diese Woche nicht: ${REJECTION_LABELS[rejection]}.`,
          date,
          dayBlockId: block.id,
          workAreaId: area.id,
          employeeId: employee.id,
        });
      }
    }
  }
}

/**
 * Die drei Durchlaeufe je (Tag, Block).
 *
 * Die Betreuungspflicht ist keine reine Zuordnungsbedingung: ob eine Person
 * mit `supervised` gesetzt werden darf, haengt davon ab, wer sonst noch im
 * Bereich sitzt. Deshalb zuerst nur die eigenstaendigen Kraefte auf die
 * Pflichtplaetze - danach ist entschieden, wo eine Betreuung sitzt.
 */
const PASSES = [
  /** Pflichtplaetze, nur eigenstaendige Kraefte. */
  { requiredOnly: true, allowSupervised: false },
  /** Pflichtplaetze, jetzt auch Betreute - dort, wo eine Betreuung sitzt. */
  { requiredOnly: true, allowSupervised: true },
  /** Restverteilung: niemand bleibt ohne Aufgabe. */
  { requiredOnly: false, allowSupervised: true },
] as const;

function areasInBlock(ctx: PlanContext, block: DayBlock): WorkArea[] {
  return ctx.areas.filter((area) => area.plan === block.plan && area.blockIds.includes(block.id));
}

type Pass = (typeof PASSES)[number];

function fillBlock(state: State, ctx: PlanContext, date: IsoDate, block: DayBlock): void {
  for (const pass of PASSES) fillBlockPass(state, ctx, date, block, pass);
}

function fillBlockPass(
  state: State,
  ctx: PlanContext,
  date: IsoDate,
  block: DayBlock,
  pass: Pass,
): void {
  const { employees, matrix, eligibilityFor } = ctx;

  const activeAreas = areasInBlock(ctx, block);
  if (activeAreas.length === 0) return;

  {
    const candidates = employees.filter(
      (employee) =>
        !(state.occupied.get(employee.id) ?? []).some(
          (span) =>
            span.date === date && span.startMin < block.endMin && block.startMin < span.endMin,
        ),
    );
    if (candidates.length === 0) return;

    const seats: Seat[] = [];
    for (const area of activeAreas) {
      const already = state.placed.get(slotKey(date, block.id, area.id))?.length ?? 0;
      const stillRequired = Math.max(0, minStaffFor(area, block.id) - already);
      for (let i = 0; i < stillRequired; i++) seats.push({ area, required: true });

      if (pass.requiredOnly) continue;
      // Ohne Obergrenze so viele Plaetze anbieten, wie Personen da sind.
      const capacity = area.maxStaff ?? already + candidates.length;
      const optional = Math.max(0, capacity - already - stillRequired);
      for (let i = 0; i < optional; i++) seats.push({ area, required: false });
    }
    if (seats.length === 0) return;

    const cost: number[][] = candidates.map((employee) =>
      seats.map((seat) => {
        const slot: SeatSlot = { date, block, area: seat.area };
        if (eligibilityFor(employee, slot) !== null) return FORBIDDEN;

        if (needsSupervision(employee, seat.area, matrix)) {
          if (!pass.allowSupervised) return FORBIDDEN;
          if (!hasSoloPresent(state, ctx, date, block.id, seat.area)) return FORBIDDEN;
        }
        return seatCost(state, ctx, date, block, employee, seat);
      }),
    );

    for (const match of solveAssignment(cost)) {
      const employee = candidates[match.row];
      const seat = seats[match.column];
      if (!employee || !seat) continue;
      place(
        state,
        {
          date,
          dayBlockId: block.id,
          workAreaId: seat.area.id,
          employeeId: employee.id,
          source: 'auto',
          reason: reasonFor(state, ctx, date, block, employee, seat),
        },
        block,
      );
      state.score += match.cost;
    }
  }
}

/**
 * Umplanung, zweite Stufe: der Block wird nur dann aufgeschnuert, wenn
 * ein Pflichtplatz offen ist. Die bisherigen Personen des Blocks werden
 * freigegeben und mit Stabilitaetspraemie neu verteilt - wer bleiben
 * kann, bleibt; wer den offenen Platz fuellen kann, rueckt.
 */
function repairBlock(state: State, ctx: PlanContext, date: IsoDate, block: DayBlock): void {
  const activeAreas = areasInBlock(ctx, block);
  const missing = activeAreas.some(
    (area) =>
      (state.placed.get(slotKey(date, block.id, area.id))?.length ?? 0) <
      minStaffFor(area, block.id),
  );
  if (!missing) return;

  const kept = state.assignments.filter(
    (entry) =>
      entry.date === date &&
      entry.dayBlockId === block.id &&
      entry.source === 'kept' &&
      activeAreas.some((area) => area.id === entry.workAreaId),
  );
  if (kept.length === 0) return;

  const unfilled = () =>
    activeAreas.reduce(
      (sum, area) =>
        sum +
        Math.max(
          0,
          minStaffFor(area, block.id) -
            (state.placed.get(slotKey(date, block.id, area.id))?.length ?? 0),
        ),
      0,
    );
  const unfilledBefore = unfilled();

  const before = kept.map((entry) => ({ ...entry }));
  for (const entry of kept) remove(state, entry, block);
  fillBlock(state, ctx, date, block);

  // Umstellen lohnt nur, wenn danach mehr Pflichtplaetze besetzt sind.
  // Sonst zurueck auf den alten Stand - minimaler Eingriff.
  if (unfilled() >= unfilledBefore) {
    for (const entry of state.assignments.filter(
      (entry) => entry.date === date && entry.dayBlockId === block.id && entry.source !== 'manual',
    )) {
      remove(state, entry, block);
    }
    for (const entry of before) place(state, entry, block);
    return;
  }

  const after = state.assignments.filter(
    (entry) => entry.date === date && entry.dayBlockId === block.id,
  );
  const stillMissing = unfilled() > 0;
  const changed = before.some(
    (entry) =>
      !after.some(
        (now) => now.employeeId === entry.employeeId && now.workAreaId === entry.workAreaId,
      ),
  );

  if (!changed) return;

  // Was bleibt, heisst wieder "beibehalten" - nur das Verschobene ist neu.
  for (const entry of after) {
    if (
      before.some(
        (old) => old.employeeId === entry.employeeId && old.workAreaId === entry.workAreaId,
      )
    ) {
      const index = state.assignments.indexOf(entry);
      if (index >= 0) {
        state.assignments[index] = { ...entry, source: 'kept', reason: 'beibehalten' };
      }
    }
  }

  state.diagnostics.push({
    kind: 'reshuffled',
    severity: 'info',
    message:
      `${labelFor(block)}: Besetzung umgestellt, damit ` +
      (stillMissing ? 'möglichst wenige' : 'keine') +
      ` Pflichtplätze offen bleiben.`,
    date,
    dayBlockId: block.id,
  });
}

function hasSoloPresent(
  state: State,
  ctx: PlanContext,
  date: IsoDate,
  blockId: Id,
  area: WorkArea,
): boolean {
  const present = state.placed.get(slotKey(date, blockId, area.id)) ?? [];
  return present.some((id) => {
    const employee = ctx.employeeById.get(id);
    return employee ? !needsSupervision(employee, area, ctx.matrix) : false;
  });
}

/** Der Arbeitstag davor - innerhalb der Woche oder aus der Vorwoche. */
function previousWorkingDay(ctx: PlanContext, date: IsoDate): IsoDate {
  let candidate = addDays(date, -1);
  for (let guard = 0; guard < 14; guard++) {
    if (!isWeekend(candidate) && !ctx.input.closedDates.has(candidate)) return candidate;
    candidate = addDays(candidate, -1);
  }
  return candidate;
}

function didFollowUpOrigin(
  state: State,
  ctx: PlanContext,
  employee: PlanEmployee,
  date: IsoDate,
  area: WorkArea,
): boolean {
  if (area.followUpAreaId === null) return false;
  const before = previousWorkingDay(ctx, date);
  return state.areasByDay.get(dayKey(employee.id, before))?.has(area.followUpAreaId) ?? false;
}

function seatCost(
  state: State,
  ctx: PlanContext,
  date: IsoDate,
  block: DayBlock,
  employee: PlanEmployee,
  seat: Seat,
): number {
  const { input, matrix } = ctx;
  const w = input.weights;
  let cost = seat.required ? w.requiredSeat : w.fillIdleBonus;

  if (isInTemplate(input, employee.id, seat.area.id, block.id)) cost += w.templateMatch;
  if (
    ctx.previousSet.has(
      fixedKey({ date, dayBlockId: block.id, workAreaId: seat.area.id, employeeId: employee.id }),
    )
  ) {
    cost += w.stability;
  }
  if (didFollowUpOrigin(state, ctx, employee, date, seat.area)) cost += w.followUp;
  if (planForStaffType(employee.staffType) !== seat.area.plan) cost += w.crossPlan;

  const entry = matrix.get(areaKey(employee.id, seat.area.id));
  const preference = entry?.preference ?? 'neutral';
  if (preference === 'preferred') cost += w.preferencePreferred;
  else if (preference === 'neutral') cost += w.preferenceNeutral;
  else if (preference === 'dislike') cost += w.preferenceDislike;
  else cost += w.preferenceNever;

  const needed = effectiveMinPerWeek(
    entry ?? { clearance: 'solo', exemptRotation: false, minPerWeek: null },
    // Die Pflichtrotation gilt nur fuer die eigene Gruppe.
    planForStaffType(employee.staffType) === seat.area.plan ? seat.area.rotationMinPerWeek : null,
  );
  const done = state.weekCounts.get(areaKey(employee.id, seat.area.id)) ?? 0;
  if (done < needed) cost += w.rotationUnmet;
  // Umgekehrt: wer im Labor noch fehlt und dort in diesem Block noch Platz
  // haette, soll nicht schon im ersten Durchlauf von der Anmeldung
  // verbraucht werden. Sonst faellt die Rotation dem Zufall der
  // Sortierung zum Opfer, obwohl genug andere fuer die Anmeldung da sind.
  else if (hasOpenRotationElsewhere(state, ctx, date, block, employee, seat.area)) {
    cost -= w.rotationUnmet;
  }

  if (hasRequestedAbsence(input.absences, employee.id, date, block)) cost += w.absenceRequested;

  const history = input.history.find(
    (row) => row.employeeId === employee.id && row.workAreaId === seat.area.id,
  );
  const average = ctx.fairnessAverage.get(seat.area.id) ?? 0;
  cost += w.fairness * ((history?.count ?? 0) - average);

  // Wer diese Woche schon viel steht, wird fuer weitere Plaetze teurer.
  cost += (w.workloadBalance * (state.minutes.get(employee.id) ?? 0)) / 60;

  return cost;
}

/** Ob die Person in diesem Block noch eine offene Pflichtrotation mit freiem Platz haette. */
function hasOpenRotationElsewhere(
  state: State,
  ctx: PlanContext,
  date: IsoDate,
  block: DayBlock,
  employee: PlanEmployee,
  except: WorkArea,
): boolean {
  const plan = planForStaffType(employee.staffType);
  for (const area of areasInBlock(ctx, block)) {
    if (area.id === except.id || area.plan !== plan || area.rotationMinPerWeek === null) continue;
    const entry = ctx.matrix.get(areaKey(employee.id, area.id));
    const needed = effectiveMinPerWeek(
      entry ?? { clearance: 'solo', exemptRotation: false, minPerWeek: null },
      area.rotationMinPerWeek,
    );
    if (needed === 0) continue;
    if ((state.weekCounts.get(areaKey(employee.id, area.id)) ?? 0) >= needed) continue;
    const placed = state.placed.get(slotKey(date, block.id, area.id))?.length ?? 0;
    if (area.maxStaff !== null && placed >= area.maxStaff) continue;
    if (ctx.eligibilityFor(employee, { date, block, area }) !== null) continue;
    return true;
  }
  return false;
}

function isInTemplate(input: PlanInput, employeeId: Id, workAreaId: Id, dayBlockId: Id): boolean {
  return input.template.some(
    (row) =>
      row.employeeId === employeeId &&
      row.workAreaId === workAreaId &&
      row.dayBlockId === dayBlockId,
  );
}

/** Kurze Begruendung fuer den Tooltip im Dienstplan. */
function reasonFor(
  state: State,
  ctx: PlanContext,
  date: IsoDate,
  block: DayBlock,
  employee: PlanEmployee,
  seat: Seat,
): string {
  const { input, matrix, areaById } = ctx;
  if (isInTemplate(input, employee.id, seat.area.id, block.id)) return 'aus der Musterwoche';
  if (didFollowUpOrigin(state, ctx, employee, date, seat.area)) {
    const origin = seat.area.followUpAreaId ? areaById.get(seat.area.followUpAreaId) : undefined;
    return `Folgeaufgabe zu ${origin?.name ?? 'Vortag'}`;
  }

  const entry = matrix.get(areaKey(employee.id, seat.area.id));
  const needed = effectiveMinPerWeek(
    entry ?? { clearance: 'solo', exemptRotation: false, minPerWeek: null },
    planForStaffType(employee.staffType) === seat.area.plan ? seat.area.rotationMinPerWeek : null,
  );
  const done = state.weekCounts.get(areaKey(employee.id, seat.area.id)) ?? 0;
  if (done < needed) return `Pflichtrotation ${seat.area.name}`;
  if (planForStaffType(employee.staffType) !== seat.area.plan) return 'Aushilfe in anderer Gruppe';
  if (entry?.preference === 'preferred') return 'bevorzugter Bereich';
  if (entry?.preference === 'never') return 'Notbesetzung – eigentlich nicht gewünscht';
  if (entry?.preference === 'dislike') return 'trotz Abneigung eingeteilt';
  return seat.required ? 'Mindestbesetzung' : 'freie Zuteilung';
}

/**
 * Nachtraegliche Betreuungspruefung.
 *
 * Der zweite Durchlauf kann strukturell keinen unbetreuten Azubi erzeugen.
 * Aus der Musterwoche, der bisherigen Woche oder aus gesperrten
 * Zuweisungen kann aber einer kommen - der wird hier entfernt und
 * gemeldet, statt still stehen zu bleiben.
 */
function enforceSupervision(state: State, ctx: PlanContext): void {
  const { areaById, employeeById, blockById, matrix } = ctx;
  for (const assignment of [...state.assignments]) {
    if (assignment.source === 'manual') continue; // Gesperrtes bleibt stehen.
    const area = areaById.get(assignment.workAreaId);
    const employee = employeeById.get(assignment.employeeId);
    if (!area || !employee || !needsSupervision(employee, area, matrix)) continue;

    const others = (
      state.placed.get(slotKey(assignment.date, assignment.dayBlockId, area.id)) ?? []
    )
      .filter((id) => id !== employee.id)
      .map((id) => employeeById.get(id))
      .filter((entry): entry is PlanEmployee => entry !== undefined);

    if (others.some((other) => !needsSupervision(other, area, matrix))) continue;

    const block = blockById.get(assignment.dayBlockId);
    remove(state, assignment, block);
    state.diagnostics.push({
      kind: 'supervision_dropped',
      severity: 'warning',
      message:
        `${fullName(employee)} wurde aus ${area.name} genommen (${labelFor(block)}): ` +
        `dort ist niemand mit eigenständiger Freigabe.`,
      date: assignment.date,
      dayBlockId: assignment.dayBlockId,
      workAreaId: area.id,
      employeeId: employee.id,
    });
  }
}

const labelFor = (block: DayBlock | undefined): string =>
  block
    ? `${WEEKDAY_LABELS[block.weekday]} ${formatHHMM(block.startMin)}–${formatHHMM(block.endMin)}`
    : 'unbekannter Block';

/**
 * Meldet jeden unbesetzten Pflichtplatz mit der Verteilung der
 * Ablehnungsgruende. Das ist der zentrale Unterschied zur
 * Vorgaengerversion, die still versagte.
 */
function reportUnfilledSeats(state: State, ctx: PlanContext, blocks: readonly DatedBlock[]): void {
  const { employees, matrix, eligibilityFor } = ctx;

  for (const { date, block } of blocks) {
    for (const area of areasInBlock(ctx, block)) {
      const required = minStaffFor(area, block.id);
      const placedCount = state.placed.get(slotKey(date, block.id, area.id))?.length ?? 0;
      if (placedCount >= required) continue;

      // Nur die eigene Gruppe zaehlen - sonst erklaert die Diagnose der
      // MFA-Anmeldung, dass sechs Aerzte "zur anderen Gruppe gehoeren".
      const pool = employees.filter(
        (employee) =>
          planForStaffType(employee.staffType) === area.plan ||
          matrix.has(areaKey(employee.id, area.id)),
      );

      const reasons = new Map<RejectionCode, number>();
      for (const employee of pool) {
        let rejection = eligibilityFor(employee, { date, block, area });
        // Die Betreuungspflicht wird nicht in checkEligibility geprueft,
        // weil sie vom Rest der Loesung abhaengt. Fuer die Diagnose ist
        // sie aber oft der eigentliche Grund und darf nicht fehlen.
        if (
          rejection === null &&
          needsSupervision(employee, area, matrix) &&
          !hasSoloPresent(state, ctx, date, block.id, area)
        ) {
          rejection = 'NEEDS_SUPERVISION';
        }
        if (rejection !== null) reasons.set(rejection, (reasons.get(rejection) ?? 0) + 1);
      }

      const breakdown = [...reasons.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => `${count}× ${REJECTION_LABELS[code]}`)
        .join(', ');

      state.diagnostics.push({
        kind: 'unfilled_required',
        severity: area.isCritical ? 'error' : 'warning',
        message:
          `${area.name}, ${labelFor(block)}: ${required - placedCount} von ${required} ` +
          `Plätzen unbesetzt. ${pool.length} Personen geprüft` +
          (breakdown ? ` – ${breakdown}.` : '.'),
        date,
        dayBlockId: block.id,
        workAreaId: area.id,
      });
    }
  }
}

/** Wer diese Woche eine Pflichtrotation nicht erfuellt hat. */
function reportUnmetRotation(state: State, ctx: PlanContext): void {
  const { areas, employees, matrix } = ctx;
  for (const area of areas) {
    if (area.rotationMinPerWeek === null) continue;
    for (const employee of employees) {
      if (planForStaffType(employee.staffType) !== area.plan) continue;
      const entry = matrix.get(areaKey(employee.id, area.id));
      const needed = effectiveMinPerWeek(
        entry ?? { clearance: 'solo', exemptRotation: false, minPerWeek: null },
        area.rotationMinPerWeek,
      );
      if (needed === 0) continue;
      const done = state.weekCounts.get(areaKey(employee.id, area.id)) ?? 0;
      if (done >= needed) continue;

      state.diagnostics.push({
        kind: 'rotation_unmet',
        severity: 'warning',
        message:
          `${fullName(employee)} war diese Woche ${done}× in ${area.name}, ` +
          `vorgesehen sind ${needed}×.`,
        workAreaId: area.id,
        employeeId: employee.id,
      });
    }
  }
}

/** Unterschied zur bisherigen Woche - Grundlage des Umplanungsvorschlags. */
function diffAgainstPrevious(state: State, input: PlanInput): PlanChange[] {
  const before = new Map<string, FixedAssignment>();
  for (const entry of [...input.previous, ...input.pinned]) before.set(fixedKey(entry), entry);
  const after = new Map<string, FixedAssignment>();
  for (const entry of state.assignments) after.set(fixedKey(entry), entry);

  const strip = (entry: FixedAssignment, kind: PlanChange['kind']): PlanChange => ({
    kind,
    date: entry.date,
    dayBlockId: entry.dayBlockId,
    workAreaId: entry.workAreaId,
    employeeId: entry.employeeId,
  });
  const changes: PlanChange[] = [];
  for (const [key, entry] of before) {
    if (!after.has(key)) changes.push(strip(entry, 'removed'));
  }
  for (const [key, entry] of after) {
    if (!before.has(key)) changes.push(strip(entry, 'added'));
  }
  // Erst was wegfaellt, dann was dazukommt - so liest sich der Vorschlag.
  const order = { removed: 0, added: 1 } as const;
  return changes.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.dayBlockId.localeCompare(b.dayBlockId) ||
      a.workAreaId.localeCompare(b.workAreaId) ||
      order[a.kind] - order[b.kind] ||
      a.employeeId.localeCompare(b.employeeId),
  );
}
