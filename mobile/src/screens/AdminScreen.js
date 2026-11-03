import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { Text, TextInput } from "../components/AppText";
import { t } from "../i18n";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Icon from "../components/Icon";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { colors, dateStr } from "../theme";

const BUSY = ["downloading", "uploading", "building", "installing"];
const PIECE = 4 * 1024 * 1024; // bytes per upload request (sent as base64, so about 5.4 MB each)

const STATE = () => ({
  downloading: [t("Downloading"), "running"],
  uploading: [t("Uploading"), "running"],
  installing: [t("Unpacking"), "running"],
  building: [t("Preparing"), "running"],
  ready: [t("Ready"), "done"],
  failed: [t("Failed"), "failed"],
});

/**
 * Server admin settings (only for usernames in the server's ADMIN_HANDLES): street maps, used to
 * draw journeys along roads and to estimate car routes in exports. The same as Settings → Street
 * maps on the web.
 */
export default function AdminScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await Api.adminRoads());
    } catch (e) {
      toast(e.message, true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Keep an eye on a map that's downloading or being prepared.
  const working = !!(status && status.regions.some((r) => BUSY.includes(r.state)));
  useEffect(() => {
    if (!working) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [working, load]);

  async function openCatalog() {
    setBusy(true);
    try {
      setCatalog(await Api.adminRoadsCatalog());
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function add(c) {
    if (!(await confirm(t("Add {name}?", { name: c.name }), t("The server downloads its map from Geofabrik and prepares it in the background. Big countries take a while."), t("Add")))) return;
    try {
      await Api.adminAddRoads(c.id);
      setCatalog(null);
      setQ("");
      await load();
      toast(t("Preparing {name}", { name: c.name }));
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function remove(r) {
    if (!(await confirm(t("Remove {name}?", { name: r.name }), t("Journeys there are drawn as straight lines again, and exports can't estimate routes there.")))) return;
    try {
      await Api.adminDeleteRoads(r.id);
      await load();
    } catch (e) {
      toast(e.message, true);
    }
  }

  const found = useMemo(() => {
    if (!catalog) return [];
    const s = q.trim().toLowerCase();
    const have = new Set((status ? status.regions : []).map((r) => r.region_id));
    return catalog.filter((c) => !have.has(c.id) && (!s || c.name.toLowerCase().includes(s) || (c.parent || "").toLowerCase().includes(s))).slice(0, 40);
  }, [catalog, q, status]);

  const header = (
    <View>
      <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
        <Icon name="back" size={20} color={colors.accent2} />
        <Text style={{ color: colors.accent2, fontWeight: "700" }}>{t("Account")}</Text>
      </Pressable>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>{t("Street maps")}</Text>
      <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
        {t("Countries whose roads the server knows. Journeys there are drawn along streets, and exports can estimate car routes for gaps. Routing stays on your server; only the map files are downloaded.")}
      </Text>
      {!status ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          {!status.supported ? (
            <Note>{t("The server is missing the routing package (pyvalhalla), so maps can't be prepared. The Docker image includes it.")}</Note>
          ) : null}
          {status.supported && !status.enabled ? (
            <Note>{t("Drawing along streets is switched off on the server (STREET_SNAP). Maps can still be prepared.")}</Note>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700", marginTop: 20, marginBottom: 4, marginLeft: 4 }}>
            {t("Installed ({n})", { n: status.regions.length })}
          </Text>
          {status.regions.length ? null : <Text style={{ color: colors.muted, marginLeft: 4 }}>{t("None yet.")}</Text>}
          {status.regions.map((r) => (
            <Region key={r.id} r={r} onRemove={() => remove(r)} />
          ))}
          <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700", marginTop: 20, marginBottom: 8, marginLeft: 4 }}>{t("Add a country")}</Text>
          {catalog ? (
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t("Search, e.g. Saudi Arabia")}
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              style={{
                color: colors.text,
                backgroundColor: colors.panel2,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 15,
              }}
            />
          ) : (
            <Button
              title={t("Choose a country")}
              icon="plus"
              variant="ghost"
              onPress={openCatalog}
              loading={busy}
              disabled={!status.supported}
            />
          )}
          {status.max_download_mb ? (
            <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6, marginLeft: 4 }}>
              {t("Downloads are limited to {mb} MB per region.", { mb: status.max_download_mb })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
      data={found}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListFooterComponent={status ? (
        <View>
          <Upload onDone={load} toast={toast} />
          <RoutingOptions toast={toast} />
        </View>
      ) : null}
      renderItem={({ item: c }) => (
        <Pressable
          onPress={() => add(c)}
          style={({ pressed }) => ({
            paddingVertical: 11,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
            backgroundColor: pressed ? colors.pressed : "transparent",
          })}
        >
          <Text style={{ color: colors.text, fontWeight: "600" }}>{c.name}</Text>
          {c.parent ? <Text style={{ color: colors.muted, fontSize: 12.5 }}>{c.parent}</Text> : null}
        </Pressable>
      )}
    />
  );
}

function Region({ r, onRemove }) {
  const [label, level] = STATE()[r.state] || [r.state, "expired"];
  const p = r.progress;
  const busy = BUSY.includes(r.state);
  let detail = "";
  if (r.state === "uploading" && p) detail = t("Uploading {a} of {b} MB", { a: Math.round(p.done_mb || 0), b: Math.round(p.total_mb || 0) });
  else if (r.state === "installing") detail = t("Unpacking the map…");
  else if (r.state === "downloading" && p) detail = p.total_mb ? t("{a} of {b} MB", { a: p.done_mb, b: p.total_mb }) : t("{n} MB", { n: p.done_mb });
  else if (r.state === "building") detail = t("Building the routing data. This can take a while.");
  else if (r.state === "ready") detail = [r.disk_mb ? t("{n} MB", { n: r.disk_mb }) : null, r.finished_at ? t("ready {date}", { date: dateStr(r.finished_at) }) : null].filter(Boolean).join(" · ");
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{r.name}</Text>
          {r.parent ? <Text style={{ color: colors.muted, fontSize: 12.5 }}>{r.parent}</Text> : null}
        </View>
        {busy ? <ActivityIndicator color={colors.accent} size="small" /> : null}
        <Pill label={label} level={level} />
      </View>
      {detail ? <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>{detail}</Text> : null}
      {r.error ? <Text style={{ color: colors.bad, fontSize: 12.5, marginTop: 6, lineHeight: 18 }}>{r.error}</Text> : null}
      {busy ? null : (
        <Text onPress={onRemove} style={{ color: colors.bad, fontSize: 13, fontWeight: "600", marginTop: 10, alignSelf: "flex-start", padding: 2 }}>
          {t("Remove")}
        </Text>
      )}
    </Card>
  );
}

/** Send a map file from this phone, in pieces: ready-made routing tiles (.tar.gz, built on a computer
 *  with server/tools/build_road_tiles.py, nothing to build on the server) or an .osm.pbf to build. */
function Upload({ onDone, toast }) {
  const [name, setName] = useState("");
  const [sending, setSending] = useState(null); // { done, total }

  async function pickAndSend() {
    const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets || !res.assets[0]) return;
    const f = res.assets[0];
    if (!/\.(pbf|tar|gz|tgz)$/i.test(f.name || "")) return toast(t("Choose a .tar.gz of routing tiles or an .osm.pbf file"), true);
    const info = await FileSystem.getInfoAsync(f.uri);
    const size = info.size || f.size || 0;
    const kind = /\.pbf$/i.test(f.name) ? "pbf" : "tiles";
    const label = name.trim() || f.name.replace(/(-latest)?(\.osm)?\.(pbf|tar\.gz|tgz|tar)$/i, "").replace(/[-_]+/g, " ");
    let up = null;
    try {
      up = await Api.adminUploadStart(label, kind, size);
      setSending({ done: 0, total: size });
      onDone();
      for (let off = 0; off < size; off += PIECE) {
        const data = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64, position: off, length: Math.min(PIECE, size - off) });
        for (let tries = 0; ; tries++) {
          try {
            await Api.adminUploadPiece(up.upload_id, off, data);
            break;
          } catch (e) {
            if ((e.status && e.status < 500) || tries >= 4) throw e;
            await new Promise((r) => setTimeout(r, 1500 * (tries + 1)));
          }
        }
        setSending({ done: Math.min(size, off + PIECE), total: size });
      }
      await Api.adminUploadFinish(up.upload_id);
      toast(kind === "pbf" ? t("Uploaded. The server is preparing the map.") : t("Uploaded. Unpacking the map."));
      setName("");
    } catch (e) {
      toast(e.message, true);
      if (up) Api.adminUploadCancel(up.upload_id).catch(() => {});
    } finally {
      setSending(null);
      FileSystem.deleteAsync(f.uri, { idempotent: true }).catch(() => {});
      onDone();
    }
  }

  return (
    <View style={{ marginTop: 24 }}>
      <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700", marginBottom: 6, marginLeft: 4 }}>{t("Upload a map")}</Text>
      <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 8, marginLeft: 4 }}>
        {t("For a server that can't download or prepare maps itself. Build the routing tiles on a computer with server/tools/build_road_tiles.py and upload the .tar.gz: nothing is built on the server. An .osm.pbf also works, but the server then needs 1-4 GB of memory to prepare it.")}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t("Name, e.g. GCC States")}
        placeholderTextColor={colors.muted}
        style={{ color: colors.text, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }}
      />
      <Button
        title={sending ? t("Uploading {a} of {b} MB", { a: Math.round(sending.done / 1e6), b: Math.round(sending.total / 1e6) }) : t("Choose a file and upload")}
        icon="upload"
        variant="ghost"
        onPress={pickAndSend}
        loading={false}
        disabled={!!sending}
        style={{ marginTop: 8 }}
      />
    </View>
  );
}

const OPTS = () => [
  [t("Drawing journeys along streets"), [
    ["snap_min_hop_m", t("Only route hops longer than"), t("m")],
    ["snap_max_hop_km", t("…and shorter than"), t("km")],
    ["snap_max_gap_min", t("Never join points further apart than"), t("min")],
    ["walk_max_kmh", t("Slower than this is walking, faster a car"), t("km/h")],
    ["detour", t("Drop a route longer than the straight line ×"), "×"],
    ["detour_slack_m", t("…plus"), t("m")],
    ["search_cutoff_m", t("Find a road within"), t("m")],
  ]],
  [t("Estimated car routes in exports (defaults)"), [
    ["gap_max_min", t("Gap up to"), t("min")],
    ["gap_max_km", t("Distance up to"), t("km")],
    ["gap_min_kmh", t("Average speed from"), t("km/h")],
    ["gap_max_kmh", t("Average speed up to"), t("km/h")],
  ]],
];

/** The routing choices made when street maps were added, editable by an admin. */
function RoutingOptions({ toast }) {
  const [st, setSt] = useState(null);
  const [vals, setVals] = useState({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  async function load() {
    try {
      const s = await Api.adminRoadsSettings();
      setSt(s);
      setVals(Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, String(v)])));
    } catch (e) {
      toast(e.message, true);
    }
  }
  useEffect(() => {
    if (open && !st) load();
  }, [open]);
  async function save(patch) {
    setSaving(true);
    try {
      const s = await Api.adminSaveRoadsSettings(patch);
      setSt(s);
      setVals(Object.fromEntries(Object.entries(s.values).map(([k, v]) => [k, String(v)])));
      toast(t("Saved"));
    } catch (e) {
      toast(e.message, true);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card style={{ marginTop: 20 }}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center" }} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15, flex: 1 }}>{t("Routing options")}</Text>
        <Icon name="next" size={18} color={colors.muted} style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }} />
      </Pressable>
      {open && !st ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}
      {open && st ? (
        <View>
          {OPTS().map(([title, fields]) => (
            <View key={title} style={{ marginTop: 14 }}>
              <Text style={{ color: colors.text, fontWeight: "700", marginBottom: 4 }}>{title}</Text>
              {fields.map(([k, label, unit]) => (
                <View key={k} style={{ marginVertical: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 13.5, flex: 1 }}>{label}</Text>
                    <TextInput
                      value={vals[k]}
                      onChangeText={(v) => setVals((o) => ({ ...o, [k]: v.replace(/[^0-9.]/g, "") }))}
                      keyboardType="decimal-pad"
                      style={{ width: 70, textAlign: "center", color: colors.text, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 5, fontSize: 14 }}
                    />
                    <Text style={{ color: colors.muted, fontSize: 12.5, width: 36 }}>{unit}</Text>
                  </View>
                  {st.values[k] !== st.defaults[k] ? (
                    <Text style={{ color: colors.muted, fontSize: 11.5 }}>{t("Suggested: {v}", { v: st.defaults[k] })}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 10 }}>
            {t("Changes apply to days you open and checks run from now on. People can still change the export values for their own export.")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button title={t("Save")} onPress={() => save(vals)} loading={saving} style={{ flex: 1 }} />
            <Button
              title={t("Use the suggested values")}
              variant="ghost"
              onPress={async () => {
                if (await confirm(t("Put every routing option back to its suggested value?"), "", t("Reset"))) save({ reset: true });
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function Note({ children }) {
  return (
    <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.warnBorder }}>
      <Text style={{ color: colors.warnText, fontSize: 13, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}
