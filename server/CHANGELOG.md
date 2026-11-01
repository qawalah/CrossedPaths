# Changelog

All notable changes to CrossPaths are listed here, newest first. Versioning is
`MAJOR.MINOR.PATCH`: MAJOR for breaking changes (e.g. a database format change with no
migration), MINOR for new features, PATCH for bugfixes. Pre-1.0, expect MINOR bumps often.

To check what's running on your server, visit `/api/config` — it reports the running
`version`. That's the number to compare against this file when deciding whether to update.

## 0.18.0
- **Web: the date bar on My map.** The year / month / day buttons are replaced by the same bar as
  the Android app: drag along it to move through the years, slide up to zoom into months and then
  days (down to zoom out), or hold still, and let go to open the nearest day with data. Bars show
  how many points each day has. A short how-to shows the first time, and from the ? button. The
  zoom gesture and hold time are set on the Account tab.
- **Web: a tutorial on first start.** Five full-screen cards (the animated crossing, then Import,
  Connect, Check together and See where you crossed). Shown once per browser; *Account → Show the
  tutorial again* replays it. The four-step strip under the header is gone, as on Android.
- **Web: Account shows the server version**, so you can see what is running.

## 0.17.2
- **Street maps: the region Geofabrik calls "Israel and Palestine" is shown as "Palestine"**
  (search still finds it by "Israel", Gaza, West Bank and the big cities).

## 0.17.1
- **Street maps: search finds countries that Geofabrik bundles.** Saudi Arabia, Kuwait, Qatar,
  Bahrain, Oman and the UAE are one download called "GCC States" (searching "Saudi" found
  nothing), and Israel and Palestine are one region. The search now also matches those country
  names and a few big cities, and says what each region covers.

## 0.17.0 (Android 1.12.0)
- **Android: a tutorial on first start.** Five full-screen cards you swipe through: the animated
  crossing, then Import, Connect, Check together and See where you crossed, each with its own
  small animation. Shown once; *Account → Show the tutorial again* brings it back. The four-step
  strip at the top of the screens is gone, since the tutorial covers it.
- **Adding a timeline is one thing at a time.** *Import a timeline file* and *Scan my photos*
  each open only their own screen (no second Files / Photos switch). Adding photos, another file
  or your other timelines appears only after something is added, under *Add more to this
  timeline*. Same on the web.
- **"How to export your timeline"** names the list of apps clearly as guides. Each guide links to
  the full illustrated guide in the wiki.

## 0.16.0
- **Street maps: journeys follow the roads.** Sparse histories (Google Timeline above all) keep
  a trip as a handful of points, so the map drew straight lines through buildings and water.
  Now, in countries the admin has downloaded, those stretches are drawn along the streets, both
  on the results replay and in My Timeline. Trains, flights and ferries keep straight lines
  (Google's travel mode is now read and stored; without it, routes much longer than the straight
  line are rejected). Matching is unchanged: this only affects how your own path is drawn.
- **Admins.** New `ADMIN_HANDLES` setting (comma-separated usernames). Admins see *Settings →
  Server (admin) → Street maps* on the web, where they pick countries or regions from
  Geofabrik's list. The server downloads the OpenStreetMap extract, prepares routing data in the
  background (progress shown) into `data/roads/`, and can update or remove it later. Routing runs
  inside the server with Valhalla (`pyvalhalla`); nobody's path leaves it.
- New settings: `STREET_SNAP` (default on), `ROADS_MAX_DOWNLOAD_MB` (default 1500),
  `ROADS_CATALOG_URL`. `mem_limit` in `docker-compose.yml` goes from 900m to 1500m because
  preparing a map needs more memory for a while.
- The image is about 260 MB larger (new `pyvalhalla` dependency). Copy the new
  `docker-compose.yml` settings (`ADMIN_HANDLES`, `mem_limit`) to the NAS folder.
- Check results from before a map was added keep straight lines until the check is run again.

## 0.15.0 (Android 1.11.0)
- **Five tabs:** Import · My Map · Checks · People · Account, in the web client and the Android
  app. Checks is a raised round button in the middle. *Uploads* is now called *Import*.
- **My Map** is its own tab: your timeline on the map by year, month and day (pick which
  timeline when you have several). On Android it used to open only from a timeline's card.
- **Account tab** on the web: theme, accent colour, how long uploads are kept, and Sign out
  (these used to be in the header).
- **New Checks page.** It opens with a big animated version of the app icon: the blue and green
  routes draw in and cross, then the pin drops onto the crossing. Below it is what to do next (run
  a check, review a request, import, connect), and tapping the crossing does it. Previous checks
  are listed underneath and open up for details, results and delete.

## 0.14.0 (Android 1.9.0)
- **A guided path in the web client and the Android app.** A four-step strip under the header (timeline → connect →
  check → crossings) shows where you are and what to do next, with a button for that step. It
  fills in as steps are done and disappears once you have a finished check.
- **"Run a check" invitation.** When you have a timeline and a connection you haven't checked
  with yet (or someone is waiting for your agreement), the Checks tab icon pulses and the Checks
  page opens with a card to start the check in one tap.
- **Motion.** Tabs switch with a sliding indicator and the page slides in from the side of the
  tab you picked; the results page rises in and out, and its Summary / Map switch slides too.
  All of it respects the system "reduce motion" setting.

## 0.13.0
- **Combine sources into one timeline.** A timeline can now be built from several sources at
  once (app files, a photo scan, and your other timelines) and you can add more sources later.
  New: `POST /api/uploads/<id>/sources` (same fields as `POST /api/uploads`). Both take `file`
  (any number) and `merge_ids` (your other timelines); `remove_merged=1` deletes those once they
  are folded in. Duplicate points are dropped; trust and home/work areas are re-checked, keeping
  areas you edited. Adding sources restarts the timeline's retention clock.
- Each timeline lists its sources (`sources`: label, files, points, added_at). The `format`
  field now reads like "Google Maps, GPX, Photos". Timelines from before this version show one source.
- **Export:** `GET /api/uploads/<id>/export?format=gpx|geojson|csv` downloads your own timeline,
  all sources combined. Only ever your own points.
- Web: the Uploads tab builds a timeline from staged sources (Files / Photos / My timelines),
  then offers to export a copy. Each timeline has *＋ Add source* and *Export a copy*.
- Database: new nullable `uploads.sources` column, added automatically at start-up.

## 0.12.2 (Android 1.7.1)
- **One icon style everywhere.** Emoji and text symbols used as icons (tab bar, Back, Play/Pause,
  Filter, Sort, Fit, Delete, warnings, Meet in person, Choose file, Scan photos…) are replaced by
  one set of line icons that matches the app icon, in both the Android app and the web client.
  The three crossing types are redrawn in the same language: a pin (same place), two routes
  crossing (crossed paths) and two routes side by side (travelled together). The set lives in
  `mobile/src/icons.js`, with an identical copy in the web client.
- Web: the settings button's gear icon is no longer squeezed to half width.

## 0.12.1
- **Deploy: updates install themselves.** `docker-compose.yml` now runs the published image
  `ghcr.io/qawalah/crosspaths:latest` with the Watchtower label, instead of building on the
  host and mounting the code. Only `./data` is mounted. To switch, replace `docker-compose.yml`
  on the host (keep `.env` and `data/`) and start the project again. The image is
  `linux/amd64` only; ARM hosts build it themselves. See DEPLOY.md, section 3.

## 0.12.0
- **Import from more apps.** Uploads now accept GPX, TCX, FIT, KML/KMZ, GeoJSON and CSV files
  as well as Google Maps Timeline JSON, so routes from Strava, Apple Health, Samsung Health,
  Garmin, Fitbit, Google Fit, GPS logger apps and Swarm check-ins can be compared. Each file is
  recognised by its content; .zip and .gz archives are opened (whole Strava, Apple Health, Garmin,
  Swarm and Samsung Health exports work as they are, subject to the upload size limit).
- Several files can be uploaded at once and become one timeline. The response says how many
  files had no usable locations (`import.skipped`).
- Swarm check-ins count as a 30-minute stay (shorter if the next check-in comes sooner).
- Dense 1-per-second workout tracks are thinned to one fix per 5 s on import. The "regular
  intervals" fake-timeline check no longer applies to these recordings, since they log on a fixed
  clock by design.
- Zips are read one file at a time and capped at 2× / 8× `MAX_UPLOAD_MB` once unzipped (per
  file / in total). Apple Health's `export.xml` is skipped. XML with entity declarations is refused.
- **Web: two ways to add a timeline.** The Uploads tab now offers *Import a timeline*, with
  step-by-step export guides for each app, or *Scan my photos*, which reads the GPS position and
  time from photos in the browser and uploads only those points.

## 0.11.2
- **New icon.** A map pin standing where a green and a blue route cross, inside a soft blue
  circle (the match radius), on a light tile. Replaces the X everywhere: web client (tab icon,
  install icons, header logo), Android app (launcher, adaptive, round and notification icons),
  the Play Store listing and `store/icon.png`. Every size is generated by
  `node store-listing/icon-src/make-icons.js --design apple`; `--preview sheet.png` compares the
  designs in `store-listing/icon-src/designs.js`.

## 0.11.1
- **App: main + backup address, switching automatically.** Account → Server addresses now
  takes the server's address and (optionally) a backup address. With "Switch
  automatically" on, the app uses the main address when it answers and the backup when it doesn't - checked
  when the app opens, when you return to it, and whenever the server can't be reached (a request
  that fails is retried on the other address, unless it may already have reached the server).
  **Test** checks both addresses. Setup steps: DEPLOY.md, section 2.
- `/api/config` now includes `instance`, a value derived from the server's secret key that's the
  same at every address of one server. The app only switches between addresses of the same
  server, so your sign-in is never sent to a different one.

## 0.11.0
- **New: choose how long your uploaded timeline is kept.** 24 hours (still the default), 7 days,
  30 days, or until you delete it - in the app's Account tab, or Settings (the gear) on the web.
  It applies to timelines you've already uploaded too; choosing a shorter time deletes older
  ones straight away. Server owners can cap it with `UPLOAD_KEEP_MAX_DAYS` (0 = no limit).
- **New: themes.** Light, dark or follow the system, plus five accent colours. Saved per device.
- The three kinds of crossing now have simple line icons instead of emoji.
- Filter chips sit on one line per group and scroll sideways, with fading edges and arrows
  when there's more to see.
- Fixed (web): the grip on the filter and legend sheets had disappeared.

## 0.10.0
- **Results: the list is now a sheet you can drag.** Pull it up to cover most of the screen,
  push it down so the map fills the screen and only its header shows, or tap the grip to step
  between the three heights. The map always frames what you're looking at in the part the
  sheet leaves visible.
- **Tapping a crossing now opens it properly.** Its details replace the list (place, street
  lookup, how far apart you were, your path and replay), with "‹ All crossings" to go back
  to where you were in the list.
- **A real heat map.** Lone crossings are a faint glow and only real clusters burn red; the
  heat fades out by zoom ~10.5 and the individual dots fade in before that. Clicking a hot spot
  while zoomed out zooms into it instead of opening a random crossing.
- The place-accuracy area is a thin dashed ring instead of an orange blob; dots are coloured
  by type.
- **Places in the middle of nowhere get a name** like "91 km SE of Rumāḩ" instead of
  "Unnamed area". Crossings that were saved unnamed are named again on the next view
  (automatic, one-time). If no name can be found, the coordinates are shown.
- Results saved before 0.7 had no path of your own; opening one now says so and suggests
  running the check again (it used to say no path was recorded).
- Fixed: after zooming into a hot spot, opening a crossing could leave the map where it was.

## 0.9.0
- **New: results open on a summary dashboard.** A big headline count, then tiles for days you
  crossed (and the busiest day), total time together, distinct places and the longest
  crossing; the split by type; where you cross most and which cities; crossings per month (or
  year); time of day and day of week ("most often on Thursdays around 6 pm"); and highlights
  (longest, first, most recent). Every chart has a table view, values on hover/tap, and taps
  drill into the map: a place, a city or a type opens the map filtered to it; a highlight
  opens that crossing. "Map & list" is one tap away.

## 0.8.0
- **New: meet in person.** Show a QR code (or share an invite link) for the other person to
  scan, or shake your phones together. You're connected and - if you both have a timeline
  uploaded - the check runs straight away, no request/accept/consent round trips. Doing it
  together on a screen that says exactly that is both people agreeing. Codes are single-use
  and expire after 10 minutes. Shakes are matched by time (within 4 s) and place (using
  each phone's GPS accuracy); if several people shake at once nearby, nobody is paired and
  you're told to use the QR code. Shake locations are deleted within minutes.
  New endpoints: `POST /api/pair/code`, `GET /api/pair/code/<code>`, `POST /api/pair/redeem`,
  `POST /api/pair/shake`, `GET /api/pair/shake/<id>`, and invite links at `/pair/<code>`.
- **New: place names.** Every crossing is labelled with its neighbourhood and city (and a
  nearby landmark such as an airport or mall), e.g. "Al Murūj, Riyadh", with Arabic names
  when the phone/browser is set to Arabic. Names come from GeoNames files stored on the
  server (downloaded once into `data/places`; nothing about users is sent anywhere). Set
  `PLACE_NAMES=false` to turn this off. Older results get names the first time they're opened.
  "Show street name" on a crossing asks OpenStreetMap, only when you tap it.
- **New: filters, sorting and a heatmap** for results with many crossings: filter by type,
  year, city, minimum duration, text, or "only what's on the map"; sort by newest, oldest or
  longest. Zoomed out, the map shows a heatmap of where you cross most.
- **Changed:** the types are now "Same place", "Crossed paths" (was "Passed each other") and
  "Travelled together" (was "Same route"), with a "?" that explains each.
- **Fixed:** dates on Arabic-language devices mixed Hijri dates and Arabic digits into the
  English interface; dates now follow the interface language.
- DB: adds `place`, `place_ar`, `landmark`, `landmark_ar` to `crossing_events` (migrated
  automatically on start) and the `pair_codes` and `shakes` tables.

## 0.7.0
- **Fixed:** crossings in the middle of nowhere. Two people on the same flight produced a
  "Same route" crossing whose marker sat at the average of a 5,000 km flight path (e.g. in
  the Sahara). Anything faster than ~250 km/h is now treated as a flight and never matched;
  you still match at the airport if you were both there. Moving crossings are now placed
  where you were actually at the same spot at the same time, not at an average position.
- **Fixed:** the same encounter listed twice ("Same place 21:30–22:15" next to "Passed each
  other 22:00–22:15"). Crossings whose rounded time windows overlap are merged into one.
- **Fixed:** a long day spent together at one place was labelled "Same route" because the
  two commutes in it outweighed hours of sitting still. The kind now uses time-weighted speed.
- **Changed:** results no longer replay your entire history on one map. Your own path is
  stored only for a few hours around each crossing (`GET /api/checks/<id>/my-track` now
  returns `{"windows": [...]}`), and both apps show the crossings first, grouped by day,
  then your path around whichever crossing you open. Results computed by older versions are
  converted on the fly.
- **Fixed:** "My Timeline" days were UTC days, so in Riyadh (UTC+3) anything between
  midnight and 03:00 showed up on the previous day. `/summary` and `/day` accept `tz`
  (minutes east of UTC) and the apps send the device's offset.
- **Fixed:** days spent in one place (often only one point in a semantic export) showed "no
  points recorded". Single-point stays are kept and drawn as dots.
- **Fixed (web):** the page content started below a full screen of empty space on every
  tab (an unclosed `<header>` tag); the results map could be squeezed to zero height by a
  long crossing list; list rows took ~20 s to fade in with hundreds of crossings.

## 0.6.0
- **New:** "My Timeline" is now its own tab (renamed the old one to "Uploads"). It replaces
  the old day-chip list with a year → month → day drill-down you can operate as one
  continuous drag: press on a year, drag down through a month, release on a day, and it
  loads immediately — or just tap through one level at a time. This scales to many years of
  data because only counts are fetched up front (`GET /api/uploads/<id>/summary`) and a
  day's actual points are fetched only when you open that day (`GET .../day?date=`),
  instead of the old approach of loading the entire history at once.
- **New:** place search — tap a point on the map (private, stays on your server) or type a
  place name (uses OpenStreetMap's search, clearly labeled since that sends your search text
  to a third party) to see every time your timeline passed within a chosen radius of it.
  Backed by `GET /api/uploads/<id>/visits`.
- **New:** a "Live" toggle on the My Timeline map shows your current position via the
  browser's location — useful on a phone. Requires HTTPS (see DEPLOY.md); most
  browsers refuse geolocation on a plain `http://` address. Comparing your live position
  against past visits automatically isn't built yet — for now, use place search for that.
- **Fixed:** the sign-in screen no longer requires scrolling to reach the password field and
  button on shorter phone screens, and any focused field now scrolls above the on-screen
  keyboard automatically, everywhere in the app.
- **Removed:** `GET /api/uploads/<id>/track` (the old whole-history endpoint) — superseded
  by `/summary` + `/day` above.

## 0.5.0
- **New:** "View on map" on each uploaded timeline — a solo view with day chips across the
  top and a scrubber that replays your own path for that day. No other person involved.
- **New:** `GET /api/uploads/<id>/track` endpoint backing the above.
- **Deploy:** `server/`, `crosspaths/`, and `wsgi.py` are now bind-mounted into the container
  (see docker-compose.yml) instead of baked in at build time. Most updates from here on are
  copy-the-changed-files-and-restart — no rebuild needed. Rebuild is only required when
  `requirements.txt` changes (a new Python package).

## 0.4.0
- **New:** native iOS/Android app (separate `crosspaths-app/` Expo project) — same API,
  same account, adds a real map (`react-native-maps`) and push notifications.
- **New:** push notifications via Expo's push service for connection requests, acceptances,
  and finished checks. Added `POST /api/devices` / `DELETE /api/devices` and a `devices`
  table to register a phone's push token.

## 0.3.0
- **New:** `crosspaths/secure.py` — a working prototype of the "no raw timeline ever leaves
  the phone" matching mode from the roadmap (ECDH key exchange + HMAC token intersection).
  Not yet wired into the server; a standalone module with its own tests.

## 0.2.0
- **New:** Flask + SQLite server (`server/`), installable web app (PWA) in `server/static/`,
  Docker deployment (`Dockerfile`, `docker-compose.yml`, `DEPLOY.md`).
  Consent-gated checks, encrypted-at-rest uploads, auto-purge, rate limits, spoof-trust
  labels surfaced to the counterpart.

## 0.1.0
- **Initial:** the matching engine — `crosspaths/parser.py` (reads all three known Google
  Timeline export formats), `matcher.py` (distance/time crossing detection), `privacy.py`
  (home/work zone exclusion, result blurring), `spoofcheck.py` (fake-timeline heuristics),
  a CLI, a Postgres/PostGIS schema for a future scaled-up version, and the synthetic-data
  test suite.
