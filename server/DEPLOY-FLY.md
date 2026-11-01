# Deploying to Fly.io

One machine, one volume, built from `server/Dockerfile`. The config is `server/fly.toml`.

## From GitHub (Fly dashboard → Launch an App)

Pick the repo, then set:

| Field | Value |
|---|---|
| Branch | `main` |
| Working directory | `server` |
| Config path | `fly.toml` (inside `server/`) |
| App name | `crosspaths`, or any free name (also update `app` in `fly.toml`) |
| Volume | created on first deploy, 3 GB |
| Region | the one closest to your users; keep `primary_region` in `fly.toml` the same |
| Internal port | `8787` |
| Machine | shared-cpu-1x, 1 GB RAM |
| Secrets | `INVITE_CODE` (recommended). `SECRET_KEY` and `DATA_KEY` are optional, see below |

Leave Postgres, Redis and Tigris off. The app uses SQLite on the volume. The first deploy
creates the `crosspaths_data` volume from `[[mounts]]` in `fly.toml`.

Every push to `main` then redeploys. The volume is kept.

## Secrets

- **Fresh start:** leave `SECRET_KEY` and `DATA_KEY` unset. The server generates them once into
  `/data/keys.json` on the volume.
- **Moving from an existing server:** set both to the values in that server's
  `data/keys.json`, so sign-ins and stored uploads keep working.

Losing these keys signs everyone out and makes stored uploads unreadable.

## From the command line (alternative)

From `server/`: `fly launch --no-deploy --copy-config`, then `fly secrets set INVITE_CODE=...`,
then `fly deploy`.

## Moving existing data (optional)

Stop the old server first. Then from `server/`:

```bash
tar czf crosspaths-data.tgz -C /path/to/old/data .
fly ssh sftp shell        # then: put crosspaths-data.tgz /data/crosspaths-data.tgz
fly ssh console -C "sh -c 'cd /data && tar xzf crosspaths-data.tgz && rm crosspaths-data.tgz'"
fly machine restart
```

## Notes

- Keep it at **one machine** (`fly scale count 1`). SQLite can't be shared across machines.
  If Fly creates two on the first deploy, run `fly scale count 1`.
- The machine never auto-stops (`auto_stop_machines = "off"`), because matching jobs and the
  purge loop run in background threads.
- 1 GB RAM covers the place-name list (`PLACE_NAMES=true`). Use `fly scale memory 2048` if large
  uploads run out of memory.
- **Street maps** (journeys drawn along roads): put your username in `ADMIN_HANDLES` in
  `fly.toml`, then add countries in *Settings → Server (admin) → Street maps*. Each country needs
  disk (`fly volumes extend <id> --size 10`) and 1-4 GB RAM while it's prepared
  (`fly scale memory 4096`, then back to 1024 when it's done). `STREET_SNAP = "false"` turns it off.
- Fly keeps daily volume snapshots: `fly volumes snapshots list`.
- Custom domain: `fly certs add crosspaths.example.com`, then set DNS as it says.
- Apps: enter `https://<app>.fly.dev` (or your domain) as the server address.
