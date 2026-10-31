import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import { useAuth } from "../auth";
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
          Did our paths ever cross?
        </Text>
        <Text style={{ color: colors.muted, marginBottom: 22, lineHeight: 20 }}>
          Compare Google Timeline exports with a friend — or a stranger — and see only the places
          and times you both were there.
        </Text>

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
