import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Db } from '../db/index.js';
import { RECOVERY_MARKER, handleRecoveryMarker, needsSetup } from '../auth/bootstrap.js';
import { verifyPassword } from '../auth/password.js';
import { createTestDb, createUser, readCookie } from '../testing/fixtures.js';
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

const valid = {
  practiceName: 'Hausarztpraxis Musterstadt',
  username: 'chefin',
  password: 'ein-langes-passwort',
};

describe('Ersteinrichtung', () => {
  it('meldet eine leere Datenbank als einrichtungsbedürftig', async () => {
    const response = await request(app).get('/api/setup/status');
    expect(response.status).toBe(200);
    expect(response.body.needsSetup).toBe(true);
  });

  it('legt das erste Konto an und meldet direkt an', async () => {
    const agent = request.agent(app);
    const response = await agent.post('/api/setup').send(valid);

    expect(response.status).toBe(201);
    expect(response.body.user.username).toBe('chefin');
    expect(response.body.user.role).toBe('admin');
    // Kein erzwungener Wechsel: das Passwort hat die Person selbst gesetzt.
    expect(response.body.user.mustChangePassword).toBe(false);

    // Die Sitzung steht bereits.
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('übernimmt den Praxisnamen in die Einstellungen', async () => {
    const agent = request.agent(app);
    await agent.post('/api/setup').send(valid);
    const { body } = await agent.get('/api/settings');
    expect(body.settings.practiceName).toBe('Hausarztpraxis Musterstadt');
  });

  it('schließt sich nach der Einrichtung', async () => {
    await request(app).post('/api/setup').send(valid);

    expect((await request(app).get('/api/setup/status')).body.needsSetup).toBe(false);

    const second = await request(app)
      .post('/api/setup')
      .send({ ...valid, username: 'eindringling' });
    expect(second.status).toBe(409);
    expect(second.body.error).toContain('bereits eingerichtet');

    // Und es ist wirklich kein zweites Konto entstanden.
    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('ist gesperrt, sobald ein Konto existiert - auch ein Mitarbeiterkonto', async () => {
    await createUser(db, 'sabine', 'ein-langes-passwort', 'employee');
    const response = await request(app).post('/api/setup').send(valid);
    expect(response.status).toBe(409);
  });

  it('setzt die Mindestlänge des Passworts durch', async () => {
    const response = await request(app)
      .post('/api/setup')
      .send({ ...valid, password: 'kurz' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('10 Zeichen');
  });

  it('lehnt unbrauchbare Benutzernamen ab', async () => {
    const short = await request(app)
      .post('/api/setup')
      .send({ ...valid, username: 'ab' });
    expect(short.status).toBe(400);

    const weird = await request(app)
      .post('/api/setup')
      .send({ ...valid, username: 'chef in!' });
    expect(weird.status).toBe(400);
    expect(weird.body.error).toContain('Erlaubt sind');
  });

  it('verlangt einen Praxisnamen', async () => {
    const response = await request(app)
      .post('/api/setup')
      .send({ ...valid, practiceName: '  ' });
    expect(response.status).toBe(400);
  });

  it('braucht kein CSRF-Token - vor der Einrichtung gibt es keins', async () => {
    // Ohne diese Ausnahme wäre der erste Start eine Sackgasse.
    const response = await request(app).post('/api/setup').send(valid);
    expect(response.status).toBe(201);
  });

  it('setzt danach ein gültiges Passwort für die Anmeldung', async () => {
    await request(app).post('/api/setup').send(valid);

    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'chefin', password: 'ein-langes-passwort' });
    expect(login.status).toBe(200);
    expect(
      readCookie(login.headers['set-cookie'] as string[] | undefined, 'haeppi_session'),
    ).toBeTruthy();
  });
});

describe('Zugang wiederherstellen', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'haeppi-recovery-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('tut ohne Marker-Datei nichts', async () => {
    const result = await handleRecoveryMarker(db, dataDir);
    expect(result.performed).toBe(false);
  });

  it('setzt das Passwort der Praxisleitung zurück', async () => {
    await createUser(db, 'chefin', 'altes-langes-passwort', 'admin');
    writeFileSync(path.join(dataDir, RECOVERY_MARKER), '');

    const result = await handleRecoveryMarker(db, dataDir);

    expect(result.performed).toBe(true);
    expect(result.username).toBe('chefin');
    expect(result.password).toHaveLength(16);

    const row = db
      .prepare('SELECT password_hash, must_change_password FROM users WHERE username = ?')
      .get('chefin') as { password_hash: string; must_change_password: number };

    expect(await verifyPassword(row.password_hash, result.password!)).toBe(true);
    expect(await verifyPassword(row.password_hash, 'altes-langes-passwort')).toBe(false);
    // Das erzeugte Passwort muss gewechselt werden.
    expect(row.must_change_password).toBe(1);
  });

  it('beendet dabei alle offenen Sitzungen', async () => {
    const user = await createUser(db, 'chefin', 'altes-langes-passwort', 'admin');
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: 'chefin', password: 'altes-langes-passwort' });
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    writeFileSync(path.join(dataDir, RECOVERY_MARKER), '');
    await handleRecoveryMarker(db, dataDir);

    // Ein fremder Zugang darf nicht bestehen bleiben.
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    void user;
  });

  it('legt ein Konto an, falls gar keines mehr existiert', async () => {
    writeFileSync(path.join(dataDir, RECOVERY_MARKER), '');
    const result = await handleRecoveryMarker(db, dataDir);

    expect(result.performed).toBe(true);
    expect(result.username).toBe('admin');
    expect(needsSetup(db)).toBe(false);
  });

  it('löscht die Marker-Datei, damit der Weg nicht offen bleibt', async () => {
    await createUser(db, 'chefin', 'altes-langes-passwort', 'admin');
    const marker = path.join(dataDir, RECOVERY_MARKER);
    writeFileSync(marker, '');

    await handleRecoveryMarker(db, dataDir);
    expect((await handleRecoveryMarker(db, dataDir)).performed).toBe(false);
  });

  it('erkennt die Marker-Datei auch mit doppelter Endung oder anderer Schreibweise', async () => {
    // Der Explorer blendet Endungen aus - "ZUGANG-ZURUECKSETZEN.txt" wird
    // beim Anlegen schnell zu "ZUGANG-ZURUECKSETZEN.txt.txt".
    await createUser(db, 'chefin', 'altes-langes-passwort', 'admin');
    writeFileSync(path.join(dataDir, 'zugang-zuruecksetzen.txt.txt'), '');

    const result = await handleRecoveryMarker(db, dataDir);
    expect(result.performed).toBe(true);
    expect(result.username).toBe('chefin');
    // Und die Datei ist trotzdem weg.
    expect((await handleRecoveryMarker(db, dataDir)).performed).toBe(false);
  });

  it('lässt sich auch ohne Datei erzwingen - für start-server.bat reset', async () => {
    await createUser(db, 'chefin', 'altes-langes-passwort', 'admin');
    const result = await handleRecoveryMarker(db, dataDir, true);
    expect(result.performed).toBe(true);
    expect(result.password?.length).toBe(16);
  });

  it('hinterlässt einen Protokolleintrag', async () => {
    await createUser(db, 'chefin', 'altes-langes-passwort', 'admin');
    writeFileSync(path.join(dataDir, RECOVERY_MARKER), '');
    await handleRecoveryMarker(db, dataDir);

    const entry = db
      .prepare(`SELECT action, detail FROM audit_log WHERE action = 'recovery'`)
      .get() as { action: string; detail: string } | undefined;
    expect(entry?.detail).toContain('zurückgesetzt');
  });
});
