import { describe, expect, it } from 'vitest';
import { generateWeekPlan } from './index.js';
import {
  MONDAY,
  afternoonBlocks,
  area,
  dayOff,
  employee,
  fullWeek,
  matrixEntry,
  morningBlocks,
  planInput,
  workDay,
} from './testFixtures.js';

const TUESDAY = '2026-08-04';

const onMonday = (
  result: { assignments: readonly { date: string; workAreaId: string; employeeId: string }[] },
  areaId: string,
) =>
  result.assignments
    .filter((a) => a.date === MONDAY && a.workAreaId === areaId)
    .map((a) => a.employeeId);

describe('Verfügbarkeit', () => {
  // Der zentrale Fehler der Vorgaengerversion: dort wurde die Arbeitszeit
  // als Text verglichen und Anwesenheit exakt zum Blockbeginn verlangt.
  it('setzt eine um 09:00 beginnende Kraft im Block 08:00–13:00 ein', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('spaet', { workTimes: fullWeek('09:00', '17:00') })],
        workAreas: [area('labor')],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['spaet']);
  });

  it('setzt niemanden ein, der den Block nur streift', () => {
    // 12:30–17:00 deckt vom Block 08:00–13:00 nur 30 von 300 Minuten ab.
    const result = generateWeekPlan(
      planInput({
        employees: [employee('kurz', { workTimes: fullWeek('12:30', '17:00') })],
        workAreas: [area('labor')],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual([]);
    const diagnostic = result.diagnostics.find((d) => d.kind === 'unfilled_required');
    expect(diagnostic?.message).toContain('nur kurz da');
  });

  it('achtet auf die einstellbare Mindestüberdeckung', () => {
    const input = planInput({
      employees: [employee('halb', { workTimes: fullWeek('10:30', '17:00') })],
      workAreas: [area('labor')],
    });
    // 10:30–13:00 sind 150 von 300 Minuten, also genau die Hälfte.
    expect(onMonday(generateWeekPlan({ ...input, minOverlapRatio: 0.5 }), 'labor')).toEqual([
      'halb',
    ]);
    expect(onMonday(generateWeekPlan({ ...input, minOverlapRatio: 0.6 }), 'labor')).toEqual([]);
  });

  it('überspringt Tage, an denen die Person nicht arbeitet', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('teilzeit', { workTimes: { ...fullWeek(), 3: dayOff } })],
        workAreas: [area('labor')],
      }),
    );
    const days = result.assignments.map((a) => a.date);
    expect(days).not.toContain('2026-08-05'); // Mittwoch
    expect(days).toHaveLength(4);
  });
});

describe('Homeoffice-Tag', () => {
  it('lässt an einem Homeoffice-Tag keinen Praxisbereich zu', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [
          employee('zuhause', {
            canHomeoffice: true,
            workTimes: { ...fullWeek(), 1: workDay('08:00', '17:00', 60, 'home') },
          }),
        ],
        workAreas: [area('labor')],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual([]);
    expect(result.assignments.map((a) => a.date)).toContain(TUESDAY);
    const diagnostic = result.diagnostics.find((d) => d.date === MONDAY);
    expect(diagnostic?.message).toContain('im Homeoffice');
  });

  it('setzt sie am Homeoffice-Tag in Bereiche, die von zu Hause gehen', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [
          employee('zuhause', {
            canHomeoffice: true,
            workTimes: { ...fullWeek(), 1: workDay('08:00', '17:00', 60, 'home') },
          }),
        ],
        workAreas: [area('backoffice', { location: 'any' })],
      }),
    );
    expect(onMonday(result, 'backoffice')).toEqual(['zuhause']);
  });
});

describe('Mehrfachbesetzung', () => {
  // In v1 zeigte die Oberflaeche pro Feld nur eine Person (.find()) - die
  // zweite existierte unsichtbar im Datenbestand.
  it('besetzt einen Bereich mit minStaff 2 auch mit zwei Personen', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a'), employee('b'), employee('c')],
        workAreas: [area('anmeldung', { minStaff: 2, maxStaff: 3 })],
      }),
    );
    expect(onMonday(result, 'anmeldung')).toHaveLength(3);
  });

  it('meldet eine Unterbesetzung mit Zahlen', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('allein')],
        workAreas: [area('anmeldung', { minStaff: 2, maxStaff: 2, isCritical: true })],
      }),
    );
    const diagnostic = result.diagnostics.find(
      (d) => d.kind === 'unfilled_required' && d.date === MONDAY,
    );
    expect(diagnostic?.severity).toBe('error');
    expect(diagnostic?.message).toContain('1 von 2');
  });

  it('beachtet die abweichende Mindestbesetzung je Block', () => {
    const blocks = morningBlocks();
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a'), employee('b')],
        workAreas: [
          area('anmeldung', {
            minStaff: 2,
            maxStaff: 2,
            // Am Montag genügt eine Person.
            blockMinStaff: { 'blk-1': 1 },
          }),
        ],
        dayBlocks: blocks,
      }),
    );
    const montagsWarnung = result.diagnostics.find(
      (d) => d.kind === 'unfilled_required' && d.date === MONDAY,
    );
    expect(montagsWarnung).toBeUndefined();
  });
});

describe('Betreuung', () => {
  it('setzt eine betreute Person nicht allein ein', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('azubi')],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 2 })],
        matrix: [matrixEntry('azubi', 'labor', { clearance: 'supervised' })],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual([]);
    const diagnostic = result.diagnostics.find((d) => d.kind === 'unfilled_required');
    expect(diagnostic?.message).toContain('nur mit Betreuung');
  });

  it('setzt sie ein, sobald jemand Eigenständiges dabei ist', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('azubi'), employee('mfa')],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 2 })],
        matrix: [matrixEntry('azubi', 'labor', { clearance: 'supervised' })],
      }),
    );
    expect(onMonday(result, 'labor').sort()).toEqual(['azubi', 'mfa']);
  });

  it('unterscheidet zwei Auszubildende im selben Bereich', () => {
    // Der reale Fall aus der Praxis: eine darf allein ins Labor, der andere nicht.
    const result = generateWeekPlan(
      planInput({
        employees: [
          employee('darf-allein', { staffType: 'trainee', sortOrder: 1 }),
          employee('braucht-hilfe', { staffType: 'trainee', sortOrder: 2 }),
        ],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1 })],
        matrix: [matrixEntry('braucht-hilfe', 'labor', { clearance: 'supervised' })],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['darf-allein']);
  });

  it('entfernt eine unbetreute Person aus der Musterwoche und sagt warum', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('azubi')],
        workAreas: [area('labor', { minStaff: 0, maxStaff: 2 })],
        matrix: [matrixEntry('azubi', 'labor', { clearance: 'supervised' })],
        template: [{ id: 't1', employeeId: 'azubi', workAreaId: 'labor', dayBlockId: 'blk-1' }],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual([]);
    const dropped = result.diagnostics.find((d) => d.kind === 'supervision_dropped');
    expect(dropped?.message).toContain('eigenständiger Freigabe');
  });
});

describe('Qualifikationen, Homeoffice und Sperren', () => {
  it('lässt niemanden ohne Pflichtqualifikation in den Bereich', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('ohne'), employee('mit', { skillIds: ['verah'] })],
        workAreas: [area('hausbesuche', { requiredSkillIds: ['verah'] })],
      }),
    );
    expect(onMonday(result, 'hausbesuche')).toEqual(['mit']);
  });

  it('verlangt für Homeoffice-Bereiche die Berechtigung', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('vorort'), employee('remote', { canHomeoffice: true })],
        workAreas: [area('homeoffice', { location: 'home' })],
      }),
    );
    expect(onMonday(result, 'homeoffice')).toEqual(['remote']);
  });

  it('respektiert eine Sperre in der Einsatz-Matrix', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('gesperrt')],
        workAreas: [area('labor')],
        matrix: [matrixEntry('gesperrt', 'labor', { clearance: 'blocked' })],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual([]);
  });

  it('hält das persönliche Wochenmaximum ein', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('einzige')],
        workAreas: [area('anmeldung')],
        matrix: [matrixEntry('einzige', 'anmeldung', { maxPerWeek: 2 })],
      }),
    );
    expect(result.assignments.filter((a) => a.workAreaId === 'anmeldung')).toHaveLength(2);
  });
});

describe('Abwesenheit und Schließtage', () => {
  it('plant genehmigte Abwesenheiten nicht ein', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('urlauber')],
        workAreas: [area('labor')],
        absences: [
          {
            employeeId: 'urlauber',
            startDate: '2026-08-03',
            endDate: '2026-08-04',
            status: 'approved',
            halfDay: null,
          },
        ],
      }),
    );
    const days = result.assignments.map((a) => a.date);
    expect(days).not.toContain('2026-08-03');
    expect(days).not.toContain('2026-08-04');
    expect(days).toHaveLength(3);
  });

  it('sperrt bei einem halben Tag nur die betroffene Tageshälfte', () => {
    const blocks = [...morningBlocks(), ...afternoonBlocks()];
    const result = generateWeekPlan(
      planInput({
        dayBlocks: blocks,
        employees: [employee('halbtags')],
        workAreas: [area('backoffice', { blockIds: blocks.map((b) => b.id) })],
        absences: [
          {
            employeeId: 'halbtags',
            startDate: MONDAY,
            endDate: MONDAY,
            status: 'approved',
            halfDay: 'am',
          },
        ],
      }),
    );
    const montag = result.assignments.filter((a) => a.date === MONDAY).map((a) => a.dayBlockId);
    expect(montag).toEqual(['blk-1-nm']);
  });

  it('weicht beantragtem Urlaub aus, wenn es eine Alternative gibt', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('wunsch', { sortOrder: 1 }), employee('andere', { sortOrder: 2 })],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1 })],
        absences: [
          {
            employeeId: 'wunsch',
            startDate: MONDAY,
            endDate: MONDAY,
            status: 'requested',
            halfDay: null,
          },
        ],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['andere']);
  });

  it('plant an Schließtagen gar nicht', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a')],
        workAreas: [area('labor')],
        closedDates: new Set([MONDAY]),
      }),
    );
    expect(result.assignments.map((a) => a.date)).not.toContain(MONDAY);
    expect(result.diagnostics.some((d) => d.date === MONDAY)).toBe(false);
  });
});

describe('Gruppen', () => {
  it('trennt die Gruppen: eine Ärztin landet nicht in der Anmeldung', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('arzt', { staffType: 'doctor' }), employee('mfa')],
        workAreas: [area('anmeldung')],
      }),
    );
    expect(onMonday(result, 'anmeldung')).toEqual(['mfa']);
  });

  it('hält die PCM aus dem MFA-Pool heraus', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('heidi', { staffType: 'pcm' })],
        workAreas: [area('anmeldung')],
      }),
    );
    expect(onMonday(result, 'anmeldung')).toEqual([]);
  });

  it('lässt die PCM mit ausdrücklicher Freigabe in einen MFA-Bereich', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('heidi', { staffType: 'pcm' })],
        workAreas: [area('anmeldung')],
        matrix: [matrixEntry('heidi', 'anmeldung', { clearance: 'solo' })],
      }),
    );
    expect(onMonday(result, 'anmeldung')).toEqual(['heidi']);
    expect(result.assignments[0]?.reason).toContain('anderer Gruppe');
  });

  it('gibt der PCM zuerst ihren eigenen Bereich, bevor sie aushilft', () => {
    const pcmBlocks = morningBlocks('pcm', '-pcm');
    const result = generateWeekPlan(
      planInput({
        dayBlocks: [...morningBlocks(), ...pcmBlocks],
        employees: [employee('heidi', { staffType: 'pcm' }), employee('mfa')],
        workAreas: [
          area('pcm-sprechstunde', {
            plan: 'pcm',
            minStaff: 0,
            maxStaff: 1,
            blockIds: pcmBlocks.map((b) => b.id),
          }),
          area('anmeldung', { minStaff: 1, maxStaff: 2 }),
        ],
        matrix: [matrixEntry('heidi', 'anmeldung', { clearance: 'solo' })],
      }),
    );
    expect(onMonday(result, 'pcm-sprechstunde')).toEqual(['heidi']);
    expect(onMonday(result, 'anmeldung')).toEqual(['mfa']);
  });

  it('setzt nie mehr Sprechstunden an, als es Zimmer gibt', () => {
    const rooms = [1, 2, 3, 4].map((n) =>
      area(`zimmer-${n}`, { plan: 'doctor', kind: 'room', minStaff: 0, maxStaff: 1, sortOrder: n }),
    );
    const doctors = [1, 2, 3, 4, 5, 6].map((n) =>
      employee(`arzt-${n}`, { staffType: 'doctor', sortOrder: n }),
    );

    const result = generateWeekPlan(
      planInput({ dayBlocks: morningBlocks('doctor'), employees: doctors, workAreas: rooms }),
    );

    const montags = result.assignments.filter((a) => a.date === MONDAY);
    expect(montags).toHaveLength(4);
    // Jedes Zimmer genau einmal.
    expect(new Set(montags.map((a) => a.workAreaId)).size).toBe(4);
  });

  it('hält eine Person über verschieden geschnittene Blöcke hinweg an einem Ort', () => {
    // Ärzte: 08–11 und 11–13. Die PCM-Freigabe für ein MFA-Fenster 08–13
    // darf nicht dazu führen, dass sie gleichzeitig an zwei Orten steht.
    const mfaBlocks = morningBlocks();
    const pcmBlocks = morningBlocks('pcm', '-pcm');
    const result = generateWeekPlan(
      planInput({
        dayBlocks: [...mfaBlocks, ...pcmBlocks],
        employees: [employee('heidi', { staffType: 'pcm' })],
        workAreas: [
          area('pcm-sprechstunde', {
            plan: 'pcm',
            minStaff: 1,
            maxStaff: 1,
            blockIds: pcmBlocks.map((b) => b.id),
          }),
          area('anmeldung', { minStaff: 1, maxStaff: 1 }),
        ],
        matrix: [matrixEntry('heidi', 'anmeldung', { clearance: 'solo' })],
      }),
    );
    expect(result.assignments.filter((a) => a.date === MONDAY)).toHaveLength(1);
  });
});

describe('Musterwoche und Rotation', () => {
  it('folgt der Musterwoche', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [area('labor', { sortOrder: 1 }), area('anmeldung', { sortOrder: 2 })],
        // Ohne Vorlage würde die Sortierung a->labor ergeben.
        template: [
          { id: 't1', employeeId: 'b', workAreaId: 'labor', dayBlockId: 'blk-1' },
          { id: 't2', employeeId: 'a', workAreaId: 'anmeldung', dayBlockId: 'blk-1' },
        ],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['b']);
    expect(onMonday(result, 'anmeldung')).toEqual(['a']);
    expect(result.assignments.find((a) => a.date === MONDAY)?.source).toBe('template');
  });

  it('füllt einen Bereich aus der Musterwoche nicht über die Obergrenze', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1 })],
        template: [
          { id: 't1', employeeId: 'a', workAreaId: 'labor', dayBlockId: 'blk-1' },
          { id: 't2', employeeId: 'b', workAreaId: 'labor', dayBlockId: 'blk-1' },
        ],
      }),
    );
    expect(onMonday(result, 'labor')).toHaveLength(1);
  });

  it('erklärt, warum eine Vorlagenzeile diese Woche nicht greift', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a')],
        workAreas: [area('labor')],
        template: [{ id: 't1', employeeId: 'a', workAreaId: 'labor', dayBlockId: 'blk-1' }],
        absences: [
          {
            employeeId: 'a',
            startDate: MONDAY,
            endDate: MONDAY,
            status: 'approved',
            halfDay: null,
          },
        ],
      }),
    );
    const broken = result.diagnostics.find((d) => d.kind === 'template_broken');
    expect(broken?.message).toContain('normalerweise');
    expect(broken?.message).toContain('abwesend');
  });

  it('bringt jede Person einmal pro Woche ins Labor', () => {
    const people = ['a', 'b', 'c', 'd', 'e'].map((id, index) => employee(id, { sortOrder: index }));
    const result = generateWeekPlan(
      planInput({
        employees: people,
        workAreas: [
          area('labor', { minStaff: 1, maxStaff: 1, rotationMinPerWeek: 1, sortOrder: 1 }),
          area('anmeldung', { minStaff: 1, maxStaff: 4, sortOrder: 2 }),
        ],
      }),
    );

    for (const person of people) {
      const laborTage = result.assignments.filter(
        (a) => a.employeeId === person.id && a.workAreaId === 'labor',
      );
      expect(laborTage.length, `${person.id} im Labor`).toBeGreaterThanOrEqual(1);
    }
    expect(result.diagnostics.filter((d) => d.kind === 'rotation_unmet')).toHaveLength(0);
  });

  it('hält eine betreute Azubi für das Labor frei, statt sie in der Anmeldung zu verbrauchen', () => {
    // Azubi darf nur mit Betreuung ins Labor (ein Platz ist Pflicht, zwei
    // moeglich). Die Anmeldung braucht zwei, drei andere sind da.
    const result = generateWeekPlan(
      planInput({
        employees: [
          employee('azubi', { staffType: 'trainee', sortOrder: 1 }),
          employee('a', { sortOrder: 2 }),
          employee('b', { sortOrder: 3 }),
          employee('c', { sortOrder: 4 }),
        ],
        workAreas: [
          area('anmeldung', { minStaff: 2, maxStaff: 3, sortOrder: 1 }),
          area('labor', { minStaff: 1, maxStaff: 2, rotationMinPerWeek: 1, sortOrder: 2 }),
        ],
        matrix: [matrixEntry('azubi', 'labor', { clearance: 'supervised' })],
      }),
    );
    const laborTage = result.assignments.filter(
      (a) => a.employeeId === 'azubi' && a.workAreaId === 'labor',
    );
    expect(laborTage.length).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.filter((d) => d.kind === 'rotation_unmet')).toHaveLength(0);
  });

  it('meldet eine nicht erfüllbare Pflichtrotation', () => {
    // Sechs Personen, aber nur fünf Labortage mit je einem Platz.
    const people = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
      employee(id, { sortOrder: index }),
    );
    const result = generateWeekPlan(
      planInput({
        employees: people,
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1, rotationMinPerWeek: 1 })],
      }),
    );
    const unmet = result.diagnostics.filter((d) => d.kind === 'rotation_unmet');
    expect(unmet).toHaveLength(1);
    expect(unmet[0]?.message).toContain('0× in labor');
  });

  it('befreit von der Pflichtrotation, wenn es so hinterlegt ist', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a', { sortOrder: 1 }), employee('befreit', { sortOrder: 2 })],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1, rotationMinPerWeek: 1 })],
        matrix: [matrixEntry('befreit', 'labor', { exemptRotation: true })],
      }),
    );
    expect(result.diagnostics.filter((d) => d.kind === 'rotation_unmet')).toHaveLength(0);
  });
});

describe('Folgeaufgaben', () => {
  it('gibt die Folgeaufgabe der Person vom Vortag', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [
          area('hausbesuche', { minStaff: 1, maxStaff: 1, sortOrder: 1, blockIds: ['blk-1'] }),
          area('schreiben', {
            minStaff: 1,
            maxStaff: 1,
            sortOrder: 2,
            followUpAreaId: 'hausbesuche',
            blockIds: ['blk-2'],
          }),
          area('anmeldung', { minStaff: 0, maxStaff: 2, sortOrder: 3 }),
        ],
        // Montag fährt b die Hausbesuche - obwohl die Sortierung a vorzöge.
        pinned: [{ date: MONDAY, dayBlockId: 'blk-1', workAreaId: 'hausbesuche', employeeId: 'b' }],
      }),
    );
    const dienstag = result.assignments.find(
      (a) => a.date === TUESDAY && a.workAreaId === 'schreiben',
    );
    expect(dienstag?.employeeId).toBe('b');
    expect(dienstag?.reason).toContain('Folgeaufgabe');
  });

  it('kennt die Vorwoche für den Montag', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [
          area('schreiben', { minStaff: 1, maxStaff: 1, followUpAreaId: 'hausbesuche' }),
          area('anmeldung', { minStaff: 0, maxStaff: 2, sortOrder: 3 }),
        ],
        recent: [
          // Freitag der Vorwoche.
          { date: '2026-07-31', dayBlockId: 'x', workAreaId: 'hausbesuche', employeeId: 'b' },
        ],
      }),
    );
    expect(onMonday(result, 'schreiben')).toEqual(['b']);
  });
});

describe('Vorlieben', () => {
  it('bevorzugt, wer gerne dort arbeitet', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('neutral', { sortOrder: 1 }), employee('gerne', { sortOrder: 2 })],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1 })],
        matrix: [matrixEntry('gerne', 'labor', { preference: 'preferred' })],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['gerne']);
  });

  it('teilt notfalls auch gegen den Wunsch ein und weist es aus', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('einzige')],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1, isCritical: true })],
        matrix: [matrixEntry('einzige', 'labor', { preference: 'never' })],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['einzige']);
    const assignment = result.assignments.find((a) => a.date === MONDAY);
    expect(assignment?.reason).toContain('Notbesetzung');
  });
});

describe('Gesperrte Zuweisungen', () => {
  it('überleben die Neuberechnung unverändert', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('gepinnt', { sortOrder: 9 }), employee('andere', { sortOrder: 1 })],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1 })],
        pinned: [{ date: MONDAY, dayBlockId: 'blk-1', workAreaId: 'labor', employeeId: 'gepinnt' }],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['gepinnt']);
    expect(result.assignments.find((a) => a.date === MONDAY)?.source).toBe('manual');
  });
});

describe('Umplanung', () => {
  const previousWeek = (rows: [string, string][]) =>
    rows.map(([employeeId, workAreaId]) => ({
      date: MONDAY,
      dayBlockId: 'blk-1',
      workAreaId,
      employeeId,
    }));

  it('behält die bisherige Woche, wenn nichts dagegen spricht', () => {
    const result = generateWeekPlan(
      planInput({
        mode: 'replan',
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [area('labor', { sortOrder: 1 }), area('anmeldung', { sortOrder: 2 })],
        // Anders herum, als es die Sortierung ergäbe.
        previous: previousWeek([
          ['b', 'labor'],
          ['a', 'anmeldung'],
        ]),
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['b']);
    expect(onMonday(result, 'anmeldung')).toEqual(['a']);
    expect(result.assignments.find((a) => a.date === MONDAY)?.source).toBe('kept');
    expect(result.changes.filter((c) => c.date === MONDAY)).toHaveLength(0);
  });

  it('ersetzt nur die ausgefallene Person und meldet den Unterschied', () => {
    const result = generateWeekPlan(
      planInput({
        mode: 'replan',
        employees: [
          employee('a', { sortOrder: 1 }),
          employee('b', { sortOrder: 2 }),
          employee('c', { sortOrder: 3 }),
        ],
        workAreas: [area('labor', { sortOrder: 1 }), area('anmeldung', { sortOrder: 2 })],
        previous: previousWeek([
          ['a', 'labor'],
          ['b', 'anmeldung'],
        ]),
        absences: [
          {
            employeeId: 'a',
            startDate: MONDAY,
            endDate: MONDAY,
            status: 'approved',
            halfDay: null,
          },
        ],
      }),
    );
    expect(onMonday(result, 'anmeldung')).toEqual(['b']);
    expect(onMonday(result, 'labor')).toEqual(['c']);

    const montags = result.changes.filter((c) => c.date === MONDAY);
    expect(montags).toEqual([
      expect.objectContaining({ kind: 'removed', employeeId: 'a', workAreaId: 'labor' }),
      expect.objectContaining({ kind: 'added', employeeId: 'c', workAreaId: 'labor' }),
    ]);
    const dropped = result.diagnostics.find((d) => d.kind === 'dropped');
    expect(dropped?.message).toContain('abwesend');
  });

  it('stellt einen Block um, wenn sonst ein Pflichtplatz offen bliebe', () => {
    const result = generateWeekPlan(
      planInput({
        mode: 'replan',
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [
          area('labor', { minStaff: 1, maxStaff: 1, isCritical: true, sortOrder: 1 }),
          area('backoffice', { minStaff: 0, maxStaff: 2, sortOrder: 2 }),
        ],
        previous: previousWeek([
          ['a', 'labor'],
          ['b', 'backoffice'],
        ]),
        absences: [
          {
            employeeId: 'a',
            startDate: MONDAY,
            endDate: MONDAY,
            status: 'approved',
            halfDay: null,
          },
        ],
      }),
    );
    // b rückt vom Backoffice ins Labor.
    expect(onMonday(result, 'labor')).toEqual(['b']);
    expect(onMonday(result, 'backoffice')).toEqual([]);
    expect(result.diagnostics.some((d) => d.kind === 'reshuffled' && d.date === MONDAY)).toBe(true);
    expect(
      result.diagnostics.filter((d) => d.kind === 'unfilled_required' && d.date === MONDAY),
    ).toHaveLength(0);
  });

  it('lässt Blöcke ohne offenen Pflichtplatz unangetastet', () => {
    const result = generateWeekPlan(
      planInput({
        mode: 'replan',
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [
          area('labor', { minStaff: 1, maxStaff: 1, sortOrder: 1 }),
          area('backoffice', { minStaff: 0, maxStaff: 2, sortOrder: 2 }),
        ],
        previous: previousWeek([
          ['b', 'labor'],
          ['a', 'backoffice'],
        ]),
      }),
    );
    expect(result.changes.filter((c) => c.date === MONDAY)).toHaveLength(0);
    expect(result.diagnostics.filter((d) => d.kind === 'reshuffled')).toHaveLength(0);
  });
});

describe('Grundregeln', () => {
  it('setzt niemanden zweimal in denselben Block', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a')],
        workAreas: [area('labor', { sortOrder: 1 }), area('anmeldung', { sortOrder: 2 })],
      }),
    );
    const montags = result.assignments.filter((a) => a.date === MONDAY);
    expect(montags).toHaveLength(1);
  });

  it('liefert bei gleichem Input denselben Plan', () => {
    const input = planInput({
      employees: [1, 2, 3, 4, 5].map((n) => employee(`p${n}`, { sortOrder: n })),
      workAreas: [
        area('anmeldung', { minStaff: 2, maxStaff: 3, sortOrder: 1 }),
        area('labor', { minStaff: 1, maxStaff: 1, rotationMinPerWeek: 1, sortOrder: 2 }),
        area('notfall', { minStaff: 1, maxStaff: 2, sortOrder: 3 }),
      ],
    });

    const first = JSON.stringify(generateWeekPlan(input));
    for (let run = 0; run < 5; run++) {
      expect(JSON.stringify(generateWeekPlan(input))).toBe(first);
    }
  });

  it('trägt für jede Zuweisung eine Begründung', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a')],
        workAreas: [area('labor')],
      }),
    );
    for (const assignment of result.assignments) {
      expect(assignment.reason.length).toBeGreaterThan(0);
    }
  });

  it('bricht nicht ab, wenn es gar keine Arbeitsbereiche gibt', () => {
    const result = generateWeekPlan(planInput({ employees: [employee('a')], workAreas: [] }));
    expect(result.assignments).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('bricht nicht ab, wenn es gar keine Mitarbeiter gibt', () => {
    const result = generateWeekPlan(planInput({ employees: [], workAreas: [area('labor')] }));
    expect(result.assignments).toEqual([]);
    // Jeder Pflichtplatz der Woche wird trotzdem gemeldet.
    expect(result.diagnostics.filter((d) => d.kind === 'unfilled_required')).toHaveLength(5);
  });
});

describe('Auslastungsausgleich', () => {
  it('verteilt optionale Plätze auf verschiedene Köpfe', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('a', { sortOrder: 1 }), employee('b', { sortOrder: 2 })],
        workAreas: [
          area('anmeldung', { minStaff: 1, maxStaff: 1, sortOrder: 1 }),
          area('backoffice', { minStaff: 1, maxStaff: 1, sortOrder: 2 }),
        ],
      }),
    );
    const montags = result.assignments.filter((a) => a.date === MONDAY);
    expect(montags).toHaveLength(2);
    expect(new Set(montags.map((a) => a.employeeId)).size).toBe(2);
  });

  it('berücksichtigt die Historie der Vorwochen', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('oft', { sortOrder: 1 }), employee('selten', { sortOrder: 2 })],
        workAreas: [area('labor', { minStaff: 1, maxStaff: 1 })],
        history: [
          { employeeId: 'oft', workAreaId: 'labor', count: 20 },
          { employeeId: 'selten', workAreaId: 'labor', count: 0 },
        ],
      }),
    );
    expect(onMonday(result, 'labor')).toEqual(['selten']);
  });
});

describe('Arbeitszeitmodell aus der Praxis', () => {
  it('plant einen realistischen Wochenverlauf ohne Fehler', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [
          employee('vollzeit', { sortOrder: 1 }),
          employee('teilzeit-vormittags', {
            sortOrder: 2,
            workTimes: {
              1: workDay('08:00', '13:00', 0),
              2: workDay('08:00', '13:00', 0),
              3: dayOff,
              4: workDay('08:00', '13:00', 0),
              5: dayOff,
            },
          }),
          employee('spaetstarter', { sortOrder: 3, workTimes: fullWeek('09:30', '18:00') }),
        ],
        workAreas: [
          area('anmeldung', { minStaff: 2, maxStaff: 3, isCritical: true, sortOrder: 1 }),
          area('labor', {
            minStaff: 1,
            maxStaff: 1,
            isCritical: true,
            rotationMinPerWeek: 1,
            sortOrder: 2,
          }),
        ],
      }),
    );

    // Montag: alle drei da, Anmeldung braucht 2, Labor 1.
    expect(result.assignments.filter((a) => a.date === MONDAY)).toHaveLength(3);
    // Kein kritischer Bereich bleibt montags leer.
    expect(
      result.diagnostics.filter((d) => d.severity === 'error' && d.date === MONDAY),
    ).toHaveLength(0);
  });

  it('plant Ärzte mit Sprechstunde 08–11 und Infektsprechstunde 11–13', () => {
    const doctorBlocks = [1, 2, 3, 4, 5].flatMap((weekday) => [
      {
        id: `doc-${weekday}-a`,
        plan: 'doctor' as const,
        weekday: weekday as 1,
        label: 'Sprechstunde',
        kind: 'consultation' as const,
        startMin: 8 * 60,
        endMin: 11 * 60,
        sortOrder: 1,
      },
      {
        id: `doc-${weekday}-b`,
        plan: 'doctor' as const,
        weekday: weekday as 1,
        label: 'Infekt/Video',
        kind: 'consultation' as const,
        startMin: 11 * 60,
        endMin: 13 * 60,
        sortOrder: 2,
      },
    ]);
    const early = doctorBlocks.filter((b) => b.id.endsWith('-a')).map((b) => b.id);
    const late = doctorBlocks.filter((b) => b.id.endsWith('-b')).map((b) => b.id);

    const result = generateWeekPlan(
      planInput({
        dayBlocks: doctorBlocks,
        employees: [
          employee('dr-a', { staffType: 'doctor', sortOrder: 1 }),
          employee('dr-b', { staffType: 'doctor', sortOrder: 2 }),
        ],
        workAreas: [
          area('zimmer-1', {
            plan: 'doctor',
            minStaff: 0,
            maxStaff: 1,
            blockIds: early,
            sortOrder: 1,
          }),
          area('zimmer-2', {
            plan: 'doctor',
            minStaff: 0,
            maxStaff: 1,
            blockIds: early,
            sortOrder: 2,
          }),
          area('infekt', {
            plan: 'doctor',
            minStaff: 1,
            maxStaff: 1,
            blockIds: late,
            sortOrder: 3,
          }),
          area('video', { plan: 'doctor', minStaff: 1, maxStaff: 1, blockIds: late, sortOrder: 4 }),
        ],
      }),
    );

    const montags = result.assignments.filter((a) => a.date === MONDAY);
    // Beide Ärzte früh in einem Zimmer, spät je einer in Infekt und Video.
    expect(montags).toHaveLength(4);
    expect(
      montags
        .filter((a) => a.dayBlockId === 'doc-1-b')
        .map((a) => a.workAreaId)
        .sort(),
    ).toEqual(['infekt', 'video']);
    expect(result.diagnostics.filter((d) => d.kind === 'unfilled_required')).toHaveLength(0);
  });
});
