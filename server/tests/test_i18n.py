"""The web client is bilingual (English text is the key, AR_STR maps it to Arabic). These tests keep
the Arabic dictionary complete: every string the client asks for, and every fixed message the
server can send, must have an Arabic entry with the same {placeholders}."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HTML = open(os.path.join(ROOT, "server", "static", "index.html"), encoding="utf-8").read()


def _arabic():
    block = HTML.split("/*AR:begin*/", 1)[1].split("/*AR:end*/", 1)[0]
    out = {}
    for line in block.strip().splitlines():
        k, v = json.loads("[" + line.strip().rstrip(",").replace('": "', '", "', 1) + "]")
        out[k] = v
    return out


def _client_keys():
    keys = []
    for m in re.finditer(r'(?<![\w.])t\("((?:[^"\\]|\\.)*)"', HTML):
        keys.append(m.group(1).replace("\\'", "'").replace('\\"', '"'))
    return keys


def _server_messages():
    app = open(os.path.join(ROOT, "server", "app.py"), encoding="utf-8").read()
    msgs = set(re.findall(r'\berr\("([^"{}]+)"\)', app))
    spoof = open(os.path.join(ROOT, "crosspaths", "spoofcheck.py"), encoding="utf-8").read()
    for m in re.findall(r'reasons\.append\(f?"([^"]+)"\)', spoof):
        msgs.add(re.sub(r"\{[^}]*\}", "{n}", m))
    msgs.add("Too little data to judge")
    msgs.add("A check with them is already running.")
    return msgs


def _holes(s):
    return sorted(re.findall(r"\{(\w+)\}", s))


def test_every_client_string_has_arabic():
    ar = _arabic()
    missing = [k for k in dict.fromkeys(_client_keys()) if k not in ar]
    assert not missing, missing


def test_every_fixed_server_message_has_arabic():
    ar = _arabic()
    missing = [m for m in _server_messages() if m not in ar]
    assert not missing, missing


def test_arabic_keeps_the_placeholders():
    bad = [k for k, v in _arabic().items() if _holes(k) != _holes(v)]
    assert not bad, bad


def test_arabic_has_no_leftover_english_sentences():
    # brand and technical names may stay in Latin script; a whole English sentence may not
    for k, v in _arabic().items():
        words = re.findall(r"[A-Za-z]{4,}", re.sub(r"<[^>]+>|\{\w+\}", " ", v))
        assert len(words) <= 12 or re.search(r"[؀-ۿ]", v), (k, v)
        assert re.search(r"[؀-ۿ]", v) or len(words) <= 3, (k, v)


def test_page_is_direction_aware():
    assert "document.documentElement.dir" in HTML and "AR_STR" in HTML
