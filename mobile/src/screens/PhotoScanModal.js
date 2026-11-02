import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Button from "../components/Button";
import Card from "../components/Card";
import DateRangePicker from "../components/DateRangePicker";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { t } from "../i18n";
import { colors, trustLabel } from "../theme";

const BATCH_SIZE = 200; // assets fetched per getAssetsAsync page
const CONCURRENCY = 16; // getAssetInfoAsync calls in flight at once
const MIN_POINTS = 20; // server's minimum per upload

// Builds a {"photoPoints": [...]} timeline straight from the phone's photo library -
// an alternative to exporting a Google Timeline JSON. Nothing leaves the device except
// the timestamp + coordinates of photos that already carry GPS EXIF data.
export default function PhotoScanModal({ navigation, cfg, onDone }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null); // { scanned, total, found }

  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }
    await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(worker));
    return out;
  }

  async function scanAndUpload() {
    setScanning(true);
    setProgress({ scanned: 0, total: 0, found: 0 });
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (perm.status !== "granted") {
        toast(t("Photo library access is needed to scan for geotagged photos"), true);
        setScanning(false);
        return;
      }

      const baseOpts = {
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [MediaLibrary.SortBy.creationTime],
        createdAfter: dateFrom ? dateFrom.getTime() : undefined,
        createdBefore: dateTo ? dateTo.getTime() : undefined,
      };

      const points = [];
      let scanned = 0;
      let after;
      let hasNextPage = true;
      while (hasNextPage) {
        const page = await MediaLibrary.getAssetsAsync({ ...baseOpts, first: BATCH_SIZE, after });
        const infos = await mapLimit(page.assets, CONCURRENCY, async (asset) => {
          try {
            return await MediaLibrary.getAssetInfoAsync(asset);
          } catch (e) {
            return null;
          }
        });
        for (const info of infos) {
          scanned++;
          const loc = info && info.location;
          if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude) && (loc.latitude !== 0 || loc.longitude !== 0)) {
            const ts = Math.round((info.creationTime || Date.now()) / 1000);
            points.push({ t: ts, lat: loc.latitude, lon: loc.longitude });
          }
        }
        setProgress({ scanned, total: page.totalCount, found: points.length });
        after = page.endCursor;
        hasNextPage = page.hasNextPage;
      }

      setScanning(false);

      if (points.length < MIN_POINTS) {
        toast(
          points.length === 0
            ? t("None of those photos carry GPS data. Many apps strip location on save/share — try photos straight from the camera.")
            : t("Only {n} geotagged photos found — need at least {min}. Try widening the date range.", { n: points.length, min: MIN_POINTS }),
          true
        );
        return;
      }

      setUploading(true);
      points.sort((a, b) => a.t - b.t);
      const fileUri = FileSystem.cacheDirectory + `photo-timeline-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify({ photoPoints: points }));

      if (cfg && cfg.max_upload_mb) {
        const info = await FileSystem.getInfoAsync(fileUri);
        if (info.size && info.size > cfg.max_upload_mb * 1048576) {
          toast(t("That's too much data for one upload (limit {mb} MB) — narrow the date range.", { mb: cfg.max_upload_mb }), true);
          return;
        }
      }

      const u = await Api.upload(fileUri, "photo-timeline.json");
      toast(t("Timeline built from {n} photos · {trust}", { n: points.length, trust: trustLabel(u.trust.level) }));
      await onDone();
      navigation.goBack();
    } catch (e) {
      toast(e.message || t("Couldn't scan your photo library"), true);
    } finally {
      setScanning(false);
      setUploading(false);
    }
  }

  const busy = scanning || uploading;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.panel }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
    >
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>{t("Build timeline from photos")}</Text>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        {t("An alternative to importing a timeline file: CrossPaths reads the GPS location and date already saved in your photos' metadata and turns that into a timeline, right here on your phone. Photos with no location (screenshots, downloaded images, some messaging apps) are skipped.")}
      </Text>

      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 }}>{t("Limit to a date range (optional)")}</Text>
      <DateRangePicker from={dateFrom} to={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>
        {t("Leave both empty to scan your whole library. A narrower range scans faster.")}
      </Text>

      {progress ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {scanning ? t("Scanning…") : uploading ? t("Uploading…") : t("Done")}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>
            {progress.total ? t("{a} / {b} photos checked", { a: progress.scanned, b: progress.total }) : t("Starting…")} · {t("{n} with location", { n: progress.found })}
          </Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, marginTop: 10, overflow: "hidden" }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.accent,
                width: `${progress.total ? Math.round((progress.scanned / progress.total) * 100) : 0}%`,
              }}
            />
          </View>
        </Card>
      ) : null}

      <Button
        title={scanning ? t("Scanning…") : uploading ? t("Uploading…") : "📷 " + t("Scan photo library")}
        onPress={scanAndUpload}
        loading={busy}
        disabled={busy}
        style={{ marginTop: 20 }}
      />
      <Pressable onPress={() => navigation.goBack()} disabled={busy} style={{ marginTop: 14, alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>{t("Cancel")}</Text>
      </Pressable>
    </ScrollView>
  );
}
