import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { colors, dateStr } from "../theme";
import DateRangePicker from "../components/DateRangePicker";
import UploadPicker from "../components/UploadPicker";

// Shown when I initiate a check with an accepted connection: choosing my own upload,
// closeness / time-tolerance and (optional) date range implies my consent immediately.
export default function NewCheckModal({ route, navigation, uploads, onDone }) {
  const { connectionId, other } = route.params;
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
    if (!uploadId) {
      toast("Choose a timeline first", true);
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
      toast("Request sent. It runs once they agree.");
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
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Check paths with @{other}</Text>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        They will only see when and roughly where (about 100 m) your paths crossed — never your
        route or full timeline. Your home and work areas are excluded.
      </Text>

      <Label>Your timeline</Label>
      <UploadPicker uploads={uploads} value={uploadId} onChange={setUploadId} />

      <Label>
        Closeness: <Text style={{ color: colors.text }}>{Math.round(radius)} m</Text>
      </Label>
      <Slider minimumValue={50} maximumValue={300} step={10} value={radius} onValueChange={setRadius}
        minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.line} thumbTintColor={colors.accent} />

      <Label>
        Time tolerance: <Text style={{ color: colors.text }}>{Math.round(window)} min</Text>
      </Label>
      <Slider minimumValue={5} maximumValue={60} step={5} value={window} onValueChange={setWindow}
        minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.line} thumbTintColor={colors.accent} />

      <Label>Date range (optional)</Label>
      <DateRangePicker from={dateFrom} to={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />

      <Button title="Send request & agree" onPress={send} loading={busy} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

function Label({ children }) {
  return <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 }}>{children}</Text>;
}
