import React from "react";
import { View } from "react-native";
import { colors } from "../theme";

export default function Card({ children, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 16,
          padding: 14,
          marginVertical: 6,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
