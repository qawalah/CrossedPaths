// Fingerprint / face / device-PIN lock in front of the stored sign-in token.
// Nothing here throws: any native failure reads as "not available" or "not unlocked".
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { t } from "./i18n";

const KEY = "bio_lock";

// Something to unlock with: enrolled biometrics, or at least a screen-lock PIN/pattern.
export async function isAvailable() {
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    return level !== LocalAuthentication.SecurityLevel.NONE;
  } catch (e) {
    return false;
  }
}

export async function hasBiometrics() {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch (e) {
    return false;
  }
}

export async function isEnabled() {
  try {
    return (await SecureStore.getItemAsync(KEY)) === "1";
  } catch (e) {
    return false;
  }
}

export async function setEnabled(on) {
  try {
    if (on) await SecureStore.setItemAsync(KEY, "1");
    else await SecureStore.deleteItemAsync(KEY);
  } catch (e) {
    /* ignore */
  }
}

export async function unlock(promptMessage) {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: promptMessage || t("Unlock CrossPaths"), cancelLabel: t("Cancel"), disableDeviceFallback: false });
    return !!r.success;
  } catch (e) {
    return false;
  }
}
