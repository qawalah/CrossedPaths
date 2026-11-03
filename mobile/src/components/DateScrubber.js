import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PanResponder, Pressable, Vibration, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { onLanguage, pl, RTL, t } from "../i18n";
import { colors, UI_LOCALE } from "../theme";
import { Text, fontFor } from "./AppText";

// A seek bar for picking a day, like YouTube's on a long video. Drag along it to move through
// years; zoom into months and then days by sliding the finger up (and back out by sliding down)
// or by holding still, depending on the `gesture` setting. Bars show how many points each day has.
// Follows the agreed design (artifact "Timeline Date Scrubber"): ‹ › step between days with points,
// the bubble sits beside the finger and rises with it, a Years / Months / Days stepper under the
// bar fills as the next zoom gets close, and a dashed marker shows the day you'll open on release.

const DAY = 864e5;
let MON;
onLanguage(() => {
  MON = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(UI_LOCALE, { month: "short" }));
});
let MONL;
onLanguage(() => {
  MONL = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(UI_LOCALE, { month: "long" }));
});
let WD;
onLanguage(() => {
  WD = Array.from({ length: 7 }, (_, i) => new Date(2000, 0, 2 + i).toLocaleDateString(UI_LOCALE, { weekday: "short" }));
}); // 2 Jan 2000 was a Sunday
export let SCRUB_LEVELS;
onLanguage(() => {
  SCRUB_LEVELS = [t("Years"), t("Months"), t("Days")];
});

// Calendar days as whole numbers (UTC is used only as a calendar, so no DST jumps).
const dIdx = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY); // m is 1-12
const toDate = (i) => new Date(i * DAY);
const ymd = (i) => {
  const dt = toDate(i);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
};

const PAD = 4; // days of room at either end of the whole-history view
const PULL = 48; // px of vertical slide per zoom level
const EDGE = 26; // px from either edge that keeps scrolling while held
const BUBBLE_H = 78;
const BUBBLE_W = 168;
const GAP = 40; // px between the fingertip and the bubble
const ABOVE = 58; // room above the bar the bubble may rise into
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
    S.current = { data, sel: c + 0.5, selTarget: null, committed: c, level: 0, logW: Math.log(data.widths[0]), w0: 0, frac: 0.5, drag: null, trackLeft: 0, trackTop: 0, raf: null, last: 0, pop: null };
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
    const up = lv > s.level;
    s.level = lv;
    buzz(up ? 16 : 12);
    s.pop = { up, until: performance.now() + 1000 }; // the "↑ February 2023" announcement
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
    if (dr || s.selTarget != null || s.logW !== target || (s.pop && now < s.pop.until)) s.raf = requestAnimationFrame(frame);
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
        st.trackTop = e.nativeEvent.pageY - e.nativeEvent.locationY;
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
        const dt = toDate(d), dd = dt.getUTCDate();
        if (dd === 1) tick(d, true, MON[dt.getUTCMonth()] + (dt.getUTCMonth() === 0 ? " " + dt.getUTCFullYear() : ""), true);
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
  const now = performance.now();
  const edgeDir = dr && s.level > 0 ? (dr.x - s.trackLeft < EDGE ? -1 : dr.x - s.trackLeft > TW - EDGE ? 1 : 0) : 0;

  // how close the finger is to the next zoom step, 0-1 (slide distance or hold time, whichever is further)
  let zoomP = 0;
  if (dr && s.level < 2) {
    if (gesture !== "hold") zoomP = Math.max(zoomP, (dr.startY - dr.y - (s.level - dr.base - dr.bumps) * PULL) / PULL);
    if (gesture !== "pull") zoomP = Math.max(zoomP, (now - dr.still - 120) / (holdMs - 120));
    zoomP = Math.min(1, Math.max(0, zoomP));
  }

  // the day you'll open on release, when the finger is on a day with no points
  const land = dr ? data.nearest(s.sel) : null;
  const landX = land != null && land !== selDay ? Math.min(TW - 6, Math.max(6, xOf(land + 0.5))) : null;

  const fullDay = (d) => {
    const [y, m, dd] = ymd(d);
    return `${WD[toDate(d).getUTCDay()]} ${dd} ${MON[m - 1]} ${y}`;
  };
  // the year / month / day under the finger (or the picked day at rest), as words
  const unitLabel = (l, d, long) => {
    const [y, m, dd] = ymd(d);
    if (l === 0) return String(y);
    if (l === 1) return long ? `${MONL[m - 1]} ${y}` : MONL[m - 1];
    return `${WD[toDate(d).getUTCDay()]} ${dd}` + (long ? ` ${MON[m - 1]}` : "");
  };

  // bubble text
  let bBig = "", bSmall = "", bLand = "";
  if (dr) {
    const n = data.countAt(selDay);
    if (s.level === 0) {
      const tot = data.sumRange(dIdx(sy, 1, 1), dIdx(sy + 1, 1, 1));
      bBig = String(sy);
      bSmall = tot ? pl("points", Math.round(tot)) : t("No data this year");
    } else if (s.level === 1) {
      const tot = data.sumRange(dIdx(sy, sm, 1), dIdx(sy, sm + 1, 1));
      bBig = `${MONL[sm - 1]} ${sy}`;
      bSmall = tot ? pl("points", Math.round(tot)) : t("No data this month");
    } else {
      bBig = `${WD[toDate(selDay).getUTCDay()]} ${sd} ${MON[sm - 1]}`;
      bSmall = n ? pl("points", n) : t("No points this day");
    }
    bLand = land === selDay ? t("Opens {day}", { day: fullDay(land) }) : t("No points · opens {day}", { day: fullDay(land) });
  }

  // The bubble sits beside the finger, never under it: to its left when it fits (a right thumb covers
  // the right), otherwise to its right. It stays above the bar and rises with the finger when it slides up.
  let bubbleLeft = 0, bubbleTop = 0;
  if (dr) {
    const fx = dr.x - s.trackLeft, fy = dr.y - s.trackTop;
    bubbleLeft = fx - GAP - BUBBLE_W >= 0 ? fx - GAP - BUBBLE_W : Math.min(TW - BUBBLE_W, fx + GAP);
    // (no higher than the top of this control: the card around it clips)
    bubbleTop = Math.max(-ABOVE - 44, Math.min(BAR_TOP - BUBBLE_H + 6, fy - BUBBLE_H / 2));
  }
  // "↑ February 2023" when a zoom step happens, fading out over a second
  let popO = 0, popY = 0, popText = "";
  if (s.pop && now < s.pop.until) {
    const k = 1 - (s.pop.until - now) / 1000; // 0 → 1
    popO = k < 0.15 ? k / 0.15 : k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
    popY = -10 * k;
    popText = (s.pop.up ? "↑ " : "↓ ") + unitLabel(s.level, selDay, true);
  }

  const zoomIn = gesture === "hold" ? t("hold still") : gesture === "both" ? t("hold still or slide up") : t("slide up");
  const hint = !dr
    ? t("Drag to pick a day · {how} to zoom in", { how: zoomIn })
    : s.level === 0
      ? t("Moving by year · {how} for months", { how: zoomIn })
      : s.level === 1
        ? t("Moving by month · {how} for days", { how: zoomIn })
        : gesture === "hold"
          ? t("Moving by day · let go to open it")
          : t("Moving by day · slide down to zoom out");

  const committedN = data.countAt(s.committed);
  const prevD = data.step(s.committed, -1), nextD = data.step(s.committed, 1);
  function stepDay(dir) {
    const d = data.step(s.committed, dir);
    if (d === s.committed) return;
    // across ten years a one-day step is invisible: zoom to days first
    if (s.level === 0 && Math.abs(xOf(d + 0.5) - xOf(s.committed + 0.5)) < 2) setLevel(2);
    buzz(8);
    pick(d);
    kick();
  }
  function zoomTo(l) {
    s.sel = s.committed + 0.5;
    s.selTarget = null;
    s.frac = 0.5;
    setLevel(l);
    kick();
  }
  const stepperDay = dr ? selDay : s.committed;

  return (
    // The bar is a time axis measured from the left edge: keep it left-to-right in Arabic too.
    <View style={{ direction: "ltr" }}>
      {/* the picked day, with ‹ › to step between days that have points */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
        <StepBtn label="‹" onPress={() => stepDay(-1)} disabled={prevD === s.committed} a11y={t("Previous day with points")} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
            {fullDay(s.committed)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{committedN ? pl("points", committedN) : t("No points recorded")}</Text>
        </View>
        <StepBtn label="›" onPress={() => stepDay(1)} disabled={nextD === s.committed} a11y={t("Next day with points")} />
      </View>

      <View style={{ height: ABOVE }} />
      <View
        onLayout={(e) => {
          setTw(e.nativeEvent.layout.width);
          kick();
        }}
        style={{ height: TRACK_H, zIndex: 2 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t("Day")}
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
            {ticks.map((tk, i) => (
              <Rect key={"t" + i} x={tk.x} y={BAR_TOP} width={1} height={BAR_H + (tk.major ? 6 : 2)} fill={tk.major ? colors.line : colors.panel2} />
            ))}
            {ticks.map((tk, i) =>
              tk.label ? (
                <SvgText key={"l" + i} x={tk.x + 3} y={barBot + 18} fontSize={11} fontFamily={fontFor(600)} fill={tk.strong ? colors.text : colors.muted}>
                  {tk.label}
                </SvgText>
              ) : null
            )}
            {bars.map((b, i) => (
              <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(2.5, b.w / 2)} fill={b.fill} opacity={b.o} />
            ))}
            <Rect x={Math.round(sx) - 1} y={BAR_TOP - 4} width={2} height={BAR_H + 8} fill={colors.accent} />
            <Circle cx={sx} cy={barBot + 2} r={dr ? 8 : 6} fill={colors.accent} />
            <Circle cx={sx} cy={barBot + 2} r={dr ? 3 : 2.5} fill={colors.panel} />
            {landX != null ? (
              <>
                <Line x1={landX} y1={BAR_TOP} x2={landX} y2={barBot} stroke={colors.accent} strokeWidth={2} strokeDasharray={[3, 3]} />
                <Circle cx={landX} cy={barBot + 2} r={6} fill={colors.panel} stroke={colors.accent} strokeWidth={2} />
                {Math.abs(landX - sx) > 14 ? (
                  (() => {
                    const ay = BAR_TOP + 10, dir = landX > sx ? 1 : -1;
                    return (
                      <>
                        <Path d={`M${sx + dir * 4} ${ay} Q${(sx + landX) / 2} ${ay - 8} ${landX - dir * 5} ${ay}`} stroke={colors.accent} strokeWidth={2} fill="none" />
                        <Path d={`M${landX - dir * 5} ${ay} L${landX - dir * 11} ${ay - 5} L${landX - dir * 10} ${ay + 3} Z`} fill={colors.accent} />
                      </>
                    );
                  })()
                ) : null}
              </>
            ) : null}
            {zoomP > 0.02 ? (
              <Circle
                cx={sx}
                cy={barBot + 2}
                r={13}
                stroke={colors.accent}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={[zoomP * 2 * Math.PI * 13, 2 * Math.PI * 13]}
                transform={`rotate(-90 ${sx} ${barBot + 2})`}
              />
            ) : null}
            {edgeDir ? (
              <Path
                d={edgeDir < 0 ? `M8 ${BAR_TOP + BAR_H / 2} L16 ${BAR_TOP + BAR_H / 2 - 8} L16 ${BAR_TOP + BAR_H / 2 + 8} Z` : `M${TW - 8} ${BAR_TOP + BAR_H / 2} L${TW - 16} ${BAR_TOP + BAR_H / 2 - 8} L${TW - 16} ${BAR_TOP + BAR_H / 2 + 8} Z`}
                fill={colors.accent}
                opacity={0.9}
              />
            ) : null}
          </Svg>
        ) : null}

        {dr && TW > 0 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: bubbleTop,
              left: bubbleLeft,
              width: BUBBLE_W,
              minHeight: BUBBLE_H,
              paddingVertical: 7,
              paddingHorizontal: 10,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: colors.text,
              elevation: 6,
            }}
          >
            {popO > 0 ? (
              <View style={{ position: "absolute", bottom: BUBBLE_H + 4, alignSelf: "center", opacity: popO, transform: [{ translateY: popY }], backgroundColor: colors.accent, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ color: colors.onAccent, fontSize: 12, fontWeight: "800" }} numberOfLines={1}>
                  {popText}
                </Text>
              </View>
            ) : null}
            <Text style={{ color: colors.accent, fontSize: 9.5, fontWeight: "800", letterSpacing: RTL ? 0 : 0.8 }}>{SCRUB_LEVELS[s.level].toLocaleUpperCase()}</Text>
            <Text style={{ color: colors.bg, fontSize: 16, fontWeight: "800" }} numberOfLines={1}>
              {bBig}
            </Text>
            <Text style={{ color: colors.line, fontSize: 11 }} numberOfLines={1}>
              {bSmall}
            </Text>
            <View style={{ alignSelf: "stretch", borderTopWidth: 1, borderTopColor: colors.muted, marginTop: 4, paddingTop: 4 }}>
              <Text style={{ color: land === selDay ? colors.bg : colors.accent, fontSize: 11, fontWeight: "700", textAlign: "center" }} numberOfLines={2}>
                {bLand}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Years ── Months ── Days: lights up as you zoom, the line fills as the next step gets close; tap to jump */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 2 }}>
        {[0, 1, 2].map((l) => (
          <React.Fragment key={l}>
            <Pressable onPress={() => zoomTo(l)} hitSlop={6} accessibilityRole="button" accessibilityLabel={SCRUB_LEVELS[l]} accessibilityState={{ selected: s.level === l }}>
              <Text style={{ color: l <= s.level ? colors.text : colors.muted, opacity: l <= s.level ? 1 : 0.55, fontSize: 14, fontWeight: "800", transform: [{ scale: l === s.level ? 1.06 : 1 }] }}>
                {unitLabel(l, stepperDay)}
              </Text>
            </Pressable>
            {l < 2 ? (
              <View style={{ flex: 1, minWidth: 14, height: 2, marginHorizontal: 8, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden" }}>
                <View style={{ height: 2, width: `${l < s.level ? 100 : l === s.level ? zoomP * 100 : 0}%`, backgroundColor: l < s.level ? colors.text : colors.accent }} />
              </View>
            ) : null}
          </React.Fragment>
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, marginTop: 6, gap: 8 }}>
        <Text style={{ flex: 1, color: dr ? colors.accent : colors.muted, fontWeight: dr ? "600" : "400", fontSize: 12 }}>{hint}</Text>
        {onHelp ? (
          <Pressable onPress={onHelp} hitSlop={8} accessibilityLabel={t("How the date bar works")} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.muted, fontWeight: "800" }}>?</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function StepBtn({ label, onPress, disabled, a11y }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: pressed ? colors.line : colors.panel2,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Text style={{ color: colors.text, fontSize: 20, lineHeight: 22, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
