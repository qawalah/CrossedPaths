import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "../components/AppText";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { H, t } from "../i18n";
import { colors } from "../theme";
import DateRangePicker from "../components/DateRangePicker";
import UploadPicker from "../components/UploadPicker";

// Shown when I initiate a check with an accepted connection: choosing my own upload,
// closeness / time-tolerance and (optional) date range implies my consent immediately.
// Opened from People with a connection already chosen, or from Checks with none: then the
// person is picked here, from everyone I'm connected to (already checked or not).
export default function NewCheckModal({ route, navigation, uploads, connections = [], onDone }) {
  const params = (route && route.params) || {};
  const people = connections.filter((c) => c.status === "accepted");
  const [connectionId, setConnectionId] = useState(params.connectionId || null);
  const picked = people.find((c) => c.id === connectionId);
  const other = params.connectionId ? params.other : picked && picked.other;
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [uploadId, setUploadId] = useState(uploads[0] && uploads[0].id);
  // The uploads list may arrive after this screen opens (polling); pick the newest then.
  useEffect(() => {
    if (!uploadId && uploads[0]) setUploadId(uploads[0].id);
  }, [uploads]);
  const [radius, setRadius] = useState(100);
  const [window, setWindow] = useState(15);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!connectionId) {
      toast(t("Choose who to check with"), true);
      return;
    }
    if (!uploadId) {
      toast(t("Choose a timeline first"), true);
      return;
    }
    setBusy(true);
    try {
      await Api.createCheck({
        connection_id: connectionId,
        upload_id: uploadId,
        radius_m: Math.round(radius),
        window_min: Math.round(window),
        date_from: dateFrom ? dateFrom.getTime() / 1000 : null,
        date_to: dateTo ? dateTo.getTime() / 1000 : null,
      });
      toast(t("Request sent. It runs once they agree."));
      await onDone();
      navigation.goBack();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.panel }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
    >
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
        {params.connectionId ? t("Check paths with {who}", { who: H(other) }) : t("Run a check")}
      </Text>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        {t("They will only see when and roughly where (about 100 m) your paths crossed — never your route or full timeline. Your home and work areas are excluded.")}
      </Text>

      {params.connectionId ? null : (
        <>
          <Label>{t("Check with")}</Label>
          {people.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {people.map((c) => {
                const on = c.id === connectionId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setConnectionId(c.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: on ? colors.accent : colors.line,
                      backgroundColor: on ? colors.accent : colors.panel2,
                    }}
                  >
                    <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: "600" }}>{H(c.other)}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>{t("You're not connected to anyone yet. Connect with someone on People first.")}</Text>
          )}
        </>
      )}

      <Label>{t("Your timeline")}</Label>
      <UploadPicker uploads={uploads} value={uploadId} onChange={setUploadId} />

      <Label>
        {t("Closeness:")} <Text style={{ color: colors.text }}>{t("{n} m", { n: Math.round(radius) })}</Text>
      </Label>
      <Slider minimumValue={50} maximumValue={300} step={10} value={radius} onValueChange={setRadius}
        minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.line} thumbTintColor={colors.accent} />

      <Label>
        {t("Time tolerance:")} <Text style={{ color: colors.text }}>{t("{n} min", { n: Math.round(window) })}</Text>
      </Label>
      <Slider minimumValue={5} maximumValue={60} step={5} value={window} onValueChange={setWindow}
        minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.line} thumbTintColor={colors.accent} />

      <Label>{t("Date range (optional)")}</Label>
      <DateRangePicker from={dateFrom} to={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />

      <Button title={t("Send request & agree")} onPress={send} loading={busy} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

function Label({ children }) {
  return <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 }}>{children}</Text>;
}
