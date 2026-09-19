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
let annaId: string;
let bertaId: string;

beforeEach(async () => {
  db = createTestDb();
  app = createApp(db);
  annaId = createEmployee(db, { firstName: 'Anna', lastName: 'Krank' });
  bertaId = createEmployee(db, { firstName: 'Berta', lastName: 'Kollegin' });
  await createUser(db, 'chefin', 'ein-langes-passwort', 'admin');
  await createUser(db, 'anna', 'ein-langes-passwort', 'employee', annaId);
  await createUser(db, 'berta', 'ein-langes-passwort', 'employee', bertaId);

  // Anna ist krank - eine Gesundheitsangabe.
  db.prepare(
    `INSERT INTO absences (id, employee_id, start_date, end_date, type, status, note)
     VALUES (?, ?, '2026-08-03', '2026-08-05', 'sick', 'approved', 'Grippaler Infekt')`,
  ).run(randomUUID(), annaId);
});

afterEach(() => {
  db.close();
});

async function login(username: string) {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/login')
    .send({ username, password: 'ein-langes-passwort' });
  const csrf = readCookie(response.headers['set-cookie'] as string[] | undefined, 'haeppi_csrf');
  return { agent, csrf: csrf ?? '' };
}

const range = '?from=2026-08-01&to=2026-08-31';

describe('Abwesenheitsgründe', () => {
  it('liefert der Praxisleitung alles', async () => {
    const { agent } = await login('chefin');
    const { body } = await agent.get(`/api/absences${range}`);

    expect(body.absences).toHaveLength(1);
    expect(body.absences[0].type).toBe('sick');
    expect(body.absences[0].note).toBe('Grippaler Infekt');
  });

  it('liefert der betroffenen Person ihre eigenen Angaben', async () => {
    const { agent } = await login('anna');
    const { body } = await agent.get(`/api/absences${range}`);

    expect(body.absences[0].type).toBe('sick');
    expect(body.absences[0].note).toBe('Grippaler Infekt');
  });

  it('liefert Kolleginnen den Grund gar nicht erst aus', async () => {
    // Das ist der entscheidende Test: nicht "ausgeblendet", sondern
    // nicht vorhanden. Ein UI-Test wuerde das nicht absichern.
    const { agent } = await login('berta');
    const response = await agent.get(`/api/absences${range}`);

    expect(response.status).toBe(200);
    expect(response.body.absences).toHaveLength(1);

    const absence = response.body.absences[0];
    expect(absence.employeeId).toBe(annaId);
    expect(absence.startDate).toBe('2026-08-03');
    expect(absence.endDate).toBe('2026-08-05');

    expect(absence.type).toBeUndefined();
    expect(absence.note).toBeUndefined();
    expect(absence.status).toBeUndefined();

    // Auch im rohen Antworttext darf nichts davon auftauchen.
    expect(JSON.stringify(response.body)).not.toContain('sick');
    expect(JSON.stringify(response.body)).not.toContain('Grippaler');
  });

  it('gibt Kolleginnen genau die vier unbedenklichen Felder', async () => {
    const { agent } = await login('berta');
    const { body } = await agent.get(`/api/absences${range}`);
    expect(Object.keys(body.absences[0]).sort()).toEqual([
      'employeeId',
      'endDate',
      'halfDay',
      'id',
      'startDate',
    ]);
  });
});

describe('Selbstverwaltung', () => {
  it('lässt Mitarbeiter Urlaub beantragen, aber nicht selbst genehmigen', async () => {
    const { agent, csrf } = await login('berta');
    const response = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: bertaId,
      startDate: '2026-09-07',
      endDate: '2026-09-11',
      type: 'vacation',
      note: 'Herbstferien',
    });

    expect(response.status).toBe(201);
    expect(response.body.absence.status).toBe('requested');
  });

  it('lässt eine Krankmeldung sofort gelten', async () => {
    // Eine Krankmeldung ist keine Bitte - sie muss den Plan sofort ändern.
    const { agent, csrf } = await login('berta');
    const response = await agent
      .post('/api/absences')
      .set(CSRF_HEADER, csrf)
      .send({ employeeId: bertaId, startDate: '2026-08-10', endDate: '2026-08-10', type: 'sick' });

    expect(response.body.absence.status).toBe('approved');
  });

  it('verhindert Einträge für fremde Personen', async () => {
    const { agent, csrf } = await login('berta');
    const response = await agent
      .post('/api/absences')
      .set(CSRF_HEADER, csrf)
      .send({ employeeId: annaId, startDate: '2026-08-10', endDate: '2026-08-10', type: 'sick' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('eigene Person');
  });

  it('lässt Mitarbeiter keine Fortbildung eintragen', async () => {
    const { agent, csrf } = await login('berta');
    const response = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: bertaId,
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      type: 'training',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Praxisleitung');
  });

  it('trägt für die Praxisleitung sofort genehmigt ein', async () => {
    const { agent, csrf } = await login('chefin');
    const response = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: bertaId,
      startDate: '2026-08-10',
      endDate: '2026-08-14',
      type: 'vacation',
    });

    expect(response.body.absence.status).toBe('approved');
  });

  it('lässt genehmigten Urlaub nicht von der Person selbst zurücknehmen', async () => {
    const { agent, csrf } = await login('chefin');
    const created = await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: bertaId,
      startDate: '2026-08-10',
      endDate: '2026-08-14',
      type: 'vacation',
    });

    const berta = await login('berta');
    const response = await berta.agent
      .delete(`/api/absences/${created.body.absence.id}`)
      .set(CSRF_HEADER, berta.csrf);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Praxisleitung');
  });

  it('zeigt der Praxisleitung die offenen Anträge', async () => {
    const berta = await login('berta');
    await berta.agent.post('/api/absences').set(CSRF_HEADER, berta.csrf).send({
      employeeId: bertaId,
      startDate: '2026-09-07',
      endDate: '2026-09-11',
      type: 'vacation',
    });

    const { agent } = await login('chefin');
    expect((await agent.get('/api/absences/open-requests')).body.count).toBe(1);
  });

  it('verwehrt Mitarbeitern die Antragsübersicht', async () => {
    const { agent } = await login('berta');
    expect((await agent.get('/api/absences/open-requests')).status).toBe(403);
  });
});

describe('Urlaubskonto', () => {
  it('rechnet Feiertage nicht auf den Urlaub an', async () => {
    const { agent, csrf } = await login('chefin');
    await agent
      .put(`/api/absences/vacation/${bertaId}`)
      .set(CSRF_HEADER, csrf)
      .send({ year: 2026, entitlement: 30, carryover: 0 });

    // Pfingstwoche 2026: Montag 25.05. ist Pfingstmontag.
    await agent.post('/api/absences').set(CSRF_HEADER, csrf).send({
      employeeId: bertaId,
      startDate: '2026-05-25',
      endDate: '2026-05-29',
      type: 'vacation',
    });

    const { body } = await agent.get(`/api/absences/vacation/${bertaId}?year=2026`);
    // Fünf Werktage minus Pfingstmontag = vier Urlaubstage.
    expect(body.balance.used).toBe(4);
    expect(body.balance.remaining).toBe(26);
  });

  it('verwehrt den Blick in fremde Urlaubskonten', async () => {
    const { agent } = await login('berta');
    const response = await agent.get(`/api/absences/vacation/${annaId}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('fremde');
  });

  it('erlaubt den Blick ins eigene Konto', async () => {
    const { agent } = await login('berta');
    expect((await agent.get(`/api/absences/vacation/${bertaId}`)).status).toBe(200);
  });
});
