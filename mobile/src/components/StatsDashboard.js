import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";
import KindIcon from "./KindIcon";
import { computeStats, fmtHours, hourLabel, WEEKDAYS, WEEKDAYS_LONG } from "../stats";
import { colors, dateStr, fmtDay, fmtNum, fmtTime, KIND_COLOR, KIND_LABEL, whereText } from "../theme";
import { arrow, chevNext, H, T, TP } from "../i18n";

// Validated on the dark panel (see the data-viz palette check): one hue for every magnitude
// chart, a fixed categorical order for the three crossing types.
const BAR = "#3987e5";

/** Rounded data-end (top), square at the baseline. */
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** One-series column chart. Only the peak is labelled; tap a column to read it. */
function Columns({ series, width, height = 120, tickEvery = 1, tickLabel = (s) => s.short, tip }) {
  const [sel, setSel] = useState(null);
  const top = 18, bottom = 20, plotH = height - top - bottom, n = series.length;
  const slot = width / n, bw = Math.max(2, Math.min(24, slot - 2));
  const max = Math.max(1, ...series.map((s) => s.value));
  const peak = series.reduce((b, s, i) => (s.value > series[b].value ? i : b), 0);
  const shown = sel != null ? sel : series[peak].value ? peak : null;
  return (
    <View>
      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700", minHeight: 18 }}>{sel != null ? tip(series[sel]) : " "}</Text>
      <Svg width={width} height={height}>
        <Line x1={0} x2={width} y1={top + plotH + 0.5} y2={top + plotH + 0.5} stroke={colors.line} strokeWidth={1} />
        {series.map((s, i) => {
          const h = s.value ? Math.max(2, (s.value / max) * plotH) : 0;
          const x = i * slot + (slot - bw) / 2;
          return h ? <Path key={`b${i}`} d={barPath(x, top + plotH - h, bw, h, 4)} fill={BAR} opacity={sel == null || sel === i ? 1 : 0.55} /> : null;
        })}
        {series.map((s, i) =>
          i % tickEvery === 0 ? (
            <SvgText
              key={`t${i}`}
              x={i * slot + slot / 2 < 22 ? 0 : i * slot + slot / 2 > width - 22 ? width : i * slot + slot / 2}
              y={height - 5}
              fontSize={10}
              fill={colors.muted}
              textAnchor={i * slot + slot / 2 < 22 ? "start" : i * slot + slot / 2 > width - 22 ? "end" : "middle"}
            >
              {tickLabel(s, i)}
            </SvgText>
          ) : null
        )}
        {shown != null ? (
          <SvgText
            x={shown * slot + slot / 2 < 16 ? 0 : shown * slot + slot / 2 > width - 16 ? width : shown * slot + slot / 2}
            y={top + plotH - (series[shown].value / max) * plotH - 5}
            fontSize={11}
            fontWeight="700"
            fill={colors.text}
            textAnchor={shown * slot + slot / 2 < 16 ? "start" : shown * slot + slot / 2 > width - 16 ? "end" : "middle"}
          >
            {String(series[shown].value)}
          </SvgText>
        ) : null}
        {/* hit areas: the whole slot, taller than the bar */}
        {series.map((s, i) => (
          <Rect key={`h${i}`} x={i * slot} y={0} width={slot} height={top + plotH} fill="transparent" onPress={() => setSel(sel === i ? null : i)} />
        ))}
      </Svg>
    </View>
  );
}

function Card({ title, sub, children, table }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <View style={{ backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{title}</Text>
          {sub ? <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>{sub}</Text> : null}
        </View>
        {table ? (
          <Pressable onPress={() => setAsTable(!asTable)} hitSlop={10}>
            <Text style={{ color: colors.accent2, fontSize: 12.5 }}>{asTable ? T("Chart") : T("Table")}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ marginTop: 8 }}>
        {asTable && table ? (
          table.rows.map(([a, b], i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <Text style={{ color: colors.text, fontSize: 13 }}>{a}</Text>
              <Text style={{ color: colors.text, fontSize: 13, fontVariant: ["tabular-nums"] }}>{b}</Text>
            </View>
          ))
        ) : (
          children
        )}
      </View>
    </View>
  );
}

function Tile({ label, value, sub, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{ flexBasis: "48%", flexGrow: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12 }}
    >
      <Text style={{ color: colors.muted, fontSize: 12.5 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: "800", marginTop: 2 }}>{value}</Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
    </Pressable>
  );
}

function HBar({ label, n, max, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 6 }}>
      <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
        <View style={{ height: 10, width: `${Math.max(3, (n / max) * 88)}%`, backgroundColor: BAR, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
        <Text style={{ color: colors.muted, fontSize: 12.5 }}>{n}</Text>
      </View>
    </Pressable>
  );
}

/** The summary a result opens on. Callbacks drill into the map & list. */
export default function StatsDashboard({ events, check, onEvent, onPlace, onCity, onKind, onShowMap, onLegend, bottomInset }) {
  const st = useMemo(() => computeStats(events), [events]);
  const { width } = useWindowDimensions();
  const chartW = Math.min(width, 720) - 28 - 30; // screen padding + card padding

  if (!st) {
    return (
      <View style={{ alignItems: "center", padding: 40 }}>
        <Text style={{ color: colors.text, fontSize: 64, fontWeight: "800" }}>0</Text>
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 8 }}>
          {T("Your paths didn't cross within {r} m and {w} min.", { r: check.radius_m, w: check.window_min })}
        </Text>
      </View>
    );
  }

  const kinds = Object.keys(KIND_LABEL).filter((k) => st.kinds[k]);
  const tl = st.timeline;
  const tickEvery = Math.max(1, Math.ceil(tl.length / (st.monthly ? 6 : 8)));
  const peakTl = tl.reduce((b, s) => (s.value > b.value ? s : b), tl[0]);
  const tip = (s) => `${TP(s.value, "{n} crossing", "{n} crossings")} · ${s.label}`;
  const wdShort = WEEKDAYS(), wdLong = WEEKDAYS_LONG();

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: bottomInset + 24, maxWidth: 720, width: "100%", alignSelf: "center" }}>
      <View style={{ paddingHorizontal: 4, paddingTop: 6, paddingBottom: 14 }}>
        <Text style={{ color: colors.text, fontSize: 64, fontWeight: "800", lineHeight: 70 }}>{fmtNum(st.count)}</Text>
        <Text style={{ color: colors.text, fontSize: 16, marginTop: 2 }}>
          {TP(st.count, "time your paths crossed with {who}", "times your paths crossed with {who}", { who: H(check.other) })}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>
          {dateStr(st.first.t0)} – {dateStr(st.last.t0)} · {T("within {r} m and {w} min", { r: check.radius_m, w: check.window_min })}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <Tile
          label={T("Days you crossed")}
          value={fmtNum(st.days)}
          sub={st.days > 1 ? T("busiest: {n} on {date}", { n: st.busiest.n, date: dateStr(st.busiest.day.t0) }) : ""}
          onPress={st.days > 1 ? () => onEvent(st.busiest.day.i) : null}
        />
        <Tile
          label={T("Time together")}
          value={fmtHours(st.minutes)}
          sub={st.minutes >= 2880 ? T("about {n} days, all added up", { n: Math.round(st.minutes / 1440) }) : T("all crossings added up")}
        />
        <Tile
          label={T("Places")}
          value={fmtNum(st.nPlaces)}
          sub={st.nCities > 1 ? T("in {n} cities", { n: st.nCities }) : st.cities.length ? T("in {city}", { city: st.cities[0][0] }) : ""}
        />
        <Tile label={T("Longest")} value={fmtHours(st.longest.duration_min)} sub={`${dateStr(st.longest.t0)} · ${T("tap to see")}`} onPress={() => onEvent(st.longest.i)} />
      </View>

      <Card title={T("By type")}>
        <View style={{ flexDirection: "row", gap: 2, height: 14, borderRadius: 7, overflow: "hidden", marginVertical: 6 }}>
          {kinds.map((k) => (
            <View key={k} style={{ flex: st.kinds[k], minWidth: 4, backgroundColor: KIND_COLOR[k] }} />
          ))}
        </View>
        {kinds.map((k) => (
          <Pressable key={k} onPress={() => onKind(k)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: KIND_COLOR[k] }} />
            <KindIcon kind={k} size={16} color={colors.muted} />
            <Text style={{ color: colors.text, flex: 1 }}>{KIND_LABEL[k][1]}</Text>
            <Text style={{ color: colors.text, fontWeight: "700" }}>{st.kinds[k]}</Text>
            <Text style={{ color: colors.muted, width: 40, textAlign: "right" }}>{Math.round((st.kinds[k] / st.count) * 100)}%</Text>
          </Pressable>
        ))}
        <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 6 }}>
          {T("Tap a type to see just those on the map.")}{" "}
          <Text style={{ color: colors.accent2 }} onPress={onLegend}>
            {T("What do they mean?")}
          </Text>
        </Text>
      </Card>

      {st.places.length ? (
        <Card title={T("Where you cross most")}>
          {st.places.map(([p, n]) => (
            <HBar key={p} label={p} n={n} max={st.places[0][1]} onPress={() => onPlace(p)} />
          ))}
          {st.nPlaces > st.places.length ? (
            <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 4 }}>
              {TP(st.nPlaces - st.places.length, "and {n} more place", "and {n} more places")}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {st.nCities > 1 ? (
        <Card title={T("Cities")}>
          {st.cities.map(([c, n]) => (
            <HBar key={c} label={c} n={n} max={st.cities[0][1]} onPress={() => onCity(c)} />
          ))}
        </Card>
      ) : null}

      <Card
        title={st.monthly ? T("Crossings per month") : T("Crossings per year")}
        sub={peakTl.value ? T("Most in {when}: {n}", { when: peakTl.label, n: peakTl.value }) : ""}
        table={{ rows: tl.map((s) => [s.label, s.value]) }}
      >
        <Columns
          series={tl}
          width={chartW}
          height={130}
          tickEvery={tickEvery}
          tickLabel={(s, i) => (st.monthly && (i === 0 || s.m === 0) ? `${s.short} ${String(s.y).slice(2)}` : s.short)}
          tip={tip}
        />
      </Card>

      <Card title={T("Time of day")} sub={T("Most often around {time}", { time: hourLabel(st.peakHour) })} table={{ rows: st.hours.map((v, h) => [hourLabel(h), v]) }}>
        <Columns series={st.hours.map((v, h) => ({ value: v, short: hourLabel(h), label: hourLabel(h) }))} width={chartW} tickEvery={6} tip={tip} />
      </Card>

      <Card title={T("Day of week")} sub={T("Most often on {day}", { day: wdLong[st.peakDay] })} table={{ rows: st.wdays.map((v, d) => [wdLong[d], v]) }}>
        <Columns series={st.wdays.map((v, d) => ({ value: v, short: wdShort[d], label: wdLong[d] }))} width={chartW} tip={tip} />
      </Card>

      <Card title={T("Highlights")}>
        {[
          [T("Longest"), st.longest, `~${fmtHours(st.longest.duration_min)}`],
          [T("First"), st.first, ""],
          [T("Most recent"), st.last, ""],
        ].map(([label, e, extra]) => (
          <Pressable
            key={label}
            onPress={() => onEvent(e.i)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}
          >
            <Text style={{ color: colors.muted, fontSize: 12.5, width: 84 }}>{label}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }} numberOfLines={2}>
                {whereText(e)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12.5, marginTop: 2 }}>
                {fmtDay(new Date(e.t0 * 1000))} · {fmtTime(new Date(e.t0 * 1000))}
                {extra ? ` · ${extra}` : ""}
              </Text>
            </View>
            <Text style={{ color: colors.muted }}>{chevNext()}</Text>
          </Pressable>
        ))}
      </Card>

      <Pressable onPress={onShowMap} style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 6 }}>
        <Text style={{ color: colors.onAccent, fontWeight: "700", fontSize: 15 }}>{T("See all {n} on the map", { n: st.count })} {arrow()}</Text>
      </Pressable>
    </ScrollView>
  );
}
