"""Explicit approved-metadata queue for authenticated ingestion. No automatic capture."""
import argparse
import hashlib
import json
import os
import random
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
import unify_collector as collector

MAX_QUEUE_FILES = 1000
MAX_QUEUE_BYTES = 256 * 1024 * 1024

@contextmanager
def queue_lock(directory):
    """One writer/flush per local queue; OS releases the lock on process exit."""
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (directory / '.queue.lock').open('a+b') as handle:
        os.chmod(handle.name, 0o600)
        if os.name == 'nt':
            import msvcrt
            if handle.seek(0, 2) == 0:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)

def sync_directory(directory):
    # Windows does not expose directory fsync through this Python interface.
    if os.name != 'nt':
        descriptor = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def queue_path(raw):
    path = Path(raw).resolve()
    repo = Path(__file__).resolve().parent.parent
    if path == repo or repo in path.parents:
        raise ValueError('Keep the queue outside the repository.')
    return path

def enqueue(source, directory):
    with queue_lock(directory):
        return enqueue_locked(source, directory)

def enqueue_locked(source, directory):
    capture = collector.read_json(Path(source))
    collector.validate_capture(capture)
    body = json.dumps(capture, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    if len(body) > 2 * 1024 * 1024:
        raise ValueError('Capture exceeds 2 MiB.')
    return store_bytes(body, directory)

def store_bytes(body, directory):
    """Publish bounded bytes while the caller holds queue_lock."""
    if len(body) > 2 * 1024 * 1024:
        raise ValueError('Entry exceeds 2 MiB.')
    key = hashlib.sha256(body).hexdigest()
    destination = directory / (key + '.json')
    if destination.exists():
        if destination.read_bytes() != body:
            raise ValueError('Queue identity conflict.')
        return key
    entries = list(directory.glob('*.json')) + list(directory.glob('.pending-*'))
    if len(entries) >= MAX_QUEUE_FILES or sum(p.stat().st_size for p in entries) + len(body) > MAX_QUEUE_BYTES:
        raise ValueError('Queue limit reached.')
    pending = None
    try:
        with tempfile.NamedTemporaryFile(dir=directory, prefix='.pending-', delete=False) as handle:
            pending = Path(handle.name)
            os.chmod(pending, 0o600)
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(pending, destination)
        sync_directory(directory)
    finally:
        if pending is not None and pending.exists():
            pending.unlink()
    return key

def flush(directory, endpoint, token, attempts=3, opener=None, sleep=time.sleep, jitter=random.random):
    with queue_lock(directory):
        return flush_locked(directory, endpoint, token, attempts, opener, sleep, jitter)

def flush_locked(directory, endpoint, token, attempts, opener, sleep, jitter):
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment or not parsed.hostname:
        raise ValueError('Use the exact HTTPS ingestion URL.')
    if not token or not re.fullmatch(r'uc_[a-f0-9]{64}', token):
        raise ValueError('Set UNIFY_COLLECTOR_TOKEN.')
    if type(attempts) is not int or not 1 <= attempts <= 5:
        raise ValueError('Use one to five attempts.')
    opener = opener or urllib.request.build_opener(NoRedirect())
    sent = 0
    for path in sorted(directory.glob('*.json'))[:1000]:
        capture = collector.read_json(path)
        collector.validate_capture(capture)
        canonical = json.dumps(capture, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        if hashlib.sha256(canonical).hexdigest() != path.stem:
            raise ValueError('Queue identity conflict; restore the original capture.')
        body = json.dumps({'request_id': path.stem, 'capture': capture}, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        for attempt in range(attempts):
            request = urllib.request.Request(endpoint, data=body, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, method='POST')
            try:
                with opener.open(request, timeout=15) as response:
                    if response.status != 200:
                        raise ValueError('Unconfirmed upload; queue retained.')
                    result = json.loads(response.read(4096))
                    if not isinstance(result, dict) or type(result.get('version')) is not int or result['version'] < 1 or not isinstance(result.get('duplicate'), bool):
                        raise ValueError('Unconfirmed upload; queue retained.')
                path.unlink()  # Only the acknowledged queue copy; retain the original capture.
                sync_directory(directory)
                sent += 1
                break
            except urllib.error.HTTPError as error:
                retry = error.code in (408, 429) or 500 <= error.code < 600
                error.close()
                if not retry or attempt == attempts - 1:
                    raise ValueError('Upload rejected; queue retained.') from None
            except (urllib.error.URLError, TimeoutError):
                if attempt == attempts - 1:
                    raise ValueError('Upload unavailable; queue retained.') from None
            sleep(min(2 ** attempt, 4) * (0.5 + 0.5 * jitter()))
    return sent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--queue', required=True, help='Private directory outside the repository')
    commands = parser.add_subparsers(dest='command', required=True)
    add = commands.add_parser('enqueue')
    add.add_argument('--capture', required=True)
    add.add_argument('--reviewed', action='store_true', required=True)
    send = commands.add_parser('flush')
    send.add_argument('--endpoint', required=True)
    add_event = commands.add_parser('enqueue-event')
    add_event.add_argument('--event', required=True)
    add_event.add_argument('--reviewed', action='store_true', required=True)
    send_events = commands.add_parser('flush-events')
    send_events.add_argument('--endpoint', required=True, help='Exact HTTPS /api/v1/events URL')
    args = parser.parse_args()
    try:
        directory = queue_path(args.queue)
        if args.command == 'enqueue':
            enqueue(args.capture, directory)
            print('Reviewed capture queued. No network request made.')
        elif args.command == 'flush':
            count = flush(directory, args.endpoint, os.environ.get('UNIFY_COLLECTOR_TOKEN', ''))
            print(f'{count} queued captures acknowledged.')
        else:
            from machine_events import enqueue_event, flush_events
            if args.command == 'enqueue-event':
                enqueue_event(args.event, directory)
                print('Reviewed event queued. No network request made.')
            else:
                count = flush_events(directory, args.endpoint, os.environ.get('UNIFY_MACHINE_TOKEN', ''))
                print(f'{count} queued events acknowledged or reconciled.')
    except (ValueError, OSError):
        print('Operation failed. Queue retained; check input, access and documented limits.')
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
