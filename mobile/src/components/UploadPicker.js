import React from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { colors, dateStr } from "../theme";

export default function UploadPicker({ uploads, value, onChange }) {
  if (!uploads.length) {
    return <Text style={{ color: colors.muted }}>No timeline uploaded yet.</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {uploads.map((u) => {
        const selected = u.id === value;
        return (
          <Pressable
            key={u.id}
            onPress={() => onChange(u.id)}
            style={{
              marginRight: 10,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: selected ? colors.accent : colors.line,
              backgroundColor: selected ? colors.accent + "1a" : colors.panel2,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>
              {dateStr(u.from)} → {dateStr(u.to)}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11.5, marginTop: 2 }}>
              {u.points.toLocaleString()} pts
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
