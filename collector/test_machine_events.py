import hashlib
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from datetime import datetime
from uuid import uuid4
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_upload_queue as support
import machine_events as events
import unify_collector as collector

Opener = support.Opener

class EventTests(unittest.TestCase):
    def setUp(self):
        support.QueueTests.setUp(self)
        capture = json.loads(self.source.read_bytes())
        # Match the collector's actual runner interface; import a checked fixture below.
        capture['records']['runs'] = [{
            'id': 'synthetic-event-run', 'robotId': capture['records']['robots'][0]['id'],
            'snapshotId': capture['records']['snapshots'][0]['id'], 'snapshotRevision': 1,
            'at': max(p['observedAt'] for p in capture['records']['snapshots'][0]['provenance'].values()),
            'outcome': 'success', 'attemptedPicks': 1, 'successfulPicks': 1
        }]
        self.event = {'event_id': str(uuid4()), 'schema_version': 1, 'run_id': 'synthetic-event-run',
            'source_identity': str(uuid4()), 'source_sequence': 1,
            'observed_at': datetime.fromisoformat(capture['records']['runs'][0]['at'].replace('Z', '+00:00')).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'event_type': 'run.recorded', 'payload': {'capture': capture}}
        self.event_file = self.root / 'event.json'
        self.event_file.write_text(json.dumps(self.event), encoding='utf-8')
        self.event_queue = self.root / 'events'
        self.event_key = events.enqueue_event(self.event_file, self.event_queue)
        self.endpoint = 'https://beta.example.invalid/api/v1/events'
        self.machine_token = 'um_' + 'b' * 64

    def receipt(self, **override):
        return dict(event_id=self.event['event_id'], source_identity=self.event['source_identity'],
                    source_sequence=1, body_hash=self.event_key, version=2, duplicate=True, **override)

    def test_lost_ack_reconciles_receipt_without_resending(self):
        remote = Opener([self.receipt()])
        self.assertEqual(events.flush_events(self.event_queue, self.endpoint, self.machine_token, opener=remote), 1)
        self.assertEqual(remote.calls[0][0].method, 'GET')
        self.assertEqual(len(remote.calls), 1)
        self.assertTrue(self.event_file.exists())

    def test_missing_receipt_posts_stable_bytes_and_retries(self):
        remote = Opener([urllib.error.HTTPError(self.endpoint, 404, '', {}, None), urllib.error.URLError('lost acknowledgement'), self.receipt()])
        self.assertEqual(events.flush_events(self.event_queue, self.endpoint, self.machine_token, opener=remote, sleep=lambda _: None), 1)
        self.assertEqual(remote.calls[1][0].data, remote.calls[2][0].data)
        self.assertEqual(hashlib.sha256(remote.calls[1][0].data).hexdigest(), self.event_key)

    def test_revoked_or_conflicting_receipt_retains_queue(self):
        wrong = self.receipt(); wrong['body_hash'] = '0' * 64
        for response in (wrong, urllib.error.HTTPError(self.endpoint, 403, '', {}, None)):
            with self.assertRaises(ValueError):
                events.flush_events(self.event_queue, self.endpoint, self.machine_token, opener=Opener([response]))
            self.assertEqual(len(list(self.event_queue.glob('*.json'))), 1)

    def test_event_extra_fields_are_rejected(self):
        with self.assertRaises(ValueError):
            events.validate_event({**self.event, 'tenant': 'foreign'})

    def test_lifecycle_reconnect_reconciles_exact_event_and_preserves_missing(self):
        unknown = {'state': 'unknown', 'reason': 'Not observed'}
        attempt = dict(job_id=str(uuid4()), attempt_id=str(uuid4()), retry_of=None,
                       robot_id='robot-01', snapshot_id='snapshot-01', snapshot_revision=1,
                       source_identity=self.event['source_identity'], procedure=unknown,
                       procedure_version=unknown, task=unknown, environment=unknown,
                       components=unknown, reality='synthetic', method='collector')
        self.event.update(event_type='execution.recorded', run_id=attempt['attempt_id'], payload={
            'attempt': attempt, 'evidence': {'kind': 'measurement', 'payload': {
                'name': 'duration', 'state': 'unknown', 'value': None, 'unit': 's', 'reason': 'Interrupted'},
                'correction_of': None, 'reason': None}})
        self.event_file.write_text(json.dumps(self.event), encoding='utf-8')
        directory = self.root / 'lifecycle'
        self.event_key = events.enqueue_event(self.event_file, directory)
        remote = Opener([self.receipt()])
        self.assertEqual(events.flush_events(directory, self.endpoint, self.machine_token, opener=remote), 1)
        self.assertEqual(remote.calls[0][0].method, 'GET')
        self.event['payload']['evidence']['payload']['value'] = 0
        with self.assertRaises(ValueError): events.validate_event(self.event)

if __name__ == '__main__':
    unittest.main()
