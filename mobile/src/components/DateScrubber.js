import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PanResponder, Pressable, Text, Vibration, View } from "react-native";
import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";
import { colors } from "../theme";

// A seek bar for picking a day, like YouTube's on a long video. Drag along it to move through
// years; zoom into months and then days by sliding the finger up (and back out by sliding down)
// or by holding still, depending on the `gesture` setting. Bars show how many points each day has.

const DAY = 864e5;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const SCRUB_LEVELS = ["Years", "Months", "Days"];

// Calendar days as whole numbers (UTC is used only as a calendar, so no DST jumps).
const dIdx = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY); // m is 1-12
const toDate = (i) => new Date(i * DAY);
const ymd = (i) => {
  const t = toDate(i);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
};

const PAD = 4; // days of room at either end of the whole-history view
const PULL = 48; // px of vertical slide per zoom level
const EDGE = 26; // px from either edge that keeps scrolling while held
const BUBBLE_H = 62;
const BAR_TOP = 6;
const BAR_H = 56;
const LABEL_H = 22;
const TRACK_H = BAR_TOP + BAR_H + LABEL_H;

function buildData(summary) {
  const first = summary.years[0], last = summary.years[summary.years.length - 1];
  const fm = first.months[0], lm = last.months[last.months.length - 1];
  const minD = dIdx(first.year, fm.month, fm.days[0].day);
  const maxD = dIdx(last.year, lm.month, lm.days[lm.days.length - 1].day);
  const counts = new Float64Array(maxD - minD + 1);
  for (const y of summary.years) for (const m of y.months) for (const d of m.days) counts[dIdx(y.year, m.month, d.day) - minD] = d.count || 1;
  const prefix = new Float64Array(counts.length + 1);
  let maxCount = 1;
  for (let k = 0; k < counts.length; k++) {
    prefix[k + 1] = prefix[k] + counts[k];
    if (counts[k] > maxCount) maxCount = counts[k];
  }
  const countAt = (i) => (i < minD || i > maxD ? 0 : counts[i - minD]);
  const sumRange = (a, b) => {
    a = Math.max(minD, Math.floor(a));
    b = Math.min(maxD + 1, Math.ceil(b));
    return b > a ? prefix[b - minD] - prefix[a - minD] : 0;
  };
  const nearest = (i) => {
    i = Math.min(maxD, Math.max(minD, Math.floor(i)));
    for (let k = 0; k < counts.length; k++) {
      if (countAt(i - k) > 0) return i - k;
      if (countAt(i + k) > 0) return i + k;
    }
    return i;
  };
  const step = (i, dir) => {
    for (let j = i + dir; j >= minD && j <= maxD; j += dir) if (countAt(j) > 0) return j;
    return i;
  };
  const full = maxD - minD + 1 + PAD * 2;
  const widths = [full, Math.min(366, full), Math.min(31, full)];
  return { minD, maxD, maxCount, countAt, sumRange, nearest, step, widths };
}

function buzz(ms) {
  try {
    Vibration.vibrate(ms);
  } catch (_) {}
}

export default function DateScrubber({ summary, selected, onPick, onActiveChange, gesture = "pull", holdMs = 600, onHelp }) {
  const data = useMemo(() => buildData(summary), [summary]);
  const [, redraw] = useReducer((n) => n + 1, 0);
  const [tw, setTw] = useState(0);

  const P = useRef({}); // latest props, read from the gesture handlers
  P.current = { data, onPick, onActiveChange, gesture, holdMs, tw };

  const S = useRef(null);
  if (!S.current || S.current.data !== data) {
    const c = selected ? dIdx(selected.year, selected.month, selected.day) : data.maxD;
    S.current = { data, sel: c + 0.5, selTarget: null, committed: c, level: 0, logW: Math.log(data.widths[0]), w0: 0, frac: 0.5, drag: null, trackLeft: 0, raf: null, last: 0 };
  }
  const s = S.current;

  // window of days on screen; follows the selection and stays inside the history
  function layout() {
    const W = Math.exp(s.logW);
    s.frac = Math.min(0.94, Math.max(0.06, s.frac));
    let w0 = s.sel - s.frac * W;
    const lo = data.minD - PAD, hi = data.maxD + 1 + PAD - W;
    w0 = hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, w0));
    s.w0 = w0;
    s.frac = (s.sel - w0) / W;
  }
  const dOf = (x) => s.w0 + (x / (P.current.tw || 1)) * Math.exp(s.logW);
  const clampSel = (v) => Math.min(data.maxD + 0.999, Math.max(data.minD, v));

  function effLevel(dr) {
    let steps = 0;
    if (P.current.gesture !== "hold") {
      const dy = dr.startY - dr.y;
      steps = dy >= 0 ? Math.floor(dy / PULL) : -Math.floor(-dy / PULL);
    }
    return Math.max(0, Math.min(2, dr.base + dr.bumps + steps));
  }
  function setLevel(lv) {
    if (lv === s.level) return;
    s.level = lv;
    buzz(12);
  }

  function frame() {
    const now = performance.now();
    const dt = Math.min(50, now - (s.last || now)) / 1000;
    s.last = now;
    const { gesture: g, holdMs: hold, tw: TW } = P.current;
    const dr = s.drag;
    if (dr) {
      if (g !== "pull" && s.level < 2 && now - dr.still > hold) {
        dr.bumps = Math.min(2 - dr.base, dr.bumps + 1);
        dr.still = now;
        setLevel(effLevel(dr));
      }
      if (s.level > 0) {
        const px = dr.x - s.trackLeft;
        const dir = px < EDGE ? -1 : px > TW - EDGE ? 1 : 0;
        if (dir) {
          s.sel = clampSel(s.sel + dir * Math.exp(s.logW) * 0.45 * dt);
          dr.still = now;
        }
      }
    } else if (s.selTarget != null) {
      s.sel += (s.selTarget - s.sel) * Math.min(1, dt * 14);
      if (Math.abs(s.selTarget - s.sel) < 0.01) {
        s.sel = s.selTarget;
        s.selTarget = null;
      }
    }
    const target = Math.log(data.widths[s.level]);
    s.logW += (target - s.logW) * Math.min(1, dt * 10);
    if (Math.abs(target - s.logW) < 0.002) s.logW = target;
    layout();
    redraw();
    if (dr || s.selTarget != null || s.logW !== target) s.raf = requestAnimationFrame(frame);
    else s.raf = null;
  }
  function kick() {
    if (s.raf == null) {
      s.last = 0;
      s.raf = requestAnimationFrame(frame);
    }
  }
  useEffect(() => () => s.raf != null && cancelAnimationFrame(s.raf), [s]);

  // follow days picked elsewhere on the screen (e.g. a visit from the search)
  const selKey = selected ? dIdx(selected.year, selected.month, selected.day) : null;
  useEffect(() => {
    if (selKey == null || s.drag || selKey === s.committed) return;
    s.committed = selKey;
    s.selTarget = selKey + 0.5;
    kick();
  }, [selKey]);

  function pick(d) {
    s.committed = d;
    s.selTarget = d + 0.5;
    const [y, m, dd] = ymd(d);
    P.current.onPick && P.current.onPick(y, m, dd);
  }
  function setLevelFromChip(l) {
    s.sel = s.committed + 0.5;
    s.selTarget = null;
    s.frac = 0.5;
    setLevel(l);
    kick();
  }

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const st = S.current;
        st.trackLeft = e.nativeEvent.pageX - x;
        st.sel = Math.min(st.data.maxD + 0.999, Math.max(st.data.minD, st.w0 + (x / (P.current.tw || 1)) * Math.exp(st.logW)));
        st.selTarget = null;
        st.frac = x / (P.current.tw || 1);
        const px = e.nativeEvent.pageX, py = e.nativeEvent.pageY;
        st.drag = { x: px, y: py, startY: py, base: st.level, bumps: 0, still: performance.now(), sx: px, sy: py };
        P.current.onActiveChange && P.current.onActiveChange(true);
        layoutRef.current();
        kickRef.current();
      },
      onPanResponderMove: (e, g) => {
        const st = S.current, dr = st.drag;
        if (!dr) return;
        const TW = P.current.tw || 1;
        const dx = g.moveX - dr.x;
        dr.x = g.moveX;
        dr.y = g.moveY;
        if (Math.hypot(g.moveX - dr.sx, g.moveY - dr.sy) > 6) {
          dr.still = performance.now();
          dr.sx = g.moveX;
          dr.sy = g.moveY;
        }
        const px = g.moveX - st.trackLeft;
        if (st.level === 0 || (px >= EDGE && px <= TW - EDGE)) {
          st.sel = Math.min(st.data.maxD + 0.999, Math.max(st.data.minD, st.sel + (dx * Math.exp(st.logW)) / TW));
          st.frac += dx / TW;
        }
        setLevelRef.current(effLevelRef.current(dr));
      },
      onPanResponderRelease: () => endRef.current(),
      onPanResponderTerminate: () => endRef.current(),
    })
  ).current;
  // the responder is made once; these refs let it call the current closures
  const layoutRef = useRef(layout), kickRef = useRef(kick), setLevelRef = useRef(setLevel), effLevelRef = useRef(effLevel), endRef = useRef(null);
  layoutRef.current = layout;
  kickRef.current = kick;
  setLevelRef.current = setLevel;
  effLevelRef.current = effLevel;
  endRef.current = () => {
    if (!s.drag) return;
    s.drag = null;
    P.current.onActiveChange && P.current.onActiveChange(false);
    buzz(8);
    pick(data.nearest(s.sel));
    kick();
  };

  if (s.raf == null && !s.drag) layout(); // first render and size changes

  // ---------- drawing ----------
  const TW = tw;
  const W = Math.exp(s.logW), ppd = TW / W;
  const xOf = (d) => ((d - s.w0) / W) * TW;
  const barBot = BAR_TOP + BAR_H;
  const lmax = Math.log1p(data.maxCount);
  const dr = s.drag;
  const selDay = Math.floor(s.sel);
  const [sy, sm, sd] = ymd(selDay);

  const ticks = [];
  if (TW > 0) {
    const d0 = Math.floor(s.w0), d1 = Math.ceil(s.w0 + W);
    const y0 = toDate(d0).getUTCFullYear(), y1 = toDate(d1).getUTCFullYear();
    const tick = (d, major, label, strong) => {
      const x = xOf(d);
      if (x < -40 || x > TW + 40) return;
      ticks.push({ x: Math.round(x), major, label, strong });
    };
    if (ppd < 0.9) {
      const every = ppd * 365 < 34 ? 2 : 1;
      for (let y = y0; y <= y1 + 1; y++) tick(dIdx(y, 1, 1), true, y % every === 0 ? String(y) : "", true);
    } else if (ppd < 9) {
      const mw = ppd * 30, every = mw < 26 ? 3 : 1;
      for (let y = y0; y <= y1; y++)
        for (let m = 0; m < 12; m++) {
          const lbl = m === 0 ? String(y) : m % every === 0 && mw >= 18 ? MON[m] : "";
          tick(dIdx(y, m + 1, 1), m === 0, lbl, m === 0);
        }
    } else {
      const every = ppd < 14 ? 5 : ppd < 22 ? 2 : 1;
      for (let d = d0; d <= d1; d++) {
        const t = toDate(d), dd = t.getUTCDate();
        if (dd === 1) tick(d, true, MON[t.getUTCMonth()] + (t.getUTCMonth() === 0 ? " " + t.getUTCFullYear() : ""), true);
        else if (dd % every === 0 && ppd * every > 14) tick(d, false, String(dd), false);
      }
    }
  }

  const bars = [];
  if (TW > 0) {
    const perDay = ppd >= 4;
    const bw = perDay ? ppd : 3;
    const days = bw / ppd;
    const gap = perDay ? Math.min(3, ppd * 0.22) : 1;
    let hA, hB;
    if (dr) {
      if (s.level === 0) [hA, hB] = [dIdx(sy, 1, 1), dIdx(sy + 1, 1, 1)];
      else if (s.level === 1) [hA, hB] = [dIdx(sy, sm, 1), dIdx(sy, sm + 1, 1)];
      else [hA, hB] = [selDay, selDay + 1];
    } else [hA, hB] = [s.committed, s.committed + 1];
    const start = perDay ? Math.floor(s.w0) : Math.floor(s.w0 / days) * days;
    for (let d = start; d < s.w0 + W; d += days) {
      const x = xOf(d), w = Math.max(1, bw - gap);
      const mean = data.sumRange(d, d + days) / days;
      const inData = d + days > data.minD && d < data.maxD + 1;
      const hl = d < hB && d + days > hA;
      if (mean <= 0) {
        if (inData) bars.push({ x: x + gap / 2, y: barBot - 2, w, h: 2, fill: colors.line, o: 1 });
        continue;
      }
      const h = Math.max(3, (Math.log1p(mean) / lmax) * BAR_H);
      bars.push({ x: x + gap / 2, y: barBot - h, w, h, fill: hl ? colors.accent : colors.accent2, o: hl ? 1 : dr ? 0.38 : 0.55 });
    }
  }

  const sx = xOf(s.sel);
  const holdP = dr && gesture !== "pull" && s.level < 2 ? (performance.now() - dr.still - 120) / (holdMs - 120) : 0;
  const edgeDir = dr && s.level > 0 ? (dr.x - s.trackLeft < EDGE ? -1 : dr.x - s.trackLeft > TW - EDGE ? 1 : 0) : 0;

  // bubble text
  let bBig = "", bSmall = "";
  if (dr) {
    const n = data.countAt(selDay);
    if (s.level === 0) {
      const tot = data.sumRange(dIdx(sy, 1, 1), dIdx(sy + 1, 1, 1));
      bBig = String(sy);
      bSmall = tot ? `${Math.round(tot).toLocaleString()} points` : "No data this year";
    } else if (s.level === 1) {
      const tot = data.sumRange(dIdx(sy, sm, 1), dIdx(sy, sm + 1, 1));
      bBig = `${MONL[sm - 1]} ${sy}`;
      bSmall = tot ? `${Math.round(tot).toLocaleString()} points` : "No data this month";
    } else {
      bBig = `${WD[toDate(selDay).getUTCDay()]} ${sd} ${MON[sm - 1]}`;
      const nd = data.nearest(selDay);
      const [, nm, ndd] = ymd(nd);
      bSmall = n ? `${n.toLocaleString()} points` : `No data · goes to ${ndd} ${MON[nm - 1]}`;
    }
  }

  const zoomIn = gesture === "hold" ? "hold still" : gesture === "both" ? "hold still or slide up" : "slide up";
  const hint = !dr
    ? `Drag to pick a day · ${zoomIn} to zoom in`
    : s.level === 0
      ? `Moving by year · ${zoomIn} for months`
      : s.level === 1
        ? `Moving by month · ${zoomIn} for days`
        : gesture === "hold"
          ? "Moving by day · let go to open it"
          : "Moving by day · slide down to zoom out";

  const [cy, cm] = dr ? [sy, sm] : ymd(s.committed); // chips follow the finger while scrubbing
  const crumbs = [
    [0, "All"],
    [1, String(cy)],
    [2, MON[cm - 1]],
  ];

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 6 }}>
        {crumbs.map(([l, label]) => {
          const on = s.level === l;
          return (
            <Pressable
              key={l}
              onPress={() => setLevelFromChip(l)}
              accessibilityLabel={`Show ${SCRUB_LEVELS[l].toLowerCase()}`}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.accent : colors.panel2 }}
            >
              <Text style={{ color: on ? colors.onAccent : colors.muted, fontWeight: "700", fontSize: 12.5 }}>{label}</Text>
            </Pressable>
          );
        })}
        <View style={{ flex: 1 }} />
        {onHelp ? (
          <Pressable onPress={onHelp} hitSlop={8} accessibilityLabel="How the date bar works" style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.muted, fontWeight: "800" }}>?</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ height: BUBBLE_H + 6 }} />
      <View
        onLayout={(e) => {
          setTw(e.nativeEvent.layout.width);
          kick();
        }}
        style={{ height: TRACK_H }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Day"
        accessibilityValue={{ text: (() => { const [y, m, d] = ymd(s.committed); return `${d} ${MONL[m - 1]} ${y}`; })() }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          pick(data.step(s.committed, e.nativeEvent.actionName === "increment" ? 1 : -1));
          kick();
        }}
        {...responder.panHandlers}
      >
        {TW > 0 ? (
          <Svg width={TW} height={TRACK_H} pointerEvents="none">
            {ticks.map((t, i) => (
              <Rect key={"t" + i} x={t.x} y={BAR_TOP} width={1} height={BAR_H + (t.major ? 6 : 2)} fill={t.major ? colors.line : colors.panel2} />
            ))}
            {ticks.map((t, i) =>
              t.label ? (
                <SvgText key={"l" + i} x={t.x + 3} y={barBot + 18} fontSize={11} fontWeight="600" fill={t.strong ? colors.text : colors.muted}>
                  {t.label}
                </SvgText>
              ) : null
            )}
            {bars.map((b, i) => (
              <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(2.5, b.w / 2)} fill={b.fill} opacity={b.o} />
            ))}
            <Rect x={Math.round(sx) - 1} y={BAR_TOP - 4} width={2} height={BAR_H + 8} fill={colors.accent} />
            <Circle cx={sx} cy={barBot + 2} r={dr ? 8 : 6} fill={colors.accent} />
            <Circle cx={sx} cy={barBot + 2} r={dr ? 3 : 2.5} fill={colors.panel} />
            {holdP > 0 ? (
              <Circle
                cx={sx}
                cy={barBot + 2}
                r={13}
                stroke={colors.accent}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={[Math.min(1, holdP) * 2 * Math.PI * 13, 2 * Math.PI * 13]}
                transform={`rotate(-90 ${sx} ${barBot + 2})`}
              />
            ) : null}
            {edgeDir ? (
              <Rect x={edgeDir < 0 ? 0 : TW - 4} y={BAR_TOP} width={4} height={BAR_H} rx={2} fill={colors.accent} opacity={0.8} />
            ) : null}
          </Svg>
        ) : null}

        {dr && TW > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: TRACK_H - 2,
              left: Math.min(TW - 150, Math.max(0, sx - 75)),
              width: 150,
              height: BUBBLE_H,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: colors.text,
              elevation: 6,
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.8 }}>{SCRUB_LEVELS[s.level].toUpperCase()}</Text>
            <Text style={{ color: colors.bg, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
              {bBig}
            </Text>
            <Text style={{ color: colors.line, fontSize: 11 }} numberOfLines={1}>
              {bSmall}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: dr ? colors.accent : colors.muted, fontWeight: dr ? "600" : "400", fontSize: 12, paddingHorizontal: 12, marginTop: 2 }}>{hint}</Text>
    </View>
  );
}
