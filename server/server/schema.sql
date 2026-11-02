-- SQLite schema for the proof-of-concept server (single container).
-- The PostgreSQL/PostGIS equivalent for the scaled-up version is ../sql/schema.sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    handle       TEXT NOT NULL UNIQUE,
    display_name TEXT,
    pw_hash      TEXT NOT NULL,
    created_at   REAL NOT NULL,
    keep_hours   REAL            -- how long their raw uploads are kept; NULL = server default, 0 = until they delete them
);

CREATE TABLE IF NOT EXISTS connections (
    id           TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','blocked')),
    created_at   REAL NOT NULL,
    responded_at REAL,
    CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS connections_pair_uq
    ON connections (min(requester_id, addressee_id), max(requester_id, addressee_id));

CREATE TABLE IF NOT EXISTS uploads (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fmt           TEXT NOT NULL,
    points_count  INTEGER NOT NULL,
    ts_min        REAL, ts_max REAL,
    trust_score   INTEGER, trust_level TEXT, trust_reasons TEXT NOT NULL DEFAULT '[]',
    sha256        TEXT NOT NULL,
    zones         TEXT NOT NULL DEFAULT '[]',     -- home/work exclusion zones (auto-detected, user-editable)
    created_at    REAL NOT NULL,
    purge_after   REAL NOT NULL,
    purged_at     REAL,
    sources       TEXT                            -- JSON list of what it was built from (NULL on uploads before 0.13.0)
);
CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uploads_sha_idx  ON uploads (sha256);

CREATE TABLE IF NOT EXISTS checks (
    id            TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    initiated_by  TEXT NOT NULL REFERENCES users(id),
    radius_m      INTEGER NOT NULL,
    window_s      INTEGER NOT NULL,
    status        TEXT NOT NULL,   -- awaiting_consent | running | done | failed | declined | expired
    created_at    REAL NOT NULL,
    finished_at   REAL,
    expires_at    REAL NOT NULL,
    results_expire REAL,
    error         TEXT
);

CREATE TABLE IF NOT EXISTS check_participants (
    check_id     TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id    TEXT REFERENCES uploads(id) ON DELETE SET NULL,
    date_from    REAL, date_to REAL,
    consented_at REAL,
    trust_level  TEXT,                         -- snapshot of the upload's trust level
    track_json   TEXT,                         -- the user's OWN thinned track, for their map only
    PRIMARY KEY (check_id, user_id)
);

CREATE TABLE IF NOT EXISTS crossing_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    check_id     TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    starts_at    TEXT NOT NULL,
    ends_at      TEXT NOT NULL,
    lat          REAL NOT NULL, lon REAL NOT NULL,
    blur_m       INTEGER NOT NULL,
    kind         TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    offset_min   INTEGER NOT NULL,
    place        TEXT,            -- "Al Murūj, Riyadh"; NULL = not named yet, '' = nothing nearby
    place_ar     TEXT,
    landmark     TEXT,
    landmark_ar  TEXT
);
CREATE INDEX IF NOT EXISTS crossing_events_check_idx ON crossing_events (check_id, starts_at);

CREATE TABLE IF NOT EXISTS devices (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform   TEXT NOT NULL CHECK (platform IN ('ios','android')),
    push_token TEXT NOT NULL,
    created_at REAL NOT NULL,
    last_seen  REAL NOT NULL,
    UNIQUE (user_id, push_token)
);

CREATE TABLE IF NOT EXISTS usage_counters (
    user_id TEXT NOT NULL, action TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, action, day)
);
CREATE TABLE IF NOT EXISTS login_failures (handle TEXT NOT NULL, at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS login_failures_idx ON login_failures (handle, at);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, user_id TEXT, action TEXT NOT NULL, ref_id TEXT, meta TEXT
);

-- In-person pairing: a short-lived code shown as a QR / sent as a link, single use.
CREATE TABLE IF NOT EXISTS pair_codes (
    code       TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id  TEXT,
    radius_m   INTEGER NOT NULL,
    window_s   INTEGER NOT NULL,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL,
    used_at    REAL,
    redeemed_by TEXT,            -- who scanned it (so the person showing the QR sees the result)
    check_id   TEXT,
    note       TEXT
);

-- "Shake to connect": two shakes close in time and place pair up. Kept for minutes only.
CREATE TABLE IF NOT EXISTS shakes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    upload_id   TEXT,
    lat         REAL NOT NULL,
    lon         REAL NOT NULL,
    acc         REAL NOT NULL,
    at          REAL NOT NULL,
    status      TEXT NOT NULL DEFAULT 'waiting',   -- waiting | paired | ambiguous
    result      TEXT
);
CREATE INDEX IF NOT EXISTS shakes_at_idx ON shakes (at);
