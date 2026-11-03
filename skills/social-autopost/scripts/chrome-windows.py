#!/usr/bin/env python3
"""Close leftover OpenCLI-only Chrome windows so they are not restored and do not pile up.

A window is a leftover when every tab is blank/new-tab or belongs to an OpenCLI tab
group ("OpenCLI Browser"/"OpenCLI Adapter"). Windows with any other tab are kept.

  cleanup            close every leftover window (use right before closing Chrome)
  cleanup --keep-one close leftovers but keep one window open (use after launching Chrome)
"""
import json
import subprocess
import sys

BLANK = ('about:blank', 'chrome://newtab/', 'chrome://new-tab-page/', '')
OPENCLI_GROUPS = ('OpenCLI Browser', 'OpenCLI Adapter')


def chrome(method, *args):
    out = subprocess.run(['opencli', 'browser', 'chrome', 'call', method, json.dumps(list(args))],
                         capture_output=True, text=True, timeout=30)
    data = json.loads(out.stdout or '{}')
    if not data.get('ok'):
        raise RuntimeError(f'{method}: {data.get("error") or out.stderr.strip()}')
    return data['data']


def main():
    if len(sys.argv) < 2 or sys.argv[1] != 'cleanup':
        print(__doc__)
        return 2
    keep_one = '--keep-one' in sys.argv
    groups = {g['id'] for g in chrome('tabGroups.query', {}) if g.get('title') in OPENCLI_GROUPS}
    windows = [w for w in chrome('windows.getAll', {'populate': True}) if w.get('type') == 'normal']
    leftover = [w for w in windows if all(t.get('groupId') in groups or (t.get('url') or t.get('pendingUrl') or '') in BLANK
                                          for t in w.get('tabs', []))]
    if keep_one and len(leftover) == len(windows) and leftover:
        # Keep a non-OpenCLI window when possible so Chrome stays open for the user.
        leftover.sort(key=lambda w: all(t.get('groupId') in groups for t in w.get('tabs', [])))
        leftover = leftover[1:]
    closed = []
    for window in leftover:
        try:
            chrome('windows.remove', window['id'])
            closed.append(window['id'])
        except RuntimeError as error:
            print(json.dumps({'warning': str(error)}))
    print(json.dumps({'windows_before': len(windows), 'closed': closed, 'windows_after': len(windows) - len(closed)}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
