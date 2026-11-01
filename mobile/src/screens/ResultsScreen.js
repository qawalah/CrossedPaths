import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, PanResponder, Pressable, ScrollView, SectionList, Text, View } from "react-native";
import { MapView, Camera, ShapeSource, LineLayer, FillLayer, CircleLayer, HeatmapLayer } from "@maplibre/maplibre-react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../components/Toast";
import { activeFilterCount, applyFilters, FilterSheet, freshFilters, LegendSheet, SORTS } from "../components/ResultsFilter";
import StatsDashboard from "../components/StatsDashboard";
import KindIcon from "../components/KindIcon";
import { useAuth } from "../auth";
import { Api } from "../api";
import { boundsOf, circlePolygon, positionAt, segmentsFeature, segmentsUntil } from "../geo";
import { colors, DEVICE_LOCALE, fmtDay, fmtTime, KIND_COLOR, KIND_LABEL, localDayKey, MAP_STYLE_FALLBACK, offsetText, whereText } from "../theme";
import Icon from "../components/Icon";

const PLAY_TICKS = 400; // a full replay takes ~20 s whatever the window length
const EMPTY_FC = { type: "FeatureCollection", features: [] };
const NO_SEGS = []; // stable identity, so "no path" doesn't re-run the camera effect every render

// The heat map is for the overview only: it is gone by HEAT_MAX_Z and the dots fade in before
// that, so zooming in quickly reveals the individual crossings.
const HEAT_MAX_Z = 10.5;
const DOTS_FROM_Z = 8.5;
const SELECT_FROM_Z = 9; // below this a tap zooms in instead of opening a crossing

// The results sheet: peek (just its header), half, or nearly the whole screen.
const MID = 0.48, FULL = 0.9;
const PEEK_H = 118; // grip + the two-line crossing header
const [S_MID, S_FULL] = [1, 2]; // 0 = peek

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function ResultsScreen({ route, navigation }) {
  const { checkId } = route.params;
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { cfg } = useAuth();
  const cameraRef = useRef(null);
  const listRef = useRef(null);
  const scrollTarget = useRef(null); // retried once if the row wasn't rendered yet
  const playTimer = useRef(null);

  const [check, setCheck] = useState(null);
  const [windows, setWindows] = useState([]);
  const [legacy, setLegacy] = useState(false); // result saved before own paths were kept
  const [sel, setSel] = useState(-1); // index into events, -1 = the list of all crossings
  const [scrubT, setScrubT] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [f, setF] = useState(freshFilters);
  const [showFilter, setShowFilter] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [bounds, setBounds] = useState(null); // visible map area, for "only on the map"
  const [zoom, setZoom] = useState(3.5);
  const zoomRef = useRef(3.5);
  const [street, setStreet] = useState({}); // event index -> street text / "…"
  const [tab, setTab] = useState("summary"); // the dashboard first, then the map & list

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, tr] = await Promise.all([Api.getCheck(checkId), Api.myTrack(checkId)]);
        if (cancelled) return;
        setCheck(c);
        setWindows(tr.windows || []);
        setLegacy(!!tr.legacy);
      } catch (e) {
        toast(e.message, true);
        navigation.goBack();
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(playTimer.current);
    };
  }, [checkId]);

  // ---------- the sheet ----------
  const [area, setArea] = useState({ w: 0, h: 0 }); // the map area under the header
  const snaps = useMemo(() => {
    if (!area.h) return null;
    const peek = Math.min(PEEK_H + insets.bottom, area.h * 0.3);
    return [peek, Math.max(peek + 60, Math.round(area.h * MID)), Math.round(area.h * FULL)];
  }, [area.h, insets.bottom]);
  const snapsRef = useRef(null);
  snapsRef.current = snaps;
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const [snap, setSnap] = useState(S_MID);
  const snapRef = useRef(S_MID);
  const dragStart = useRef(0);

  useEffect(() => {
    if (snaps) sheetAnim.setValue(snaps[snapRef.current]);
  }, [snaps]);

  function goTo(idx) {
    const s = snapsRef.current;
    if (!s) return;
    snapRef.current = idx;
    setSnap(idx);
    Animated.spring(sheetAnim, { toValue: s[idx], useNativeDriver: false, bounciness: 0, speed: 16 }).start();
  }
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      // Steal the gesture from a button in the header once it's clearly a vertical drag.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderGrant: () => {
        sheetAnim.stopAnimation((v) => {
          dragStart.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const s = snapsRef.current;
        if (s) sheetAnim.setValue(clamp(dragStart.current - g.dy, s[0], s[2]));
      },
      onPanResponderRelease: (_, g) => settle(g),
      onPanResponderTerminate: (_, g) => settle(g),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  function settle(g) {
    const s = snapsRef.current;
    if (!s) return;
    const h = clamp(dragStart.current - g.dy, s[0], s[2]);
    const projected = h - g.vy * 200; // a flick carries on to the next stop
    let best = 0;
    for (let i = 1; i < s.length; i++) if (Math.abs(s[i] - projected) < Math.abs(s[best] - projected)) best = i;
    goToRef.current(best);
  }

  function tapGrip() {
    goTo(snapRef.current === S_FULL ? S_MID : snapRef.current + 1);
  }

  // How much of the map the sheet covers, for framing. At "full" the map is barely visible, so
  // frame as if at half rather than squeezing everything into a sliver.
  const coverH = snaps ? snaps[Math.min(snap, S_MID)] : 0;
  const pad = useCallback((bottom) => [56, 36, bottom + 28, 36], []);

  // ---------- data ----------
  const events = useMemo(
    () =>
      (check && check.events ? check.events : []).map((e, i) => ({
        ...e,
        i,
        t0: Date.parse(e.start) / 1000,
        t1: Date.parse(e.end) / 1000,
      })),
    [check]
  );
  const view = useMemo(() => applyFilters(events, f, bounds), [events, f, bounds]);
  const nActive = activeFilterCount(f);

  // List: grouped by the user's local calendar day, except when sorted by length.
  const sections = useMemo(() => {
    if (f.sort === "long") return [{ key: "all", title: null, data: view }];
    const byDay = new Map();
    for (const e of view) {
      const d = new Date(e.t0 * 1000);
      const key = localDayKey(d);
      if (!byDay.has(key)) byDay.set(key, { key, title: fmtDay(d), data: [] });
      byDay.get(key).data.push(e);
    }
    return [...byDay.values()];
  }, [view, f.sort]);
  const viewDays = useMemo(() => new Set(view.map((e) => localDayKey(new Date(e.t0 * 1000)))).size, [view]);

  const selEvent = sel >= 0 ? events[sel] : null;
  const selPos = selEvent ? view.findIndex((e) => e.i === sel) : -1;
  const selWindow = useMemo(() => {
    if (!selEvent) return null;
    return windows.find((w) => w.from <= selEvent.t0 && selEvent.t0 <= w.to) || null;
  }, [selEvent, windows]);
  const segs = (selWindow && selWindow.segments) || NO_SEGS;
  const pts = useMemo(() => segs.flat().sort((a, b) => a[0] - b[0]), [segs]);
  const tMin = pts.length ? pts[0][0] : null;
  const tMax = pts.length ? pts[pts.length - 1][0] : null;
  const mePos = pts.length && scrubT != null ? positionAt(pts, scrubT) : null;

  // ---------- camera ----------
  const frameAll = useCallback(() => {
    if (!cameraRef.current || !view.length) return;
    const b = boundsOf(view.map((e) => [e.lon, e.lat]), 0.02);
    cameraRef.current.fitBounds(b.ne, b.sw, pad(coverH), 600);
  }, [view, coverH, pad]);

  const frameEvent = useCallback(
    (e, windowPts) => {
      if (!cameraRef.current || !e) return;
      // The hour either side of the crossing, so you see how you got there and where you went.
      const near = windowPts.filter((p) => p[0] >= e.t0 - 3600 && p[0] <= e.t1 + 3600).map((p) => [p[2], p[1]]);
      const b = boundsOf([...near, [e.lon, e.lat]], 0.006);
      cameraRef.current.fitBounds(b.ne, b.sw, pad(coverH), 700);
    },
    [coverH, pad]
  );

  // A crossing is opened, or the sheet moved: keep it in the visible part of the map.
  useEffect(() => {
    if (mapReady && selEvent) frameEvent(selEvent, pts);
  }, [mapReady, sel, pts, frameEvent]);

  // Re-frame the overview when the data or the filters change - but not while "only what's on
  // the map" is on, since then the map position IS the filter.
  useEffect(() => {
    if (mapReady && !selEvent && !f.inView && snaps) frameAll();
  }, [mapReady, events, f.kinds, f.year, f.city, f.place, f.minDur, f.q, f.inView, !!snaps]);

  /** Zoomed out, a tap on a hot spot zooms into the crossings under the finger. */
  function zoomInto(feats) {
    if (!cameraRef.current || !area.w) return;
    const coords = feats.map((ft) => ft.geometry.coordinates);
    const b = boundsOf(coords, 0);
    const center = [(b.ne[0] + b.sw[0]) / 2, (b.ne[1] + b.sw[1]) / 2];
    const visW = Math.max(120, area.w - 72);
    const visH = Math.max(120, area.h - coverH - 84);
    const spanLon = Math.max(1e-5, b.ne[0] - b.sw[0]);
    const spanLat = Math.max(1e-5, b.ne[1] - b.sw[1]);
    const cosLat = Math.cos((center[1] * Math.PI) / 180);
    const zFit = Math.min(Math.log2((visW * 360) / (256 * spanLon)), Math.log2((visH * 360 * cosLat) / (256 * spanLat)));
    // Always a real step in, never past street level.
    const z = clamp(zFit, zoomRef.current + 2, 14);
    cameraRef.current.setCamera({
      centerCoordinate: center,
      zoomLevel: z,
      padding: { paddingTop: 56, paddingRight: 36, paddingBottom: coverH + 28, paddingLeft: 36 },
      animationDuration: 700,
    });
  }

  function onCrossingsPress(ev) {
    const feats = (ev.features || []).filter((ft) => ft.properties && ft.properties.i != null && ft.geometry);
    if (!feats.length) return;
    const z = zoomRef.current;
    if (z < SELECT_FROM_Z || (feats.length > 1 && z < HEAT_MAX_Z)) return zoomInto(feats);
    select(feats[0].properties.i, true);
  }

  // ---------- selection / replay ----------
  function stopPlay() {
    clearInterval(playTimer.current);
    setPlaying(false);
  }

  const pendingScroll = useRef(null); // scroll the list back to a crossing once it's shown again

  function select(i, moveSheet) {
    stopPlay();
    if (i < 0 || i >= events.length) return;
    setSel(i);
    setScrubT(events[i].t0);
    // From the map at "peek" you need to see the details; from the list at "full" you need to
    // see the map. Half-way shows both.
    if (moveSheet && snapRef.current !== S_MID) goTo(S_MID);
  }

  function showAll() {
    const from = sel;
    stopPlay();
    setSel(-1);
    setScrubT(null);
    pendingScroll.current = from >= 0 ? from : null;
  }

  useEffect(() => {
    const i = pendingScroll.current;
    if (i == null || sel >= 0) return;
    pendingScroll.current = null;
    for (let s = 0; s < sections.length; s++) {
      const idx = sections[s].data.findIndex((x) => x.i === i);
      if (idx >= 0) {
        scrollTarget.current = { sectionIndex: s, itemIndex: idx, viewPosition: 0.3, retried: false, animated: false };
        // The list has only just been shown again; give it a frame to lay out.
        setTimeout(() => {
          try {
            listRef.current && listRef.current.scrollToLocation(scrollTarget.current);
          } catch (err) {
            /* list not laid out yet */
          }
        }, 60);
        break;
      }
    }
  }, [sel, sections]);

  // Keep the replay clamped to the recorded path when the selection (and so the window) changes.
  useEffect(() => {
    if (selEvent && tMin != null) setScrubT((t) => Math.min(tMax, Math.max(tMin, t == null ? selEvent.t0 : t)));
  }, [tMin, tMax]);

  function togglePlay() {
    if (playing) return stopPlay();
    if (tMin == null) return;
    const step = Math.max(1, (tMax - tMin) / PLAY_TICKS);
    if (scrubT == null || scrubT >= tMax) setScrubT(tMin);
    setPlaying(true);
    playTimer.current = setInterval(() => {
      setScrubT((t) => {
        const next = Math.min(tMax, (t == null ? tMin : t) + step);
        if (next >= tMax) {
          clearInterval(playTimer.current);
          setPlaying(false);
        }
        return next;
      });
    }, 50);
  }

  async function lookupStreet(e) {
    setStreet((s) => ({ ...s, [e.i]: "…" }));
    try {
      const lang = encodeURIComponent((DEVICE_LOCALE || "en").split("-")[0]);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${e.lat}&lon=${e.lon}&accept-language=${lang}`,
        { headers: { Accept: "application/json", "User-Agent": "CrossPaths (self-hosted app)" } }
      );
      if (!res.ok) {
        const busy = res.status === 403 || res.status === 429;
        setStreet((s) => ({ ...s, [e.i]: busy ? "OpenStreetMap is busy or refused the lookup. Try again later." : "OpenStreetMap couldn't look that up." }));
        return;
      }
      const j = await res.json();
      const a = j.address || {};
      const text = [a.road || a.pedestrian || a.footway || a.square, a.neighbourhood || a.suburb || a.quarter].filter(Boolean).join(", ");
      setStreet((s) => ({ ...s, [e.i]: text || j.display_name || "No street name here" }));
    } catch (err) {
      setStreet((s) => ({ ...s, [e.i]: "Couldn't reach OpenStreetMap right now." }));
    }
  }

  // Dashboard -> map with just these crossings: drop any open crossing, keep the sort.
  function drill(patch) {
    stopPlay();
    setSel(-1);
    setScrubT(null);
    setF({ ...freshFilters(), sort: f.sort, ...patch });
    setTab("map");
    goTo(S_MID);
  }

  function cycleSort() {
    const i = SORTS.findIndex(([key]) => key === f.sort);
    setF({ ...f, sort: SORTS[(i + 1) % SORTS.length][0] });
  }

  // ---------- map data ----------
  const markersFC = useMemo(
    () => ({
      type: "FeatureCollection",
      features: view.map((e) => ({
        type: "Feature",
        // Heat weight 0.3..1: a lone short crossing is a faint glow, only real clusters burn red.
        properties: { i: e.i, kind: e.kind, w: Math.min(1, 0.3 + Math.log2(1 + e.duration_min / 15) / 5) },
        geometry: { type: "Point", coordinates: [e.lon, e.lat] },
      })),
    }),
    [view]
  );
  const areaFeature = selEvent
    ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circlePolygon(selEvent.lat, selEvent.lon, selEvent.blur_m || 100)] } }
    : null;
  const trackFeature = useMemo(() => segmentsFeature(segs), [segs]);
  const doneFeature = useMemo(() => (scrubT != null ? segmentsFeature(segmentsUntil(segs, scrubT)) : null), [segs, scrubT]);
  const meFeature = mePos ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [mePos.lon, mePos.lat] } } : null;

  if (!check) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const k = selEvent ? KIND_LABEL[selEvent.kind] || KIND_LABEL.same_place : null;
  const prev = selPos > 0 ? view[selPos - 1] : null;
  const next = selPos >= 0 && selPos < view.length - 1 ? view[selPos + 1] : null;
  const showSummary = tab === "summary" || !events.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 10 }}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={{ padding: 6 }}>
          <Icon name="back" size={22} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }} numberOfLines={1}>
            Paths crossed with @{check.other}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
            {events.length ? `${events.length} crossing${events.length === 1 ? "" : "s"}` : "No crossings"} · {check.radius_m} m · {check.window_min} min
          </Text>
        </View>
        <SmallBtn icon="help" onPress={() => setShowLegend(true)} />
      </View>

      {events.length ? (
        <View style={{ flexDirection: "row", backgroundColor: colors.panel2, borderRadius: 12, padding: 3, marginHorizontal: 14, marginBottom: 8 }}>
          {[
            ["summary", "Summary"],
            ["map", "Map & list"],
          ].map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => {
                if (key === "summary") stopPlay(); // don't keep re-rendering everything behind the summary
                setTab(key);
              }}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: tab === key ? colors.panel : "transparent" }}
            >
              <Text style={{ color: tab === key ? colors.text : colors.muted, fontWeight: "700" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* The map fills the whole area; the results sheet slides over it. */}
      <View style={{ flex: 1 }} onLayout={(ev) => setArea({ w: ev.nativeEvent.layout.width, h: ev.nativeEvent.layout.height })}>
        <MapView
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          mapStyle={cfg.map_style || MAP_STYLE_FALLBACK}
          attributionEnabled
          attributionPosition={{ top: 8, left: 8 }}
          logoEnabled={false}
          compassEnabled={false}
          onDidFinishLoadingMap={() => setMapReady(true)}
          onRegionDidChange={(r) => {
            const p = r && r.properties;
            if (!p) return;
            if (p.visibleBounds) setBounds(p.visibleBounds);
            if (Number.isFinite(p.zoomLevel)) {
              zoomRef.current = p.zoomLevel;
              setZoom(p.zoomLevel);
            }
          }}
        >
          <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: [45, 24], zoomLevel: 3.5 }} />

          <ShapeSource id="track" shape={selEvent ? trackFeature : EMPTY_FC}>
            <LineLayer id="track-all" style={{ lineColor: colors.accent2, lineOpacity: 0.35, lineWidth: 3, lineCap: "round", lineJoin: "round" }} />
            <CircleLayer id="track-stays" filter={["==", ["get", "stay"], 1]} style={{ circleRadius: 5, circleColor: colors.accent2, circleOpacity: 0.5 }} />
          </ShapeSource>
          <ShapeSource id="track-done" shape={selEvent && doneFeature ? doneFeature : EMPTY_FC}>
            <LineLayer id="track-done-line" style={{ lineColor: colors.accent2, lineWidth: 4, lineCap: "round", lineJoin: "round" }} />
          </ShapeSource>
          {/* How precise the place is (blurred for privacy): a faint dashed ring, not a blob. */}
          <ShapeSource id="area" shape={areaFeature || EMPTY_FC}>
            <FillLayer id="area-fill" style={{ fillColor: colors.accent, fillOpacity: 0.06 }} />
            <LineLayer id="area-line" style={{ lineColor: colors.accent, lineWidth: 1.5, lineOpacity: 0.8, lineDasharray: [2, 2] }} />
          </ShapeSource>
          <ShapeSource id="crossings" shape={markersFC} hitbox={{ width: 44, height: 44 }} onPress={onCrossingsPress}>
            <HeatmapLayer
              id="crossings-heat"
              maxZoomLevel={HEAT_MAX_Z}
              style={{
                heatmapWeight: ["get", "w"],
                heatmapIntensity: ["interpolate", ["linear"], ["zoom"], 0, 0.3, 5, 0.5, 9, 1.4, HEAT_MAX_Z, 2],
                heatmapRadius: ["interpolate", ["linear"], ["zoom"], 0, 6, 5, 11, 8, 18, HEAT_MAX_Z, 24],
                heatmapColor: [
                  "interpolate", ["linear"], ["heatmap-density"],
                  0, "rgba(250,204,21,0)",
                  0.1, "rgba(250,204,21,0.35)",
                  0.3, "rgba(250,204,21,0.7)",
                  0.55, "#f59e0b",
                  0.8, "#f97316",
                  1, "#ef4444",
                ],
                heatmapOpacity: ["interpolate", ["linear"], ["zoom"], 0, 0.9, 9, 0.85, HEAT_MAX_Z, 0],
              }}
            />
            {/* Invisible tap target while zoomed out, so a tap on a hot spot can zoom into it. */}
            <CircleLayer id="crossings-hit" maxZoomLevel={HEAT_MAX_Z} style={{ circleRadius: 12, circleColor: "#000000", circleOpacity: 0.01 }} />
            <CircleLayer
              id="crossings-dot"
              style={{
                circleRadius: ["interpolate", ["linear"], ["zoom"], DOTS_FROM_Z, 4, 14, 7],
                circleColor: ["match", ["get", "kind"], "passing", KIND_COLOR.passing, "shared_route", KIND_COLOR.shared_route, KIND_COLOR.same_place],
                circleStrokeColor: "#ffffff",
                circleStrokeWidth: 1.5,
                circleOpacity: ["interpolate", ["linear"], ["zoom"], DOTS_FROM_Z, 0, 10, 1],
                circleStrokeOpacity: ["interpolate", ["linear"], ["zoom"], DOTS_FROM_Z, 0, 10, 1],
              }}
            />
            <CircleLayer
              id="crossings-sel"
              filter={["==", ["get", "i"], sel]}
              style={{ circleRadius: 10, circleColor: "#ffffff", circleStrokeColor: colors.bg, circleStrokeWidth: 4 }}
            />
          </ShapeSource>
          <ShapeSource id="me" shape={meFeature || EMPTY_FC}>
            <CircleLayer id="me-dot" style={{ circleRadius: 7, circleColor: colors.accent2, circleStrokeColor: "#ffffff", circleStrokeWidth: 3 }} />
          </ShapeSource>
        </MapView>

        {/* Map controls, above the sheet */}
        {events.length && snap !== S_FULL ? (
          <View style={{ position: "absolute", top: 10, right: 10, alignItems: "flex-end", gap: 8 }}>
            <MapBtn icon="fit" onPress={() => (selEvent ? frameEvent(selEvent, pts) : frameAll())} />
          </View>
        ) : null}
        {events.length && !selEvent && zoom < SELECT_FROM_Z && snap !== S_FULL ? (
          <View pointerEvents="none" style={{ position: "absolute", top: 12, left: 0, right: 0, alignItems: "center" }}>
            <View style={{ backgroundColor: colors.chip, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
              <Text style={{ color: colors.text, fontSize: 12.5 }}>Tap a hot spot to zoom in</Text>
            </View>
          </View>
        ) : null}

        {/* ---------- the results sheet ---------- */}
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: sheetAnim,
            // Android draws (and hit-tests) by elevation, not order: hide the sheet behind the summary
            // or it sits on top of it and swallows the summary's scrolling.
            display: showSummary ? "none" : "flex",
            backgroundColor: colors.panel,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            overflow: "hidden",
            elevation: 12,
            shadowColor: "#000",
            shadowOpacity: 0.35,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
          }}
        >
          {/* Drag handle + header: always visible, even at "peek" */}
          <View {...pan.panHandlers} style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <Pressable onPress={tapGrip} hitSlop={8} style={{ alignItems: "center", paddingTop: 8, paddingBottom: 6 }}>
              <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line }} />
            </Pressable>

            {selEvent ? (
              <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Pressable onPress={showAll} hitSlop={8} style={{ paddingVertical: 4, paddingRight: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                      <Icon name="prev" size={16} color={colors.accent2} strokeWidth={2.2} />
                      <Text style={{ color: colors.accent2, fontWeight: "700" }}>All crossings</Text>
                    </View>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  {selPos >= 0 ? <Text style={{ color: colors.muted, fontSize: 12.5 }}>{`${selPos + 1} of ${view.length}`}</Text> : null}
                  <SmallBtn icon="prev" onPress={() => prev && select(prev.i, false)} disabled={!prev} />
                  <SmallBtn icon="next" onPress={() => next && select(next.i, false)} disabled={!next} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
                  <KindBadge kind={selEvent.kind} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>{k[1]}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12.5 }} numberOfLines={1}>
                      {fmtDay(new Date(selEvent.t0 * 1000))} · {fmtTime(new Date(selEvent.t0 * 1000))}–{fmtTime(new Date(selEvent.t1 * 1000))} · ~
                      {selEvent.duration_min} min
                    </Text>
                  </View>
                </View>
              </View>
            ) : events.length ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10 }}>
                <SmallBtn icon="filter" label={nActive ? `Filter (${nActive})` : "Filter"} onPress={() => setShowFilter(true)} active={nActive > 0} />
                <Text style={{ color: colors.text, fontSize: 13, flex: 1, fontWeight: "600" }} numberOfLines={1}>
                  {nActive ? `${view.length} of ${events.length}` : `${view.length} crossings`}
                  <Text style={{ color: colors.muted, fontWeight: "400" }}>{` · ${viewDays} day${viewDays === 1 ? "" : "s"}`}</Text>
                </Text>
                <SmallBtn icon="sort" label={SORTS.find(([key]) => key === f.sort)[1]} onPress={cycleSort} />
              </View>
            ) : null}
          </View>

          {/* One crossing: its details replace the list */}
          <View style={{ flex: 1, display: selEvent ? "flex" : "none" }}>
            {selEvent ? (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                  <View style={{ marginTop: 2 }}>
                    <KindIcon kind="same_place" size={17} color={colors.muted} />
                  </View>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 }} selectable>
                    {whereText(selEvent)}
                  </Text>
                </View>
                {street[selEvent.i] ? (
                  <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, marginLeft: 25 }}>{street[selEvent.i]}</Text>
                ) : (
                  <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, marginLeft: 25 }}>
                    <Text onPress={() => lookupStreet(selEvent)} style={{ color: colors.accent2, fontWeight: "600" }}>
                      Show street name
                    </Text>{" "}
                    (asks OpenStreetMap)
                  </Text>
                )}
                <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 8 }}>
                  {offsetText(selEvent.offset_min)} · place accurate to about {selEvent.blur_m || 100} m
                </Text>

                <View style={{ marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: colors.panel2 }}>
                  {pts.length ? (
                    <>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                          Your path{scrubT != null ? ` · ${fmtTime(new Date(scrubT * 1000))}` : ""}
                        </Text>
                        <Pressable onPress={togglePlay} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Icon name={playing ? "pause" : "play"} size={15} color={colors.accent} strokeWidth={2.2} />
                          <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 13 }}>{playing ? "Pause" : "Replay"}</Text>
                        </Pressable>
                      </View>
                      <Slider
                        style={{ marginTop: 4 }}
                        minimumValue={0}
                        maximumValue={Math.max(1, tMax - tMin)}
                        value={scrubT == null ? 0 : scrubT - tMin}
                        onValueChange={(v) => {
                          stopPlay();
                          setScrubT(Math.min(tMax, tMin + v));
                        }}
                        minimumTrackTintColor={colors.accent}
                        maximumTrackTintColor={colors.line}
                        thumbTintColor={colors.accent}
                      />
                      <Text style={{ color: colors.muted, fontSize: 12 }}>Only your own path is ever shown, never theirs.</Text>
                    </>
                  ) : legacy ? (
                    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
                      This result was saved by an older version, before your own path was kept with it. Run the check again to see
                      how you got here and where you went.
                    </Text>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: 13 }}>No path of yours was recorded in the hours around this crossing.</Text>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </View>

          {/* All crossings (kept mounted so its scroll position survives opening one) */}
          <View style={{ flex: 1, display: selEvent ? "none" : "flex" }}>
            <SectionList
              ref={listRef}
              sections={sections}
              keyExtractor={(e) => String(e.id)}
              stickySectionHeadersEnabled
              contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 16 }}
              onScrollToIndexFailed={(info) => {
                // The row isn't rendered yet: jump close to it, then try again once it is.
                const target = scrollTarget.current;
                if (!target || target.retried || !listRef.current) return;
                target.retried = true;
                const responder = listRef.current.getScrollResponder && listRef.current.getScrollResponder();
                if (responder) responder.scrollTo({ y: info.averageItemLength * info.index, animated: false });
                setTimeout(() => {
                  try {
                    listRef.current && listRef.current.scrollToLocation(target);
                  } catch (err) {
                    /* give up quietly */
                  }
                }, 250);
              }}
              ListHeaderComponent={
                check.their_trust === "low" ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: colors.warnBg, borderWidth: 1, borderColor: colors.warnBorder, flexDirection: "row", gap: 8 }}>
                    <Icon name="warning" size={18} color={colors.warnText} />
                    <Text style={{ color: colors.warnText, fontSize: 13, flex: 1 }}>
                      @{check.other}'s timeline looks unusual (possible fake or edited location data). Treat these results with caution.
                    </Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                events.length ? (
                  <Text style={{ color: colors.muted, textAlign: "center", marginTop: 24 }}>
                    No crossings match these filters.{" "}
                    <Text style={{ color: colors.accent2 }} onPress={() => setF({ ...freshFilters(), sort: f.sort })}>
                      Clear filters
                    </Text>
                  </Text>
                ) : null
              }
              renderSectionHeader={({ section }) =>
                section.title ? (
                  <View style={{ backgroundColor: colors.panel, paddingTop: 12, paddingBottom: 4, paddingHorizontal: 4 }}>
                    <Text style={{ color: colors.muted, fontSize: 12.5, fontWeight: "700" }}>
                      {section.title} · {section.data.length}
                    </Text>
                  </View>
                ) : null
              }
              renderItem={({ item: e }) => {
                const kk = KIND_LABEL[e.kind] || KIND_LABEL.same_place;
                return (
                  <Pressable
                    onPress={() => select(e.i, true)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 10,
                      borderRadius: 12,
                      marginTop: 4,
                      backgroundColor: pressed ? colors.line : colors.panel2,
                    })}
                  >
                    <KindBadge kind={e.kind} small />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                        <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                          {kk[1]}
                        </Text>
                        <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                          {f.sort === "long" ? `${fmtDay(new Date(e.t0 * 1000))} · ` : ""}
                          {fmtTime(new Date(e.t0 * 1000))} · {e.duration_min} min
                        </Text>
                      </View>
                      <Text style={{ color: colors.muted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                        {whereText(e)}
                      </Text>
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 18 }}>›</Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </Animated.View>

        {/* Over the map rather than instead of it, so the map is ready the moment you switch; kept
            mounted (just hidden) so its scroll position and table toggles survive switching back. */}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, backgroundColor: colors.bg, display: showSummary ? "flex" : "none", elevation: 20, zIndex: 20 }}>
          <StatsDashboard
            events={events}
            check={check}
            bottomInset={insets.bottom}
            onLegend={() => setShowLegend(true)}
            onShowMap={() => {
              setTab("map");
              goTo(S_MID);
            }}
            onEvent={(i) => {
              // A specific crossing: clear any filter from an earlier drill-down so it's listed and on the map.
              setF({ ...freshFilters(), sort: f.sort });
              setTab("map");
              select(i, true);
            }}
            onPlace={(p) => drill({ place: p })}
            onCity={(c) => drill({ city: c })}
            onKind={(kind) => drill({ kinds: [kind] })}
          />
        </View>
      </View>

      <FilterSheet visible={showFilter} onClose={() => setShowFilter(false)} events={events} f={f} setF={setF} shown={view.length} />
      <LegendSheet visible={showLegend} onClose={() => setShowLegend(false)} radiusM={check.radius_m} windowMin={check.window_min} />
    </View>
  );
}

function KindBadge({ kind, small }) {
  const s = small ? 34 : 40;
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: 11,
        backgroundColor: colors.badge,
        borderLeftWidth: 3,
        borderLeftColor: KIND_COLOR[kind] || KIND_COLOR.same_place,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <KindIcon kind={kind} size={small ? 17 : 20} color={KIND_COLOR[kind] || KIND_COLOR.same_place} />
    </View>
  );
}

function MapBtn({ icon, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.chrome,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Icon name={icon} size={20} />
    </Pressable>
  );
}

function SmallBtn({ icon, label, onPress, disabled, active }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        minWidth: 36,
        height: 32,
        paddingHorizontal: 10,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 6,
        backgroundColor: active ? colors.activeBg : colors.panel2,
        borderWidth: 1,
        borderColor: active ? colors.accent : colors.line,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {icon ? <Icon name={icon} size={17} /> : null}
      {label ? <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{label}</Text> : null}
    </Pressable>
  );
}
