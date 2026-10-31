import React from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { colors } from "../theme";

export default function ChecksScreen({ navigation, data }) {
  const { checks, refresh } = data;
  const insets = useSafeAreaInsets();
  const toast = useToast();

  async function remove(id) {
    if (!(await confirm("Delete this check?", "Its results are deleted for both of you."))) return;
    try {
      await Api.deleteCheck(id);
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 100 }}
      data={checks}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <View>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>Checks</Text>
          <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 10, lineHeight: 20 }}>
            Each check runs only after both of you agree.
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>
          No checks yet. Start one from People.
        </Text>
      }
      renderItem={({ item: c }) => (
        <CheckCard
          c={c}
          onReview={() => navigation.navigate("ReviewCheck", { checkId: c.id })}
          onResults={() => navigation.navigate("Results", { checkId: c.id })}
          onDelete={() => remove(c.id)}
        />
      )}
    />
  );
}

function CheckCard({ c, onReview, onResults, onDelete }) {
  let sub = "";
  let action = null;
  if (c.status === "awaiting_consent") {
    if (!c.my_consent) {
      sub = `@${c.other} wants to check paths with you`;
      action = <Button title="Review" onPress={onReview} />;
    } else {
      const days = Math.max(1, Math.round((c.expires_at * 1000 - Date.now()) / 86400000));
      sub = `Waiting for @${c.other} to agree · expires in ${days} d`;
    }
  } else if (c.status === "running") {
    sub = "Finding where your paths crossed…";
  } else if (c.status === "done") {
    sub = c.events_count ? `${c.events_count} crossing${c.events_count > 1 ? "s" : ""} found` : "No crossings found";
    action = <Button title="View" onPress={onResults} />;
  } else if (c.status === "failed") {
    sub = c.error || "Something went wrong. Upload again and retry.";
  } else if (c.status === "declined") {
    sub = "Declined";
  } else {
    sub = "Expired";
  }
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>@{c.other}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 3 }}>{sub}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>
            {c.radius_m} m · {c.window_min} min
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Pill label={c.status.replace("_", " ")} level={c.status} />
          {action}
          <Text onPress={onDelete} style={{ color: colors.muted, fontSize: 12.5 }}>
            Delete
          </Text>
        </View>
      </View>
    </Card>
  );
}
