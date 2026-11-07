#!/usr/bin/env bash
# One-time setup of continuous deployment on 5820. Run from the grantit checkout there:
#   cd ~/Projects/grantit && git pull && sudo bash deploy/install-autodeploy.sh
# Safe to re-run after the deploy scripts change; it reinstalls them and restarts the timer.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
cd "$(dirname "$0")"

install -o chris -g chris -m 755 31-grantit.sh /home/chris/srv-setup/31-grantit.sh
install -o root -g root -m 755 autodeploy/grantit-autodeploy.sh /usr/local/sbin/grantit-autodeploy
install -o root -g root -m 644 autodeploy/grantit-autodeploy.service /etc/systemd/system/grantit-autodeploy.service
install -o root -g root -m 644 autodeploy/grantit-autodeploy.timer /etc/systemd/system/grantit-autodeploy.timer

systemctl daemon-reload
systemctl enable --now grantit-autodeploy.timer
systemctl start grantit-autodeploy.service || true # deploy the newest green commit now

systemctl list-timers grantit-autodeploy.timer --no-pager
echo
echo "Installed. Logs: journalctl -u grantit-autodeploy -f"
