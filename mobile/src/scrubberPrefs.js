import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

// Settings for the date scrubber on My timeline. Saved on the phone only.
const KEY = "cp_scrubber";

export const ZOOM_GESTURES = [
  ["pull", "Slide up / down"],
  ["hold", "Hold still"],
  ["both", "Both"],
];
export const DEFAULT_SCRUBBER = { gesture: "pull", holdMs: 600, tutorialSeen: false };

let prefs = { ...DEFAULT_SCRUBBER };
let loaded = false;
let loading = null;
const listeners = new Set();

function load() {
  if (!loading) {
    loading = SecureStore.getItemAsync(KEY)
      .then((v) => {
        prefs = { ...DEFAULT_SCRUBBER, ...(v ? JSON.parse(v) : {}) };
      })
      .catch(() => {})
      .finally(() => {
        loaded = true;
        listeners.forEach((fn) => fn(prefs));
      });
  }
  return loading;
}

export function setScrubberPrefs(patch) {
  prefs = { ...prefs, ...patch };
  SecureStore.setItemAsync(KEY, JSON.stringify(prefs)).catch(() => {});
  listeners.forEach((fn) => fn(prefs));
}

/** [prefs, loaded]. Every screen using this sees changes made anywhere else straight away. */
export function useScrubberPrefs() {
  const [p, setP] = useState(prefs);
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    const fn = (next) => {
      setP(next);
      setReady(true);
    };
    listeners.add(fn);
    load();
    if (loaded) fn(prefs);
    return () => listeners.delete(fn);
  }, []);
  return [p, ready];
}
