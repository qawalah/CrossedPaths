# Deploying CrossPaths

CrossPaths runs as one Docker container on any Linux host (a cloud VM, a VPS, or a container
platform that supports a persistent volume). ARM64 and x86 both work.

## 0. Sizing

CrossPaths is built for a small machine (2 GB RAM is enough): one container, SQLite (no
database container), one worker, one check at a time, 1.5 GB memory cap, 80 MB upload limit.

Street maps (optional, see section 4) need disk for each country: roughly the size of the
country's OpenStreetMap download again (e.g. 50 MB-1 GB for most single countries), and 1-4 GB
of memory for the minutes to an hour it takes to prepare one.

## 1. Install

1. Install Docker with the Compose plugin on the host.
2. Copy the `server/` folder to the host, e.g. `/opt/crosspaths`.
3. Copy `.env.example` to `.env` and set at least `INVITE_CODE`.
4. From that folder: `docker compose up -d --build`. The first build downloads the Python
   image and packages (a few minutes).
5. Put HTTPS in front of it (section 2), then open `https://<your-domain>` and create an
   account with your invite code.

Data lives in `./data` next to `docker-compose.yml` (SQLite DB, encrypted timelines,
`keys.json`). It must be on persistent storage and backed up: **losing `keys.json` signs
everyone out and makes stored uploads unreadable.** Uploads themselves are purged per each
user's retention setting.

## 2. HTTPS

Serve CrossPaths over HTTPS only. Browsers need it for installable web apps, service workers
and geolocation, and the data is location-related. The container listens on plain HTTP port
8787; terminate TLS in front of it with any of:

- a reverse proxy on the host (Caddy, nginx, Traefik) with Let's Encrypt. With Caddy, a
  `Caddyfile` of `crosspaths.example.com { reverse_proxy 127.0.0.1:8787 }` is enough;
- your cloud provider's load balancer;
- a tunnel (e.g. Cloudflare Tunnel) if the host has no public IP.

With a reverse proxy on the same host, publish the port on localhost only
(`"127.0.0.1:8787:8787"` in `docker-compose.yml`) so plain HTTP isn't reachable from outside.
Set `INVITE_CODE`, and `ALLOW_REGISTRATION=false` once everyone has joined.

### The Android/iOS app: a backup address, switching automatically

The app can hold two addresses of the same server (for example a main domain and a backup
domain or tunnel) and pick the one that works. In the app: **Account → Server addresses**,
fill in the server address and optionally the backup address, **Switch automatically** on.
**Test** checks both.

The app uses the main address whenever it answers and the backup otherwise, re-checking when it
opens, when you come back to it, and whenever the server can't be reached. Both addresses must
be the same server: the app compares the `instance` value from `/api/config` and won't switch
to an address that turns out to be a different server, so your sign-in is never sent anywhere
else.

## 3. Updating

Check what version is running: open `https://<your-domain>/api/config` — it shows a `version`
field. Compare that against `CHANGELOG.md` to see what's new.

**Most updates (Python code, the web app, anything except `requirements.txt`):**
1. Replace the changed files in the deploy folder (copy individual files, or extract a fresh
   copy over the top; this overwrites code but leaves `.env` and `data/` untouched).
2. `docker compose restart` (no rebuild needed). The container mounts `server/`,
   `crosspaths/`, `wsgi.py` and `VERSION` read-only from the folder, so a restart alone picks
   up the new files.
3. Reload `/api/config` and confirm the version number changed.

**Only rebuild when `requirements.txt` or the `Dockerfile` changes:**
```
docker compose build --no-cache
docker compose up -d
```

Never delete or overwrite `data/`.

## 4. Settings you'll likely touch (`.env`)

- `INVITE_CODE`, `ALLOW_REGISTRATION=false` once everyone has joined
- `MAP_STYLE_URL` if you'd rather use MapTiler / Stadia (key in the URL)
- `MAX_UPLOAD_MB`: the whole JSON is parsed in RAM (~5-10x file size). Raise it only with more
  RAM (and raise `mem_limit` in `docker-compose.yml` to match).

- `ADMIN_HANDLES=yourname` to manage **street maps**: then *Settings → Server (admin) → Street
  maps* on the web lets you add countries. Journeys there are drawn along roads instead of
  straight lines. Pick single countries (or US states etc.), not whole continents; downloads over
  `ROADS_MAX_DOWNLOAD_MB` are refused. Maps live in `data/roads/` and survive updates. If one
  fails with "ran out of memory", raise `mem_limit` in `docker-compose.yml`. `STREET_SNAP=false`
  turns the feature off.

After editing `.env`: `docker compose up -d` (recreates the container with the new values).

## 5. Known limits

- Very large `Records.json` files (hundreds of MB) won't fit: ask the user to trim to a shorter date range.
- Single-node SQLite: fine for tens of users, not thousands. Run one instance only; don't scale
  the container horizontally.
