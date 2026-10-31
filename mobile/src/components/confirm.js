import { Alert } from "react-native";

/** Native "are you sure?" dialog. Resolves true only if the user taps the action button. */
export function confirm(title, message, actionLabel = "Delete") {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: actionLabel, style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
