// English / Arabic. English text is the translation key; i18n.ar.js maps it to Arabic and a missing
// entry falls back to English. The language (and with it the layout direction) is read once, when the
// app starts, because Android only applies right-to-left layout at launch: changing it in Settings
// takes effect the next time the app is opened (see setLanguage).
import * as SecureStore from "expo-secure-store";
import { I18nManager } from "react-native";
import AR from "./i18n.ar";

const KEY = "cp_lang";

function savedPref() {
  try {
    const v = SecureStore.getItem ? SecureStore.getItem(KEY) : null; // synchronous, so the language is known before the first render
    return v === "ar" || v === "en" ? v : "system";
  } catch (e) {
    return "system";
  }
}
function deviceLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || "en-GB";
  } catch (e) {
    return "en-GB";
  }
}
const deviceIsArabic = (loc) => /^ar\b/i.test(loc);
const langFor = (pref, loc) => (pref !== "system" ? pref : deviceIsArabic(loc) ? "ar" : "en");

export const DEVICE_LOCALE = deviceLocale();
export const LANG_PREF = savedPref(); // "system" | "en" | "ar"
export const LANG = langFor(LANG_PREF, DEVICE_LOCALE);
export const RTL = LANG === "ar";

/** Arabic needs the layout mirrored; English must not be, even on an Arabic phone. Persisted natively, applied at launch. */
function applyDirection(rtl) {
  try {
    if (rtl) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(true);
    } else {
      I18nManager.forceRTL(false);
      I18nManager.allowRTL(false);
    }
  } catch (e) {
    /* not fatal: the layout just stays as it is */
  }
}
if (I18nManager.isRTL !== RTL) applyDirection(RTL);

// English UI: English dates even on an Arabic phone (no Hijri dates or Arabic digits mixed into English
// sentences). Arabic UI: Arabic month and day names, but Gregorian dates and Western digits.
function arabicLocale() {
  try {
    const s = new Date(2000, 0, 5).toLocaleDateString("ar-u-ca-gregory-nu-latn", { day: "numeric", month: "short" });
    if (/5/.test(s)) return "ar-u-ca-gregory-nu-latn";
  } catch (e) {
    /* fall through */
  }
  return "ar";
}
export const UI_LOCALE = RTL ? arabicLocale() : /^en\b/i.test(DEVICE_LOCALE) ? DEVICE_LOCALE : "en-GB";

/** A username keeps its own direction inside Arabic text. */
export const H = (h) => `\u2066@${h}\u2069`;

export function t(s, p) {
  const r = (RTL && AR[s]) || s;
  return p ? r.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m)) : r;
}

// Plural forms: English has one/other; Arabic has zero/one/two/few/many/other.
const PL = {
  en: {
    crossings: { one: "{n} crossing", other: "{n} crossings" },
    days: { one: "{n} day", other: "{n} days" },
    points: { one: "{n} point", other: "{n} points" },
    files: { one: "{n} file", other: "{n} files" },
    places: { one: "{n} place", other: "{n} places" },
    timelines: { one: "{n} timeline", other: "{n} timelines" },
    times: { one: "time your paths crossed with {who}", other: "times your paths crossed with {who}" },
  },
  ar: {
    crossings: { zero: "{n} تقاطع", one: "تقاطع واحد", two: "تقاطعان", few: "{n} تقاطعات", many: "{n} تقاطعًا", other: "{n} تقاطع" },
    days: { zero: "{n} يوم", one: "يوم واحد", two: "يومان", few: "{n} أيام", many: "{n} يومًا", other: "{n} يوم" },
    points: { zero: "{n} نقطة", one: "نقطة واحدة", two: "نقطتان", few: "{n} نقاط", many: "{n} نقطة", other: "{n} نقطة" },
    files: { zero: "{n} ملف", one: "ملف واحد", two: "ملفان", few: "{n} ملفات", many: "{n} ملفًا", other: "{n} ملف" },
    places: { zero: "{n} مكان", one: "مكان واحد", two: "مكانان", few: "{n} أماكن", many: "{n} مكانًا", other: "{n} مكان" },
    timelines: { zero: "{n} خط زمني", one: "خط زمني واحد", two: "خطان زمنيان", few: "{n} خطوط زمنية", many: "{n} خطًا زمنيًا", other: "{n} خط زمني" },
    times: { few: "مرات تقاطعت فيها مساراتكما مع {who}", other: "مرة تقاطعت فيها مساراتكما مع {who}" },
  },
};
// Hermes has no Intl.PluralRules, so the (small) CLDR rules for these two languages are written out.
function category(n) {
  const a = Math.abs(n);
  if (!RTL) return a === 1 ? "one" : "other";
  if (a === 0) return "zero";
  if (a === 1) return "one";
  if (a === 2) return "two";
  const m = a % 100;
  if (m >= 3 && m <= 10) return "few";
  if (m >= 11 && m <= 99) return "many";
  return "other";
}
export function pl(key, n, p) {
  const f = PL[LANG][key];
  const form = f[category(n)] || f.other;
  return form.replace(/\{(\w+)\}/g, (m, k) => (k === "n" ? Number(n).toLocaleString(UI_LOCALE) : p && p[k] != null ? p[k] : m));
}

/** Messages from the server are English: translate the ones we know, pass the rest through. */
export function serverMsg(s) {
  if (!RTL || typeof s !== "string") return s;
  const big = /^File too large \(limit (\d+) MB\)\./.exec(s);
  if (big) return t("File too large (limit {mb} MB). Trim the export to a shorter date range, or upload only the files with your routes, and try again.", { mb: big[1] });
  const n = /^(\d+) (.+)$/.exec(s); // "3 physically impossible jump(s)" and the like
  const key = n && "{n} " + n[2];
  if (key && AR[key]) return t(key, { n: n[1] });
  const note = /^Connected\. No check ran because (.+?) (?:hasn't|haven't) got a timeline uploaded\. Upload one, then use Check paths\.$/.exec(s);
  if (note) return t("Connected. No check ran because {who} haven't got a timeline uploaded. Upload one, then use Check paths.", { who: note[1].split(" and ").join(" و") });
  return t(s);
}

/** Save the choice and set the layout direction for the next launch. Returns the language it will be in. */
export async function setLanguage(pref) {
  try {
    if (pref === "system") await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, pref);
  } catch (e) {
    /* the choice just isn't remembered */
  }
  const next = langFor(pref, DEVICE_LOCALE);
  applyDirection(next === "ar");
  return next;
}
