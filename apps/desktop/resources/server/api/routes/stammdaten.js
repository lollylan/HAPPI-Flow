import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../auth/middleware.js';
import { createEmployee, deactivateEmployee, getEmployee, updateEmployee, } from '../../db/repositories/employees.js';
import { createWorkArea, deleteWorkArea, getWorkArea, listWorkAreas, updateWorkArea, workAreaUsage, } from '../../db/repositories/workAreas.js';
import { createSkill, deleteSkill, getSkill, listSkills, skillUsage, updateSkill, } from '../../db/repositories/skills.js';
import { findBlockConflict, listDayBlocks, replaceDayBlocks, usageOfRemovedBlocks, } from '../../db/repositories/dayBlocks.js';
import { listMatrix, listMatrixForEmployee, replaceMatrixForEmployee, } from '../../db/repositories/matrix.js';
import { SETTING_KEYS, readPracticeSettings, writeSetting, } from '../../db/repositories/settings.js';
import { assertVersion, badRequest, expectedVersion, notFound, parseBody, pathParam, } from '../http.js';
import { dayBlocksInputSchema, employeeInputSchema, holidaySettingsSchema, matrixInputSchema, skillInputSchema, workAreaInputSchema, } from '../schemas.js';
import { writeAudit } from '../audit.js';
export function employeeWriteRouter() {
    const router = Router();
    router.post('/', requireAdmin, (req, res) => {
        const input = parseBody(employeeInputSchema, req.body);
        const employee = createEmployee(req.db, input);
        writeAudit(req.db, req.user.userId, 'create', 'employee', employee.id);
        res.status(201).json({ employee });
    });
    router.put('/:id', requireAdmin, (req, res) => {
        const id = pathParam(req, 'id');
        const current = getEmployee(req.db, id);
        if (!current)
            throw notFound('Diesen Mitarbeiter gibt es nicht.');
        assertVersion(current.version, expectedVersion(req), 'Der Mitarbeiter');
        const input = parseBody(employeeInputSchema, req.body);
        const employee = updateEmployee(req.db, id, input);
        writeAudit(req.db, req.user.userId, 'update', 'employee', id);
        res.json({ employee });
    });
    /** Deaktivieren statt loeschen - die Historie bleibt erhalten. */
    router.delete('/:id', requireAdmin, (req, res) => {
        const id = pathParam(req, 'id');
        if (!deactivateEmployee(req.db, id))
            throw notFound('Diesen Mitarbeiter gibt es nicht.');
        writeAudit(req.db, req.user.userId, 'deactivate', 'employee', id);
        res.status(204).end();
    });
    router.get('/:id/matrix', requireAdmin, (req, res) => {
        res.json({ entries: listMatrixForEmployee(req.db, pathParam(req, 'id')) });
    });
    router.put('/:id/matrix', requireAdmin, (req, res) => {
        const id = pathParam(req, 'id');
        if (!getEmployee(req.db, id))
            throw notFound('Diesen Mitarbeiter gibt es nicht.');
        const { entries } = parseBody(matrixInputSchema, req.body);
        const saved = replaceMatrixForEmployee(req.db, id, entries);
        writeAudit(req.db, req.user.userId, 'update', 'matrix', id);
        res.json({ entries: saved });
    });
    return router;
}
export function workAreasRouter() {
    const router = Router();
    router.get('/', requireAuth, (req, res) => {
        const includeInactive = req.user?.role === 'admin' && req.query.includeInactive === '1';
        res.json({ workAreas: listWorkAreas(req.db, includeInactive) });
    });
    router.post('/', requireAdmin, (req, res) => {
        const input = parseBody(workAreaInputSchema, req.body);
        const workArea = createWorkArea(req.db, input);
        writeAudit(req.db, req.user.userId, 'create', 'workArea', workArea.id);
        res.status(201).json({ workArea });
    });
    router.put('/:id', requireAdmin, (req, res) => {
        const input = parseBody(workAreaInputSchema, req.body);
        const workArea = updateWorkArea(req.db, pathParam(req, 'id'), input);
        if (!workArea)
            throw notFound('Diesen Arbeitsbereich gibt es nicht.');
        writeAudit(req.db, req.user.userId, 'update', 'workArea', workArea.id);
        res.json({ workArea });
    });
    router.get('/:id/usage', requireAdmin, (req, res) => {
        if (!getWorkArea(req.db, pathParam(req, 'id')))
            throw notFound('Diesen Arbeitsbereich gibt es nicht.');
        res.json({ usage: workAreaUsage(req.db, pathParam(req, 'id')) });
    });
    router.delete('/:id', requireAdmin, (req, res) => {
        const id = pathParam(req, 'id');
        const usage = workAreaUsage(req.db, id);
        // Loeschen nimmt per Kaskade alle Zuweisungen mit. Wer das will, muss
        // es ausdruecklich sagen - sonst ist ein halbes Jahr Planung weg.
        if ((usage.assignments > 0 || usage.templateAssignments > 0) && req.query.force !== '1') {
            throw badRequest(`Der Bereich ist noch verplant: ${usage.assignments} Zuweisungen und ` +
                `${usage.templateAssignments} Einträge in der Musterwoche. ` +
                `Zum Löschen bitte ausdrücklich bestätigen.`);
        }
        if (!deleteWorkArea(req.db, id))
            throw notFound('Diesen Arbeitsbereich gibt es nicht.');
        writeAudit(req.db, req.user.userId, 'delete', 'workArea', id);
        res.status(204).end();
    });
    return router;
}
export function skillsRouter() {
    const router = Router();
    router.get('/', requireAuth, (req, res) => {
        res.json({ skills: listSkills(req.db) });
    });
    router.post('/', requireAdmin, (req, res) => {
        const input = parseBody(skillInputSchema, req.body);
        const skill = createSkill(req.db, input);
        writeAudit(req.db, req.user.userId, 'create', 'skill', skill.id);
        res.status(201).json({ skill });
    });
    router.put('/:id', requireAdmin, (req, res) => {
        const input = parseBody(skillInputSchema, req.body);
        const skill = updateSkill(req.db, pathParam(req, 'id'), input);
        if (!skill)
            throw notFound('Diese Qualifikation gibt es nicht.');
        writeAudit(req.db, req.user.userId, 'update', 'skill', skill.id);
        res.json({ skill });
    });
    router.delete('/:id', requireAdmin, (req, res) => {
        const id = pathParam(req, 'id');
        if (!getSkill(req.db, id))
            throw notFound('Diese Qualifikation gibt es nicht.');
        const usage = skillUsage(req.db, id);
        if (usage.workAreas > 0 && req.query.force !== '1') {
            throw badRequest(`Die Qualifikation ist Pflichtvoraussetzung in ${usage.workAreas} Arbeitsbereich(en). ` +
                `Beim Löschen entfällt diese Sperre - bitte ausdrücklich bestätigen.`);
        }
        deleteSkill(req.db, id);
        writeAudit(req.db, req.user.userId, 'delete', 'skill', id);
        res.status(204).end();
    });
    return router;
}
export function dayBlocksRouter() {
    const router = Router();
    router.get('/', requireAuth, (req, res) => {
        res.json({ dayBlocks: listDayBlocks(req.db) });
    });
    /** Das ganze Wochenmodell wird auf einmal ersetzt, nicht Block fuer Block. */
    router.put('/', requireAdmin, (req, res) => {
        const { blocks } = parseBody(dayBlocksInputSchema, req.body);
        const conflict = findBlockConflict(blocks);
        if (conflict)
            throw badRequest(conflict);
        const losing = usageOfRemovedBlocks(req.db, blocks);
        if (losing.length > 0 && req.query.force !== '1') {
            const details = losing
                .map((entry) => `"${entry.label}" (${entry.assignments} Zuweisungen)`)
                .join(', ');
            throw badRequest(`Beim Speichern entfallen Blöcke, an denen noch Planung hängt: ${details}. ` +
                `Bitte ausdrücklich bestätigen.`);
        }
        const dayBlocks = replaceDayBlocks(req.db, blocks);
        writeAudit(req.db, req.user.userId, 'update', 'dayBlocks', null, `${blocks.length} Blöcke`);
        res.json({ dayBlocks });
    });
    return router;
}
export function matrixRouter() {
    const router = Router();
    router.get('/', requireAdmin, (req, res) => {
        res.json({ entries: listMatrix(req.db) });
    });
    return router;
}
export function settingsRouter() {
    const router = Router();
    router.get('/', requireAuth, (req, res) => {
        res.json({ settings: readPracticeSettings(req.db) });
    });
    router.put('/holidays', requireAdmin, (req, res) => {
        const holidays = parseBody(holidaySettingsSchema, req.body);
        writeSetting(req.db, SETTING_KEYS.holidays, holidays);
        writeAudit(req.db, req.user.userId, 'update', 'settings', 'holidays', holidays.state);
        res.json({ settings: readPracticeSettings(req.db) });
    });
    return router;
}
//# sourceMappingURL=stammdaten.js.map