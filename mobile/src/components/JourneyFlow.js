import React, { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { colors } from "../theme";
import { EASE_OUT, reduceMotion, tint } from "../motion";
import { FLOW, flowGo, flowHint, journey } from "../journey";
import Button from "./Button";

const NODE = 28;

/**
 * The four steps to a result (timeline → connect → check → crossings), with what to do next.
 * Steps fill in as they're done; it disappears once there's a finished check.
 */
export default function JourneyFlow({ data, navigation, hideHint }) {
  const j = journey(data);
  const fill = useRef(new Animated.Value(Math.max(0, j.current) / (FLOW.length - 1))).current;
  const hintIn = useRef(new Animated.Value(1)).current;
  const [msg, act] = flowHint(j, data.connections);
  const lastMsg = useRef(msg);

  useEffect(() => {
    if (j.current < 0) return;
    const to = j.current / (FLOW.length - 1);
    if (reduceMotion()) return fill.setValue(to);
    Animated.timing(fill, { toValue: to, duration: 700, easing: EASE_OUT, useNativeDriver: false }).start();
  }, [j.current]);

  useEffect(() => {
    if (lastMsg.current === msg) return;
    lastMsg.current = msg;
    if (reduceMotion()) return;
    hintIn.setValue(0);
    Animated.timing(hintIn, { toValue: 1, duration: 320, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [msg]);

  if (!data.loaded || j.current < 0) return null;
  const step = FLOW[j.current][0];
  return (
    <View style={{ marginBottom: 18 }}>
      <View style={{ flexDirection: "row" }} accessibilityRole="list" accessibilityLabel="Your progress">
        <View style={{ position: "absolute", left: "12.5%", right: "12.5%", top: NODE / 2 - 1, height: 2, borderRadius: 1, backgroundColor: colors.line, overflow: "hidden" }}>
          <Animated.View
            style={{ height: 2, backgroundColor: colors.accent, width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }}
          />
        </View>
        {FLOW.map(([k, label], i) => (
          <Step
            key={k}
            n={i + 1}
            label={label}
            delay={i * 90}
            state={j.has[k] ? "done" : i === j.current ? "cur" : "todo"}
            onPress={() => flowGo(navigation, j, k, data.uploads)}
          />
        ))}
      </View>
      {msg && !hideHint ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginTop: 10,
            paddingVertical: 9,
            paddingLeft: 14,
            paddingRight: act ? 9 : 14,
            borderRadius: 14,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.line,
            opacity: hintIn,
            transform: [{ translateY: hintIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
          }}
        >
          <Text style={{ flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 }}>{msg}</Text>
          {act ? (
            <Button title={act} onPress={() => flowGo(navigation, j, step, data.uploads)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }} />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Step({ n, label, state, delay, onPress }) {
  const pop = useRef(new Animated.Value(1)).current;
  const was = useRef(null);
  useEffect(() => {
    const becameDone = state === "done" && was.current !== "done";
    was.current = state;
    if (!becameDone || reduceMotion()) return;
    pop.setValue(0.6);
    Animated.sequence([Animated.delay(delay), Animated.spring(pop, { toValue: 1, damping: 9, stiffness: 220, mass: 0.7, useNativeDriver: true })]).start();
  }, [state]);

  const done = state === "done";
  const cur = state === "cur";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Step ${n}, ${label}: ${done ? "done" : cur ? "next" : "not yet"}`}
      style={{ flex: 1, alignItems: "center", gap: 5 }}
    >
      <Animated.View
        style={{
          width: NODE,
          height: NODE,
          borderRadius: NODE / 2,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: done || cur ? colors.accent : colors.line,
          backgroundColor: done ? colors.accent : colors.bg,
          transform: [{ scale: pop }],
        }}
      >
        {cur ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", width: NODE + 8, height: NODE + 8, borderRadius: (NODE + 8) / 2, borderWidth: 4, borderColor: tint(colors.accent, 0.18) }}
          />
        ) : null}
        {done ? (
          <Svg width={15} height={15} viewBox="0 0 24 24">
            <Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={colors.onAccent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        ) : (
          <Text style={{ color: cur ? colors.accent : colors.muted, fontSize: 12.5, fontWeight: "800" }}>{n}</Text>
        )}
      </Animated.View>
      <Text style={{ color: done || cur ? colors.text : colors.muted, fontSize: 11.5, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
