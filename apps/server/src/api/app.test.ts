import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { CSRF_HEADER } from '../config.js';
import type { Db } from '../db/index.js';
import { createEmployee, createTestDb, createUser, readCookie } from '../testing/fixtures.js';
import { createApp } from './app.js';

let db: Db;
let app: Express;

beforeEach(() => {
  db = createTestDb();
  app = createApp(db);
});

afterEach(() => {
  db.close();
});

/** Meldet an und liefert einen Agenten, der Cookies und CSRF-Token mitfuehrt. */
async function login(username: string, password: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ username, password });
  const csrf = readCookie(response.headers['set-cookie'] as string[] | undefined, 'haeppi_csrf');
  return { agent, response, csrf: csrf ?? '' };
}

describe('GET /api/health', () => {
  it('antwortet ohne Anmeldung - die Electron-Hülle pollt hier beim Start', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});

describe('Anmeldung', () => {
  beforeEach(async () => {
    await createUser(db, 'chefin', 'ein-langes-passwort', 'admin');
  });

  it('weist falsche Passwörter ab', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'chefin', password: 'falsch' });
    expect(response.status).toBe(401);
  });

  it('verrät nicht, ob es das Konto überhaupt gibt', async () => {
    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ username: 'gibtesnicht', password: 'irgendwas' });
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'chefin', password: 'falsch' });

    expect(unknownUser.status).toBe(wrongPassword.status);
    expect(unknownUser.body.error).toBe(wrongPassword.body.error);
  });

  it('setzt bei Erfolg ein HttpOnly-Session-Cookie', async () => {
    const { response } = await login('chefin', 'ein-langes-passwort');
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('admin');

    const cookies = (response.headers['set-cookie'] as string[]) ?? [];
    const session = cookies.find((entry) => entry.startsWith('haeppi_session='));
    expect(session).toBeDefined();
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Lax');

    // Das CSRF-Cookie muss lesbar sein, der Client schickt es im Header zurück.
    const csrf = cookies.find((entry) => entry.startsWith('haeppi_csrf='));
    expect(csrf).toBeDefined();
    expect(csrf).not.toContain('HttpOnly');
  });

  it('gibt niemals einen Passwort-Hash heraus', async () => {
    const { response } = await login('chefin', 'ein-langes-passwort');
    // In v1 wurde der Hash jedes Mitarbeiters an alle Clients ausgeliefert.
    expect(JSON.stringify(response.body)).not.toContain('$argon2');
    expect(response.body.user.passwordHash).toBeUndefined();
  });

  it('kennt die angemeldete Person über /me', async () => {
    const { agent } = await login('chefin', 'ein-langes-passwort');
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe('chefin');
  });

  it('beendet die Sitzung beim Abmelden', async () => {
    const { agent, csrf } = await login('chefin', 'ein-langes-passwort');
    const logout = await agent.post('/api/auth/logout').set(CSRF_HEADER, csrf);
    expect(logout.status).toBe(204);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });
});

describe('CSRF-Schutz', () => {
  beforeEach(async () => {
    await createUser(db, 'chefin', 'ein-langes-passwort', 'admin');
  });

  it('lehnt schreibende Anfragen ohne Token ab', async () => {
    const { agent } = await login('chefin', 'ein-langes-passwort');
    const response = await agent
      .post('/api/auth/password')
      .send({ currentPassword: 'ein-langes-passwort', newPassword: 'noch-ein-langes' });
    expect(response.status).toBe(403);
  });

  it('lehnt ein falsches Token ab', async () => {
    const { agent } = await login('chefin', 'ein-langes-passwort');
    const response = await agent
      .post('/api/auth/password')
      .set(CSRF_HEADER, 'erfundenes-token')
      .send({ currentPassword: 'ein-langes-passwort', newPassword: 'noch-ein-langes' });
    expect(response.status).toBe(403);
  });

  it('lässt lesende Anfragen ohne Token durch', async () => {
    const { agent } = await login('chefin', 'ein-langes-passwort');
    expect((await agent.get('/api/employees')).status).toBe(200);
  });
});

describe('Passwortwechsel', () => {
  beforeEach(async () => {
    await createUser(db, 'chefin', 'ein-langes-passwort', 'admin');
  });

  it('verlangt das richtige aktuelle Passwort', async () => {
    const { agent, csrf } = await login('chefin', 'ein-langes-passwort');
    const response = await agent
      .post('/api/auth/password')
      .set(CSRF_HEADER, csrf)
      .send({ currentPassword: 'falsch', newPassword: 'ein-sehr-langes-passwort' });
    expect(response.status).toBe(401);
  });

  it('setzt die Mindestlänge durch', async () => {
    const { agent, csrf } = await login('chefin', 'ein-langes-passwort');
    const response = await agent
      .post('/api/auth/password')
      .set(CSRF_HEADER, csrf)
      .send({ currentPassword: 'ein-langes-passwort', newPassword: 'kurz' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('10 Zeichen');
  });

  it('wechselt das Passwort und beendet alle Sitzungen', async () => {
    const { agent, csrf } = await login('chefin', 'ein-langes-passwort');
    const response = await agent
      .post('/api/auth/password')
      .set(CSRF_HEADER, csrf)
      .send({ currentPassword: 'ein-langes-passwort', newPassword: 'das-neue-passwort' });
    expect(response.status).toBe(200);

    // Die alte Sitzung gilt nicht mehr.
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    // Das neue Passwort greift.
    expect((await login('chefin', 'das-neue-passwort')).response.status).toBe(200);
  });
});

describe('GET /api/employees', () => {
  it('verlangt eine Anmeldung', async () => {
    // In v1 lieferte der Server den kompletten Datenbestand unauthentifiziert aus.
    const response = await request(app).get('/api/employees');
    expect(response.status).toBe(401);
  });

  it('liefert der Praxisleitung die vollständigen Datensätze', async () => {
    createEmployee(db, { firstName: 'Maria', lastName: 'Huber', notes: 'Interne Notiz' });
    await createUser(db, 'chefin', 'ein-langes-passwort', 'admin');

    const { agent } = await login('chefin', 'ein-langes-passwort');
    const response = await agent.get('/api/employees');

    expect(response.status).toBe(200);
    expect(response.body.employees).toHaveLength(1);
    expect(response.body.employees[0].notes).toBe('Interne Notiz');
    expect(response.body.employees[0].firstName).toBe('Maria');
  });

  it('hält interne Notizen von Kolleginnen zurück', async () => {
    createEmployee(db, { firstName: 'Maria', lastName: 'Huber', notes: 'Interne Notiz' });
    const ownId = createEmployee(db, { firstName: 'Sabine', lastName: 'Klein' });
    await createUser(db, 'sabine', 'ein-langes-passwort', 'employee', ownId);

    const { agent } = await login('sabine', 'ein-langes-passwort');
    const response = await agent.get('/api/employees');

    expect(response.status).toBe(200);
    expect(response.body.employees).toHaveLength(2);
    for (const employee of response.body.employees) {
      expect(employee.notes).toBeUndefined();
    }
    // Wer im Team ist, darf jede sehen - nur die Notizen nicht.
    expect(response.body.employees.map((e: { lastName: string }) => e.lastName)).toContain('Huber');
  });

  it('liefert Arbeitszeiten und Qualifikationen mit', async () => {
    createEmployee(db, { firstName: 'Maria', lastName: 'Huber' });
    await createUser(db, 'chefin', 'ein-langes-passwort', 'admin');

    const { agent } = await login('chefin', 'ein-langes-passwort');
    const [employee] = (await agent.get('/api/employees')).body.employees;

    expect(employee.workTimes['1']).toEqual({
      isWorking: true,
      startMin: 480,
      endMin: 1020,
      breakMin: 60,
      location: 'practice',
    });
    expect(employee.skillIds).toEqual([]);
  });
});

describe('Unbekannte Endpunkte', () => {
  it('antworten mit 404 statt mit der Oberfläche', async () => {
    const response = await request(app).get('/api/gibtesnicht');
    expect(response.status).toBe(404);
  });
});
