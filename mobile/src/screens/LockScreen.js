import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "../components/AppText";
import Button from "../components/Button";
import { useAuth } from "../auth";
import { t } from "../i18n";
import { colors } from "../theme";

export default function LockScreen() {
  const { unlockApp, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  async function tryUnlock() {
    setBusy(true);
    try {
      await unlockApp();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    tryUnlock(); // ask once straight away
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{t("CrossPaths is locked")}</Text>
      <Text style={{ color: colors.muted, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
        {t("Use your fingerprint or screen lock to open it.")}
      </Text>
      <Button title={t("Unlock")} onPress={tryUnlock} loading={busy} style={{ marginTop: 22, alignSelf: "stretch" }} />
      {/* Escape hatch: never leave someone stuck behind a lock they can't pass. */}
      <Button title={t("Sign out")} variant="ghost" onPress={() => logout()} style={{ marginTop: 10, alignSelf: "stretch" }} />
    </View>
  );
}
