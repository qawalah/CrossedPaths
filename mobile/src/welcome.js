import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";

// Whether the first-start tutorial has been seen. Saved on the phone only; Account can show it again.
const KEY = "cp_welcome_seen";
let seen = null; // null until loaded
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(seen));

SecureStore.getItemAsync(KEY)
  .then((v) => (seen = v === "1"))
  .catch(() => (seen = false))
  .finally(emit);

export function markWelcomeSeen() {
  seen = true;
  emit();
  SecureStore.setItemAsync(KEY, "1").catch(() => {});
}

export function showWelcomeAgain() {
  seen = false;
  emit();
  SecureStore.deleteItemAsync(KEY).catch(() => {});
}

/** null while loading, then true / false. */
export function useWelcomeSeen() {
  const [v, setV] = useState(seen);
  useEffect(() => {
    listeners.add(setV);
    setV(seen);
    return () => listeners.delete(setV);
  }, []);
  return v;
}
