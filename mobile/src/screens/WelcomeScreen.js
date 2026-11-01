import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import Button from "../components/Button";
import CrossingHero from "../components/CrossingHero";
import Icon from "../components/Icon";
import PulseRings from "../components/PulseRings";
import { EASE_OUT, reduceMotion } from "../motion";
import { colors } from "../theme";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const BLUE = "#0a84ff";
const GREEN = "#34c759";
const ART_H = 230;

// The first-start tutorial: full-screen cards you swipe through, each with its own small animation.
const PAGES = [
  {
    key: "hello",
    title: "Did our paths ever cross?",
    text: "Compare location histories with someone and find every time you were in the same place at the same time.",
  },
  {
    key: "import",
    step: 1,
    title: "Import your timeline",
    text: "Bring your location history from Google Maps, Strava, Garmin, Apple Health and more, or build one from the places in your photos.",
  },
  {
    key: "connect",
    step: 2,
    title: "Connect with someone",
    text: "Send a request by username, or meet in person and scan each other's code.",
  },
  {
    key: "check",
    step: 3,
    title: "Check together",
    text: "A check runs only when you both agree. They only ever see when and roughly where you crossed, never your route.",
  },
  {
    key: "results",
    step: 4,
    title: "See where you crossed",
    text: "Every time you were within about 100 m in the same 15 minutes, on a map, with a summary of when and where.",
  },
];

export default function WelcomeScreen({ onDone: finish }) {
  const { width } = useWindowDimensions();
  // fade the tutorial away into the app
  const out = useRef(new Animated.Value(1)).current;
  const onDone = () =>
    reduceMotion() ? finish() : Animated.timing(out, { toValue: 0, duration: 260, easing: EASE_OUT, useNativeDriver: true }).start(() => finish());
  const insets = useSafeAreaInsets();
  const scrollX = useRef(new Animated.Value(0)).current;
  const scroller = useRef(null);
  const [page, setPage] = useState(0);
  const [pageH, setPageH] = useState(0); // pages fill the swipe area so their content can sit in the middle
  const last = page === PAGES.length - 1;

  // made once: the swipe drives every page's motion on the native side, and tells us the page number
  const widthRef = useRef(width);
  widthRef.current = width;
  const onScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
      useNativeDriver: true,
      listener: (e) => {
        const i = Math.max(0, Math.min(PAGES.length - 1, Math.round(e.nativeEvent.contentOffset.x / widthRef.current)));
        setPage((cur) => (cur === i ? cur : i));
      },
    })
  ).current;

  const goTo = (i) => scroller.current && scroller.current.scrollTo({ x: i * width, animated: !reduceMotion() });

  return (
    <Animated.View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16), opacity: out, transform: [{ scale: out.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, height: 44, alignItems: "center" }}>
        {!last ? (
          <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 15 }}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <Animated.ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        style={{ flex: 1 }}
        onLayout={(e) => setPageH(e.nativeEvent.layout.height)}
      >
        {PAGES.map((p, i) => {
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          // the picture drifts further than the words, so pages feel layered as you swipe
          const artX = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.45, 0, -width * 0.45], extrapolate: "clamp" });
          const textX = scrollX.interpolate({ inputRange: range, outputRange: [width * 0.18, 0, -width * 0.18], extrapolate: "clamp" });
          const fade = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: "clamp" });
          const scale = scrollX.interpolate({ inputRange: range, outputRange: [0.85, 1, 0.85], extrapolate: "clamp" });
          return (
            <View key={p.key} style={{ width, height: pageH || undefined, justifyContent: "center", paddingHorizontal: 28 }}>
              <Animated.View style={{ height: ART_H + 20, alignItems: "center", justifyContent: "center", opacity: fade, transform: [{ translateX: artX }, { scale }] }}>
                <Art kind={p.key} active={page === i} width={Math.min(width - 56, 320)} />
              </Animated.View>
              <Animated.View style={{ marginTop: 26, opacity: fade, transform: [{ translateX: textX }] }}>
                {p.step ? (
                  <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 13, textAlign: "center", marginBottom: 8 }}>
                    Step {p.step} of 4
                  </Text>
                ) : null}
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: "800", textAlign: "center", lineHeight: 34 }}>{p.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: "center", marginTop: 12 }}>{p.text}</Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.ScrollView>

      <View style={{ paddingHorizontal: 24, gap: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
          {PAGES.map((p, i) => {
            const range = [(i - 1) * width, i * width, (i + 1) * width];
            return (
              <Pressable key={p.key} onPress={() => goTo(i)} hitSlop={6}>
                <Animated.View
                  style={{
                    height: 8,
                    width: 8,
                    borderRadius: 4,
                    backgroundColor: colors.accent,
                    opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.3, 1, 0.3], extrapolate: "clamp" }),
                    transform: [{ scaleX: scrollX.interpolate({ inputRange: range, outputRange: [1, 2.6, 1], extrapolate: "clamp" }) }],
                    marginHorizontal: 4,
                  }}
                />
              </Pressable>
            );
          })}
        </View>
        <Button title={last ? "Get started" : "Next"} onPress={() => (last ? onDone() : goTo(page + 1))} />
      </View>
    </Animated.View>
  );
}

function Art({ kind, active, width }) {
  if (kind === "hello") return <HelloArt active={active} width={width} />;
  if (kind === "import") return <ImportArt active={active} />;
  if (kind === "connect") return <ConnectArt active={active} />;
  if (kind === "check") return <CheckArt active={active} />;
  return <ResultsArt active={active} />;
}

/** One value that runs 0 → 1 each time the page becomes the current one. */
function usePlay(active, duration, delay = 0, easing = EASE_OUT, native = true) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    if (reduceMotion()) return v.setValue(1);
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [active]);
  return v;
}
const pop = (v, from = 0) => ({ opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }), transform: [{ scale: v.interpolate({ inputRange: [0, 0.6, 0.8, 1], outputRange: [from, 1.12, 0.96, 1] }) }] });

function HelloArt({ active, width }) {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (active) setKey((k) => k + 1);
  }, [active]);
  return <CrossingHero width={width} playKey={key} invite={false} />;
}

/** A card with a route drawing itself across it, points appearing, and an import badge. */
function ImportArt({ active }) {
  const draw = usePlay(active, 1200, 150, Easing.bezier(0.65, 0, 0.35, 1), false);
  const badge = usePlay(active, 600, 1100);
  const dots = [usePlay(active, 400, 450), usePlay(active, 400, 750), usePlay(active, 400, 1050)];
  const L = 320;
  return (
    <View style={{ width: 240, height: 200 }}>
      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 24, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line }} />
      <Svg width={240} height={200} viewBox="0 0 240 200" style={{ position: "absolute" }}>
        {[50, 100, 150].map((y) => (
          <Path key={y} d={`M16 ${y}H224`} stroke={colors.line} strokeWidth={1} />
        ))}
        {[80, 160].map((x) => (
          <Path key={x} d={`M${x} 16V184`} stroke={colors.line} strokeWidth={1} />
        ))}
        <AnimatedPath
          d="M30 165C70 160 60 110 105 105S150 60 205 40"
          fill="none"
          stroke={BLUE}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${L} ${L}`}
          strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [L, 0] })}
        />
      </Svg>
      {[
        [30, 165],
        [105, 105],
        [205, 40],
      ].map(([x, y], i) => (
        <Animated.View
          key={i}
          style={[{ position: "absolute", left: x - 9, top: y - 9, width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", borderWidth: 4, borderColor: BLUE }, pop(dots[i])]}
        />
      ))}
      <Animated.View
        style={[
          { position: "absolute", right: -14, top: -14, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: colors.bg },
          pop(badge),
        ]}
      >
        <Icon name="upload" size={28} color={colors.onAccent} strokeWidth={2.2} />
      </Animated.View>
    </View>
  );
}

function Avatar({ letter, color, size = 76 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.bg }}>
      <Text style={{ color: "#fff", fontSize: size * 0.4, fontWeight: "800" }}>{letter}</Text>
    </View>
  );
}

/** Two people slide in from either side and a link grows between them. */
function ConnectArt({ active }) {
  const slide = usePlay(active, 800, 100);
  const link = usePlay(active, 600, 700);
  const badge = usePlay(active, 600, 1150);
  return (
    <View style={{ width: 260, height: 200, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 120,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.accent,
          opacity: link,
          transform: [{ scaleX: link }],
        }}
      />
      <Animated.View style={{ position: "absolute", left: 18, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }], opacity: slide }}>
        <Avatar letter="A" color={BLUE} />
      </Animated.View>
      <Animated.View style={{ position: "absolute", right: 18, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }], opacity: slide }}>
        <Avatar letter="S" color={GREEN} />
      </Animated.View>
      <Animated.View
        style={[
          { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
          pop(badge),
        ]}
      >
        <Icon name="people" size={24} color={colors.accent} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", bottom: 6 }, pop(badge, 0.6)]}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Connected</Text>
        </View>
      </Animated.View>
    </View>
  );
}

/** Both people agree (a tick each), then the check starts pulsing in the middle. */
function CheckArt({ active }) {
  const t1 = usePlay(active, 550, 250);
  const t2 = usePlay(active, 550, 650);
  const go = usePlay(active, 600, 1050);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!active) return setPulse(false);
    const t = setTimeout(() => setPulse(true), 1400);
    return () => clearTimeout(t);
  }, [active]);
  const tick = (v) => (
    <Animated.View
      style={[
        { position: "absolute", right: -4, bottom: -4, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.good, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.bg },
        pop(v),
      ]}
    >
      <Icon name="check" size={16} color="#fff" strokeWidth={3} />
    </Animated.View>
  );
  return (
    <View style={{ width: 280, height: 200, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", left: 8 }}>
        <Avatar letter="A" color={BLUE} size={64} />
        {tick(t1)}
      </View>
      <View style={{ position: "absolute", right: 8 }}>
        <Avatar letter="S" color={GREEN} size={64} />
        {tick(t2)}
      </View>
      <Animated.View style={pop(go)}>
        <PulseRings size={84} color={colors.accent} ringWidth={2.5} active={pulse}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="crossing" size={44} color={colors.onAccent} strokeWidth={2} />
          </View>
        </PulseRings>
      </Animated.View>
    </View>
  );
}

/** A small map: both routes appear, pins drop on each crossing, and the count slides up. */
function ResultsArt({ active }) {
  const routes = usePlay(active, 700, 100);
  const pins = [usePlay(active, 650, 650, Easing.out(Easing.back(2))), usePlay(active, 650, 850, Easing.out(Easing.back(2))), usePlay(active, 650, 1050, Easing.out(Easing.back(2)))];
  const chip = usePlay(active, 500, 1400);
  const spots = [
    [70, 118],
    [132, 92],
    [190, 64],
  ];
  return (
    <View style={{ width: 260, height: 210 }}>
      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: 24, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, overflow: "hidden" }}>
        <Svg width={260} height={210} viewBox="0 0 260 210">
          <Rect x={0} y={150} width={260} height={60} fill={colors.panel2} />
          <Circle cx={40} cy={40} r={26} fill={colors.panel2} />
        </Svg>
      </View>
      <Animated.View style={{ position: "absolute", left: 0, top: 0, opacity: routes }}>
        <Svg width={260} height={210} viewBox="0 0 260 210">
          <Path d="M10 140C40 130 55 120 70 118S110 98 132 92S170 70 190 64S230 40 250 36" fill="none" stroke={BLUE} strokeWidth={6} strokeLinecap="round" />
          <Path d="M10 90C40 105 55 118 70 118S110 90 132 92S168 62 190 64S225 70 250 84" fill="none" stroke={GREEN} strokeWidth={6} strokeLinecap="round" />
        </Svg>
      </Animated.View>
      {spots.map(([x, y], i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: x - 15,
            top: y - 40,
            opacity: pins[i].interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
            transform: [{ translateY: pins[i].interpolate({ inputRange: [0, 1], outputRange: [-50, 0] }) }],
          }}
        >
          <Svg width={30} height={40} viewBox="0 0 24 24">
            <Path d="M12 2.8c-3.6 0-6.4 2.8-6.4 6.4 0 4.8 6.4 12 6.4 12s6.4-7.2 6.4-12c0-3.6-2.8-6.4-6.4-6.4z" fill="#fff" stroke="#1b2537" strokeWidth={1.8} strokeLinejoin="round" />
            <Circle cx={12} cy={9.2} r={2.3} fill="#fff" stroke="#1b2537" strokeWidth={1.8} />
          </Svg>
        </Animated.View>
      ))}
      <Animated.View
        style={{
          position: "absolute",
          bottom: 16,
          alignSelf: "center",
          opacity: chip,
          transform: [{ translateY: chip.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, backgroundColor: colors.accent }}>
          <Icon name="crossing" size={16} color={colors.onAccent} strokeWidth={2.2} />
          <Text style={{ color: colors.onAccent, fontWeight: "800" }}>3 crossings</Text>
        </View>
      </Animated.View>
    </View>
  );
}
