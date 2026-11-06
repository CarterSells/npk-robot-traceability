"""Durable sampled-observation health. Missing samples never prove a robot outage."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gateway
from upload_queue import queue_lock, queue_path, sync_directory
from unify_collector import read_json

MAX_WINDOWS = 10000


def record(directory, observation):
    """One journal per adapter/controller/reality/signal selection. Retry is idempotent."""
    items = gateway.validate_observation(observation)
    start, end = observation['window_started_at'], observation['window_ended_at']
    if gateway.timestamp(end) <= gateway.timestamp(start):
        raise ValueError('Health windows need a positive duration.')
    binding = json.dumps([observation['adapter'], observation['reality'],
                          sorted((i['name'], i['topic']) for i in items)], separators=(',', ':'))
    body = json.dumps(observation, sort_keys=True, separators=(',', ':'), allow_nan=False)
    digest = hashlib.sha256(body.encode()).hexdigest()
    directory = queue_path(directory)
    with queue_lock(directory):
        path = directory / 'observation-health.sqlite3'
        if not path.exists():
            os.close(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600))
            sync_directory(directory)
        with closing(sqlite3.connect(path)) as db:
            os.chmod(path, 0o600)
            db.execute('pragma synchronous=FULL')
            db.execute('create table if not exists windows(start text primary key, finish text not null, binding text not null, digest text not null, body text not null)')
            existing = db.execute('select digest from windows where start=?', (start,)).fetchone()
            if existing:
                if existing[0] != digest:
                    raise ValueError('Observation window conflicts with immutable history.')
            else:
                last = db.execute('select finish,binding from windows order by start desc limit 1').fetchone()
                if last and (last[1] != binding or start < last[0]):
                    raise ValueError('Use the same stream and non-overlapping chronological windows.')
                if db.execute('select count(*) from windows').fetchone()[0] >= MAX_WINDOWS:
                    raise ValueError('Health journal full; retain it and start a new reviewed interval.')
                db.execute('insert into windows values(?,?,?,?,?)', (start, end, binding, digest, body))
                db.commit()
            return summarize(json.loads(row[0]) for row in db.execute('select body from windows order by start'))


def summarize(observations):
    signals, first, last, count, unobserved = {}, None, None, 0, 0.0
    reality = None
    for observation in observations:
        items = gateway.validate_observation(observation)
        start, end = gateway.timestamp(observation['window_started_at']), gateway.timestamp(observation['window_ended_at'])
        seconds = (end-start).total_seconds()
        if seconds <= 0 or last and start < last:
            raise ValueError('Invalid health window ordering.')
        gap = (start-last).total_seconds() if last else 0
        unobserved += gap
        first = first or start
        last, reality, count = end, observation['reality'], count+1
        for item in items:
            stat = signals.setdefault(item['name'], {'sampled_seconds': 0.0, 'unknown_window_seconds': 0.0,
                'windows_with_valid_sample': 0, 'unknown_windows': 0, 'consecutive_unknown_window_seconds': 0.0,
                'last_state': 'unknown', 'last_received_at': None})
            stat['sampled_seconds'] += seconds
            if gap:
                stat['consecutive_unknown_window_seconds'] = 0.0
            stat['last_state'] = item['state']
            if item['state'] == 'unknown':
                stat['unknown_windows'] += 1
                stat['unknown_window_seconds'] += seconds
                stat['consecutive_unknown_window_seconds'] += seconds
            else:
                stat['windows_with_valid_sample'] += 1
                stat['consecutive_unknown_window_seconds'] = 0.0
                stat['last_received_at'] = item['received_at']
    return {'format': 'tavrik-gateway-health', 'version': 1, 'reality': reality, 'windows': count,
            'started_at': first.isoformat() if first else None, 'ended_at': last.isoformat() if last else None,
            'unobserved_between_windows_seconds': unobserved, 'signals': signals,
            'limitations': 'Durations describe sampled windows, not proven controller disconnections. A valid sample does not prove uninterrupted connectivity. Time outside the recorded interval is unknown.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--journal', required=True)
    parser.add_argument('--observation', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--reviewed', action='store_true', required=True)
    args = parser.parse_args()
    try:
        output = queue_path(args.output)
        if output.exists() or not output.parent.is_dir():
            raise ValueError('Choose a new private output file.')
        result = record(args.journal, read_json(Path(args.observation)))
        gateway.write_new(output, result)
        print('Observation health recorded. No robot outage or execution outcome inferred.')
        return 0
    except (ValueError, TypeError, KeyError, OSError, sqlite3.Error):
        print('Health summary unavailable. Preserve the observation and journal; retry with a new output path.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
