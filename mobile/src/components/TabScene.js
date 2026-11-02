import { useIsFocused } from "@react-navigation/native";
import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { EASE_OUT, reduceMotion } from "../motion";

// Which tab was shown last, so a new one slides in from the side of the tab you picked.
let lastIndex = -1;

/** Wraps a tab screen: when it comes into view it slides in from the left or right and fades up. */
export default function TabScene({ index, children }) {
  const focused = useIsFocused();
  const op = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!focused) return;
    const from = lastIndex;
    lastIndex = index;
    if (from < 0 || from === index) return; // the first screen at launch just appears
    const calm = reduceMotion();
    op.setValue(0);
    tx.setValue(calm ? 0 : (index > from ? 1 : -1) * 36);
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: calm ? 160 : 300, easing: EASE_OUT, useNativeDriver: true }),
      Animated.timing(tx, { toValue: 0, duration: 380, easing: EASE_OUT, useNativeDriver: true }),
    ]).start();
  }, [focused]);

  return <Animated.View style={{ flex: 1, opacity: op, transform: [{ translateX: tx }] }}>{children}</Animated.View>;
}
