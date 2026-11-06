"""B5 approved run events. Transport retries never execute a physical job."""
import hashlib
import json
import re
import time
import random
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
import unify_collector as collector
import upload_queue as queue

UUID = re.compile(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}')

def validate_event(event):
    keys = {'event_id', 'schema_version', 'run_id', 'source_identity', 'source_sequence', 'observed_at', 'event_type', 'payload'}
    if not isinstance(event, dict) or set(event) != keys:
        raise ValueError('Missing or unsupported event fields.')
    for key in ('event_id', 'source_identity'):
        if not isinstance(event[key], str) or not UUID.fullmatch(event[key]):
            raise ValueError('Use lowercase UUID identifiers.')
    if type(event['schema_version']) is not int or event['schema_version'] != 1 or event['event_type'] not in ('run.recorded', 'execution.recorded'):
        raise ValueError('Unsupported event version or type.')
    if type(event['source_sequence']) is not int or not 0 <= event['source_sequence'] <= 9007199254740991:
        raise ValueError('Use a persistent nonnegative safe integer sequence.')
    observed = event['observed_at']
    if not isinstance(observed, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', observed):
        raise ValueError('Use a UTC timestamp with milliseconds.')
    at = datetime.fromisoformat(observed.replace('Z', '+00:00'))
    payload = event['payload']
    if event['event_type'] == 'execution.recorded':
        from lifecycle_events import validate_payload
        validate_payload(event)
        if len(json.dumps(event, ensure_ascii=False).encode('utf-8')) > 16384:
            raise ValueError('Execution event exceeds 16 KiB.')
        return event
    if not isinstance(payload, dict) or set(payload) != {'capture'}:
        raise ValueError('Only approved capture payloads are supported.')
    capture = payload['capture']
    collector.validate_capture(capture)
    runs = capture['records']['runs']
    if len(runs) != 1 or runs[0]['id'] != event['run_id'] or datetime.fromisoformat(runs[0]['at'].replace('Z', '+00:00')) != at:
        raise ValueError('Event must match the exact captured run and observation time.')
    return event

def enqueue_event(source, directory):
    event = validate_event(collector.read_json(Path(source)))
    body = json.dumps(event, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')
    with queue.queue_lock(directory):
        return queue.store_bytes(body, directory)

def flush_events(directory, endpoint, token, opener=None, sleep=time.sleep, jitter=random.random):
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != '/api/v1/events':
        raise ValueError('Use the exact HTTPS /api/v1/events URL.')
    if not token or not re.fullmatch(r'um_[a-f0-9]{64}', token):
        raise ValueError('Set UNIFY_MACHINE_TOKEN.')
    opener = opener or urllib.request.build_opener(queue.NoRedirect())

    def request(url, body=None):
        for attempt in range(3):
            req = urllib.request.Request(url, data=body, method='GET' if body is None else 'POST',
                headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
            try:
                with opener.open(req, timeout=15) as response:
                    if response.status != 200:
                        raise ValueError('Unconfirmed event; queue retained.')
                    return json.loads(response.read(8192))
            except urllib.error.HTTPError as error:
                status = error.code
                error.close()
                if status == 404 and body is None:
                    return None
                if status not in (408, 429) and not 500 <= status < 600:
                    raise ValueError('Event rejected; queue retained.') from None
                if attempt == 2:
                    raise ValueError('Event unavailable; queue retained.') from None
                # Respect the API's fixed 60-second throttling window.
                sleep(60 if status == 429 else min(2 ** attempt, 4) * (0.5 + 0.5 * jitter()))
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise ValueError('Event unavailable; queue retained.') from None
                sleep(min(2 ** attempt, 4) * (0.5 + 0.5 * jitter()))

    sent = 0
    with queue.queue_lock(directory):
        for path in sorted(directory.glob('*.json'))[:queue.MAX_QUEUE_FILES]:
            if path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError('Oversized queue entry.')
            body = path.read_bytes()
            digest = hashlib.sha256(body).hexdigest()
            if digest != path.stem:
                raise ValueError('Queue identity conflict.')
            event = validate_event(json.loads(body))
            receipt = request(endpoint + '/' + event['event_id'])
            if receipt is None:
                receipt = request(endpoint, body)
            if (not isinstance(receipt, dict) or receipt.get('event_id') != event['event_id']
                or receipt.get('source_identity') != event['source_identity']
                or receipt.get('source_sequence') != event['source_sequence']
                or receipt.get('body_hash') != digest or type(receipt.get('version')) is not int
                or receipt['version'] < 1 or type(receipt.get('duplicate')) is not bool):
                raise ValueError('Receipt does not confirm these exact queued bytes.')
            path.unlink()
            queue.sync_directory(directory)
            sent += 1
    return sent
