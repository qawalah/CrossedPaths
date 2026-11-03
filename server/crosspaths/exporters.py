"""Write a timeline back out as GPX, GeoJSON or CSV (only ever the owner's own points)."""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from xml.sax.saxutils import escape


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


EST_NAME = "Estimated car routes (CrossPaths, not recorded)"


def _trkpts(points, indent="      "):
    return "\n".join(f'{indent}<trkpt lat="{p.lat:.7f}" lon="{p.lon:.7f}"><time>{_iso(p.t)}</time></trkpt>' for p in points)


def to_gpx(points, name: str = "CrossPaths timeline", estimated=None) -> str:
    """`estimated` (lists of points, one per filled gap) goes in its own track, one segment per gap,
    so a map app shows it apart from what was recorded. With no recorded points, only that track."""
    tracks = []
    if points:
        tracks.append(f"  <trk><name>{escape(name)}</name>\n    <trkseg>\n{_trkpts(points)}\n    </trkseg>\n  </trk>")
    if estimated:
        segs = "\n".join(f"    <trkseg>\n{_trkpts(g)}\n    </trkseg>" for g in estimated)
        tracks.append(f"  <trk><name>{escape(EST_NAME)}</name><type>estimated</type>\n{segs}\n  </trk>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<gpx version="1.1" creator="CrossPaths" xmlns="http://www.topografix.com/GPX/1/1">\n'
            + "\n".join(tracks) + "\n</gpx>\n")


def to_geojson(points, estimated=None) -> str:
    feats = [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p.lon, 7), round(p.lat, 7)]},
              "properties": {"time": _iso(p.t), **({"accuracy": p.acc} if p.acc is not None else {}), "source": p.src}}
             for p in points]
    for i, g in enumerate(estimated or [], 1):   # one line per filled gap, with the time of each vertex
        feats.append({"type": "Feature",
                      "geometry": {"type": "LineString", "coordinates": [[round(p.lon, 7), round(p.lat, 7)] for p in g]},
                      "properties": {"estimated": True, "gap": i, "mode": "car", "name": EST_NAME,
                                     "times": [_iso(p.t) for p in g]}})
    return json.dumps({"type": "FeatureCollection", "features": feats})


def to_csv(points, estimated=None) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    if estimated is None:
        w.writerow(["time", "latitude", "longitude", "accuracy"])
        for p in points:
            w.writerow([_iso(p.t), f"{p.lat:.7f}", f"{p.lon:.7f}", "" if p.acc is None else round(p.acc, 1)])
        return buf.getvalue()
    rows = [(p, "") for p in points] + [(p, i) for i, g in enumerate(estimated, 1) for p in g[1:-1]]
    w.writerow(["time", "latitude", "longitude", "accuracy", "estimated", "gap"])
    for p, gap in sorted(rows, key=lambda r: r[0].t):
        w.writerow([_iso(p.t), f"{p.lat:.7f}", f"{p.lon:.7f}", "" if p.acc is None else round(p.acc, 1),
                    "1" if gap != "" else "0", gap])
    return buf.getvalue()


FORMATS = {
    "gpx": (to_gpx, "application/gpx+xml"),
    "geojson": (to_geojson, "application/geo+json"),
    "csv": (to_csv, "text/csv"),
}
