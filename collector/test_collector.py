"""Synthetic collector checks. Run directly; no installed package required."""
import contextlib
import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import unify_collector as c

TIME = '2026-10-09T12:00:00Z'


def config():
    return {'version': 1, 'synthetic': True, 'author': 'Synthetic test operator',
            'robot': {'id': 'collector-arm', 'name': 'Synthetic collector arm', 'task': 'Pick blocks'}}


def result(run_id='capture-run-1', outcome='success'):
    return {'id': run_id, 'at': '2026-10-09T12:01:00Z', 'outcome': outcome,
            'successfulPicks': 10 if outcome == 'success' else 4, 'attemptedPicks': 10}


def fixtures(destination):
    destination.mkdir(parents=True, exist_ok=True)
    cfg = config()
    cfg['metadata'] = {key: {'field': {'state': 'known', 'value': value}, 'observedAt': TIME,
                            'evidence': 'Synthetic runner declaration', 'available': False}
                       for key, value in [('procedure', 'pick-v1'), ('object', 'block-A'), ('model', 'policy-v1')]}
    with patch.object(c, 'now', return_value=TIME):
        first = c.attach_run(c.capture(cfg, destination), result())
        cfg['metadata']['model']['field']['value'] = 'policy-v2'
        second = c.attach_run(c.capture(cfg, destination), {**result('capture-run-2', 'failure'), 'at': '2026-10-09T12:02:00Z'})
    for name, bundle in [('first', first), ('second', second)]:
        (destination / f'{name}.json').write_bytes(c.encode(bundle))


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.clock = patch.object(c, 'now', return_value=TIME)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def save(self, name, value):
        (self.root / name).write_text(json.dumps(value), encoding='utf-8')
        return self.root / name

    def test_missing_sources_and_no_ros_requirement(self):
        cfg = {**config(), 'git': 'missing', 'hardware': 'missing', 'model': 'missing', 'calibration': 'missing', 'settings': 'missing'}
        bundle = c.capture(cfg, self.root)
        self.assertTrue(all(v['state'] == 'unknown' for v in bundle['records']['snapshots'][0]['values'].values()))
        self.assertNotIn(str(self.root), c.encode(bundle).decode())

    def test_hashes_deterministic_and_source_content_excluded(self):
        raw = b'SYNTHETIC-SENSITIVE-CONTENT' * 1000
        (self.root / 'artifact.bin').write_bytes(raw)
        cfg = {**config(), 'model': 'artifact.bin', 'calibration': 'artifact.bin'}
        one, two = c.capture(cfg, self.root), c.capture(cfg, self.root)
        self.assertNotEqual(one['records']['snapshots'][0]['id'], two['records']['snapshots'][0]['id'])
        expected = 'sha256:' + hashlib.sha256(raw).hexdigest()
        self.assertEqual(one['records']['snapshots'][0]['values']['model']['value'], expected)
        self.assertEqual(one['records']['snapshots'][0]['values'], two['records']['snapshots'][0]['values'])
        self.assertNotIn(b'SYNTHETIC-SENSITIVE-CONTENT', c.encode(one))

    def test_git_clean_dirty_untracked_and_missing_head(self):
        def git(*args):
            subprocess.run(['git', '-C', str(self.root), *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        git('init')
        with self.assertRaises(c.Invalid):
            c.git_value(self.root)
        (self.root / 'file.txt').write_text('synthetic')
        git('add', 'file.txt')
        git('-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'test fixture')
        self.assertFalse(c.git_value(self.root)['value']['dirty'])
        (self.root / 'file.txt').write_text('changed')
        self.assertTrue(c.git_value(self.root)['value']['dirty'])
        git('add', 'file.txt')
        self.assertTrue(c.git_value(self.root)['value']['dirty'])
        git('-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'test fixture')
        (self.root / 'SENSITIVE-NAME.txt').write_text('SENSITIVE-CONTENT')
        bundle = c.capture({**config(), 'git': '.'}, self.root)
        self.assertTrue(bundle['records']['snapshots'][0]['values']['software']['value']['dirty'])
        self.assertNotIn('SENSITIVE', c.encode(bundle).decode())

    def test_settings_allowlist_and_invalid_measurements(self):
        self.save('settings.json', {'token': 'SECRET', 'gripForce': 22, 'conditions': {'ambient_C': 21, 'password': 'SECRET'}})
        bundle = c.capture({**config(), 'settings': 'settings.json'}, self.root)
        values = bundle['records']['snapshots'][0]['values']
        self.assertEqual(values['conditions']['value'], {'ambient_C': 21})
        self.assertEqual(values['gripForce']['value'], 22)
        self.assertNotIn('SECRET', c.encode(bundle).decode())
        self.save('settings.json', {'gripForce': True, 'conditions': {'speed_m_s': -1}})
        bundle = c.capture({**config(), 'settings': 'settings.json'}, self.root)
        for key in ('gripForce', 'conditions'):
            self.assertEqual(bundle['records']['snapshots'][0]['values'][key]['state'], 'unknown')

    def test_manual_manifest_preserves_author_time_and_evidence(self):
        manifest = {'version': 1, 'hardware': {'state': 'known', 'value': {'component': 'synthetic-G1', 'revision': 'B'}}, 'author': 'Manual reporter', 'confirmedAt': '2026-10-01T10:00:00Z', 'evidence': 'Synthetic note', 'available': False}
        self.save('hardware.json', manifest)
        s = c.capture({**config(), 'hardware': 'hardware.json'}, self.root)['records']['snapshots'][0]
        self.assertEqual(s['hardwareConfirmedAt'], manifest['confirmedAt'])
        self.assertEqual(s['provenance']['hardware']['author'], 'Manual reporter')
        self.assertEqual(s['provenance']['hardware']['recordedAt'], TIME)
        self.assertIn('Manual', s['provenance']['hardware']['method'])
        manifest['confirmedAt'] = '2099-01-01T00:00:00Z'
        self.save('hardware.json', manifest)
        with self.assertRaises(c.Invalid):
            c.capture({**config(), 'hardware': 'hardware.json'}, self.root)

    def test_metadata_states_and_conflicting_sources(self):
        cfg = config()
        cfg['metadata'] = {'model': {'field': {'state': 'not-applicable', 'reason': 'No learned model'}, 'observedAt': TIME, 'evidence': 'Operator report', 'available': False}}
        self.assertEqual(c.capture(cfg, self.root)['records']['snapshots'][0]['values']['model']['state'], 'not-applicable')
        cfg['model'] = 'missing'
        with self.assertRaises(c.Invalid):
            c.capture(cfg, self.root)

    def test_runner_exact_binding_and_immutable_handoff(self):
        before = c.capture(config(), self.root)
        original = copy.deepcopy(before)
        after = c.attach_run(before, result())
        self.assertEqual(before, original)
        self.assertEqual(after['records']['runs'][0]['snapshotId'], before['records']['snapshots'][0]['id'])
        with self.assertRaises(c.Invalid):
            c.attach_run(after, result('another'))
        with self.assertRaises(c.Invalid):
            c.attach_run(before, {**result(), 'at': '2026-01-01T00:00:00Z'})
        with self.assertRaises(c.Invalid):
            c.attach_run(before, {**result(), 'successfulPicks': 11})

    def test_cli_dry_run_validate_and_exclusive_output(self):
        cfg = self.save('config.json', config())
        out = self.root / 'capture.json'
        with contextlib.redirect_stdout(io.StringIO()) as stdout:
            self.assertEqual(c.main(['capture', '--config', str(cfg), '--dry-run']), 0)
        c.validate_capture(json.loads(stdout.getvalue()))
        self.assertFalse(out.exists())
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(c.main(['capture', '--config', str(cfg), '--output', str(out)]), 0)
            self.assertEqual(c.main(['validate', str(out)]), 0)
        original = out.read_bytes()
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(c.main(['capture', '--config', str(cfg), '--output', str(out)]), 2)
        self.assertEqual(out.read_bytes(), original)

    def test_invalid_json_and_config_do_not_echo_secrets(self):
        for data in ('{"a":1,"a":2}', '{"secret":NaN}', '[' * 1200, ' ' * (c.MAX_BYTES + 1), '{"value":' + '9' * 5000 + '}'):
            path = self.root / 'bad.json'
            path.write_text(data)
            with self.assertRaises(c.Invalid):
                c.read_json(path)
        with self.assertRaises(c.Invalid) as error:
            c.capture({**config(), 'SECRET': 'SECRET'}, self.root)
        self.assertNotIn('SECRET', str(error.exception))

    def test_numeric_and_unicode_limits_match_browser_contract(self):
        self.save('settings.json', {'gripForce': 10 ** 400})
        s = c.capture({**config(), 'settings': 'settings.json'}, self.root)['records']['snapshots'][0]
        self.assertEqual(s['values']['gripForce']['state'], 'unknown')
        cfg = config()
        cfg['robot']['name'] = chr(0x1F600) * 100
        with self.assertRaises(c.Invalid):
            c.capture(cfg, self.root)
        cfg['robot']['name'] = chr(0x1F600) * 60
        c.validate_capture(c.capture(cfg, self.root))
        cfg['ros2'] = {'node': '/gripper', 'parameter': 'grip_force', 'timeoutSeconds': 10 ** 400}
        with self.assertRaises(c.Invalid):
            c.capture(cfg, self.root)

    def test_commands_timeout_and_limit_output(self):
        started = time.monotonic()
        with self.assertRaises(c.Invalid):
            c.command([sys.executable, '-c', 'import time; time.sleep(5)'], timeout=0.1)
        self.assertLess(time.monotonic() - started, 3)
        with self.assertRaises(c.Invalid):
            c.command([sys.executable, '-c', 'print("x" * 1000)'], limit=20)

    def test_optional_ros_success_timeout_and_allowlist(self):
        cfg = {**config(), 'ros2': {'node': '/gripper', 'parameter': 'grip_force', 'timeoutSeconds': 0.2}}
        with patch.object(c, 'command', return_value='24.5') as execute:
            s = c.capture(cfg, self.root)['records']['snapshots'][0]
            self.assertEqual(s['values']['gripForce']['value'], 24.5)
            self.assertEqual(execute.call_args.args[0], ['ros2', 'param', 'get', '--hide-type', '/gripper', 'grip_force'])
        with patch.object(c, 'command', side_effect=c.Invalid('timeout')):
            self.assertEqual(c.capture(cfg, self.root)['records']['snapshots'][0]['values']['gripForce']['state'], 'unknown')
        cfg['ros2']['parameter'] = 'secret_token'
        with self.assertRaises(c.Invalid):
            c.capture(cfg, self.root)

    def test_capture_validation_rejects_tampered_references(self):
        bundle = c.attach_run(c.capture(config(), self.root), result())
        for key, value in [('snapshotId', 'different'), ('snapshotRevision', True), ('successfulPicks', False)]:
            bad = copy.deepcopy(bundle)
            bad['records']['runs'][0][key] = value
            with self.assertRaises(c.Invalid):
                c.validate_capture(bad)


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--fixtures':
        fixtures(Path(sys.argv[2]))
    else:
        unittest.main()
