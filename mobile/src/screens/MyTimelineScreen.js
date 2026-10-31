import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { MapView, Camera, ShapeSource, LineLayer, CircleLayer } from "@maplibre/maplibre-react-native";
import Slider from "@react-native-community/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth";
import { Api } from "../api";
import { boundsOf, positionAt, segmentsFeature, segmentsUntil } from "../geo";
import { colors, fmtDay, fmtTime, MAP_STYLE_FALLBACK, tzOffsetMin } from "../theme";

const EMPTY_FC = { type: "FeatureCollection", features: [] };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");

function Chip({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 13,
        paddingVertical: 7,
        borderRadius: 99,
        marginRight: 8,
        backgroundColor: selected ? colors.accent : colors.panel2,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.line,
      }}
    >
      <Text style={{ color: selected ? colors.onAccent : colors.text, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function MyTimelineScreen({ route, navigation }) {
  const { uploadId, uploadLabel } = route.params;
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { cfg } = useAuth();
  const cameraRef = useRef(null);

  const [summary, setSummary] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [expandedYear, setExpandedYear] = useState(null);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [loadedDate, setLoadedDate] = useState(null); // { year, month, day }
  const [dayLabel, setDayLabel] = useState("");
  const [daySegs, setDaySegs] = useState([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [pendingScrubTime, setPendingScrubTime] = useState(null);

  const [scrub, setScrub] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playTimer = useRef(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState(null);
  const [pickMode, setPickMode] = useState(false);
  const [radius, setRadius] = useState(150);
  const [visits, setVisits] = useState(null);
  const [visitsLoading, setVisitsLoading] = useState(false);

  const dayPts = useMemo(() => daySegs.flat().sort((a, b) => a[0] - b[0]), [daySegs]);
  const [mapReady, setMapReady] = useState(false);
  const dayReq = useRef(0); // only the latest day request may update the screen
  const [scrollLock, setScrollLock] = useState(false); // while a finger is on the map

  const loadDay = useCallback(
    async (y, m, d) => {
      setExpandedYear(y);
      setExpandedMonth(m);
      setLoadedDate({ year: y, month: m, day: d });
      setDayLabel(fmtDay(new Date(y, m - 1, d)));
      setDayLoading(true);
      clearInterval(playTimer.current);
      setPlaying(false);
      const req = ++dayReq.current;
      try {
        const r = await Api.uploadDay(uploadId, `${y}-${pad2(m)}-${pad2(d)}`, tzOffsetMin());
        if (req !== dayReq.current) return;
        setDaySegs(r.segments || []);
        setScrub(0);
      } catch (e) {
        if (req === dayReq.current) toast(e.message, true);
      } finally {
        if (req === dayReq.current) setDayLoading(false);
      }
    },
    [uploadId]
  );

  useEffect(() => {
    (async () => {
      try {
        const s = await Api.uploadSummary(uploadId, tzOffsetMin());
        setSummary(s);
        if (!s.years || !s.years.length) return;
        const ly = s.years[s.years.length - 1];
        const lm = ly.months[ly.months.length - 1];
        const ld = lm.days[lm.days.length - 1];
        loadDay(ly.year, lm.month, ld.day);
      } catch (e) {
        setLoadErr(e.message);
      }
    })();
  }, [uploadId]);

  useEffect(() => {
    if (pendingScrubTime == null || !dayPts.length) return;
    const span = Math.max(1, dayPts[dayPts.length - 1][0] - dayPts[0][0]);
    setScrub(Math.min(1, Math.max(0, (pendingScrubTime - dayPts[0][0]) / span)));
    setPendingScrubTime(null);
  }, [dayPts, pendingScrubTime]);

  useEffect(() => {
    if (!cameraRef.current || !mapReady || !dayPts.length) return;
    const b = boundsOf(dayPts.map((p) => [p[2], p[1]]), 0.006);
    cameraRef.current.fitBounds(b.ne, b.sw, [40, 30, 40, 30], 500);
  }, [dayPts, mapReady]);

  const tMin = dayPts.length ? dayPts[0][0] : 0;
  const tMax = dayPts.length ? dayPts[dayPts.length - 1][0] : 1;
  const scrubT = tMin + (tMax - tMin) * scrub;
  const mePos = dayPts.length ? positionAt(dayPts, scrubT) : null;
  const trackFeature = useMemo(() => segmentsFeature(daySegs), [daySegs]);
  const doneFeature = useMemo(() => segmentsFeature(segmentsUntil(daySegs, scrubT)), [daySegs, scrubT]);

  function togglePlay() {
    if (playing) {
      clearInterval(playTimer.current);
      setPlaying(false);
      return;
    }
    setPlaying(true);
    if (scrub >= 1) setScrub(0);
    playTimer.current = setInterval(() => {
      setScrub((s) => {
        const next = Math.min(1, s + 0.004);
        if (next >= 1) {
          clearInterval(playTimer.current);
          setPlaying(false);
        }
        return next;
      });
    }, 50);
  }
  useEffect(() => () => clearInterval(playTimer.current), []);

  async function searchVisits(lat, lon, r) {
    setVisitsLoading(true);
    setVisits(null);
    try {
      const res = await Api.uploadVisits(uploadId, lat, lon, r);
      setVisits(res.visits);
    } catch (e) {
      toast(e.message, true);
    } finally {
      setVisitsLoading(false);
    }
  }

  async function runTextSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query.trim())}`,
        { headers: { Accept: "application/json", "Accept-Language": "en" } }
      );
      const list = await res.json();
      if (!list.length) {
        toast("No place found with that name", true);
        return;
      }
      const lat = parseFloat(list[0].lat), lon = parseFloat(list[0].lon);
      setPin({ lat, lon });
      if (cameraRef.current) cameraRef.current.setCamera({ centerCoordinate: [lon, lat], zoomLevel: 15, animationDuration: 500 });
      await searchVisits(lat, lon, radius);
    } catch (e) {
      toast("Couldn't search right now. Check your connection.", true);
    } finally {
      setSearching(false);
    }
  }

  function onMapPress(feature) {
    if (!pickMode) return;
    const [longitude, latitude] = feature.geometry.coordinates;
    setPin({ lat: latitude, lon: longitude });
    setPickMode(false);
    searchVisits(latitude, longitude, radius);
  }

  function openVisit(v) {
    const d = new Date(v.start * 1000);
    setPendingScrubTime(v.start);
    loadDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  if (loadErr) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: colors.muted, textAlign: "center" }}>{loadErr}</Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 18, padding: 10 }}>
          <Text style={{ color: colors.accent, fontWeight: "700" }}>← Back</Text>
        </Pressable>
      </View>
    );
  }
  if (!summary) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!summary.years.length) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: insets.top + 24 }}>
        <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontSize: 18 }}>← Back</Text>
        </Pressable>
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 20 }}>This timeline has no points to show.</Text>
      </View>
    );
  }

  const yearObj = summary.years.find((y) => y.year === expandedYear);
  const monthObj = yearObj && yearObj.months.find((m) => m.month === expandedMonth);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 12, paddingTop: insets.top + 12, gap: 10 }}>
        <Pressable onPress={() => navigation.goBack()} style={{ padding: 6 }}>
          <Text style={{ color: colors.text, fontSize: 18 }}>←</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>My timeline</Text>
          {uploadLabel ? <Text style={{ color: colors.muted, fontSize: 12 }}>{uploadLabel}</Text> : null}
        </View>
      </View>

      <FlatList
        scrollEnabled={!scrollLock}
        data={[]}
        keyExtractor={() => "x"}
        renderItem={null}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 12, marginBottom: 8 }}>
              {summary.years.map((y) => (
                <Chip
                  key={y.year}
                  label={String(y.year)}
                  selected={y.year === expandedYear}
                  onPress={() => {
                    setExpandedYear(y.year);
                    setExpandedMonth(y.months[y.months.length - 1].month);
                  }}
                />
              ))}
            </ScrollView>
            {yearObj ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 12, marginBottom: 8 }}>
                {yearObj.months.map((m) => (
                  <Chip
                    key={m.month}
                    label={MONTH_NAMES[m.month - 1]}
                    selected={m.month === expandedMonth}
                    onPress={() => setExpandedMonth(m.month)}
                  />
                ))}
              </ScrollView>
            ) : null}
            {monthObj ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 12, marginBottom: 12 }}>
                {monthObj.days.map((d) => {
                  const sel =
                    loadedDate && loadedDate.year === expandedYear && loadedDate.month === expandedMonth && loadedDate.day === d.day;
                  return (
                    <Chip key={d.day} label={String(d.day)} selected={sel} onPress={() => loadDay(expandedYear, expandedMonth, d.day)} />
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={{ marginHorizontal: 12, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
              <View
                style={{ height: 280 }}
                onTouchStart={() => setScrollLock(true)}
                onTouchEnd={() => setScrollLock(false)}
                onTouchCancel={() => setScrollLock(false)}
              >
                <MapView
                  style={{ flex: 1 }}
                  mapStyle={cfg.map_style || MAP_STYLE_FALLBACK}
                  attributionEnabled
                  logoEnabled={false}
                  compassEnabled={false}
                  onPress={onMapPress}
                  onDidFinishLoadingMap={() => setMapReady(true)}
                >
                  <Camera ref={cameraRef} defaultSettings={{ centerCoordinate: [20, 25], zoomLevel: 1.5 }} />
                  <ShapeSource id="day-track" shape={dayPts.length ? trackFeature : EMPTY_FC}>
                    <LineLayer id="day-track-all" style={{ lineColor: colors.accent2, lineOpacity: 0.35, lineWidth: 3, lineCap: "round", lineJoin: "round" }} />
                    <CircleLayer id="day-track-stays" filter={["==", ["get", "stay"], 1]} style={{ circleRadius: 5, circleColor: colors.accent2, circleOpacity: 0.5 }} />
                  </ShapeSource>
                  <ShapeSource id="day-track-done" shape={dayPts.length ? doneFeature : EMPTY_FC}>
                    <LineLayer id="day-track-done-line" style={{ lineColor: colors.accent2, lineWidth: 4, lineCap: "round", lineJoin: "round" }} />
                  </ShapeSource>
                  <ShapeSource id="pin" shape={pin ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [pin.lon, pin.lat] } } : EMPTY_FC}>
                    <CircleLayer id="pin-dot" style={{ circleRadius: 8, circleColor: colors.warn, circleStrokeColor: "#ffffff", circleStrokeWidth: 2 }} />
                  </ShapeSource>
                  <ShapeSource id="me" shape={mePos ? { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [mePos.lon, mePos.lat] } } : EMPTY_FC}>
                    <CircleLayer id="me-dot" style={{ circleRadius: 7, circleColor: colors.accent2, circleStrokeColor: "#ffffff", circleStrokeWidth: 3 }} />
                  </ShapeSource>
                </MapView>
                {dayLoading ? (
                  <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "#0008" }}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : null}
              </View>
              <View style={{ backgroundColor: colors.panel, padding: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {dayPts.length ? `${dayLabel} · ${fmtTime(new Date((mePos ? mePos.t : tMin) * 1000))}` : dayLabel ? `${dayLabel} · no points recorded` : "Pick a day above"}
                  </Text>
                  {dayPts.length ? (
                    <Pressable onPress={togglePlay}>
                      <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 12 }}>{playing ? "❚❚ Pause" : "▶ Play"}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {dayPts.length ? (
                  <Slider
                    minimumValue={0}
                    maximumValue={1}
                    value={scrub}
                    onValueChange={(v) => {
                      clearInterval(playTimer.current);
                      setPlaying(false);
                      setScrub(v);
                    }}
                    minimumTrackTintColor={colors.accent}
                    maximumTrackTintColor={colors.line}
                    thumbTintColor={colors.accent}
                  />
                ) : null}
              </View>
            </View>

            <View style={{ margin: 12, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: 4 }}>Have I been here?</Text>
              <Text style={{ color: colors.muted, fontSize: 12.5, marginBottom: 10 }}>Search a place, or tap a point on the map above.</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Place name"
                  placeholderTextColor={colors.muted}
                  onSubmitEditing={runTextSearch}
                  style={{ flex: 1, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: colors.text }}
                />
                <Pressable
                  onPress={runTextSearch}
                  disabled={searching}
                  style={{ paddingHorizontal: 14, justifyContent: "center", borderRadius: 10, backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, opacity: searching ? 0.6 : 1 }}
                >
                  {searching ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={{ color: colors.text, fontWeight: "700" }}>Search</Text>}
                </Pressable>
              </View>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Place search uses OpenStreetMap and sends your search text there.</Text>
              <Pressable
                onPress={() => setPickMode((v) => !v)}
                style={{ marginTop: 10, padding: 10, borderRadius: 10, backgroundColor: pickMode ? colors.accent : colors.panel2, borderWidth: 1, borderColor: pickMode ? colors.accent : colors.line, alignItems: "center" }}
              >
                <Text style={{ color: pickMode ? colors.onAccent : colors.text, fontWeight: "700", fontSize: 13 }}>
                  {pickMode ? "Tap a point on the map above…" : "📍 Or tap a point on the map above"}
                </Text>
              </Pressable>
              <Text style={{ color: colors.text, marginTop: 12, fontSize: 13 }}>
                Search radius: <Text style={{ fontWeight: "800" }}>{radius} m</Text>
              </Text>
              <Slider
                minimumValue={50}
                maximumValue={1000}
                step={25}
                value={radius}
                onValueChange={setRadius}
                onSlidingComplete={(r) => pin && searchVisits(pin.lat, pin.lon, r)}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor={colors.line}
                thumbTintColor={colors.accent}
              />

              {visitsLoading ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />
              ) : visits ? (
                visits.length ? (
                  visits
                    .slice()
                    .reverse()
                    .map((v, i) => {
                      const s = new Date(v.start * 1000), e = new Date(v.end * 1000);
                      return (
                        <Pressable
                          key={i}
                          onPress={() => openVisit(v)}
                          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}
                        >
                          <View>
                            <Text style={{ color: colors.text, fontWeight: "700" }}>{fmtDay(s)}</Text>
                            <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                              {fmtTime(s)}
                              {v.end !== v.start ? `–${fmtTime(e)}` : ""}
                            </Text>
                          </View>
                          <Text style={{ color: colors.muted }}>›</Text>
                        </Pressable>
                      );
                    })
                ) : (
                  <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 10 }}>No visits found there.</Text>
                )
              ) : null}
            </View>
          </View>
        }
      />
    </View>
  );
}
