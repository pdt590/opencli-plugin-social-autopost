#!/usr/bin/env bash
# Fully close the user's Google Chrome after all social-autopost work has settled.
# Usage: close-chrome.sh [--check]
#   --check  only report state, never close.
# Exit codes: 0 = Chrome closed (or was not running)
#             2 = Chrome running (check mode)
#             3 = an OpenCLI post/clone command is still running; nothing was closed
#             4 = Chrome still running after graceful close and forced stop
set -u
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1
uid="$(id -u)"

# Browser main processes only; renderers/helpers carry --type= and exit with them.
main_pids() {
  for pid in $(pgrep -u "$uid" -x chrome 2>/dev/null); do
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q -- '--type=' || echo "$pid"
  done
}
any_chrome() { pgrep -u "$uid" -x chrome >/dev/null 2>&1; }

if ! any_chrome; then echo "chrome: not running"; exit 0; fi
pids="$(main_pids | tr '\n' ' ')"
echo "chrome: running (main pid ${pids:-unknown})"
[ "$CHECK" = 1 ] && exit 2

# Closing mid-command could abandon an upload or a submission.
if pgrep -u "$uid" -f 'opencli .*(post-group|post-person|post-clone)' >/dev/null 2>&1; then
  echo "error: an opencli post/clone command is still running; wait for it to settle"
  exit 3
fi

# Close OpenCLI-only windows first so session restore does not bring them back next launch.
if opencli profile list 2>/dev/null | grep -q '"connected":true'; then
  python3 "$(dirname "$0")/chrome-windows.py" cleanup || echo "warning: OpenCLI window cleanup failed"
  any_chrome || { echo "chrome: closed"; exit 0; }
fi

# SIGTERM is Chrome's graceful shutdown: it saves the session and exits cleanly.
[ -n "$pids" ] && kill -TERM $pids 2>/dev/null
for _ in $(seq 1 20); do
  sleep 1
  any_chrome || { echo "chrome: closed"; exit 0; }
done

echo "warning: chrome did not exit within 20s; forcing stop"
pkill -KILL -u "$uid" -x chrome 2>/dev/null
sleep 2
any_chrome && { echo "error: chrome still running"; exit 4; }
echo "chrome: closed (forced)"
exit 0
