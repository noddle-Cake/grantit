# Deploying Grantit

Grantit is a static Vite build served from **5820**, the home server, following the host guide in
`~/srv-setup/CLAUDE.md` on that machine.

```
Internet → Cloudflare edge → cjservin tunnel → 127.0.0.1:8307 → rootless nginx (user websvc)
                                                                 /srv/websvc/sites/grantit/html
                                                                  ├─ /          static Vite build
                                                                  └─ /api/  →   127.0.0.1:8787
                                                                                 grantit-api quadlet (built from api/Dockerfile)
                                                                                   └─ grantit-db quadlet (postgres:18-alpine, grantit-pg volume)
```

| | |
|---|---|
| URL | https://grantit.joseyandco.com (behind basic auth) |
| Port | `127.0.0.1:8307` |
| Container | quadlet `grantit.container`, `nginx-unprivileged:alpine`, read-only, no capabilities |
| Content | `/srv/websvc/sites/grantit/html` (backed up nightly by `srv-backup`) |
| nginx config | [`deploy/nginx.conf`](../deploy/nginx.conf), mounted as `default.conf`: basic auth, per-IP rate limits, SPA fallback, immutable `/assets` |
| Checkout used for builds | `~/Projects/grantit` on 5820 |
| Deployed commit | `https://grantit.joseyandco.com/version.txt` |

## Site password and rate limits

The whole site sits behind nginx basic auth; the in-app sign-in screen checks the same credential. The repo is
public, so the credential is **never committed**. It lives only in `/srv/websvc/sites/grantit/access.env` on 5820
(root, mode 600). On every deploy `31-grantit.sh` reads it, passes it to the web build (`VITE_APP_USERNAME`,
`VITE_APP_PASSWORD`), and writes the hashed `sites/grantit/htpasswd` that is mounted into the nginx container.
Local dev and tests, which have no `access.env`, sign in with `username` / `password`.

Set or change the password (username defaults to `username`; pass `GRANTIT_USERNAME=…` to change it):

```bash
cd ~/Projects/grantit && git pull
sudo GRANTIT_PASSWORD='new-password' bash deploy/31-grantit.sh
```

Without `access.env` a deploy stops with that instruction rather than publishing an open site.

Left open on purpose: `/version.txt` (the Deploy workflow and autodeploy poll it) and `/api/health`.

Rate limits are per visitor IP, taken from Cloudflare's `CF-Connecting-IP` (the origin listens only on
127.0.0.1, so the header always comes from the tunnel): 5 req/s with a burst of 60 for pages and assets, 10 req/s
with a burst of 40 for `/api/`. Over the limit nginx answers `429`.

## Continuous deployment

Every merge to `main` deploys itself once CI passes:

```
merge to main ──► CI (GitHub-hosted) ──► passes
                                           │
5820: grantit-autodeploy.timer, every 2 min: newest green main commit ≠ live version.txt?
                                           │ yes
                                           ▼
              as root: ~/srv-setup/31-grantit.sh <commit>  ──►  live
                                           │
GitHub: Deploy workflow waits until https://grantit.joseyandco.com/version.txt = <commit>  ──►  ✓
```

- **Why pull, not push:** 5820 is reachable only through its outbound tunnel, and the host guide allows the
  self-hosted runner only for private repos. The timer reads GitHub's public API, so it needs no inbound
  access, runner or secrets.
- **What it deploys:** exactly the commit CI passed (`31-grantit.sh <commit>`), even if `main` has moved on.
- **If a deploy fails** (a check fails on 5820, say), the site keeps serving the previous build. That commit
  isn't retried; the next green commit deploys normally. The Deploy workflow on GitHub turns red.
- **Watch it:** the Actions tab shows a **Deploy** run per merge, and on 5820
  `journalctl -u grantit-autodeploy -f`.
- **Pause / resume:** `sudo systemctl stop grantit-autodeploy.timer` / `start`.

### Install (once, on 5820)

```bash
cd ~/Projects/grantit && git pull
sudo bash deploy/install-autodeploy.sh
```

This installs `31-grantit.sh` into `~/srv-setup`, the poller as `/usr/local/sbin/grantit-autodeploy`, and the
`grantit-autodeploy` service and timer, then deploys the newest green commit. Run it again whenever
`deploy/31-grantit.sh` or `deploy/autodeploy/` changes. They run as root, so they are not updated
automatically from the repo.

## Manual deploy

On 5820 (needs your sudo password):

```bash
sudo bash ~/srv-setup/31-grantit.sh            # latest main
sudo bash ~/srv-setup/31-grantit.sh <commit>   # a specific commit on main
```

It fetches `main`, runs `npm ci` at the workspace root, the checks for `shared/` and `web/` (type-check,
lint, tests) and the web build as `chris`, then replaces the site content and restarts the container. A
failing check stops the deploy before anything is replaced. The first run also creates the container,
tunnel ingress and DNS record through `04-new-site.sh`.

### API and database

The same script also deploys the backend, as quadlets under `websvc` on the internal `grantit` network:

| Piece | What it is |
|---|---|
| `grantit-db` | `postgres:18-alpine` quadlet, data in the `grantit-pg` volume, no published port |
| `grantit-api` | Quadlet running `localhost/grantit-api`, built from [`api/Dockerfile`](../api/Dockerfile) (Node 24 runs the TS sources), publishes `127.0.0.1:8787` |
| `/api/` | nginx proxies to the API container (same origin, per [api.md](api.md)) |
| `api.env` | `POSTGRES_*`, `DATABASE_URL`, `DEFAULT_ORGANIZATION_ID` — generated 0600 in `/srv/websvc/sites/grantit/` on first deploy |
| Backups | `grantit-db-backup.timer` (websvc, daily 03:40) runs `deploy/backup/grantit-db-backup.sh`: `pg_dump -Fc` into `/srv/websvc/sites/grantit/db-backups/`, 14-day retention, swept up by the host's nightly srv-backup |

Each deploy rebuilds the API image, applies `drizzle/` migrations (via a throwaway container joined to the
db's network), and restarts `grantit-api`. Only the first deploy seeds the demo organization. Re-seed
manually with `sudo -u websvc podman run --rm --network container:grantit-db --env-file /srv/websvc/sites/grantit/api.env localhost/grantit-api:latest node src/db/seed.ts`.

## CI

`.github/workflows/ci.yml` runs on GitHub-hosted runners (`ubuntu-latest`) for every pull request and every
push to `main`: type-check, lint and tests for each workspace (API tests against a Postgres service), the web
build, and the built `dist/` as an artifact. `.github/workflows/deploy.yml` then confirms the deploy.

## Remove

Follow "Removing a project" in `~/srv-setup/CLAUDE.md` on 5820 (`grantit` service, ingress block, DNS record).
