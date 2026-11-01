import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Icon from "../components/Icon";
import { colors, dateStr } from "../theme";
import MyTimelineScreen from "./MyTimelineScreen";

/** The My Map tab: your own timeline on the map. With several timelines, chips pick which one. */
export default function MyMapScreen({ data, navigation }) {
  const { uploads, loaded } = data;
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState(null);
  const upload = uploads.find((u) => u.id === picked) || uploads[0];

  if (!upload) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: insets.top + 16 }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>My map</Text>
        {loaded ? (
          <View style={{ alignItems: "center", marginTop: 60, gap: 12 }}>
            <Icon name="map" size={44} color={colors.muted} strokeWidth={1.5} />
            <Text style={{ color: colors.muted, textAlign: "center", lineHeight: 20, maxWidth: 280 }}>
              Import a timeline to browse where you've been, by year, month and day.
            </Text>
            <Button title="Import a timeline" onPress={() => navigation.navigate("Build", { start: "files" })} />
          </View>
        ) : null}
      </View>
    );
  }

  const label = (u) => `${dateStr(u.from)} → ${dateStr(u.to)}`;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {uploads.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, paddingTop: insets.top + 10 }}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {uploads.map((u) => {
            const on = u.id === upload.id;
            return (
              <Pressable
                key={u.id}
                onPress={() => setPicked(u.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 99,
                  borderWidth: 1,
                  backgroundColor: on ? colors.accent : colors.panel2,
                  borderColor: on ? colors.accent : colors.line,
                }}
              >
                <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: "700", fontSize: 12.5 }}>{label(u)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {/* keyed by timeline, so switching loads the new one from scratch */}
      <View style={{ flex: 1 }}>
        <MyTimelineScreen
          key={upload.id}
          navigation={navigation}
          route={{ params: { uploadId: upload.id, uploadLabel: label(upload), inTab: true, noTopInset: uploads.length > 1 } }}
        />
      </View>
    </View>
  );
}
