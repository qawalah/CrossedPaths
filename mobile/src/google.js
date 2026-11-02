// Google sign-in: returns a Google ID token for the server to check, or null if cancelled.
// webClientId comes from the server (/api/config auth.google_client_id), so one app build
// works with any server. The Android OAuth client (package + signing SHA-1) must be in the
// same Google Cloud project as that web client.
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { t } from "./i18n";

export async function googleIdToken(webClientId) {
  if (!webClientId) throw new Error(t("Google sign-in isn't set up on this server."));
  GoogleSignin.configure({ webClientId });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    await GoogleSignin.signOut().catch(() => {}); // always show the account chooser
    const r = await GoogleSignin.signIn();
    if (r && r.type === "cancelled") return null;
    const token = (r && r.data && r.data.idToken) || (r && r.idToken);
    if (!token) throw new Error(t("Google didn't return a sign-in token. Try again."));
    return token;
  } catch (e) {
    if (e && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return null;
    if (e && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error(t("Google Play services is needed for Google sign-in."));
    throw e;
  }
}
