-- HAEPPI-Flow 2.1 - Gruppen, Umplanung, Schliesszeiten
--
-- Was sich aendert:
--   * Die PCM ist eine eigene Gruppe (staff_type 'pcm') statt eines Flags
--     an einer MFA. Sie hat eigene Bereiche und ein eigenes Zeitmodell.
--   * Das Zeitmodell gilt je Gruppe: die Aerzte teilen den Vormittag in
--     Sprechstunde (08-11) und Infekt-/Videosprechstunde (11-13).
--   * Arbeitszeiten kennen einen Ort (Praxis/Homeoffice) je Wochentag.
--   * Bereiche kennen ihren Ort und eine Folgeaufgabe.
--   * Zuweisungen koennen aus einer Umplanung "beibehalten" sein.
--   * Schliesszeiten haben Vorbereitungstage; Notbesetzung wird gespeichert.
--   * Umplanungsvorschlaege und Planungslaeufe werden aufbewahrt.
--
-- Tabellen mit geaenderter CHECK-Bedingung werden neu angelegt, kopiert
-- und umbenannt (SQLite kann CHECK nicht aendern). Der Migrationslaeufer
-- schaltet dafuer die Fremdschluessel ab und prueft sie danach.

-- ------------------------------------------------------------- employees --

CREATE TABLE employees_new (
    id                   TEXT PRIMARY KEY,
    first_name           TEXT NOT NULL,
    last_name            TEXT NOT NULL,
    staff_type           TEXT NOT NULL CHECK (staff_type IN ('doctor', 'pcm', 'mfa', 'trainee')),
    employment           TEXT NOT NULL CHECK (employment IN ('fulltime', 'parttime')),
    target_hours_week    REAL NOT NULL DEFAULT 40,
    can_homeoffice       INTEGER NOT NULL DEFAULT 0,
    color                TEXT NOT NULL DEFAULT '#3b82f6',
    entry_date           TEXT,
    exit_date            TEXT,
    is_active            INTEGER NOT NULL DEFAULT 1,
    sort_order           INTEGER NOT NULL DEFAULT 0,
    notes                TEXT NOT NULL DEFAULT '',
    version              INTEGER NOT NULL DEFAULT 1,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (target_hours_week >= 0),
    CHECK (exit_date IS NULL OR entry_date IS NULL OR exit_date >= entry_date)
);
INSERT INTO employees_new
    (id, first_name, last_name, staff_type, employment, target_hours_week, can_homeoffice,
     color, entry_date, exit_date, is_active, sort_order, notes, version, created_at, updated_at)
SELECT id, first_name, last_name,
       CASE WHEN is_pcm = 1 THEN 'pcm' ELSE staff_type END,
       employment, target_hours_week, can_homeoffice, color, entry_date, exit_date,
       is_active, sort_order, notes, version, created_at, updated_at
  FROM employees;
DROP TABLE employees;
ALTER TABLE employees_new RENAME TO employees;
CREATE INDEX ix_employees_active ON employees (is_active, staff_type, sort_order);

-- Ort je Wochentag: fester Homeoffice-Tag.
ALTER TABLE employee_worktimes
    ADD COLUMN location TEXT NOT NULL DEFAULT 'practice'
        CHECK (location IN ('practice', 'home'));

-- ------------------------------------------------------------ day_blocks --

ALTER TABLE day_blocks
    ADD COLUMN plan TEXT NOT NULL DEFAULT 'mfa' CHECK (plan IN ('doctor', 'pcm', 'mfa'));
DROP INDEX ux_day_blocks_start;

-- Bestehende Bloecke gehoeren den MFA; Aerzte und PCM bekommen Kopien,
-- damit vorhandene Bereiche und Zuweisungen weiter auf einen Block zeigen.
INSERT INTO day_blocks (id, plan, weekday, label, kind, start_min, end_min, sort_order)
SELECT id || '-doctor', 'doctor', weekday, label, kind, start_min, end_min, sort_order
  FROM day_blocks WHERE plan = 'mfa';
INSERT INTO day_blocks (id, plan, weekday, label, kind, start_min, end_min, sort_order)
SELECT id || '-pcm', 'pcm', weekday, label, kind, start_min, end_min, sort_order
  FROM day_blocks WHERE plan = 'mfa';

CREATE UNIQUE INDEX ux_day_blocks_start ON day_blocks (plan, weekday, start_min);

UPDATE work_area_blocks SET day_block_id = day_block_id || '-doctor'
 WHERE work_area_id IN (SELECT id FROM work_areas WHERE plan = 'doctor');
UPDATE template_assignments SET day_block_id = day_block_id || '-doctor'
 WHERE work_area_id IN (SELECT id FROM work_areas WHERE plan = 'doctor');
UPDATE assignments SET day_block_id = day_block_id || '-doctor'
 WHERE work_area_id IN (SELECT id FROM work_areas WHERE plan = 'doctor');

-- ------------------------------------------------------------ work_areas --

CREATE TABLE work_areas_new (
    id                    TEXT PRIMARY KEY,
    plan                  TEXT NOT NULL CHECK (plan IN ('doctor', 'pcm', 'mfa')),
    name                  TEXT NOT NULL,
    description           TEXT NOT NULL DEFAULT '',
    kind                  TEXT NOT NULL CHECK (
                              kind IN ('room', 'service', 'office', 'homeoffice', 'housecall')),
    is_critical           INTEGER NOT NULL DEFAULT 0,
    min_staff             INTEGER NOT NULL DEFAULT 0 CHECK (min_staff >= 0),
    max_staff             INTEGER CHECK (max_staff IS NULL OR max_staff >= min_staff),
    location              TEXT NOT NULL DEFAULT 'practice'
                              CHECK (location IN ('practice', 'home', 'any')),
    rotation_min_per_week INTEGER CHECK (rotation_min_per_week IS NULL OR rotation_min_per_week >= 0),
    -- Folgeaufgabe: bevorzugt, wer am Vortag in diesem Bereich war.
    follow_up_area_id     TEXT REFERENCES work_areas (id) ON DELETE SET NULL,
    icon                  TEXT NOT NULL DEFAULT '🏥',
    color                 TEXT NOT NULL DEFAULT '#3b82f6',
    sort_order            INTEGER NOT NULL DEFAULT 0,
    is_active             INTEGER NOT NULL DEFAULT 1,
    UNIQUE (plan, name)
);
INSERT INTO work_areas_new
    (id, plan, name, description, kind, is_critical, min_staff, max_staff, location,
     rotation_min_per_week, follow_up_area_id, icon, color, sort_order, is_active)
SELECT id, plan, name, description, kind, is_critical, min_staff, max_staff,
       CASE WHEN requires_homeoffice = 1 THEN 'home'
            WHEN kind = 'office' THEN 'any'
            ELSE 'practice' END,
       rotation_min_per_week, NULL, icon, color, sort_order, is_active
  FROM work_areas;
DROP TABLE work_areas;
ALTER TABLE work_areas_new RENAME TO work_areas;
CREATE INDEX ix_work_areas_plan ON work_areas (plan, is_active, sort_order);

-- ----------------------------------------------------------- assignments --

CREATE TABLE assignments_new (
    id           TEXT PRIMARY KEY,
    date         TEXT NOT NULL,
    day_block_id TEXT NOT NULL REFERENCES day_blocks (id) ON DELETE CASCADE,
    work_area_id TEXT NOT NULL REFERENCES work_areas (id) ON DELETE CASCADE,
    employee_id  TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    source       TEXT NOT NULL CHECK (source IN ('template', 'auto', 'kept', 'manual')),
    is_locked    INTEGER NOT NULL DEFAULT 0,
    reason       TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO assignments_new SELECT * FROM assignments;
DROP TABLE assignments;
ALTER TABLE assignments_new RENAME TO assignments;
-- Eine Person, ein Ort je Block. Ueberschneidungen zwischen verschieden
-- geschnittenen Bloecken (Aerzte 08-11 gegen MFA 08-13) prueft der Service.
CREATE UNIQUE INDEX ux_assign_one_place ON assignments (date, day_block_id, employee_id);
CREATE INDEX ix_assign_week ON assignments (date, work_area_id);
CREATE INDEX ix_assign_employee ON assignments (employee_id, date);

-- -------------------------------------------------------------- closures --

ALTER TABLE closures ADD COLUMN prep_days  INTEGER NOT NULL DEFAULT 2 CHECK (prep_days >= 0);
ALTER TABLE closures ADD COLUMN prep_staff INTEGER NOT NULL DEFAULT 1 CHECK (prep_staff >= 0);
-- Die alte Voreinstellung "1 an allen Tagen" war nie wirksam; jetzt heisst
-- die Regel: alle haben frei, nur die Vorbereitungstage sind besetzt.
UPDATE closures SET skeleton_staff = 0;

CREATE TABLE closure_duties (
    id          TEXT PRIMARY KEY,
    closure_id  TEXT NOT NULL REFERENCES closures (id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('prep', 'skeleton')),
    UNIQUE (closure_id, employee_id, date)
);
CREATE INDEX ix_closure_duties_employee ON closure_duties (employee_id, date);

-- ------------------------------------------------- Vorschlaege und Laeufe --

-- Umplanungsvorschlag: der Plan aendert sich bei einem Ausfall nicht von
-- selbst. Der Vorschlag wartet auf die Praxisleitung.
CREATE TABLE plan_proposals (
    id                TEXT PRIMARY KEY,
    week_start        TEXT NOT NULL,
    trigger           TEXT NOT NULL CHECK (trigger IN ('absence', 'manual')),
    trigger_ref       TEXT,
    title             TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'applied', 'discarded')),
    -- JSON: { assignments, diagnostics, changes }
    payload           TEXT NOT NULL,
    unfilled_required INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at        TEXT,
    decided_by        TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_proposals_status ON plan_proposals (status, week_start);

-- Jeder Planungslauf mit seiner Auswertung - damit die Hinweise nicht
-- beim Neuladen der Seite verschwinden.
CREATE TABLE plan_runs (
    id          TEXT PRIMARY KEY,
    week_start  TEXT NOT NULL,
    mode        TEXT NOT NULL,
    dry_run     INTEGER NOT NULL DEFAULT 0,
    at          TEXT NOT NULL DEFAULT (datetime('now')),
    user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
    diagnostics TEXT NOT NULL,
    score       REAL NOT NULL DEFAULT 0
);
CREATE INDEX ix_plan_runs_week ON plan_runs (week_start, at);

-- Die alten Gewichte passen nicht mehr zum Kostenmodell; die Standardwerte
-- greifen, bis in den Einstellungen neue gesetzt werden.
DELETE FROM settings WHERE key = 'scheduler.weights';
