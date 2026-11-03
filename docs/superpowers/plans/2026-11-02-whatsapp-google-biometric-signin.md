# WhatsApp, Google and Fingerprint Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people sign up and sign in with a phone number (code delivered over WhatsApp), with Google, and unlock the app with a fingerprint, alongside the existing username + password.

**Architecture:** Phone and Google are *identities* stored in a new `auth_identities` table that point at a `users` row. Both end in the same step: if the identity is known, return a normal 14-day token; if not, return a short-lived `signup_token` that the client trades for an account by choosing a username. The WhatsApp code is generated and checked by our server (codes stored hashed); only delivery is delegated, behind a one-function sender so tests and a later SMS fallback plug in. Fingerprint is client-only: it gates reading the stored token.

**Tech Stack:** Flask + SQLite, PyJWT (already used), `google-auth` (new), Meta WhatsApp Cloud API via `requests`; Expo SDK 51: `expo-local-authentication`, `@react-native-google-signin/google-signin`.

**Spec:** This conversation (no separate spec). Cost context: SMS to Saudi numbers is about $0.14-0.19 each, hence WhatsApp-first; Google and fingerprint cost nothing per user.

## Global Constraints

- Privacy rules in `CLAUDE.md` stay: phone numbers are never returned by the API to anyone, never logged, stored only as a keyed hash (`HMAC-SHA256` with a key derived from `DATA_KEY`). The plaintext number exists only in memory while the code is sent.
- Never touch the server's `data/` folder; new tables are added via `schema.sql` (`CREATE TABLE IF NOT EXISTS`) so old databases upgrade in place.
- `users.pw_hash` is `NOT NULL`; accounts without a password store `""` and `verify_password` must always reject an empty stored hash.
- Do not change `applicationId` (`com.example.crosspaths`). Google's Android OAuth client is tied to package name + signing SHA-1; use the DevStore key's SHA-1.
- Existing login rate-limit behaviour (8 failures / 15 min) is unchanged.
- Mobile: `colors` in `src/theme.js` is mutable; don't capture colours in `StyleSheet.create`. Keep `mobile/plugins/withCrossPathsAndroid.js` and `useLegacyPackaging`.
- Server `python -m pytest -q` must stay green with no network (the WhatsApp sender and Google verifier are injected in tests).
- Release: bump `versionCode` and `versionName` in both `mobile/app.json` and `mobile/android/app/build.gradle`; bump `server/devstore.json` and `server/VERSION` and add a `server/CHANGELOG.md` entry.

## Review Focus

- Arabic-Indic digits (`٠١٢٣`) in the phone number or the code: normalise to ASCII before validating.
- Local formats (`05xxxxxxxx`, `5xxxxxxxx`, `00966...`) with no `+`: reject with a clear message, or normalise using a required country selector; never send to a guessed number.
- Code replay and brute force: a correct code works once; 5 wrong tries burn the code; an expired code is rejected.
- Cost abuse: one phone requested repeatedly, one IP requesting many phones, numbers outside the allowed countries; a global daily cap stops a runaway bill.
- Someone with no WhatsApp: the start call must return a clear `delivery_failed`, and must not reveal whether the number already has an account.
- Google token with `email_verified: false`, wrong audience, or expired: rejected.
- Biometric unavailable, not enrolled, enrolment changed, or cancelled: the app falls back to the normal sign-in screen and never locks the user out permanently; offline start must still work behind the lock.
- Reused or expired `signup_token`; two people racing for the same username.

---

## File Structure

- Modify `server/server/schema.sql`: add `auth_identities`, `otp_codes`, `otp_sends`.
- Create `server/server/otp.py`: phone normalisation, code issue/check, rate limits (pure logic over a db handle).
- Create `server/server/whatsapp.py`: `send_whatsapp_code` (Meta Cloud API).
- Create `server/server/identity.py`: Google verification, signup-token helpers, identity lookup/link.
- Modify `server/server/app.py`: new `/api/auth/*` routes; `/api/config` exposes which methods are on.
- Modify `server/server/config.py`: new env settings.
- Modify `server/server/security.py`: reject empty `pw_hash`.
- Create `server/tests/test_signin.py`.
- Create `mobile/src/biometric.js`; modify `mobile/src/auth.js`, `mobile/src/api.js`, `mobile/src/screens/AuthScreen.js`, `mobile/src/screens/SettingsScreen.js`, `mobile/App.js`, `mobile/app.json`, `mobile/package.json`.

---

### Task 1: Schema, config and passwordless-account safety

**Files:**
- Modify: `server/server/schema.sql`, `server/server/config.py`, `server/server/security.py`
- Test: `server/tests/test_signin.py` (create)

**Interfaces:**
- Produces: tables `auth_identities(provider TEXT, subject_hash TEXT, user_id TEXT REFERENCES users ON DELETE CASCADE, created_at REAL, PRIMARY KEY(provider, subject_hash))`; `otp_codes(phone_hash TEXT PRIMARY KEY, code_hash TEXT, expires_at REAL, tries INTEGER)`; `otp_sends(phone_hash TEXT, ip TEXT, at REAL)` with an index on `(phone_hash, at)` and `(ip, at)`. Config: `AUTH_PHONE` (bool, default False), `AUTH_GOOGLE` (bool, False), `PHONE_COUNTRIES` (optional comma list of dial prefixes, default empty = all countries), `LIMIT_OTP_PER_PHONE_PER_HOUR=3`, `LIMIT_OTP_PER_IP_PER_HOUR=20`, `LIMIT_OTP_PER_DAY=500`, `OTP_TTL_MINUTES=10`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, `GOOGLE_CLIENT_IDS` (comma list).

- [ ] **Step 1: Write failing test** `test_empty_pw_hash_never_verifies`: `assert verify_password("", "") is False` and `assert verify_password("anything", "") is False`; and `test_schema_has_identity_tables`: after `init_db(tmp)`, `auth_identities`, `otp_codes`, `otp_sends` exist in `sqlite_master`.
- [ ] **Step 2: Run** `cd server && python -m pytest tests/test_signin.py -q`. Expected: FAIL.
- [ ] **Step 3: Add the three tables to `schema.sql`; add the config fields to `Config` (env-driven, same `_bool`/`int` style); make `verify_password` return False when `stored` is empty.**
- [ ] **Step 4: Run the new tests plus `python -m pytest -q`.** Expected: all pass (55 existing + new).
- [ ] **Step 5: Commit** `feat(server): identity tables and auth settings`.

### Task 2: Phone helpers and OTP logic

**Files:**
- Create: `server/server/otp.py`
- Test: `server/tests/test_signin.py`

**Interfaces:**
- Produces:
  - `normalize_phone(raw: str, allowed_prefixes: list[str]) -> str` returns E.164 (`+9665...`) or raises `ValueError("bad_number" | "country_not_allowed")`. Converts Arabic-Indic and Persian digits, strips spaces/dashes/parentheses, converts a leading `00` to `+`, requires a leading `+`.
  - `phone_hash(phone: str, data_key: str) -> str` hex HMAC-SHA256 using a key derived from `data_key` with a fixed label `"phone-v1"`.
  - `issue_code(db, phone_hash, ip, cfg) -> str` returns a 6-digit code, stores only its hash (replacing any previous code for that phone), records the send; raises `OtpLimit("phone"|"ip"|"day")` when a limit in `cfg` is exceeded.
  - `check_code(db, phone_hash, code, cfg) -> bool` constant-time compare; success deletes the row; failure increments `tries`; at 5 tries the row is deleted; expired rows return False.

- [ ] **Step 1: Write failing tests**
  - `test_normalize_arabic_digits`: `normalize_phone("+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧", ["+966"]) == "+966551234567"`.
  - `test_normalize_rejects_local_and_foreign`: `"0551234567"` raises `bad_number`; `"+14155550123"` with `["+966"]` raises `country_not_allowed`; `"00966551234567"` returns `"+966551234567"`.
  - `test_code_single_use`: issue, `check_code(...) is True`, second check `is False`.
  - `test_code_burns_after_five_wrong`: 5 wrong checks then the right code returns False.
  - `test_code_expires`: set `expires_at` in the past via SQL, check returns False.
  - `test_limits`: 4th issue for one phone within an hour raises `OtpLimit("phone")`; 11th from one IP raises `OtpLimit("ip")`; the `LIMIT_OTP_PER_DAY` cap raises `OtpLimit("day")`.
  - `test_code_not_stored_plain`: no row column equals the issued code.
- [ ] **Step 2: Run** the new tests. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `otp.py`** with the signatures above. Use `secrets.randbelow` for the code and `hmac.compare_digest` for the check.
- [ ] **Step 4: Run** tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): OTP issue/check with limits`.

### Task 3: WhatsApp sender

**Files:**
- Create: `server/server/whatsapp.py`
- Test: `server/tests/test_signin.py`

**Interfaces:**
- Produces: `send_whatsapp_code(phone: str, code: str, cfg) -> None`, raises `DeliveryFailed` on any non-2xx or timeout. It POSTs to `https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_ID}/messages` with bearer `WHATSAPP_TOKEN`, a template message named `WHATSAPP_TEMPLATE` (an *authentication* template, language `ar`, with the code as body parameter and the copy-code button parameter), timeout 10 s. It never logs the number or code.
- Consumes: `app.config["OTP_SENDER"]` is a callable with the same signature; routes call that, defaulting to `send_whatsapp_code`. Tests set a recording fake.

- [ ] **Step 1: Write failing test** `test_whatsapp_payload` using `unittest.mock.patch("requests.post")`: asserts URL contains the phone id, the JSON has `"type": "template"`, `"to"` is the number without `+`, and the code is in the components; and `test_whatsapp_failure_raises` (status 400 raises `DeliveryFailed`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with `requests` (add to `requirements.txt` if absent).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): WhatsApp Cloud API sender`.

### Task 4: Phone routes and the signup-token flow

**Files:**
- Create: `server/server/identity.py`
- Modify: `server/server/app.py` (new routes next to `/api/login`), `/api/config` response
- Test: `server/tests/test_signin.py`

**Interfaces:**
- Produces in `identity.py`: `make_signup_token(provider: str, subject_hash: str, secret: str) -> str` (JWT, `purpose="signup"`, 15 min); `read_signup_token(token, secret) -> tuple[str, str] | None`; `find_user(db, provider, subject_hash) -> Row | None`; `link(db, user_id, provider, subject_hash) -> None`.
- Routes (all JSON; all behind `AUTH_PHONE`, else 404):
  - `POST /api/auth/phone/start {phone}` → `200 {"sent": true}` always when the number is valid, whether or not an account exists. `400 bad_number|country_not_allowed`, `429 rate_limited`, `502 delivery_failed`.
  - `POST /api/auth/phone/verify {phone, code}` → known identity: `200 {"token","user"}`; unknown: `200 {"signup_token","needs_signup": true}`; wrong/expired code: `401`.
  - `POST /api/auth/complete {signup_token, handle, display_name?, invite?}` → creates the user (`pw_hash=""`), links the identity, audits `register`, returns `{"token","user"}`; reuses the same handle rules and invite/registration-closed checks as `/api/register`; `409` if handle taken; `401` for a bad/expired token; a used token cannot create a second account because the identity now exists.
  - With a valid Bearer token, `phone/verify` links the number to the signed-in user instead and returns `200 {"linked": true}`; `409` if that number belongs to someone else.

- [ ] **Step 1: Write failing tests** (use the existing app/client fixture pattern from `test_api.py` lines 20-35, with `AUTH_PHONE=True` and a fake `OTP_SENDER` that records the last code):
  - `test_phone_signup_flow`: start, read code from fake, verify → `needs_signup`; complete with handle `"salma"` → 200 and token works on `/api/me`; a second start+verify for the same number returns a token directly.
  - `test_start_does_not_reveal_account`: response body for an existing and a new number is identical.
  - `test_wrong_code_401_and_burns`: five wrong codes then correct code → 401.
  - `test_signup_token_single_account`: completing twice returns 409 (handle) or 401, never creates two users.
  - `test_delivery_failure_502`: fake sender raises `DeliveryFailed`.
  - `test_phone_disabled_404`: with `AUTH_PHONE=False` all three routes 404.
  - `test_link_phone_to_existing_user` and `test_link_conflict_409`.
  - `test_plain_number_not_in_db`: dump all tables; the number string appears nowhere.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `identity.py` and the routes; the IP for limits is `request.remote_addr` (trust `X-Forwarded-For` only as the existing app already does, if it does). `/api/config` gains `"auth": {"password": true, "phone": bool, "google": bool, "google_client_id": str}`.
- [ ] **Step 4: Run** `python -m pytest -q`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(server): phone sign-up and sign-in routes`.

### Task 5: Google sign-in route

**Files:**
- Modify: `server/server/identity.py`, `server/server/app.py`, `server/requirements.txt` (add `google-auth`)
- Test: `server/tests/test_signin.py`

**Interfaces:**
- Produces: `verify_google(id_token: str, client_ids: list[str]) -> str` returns the Google `sub`, raises `ValueError` if signature, audience, expiry or `email_verified` fail. Wrap `google.oauth2.id_token.verify_oauth2_token`. Routes call `app.config["GOOGLE_VERIFIER"]` defaulting to this, so tests inject a fake.
- Route `POST /api/auth/google {id_token}` (404 unless `AUTH_GOOGLE`): subject hashed with the same keyed hash (label `"google-v1"`), then the same known → token / unknown → `signup_token` / Bearer → link behaviour as Task 4. The Google email is never stored.

- [ ] **Step 1: Write failing tests:** `test_google_signup_then_signin` (fake verifier returns `"sub-123"`); `test_google_bad_token_401` (fake raises `ValueError`); `test_google_disabled_404`; `test_google_and_phone_link_same_user`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** reusing the Task 4 helpers; factor the shared "known / unknown / link" branch into one function in `identity.py` rather than duplicating it.
- [ ] **Step 4: Run** `python -m pytest -q`. Expected: pass.
- [ ] **Step 5: Commit** `feat(server): Google sign-in`.

### Task 6: Fingerprint lock (mobile)

**Files:**
- Create: `mobile/src/biometric.js`
- Modify: `mobile/src/auth.js`, `mobile/App.js` (lock gate), `mobile/src/screens/SettingsScreen.js` (toggle), `mobile/package.json`, `mobile/app.json` (plugin `expo-local-authentication`)

**Interfaces:**
- Produces in `biometric.js`: `isAvailable(): Promise<boolean>` (hardware present and enrolled); `isEnabled(): Promise<boolean>` / `setEnabled(on: boolean): Promise<void>` (SecureStore key `bio_lock`); `unlock(): Promise<boolean>` (prompts via `LocalAuthentication.authenticateAsync`, device-credential fallback allowed, Arabic-aware prompt text through the existing i18n helper if one exists).
- `AuthProvider` gains `locked: boolean` and `unlockApp(): Promise<void>`. On start, if a token exists and `isEnabled()`, set `locked=true` and do not call `Api.me()` until unlocked. Offline start behaviour is preserved after unlock.

- [ ] **Step 1: Add dependency** `npx expo install expo-local-authentication`, add it to `app.json` plugins.
- [ ] **Step 2: Implement `biometric.js`** with the signatures above; every call wrapped so any native error resolves to `false` (never throws).
- [ ] **Step 3: Wire `locked` into `AuthProvider` and render a simple lock screen in `App.js`** with an "Unlock" button (auto-prompts once on mount) and a "Sign out" button as the escape hatch; if `unlock()` fails because the device has no enrolled biometrics any more, clear `bio_lock` and proceed to the normal flow.
- [ ] **Step 4: Settings toggle** "Unlock with fingerprint": enabling requires a successful `unlock()` first; hidden when `isAvailable()` is false.
- [ ] **Step 5: Verify** `cd mobile && npx expo export --platform android --output-dir /tmp/cp-export`. Expected: bundle succeeds. Manual check on a device: toggle on, kill app, reopen → prompt; cancel → lock screen with Sign out; toggle off → no prompt.
- [ ] **Step 6: Commit** `feat(mobile): fingerprint app lock`.

### Task 7: WhatsApp and Google on the sign-in screen (mobile)

**Files:**
- Modify: `mobile/src/api.js`, `mobile/src/auth.js`, `mobile/src/screens/AuthScreen.js`, `mobile/package.json`, `mobile/app.json`

**Interfaces:**
- Consumes: server routes from Tasks 4-5 and `cfg.auth` from `/api/config`.
- Produces in `api.js`: `phoneStart(phone)`, `phoneVerify(phone, code)`, `authComplete(signup_token, handle, display_name, invite)`, `googleSignIn(id_token)`, each `auth: false` like `login`. In `auth.js`: `loginWithPhone(phone, code)`, `loginWithGoogle()`, and `completeSignup(signupToken, handle, displayName, invite)`; the first two return `{ needsSignup: false } | { needsSignup: true, signupToken }` and persist the token on success.

- [ ] **Step 1: Add APIs and context methods** as above.
- [ ] **Step 2: AuthScreen:** below the password form, show (only if `cfg.auth.phone`) "Continue with WhatsApp" opening a phone step (country picker restricted to the allowed prefixes, so users never type `+`), a 6-digit code step with a 60 s resend timer, and, when `needsSignup`, a username step. Show (only if `cfg.auth.google`) a "Continue with Google" button that feeds the same `needsSignup` handling. Error copy for `delivery_failed`: "We couldn't send a WhatsApp message to this number. Check the number or use another sign-in method." All strings follow the screen's existing Arabic/English mechanism.
- [ ] **Step 3: Google native setup:** `npx expo install @react-native-google-signin/google-signin`, add its config plugin, configure with `webClientId = cfg.auth.google_client_id`. Create the Google Cloud OAuth clients: Web (its ID goes in the server's `GOOGLE_CLIENT_IDS` and is served to the app) and Android (`com.example.crosspaths` + the DevStore key's SHA-1).
- [ ] **Step 4: Verify** `npx expo export --platform android --output-dir /tmp/cp-export` succeeds; against a locally run server with `AUTH_PHONE=1` and a fake sender, walk phone → code → username on a device or emulator.
- [ ] **Step 5: Commit** `feat(mobile): WhatsApp and Google sign-in`.

### Task 8: Deploy settings, docs, release

**Files:**
- Modify: `server/.env.example`, `HANDOVER.md` (new "Sign-in methods" section: env names, the Meta template and Google console steps, cost guard), `server/CHANGELOG.md`, `server/devstore.json`, `server/VERSION`, `mobile/app.json`, `mobile/android/app/build.gradle`

- [ ] **Step 1: Document env vars** from Task 1 in `.env.example` (blank secrets) and `HANDOVER.md`, including: Meta business verification and authentication-template approval are required before WhatsApp works, and the template is submitted in Arabic and English.
- [ ] **Step 2: Bump versions** per Global Constraints, both server and Android, in sync; add the changelog entry.
- [ ] **Step 3: Verify** `cd server && python -m pytest -q` passes and `docker build` still passes its HEALTHCHECK locally if Docker is available.
- [ ] **Step 4: Commit** `chore: release sign-in methods`. Pushing to `main` is the release, so push only when the user says so.

---

## Self-review notes

- Coverage: WhatsApp OTP (Tasks 2-4, 7), Google (5, 7), fingerprint (6), cost abuse limits (1-2), account linking (4-5), release (8).
- Names used across tasks: `normalize_phone`, `phone_hash`, `issue_code`, `check_code`, `OtpLimit`, `DeliveryFailed`, `make_signup_token`, `verify_google`, `OTP_SENDER`, `GOOGLE_VERIFIER`, `cfg.auth.*` are defined where first produced.

## Decisions (2026-11-02)

1. **Delivery:** WhatsApp through Meta's Cloud API, sent by our server.
2. **Countries:** any country. `PHONE_COUNTRIES` is an optional allow-list and empty by default, because the app will be global.
3. **SMS fallback:** not built. The provider isn't chosen yet and is most likely Firebase phone auth. Firebase checks the SMS code on the device and gives the server an ID token, so it doesn't fit `OTP_SENDER`. It will be one extra route that ends in the same `phone` identity. See HANDOVER.md "Sign-in methods".
4. **Password sign-in** stays as a third option.
5. **Found while building:** `read_token` accepts any JWT signed with `SECRET_KEY`. Signup tokens are therefore signed with a derived key, so they can never act as session tokens (test `test_signup_token_is_not_a_session_token`).
