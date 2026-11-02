import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth";
import { loadStoredApiUrl } from "./src/api";
import RootNavigator from "./src/navigation/RootNavigator";
import { ToastProvider } from "./src/components/Toast";
import { ThemeProvider, useTheme } from "./src/themeContext";
import { colors } from "./src/theme";
import { subscribeLanguage, syncLanguage } from "./src/i18n";

function ThemedStatusBar() {
  useTheme(); // re-render when the theme changes
  return <StatusBar style={colors.isDark ? "light" : "dark"} backgroundColor={colors.bg} />;
}

export default function App() {
  const [urlLoaded, setUrlLoaded] = React.useState(false);
  // Android may keep the JS running after the app is closed, so read the language every time the UI
  // starts (and when it comes back to the front), not only when the code first loads.
  useState(() => syncLanguage());
  const [lang, setLang] = useState(0);
  useEffect(() => {
    const off = subscribeLanguage(() => setLang((n) => n + 1)); // a change re-renders the whole app in it
    const sub = AppState.addEventListener("change", (s) => s === "active" && syncLanguage());
    return () => {
      off();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    loadStoredApiUrl().finally(() => setUrlLoaded(true));
  }, []);

  if (!urlLoaded) return null; // brief splash while the stored server URL loads

  return (
    <GestureHandlerRootView style={{ flex: 1 }} key={lang}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ToastProvider>
          <ThemedStatusBar />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
