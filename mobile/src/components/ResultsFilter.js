import React, { useMemo } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import Button from "./Button";
import ChipScroller from "./ChipScroller";
import KindIcon from "./KindIcon";
import Sheet from "./Sheet";
import { cityOf, colors, KIND_COLOR, KIND_LABEL, kindHelp, placeOf } from "../theme";

export const DUR_STEPS = [0, 5, 15, 30, 60];
export const SORTS = [
  ["new", "Newest"],
  ["old", "Oldest"],
  ["long", "Longest"],
];

export function freshFilters() {
  return { kinds: Object.keys(KIND_LABEL), year: null, city: null, place: null, minDur: 0, q: "", inView: false, sort: "new" };
}

export function activeFilterCount(f) {
  return (
    (f.kinds.length < Object.keys(KIND_LABEL).length ? 1 : 0) +
    (f.year != null ? 1 : 0) +
    (f.city != null ? 1 : 0) +
    (f.place != null ? 1 : 0) +
    (f.minDur > 0 ? 1 : 0) +
    (f.q.trim() ? 1 : 0) +
    (f.inView ? 1 : 0)
  );
}

/** Apply filters + sort. `bounds` = [[neLon, neLat], [swLon, swLat]] of the visible map, if known. */
export function applyFilters(events, f, bounds) {
  const q = f.q.trim().toLowerCase();
  let out = events.filter((e) => {
    if (!f.kinds.includes(e.kind)) return false;
    if (f.year != null && new Date(e.t0 * 1000).getFullYear() !== f.year) return false;
    if (f.city != null && cityOf(e) !== f.city) return false;
    if (f.place != null && placeOf(e) !== f.place) return false;
    if (e.duration_min < f.minDur) return false;
    if (q && ![e.place, e.place_ar, e.landmark, e.landmark_ar].some((s) => (s || "").toLowerCase().includes(q))) return false;
    if (f.inView && bounds) {
      const [[neLon, neLat], [swLon, swLat]] = bounds;
      if (e.lon < swLon || e.lon > neLon || e.lat < swLat || e.lat > neLat) return false;
    }
    return true;
  });
  if (f.sort === "new") out = out.slice().sort((a, b) => b.t0 - a.t0);
  else if (f.sort === "old") out = out.slice().sort((a, b) => a.t0 - b.t0);
  else out = out.slice().sort((a, b) => b.duration_min - a.duration_min || b.t0 - a.t0);
  return out;
}

function Chip({ on, label, onPress, icon, count }) {
  const fg = on ? colors.onAccent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 99,
        borderWidth: 1.5,
        borderColor: on ? colors.accent : colors.line,
        backgroundColor: on ? colors.accent : colors.panel2,
      }}
    >
      {icon ? <KindIcon kind={icon} size={15} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
      {count != null ? <Text style={{ color: on ? fg : colors.muted, fontSize: 12.5, opacity: on ? 0.8 : 1 }}>{count}</Text> : null}
    </Pressable>
  );
}

function Label({ children }) {
  return <Text style={{ color: colors.muted, fontSize: 13, marginTop: 16, marginBottom: 8 }}>{children}</Text>;
}

// One line per group, scrolling sideways (with edge arrows) instead of wrapping onto many lines.
const Row = ({ children, selected }) => <ChipScroller selected={selected}>{children}</ChipScroller>;

export function FilterSheet({ visible, onClose, events, f, setF, shown }) {
  const years = useMemo(() => [...new Set(events.map((e) => new Date(e.t0 * 1000).getFullYear()))].sort(), [events]);
  const cities = useMemo(() => {
    const n = {};
    for (const e of events) {
      const c = cityOf(e);
      if (c) n[c] = (n[c] || 0) + 1;
    }
    return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [events]);
  const set = (patch) => setF({ ...f, ...patch });
  const toggleKind = (k) => {
    const has = f.kinds.includes(k);
    const next = has ? f.kinds.filter((x) => x !== k) : [...f.kinds, k];
    set({ kinds: next.length ? next : [k] });
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Filter crossings</Text>
      <Label>Type</Label>
      <Row>
        {Object.entries(KIND_LABEL).map(([k, v]) => (
          <Chip key={k} on={f.kinds.includes(k)} icon={k} label={v[1]} onPress={() => toggleKind(k)} />
        ))}
      </Row>
      {years.length > 1 ? (
        <>
          <Label>Year</Label>
          <Row selected={f.year == null ? 0 : years.indexOf(f.year) + 1}>
            <Chip on={f.year == null} label="All" onPress={() => set({ year: null })} />
            {years.map((y) => (
              <Chip key={y} on={f.year === y} label={String(y)} onPress={() => set({ year: y })} />
            ))}
          </Row>
        </>
      ) : null}
      {cities.length > 1 ? (
        <>
          <Label>City</Label>
          <Row selected={f.city == null ? 0 : cities.findIndex(([c]) => c === f.city) + 1}>
            <Chip on={f.city == null} label="All" onPress={() => set({ city: null })} />
            {cities.map(([c, n]) => (
              <Chip key={c} on={f.city === c} label={c} count={n} onPress={() => set({ city: c })} />
            ))}
          </Row>
        </>
      ) : null}
      {f.place != null ? (
        <>
          <Label>Place</Label>
          <Row>
            <Chip on icon="same_place" label={`${f.place}  ✕`} onPress={() => set({ place: null })} />
          </Row>
        </>
      ) : null}
      <Label>At least</Label>
      <Row selected={DUR_STEPS.indexOf(f.minDur)}>
        {DUR_STEPS.map((m) => (
          <Chip key={m} on={f.minDur === m} label={m ? `${m}+ min` : "Any"} onPress={() => set({ minDur: m })} />
        ))}
      </Row>
      <Label>Place or landmark contains</Label>
      <TextInput
        value={f.q}
        onChangeText={(q) => set({ q })}
        placeholder="e.g. Olaya, airport, mall"
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        style={{ backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 11, color: colors.text }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <Text style={{ color: colors.text, flex: 1 }}>Only crossings in the visible map area</Text>
        <Switch value={f.inView} onValueChange={(v) => set({ inView: v })} trackColor={{ true: colors.accent, false: colors.line }} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
        <Button title="Clear" variant="ghost" onPress={() => setF({ ...freshFilters(), sort: f.sort })} />
        <Button title={`Show ${shown}`} onPress={onClose} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

export function LegendSheet({ visible, onClose, radiusM, windowMin }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 6 }}>What the types mean</Text>
      {Object.entries(KIND_LABEL).map(([k, v]) => (
        <View key={k} style={{ flexDirection: "row", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.badge, alignItems: "center", justifyContent: "center" }}>
            <KindIcon kind={k} size={20} color={KIND_COLOR[k]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{v[1]}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 18 }}>{kindHelp(k, radiusM, windowMin)}</Text>
          </View>
        </View>
      ))}
      <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 8, lineHeight: 18 }}>
        Places are named from a database on your server (place names © GeoNames, CC BY 4.0; street names © OpenStreetMap
        contributors). Times are rounded to 15 minutes and places blurred to about 100 m for privacy. Flights are never matched.
      </Text>
      <Button title="Got it" onPress={onClose} style={{ marginTop: 16 }} />
    </Sheet>
  );
}
