// Where people can get a location history from, and how to export it.
// **text** is shown in bold. The web client has the same list (SOURCES in
// server/server/static/index.html): keep the two in step.
export const SOURCES = [
  {
    id: "google",
    name: "Google Maps",
    what: "Timeline export (.json)",
    steps: [
      "On this phone open **Settings → Location → Location services → Timeline** (or in Google Maps: profile picture → **Your Timeline** → ⚙️) and choose **Export Timeline data**.",
      "iPhone: Google Maps → profile picture → **Settings → Personal content → Export Timeline data**.",
      "Menu names vary a little between versions. Pick the saved .json file below. Older Google Takeout files work too: Records.json, the Semantic Location History files, or the whole Takeout .zip.",
    ],
  },
  {
    id: "strava",
    name: "Strava",
    what: "GPX / FIT / TCX",
    steps: [
      "One activity: open it on strava.com → **⋯** → **Export GPX**.",
      "Everything: on strava.com go to **Settings → My Account → Download or Delete Your Account → Get Started → Request Your Archive**. Don't press anything else on that page. Strava emails you a link.",
      "Pick the .zip as it is. If it's over the size limit (photos make it big), unzip it and pick the files in the activities folder.",
    ],
  },
  {
    id: "apple",
    name: "Apple Health",
    what: "Workout routes (GPX)",
    steps: [
      "On the iPhone open **Health** → your picture (top right) → **Export All Health Data** and save export.zip.",
      "Send it to this phone, or upload it on the CrossPaths website. Only the workout routes are read; your other health data is skipped.",
      "Too big? Unzip it and pick the .gpx files in apple_health_export/workout-routes.",
      "Only workouts recorded with GPS (outdoor walks, runs, rides) have routes.",
    ],
  },
  {
    id: "samsung",
    name: "Samsung Health",
    what: "Exercise routes",
    steps: [
      "Open **Samsung Health** → ☰ or your profile → **Settings → Download personal data**.",
      "The files go to **My Files → Internal storage → Download → Samsung Health**. Long-press that folder → **Compress** to make a .zip.",
      "Pick the .zip. The routes are in the location_data.json files; everything else is skipped.",
    ],
  },
  {
    id: "garmin",
    name: "Garmin",
    what: "FIT / GPX",
    steps: [
      "One activity: Garmin Connect website → the activity → ⚙️ → **Export Original** (.fit in a .zip) or **Export to GPX**.",
      "Everything: Garmin account → **Data Management → Export Your Data**. Garmin emails you a .zip; pick it as it is.",
    ],
  },
  {
    id: "fitbit",
    name: "Fitbit · Google Fit",
    what: "TCX",
    steps: [
      "Fitbit: open a GPS exercise → **⋯** → **Export as TCX file** (one exercise at a time).",
      "Google Fit: Google Takeout → choose only **Fit** → download, then pick the .zip. The activity .tcx files are read.",
      "Health Connect has no route export. Export from the app that recorded the workout instead (Strava, Samsung Health, Garmin…).",
    ],
  },
  {
    id: "swarm",
    name: "Swarm",
    what: "Check-ins",
    steps: [
      "In the **Swarm** app: **Settings → Privacy Settings → Initiate Data Download Request**. Foursquare emails you a link to a .zip.",
      "Pick the .zip (or the checkins*.json files from it).",
      "Each check-in counts as 30 minutes at that place, so matches are rougher than with GPS tracks.",
    ],
  },
  {
    id: "other",
    name: "Other apps",
    what: "GPX · KML · GeoJSON · CSV",
    steps: [
      "Any app that exports GPX, KML/KMZ, GeoJSON or FIT works: OwnTracks, GPSLogger, Dawarich, Arc, Komoot, Wikiloc, Polarsteps, car and dashcam apps…",
      "CSV files need a **latitude**, a **longitude** and a **time** column (any common column name works).",
      "Points without a time can't be compared, so planned routes without times are skipped.",
    ],
  },
];

// The illustrated step-by-step guide for each source (docs/wiki in the repo).
export const GUIDE_BASE = "https://github.com/qawalah/CrossedPaths/blob/main/docs/wiki/";
export const GUIDE_PAGE = {
  google: "Google-Maps",
  strava: "Strava",
  apple: "Apple-Health",
  samsung: "Samsung-Health",
  garmin: "Garmin",
  fitbit: "Fitbit-Google-Fit",
  swarm: "Swarm",
  other: "Other-Apps",
};
export const guideUrl = (id) => GUIDE_BASE + (GUIDE_PAGE[id] || "Home") + ".md";
