import type { Id, IsoDate } from '../types/common.js';
import type { DayBlock } from '../types/dayBlock.js';
import type { MatrixEntry } from '../types/matrix.js';
import type { WorkArea } from '../types/workArea.js';
import { effectiveMinPerWeek } from '../types/matrix.js';
import { fullName } from '../types/employee.js';
import { formatHHMM } from '../time/minutes.js';
import { WEEKDAY_LABELS } from '../types/common.js';
import { isoWeekday, practiceWeekDates } from '../time/dates.js';
import { FORBIDDEN, solveAssignment } from './hungarian.js';
import {
  areaKey,
  blockKey,
  checkEligibility,
  hasRequestedAbsence,
  needsSupervision,
} from './constraints.js';
import type { SeatSlot } from './constraints.js';
import type {
  Diagnostic,
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

interface Seat {
  readonly area: WorkArea;
  readonly required: boolean;
}

interface State {
  readonly assignments: PlannedAssignment[];
  readonly diagnostics: Diagnostic[];
  /** employeeId -> belegte "date|blockId". */
  readonly occupied: Map<Id, Set<string>>;
  /** "employeeId|areaId" -> Einsätze in dieser Woche. */
  readonly weekCounts: Map<string, number>;
  /** "date|blockId|areaId" -> eingeteilte Personen. */
  readonly placed: Map<string, Id[]>;
  /** employeeId -> bereits verplante Minuten dieser Woche. */
  readonly minutes: Map<Id, number>;
  score: number;
}

const slotKey = (date: IsoDate, blockId: Id, areaId: Id): string => `${date}|${blockId}|${areaId}`;

/**
 * Erzeugt den Wochenplan.
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
    score: 0,
  };

  const matrix = new Map<string, MatrixEntry>();
  for (const entry of input.matrix) matrix.set(areaKey(entry.employeeId, entry.workAreaId), entry);

  const pcmBusy = new Set(input.pcmBusy.map((entry) => blockKey(entry.date, entry.dayBlockId)));

  // Nur Personen des passenden Plans, in stabiler Reihenfolge. Der
  // Sortierschluessel entscheidet bei Kostengleichstand - nie ein Zufallswert.
  const employees = [...input.employees].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const areas = input.workAreas
    .filter((area) => area.plan === input.plan && area.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));

  const fairnessAverage = averageHistory(input);
  const days = practiceWeekDates(input.weekStart).filter((date) => !input.closedDates.has(date));

  const context = () => ({
    matrix,
    absences: input.absences,
    pcmBusy,
    minOverlapRatio: input.minOverlapRatio,
  });

  const eligibilityFor = (employee: PlanEmployee, slot: SeatSlot): RejectionCode | null =>
    checkEligibility(employee, slot, {
      ...context(),
      occupiedBlocks: state.occupied.get(employee.id) ?? new Set(),
      weekCounts: state.weekCounts,
    });

  // ---------------------------------------------------------- Phase A --
  // Fixpunkte: gesperrte Zuweisungen, dann die Musterwoche.

  for (const pin of input.pinned) {
    const block = input.dayBlocks.find((entry) => entry.id === pin.dayBlockId);
    const area = areas.find((entry) => entry.id === pin.workAreaId);
    if (!block || !area) continue;
    place(
      state,
      {
        date: pin.date,
        dayBlockId: pin.dayBlockId,
        workAreaId: pin.workAreaId,
        employeeId: pin.employeeId,
        source: 'manual',
        reason: 'gesperrt',
      },
      block,
    );
  }

  for (const date of days) {
    const weekday = isoWeekday(date);
    for (const row of input.template) {
      const block = input.dayBlocks.find((entry) => entry.id === row.dayBlockId);
      if (!block || block.weekday !== weekday || block.kind === 'closed') continue;
      const area = areas.find((entry) => entry.id === row.workAreaId);
      const employee = employees.find((entry) => entry.id === row.employeeId);
      if (!area || !employee) continue;

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

  // ---------------------------------------------------------- Phase B --
  // Luecken blockweise fuellen, exakt statt gierig.

  for (const date of days) {
    const weekday = isoWeekday(date);
    const blocks = input.dayBlocks
      .filter((block) => block.weekday === weekday && block.kind !== 'closed')
      .sort((a, b) => a.startMin - b.startMin);

    for (const block of blocks) {
      fillBlock(state, input, {
        date,
        block,
        areas,
        employees,
        matrix,
        eligibilityFor,
        fairnessAverage,
      });
    }
  }

  // ---------------------------------------------------------- Phase C --
  // Betreuungspruefung, Restverteilung, offene Pflichten melden.

  enforceSupervision(state, input, areas, employees, matrix);
  reportUnfilledSeats(state, input, days, areas, employees, matrix, eligibilityFor);
  reportUnmetRotation(state, input, areas, employees, matrix);

  return {
    assignments: state.assignments,
    diagnostics: state.diagnostics,
    score: state.score,
  };
}

// ------------------------------------------------------------- Bausteine --

function place(state: State, assignment: PlannedAssignment, block: DayBlock): void {
  const occupied = state.occupied.get(assignment.employeeId) ?? new Set<string>();
  const key = blockKey(assignment.date, assignment.dayBlockId);
  if (occupied.has(key)) return; // Eine Person, ein Ort je Block.

  occupied.add(key);
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
}

function remove(state: State, assignment: PlannedAssignment): void {
  const index = state.assignments.indexOf(assignment);
  if (index >= 0) state.assignments.splice(index, 1);
  state.occupied
    .get(assignment.employeeId)
    ?.delete(blockKey(assignment.date, assignment.dayBlockId));
  const counterKey = areaKey(assignment.employeeId, assignment.workAreaId);
  state.weekCounts.set(counterKey, Math.max(0, (state.weekCounts.get(counterKey) ?? 1) - 1));
  const slot = slotKey(assignment.date, assignment.dayBlockId, assignment.workAreaId);
  state.placed.set(
    slot,
    (state.placed.get(slot) ?? []).filter((id) => id !== assignment.employeeId),
  );
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

interface BlockContext {
  readonly date: IsoDate;
  readonly block: DayBlock;
  readonly areas: readonly WorkArea[];
  readonly employees: readonly PlanEmployee[];
  readonly matrix: ReadonlyMap<string, MatrixEntry>;
  readonly eligibilityFor: (employee: PlanEmployee, slot: SeatSlot) => RejectionCode | null;
  readonly fairnessAverage: ReadonlyMap<Id, number>;
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

function fillBlock(state: State, input: PlanInput, ctx: BlockContext): void {
  const { date, block, areas, employees, matrix, eligibilityFor } = ctx;

  const activeAreas = areas.filter((area) => area.blockIds.includes(block.id));
  if (activeAreas.length === 0) return;

  for (const pass of PASSES) {
    const candidates = employees.filter(
      (employee) => !state.occupied.get(employee.id)?.has(blockKey(date, block.id)),
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
    if (seats.length === 0) continue;

    const cost: number[][] = candidates.map((employee) =>
      seats.map((seat) => {
        const slot: SeatSlot = { date, block, area: seat.area };
        if (eligibilityFor(employee, slot) !== null) return FORBIDDEN;

        if (needsSupervision(employee, seat.area, matrix)) {
          if (!pass.allowSupervised) return FORBIDDEN;
          if (!hasSoloPresent(state, matrix, employees, date, block.id, seat.area)) {
            return FORBIDDEN;
          }
        }
        return seatCost(state, input, ctx, employee, seat);
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
          reason: reasonFor(state, input, ctx, employee, seat),
        },
        block,
      );
      state.score += match.cost;
    }
  }
}

function hasSoloPresent(
  state: State,
  matrix: ReadonlyMap<string, MatrixEntry>,
  employees: readonly PlanEmployee[],
  date: IsoDate,
  blockId: Id,
  area: WorkArea,
): boolean {
  const present = state.placed.get(slotKey(date, blockId, area.id)) ?? [];
  return present.some((id) => {
    const employee = employees.find((entry) => entry.id === id);
    return employee ? !needsSupervision(employee, area, matrix) : false;
  });
}

function seatCost(
  state: State,
  input: PlanInput,
  ctx: BlockContext,
  employee: PlanEmployee,
  seat: Seat,
): number {
  const w = input.weights;
  let cost = seat.required ? w.requiredSeat : w.fillIdleBonus;

  if (isInTemplate(input, employee.id, seat.area.id, ctx.block.id)) cost += w.templateMatch;

  const entry = ctx.matrix.get(areaKey(employee.id, seat.area.id));
  const preference = entry?.preference ?? 'neutral';
  if (preference === 'preferred') cost += w.preferencePreferred;
  else if (preference === 'neutral') cost += w.preferenceNeutral;
  else if (preference === 'dislike') cost += w.preferenceDislike;
  else cost += w.preferenceNever;

  const needed = effectiveMinPerWeek(
    entry ?? { clearance: 'solo', exemptRotation: false, minPerWeek: null },
    seat.area.rotationMinPerWeek,
  );
  const done = state.weekCounts.get(areaKey(employee.id, seat.area.id)) ?? 0;
  if (done < needed) cost += w.rotationUnmet;

  if (hasRequestedAbsence(input.absences, employee.id, ctx.date)) cost += w.absenceRequested;

  const history = input.history.find(
    (row) => row.employeeId === employee.id && row.workAreaId === seat.area.id,
  );
  const average = ctx.fairnessAverage.get(seat.area.id) ?? 0;
  cost += w.fairness * ((history?.count ?? 0) - average);

  // Wer diese Woche schon viel steht, wird fuer weitere Plaetze teurer.
  cost += (w.workloadBalance * (state.minutes.get(employee.id) ?? 0)) / 60;

  return cost;
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
  input: PlanInput,
  ctx: BlockContext,
  employee: PlanEmployee,
  seat: Seat,
): string {
  if (isInTemplate(input, employee.id, seat.area.id, ctx.block.id)) return 'aus der Musterwoche';

  const entry = ctx.matrix.get(areaKey(employee.id, seat.area.id));
  const needed = effectiveMinPerWeek(
    entry ?? { clearance: 'solo', exemptRotation: false, minPerWeek: null },
    seat.area.rotationMinPerWeek,
  );
  const done = state.weekCounts.get(areaKey(employee.id, seat.area.id)) ?? 0;
  if (done < needed) return `Pflichtrotation ${seat.area.name}`;
  if (entry?.preference === 'preferred') return 'bevorzugter Bereich';
  if (entry?.preference === 'never') return 'Notbesetzung – eigentlich nicht gewünscht';
  if (entry?.preference === 'dislike') return 'trotz Abneigung eingeteilt';
  return seat.required ? 'Mindestbesetzung' : 'freie Zuteilung';
}

/**
 * Nachtraegliche Betreuungspruefung.
 *
 * Der zweite Durchlauf kann strukturell keinen unbetreuten Azubi erzeugen.
 * Aus der Musterwoche oder aus gesperrten Zuweisungen kann aber einer
 * kommen - der wird hier entfernt und gemeldet, statt still stehen zu bleiben.
 */
function enforceSupervision(
  state: State,
  input: PlanInput,
  areas: readonly WorkArea[],
  employees: readonly PlanEmployee[],
  matrix: ReadonlyMap<string, MatrixEntry>,
): void {
  for (const assignment of [...state.assignments]) {
    if (assignment.source === 'manual') continue; // Gesperrtes bleibt stehen.
    const area = areas.find((entry) => entry.id === assignment.workAreaId);
    const employee = employees.find((entry) => entry.id === assignment.employeeId);
    if (!area || !employee || !needsSupervision(employee, area, matrix)) continue;

    const others = (
      state.placed.get(slotKey(assignment.date, assignment.dayBlockId, area.id)) ?? []
    )
      .filter((id) => id !== employee.id)
      .map((id) => employees.find((entry) => entry.id === id))
      .filter((entry): entry is PlanEmployee => entry !== undefined);

    if (others.some((other) => !needsSupervision(other, area, matrix))) continue;

    remove(state, assignment);
    const block = input.dayBlocks.find((entry) => entry.id === assignment.dayBlockId);
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
function reportUnfilledSeats(
  state: State,
  input: PlanInput,
  days: readonly IsoDate[],
  areas: readonly WorkArea[],
  employees: readonly PlanEmployee[],
  matrix: ReadonlyMap<string, MatrixEntry>,
  eligibilityFor: (employee: PlanEmployee, slot: SeatSlot) => RejectionCode | null,
): void {
  for (const date of days) {
    const weekday = isoWeekday(date);
    const blocks = input.dayBlocks.filter(
      (block) => block.weekday === weekday && block.kind !== 'closed',
    );

    for (const block of blocks) {
      for (const area of areas) {
        if (!area.blockIds.includes(block.id)) continue;
        const required = minStaffFor(area, block.id);
        const placedCount = state.placed.get(slotKey(date, block.id, area.id))?.length ?? 0;
        if (placedCount >= required) continue;

        const reasons = new Map<RejectionCode, number>();
        for (const employee of employees) {
          let rejection = eligibilityFor(employee, { date, block, area });
          // Die Betreuungspflicht wird nicht in checkEligibility geprueft,
          // weil sie vom Rest der Loesung abhaengt. Fuer die Diagnose ist
          // sie aber oft der eigentliche Grund und darf nicht fehlen.
          if (
            rejection === null &&
            needsSupervision(employee, area, matrix) &&
            !hasSoloPresent(state, matrix, employees, date, block.id, area)
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
            `Plätzen unbesetzt. ${employees.length} Personen geprüft` +
            (breakdown ? ` – ${breakdown}.` : '.'),
          date,
          dayBlockId: block.id,
          workAreaId: area.id,
        });
      }
    }
  }
}

/** Wer diese Woche eine Pflichtrotation nicht erfuellt hat. */
function reportUnmetRotation(
  state: State,
  input: PlanInput,
  areas: readonly WorkArea[],
  employees: readonly PlanEmployee[],
  matrix: ReadonlyMap<string, MatrixEntry>,
): void {
  for (const area of areas) {
    if (area.rotationMinPerWeek === null) continue;
    for (const employee of employees) {
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
  void input;
}
