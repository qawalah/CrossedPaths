"""Write a timeline back out as GPX, GeoJSON or CSV (only ever the owner's own points)."""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime, timezone
from xml.sax.saxutils import escape


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_gpx(points, name: str = "CrossPaths timeline") -> str:
    rows = "\n".join(f'      <trkpt lat="{p.lat:.7f}" lon="{p.lon:.7f}"><time>{_iso(p.t)}</time></trkpt>' for p in points)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<gpx version="1.1" creator="CrossPaths" xmlns="http://www.topografix.com/GPX/1/1">\n'
            f"  <trk><name>{escape(name)}</name>\n    <trkseg>\n{rows}\n    </trkseg>\n  </trk>\n</gpx>\n")


def to_geojson(points) -> str:
    return json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(p.lon, 7), round(p.lat, 7)]},
         "properties": {"time": _iso(p.t), **({"accuracy": p.acc} if p.acc is not None else {}), "source": p.src}}
        for p in points]})


def to_csv(points) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["time", "latitude", "longitude", "accuracy"])
    for p in points:
        w.writerow([_iso(p.t), f"{p.lat:.7f}", f"{p.lon:.7f}", "" if p.acc is None else round(p.acc, 1)])
    return buf.getvalue()


FORMATS = {
    "gpx": (to_gpx, "application/gpx+xml"),
    "geojson": (to_geojson, "application/geo+json"),
    "csv": (to_csv, "text/csv"),
}
