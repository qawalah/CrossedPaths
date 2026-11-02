"""Phone (WhatsApp code) and Google sign-in. No network: the sender and verifier are fakes."""
import os
import sqlite3
import sys
import time
from unittest import mock

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)

from test_api import make_client, reg  # noqa: E402
from server import otp, whatsapp  # noqa: E402
from server.db import init_db  # noqa: E402
from server.security import read_token, verify_password  # noqa: E402

CFG = {"LIMIT_OTP_PER_PHONE_PER_HOUR": 3, "LIMIT_OTP_PER_IP_PER_HOUR": 10, "LIMIT_OTP_PER_DAY": 500, "OTP_TTL_MINUTES": 10}
NUM = "+966551234567"


class FakeSender:
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    def __call__(self, phone, code, lang, cfg):
        if self.fail:
            raise whatsapp.DeliveryFailed("nope")
        self.sent.append((phone, code, lang))

    @property
    def code(self):
        return self.sent[-1][1]


class FakeGoogle:
    def __init__(self):
        self.tokens = {}

    def __call__(self, token, client_ids):
        if token not in self.tokens:
            raise ValueError("bad token")
        return self.tokens[token]


def client(**extra):
    sender, google = FakeSender(), FakeGoogle()
    cfg = {"AUTH_PHONE": True, "AUTH_GOOGLE": True, "GOOGLE_CLIENT_IDS": "web-id.apps.googleusercontent.com",
           "OTP_SENDER": sender, "GOOGLE_VERIFIER": google}
    cfg.update(extra)
    app, c, d = make_client(**cfg)
    return app, c, d, sender, google


def db_conn(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    return con


def phone_login(c, sender, number=NUM, headers=None):
    assert c.post("/api/auth/phone/start", json={"phone": number}).status_code == 200
    return c.post("/api/auth/phone/verify", json={"phone": number, "code": sender.code}, headers=headers or {})


# ---------------- basics ----------------
def test_empty_pw_hash_never_verifies():
    assert verify_password("", "") is False
    assert verify_password("anything", "") is False


def test_schema_has_identity_tables(tmp_path):
    con = sqlite3.connect(init_db(str(tmp_path)))
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"auth_identities", "otp_codes", "otp_sends"} <= names


# ---------------- phone numbers ----------------
def test_normalize_arabic_and_persian_digits():
    assert otp.normalize_phone("+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧") == NUM
    assert otp.normalize_phone("+۹۶۶۵۵۱۲۳۴۵۶۷") == NUM


def test_normalize_formats():
    assert otp.normalize_phone("00966551234567") == NUM
    assert otp.normalize_phone("+1 (415) 555-0123") == "+14155550123"
    assert otp.normalize_phone("‎+966-55-123-4567") == NUM
    for bad in ("0551234567", "551234567", "+0123456789", "+12", "", None, "+9665512345678901"):
        with pytest.raises(ValueError, match="bad_number"):
            otp.normalize_phone(bad)


def test_country_allow_list_is_optional():
    assert otp.normalize_phone("+14155550123", []) == "+14155550123"
    with pytest.raises(ValueError, match="country_not_allowed"):
        otp.normalize_phone("+14155550123", ["+966", "+971"])


def test_phone_hash_is_keyed():
    assert otp.keyed_hash(NUM, "k1", "phone-v1") != otp.keyed_hash(NUM, "k2", "phone-v1")
    assert otp.keyed_hash(NUM, "k1", "phone-v1") != otp.keyed_hash(NUM, "k1", "google-v1")
    assert NUM not in otp.keyed_hash(NUM, "k1", "phone-v1")


# ---------------- codes ----------------
@pytest.fixture
def db(tmp_path):
    con = db_conn(init_db(str(tmp_path)))
    yield con
    con.close()


def test_code_single_use(db):
    code = otp.issue_code(db, "h", "1.1.1.1", CFG)
    assert len(code) == 6 and code.isdigit()
    assert otp.check_code(db, "h", code, CFG) is True
    assert otp.check_code(db, "h", code, CFG) is False


def test_code_accepts_arabic_digits(db):
    code = otp.issue_code(db, "h", "1.1.1.1", CFG)
    arabic = code.translate(str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩"))
    assert otp.check_code(db, "h", " " + arabic + " ", CFG) is True


def test_code_burns_after_five_wrong(db):
    code = otp.issue_code(db, "h", "1.1.1.1", CFG)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert otp.check_code(db, "h", wrong, CFG) is False
    assert otp.check_code(db, "h", code, CFG) is False


def test_code_expires(db):
    code = otp.issue_code(db, "h", "1.1.1.1", CFG)
    db.execute("UPDATE otp_codes SET expires_at=?", (time.time() - 1,))
    assert otp.check_code(db, "h", code, CFG) is False


def test_new_code_replaces_old(db):
    first = otp.issue_code(db, "h", "1.1.1.1", CFG)
    second = otp.issue_code(db, "h", "1.1.1.1", CFG)
    if first != second:
        assert otp.check_code(db, "h", first, CFG) is False
    assert otp.check_code(db, "h", second, CFG) is True


def test_code_not_stored_plain(db):
    code = otp.issue_code(db, "h", "1.1.1.1", CFG)
    for table in ("otp_codes", "otp_sends"):
        for row in db.execute(f"SELECT * FROM {table}"):
            assert code not in [str(v) for v in tuple(row)]


def test_limit_per_phone(db):
    for _ in range(3):
        otp.issue_code(db, "h", "1.1.1.1", CFG)
    with pytest.raises(otp.OtpLimit) as e:
        otp.issue_code(db, "h", "2.2.2.2", CFG)
    assert e.value.scope == "phone"


def test_limit_per_ip(db):
    for i in range(10):
        otp.issue_code(db, f"h{i}", "1.1.1.1", CFG)
    with pytest.raises(otp.OtpLimit) as e:
        otp.issue_code(db, "other", "1.1.1.1", CFG)
    assert e.value.scope == "ip"


def test_limit_per_day(db):
    cfg = dict(CFG, LIMIT_OTP_PER_DAY=2)
    otp.issue_code(db, "a", "1.1.1.1", cfg)
    otp.issue_code(db, "b", "2.2.2.2", cfg)
    with pytest.raises(otp.OtpLimit) as e:
        otp.issue_code(db, "c", "3.3.3.3", cfg)
    assert e.value.scope == "day"


def test_zero_disables_a_limit(db):
    cfg = dict(CFG, LIMIT_OTP_PER_IP_PER_HOUR=0)
    for i in range(15):
        otp.issue_code(db, f"h{i}", "1.1.1.1", cfg)


# ---------------- WhatsApp sender ----------------
WA = {"WHATSAPP_TOKEN": "tok", "WHATSAPP_PHONE_ID": "12345", "WHATSAPP_TEMPLATE": "login_code",
      "WHATSAPP_TEMPLATE_LANGS": "en,ar", "WHATSAPP_API_VERSION": "v20.0"}


def test_whatsapp_payload():
    with mock.patch("server.whatsapp.requests.post") as post:
        post.return_value.status_code = 200
        whatsapp.send_whatsapp_code(NUM, "123456", "ar", WA)
    url = post.call_args.args[0]
    body = post.call_args.kwargs["json"]
    assert url == "https://graph.facebook.com/v20.0/12345/messages"
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer tok"
    assert post.call_args.kwargs["timeout"] == 10
    assert body["to"] == "966551234567" and body["type"] == "template"
    assert body["template"]["name"] == "login_code" and body["template"]["language"]["code"] == "ar"
    texts = [p["text"] for comp in body["template"]["components"] for p in comp["parameters"]]
    assert texts == ["123456", "123456"]


def test_whatsapp_unknown_language_uses_first():
    with mock.patch("server.whatsapp.requests.post") as post:
        post.return_value.status_code = 200
        whatsapp.send_whatsapp_code(NUM, "123456", "fr", WA)
    assert post.call_args.kwargs["json"]["template"]["language"]["code"] == "en"


def test_whatsapp_failure_raises():
    with mock.patch("server.whatsapp.requests.post") as post:
        post.return_value.status_code = 400
        with pytest.raises(whatsapp.DeliveryFailed):
            whatsapp.send_whatsapp_code(NUM, "123456", "en", WA)
    with mock.patch("server.whatsapp.requests.post", side_effect=whatsapp.requests.Timeout):
        with pytest.raises(whatsapp.DeliveryFailed):
            whatsapp.send_whatsapp_code(NUM, "123456", "en", WA)


def test_whatsapp_not_configured_raises():
    with pytest.raises(whatsapp.DeliveryFailed):
        whatsapp.send_whatsapp_code(NUM, "123456", "en", {})


# ---------------- phone routes ----------------
def test_phone_signup_flow():
    app, c, d, sender, _ = client()
    r = phone_login(c, sender)
    assert r.status_code == 200 and r.get_json()["needs_signup"] is True
    assert "token" not in r.get_json()
    r = c.post("/api/auth/complete", json={"signup_token": r.get_json()["signup_token"], "handle": "salma", "display_name": "Salma"})
    assert r.status_code == 200, r.get_json()
    h = {"Authorization": "Bearer " + r.get_json()["token"]}
    me = c.get("/api/me", headers=h).get_json()
    assert me["handle"] == "salma" and me["sign_in_methods"] == ["phone"]
    assert NUM not in str(me)
    # Next time the same number signs straight in.
    r = phone_login(c, sender, "00966 55 123 4567")
    assert r.status_code == 200 and r.get_json()["user"]["handle"] == "salma"


def test_start_does_not_reveal_account():
    app, c, d, sender, _ = client()
    r = phone_login(c, sender)
    c.post("/api/auth/complete", json={"signup_token": r.get_json()["signup_token"], "handle": "salma"})
    known = c.post("/api/auth/phone/start", json={"phone": NUM})
    unknown = c.post("/api/auth/phone/start", json={"phone": "+971501234567"})
    assert known.status_code == unknown.status_code == 200
    assert known.get_json() == unknown.get_json()


def test_start_passes_language():
    app, c, d, sender, _ = client()
    c.post("/api/auth/phone/start", json={"phone": NUM, "lang": "ar"})
    assert sender.sent[-1][2] == "ar"


def test_start_bad_number_400():
    app, c, d, sender, _ = client()
    r = c.post("/api/auth/phone/start", json={"phone": "0551234567"})
    assert r.status_code == 400 and r.get_json()["reason"] == "bad_number"
    assert sender.sent == []


def test_country_allow_list_route():
    app, c, d, sender, _ = client(PHONE_COUNTRIES="+966")
    r = c.post("/api/auth/phone/start", json={"phone": "+14155550123"})
    assert r.status_code == 400 and r.get_json()["reason"] == "country_not_allowed"


def test_start_rate_limited_429():
    app, c, d, sender, _ = client(LIMIT_OTP_PER_PHONE_PER_HOUR=1)
    assert c.post("/api/auth/phone/start", json={"phone": NUM}).status_code == 200
    r = c.post("/api/auth/phone/start", json={"phone": NUM})
    assert r.status_code == 429 and r.get_json()["reason"] == "rate_limited"


def test_wrong_code_401_and_burns():
    app, c, d, sender, _ = client()
    c.post("/api/auth/phone/start", json={"phone": NUM})
    wrong = "000000" if sender.code != "000000" else "111111"
    for _ in range(5):
        assert c.post("/api/auth/phone/verify", json={"phone": NUM, "code": wrong}).status_code == 401
    assert c.post("/api/auth/phone/verify", json={"phone": NUM, "code": sender.code}).status_code == 401


def test_delivery_failure_502():
    app, c, d, _, _ = client(OTP_SENDER=FakeSender(fail=True))
    r = c.post("/api/auth/phone/start", json={"phone": NUM})
    assert r.status_code == 502 and r.get_json()["reason"] == "delivery_failed"
    con = db_conn(app.config["DATA_PATH"])
    assert con.execute("SELECT COUNT(*) FROM otp_codes").fetchone()[0] == 0


def test_phone_disabled_404():
    app, c, d, sender, _ = client(AUTH_PHONE=False)
    assert c.post("/api/auth/phone/start", json={"phone": NUM}).status_code == 404
    assert c.post("/api/auth/phone/verify", json={"phone": NUM, "code": "123456"}).status_code == 404
    assert c.get("/api/config").get_json()["auth"]["phone"] is False


def test_signup_token_is_not_a_session_token():
    app, c, d, sender, _ = client()
    tok = phone_login(c, sender).get_json()["signup_token"]
    assert read_token(tok, app.config["SECRET_KEY"]) is None
    assert c.get("/api/me", headers={"Authorization": "Bearer " + tok}).status_code == 401


def test_signup_token_creates_one_account():
    app, c, d, sender, _ = client()
    tok = phone_login(c, sender).get_json()["signup_token"]
    assert c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma"}).status_code == 200
    r = c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma2"})
    assert r.status_code == 409
    con = db_conn(app.config["DATA_PATH"])
    assert con.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


def test_complete_rejects_bad_token_and_handle():
    app, c, d, sender, _ = client()
    assert c.post("/api/auth/complete", json={"signup_token": "junk", "handle": "salma"}).status_code == 401
    reg(c, "taken")
    tok = phone_login(c, sender).get_json()["signup_token"]
    assert c.post("/api/auth/complete", json={"signup_token": tok, "handle": "Bad Name!"}).status_code == 400
    assert c.post("/api/auth/complete", json={"signup_token": tok, "handle": "taken"}).status_code == 409
    assert c.post("/api/auth/complete", json={"signup_token": tok, "handle": "fine_name"}).status_code == 200


def test_complete_respects_invite_and_closed_registration():
    app, c, d, sender, _ = client(INVITE_CODE="letmein")
    tok = phone_login(c, sender).get_json()["signup_token"]
    assert c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma"}).status_code == 403
    assert c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma", "invite": "letmein"}).status_code == 200
    app, c, d, sender, _ = client(ALLOW_REGISTRATION=False)
    tok = phone_login(c, sender).get_json()["signup_token"]
    assert c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma"}).status_code == 403


def test_passwordless_account_cannot_password_login():
    app, c, d, sender, _ = client()
    tok = phone_login(c, sender).get_json()["signup_token"]
    c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma"})
    assert c.post("/api/login", json={"handle": "salma", "password": ""}).status_code == 401


def test_link_phone_to_existing_user():
    app, c, d, sender, _ = client()
    h = reg(c, "alice")
    r = phone_login(c, sender, headers=h)
    assert r.status_code == 200 and r.get_json()["linked"] is True
    assert c.get("/api/me", headers=h).get_json()["sign_in_methods"] == ["password", "phone"]
    r = phone_login(c, sender)
    assert r.get_json()["user"]["handle"] == "alice"


def test_link_conflict_409():
    app, c, d, sender, _ = client()
    phone_login(c, sender, headers=reg(c, "alice"))
    r = phone_login(c, sender, headers=reg(c, "bob"))
    assert r.status_code == 409


def test_plain_number_not_in_db():
    app, c, d, sender, _ = client()
    tok = phone_login(c, sender).get_json()["signup_token"]
    c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma"})
    con = db_conn(app.config["DATA_PATH"])
    tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    for t in tables:
        for row in con.execute(f"SELECT * FROM {t}"):
            for v in tuple(row):
                assert "551234567" not in str(v), t


def test_deleting_account_removes_identity():
    app, c, d, sender, _ = client()
    tok = phone_login(c, sender).get_json()["signup_token"]
    h = {"Authorization": "Bearer " + c.post("/api/auth/complete", json={"signup_token": tok, "handle": "salma"}).get_json()["token"]}
    con = db_conn(app.config["DATA_PATH"])
    uid = c.get("/api/me", headers=h).get_json()["id"]
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("DELETE FROM users WHERE id=?", (uid,))
    con.commit()
    assert con.execute("SELECT COUNT(*) FROM auth_identities").fetchone()[0] == 0


# ---------------- Google ----------------
def test_google_signup_then_signin():
    app, c, d, _, google = client()
    google.tokens["t1"] = "sub-123"
    r = c.post("/api/auth/google", json={"id_token": "t1"})
    assert r.status_code == 200 and r.get_json()["needs_signup"] is True
    r = c.post("/api/auth/complete", json={"signup_token": r.get_json()["signup_token"], "handle": "omar"})
    assert r.status_code == 200
    r = c.post("/api/auth/google", json={"id_token": "t1"})
    assert r.get_json()["user"]["handle"] == "omar"


def test_google_bad_token_401():
    app, c, d, _, _ = client()
    assert c.post("/api/auth/google", json={"id_token": "nope"}).status_code == 401
    assert c.post("/api/auth/google", json={}).status_code == 401


def test_google_disabled_404():
    app, c, d, _, google = client(AUTH_GOOGLE=False)
    google.tokens["t1"] = "sub-123"
    assert c.post("/api/auth/google", json={"id_token": "t1"}).status_code == 404
    app, c, d, _, google = client(GOOGLE_CLIENT_IDS="")
    assert c.post("/api/auth/google", json={"id_token": "t1"}).status_code == 404
    assert c.get("/api/config").get_json()["auth"]["google"] is False


def test_google_and_phone_link_same_user():
    app, c, d, sender, google = client()
    google.tokens["t1"] = "sub-123"
    tok = c.post("/api/auth/google", json={"id_token": "t1"}).get_json()["signup_token"]
    h = {"Authorization": "Bearer " + c.post("/api/auth/complete", json={"signup_token": tok, "handle": "omar"}).get_json()["token"]}
    assert phone_login(c, sender, headers=h).get_json()["linked"] is True
    assert phone_login(c, sender).get_json()["user"]["handle"] == "omar"
    assert c.get("/api/me", headers=h).get_json()["sign_in_methods"] == ["google", "phone"]


def test_config_reports_methods():
    app, c, d, _, _ = client()
    a = c.get("/api/config").get_json()["auth"]
    assert a == {"password": True, "phone": True, "google": True, "google_client_id": "web-id.apps.googleusercontent.com"}


def test_verify_google_checks_email_verified():
    from server import identity
    claims = {"sub": "s", "email_verified": False, "iss": "accounts.google.com"}
    with mock.patch("server.identity.google_id_token.verify_oauth2_token", return_value=claims):
        with pytest.raises(ValueError):
            identity.verify_google("tok", ["web-id"])
    claims["email_verified"] = True
    with mock.patch("server.identity.google_id_token.verify_oauth2_token", return_value=claims) as v:
        assert identity.verify_google("tok", ["web-id", "other"]) == "s"
    assert v.call_args.args[2] == ["web-id", "other"]
    with mock.patch("server.identity.google_id_token.verify_oauth2_token", side_effect=Exception("bad sig")):
        with pytest.raises(ValueError):
            identity.verify_google("tok", ["web-id"])
