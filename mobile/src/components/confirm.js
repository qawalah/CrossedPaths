import { Alert } from "react-native";
import { t } from "../i18n";

/** Native "are you sure?" dialog. Resolves true only if the user taps the action button. */
export function confirm(title, message, actionLabel = t("Delete")) {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: t("Cancel"), style: "cancel", onPress: () => resolve(false) },
        { text: actionLabel, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
