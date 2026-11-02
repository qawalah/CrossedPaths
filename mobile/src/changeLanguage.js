import { Alert, BackHandler } from "react-native";
import { setLanguage } from "./i18n";

/** Save the language and ask for a restart: Android applies a language (and its layout direction) when the app
 *  starts. Both languages are shown, since the person may not read the one the app is in right now. */
export async function changeLanguage(pref) {
  await setLanguage(pref);
  Alert.alert(
    "Restart · إعادة التشغيل",
    "The language changes the next time you open CrossPaths. Close it now and open it again.\n\nتتغير اللغة عند فتح CrossPaths في المرة القادمة. أغلقه الآن ثم افتحه من جديد.",
    [
      { text: "Later · لاحقًا", style: "cancel" },
      { text: "Close app · إغلاق", onPress: () => BackHandler.exitApp() },
    ]
  );
}
