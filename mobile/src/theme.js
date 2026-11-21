import { fmtDate, fmtDay, fmtTime, getLang, T, TP } from "./i18n";

// ---------- themes: dark / light (or follow the system) + an accent colour ----------
// `colors` is one shared object that every screen reads while rendering. Changing the theme
// rewrites it in place and the app re-renders from the top (see themeContext.js).
const DARK = {
  bg: "#0b1220", panel: "#121a2b", panel2: "#18233a", line: "#25324d", text: "#e8eefc", muted: "#8a97b4",
  accent2: "#60a5fa", warn: "#f59e0b", bad: "#f87171", good: "#4ade80",
  chrome: "rgba(18,26,43,0.92)", chip: "rgba(11,18,32,0.82)", badge: "#1d2840", pressed: "#25324d", scrim: "rgba(3,6,12,0.6)",
  warnBg: "#3a2d10", warnBorder: "#6b4a0f", warnText: "#ffd58a", badBg: "#3a1a22", badBorder: "#5a2531", badText: "#ffc9c9",
  toast: "#1d2942", activeBg: "#123b3a",
};
const LIGHT = {
  bg: "#f3f5fa", panel: "#ffffff", panel2: "#eef1f7", line: "#dbe1ec", text: "#0f172a", muted: "#5b6578",
  accent2: "#2563eb", warn: "#b45309", bad: "#dc2626", good: "#15803d",
  chrome: "rgba(255,255,255,0.95)", chip: "rgba(255,255,255,0.94)", badge: "#eef2fa", pressed: "#e3e8f2", scrim: "rgba(15,23,42,0.35)",
  warnBg: "#fff4dc", warnBorder: "#f1c77a", warnText: "#7a4a00", badBg: "#fdecee", badBorder: "#f3b4bc", badText: "#9f1d2c",
  toast: "#ffffff", activeBg: "#e3f5f2",
};
export const ACCENTS = {
  // [accent, text on the accent] in dark and in light
  teal: { name: "Teal", dark: ["#2dd4bf", "#04222a"], light: ["#0d9488", "#ffffff"] },
  blue: { name: "Blue", dark: ["#60a5fa", "#061a33"], light: ["#2563eb", "#ffffff"] },
  violet: { name: "Violet", dark: ["#a78bfa", "#1b0e33"], light: ["#7c3aed", "#ffffff"] },
  amber: { name: "Amber", dark: ["#fbbf24", "#2a1a02"], light: ["#b45309", "#ffffff"] },
  rose: { name: "Rose", dark: ["#fb7185", "#33060f"], light: ["#e11d48", "#ffffff"] },
};
export const THEME_MODES = [
  ["system", "System"],
  ["dark", "Dark"],
  ["light", "Light"],
];
export const DEFAULT_THEME = { mode: "system", accent: "teal" };

export const colors = { ...DARK, accent: ACCENTS.teal.dark[0], onAccent: ACCENTS.teal.dark[1], isDark: true };

/** Rewrite `colors` for this preference; systemScheme is "light" | "dark" | null. Returns a key that
 * changes whenever the colours do. */
export function applyTheme(pref, systemScheme) {
  const p = { ...DEFAULT_THEME, ...(pref || {}) };
  const dark = p.mode === "dark" || (p.mode !== "light" && systemScheme !== "light");
  Object.assign(colors, dark ? DARK : LIGHT);
  const a = (ACCENTS[p.accent] || ACCENTS.teal)[dark ? "dark" : "light"];
  colors.accent = a[0];
  colors.onAccent = a[1];
  colors.isDark = dark;
  return `${dark ? "d" : "l"}-${ACCENTS[p.accent] ? p.accent : "teal"}`;
}

export const pillColor = (level) =>
  ({
    high: colors.good,
    done: colors.good,
    medium: colors.warn,
    awaiting_consent: colors.warn,
    pending: colors.warn,
    running: colors.accent2,
    low: colors.bad,
    failed: colors.bad,
    declined: colors.bad,
    expired: colors.bad,
    insufficient: colors.muted,
  }[level] || colors.muted);

// Used whenever the server's /api/config hasn't loaded (e.g. it was unreachable at launch),
// so maps are never left blank. Same free, key-less style the server defaults to.
export const MAP_STYLE_FALLBACK = "https://tiles.openfreemap.org/styles/liberty";

/** Minutes east of UTC for this device right now (Riyadh = 180) - sent to the server so
 * "a day" means the user's calendar day, not a UTC one. */
export function tzOffsetMin() {
  return -new Date().getTimezoneOffset();
}

/** Local calendar-day key, e.g. "2016-08-31", for grouping. */
export function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One validated categorical palette for the three kinds, shared by the summary and the map.
export const KIND_COLOR = { same_place: "#3987e5", passing: "#d95926", shared_route: "#199e70" };

// [unused, label] - the icon is drawn by components/KindIcon.js
// (getters, so the text is looked up when drawn, after the language has loaded)
export const KIND_LABEL = {
  get same_place() {
    return ["", T("Same place")];
  },
  get passing() {
    return ["", T("Crossed paths")];
  },
  get shared_route() {
    return ["", T("Travelled together")];
  },
};

/** What each kind means, for the "?" legend. */
export function kindHelp(kind, radiusM = 100, windowMin = 15) {
  return {
    same_place: T("You were both at the same spot (within {r} m), mostly staying put - a café, a mall, a mosque. You may have been there up to {w} min apart: one arriving as the other left.", { r: radiusM, w: windowMin }),
    passing: T("You were both on the move and went through the same spot within a few minutes of each other - walking or driving past. Over in a few minutes."),
    shared_route: T("You moved the same way at the same time for a while - the same road, bus or train."),
  }[kind];
}

// Dates and numbers come from i18n.js (Gregorian with Latin digits in both languages).
export { fmtDate, fmtDay, fmtNum, fmtTime } from "./i18n";

export function fmtRange(startIso, endIso) {
  const a = new Date(startIso), b = new Date(endIso);
  return `${fmtDay(a)} · ${fmtTime(a)}–${fmtTime(b)}`;
}
export function dateStr(ts) {
  if (!ts) return "";
  return fmtDate(new Date(ts * 1000));
}
export function hoursLeft(ts) {
  if (ts == null) return T("kept until you delete it");
  const h = (ts * 1000 - Date.now()) / 3600000;
  if (h <= 0) return T("expired");
  if (h < 1) return T("<1 h left");
  if (h < 48) return T("{n} h left", { n: Math.round(h) });
  return TP(Math.round(h / 24), "{n} day left", "{n} days left");
}
/** 24 -> "24 hours", 168 -> "7 days", 0 -> "Until I delete them". */
export function keepLabel(h) {
  if (!h) return T("Until I delete them");
  if (h === 24) return T("24 hours");
  if (h === 168) return T("7 days");
  if (h === 720) return T("30 days");
  if (h % 24) return TP(h, "{n} hour", "{n} hours");
  return TP(h / 24, "{n} day", "{n} days");
}
/** "deleted 24 hours after you upload it" / "kept (encrypted) until you delete it" */
export function keepPhrase(h) {
  return h ? T("deleted {when} after you upload it", { when: keepLabel(h) }) : T("kept (encrypted) until you delete it");
}
export function offsetText(m) {
  return Math.abs(m) <= 2 ? T("at about the same time") : T("about {n} min apart", { n: Math.abs(m) });
}
export function trustLabel(level) {
  return (
    {
      high: T("Looks authentic"),
      medium: T("Some anomalies"),
      low: T("Looks unusual"),
      insufficient: T("Too little data"),
    }[level] || level
  );
}
/** "awaiting_consent" -> "awaiting consent" in the interface language */
export function statusLabel(s) {
  return (
    {
      awaiting_consent: T("awaiting consent"),
      pending: T("pending"),
      running: T("running"),
      done: T("done"),
      failed: T("failed"),
      declined: T("declined"),
      expired: T("expired"),
    }[s] || String(s).replace("_", " ")
  );
}

// ---------- place names (from the server's offline place database) ----------
export function placeOf(e) {
  return (getLang() === "ar" && e.place_ar) || e.place || "";
}
export function markOf(e) {
  return (getLang() === "ar" && e.landmark_ar) || e.landmark || "";
}
/** The city part of a place ("Al Murūj, Riyadh" -> "Riyadh"), for the city filter. */
export function cityOf(e) {
  const p = placeOf(e);
  const sep = getLang() === "ar" && e.place_ar ? "،" : ",";
  const i = p.lastIndexOf(sep);
  return (i >= 0 ? p.slice(i + 1) : p).trim();
}
export function whereText(e) {
  const named = [markOf(e), placeOf(e)].filter(Boolean).join(" · ");
  if (named) return named;
  // Not named yet (or nowhere near anything): the coordinates are still useful.
  return Number.isFinite(e.lat) && Number.isFinite(e.lon) ? `\u202A${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}\u202C` : T("Unnamed area"); // (left-to-right embedding, so the pair keeps its order in Arabic)
}
