import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { colors } from "../theme";
import Icon from "./Icon";

export default function Button({ title, icon, onPress, variant = "primary", disabled, loading, style }) {
  const base = {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    opacity: disabled || loading ? 0.55 : 1,
  };
  const variants = {
    primary: { backgroundColor: colors.accent },
    ghost: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line },
    bad: { backgroundColor: colors.badBg, borderWidth: 1, borderColor: colors.badBorder },
  };
  const textColor = { primary: colors.onAccent, ghost: colors.text, bad: colors.bad }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [base, variants[variant], style, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={19} color={textColor} style={{ marginRight: 8 }} /> : null}
          <Text style={{ color: textColor, fontWeight: "700", fontSize: 15 }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}
