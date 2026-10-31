import React from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../theme";

// Minimal line icons for the three kinds of crossing (24-unit grid, same as the web client).
const PATHS = {
  same_place: ["M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z"],
  passing: ["M4 20 20 4M14 4h6v6M4 4l6 6M14 14l6 6M20 14v6h-6"],
  shared_route: ["M8 20V5M4.5 8.5 8 5l3.5 3.5M16 20V5M12.5 8.5 16 5l3.5 3.5"],
};

export default function KindIcon({ kind, size = 18, color, strokeWidth = 1.8 }) {
  const k = PATHS[kind] ? kind : "same_place";
  const c = color || colors.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[k].map((d) => (
        <Path key={d} d={d} />
      ))}
      {k === "same_place" ? <Circle cx={12} cy={9.8} r={2.3} /> : null}
    </Svg>
  );
}
