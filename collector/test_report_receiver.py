from contextlib import closing
import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest
import uuid

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).resolve().parent.parent / 'scripts/report-receiver.py')
receiver = importlib.util.module_from_spec(spec);spec.loader.exec_module(receiver)

class ReceiverTests(unittest.TestCase):
    def test_signature_rotation_duplicate_conflict_and_replay(self):
        with closing(sqlite3.connect(':memory:')) as db:
            db.execute('create table inbox(event_id text primary key,digest text,body blob,received_at real)')
            event_id = str(uuid.uuid4());timestamp = '1800000000'
            raw = json.dumps({'schema_version':1,'event_id':event_id,'event_type':'report.published','report':{'synthetic':True}}).encode()
            def signed(body, key):
                return hmac.new(key.encode(), ('v1.'+timestamp+'.'+event_id+'.').encode()+body, hashlib.sha256).hexdigest()
            signature = signed(raw, 'new')+','+signed(raw, 'old')
            self.assertEqual(receiver.accept(db, raw, event_id, timestamp, signature, ['old'], 1800000000), 200)
            self.assertEqual(receiver.accept(db, raw, event_id, timestamp, signature, ['new'], 1800000000), 200)
            self.assertEqual(db.execute('select count(*) from inbox').fetchone()[0], 1)
            other = raw+b' '
            self.assertEqual(receiver.accept(db, other, event_id, timestamp, signed(other, 'new'), ['new'], 1800000000), 409)
            self.assertEqual(receiver.accept(db, raw, event_id, timestamp, signature, ['new'], 1800000301), 401)
            self.assertEqual(receiver.accept(db, other, event_id, timestamp, signature, ['new'], 1800000000), 401)

if __name__ == '__main__':
    unittest.main()
