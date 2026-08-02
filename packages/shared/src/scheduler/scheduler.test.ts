import { describe, expect, it } from 'vitest';
import { generateWeekPlan } from './index.js';
import {
  MONDAY,
  area,
  dayOff,
  employee,
  fullWeek,
  matrixEntry,
  morningBlocks,
  planInput,
  workDay,
} from './testFixtures.js';

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
        workAreas: [area('homeoffice', { requiresHomeoffice: true })],
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

describe('PCM', () => {
  it('sperrt die PCM in den Blöcken ihrer Sprechstunde', () => {
    const result = generateWeekPlan(
      planInput({
        employees: [employee('pcm', { isPcm: true })],
        workAreas: [area('anmeldung')],
        pcmBusy: [{ employeeId: 'pcm', date: MONDAY, dayBlockId: 'blk-1' }],
      }),
    );
    expect(onMonday(result, 'anmeldung')).toEqual([]);
    // An den übrigen Tagen ist sie normal einsetzbar.
    expect(result.assignments).toHaveLength(4);
    const diagnostic = result.diagnostics.find(
      (d) => d.kind === 'unfilled_required' && d.date === MONDAY,
    );
    expect(diagnostic?.message).toContain('PCM-Sprechstunde');
  });
});

describe('Zimmerkapazität der Ärzte', () => {
  it('setzt nie mehr Sprechstunden an, als es Zimmer gibt', () => {
    const rooms = [1, 2, 3, 4].map((n) =>
      area(`zimmer-${n}`, { plan: 'doctor', kind: 'room', minStaff: 0, maxStaff: 1, sortOrder: n }),
    );
    const doctors = [1, 2, 3, 4, 5, 6].map((n) =>
      employee(`arzt-${n}`, { staffType: 'doctor', sortOrder: n }),
    );

    const result = generateWeekPlan(
      planInput({ plan: 'doctor', employees: doctors, workAreas: rooms }),
    );

    const montags = result.assignments.filter((a) => a.date === MONDAY);
    expect(montags).toHaveLength(4);
    // Jedes Zimmer genau einmal.
    expect(new Set(montags.map((a) => a.workAreaId)).size).toBe(4);
  });

  it('trennt die beiden Dienstpläne', () => {
    const result = generateWeekPlan(
      planInput({
        plan: 'mfa',
        employees: [employee('arzt', { staffType: 'doctor' }), employee('mfa')],
        workAreas: [area('anmeldung')],
      }),
    );
    expect(onMonday(result, 'anmeldung')).toEqual(['mfa']);
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
});
