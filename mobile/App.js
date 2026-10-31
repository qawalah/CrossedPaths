import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth";
import { loadStoredApiUrl } from "./src/api";
import RootNavigator from "./src/navigation/RootNavigator";
import { ToastProvider } from "./src/components/Toast";
import { ThemeProvider, useTheme } from "./src/themeContext";
import { colors } from "./src/theme";

function ThemedStatusBar() {
  useTheme(); // re-render when the theme changes
  return <StatusBar style={colors.isDark ? "light" : "dark"} backgroundColor={colors.bg} />;
}

export default function App() {
  const [urlLoaded, setUrlLoaded] = React.useState(false);

  useEffect(() => {
    loadStoredApiUrl().finally(() => setUrlLoaded(true));
  }, []);

  if (!urlLoaded) return null; // brief splash while the stored server URL loads

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
