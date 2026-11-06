"""Tavrik read-only gateway: bounded observations, reviewed B6 event handoff."""
import argparse
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lifecycle_events as fields
import machine_events
import upload_queue as queue
from unify_collector import read_json

# Fixed types, fields and units: discovery never grants approval to capture more.
SIGNALS = {
    'ur.robot_mode': ('robot_mode', 'ur_dashboard_msgs/msg/RobotMode', 'mode', 'code', 'int'),
    'ur.safety_mode': ('safety_mode', 'ur_dashboard_msgs/msg/SafetyMode', 'mode', 'code', 'int'),
    'ur.program_running': ('robot_program_running', 'std_msgs/msg/Bool', 'data', 'boolean', 'bool'),
}

def utc():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', value):
        raise ValueError('Expected UTC milliseconds.')
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

def selection(names):
    if not isinstance(names, list) or not names or len(names) > len(SIGNALS) or any(not isinstance(n, str) or n not in SIGNALS for n in names) or len(set(names)) != len(names):
        raise ValueError('Select distinct allowlisted signals.')
    return names

def controller_name(value):
    if not isinstance(value, str) or len(value) > 160 or not re.fullmatch(r'/[A-Za-z_][A-Za-z0-9_]*(?:/[A-Za-z_][A-Za-z0-9_]*)*', value):
        raise ValueError('Use an absolute ROS controller namespace.')
    return value

def sample(adapter, names, window=2.0, controller='/io_and_status_controller', reality='synthetic'):
    """Adapter read returns only messages received in this bounded window."""
    selection(names); controller_name(controller)
    if type(window) not in (int, float) or not 0.1 <= window <= 10:
        raise ValueError('Sampling window must be 0.1-10 seconds.')
    if reality not in ('synthetic', 'simulation', 'real') or (adapter.name == 'mock' and reality != 'synthetic'):
        raise ValueError('Mock observations must remain synthetic.')
    started = utc()
    unavailable = False
    try:
        values = adapter.read(names, controller, window)
    except (OSError, RuntimeError):
        # Record a bounded observation gap, without leaking driver error details.
        values, unavailable = {}, True
    ended = utc()
    observations = []
    for name in names:
        item = values.get(name)
        state, value, at, reason = 'unknown', None, ended, 'No valid message received in the sampling window.'
        if unavailable:
            reason = 'Adapter unavailable during the sampling window.'
        if isinstance(item, dict) and set(item) == {'value', 'received_at'}:
            raw = item['value']
            valid = type(raw) is bool if SIGNALS[name][4] == 'bool' else type(raw) is int and -128 <= raw <= 127
            try:
                valid = valid and timestamp(started) <= timestamp(item['received_at']) <= timestamp(ended)
            except (ValueError, TypeError):
                valid = False
            if valid:
                state, value, at, reason = 'known', int(raw), item['received_at'], None
        observations.append({'name': name, 'topic': controller+'/'+SIGNALS[name][0], 'unit': SIGNALS[name][3],
                             'state': state, 'value': value, 'received_at': at, 'reason': reason})
    return {'format': 'tavrik-gateway-observation', 'version': 1, 'adapter': adapter.name,
            'reality': reality, 'window_started_at': started, 'window_ended_at': ended,
            'clock': 'gateway_receive_time', 'observations': observations}

class MockAdapter:
    name = 'mock'
    def __init__(self, values):
        if not isinstance(values, dict) or any(n not in SIGNALS for n in values):
            raise ValueError('Mock contains unapproved signals.')
        self.values = values
    def discover(self, controller, window):
        controller_name(controller)
        return [{'name': n, 'topic': controller+'/'+SIGNALS[n][0], 'type': SIGNALS[n][1]} for n in self.values]
    def read(self, names, controller, window):
        return {n: {'value': self.values[n], 'received_at': utc()} for n in names if n in self.values}

def validate_observation(observation):
    """Validate stored windows before either event conversion or aggregation."""
    fields.exact(observation, 'format version adapter reality window_started_at window_ended_at clock observations')
    if observation['format'] != 'tavrik-gateway-observation' or type(observation['version']) is not int or observation['version'] != 1 or observation['clock'] != 'gateway_receive_time':
        raise ValueError('Unsupported observation.')
    if observation['adapter'] not in ('mock', 'ros2-ur') or observation['reality'] not in ('synthetic', 'simulation', 'real'):
        raise ValueError('Unsupported observation source.')
    if observation['adapter'] == 'mock' and observation['reality'] != 'synthetic':
        raise ValueError('Mock observations must remain synthetic.')
    start, end = timestamp(observation['window_started_at']), timestamp(observation['window_ended_at'])
    if end < start:
        raise ValueError('Observation window reversed.')
    items = observation['observations']
    if not isinstance(items, list) or not 1 <= len(items) <= len(SIGNALS):
        raise ValueError('Invalid observation list.')
    selection([x.get('name') if isinstance(x, dict) else None for x in items])
    for item in items:
        fields.exact(item, 'name topic unit state value received_at reason')
        spec = SIGNALS[item['name']]
        if not isinstance(item['topic'], str) or not item['topic'].endswith('/'+spec[0]) or item['unit'] != spec[3]:
            raise ValueError('Signal mapping mismatch.')
        controller_name(item['topic'][:-(len(spec[0])+1)])
        if not start <= timestamp(item['received_at']) <= end:
            raise ValueError('Observation time outside sampling window.')
        if item['state'] == 'known':
            value = item['value']
            if type(value) is not int or not (-128 <= value <= 127) or (spec[4] == 'bool' and value not in (0, 1)) or item['reason'] is not None:
                raise ValueError('Invalid observed status.')
        elif item['state'] != 'unknown' or item['value'] is not None or not isinstance(item['reason'], str) or not item['reason'].strip():
            raise ValueError('Missing observation must remain unknown.')
    return items

def event_from_observation(observation, name, attempt, event_id, sequence):
    """One reviewed measurement; never infer execution state from status topics."""
    items = validate_observation(observation)
    selected = next((i for i in items if i['name'] == name), None)
    if not selected or not isinstance(attempt, dict) or attempt.get('reality') != observation['reality']:
        raise ValueError('Choose a sampled signal and matching evidence reality.')
    payload = {k: selected[k] for k in ('name', 'state', 'value', 'unit', 'reason')}
    # Name and method identify gateway receipt semantics in the existing B6 schema.
    payload['name'] += '.received'
    event = {'event_id': event_id, 'schema_version': 1, 'source_identity': attempt.get('source_identity'),
             'source_sequence': sequence, 'run_id': attempt.get('attempt_id'), 'event_type': 'execution.recorded',
             'observed_at': selected['received_at'], 'payload': {'attempt': copy.deepcopy(attempt),
             'evidence': {'kind': 'measurement', 'payload': payload, 'correction_of': None, 'reason': None}}}
    return machine_events.validate_event(event)

def enqueue(observation, name, attempt, event_id, sequence, directory):
    directory = queue.queue_path(directory)
    event = event_from_observation(observation, name, attempt, event_id, sequence)
    body = json.dumps(event, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf8')
    with queue.queue_lock(directory):
        return queue.store_bytes(body, directory)

def write_new(path, value):
    # CLI output and queues must be outside the repository, before private capture.
    path = queue.queue_path(path)
    body = json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2)
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf8') as output:
        output.write(body)
        output.flush()
        os.fsync(output.fileno())
    queue.sync_directory(path.parent)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('discover', 'sample'):
        cmd = commands.add_parser(name)
        cmd.add_argument('--adapter', choices=['mock', 'ros2-ur'], required=True)
        cmd.add_argument('--mock-values', help='Approved synthetic JSON values, no ROS required')
        cmd.add_argument('--controller', default='/io_and_status_controller')
        cmd.add_argument('--window', type=float, default=2)
        cmd.add_argument('--compatibility-reviewed', action='store_true', help='Operator verified the documented ROS/driver/controller inventory')
        cmd.add_argument('--output', required=True)
        if name == 'sample':
            cmd.add_argument('--signals', nargs='+', choices=list(SIGNALS), required=True)
            cmd.add_argument('--reality', choices=['synthetic', 'simulation', 'real'], required=True)
            cmd.add_argument('--reviewed', action='store_true', required=True)
    add = commands.add_parser('enqueue')
    for arg in ('observation', 'signal', 'attempt', 'event-id', 'queue'):
        add.add_argument('--'+arg, required=True)
    add.add_argument('--sequence', type=int, required=True)
    add.add_argument('--reviewed', action='store_true', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'enqueue':
            enqueue(read_json(Path(args.observation)), args.signal, read_json(Path(args.attempt)), args.event_id, args.sequence, queue.queue_path(args.queue))
            print('Reviewed observation queued. No network upload or robot command.')
        else:
            output = queue.queue_path(args.output)
            if output.exists() or not output.parent.is_dir():
                raise ValueError('Use a new file in an existing private directory.')
            controller_name(args.controller)
            if not 0.1 <= args.window <= 10: raise ValueError('Invalid sampling window.')
            if args.adapter == 'mock': adapter = MockAdapter(read_json(Path(args.mock_values)))
            else:
                if not args.compatibility_reviewed:
                    raise ValueError('Review controller compatibility before connecting.')
                from gateway_ros2 import Ros2Adapter
                adapter = Ros2Adapter()
            result = adapter.discover(args.controller, args.window) if args.command == 'discover' else sample(adapter, args.signals, args.window, args.controller, args.reality)
            write_new(args.output, result)
            print('Local observation written. No upload or robot command.')
    except (ValueError, TypeError, OSError, ImportError, RuntimeError):
        print('Gateway unavailable. Check approved inputs, ROS installation and private output path. No robot command was issued.')
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
