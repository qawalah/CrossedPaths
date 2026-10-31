"""Heuristic authenticity scoring for an uploaded Timeline file.

An exported JSON is unsigned, so authenticity can't be *proven*. This produces a trust
score (100 = looks organic) plus human-readable reasons. Use it to label results and
throttle suspicious accounts - not as a hard accept/reject gate.

VPNs do not appear here: Timeline is built from GPS / Wi-Fi / cell / motion sensors,
not the IP address, so there is nothing VPN-related to detect in the file.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .geo import haversine_m

RAW_SRC = ("record", "path")


@dataclass
class TrustReport:
    score: int
    level: str                     # high | medium | low | insufficient
    reasons: list[str] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


def _local_xy(lat, lon):
    lat0 = np.radians(lat[0])
    x = np.radians(lon - lon[0]) * np.cos(lat0) * 6371008.8
    y = np.radians(lat - lat[0]) * 6371008.8
    return x, y


def assess(points) -> TrustReport:
    if len(points) < 50:
        return TrustReport(50, "insufficient", ["Too little data to judge"], {"points": len(points)})

    pts = sorted(points, key=lambda q: q.t)
    t = np.array([q.t for q in pts]); lat = np.array([q.lat for q in pts]); lon = np.array([q.lon for q in pts])
    dt = np.diff(t)
    d = haversine_m(lat[:-1], lon[:-1], lat[1:], lon[1:])
    score, reasons, metrics = 100, [], {}

    # 1. Teleporting: > 1 km in under 10 minutes at > 350 m/s (faster than any airliner).
    v = np.divide(d, dt, out=np.zeros_like(d), where=dt > 0)
    teleports = int(((v > 350) & (d > 1000) & (dt < 600)).sum())
    metrics["teleports"] = teleports
    if teleports:
        score -= min(30, 6 * teleports)
        reasons.append(f"{teleports} physically impossible jump(s)")

    raw = [q for q in pts if q.src in RAW_SRC]
    metrics["raw_points"] = len(raw)
    if len(raw) >= 200:
        rt = np.array([q.t for q in raw]); rlat = np.array([q.lat for q in raw]); rlon = np.array([q.lon for q in raw])
        rdt = np.diff(rt)
        rd = haversine_m(rlat[:-1], rlon[:-1], rlat[1:], rlon[1:])

        # 2. Metronomic timestamps.
        gaps = rdt[(rdt >= 1) & (rdt <= 600)]
        if len(gaps) >= 300:
            cv = float(gaps.std() / gaps.mean())
            metrics["interval_cv"] = round(cv, 3)
            if cv < 0.1:
                score -= 20
                reasons.append("Location fixes arrive at near-perfectly regular intervals")

        # 3. Duplicate timestamps.
        dup = float((rdt == 0).mean())
        metrics["dup_ts_ratio"] = round(dup, 3)
        if dup > 0.05:
            score -= 10
            reasons.append("Many duplicate timestamps")

        # 4. Coordinates rounded to <= 5 decimals (real fixes carry 7).
        rounded = (np.abs(rlat * 1e5 - np.round(rlat * 1e5)) < 1e-3) & (np.abs(rlon * 1e5 - np.round(rlon * 1e5)) < 1e-3)
        metrics["low_precision_ratio"] = round(float(rounded.mean()), 3)
        if rounded.mean() > 0.5:
            score -= 15
            reasons.append("Coordinates look artificially rounded")

        # 5. Same accuracy value on (almost) every fix.
        acc = np.array([q.acc for q in raw if q.acc is not None], dtype=float)
        if len(acc) >= 200:
            _, counts = np.unique(acc, return_counts=True)
            top = float(counts.max() / len(acc))
            metrics["top_accuracy_share"] = round(top, 3)
            if top > 0.9:
                score -= 15
                reasons.append("Identical accuracy value on nearly every fix")

        # 6. Ruler-straight runs (>= 1.5 km, every point within 2 m of the chord).
        w, straight = 15, 0
        for i in range(0, len(raw) - w, w):
            x, y = _local_xy(rlat[i:i + w + 1], rlon[i:i + w + 1])
            L = float(np.hypot(x[-1], y[-1]))
            if L >= 1500:
                dev = np.abs(x * y[-1] - y * x[-1]) / L
                if dev.max() < 2.0:
                    straight += 1
        metrics["straight_runs"] = straight
        if straight:
            score -= min(12, 4 * straight)
            reasons.append(f"{straight} unnaturally straight long stretch(es)")

        # 7. Constant-speed runs (mock-GPS route playback).
        with np.errstate(divide="ignore", invalid="ignore"):
            rv = np.where(rdt > 0, rd / rdt, np.nan)
        w, const = 30, 0
        for i in range(0, len(rv) - w, w):
            seg = rv[i:i + w]
            if np.isfinite(seg).all() and seg.mean() > 2 and seg.std() / seg.mean() < 0.02:
                const += 1
        metrics["constant_speed_runs"] = const
        if const:
            score -= min(15, 5 * const)
            reasons.append(f"{const} stretch(es) at an unnaturally constant speed")

    score = max(0, score)
    level = "high" if score >= 80 else "medium" if score >= 50 else "low"
    if not reasons:
        reasons.append("No anomalies detected (not a guarantee of authenticity)")
    return TrustReport(score, level, reasons, metrics)
