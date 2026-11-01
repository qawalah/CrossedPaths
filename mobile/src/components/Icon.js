import React, { useMemo } from "react";
import { SvgXml } from "react-native-svg";
import { iconXml } from "../icons";
import { colors } from "../theme";

// One icon from the app's set (src/icons.js). Colour defaults to the current text colour.
export default function Icon({ name, size = 20, color, strokeWidth = 1.8, style }) {
  const c = color || colors.text;
  const xml = useMemo(() => iconXml(name, c, strokeWidth), [name, c, strokeWidth]);
  return <SvgXml xml={xml} width={size} height={size} style={style} />;
}
