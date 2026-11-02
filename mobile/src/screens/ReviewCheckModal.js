import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "../components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { H, t } from "../i18n";
import { colors } from "../theme";
import DateRangePicker from "../components/DateRangePicker";
import UploadPicker from "../components/UploadPicker";

// Shown when someone else's check is waiting for MY consent. Radius/window are theirs
// (already fixed); I only choose my own upload and, optionally, trim my own date range.
export default function ReviewCheckModal({ route, navigation, checks, uploads, onDone }) {
  const { checkId } = route.params;
  const c = checks.find((x) => x.id === checkId);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [uploadId, setUploadId] = useState(uploads[0] && uploads[0].id);
  // The uploads list may arrive after this screen opens (polling); pick the newest then.
  useEffect(() => {
    if (!uploadId && uploads[0]) setUploadId(uploads[0].id);
  }, [uploads]);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!c) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.panel, padding: 20, paddingTop: insets.top + 40 }}>
        <Text style={{ color: colors.muted }}>{t("This check is no longer available.")}</Text>
      </View>
    );
  }

  async function agree() {
    setBusy(true);
    try {
      await Api.consentCheck(checkId, {
        upload_id: uploadId,
        date_from: dateFrom ? dateFrom.getTime() / 1000 : null,
        date_to: dateTo ? dateTo.getTime() / 1000 : null,
      });
      await onDone();
      navigation.goBack();
    } catch (e) {
      toast(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    try {
      await Api.declineCheck(checkId);
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
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{t("{who} wants to check paths", { who: H(c.other) })}</Text>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        {t("They will only see when and roughly where (about 100 m) your paths crossed — never your route or full timeline. Your home and work areas are excluded.")}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 10 }}>
        {t("Closeness {m} m · time tolerance {min} min. Nothing runs until you agree.", { m: c.radius_m, min: c.window_min })}
      </Text>

      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 }}>{t("Your timeline")}</Text>
      <UploadPicker uploads={uploads} value={uploadId} onChange={setUploadId} />

      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 }}>{t("Date range (optional)")}</Text>
      <DateRangePicker from={dateFrom} to={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />

      <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
        <Button title={t("Agree & run")} onPress={agree} loading={busy} style={{ flex: 1 }} />
        <Button title={t("Decline")} variant="ghost" onPress={decline} disabled={busy} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}
