import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "../theme";
import { EASE_OUT, useReduceMotion } from "../motion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// The app icon, animated: the blue and green routes draw in from opposite sides and cross,
// the halo spreads, then the pin drops onto the crossing. Drawn on a 240 × 190 grid.
const VB_W = 240;
const VB_H = 190;
const CX = 120;
const CY = 132;
const DASH = 300; // longer than either route, so one dash covers it
const BLUE = "#0a84ff";
const GREEN = "#34c759";
const PIN = "M12 2.8c-3.6 0-6.4 2.8-6.4 6.4 0 4.8 6.4 12 6.4 12s6.4-7.2 6.4-12c0-3.6-2.8-6.4-6.4-6.4z";

/**
 * playKey: change it to play the animation again (e.g. each time the Checks tab opens).
 * invite: rings ripple from the crossing while a check is ready to run.
 */
export default function CrossingHero({ width, playKey, invite, onPress, accessibilityLabel }) {
  const reduce = useReduceMotion();
  const k = width / VB_W;
  const blue = useRef(new Animated.Value(DASH)).current;
  const green = useRef(new Animated.Value(DASH)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const pin = useRef(new Animated.Value(0)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      blue.setValue(0);
      green.setValue(0);
      halo.setValue(1);
      pin.setValue(1);
      return;
    }
    blue.setValue(DASH);
    green.setValue(DASH);
    halo.setValue(0);
    pin.setValue(0);
    const draw = Easing.bezier(0.65, 0, 0.35, 1);
    const a = Animated.parallel([
      Animated.timing(blue, { toValue: 0, duration: 1000, easing: draw, useNativeDriver: false }),
      Animated.timing(green, { toValue: 0, duration: 1000, delay: 120, easing: draw, useNativeDriver: false }),
      Animated.timing(halo, { toValue: 1, duration: 700, delay: 850, easing: EASE_OUT, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(1100),
        Animated.spring(pin, { toValue: 1, damping: 7, stiffness: 140, mass: 0.8, useNativeDriver: true }),
      ]),
    ]);
    a.start();
    return () => a.stop();
  }, [playKey, reduce]);

  useEffect(() => {
    if (!invite || reduce) {
      ring1.setValue(0);
      ring2.setValue(0);
      return;
    }
    const ripple = (v) => Animated.loop(Animated.timing(v, { toValue: 1, duration: 2600, easing: EASE_OUT, useNativeDriver: true }));
    const r = Animated.sequence([Animated.delay(1900), Animated.parallel([ripple(ring1), Animated.sequence([Animated.delay(1300), ripple(ring2)])])]);
    r.start();
    return () => r.stop();
  }, [invite, reduce, playKey]);

  const box = (size, cx = CX, cy = CY) => ({ position: "absolute", left: (cx - size / 2) * k, top: (cy - size / 2) * k, width: size * k, height: size * k });
  const ring = (v) => ({
    ...box(60),
    borderRadius: 30 * k,
    borderWidth: 2,
    borderColor: colors.accent,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  });
  // pin: the 24-unit icon scaled ×3.4, placed so its tip sits on the crossing
  const pinSize = 24 * 3.4;
  const pinBox = { position: "absolute", left: (CX - 12 * 3.4) * k, top: (CY - 21.2 * 3.4) * k, width: pinSize * k, height: pinSize * k };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.timing(lift, { toValue: 1, duration: 150, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(lift, { toValue: 0, duration: 250, easing: EASE_OUT, useNativeDriver: true }).start()}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{ width, height: VB_H * k, alignSelf: "center" }}
    >
      {invite && reduce ? <View pointerEvents="none" style={[box(60), { borderRadius: 30 * k, borderWidth: 2, borderColor: colors.accent, opacity: 0.4, transform: [{ scale: 1.35 }] }]} /> : null}
      <Animated.View pointerEvents="none" style={ring(ring1)} />
      <Animated.View pointerEvents="none" style={ring(ring2)} />
      <Animated.View
        pointerEvents="none"
        style={[
          box(60),
          {
            borderRadius: 30 * k,
            backgroundColor: "rgba(10,132,255,0.16)",
            borderWidth: 1.5,
            borderColor: "rgba(10,132,255,0.45)",
            opacity: halo,
            transform: [{ scale: halo }],
          },
        ]}
      />
      <Svg width={width} height={VB_H * k} viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ position: "absolute" }}>
        <Defs>
          {[["hb", BLUE], ["hg", GREEN]].map(([id, c]) => (
            <LinearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={c} stopOpacity="0" />
              <Stop offset="0.2" stopColor={c} />
              <Stop offset="0.8" stopColor={c} />
              <Stop offset="1" stopColor={c} stopOpacity="0" />
            </LinearGradient>
          ))}
        </Defs>
        <G fill="none" strokeWidth={13} strokeLinecap="round">
          {/* green starts on the right and blue on the left, so they meet in the middle */}
          <AnimatedPath d="M240 102C180 102 150 117 120 132S52 164 0 164" stroke="url(#hg)" strokeDasharray={`${DASH} ${DASH}`} strokeDashoffset={green} />
          <AnimatedPath d="M0 98C60 98 90 115 120 132S190 166 240 166" stroke="url(#hb)" strokeDasharray={`${DASH} ${DASH}`} strokeDashoffset={blue} />
        </G>
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[
          box(26),
          {
            height: 8 * k,
            top: (CY - 3) * k,
            borderRadius: 13 * k,
            backgroundColor: "rgba(3,10,25,0.35)",
            opacity: pin.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
            transform: [{ scaleX: pin.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          pinBox,
          {
            opacity: pin.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: "clamp" }),
            transform: [
              { translateY: Animated.add(pin.interpolate({ inputRange: [0, 1], outputRange: [-90 * k, 0] }), lift.interpolate({ inputRange: [0, 1], outputRange: [0, -4 * k] })) },
            ],
          },
        ]}
      >
        <Svg width={pinSize * k} height={pinSize * k} viewBox="0 0 24 24">
          <Path d={PIN} fill="#fff" stroke="#1b2537" strokeWidth={1.75} strokeLinejoin="round" />
          <Circle cx={12} cy={9.2} r={2.4} fill="#fff" stroke="#1b2537" strokeWidth={1.75} />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
