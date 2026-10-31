# CrossPaths — handover

## What the app does

CrossPaths answers "did our paths ever cross?". Two people each upload a location history (a
Google Maps Timeline export, GPX/TCX/FIT/KML/GeoJSON/CSV files from fitness and GPS apps, Swarm
check-ins, or one built from the GPS data in their photos), agree
to a check, and the server finds every time they were within 100 m of each other within the same
15 minutes. Results open on a summary dashboard and drill into a map and list.

Main features:
- **Matching:** three kinds of crossing: *same place* (both staying put), *crossed paths*
  (passing through the same spot) and *travelled together* (same road, bus or train at the same
  time). Flights are never matched.
- **Results summary:** count, days, total time together, places, longest crossing, by type, top
  places and cities, per month or year, time of day, day of week, highlights. Every chart can
  be shown as a table, and tapping a chart drills into the map.
- **Map and list:**
  - a heat map when zoomed out (gone by zoom 10.5), coloured dots per type when zoomed in, and
    tapping a hot spot zooms into it;
  - a draggable bottom sheet with three heights (peek, half, nearly full);
  - opening a crossing replaces the list with its details (place, street lookup, how far apart
    in time) and a replay of **only your own** path around it;
  - filters (type, year, city, place, minimum length, text, visible map area) and sort (newest,
    oldest, longest).
- **Place names offline** from GeoNames, in English and Arabic. Places far from any town are
  named like "91 km SE of Rumāḩ", and the coordinates are shown when no name is found. Street
  names come from OpenStreetMap, only when the user taps "Show street name".
- **Connecting:** by username request, or in person with a QR code, an invite link
  (`crosspaths://pair/CODE`) or shaking both phones. Connecting in person connects *and* runs the
  check in one step.
- **My Timeline:** browse your own upload by year, month and day on a map, with replay, and
  search for every visit to a place.
- **Adding a timeline:** two choices on both clients.
  - *Import a timeline*: pick a source (Google Maps, Strava, Apple Health, Samsung Health,
    Garmin, Fitbit/Google Fit, Swarm, other apps) to see how to export from it, then choose one
    file, several, or a .zip. `crosspaths/importers.py` recognises each file by content: GPX, TCX,
    FIT (own minimal reader), KML/KMZ, GeoJSON, CSV (any lat/lon/time column names), Swarm
    check-ins, generic JSON point lists (Samsung `location_data.json`, OwnTracks, Dawarich) and
    Google's formats. Zips (also nested, e.g. Garmin) and .gz are opened; all files become one
    timeline. The guide text lives in `mobile/src/importSources.js` and `SOURCES` in the web
    client; keep them in step.
  - *Scan my photos*: the app scans the phone's library; the web client reads EXIF from photos
    the user picks, in the browser. Only `{t, lat, lon}` points are uploaded.
- **Settings:**
  - theme: system, dark or light, plus five accent colours;
  - per-user upload retention: 24 h (default), 7 days, 30 days, or until deleted;
  - two server addresses (home LAN + Tailscale) with automatic switching.
- **Trust:** a heuristic check flags timelines that look fake or edited, shown as a warning on
  results.

## Platform and parts

| Part | Folder | Type |
|---|---|---|
| Server + web client | `server/` | Python (Flask) server for the NAS, runs in **Docker** on a Synology (ARM64 and x86). Serves the REST API and a single-page web client (`server/server/static/index.html`, installable as a PWA over HTTPS). |
| Mobile app | `mobile/` | **Android app** built with Expo SDK 51 / React Native 0.74 (prebuilt bare `android/` folder is committed). iOS project exists (`mobile/ios/`) but has never been built. |
| Store assets | `store-listing/` | Play Store screenshots (1080×1920), feature graphic, 512 icon, listing text. Not code. |

## Identity

**Android**
- `applicationId` / namespace: `com.example.crosspaths`. **This must change before Play**: Play
  rejects `com.example.*`. The suggested name is `com.abu.crosspaths`. Changing it makes it a new
  app for anyone with the sideloaded version, so they'll need to install it fresh.
- `versionCode` **8**, `versionName` **1.7.0** (in `mobile/app.json` and
  `mobile/android/app/build.gradle`). `package.json` still says 1.0.0; ignore it.
- **Signing:** there's no own key yet. Release builds are signed with React Native's stock
  **debug keystore** (`android/app/debug.keystore`, alias `androiddebugkey`; deliberately not in
  this zip). Cert SHA-256 starts `fac61745dc09…`. All APKs so far (1.1.0–1.6.0) used it, so they
  install over each other. A real release key is needed for Play, which forces a reinstall (do
  it together with the package rename).
- URL scheme: `crosspaths://`.

**iOS:** `bundleIdentifier` `com.example.crosspaths` (placeholder; `com.abu.crosspaths` was
planned), `buildNumber` 4. Waiting on the owner's Apple Developer enrollment; plan was EAS build
and then TestFlight. `eas.json` exists, but there's no EAS `projectId` yet.

**Server:** version in `server/VERSION`, currently **0.12.0**, reported at `GET /api/config`.
Entry point `server/wsgi.py` → `server.app:create_app()`. Run by gunicorn: 1 worker, 8 threads,
port 8787.

## How it's built and run

### Server (NAS)
```bash
cd server
docker compose up -d --build        # first time, or when requirements.txt / Dockerfile change
```
`docker-compose.yml` bind-mounts the code read-only:
- `./server`
- `./crosspaths`
- `./wsgi.py`
- `./VERSION`

So **most updates are "copy those four in, restart the container"**, with no rebuild. Never touch
`./data`.

Tests (55 passing), from `server/`:
```bash
pip install -r requirements.txt pytest
python -m pytest -q
```
The tests never touch the network (`PLACE_NAMES=False` in tests).

Local dev: `DATA_DIR=./data python -c "from server.app import create_app; create_app().run(port=8787)"`.

Deployment notes for Synology (Container Manager, Tailscale, HTTPS options) are in
`server/DEPLOY-SYNOLOGY.md`. The changelog is in `server/CHANGELOG.md`.

### Mobile (Android APK)
Requirements:
- Node 18+;
- JDK 17–21;
- Android SDK (API 34);
- `mobile/android/local.properties` with `sdk.dir=…` (not committed).

```bash
cd mobile
npm ci
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableProguardInReleaseBuilds=true -Pandroid.enableShrinkResourcesInReleaseBuilds=true
# -> android/app/build/outputs/apk/release/app-release.apk  (~18 MB)
```
- **Signing:** release signing in `build.gradle` points at `android/app/debug.keystore`. Provide
  that file (the stock RN debug keystore) or, better, switch `signingConfigs` to a real release
  key supplied by CI secrets.
- **Build flags:** keep the minify flags and arm64-only. Without them the APK is ~23 MB.
  `expo.useLegacyPackaging=true` is set in `gradle.properties` and by the config plugin.
- **Prebuild:** `android/` came from `expo prebuild`, plus `plugins/withCrossPathsAndroid.js`
  (allows plain-HTTP traffic for LAN servers, legacy packaging, arm64 `abiFilters`). Re-running
  `npx expo prebuild --platform android` should reproduce it. Last time it wiped
  `local.properties`, and a later `packagingOptions` block overrode legacy packaging; that's why
  the plugin and the gradle property both exist.
- **First run:** the app asks for the server address (Account → Server addresses).
  `extra.apiUrl` in `app.json` is only a placeholder.

## Where data lives, external services, ports

**Server port:** 8787 (HTTP). The web client and API are on the same port.

**Data:** everything is in `DATA_DIR` (`/data` in the container = `./data` on the NAS):
- `crosspaths.db`: SQLite (users, connections, uploads metadata, checks, crossing events, pairing
  codes, rate-limit counters, audit log). Migrations run at start-up via `PRAGMA table_info` /
  `PRAGMA user_version` in `server/server/db.py`.
- `keys.json`: generated `SECRET_KEY` and `DATA_KEY` if they're not set in the environment.
  **Losing it signs everyone out and makes stored uploads unreadable.**
- `uploads/<id>.bin`: raw timelines, Fernet-encrypted with `DATA_KEY`. Purged on each user's
  retention setting by an hourly loop.
- `places/`: GeoNames cache (`cities500.txt`, about 40 MB, plus small per-country files),
  downloaded on first use.
- Results, including each user's own track windows ±3 h around crossings, expire after
  `RESULTS_TTL_DAYS` (14).

**External services:**
- `download.geonames.org`: place names, from the server, once.
- OpenFreeMap tiles (`MAP_STYLE_URL`, default `https://tiles.openfreemap.org/styles/liberty`):
  map backgrounds, from the clients.
- `nominatim.openstreetmap.org`: street names, client-side, only on tap. The web needs
  `referrerPolicy: "origin"`; mobile sends a User-Agent.
- unpkg (MapLibre GL JS 4.7.1) and cdnjs (qrcode-generator): loaded by the web client.
- Expo push service: notifications are skipped when there's no EAS `projectId`.

**Mobile, on the device:**
- SecureStore holds: the token, the home and Tailscale server URLs, the auto-switch flag, the
  last active URL, the server `instance` and the theme.
- Nothing else is stored on the device.

## Secrets

- **Server:**
  - `SECRET_KEY` (JWT signing) and `DATA_KEY` (Fernet key for uploads): set in the environment,
    or auto-generated into `data/keys.json`.
  - `INVITE_CODE` (optional, required at sign-up when set).
  - All other environment variables are plain settings; see `server/.env.example` and
    `server/server/config.py`.
- **Mobile:** none built in. A release keystore and passwords will be needed (names to use in
  CI: e.g. `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`).

## Known bugs, unfinished work, next ideas

**Not yet verified on a real phone.** There was no emulator in the build environment, so
1.4.0–1.6.0 were checked by lint, Node unit tests and builds only. Try these first:
- the draggable results sheet;
- the Summary scroll fix: the sheet is hidden while Summary is shown, because Android
  hit-tests by elevation;
- a theme switch: the navigator remounts and should keep your place;
- the one-line chip rows with edge arrows;
- Tailscale auto-switching.

**Publishing to Play:**
- Rename the package and create a real signing key.
- Reviewer access: the server must be reachable publicly during review (Cloudflare Tunnel or
  Tailscale Funnel), with a demo account.
- A privacy policy URL and the Data safety form are required.
- The store screenshots in `store-listing/` were rendered from the **web client** at phone size,
  with the web top bar hidden and demo accounts @sara and @omar. Swap them for real phone
  captures if they differ.

**Other platform work:**
- **iOS:** never built. Needs the bundle ID, an EAS project and TestFlight.
- **Push notifications** need an EAS `projectId`; until then registration is skipped.

**Scale and hosting:**
- **Web install (PWA)** needs HTTPS: `tailscale serve` or a reverse proxy.
- **Scale:** SQLite and one gunicorn worker are deliberate for a 2 GB NAS. There's a
  PostgreSQL/PostGIS schema for a larger version in `server/sql/schema.sql`, which is unused.

**Small cleanups:**
- The `package.json` version is stale.
- Some ESLint warnings for unused imports (no errors).
- The owner once sent "Change serving answer"; it was never clarified, so it's open.

**Importers:** written from documentation and synthetic files, not real exports. Check one real
export each from Strava, Apple Health, Samsung Health, Garmin and Swarm. Unconfirmed details: Swarm's
`createdAt` text dates are assumed to be UTC, and Samsung's `location_data.json` field names
(`start_time`, `latitude`, `longitude`) come from third-party notes. Whole exports with photos
(Strava) or ECGs (Apple) are often over `MAX_UPLOAD_MB`; the guides tell people to pick just the
route files then. Separate workouts close together in place (within 200 m and 6 h) are joined as
"stayed put" by the matcher, the same as Google data.

**Ideas raised but not built:**
- Read Health Connect exercise routes directly on Android (live, no export needed).
- Flights, ride-hailing trips, calendar and ticket history as "same event" matches.
- Push a notification when a check finishes.
- Real phone screenshots for the store.

## Important decisions (don't undo these)

**Privacy model**
- Nothing is compared until both people agree to that check. Connecting in person (QR, link,
  shake) counts as both agreeing.
- The API never returns the other person's track. `/my-track` returns only the caller's own
  windows ±3 h around crossings.
- Times are rounded to 15 min and places blurred about 100 m (`BLUR_M`).
- Home and work zones are auto-detected and excluded.
- Overlapping rounded windows are merged into one crossing (`crosspaths/privacy.py`).
- Raw uploads are encrypted at rest and deleted on the user's retention setting (24 h default).
  "Until deleted" is stored as `purge_after = 32503680000` (year 3000), because the column is
  `NOT NULL`. The API shows it as `expires_at: null`. Choosing a shorter time deletes older
  uploads immediately. The server can cap it with `UPLOAD_KEEP_MAX_DAYS`.

**Matching** (`crosspaths/matcher.py`)
- A KD-tree finds candidate pairs.
- Segments faster than 70 m/s (flights) are never matched.
- A moving crossing is located at its most-simultaneous pair; its kind uses time-weighted speed.

**Place names**
- Names come from **offline GeoNames on the server**: no third-party reverse-geocoding of
  everyone's crossings. City choice weighs distance by population.
- Street names are fetched only by the client, on tap.
- A one-time `user_version` migration reset empty names, so old crossings get re-named.

**Maps**
- Both clients use **MapLibre**, not Google Maps: no API key, and free OpenFreeMap tiles.
  Android used to show a blank map before this.
- In GL JS, **never pass `padding` to `easeTo`**: it sticks to the map and is added to later
  `fitBounds` padding, which silently breaks framing. Use `offset`.
- The heat map ends at zoom 10.5 and dots fade in from 8.5. Below zoom 9, a tap zooms in rather
  than selecting. Heat weight is 0.3–1, so lone crossings stay faint.

**Server addresses**
- `/api/config` returns `instance` (derived from `SECRET_KEY`).
- The app only auto-switches between addresses with the same `instance`, so a token is never
  sent to a different server.
- Home is preferred whenever it answers. After a failure the app re-checks and retries
  **once**, but a POST that *timed out* is never resent (it may have reached the server).

**Mobile UI**
- **Theme:** `colors` in `src/theme.js` is one mutable object. A theme change rewrites it and
  the `NavigationContainer` remounts, keyed on the theme with its nav state preserved. Don't
  capture colours in `StyleSheet.create`.
- **Dates:** the interface is English and dates use an English locale even on Arabic phones,
  to avoid Hijri dates mixed into English. Place names still follow the device language
  (Arabic names from GeoNames).

**Builds and deployment**
- **APK:** arm64-only, minified, legacy packaging (about 18 MB).
- **NAS updates:** code is bind-mounted read-only so updates are "copy and restart". The
  `data/` folder holds everything that matters.
