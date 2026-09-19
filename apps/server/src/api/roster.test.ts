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
const TUESDAY = '2026-08-04';

interface PlannedRow {
  date: string;
  dayBlockId: string;
  workAreaId: string;
  employeeId: string;
  source: string;
  reason: string;
}

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
  staffType?: 'doctor' | 'pcm' | 'mfa' | 'trainee';
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
       (id, first_name, last_name, staff_type, employment, target_hours_week,
        can_homeoffice, sort_order)
     VALUES (?, ?, 'Test', ?, 'fulltime', 40, ?, ?)`,
  ).run(
    id,
    name,
    options.staffType ?? 'mfa',
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

async function generate(
  agent: ReturnType<typeof request.agent>,
  csrf: string,
  body: Record<string, unknown> = {},
): Promise<{ status: number; assignments: PlannedRow[]; body: Record<string, unknown> }> {
  const response = await agent
    .post('/api/roster/generate')
    .set(CSRF_HEADER, csrf)
    .send({ weekStart: MONDAY, ...body });
  const results = (response.body.results ?? []) as { assignments: PlannedRow[] }[];
  return {
    status: response.status,
    assignments: results[0]?.assignments ?? [],
    body: response.body as Record<string, unknown>,
  };
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
      .send({ weekStart: MONDAY });
    expect(response.status).toBe(403);
  });

  it('besetzt die kritischen Bereiche der Praxis-Vorlage', async () => {
    person('Anna', { sortOrder: 1 });
    person('Bea', { sortOrder: 2 });
    person('Clara', { sortOrder: 3 });
    person('Dora', { sortOrder: 4 });

    const { agent, csrf } = await adminAgent();
    const { status, assignments } = await generate(agent, csrf);

    expect(status).toBe(200);
    expect(assignments.length).toBeGreaterThan(0);

    // Montag Vormittag: Anmeldung braucht 2, Labor 1, Telefon 1.
    const montagVormittag = assignments.filter(
      (a) => a.date === MONDAY && a.dayBlockId === 'blk-1-vm',
    );
    const proBereich = new Map<string, number>();
    for (const a of montagVormittag) {
      proBereich.set(a.workAreaId, (proBereich.get(a.workAreaId) ?? 0) + 1);
    }
    expect(proBereich.get('wa-anmeldung')).toBeGreaterThanOrEqual(2);
    expect(proBereich.get('wa-labor')).toBe(1);
    expect(proBereich.get('wa-telefon')).toBe(1);
  });

  it('plant alle Gruppen in einem Lauf', async () => {
    person('Anna', { sortOrder: 1 });
    person('Bea', { sortOrder: 2 });
    person('Heidi', { staffType: 'pcm', sortOrder: 3 });
    person('Dr. Rasche', { staffType: 'doctor', sortOrder: 4 });

    const { agent, csrf } = await adminAgent();
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const areas = new Set(assignments.map((a) => a.workAreaId));
    expect(areas.has('wa-anmeldung')).toBe(true);
    expect(areas.has('wa-pcm-sprechstunde')).toBe(true);
    expect([...areas].some((id) => id.startsWith('wa-zimmer'))).toBe(true);
  });

  it('gibt der Ärztin vormittags ein Zimmer und mittags die Infektsprechstunde', async () => {
    person('Dr. Rasche', { staffType: 'doctor', sortOrder: 1 });

    const { agent, csrf } = await adminAgent();
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const montag = assignments.filter((a) => a.date === MONDAY);
    expect(montag.find((a) => a.dayBlockId === 'blk-doc-1-fr')?.workAreaId).toMatch(/wa-zimmer/);
    expect(montag.find((a) => a.dayBlockId === 'blk-doc-1-iv')?.workAreaId).toBe('wa-infekt');
  });

  it('hält die Zimmergrenze von vier ein', async () => {
    for (let n = 1; n <= 6; n++) person(`Arzt${n}`, { staffType: 'doctor', sortOrder: n });

    const { agent, csrf } = await adminAgent();
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const frueh = assignments.filter((a) => a.date === MONDAY && a.dayBlockId === 'blk-doc-1-fr');
    expect(frueh).toHaveLength(4);
  });

  it('plant mehrere Wochen auf einmal', async () => {
    person('Anna');
    const { agent, csrf } = await adminAgent();
    const { body } = await generate(agent, csrf, { weeks: 3 });
    const results = body.results as { weekStart: string }[];
    expect(results.map((r) => r.weekStart)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17']);

    const saved = await agent.get(`/api/roster?from=2026-08-17&to=2026-08-21`);
    expect(saved.body.assignments.length).toBeGreaterThan(0);
  });

  it('bewahrt die Auswertung des letzten Laufs auf', async () => {
    person('Anna');
    const { agent, csrf } = await adminAgent();
    await generate(agent, csrf);

    const run = await agent.get(`/api/roster/runs/${MONDAY}`);
    expect(run.status).toBe(200);
    expect(run.body.run.weekStart).toBe(MONDAY);
    // Mit einer Person bleiben Pflichtplaetze offen - das steht in der Auswertung.
    expect(
      run.body.run.diagnostics.some((d: { kind: string }) => d.kind === 'unfilled_required'),
    ).toBe(true);
  });
});

describe('PCM als eigene Gruppe', () => {
  it('hält die PCM aus dem MFA-Pool und gibt ihr die PCM-Sprechstunde', async () => {
    const pcmId = person('Petra', { staffType: 'pcm', sortOrder: 1 });
    person('Anna', { sortOrder: 2 });

    const { agent, csrf } = await adminAgent();
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const petra = assignments.filter((a) => a.employeeId === pcmId);
    expect(petra.length).toBeGreaterThan(0);
    expect(petra.every((a) => a.workAreaId.startsWith('wa-pcm-'))).toBe(true);
  });

  it('lässt sie mit Freigabe in der Matrix in einem MFA-Bereich aushelfen', async () => {
    const pcmId = person('Petra', { staffType: 'pcm', sortOrder: 1 });
    db.prepare(
      `INSERT INTO employee_area_matrix (employee_id, work_area_id, clearance, preference)
       VALUES (?, 'wa-anmeldung', 'solo', 'preferred')`,
    ).run(pcmId);

    const { agent, csrf } = await adminAgent();
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    // Niemand sonst da: die Anmeldung ist Pflicht, die PCM-Sprechstunde nicht.
    const montagVormittag = assignments.filter(
      (a) => a.date === MONDAY && a.employeeId === pcmId && a.dayBlockId === 'blk-1-vm',
    );
    expect(montagVormittag.map((a) => a.workAreaId)).toEqual(['wa-anmeldung']);
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

    await generate(agent, csrf);

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

  it('erkennt Überschneidungen zwischen verschieden geschnittenen Blöcken', async () => {
    const heidiId = person('Heidi', { staffType: 'pcm' });
    const { agent, csrf } = await adminAgent();

    // PCM-Vormittag 08-13 ...
    await agent.post('/api/roster/assignments').set(CSRF_HEADER, csrf).send({
      date: MONDAY,
      dayBlockId: 'blk-pcm-1-vm',
      workAreaId: 'wa-pcm-sprechstunde',
      employeeId: heidiId,
    });
    // ... und gleichzeitig MFA-Vormittag 08-13 in einem anderen Block.
    const clash = await agent.post('/api/roster/assignments').set(CSRF_HEADER, csrf).send({
      date: MONDAY,
      dayBlockId: 'blk-1-vm',
      workAreaId: 'wa-anmeldung',
      employeeId: heidiId,
    });
    expect(clash.status).toBe(400);
  });
});

describe('Musterwoche', () => {
  it('wird gespeichert und beim Erzeugen befolgt', async () => {
    const annaId = person('Anna', { sortOrder: 9 });
    person('Bea', { sortOrder: 1 });

    const { agent, csrf } = await adminAgent();
    const gespeichert = await agent
      .put('/api/templates')
      .set(CSRF_HEADER, csrf)
      .send({
        entries: [{ employeeId: annaId, workAreaId: 'wa-labor', dayBlockId: 'blk-1-vm' }],
      });
    expect(gespeichert.status).toBe(200);
    expect(gespeichert.body.entries).toHaveLength(1);

    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const labor = assignments.find(
      (a) => a.workAreaId === 'wa-labor' && a.dayBlockId === 'blk-1-vm' && a.date === MONDAY,
    );
    expect(labor?.employeeId).toBe(annaId);
    expect(labor?.source).toBe('template');
    expect(labor?.reason).toContain('Musterwoche');
  });

  it('lässt sich aus einer geplanten Woche übernehmen', async () => {
    person('Anna', { sortOrder: 1 });
    person('Bea', { sortOrder: 2 });
    const { agent, csrf } = await adminAgent();
    await generate(agent, csrf);

    const response = await agent
      .post('/api/templates/from-week')
      .set(CSRF_HEADER, csrf)
      .send({ weekStart: MONDAY });
    expect(response.status).toBe(200);
    expect(response.body.entries.length).toBeGreaterThan(0);

    const template = await agent.get('/api/templates');
    expect(template.body.entries.length).toBe(response.body.entries.length);
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
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const annaTage = assignments.filter((a) => a.employeeId === annaId).map((a) => a.date);

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
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const tage = assignments.filter((a) => a.employeeId === azubiId).map((a) => a.date);
    // Dienstag ist Berufsschule.
    expect(tage).not.toContain('2026-08-04');
    expect(tage).toContain(MONDAY);
  });

  it('sperrt bei einem halben Tag nur die Tageshälfte', async () => {
    const annaId = person('Anna', { sortOrder: 1 });
    db.prepare(
      `INSERT INTO absences (id, employee_id, start_date, end_date, type, status, half_day)
       VALUES (?, ?, ?, ?, 'timeoff', 'approved', 'am')`,
    ).run(randomUUID(), annaId, MONDAY, MONDAY);

    const { agent, csrf } = await adminAgent();
    const { assignments } = await generate(agent, csrf, { dryRun: true });

    const montag = assignments.filter((a) => a.employeeId === annaId && a.date === MONDAY);
    expect(montag.some((a) => a.dayBlockId === 'blk-1-vm')).toBe(false);
    expect(montag.some((a) => a.dayBlockId === 'blk-1-nm')).toBe(true);
  });
});

describe('Umplanung bei Ausfall', () => {
  async function plannedWeek() {
    const annaId = person('Anna', { sortOrder: 1 });
    const beaId = person('Bea', { sortOrder: 2 });
    const claraId = person('Clara', { sortOrder: 3 });
    const doraId = person('Dora', { sortOrder: 4 });
    const { agent, csrf } = await adminAgent();
    await generate(agent, csrf);
    return { agent, csrf, annaId, beaId, claraId, doraId };
  }

  it('ändert den Plan nicht von selbst, sondern legt einen Vorschlag vor', async () => {
    const { agent, csrf, annaId } = await plannedWeek();
    const before = (await agent.get(`/api/roster?from=${MONDAY}&to=${TUESDAY}`)).body.assignments;

    const krank = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: annaId,
      startDate: MONDAY,
      endDate: TUESDAY,
      type: 'sick',
    });
    expect(krank.status).toBe(201);
    expect(krank.body.proposals).toHaveLength(1);

    // Der Plan selbst ist unveraendert.
    const after = (await agent.get(`/api/roster?from=${MONDAY}&to=${TUESDAY}`)).body.assignments;
    expect(after).toEqual(before);

    const proposal = krank.body.proposals[0];
    expect(proposal.status).toBe('open');
    expect(proposal.title).toContain('Anna');
    expect(
      proposal.changes.some(
        (c: { kind: string; employeeId: string }) =>
          c.kind === 'removed' && c.employeeId === annaId,
      ),
    ).toBe(true);
    // Anna faellt Mo+Di weg, der Rest der Woche bleibt.
    expect(proposal.changes.every((c: { date: string }) => c.date <= TUESDAY)).toBe(true);

    const open = await agent.get('/api/roster/proposals');
    expect(open.body.openCount).toBe(1);
  });

  it('übernimmt den Vorschlag erst auf Bestätigung', async () => {
    const { agent, csrf, annaId } = await plannedWeek();
    const krank = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: annaId,
      startDate: MONDAY,
      endDate: MONDAY,
      type: 'sick',
    });
    const proposalId = krank.body.proposals[0].id as string;

    const applied = await agent
      .post(`/api/roster/proposals/${proposalId}/apply`)
      .set(CSRF_HEADER, csrf);
    expect(applied.status).toBe(200);
    expect(applied.body.proposal.status).toBe('applied');

    const week = (await agent.get(`/api/roster?from=${MONDAY}&to=${MONDAY}`)).body
      .assignments as PlannedRow[];
    expect(week.some((a) => a.employeeId === annaId)).toBe(false);
    // Was nicht betroffen war, ist "beibehalten".
    expect(week.some((a) => a.source === 'kept')).toBe(true);

    // Ein zweites Mal geht nicht.
    const again = await agent
      .post(`/api/roster/proposals/${proposalId}/apply`)
      .set(CSRF_HEADER, csrf);
    expect(again.status).toBe(404);
  });

  it('lässt sich verwerfen, der Plan bleibt dann wie er war', async () => {
    const { agent, csrf, annaId } = await plannedWeek();
    const krank = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: annaId,
      startDate: MONDAY,
      endDate: MONDAY,
      type: 'sick',
    });
    const proposalId = krank.body.proposals[0].id as string;

    const discarded = await agent
      .post(`/api/roster/proposals/${proposalId}/discard`)
      .set(CSRF_HEADER, csrf);
    expect(discarded.body.proposal.status).toBe('discarded');

    const week = (await agent.get(`/api/roster?from=${MONDAY}&to=${MONDAY}`)).body
      .assignments as PlannedRow[];
    expect(week.some((a) => a.employeeId === annaId)).toBe(true);
  });

  it('erzeugt keinen Vorschlag für Wochen ohne Plan', async () => {
    const annaId = person('Anna');
    const { agent, csrf } = await adminAgent();
    const krank = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: annaId,
      startDate: MONDAY,
      endDate: MONDAY,
      type: 'sick',
    });
    expect(krank.body.proposals).toEqual([]);
  });

  it('behält bei "replan" die bisherige Woche und füllt nur Lücken', async () => {
    const { agent, csrf, annaId } = await plannedWeek();
    const before = (await agent.get(`/api/roster?from=${MONDAY}&to=${MONDAY}`)).body
      .assignments as PlannedRow[];
    db.prepare(
      `INSERT INTO absences (id, employee_id, start_date, end_date, type, status)
       VALUES (?, ?, ?, ?, 'sick', 'approved')`,
    ).run(randomUUID(), annaId, MONDAY, MONDAY);

    const { assignments } = await generate(agent, csrf, { mode: 'replan', dryRun: true });
    const montag = assignments.filter((a) => a.date === MONDAY);
    const kept = montag.filter((a) => a.source === 'kept');
    // Alle, die nicht Anna sind, stehen unveraendert.
    expect(kept.length).toBe(before.filter((a) => a.employeeId !== annaId).length);
  });
});

describe('Antragsprüfung', () => {
  it('zeigt, an welchen Tagen es eng wird', async () => {
    const annaId = person('Anna', { sortOrder: 1 });
    person('Bea', { sortOrder: 2 });
    person('Clara', { sortOrder: 3 });
    person('Dora', { sortOrder: 4 });

    const { agent } = await adminAgent();
    const response = await agent.get(
      `/api/absences/check?employeeId=${annaId}&startDate=${MONDAY}&endDate=${TUESDAY}`,
    );
    expect(response.status).toBe(200);
    const check = response.body.check;
    expect(check.plan).toBe('mfa');
    expect(check.days).toHaveLength(2);
    // Anmeldung 2 + Labor 1 + Telefon 1 = 4 noetig, 3 bleiben.
    expect(check.days[0].required).toBe(4);
    expect(check.days[0].present).toBe(3);
    expect(check.criticalDays).toBe(2);
  });

  it('ist für fremde Personen gesperrt', async () => {
    const ownId = person('Sabine');
    const otherId = person('Andere');
    await createUser(db, 'sabine', 'ein-langes-passwort', 'employee', ownId);
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'sabine', password: 'ein-langes-passwort' });

    const own = await agent.get(
      `/api/absences/check?employeeId=${ownId}&startDate=${MONDAY}&endDate=${MONDAY}`,
    );
    expect(own.status).toBe(200);
    const other = await agent.get(
      `/api/absences/check?employeeId=${otherId}&startDate=${MONDAY}&endDate=${MONDAY}`,
    );
    expect(other.status).toBe(400);
  });
});

describe('Schließzeiten', () => {
  it('verteilt Notbesetzung und Urlaub erst nach Bestätigung', async () => {
    const annaId = person('Anna', { sortOrder: 1 });
    const beaId = person('Bea', { sortOrder: 2 });
    person('Dr. Rasche', { staffType: 'doctor', sortOrder: 3 });

    const { agent, csrf } = await adminAgent();
    const created = await agent.post('/api/closures').set(CSRF_HEADER, csrf).send({
      startDate: '2026-12-21',
      endDate: '2026-12-31',
      description: 'Weihnachten',
      prepDays: 2,
      prepStaff: 1,
    });
    expect(created.status).toBe(201);
    const closureId = created.body.closure.id as string;

    const preview = await agent
      .post(`/api/closures/${closureId}/plan`)
      .set(CSRF_HEADER, csrf)
      .send({ dryRun: true });
    expect(preview.body.applied).toBe(false);
    expect(preview.body.plan.duties).toHaveLength(2);
    expect(
      preview.body.plan.duties.every((d: { employeeId: string }) => d.employeeId === annaId),
    ).toBe(true);

    // Vorschau aendert nichts.
    const nothing = await agent.get(`/api/absences?from=2026-12-21&to=2026-12-31`);
    expect(nothing.body.absences).toHaveLength(0);

    const applied = await agent
      .post(`/api/closures/${closureId}/plan`)
      .set(CSRF_HEADER, csrf)
      .send({});
    expect(applied.body.applied).toBe(true);

    const duties = await agent.get(`/api/closures/${closureId}/duties`);
    expect(duties.body.duties).toHaveLength(2);

    const absences = (await agent.get(`/api/absences?from=2026-12-21&to=2026-12-31`)).body
      .absences as { employeeId: string; type: string; status: string; note: string }[];
    const bea = absences.filter((a) => a.employeeId === beaId);
    expect(bea).toHaveLength(1);
    expect(bea[0]?.type).toBe('vacation');
    expect(bea[0]?.status).toBe('approved');
    expect(bea[0]?.note).toContain('Weihnachten');
    // Die Aerztin bleibt aussen vor.
    expect(absences.every((a) => [annaId, beaId].includes(a.employeeId))).toBe(true);
  });

  it('genehmigt beim Verteilen die offenen Urlaubswünsche im Zeitraum', async () => {
    const annaId = person('Anna', { sortOrder: 1 });
    person('Bea', { sortOrder: 2 });
    db.prepare(
      `INSERT INTO absences (id, employee_id, start_date, end_date, type, status)
       VALUES (?, ?, '2026-12-28', '2027-01-03', 'vacation', 'requested')`,
    ).run(randomUUID(), annaId);

    const { agent, csrf } = await adminAgent();
    const created = await agent.post('/api/closures').set(CSRF_HEADER, csrf).send({
      startDate: '2026-12-21',
      endDate: '2026-12-31',
      prepDays: 2,
      prepStaff: 1,
    });
    await agent
      .post(`/api/closures/${created.body.closure.id}/plan`)
      .set(CSRF_HEADER, csrf)
      .send({});

    const anna = (await agent.get(`/api/absences?from=2026-12-21&to=2027-01-03`)).body.absences as {
      employeeId: string;
      status: string;
      startDate: string;
    }[];
    const wish = anna.find((a) => a.employeeId === annaId && a.startDate === '2026-12-28');
    expect(wish?.status).toBe('approved');
  });
});
