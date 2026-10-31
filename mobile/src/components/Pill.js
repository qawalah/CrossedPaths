import React from "react";
import { Text, View } from "react-native";
import { colors, pillColor } from "../theme";

export default function Pill({ label, level }) {
  const c = pillColor(level);
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: c + "55",
        backgroundColor: c + "1a",
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: c, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
