import React, { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import JourneyFlow from "../components/JourneyFlow";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { colors } from "../theme";
import Icon from "../components/Icon";

export default function PeopleScreen({ navigation, data, uploads }) {
  const { connections, refresh } = data;
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  const incoming = connections.filter((c) => c.direction === "incoming" && c.status === "pending");
  const outgoing = connections.filter((c) => c.direction === "outgoing" && c.status === "pending");
  const accepted = connections.filter((c) => c.status === "accepted");

  async function sendRequest() {
    if (!handle.trim()) return;
    setBusy(true);
    try {
      await Api.requestConnection(handle.trim());
      toast("Request sent");
      setHandle("");
      await refresh();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function respond(id, action) {
    if (action === "block" && !(await confirm("Block this user?", "They won't be able to send you requests. They aren't told.", "Block"))) return;
    try {
      await Api.respondConnection(id, action);
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function remove(id) {
    if (!(await confirm("Remove this connection?", "Any checks and results with this person are deleted too.", "Remove"))) return;
    try {
      await Api.removeConnection(id);
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function startCheck(conn) {
    if (!uploads.length) {
      toast("Upload your timeline first", true);
      return;
    }
    navigation.navigate("NewCheck", { connectionId: conn.id, other: conn.other });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 100 }}
    >
      <JourneyFlow data={data} navigation={navigation} />
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>People</Text>
      <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 }}>
        Send a request to a username. They must accept before anything can be compared.
      </Text>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="nearby" size={20} color={colors.accent} />
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>Meet in person</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>
          With someone right now? Scan each other's code or shake your phones together - you're connected and your paths are
          checked in one go.
        </Text>
        <Button title="Connect & check now" onPress={() => navigation.navigate("AddNearby")} style={{ marginTop: 12 }} />
      </Card>

      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 14, marginBottom: 2 }}>Or send a request by username</Text>
      <Card>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="@username"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            style={{
              flex: 1,
              backgroundColor: colors.panel2,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 12,
              padding: 11,
              color: colors.text,
            }}
          />
          <Button title="Send" onPress={sendRequest} loading={busy} style={{ paddingHorizontal: 18 }} />
        </View>
      </Card>

      {incoming.length ? (
        <Section title="Requests for you">
          {incoming.map((c) => (
            <Card key={c.id}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>@{c.other}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>wants to compare timelines</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Button title="Accept" onPress={() => respond(c.id, "accept")} style={{ flex: 1 }} />
                <Button title="Decline" variant="ghost" onPress={() => respond(c.id, "decline")} style={{ flex: 1 }} />
              </View>
              <Text
                onPress={() => respond(c.id, "block")}
                style={{ color: colors.muted, fontSize: 12.5, marginTop: 10 }}
              >
                Block this user
              </Text>
            </Card>
          ))}
        </Section>
      ) : null}

      {accepted.length ? (
        <Section title="Connections">
          {accepted.map((c) => (
            <Card key={c.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>@{c.other}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button title="Check paths" onPress={() => startCheck(c)} />
                  <Button title="Remove" variant="ghost" onPress={() => remove(c.id)} />
                </View>
              </View>
            </Card>
          ))}
        </Section>
      ) : null}

      {outgoing.length ? (
        <Section title="Waiting for a reply">
          {outgoing.map((c) => (
            <Card key={c.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>@{c.other}</Text>
              <Pill label="pending" level="pending" />
            </Card>
          ))}
        </Section>
      ) : null}

      {!connections.length ? (
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>No connections yet.</Text>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, marginBottom: 4 }}>{title}</Text>
      {children}
    </View>
  );
}
