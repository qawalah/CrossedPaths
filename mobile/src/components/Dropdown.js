import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./AppText";
import { t } from "../i18n";
import Icon from "./Icon";
import Sheet from "./Sheet";
import { colors } from "../theme";

/**
 * A drop-down menu: a field showing the current choice that opens a list of options.
 * options: [[value, label], ...]. Colours are read at render time (see theme.js).
 */
export default function Dropdown({ value, options, onChange, label, disabled }) {
  const [open, setOpen] = useState(false);
  const same = (v) => v === value || (!v && !value); // 0 and null both mean "none"
  const cur = options.find(([v]) => same(v));
  return (
    <>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label || t("Choose")}: ${cur ? cur[1] : ""}`}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.panel2,
          borderWidth: 1,
          borderColor: pressed ? colors.accent : colors.line,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          opacity: disabled ? 0.6 : 1,
        })}
      >
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14.5, flex: 1 }}>{cur ? cur[1] : t("Choose…")}</Text>
        <Icon name="next" size={18} color={colors.muted} style={{ transform: [{ rotate: "90deg" }] }} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        {label ? <Text style={{ color: colors.text, fontWeight: "800", fontSize: 17, marginBottom: 8 }}>{label}</Text> : null}
        {options.map(([v, text]) => {
          const on = same(v);
          return (
            <Pressable
              key={String(v)}
              onPress={() => {
                setOpen(false);
                onChange(v);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 14,
                paddingHorizontal: 4,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                backgroundColor: pressed ? colors.pressed : "transparent",
              })}
            >
              <Text style={{ color: on ? colors.accent : colors.text, fontWeight: on ? "800" : "600", fontSize: 15 }}>{text}</Text>
              {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </>
  );
}
