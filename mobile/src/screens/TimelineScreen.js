import React, { useEffect, useRef, useState } from "react";
import { Animated, FlatList, LayoutAnimation, Platform, Pressable, Text, UIManager, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import ExportSheet from "../exportTimeline";
import { useAuth } from "../auth";
import { EASE_OUT, reduceMotion } from "../motion";
import { colors, dateStr, hoursLeft, keepPhrase, trustLabel } from "../theme";
import Icon from "../components/Icon";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);

export default function TimelineScreen({ data, navigation }) {
  const { uploads, refresh, cfg } = data;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [exporting, setExporting] = useState(null);

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
    <>
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 100 }}
      data={uploads}
      keyExtractor={(u) => u.id}
      ListHeaderComponent={
        <View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Import</Text>
          <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
            Build your timeline from one or more sources. It stays private and is{" "}
            {keepPhrase(user && user.upload_keep_hours != null ? user.upload_keep_hours : cfg.upload_ttl_hours)} (change this on the Account tab).
          </Text>

          <SectionTitle>Add a new timeline</SectionTitle>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 6 }}>
            <AddOption
              icon="folder"
              title="Import a file"
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
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6, lineHeight: 17 }}>
            {uploads.length
              ? "To grow a timeline you already have, use Add a file or Scan photos on its card below."
              : "You can combine several sources into one timeline, and add more later."}
          </Text>

          {uploads.length ? <SectionTitle>Your timeline{uploads.length > 1 ? "s" : ""}</SectionTitle> : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 24 }}>No timeline uploaded yet.</Text>
      }
      renderItem={({ item, index }) => (
        <UploadCard
          upload={item}
          title={uploads.length > 1 ? `Timeline ${index + 1}` : "Your timeline"}
          onRemoveZone={removeZone}
          onDelete={deleteUpload}
          onAddFile={() => navigation.navigate("Build", { start: "files", targetId: item.id })}
          onAddPhotos={() => navigation.navigate("Build", { start: "photos", targetId: item.id })}
          onExport={() => setExporting(item)}
          onView={() => navigation.navigate("MyTimeline", { uploadId: item.id, uploadLabel: `${dateStr(item.from)} → ${dateStr(item.to)}` })}
        />
      )}
    />
    <ExportSheet upload={exporting} onClose={() => setExporting(null)} toast={toast} />
    </>
  );
}

function SectionTitle({ children }) {
  return (
    <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700", marginTop: 22, marginBottom: 8, marginLeft: 4 }}>{children}</Text>
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

/**
 * What each anomaly from the server's authenticity check (crosspaths/spoofcheck.py) means, and
 * what you can do about it. `map: true` means it's worth looking at on the map; anything with
 * `add: true` can improve when more of your own data is added.
 */
const ANOMALIES = [
  [/impossible jump/i, "Points far apart only moments apart. Usually a bad GPS fix, or a photo whose saved place is wrong.", { map: true }],
  [/straight long stretch/i, "Ruler-straight runs over 1.5 km. Often a flight, or a gap the recording app filled in with a straight line.", { map: true }],
  [/constant speed/i, "Stretches at exactly the same speed, as a route played back by a mock-location app would be.", { map: true }],
  [/regular intervals/i, "Location fixes arrive on a perfectly even clock, which real phones rarely do.", { add: true }],
  [/duplicate timestamps/i, "Many points share the same time.", { add: true }],
  [/rounded/i, "Coordinates have fewer decimals than real GPS fixes.", { add: true }],
  [/identical accuracy/i, "Nearly every fix reports the same accuracy.", { add: true }],
  [/different account/i, "Someone else uploaded the same timeline. Nothing to fix on your side if it's yours.", {}],
  [/too little data/i, "There are too few points to judge.", { add: true }],
];

function explain(reason) {
  const hit = ANOMALIES.find(([re]) => re.test(reason));
  return hit ? { text: hit[1], ...hit[2] } : { text: null };
}

/** A tappable heading that opens and closes the part below it. */
function Section({ title, right, open, onToggle, children }) {
  const spin = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(spin, { toValue: open ? 1 : 0, duration: reduceMotion() ? 0 : 260, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [open]);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12, paddingBottom: open ? 6 : 0, opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14, flex: 1 }}>{title}</Text>
        {right}
        <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
          <Icon name="next" size={18} color={colors.muted} style={{ transform: [{ rotate: "90deg" }] }} />
        </Animated.View>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function UploadCard({ upload, title, onRemoveZone, onDelete, onView, onAddFile, onAddPhotos, onExport }) {
  const t = upload.trust;
  const sources = upload.sources || [];
  const issues = t.level !== "high" ? t.reasons.filter((r) => !/no anomalies/i.test(r)) : [];
  const [open, setOpen] = useState({ issues: false, zones: false });
  function toggle(k) {
    if (!reduceMotion()) LayoutAnimation.configureNext(LayoutAnimation.create(260, "easeInEaseOut", "opacity"));
    setOpen((o) => ({ ...o, [k]: !o[k] }));
  }
  const small = { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 };

  return (
    <Card>
      {/* Header: which timeline, how sure we are it's genuine */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginRight: 10 }}>
          <Icon name="route" size={20} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 17 }}>{title}</Text>
        </View>
        <Pill label={trustLabel(t.level)} level={t.level} />
      </View>
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14, marginTop: 8 }}>
        {dateStr(upload.from)} → {dateStr(upload.to)}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>
        {upload.points.toLocaleString()} points · {hoursLeft(upload.expires_at)}
      </Text>

      {/* Where the points came from */}
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {sources.length === 1 ? "Source" : `Sources (${sources.length})`}
      </Text>
      {sources.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
          <Icon name={/photo/i.test(s.label) ? "photos" : "folder"} size={18} color={colors.accent2} />
          <Text style={{ color: colors.text, fontSize: 13.5, flex: 1 }}>
            {s.label}
            {s.files > 1 ? <Text style={{ color: colors.muted }}>{`  ·  ${s.files} files`}</Text> : null}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12.5 }}>{Number(s.points || 0).toLocaleString()} pts</Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Button title="Add a file" icon="folder" variant="ghost" onPress={onAddFile} style={[small, { flex: 1 }]} />
        <Button title="Scan photos" icon="photos" variant="ghost" onPress={onAddPhotos} style={[small, { flex: 1 }]} />
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Button title="View on map" icon="map" onPress={onView} style={{ flex: 1 }} />
        <Button title="Export" icon="download" variant="ghost" onPress={onExport} style={{ flex: 1 }} />
      </View>

      {issues.length ? (
        <Section
          title={`Anomalies (${issues.length})`}
          right={<Icon name="warning" size={17} color={colors.warn || colors.muted} />}
          open={open.issues}
          onToggle={() => toggle("issues")}
        >
          <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 4 }}>
            These lower the trust level the other person sees after a check. Nothing is changed in your timeline.
          </Text>
          {issues.map((r, i) => {
            const e = explain(r);
            return (
              <View key={i} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600" }}>{r}</Text>
                {e.text ? <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 2 }}>{e.text}</Text> : null}
                <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}>
                  {e.map ? "What you can do: find it on the map. If one source is wrong, delete this timeline and build it again without that source." : e.add ? "What you can do: add more of your own data (another app or your photos)." : "No action needed."}
                </Text>
                {e.map || e.add ? (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                    {e.map ? <Button title="Find on map" icon="map" variant="ghost" onPress={onView} style={small} /> : null}
                    {e.add ? <Button title="Add a source" icon="plus" variant="ghost" onPress={onAddFile} style={small} /> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Section>
      ) : null}

      <Section
        title={`Home & work areas (${upload.zones.length})`}
        open={open.zones}
        onToggle={() => toggle("zones")}
      >
        <Text style={{ color: colors.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 4 }}>
          Any crossing inside these areas is never shown. Remove an area only if you want places there included.
        </Text>
        {upload.zones.length ? (
          upload.zones.map((z, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                Area {i + 1} · {z.lat.toFixed(3)}, {z.lon.toFixed(3)} · {Math.round(z.radius_m)} m
              </Text>
              <Text onPress={() => onRemoveZone(upload, i)} style={{ color: colors.accent2, fontSize: 12.5, padding: 4 }}>
                Remove
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: colors.muted, fontSize: 12.5 }}>None detected.</Text>
        )}
      </Section>

      <View style={{ borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 10, flexDirection: "row", justifyContent: "flex-end" }}>
        <Pressable onPress={() => onDelete(upload.id)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="trash" size={16} color={colors.bad} />
          <Text style={{ color: colors.bad, fontSize: 13, fontWeight: "600" }}>Delete timeline</Text>
        </Pressable>
      </View>
    </Card>
  );
}
