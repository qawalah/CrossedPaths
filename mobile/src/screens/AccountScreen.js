import Constants from "expo-constants";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { Text } from "../components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Dropdown from "../components/Dropdown";
import PhoneCodeForm from "../components/PhoneCodeForm";
import ChipScroller from "../components/ChipScroller";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { useServerState } from "../useServer";
import { useAuth } from "../auth";
import * as biometric from "../biometric";
import { googleIdToken } from "../google";
import { useTheme } from "../themeContext";
import { changeLanguage } from "../changeLanguage";
import { H, LANG_PREF, pl, RTL, t } from "../i18n";
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
  const [lang, setLang] = useState(LANG_PREF);
  const keepOptions = cfg.upload_keep_options || [cfg.upload_ttl_hours || 24];
  const keep = user && user.upload_keep_hours != null ? user.upload_keep_hours : cfg.upload_ttl_hours;

  function chooseLanguage(pref) {
    if (pref === lang) return;
    setLang(pref);
    changeLanguage(pref);
  }

  async function chooseKeep(h) {
    if (h === keep || saving || !user || user.offline) return;
    const save = async () => {
      setSaving(true);
      try {
        setUser(await Api.updateSettings({ upload_keep_hours: h }));
        toast(h ? t("Uploads are now deleted after {when}", { when: keepLabel(h) }) : t("Uploads are now kept until you delete them"));
      } catch (e) {
        toast(e.message, true);
      } finally {
        setSaving(false);
      }
    };
    if (h && (!keep || h < keep)) {
      Alert.alert(
        t("Delete after {when}?", { when: keepLabel(h) }),
        t("Timelines you uploaded more than {when} ago will be deleted now.", { when: keepLabel(h) }),
        [
          { text: t("Cancel"), style: "cancel" },
          { text: t("Change"), onPress: save },
        ]
      );
    } else save();
  }

  function confirmLogout() {
    Alert.alert(t("Sign out?"), t("You can sign back in, or into a different account, at any time."), [
      { text: t("Cancel"), style: "cancel" },
      { text: t("Sign out"), style: "destructive", onPress: () => logout() },
    ]);
  }

  const appVersion = (Constants.expoConfig && Constants.expoConfig.version) || "?";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 100 }}
    >
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 12 }}>{t("Account")}</Text>

      <Card>
        <Text style={{ color: colors.muted, fontSize: 12.5 }}>{t("Signed in as")}</Text>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 17, marginTop: 2 }}>
          {user && user.handle ? H(user.handle) : "…"}
        </Text>
        {user && user.offline ? (
          <Text style={{ color: colors.warn, fontSize: 12.5, marginTop: 6 }}>
            {t("Can't reach the server right now. Everything will refresh once it's reachable.")}
          </Text>
        ) : null}
        <Button title={t("Replay the tutorial")} icon="help" variant="ghost" onPress={showWelcomeAgain} style={{ marginTop: 14 }} />
        <Button title={t("Sign out")} variant="bad" onPress={confirmLogout} style={{ marginTop: 10 }} />
      </Card>

      <SignInCard />

      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{t("Language")}</Text>
        <View style={{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3, marginTop: 12 }}>
          {[["system", t("System")], ["en", "English"], ["ar", "العربية"]].map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => chooseLanguage(k)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: lang === k ? colors.panel : "transparent" }}
            >
              <Text style={{ color: lang === k ? colors.text : colors.muted, fontWeight: "700" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{t("Appearance")}</Text>
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
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 14, marginBottom: 8 }}>{t("Accent colour")}</Text>
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
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{t("Date bar")}</Text>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
          {t("How to zoom from years into months and days while dragging along the date bar in My timeline.")}
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
            ? t("Slide your finger up to zoom in, down to zoom out.")
            : scrub.gesture === "hold"
              ? t("Keep your finger still for a moment to zoom in one step.")
              : t("Slide up or hold still to zoom in; slide down to zoom out.")}
        </Text>
        {scrub.gesture !== "pull" ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.text, fontSize: 13 }}>
              {t("Hold for")} <Text style={{ fontWeight: "800" }}>{t("{n} ms", { n: holdMs })}</Text> {t("before zooming")}
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
          title={t("Replay the date bar tutorial")}
          variant="ghost"
          onPress={() => {
            setScrubberPrefs({ tutorialSeen: false });
            toast(t("The tutorial will show next time you open My timeline"));
          }}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{t("Timeline storage")}</Text>
        <View style={{ marginTop: 12 }}>
          <Dropdown label={t("Delete my timelines after")} value={keep} options={keepOptions.map((h) => [h, keepLabel(h)])} onChange={chooseKeep} disabled={saving} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 10, lineHeight: 18 }}>
          {keep
            ? t("Each timeline you upload is deleted {when} after you upload it. Keep it longer to look at My timeline or run new checks without uploading again.", { when: keepLabel(keep) })
            : t("Your timelines stay on the server, encrypted, until you delete them on the Import tab.")}
        </Text>
      </Card>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted, fontSize: 12.5 }}>{t("Server")}</Text>
          {server.alt ? (
            <Text style={{ color: server.via === "backup" ? colors.accent2 : colors.good, fontSize: 12.5, fontWeight: "700" }}>
              {server.via === "backup" ? t("via backup address") : t("main address")}
              {server.auto ? ` · ${t("auto")}` : ""}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: colors.text, marginTop: 2 }} selectable>
          {server.active || t("Not set")}
        </Text>
        {server.alt ? (
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }} numberOfLines={1}>
            {server.via === "backup" ? t("Main: {url}", { url: server.home }) : t("Backup: {url}", { url: server.alt })}
          </Text>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            {t("Add a backup address to keep using the app if the main one can't be reached.")}
          </Text>
        )}
        <Button title={t("Server addresses")} variant="ghost" onPress={() => navigation.navigate("Settings")} style={{ marginTop: 12 }} />
      </Card>

      {user && user.is_admin ? (
        <Card>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{t("Server admin")}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
            {t("Settings for the whole server. Only admins see this.")}
          </Text>
          <Button title={t("Street maps")} icon="map" variant="ghost" onPress={() => navigation.navigate("Admin")} style={{ marginTop: 12 }} />
        </Card>
      ) : null}

      <Card>
        <Row label={t("App version")} value={appVersion} />
        <Row label={t("Server version")} value={cfg.version || "—"} />
        <Row label={t("Results deleted after")} value={cfg.results_ttl_days ? pl("days", cfg.results_ttl_days) : "—"} />
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
    if (on && !(await biometric.unlock(t("Confirm to turn on the lock")))) return;
    await biometric.setEnabled(on);
    setBioOn(on);
  }

  async function addPhone(phone, code) {
    const r = await Api.linkPhone(phone, code);
    setUser(r.user);
    setAddingPhone(false);
    toast(t("Phone number added. You can now sign in with it."));
  }

  async function addGoogle() {
    setBusy(true);
    try {
      const t = await googleIdToken(methods.google_client_id);
      if (!t) return;
      setUser((await Api.linkGoogle(t)).user);
      toast(t("Google account added. You can now sign in with it."));
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
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{t("Sign-in")}</Text>
      {have.length ? (
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>
          {t("You can sign in with: {methods}", { methods: have.map((m) => ({ password: t("password"), phone: t("phone number"), google: "Google" }[m] || m)).join(RTL ? "، " : ", ") })}
        </Text>
      ) : null}
      {bioAvail ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: colors.text }}>{t("Unlock with fingerprint")}</Text>
            <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>{t("Asks when you open the app")}</Text>
          </View>
          <Switch value={bioOn} onValueChange={toggleBio} trackColor={{ true: colors.accent, false: colors.line }} />
        </View>
      ) : null}
      {phoneRow && !offline ? (
        addingPhone ? (
          <View style={{ marginTop: 8 }}>
            <PhoneCodeForm onVerified={addPhone} submitTitle={t("Add number")} />
            <Text onPress={() => setAddingPhone(false)} style={{ color: colors.accent2, textAlign: "center", marginTop: 14 }}>{t("Cancel")}</Text>
          </View>
        ) : (
          <Button title={t("Add a phone number (WhatsApp)")} variant="ghost" onPress={() => setAddingPhone(true)} style={{ marginTop: 12 }} />
        )
      ) : null}
      {googleRow && !offline ? (
        <Button title={t("Add a Google account")} variant="ghost" onPress={addGoogle} loading={busy} style={{ marginTop: 10 }} />
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
