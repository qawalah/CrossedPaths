import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { AppState } from "react-native";

// ---------- which address to use: the main address, or the backup when it can't be reached ----------
// You can give the app two addresses of the same server: a main address and a backup one.
// With "switch automatically" on, the app uses the main address when it answers and the
// backup otherwise - checked at start-up, whenever the
// app comes back to the foreground, and whenever a request can't reach the server.
let HOME_URL = (Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.apiUrl) || "";
let ALT_URL = "";
let AUTO = true;
let ACTIVE = HOME_URL;
let INSTANCE = null; // the server's identity (from /api/config), so we never switch to a different server
const TOKEN_KEY = "crosspaths_token";
const URL_KEY = "crosspaths_api_url";
const ALT_KEY = "crosspaths_alt_url";
const AUTO_KEY = "crosspaths_auto_switch";
const ACTIVE_KEY = "crosspaths_active_url";
const INSTANCE_KEY = "crosspaths_instance";

const clean = (u) => (u || "").trim().replace(/\/+$/, "");
const listeners = new Set();
/** Subscribe to address changes (e.g. switching to the backup address). Returns an unsubscribe function. */
export function onServerChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getServerState() {
  return { home: HOME_URL, alt: ALT_URL, auto: AUTO, active: ACTIVE, via: ALT_URL && ACTIVE === ALT_URL && ACTIVE !== HOME_URL ? "backup" : "home" };
}
function setActive(url) {
  if (!url || url === ACTIVE) return;
  ACTIVE = url;
  SecureStore.setItemAsync(ACTIVE_KEY, url).catch(() => {});
  listeners.forEach((fn) => {
    try {
      fn(getServerState());
    } catch (e) {
      /* a listener's problem, not ours */
    }
  });
}

export async function loadStoredApiUrl() {
  try {
    const [home, alt, auto, active, inst] = await Promise.all([URL_KEY, ALT_KEY, AUTO_KEY, ACTIVE_KEY, INSTANCE_KEY].map((k) => SecureStore.getItemAsync(k)));
    if (home) HOME_URL = home;
    ALT_URL = alt || "";
    AUTO = auto !== "0";
    INSTANCE = inst || null;
    // Start where we were last time; the check below moves us if that's no longer right.
    ACTIVE = active && (active === HOME_URL || active === ALT_URL) ? active : HOME_URL || ALT_URL;
  } catch (e) {
    /* ignore */
  }
  resolveServer().catch(() => {}); // not awaited: the first request waits for it instead
  return ACTIVE;
}

/** Save the addresses. `home` is required, `alt` (backup) optional. */
export async function setServerAddresses({ home, alt, auto }) {
  const h = clean(home), a = clean(alt);
  if (h !== HOME_URL) INSTANCE = null; // a different server: learn its identity again
  HOME_URL = h;
  ALT_URL = a;
  AUTO = auto !== false;
  ACTIVE = HOME_URL;
  try {
    await SecureStore.setItemAsync(URL_KEY, HOME_URL);
    if (ALT_URL) await SecureStore.setItemAsync(ALT_KEY, ALT_URL);
    else await SecureStore.deleteItemAsync(ALT_KEY);
    await SecureStore.setItemAsync(AUTO_KEY, AUTO ? "1" : "0");
    if (!INSTANCE) await SecureStore.deleteItemAsync(INSTANCE_KEY);
  } catch (e) {
    /* ignore */
  }
  listeners.forEach((fn) => fn(getServerState()));
  return resolveServer({ force: true });
}
// Kept for older callers: just the main address.
export async function setApiUrl(url) {
  return setServerAddresses({ home: url, alt: ALT_URL, auto: AUTO });
}
export function getApiUrl() {
  return ACTIVE;
}

const PROBE_MS = 2500;
/** GET /api/config at one address. Resolves to {cfg, ms} or {error}. Never throws. */
export async function probeServer(base, ms = PROBE_MS) {
  if (!base) return { error: "not set" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const t0 = Date.now();
  try {
    const res = await fetch(clean(base) + "/api/config", { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return { error: `answered ${res.status}` };
    const cfg = await res.json();
    if (!cfg || typeof cfg !== "object" || !("version" in cfg)) return { error: "that isn't a CrossPaths server" };
    return { cfg, ms: Date.now() - t0 };
  } catch (e) {
    return { error: ctrl.signal.aborted ? "no answer" : "can't connect" };
  } finally {
    clearTimeout(timer);
  }
}
function sameServer(cfg) {
  return !INSTANCE || !cfg.instance || cfg.instance === INSTANCE;
}
function learnInstance(cfg) {
  if (!INSTANCE && cfg && cfg.instance) {
    INSTANCE = cfg.instance;
    SecureStore.setItemAsync(INSTANCE_KEY, INSTANCE).catch(() => {});
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let resolving = null;
let lastResolved = 0;
/** Pick the address to use now. The main address wins whenever it answers; the backup otherwise. */
export function resolveServer({ force } = {}) {
  if (resolving) return resolving;
  if (!AUTO || !ALT_URL || !HOME_URL || ALT_URL === HOME_URL) {
    setActive(HOME_URL || ALT_URL);
    return Promise.resolve(ACTIVE);
  }
  if (!force && Date.now() - lastResolved < 15000) return Promise.resolve(ACTIVE);
  resolving = (async () => {
    // Ask both at once, so being away from home costs ~2.5 s at most rather than a long timeout.
    const ph = probeServer(HOME_URL).then((r) => ({ k: "home", r }));
    const pa = probeServer(ALT_URL).then((r) => ({ k: "alt", r }));
    const good = (x) => x && x.r && x.r.cfg && sameServer(x.r.cfg);
    let first = await Promise.race([ph, pa]);
    let pick = null;
    if (first.k === "home") {
      if (good(first)) pick = first;
      else {
        const a = await pa;
        if (good(a)) pick = a;
      }
    } else if (good(first)) {
      // The backup answered first; give the main address a moment, since it's preferred.
      const h = await Promise.race([ph, sleep(600).then(() => null)]);
      pick = good(h) ? h : first;
    } else {
      const h = await ph;
      if (good(h)) pick = h;
    }
    if (pick) {
      learnInstance(pick.r.cfg);
      setActive(pick.k === "home" ? HOME_URL : ALT_URL);
    }
    lastResolved = Date.now();
    return ACTIVE;
  })().finally(() => {
    resolving = null;
  });
  return resolving;
}

// Back in the foreground (maybe on another network now): check which address works.
AppState.addEventListener("change", (s) => {
  if (s === "active") resolveServer().catch(() => {});
});

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}
export async function setToken(token) {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Called when the server says our token is no longer valid (expired after 14 days, or the
// server's keys changed), so the app can drop back to the sign-in screen instead of failing
// every request with "Please sign in".
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// React Native sets no network timeout, so an address that silently drops packets (VPN
// off, firewall) would hang for the OS connect timeout - about 2 minutes. Uploads get longer
// because a big Timeline file can take a while to send and parse on a small server.
const TIMEOUT_MS = 12000;
const UPLOAD_TIMEOUT_MS = 180000;

async function request(path, opts = {}, retried = false) {
  const { method = "GET", body, form, auth = true, raw = false } = opts;
  if (resolving) await resolving.catch(() => {}); // an address check is running: use its answer
  const base = ACTIVE;
  if (!base) throw new ApiError("Server address not set. Open Settings and enter your CrossPaths server URL.", 0);
  const headers = {};
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = "Bearer " + t;
  }
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), form ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);
  try {
    res = await fetch(base + path, { method, headers, body: payload, signal: ctrl.signal });
  } catch (e) {
    const timedOut = ctrl.signal.aborted;
    clearTimeout(timer);
    // Unreachable: maybe the address we're on has gone down. Check the other address,
    // and try again there - except a change that may already have reached the server before it
    // timed out, which must not be sent twice.
    if (!retried && AUTO && ALT_URL) {
      const now = await resolveServer({ force: true }).catch(() => base);
      if (now !== base && (method === "GET" || !timedOut)) return request(path, opts, true);
    }
    const two = AUTO && ALT_URL;
    throw new ApiError(
      two
        ? "Couldn't reach your server at either address. Check your connection."
        : timedOut
        ? "The server didn't answer in time. Check the address and your connection."
        : "Couldn't reach the server. Check the address and your connection.",
      0
    );
  } finally {
    clearTimeout(timer);
  }
  if (raw && res.ok) return res.text(); // a file download (timeline export)
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    /* no/invalid body */
  }
  if (res.status === 401 && auth) {
    if (onUnauthorized) onUnauthorized();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  if (!res.ok) {
    throw new ApiError((json && json.error) || `Request failed (${res.status})`, res.status);
  }
  return json;
}

export const Api = {
  ApiError,
  config: () => request("/api/config", { auth: false }),
  register: (handle, password, invite) => request("/api/register", { method: "POST", body: { handle, password, invite }, auth: false }),
  login: (handle, password) => request("/api/login", { method: "POST", body: { handle, password }, auth: false }),
  me: () => request("/api/me"),
  updateSettings: (patch) => request("/api/me/settings", { method: "PUT", body: patch }),

  uploads: () => request("/api/uploads"),
  upload: (fileUri, fileName) => {
    const form = new FormData();
    form.append("file", { uri: fileUri, name: fileName || "timeline.json", type: "application/json" });
    return request("/api/uploads", { method: "POST", form });
  },
  // One timeline from several sources: files (GPX, FIT, zips, a photo-scan JSON…) and/or your other
  // timelines (mergeIds). With targetId the sources are added to that timeline instead of a new one.
  saveTimeline: ({ targetId, files = [], mergeIds = [], removeMerged = false }) => {
    const form = new FormData();
    files.forEach((f) => form.append("file", { uri: f.uri, name: f.name || "location-file", type: f.type || "application/octet-stream" }));
    mergeIds.forEach((id) => form.append("merge_ids", id));
    if (removeMerged) form.append("remove_merged", "1");
    return request(targetId ? `/api/uploads/${targetId}/sources` : "/api/uploads", { method: "POST", form });
  },
  exportUpload: (id, format) => request(`/api/uploads/${id}/export?format=${format}`, { raw: true }),
  deleteUpload: (id) => request(`/api/uploads/${id}`, { method: "DELETE" }),
  putZones: (id, zones) => request(`/api/uploads/${id}/zones`, { method: "PUT", body: { zones } }),
  uploadSummary: (id, tz = 0) => request(`/api/uploads/${id}/summary?tz=${tz}`),
  uploadDay: (id, date, tz = 0) => request(`/api/uploads/${id}/day?date=${date}&tz=${tz}`),
  uploadVisits: (id, lat, lon, radiusM) => request(`/api/uploads/${id}/visits?lat=${lat}&lon=${lon}&radius_m=${radiusM}`),

  connections: () => request("/api/connections"),
  requestConnection: (handle) => request("/api/connections", { method: "POST", body: { handle } }),
  respondConnection: (id, action) => request(`/api/connections/${id}/respond`, { method: "POST", body: { action } }),
  removeConnection: (id) => request(`/api/connections/${id}`, { method: "DELETE" }),

  checks: () => request("/api/checks"),
  createCheck: (payload) => request("/api/checks", { method: "POST", body: payload }),
  consentCheck: (id, payload) => request(`/api/checks/${id}/consent`, { method: "POST", body: payload }),
  declineCheck: (id) => request(`/api/checks/${id}/decline`, { method: "POST" }),
  getCheck: (id) => request(`/api/checks/${id}`),
  myTrack: (id) => request(`/api/checks/${id}/my-track`),
  deleteCheck: (id) => request(`/api/checks/${id}`, { method: "DELETE" }),

  // Meeting in person: QR code / invite link / shake. Each connects you and, when you both
  // have a timeline, starts the check straight away.
  pairCode: (uploadId) => request("/api/pair/code", { method: "POST", body: { upload_id: uploadId || null } }),
  pairPreview: (code) => request(`/api/pair/code/${encodeURIComponent(code)}`),
  pairRedeem: (code, uploadId) => request("/api/pair/redeem", { method: "POST", body: { code, upload_id: uploadId || null } }),
  shake: (lat, lon, acc, uploadId) => request("/api/pair/shake", { method: "POST", body: { lat, lon, acc, upload_id: uploadId || null } }),
  shakeStatus: (id) => request(`/api/pair/shake/${id}`),

  registerDevice: (platform, pushToken) => request("/api/devices", { method: "POST", body: { platform, push_token: pushToken } }),
  unregisterDevice: (pushToken) => request("/api/devices", { method: "DELETE", body: { push_token: pushToken } }),
};
