# Deploying to Fly.io

One machine, one volume. Everything runs from the `server/` folder.

## First deploy

1. Install the CLI and sign in: <https://fly.io/docs/flyctl/install/>, then `fly auth login`.
2. Create the app without deploying (keeps the existing `fly.toml`):

   ```bash
   fly launch --no-deploy --copy-config
   ```

   If the name `crosspaths` is taken, change `app` in `fly.toml`.
3. Create the data volume (same region as `primary_region`, 1 GB is plenty to start):

   ```bash
   fly volumes create crosspaths_data --region fra --size 1
   ```

4. Set the secrets.
   - **Moving from the NAS (keep users and uploads):** use the values in the NAS's `data/keys.json`.
   - **Fresh start:** generate new ones:

   ```bash
   fly secrets set SECRET_KEY="$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')" \
     DATA_KEY="$(python3 -c 'from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())')"
   ```

   Optional: `fly secrets set INVITE_CODE=...` to require a code at signup.
5. Deploy:

   ```bash
   fly deploy
   ```

The server is at `https://<app>.fly.dev`. Check `https://<app>.fly.dev/api/config`.

## Moving existing data from the NAS (optional)

Stop the NAS container first so the database isn't written during the copy. Then:

```bash
tar czf crosspaths-data.tgz -C /path/to/nas/data .
fly ssh sftp shell        # then: put crosspaths-data.tgz /data/crosspaths-data.tgz
fly ssh console -C "sh -c 'cd /data && tar xzf crosspaths-data.tgz && rm crosspaths-data.tgz'"
fly machine restart
```

Set `SECRET_KEY`/`DATA_KEY` from the NAS's `keys.json` (step 4) so existing sign-ins and
uploads keep working.

## Updates

`fly deploy` from `server/`. The volume is kept between deploys.

## Notes

- Keep it at **one machine** (`fly scale count 1`). SQLite can't be shared across machines.
- The machine never auto-stops (`auto_stop_machines = "off"`), because matching jobs and the purge
  loop run in background threads.
- 1 GB RAM covers the GeoNames place list (`PLACE_NAMES=true`). Use `fly scale memory 2048`
  if large uploads hit the limit.
- Back up the volume now and then: `fly volumes snapshots list` (Fly keeps daily snapshots).
- Custom domain: `fly certs add crosspaths.example.com`, then point DNS as it tells you.
- Android: enter `https://<app>.fly.dev` as the server address in the app's Settings.
