import copy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import uuid
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import command_runner as runner


class FakeServer:
    def __init__(self):
        self.id, self.gateway = str(uuid.uuid4()), str(uuid.uuid4())
        self.state, self.cancel = 'approved', None
        self.events, self.calls = {}, []
        self.lose, self.deny_start = None, False
        self.request = {'id': self.id, 'gateway_id': self.gateway, 'robot_id': 'synthetic-robot',
                        'snapshot_id': 'synthetic-snapshot', 'snapshot_revision': 1,
                        'spec': {'action': 'request', 'id': self.id, 'correlation_id': str(uuid.uuid4()),
                                 'gateway_id': self.gateway, 'snapshot_id': 'synthetic-snapshot', 'snapshot_revision': 1,
                                 'expires_at': (datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
                                 'kind': 'simulation.check', 'parameters': {'checks': 2}, 'reality': 'simulation'}}
        self.context = {'gateway_id': self.gateway, 'robot_id': 'synthetic-robot', 'snapshot_id': 'synthetic-snapshot',
                        'snapshot_revision': 1, 'reality': 'simulation', 'execution_authority': True,
                        'interlocks_ok': True, 'operator_mode': 'simulation', 'observed_at': runner.utc()}

    def __call__(self, data):
        self.calls.append(copy.deepcopy(data))
        if data['action'] == 'dispatch':
            first = self.state == 'approved'
            if first:
                self.state = 'dispatched'
            return {'state': self.state, 'first_dispatch': first, 'request': copy.deepcopy(self.request), 'cancel_requested': self.cancel is not None}
        if data['action'] == 'get':
            return {'status': {'state': self.state, 'cancel_requested_at': self.cancel}}
        prior = self.events.get(data['event_id'])
        if prior:
            if prior != data:
                raise ValueError('Conflicting replay')
            return {'state': self.state, 'duplicate': True}
        self.events[data['event_id']] = copy.deepcopy(data)
        self.state = 'rejected' if data['state'] == 'executing' and self.deny_start else data['state']
        if data['state'] == self.lose:
            self.lose = None
            raise OSError('Lost acknowledgement')
        return {'state': self.state}


class CommandTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.server = FakeServer()
        self.executions = []

    def tearDown(self):
        self.temp.cleanup()

    def run_step(self, **options):
        return runner.run_step(self.directory, 'https://synthetic.example.invalid/api/v1/commands', self.server.id,
                               self.server.gateway, self.server, lambda: self.server.context,
                               options.get('simulate', self.executions.append))

    def test_complete_and_lost_completion_ack_replay_without_execution(self):
        self.server.lose = 'completed'
        with self.assertRaises(OSError):
            self.run_step()
        self.assertEqual(self.executions, [0, 1])
        result = self.run_step()
        self.assertEqual(result['state'], 'completed')
        self.assertEqual(self.executions, [0, 1])
        completed = [x for x in self.server.calls if x.get('state') == 'completed']
        self.assertEqual(completed[0], completed[1])
        self.assertEqual(completed[0]['outcome'], 'succeeded')

    def test_lost_start_ack_and_restart_never_relaunch(self):
        self.server.lose = 'executing'
        with self.assertRaises(OSError):
            self.run_step()
        self.assertEqual(self.run_step()['state'], 'unknown')
        self.assertEqual(self.executions, [])
        self.assertEqual(self.run_step()['state'], 'unknown')

    def test_lost_acceptance_ack_can_reconcile_before_first_execution(self):
        self.server.lose = 'acknowledged'
        with self.assertRaises(OSError):
            self.run_step()
        self.assertEqual(self.run_step()['state'], 'completed')
        self.assertEqual(self.executions, [0, 1])

    def test_changed_configuration_and_local_authority_fail_closed(self):
        for field, value in [('snapshot_revision', 2), ('interlocks_ok', False), ('execution_authority', False),
                             ('operator_mode', 'automatic'), ('reality', 'real'), ('observed_at', '2020-01-01T00:00:00.000Z')]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as folder:
                server = FakeServer();server.context[field] = value
                result = runner.run_step(Path(folder), 'test', server.id, server.gateway, server, lambda: server.context, self.executions.append)
                self.assertEqual(result['state'], 'rejected')
        self.assertEqual(self.executions, [])

    def test_server_permission_change_before_start_prevents_simulation(self):
        self.server.deny_start = True
        self.assertEqual(self.run_step()['state'], 'rejected')
        self.assertEqual(self.executions, [])

    def test_cancel_requires_observed_local_stop(self):
        def simulate(number):
            self.executions.append(number)
            self.server.cancel = runner.utc()
        self.assertEqual(self.run_step(simulate=simulate)['state'], 'completed')
        self.assertEqual(self.executions, [0])
        final = self.server.calls[-1]
        self.assertEqual(final['outcome'], 'cancelled')
        self.assertIs(final['stop_confirmed'], True)

    def test_disconnect_during_simulation_records_unknown_and_no_retry(self):
        def simulate(number):
            self.executions.append(number)
            raise OSError('Connection lost')
        self.assertEqual(self.run_step(simulate=simulate)['state'], 'unknown')
        self.assertEqual(self.run_step()['state'], 'unknown')
        self.assertEqual(self.executions, [0])

    def test_missing_journal_cannot_restart_dispatched_command(self):
        self.server.state = 'executing'
        self.assertEqual(self.run_step()['state'], 'unknown')
        self.assertEqual(self.executions, [])

    def test_identity_and_immutable_request_conflicts(self):
        self.server.lose = 'acknowledged'
        with self.assertRaises(OSError):
            self.run_step()
        with self.assertRaises(ValueError):
            runner.run_step(self.directory, 'other-server', self.server.id, self.server.gateway, self.server, lambda: self.server.context)
        self.server.request['spec']['parameters']['checks'] = 3
        with self.assertRaises(ValueError):
            self.run_step()
        self.assertEqual(self.executions, [])

    def test_network_and_physical_types_are_restricted(self):
        for endpoint in ['http://example.invalid/api/v1/commands', 'https://example.invalid/api/v1/commands?token=x',
                         'https://user@example.invalid/api/v1/commands', 'https://example.invalid/wrong']:
            with self.assertRaises(ValueError):
                runner.Transport(endpoint, 'um_'+'a'*64)
        self.server.request['spec']['kind'] = 'ur.move'
        with self.assertRaises(ValueError):
            self.run_step()
        self.assertEqual(self.executions, [])


if __name__ == '__main__':
    unittest.main()
