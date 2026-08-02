import { Router } from 'express';
import { z } from 'zod';
import { addDays, assertIsoDate, closedDateSet, generateWeekPlan, planForStaffType, startOfISOWeek, } from '@haeppi/shared';
import { requireAdmin, requireAuth } from '../../auth/middleware.js';
import { listEmployees } from '../../db/repositories/employees.js';
import { listWorkAreas } from '../../db/repositories/workAreas.js';
import { listDayBlocks } from '../../db/repositories/dayBlocks.js';
import { listMatrix } from '../../db/repositories/matrix.js';
import { readPracticeSettings } from '../../db/repositories/settings.js';
import { createAssignment, deleteAssignment, historyCounts, listAssignments, listLockedAssignments, listTemplate, replaceTemplate, replaceWeek, setAssignmentLock, } from '../../db/repositories/roster.js';
import { badRequest, notFound, parseBody, pathParam } from '../http.js';
import { writeAudit } from '../audit.js';
const planSchema = z.enum(['doctor', 'mfa']);
const generateSchema = z.object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    plan: planSchema,
    dryRun: z.boolean().optional(),
});
const assignmentSchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dayBlockId: z.string(),
    workAreaId: z.string(),
    employeeId: z.string(),
    isLocked: z.boolean().optional(),
});
const templateSchema = z.object({
    entries: z
        .array(z.object({
        employeeId: z.string(),
        workAreaId: z.string(),
        dayBlockId: z.string(),
    }))
        .max(500),
});
/** Abwesenheiten im Zeitraum, auf die Felder reduziert, die der Scheduler braucht. */
function absencesFor(db, from, to) {
    const rows = db
        .prepare(`SELECT employee_id, start_date, end_date, status, half_day
         FROM absences
        WHERE status IN ('approved', 'requested')
          AND start_date <= ? AND end_date >= ?`)
        .all(to, from);
    return rows.map((row) => ({
        employeeId: row.employee_id,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        halfDay: row.half_day,
    }));
}
/** Wiederkehrende Abwesenheiten (Berufsschule) als konkrete Tage der Woche. */
function recurringAbsencesFor(db, weekStart) {
    const rows = db
        .prepare(`SELECT employee_id, weekday, valid_from, valid_to
         FROM recurring_absences
        WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to >= ?)`)
        .all(addDays(weekStart, 4), weekStart);
    return rows.map((row) => {
        const date = addDays(weekStart, row.weekday - 1);
        return {
            employeeId: row.employee_id,
            startDate: date,
            endDate: date,
            status: 'approved',
            halfDay: null,
        };
    });
}
/** Baut die Eingabe fuer den Scheduler aus dem Datenbestand. */
function buildPlanInput(db, weekStart, plan) {
    const settings = readPracticeSettings(db);
    const weekEnd = addDays(weekStart, 6);
    const year = Number(weekStart.slice(0, 4));
    const employees = listEmployees(db)
        .filter((employee) => planForStaffType(employee.staffType) === plan)
        .map((employee) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        staffType: employee.staffType,
        isPcm: employee.isPcm,
        canHomeoffice: employee.canHomeoffice,
        skillIds: employee.skillIds,
        workTimes: employee.workTimes,
        targetHoursPerWeek: employee.targetHoursPerWeek,
        sortOrder: employee.sortOrder,
    }));
    // Praxis-Schliesszeiten zaehlen wie Feiertage: an ihnen wird nicht geplant.
    const closed = closedDateSet(settings.holidays, year - 1, year + 1);
    for (const row of db
        .prepare(`SELECT start_date, end_date FROM closures WHERE start_date <= ? AND end_date >= ?`)
        .all(weekEnd, weekStart)) {
        for (let date = row.start_date; date <= row.end_date; date = addDays(date, 1)) {
            closed.add(date);
        }
    }
    // Die PCM haelt Sprechstunde im Aerzteplan und faellt dort aus dem
    // MFA-Pool. Deshalb muss der Aerzteplan zuerst stehen.
    const pcmBusy = plan === 'mfa'
        ? listAssignments(db, weekStart, weekEnd, 'doctor')
            .filter((assignment) => employees.some((e) => e.id === assignment.employeeId && e.isPcm))
            .map((assignment) => ({
            employeeId: assignment.employeeId,
            date: assignment.date,
            dayBlockId: assignment.dayBlockId,
        }))
        : [];
    return {
        weekStart,
        plan,
        dayBlocks: listDayBlocks(db),
        employees,
        workAreas: listWorkAreas(db),
        matrix: listMatrix(db),
        template: listTemplate(db, plan),
        absences: [...absencesFor(db, weekStart, weekEnd), ...recurringAbsencesFor(db, weekStart)],
        pinned: listLockedAssignments(db, weekStart, weekEnd, plan).map((assignment) => ({
            date: assignment.date,
            dayBlockId: assignment.dayBlockId,
            workAreaId: assignment.workAreaId,
            employeeId: assignment.employeeId,
        })),
        closedDates: closed,
        history: historyCounts(db, plan, weekStart, settings.fairnessWeeks),
        pcmBusy,
        weights: settings.weights,
        minOverlapRatio: settings.minOverlapRatio,
    };
}
export function rosterRouter() {
    const router = Router();
    router.get('/', requireAuth, (req, res) => {
        const from = assertIsoDate(String(req.query.from ?? ''));
        const to = assertIsoDate(String(req.query.to ?? ''));
        const parsedPlan = planSchema.safeParse(req.query.plan);
        res.json({
            assignments: listAssignments(req.db, from, to, parsedPlan.success ? parsedPlan.data : undefined),
        });
    });
    /**
     * Erzeugt eine Woche. Mit `dryRun` wird nichts gespeichert - so laesst
     * sich das Ergebnis erst ansehen und dann uebernehmen.
     */
    router.post('/generate', requireAdmin, (req, res) => {
        const { weekStart, plan, dryRun } = parseBody(generateSchema, req.body);
        const monday = startOfISOWeek(assertIsoDate(weekStart));
        const result = generateWeekPlan(buildPlanInput(req.db, monday, plan));
        if (!dryRun) {
            replaceWeek(req.db, plan, monday, addDays(monday, 6), result.assignments);
            writeAudit(req.db, req.user.userId, 'generate', 'roster', `${plan}:${monday}`);
        }
        res.json({
            weekStart: monday,
            plan,
            dryRun: dryRun === true,
            assignments: result.assignments,
            diagnostics: result.diagnostics,
            score: result.score,
        });
    });
    router.post('/assignments', requireAdmin, (req, res) => {
        const input = parseBody(assignmentSchema, req.body);
        const assignment = createAssignment(req.db, {
            date: input.date,
            dayBlockId: input.dayBlockId,
            workAreaId: input.workAreaId,
            employeeId: input.employeeId,
            // Von Hand gesetzte Zuweisungen sind automatisch gesperrt: sonst
            // waeren sie beim naechsten Erzeugen wieder weg.
            isLocked: input.isLocked ?? true,
        });
        if (!assignment) {
            throw badRequest('Diese Person ist in dem Zeitfenster bereits woanders eingeteilt.');
        }
        res.status(201).json({ assignment });
    });
    router.delete('/assignments/:id', requireAdmin, (req, res) => {
        if (!deleteAssignment(req.db, pathParam(req, 'id')))
            throw notFound('Zuweisung nicht gefunden.');
        res.status(204).end();
    });
    router.post('/assignments/:id/lock', requireAdmin, (req, res) => {
        const locked = req.body?.locked !== false;
        const assignment = setAssignmentLock(req.db, pathParam(req, 'id'), locked);
        if (!assignment)
            throw notFound('Zuweisung nicht gefunden.');
        res.json({ assignment });
    });
    return router;
}
export function templateRouter() {
    const router = Router();
    router.get('/:plan', requireAuth, (req, res) => {
        const plan = planSchema.parse(pathParam(req, 'plan'));
        res.json({ entries: listTemplate(req.db, plan) });
    });
    router.put('/:plan', requireAdmin, (req, res) => {
        const plan = planSchema.parse(pathParam(req, 'plan'));
        const { entries } = parseBody(templateSchema, req.body);
        const saved = replaceTemplate(req.db, plan, entries);
        writeAudit(req.db, req.user.userId, 'update', 'template', plan);
        res.json({ entries: saved });
    });
    return router;
}
//# sourceMappingURL=roster.js.map