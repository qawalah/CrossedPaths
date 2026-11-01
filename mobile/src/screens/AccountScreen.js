import Constants from "expo-constants";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import ChipScroller from "../components/ChipScroller";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { useServerState } from "../useServer";
import { useAuth } from "../auth";
import { useTheme } from "../themeContext";
import { ACCENTS, colors, keepLabel, THEME_MODES } from "../theme";
import Slider from "@react-native-community/slider";
import { setScrubberPrefs, useScrubberPrefs, ZOOM_GESTURES } from "../scrubberPrefs";
import { showWelcomeAgain } from "../welcome";

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, setUser, cfg, logout } = useAuth();
  const { pref, setTheme } = useTheme();
  const [scrub] = useScrubberPrefs();
  const [holdMsDrag, setHoldMs] = useState(null);
  const holdMs = Math.round(holdMsDrag ?? scrub.holdMs);
  const server = useServerState();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const keepOptions = cfg.upload_keep_options || [cfg.upload_ttl_hours || 24];
  const keep = user && user.upload_keep_hours != null ? user.upload_keep_hours : cfg.upload_ttl_hours;

  async function chooseKeep(h) {
    if (h === keep || saving || !user || user.offline) return;
    const save = async () => {
      setSaving(true);
      try {
        setUser(await Api.updateSettings({ upload_keep_hours: h }));
        toast(h ? `Uploads are now deleted after ${keepLabel(h)}` : "Uploads are now kept until you delete them");
      } catch (e) {
        toast(e.message, true);
      } finally {
        setSaving(false);
      }
    };
    if (h && (!keep || h < keep)) {
      Alert.alert(
        `Delete after ${keepLabel(h)}?`,
        `Timelines you uploaded more than ${keepLabel(h)} ago will be deleted now.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Change", onPress: save },
        ]
      );
    } else save();
  }

  function confirmLogout() {
    Alert.alert("Sign out?", "You can sign back in, or into a different account, at any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => logout() },
    ]);
  }

  const appVersion = (Constants.expoConfig && Constants.expoConfig.version) || "?";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 100 }}
    >
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 12 }}>Account</Text>

      <Card>
        <Text style={{ color: colors.muted, fontSize: 12.5 }}>Signed in as</Text>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 17, marginTop: 2 }}>
          {user && user.handle ? `@${user.handle}` : "…"}
        </Text>
        {user && user.offline ? (
          <Text style={{ color: colors.warn, fontSize: 12.5, marginTop: 6 }}>
            Can't reach the server right now. Everything will refresh once it's reachable.
          </Text>
        ) : null}
        <Button title="Show the tutorial again" icon="help" variant="ghost" onPress={showWelcomeAgain} style={{ marginTop: 14 }} />
        <Button title="Sign out" variant="bad" onPress={confirmLogout} style={{ marginTop: 10 }} />
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Appearance</Text>
        <View style={{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3, marginTop: 12 }}>
          {THEME_MODES.map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setTheme({ mode: k })}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: pref.mode === k ? colors.panel : "transparent" }}
            >
              <Text style={{ color: pref.mode === k ? colors.text : colors.muted, fontWeight: "700" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 14, marginBottom: 8 }}>Accent colour</Text>
        <View style={{ flexDirection: "row", gap: 14 }}>
          {Object.entries(ACCENTS).map(([k, a]) => {
            const on = pref.accent === k;
            return (
              <Pressable
                key={k}
                onPress={() => setTheme({ accent: k })}
                accessibilityLabel={a.name}
                hitSlop={6}
                style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: on ? colors.text : "transparent", alignItems: "center", justifyContent: "center" }}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: a[colors.isDark ? "dark" : "light"][0] }} />
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Timeline date bar</Text>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
          How to zoom from years into months and days while dragging along the date bar in My timeline.
        </Text>
        <View style={{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3, marginTop: 12 }}>
          {ZOOM_GESTURES.map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setScrubberPrefs({ gesture: k })}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: scrub.gesture === k ? colors.panel : "transparent" }}
            >
              <Text style={{ color: scrub.gesture === k ? colors.text : colors.muted, fontWeight: "700", fontSize: 13 }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 8, lineHeight: 18 }}>
          {scrub.gesture === "pull"
            ? "Slide your finger up to zoom in, down to zoom out."
            : scrub.gesture === "hold"
              ? "Keep your finger still for a moment to zoom in one step."
              : "Slide up or hold still to zoom in; slide down to zoom out."}
        </Text>
        {scrub.gesture !== "pull" ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>
              Hold for <Text style={{ fontWeight: "800" }}>{holdMs} ms</Text> before zooming
            </Text>
            <Slider
              minimumValue={250}
              maximumValue={1200}
              step={50}
              value={scrub.holdMs}
              onValueChange={setHoldMs}
              onSlidingComplete={(v) => setScrubberPrefs({ holdMs: v })}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor={colors.line}
              thumbTintColor={colors.accent}
            />
          </View>
        ) : null}
        <Button
          title="Show the tutorial again"
          variant="ghost"
          onPress={() => {
            setScrubberPrefs({ tutorialSeen: false });
            toast("The tutorial will show next time you open My timeline");
          }}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Keep my uploaded timelines</Text>
        <View style={{ marginTop: 12, opacity: saving ? 0.6 : 1 }}>
          <ChipScroller selected={keepOptions.indexOf(keep)}>
            {keepOptions.map((h) => {
              const on = h === keep;
              return (
                <Pressable
                  key={String(h)}
                  onPress={() => chooseKeep(h)}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 8,
                    borderRadius: 99,
                    borderWidth: 1.5,
                    borderColor: on ? colors.accent : colors.line,
                    backgroundColor: on ? colors.accent : colors.panel2,
                  }}
                >
                  <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: "700", fontSize: 13 }}>{keepLabel(h)}</Text>
                </Pressable>
              );
            })}
          </ChipScroller>
        </View>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 10, lineHeight: 18 }}>
          {keep
            ? `Each timeline you upload is deleted ${keepLabel(keep)} after you upload it. Keep it longer to look at My timeline or run new checks without uploading again.`
            : "Your timelines stay on the server, encrypted, until you delete them on the Import tab."}
        </Text>
      </Card>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted, fontSize: 12.5 }}>Server</Text>
          {server.alt ? (
            <Text style={{ color: server.via === "backup" ? colors.accent2 : colors.good, fontSize: 12.5, fontWeight: "700" }}>
              {server.via === "backup" ? "via backup address" : "main address"}
              {server.auto ? " · auto" : ""}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: colors.text, marginTop: 2 }} selectable>
          {server.active || "Not set"}
        </Text>
        {server.alt ? (
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }} numberOfLines={1}>
            {server.via === "backup" ? `Main: ${server.home}` : `Backup: ${server.alt}`}
          </Text>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            Add a backup address to keep using the app if the main one can't be reached.
          </Text>
        )}
        <Button title={server.alt ? "Server addresses" : "Server addresses"} variant="ghost" onPress={() => navigation.navigate("Settings")} style={{ marginTop: 12 }} />
      </Card>

      <Card>
        <Row label="App version" value={appVersion} />
        <Row label="Server version" value={cfg.version || "—"} />
        <Row label="Results are deleted after" value={cfg.results_ttl_days ? `${cfg.results_ttl_days} days` : "—"} />
      </Card>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ color: colors.muted }}>{label}</Text>
      <Text style={{ color: colors.text }}>{value}</Text>
    </View>
  );
}
