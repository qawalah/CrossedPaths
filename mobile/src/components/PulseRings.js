import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { EASE_OUT, useReduceMotion } from "../motion";

/**
 * Rings that ripple out from the middle while `active`, and the content breathes with them:
 * the invitation to run a check. With "Remove animations" on it shows one still ring instead.
 */
export default function PulseRings({ size, color, active, ringWidth = 2, children }) {
  const reduce = useReduceMotion();
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const reset = () => [a, b, breath].forEach((v) => v.setValue(0));
    if (!active || reduce) return reset();
    const ripple = (v) => Animated.loop(Animated.timing(v, { toValue: 1, duration: 2400, easing: EASE_OUT, useNativeDriver: true }));
    const r1 = ripple(a);
    const r2 = Animated.sequence([Animated.delay(1200), ripple(b)]);
    const br = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    r1.start();
    r2.start();
    br.start();
    return () => {
      r1.stop();
      r2.stop();
      br.stop();
      reset();
    };
  }, [active, reduce]);

  const ring = (v) => ({
    position: "absolute",
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: ringWidth,
    borderColor: color,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 2.1] }) }],
  });
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {active && !reduce ? (
        <>
          <Animated.View pointerEvents="none" style={ring(a)} />
          <Animated.View pointerEvents="none" style={ring(b)} />
        </>
      ) : null}
      {active && reduce ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: ringWidth, borderColor: color, opacity: 0.45, transform: [{ scale: 1.3 }] }}
        />
      ) : null}
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </View>
  );
}
