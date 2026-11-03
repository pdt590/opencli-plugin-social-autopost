#!/usr/bin/env python3
"""Delete old cron run folders, keeping the newest N (default 5).

Before deleting a folder, its dedupe evidence (every *sha256* field from its
JSON manifests plus the caption hash) is copied into the matching ledger run
as `archived_evidence`, so duplicate detection keeps working without the files.
Skips everything while another run holds the publication lock.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path

STATE = Path(os.environ.get('SOCIAL_AUTOPOST_HOME', Path.home() / '.hermes/social-autopost'))
RUNS = STATE / 'runs'
LEDGER = STATE / 'ledger.json'
LEDGER_LOCK = STATE / 'ledger.lock'
PUBLICATION_LOCK = STATE / '.publication.lock'
IMAGE_FIELDS = {'order', 'width', 'height', 'mode', 'format', 'source_format'}


def publication_busy():
    with PUBLICATION_LOCK.open('a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(handle, fcntl.LOCK_UN)
    return False


def hash_records(value, found):
    if isinstance(value, dict):
        hashes = {k: v for k, v in value.items() if 'sha256' in k.lower() and isinstance(v, str)}
        if hashes:
            found.append({**hashes, **{k: value[k] for k in IMAGE_FIELDS if k in value}})
        for child in value.values():
            hash_records(child, found)
    elif isinstance(value, list):
        for child in value:
            hash_records(child, found)


def evidence(folder):
    records, files = [], []
    for path in sorted(folder.rglob('*.json')):
        name = path.name.lower()
        if 'manifest' not in name and name not in ('source.json', 'qa.json', 'candidates-hashes.json'):
            continue
        try:
            before = len(records)
            hash_records(json.loads(path.read_text(encoding='utf-8')), records)
            if len(records) > before:
                files.append(str(path.relative_to(folder)))
        except (OSError, ValueError):
            continue
    result = {'run_dir': folder.name, 'archived_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
              'source_files': files, 'hash_records': records}
    caption = folder / 'caption.txt'
    if caption.is_file():
        result['caption_sha256'] = hashlib.sha256(caption.read_bytes()).hexdigest()
    return result


def matches(entry, name):
    run_id = str(entry.get('run_id') or entry.get('id') or '')
    if run_id and name in (run_id, f'cron-{run_id}', run_id.removeprefix('cron-')):
        return True
    # Only the run's own path fields; other runs may cite this folder as dedupe evidence.
    own_paths = [entry.get(key) for key in ('run_dir', 'image_manifest', 'images_manifest')]
    return any(isinstance(p, str) and f'/runs/{name}' in p for p in own_paths)


def archive(evidences):
    with LEDGER_LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        ledger = json.loads(LEDGER.read_text(encoding='utf-8'))
        for item in evidences:
            if not item['hash_records'] and 'caption_sha256' not in item:
                continue
            targets = [entry for entry in ledger.get('runs', []) if isinstance(entry, dict) and matches(entry, item['run_dir'])]
            for entry in targets:
                entry['archived_evidence'] = item
            if not targets:
                ledger.setdefault('archived_runs', []).append(item)
        fd, tmp = tempfile.mkstemp(dir=STATE, prefix='.ledger-', suffix='.json')
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(ledger, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, LEDGER)


def run_time(folder):
    # Run folders carry their start time (20261103T022037Z, 20261023-145918, cron-...);
    # mtime is unreliable because later runs may write into old folders.
    match = re.search(r'(\d{8})[T-]?(\d{0,6})', folder.name)
    if not match:
        return None
    try:
        return time.mktime(time.strptime(match[1] + match[2].ljust(6, '0'), '%Y%m%d%H%M%S'))
    except ValueError:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--keep', type=int, default=5)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if not RUNS.is_dir():
        print(json.dumps({'status': 'no-runs-dir'}))
        return 0
    if publication_busy():
        print(json.dumps({'status': 'skipped-busy', 'reason': 'another run holds the publication lock'}))
        return 0
    # Folders without a run timestamp (manual work dirs) are never counted or deleted.
    folders = sorted((p for p in RUNS.iterdir() if p.is_dir() and run_time(p) is not None), key=run_time, reverse=True)
    keep, old = folders[:args.keep], folders[args.keep:]
    report = {'status': 'dry-run' if args.dry_run else 'pruned', 'kept': [p.name for p in keep], 'deleted': [p.name for p in old]}
    if args.dry_run or not old:
        print(json.dumps(report, ensure_ascii=False))
        return 0
    if LEDGER.is_file():
        archive([evidence(p) for p in old])
    freed = 0
    for folder in old:
        freed += sum(f.stat().st_size for f in folder.rglob('*') if f.is_file())
        shutil.rmtree(folder)
    report['freed_mb'] = round(freed / 1048576, 1)
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
