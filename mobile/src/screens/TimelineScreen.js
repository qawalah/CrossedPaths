import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { useAuth } from "../auth";
import { colors, dateStr, hoursLeft, keepPhrase, trustLabel } from "../theme";

export default function TimelineScreen({ data, navigation }) {
  const { uploads, refresh, cfg } = data;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function pickAndUpload() {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    const file = res.assets[0];
    if (cfg.max_upload_mb && file.size && file.size > cfg.max_upload_mb * 1048576) {
      toast(`That file is too large. The limit is ${cfg.max_upload_mb} MB — trim it to a shorter period.`, true);
      return;
    }
    setBusy(true);
    try {
      const u = await Api.upload(file.uri, file.name);
      toast("Timeline added · " + trustLabel(u.trust.level));
      await refresh();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

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
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Your timeline</Text>
          <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 }}>
            Upload your Google Maps Timeline export. It stays private and is{" "}
            {keepPhrase(user && user.upload_keep_hours != null ? user.upload_keep_hours : cfg.upload_ttl_hours)} (change this on the Account tab).
          </Text>
          <Card>
            <Button title={busy ? "Uploading…" : "Choose Timeline .json"} onPress={pickAndUpload} loading={busy} />
            <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 10, lineHeight: 18 }}>
              In Google Maps: profile picture → Your Timeline → ⚙️ settings → Export Timeline data. Menu
              names vary a little between app versions.
            </Text>
            <Button
              title="📷 Or scan your photo library"
              variant="ghost"
              onPress={() => navigation.navigate("PhotoScan")}
              style={{ marginTop: 10 }}
            />
            <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 8, lineHeight: 18 }}>
              No Google Timeline export? Build one from the GPS location already saved in your
              photos — nothing leaves your phone except the points you upload.
            </Text>
          </Card>
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
          onView={() => navigation.navigate("MyTimeline", { uploadId: item.id, uploadLabel: `${dateStr(item.from)} → ${dateStr(item.to)}` })}
        />
      )}
    />
  );
}

function UploadCard({ upload, onRemoveZone, onDelete, onView }) {
  const t = upload.trust;
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
            {dateStr(upload.from)} → {dateStr(upload.to)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 3 }}>
            {upload.points.toLocaleString()} points · {upload.format} · {hoursLeft(upload.expires_at)}
          </Text>
        </View>
        <Pill label={trustLabel(t.level)} level={t.level} />
      </View>
      <Button title="🗺️ View on map" variant="ghost" onPress={onView} style={{ marginTop: 10 }} />
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
