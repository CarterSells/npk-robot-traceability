"""Local example: authenticated report inbox with durable duplicate detection."""
import argparse
from contextlib import closing
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3
import time


def accept(db, raw, event_id, timestamp, signatures, secrets, now=None):
    now = time.time() if now is None else now
    if len(raw) > 131072 or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', event_id) or not re.fullmatch(r'\d{10}', timestamp) or abs(now-int(timestamp)) > 300:
        return 401
    signed = ('v1.'+timestamp+'.'+event_id+'.').encode()+raw
    if not any(hmac.compare_digest(hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest(), signature)
               for secret in secrets for signature in signatures.split(',') if re.fullmatch(r'[a-f0-9]{64}', signature)):
        return 401
    try:
        payload = json.loads(raw)
        if set(payload) != {'schema_version', 'event_id', 'event_type', 'report'} or payload['schema_version'] != 1 or payload['event_id'] != event_id or payload['event_type'] not in ('report.published', 'report.corrected') or not isinstance(payload['report'], dict):
            return 400
    except (ValueError, TypeError):
        return 400
    digest = hashlib.sha256(raw).hexdigest()
    old = db.execute('select digest from inbox where event_id=?', (event_id,)).fetchone()
    if old:
        return 200 if old[0] == digest else 409
    # Durable inbox before acknowledgement. Downstream processors must deduplicate too.
    db.execute('insert into inbox values(?,?,?,?)', (event_id, digest, raw, now))
    db.commit()
    return 200


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, help='Private preconfigured directory outside repository')
    parser.add_argument('--port', type=int, default=8099)
    args = parser.parse_args()
    directory = Path(args.directory).resolve()
    repo = Path(__file__).resolve().parent.parent
    if not directory.is_dir() or directory == repo or repo in directory.parents:
        raise ValueError('Configure a private directory outside the repository first.')
    secrets = json.loads(os.environ.get('TAVRIK_REPORT_SIGNING_SECRETS', '[]'))
    if not isinstance(secrets, list) or not 1 <= len(secrets) <= 2 or any(not isinstance(s, str) or not re.fullmatch(r'[a-f0-9]{64}', s) for s in secrets):
        raise ValueError('Configure one or two signing secrets in the environment.')
    path = directory / 'report-inbox.sqlite3'
    if not path.exists():
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600);os.close(fd)
    with closing(sqlite3.connect(path)) as db:
        db.execute('pragma synchronous=FULL')
        db.execute('create table if not exists inbox(event_id text primary key,digest text not null,body blob not null,received_at real not null)');db.commit()
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass  # No request URLs, bodies, signatures or secrets in logs.
            def do_POST(self):
                try:
                    length = int(self.headers.get('Content-Length', '-1'))
                    if self.path != '/reports' or self.headers.get('Transfer-Encoding') or not 0 <= length <= 131072:
                        self.send_error(400);return
                    raw = self.rfile.read(length)
                    if len(raw) != length:
                        self.send_error(400);return
                    status = accept(db, raw, self.headers.get('X-Tavrik-Event-Id', ''), self.headers.get('X-Tavrik-Timestamp', ''), self.headers.get('X-Tavrik-Signature', ''), secrets)
                    self.send_response(status);self.send_header('Content-Length','0');self.end_headers()
                except (ValueError, OSError, sqlite3.Error):
                    self.send_error(503)
        with HTTPServer(('127.0.0.1', args.port), Handler) as server:
            server.timeout = 5
            print('Local example receiver ready. Production requires approved HTTPS ingress and private storage.')
            server.serve_forever()


if __name__ == '__main__':
    main()
