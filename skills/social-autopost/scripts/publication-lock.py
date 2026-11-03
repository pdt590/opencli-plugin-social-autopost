#!/usr/bin/env python3
"""Hold the cron publication lock for a whole run across many tool calls.

  hold    --run-id ID  start in a background terminal; holds the flock until
                       `release` is called or this process dies (no time limit)
  status  --run-id ID  exit 0 only while this run owns the lock
  release --run-id ID  ask the holder to exit and wait until the lock is free

Commands run while the lock is held must not wrap themselves in `flock` on the
same file; the holder already owns it.
"""
import argparse
import fcntl
import json
import os
import sys
import time
from pathlib import Path

STATE = Path(os.environ.get('SOCIAL_AUTOPOST_HOME', Path.home() / '.hermes/social-autopost'))
LOCK = STATE / '.publication.lock'
OWNER = STATE / '.publication.owner.json'


def release_flag(run_id):
    return STATE / f'.publication.release-{run_id}'


def owner():
    try:
        data = json.loads(OWNER.read_text())
        os.kill(data['pid'], 0)
        return data
    except (OSError, ValueError, KeyError):
        return None


def hold(run_id):
    handle = LOCK.open('a')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(json.dumps({'status': 'busy', 'owner': owner()}))
        return 2
    release_flag(run_id).unlink(missing_ok=True)
    OWNER.write_text(json.dumps({'run_id': run_id, 'pid': os.getpid(), 'since': time.time()}))
    print(json.dumps({'status': 'held', 'run_id': run_id, 'pid': os.getpid()}), flush=True)
    try:
        while not release_flag(run_id).exists():
            time.sleep(1)
    finally:
        OWNER.unlink(missing_ok=True)
        release_flag(run_id).unlink(missing_ok=True)
        handle.close()
    print(json.dumps({'status': 'released', 'run_id': run_id}), flush=True)
    return 0


def status(run_id):
    data = owner()
    held = bool(data and data.get('run_id') == run_id)
    print(json.dumps({'status': 'held' if held else 'not-held', 'owner': data}))
    return 0 if held else 1


def release(run_id):
    data = owner()
    if not data or data.get('run_id') != run_id:
        print(json.dumps({'status': 'not-held', 'owner': data}))
        return 1
    release_flag(run_id).touch()
    for _ in range(30):
        if not owner():
            print(json.dumps({'status': 'released', 'run_id': run_id}))
            return 0
        time.sleep(1)
    print(json.dumps({'status': 'release-timeout', 'owner': owner()}))
    return 3


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['hold', 'status', 'release'])
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    sys.exit({'hold': hold, 'status': status, 'release': release}[args.action](args.run_id))
