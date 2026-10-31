# CrossPaths — native iOS + Android app

Expo (React Native) app for the CrossPaths server built earlier. Same account, same API,
same privacy model — this is the native client instead of the web PWA.

**Not run in a simulator or on a device.** I have no iOS/Android/Expo tooling in this
environment, so this hasn't gone through Metro or a real build. I did check: every file's
brackets balance, every relative import resolves to a real file, and every package import
is declared in `package.json`. That catches typos and missing files, not runtime bugs or
Expo/React Native version mismatches — expect to fix a few things on first run.

## What's here

```
App.js                 entry point: providers (auth, toast, safe-area, gesture handler)
app.json, eas.json      Expo config + EAS Build profiles
src/
  api.js                fetch client for the Flask API, token + server-URL persisted in SecureStore
  auth.js                AuthContext: login/register/logout, loads the session on launch
  useAppData.js          polls /uploads, /connections, /checks every 4s while signed in (no WebSocket yet)
  notifications.js       Expo push registration -> POST /api/devices
  theme.js               colors + formatting helpers, mirrors server/static/index.html's design
  navigation/
    RootNavigator.js     auth stack vs. main app; modal routes for New/Review check and Results
    MainTabs.js           bottom tabs: Timeline, People, Checks
  screens/
    AuthScreen, SettingsScreen (server URL), TimelineScreen, PeopleScreen, ChecksScreen,
    NewCheckModal, ReviewCheckModal, ResultsScreen (map + split list + scrubber)
  components/
    Button, Card, Pill, Toast, UploadPicker, DateRangePicker
```

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (iOS/Android) for everything except the map screen —
`react-native-maps` needs a **custom dev client**, not Expo Go:

```bash
npx expo prebuild            # generates ios/ and android/ native projects
npx expo run:ios             # needs a Mac + Xcode
npx expo run:android         # needs Android Studio / SDK
```

Or build in the cloud with EAS (no local Xcode/Android Studio needed):

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # installable .apk
eas build --platform ios --profile preview        # needs an Apple Developer account for a device build
```

## Before it'll work

1. **Server address.** On first launch, open "Server settings" from the sign-in screen and
   enter your CrossPaths server's URL (Tailscale address, tunnel, or LAN IP). Or set it once
   for everyone in `app.json` under `expo.extra.apiUrl` before building.
2. **Android Google Maps key.** `react-native-maps` on Android needs a Google Maps SDK key in
   `app.json` (`expo.android.config.googleMaps.apiKey` — currently a placeholder). iOS uses
   Apple Maps and needs no key. Get one free at https://console.cloud.google.com (enable "Maps
   SDK for Android").
3. **Bundle identifiers.** `com.example.crosspaths` in `app.json` is a placeholder — change
   both `ios.bundleIdentifier` and `android.package` before submitting to a store.
4. **Push notifications.** The app registers for Expo push tokens and posts them to
   `/api/devices` (already implemented on the server). The server sends through Expo's push
   service — no FCM/APNs credentials to manage yourself, but Expo requires **EAS Build** (not
   Expo Go) for push to actually deliver on a real build.

## What matches the web app, and what's simplified

- Same screens and flow: upload → connect → request a check → both consent → results.
- Results screen shows the map (your path only), a split panel with the crossing list, and
  a scrubber that replays your own day — same privacy rule as the web app: you only ever
  see your own path, never theirs.
- Not yet built: pull-to-refresh spinners beyond the 4s poll, offline caching, and dark/light
  theme switching (it's dark-only, matching the web app).

## Known gaps

- `@react-native-community/datetimepicker` and `@react-native-community/slider` version pins
  in `package.json` are current as of this writing but should be checked against your Expo
  SDK version (`npx expo install --check` will fix any mismatches automatically).
- No automated tests for the native app (the server/engine have 23; see the main project).
- iOS builds need an Apple Developer Program membership to run on a physical device or submit
  to the App Store; EAS can still build the app itself without one.
