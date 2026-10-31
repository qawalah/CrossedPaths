# Deploying CrossPaths on a Synology NAS

Written for a DS423 (ARM64, Container Manager). Not yet run on real Synology hardware,
so treat the first deploy as a test.

## 0. Check your hardware first

- **DS423** (no "+"): Realtek ARM64 CPU, **2 GB RAM, soldered, not upgradable**. Container Manager is supported.
- **DS423+**: Intel Celeron J4125, 2 GB, officially upgradable to 6 GB. Neither model takes 16 GB.
- Confirm yours in DSM: *Control Panel -> Info Center*.

CrossPaths is built for 2 GB: one container, SQLite (no database container), one worker,
one check at a time, 900 MB memory cap, 80 MB upload limit.

## 1. Install

1. Install **Container Manager** from Package Center (DSM 7.2+).
2. Unzip this project into `/volume1/docker/crosspaths` (File Station or SMB).
3. Copy `.env.example` to `.env` and set at least `INVITE_CODE`.
4. Container Manager -> **Project** -> **Create** -> path `/volume1/docker/crosspaths` ->
   it detects `docker-compose.yml` -> **Build and start**. The first build downloads the Python
   image and packages (needs internet, a few minutes on ARM).
5. Open `http://<NAS-IP>:8787`, create an account with your invite code.

Data lives in `/volume1/docker/crosspaths/data` (SQLite DB, encrypted timelines, `keys.json`).
Back up `data/` if you care about accounts; uploads are deleted after 24 h anyway.
The container runs as root so it can write to the bind-mounted folder on DSM.

## 2. Reach it from phones (HTTPS required for "Add to Home Screen")

Browsers only allow installable web apps and service workers over HTTPS.

| Who needs access | Option |
|---|---|
| You + friends you invite to your tailnet | **Tailscale**. Enable HTTPS in the Tailscale admin console, then on the NAS `tailscale serve --bg 8787` (CLI path and permissions on Synology vary; follow Tailscale's Synology docs). |
| Anyone (strangers) | **Tailscale Funnel**, a **Cloudflare Tunnel**, or DSM Reverse Proxy + Let's Encrypt + DDNS. This exposes location-related data to the internet: set `INVITE_CODE`, keep DSM updated, and don't forward the DSM admin ports. |

Without HTTPS the app still works in a phone browser at `http://<NAS-IP>:8787` on your LAN, it just can't be installed.

### The Android/iOS app: home address + Tailscale, switching automatically

The app can hold two addresses of the same server and pick the one that works:

1. On the NAS: Package Center → install **Tailscale** → sign in. The container's port 8787 is
   published on the NAS itself, so nothing else is needed: the NAS's Tailscale address already
   serves CrossPaths at `http://100.x.y.z:8787` (or `http://<nas-name>.<tailnet>.ts.net:8787`
   with MagicDNS; if you ran `tailscale serve` above, use its `https://` address instead).
2. On the phone: install the Tailscale app, sign in to the same tailnet, leave it on.
3. In CrossPaths: **Account → Server addresses**. Home address `http://<NAS-LAN-IP>:8787`,
   Tailscale address as above, **Switch automatically** on. **Test** checks both.

The app uses the home address whenever it answers (faster, works without the VPN) and Tailscale
otherwise, re-checking when it opens, when you come back to it, and whenever the server can't
be reached. Both addresses must be the same server: the app compares the `instance` value from
`/api/config` and won't switch to an address that turns out to be a different server, so your
sign-in is never sent anywhere else.

## 3. Updating

Check what version is running: open `http://<NAS-IP>:8787/api/config` in a browser — it
shows a `version` field. Compare that against `CHANGELOG.md` in the project to see what's new.

**Most updates (Python code, the web app, anything except `requirements.txt`):**
1. In File Station, replace the changed files inside `/volume1/docker/crosspaths` — either a
   few individual files, or extract a fresh zip over the top of the existing folder (this
   overwrites code but leaves `.env` and `data/` untouched, since those aren't in the zip).
2. Container Manager → Project → **Restart** (not "Build and start" — no rebuild needed).
   The container mounts `server/`, `crosspaths/`, `wsgi.py`, and `VERSION` directly from
   the folder, so a restart alone picks up the new files.
3. Reload `/api/config` and confirm the version number changed.

**Only rebuild when `requirements.txt` changes** (a new Python package was added):
```
docker compose build --no-cache
docker compose up -d
```
or in Container Manager: stop the project, then **Build and start**.

## 4. Settings you'll likely touch (`.env`)

- `INVITE_CODE`, `ALLOW_REGISTRATION=false` once everyone has joined
- `MAP_STYLE_URL` if you'd rather use MapTiler / Stadia (key in the URL)
- `MAX_UPLOAD_MB`: the whole JSON is parsed in RAM (~5-10x file size). Raise only if you add RAM.

After editing `.env`: Project -> **Stop**, then **Build and start** (or `docker compose up -d --build`).

## 5. Known limits

- Very large `Records.json` files (hundreds of MB) won't fit: ask the user to trim to a shorter date range.
- No push notifications yet: the app polls every few seconds while open.
- Single-node SQLite: fine for tens of users, not thousands.
