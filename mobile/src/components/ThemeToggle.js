import React from "react";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "./Icon";
import { RTL, t } from "../i18n";
import { colors } from "../theme";
import { useTheme } from "../themeContext";

/** The light/dark switch: a round button pinned to the top corner, over the screen below it.
 *  Shows a moon in light mode and a sun in dark mode. */
export default function ThemeToggle() {
  const insets = useSafeAreaInsets();
  const { setTheme } = useTheme();
  const dark = colors.isDark;
  return (
    <Pressable
      onPress={() => setTheme({ mode: dark ? "light" : "dark" })}
      accessibilityRole="switch"
      accessibilityState={{ checked: dark }}
      accessibilityLabel={dark ? t("Switch to light mode") : t("Switch to dark mode")}
      hitSlop={8}
      style={({ pressed }) => ({
        position: "absolute",
        top: insets.top + 10,
        [RTL ? "left" : "right"]: 14,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.pressed : colors.chrome,
        borderWidth: 1,
        borderColor: colors.line,
        zIndex: 20,
        elevation: 4,
      })}
    >
      <Icon name={dark ? "sun" : "moon"} size={20} />
    </Pressable>
  );
}
