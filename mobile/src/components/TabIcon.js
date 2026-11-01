import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

// Line icons for the tab bar, on the same 24-unit grid and stroke as the web client's.
export default function TabIcon({ name, size = 22, color }) {
  const p = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "Timeline" ? (
        <>
          <Path d="M4 19c4-1 3-7 8-7s3-7 8-7" {...p} />
          <Circle cx={4} cy={19} r={1.6} {...p} />
          <Circle cx={20} cy={5} r={1.6} {...p} />
        </>
      ) : name === "People" ? (
        <>
          <Circle cx={9} cy={8} r={3.2} {...p} />
          <Path d="M3 20c0-3.5 3-5.5 6-5.5s6 2 6 5.5" {...p} />
          <Path d="M16 5.5a3 3 0 010 5.5M18.5 20c0-2.2-1-3.8-2.6-4.7" {...p} />
        </>
      ) : name === "Checks" ? (
        <>
          <Circle cx={12} cy={12} r={8} {...p} />
          <Path d="M8.5 12.5l2.4 2.4 4.6-5" {...p} />
        </>
      ) : (
        <>
          <Circle cx={12} cy={8} r={3.6} {...p} />
          <Path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" {...p} />
        </>
      )}
    </Svg>
  );
}

/** Two paths meeting at one point: the "run a check" mark. */
export function CrossIcon({ size = 28, color }) {
  const p = { fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 19C10 19 14 5 21 5" {...p} />
      <Path d="M3 5c7 0 11 14 18 14" {...p} />
      <Circle cx={12} cy={12} r={2.6} fill={color} />
    </Svg>
  );
}
