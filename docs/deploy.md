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

It pulls `main`, runs `npm ci` at the workspace root, the checks for `shared/` and `web/` (type-check, lint,
tests) and the web build as `chris`,
then replaces the site content and restarts the container. A failing check stops the deploy before anything
is replaced. The first run also creates the container, tunnel ingress and DNS record through
`04-new-site.sh`.

The script's source of truth is [`deploy/31-grantit.sh`](../deploy/31-grantit.sh). After changing it,
copy it to 5820:

```bash
scp deploy/31-grantit.sh 5820:~/srv-setup/31-grantit.sh   # 5820: the host's name on your tailnet
```

## CI

`.github/workflows/ci.yml` runs on GitHub-hosted runners (`ubuntu-latest`) for every pull request and every
push to `main`: type-check, lint, unit tests, build, and the built `dist/` as an artifact.

CI does not deploy: 5820 is reachable only through its outbound tunnel. Deploy after CI is green.

The 5820 self-hosted runner is not used for this repo. Your host guide allows it only for private repos.

## Remove

Follow "Removing a project" in `~/srv-setup/CLAUDE.md` on 5820 (`grantit` service, ingress block, DNS record).
