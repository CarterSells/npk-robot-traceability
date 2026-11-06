"""Tavrik local metadata collector. Python 3.10+, no third-party dependencies."""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import queue
import re
import subprocess
import sys
import threading
import time
import uuid

# Support direct execution under embedded Python as well as normal installations.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import custom_metadata

MAX_BYTES = 2 * 1024 * 1024
FIELDS = ('hardware', 'software', 'firmware', 'model', 'lineage', 'calibration', 'gripForce', 'procedure', 'object', 'conditions')
MEASUREMENTS = ('speed_m_s', 'ambient_C', 'payload_kg')


class Invalid(ValueError):
    """Safe error: never include input values or subprocess output."""


def require(ok, path, message):
    if not ok:
        raise Invalid(f'{path}: {message}')


def obj(value, keys, path):
    require(isinstance(value, dict), path, 'expected an object')
    require(set(value) <= set(keys), path, 'contains unsupported fields')
    return value


def text(value, path, limit=512):
    # Match JavaScript's UTF-16 string length at the website import boundary.
    require(isinstance(value, str) and bool(value.strip().strip('\ufeff').strip()) and len(value.encode('utf-16-le', errors='surrogatepass')) // 2 <= limit, path, f'expected nonempty text, at most {limit} UTF-16 units')
    return value


def identifier(value, path):
    text(value, path, 120)
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', value), path, 'invalid identifier')


def stamp(value, path):
    try:
        require(isinstance(value, str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', value), path, 'expected UTC time')
        datetime.strptime(value, '%Y-%m-%dT%H:%M:%SZ')
    except ValueError:
        raise Invalid(f'{path}: expected a real UTC time YYYY-MM-DDTHH:mm:ssZ') from None
    return value


def now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def number(value, path, negative=False):
    try:
        valid = type(value) in (int, float) and math.isfinite(value) and (negative or value >= 0)
    except OverflowError:
        valid = False
    require(valid, path, 'expected a finite measurement in the named unit')


def field(value, key):
    path = f'values.{key}'
    obj(value, ('state', 'value', 'reason'), path)
    if value.get('state') in ('unknown', 'not-applicable'):
        require('value' not in value, path, 'missing fields cannot carry a value')
        text(value.get('reason'), path, 2048)
        return
    require(value.get('state') == 'known' and 'reason' not in value, path, 'invalid information state')
    v = value.get('value')
    if key == 'hardware':
        obj(v, ('component', 'revision'), path)
        for k in ('component', 'revision'):
            text(v.get(k), path, 120)
    elif key == 'software':
        obj(v, ('commit', 'dirty', 'buildDigest'), path)
        require(isinstance(v.get('commit'), str) and re.fullmatch('[a-f0-9]{40}', v['commit']), path, 'invalid Git commit')
        require(type(v.get('dirty')) is bool, path, 'dirty must be boolean')
        if 'buildDigest' in v:
            text(v['buildDigest'], path, 256)
    elif key == 'conditions':
        obj(v, MEASUREMENTS, path)
        require(bool(v), path, 'record a measurement or use unknown')
        for k, n in v.items():
            number(n, path, k == 'ambient_C')
    elif key == 'gripForce':
        number(v, path)
    else:
        text(v, path)


def read_json(path):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'JSON', 'duplicate keys are not allowed')
            result[key] = value
        return result
    try:
        with Path(path).open('rb') as stream:
            data = stream.read(MAX_BYTES + 1)
        require(len(data) <= MAX_BYTES, 'JSON', 'maximum size is 2 MiB')
        return json.loads(data.decode('utf-8-sig'), object_pairs_hook=pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(Invalid('JSON: nonfinite number')))
    except Invalid:
        raise
    except (OSError, UnicodeError, ValueError, RecursionError):
        raise Invalid('JSON: cannot read a valid bounded UTF-8 file') from None


def command(args, timeout=5, limit=65536):
    """Bound output and execution time; no shell or stderr capture."""
    start = time.monotonic()
    env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
    env['GIT_OPTIONAL_LOCKS'] = '0'
    try:
        with subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              stdin=subprocess.DEVNULL, env=env) as process:
            result = queue.Queue()
            def drain():
                try:
                    result.put(process.stdout.read(limit + 1))
                except OSError:
                    result.put(b'')
            reader = threading.Thread(target=drain, daemon=True)
            reader.start()
            try:
                output = result.get(timeout=timeout)
                require(len(output) <= limit, 'capture', 'command output exceeded limit')
                code = process.wait(timeout=max(0.01, timeout - (time.monotonic() - start)))
                require(code == 0, 'capture', 'command unavailable or failed')
                return output.decode('utf-8').strip()
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait()
                reader.join(timeout=1)
    except (OSError, UnicodeError, queue.Empty, subprocess.TimeoutExpired):
        raise Invalid('capture: command unavailable, invalid output, or timed out') from None


def git_value(path):
    prefix = ['git', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', str(path)]
    commit = command(prefix + ['rev-parse', '--verify', 'HEAD'])
    status = command(prefix + ['status', '--porcelain=v1', '--untracked-files=normal', '--ignore-submodules=none'])
    value = {'state': 'known', 'value': {'commit': commit, 'dirty': bool(status)}}
    field(value, 'software')
    return value


def hash_file(path):
    digest = hashlib.sha256()
    try:
        require(Path(path).is_file(), 'artifact', 'expected a regular file')
        with Path(path).open('rb') as stream:
            before = os.fstat(stream.fileno())
            deadline = time.monotonic() + 30
            while block := stream.read(1024 * 1024):
                require(time.monotonic() <= deadline, 'artifact', 'hashing exceeded 30 seconds')
                digest.update(block)
            after = os.fstat(stream.fileno())
        current = Path(path).stat()
        identity = lambda s: (s.st_size, s.st_mtime_ns, s.st_ino)
        require(identity(before) == identity(after) == identity(current), 'artifact', 'file changed during capture')
    except OSError:
        raise Invalid('artifact: file unavailable') from None
    return {'state': 'known', 'value': 'sha256:' + digest.hexdigest()}


def unknown(reason='No source configured.'):
    return {'state': 'unknown', 'reason': reason}


def encode(bundle):
    return (json.dumps(bundle, indent=2, sort_keys=True, ensure_ascii=True, allow_nan=False) + '\n').encode('utf-8')


def validate_capture(bundle):
    """Validate collector handoffs; corrected workspace exports use the site's validator."""
    obj(bundle, ('format', 'version', 'synthetic', 'records', 'corrections', 'mappings'), 'capture')
    require(bundle.get('format') == 'unify-local' and type(bundle.get('version')) is int and bundle['version'] in (1, 2), 'capture', 'expected unify-local version 1 or 2')
    require(type(bundle.get('synthetic')) is bool and bundle.get('corrections') == [], 'capture', 'invalid collector envelope')
    if 'mappings' in bundle:
        require(bundle['version'] == 2 and isinstance(bundle['mappings'], list) and len(bundle['mappings']) <= 1000, 'capture', 'invalid mappings')
        seen = set()
        for mapping in bundle['mappings']:
            custom_metadata.validate_mapping(mapping, sys.modules[__name__])
            require(mapping['id'] not in seen, 'capture', 'duplicate mapping')
            seen.add(mapping['id'])
    records = obj(bundle.get('records'), ('robots', 'snapshots', 'runs'), 'records')
    for k in ('robots', 'snapshots', 'runs'):
        require(isinstance(records.get(k), list), 'records', 'expected arrays')
    require(len(records['robots']) == len(records['snapshots']) == 1 and len(records['runs']) <= 1, 'capture', 'expected one robot, one snapshot and at most one run')
    robot = obj(records['robots'][0], ('id', 'name', 'task'), 'robot')
    identifier(robot.get('id'), 'robot.id')
    text(robot.get('name'), 'robot.name', 120)
    text(robot.get('task'), 'robot.task')
    s = obj(records['snapshots'][0], ('id', 'revision', 'robotId', 'schemaVersion', 'hardwareConfirmedAt', 'values', 'provenance', 'custom'), 'snapshot')
    identifier(s.get('id'), 'snapshot.id')
    require(type(s.get('revision')) is int and s['revision'] == 1 and type(s.get('schemaVersion')) is int and s['schemaVersion'] in (1, 2), 'snapshot', 'collector snapshots start at revision 1')
    if s['schemaVersion'] == 2:
        require(bundle['version'] == 2, 'snapshot', 'custom fields need version 2')
        custom_metadata.validate_custom(s.get('custom'), sys.modules[__name__])
    else:
        require('custom' not in s, 'snapshot', 'custom fields need version 2')
    require(s.get('robotId') == robot['id'], 'snapshot', 'robot reference mismatch')
    stamp(s.get('hardwareConfirmedAt'), 'hardwareConfirmedAt')
    obj(s.get('values'), FIELDS, 'values')
    obj(s.get('provenance'), FIELDS, 'provenance')
    for key in FIELDS:
        field(s['values'].get(key), key)
        p = obj(s['provenance'].get(key), ('source', 'method', 'author', 'observedAt', 'recordedAt', 'evidence', 'available'), 'provenance')
        for k in ('source', 'method', 'author', 'evidence'):
            text(p.get(k), f'provenance.{k}')
        stamp(p.get('observedAt'), 'observedAt')
        stamp(p.get('recordedAt'), 'recordedAt')
        require(p['observedAt'] <= p['recordedAt'] and type(p.get('available')) is bool, 'provenance', 'invalid time or availability')
    hp = s['provenance']['hardware']
    require('manual' in hp['method'].lower() and hp['observedAt'] == s['hardwareConfirmedAt'], 'hardware', 'manual provenance mismatch')
    for run in records['runs']:
        obj(run, ('id', 'robotId', 'snapshotId', 'snapshotRevision', 'at', 'outcome', 'successfulPicks', 'attemptedPicks'), 'run')
        identifier(run.get('id'), 'run.id')
        stamp(run.get('at'), 'run.at')
        require(run.get('robotId') == robot['id'] and run.get('snapshotId') == s['id'] and type(run.get('snapshotRevision')) is int and run['snapshotRevision'] == 1, 'run', 'exact snapshot reference mismatch')
        require(run.get('outcome') in ('success', 'failure'), 'run', 'explicit outcome required')
        if s['schemaVersion'] == 1 or 'successfulPicks' in run or 'attemptedPicks' in run:
            require(type(run.get('successfulPicks')) is int and type(run.get('attemptedPicks')) is int and 0 <= run['successfulPicks'] <= run['attemptedPicks'] and 0 < run['attemptedPicks'] <= 9007199254740991, 'run', 'invalid pick counts')
        require(run['at'] >= max(p['observedAt'] for p in [*s['provenance'].values(), *(f['provenance'] for f in s.get('custom', []))]), 'run', 'run precedes capture or reported observation')
    require(len(encode(bundle)) <= MAX_BYTES, 'capture', 'maximum size is 2 MiB')
    return bundle


def capture(config, base):
    obj(config, ('version', 'synthetic', 'robot', 'author', 'git', 'model', 'calibration', 'hardware', 'settings', 'metadata', 'ros2', 'custom'), 'config')
    require(type(config.get('version')) is int and config['version'] == 1, 'config', 'expected version 1')
    require(type(config.get('synthetic')) is bool, 'config', 'synthetic must be explicit')
    author = text(config.get('author'), 'author')
    captured = now()
    values = {k: unknown() for k in FIELDS}
    provenance = {k: {'source': 'Tavrik local collector', 'method': 'Missing information declaration', 'author': author, 'observedAt': captured, 'recordedAt': captured, 'evidence': 'No evidence supplied', 'available': False} for k in FIELDS}
    provenance['hardware']['method'] = 'Manual hardware report unavailable'
    def path(name):
        return Path(base) / text(config[name], f'config.{name}', 4096)
    def collect(key, action, method):
        try:
            values[key] = action()
            provenance[key].update(method=method, evidence='Local source inspected; source path omitted', available=True)
        except Invalid:
            values[key] = unknown('Configured source unavailable, invalid, changed, or timed out.')
            provenance[key]['method'] = method + ' (unsuccessful)'
        provenance[key]['observedAt'] = now()
    if 'git' in config:
        collect('software', lambda: git_value(path('git')), 'Automatic Git commit and dirty-state capture')
    for key in ('model', 'calibration'):
        if key in config:
            collect(key, lambda k=key: hash_file(path(k)), 'Automatic SHA-256 of explicit local file')
    if 'hardware' in config:
        try:
            hardware = read_json(path('hardware'))
        except Invalid:
            values['hardware'] = unknown('Manual hardware manifest unavailable or unreadable.')
        else:
            obj(hardware, ('version', 'hardware', 'author', 'confirmedAt', 'evidence', 'available'), 'hardware manifest')
            require(type(hardware.get('version')) is int and hardware['version'] == 1, 'hardware manifest', 'expected version 1')
            field(hardware.get('hardware'), 'hardware')
            values['hardware'] = hardware['hardware']
            provenance['hardware'].update(source='Operator hardware manifest v1', method='Manual hardware report', author=text(hardware.get('author'), 'hardware.author'), observedAt=stamp(hardware.get('confirmedAt'), 'hardware.confirmedAt'), evidence=text(hardware.get('evidence'), 'hardware.evidence'), available=hardware.get('available'))
    metadata = obj(config.get('metadata', {}), ('firmware', 'lineage', 'procedure', 'object', 'model', 'calibration'), 'metadata')
    for key, entry in metadata.items():
        require(key not in config, 'metadata', 'choose either a file or a declared field, not both')
        obj(entry, ('field', 'observedAt', 'evidence', 'available'), 'metadata entry')
        field(entry.get('field'), key)
        values[key] = entry['field']
        provenance[key].update(method='Manual metadata declaration', observedAt=stamp(entry.get('observedAt'), 'metadata.observedAt'), evidence=text(entry.get('evidence'), 'metadata.evidence'), available=entry.get('available'))
    if 'settings' in config:
        try:
            settings = read_json(path('settings'))
            require(isinstance(settings, dict), 'settings', 'expected object')
        except Invalid:
            settings = {}
        # Project only supported measurements. Arbitrary settings never enter output.
        for key in ('gripForce', 'conditions'):
            if key in settings:
                v = settings[key]
                if key == 'conditions' and isinstance(v, dict):
                    v = {k: v[k] for k in MEASUREMENTS if k in v}
                candidate = {'state': 'known', 'value': v}
                try:
                    field(candidate, key)
                    values[key] = candidate
                    provenance[key].update(method='Allowlisted local JSON measurement capture', evidence='Selected local settings; path omitted', available=True)
                except Invalid:
                    values[key] = unknown('Configured measurement is invalid or unsupported.')
            else:
                values[key] = unknown('Configured settings missing or measurement absent.')
            provenance[key]['observedAt'] = now()
    if 'ros2' in config:
        ros = obj(config['ros2'], ('node', 'parameter', 'timeoutSeconds'), 'ros2')
        require('settings' not in config, 'ros2', 'choose local settings or ROS 2, not both')
        node = text(ros.get('node'), 'ros2.node', 120)
        require(re.fullmatch(r'/[A-Za-z_][A-Za-z0-9_/]*', node), 'ros2.node', 'expected an absolute node name')
        require(ros.get('parameter') == 'grip_force', 'ros2.parameter', 'only grip_force is allowlisted (newtons)')
        timeout = ros.get('timeoutSeconds', 3)
        require(type(timeout) in (int, float) and 0.1 <= timeout <= 10, 'ros2.timeoutSeconds', 'expected 0.1 to 10 seconds')
        def ros_value():
            result = command(['ros2', 'param', 'get', '--hide-type', node, 'grip_force'], timeout, 128)
            try:
                candidate = {'state': 'known', 'value': float(result)}
            except ValueError:
                raise Invalid('ros2: nonnumeric parameter') from None
            field(candidate, 'gripForce')
            return candidate
        collect('gripForce', ros_value, 'Optional ROS 2 parameter read: grip_force (N)')
    recorded = now()
    for p in provenance.values():
        p['recordedAt'] = recorded
    robot = config.get('robot')
    snapshot = {'id': 'capture-' + uuid.uuid4().hex, 'revision': 1, 'schemaVersion': 1, 'robotId': robot.get('id') if isinstance(robot, dict) else None, 'hardwareConfirmedAt': provenance['hardware']['observedAt'], 'values': values, 'provenance': provenance}
    bundle = {'format': 'unify-local', 'version': 1, 'synthetic': config['synthetic'], 'records': {'robots': [robot], 'snapshots': [snapshot], 'runs': []}, 'corrections': []}
    if 'custom' in config:
        mapping, custom = custom_metadata.capture(config['custom'], base, author, sys.modules[__name__])
        bundle.update(version=2, mappings=[mapping])
        snapshot.update(schemaVersion=2, custom=custom)
    return validate_capture(bundle)


def attach_run(bundle, result):
    validate_capture(bundle)
    require(not bundle['records']['runs'], 'capture', 'run already attached; capture a new snapshot for each test')
    obj(result, ('id', 'at', 'outcome', 'successfulPicks', 'attemptedPicks'), 'result')
    next_bundle = copy.deepcopy(bundle)
    s = next_bundle['records']['snapshots'][0]
    next_bundle['records']['runs'].append({**result, 'robotId': s['robotId'], 'snapshotId': s['id'], 'snapshotRevision': s['revision']})
    return validate_capture(next_bundle)


def write_new(path, bundle):
    validate_capture(bundle)
    try:
        with Path(path).open('xb') as stream:
            stream.write(encode(bundle))
    except OSError:
        raise Invalid('output: cannot create file; choose a new filename in an existing writable directory') from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='action', required=True)
    collect = subs.add_parser('capture', help='Capture local metadata; no upload')
    collect.add_argument('--config', required=True)
    destination = collect.add_mutually_exclusive_group(required=True)
    destination.add_argument('--output')
    destination.add_argument('--dry-run', action='store_true', help='Preview metadata without writing a file')
    attach = subs.add_parser('attach-run', help='Bind runner results to the snapshot captured before the test')
    attach.add_argument('--capture', required=True)
    attach.add_argument('--run', required=True)
    attach.add_argument('--output', required=True)
    check = subs.add_parser('validate', help='Validate a one-snapshot collector handoff')
    check.add_argument('file')
    args = parser.parse_args(argv)
    try:
        if args.action == 'validate':
            validate_capture(read_json(args.file))
            print('Valid collector handoff.')
            return 0
        if args.action == 'capture':
            bundle = capture(read_json(args.config), Path(args.config).resolve().parent)
        else:
            bundle = attach_run(read_json(args.capture), read_json(args.run))
        if args.action == 'capture' and args.dry_run:
            print(encode(bundle).decode('utf-8'), end='')
        else:
            write_new(args.output, bundle)
            missing = sum(v['state'] == 'unknown' for v in [*bundle['records']['snapshots'][0]['values'].values(), *(f['value'] for f in bundle['records']['snapshots'][0].get('custom', []))])
            print(f'Local capture saved; {missing} unknown fields. Inspect before importing. No upload performed.')
        return 0
    except (Invalid, RecursionError) as error:
        print(str(error) if isinstance(error, Invalid) else 'JSON: nesting is too deep', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
