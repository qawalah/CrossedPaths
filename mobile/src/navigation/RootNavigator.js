import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import { useAuth } from "../auth";
import { useAppData } from "../useAppData";
import { registerForPushNotifications } from "../notifications";
import AuthScreen from "../screens/AuthScreen";
import SettingsScreen from "../screens/SettingsScreen";
import NewCheckModal from "../screens/NewCheckModal";
import ReviewCheckModal from "../screens/ReviewCheckModal";
import ResultsScreen from "../screens/ResultsScreen";
import MyTimelineScreen from "../screens/MyTimelineScreen";
import BuildTimelineModal from "../screens/BuildTimelineModal";
import AddNearbyScreen, { codeFrom } from "../screens/AddNearbyScreen";
import MainTabs from "./MainTabs";
import WelcomeScreen from "../screens/WelcomeScreen";
import { markWelcomeSeen, useWelcomeSeen } from "../welcome";
import { colors } from "../theme";
import { useTheme } from "../themeContext";

const Stack = createNativeStackNavigator();

// Invite links: crosspaths://pair/CODE opens "Meet in person" with that code ready to confirm.
// initialRouteName keeps the main tabs underneath, so Close/back work when a link starts the app.
const linking = {
  prefixes: ["crosspaths://"],
  config: { initialRouteName: "Main", screens: { AddNearby: "pair/:code" } },
};
const navRef = createNavigationContainerRef();


export default function RootNavigator() {
  const { user, ready, cfg } = useAuth();
  const appData = useAppData(!!user);
  const data = { ...appData, cfg };
  // A theme change remounts the navigator (every screen reads the new colours) but keeps where you are.
  const { themeKey } = useTheme();
  const welcomeSeen = useWelcomeSeen(); // the first-start tutorial, shown once (Account can show it again)
  const navState = useRef(undefined);
  const navTheme = {
    dark: colors.isDark,
    colors: { primary: colors.accent, background: colors.bg, card: colors.panel, text: colors.text, border: colors.line, notification: colors.bad },
  };

  useEffect(() => {
    if (user) registerForPushNotifications().catch(() => {});
  }, [user]);

  // An invite link opened while signed out: remember it and open it once signed in
  // (the navigator only reads the launch link while it's set up for a signed-in user).
  const [pendingCode, setPendingCode] = useState(null);
  useEffect(() => {
    if (!ready || user) return;
    const take = (url) => {
      const c = url && /pair\//.test(url) ? codeFrom(url) : null;
      if (c) setPendingCode(c);
    };
    Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener("url", ({ url }) => take(url));
    return () => sub.remove();
  }, [ready, user]);
  useEffect(() => {
    if (!user || !pendingCode) return;
    const code = pendingCode;
    setPendingCode(null);
    const t = setTimeout(() => navRef.isReady() && navRef.navigate("AddNearby", { code }), 400);
    return () => clearTimeout(t);
  }, [user, pendingCode]);

  if (!ready || welcomeSeen === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!welcomeSeen) return <WelcomeScreen onDone={markWelcomeSeen} />;

  return (
    <NavigationContainer
      key={themeKey}
      ref={navRef}
      theme={navTheme}
      linking={user ? linking : undefined}
      initialState={navState.current}
      onStateChange={(s) => {
        navState.current = s;
      }}
    >
      {/* pages rise and fade in; sheets slide up from the bottom */}
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade_from_bottom" }}>
        {!user ? (
          <>
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: true, title: "Server addresses" }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main">{() => <MainTabs data={data} />}</Stack.Screen>
            <Stack.Screen name="NewCheck" options={{ presentation: "modal", animation: "slide_from_bottom" }}>
              {(props) => <NewCheckModal {...props} uploads={data.uploads} onDone={data.refresh} />}
            </Stack.Screen>
            <Stack.Screen name="ReviewCheck" options={{ presentation: "modal", animation: "slide_from_bottom" }}>
              {(props) => <ReviewCheckModal {...props} checks={data.checks} uploads={data.uploads} onDone={data.refresh} />}
            </Stack.Screen>
            <Stack.Screen name="Results" component={ResultsScreen} />
            <Stack.Screen name="MyTimeline" component={MyTimelineScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: "modal", animation: "slide_from_bottom", headerShown: true, title: "Server addresses" }} />
            <Stack.Screen name="AddNearby" options={{ presentation: "modal", animation: "slide_from_bottom" }}>
              {(props) => <AddNearbyScreen {...props} uploads={data.uploads} loaded={data.loaded} onDone={data.refresh} />}
            </Stack.Screen>
            <Stack.Screen name="Build" options={{ presentation: "modal", animation: "slide_from_bottom" }}>
              {(props) => <BuildTimelineModal {...props} cfg={data.cfg} uploads={data.uploads} onDone={data.refresh} />}
            </Stack.Screen>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
