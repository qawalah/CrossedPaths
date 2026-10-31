# CrossPaths

"Did our paths ever cross?" Two people upload location histories (Google Timeline, GPX/FIT/CSV
from fitness apps, Swarm check-ins or photo GPS), both agree to a check, and the
server lists every time they were within ~100 m in the same 15 minutes.

**Read `HANDOVER.md` first.** It has the full picture: identity, signing, data layout, secrets,
known issues and the decisions not to undo.

## Layout

- `server/`: Flask + SQLite API and the single-page web client (`server/server/static/index.html`).
  Matching engine is the `crosspaths/` package
  (`parser.py` = Google formats, `importers.py` = every other file type, zips, multi-file uploads). Runs in Docker on a Synology NAS, port 8787.
- `mobile/`: Expo SDK 51 / React Native 0.74 Android app. The prebuilt `android/` folder is
  committed. `ios/` exists but has never been built.
- `store-listing/`: Play Store images and text. Not code.

## Commands

Server (from `server/`):

```bash
pip install -r requirements.txt pytest
python -m pytest -q                  # 55 tests, no network (PLACE_NAMES=False)
DATA_DIR=./data python -c "from server.app import create_app; create_app().run(port=8787)"
```

Mobile (from `mobile/`):

```bash
npm ci
npx expo export --platform android --output-dir /tmp/cp-export   # JS bundle check, no SDK needed
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableProguardInReleaseBuilds=true -Pandroid.enableShrinkResourcesInReleaseBuilds=true
```

The Gradle build needs JDK 17–21, Android SDK 34, `android/local.properties` and
`android/app/debug.keystore` (none of these are committed).

## Versions

- Server: `server/VERSION`. Add an entry to `server/CHANGELOG.md` when it changes.
- Android: `versionCode` / `versionName` in both `mobile/app.json` and
  `mobile/android/app/build.gradle`. Keep them in sync. `package.json`'s version is stale; ignore it.

## Don't undo

- Privacy: nothing is compared without both people's consent; the API never returns the other
  person's track; times rounded to 15 min, places blurred ~100 m; home/work zones excluded;
  uploads encrypted at rest and purged per the user's retention setting.
- Place names come from offline GeoNames on the server. Street names are fetched client-side,
  only on tap.
- Maps are MapLibre + OpenFreeMap on both clients, not Google Maps. In GL JS, never pass
  `padding` to `easeTo`; use `offset`.
- Server address switching only happens between addresses with the same `instance`, and a
  timed-out POST is never resent.
- Mobile theme: `colors` in `src/theme.js` is one mutable object. Don't capture colours in
  `StyleSheet.create`.
- `mobile/plugins/withCrossPathsAndroid.js` and `expo.useLegacyPackaging` in
  `gradle.properties` both exist on purpose; re-running prebuild without them breaks the build.
- NAS deploys bind-mount code read-only, so updates are "copy and restart". Never touch the
  server's `data/` folder (it holds `keys.json`; losing it signs everyone out and makes uploads
  unreadable).
