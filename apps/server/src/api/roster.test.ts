import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { CSRF_HEADER } from '../config.js';
import type { Db } from '../db/index.js';
import { createTestDb, createUser, readCookie } from '../testing/fixtures.js';
import { createApp } from './app.js';

let db: Db;
let app: Express;

/** KW 32/2026, Montag. */
const MONDAY = '2026-08-03';

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

interface PersonOptions {
  staffType?: 'doctor' | 'mfa' | 'trainee';
  isPcm?: boolean;
  canHomeoffice?: boolean;
  skills?: string[];
  start?: number;
  end?: number;
  sortOrder?: number;
}

function person(name: string, options: PersonOptions = {}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO employees
       (id, first_name, last_name, staff_type, is_pcm, employment, target_hours_week,
        can_homeoffice, sort_order)
     VALUES (?, ?, 'Test', ?, ?, 'fulltime', 40, ?, ?)`,
  ).run(
    id,
    name,
    options.staffType ?? 'mfa',
    options.isPcm ? 1 : 0,
    options.canHomeoffice ? 1 : 0,
    options.sortOrder ?? 0,
  );

  const insert = db.prepare(
    `INSERT INTO employee_worktimes (employee_id, weekday, is_working, start_min, end_min, break_min)
     VALUES (?, ?, 1, ?, ?, 60)`,
  );
  for (const weekday of [1, 2, 3, 4, 5]) {
    insert.run(id, weekday, options.start ?? 480, options.end ?? 1080);
  }

  const skill = db.prepare(`INSERT INTO employee_skills (employee_id, skill_id) VALUES (?, ?)`);
  for (const skillId of options.skills ?? ['skl-blutentnahme']) skill.run(id, skillId);

  return id;
}

describe('Wochenplan erzeugen', () => {
  it('ist Mitarbeitern verwehrt', async () => {
    const ownId = person('Sabine');
    await createUser(db, 'sabine', 'ein-langes-passwort', 'employee', ownId);
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'sabine', password: 'ein-langes-passwort' });
    const csrf =
      readCookie(login.headers['set-cookie'] as string[] | undefined, 'haeppi_csrf') ?? '';

    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa' });
    expect(response.status).toBe(403);
  });

  it('besetzt die kritischen Bereiche der Praxis-Vorlage', async () => {
    person('Anna', { sortOrder: 1 });
    person('Bea', { sortOrder: 2 });
    person('Clara', { sortOrder: 3 });
    person('Dora', { sortOrder: 4 });

    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa' });

    expect(response.status).toBe(200);
    expect(response.body.assignments.length).toBeGreaterThan(0);

    // Montag Vormittag: Anmeldung braucht 2, Labor 1, Notfallzimmer 1.
    const montagVormittag = response.body.assignments.filter(
      (a: { date: string; dayBlockId: string }) => a.date === MONDAY && a.dayBlockId === 'blk-1-vm',
    );
    const proBereich = new Map<string, number>();
    for (const a of montagVormittag as { workAreaId: string }[]) {
      proBereich.set(a.workAreaId, (proBereich.get(a.workAreaId) ?? 0) + 1);
    }
    expect(proBereich.get('wa-anmeldung')).toBeGreaterThanOrEqual(2);
    expect(proBereich.get('wa-labor')).toBe(1);
  });

  it('plant an Feiertagen nicht', async () => {
    person('Anna');
    const { agent, csrf } = await adminAgent();
    // KW 34/2026 enthält Mariä Himmelfahrt nicht (Samstag) - deshalb
    // Pfingstmontag, 25.05.2026.
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: '2026-05-25', plan: 'mfa' });

    const daten = response.body.assignments.map((a: { date: string }) => a.date);
    expect(daten).not.toContain('2026-05-25');
    expect(daten).toContain('2026-05-26');
  });

  it('speichert im Probelauf nichts', async () => {
    person('Anna');
    const { agent, csrf } = await adminAgent();

    const dryRun = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa', dryRun: true });

    expect(dryRun.body.assignments.length).toBeGreaterThan(0);
    expect(dryRun.body.dryRun).toBe(true);

    const gespeichert = await agent.get(`/api/roster?from=${MONDAY}&to=2026-08-09`);
    expect(gespeichert.body.assignments).toHaveLength(0);
  });

  it('liefert eine Diagnose mit Ablehnungsgründen', async () => {
    // Niemand angelegt: alle Pflichtplätze bleiben leer.
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa', dryRun: true });

    const labor = response.body.diagnostics.find(
      (d: { kind: string; message: string }) =>
        d.kind === 'unfilled_required' && d.message.includes('Labor'),
    );
    expect(labor).toBeDefined();
    expect(labor.severity).toBe('error');
    expect(labor.message).toContain('unbesetzt');
  });

  it('erkennt eine fehlende VERAH-Qualifikation als Grund', async () => {
    person('Anna', { skills: ['skl-blutentnahme'] });
    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa', dryRun: true });

    // Hausbesuche haben minStaff 0, also keine Warnung - aber Anna darf dort
    // auch nicht landen.
    const hausbesuche = response.body.assignments.filter(
      (a: { workAreaId: string }) => a.workAreaId === 'wa-hausbesuche',
    );
    expect(hausbesuche).toHaveLength(0);
  });

  it('lässt nur Berechtigte ins Homeoffice', async () => {
    person('Ohne', { canHomeoffice: false, sortOrder: 1 });
    person('Mit', { canHomeoffice: true, sortOrder: 2 });

    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa', dryRun: true });

    const homeoffice = response.body.assignments.filter(
      (a: { workAreaId: string }) => a.workAreaId === 'wa-homeoffice',
    );
    const ids = new Set(homeoffice.map((a: { employeeId: string }) => a.employeeId));
    const ohne = db.prepare(`SELECT id FROM employees WHERE first_name = 'Ohne'`).get() as {
      id: string;
    };
    expect(ids.has(ohne.id)).toBe(false);
  });

  it('ersetzt beim zweiten Lauf, statt zu verdoppeln', async () => {
    person('Anna');
    const { agent, csrf } = await adminAgent();

    for (let run = 0; run < 2; run++) {
      await agent
        .post('/api/roster/generate')
        .set(CSRF_HEADER, csrf)
        .send({ weekStart: MONDAY, plan: 'mfa' });
    }

    const alle = await agent.get(`/api/roster?from=${MONDAY}&to=2026-08-09&plan=mfa`);
    const schluessel = alle.body.assignments.map(
      (a: { date: string; dayBlockId: string; employeeId: string }) =>
        `${a.date}|${a.dayBlockId}|${a.employeeId}`,
    );
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });
});

describe('PCM-Kopplung der beiden Pläne', () => {
  it('sperrt die PCM im MFA-Plan, sobald sie Sprechstunde hat', async () => {
    const pcmId = person('Petra', { isPcm: true, sortOrder: 1 });
    person('Anna', { sortOrder: 2 });
    person('Bea', { sortOrder: 3 });
    person('Clara', { sortOrder: 4 });

    const { agent, csrf } = await adminAgent();

    // Die PCM hält Montagvormittag Sprechstunde in Zimmer 1.
    const sprechstunde = await agent.post('/api/roster/assignments').set(CSRF_HEADER, csrf).send({
      date: MONDAY,
      dayBlockId: 'blk-1-vm',
      workAreaId: 'wa-zimmer-1',
      employeeId: pcmId,
    });
    expect(sprechstunde.status).toBe(201);

    const mfa = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa' });

    const montagVormittag = mfa.body.assignments.filter(
      (a: { date: string; dayBlockId: string; employeeId: string }) =>
        a.date === MONDAY && a.dayBlockId === 'blk-1-vm' && a.employeeId === pcmId,
    );
    expect(montagVormittag).toHaveLength(0);

    // Nachmittags ist sie wieder als MFA verfügbar.
    const nachmittags = mfa.body.assignments.filter(
      (a: { date: string; dayBlockId: string; employeeId: string }) =>
        a.date === MONDAY && a.dayBlockId === 'blk-1-nm' && a.employeeId === pcmId,
    );
    expect(nachmittags.length).toBeGreaterThan(0);
  });

  it('hält die Zimmergrenze von vier ein', async () => {
    for (let n = 1; n <= 6; n++) person(`Arzt${n}`, { staffType: 'doctor', sortOrder: n });

    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'doctor', dryRun: true });

    const montagVormittag = response.body.assignments.filter(
      (a: { date: string; dayBlockId: string }) => a.date === MONDAY && a.dayBlockId === 'blk-1-vm',
    );
    expect(montagVormittag).toHaveLength(4);
  });
});

describe('Gesperrte Zuweisungen', () => {
  it('überleben eine Neuberechnung', async () => {
    const annaId = person('Anna', { sortOrder: 9 });
    person('Bea', { sortOrder: 1 });
    person('Clara', { sortOrder: 2 });

    const { agent, csrf } = await adminAgent();
    const created = await agent
      .post('/api/roster/assignments')
      .set(CSRF_HEADER, csrf)
      .send({ date: MONDAY, dayBlockId: 'blk-1-vm', workAreaId: 'wa-labor', employeeId: annaId });
    expect(created.body.assignment.isLocked).toBe(true);

    await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa' });

    const nachher = await agent.get(`/api/roster?from=${MONDAY}&to=${MONDAY}&plan=mfa`);
    const labor = nachher.body.assignments.find(
      (a: { workAreaId: string; dayBlockId: string }) =>
        a.workAreaId === 'wa-labor' && a.dayBlockId === 'blk-1-vm',
    );
    expect(labor.employeeId).toBe(annaId);
    expect(labor.isLocked).toBe(true);
  });

  it('verhindert doppelte Zuweisung im selben Zeitfenster', async () => {
    const annaId = person('Anna');
    const { agent, csrf } = await adminAgent();

    await agent
      .post('/api/roster/assignments')
      .set(CSRF_HEADER, csrf)
      .send({ date: MONDAY, dayBlockId: 'blk-1-vm', workAreaId: 'wa-labor', employeeId: annaId });

    const zweite = await agent.post('/api/roster/assignments').set(CSRF_HEADER, csrf).send({
      date: MONDAY,
      dayBlockId: 'blk-1-vm',
      workAreaId: 'wa-anmeldung',
      employeeId: annaId,
    });

    expect(zweite.status).toBe(400);
    expect(zweite.body.error).toContain('bereits woanders');
  });
});

describe('Musterwoche', () => {
  it('wird gespeichert und beim Erzeugen befolgt', async () => {
    const annaId = person('Anna', { sortOrder: 9 });
    person('Bea', { sortOrder: 1 });

    const { agent, csrf } = await adminAgent();
    const gespeichert = await agent
      .put('/api/templates/mfa')
      .set(CSRF_HEADER, csrf)
      .send({
        entries: [{ employeeId: annaId, workAreaId: 'wa-labor', dayBlockId: 'blk-1-vm' }],
      });
    expect(gespeichert.status).toBe(200);
    expect(gespeichert.body.entries).toHaveLength(1);

    const plan = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa', dryRun: true });

    const labor = plan.body.assignments.find(
      (a: { workAreaId: string; dayBlockId: string; date: string }) =>
        a.workAreaId === 'wa-labor' && a.dayBlockId === 'blk-1-vm' && a.date === MONDAY,
    );
    expect(labor.employeeId).toBe(annaId);
    expect(labor.source).toBe('template');
    expect(labor.reason).toContain('Musterwoche');
  });
});

describe('Abwesenheiten', () => {
  it('werden beim Erzeugen berücksichtigt', async () => {
    const annaId = person('Anna', { sortOrder: 1 });
    person('Bea', { sortOrder: 2 });

    db.prepare(
      `INSERT INTO absences (id, employee_id, start_date, end_date, type, status)
       VALUES (?, ?, ?, ?, 'vacation', 'approved')`,
    ).run(randomUUID(), annaId, MONDAY, '2026-08-04');

    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa', dryRun: true });

    const annaTage = response.body.assignments
      .filter((a: { employeeId: string }) => a.employeeId === annaId)
      .map((a: { date: string }) => a.date);

    expect(annaTage).not.toContain(MONDAY);
    expect(annaTage).not.toContain('2026-08-04');
    expect(annaTage).toContain('2026-08-05');
  });

  it('behandelt Berufsschultage als feste Abwesenheit', async () => {
    const azubiId = person('Tim', { staffType: 'trainee', sortOrder: 1 });
    person('Bea', { sortOrder: 2 });

    db.prepare(
      `INSERT INTO recurring_absences (id, employee_id, weekday, type, valid_from)
       VALUES (?, ?, 2, 'school', '2026-01-01')`,
    ).run(randomUUID(), azubiId);

    const { agent, csrf } = await adminAgent();
    const response = await agent
      .post('/api/roster/generate')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY, plan: 'mfa', dryRun: true });

    const tage = response.body.assignments
      .filter((a: { employeeId: string }) => a.employeeId === azubiId)
      .map((a: { date: string }) => a.date);
    // Dienstag ist Berufsschule.
    expect(tage).not.toContain('2026-08-04');
    expect(tage).toContain(MONDAY);
  });
});
