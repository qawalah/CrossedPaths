import React from "react";
import { FlatList, Pressable, View } from "react-native";
import { Text } from "../components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { useAuth } from "../auth";
import { RTL, pl, serverMsg, t } from "../i18n";
import { colors, dateStr, hoursLeft, keepPhrase, trustLabel } from "../theme";

export default function TimelineScreen({ data, navigation }) {
  const { uploads, refresh, cfg } = data;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  async function removeZone(upload, i) {
    if (!(await confirm(t("Include this area?"), t("Crossings inside it will no longer be hidden from future checks."), t("Include")))) return;
    const zones = upload.zones.filter((_, idx) => idx !== i);
    try {
      await Api.putZones(upload.id, zones);
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function deleteUpload(id) {
    if (!(await confirm(t("Delete this timeline?"), t("It's removed from the server now. Checks already finished keep their results.")))) return;
    try {
      await Api.deleteUpload(id);
      await refresh();
      toast(t("Timeline deleted"));
    } catch (e) {
      toast(e.message, true);
    }
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 100 }}
      data={uploads}
      keyExtractor={(u) => u.id}
      ListHeaderComponent={
        <View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>{t("Your timeline")}</Text>
          <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 }}>
            {t("Add your location history. It stays private and is {phrase} (change this on the Account tab).", {
              phrase: keepPhrase(user && user.upload_keep_hours != null ? user.upload_keep_hours : cfg.upload_ttl_hours),
            })}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
            <AddOption
              icon="📂"
              title={t("Import a timeline")}
              text={t("Google Maps, Strava, Apple Health, Samsung Health, Garmin, Swarm, GPX, CSV…")}
              onPress={() => navigation.navigate("Import")}
            />
            <AddOption
              icon="📷"
              title={t("Scan my photos")}
              text={t("Build one from the place and time saved in your photos.")}
              onPress={() => navigation.navigate("PhotoScan")}
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>{t("No timeline uploaded yet.")}</Text>
      }
      renderItem={({ item }) => (
        <UploadCard
          upload={item}
          onRemoveZone={removeZone}
          onDelete={deleteUpload}
          onView={() => navigation.navigate("MyTimeline", { uploadId: item.id, uploadLabel: `${dateStr(item.from)} ${RTL ? "←" : "→"} ${dateStr(item.to)}` })}
        />
      )}
    />
  );
}

function AddOption({ icon, title, text, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: pressed ? colors.accent : colors.line,
        borderRadius: 16,
        padding: 14,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}
    >
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15, marginTop: 6 }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{text}</Text>
    </Pressable>
  );
}

function UploadCard({ upload, onRemoveZone, onDelete, onView }) {
  const trust = upload.trust;
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
            {dateStr(upload.from)} {RTL ? "←" : "→"} {dateStr(upload.to)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 3 }}>
            {pl("points", upload.points)} · {upload.format} · {hoursLeft(upload.expires_at)}
          </Text>
        </View>
        <Pill label={trustLabel(trust.level)} level={trust.level} />
      </View>
      <Button title={"🗺️ " + t("View on map")} variant="ghost" onPress={onView} style={{ marginTop: 10 }} />
      {trust.level !== "high" && trust.reasons.length ? (
        <View style={{ marginTop: 8 }}>
          {trust.reasons.map((r, i) => (
            <Text key={i} style={{ color: colors.muted, fontSize: 12.5 }}>
              • {serverMsg(r)}
            </Text>
          ))}
        </View>
      ) : null}
      {upload.zones.length ? (
        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginBottom: 4 }}>
            {t("Home & work areas hidden from results ({n})", { n: upload.zones.length })}
          </Text>
          {upload.zones.map((z, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}
            >
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {t("Area {n}", { n: i + 1 })} · {`\u202A${z.lat.toFixed(3)}, ${z.lon.toFixed(3)}\u202C`} · {t("{n} m", { n: Math.round(z.radius_m) })}
              </Text>
              <Text
                onPress={() => onRemoveZone(upload, i)}
                style={{ color: colors.accent2, fontSize: 12.5 }}
              >
                {t("Remove")}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text
        onPress={() => onDelete(upload.id)}
        style={{ color: colors.bad, fontSize: 13, marginTop: 12 }}
      >
        {t("Delete now")}
      </Text>
    </Card>
  );
}
