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
        toast("Photo library access is needed to scan for geotagged photos", true);
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
            const t = Math.round((info.creationTime || Date.now()) / 1000);
            points.push({ t, lat: loc.latitude, lon: loc.longitude });
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
            ? "None of those photos carry GPS data. Many apps strip location on save/share — try photos straight from the camera."
            : `Only ${points.length} geotagged photos found — need at least ${MIN_POINTS}. Try widening the date range.`,
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
          toast(`That's too much data for one upload (limit ${cfg.max_upload_mb} MB) — narrow the date range.`, true);
          return;
        }
      }

      const u = await Api.upload(fileUri, "photo-timeline.json");
      toast(`Timeline built from ${points.length} photos · ${trustLabel(u.trust.level)}`);
      await onDone();
      navigation.goBack();
    } catch (e) {
      toast(e.message || "Couldn't scan your photo library", true);
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
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Build timeline from photos</Text>
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
        An alternative to importing a timeline file: CrossPaths reads the GPS location and
        date already saved in your photos' metadata and turns that into a timeline, right here on
        your phone. Photos with no location (screenshots, downloaded images, some messaging apps)
        are skipped.
      </Text>

      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 18, marginBottom: 6 }}>Limit to a date range (optional)</Text>
      <DateRangePicker from={dateFrom} to={dateTo} onChangeFrom={setDateFrom} onChangeTo={setDateTo} />
      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>
        Leave both empty to scan your whole library. A narrower range scans faster.
      </Text>

      {progress ? (
        <Card style={{ marginTop: 18 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>
            {scanning ? "Scanning…" : uploading ? "Uploading…" : "Done"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>
            {progress.total ? `${progress.scanned} / ${progress.total} photos checked` : "Starting…"} · {progress.found} with
            location
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
        title={scanning ? "Scanning…" : uploading ? "Uploading…" : "Scan photo library"}
        icon="photos"
        onPress={scanAndUpload}
        loading={busy}
        disabled={busy}
        style={{ marginTop: 20 }}
      />
      <Pressable onPress={() => navigation.goBack()} disabled={busy} style={{ marginTop: 14, alignItems: "center" }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}
