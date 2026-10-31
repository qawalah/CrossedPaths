// Small geometry helpers shared by the map screens. Track points are [t, lat, lon] arrays;
// map coordinates are GeoJSON [lon, lat].

/** A GeoJSON-ready ring of [lon, lat] points approximating a circle of radius `r` (metres)
 * around (lat, lon). Mirrors the server's web UI (server/static/index.html's circlePoly). */
export function circlePolygon(lat, lon, r, steps = 48) {
  const pts = [];
  const dLat = r / 111320;
  const dLon = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    pts.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return pts;
}

/** {ne, sw} of a list of [lon, lat], grown to at least `minSpanDeg` so a single spot doesn't
 * zoom the camera to street-level-and-beyond. Returns null for an empty list. */
export function boundsOf(coords, minSpanDeg = 0.004) {
  if (!coords.length) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const growLon = Math.max(0, minSpanDeg - (maxLon - minLon)) / 2;
  const growLat = Math.max(0, minSpanDeg - (maxLat - minLat)) / 2;
  return { ne: [maxLon + growLon, maxLat + growLat], sw: [minLon - growLon, minLat - growLat] };
}

/** Where the person was at time t, from time-sorted points. Never invents a straight line
 * across a recording gap: if the neighbours are more than maxGapS apart, it snaps to the
 * nearer one instead of interpolating. */
export function positionAt(pts, t, maxGapS = 1800) {
  if (!pts.length) return null;
  if (t <= pts[0][0]) return { t, lat: pts[0][1], lon: pts[0][2] };
  const last = pts[pts.length - 1];
  if (t >= last[0]) return { t, lat: last[1], lon: last[2] };
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (pts[m][0] < t) lo = m + 1;
    else hi = m;
  }
  const b = pts[lo], a = pts[lo - 1];
  if (b[0] === a[0]) return { t, lat: b[1], lon: b[2] };
  if (b[0] - a[0] > maxGapS) {
    const near = t - a[0] < b[0] - t ? a : b;
    return { t, lat: near[1], lon: near[2] };
  }
  const f = (t - a[0]) / (b[0] - a[0]);
  return { t, lat: a[1] + f * (b[1] - a[1]), lon: a[2] + f * (b[2] - a[2]) };
}

/** Segments as GeoJSON - each segment its own line, so recording gaps (flights, phone off)
 * are never bridged by a fake straight line. One-point segments are stays (a whole day at
 * home can be a single point) and come out as a MultiPoint for a CircleLayer to draw. */
export function segmentsFeature(segs) {
  const lines = segs.filter((s) => s.length > 1).map((s) => s.map((p) => [p[2], p[1]]));
  const stays = segs.filter((s) => s.length === 1).map((s) => [s[0][2], s[0][1]]);
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: lines } },
      // Tagged so the stays CircleLayer can filter to it: a circle layer otherwise also draws
      // a dot at every vertex of the lines in the same source.
      { type: "Feature", properties: { stay: 1 }, geometry: { type: "MultiPoint", coordinates: stays } },
    ],
  };
}

/** The part of the segments up to time tMax (for "where I've been so far" during replay). */
export function segmentsUntil(segs, tMax) {
  const out = [];
  for (const s of segs) {
    if (!s.length || s[0][0] > tMax) break;
    if (s[s.length - 1][0] <= tMax) {
      out.push(s);
      continue;
    }
    const cut = s.filter((p) => p[0] <= tMax);
    const pos = positionAt(s, tMax);
    if (pos) cut.push([tMax, pos.lat, pos.lon]);
    out.push(cut);
    break;
  }
  return out;
}
