import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { CSRF_HEADER } from '../config.js';
import type { Db } from '../db/index.js';
import { createEmployee, createTestDb, createUser, readCookie } from '../testing/fixtures.js';
import { createApp } from './app.js';

let db: Db;
let app: Express;

beforeEach(async () => {
  db = createTestDb();
  app = createApp(db);
  await createUser(db, 'chefin', 'ein-langes-passwort', 'admin');
});

afterEach(() => {
  db.close();
});

async function adminAgent() {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/login')
    .send({ username: 'chefin', password: 'ein-langes-passwort' });
  const csrf = readCookie(response.headers['set-cookie'] as string[] | undefined, 'haeppi_csrf');
  return { agent, csrf: csrf ?? '' };
}

const workDay = { isWorking: true, startMin: 480, endMin: 1020, breakMin: 60 };
const fullWeek = { 1: workDay, 2: workDay, 3: workDay, 4: workDay, 5: workDay };

function employeePayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Maria',
    lastName: 'Huber',
    staffType: 'mfa',
    isPcm: false,
    employment: 'fulltime',
    targetHoursPerWeek: 40,
    canHomeoffice: false,
    color: '#3b82f6',
    entryDate: null,
    exitDate: null,
    isActive: true,
    sortOrder: 0,
    notes: '',
    workTimes: fullWeek,
    skillIds: [],
    ...overrides,
  };
}

describe('Mitarbeiter anlegen und ändern', () => {
  it('ist Mitarbeitern verwehrt', async () => {
    const ownId = createEmployee(db, { firstName: 'Sabine', lastName: 'Klein' });
    await createUser(db, 'sabine', 'ein-langes-passwort', 'employee', ownId);

    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'sabine', password: 'ein-langes-passwort' });
    const csrf =
      readCookie(login.headers['set-cookie'] as string[] | undefined, 'haeppi_csrf') ?? '';

    const response = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(employeePayload());
    expect(response.status).toBe(403);
  });

  it('legt eine Person mit Arbeitszeiten an', async () => {
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(employeePayload({ canHomeoffice: true }));

    expect(response.status).toBe(201);
    expect(response.body.employee.lastName).toBe('Huber');
    expect(response.body.employee.canHomeoffice).toBe(true);
    expect(response.body.employee.version).toBe(1);
    expect(response.body.employee.workTimes['3'].breakMin).toBe(60);
  });

  it('weist unsinnige Arbeitszeiten mit einer lesbaren Meldung ab', async () => {
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(
        employeePayload({
          workTimes: {
            ...fullWeek,
            2: { isWorking: true, startMin: 1020, endMin: 480, breakMin: 0 },
          },
        }),
      );

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Arbeitsende');
  });

  it('erhöht die Version bei jeder Änderung', async () => {
    const { agent, csrf } = await adminAgent();
    const created = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(employeePayload());
    const id = created.body.employee.id;

    const updated = await agent
      .put(`/api/employees/${id}`)
      .set(CSRF_HEADER, csrf)
      .send(employeePayload({ lastName: 'Huber-Schmidt' }));

    expect(updated.status).toBe(200);
    expect(updated.body.employee.lastName).toBe('Huber-Schmidt');
    expect(updated.body.employee.version).toBe(2);
  });

  it('verhindert das Überschreiben fremder Änderungen', async () => {
    // Genau der Fall, der in v1 lautlos schiefging: zwei offene Browser.
    const { agent, csrf } = await adminAgent();
    const created = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(employeePayload());
    const id = created.body.employee.id;

    // Der erste Browser speichert.
    await agent
      .put(`/api/employees/${id}`)
      .set(CSRF_HEADER, csrf)
      .set('If-Match', '1')
      .send(employeePayload({ lastName: 'Erste' }));

    // Der zweite Browser hat noch Version 1 geladen.
    const stale = await agent
      .put(`/api/employees/${id}`)
      .set(CSRF_HEADER, csrf)
      .set('If-Match', '1')
      .send(employeePayload({ lastName: 'Zweite' }));

    expect(stale.status).toBe(409);
    expect(stale.body.error).toContain('neu laden');

    // Die erste Änderung steht noch.
    const list = await agent.get('/api/employees');
    expect(list.body.employees[0].lastName).toBe('Erste');
  });

  it('deaktiviert statt zu löschen', async () => {
    const { agent, csrf } = await adminAgent();
    const created = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(employeePayload());
    const id = created.body.employee.id;

    expect((await agent.delete(`/api/employees/${id}`).set(CSRF_HEADER, csrf)).status).toBe(204);

    expect((await agent.get('/api/employees')).body.employees).toHaveLength(0);
    expect((await agent.get('/api/employees?includeInactive=1')).body.employees).toHaveLength(1);
    // Der Datensatz existiert noch - die Historie bleibt erhalten.
    const row = db.prepare('SELECT is_active FROM employees WHERE id = ?').get(id) as {
      is_active: number;
    };
    expect(row.is_active).toBe(0);
  });
});

describe('Arbeitsbereiche', () => {
  it('liefert die geseedeten Bereiche', async () => {
    const { agent } = await adminAgent();
    const response = await agent.get('/api/work-areas');
    expect(response.status).toBe(200);

    const labor = response.body.workAreas.find((a: { name: string }) => a.name === 'Labor');
    expect(labor.isCritical).toBe(true);
    expect(labor.rotationMinPerWeek).toBe(1);
    expect(labor.requiredSkillIds).toEqual(['skl-blutentnahme']);
    // Labor laeuft nur vormittags: fuenf Bloecke, einer je Wochentag.
    expect(labor.blockIds).toHaveLength(5);
  });

  it('lehnt eine Obergrenze unter der Mindestbesetzung ab', async () => {
    const { agent, csrf } = await adminAgent();
    const response = await agent.put('/api/work-areas/wa-anmeldung').set(CSRF_HEADER, csrf).send({
      plan: 'mfa',
      name: 'Anmeldung',
      description: '',
      kind: 'service',
      isCritical: true,
      minStaff: 3,
      maxStaff: 1,
      requiresHomeoffice: false,
      rotationMinPerWeek: null,
      icon: '📋',
      color: '#3b82f6',
      sortOrder: 1,
      isActive: true,
      requiredSkillIds: [],
      blockIds: [],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Obergrenze');
  });

  it('warnt vor dem Löschen eines verplanten Bereichs', async () => {
    const employeeId = createEmployee(db);
    db.prepare(
      `INSERT INTO assignments (id, date, day_block_id, work_area_id, employee_id, source)
       VALUES (?, '2026-08-03', 'blk-1-vm', 'wa-labor', ?, 'manual')`,
    ).run(randomUUID(), employeeId);

    const { agent, csrf } = await adminAgent();
    const blocked = await agent.delete('/api/work-areas/wa-labor').set(CSRF_HEADER, csrf);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toContain('noch verplant');

    // Mit ausdruecklicher Bestaetigung geht es.
    const forced = await agent.delete('/api/work-areas/wa-labor?force=1').set(CSRF_HEADER, csrf);
    expect(forced.status).toBe(204);
  });
});

describe('Zeitmodell', () => {
  it('liefert das geseedete Wochenmodell', async () => {
    const { agent } = await adminAgent();
    const { dayBlocks } = (await agent.get('/api/day-blocks')).body;
    expect(dayBlocks).toHaveLength(13);

    const monday = dayBlocks.filter((b: { weekday: number }) => b.weekday === 1);
    expect(monday.map((b: { startMin: number }) => b.startMin)).toEqual([480, 780, 960]);
    expect(monday[1].kind).toBe('backoffice');
  });

  it('lehnt sich überschneidende Blöcke ab', async () => {
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .put('/api/day-blocks')
      .set(CSRF_HEADER, csrf)
      .send({
        blocks: [
          {
            weekday: 1,
            label: 'Vormittag',
            kind: 'consultation',
            startMin: 480,
            endMin: 780,
            sortOrder: 1,
          },
          {
            weekday: 1,
            label: 'Innendienst',
            kind: 'backoffice',
            startMin: 720,
            endMin: 960,
            sortOrder: 2,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('überschneiden');
    expect(response.body.error).toContain('12:00');
  });

  it('erlaubt aneinandergrenzende Blöcke', async () => {
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .put('/api/day-blocks?force=1')
      .set(CSRF_HEADER, csrf)
      .send({
        blocks: [
          {
            weekday: 1,
            label: 'Vormittag',
            kind: 'consultation',
            startMin: 480,
            endMin: 780,
            sortOrder: 1,
          },
          {
            weekday: 1,
            label: 'Innendienst',
            kind: 'backoffice',
            startMin: 780,
            endMin: 960,
            sortOrder: 2,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.dayBlocks).toHaveLength(2);
  });

  it('warnt, wenn ein Block mit Planung wegfallen würde', async () => {
    const employeeId = createEmployee(db);
    db.prepare(
      `INSERT INTO assignments (id, date, day_block_id, work_area_id, employee_id, source)
       VALUES (?, '2026-08-03', 'blk-1-vm', 'wa-labor', ?, 'manual')`,
    ).run(randomUUID(), employeeId);

    const { agent, csrf } = await adminAgent();
    const response = await agent.put('/api/day-blocks').set(CSRF_HEADER, csrf).send({ blocks: [] });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Vormittag');
    expect(response.body.error).toContain('1 Zuweisungen');
  });

  it('behält beim Speichern die IDs unveränderter Blöcke', async () => {
    const { agent, csrf } = await adminAgent();
    const before = (await agent.get('/api/day-blocks')).body.dayBlocks;

    const response = await agent
      .put('/api/day-blocks')
      .set(CSRF_HEADER, csrf)
      .send({
        blocks: before.map((block: { id: string; label: string }) => ({
          ...block,
          label: `${block.label} `.trim(),
        })),
      });

    expect(response.status).toBe(200);
    // Bleiben die IDs erhalten, ueberleben Musterwoche und Bereichszuordnung.
    expect(response.body.dayBlocks.map((b: { id: string }) => b.id).sort()).toEqual(
      before.map((b: { id: string }) => b.id).sort(),
    );
  });
});

describe('Einsatz-Matrix', () => {
  it('speichert nur abweichende Felder', async () => {
    const { agent, csrf } = await adminAgent();
    const created = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(employeePayload());
    const id = created.body.employee.id;

    const response = await agent
      .put(`/api/employees/${id}/matrix`)
      .set(CSRF_HEADER, csrf)
      .send({
        entries: [
          // Standard - wird nicht gespeichert.
          {
            workAreaId: 'wa-anmeldung',
            clearance: 'solo',
            preference: 'neutral',
            minPerWeek: null,
            maxPerWeek: null,
            exemptRotation: false,
          },
          // Abweichend - wird gespeichert.
          {
            workAreaId: 'wa-labor',
            clearance: 'supervised',
            preference: 'preferred',
            minPerWeek: null,
            maxPerWeek: 2,
            exemptRotation: false,
          },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.entries).toHaveLength(1);
    expect(response.body.entries[0].workAreaId).toBe('wa-labor');
    expect(response.body.entries[0].clearance).toBe('supervised');
    expect(response.body.entries[0].maxPerWeek).toBe(2);
  });

  it('lehnt ein Minimum über dem Maximum ab', async () => {
    const { agent, csrf } = await adminAgent();
    const created = await agent
      .post('/api/employees')
      .set(CSRF_HEADER, csrf)
      .send(employeePayload());

    const response = await agent
      .put(`/api/employees/${created.body.employee.id}/matrix`)
      .set(CSRF_HEADER, csrf)
      .send({
        entries: [
          {
            workAreaId: 'wa-labor',
            clearance: 'solo',
            preference: 'neutral',
            minPerWeek: 3,
            maxPerWeek: 1,
            exemptRotation: false,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Maximum');
  });

  it('ist für Mitarbeiter gesperrt', async () => {
    const ownId = createEmployee(db, { firstName: 'Sabine', lastName: 'Klein' });
    await createUser(db, 'sabine', 'ein-langes-passwort', 'employee', ownId);

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'sabine', password: 'ein-langes-passwort' });
    expect((await agent.get('/api/matrix')).status).toBe(403);
  });
});

describe('Qualifikationen', () => {
  it('warnt beim Löschen einer Pflichtqualifikation', async () => {
    const { agent, csrf } = await adminAgent();
    // VERAH ist Pflicht fuer die Hausbesuche.
    const blocked = await agent.delete('/api/skills/skl-verah').set(CSRF_HEADER, csrf);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toContain('Pflichtvoraussetzung');

    expect(
      (await agent.delete('/api/skills/skl-verah?force=1').set(CSRF_HEADER, csrf)).status,
    ).toBe(204);
  });

  it('lässt eine ungenutzte Qualifikation ohne Rückfrage löschen', async () => {
    const { agent, csrf } = await adminAgent();
    expect((await agent.delete('/api/skills/skl-ekg').set(CSRF_HEADER, csrf)).status).toBe(204);
  });
});

describe('Einstellungen', () => {
  it('liefert Bayern mit Mariä Himmelfahrt als Voreinstellung', async () => {
    const { agent } = await adminAgent();
    const { settings } = (await agent.get('/api/settings')).body;
    expect(settings.holidays.state).toBe('BY');
    expect(settings.holidays.options.assumptionOfMary).toBe(true);
    expect(settings.minOverlapRatio).toBe(0.5);
  });

  it('speichert ein anderes Bundesland', async () => {
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .put('/api/settings/holidays')
      .set(CSRF_HEADER, csrf)
      .send({
        state: 'NW',
        options: { assumptionOfMary: false },
        additionalClosedDates: ['2026-12-24', '2026-12-31'],
      });

    expect(response.status).toBe(200);
    expect(response.body.settings.holidays.state).toBe('NW');
    expect(response.body.settings.holidays.additionalClosedDates).toHaveLength(2);
  });

  it('lehnt ein erfundenes Bundesland ab', async () => {
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .put('/api/settings/holidays')
      .set(CSRF_HEADER, csrf)
      .send({ state: 'XX', options: {}, additionalClosedDates: [] });
    expect(response.status).toBe(400);
  });
});
