import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Text, TextInput } from "../components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import PhoneCodeForm from "../components/PhoneCodeForm";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../auth";
import { changeLanguage } from "../changeLanguage";
import { RTL, t } from "../i18n";
import { colors } from "../theme";
import { useToast } from "../components/Toast";
import { registerForPushNotifications } from "../notifications";

const LOGO = require("../../assets/tab-logo.png"); // the app icon

export default function AuthScreen({ navigation }) {
  const { login, register, cfg, loginWithPhone, loginWithGoogle, completeSignup } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState("login");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [signupToken, setSignupToken] = useState(null); // a new phone / Google identity: pick a username
  const [displayName, setDisplayName] = useState("");
  const isReg = mode === "register";
  const methods = cfg.auth || {};

  function after(r) {
    if (!r) return; // closed Google's chooser
    if (r.needsSignup) setSignupToken(r.signupToken);
    else registerForPushNotifications().catch(() => {});
  }

  async function google() {
    setBusy(true);
    try {
      after(await loginWithGoogle());
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function finishSignup() {
    setBusy(true);
    try {
      await completeSignup(signupToken, handle, displayName, invite);
      registerForPushNotifications().catch(() => {});
    } catch (e) {
      // The 15-minute sign-up window ran out: start over.
      if (e.status === 401) setSignupToken(null);
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    try {
      if (isReg) await register(handle, password, invite);
      else await login(handle, password);
      registerForPushNotifications().catch(() => {});
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* logo and slogan at the top, the sign-in form in the middle, links at the bottom */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center" }}>
          <Image source={LOGO} style={{ width: 76, height: 76, borderRadius: 20, marginBottom: 14 }} accessibilityLabel="CrossPaths" />
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800", lineHeight: 38, textAlign: "center" }}>
            {t("Did our paths ever cross?")}
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center", paddingVertical: 20 }}>
        {signupToken ? (
          <View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{t("Choose a username")}</Text>
            <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
              {t("This is how friends find you. Your phone number and Google account are never shown to anyone.")}
            </Text>
            <Field label={t("Username")} value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} placeholder={t("e.g. sara.k")} />
            <Field label={t("Name (optional)")} value={displayName} onChangeText={setDisplayName} />
            {cfg.invite_required !== false ? (
              <Field
                label={cfg.invite_required ? t("Invite code") : t("Invite code (if your server uses one)")}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}
            <Button title={t("Create account")} onPress={finishSignup} loading={busy} style={{ marginTop: 16 }} />
            <Text onPress={() => setSignupToken(null)} style={{ color: colors.accent2, textAlign: "center", marginTop: 16 }}>
              {t("Cancel")}
            </Text>
          </View>
        ) : phoneOpen ? (
          <View>
            <PhoneCodeForm onVerified={async (phone, code) => after(await loginWithPhone(phone, code))} />
            <Text onPress={() => setPhoneOpen(false)} style={{ color: colors.accent2, textAlign: "center", marginTop: 18 }}>
              {t("Other ways to sign in")}
            </Text>
          </View>
        ) : (
          <View>
            <View style={{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3, marginBottom: 18 }}>
              {["login", "register"].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: "center", backgroundColor: mode === m ? colors.panel : "transparent" }}
                >
                  <Text style={{ color: mode === m ? colors.text : colors.muted, fontWeight: "700", fontSize: 15 }}>
                    {m === "login" ? t("Sign in") : t("Create account")}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Field label={t("Username")} value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} placeholder={t("e.g. sara.k")} />
            <Field
              label={isReg ? t("Password (10+ characters)") : t("Password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={submit}
            />
            {/* Shown when the server needs one - or when we couldn't ask it (config didn't load). */}
            {isReg && cfg.invite_required !== false ? (
              <Field
                label={cfg.invite_required ? t("Invite code") : t("Invite code (if your server uses one)")}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}

            <Button
              title={isReg ? t("Create account") : t("Sign in")}
              onPress={submit}
              loading={busy}
              style={{ marginTop: 16 }}
            />
            {methods.phone || methods.google ? (
              <View style={{ marginTop: 22 }}>
                <Text style={{ color: colors.muted, textAlign: "center", marginBottom: 12 }}>{t("or")}</Text>
                {methods.phone ? (
                  <Button title={t("Continue with WhatsApp")} variant="ghost" onPress={() => setPhoneOpen(true)} disabled={busy} />
                ) : null}
                {methods.google ? (
                  <Button title={t("Continue with Google")} variant="ghost" onPress={google} disabled={busy} style={{ marginTop: methods.phone ? 10 : 0 }} />
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        </View>
        <Text
          onPress={() => navigation.navigate("Settings")}
          style={{ color: colors.accent2, textAlign: "center" }}
        >
          {t("Server settings")}
        </Text>
        <Text onPress={() => changeLanguage(RTL ? "en" : "ar")} style={{ color: colors.accent2, textAlign: "center", marginTop: 14 }}>
          {RTL ? "English" : "العربية"}
        </Text>
      </ScrollView>
      <ThemeToggle />
    </KeyboardAvoidingView>
  );
}

function Field(props) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 5 }}>{label}</Text>
      <TextInput
        {...rest}
        placeholderTextColor={colors.muted}
        style={{
          backgroundColor: colors.panel2,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 12,
          padding: 12,
          color: colors.text,
        }}
      />
    </View>
  );
}
