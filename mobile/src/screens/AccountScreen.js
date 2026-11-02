import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import PhoneCodeForm from "../components/PhoneCodeForm";
import ChipScroller from "../components/ChipScroller";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { useServerState } from "../useServer";
import { useAuth } from "../auth";
import * as biometric from "../biometric";
import { googleIdToken } from "../google";
import { useTheme } from "../themeContext";
import { ACCENTS, colors, keepLabel, THEME_MODES } from "../theme";

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, setUser, cfg, logout } = useAuth();
  const { pref, setTheme } = useTheme();
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
        <Button title="Sign out" variant="bad" onPress={confirmLogout} style={{ marginTop: 14 }} />
      </Card>

      <SignInCard />

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
            : "Your timelines stay on the server, encrypted, until you delete them on the Timeline tab."}
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

// Fingerprint lock, and adding a phone number / Google account as other ways into this account.
function SignInCard() {
  const { user, setUser, cfg } = useAuth();
  const toast = useToast();
  const [bioAvail, setBioAvail] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [addingPhone, setAddingPhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const methods = cfg.auth || {};
  const have = (user && user.sign_in_methods) || [];

  useEffect(() => {
    biometric.isAvailable().then(setBioAvail);
    biometric.isEnabled().then(setBioOn);
  }, []);

  async function toggleBio(on) {
    // Prove it works before turning it on, so nobody locks themselves out.
    if (on && !(await biometric.unlock("Confirm to turn on the lock"))) return;
    await biometric.setEnabled(on);
    setBioOn(on);
  }

  async function addPhone(phone, code) {
    const r = await Api.linkPhone(phone, code);
    setUser(r.user);
    setAddingPhone(false);
    toast("Phone number added. You can now sign in with it.");
  }

  async function addGoogle() {
    setBusy(true);
    try {
      const t = await googleIdToken(methods.google_client_id);
      if (!t) return;
      setUser((await Api.linkGoogle(t)).user);
      toast("Google account added. You can now sign in with it.");
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  const offline = !user || user.offline;
  const phoneRow = methods.phone && !have.includes("phone");
  const googleRow = methods.google && !have.includes("google");
  if (!bioAvail && !phoneRow && !googleRow && !have.length) return null;

  return (
    <Card>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Sign-in</Text>
      {have.length ? (
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>
          You can sign in with: {have.map((m) => ({ password: "password", phone: "phone number", google: "Google" }[m] || m)).join(", ")}
        </Text>
      ) : null}
      {bioAvail ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: colors.text }}>Unlock with fingerprint</Text>
            <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>Asks when you open the app</Text>
          </View>
          <Switch value={bioOn} onValueChange={toggleBio} trackColor={{ true: colors.accent, false: colors.line }} />
        </View>
      ) : null}
      {phoneRow && !offline ? (
        addingPhone ? (
          <View style={{ marginTop: 8 }}>
            <PhoneCodeForm onVerified={addPhone} submitTitle="Add number" />
            <Text onPress={() => setAddingPhone(false)} style={{ color: colors.accent2, textAlign: "center", marginTop: 14 }}>Cancel</Text>
          </View>
        ) : (
          <Button title="Add a phone number (WhatsApp)" variant="ghost" onPress={() => setAddingPhone(true)} style={{ marginTop: 12 }} />
        )
      ) : null}
      {googleRow && !offline ? (
        <Button title="Add a Google account" variant="ghost" onPress={addGoogle} loading={busy} style={{ marginTop: 10 }} />
      ) : null}
    </Card>
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
