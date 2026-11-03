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

const STATE = () => ({
  downloading: [t("Downloading"), "running"],
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
  const working = !!(status && status.regions.some((r) => r.state === "downloading" || r.state === "building"));
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
  const busy = r.state === "downloading" || r.state === "building";
  let detail = "";
  if (r.state === "downloading" && p) detail = p.total_mb ? t("{a} of {b} MB", { a: p.done_mb, b: p.total_mb }) : t("{n} MB", { n: p.done_mb });
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

function Note({ children }) {
  return (
    <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.warnBorder }}>
      <Text style={{ color: colors.warnText, fontSize: 13, lineHeight: 19 }}>{children}</Text>
    </View>
  );
}
