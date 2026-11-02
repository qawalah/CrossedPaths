// Step data for the export guides. Each screen: frame (phone|web), app, title, rows, tap (row index),
// optional crop (only render the top N rows: reused "save" screens).
// Rows: string, or {t, sub, icon}. Menus are illustrations, not copies of the real apps.
const SAVE = { frame: "phone", app: "Files", title: "Save to…", rows: [
  { t: "Downloads", icon: "📁" }, { t: "Documents", icon: "📁" }, { t: "File name: timeline.json", icon: "📝" }, { t: "SAVE", btn: true }] };
module.exports = {
  "google-android": [
    { frame: "phone", app: "Settings", title: "Settings", rows: [{ t: "Network & internet", icon: "📶" }, { t: "Connected devices", icon: "🔗" }, { t: "Location", icon: "📍" }, { t: "Security & privacy", icon: "🔒" }], tap: 2 },
    { frame: "phone", app: "Settings", title: "Location", rows: [{ t: "Use location", sub: "On" }, { t: "Recent access" }, { t: "Location services", icon: "⚙️" }], tap: 2 },
    { frame: "phone", app: "Settings", title: "Location services", rows: [{ t: "Emergency Location Service" }, { t: "Google Location Accuracy" }, { t: "Timeline", icon: "🕒" }, { t: "Wi‑Fi scanning" }], tap: 2 },
    { frame: "phone", app: "Settings", title: "Timeline", rows: [{ t: "Timeline", sub: "On" }, { t: "Auto-delete" }, { t: "Export Timeline data", icon: "⬇️" }, { t: "Delete Timeline" }], tap: 2 },
    { ...SAVE, tap: 3 },
  ],
  "google-iphone": [
    { frame: "phone", app: "Google Maps", title: "Maps", map: true, rows: [{ t: "Search here", search: true }], tap: -1, avatar: true },
    { frame: "phone", app: "Google Maps", title: "Account", rows: [{ t: "Your Timeline", icon: "🕒" }, { t: "Your data in Maps", icon: "🛡️" }, { t: "Settings", icon: "⚙️" }, { t: "Help & feedback" }], tap: 2 },
    { frame: "phone", app: "Google Maps", title: "Settings", rows: [{ t: "Navigation" }, { t: "Personal content", icon: "👤" }, { t: "Notifications" }, { t: "About, terms & privacy" }], tap: 1 },
    { frame: "phone", app: "Google Maps", title: "Personal content", rows: [{ t: "Location settings" }, { t: "Timeline settings" }, { t: "Export Timeline data", icon: "⬇️" }], tap: 2 },
    { ...SAVE, app: "Files", title: "Save to Files", tap: 3 },
  ],
  strava: [
    { frame: "web", app: "strava.com", title: "Settings", rows: [{ t: "My Profile" }, { t: "My Account" }, { t: "Privacy Controls" }, { t: "Email Notifications" }], tap: 1 },
    { frame: "web", app: "strava.com", title: "My Account", rows: [{ t: "Email / Password" }, { t: "Subscription" }, { t: "Download or Delete Your Account", sub: "Get Started" }], tap: 2 },
    { frame: "web", app: "strava.com", title: "Download or Delete Your Account", rows: [{ t: "1. Download Request (optional)", sub: "Get a copy of your data" }, { t: "Request Your Archive", btn: true }, { t: "2. Delete your account — DON'T press", warn: true }], tap: 1 },
    { frame: "phone", app: "Email", title: "Inbox", rows: [{ t: "Strava", sub: "Your archive is ready — Download archive" }, { t: "Other mail" }], tap: 0 },
  ],
  "strava-single": [
    { frame: "web", app: "strava.com", title: "Morning Run", rows: [{ t: "⋯  (actions menu)" }, { t: "Edit" }, { t: "Export GPX", icon: "⬇️" }, { t: "Export Original" }], tap: 2 },
  ],
  apple: [
    { frame: "phone", app: "Health", title: "Summary", rows: [{ t: "Your picture (top right)", icon: "🙂" }, { t: "Pinned" }, { t: "Activity" }], tap: 0 },
    { frame: "phone", app: "Health", title: "Profile", rows: [{ t: "Health Details" }, { t: "Medical ID" }, { t: "Devices" }, { t: "Export All Health Data", link: true }], tap: 3 },
    { frame: "phone", app: "Health", title: "Export Health Data", rows: [{ t: "This may take some time." }, { t: "Export", btn: true }, { t: "Cancel" }], tap: 1 },
    { frame: "phone", app: "Share", title: "export.zip", rows: [{ t: "AirDrop" }, { t: "Mail" }, { t: "Save to Files", icon: "📁" }], tap: 2 },
  ],
  samsung: [
    { frame: "phone", app: "Samsung Health", title: "Home", rows: [{ t: "☰ / your profile", icon: "👤" }, { t: "Steps" }, { t: "Exercise" }], tap: 0 },
    { frame: "phone", app: "Samsung Health", title: "Settings", rows: [{ t: "Notifications" }, { t: "Connected services" }, { t: "Download personal data", icon: "⬇️" }, { t: "Delete personal data" }], tap: 2 },
    { frame: "phone", app: "Samsung Health", title: "Download personal data", rows: [{ t: "Saved to: Download/Samsung Health" }, { t: "DOWNLOAD", btn: true }], tap: 1 },
    { frame: "phone", app: "My Files", title: "Download", rows: [{ t: "Samsung Health  (long-press)", icon: "📁" }, { t: "Compress", icon: "🗜️" }, { t: "Share" }], tap: 1 },
  ],
  garmin: [
    { frame: "web", app: "garmin.com", title: "Account", rows: [{ t: "Profile" }, { t: "Data Management" }, { t: "Security" }], tap: 1 },
    { frame: "web", app: "garmin.com", title: "Data Management", rows: [{ t: "Manage Your Data" }, { t: "Export Your Data" }, { t: "Delete Account" }], tap: 1 },
    { frame: "web", app: "garmin.com", title: "Export Your Data", rows: [{ t: "We'll email you a link." }, { t: "Request Data Export", btn: true }], tap: 1 },
  ],
  "garmin-single": [
    { frame: "web", app: "connect.garmin.com", title: "Activity", rows: [{ t: "⚙️ (gear)" }, { t: "Export Original", icon: "⬇️" }, { t: "Export to GPX" }, { t: "Delete" }], tap: 1 },
  ],
  fitbit: [
    { frame: "phone", app: "Fitbit", title: "Exercise", rows: [{ t: "Outdoor Walk · GPS", icon: "🚶" }, { t: "⋯  (top right)" }, { t: "Export as TCX file", icon: "⬇️" }], tap: 2 },
  ],
  "google-fit": [
    { frame: "web", app: "takeout.google.com", title: "Select data to include", rows: [{ t: "Deselect all", link: true }, { t: "☑ Fit" }, { t: "☐ Maps" }, { t: "Next step", btn: true }], tap: 1 },
    { frame: "web", app: "takeout.google.com", title: "Choose file type", rows: [{ t: "Send download link via email" }, { t: "Export once · .zip" }, { t: "Create export", btn: true }], tap: 2 },
  ],
  swarm: [
    { frame: "phone", app: "Swarm", title: "Profile", rows: [{ t: "⚙️ Settings", icon: "⚙️" }, { t: "Check-ins" }, { t: "Stickers" }], tap: 0 },
    { frame: "phone", app: "Swarm", title: "Settings", rows: [{ t: "Notifications" }, { t: "Privacy Settings", icon: "🔒" }, { t: "Account" }], tap: 1 },
    { frame: "phone", app: "Swarm", title: "Privacy Settings", rows: [{ t: "Location sharing" }, { t: "Initiate Data Download Request", link: true }], tap: 1 },
  ],
  photos: [
    { frame: "phone", app: "CrossPaths", title: "Uploads", rows: [{ t: "Import a file", icon: "📂" }, { t: "Scan my photos", icon: "📷" }], tap: 1 },
    { frame: "phone", app: "CrossPaths", title: "Scan my photos", rows: [{ t: "Choose photos", btn: true }, { t: "Only GPS + time are uploaded, never the photos." }], tap: 0 },
  ],
  upload: [
    { frame: "phone", app: "CrossPaths", title: "Uploads", rows: [{ t: "Import a file", icon: "📂" }, { t: "Scan my photos", icon: "📷" }], tap: 0 },
    { frame: "phone", app: "CrossPaths", title: "Import a file", rows: [{ t: "Choose file(s)", btn: true }, { t: "One file, several, or a .zip" }], tap: 0 },
  ],
};
