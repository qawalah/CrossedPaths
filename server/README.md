# CrossPaths - did our paths ever cross?

Two people (friends or strangers) each upload their Google Timeline export. After both
accept a request and consent to a check, the app lists every place and time their paths
crossed, on a map with an animated replay.

What's here: the **engine** (parser, matcher, privacy layer, spoof scoring), a **Flask API +
SQLite server**, an installable **web app (PWA)** for iPhone/Android/desktop, and Docker files for
deployment. A native Expo app and the Postgres/PostGIS path are the next steps.

```
crosspaths/            python package
  parser.py            Records.json, Semantic Location History, on-device export -> Points
  matcher.py           densify -> 4-D KD-tree join -> merge into events
  privacy.py           home/work auto-exclusion, ~100 m blur, 15-min time rounding
  spoofcheck.py        trust score (teleports, ruler-straight runs, constant speed, ...)
  pipeline.py          run_check(a, b, params) -> shareable result
  secure.py            prototype: ECDH + HMAC token exchange, no raw timeline ever leaves the phone
  cli.py               python -m crosspaths.cli a.json b.json
server/                Flask API, SQLite schema, encrypted storage, background runner, web app (static/)
wsgi.py, Dockerfile, docker-compose.yml, .env.example, DEPLOY.md
sql/schema.sql         Postgres + PostGIS schema for the scaled-up version (not used by the PoC server)
tests/                 synthetic two-person week; engine + API + secure-prototype tests (23 total)
samples/               generated demo files
```

## Run it

```bash
pip install -r requirements.txt
python3 tests/test_pipeline.py && python3 tests/test_api.py
python3 -m crosspaths.cli samples/person_a_on_device.json samples/person_b_records.json
```

The demo week contains a real café meeting, a head-on pass on a road, a near miss 245 m
apart, a same-café visit 3.5 h apart, and a shared office. Expected result: the café and
the road pass are reported; the near misses are not; the office is auto-excluded as a
home/work zone.

## How matching works

1. **Parse** any supported export into `(t, lat, lon)` points.
2. **Densify** every gap by time (<= 60 s) *and* distance (<= radius/2). Without this, two cars
   closing at 30 m/s can pass within 100 m while every logged fix is 1 km away.
3. **Join** in a KD-tree over `(x, y, z, scaled time)`, then confirm real distance and time.
4. **Time tolerance depends on behaviour.** If at least one person is stationary (cafe, bus stop)
   the full window applies (default 15 min). If both are moving, only near-simultaneous passes
   count (3 min); otherwise everyone commuting on the same road matches.
5. **Merge** consecutive hits into one event; split on a time gap or spatial jump.
6. **Sanitise** for the other party: blurred centre, rounded times, no distances.

Defaults: 100 m, 15 min, all adjustable per check. Measured: 52 weeks of synthetic data in ~2.5 s.

## Privacy design

- Nothing runs until both users consent to that specific check (`check_participants.consented_at`).
- The counterpart only sees crossing events, never raw points.
- Home/work zones are auto-detected and excluded; users confirm/edit them before a check.
- Each user can trim their own date range.
- Raw uploads and densified samples are purged after 24 h by default.
- Rate limits and per-pair check limits (`usage_counters`) make it costly to map someone's
  movements by uploading fabricated tracks.

## Spoofing / VPN

- **VPN:** irrelevant to the file. Timeline is derived from GPS, Wi-Fi, cell and motion sensors.
  Use IP/VPN signals only for account abuse (signup/login), not for timeline validation.
- **Spoofing:** an exported JSON is unsigned, so authenticity cannot be proven. `spoofcheck.assess()`
  returns a 0-100 score and reasons. The counterpart sees only `high / medium / low`.
  Play Integrity (Android) / App Attest (iOS) only help if location is later captured inside
  your own app.

## Run the server

```bash
DATA_DIR=./data python3 -m flask --app wsgi run --port 8787      # dev
docker compose up -d --build                                    # production (see DEPLOY.md)
```

## API surface (implemented in server/app.py)

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | username + password or passkey |
| POST | `/uploads` | upload export, returns format, date range, trust level, detected zones |
| PUT | `/uploads/{id}/zones` | edit exclusion zones |
| POST | `/connections` `{handle}` | send request to @username |
| POST | `/connections/{id}/respond` `{action}` | accept / decline / block |
| POST | `/checks` | create check (connection, upload, radius, window, dates); creator's consent implied |
| POST | `/checks/{id}/consent` `{upload_id, date_from, date_to}` | second party consents; runs when both have |
| GET | `/checks/{id}` | status + events for the list and map |
| GET | `/checks/{id}/my-track` | the caller's OWN thinned path, for their map only |

All paths are under `/api`. The app polls for progress (no WebSocket yet).

## External services

No Google API is involved. Needed: map tiles (MapTiler / Stadia; the public OSM tile server is not
for production), optional reverse geocoding (Geoapify / Nominatim / Google Places), push
(FCM + APNs). Hosting: Postgres+PostGIS, object storage, one small API container.

## App

Two clients now exist:
- **Web app** (`server/static/`): a PWA, installed via "Add to Home Screen". No build step.
- **Native app** (separate `crosspaths-app/` project): Expo/React Native for iOS + Android,
  same API, plus real map (`react-native-maps`) and push notifications through Expo's push
  service (the server posts to `/api/devices`' registered tokens — see `server/notifications.py`).
  See `crosspaths-app/README.md` for setup and EAS build instructions.

Design notes shared by both:

- **Map:** MapLibre. Each timeline draws itself progressively; crossing points pulse.
- **Time scrubber:** replays YOUR path through time and lights up crossings as you reach them
  (the other person's path is never sent to you, so it can't replay both people).
- **Split screen:** top half map, bottom half list. The list sheet slides up after the check;
  tapping an event flies the camera there and highlights the row.
- **Native later:** Reanimated, Lottie, MapLibre RN — for now `crosspaths-app` uses plain
  `Animated`/`Slider` and `react-native-maps`, which cover the same interactions.
- **States:** request pending -> accepted -> both consented -> matching (animated) -> results.

## Roadmap to the "secure" version (no raw timelines on the server)

1. **On-device matching, exchange only tokens — prototyped in `crosspaths/secure.py`.**
   Each phone derives, for every (grid cell, time-bucket) it visited, `HMAC(pair_key, cell || bucket)`,
   where `pair_key` comes from an X25519 ECDH exchange scoped to that one check. Both sides also hash
   their 8 neighbouring cells and neighbouring time bucket ("dilation"), so a real crossing that lands
   just across a grid line isn't missed. The two token sets are exchanged (a server would only ever
   relay opaque hashes) and intersected; each side reconstructs the crossing time/place from its own
   samples only. See `tests/test_secure.py` — 5 tests, including one confirming an eavesdropper without
   the shared key gets zero overlap, and one showing dilation recovers a boundary-straddling crossing
   that a non-dilated version would miss.
   **Known costs, measured on the demo dataset:** dilation multiplies the token count by ~27x
   (a week of resampled points -> ~16k tokens, ~500 KB; 12 weeks -> ~190k tokens, ~6 MB, ~10s to
   tokenize on this container). That's fine for two phones exchanging a check's worth of data, but
   for anything beyond a few months the track should be thinned (e.g. cluster stationary periods,
   as `server/runner.py::thin_track` already does for the map view) before tokenizing.
   **Not yet done:** wiring this into the Flask API in place of the raw-upload flow, and moving key
   exchange + intersection onto the phones themselves rather than a demo function.
2. **Private set intersection (OPRF-based PSI)** to remove even the residual risk of an eavesdropper
   brute-forcing the (small) space of plausible cells for a given key — the weakness the HMAC approach
   above still has, since it's PSI via a shared secret rather than a true oblivious PRF.
3. **Confidential-compute (TEE) matcher** as a middle path if PSI is too heavy.
4. In-app capture with Play Integrity / App Attest for a verified-location tier.

## Known limits

- **Web app not tested in a real browser** (only JS syntax-checked; the API is fully tested). Expect small UI fixes.
- **Docker deployment not tested** in production; map tiles need internet from the phone.
- The server's login tokens live in the browser's localStorage; fine for a PoC with friends, use passkeys/httpOnly cookies before going public.
- **Export schema:** written from knowledge of Google's formats, tested only on synthetic data.
  Google has changed the format before; check a real export from each platform before launch.
- `sql/schema.sql` was not run against a live Postgres in this environment.
- Head-on passes between two moving people are reported as 3-minute-wide events over a ~2.7 km
  stretch by design (positional tolerance of the timeline itself).
- Two people who commute to the same workplace will share their final approach, outside the
  400 m zone. Users can widen zones.
- Densifying by distance is fine for a PoC; for years of driving data, move to segment-vs-segment
  intersection or the PostGIS path.
