import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { exportTimeline } from "../exportTimeline";
import { useAuth } from "../auth";
import { colors, dateStr, hoursLeft, keepPhrase, trustLabel } from "../theme";
import Icon from "../components/Icon";

export default function TimelineScreen({ data, navigation }) {
  const { uploads, refresh, cfg } = data;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  async function removeZone(upload, i) {
    if (!(await confirm("Include this area?", "Crossings inside it will no longer be hidden from future checks.", "Include"))) return;
    const zones = upload.zones.filter((_, idx) => idx !== i);
    try {
      await Api.putZones(upload.id, zones);
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function deleteUpload(id) {
    if (!(await confirm("Delete this timeline?", "It's removed from the server now. Checks already finished keep their results."))) return;
    try {
      await Api.deleteUpload(id);
      await refresh();
      toast("Timeline deleted");
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
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Import</Text>
          <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 }}>
            Build your timeline from one or more sources. It stays private and is{" "}
            {keepPhrase(user && user.upload_keep_hours != null ? user.upload_keep_hours : cfg.upload_ttl_hours)} (change this on the Account tab).
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
            <AddOption
              icon="folder"
              title="Import a timeline file"
              text="Google Maps, Strava, Apple Health, Samsung Health, Garmin, Swarm, GPX, CSV…"
              onPress={() => navigation.navigate("Build", { start: "files" })}
            />
            <AddOption
              icon="photos"
              title="Scan my photos"
              text="Build one from the place and time saved in your photos."
              onPress={() => navigation.navigate("Build", { start: "photos" })}
            />
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
            You can combine several sources into one timeline, and add more later.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>No timeline uploaded yet.</Text>
      }
      renderItem={({ item }) => (
        <UploadCard
          upload={item}
          onRemoveZone={removeZone}
          onDelete={deleteUpload}
          onAdd={() => navigation.navigate("Build", { start: "files", targetId: item.id })}
          onExport={() => exportTimeline(item, toast)}
          onView={() => navigation.navigate("MyTimeline", { uploadId: item.id, uploadLabel: `${dateStr(item.from)} → ${dateStr(item.to)}` })}
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
      <Icon name={icon} size={26} color={colors.accent} />
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15, marginTop: 6 }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{text}</Text>
    </Pressable>
  );
}

function UploadCard({ upload, onRemoveZone, onDelete, onView, onAdd, onExport }) {
  const t = upload.trust;
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
            {dateStr(upload.from)} → {dateStr(upload.to)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 3 }}>
            {upload.points.toLocaleString()} points · {hoursLeft(upload.expires_at)}
          </Text>
          <Text style={{ color: colors.accent2, fontSize: 12.5, marginTop: 4 }}>
            {(upload.sources || [])
              .map((s) => `${s.label}${s.files > 1 ? ` ×${s.files}` : ""} · ${Number(s.points || 0).toLocaleString()}`)
              .join("   ·   ")}
          </Text>
        </View>
        <Pill label={trustLabel(t.level)} level={t.level} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Button title="Add source" icon="plus" onPress={onAdd} style={{ flex: 1 }} />
        <Button title="Export" icon="download" variant="ghost" onPress={onExport} style={{ flex: 1 }} />
      </View>
      <Button title="View on map" icon="map" variant="ghost" onPress={onView} style={{ marginTop: 8 }} />
      {t.level !== "high" && t.reasons.length ? (
        <View style={{ marginTop: 8 }}>
          {t.reasons.map((r, i) => (
            <Text key={i} style={{ color: colors.muted, fontSize: 12.5 }}>
              • {r}
            </Text>
          ))}
        </View>
      ) : null}
      {upload.zones.length ? (
        <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginBottom: 4 }}>
            Home &amp; work areas hidden from results ({upload.zones.length})
          </Text>
          {upload.zones.map((z, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}
            >
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                Area {i + 1} · {z.lat.toFixed(3)}, {z.lon.toFixed(3)} · {Math.round(z.radius_m)} m
              </Text>
              <Text
                onPress={() => onRemoveZone(upload, i)}
                style={{ color: colors.accent2, fontSize: 12.5 }}
              >
                Remove
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text
        onPress={() => onDelete(upload.id)}
        style={{ color: colors.bad, fontSize: 13, marginTop: 12 }}
      >
        Delete now
      </Text>
    </Card>
  );
}
