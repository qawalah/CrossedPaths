import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import PhoneCodeForm from "../components/PhoneCodeForm";
import { useAuth } from "../auth";
import { colors, keepLabel } from "../theme";
import { useToast } from "../components/Toast";
import { registerForPushNotifications } from "../notifications";

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
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 30, paddingBottom: 40 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: "800", marginBottom: 8 }}>
          Did our paths ever cross?
        </Text>
        <Text style={{ color: colors.muted, marginBottom: 22, lineHeight: 20 }}>
          Compare Google Timeline exports with a friend — or a stranger — and see only the places
          and times you both were there.
        </Text>

        {signupToken ? (
          <View>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Choose a username</Text>
            <Text style={{ color: colors.muted, marginTop: 6, lineHeight: 20 }}>
              This is how friends find you. Your phone number and Google account are never shown to anyone.
            </Text>
            <Field label="Username" value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} placeholder="e.g. sara.k" />
            <Field label="Name (optional)" value={displayName} onChangeText={setDisplayName} />
            {cfg.invite_required !== false ? (
              <Field
                label={cfg.invite_required ? "Invite code" : "Invite code (if your server uses one)"}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}
            <Button title="Create account" onPress={finishSignup} loading={busy} style={{ marginTop: 16 }} />
            <Text onPress={() => setSignupToken(null)} style={{ color: colors.accent2, textAlign: "center", marginTop: 16 }}>
              Cancel
            </Text>
          </View>
        ) : phoneOpen ? (
          <View>
            <PhoneCodeForm onVerified={async (phone, code) => after(await loginWithPhone(phone, code))} />
            <Text onPress={() => setPhoneOpen(false)} style={{ color: colors.accent2, textAlign: "center", marginTop: 18 }}>
              Other ways to sign in
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
                    {m === "login" ? "Sign in" : "Create account"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Field label="Username" value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} placeholder="e.g. sara.k" />
            <Field
              label={isReg ? "Password (10+ characters)" : "Password"}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={submit}
            />
            {/* Shown when the server needs one - or when we couldn't ask it (config didn't load). */}
            {isReg && cfg.invite_required !== false ? (
              <Field
                label={cfg.invite_required ? "Invite code" : "Invite code (if your server uses one)"}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}

            <Button
              title={isReg ? "Create account" : "Sign in"}
              onPress={submit}
              loading={busy}
              style={{ marginTop: 16 }}
            />
            {methods.phone || methods.google ? (
              <View style={{ marginTop: 22 }}>
                <Text style={{ color: colors.muted, textAlign: "center", marginBottom: 12 }}>or</Text>
                {methods.phone ? (
                  <Button title="Continue with WhatsApp" variant="ghost" onPress={() => setPhoneOpen(true)} disabled={busy} />
                ) : null}
                {methods.google ? (
                  <Button title="Continue with Google" variant="ghost" onPress={google} disabled={busy} style={{ marginTop: methods.phone ? 10 : 0 }} />
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        <Text
          onPress={() => navigation.navigate("Settings")}
          style={{ color: colors.accent2, textAlign: "center", marginTop: 22 }}
        >
          Server settings
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 24, textAlign: "center" }}>
          Your raw timeline is encrypted, used only for checks you agree to, and - unless you choose to keep it longer -
          deleted {keepLabel(cfg.upload_ttl_hours || 24)} after you upload it.
        </Text>
      </ScrollView>
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
