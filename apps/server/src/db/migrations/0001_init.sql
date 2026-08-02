-- HAEPPI-Flow 2.0 - Grundschema
--
-- Konventionen:
--   * Uhrzeiten sind Integer-Minuten seit Mitternacht (start_min, end_min).
--     Nie "HH:MM" als Text - daran ist die Vorgaengerversion gescheitert.
--   * Datumsangaben sind TEXT im Format YYYY-MM-DD, immer als Ortsdatum.
--   * Boolesche Werte sind INTEGER 0/1.
--   * Zeitstempel sind UTC-Text aus datetime('now') - reine Protokollangaben,
--     nie Grundlage fachlicher Datumsrechnung.

-- ---------------------------------------------------------------- Zugaenge --

CREATE TABLE users (
    id                   TEXT PRIMARY KEY,
    username             TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash        TEXT NOT NULL,                 -- argon2id
    role                 TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
    employee_id          TEXT UNIQUE REFERENCES employees (id) ON DELETE CASCADE,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    is_active            INTEGER NOT NULL DEFAULT 1,
    last_login_at        TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Die Session-ID wird nur als Hash abgelegt. Wer die Datei liest, kann sich
-- damit nicht anmelden.
CREATE TABLE sessions (
    id_hash    TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ix_sessions_user ON sessions (user_id);
CREATE INDEX ix_sessions_expiry ON sessions (expires_at);

-- ------------------------------------------------------------- Stammdaten --

CREATE TABLE employees (
    id                   TEXT PRIMARY KEY,
    first_name           TEXT NOT NULL,
    last_name            TEXT NOT NULL,
    staff_type           TEXT NOT NULL CHECK (staff_type IN ('doctor', 'mfa', 'trainee')),
    -- Primary Care Managerin: haelt Sprechstunde wie eine Aerztin, belegt
    -- dabei ein Zimmer und ist solange aus dem MFA-Pool gesperrt.
    is_pcm               INTEGER NOT NULL DEFAULT 0,
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
CREATE INDEX ix_employees_active ON employees (is_active, staff_type, sort_order);

CREATE TABLE employee_worktimes (
    employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    is_working  INTEGER NOT NULL DEFAULT 1,
    start_min   INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
    end_min     INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
    -- Mittagspause: reiner Zeitabzug, kein Planungsposten.
    break_min   INTEGER NOT NULL DEFAULT 60 CHECK (break_min >= 0),
    PRIMARY KEY (employee_id, weekday),
    CHECK (end_min >= start_min)
);

-- Tagesmodell: frei definierbare Bloecke je Wochentag.
-- Voreinstellung Mo/Di/Do 08-13 Sprechstunde, 13-16 Innendienst,
-- 16-18 Sprechstunde; Mi/Fr 08-13 Sprechstunde, nachmittags Innendienst
-- nur im Homeoffice.
CREATE TABLE day_blocks (
    id         TEXT PRIMARY KEY,
    weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    label      TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('consultation', 'backoffice', 'closed')),
    start_min  INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
    end_min    INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
    sort_order INTEGER NOT NULL DEFAULT 0,
    CHECK (end_min > start_min)
);
-- Ueberlappungen innerhalb eines Tages faengt der Service-Layer ab;
-- SQLite kann das nicht deklarativ ausdruecken.
CREATE UNIQUE INDEX ux_day_blocks_start ON day_blocks (weekday, start_min);

CREATE TABLE skills (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    category    TEXT NOT NULL DEFAULT 'Medizinisch',
    description TEXT NOT NULL DEFAULT '',
    is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE employee_skills (
    employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    skill_id    TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
    PRIMARY KEY (employee_id, skill_id)
);

CREATE TABLE work_areas (
    id                    TEXT PRIMARY KEY,
    plan                  TEXT NOT NULL CHECK (plan IN ('doctor', 'mfa')),
    name                  TEXT NOT NULL,
    description           TEXT NOT NULL DEFAULT '',
    kind                  TEXT NOT NULL CHECK (
                              kind IN ('room', 'service', 'office', 'homeoffice', 'housecall')),
    is_critical           INTEGER NOT NULL DEFAULT 0,
    min_staff             INTEGER NOT NULL DEFAULT 0 CHECK (min_staff >= 0),
    max_staff             INTEGER CHECK (max_staff IS NULL OR max_staff >= min_staff),
    requires_homeoffice   INTEGER NOT NULL DEFAULT 0,
    -- Pflichtrotation: jede Person des Plans soll hier so oft pro Woche
    -- eingesetzt werden. NULL = keine. Pro Person uebersteuerbar.
    rotation_min_per_week INTEGER CHECK (rotation_min_per_week IS NULL OR rotation_min_per_week >= 0),
    icon                  TEXT NOT NULL DEFAULT '🏥',
    color                 TEXT NOT NULL DEFAULT '#3b82f6',
    sort_order            INTEGER NOT NULL DEFAULT 0,
    is_active             INTEGER NOT NULL DEFAULT 1,
    UNIQUE (plan, name)
);
CREATE INDEX ix_work_areas_plan ON work_areas (plan, is_active, sort_order);

-- Pflichtqualifikationen: ohne sie ist niemand einsetzbar (z. B. VERAH
-- fuer Hausbesuche).
CREATE TABLE work_area_skills (
    work_area_id TEXT NOT NULL REFERENCES work_areas (id) ON DELETE CASCADE,
    skill_id     TEXT NOT NULL REFERENCES skills (id) ON DELETE CASCADE,
    PRIMARY KEY (work_area_id, skill_id)
);

-- In welchen Tagesbloecken ein Bereich betrieben wird. Erlaubt z. B.
-- "Labor nur vormittags".
CREATE TABLE work_area_blocks (
    work_area_id TEXT NOT NULL REFERENCES work_areas (id) ON DELETE CASCADE,
    day_block_id TEXT NOT NULL REFERENCES day_blocks (id) ON DELETE CASCADE,
    -- Abweichende Mindestbesetzung fuer genau diesen Block; NULL = Bereichswert.
    min_staff    INTEGER CHECK (min_staff IS NULL OR min_staff >= 0),
    PRIMARY KEY (work_area_id, day_block_id)
);

-- ---------------------------------------------------------- Einsatz-Matrix --

-- Herzstueck: fasst Freigabe, Praeferenz und Regeln je (Person, Bereich)
-- zusammen. Die Betreuungspflicht haengt an der Kombination, nicht an der
-- Rolle - von zwei Auszubildenden darf die eine allein ins Labor.
CREATE TABLE employee_area_matrix (
    employee_id     TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    work_area_id    TEXT NOT NULL REFERENCES work_areas (id) ON DELETE CASCADE,
    clearance       TEXT NOT NULL DEFAULT 'solo'
                        CHECK (clearance IN ('solo', 'supervised', 'blocked')),
    preference      TEXT NOT NULL DEFAULT 'neutral'
                        CHECK (preference IN ('preferred', 'neutral', 'dislike', 'never')),
    min_per_week    INTEGER CHECK (min_per_week IS NULL OR min_per_week >= 0),
    max_per_week    INTEGER CHECK (max_per_week IS NULL OR max_per_week >= 0),
    exempt_rotation INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (employee_id, work_area_id),
    CHECK (min_per_week IS NULL OR max_per_week IS NULL OR min_per_week <= max_per_week)
);

-- ------------------------------------------------------- Musterwoche/Plan --

-- Musterwoche: wer ist normalerweise wo. Jede konkrete Woche entsteht daraus.
CREATE TABLE template_assignments (
    id           TEXT PRIMARY KEY,
    employee_id  TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    work_area_id TEXT NOT NULL REFERENCES work_areas (id) ON DELETE CASCADE,
    day_block_id TEXT NOT NULL REFERENCES day_blocks (id) ON DELETE CASCADE,
    -- Eine Person kann pro Block nur an einem Ort sein.
    UNIQUE (employee_id, day_block_id)
);
CREATE INDEX ix_template_area ON template_assignments (work_area_id);

CREATE TABLE assignments (
    id           TEXT PRIMARY KEY,
    date         TEXT NOT NULL,
    day_block_id TEXT NOT NULL REFERENCES day_blocks (id) ON DELETE CASCADE,
    work_area_id TEXT NOT NULL REFERENCES work_areas (id) ON DELETE CASCADE,
    employee_id  TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    source       TEXT NOT NULL CHECK (source IN ('template', 'auto', 'manual')),
    is_locked    INTEGER NOT NULL DEFAULT 0,
    reason       TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
-- "Eine Person, ein Ort je Block" als Datenbank-Invariante. In v1 konnte
-- dieselbe Person mehrfach im selben Slot landen.
CREATE UNIQUE INDEX ux_assign_one_place ON assignments (date, day_block_id, employee_id);
CREATE INDEX ix_assign_week ON assignments (date, work_area_id);

-- ------------------------------------------------------------ Abwesenheit --

CREATE TABLE absences (
    id          TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (
                    type IN ('vacation', 'sick', 'training', 'school', 'special', 'timeoff')),
    status      TEXT NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested', 'approved', 'rejected')),
    -- NULL = ganztags. Nur bei eintaegigen Abwesenheiten sinnvoll.
    half_day    TEXT CHECK (half_day IS NULL OR half_day IN ('am', 'pm')),
    note        TEXT NOT NULL DEFAULT '',
    created_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
    decided_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
    decided_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date >= start_date),
    CHECK (half_day IS NULL OR start_date = end_date)
);
CREATE INDEX ix_absences_employee ON absences (employee_id, start_date, end_date);
CREATE INDEX ix_absences_range ON absences (start_date, end_date);

-- Wiederkehrende Abwesenheiten, vor allem Berufsschultage.
CREATE TABLE recurring_absences (
    id          TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 5),
    type        TEXT NOT NULL DEFAULT 'school',
    valid_from  TEXT NOT NULL,
    valid_to    TEXT,
    note        TEXT NOT NULL DEFAULT '',
    CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX ix_recurring_employee ON recurring_absences (employee_id);

CREATE TABLE closures (
    id             TEXT PRIMARY KEY,
    start_date     TEXT NOT NULL,
    end_date       TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    skeleton_staff INTEGER NOT NULL DEFAULT 1 CHECK (skeleton_staff >= 0),
    CHECK (end_date >= start_date)
);

-- --------------------------------------------------------------- Konten ---

CREATE TABLE vacation_accounts (
    employee_id       TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    year              INTEGER NOT NULL,
    entitlement       REAL NOT NULL DEFAULT 0 CHECK (entitlement >= 0),
    carryover         REAL NOT NULL DEFAULT 0,
    carryover_expires TEXT,
    PRIMARY KEY (employee_id, year)
);
-- "verbraucht" wird bewusst NICHT gespeichert, sondern aus absences
-- berechnet. Ein persistierter Zaehler laeuft frueher oder spaeter aus dem Ruder.

-- Ueberstunden als Buchungsliste statt als mutierbarem Saldo: so bleibt
-- nachvollziehbar, woher der Stand kommt.
CREATE TABLE overtime_entries (
    id          TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    hours       REAL NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    created_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_overtime_employee ON overtime_entries (employee_id, date);

-- ------------------------------------------------ Einstellungen/Protokoll --

-- Alle Konfiguration als JSON-Werte, inklusive der Scheduler-Gewichte.
-- Die gehoeren bewusst hierher und nicht als Zahlenliterale in den Code.
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL DEFAULT (datetime('now')),
    user_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
    action    TEXT NOT NULL,
    entity    TEXT NOT NULL,
    entity_id TEXT,
    detail    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ix_audit_at ON audit_log (at);
