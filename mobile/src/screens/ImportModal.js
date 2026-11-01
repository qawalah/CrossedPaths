import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { SOURCES } from "../importSources";
import { colors, trustLabel } from "../theme";

// "**bold**" -> nested bold Text
function Rich({ text }) {
  return text.split("**").map((part, i) =>
    i % 2 ? (
      <Text key={i} style={{ fontWeight: "700", color: colors.text }}>
        {part}
      </Text>
    ) : (
      part
    )
  );
}

// Import a location history from Google Maps, Strava, Apple Health, Samsung Health, Garmin, Swarm or
// any GPX / KML / GeoJSON / FIT / CSV file. The server works out each file's format; zips are fine.
export default function ImportModal({ navigation, cfg, onDone }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [src, setSrc] = useState("google");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const source = SOURCES.find((s) => s.id === src) || SOURCES[0];

  async function pickAndUpload() {
    const res = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets || !res.assets.length) return;
    const files = res.assets;
    const size = files.reduce((s, f) => s + (f.size || 0), 0);
    if (cfg.max_upload_mb && size > cfg.max_upload_mb * 1048576) {
      toast(`That's ${Math.round(size / 1048576)} MB; the limit is ${cfg.max_upload_mb} MB. Pick fewer files or a shorter period.`, true);
      return;
    }
    setBusy(true);
    setCount(files.length);
    try {
      const u = await Api.uploadFiles(files.map((f) => ({ uri: f.uri, name: f.name, type: f.mimeType })));
      const skipped = u.import && u.import.skipped ? ` · ${u.import.skipped} file${u.import.skipped === 1 ? "" : "s"} had no locations` : "";
      toast("Timeline added · " + trustLabel(u.trust.level) + skipped);
      await onDone();
      navigation.goBack();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.panel }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
    >
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Import a timeline</Text>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        Use the location history saved by an app you already have. Pick one file, several at once, or a .zip.
      </Text>

      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 8 }}>Where is your history from?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {SOURCES.map((s) => {
          const on = s.id === src;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSrc(s.id)}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 99,
                borderWidth: 1.5,
                borderColor: on ? colors.accent : colors.line,
                backgroundColor: on ? colors.accent : colors.panel2,
              }}
            >
              <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: "600", fontSize: 13 }}>{s.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ marginTop: 14 }}>
        <Text style={{ color: colors.muted, fontSize: 12.5 }}>
          {source.name} · {source.what}
        </Text>
        {source.steps.map((step, i) => (
          <View key={i} style={{ flexDirection: "row", marginTop: 8 }}>
            <Text style={{ color: colors.accent, fontWeight: "800", width: 20 }}>{i + 1}.</Text>
            <Text style={{ color: colors.muted, flex: 1, lineHeight: 20 }}>
              <Rich text={step} />
            </Text>
          </View>
        ))}
      </Card>

      <Button
        title={busy ? (count > 1 ? `Reading ${count} files…` : "Reading your timeline…") : "Choose file(s)"}
        icon="folder"
        onPress={pickAndUpload}
        loading={busy}
        style={{ marginTop: 18 }}
      />
      <Text style={{ color: colors.muted, fontSize: 11.5, marginTop: 8, textAlign: "center" }}>
        GPX · TCX · FIT · KML · GeoJSON · CSV · JSON · ZIP · up to {cfg.max_upload_mb || 80} MB in total
      </Text>
      <Pressable onPress={() => navigation.goBack()} disabled={busy} style={{ marginTop: 14, alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
