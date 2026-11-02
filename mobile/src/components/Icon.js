import React, { useMemo } from "react";
import { SvgXml } from "react-native-svg";
import { iconXml } from "../icons";
import { RTL } from "../i18n";
import { colors } from "../theme";

// Arrows that mean "back" or "forward" point the other way in a right-to-left layout.
const MIRRORED = new Set(["back", "next", "prev", "forward", "arrow"]);

// One icon from the app's set (src/icons.js). Colour defaults to the current text colour.
export default function Icon({ name, size = 20, color, strokeWidth = 1.8, style }) {
  const c = color || colors.text;
  const xml = useMemo(() => iconXml(name, c, strokeWidth), [name, c, strokeWidth]);
  const flip = RTL && MIRRORED.has(name) ? { transform: [{ scaleX: -1 }] } : null;
  return <SvgXml xml={xml} width={size} height={size} style={flip ? [flip, style] : style} />;
}
