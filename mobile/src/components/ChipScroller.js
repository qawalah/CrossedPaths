import React, { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { colors } from "../theme";

/** One line of chips that scrolls sideways. When there's more off either edge, that edge fades
 *  out and shows an arrow button that scrolls the row along. `selected` (child index) starts in view. */
export default function ChipScroller({ children, selected, bg }) {
  const ref = useRef(null);
  const xs = useRef([]);
  const scrolledToSel = useRef(false);
  const [w, setW] = useState(0);
  const [cw, setCw] = useState(0);
  const [x, setX] = useState(0);
  const items = React.Children.toArray(children);
  const canL = x > 4;
  const canR = w > 0 && x + w < cw - 4;
  const fadeTo = bg || colors.panel;

  function maybeShowSelected() {
    if (scrolledToSel.current || !w || selected == null || selected <= 0) return;
    const sx = xs.current[selected];
    if (sx == null) return;
    scrolledToSel.current = true;
    ref.current && ref.current.scrollTo({ x: Math.max(0, sx - w / 2 + 40), animated: false });
  }

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        onContentSizeChange={(width) => setCw(width)}
        contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      >
        {items.map((child, i) => (
          <View
            key={child.key || i}
            onLayout={(e) => {
              xs.current[i] = e.nativeEvent.layout.x;
              if (i === selected) maybeShowSelected();
            }}
          >
            {child}
          </View>
        ))}
      </ScrollView>
      {canL ? <Edge side="left" bg={fadeTo} onPress={() => ref.current && ref.current.scrollTo({ x: Math.max(0, x - w * 0.7) })} /> : null}
      {canR ? <Edge side="right" bg={fadeTo} onPress={() => ref.current && ref.current.scrollTo({ x: Math.min(cw - w, x + w * 0.7) })} /> : null}
    </View>
  );
}

function Edge({ side, bg, onPress }) {
  const left = side === "left";
  const id = `fade-${side}`;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, bottom: 0, width: 56, [side]: 0, flexDirection: "row", alignItems: "center", justifyContent: left ? "flex-start" : "flex-end" }}
    >
      {/* the fade is see-through to touches, so a half-hidden chip can still be swiped */}
      <Svg pointerEvents="none" width={56} height="100%" style={{ position: "absolute", top: 0, bottom: 0, [side]: 0 }}>
        <Defs>
          <LinearGradient id={id} x1={left ? "0" : "1"} y1="0" x2={left ? "1" : "0"} y2="0">
            <Stop offset="0.35" stopColor={bg} stopOpacity="1" />
            <Stop offset="1" stopColor={bg} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="56" height="100%" fill={`url(#${id})`} />
      </Svg>
      <Pressable
        onPress={onPress}
        hitSlop={8}
        accessibilityLabel={left ? "Scroll left" : "Scroll right"}
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.panel2,
          borderWidth: 1,
          borderColor: colors.line,
          elevation: 3,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
        }}
      >
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d={left ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
        </Svg>
      </Pressable>
    </View>
  );
}
