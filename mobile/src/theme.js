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
import { DEVICE_LOCALE, onLanguage, pl, RTL, t, UI_LOCALE } from "./i18n";

export let ACCENTS;
onLanguage(() => {
  ACCENTS = {
  // [accent, text on the accent] in dark and in light
  teal: { name: t("Teal"), dark: ["#2dd4bf", "#04222a"], light: ["#0d9488", "#ffffff"] },
  blue: { name: t("Blue"), dark: ["#60a5fa", "#061a33"], light: ["#2563eb", "#ffffff"] },
  violet: { name: t("Violet"), dark: ["#a78bfa", "#1b0e33"], light: ["#7c3aed", "#ffffff"] },
  amber: { name: t("Amber"), dark: ["#fbbf24", "#2a1a02"], light: ["#b45309", "#ffffff"] },
  rose: { name: t("Rose"), dark: ["#fb7185", "#33060f"], light: ["#e11d48", "#ffffff"] },
};
});
export let THEME_MODES;
onLanguage(() => {
  THEME_MODES = [
  ["system", t("System")],
  ["dark", t("Dark")],
  ["light", t("Light")],
];
});
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
export let KIND_LABEL;
onLanguage(() => {
  KIND_LABEL = {
  same_place: ["", t("Same place")],
  passing: ["", t("Crossed paths")],
  shared_route: ["", t("Travelled together")],
};
});

/** What each kind means, for the "?" legend. */
export function kindHelp(kind, radiusM = 100, windowMin = 15) {
  return {
    same_place: t("You were both at the same spot (within {m} m), mostly staying put - a café, a mall, a mosque. You may have been there up to {min} min apart: one arriving as the other left.", { m: radiusM, min: windowMin }),
    passing: t("You were both on the move and went through the same spot within a few minutes of each other - walking or driving past. Over in a few minutes."),
    shared_route: t("You moved the same way at the same time for a while - the same road, bus or train."),
  }[kind];
}

// Language, locale and direction live in i18n.js. English UI: English dates even on an Arabic phone;
// Arabic UI: Arabic month/day names with Gregorian dates and Western digits.
export { DEVICE_LOCALE, UI_LOCALE };

export function fmtDay(d) {
  return d.toLocaleDateString(UI_LOCALE, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
export function fmtTime(d) {
  return d.toLocaleTimeString(UI_LOCALE, { hour: "2-digit", minute: "2-digit" });
}
export function fmtRange(startIso, endIso) {
  const a = new Date(startIso), b = new Date(endIso);
  return `${fmtDay(a)} · ${fmtTime(a)}–${fmtTime(b)}`;
}
export function dateStr(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString(UI_LOCALE, { day: "numeric", month: "short", year: "numeric" });
}
export function hoursLeft(ts) {
  if (ts == null) return t("kept until you delete it");
  const h = (ts * 1000 - Date.now()) / 3600000;
  if (h <= 0) return t("expired");
  if (h < 1) return t("<1 h left");
  if (h < 48) return t("{n} h left", { n: Math.round(h) });
  return t("{n} days left", { n: Math.round(h / 24) });
}
/** 24 -> "24 hours", 168 -> "7 days", 0 -> "Until I delete them". */
export function keepLabel(h) {
  if (!h) return t("Until I delete them");
  if (h === 24) return t("24 hours");
  if (h === 168) return t("7 days");
  if (h === 720) return t("30 days");
  if (h % 24) return t("{n} hours", { n: h });
  return t("{n} days", { n: h / 24 });
}
/** "deleted 24 hours after you upload it" / "kept (encrypted) until you delete it" */
export function keepPhrase(h) {
  return h ? t("deleted {when} after you upload it", { when: keepLabel(h) }) : t("kept (encrypted) until you delete it");
}
export function offsetText(m) {
  return Math.abs(m) <= 2 ? t("at about the same time") : t("about {n} min apart", { n: Math.abs(m) });
}
export function statusLabel(s) {
  const labels = {
    awaiting_consent: t("awaiting consent"), running: t("running"), done: t("done"), failed: t("failed"),
    declined: t("declined"), expired: t("expired"), pending: t("pending"),
  };
  return labels[s] || String(s).replace("_", " ");
}
export function trustLabel(level) {
  return (
    { high: t("Looks authentic"), medium: t("Some anomalies"), low: t("Looks unusual"), insufficient: t("Too little data") }[
      level
    ] || level
  );
}

// ---------- place names (from the server's offline place database) ----------
export function placeOf(e) {
  return (RTL && e.place_ar) || e.place || "";
}
export function markOf(e) {
  return (RTL && e.landmark_ar) || e.landmark || "";
}
/** The city part of a place ("Al Murūj, Riyadh" -> "Riyadh"), for the city filter. */
export function cityOf(e) {
  const p = placeOf(e);
  const sep = RTL && e.place_ar ? "،" : ",";
  const i = p.lastIndexOf(sep);
  return (i >= 0 ? p.slice(i + 1) : p).trim();
}
export function whereText(e) {
  const named = [markOf(e), placeOf(e)].filter(Boolean).join(" · ");
  if (named) return named;
  // Not named yet (or nowhere near anything): the coordinates are still useful.
  return Number.isFinite(e.lat) && Number.isFinite(e.lon) ? `\u202A${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}\u202C` : t("Unnamed area");
}
