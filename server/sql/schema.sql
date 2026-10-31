-- =====================================================================
-- CrossPaths - PostgreSQL 15+ / PostGIS 3 schema  (proof-of-concept, server-side matching)
--
-- Privacy principles baked into the schema:
--   * Raw timelines are short-lived: uploads.purge_after + a nightly purge job.
--   * The counterpart never gets coordinates - crossing_events stores ONLY blurred
--     centres and rounded times (see crosspaths/privacy.py).
--   * Nothing runs until BOTH sides have consented to a specific check.
-- In the "secure" phase, track_samples disappears entirely (matching moves on-device).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- enums ----------
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'declined', 'blocked', 'revoked');
CREATE TYPE check_status      AS ENUM ('awaiting_consent', 'awaiting_uploads', 'running', 'done',
                                       'expired', 'cancelled', 'failed');
CREATE TYPE crossing_kind     AS ENUM ('same_place', 'passing', 'shared_route');
CREATE TYPE trust_level       AS ENUM ('high', 'medium', 'low', 'insufficient');
CREATE TYPE upload_format     AS ENUM ('records', 'semantic-history', 'on-device', 'segments-list');

-- ---------- identity ----------
CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    handle        citext NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_.]{3,30}$'),  -- the @username
    display_name  text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    disabled_at   timestamptz
);

CREATE TABLE auth_credentials (              -- password and/or passkey; never store plain secrets
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind           text NOT NULL CHECK (kind IN ('password', 'passkey')),
    password_hash  text,                     -- argon2id
    passkey_id     bytea,                    -- WebAuthn credential id
    passkey_pubkey bytea,
    sign_count     bigint,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (passkey_id)
);

CREATE TABLE devices (                       -- push targets (FCM / APNs)
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform    text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    push_token  text NOT NULL,
    last_seen   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, push_token)
);

-- ---------- friend / stranger requests ----------
CREATE TABLE connections (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        connection_status NOT NULL DEFAULT 'pending',
    message       text CHECK (char_length(message) <= 280),
    created_at    timestamptz NOT NULL DEFAULT now(),
    responded_at  timestamptz,
    CHECK (requester_id <> addressee_id)
);
-- one connection per pair, regardless of who asked first
CREATE UNIQUE INDEX connections_pair_uq
    ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX connections_addressee_idx ON connections (addressee_id, status);

-- ---------- uploads (raw timeline files) ----------
CREATE TABLE uploads (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    format         upload_format NOT NULL,
    points_count   integer NOT NULL,
    ts_min         timestamptz,
    ts_max         timestamptz,
    trust_score    smallint CHECK (trust_score BETWEEN 0 AND 100),
    trust_level    trust_level,
    trust_reasons  jsonb NOT NULL DEFAULT '[]',   -- visible to the uploader + admins only
    sha256         bytea NOT NULL,                -- detect the same file re-uploaded under many accounts
    blob_key       text,                          -- encrypted object in S3/GCS; NULL once purged
    created_at     timestamptz NOT NULL DEFAULT now(),
    purge_after    timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX uploads_user_idx ON uploads (user_id, created_at DESC);
CREATE INDEX uploads_sha_idx  ON uploads (sha256);

-- Densified samples used by the SQL matcher (PoC only). The Python engine resamples
-- (time AND distance) and COPYs rows here; see crosspaths/matcher.py::resample.
CREATE TABLE track_samples (
    upload_id  uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    t          timestamptz NOT NULL,
    geom       geography(Point, 4326) NOT NULL,
    speed_ms   real NOT NULL
) PARTITION BY HASH (upload_id);
-- create e.g. 16 hash partitions in a migration, then:
CREATE INDEX track_samples_geom_idx ON track_samples USING gist (geom);
CREATE INDEX track_samples_t_idx    ON track_samples USING brin (t);

-- Home / work / any place the user wants excluded from every check.
CREATE TABLE exclusion_zones (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label     text,
    center    geography(Point, 4326) NOT NULL,
    radius_m  integer NOT NULL DEFAULT 400 CHECK (radius_m BETWEEN 50 AND 5000),
    is_auto   boolean NOT NULL DEFAULT false,      -- detected by detect_anchor_zones(), confirmed by the user
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exclusion_zones_user_idx ON exclusion_zones (user_id);

-- ---------- consent-gated checks ----------
CREATE TABLE checks (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id  uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
    initiated_by   uuid NOT NULL REFERENCES users(id),
    radius_m       integer NOT NULL DEFAULT 100 CHECK (radius_m BETWEEN 25 AND 500),
    window_s       integer NOT NULL DEFAULT 900 CHECK (window_s BETWEEN 60 AND 14400),
    status         check_status NOT NULL DEFAULT 'awaiting_consent',
    created_at     timestamptz NOT NULL DEFAULT now(),
    started_at     timestamptz,
    finished_at    timestamptz,
    expires_at     timestamptz NOT NULL DEFAULT now() + interval '7 days',  -- unanswered checks lapse
    results_expire timestamptz,                                              -- results auto-delete unless saved
    error          text
);
CREATE INDEX checks_connection_idx ON checks (connection_id, created_at DESC);

-- One row per participant. The check runs only when BOTH rows have consented_at set.
-- Each user trims their OWN date range and picks which upload to use.
CREATE TABLE check_participants (
    check_id       uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    user_id        uuid NOT NULL REFERENCES users(id),
    upload_id      uuid REFERENCES uploads(id) ON DELETE SET NULL,
    date_from      timestamptz,
    date_to        timestamptz,
    consented_at   timestamptz,
    consent_text_v smallint,                       -- which consent wording they agreed to
    PRIMARY KEY (check_id, user_id)
);

-- What both sides see. Deliberately coarse: blurred centre, rounded times, no distances.
CREATE TABLE crossing_events (
    id            bigserial PRIMARY KEY,
    check_id      uuid NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    starts_at     timestamptz NOT NULL,            -- rounded to 15 min
    ends_at       timestamptz NOT NULL,
    center        geography(Point, 4326) NOT NULL, -- snapped to a ~100 m grid
    blur_m        integer NOT NULL DEFAULT 100,
    kind          crossing_kind NOT NULL,
    duration_min  integer NOT NULL,                -- 5-min buckets
    offset_min    integer NOT NULL DEFAULT 0,      -- how far apart in time (5-min buckets)
    place_label   text,                            -- optional reverse-geocoded name of the blurred cell
    CHECK (ends_at > starts_at)
);
CREATE INDEX crossing_events_check_idx ON crossing_events (check_id, starts_at);

-- ---------- abuse control & audit ----------
CREATE TABLE usage_counters (                       -- sliding-window rate limits
    user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action    text NOT NULL,                        -- 'upload' | 'connection_request' | 'check'
    day       date NOT NULL DEFAULT current_date,
    n         integer NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, action, day)
);

CREATE TABLE audit_log (
    id        bigserial PRIMARY KEY,
    at        timestamptz NOT NULL DEFAULT now(),
    user_id   uuid,
    action    text NOT NULL,                        -- 'consent_given', 'check_run', 'upload_purged', ...
    ref_id    uuid,
    meta      jsonb NOT NULL DEFAULT '{}'
);

-- ---------- SQL matcher (PoC). Same semantics as matcher.py minus the stationary/moving tolerance ----------
-- Both uploads must already be densified into track_samples.
CREATE OR REPLACE FUNCTION find_crossing_pairs(
    up_a uuid, up_b uuid,
    radius_m double precision DEFAULT 100,
    window_s integer DEFAULT 900,
    moving_window_s integer DEFAULT 180,
    still_speed real DEFAULT 1.5
) RETURNS TABLE (a_t timestamptz, b_t timestamptz, dist_m double precision, a_speed real, b_speed real)
LANGUAGE sql STABLE AS $$
    SELECT DISTINCT ON (a.t) a.t, b.t, ST_Distance(a.geom, b.geom), a.speed_ms, b.speed_ms
    FROM track_samples a
    JOIN track_samples b
      ON b.upload_id = up_b
     AND ST_DWithin(a.geom, b.geom, radius_m)                       -- GiST index does the heavy lifting
     AND b.t BETWEEN a.t - make_interval(secs => window_s)
                 AND a.t + make_interval(secs => window_s)
    WHERE a.upload_id = up_a
      AND abs(extract(epoch FROM (b.t - a.t))) <=
          CASE WHEN LEAST(a.speed_ms, b.speed_ms) < still_speed THEN window_s
               ELSE LEAST(moving_window_s, window_s) END
    ORDER BY a.t, ST_Distance(a.geom, b.geom);
$$;

-- ---------- retention job (run nightly) ----------
-- DELETE FROM track_samples WHERE upload_id IN (SELECT id FROM uploads WHERE purge_after < now());
-- UPDATE uploads SET blob_key = NULL WHERE purge_after < now();          -- and delete the object
-- DELETE FROM checks WHERE results_expire < now();                       -- cascades to crossing_events
-- UPDATE checks SET status = 'expired' WHERE status IN ('awaiting_consent','awaiting_uploads') AND expires_at < now();

-- ---------- access control ----------
-- Enable RLS so an app bug can't leak across users:
--   ALTER TABLE crossing_events ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY ce_participants ON crossing_events USING (
--       EXISTS (SELECT 1 FROM check_participants cp
--               WHERE cp.check_id = crossing_events.check_id
--                 AND cp.user_id = current_setting('app.user_id')::uuid));
-- Same pattern for uploads (owner only), exclusion_zones (owner only) and checks (participants only).
