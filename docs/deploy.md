# Deploying Grantit

Grantit is a static Vite build served from **5820**, the home server, following the host guide in
`~/srv-setup/CLAUDE.md` on that machine.

```
Internet → Cloudflare edge → cjservin tunnel → 127.0.0.1:8307 → rootless nginx (user websvc)
                                                                 /srv/websvc/sites/grantit/html
```

| | |
|---|---|
| URL | https://grantit.joseyandco.com (public) |
| Port | `127.0.0.1:8307` |
| Container | quadlet `grantit.container`, `nginx-unprivileged:alpine`, read-only, no capabilities |
| Content | `/srv/websvc/sites/grantit/html` (backed up nightly by `srv-backup`) |
| nginx config | [`deploy/nginx.conf`](../deploy/nginx.conf), mounted as `default.conf`: SPA fallback, immutable `/assets` |
| Checkout used for builds | `~/Projects/grantit` on 5820 |
| Deployed commit | `https://grantit.joseyandco.com/version.txt` |

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

## CI

`.github/workflows/ci.yml` runs on GitHub-hosted runners (`ubuntu-latest`) for every pull request and every
push to `main`: type-check, lint and tests for each workspace (API tests against a Postgres service), the web
build, and the built `dist/` as an artifact. `.github/workflows/deploy.yml` then confirms the deploy.

## Remove

Follow "Removing a project" in `~/srv-setup/CLAUDE.md` on 5820 (`grantit` service, ingress block, DNS record).
