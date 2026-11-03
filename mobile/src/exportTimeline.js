import * as FileSystem from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { Text, TextInput } from "./components/AppText";
import { t } from "./i18n";
import Button from "./components/Button";
import Icon from "./components/Icon";
import Sheet from "./components/Sheet";
import { Api } from "./api";
import { useAuth } from "./auth";
import { colors } from "./theme";

const MIME = { gpx: "application/gpx+xml", geojson: "application/geo+json", csv: "text/csv" };
const FORMATS = [
  ["gpx", "GPX"],
  ["geojson", "GeoJSON"],
  ["csv", "CSV"],
];

// Which gaps get an estimated car route (the server's suggested defaults; see GapRules in
// server/crosspaths/snap.py). Saved on the phone only, with the rest of the export choices.
export const SUGGESTED_RULES = { max_gap_min: "30", max_km: "50", min_kmh: "15" };
const DEFAULTS = { format: "gpx", estimated: false, separate: false, rules: SUGGESTED_RULES };
const KEY = "cp_export";

async function loadPrefs() {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    const p = v ? JSON.parse(v) : {};
    return { ...DEFAULTS, ...p, rules: { ...SUGGESTED_RULES, ...(p.rules || {}) } };
  } catch (e) {
    return DEFAULTS;
  }
}

function savePrefs(p) {
  SecureStore.setItemAsync(KEY, JSON.stringify(p)).catch(() => {});
}

async function writeFile(dir, name, format, text) {
  const uri = await FileSystem.StorageAccessFramework.createFileAsync(dir, name, MIME[format]);
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
}

/**
 * Save a copy of a timeline (all its sources combined) to a folder the person picks.
 * Experimental: estimated car routes for gaps that look like car trips, routed on the server
 * from its own street maps, either inside the same file (kept apart from the recorded points)
 * or as a second file.
 */
export default function ExportSheet({ upload, onClose, toast }) {
  const { cfg } = useAuth();
  // the server admin's default gap rules (Settings → Street maps → Routing options), if it has them
  const g = (cfg && cfg.gap_rules) || {};
  const suggested = g.gap_max_min != null ? { max_gap_min: String(g.gap_max_min), max_km: String(g.gap_max_km), min_kmh: String(g.gap_min_kmh) } : SUGGESTED_RULES;
  const [p, setP] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (upload) loadPrefs().then(setP);
  }, [upload && upload.id]);

  const set = (patch) =>
    setP((old) => {
      const n = { ...old, ...patch };
      savePrefs(n);
      return n;
    });
  // until the person changes a value, follow the server's defaults (and send none: the server applies them)
  const rules = p.custom ? p.rules : suggested;
  const sendRules = p.custom ? p.rules : {};
  const setRule = (k, v) => set({ rules: { ...rules, [k]: v.replace(/[^0-9.]/g, "") }, custom: true });

  async function save() {
    if (!upload) return;
    const SAF = FileSystem.StorageAccessFramework;
    try {
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (!perm.granted) return;
      setBusy(true);
      const day = new Date((upload.from || 0) * 1000).toISOString().slice(0, 10);
      const name = `crosspaths-timeline-${day}`;
      const f = p.format;
      if (!p.estimated) {
        await writeFile(perm.directoryUri, name, f, await Api.exportUpload(upload.id, f));
        toast(t("Saved {name}", { name: `${name}.${f}` }));
      } else if (!p.separate) {
        const r = await Api.exportWithEstimates(upload.id, f, "embed", sendRules);
        await writeFile(perm.directoryUri, name, f, r.text);
        toast(t("Saved {name}", { name: `${name}.${f}` }) + note(r.headers));
      } else {
        await writeFile(perm.directoryUri, name, f, await Api.exportUpload(upload.id, f));
        const r = await Api.exportWithEstimates(upload.id, f, "only", sendRules);
        const n = Number(r.headers.get("X-Estimated-Gaps") || 0);
        if (n > 0) {
          await writeFile(perm.directoryUri, `${name}-estimated`, f, r.text);
          toast(t("Saved {name}", { name: `${name}.${f}, ${name}-estimated.${f}` }) + note(r.headers));
        } else {
          toast(t("Saved {name}", { name: `${name}.${f}` }) + note(r.headers));
        }
      }
      onClose();
    } catch (e) {
      toast(e.message || t("Couldn't save the file"), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={!!upload} onClose={busy ? () => {} : onClose}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{t("Export a copy")}</Text>
      <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
        {t("Your timeline, all its sources combined. GPX opens in most map and fitness apps.")}
      </Text>

      <Seg items={FORMATS} value={p.format} onChange={(format) => set({ format })} style={{ marginTop: 14 }} />

      <Pressable
        onPress={() => set({ estimated: !p.estimated })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: p.estimated }}
        style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginTop: 18 }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            marginTop: 1,
            borderWidth: 2,
            borderColor: p.estimated ? colors.accent : colors.muted,
            backgroundColor: p.estimated ? colors.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {p.estimated ? <Icon name="check" size={15} color={colors.onAccent} strokeWidth={2.6} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{t("Include estimated points (experimental)")}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>
            {t("Fills gaps that look like car trips with a route from your server's street maps. They're marked as estimated, never mixed with what you recorded, and never used to find crossings.")}
          </Text>
        </View>
      </Pressable>

      {p.estimated ? (
        <View style={{ marginTop: 12, marginLeft: 34 }}>
          <Seg
            items={[
              [false, t("Same file")],
              [true, t("Separate file")],
            ]}
            value={p.separate}
            onChange={(separate) => set({ separate })}
          />
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700", marginTop: 14 }}>{t("Which gaps")}</Text>
          <Rule label={t("Gap up to")} unit={t("min")} value={rules.max_gap_min} onChange={(v) => setRule("max_gap_min", v)} />
          <Rule label={t("Distance up to")} unit={t("km")} value={rules.max_km} onChange={(v) => setRule("max_km", v)} />
          <Rule label={t("Average speed from")} unit={t("km/h")} value={rules.min_kmh} onChange={(v) => setRule("min_kmh", v)} />
          <Text
            onPress={() => set({ rules: suggested, custom: false })}
            style={{ color: colors.accent2, fontSize: 13, fontWeight: "600", marginTop: 8, alignSelf: "flex-start", padding: 2 }}
          >
            {t("Use the suggested values")}
          </Text>
        </View>
      ) : null}

      <Button title={busy ? t("Preparing…") : t("Choose a folder and save")} icon="download" onPress={save} loading={busy} style={{ marginTop: 20 }} />
    </Sheet>
  );
}

function note(headers) {
  if (headers.get("X-Street-Maps") === "0") return " · " + t("No estimated points: this server has no street maps yet.");
  const n = Number(headers.get("X-Estimated-Gaps") || 0);
  return " · " + (n ? t("{n} estimated routes", { n }) : t("No gaps matched, so nothing was estimated."));
}

function Seg({ items, value, onChange, style }) {
  return (
    <View style={[{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3 }, style]}>
      {items.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={String(k)}
            onPress={() => onChange(k)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: on ? colors.panel : "transparent" }}
          >
            <Text style={{ color: on ? colors.text : colors.muted, fontWeight: "700" }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Rule({ label, unit, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
      <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{label}</Text>
      <TextInput
        value={String(value)}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={{
          width: 72,
          textAlign: "center",
          color: colors.text,
          backgroundColor: colors.panel2,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 10,
          paddingVertical: 6,
          fontSize: 15,
        }}
      />
      <Text style={{ color: colors.muted, fontSize: 13, width: 40 }}>{unit}</Text>
    </View>
  );
}
