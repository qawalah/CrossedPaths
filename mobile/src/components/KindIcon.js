import React from "react";
import { KIND_ICON } from "../icons";
import { colors } from "../theme";
import Icon from "./Icon";

// The three kinds of crossing: same place (pin), crossed paths (two routes crossing),
// travelled together (two routes side by side). Same drawings as the web client.
export default function KindIcon({ kind, size = 18, color, strokeWidth = 1.8 }) {
  return <Icon name={KIND_ICON[kind] || KIND_ICON.same_place} size={size} color={color || colors.text} strokeWidth={strokeWidth} />;
}
