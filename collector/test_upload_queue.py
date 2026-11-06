import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import upload_queue as q
import unify_collector as c
from test_collector import config

class Reply(io.BytesIO):
    status = 200

class Opener:
    def __init__(self, results):
        self.results = iter(results)
        self.calls = []
    def open(self, request, timeout):
        self.calls.append((request, timeout))
        result = next(self.results)
        if isinstance(result, Exception):
            raise result
        return Reply(json.dumps(result).encode())

class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'capture.json'
        cfg = config()
        cfg['author'] = 'Synthetic opérateur'
        self.source.write_bytes(c.encode(c.capture(cfg, self.root)))
        self.queue = self.root / 'queue'
        self.key = q.enqueue(self.source, self.queue)
        self.token = 'uc_' + 'a' * 64
    def test_deduplicates_and_only_removes_acknowledged_queue_copy(self):
        self.assertEqual(q.enqueue(self.source, self.queue), self.key)
        remote = Opener([{'version': 1, 'duplicate': True}])
        self.assertEqual(q.flush(self.queue, 'https://beta.example.invalid/api/ingest/org', self.token, opener=remote), 1)
        self.assertTrue(self.source.exists())
        self.assertEqual(list(self.queue.glob('*.json')), [])
        req, timeout = remote.calls[0]
        self.assertEqual(timeout, 15)
        self.assertEqual(json.loads(req.data)['request_id'], self.key)
        self.assertNotIn(self.token, req.data.decode())
        self.assertIn('opérateur'.encode('utf-8'), req.data)
    def test_network_retries_bounded_and_payload_identity_stable(self):
        remote = Opener([urllib.error.URLError('offline')] * 3)
        delays = []
        with self.assertRaises(ValueError):
            q.flush(self.queue, 'https://beta.example.invalid/api/ingest/org', self.token, opener=remote, sleep=delays.append, jitter=lambda: 1)
        self.assertEqual(len(remote.calls), 3)
        self.assertEqual(delays, [1, 2])
        self.assertEqual(len({call[0].data for call in remote.calls}), 1)
        self.assertTrue((self.queue / (self.key + '.json')).exists())
    def test_failed_publish_retains_original_and_has_no_partial_queue_entry(self):
        directory = self.root / 'interrupted'
        with patch.object(q.os, 'replace', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                q.enqueue(self.source, directory)
        self.assertTrue(self.source.exists())
        self.assertEqual(list(directory.glob('*.json')), [])
        self.assertEqual(list(directory.glob('.pending-*')), [])
        self.assertEqual(q.enqueue(self.source, directory), self.key)

    def test_overflow_fails_without_evicting_and_duplicate_still_succeeds(self):
        with patch.object(q, 'MAX_QUEUE_BYTES', 1):
            self.assertEqual(q.enqueue(self.source, self.queue), self.key)
            with self.assertRaisesRegex(ValueError, 'limit'):
                q.enqueue(self.source, self.root / 'full')
        with patch.object(q, 'MAX_QUEUE_FILES', 0):
            with self.assertRaisesRegex(ValueError, 'limit'):
                q.enqueue(self.source, self.root / 'full')
        self.assertTrue((self.queue / (self.key + '.json')).exists())

    def test_changed_queue_identity_is_not_sent(self):
        path = self.queue / (self.key + '.json')
        path.rename(self.queue / ('0' * 64 + '.json'))
        remote = Opener([])
        with self.assertRaisesRegex(ValueError, 'identity'):
            q.flush(self.queue, 'https://beta.example.invalid/api/ingest/org', self.token, opener=remote)
        self.assertEqual(remote.calls, [])
        self.assertEqual(len(list(self.queue.glob('*.json'))), 1)

    def test_exclusive_lock_releases_after_error_and_jitter_is_bounded(self):
        with q.queue_lock(self.queue):
            with self.assertRaises(OSError):
                q.enqueue(self.source, self.queue)
        self.assertEqual(q.enqueue(self.source, self.queue), self.key)
        remote = Opener([urllib.error.URLError('offline'), {'version': 2, 'duplicate': True}])
        delays = []
        self.assertEqual(q.flush(self.queue, 'https://beta.example.invalid/api/ingest/org', self.token,
                                opener=remote, sleep=delays.append, jitter=lambda: 0), 1)
        self.assertEqual(delays, [0.5])

    def test_invalid_attempt_count_does_not_discard_queue(self):
        for attempts in (0, -1, 6, True):
            with self.assertRaises(ValueError):
                q.flush(self.queue, 'https://beta.example.invalid/api/ingest/org', self.token, attempts=attempts)
        self.assertTrue((self.queue / (self.key + '.json')).exists())
    def test_unauthorized_conflicts_redirects_do_not_retry_or_remove(self):
        for code in (401, 403, 409, 302):
            remote = Opener([urllib.error.HTTPError('https://example.invalid', code, 'test', {}, None)])
            with self.assertRaises(ValueError):
                q.flush(self.queue, 'https://beta.example.invalid/api/ingest/org', self.token, opener=remote)
            self.assertEqual(len(remote.calls), 1)
            self.assertTrue((self.queue / (self.key + '.json')).exists())
        self.assertIsNone(q.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.invalid'))
    def test_private_location_https_and_confirmation_required(self):
        with self.assertRaises(ValueError):
            q.queue_path(Path(__file__).resolve().parent / 'queue')
        for endpoint in ('http://example.invalid', 'https://user:pass@example.invalid', 'https://example.invalid/?secret=1'):
            with self.assertRaises(ValueError):
                q.flush(self.queue, endpoint, self.token)
        remote = Opener([{'message': 'not an acknowledgement'}])
        with self.assertRaises(ValueError):
            q.flush(self.queue, 'https://beta.example.invalid/api/ingest/org', self.token, opener=remote)

if __name__ == '__main__':
    unittest.main()
