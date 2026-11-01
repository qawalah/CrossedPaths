import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import React, { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import DateRangePicker from "../components/DateRangePicker";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { exportTimeline } from "../exportTimeline";
import { SOURCES } from "../importSources";
import { scanPhotoLibrary } from "../photoScan";
import { colors, dateStr, trustLabel } from "../theme";

const ICON = { files: "📂", photos: "📷", upload: "🗂️" };
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
const sizeStr = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

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

function Chip({ label, on, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: 99,
        borderWidth: 1.5,
        borderColor: on ? colors.accent : colors.line,
        backgroundColor: on ? colors.accent : colors.panel2,
      }}
    >
      <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

// Build a timeline from as many sources as you like (app files, a photo scan, your other timelines),
// then save them combined. With route.params.targetId the sources are added to that timeline.
export default function BuildTimelineModal({ navigation, route, cfg, uploads, onDone }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const params = (route && route.params) || {};
  const target = params.targetId ? uploads.find((u) => u.id === params.targetId) : null;
  const others = uploads.filter((u) => u.id !== params.targetId);
  const [pane, setPane] = useState(params.start || "files");
  const [items, setItems] = useState([]);
  const [src, setSrc] = useState("google");
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [progress, setProgress] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [removeMerged, setRemoveMerged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null);
  const source = SOURCES.find((s) => s.id === src) || SOURCES[0];
  const add = (it) => setItems((xs) => [...xs, it]);
  const remove = (i) => setItems((xs) => xs.filter((_, k) => k !== i));
  const merging = items.some((i) => i.kind === "upload");

  async function pickFiles() {
    const res = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets || !res.assets.length) return;
    const files = res.assets.map((f) => ({ uri: f.uri, name: f.name, type: f.mimeType, size: f.size || 0 }));
    const size = files.reduce((s, f) => s + f.size, 0);
    const already = items.filter((i) => i.kind === "files").reduce((s, i) => s + i.size, 0);
    if (cfg.max_upload_mb && size + already > cfg.max_upload_mb * 1048576) {
      toast(`That's more than ${cfg.max_upload_mb} MB of files for one save. Pick fewer files, or save and add the rest after.`, true);
      return;
    }
    add({
      kind: "files",
      files,
      size,
      label: `${source.name}: ${plural(files.length, "file")}`,
      detail: files.slice(0, 3).map((f) => f.name).join(", ") + (files.length > 3 ? ` +${files.length - 3} more` : "") + ` · ${sizeStr(size)}`,
    });
  }

  async function scan() {
    setScanning(true);
    setProgress({ scanned: 0, total: 0, found: 0 });
    try {
      const { points, scanned } = await scanPhotoLibrary({ from: dateFrom, to: dateTo, onProgress: setProgress });
      if (!points.length) {
        toast("None of those photos carry GPS data. Many apps strip location on save/share — try photos straight from the camera.", true);
        return;
      }
      add({
        kind: "photos",
        points,
        label: `Photos: ${plural(points.length, "place")}`,
        detail:
          `${plural(points.length, "photo")} with a location, out of ${scanned.toLocaleString()}` +
          (points.length < 20 ? " · combine with another source (at least 20 points are needed)" : ""),
      });
    } catch (e) {
      toast(e.message || "Couldn't scan your photo library", true);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  }

  function toggleUpload(u) {
    const at = items.findIndex((i) => i.kind === "upload" && i.id === u.id);
    if (at >= 0) remove(at);
    else add({ kind: "upload", id: u.id, label: `Timeline ${dateStr(u.from)} → ${dateStr(u.to)}`, detail: `${u.points.toLocaleString()} points · ${u.format}` });
  }

  async function save() {
    setBusy(true);
    try {
      const files = items.filter((i) => i.kind === "files").flatMap((i) => i.files);
      for (const p of items.filter((i) => i.kind === "photos")) {
        const uri = FileSystem.cacheDirectory + `photo-timeline-${Date.now()}-${files.length}.json`;
        await FileSystem.writeAsStringAsync(uri, JSON.stringify({ photoPoints: p.points }));
        files.push({ uri, name: "photo-timeline.json", type: "application/json" });
      }
      const u = await Api.saveTimeline({
        targetId: params.targetId,
        files,
        mergeIds: items.filter((i) => i.kind === "upload").map((i) => i.id),
        removeMerged: merging && removeMerged,
      });
      const skipped = u.import && u.import.skipped ? ` · ${plural(u.import.skipped, "file")} had no locations` : "";
      toast((params.targetId ? `Added ${(u.import.added_points || 0).toLocaleString()} new points` : "Timeline saved") + " · " + trustLabel(u.trust.level) + skipped);
      await onDone();
      setSaved(u);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  const wrap = (children) => (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.panel }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
    >
      {children}
    </ScrollView>
  );

  if (saved) {
    const n = (saved.sources || []).length;
    return wrap(
      <>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>✅ Timeline saved</Text>
        <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
          {saved.points.toLocaleString()} points from {plural(n, "source")}: {(saved.sources || []).map((s) => s.label).join(", ")}. It's
          kept on your server as set on the Account tab. Want a copy on this phone too?
        </Text>
        <Button title="💾 Export a copy" variant="ghost" onPress={() => exportTimeline(saved, toast)} style={{ marginTop: 18 }} />
        <Button title="Done" onPress={() => navigation.goBack()} style={{ marginTop: 10 }} />
      </>
    );
  }

  return wrap(
    <>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{target ? "Add sources" : "New timeline"}</Text>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        {target ? `Adding to ${dateStr(target.from)} → ${dateStr(target.to)} (${target.points.toLocaleString()} points). ` : ""}
        Add as many sources as you like; they're combined into one timeline when you save.
      </Text>

      <View style={{ marginTop: 14, gap: 8 }}>
        {items.length ? (
          items.map((it, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: colors.panel2,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 20 }}>{ICON[it.kind]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{it.label}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={2}>
                  {it.detail}
                </Text>
              </View>
              <Pressable onPress={() => remove(i)} hitSlop={10}>
                <Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.line, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: colors.muted, textAlign: "center", fontSize: 13 }}>No sources yet. Add one below.</Text>
          </View>
        )}
      </View>

      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 8 }}>
        {items.length ? "Add another source" : "Add a source"}
      </Text>
      <View style={{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3 }}>
        {[
          ["files", "📂 Files"],
          ["photos", "📷 Photos"],
          ...(others.length ? [["mine", "🗂️ Mine"]] : []),
        ].map(([k, l]) => (
          <Pressable
            key={k}
            onPress={() => setPane(k)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: pane === k ? colors.panel : "transparent" }}
          >
            <Text style={{ color: pane === k ? colors.text : colors.muted, fontWeight: "700" }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {pane === "files" ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {SOURCES.map((s) => (
              <Chip key={s.id} label={s.name} on={s.id === src} onPress={() => setSrc(s.id)} />
            ))}
          </View>
          <Card style={{ marginTop: 12 }}>
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
          <Button title="📂 Choose file(s)" variant="ghost" onPress={pickFiles} style={{ marginTop: 10 }} />
          <Text style={{ color: colors.muted, fontSize: 11.5, marginTop: 6, textAlign: "center" }}>
            GPX · TCX · FIT · KML · GeoJSON · CSV · JSON · ZIP
          </Text>
        </>
      ) : null}

      {pane === "photos" ? (
        <>
          <Text style={{ color: colors.muted, marginTop: 14, lineHeight: 20 }}>
            CrossPaths reads the GPS location and date saved in your photos, right here on your phone. Only those
            points are uploaded, never the photos. Photos with no location (screenshots, downloads) are skipped.
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 14, marginBottom: 6 }}>Limit to a date range (optional)</Text>
          <DateRangePicker from={dateFrom} to={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
          {progress ? (
            <Card style={{ marginTop: 12 }}>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {progress.total ? `${progress.scanned} / ${progress.total} photos checked` : "Starting…"} · {progress.found} with location
              </Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, marginTop: 8, overflow: "hidden" }}>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.accent,
                    width: `${progress.total ? Math.round((progress.scanned / progress.total) * 100) : 0}%`,
                  }}
                />
              </View>
            </Card>
          ) : null}
          <Button
            title={scanning ? "Scanning…" : "📷 Scan photo library"}
            variant="ghost"
            onPress={scan}
            loading={scanning}
            style={{ marginTop: 12 }}
          />
        </>
      ) : null}

      {pane === "mine" ? (
        <View style={{ marginTop: 10 }}>
          {others.map((u) => {
            const on = items.some((i) => i.kind === "upload" && i.id === u.id);
            return (
              <Pressable key={u.id} onPress={() => toggleUpload(u)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    borderWidth: 2,
                    borderColor: on ? colors.accent : colors.line,
                    backgroundColor: on ? colors.accent : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {on ? <Text style={{ color: colors.onAccent, fontSize: 12, fontWeight: "900" }}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>
                    {dateStr(u.from)} → {dateStr(u.to)}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {u.points.toLocaleString()} points · {u.format}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {merging ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 }}>
          <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>Delete the timelines I combine once they're in this one</Text>
          <Switch value={removeMerged} onValueChange={setRemoveMerged} trackColor={{ true: colors.accent }} />
        </View>
      ) : null}

      <Button
        title={
          busy
            ? "Reading and combining…"
            : target
            ? `Add ${plural(items.length, "source")} and save`
            : items.length > 1
            ? `Combine ${items.length} sources and save`
            : "Save timeline"
        }
        onPress={save}
        loading={busy}
        disabled={!items.length || scanning}
        style={{ marginTop: 18 }}
      />
      <Pressable onPress={() => navigation.goBack()} disabled={busy} style={{ marginTop: 14, alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Cancel</Text>
      </Pressable>
    </>
  );
}
