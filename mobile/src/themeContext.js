import * as SecureStore from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { applyTheme, DEFAULT_THEME } from "./theme";

const KEY = "cp_theme";
const ThemeContext = createContext({ pref: DEFAULT_THEME, themeKey: "", setTheme: () => {} });

/** Loads the saved theme, follows the system light/dark setting, and exposes setTheme.
 *  `themeKey` changes whenever the colours do; the navigator remounts on it (keeping its state). */
export function ThemeProvider({ children }) {
  const scheme = useColorScheme();
  const [pref, setPref] = useState(null);

  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => setPref({ ...DEFAULT_THEME, ...(v ? JSON.parse(v) : {}) }))
      .catch(() => setPref(DEFAULT_THEME));
  }, []);

  const setTheme = useCallback((patch) => {
    setPref((p) => {
      const next = { ...DEFAULT_THEME, ...p, ...patch };
      SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  if (!pref) return null; // a few ms while the saved theme loads, so nothing flashes in the wrong colours
  const themeKey = applyTheme(pref, scheme); // rewrites `colors` before anything below renders
  return React.createElement(ThemeContext.Provider, { value: { pref, themeKey, setTheme } }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}
