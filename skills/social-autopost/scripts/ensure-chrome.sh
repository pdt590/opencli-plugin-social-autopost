#!/usr/bin/env bash
# Ensure the user's real Google Chrome GUI is running and OpenCLI Browser Bridge is connected.
# Usage: ensure-chrome.sh [--check]
#   --check  only report state, never launch or restart anything.
# Exit codes: 0 = Chrome running and Bridge connected
#             2 = Chrome not running (check mode)
#             3 = no graphical session found (cannot launch GUI)
#             4 = launch attempted but no Chrome process appeared
#             5 = Chrome running but Bridge still disconnected after a daemon restart
set -u
CHECK=0; [ "${1:-}" = "--check" ] && CHECK=1
CHROME_BIN="$(command -v google-chrome || command -v google-chrome-stable || true)"

chrome_running() { pgrep -u "$(id -u)" -x chrome >/dev/null 2>&1; }

bridge_connected() { opencli profile list 2>/dev/null | grep -q '"connected":true'; }

# The extension reconnects on its own once Chrome is up; restart the daemon once if it does not.
ensure_bridge() {
  command -v opencli >/dev/null || { echo "error: opencli not installed"; exit 5; }
  if [ "$CHECK" = 0 ] && ! opencli daemon status 2>/dev/null | grep -q '"running":true'; then
    echo "bridge: opencli daemon not running; starting it"
    opencli daemon restart >/dev/null 2>&1
  fi
  for attempt in 1 2; do
    for _ in $(seq 1 15); do
      if bridge_connected; then
        echo "bridge: connected"
        # Session restore brings back old OpenCLI windows; close them so tabs share one window.
        [ "$CHECK" = 0 ] && python3 "$(dirname "$0")/chrome-windows.py" cleanup --keep-one
        exit 0
      fi
      [ "$CHECK" = 1 ] && { echo "bridge: disconnected"; exit 5; }
      sleep 2
    done
    [ "$attempt" = 1 ] && { echo "bridge: not connected after 30s; restarting opencli daemon"; opencli daemon restart >/dev/null 2>&1; }
  done
  echo "error: Browser Bridge still disconnected; open Chrome's OpenCLI extension and click Connect"
  exit 5
}

if chrome_running; then
  echo "chrome: running (pid $(pgrep -u "$(id -u)" -x chrome | head -1)) - not launching"
  ensure_bridge
fi
echo "chrome: not running"
[ "$CHECK" = 1 ] && exit 2
[ -n "$CHROME_BIN" ] || { echo "error: google-chrome not installed"; exit 3; }

# Agent shells often lack DISPLAY. Borrow the env of the user's live desktop session;
# never invent DISPLAY / Xvfb / headless.
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  for name in gnome-shell plasmashell xfce4-session cinnamon mate-session Xwayland gnome-session-binary; do
    for pid in $(pgrep -u "$(id -u)" -x "$name" 2>/dev/null); do
      envf="/proc/$pid/environ"; [ -r "$envf" ] || continue
      while IFS= read -r -d '' kv; do
        case "$kv" in
          DISPLAY=*|WAYLAND_DISPLAY=*|XAUTHORITY=*|DBUS_SESSION_BUS_ADDRESS=*|XDG_RUNTIME_DIR=*) export "$kv";;
        esac
      done < "$envf"
      [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && break 2
    done
  done
fi
if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
  echo "error: no graphical session for this user; ask the user to log in to the desktop and open Chrome"
  exit 3
fi
echo "session: DISPLAY=${DISPLAY:-} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-}"

setsid "$CHROME_BIN" --restore-last-session >/dev/null 2>&1 < /dev/null &
for _ in $(seq 1 10); do
  sleep 1
  if chrome_running; then echo "chrome: launched (pid $(pgrep -u "$(id -u)" -x chrome | head -1))"; ensure_bridge; fi
done
echo "error: launched $CHROME_BIN but no chrome process appeared"
exit 4
