import { useEffect, useState } from "react";
import { AccessibilityInfo, Easing } from "react-native";

// One motion vocabulary for the app: confident arrivals, quicker exits.
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN = Easing.bezier(0.4, 0, 1, 1);

let reduced = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => (reduced = !!v))
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => (reduced = !!v));

/** The system "Remove animations" setting, read once (for one-off animations). */
export const reduceMotion = () => reduced;

/** The same setting as state, so looping animations stop when it's turned on. */
export function useReduceMotion() {
  const [r, setR] = useState(reduced);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => setR(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setR(!!v));
    return () => sub.remove();
  }, []);
  return r;
}

/** The accent colour at a given opacity (accents are #rrggbb). */
export const tint = (hex, alpha) =>
  /^#[0-9a-f]{6}$/i.test(hex) ? hex + Math.round(alpha * 255).toString(16).padStart(2, "0") : hex;
