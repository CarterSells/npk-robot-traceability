import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4
import urllib.error
from types import SimpleNamespace

import gateway as g
import machine_events
from test_upload_queue import Opener


def attempt():
    unknown = {'state': 'unknown', 'reason': 'Not supplied by synthetic runner'}
    return dict(job_id=str(uuid4()), attempt_id=str(uuid4()), retry_of=None,
                robot_id='synthetic-robot', snapshot_id='synthetic-snapshot', snapshot_revision=2,
                source_identity=str(uuid4()), procedure=unknown, procedure_version=unknown,
                task=unknown, environment=unknown, components=unknown,
                reality='synthetic', method='collector')


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.context = attempt()
        self.observation = g.sample(g.MockAdapter({'ur.program_running': False}), list(g.SIGNALS))
        self.event_id = str(uuid4())
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def event(self, observation=None, name='ur.program_running'):
        return g.event_from_observation(observation or self.observation, name, self.context, self.event_id, 7)

    def test_zero_is_known_and_absence_is_unknown_without_outcome_inference(self):
        evidence = self.event()['payload']['evidence']
        self.assertEqual(evidence['kind'], 'measurement')
        self.assertEqual(evidence['payload']['value'], 0)
        self.assertEqual(evidence['payload']['state'], 'known')
        missing = self.event(name='ur.robot_mode')['payload']['evidence']['payload']
        self.assertEqual(missing['state'], 'unknown')
        self.assertIsNone(missing['value'])
        self.assertEqual(self.event()['payload']['attempt'], self.context)
        self.assertEqual(self.event()['observed_at'], self.observation['observations'][2]['received_at'])

    def test_stale_invalid_and_unapproved_signals(self):
        adapter = g.MockAdapter({})
        with patch.object(adapter, 'read', return_value={'ur.robot_mode': {'value': 7, 'received_at': '2000-01-01T00:00:00.000Z'}}):
            self.assertEqual(g.sample(adapter, ['ur.robot_mode'])['observations'][0]['state'], 'unknown')
        for value in (True, '7', 128, float('nan')):
            observed = g.sample(g.MockAdapter({'ur.robot_mode': value}), ['ur.robot_mode'])
            self.assertEqual(observed['observations'][0]['state'], 'unknown')
        with self.assertRaises(ValueError): g.MockAdapter({'secret': 'no'})
        with self.assertRaises(ValueError): g.sample(adapter, ['ur.robot_mode'] * 2)
        with self.assertRaises(ValueError): g.sample(adapter, ['ur.robot_mode'], window=11)
        with patch.object(adapter, 'read', side_effect=RuntimeError('sensitive device details')):
            gap = g.sample(adapter, ['ur.robot_mode'])
        self.assertEqual(gap['observations'][0]['state'], 'unknown')
        self.assertEqual(gap['observations'][0]['reason'], 'Adapter unavailable during the sampling window.')
        self.assertNotIn('sensitive', json.dumps(gap))

    def test_reality_snapshot_and_allowlist_cannot_be_bypassed(self):
        with self.assertRaises(ValueError): g.sample(g.MockAdapter({}), ['ur.robot_mode'], reality='real')
        bad = copy.deepcopy(self.observation); bad['reality'] = 'real'
        with self.assertRaises(ValueError): self.event(bad)
        bad = copy.deepcopy(self.observation); bad['observations'][0]['raw_recording'] = 'private'
        with self.assertRaises(ValueError): self.event(bad)
        bad = copy.deepcopy(self.observation); bad['observations'][0]['value'] = 0
        with self.assertRaises(ValueError): self.event(bad)
        self.context['snapshot_revision'] = 0
        with self.assertRaises(ValueError): self.event()

    def test_offline_then_receipt_recovery_keeps_exact_event(self):
        directory = self.root / 'queue'
        args = (self.observation, 'ur.program_running', self.context, self.event_id, 7, directory)
        key = g.enqueue(*args)
        self.assertEqual(key, g.enqueue(*args))
        original = (directory / (key + '.json')).read_bytes()
        endpoint = 'https://beta.example.invalid/api/v1/events'
        token = 'um_' + 'a' * 64
        with self.assertRaises(ValueError):
            machine_events.flush_events(directory, endpoint, token, opener=Opener([urllib.error.URLError('offline')]*3), sleep=lambda _: None)
        self.assertEqual((directory / (key + '.json')).read_bytes(), original)
        receipt = dict(event_id=self.event_id, source_identity=self.context['source_identity'], source_sequence=7,
                       body_hash=key, version=1, duplicate=True)
        remote = Opener([receipt])
        self.assertEqual(machine_events.flush_events(directory, endpoint, token, opener=remote), 1)
        self.assertEqual(remote.calls[0][0].method, 'GET')
        self.assertEqual(len(remote.calls), 1)

    def test_private_output_no_overwrite_and_no_repository_queue(self):
        output = self.root / 'observation.json'
        g.write_new(output, self.observation)
        with self.assertRaises(FileExistsError): g.write_new(output, {})
        self.assertEqual(json.loads(output.read_text()), self.observation)
        with self.assertRaises(ValueError):
            g.enqueue(self.observation, 'ur.program_running', self.context, self.event_id, 7, Path(__file__).parent / 'private')

    def test_cli_mock_works_without_ros_and_real_adapter_requires_review(self):
        values = self.root / 'values.json'; values.write_text('{"ur.program_running":true}')
        script = str(Path(g.__file__))
        output = self.root / 'cli.json'
        result = subprocess.run([sys.executable, script, 'sample', '--adapter', 'mock', '--mock-values', str(values),
                                 '--signals', 'ur.program_running', '--reality', 'synthetic', '--reviewed', '--output', str(output)], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(output.read_text())['observations'][0]['value'], 1)
        result = subprocess.run([sys.executable, script, 'discover', '--adapter', 'ros2-ur', '--output', str(self.root/'ros.json')], capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertFalse((self.root/'ros.json').exists())

    def test_ros_adapter_only_subscribes_and_does_not_carry_old_samples(self):
        from gateway_ros2 import Ros2Adapter
        subscriptions, nodes, shutdowns, executor_contexts = [], [], [], []
        class Node:
            def __init__(self, name, **kwargs):
                nodes.append(kwargs)
            def create_subscription(self, kind, topic, callback, qos):
                subscriptions.append((topic, callback, qos))
            def destroy_node(self): pass
            def get_topic_names_and_types(self):
                return [('/io_and_status_controller/robot_mode', ['ur_dashboard_msgs/msg/RobotMode']),
                        ('/private_camera', ['sensor_msgs/msg/Image'])]
        def spin(node, timeout_sec):
            for topic, callback, _ in subscriptions:
                callback(SimpleNamespace(mode=7, data=False))
        class Executor:
            def __init__(self, context): executor_contexts.append(context)
            def add_node(self, node): self.node = node
            def spin_once(self, timeout_sec): spin(self.node, timeout_sec)
            def shutdown(self): pass
        modules = {
            'rclpy': SimpleNamespace(init=lambda **_: None, shutdown=lambda **_: shutdowns.append(True), spin_once=spin),
            'rclpy.context': SimpleNamespace(Context=object), 'rclpy.node': SimpleNamespace(Node=Node),
            'rclpy.executors': SimpleNamespace(SingleThreadedExecutor=Executor),
            'rclpy.qos': SimpleNamespace(QoSProfile=lambda **kw: kw, ReliabilityPolicy=SimpleNamespace(BEST_EFFORT='best'), DurabilityPolicy=SimpleNamespace(VOLATILE='volatile')),
            'std_msgs.msg': SimpleNamespace(Bool=object),
            'ur_dashboard_msgs.msg': SimpleNamespace(RobotMode=object, SafetyMode=object),
        }
        adapter = Ros2Adapter()
        with patch.dict(sys.modules, modules):
            with patch('gateway_ros2.time.monotonic', side_effect=[0, 0, 0, 1]):
                values = adapter.read(list(g.SIGNALS), '/io_and_status_controller', .1)
            self.assertEqual(values['ur.program_running']['value'], False)
            self.assertEqual(len(subscriptions), 3)
            self.assertTrue(all(s[2]['depth'] == 1 and s[2]['durability'] == 'volatile' for s in subscriptions))
            self.assertFalse(nodes[0]['start_parameter_services'])
            self.assertFalse(nodes[0]['enable_rosout'])
            self.assertIs(nodes[0]['context'], executor_contexts[0])
            with patch('gateway_ros2.time.monotonic', side_effect=[0, 1]):
                self.assertEqual(adapter.read(['ur.robot_mode'], '/io_and_status_controller', .1), {})
            with patch('gateway_ros2.time.monotonic', side_effect=[0, 1]):
                discovered = adapter.discover('/io_and_status_controller', .1)
            self.assertEqual([x['name'] for x in discovered], ['ur.robot_mode'])
            self.assertEqual(len(shutdowns), 3)


if __name__ == '__main__':
    unittest.main()
