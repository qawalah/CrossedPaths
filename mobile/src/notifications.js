import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Ask for permission and register this device's Expo push token with the server.
 *  Safe to call repeatedly (e.g. on every login) - the server upserts by token. */
export async function registerForPushNotifications() {
  if (!Device.isDevice) return null; // push tokens aren't meaningful on a simulator/emulator
  // Expo push tokens need an EAS project id (from an Expo account, set in app.json under
  // extra.eas.projectId). Without one getExpoPushTokenAsync always fails, so don't prompt the
  // user for a notification permission that can't do anything.
  const projectId = Constants.expoConfig && Constants.expoConfig.extra && Constants.expoConfig.extra.eas && Constants.expoConfig.extra.eas.projectId;
  if (!projectId) return null;
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
  try {
    await Api.registerDevice(Platform.OS, pushToken);
  } catch (e) {
    // Non-fatal: the app still works, just without push until this succeeds later.
  }
  return pushToken;
}

export async function unregisterCurrentDevice(pushToken) {
  if (!pushToken) return;
  try {
    await Api.unregisterDevice(pushToken);
  } catch (e) {
    /* best-effort */
  }
}
