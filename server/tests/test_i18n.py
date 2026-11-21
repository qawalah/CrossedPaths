"""Every string the clients show has an Arabic translation, with the same {placeholders}.

The English text in the code is the translation key, so a string nobody translated silently shows
English. These tests find them. Needs `node` for the web client's dictionary (skipped without it).
"""
import json
import os
import re
import shutil
import subprocess

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.dirname(HERE)
WEB_DIR = os.path.join(SERVER, "server", "static")
MOBILE = os.path.join(os.path.dirname(SERVER), "mobile")

STR = r'"((?:[^"\\]|\\.)*)"'
# Names that are the same in Arabic (brands and file formats)
SAME = {"Strava", "Samsung Health", "Garmin", "Swarm", "Fitbit · Google Fit", "GPX / FIT / TCX", "FIT / GPX", "TCX", "GPX · KML · GeoJSON · CSV"}
# Strings the code passes to T() through a variable rather than a literal
WEB_VIA_VARIABLE = {"Teal", "Blue", "Violet", "Amber", "Rose"}
APP_VIA_VARIABLE = WEB_VIA_VARIABLE | {"System", "Dark", "Light", "Show my code", "Scan", "Shake", "Newest", "Oldest", "Longest"}


def _unq(s):
    return json.loads('"' + s + '"')


def used_keys(text, sources_marker=None):
    """{english key: is_plural} for every T("...") / TP(n, "one", "other") in the code."""
    keys = {}
    for m in re.finditer(r"\bT\(\s*" + STR, text):
        keys.setdefault(_unq(m.group(1)), False)
    for m in re.finditer(r"\bTP\((?:[^,()]|\([^()]*\)|\([^()]*\([^()]*\)[^()]*\))+,\s*" + STR + r",\s*" + STR, text):
        keys[_unq(m.group(1))] = True
    if sources_marker:   # the "where to get a location history" lists are translated when shown
        i = text.index(sources_marker)
        j = text.index("];", i)
        for m in re.finditer(r"(?:name|what):\s*" + STR + r"|^\s*" + STR + r",?\s*$", text[i:j], re.M):
            keys.setdefault(_unq(m.group(1) or m.group(2)), False)
    return keys


def placeholders(s):
    return set(re.findall(r"\{(\w+)\}", s))


def check(keys, ar, where):
    missing = sorted(k for k in keys if k not in ar and k not in SAME)
    assert not missing, f"{where}: no Arabic for:\n  " + "\n  ".join(missing)
    problems = []
    for k, is_plural in keys.items():
        a = ar.get(k)
        if a is None:
            continue
        if isinstance(a, dict):
            forms = [a[f] for f in ("one", "two", "few", "many", "other")]
            if None in forms:
                problems.append(f"{k!r}: a plural needs one, two, few, many and other")
            for f in forms:
                if f and not placeholders(f) <= placeholders(k) | {"n"}:
                    problems.append(f"{k!r}: placeholders {placeholders(f)} not in the English")
        else:
            if is_plural:
                problems.append(f"{k!r}: used with TP() but the Arabic isn't a plural entry")
            if placeholders(a) != placeholders(k):
                problems.append(f"{k!r}: placeholders differ: {placeholders(k)} vs {placeholders(a)}")
    assert not problems, f"{where}:\n  " + "\n  ".join(problems)


@pytest.mark.skipif(not shutil.which("node"), reason="needs node to read the web dictionary")
def test_web_client_is_fully_translated():
    html = open(os.path.join(WEB_DIR, "index.html"), encoding="utf-8").read()
    keys = used_keys(html, "const SOURCES = [")
    for k in WEB_VIA_VARIABLE:
        keys.setdefault(k, False)
    code = ('global.window=global;Object.defineProperty(global,"navigator",{value:{language:"ar"}});'
            'global.localStorage={getItem(){return null}};global.document={documentElement:{}};'
            'eval(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify(window.CP_I18N.AR))')
    out = subprocess.run(["node", "-e", code, os.path.join(WEB_DIR, "i18n.js")], capture_output=True, text=True, check=True).stdout
    check(keys, json.loads(out), "web client")


@pytest.mark.skipif(not os.path.isdir(os.path.join(MOBILE, "src")), reason="the app isn't in this checkout")
def test_app_is_fully_translated():
    keys = {}
    src = os.path.join(MOBILE, "src")
    files = [os.path.join(MOBILE, "App.js")]
    for root, _d, names in os.walk(src):
        files += [os.path.join(root, n) for n in names if n.endswith(".js") and not n.startswith("i18n")]
    for f in files:
        keys.update(used_keys(open(f, encoding="utf-8").read()))
    keys.update(used_keys(open(os.path.join(src, "importSources.js"), encoding="utf-8").read(), "export const SOURCES = ["))
    for k in APP_VIA_VARIABLE:
        keys.setdefault(k, False)
    ar_src = open(os.path.join(src, "i18n.ar.js"), encoding="utf-8").read()
    m = re.search(r"const AR = (\{.*?\n\});\n", ar_src, re.S)
    check(keys, json.loads(m.group(1)), "app")
