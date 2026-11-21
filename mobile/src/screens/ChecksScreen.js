import React from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import Pill from "../components/Pill";
import { useToast } from "../components/Toast";
import { confirm } from "../components/confirm";
import { Api } from "../api";
import { colors, statusLabel } from "../theme";
import { H, T, TE, TP } from "../i18n";

export default function ChecksScreen({ navigation, data }) {
  const { checks, refresh } = data;
  const insets = useSafeAreaInsets();
  const toast = useToast();

  async function remove(id) {
    if (!(await confirm(T("Delete this check?"), T("Its results are deleted for both of you.")))) return;
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
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>{T("Checks")}</Text>
          <Text style={{ color: colors.muted, marginTop: 6, marginBottom: 10, lineHeight: 20 }}>
            {T("Each check runs only after both of you agree.")}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 30 }}>
          {T("No checks yet. Start one from People.")}
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
      sub = T("{who} wants to check paths with you", { who: H(c.other) });
      action = <Button title={T("Review")} onPress={onReview} />;
    } else {
      const days = Math.max(1, Math.round((c.expires_at * 1000 - Date.now()) / 86400000));
      sub = T("Waiting for {who} to agree · expires in {n} d", { who: H(c.other), n: days });
    }
  } else if (c.status === "running") {
    sub = T("Finding where your paths crossed…");
  } else if (c.status === "done") {
    sub = c.events_count ? TP(c.events_count, "{n} crossing found", "{n} crossings found") : T("No crossings found");
    action = <Button title={T("View")} onPress={onResults} />;
  } else if (c.status === "failed") {
    sub = c.error ? TE(c.error) : T("Something went wrong. Upload again and retry.");
  } else if (c.status === "declined") {
    sub = T("Declined");
  } else {
    sub = T("Expired");
  }
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{H(c.other)}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 3 }}>{sub}</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>
            {T("{r} m · {w} min", { r: c.radius_m, w: c.window_min })}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Pill label={statusLabel(c.status)} level={c.status} />
          {action}
          <Text onPress={onDelete} style={{ color: colors.muted, fontSize: 12.5 }}>
            {T("Delete")}
          </Text>
        </View>
      </View>
    </Card>
  );
}
