#!/usr/bin/env bash
# grantit-autodeploy: continuous deployment for grantit.joseyandco.com on 5820.
#
# 5820 is reachable only through its outbound Cloudflare Tunnel, so GitHub can't push a deploy to it.
# Instead this runs every 2 minutes (grantit-autodeploy.timer), asks GitHub's public API for the newest
# commit on main whose CI run passed, and deploys it with 31-grantit.sh if the site is on anything else.
# No inbound access, no self-hosted runner, no secrets: the repo is public.
#
# Logs:   journalctl -u grantit-autodeploy
# Pause:  sudo systemctl stop grantit-autodeploy.timer   (resume with start)
set -euo pipefail

REPO=noddle-Cake/grantit
DEPLOY=/home/chris/srv-setup/31-grantit.sh
LIVE_VERSION=/srv/websvc/sites/grantit/html/version.txt
STATE=/var/lib/grantit-autodeploy
API="https://api.github.com/repos/$REPO/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=1"

mkdir -p "$STATE"

# Newest main commit with a successful CI run. The first head_sha in the response is workflow_runs[0].
green=$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' -H 'User-Agent: grantit-autodeploy' "$API" |
  grep -o '"head_sha": *"[0-9a-f]\{40\}"' | head -1 | grep -o '[0-9a-f]\{40\}' || true)
if [[ -z $green ]]; then
  echo "No successful CI run on main found (or GitHub unreachable); nothing to do."
  exit 0
fi

live=$([[ -f $LIVE_VERSION ]] && tr -d '[:space:]' < "$LIVE_VERSION" || true)
if [[ -n $live && $green == "$live"* ]]; then
  exit 0 # already live
fi

# Don't retry a commit whose deploy already failed; wait for the next green commit instead.
if [[ -f $STATE/failed && $(cat "$STATE/failed") == "$green" ]]; then
  echo "Skipping ${green:0:7}: its deploy already failed. Fix main, or rerun: sudo bash $DEPLOY $green"
  exit 0
fi

echo "Deploying ${green:0:7} (live: ${live:-none})"
if bash "$DEPLOY" "$green"; then
  rm -f "$STATE/failed"
  echo "Deployed ${green:0:7}"
else
  echo "$green" > "$STATE/failed"
  echo "Deploy of ${green:0:7} failed; the site still serves ${live:-the previous build}." >&2
  exit 1
fi
