// Summary statistics for a check's crossings - what the results screen leads with.
import { cityOf, localDayKey, placeOf, UI_LOCALE } from "./theme";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_LONG = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

export function fmtHours(min) {
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 600) return `${(min / 60).toFixed(1).replace(/\.0$/, "")} h`;
  return `${Math.round(min / 60).toLocaleString(UI_LOCALE)} h`;
}
export function hourLabel(h) {
  return new Date(2000, 0, 1, h).toLocaleTimeString(UI_LOCALE, { hour: "numeric", minute: "2-digit" }).replace(/:00(?=\s?[AP]M)/i, "");
}
function monthLabel(y, m, withYear) {
  return new Date(y, m, 1).toLocaleDateString(UI_LOCALE, withYear ? { month: "short", year: "numeric" } : { month: "short" });
}

/** events: [{i, t0, t1, kind, duration_min, place, ...}] -> stats, or null when there are none. */
export function computeStats(all) {
  const ev = all.filter((e) => Number.isFinite(e.t0)); // one malformed date must not break the summary
  if (!ev.length) return null;
  const byT = ev.slice().sort((a, b) => a.t0 - b.t0);
  const days = {}, places = {}, cities = {}, kinds = { same_place: 0, passing: 0, shared_route: 0 };
  const hours = new Array(24).fill(0), wdays = new Array(7).fill(0);
  let minutes = 0;
  for (const e of ev) {
    const d = new Date(e.t0 * 1000), k = localDayKey(d);
    (days[k] = days[k] || []).push(e);
    const p = placeOf(e);
    if (p) places[p] = (places[p] || 0) + 1;
    const c = cityOf(e);
    if (c) cities[c] = (cities[c] || 0) + 1;
    kinds[e.kind] = (kinds[e.kind] || 0) + 1;
    hours[d.getHours()]++;
    wdays[d.getDay()]++;
    minutes += e.duration_min;
  }
  // Per month from the first to the last crossing (zeros included, so gaps show); per year past 3 years.
  const first = new Date(byT[0].t0 * 1000), last = new Date(byT[byT.length - 1].t0 * 1000);
  const nMonths = (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1;
  let timeline;
  if (nMonths <= 36) {
    timeline = Array.from({ length: nMonths }, (_, i) => {
      const y = first.getFullYear() + Math.floor((first.getMonth() + i) / 12), m = (first.getMonth() + i) % 12;
      return { y, m, label: monthLabel(y, m, true), short: monthLabel(y, m, false), value: 0 };
    });
    for (const e of ev) {
      const d = new Date(e.t0 * 1000);
      timeline[(d.getFullYear() - first.getFullYear()) * 12 + d.getMonth() - first.getMonth()].value++;
    }
  } else {
    timeline = Array.from({ length: last.getFullYear() - first.getFullYear() + 1 }, (_, i) => {
      const y = first.getFullYear() + i;
      return { y, label: String(y), short: String(y), value: 0 };
    });
    for (const e of ev) timeline[new Date(e.t0 * 1000).getFullYear() - first.getFullYear()].value++;
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const busiest = Object.values(days).sort((a, b) => b.length - a.length || a[0].t0 - b[0].t0)[0];
  const longest = ev.reduce((a, b) => (b.duration_min > a.duration_min ? b : a));
  const argmax = (arr) => arr.indexOf(Math.max(...arr));
  return {
    count: ev.length,
    days: Object.keys(days).length,
    minutes,
    nPlaces: Object.keys(places).length,
    first: byT[0],
    last: byT[byT.length - 1],
    longest,
    busiest: { day: busiest[0], n: busiest.length },
    kinds,
    places: top(places, 6),
    cities: top(cities, 5),
    nCities: Object.keys(cities).length,
    timeline,
    monthly: nMonths <= 36,
    hours,
    wdays,
    peakHour: argmax(hours),
    peakDay: argmax(wdays),
  };
}
