import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { colors } from "../theme";
import { EASE_OUT, reduceMotion, tint } from "../motion";
import PulseRings from "./PulseRings";
import Icon from "./Icon";

const ICONS = { Timeline: "route", People: "people", Checks: "checks", Account: "account" };

const PILL_W = 60;
const PILL_H = 32;

/**
 * The bottom tab bar: a pill slides (and briefly stretches) from tab to tab, the chosen icon pops,
 * and the Checks icon pulses while a check is ready to run.
 */
export default function TabBar({ state, navigation, insets, badges = {}, invite }) {
  const [w, setW] = useState(0);
  const n = state.routes.length;
  const pos = useRef(new Animated.Value(state.index)).current;
  const stretch = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion()) return pos.setValue(state.index);
    Animated.parallel([
      Animated.spring(pos, { toValue: state.index, damping: 20, stiffness: 190, mass: 0.9, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(stretch, { toValue: 1, duration: 140, easing: EASE_OUT, useNativeDriver: true }),
        Animated.timing(stretch, { toValue: 0, duration: 300, easing: EASE_OUT, useNativeDriver: true }),
      ]),
    ]).start();
  }, [state.index]);

  const tabW = w / n;
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        backgroundColor: colors.panel,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {w > 0 && n > 1 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 6,
            left: (tabW - PILL_W) / 2,
            width: PILL_W,
            height: PILL_H,
            borderRadius: PILL_H / 2,
            backgroundColor: tint(colors.accent, 0.17),
            transform: [
              { translateX: pos.interpolate({ inputRange: [0, n - 1], outputRange: [0, tabW * (n - 1)] }) },
              { scaleX: stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
              { scaleY: stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) },
            ],
          }}
        />
      ) : null}
      {state.routes.map((route, i) => (
        <Tab
          key={route.key}
          name={route.name}
          focused={state.index === i}
          badge={badges[route.name]}
          invite={route.name === "Checks" && invite && state.index !== i}
          onPress={() => {
            const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (state.index !== i && !e.defaultPrevented) navigation.navigate(route.name);
          }}
        />
      ))}
    </View>
  );
}

function Tab({ name, focused, badge, invite, onPress }) {
  const pop = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    if (!focused || reduceMotion()) return;
    pop.setValue(0.82);
    Animated.spring(pop, { toValue: 1, damping: 9, stiffness: 260, mass: 0.7, useNativeDriver: true }).start();
  }, [focused]);

  const color = focused || invite ? colors.accent : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={invite ? `${name}, a check is ready to run` : badge ? `${name}, ${badge} waiting for you` : name}
      style={{ flex: 1, alignItems: "center", gap: 4 }}
    >
      <View style={{ height: PILL_H, justifyContent: "center", alignItems: "center" }}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <PulseRings size={26} color={colors.accent} active={invite}>
            <Icon name={ICONS[name] || "account"} size={23} color={color} />
          </PulseRings>
        </Animated.View>
        {badge ? (
          <View
            style={{
              position: "absolute",
              top: 1,
              left: "50%",
              marginLeft: 6,
              minWidth: 17,
              height: 17,
              borderRadius: 9,
              paddingHorizontal: 4,
              backgroundColor: colors.bad,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 10.5, fontWeight: "700" }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color, fontSize: 12, fontWeight: focused ? "700" : "500" }}>{name}</Text>
    </Pressable>
  );
}
