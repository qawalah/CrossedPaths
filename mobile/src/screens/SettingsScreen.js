import React, { useState } from "react";
import { ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import { getServerState, probeServer, setServerAddresses } from "../api";
import { colors } from "../theme";
import { useAuth } from "../auth";
import { useToast } from "../components/Toast";
import { useServerState } from "../useServer";

const URL_RE = /^https?:\/\/[^\s/]+/;

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { refreshConfig } = useAuth();
  const toast = useToast();
  const now = useServerState();
  const [home, setHome] = useState(() => getServerState().home);
  const [alt, setAlt] = useState(() => getServerState().alt);
  const [auto, setAuto] = useState(() => getServerState().auto);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(null); // {home: result, alt: result}

  async function runTest() {
    setTest({ home: { pending: true }, alt: alt.trim() ? { pending: true } : null });
    const [h, a] = await Promise.all([probeServer(home, 4000), alt.trim() ? probeServer(alt, 4000) : Promise.resolve(null)]);
    // Both must be the same server, or switching would sign you in somewhere else.
    const mismatch = h && a && h.cfg && a.cfg && h.cfg.instance && a.cfg.instance && h.cfg.instance !== a.cfg.instance;
    setTest({ home: h, alt: a, mismatch });
  }

  async function save() {
    const h = home.trim(), a = alt.trim();
    if (!URL_RE.test(h)) return toast("Enter the server address in full, starting with http:// or https://", true);
    if (a && !URL_RE.test(a)) return toast("Enter the backup address in full, starting with http:// or https://", true);
    setBusy(true);
    try {
      if (a) {
        const [ph, pa] = await Promise.all([probeServer(h, 4000), probeServer(a, 4000)]);
        if (ph.cfg && pa.cfg && ph.cfg.instance && pa.cfg.instance && ph.cfg.instance !== pa.cfg.instance) {
          setTest({ home: ph, alt: pa, mismatch: true });
          return toast("Those two addresses are different servers. Check the backup address.", true);
        }
      }
      await setServerAddresses({ home: h, alt: a, auto });
      try {
        await refreshConfig();
        toast("Server addresses saved");
      } catch (e) {
        // Saved anyway (you may be setting it up away from home), but say so.
        toast("Saved, but the server can't be reached right now. Check the addresses and your connection.", true);
      }
      navigation.goBack();
    } finally {
      setBusy(false);
    }
  }

  const input = {
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 20, paddingTop: 20, paddingBottom: insets.bottom + 30 }}
      keyboardShouldPersistTaps="handled"
    >
      {now.active ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.good }} />
          <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>
            Using {now.via === "backup" ? "the backup address" : "the main address"} · {now.active}
          </Text>
        </View>
      ) : null}

      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Server address</Text>
      <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4, marginBottom: 8, lineHeight: 18 }}>
        Your CrossPaths server's address, starting with https://.
      </Text>
      <TextInput
        value={home}
        onChangeText={setHome}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://crosspaths.example.com"
        keyboardType="url"
        placeholderTextColor={colors.muted}
        style={input}
      />
      <TestLine r={test && test.home} />

      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15, marginTop: 22 }}>Backup address (optional)</Text>
      <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4, marginBottom: 8, lineHeight: 18 }}>
        Another address of the same server, used when the main one can't be reached.
      </Text>
      <TextInput
        value={alt}
        onChangeText={setAlt}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://backup.crosspaths.example.com"
        keyboardType="url"
        placeholderTextColor={colors.muted}
        style={input}
      />
      <TestLine r={test && test.alt} />
      {test && test.mismatch ? (
        <Text style={{ color: colors.bad, fontSize: 12.5, marginTop: 6 }}>These two addresses are different CrossPaths servers.</Text>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 22,
          padding: 14,
          borderRadius: 14,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.line,
          opacity: alt.trim() ? 1 : 0.5,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Switch automatically</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 3, lineHeight: 18 }}>
            Use the main address when it answers, the backup when it doesn't. Checked when the app opens, when you come back to it, and
            whenever the server can't be reached.
          </Text>
        </View>
        <Switch value={auto && !!alt.trim()} disabled={!alt.trim()} onValueChange={setAuto} trackColor={{ true: colors.accent, false: colors.line }} />
      </View>
      {alt.trim() && !auto ? (
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 8 }}>Off: the app always uses the main address.</Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
        <Button title="Test" variant="ghost" onPress={runTest} />
        <Button title="Save" onPress={save} loading={busy} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

function TestLine({ r }) {
  if (!r) return null;
  if (r.pending) return <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>Checking…</Text>;
  if (r.cfg)
    return (
      <Text style={{ color: colors.good, fontSize: 12.5, marginTop: 6 }}>
        ✓ Reachable · CrossPaths {r.cfg.version} · {r.ms} ms
      </Text>
    );
  return <Text style={{ color: colors.bad, fontSize: 12.5, marginTop: 6 }}>✗ Not reachable from here ({r.error})</Text>;
}
