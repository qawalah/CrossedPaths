// Translations for the app. The English text in the code is the key: T("Settings") gives the Arabic when
// the app is in Arabic and the same English otherwise, so a missing translation shows English, never a blank.
//   T(text, {name: value})      fills {name} placeholders
//   TP(n, one, other, vars)     plurals (Arabic has six forms; the dictionary entry for `one` is {one, two, few, many, other})
//   TE(message)                 translates a message that came back from the server
//   H(handle)                   "@name" kept as one left-to-right unit inside an Arabic sentence
// The language is the phone's unless the person picked one in Account (kept on the phone). Layout direction
// (right-to-left for Arabic) is applied by Android at the next start, so a change asks for a restart.
// The Arabic is plain, everyday wording rather than formal Modern Standard Arabic, and is by meaning rather than
// word for word. Keep it that way when adding strings. The dictionary lives in i18n.ar.js.
import * as SecureStore from "expo-secure-store";
import { Alert, BackHandler, I18nManager } from "react-native";
import { AR, AR_SERVER, AR_SERVER_RE } from "./i18n.ar";

const KEY = "cp_lang";

function deviceLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-GB";
  } catch (e) {
    return "en-GB";
  }
}
export const DEVICE_LOCALE = deviceLocale();
const deviceLang = () => (/^ar\b/i.test(DEVICE_LOCALE) ? "ar" : "en");

let PREF = "auto"; // "auto" | "en" | "ar"
let LANG_NOW = "en";
let RTL_NOW = false;

/** "en" or "ar": what the interface is in right now. */
export const getLang = () => LANG_NOW;
export const isRTL = () => RTL_NOW;
export const getLangPref = () => PREF;

/** Load the saved choice and line the native layout direction up with it. Call before the first render. */
export async function initI18n() {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    PREF = v === "ar" || v === "en" ? v : "auto";
  } catch (e) {
    PREF = "auto";
  }
  LANG_NOW = PREF === "auto" ? deviceLang() : PREF;
  RTL_NOW = LANG_NOW === "ar";
  applyDirection();
}

/** Returns true when the native direction has to change, which only happens on the next launch. */
function applyDirection() {
  const want = LANG_NOW === "ar";
  if (I18nManager.isRTL === want) return false;
  try {
    I18nManager.allowRTL(want);
    I18nManager.forceRTL(want);
  } catch (e) {
    /* not available: the text still translates, the layout just keeps its direction */
  }
  return true;
}

/** Save the person's choice. Strings and layout switch on the next launch, so offer to close the app now. */
export async function setLangPref(v) {
  PREF = v === "ar" || v === "en" ? v : "auto";
  try {
    if (PREF === "auto") await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, PREF);
  } catch (e) {
    /* kept for this run only */
  }
  const next = PREF === "auto" ? deviceLang() : PREF;
  try {
    I18nManager.allowRTL(next === "ar");
    I18nManager.forceRTL(next === "ar");
  } catch (e) {
    /* see above */
  }
  const ar = next === "ar";
  Alert.alert(
    ar ? "تغيير اللغة" : "Language changed",
    ar ? "سكّر التطبيق وافتحه من جديد عشان تتغير اللغة." : "Close the app and open it again to finish switching the language.",
    [
      { text: ar ? "لاحقًا" : "Later", style: "cancel" },
      { text: ar ? "سكّر التطبيق" : "Close the app", onPress: () => BackHandler.exitApp() },
    ]
  );
}

// ---------- text ----------
const fill = (str, v) => (v ? str.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : str);

/** Arabic plural category (CLDR): zero is spoken like "other" here. */
function arCategory(n) {
  if (n === 1) return "one";
  if (n === 2) return "two";
  const m = n % 100;
  if (m >= 3 && m <= 10) return "few";
  if (m >= 11 && m <= 99) return "many";
  return "other";
}

export function T(s, v) {
  const a = RTL_NOW ? AR[s] : null;
  return fill(typeof a === "string" ? a : s, v);
}
export function TP(n, one, other, v) {
  const vars = { n, ...(v || {}) };
  const a = RTL_NOW ? AR[one] : null;
  if (a && typeof a === "object") return fill(a[arCategory(n)] || a.other, vars);
  return fill(n === 1 ? one : other, vars);
}
/** "@name" as one left-to-right unit: neutral characters next to it can't pull it into the Arabic text. */
export const H = (handle) => "‎@" + handle + "‎";

export function TE(msg) {
  msg = String(msg == null ? "" : msg);
  if (!RTL_NOW) return msg;
  if (AR_SERVER[msg]) return AR_SERVER[msg];
  for (const [re, f] of AR_SERVER_RE) {
    const m = msg.match(re);
    if (m) return f(m);
  }
  return msg;
}

// ---------- dates and numbers ----------
// Always Gregorian with Latin digits, even in Arabic: an Arabic phone would otherwise mix Hijri dates and
// Arabic-Indic digits into the rest of the interface. Arabic is written out here rather than asked of the
// phone's Intl, which is patchy on Android.
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const AR_DAYS_SHORT = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const EN_LOCALE = () => (/^en\b/i.test(DEVICE_LOCALE) ? DEVICE_LOCALE : "en-GB");

/** 12345 -> "12,345" */
export function fmtNum(n) {
  if (!RTL_NOW) return Number(n).toLocaleString(EN_LOCALE());
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
/** "Mon, 5 Jan 2025" */
export function fmtDay(d) {
  if (!RTL_NOW) return d.toLocaleDateString(EN_LOCALE(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${AR_DAYS[d.getDay()]}، ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** "5 Jan 2025" */
export function fmtDate(d) {
  if (!RTL_NOW) return d.toLocaleDateString(EN_LOCALE(), { day: "numeric", month: "short", year: "numeric" });
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** "05:30 PM" */
export function fmtTime(d) {
  if (!RTL_NOW) return d.toLocaleTimeString(EN_LOCALE(), { hour: "2-digit", minute: "2-digit" });
  const h = d.getHours();
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}
/** "5 PM" (on the hour) for chart labels */
export function fmtHourOfDay(h) {
  if (!RTL_NOW) return new Date(2000, 0, 1, h).toLocaleTimeString(EN_LOCALE(), { hour: "numeric", minute: "2-digit" }).replace(/:00(?=\s?[AP]M)/i, "");
  return `${h % 12 || 12} ${h < 12 ? "ص" : "م"}`;
}
/** "Jan" / "Jan 2025" */
export function fmtMonth(y, m, withYear) {
  if (!RTL_NOW) return new Date(y, m, 1).toLocaleDateString(EN_LOCALE(), withYear ? { month: "short", year: "numeric" } : { month: "short" });
  return withYear ? `${AR_MONTHS[m]} ${y}` : AR_MONTHS[m];
}
/** "Sun" .. "Sat" (0 = Sunday) */
export function weekdayShort(i) {
  return RTL_NOW ? AR_DAYS_SHORT[i] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i];
}
/** "Sundays" .. (English) / "الأحد" (Arabic, used after "يوم") */
export function weekdayLong(i) {
  return RTL_NOW ? AR_DAYS[i] : ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][i];
}
/** Short month name for the year/month/day picker */
export const monthShort = (m0) => fmtMonth(2000, m0, false);

// Arrows that point the way the language reads
export const arrow = () => (RTL_NOW ? "←" : "→"); // from → to
export const chevPrev = () => (RTL_NOW ? "›" : "‹");
export const chevNext = () => (RTL_NOW ? "‹" : "›");
