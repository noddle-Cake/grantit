#!/usr/bin/env bash
# 31 - Publish Grantit: grantit.joseyandco.com on 127.0.0.1:8307. Safe to re-run to deploy the latest main.
#   sudo bash ~/srv-setup/31-grantit.sh
#
# Source of truth: deploy/31-grantit.sh in github.com/noddle-Cake/grantit (copied to ~/srv-setup on 5820).
# Pulls main into ~/Projects/grantit, builds web/ as chris, copies web/dist into the site, and restarts
# the rootless nginx container. First run also creates the container, tunnel ingress and DNS via 04-new-site.sh.
set -euo pipefail
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "run with sudo"
cd /   # sudo -u websvc inherits the cwd, and websvc cannot enter /home/chris

NAME=grantit PORT=8307 HOST=grantit.joseyandco.com
REPO_URL=https://github.com/noddle-Cake/grantit.git
SRC=/home/chris/Projects/grantit
SITE=/srv/websvc/sites/$NAME
QUADLET=/srv/websvc/.config/containers/systemd/$NAME.container
U=$(id -u websvc)
R="sudo -u websvc env XDG_RUNTIME_DIR=/run/user/$U DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$U/bus"
AS_CHRIS="sudo -u chris -H bash -lc"

say "Fetching main into $SRC"
if [[ ! -d $SRC/.git ]]; then
  $AS_CHRIS "git clone --branch main $REPO_URL '$SRC'"
else
  $AS_CHRIS "git -C '$SRC' fetch --quiet origin main && git -C '$SRC' checkout --quiet main && git -C '$SRC' merge --ff-only --quiet origin/main"
fi
REV=$($AS_CHRIS "git -C '$SRC' rev-parse --short HEAD")
echo "    at $REV"

say "Building web/ (npm ci, type-check, tests, vite build)"
$AS_CHRIS "cd '$SRC/web' && npm ci --no-audit --no-fund && npm run check && npm run build"
[[ -f $SRC/web/dist/index.html ]] || die "build produced no dist/index.html"

if [[ ! -e $QUADLET ]]; then
  say "First run: container, tunnel ingress and DNS"
  bash /home/chris/srv-setup/04-new-site.sh "$NAME" "$PORT" "$HOST"
fi

say "Installing nginx config (SPA fallback, asset caching)"
install -o websvc -g websvc -m 644 "$SRC/deploy/nginx.conf" "$SITE/nginx.conf"
if ! grep -q "conf.d/default.conf" "$QUADLET"; then
  sed -i "s|^Volume=$SITE/html:/usr/share/nginx/html:ro,Z|&\nVolume=$SITE/nginx.conf:/etc/nginx/conf.d/default.conf:ro,Z|" "$QUADLET"
  grep -q "conf.d/default.conf" "$QUADLET" || die "could not add the nginx.conf volume to $QUADLET"
  $R systemctl --user daemon-reload
fi

say "Copying build to $SITE/html"
find "$SITE/html" -mindepth 1 -delete
cp -r "$SRC/web/dist"/. "$SITE/html"/
echo "$REV" > "$SITE/html/version.txt"
chown -R websvc:websvc "$SITE"
find "$SITE/html" -type d -exec chmod 755 {} + ; find "$SITE/html" -type f -exec chmod 644 {} +

say "Restarting (the :Z volumes relabel the new files)"
$R systemctl --user restart "$NAME.service"
sleep 2
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" && echo "    origin OK on :$PORT"
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/knowledge" && echo "    SPA fallback OK (/knowledge)"
curl -fsS -o /dev/null "https://$HOST/" && echo "    public OK: https://$HOST" || echo "    public check failed; DNS can take a minute"
say "Deployed $REV"
