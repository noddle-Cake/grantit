#!/usr/bin/env bash
# 31 - Publish Grantit: grantit.joseyandco.com on 127.0.0.1:8307. Safe to re-run to deploy the latest main.
#   sudo bash ~/srv-setup/31-grantit.sh            # latest main
#   sudo bash ~/srv-setup/31-grantit.sh <commit>   # one exact commit on main (what grantit-autodeploy uses)
#   sudo GRANTIT_PASSWORD=… bash ~/srv-setup/31-grantit.sh   # set or change the site password, then deploy
#
# The site password (nginx basic auth, the only sign-in) lives only in $SITE/access.env on 5820. The repo is
# public, so it is never committed: it is hashed into $SITE/htpasswd here.
#
# Source of truth: deploy/31-grantit.sh in github.com/noddle-Cake/grantit (copied to ~/srv-setup on 5820).
# Pulls main into ~/Projects/grantit, builds web/ (npm workspace) as chris, copies web/dist into the site, and restarts
# the rootless nginx container. First run also creates the container, tunnel ingress and DNS via 04-new-site.sh.
set -euo pipefail
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }
[[ $EUID -eq 0 ]] || die "run with sudo"
cd /   # sudo -u websvc inherits the cwd, and websvc cannot enter /home/chris

TARGET=${1:-}
[[ -z $TARGET || $TARGET =~ ^[0-9a-f]{7,40}$ ]] || die "commit must be a hex SHA, got: $TARGET"
NEW_PASSWORD=${GRANTIT_PASSWORD:-}
NEW_USERNAME=${GRANTIT_USERNAME:-}

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
  $AS_CHRIS "git -C '$SRC' fetch --quiet origin main"
fi
if [[ -n $TARGET ]]; then
  # Deploy exactly the commit CI passed, even if main has moved on since.
  $AS_CHRIS "git -C '$SRC' merge-base --is-ancestor '$TARGET' origin/main" || die "$TARGET is not on main"
  $AS_CHRIS "git -C '$SRC' checkout --quiet --detach '$TARGET'"
else
  $AS_CHRIS "git -C '$SRC' checkout --quiet main && git -C '$SRC' merge --ff-only --quiet origin/main"
fi
REV=$($AS_CHRIS "git -C '$SRC' rev-parse --short HEAD")
echo "    at $REV"

# ─── Site password (basic auth), kept out of git ──────────────────────────────
ACCESS_ENV=$SITE/access.env
if [[ -n $NEW_PASSWORD ]]; then
  say "Saving the site password in $ACCESS_ENV"
  [[ $NEW_PASSWORD =~ ^[A-Za-z0-9._@%+=,-]+$ ]] || die "password may use letters, digits and . _ @ % + = , - only"
  [[ -z $NEW_USERNAME || $NEW_USERNAME =~ ^[A-Za-z0-9._@-]+$ ]] || die "username may use letters, digits and . _ @ - only"
  install -o websvc -g websvc -m 700 -d "$SITE"
  printf "GRANTIT_USERNAME='%s'\nGRANTIT_PASSWORD='%s'\n" "${NEW_USERNAME:-username}" "$NEW_PASSWORD" |
    install -o root -g root -m 600 /dev/stdin "$ACCESS_ENV"
fi
[[ -f $ACCESS_ENV ]] || die "no site password yet. Run once: sudo GRANTIT_PASSWORD='…' bash $0"
# shellcheck source=/dev/null
source "$ACCESS_ENV"
[[ -n ${GRANTIT_PASSWORD:-} && -n ${GRANTIT_USERNAME:-} ]] || die "$ACCESS_ENV must set GRANTIT_USERNAME and GRANTIT_PASSWORD"

say "Building web/ (npm ci at the workspace root, checks for shared/ and web/, vite build)"
# web/node_modules is left over from before the npm workspace; the root install replaces it.
$AS_CHRIS "rm -rf '$SRC/web/node_modules' && cd '$SRC' && npm ci --no-audit --no-fund && npm run check -w shared -w web && npm run build -w web"
[[ -f $SRC/web/dist/index.html ]] || die "build produced no dist/index.html"

if [[ ! -e $QUADLET ]]; then
  say "First run: container, tunnel ingress and DNS"
  bash /home/chris/srv-setup/04-new-site.sh "$NAME" "$PORT" "$HOST"
fi

# ─── API + database (grantit-api, grantit-db quadlets on the grantit network) ──
API_ENV=$SITE/api.env
UNITS=/srv/websvc/.config/containers/systemd
USER_UNITS=/srv/websvc/.config/systemd/user

if [[ ! -f $API_ENV ]]; then
  say "First run: database credentials in $API_ENV"
  install -o websvc -g websvc -m 700 -d "$SITE"
  PASS=$(openssl rand -hex 24)
  install -o websvc -g websvc -m 600 /dev/stdin "$API_ENV" <<EOF
POSTGRES_USER=grantit
POSTGRES_PASSWORD=$PASS
POSTGRES_DB=grantit
DATABASE_URL=postgres://grantit:$PASS@grantit-db:5432/grantit
DEFAULT_ORGANIZATION_ID=org-tidepath
EOF
fi
# shellcheck source=/dev/null
source "$API_ENV"

say "Installing quadlets and the backup timer"
install -o websvc -g websvc -m 644 "$SRC/deploy/grantit.network" "$UNITS/grantit.network"
install -o websvc -g websvc -m 644 "$SRC/deploy/grantit-db.container" "$UNITS/grantit-db.container"
install -o websvc -g websvc -m 644 "$SRC/deploy/grantit-api.container" "$UNITS/grantit-api.container"
install -o websvc -g websvc -m 755 -d "$SITE/bin"
install -o websvc -g websvc -m 755 "$SRC/deploy/backup/grantit-db-backup.sh" "$SITE/bin/grantit-db-backup.sh"
install -o websvc -g websvc -m 755 -d "$USER_UNITS"
install -o websvc -g websvc -m 644 "$SRC/deploy/backup/grantit-db-backup.service" "$USER_UNITS/grantit-db-backup.service"
install -o websvc -g websvc -m 644 "$SRC/deploy/backup/grantit-db-backup.timer" "$USER_UNITS/grantit-db-backup.timer"
$R systemctl --user daemon-reload

say "Building the API image (localhost/grantit-api)"
# websvc's podman cannot read /home/chris, so stage the build context under the site.
rm -rf "$SITE/api-build"
install -d -o websvc -g websvc "$SITE/api-build"
$AS_CHRIS "cd '$SRC' && tar cf - package.json package-lock.json .dockerignore shared api | tar xf - -C '$SITE/api-build'"
chown -R websvc:websvc "$SITE/api-build"
$R podman build --quiet -t localhost/grantit-api:latest -f "$SITE/api-build/api/Dockerfile" "$SITE/api-build"

FIRST_RUN=0
$R systemctl --user is-active --quiet grantit-db.service || FIRST_RUN=1

say "Starting Postgres and applying migrations"
$R systemctl --user start grantit-db.service
for _ in $(seq 1 30); do $R podman exec grantit-db pg_isready -U grantit -d grantit >/dev/null 2>&1 && break; sleep 1; done
$R podman exec grantit-db pg_isready -U grantit -d grantit >/dev/null || die "grantit-db did not become ready"
# Join the db container's network so no published port or network-name guesswork is needed.
$R podman run --rm --network container:grantit-db -e "DATABASE_URL=postgres://grantit:$POSTGRES_PASSWORD@127.0.0.1:5432/grantit" localhost/grantit-api:latest node src/db/migrate.ts
if [[ $FIRST_RUN -eq 1 ]]; then
  say "Seeding the demo organization"
  $R podman run --rm --network container:grantit-db -e "DATABASE_URL=postgres://grantit:$POSTGRES_PASSWORD@127.0.0.1:5432/grantit" localhost/grantit-api:latest node src/db/seed.ts
fi
$R systemctl --user enable --now grantit-db-backup.timer
$R systemctl --user enable grantit-api.service
$R systemctl --user restart grantit-api.service # restarts on the new image (starts it on first run)

say "Installing nginx config (basic auth, rate limits, SPA fallback, /api proxy, asset caching)"
install -o websvc -g websvc -m 644 "$SRC/deploy/nginx.conf" "$SITE/nginx.conf"
# apr1 hash of the site password; only the container (websvc) reads it.
printf '%s:%s\n' "$GRANTIT_USERNAME" "$(printf '%s' "$GRANTIT_PASSWORD" | openssl passwd -apr1 -stdin)" |
  install -o websvc -g websvc -m 600 /dev/stdin "$SITE/htpasswd"
if ! grep -q "conf.d/default.conf" "$QUADLET"; then
  sed -i "s|^Volume=$SITE/html:/usr/share/nginx/html:ro,Z|&\nVolume=$SITE/nginx.conf:/etc/nginx/conf.d/default.conf:ro,Z|" "$QUADLET"
  grep -q "conf.d/default.conf" "$QUADLET" || die "could not add the nginx.conf volume to $QUADLET"
  $R systemctl --user daemon-reload
fi
if ! grep -q "/etc/nginx/htpasswd" "$QUADLET"; then
  sed -i "s|^Volume=$SITE/nginx.conf:/etc/nginx/conf.d/default.conf:ro,Z|&\nVolume=$SITE/htpasswd:/etc/nginx/htpasswd:ro,Z|" "$QUADLET"
  grep -q "/etc/nginx/htpasswd" "$QUADLET" || die "could not add the htpasswd volume to $QUADLET"
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
# Credentials go to curl on stdin (-K -), not on the command line where any user could see them.
creds() { printf 'user = "%s:%s"\n' "$GRANTIT_USERNAME" "$GRANTIT_PASSWORD"; }
[[ $(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/") == 401 ]] && echo "    basic auth OK (401 without credentials)" || die "site answered without credentials"
creds | curl -fsS -K - -o /dev/null "http://127.0.0.1:$PORT/" && echo "    origin OK on :$PORT"
creds | curl -fsS -K - -o /dev/null "http://127.0.0.1:$PORT/knowledge" && echo "    SPA fallback OK (/knowledge)"
curl -fsS "http://127.0.0.1:$PORT/api/health" | grep -q '"status":"ok"' && echo "    API OK on :$PORT/api" || die "API health check failed"
curl -fsS -o /dev/null "https://$HOST/version.txt" && echo "    public OK: https://$HOST" || echo "    public check failed; DNS can take a minute"
say "Deployed $REV"
