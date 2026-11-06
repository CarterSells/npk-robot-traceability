"""Wrap an explicitly reviewed capture. Never capture data or upload automatically."""
import argparse
from datetime import datetime
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from machine_events import validate_event
from unify_collector import read_json

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--identity', required=True)
    parser.add_argument('--event-id', required=True)
    parser.add_argument('--sequence', required=True, type=int)
    parser.add_argument('--reviewed', action='store_true', required=True)
    args = parser.parse_args()
    capture = read_json(Path(args.capture))
    run = capture['records']['runs'][0]
    event = validate_event({'event_id': args.event_id, 'schema_version': 1, 'source_identity': args.identity,
        'source_sequence': args.sequence, 'run_id': run['id'], 'event_type': 'run.recorded',
        'observed_at': datetime.fromisoformat(run['at'].replace('Z', '+00:00')).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'payload': {'capture': capture}})
    with Path(args.output).open('x', encoding='utf-8') as output:
        json.dump(event, output, ensure_ascii=False, allow_nan=False)

if __name__ == '__main__':
    main()
