import { Alert, BackHandler } from "react-native";
import { layoutMatches, setLanguage } from "./i18n";

/** Save the language and switch the text straight away. Android sets the layout direction (right-to-left
 *  for Arabic) only when the app's screen is created, so if that has to flip, ask to reopen the app.
 *  Both languages are shown, since the person may not read the one the app was in. */
export async function changeLanguage(pref) {
  await setLanguage(pref);
  if (layoutMatches()) return;
  Alert.alert(
    "Reopen · إعادة الفتح",
    "To flip the layout direction, close CrossPaths and open it again.\n\nلقلب اتجاه الواجهة، أغلق CrossPaths ثم افتحه من جديد.",
    [
      { text: "Later · لاحقًا", style: "cancel" },
      { text: "Close app · إغلاق", onPress: () => BackHandler.exitApp() },
    ]
  );
}
