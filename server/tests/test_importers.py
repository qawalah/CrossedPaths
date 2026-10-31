"""GPX / TCX / FIT / KML / GeoJSON / CSV / Swarm / zip importers. Run with pytest."""
import gzip
import io
import json
import os
import struct
import sys
import zipfile
from datetime import datetime, timezone

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

import synth
from crosspaths import Params, assess, parse_files, run_check
from crosspaths.importers import FIT_EPOCH, Limits

A = synth.raw_points("A", 11)
B = synth.raw_points("B", 22)


def iso(t):
    return datetime.fromtimestamp(t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- writers for each format ----------

def gpx(pts):
    rows = "".join(f'<trkpt lat="{la:.7f}" lon="{lo:.7f}"><ele>40</ele><time>{iso(t)}</time></trkpt>' for t, la, lo, *_ in pts)
    return (f'<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="StravaGPX" '
            f'xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Run</name><trkseg>{rows}</trkseg></trk></gpx>').encode()


def tcx(pts):
    rows = "".join(f"<Trackpoint><Time>{iso(t)}</Time><Position><LatitudeDegrees>{la}</LatitudeDegrees>"
                   f"<LongitudeDegrees>{lo}</LongitudeDegrees></Position></Trackpoint>" for t, la, lo, *_ in pts)
    return ('<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">'
            f"<Activities><Activity Sport=\"Running\"><Lap><Track>{rows}</Track></Lap></Activity></Activities></TrainingCenterDatabase>").encode()


def kml_track(pts):
    whens = "".join(f"<when>{iso(t)}</when>" for t, *_ in pts)
    coords = "".join(f"<gx:coord>{lo} {la} 0</gx:coord>" for t, la, lo, *_ in pts)
    return ('<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">'
            f"<Document><Placemark><gx:Track>{whens}{coords}</gx:Track></Placemark></Document></kml>").encode()


def fit(pts, big_endian=False, compressed_every=0):
    """A real FIT file: file_id + record messages, optional big-endian definition and
    compressed-timestamp headers, plus a developer field to skip."""
    e = ">" if big_endian else "<"
    body = bytearray()
    # local 0: file_id (global 0), field 4 time_created uint32
    body += bytes([0x40, 0, 1 if big_endian else 0]) + struct.pack(e + "H", 0) + bytes([1, 4, 4, 0x86])
    body += bytes([0x00]) + struct.pack(e + "I", int(pts[0][0] - FIT_EPOCH))
    # local 1: record (global 20): timestamp, lat, lon, heart rate + one 2-byte developer field
    body += bytes([0x61, 0, 1 if big_endian else 0]) + struct.pack(e + "H", 20) + bytes([4, 253, 4, 0x86, 0, 4, 0x85, 1, 4, 0x85, 3, 1, 0x02])
    body += bytes([1, 0, 2, 0])
    # local 2: record without timestamp (for compressed-timestamp headers)
    body += bytes([0x42, 0, 1 if big_endian else 0]) + struct.pack(e + "H", 20) + bytes([2, 0, 4, 0x85, 1, 4, 0x85])
    semi = lambda d: int(round(d * 2 ** 31 / 180))
    last = None
    for k, (t, la, lo, *_) in enumerate(pts):
        ts = int(t - FIT_EPOCH)
        if compressed_every and last is not None and k % compressed_every == 0 and 0 < ts - last < 31:
            body += bytes([0x80 | (2 << 5) | (ts & 0x1F)]) + struct.pack(e + "ii", semi(la), semi(lo))
        else:
            body += bytes([0x01]) + struct.pack(e + "Iii", ts, semi(la), semi(lo)) + bytes([120]) + b"\x00\x00"
        last = ts
    hdr = bytes([14, 0x10]) + struct.pack("<H", 2132) + struct.pack("<I", len(body)) + b".FIT" + b"\x00\x00"
    return hdr + bytes(body) + b"\x00\x00"


def csv_gpslogger(pts):
    lines = ["time,lat,lon,elevation,accuracy,bearing,speed"]
    lines += [f"{iso(t)},{la:.7f},{lo:.7f},40,{acc},0,0" for t, la, lo, acc, _ in pts]
    return "\n".join(lines).encode()


def geojson_points(pts):
    return json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lo, la]}, "properties": {"timestamp": int(t)}}
        for t, la, lo, *_ in pts]}).encode()


def zipped(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in entries:
            z.writestr(name, data)
    return buf.getvalue()


def parse(*files, **kw):
    return parse_files([(n, d) for n, d in files], Limits(**kw) if kw else None)


# ---------- each format finds the same crossings as the Google JSON ----------

@pytest.mark.parametrize("writer,fmt", [
    (gpx, "gpx"), (tcx, "tcx"), (kml_track, "kml"), (fit, "fit"), (csv_gpslogger, "csv"), (geojson_points, "geojson"),
    (lambda p: fit(p, big_endian=True), "fit"),
])
def test_every_format_matches_like_google(writer, fmt):
    a, rep = parse(("a.x", writer(A)))
    assert a.fmt == fmt and rep.formats == {fmt: 1}
    assert abs(len(a) - len(A)) <= len(A) * 0.02, (len(a), len(A))
    b, _ = parse(("b.json", json.dumps(synth.to_records_json(B)).encode()))
    kinds = sorted(e["kind"] for e in run_check(a, b, Params())["events"])
    assert kinds == ["passing", "same_place"]


def test_fit_compressed_timestamps():
    dense = [(A[0][0] + k * 2, A[0][1] + k * 1e-5, A[0][2], 5, "move") for k in range(200)]
    tr, _ = parse(("x.fit", fit(dense, compressed_every=3)))
    ts = [p.t for p in tr.points]
    assert ts[0] == dense[0][0] and ts == sorted(ts)
    assert abs(ts[-1] - dense[-1][0]) < 1                     # compressed offsets decoded correctly


def test_dense_tracks_are_thinned_and_not_flagged_as_fake():
    t0 = synth.BASE
    run = [(t0 + s, 52.5 + s * 3 / 111_320, 13.4 + (s % 7) * 1e-6, 5, "move") for s in range(3600)]   # 1 fix/s, 1 h
    tr, _ = parse(("run.gpx", gpx(run)))
    assert 700 <= len(tr) <= 740                              # one fix per 5 s
    rep = assess(tr.points)
    assert not any("regular intervals" in r for r in rep.reasons), rep.reasons


def test_csv_variants():
    t0 = synth.BASE
    rows = [(t0 + k * 30, 52.5 + k * 1e-4, 13.4) for k in range(40)]
    semi = "Date;Time;Latitude;Longitude\n" + "\n".join(
        f"{datetime.fromtimestamp(t, tz=timezone.utc):%Y-%m-%d};{datetime.fromtimestamp(t, tz=timezone.utc):%H:%M:%S};"
        f"{str(round(la, 6)).replace('.', ',')};{str(lo).replace('.', ',')}" for t, la, lo in rows)
    tr, _ = parse(("x.csv", semi.encode()))
    assert len(tr) == 40 and tr.points[0].t == t0 and abs(tr.points[-1].lat - rows[-1][1]) < 1e-6
    # Samsung-style: a metadata line, then dotted column names and millisecond times
    sam = "com.samsung.health.location,6313004,3\ncom.samsung.health.location.start_time,com.samsung.health.location.latitude,com.samsung.health.location.longitude\n"
    sam += "\n".join(f"{int(t * 1000)},{la},{lo}" for t, la, lo in rows)
    tr, _ = parse(("loc.csv", sam.encode()))
    assert len(tr) == 40
    # Strava's activities.csv has no coordinates: not an error inside an archive, no points on its own
    with pytest.raises(ValueError):
        parse(("activities.csv", b"Activity ID,Activity Date,Activity Name\n1,\"Jun 2, 2025\",Run\n"))


def test_swarm_checkins_become_short_stays():
    t0 = int(synth.BASE)
    old_api = {"response": {"checkins": {"count": 2, "items": [
        {"id": "a", "createdAt": t0, "type": "checkin", "timeZoneOffset": 120,
         "venue": {"name": "Cafe", "location": {"lat": 52.54, "lng": 13.39}}},
        {"id": "b", "createdAt": t0 + 600, "type": "checkin", "venue": {"name": "Shop", "location": {"lat": 52.541, "lng": 13.391}}}]}}}
    tr, rep = parse(("checkins.json", json.dumps(old_api).encode()))
    assert tr.fmt == "swarm" and [p.src for p in tr.points] == ["visit"] * 4
    assert tr.points[1].t == t0 + 540                         # cut short by the next check-in
    assert tr.points[-1].t == t0 + 600 + 1800                 # last one lasts 30 minutes
    new_export = {"items": [{"id": "c", "createdAt": "2025-06-02 12:00:00.000000", "type": "checkin",
                             "venue": {"id": "v", "name": "Cafe"}, "lat": 52.54, "lng": 13.39}]}
    tr, _ = parse(("checkins1.json", json.dumps(new_export).encode()))
    assert tr.points[0].t == datetime(2025, 6, 2, 12, tzinfo=timezone.utc).timestamp()


def test_generic_json_lists():
    t0 = synth.BASE
    samsung = [{"start_time": int((t0 + k * 10) * 1000), "latitude": 52.5 + k * 1e-4, "longitude": 13.4, "accuracy": 5} for k in range(30)]
    tr, _ = parse(("x.location_data.json", json.dumps(samsung).encode()))
    assert tr.fmt == "points" and len(tr) >= 6               # 10 s apart: thinning keeps them
    owntracks = {"data": [{"_type": "location", "lat": 52.5 + k * 1e-4, "lon": 13.4, "tst": int(t0) + k * 60} for k in range(30)]}
    tr, _ = parse(("ot.json", json.dumps(owntracks).encode()))
    assert len(tr) == 30
    line = {"type": "Feature", "geometry": {"type": "LineString", "coordinates": [[13.4, 52.5 + k * 1e-4] for k in range(30)]},
            "properties": {"coordTimes": [iso(t0 + k * 60) for k in range(30)]}}
    tr, _ = parse(("x.geojson", json.dumps(line).encode()))
    assert len(tr) == 30 and tr.fmt == "geojson"


def test_strava_style_archive_with_gz_and_mixed_files():
    half = len(A) // 2
    archive = zipped([
        ("export_123/activities.csv", b"Activity ID,Activity Name\n1,Run\n"),
        ("export_123/activities/1.gpx", gpx(A[:half])),
        ("export_123/activities/2.fit.gz", gzip.compress(fit(A[half:]))),
        ("export_123/media/photo.jpg", b"\xff\xd8\xff"),
        ("export_123/profile.json", b'{"name": "me"}'),
        ("__MACOSX/export_123/._1.gpx", b"junk"),
    ])
    tr, rep = parse(("export_123.zip", archive))
    assert rep.formats == {"gpx": 1, "fit": 1} and tr.fmt in ("gpx+fit (2 files)", "fit+gpx (2 files)")
    assert abs(len(tr) - len(A)) <= len(A) * 0.02 and not rep.skipped


def test_apple_health_export_skips_the_big_xml():
    archive = zipped([
        ("apple_health_export/export.xml", b"<HealthData>" + b" " * 1000 + b"</HealthData>"),
        ("apple_health_export/workout-routes/route_2025-06-02_8.00am.gpx", gpx(A[:300])),
        ("apple_health_export/workout-routes/route_2025-06-03_8.00am.gpx", gpx(A[300:600])),
        ("apple_health_export/electrocardiograms/ecg.csv", b"Name,Me\nVoltage,1\n"),
    ])
    tr, rep = parse(("export.zip", archive))
    assert rep.formats == {"gpx": 2} and 580 <= len(tr) <= 600 and not rep.skipped


def test_swarm_zip_reads_json_not_the_duplicate_csv():
    t0 = int(synth.BASE)
    items = [{"createdAt": t0 + k * 7200, "type": "checkin", "lat": 52.5, "lng": 13.4 + k * 0.01, "venue": {"name": f"v{k}"}} for k in range(15)]
    csv = "createdAt,lat,lng\n" + "\n".join(f"{i['createdAt']},{i['lat']},{i['lng']}" for i in items)
    archive = zipped([("checkins1.json", json.dumps({"items": items})), ("checkins1.csv", csv), ("users.json", "{}"), ("readme.html", "<p>")])
    tr, rep = parse(("swarm.zip", archive))
    assert rep.formats == {"swarm": 1} and len(tr) == 30


def test_garmin_nested_zip_and_kmz():
    inner = zipped([("UploadedFiles_0/a.fit", fit(A[:200]))])
    kmz = zipped([("doc.kml", kml_track(A[200:400]))])
    tr, rep = parse(("garmin.zip", zipped([("DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0.zip", inner)])), ("trip.kmz", kmz))
    assert rep.formats == {"fit": 1, "kml": 1} and 385 <= len(tr) <= 400  # a few fixes <5 s apart are thinned


def test_kml_placemarks_with_time():
    t0 = synth.BASE
    marks = "".join(
        f"<Placemark><TimeSpan><begin>{iso(t0 + k * 7200)}</begin><end>{iso(t0 + k * 7200 + 1800)}</end></TimeSpan>"
        f"<Point><coordinates>13.4{k},52.5,0</coordinates></Point></Placemark>" for k in range(5))
    marks += f"<Placemark><TimeStamp><when>{iso(t0 + 99999)}</when></TimeStamp><Point><coordinates>13.4,52.5</coordinates></Point></Placemark>"
    tr, _ = parse(("x.kml", f'<kml xmlns="http://www.opengis.net/kml/2.2"><Document>{marks}</Document></kml>'.encode()))
    assert [p.src for p in tr.points].count("visit") == 10 and len(tr) == 11


def test_multiple_files_combine_and_bad_ones_are_skipped():
    tr, rep = parse(("1.gpx", gpx(A[:100])), ("2.gpx", gpx(A[100:200])), ("notes.txt", b"hello"), ("bad.gpx", b"<gpx><trkpt"))
    assert 192 <= len(tr) <= 200 and sorted(rep.skipped) == ["bad.gpx", "notes.txt"]
    assert tr.fmt == "gpx (2 files)"


def test_unsafe_or_useless_input_is_rejected():
    with pytest.raises(ValueError):                           # entity expansion ("billion laughs")
        parse(("x.gpx", b'<?xml version="1.0"?><!DOCTYPE g [<!ENTITY a "aaaa">]><gpx>&a;</gpx>'))
    with pytest.raises(ValueError):                           # route without times can't be matched
        parse(("route.gpx", b'<gpx><rte><rtept lat="52.5" lon="13.4"/></rte></gpx>'))
    bomb = zipped([("big.gpx", gpx(A))])
    with pytest.raises(ValueError):                           # entry bigger than allowed once unzipped
        parse(("b.zip", bomb), max_entry_bytes=1000)
    with pytest.raises(ValueError):
        parse(("x.gz", gzip.compress(gpx(A))), max_entry_bytes=1000)
