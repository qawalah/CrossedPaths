import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Button from "./Button";
import { colors } from "../theme";

// Shown the first time someone opens My timeline (and from the "?" next to the date bar).
// A finger plays the gesture on a small copy of the bar, in step with the written steps.

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const LOOP_MS = 7600;
const BUBBLE = ["2024", "March 2024", "Thu 14 Mar"];
const LEVEL = ["Years", "Months", "Days"];
// [t, x (0-1 across the bar), lift (0 on the bar, 1 = one zoom step up), finger visible]
const PATH = [
  [0, 0.2, 0, 0],
  [0.06, 0.2, 0, 1],
  [0.26, 0.72, 0, 1],
  [0.38, 0.72, 1, 1],
  [0.52, 0.34, 1, 1],
  [0.64, 0.34, 2, 1],
  [0.8, 0.6, 2, 1],
  [0.86, 0.6, 2, 0],
  [1, 0.6, 2, 0],
];
// when each zoom step lands, and the window for the hold ring
const ZOOM_AT = [0.33, 0.59];
const HOLD = [
  [0.26, 0.33],
  [0.52, 0.59],
];

function bars(seed, n) {
  let s = seed;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, () => (r() < 0.12 ? 0 : 0.25 + r() * 0.75));
}

export default function ScrubberTutorial({ visible, gesture = "pull", onClose }) {
  const t = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  const [level, setLevel] = useState(0);
  const [phase, setPhase] = useState(0); // which written step the finger is on
  const [fx, setFx] = useState(0.2); // finger position along the bar, 0-1
  const hold = gesture === "hold";

  useEffect(() => {
    if (!visible) return;
    t.setValue(0);
    const anim = Animated.loop(Animated.timing(t, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: false }));
    const id = t.addListener(({ value }) => {
      setLevel(value < ZOOM_AT[0] ? 0 : value < ZOOM_AT[1] ? 1 : 2);
      setPhase(value < 0.26 ? 0 : value > 0.82 ? 2 : 1);
      const k = PATH.findIndex((q) => q[0] >= value);
      const a = PATH[Math.max(0, k - 1)], b = PATH[Math.max(0, k)];
      const f = b[0] > a[0] ? a[1] + ((b[1] - a[1]) * (value - a[0])) / (b[0] - a[0]) : b[1];
      setFx((old) => (Math.abs(old - f) > 0.01 ? f : old));
    });
    anim.start();
    return () => {
      anim.stop();
      t.removeListener(id);
    };
  }, [visible]);

  const heights = useMemo(() => [bars(7, 28), bars(31, 24), bars(97, 18)], []);
  const range = PATH.map((p) => p[0]);
  const x = t.interpolate({ inputRange: range, outputRange: PATH.map((p) => p[1] * Math.max(1, w)) });
  const lift = t.interpolate({ inputRange: range, outputRange: PATH.map((p) => (hold ? 0 : -p[2] * 26)) });
  const opacity = t.interpolate({ inputRange: range, outputRange: PATH.map((p) => p[3]) });
  const R = 20, C = 2 * Math.PI * R;
  const ring = t.interpolate({
    inputRange: [0, HOLD[0][0], HOLD[0][1], HOLD[0][1] + 0.001, HOLD[1][0], HOLD[1][1], HOLD[1][1] + 0.001, 1],
    outputRange: [C, C, 0, C, C, 0, C, C],
  });

  const zoomWord = hold ? "Hold still" : gesture === "both" ? "Slide up (or hold still)" : "Slide your finger up";
  const steps = [
    ["Press and drag along the bar", "You move through the years. The bubble shows where you are."],
    [zoomWord, hold ? "The ring fills and the bar zooms into months, then days." : "Each step up zooms in: months, then days. Slide down to zoom back out."],
    ["Let go to open that day", "Empty days are skipped. Push against an edge while zoomed in to keep going."],
  ];
  const bh = heights[level];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: colors.panel, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 18 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>Pick a day by scrubbing</Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
            The date bar under the map works like the seek bar on a long video.
          </Text>

          <View style={{ marginTop: 18, paddingTop: 70, paddingBottom: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.panel2 }}>
            <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 44 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", height: 40, gap: 2 }}>
                {bh.map((h, i) => {
                  const at = Math.min(bh.length - 1, Math.floor(fx * bh.length));
                  const hl = level === 2 ? i === at : Math.abs(i - at) <= (level === 1 ? 1 : 3);
                  return (
                    <View
                      key={level + "-" + i}
                      style={{ flex: 1, height: h ? 4 + h * 36 : 2, borderRadius: 2, backgroundColor: h ? (hl ? colors.accent : colors.accent2) : colors.line, opacity: h ? (hl ? 1 : 0.45) : 1 }}
                    />
                  );
                })}
              </View>
              <View style={{ height: 2, backgroundColor: colors.line, marginTop: 2 }} />

              {w > 0 ? (
                <Animated.View style={{ position: "absolute", left: -22, top: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity, transform: [{ translateX: x }, { translateY: lift }] }}>
                  <View style={{ position: "absolute", bottom: 50, width: 116, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.text, alignItems: "center" }}>
                    <Text style={{ color: colors.accent, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 }}>{LEVEL[level].toUpperCase()}</Text>
                    <Text style={{ color: colors.bg, fontWeight: "800", fontSize: 13.5 }}>{BUBBLE[level]}</Text>
                  </View>
                  {hold || gesture === "both" ? (
                    <Svg width={44} height={44} style={{ position: "absolute" }}>
                      <AnimatedCircle cx={22} cy={22} r={R} stroke={colors.accent} strokeWidth={3} fill="none" strokeDasharray={[C, C]} strokeDashoffset={ring} strokeLinecap="round" transform="rotate(-90 22 22)" />
                    </Svg>
                  ) : null}
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.text, opacity: 0.35, borderWidth: 2, borderColor: colors.text }} />
                </Animated.View>
              ) : null}
            </View>
            {!hold ? (
              <Text style={{ color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 6 }}>{level < 2 ? "↑ slide up to zoom" : "↓ slide down to zoom out"}</Text>
            ) : null}
          </View>

          <View style={{ marginTop: 16, gap: 12 }}>
            {steps.map(([title, body], i) => {
              const on = i === phase;
              return (
                <View key={i} style={{ flexDirection: "row", gap: 12, opacity: on ? 1 : 0.55 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.accent : colors.panel2, borderWidth: 1, borderColor: on ? colors.accent : colors.line }}>
                    <Text style={{ color: on ? colors.onAccent : colors.muted, fontWeight: "800", fontSize: 12 }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2, lineHeight: 17 }}>{body}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 16 }}>You can change the zoom gesture in Account → Timeline date bar.</Text>
          <Button title="Got it" onPress={onClose} style={{ marginTop: 14 }} />
        </View>
      </View>
    </Modal>
  );
}
