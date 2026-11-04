import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { MapView, Camera, ShapeSource, CircleLayer, HeatmapLayer } from "@maplibre/maplibre-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../components/AppText";
import ChipScroller from "../components/ChipScroller";
import Icon from "../components/Icon";
import { useToast } from "../components/Toast";
import { Api } from "../api";
import { useAuth } from "../auth";
import { boundsOf } from "../geo";
import { H, pl, t } from "../i18n";
import { colors, MAP_STYLE_FALLBACK, placeOf, seenColor, SEEN_SHORT } from "../theme";

const EMPTY_FC = { type: "FeatureCollection", features: [] };
const HEAT_MAX_Z = 11;

/**
 * Where you cross paths: every crossing from your finished checks on one heatmap, for everyone
 * or one person, and the places you cross most. Uses only what each check's results already show
 * both people (the ~100 m blurred place, rounded time and the shared grade).
 */
export default function CrossingsMapScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { cfg } = useAuth();
  const cameraRef = useRef(null);
  const [all, setAll] = useState(null);
  const [who, setWho] = useState(null); // null = everyone
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    Api.crossings()
      .then(setAll)
      .catch((e) => {
        toast(e.message, true);
        setAll([]);
      });
  }, []);

  const people = useMemo(() => {
    const n = {};
    (all || []).forEach((e) => (n[e.other] = (n[e.other] || 0) + 1));
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }, [all]);
  const shown = useMemo(() => (all || []).filter((e) => !who || e.other === who), [all, who]);

  // the same blurred place counts as one spot; most crossings first
  const spots = useMemo(() => {
    const m = new Map();
    for (const e of shown) {
      const k = `${e.lat.toFixed(4)},${e.lon.toFixed(4)}`;
      const s = m.get(k) || { lat: e.lat, lon: e.lon, n: 0, best: -1, who: new Set(), e };
      s.n += 1;
      s.who.add(e.other);
      if (e.seen != null && e.seen > s.best) s.best = e.seen;
      m.set(k, s);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [shown]);

  const fc = useMemo(
    () => ({
      type: "FeatureCollection",
      features: spots.map((s) => ({ type: "Feature", properties: { n: s.n, w: Math.min(1, 0.35 + Math.log2(1 + s.n) / 4) }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })),
    }),
    [spots]
  );

  // fit the map to what's shown
  useEffect(() => {
    if (!mapReady || !cameraRef.current || !spots.length) return;
    const b = boundsOf(spots.map((s) => [s.lon, s.lat]), 0.02);
    cameraRef.current.fitBounds(b.ne, b.sw, [40, 40, 40, 40], 600);
  }, [mapReady, spots]);

  const goTo = (s) => cameraRef.current && cameraRef.current.setCamera({ centerCoordinate: [s.lon, s.lat], zoomLevel: 15, animationDuration: 600 });

  const header = (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 10 }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ padding: 4 }}>
          <Icon name="back" size={22} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 20 }}>{t("Where you cross paths")}</Text>
          {all ? <Text style={{ color: colors.muted, fontSize: 12.5 }}>{pl("crossings", shown.length)}</Text> : null}
        </View>
      </View>

      {people.length > 1 ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <ChipScroller selected={who ? people.findIndex(([h]) => h === who) + 1 : 0}>
            {[[null, all ? all.length : 0], ...people].map(([h, n]) => {
              const on = h === who;
              return (
                <Pressable
                  key={h || "*"}
                  onPress={() => setWho(h)}
                  style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, borderWidth: 1.5, borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.accent : colors.panel2 }}
                >
                  <Text style={{ color: on ? colors.onAccent : colors.text, fontWeight: "700", fontSize: 13 }}>
                    {h ? H(h) : t("Everyone")} · {n}
                  </Text>
                </Pressable>
              );
            })}
          </ChipScroller>
        </View>
      ) : null}

      <View style={{ height: 320, marginHorizontal: 12, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
        <MapView style={{ flex: 1 }} mapStyle={cfg.map_style || MAP_STYLE_FALLBACK} attributionEnabled logoEnabled={false} compassEnabled={false} onDidFinishLoadingMap={() => setMapReady(true)}>
          <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: [45, 24], zoomLevel: 3 }} />
          <ShapeSource id="xmap" shape={spots.length ? fc : EMPTY_FC}>
            <HeatmapLayer
              id="xmap-heat"
              maxZoomLevel={HEAT_MAX_Z}
              style={{
                heatmapWeight: ["get", "w"],
                heatmapIntensity: ["interpolate", ["linear"], ["zoom"], 0, 0.4, 6, 0.8, HEAT_MAX_Z, 2],
                heatmapRadius: ["interpolate", ["linear"], ["zoom"], 0, 8, 6, 14, 9, 22, HEAT_MAX_Z, 28],
                heatmapColor: [
                  "interpolate", ["linear"], ["heatmap-density"],
                  0, "rgba(250,204,21,0)",
                  0.1, "rgba(250,204,21,0.35)",
                  0.3, "rgba(250,204,21,0.7)",
                  0.55, "#f59e0b",
                  0.8, "#f97316",
                  1, "#ef4444",
                ],
                heatmapOpacity: ["interpolate", ["linear"], ["zoom"], 0, 0.9, 10, 0.85, HEAT_MAX_Z, 0],
              }}
            />
            <CircleLayer
              id="xmap-dot"
              style={{
                circleRadius: ["interpolate", ["linear"], ["get", "n"], 1, 6, 10, 14],
                circleColor: colors.accent,
                circleStrokeColor: "#ffffff",
                circleStrokeWidth: 1.5,
                circleOpacity: ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 0.9],
                circleStrokeOpacity: ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 1],
              }}
            />
          </ShapeSource>
        </MapView>
        {!all ? (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </View>

      {spots.length ? (
        <Text style={{ color: colors.muted, fontSize: 14, fontWeight: "700", marginTop: 20, marginBottom: 4, marginLeft: 16 }}>{t("Where you cross most")}</Text>
      ) : all ? (
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 24 }}>{t("No crossings yet.")}</Text>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
      data={spots.slice(0, 30)}
      keyExtractor={(s) => `${s.lat},${s.lon}`}
      ListHeaderComponent={header}
      renderItem={({ item: s, index }) => (
        <Pressable
          onPress={() => goTo(s)}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: 12, marginTop: 6, padding: 12, borderRadius: 14, backgroundColor: pressed ? colors.pressed : colors.panel, borderWidth: 1, borderColor: colors.line })}
        >
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.panel2, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.accent, fontWeight: "800" }}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>
              {placeOf(s.e) || `‪${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}‬`}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12.5 }} numberOfLines={1}>
              {pl("xplaces", s.n)}
              {who ? "" : ` · ${[...s.who].map((h) => H(h)).join(", ")}`}
            </Text>
          </View>
          {s.best >= 0 ? <Text style={{ color: seenColor(s.best), fontSize: 12, fontWeight: "700" }}>{SEEN_SHORT[s.best]}</Text> : null}
        </Pressable>
      )}
    />
  );
}
