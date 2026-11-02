import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { Text, TextInput } from "../components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import { useAuth } from "../auth";
import { changeLanguage } from "../changeLanguage";
import { RTL, t } from "../i18n";
import { colors, keepLabel } from "../theme";
import { useToast } from "../components/Toast";
import { registerForPushNotifications } from "../notifications";

export default function AuthScreen({ navigation }) {
  const { login, register, cfg } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState("login");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const isReg = mode === "register";

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
          {t("Did our paths ever cross?")}
        </Text>
        <Text style={{ color: colors.muted, marginBottom: 22, lineHeight: 20 }}>
          {t("Compare Google Timeline exports with a friend — or a stranger — and see only the places and times you both were there.")}
        </Text>

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
        <Text
          onPress={() => navigation.navigate("Settings")}
          style={{ color: colors.accent2, textAlign: "center", marginTop: 22 }}
        >
          {t("Server settings")}
        </Text>
        <Text onPress={() => changeLanguage(RTL ? "en" : "ar")} style={{ color: colors.accent2, textAlign: "center", marginTop: 14 }}>
          {RTL ? "English" : "العربية"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 24, textAlign: "center" }}>
          {t("Your raw timeline is encrypted, used only for checks you agree to, and - unless you choose to keep it longer - deleted {when} after you upload it.", { when: keepLabel(cfg.upload_ttl_hours || 24) })}
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
