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

## Deploy

On 5820 (needs your sudo password):

```bash
sudo bash ~/srv-setup/31-grantit.sh
```

It pulls `main`, runs `npm ci`, `npm run check` (type-check, lint, tests) and `npm run build` as `chris`,
then replaces the site content and restarts the container. A failing check stops the deploy before anything
is replaced. The first run also creates the container, tunnel ingress and DNS record through
`04-new-site.sh`.

The script's source of truth is [`deploy/31-grantit.sh`](../deploy/31-grantit.sh). After changing it,
copy it to 5820:

```bash
scp deploy/31-grantit.sh chris@100.64.241.102:~/srv-setup/31-grantit.sh
```

## CI

`.github/workflows/ci.yml` runs on the ephemeral self-hosted runner (`runs-on: [self-hosted, 5820]`) for every
pull request and every push to `main`: type-check, lint, unit tests, build, and the built `dist/` as an artifact.

The runner VM cannot reach the host (by design), so CI does not deploy. Deploy after CI is green.

Register this repo's runner once (one instance per private repo):

```bash
ssh chris@100.64.241.102
ssh gh-runner
sudo gh-runner-configure      # repo: noddle-Cake/grantit
```

**Keep the repo private.** On a public repo, a fork's pull request would run a stranger's code on 5820.

## Remove

Follow "Removing a project" in `~/srv-setup/CLAUDE.md` on 5820 (`grantit` service, ingress block, DNS record).
