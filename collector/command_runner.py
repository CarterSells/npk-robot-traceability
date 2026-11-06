"""Explicit simulation-only command step with a durable no-relaunch journal."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import urllib.request
import urllib.parse
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lifecycle_events as fields
from upload_queue import NoRedirect, queue_lock, queue_path, sync_directory


def utc():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)


def date(value):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError('Invalid command timestamp.')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Command timestamp requires timezone.')
    return result


class Transport:
    def __init__(self, endpoint, token):
        parsed = urllib.parse.urlsplit(endpoint)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path != '/api/v1/commands':
            raise ValueError('Use the exact HTTPS /api/v1/commands URL.')
        if not re.fullmatch(r'um_[a-f0-9]{64}', token):
            raise ValueError('Set UNIFY_MACHINE_TOKEN.')
        self.endpoint, self.token = endpoint, token
        self.opener = urllib.request.build_opener(NoRedirect())

    def __call__(self, data):
        request = urllib.request.Request(self.endpoint, data=canonical(data).encode(), method='POST',
                                         headers={'Authorization': 'Bearer '+self.token, 'Content-Type': 'application/json'})
        with self.opener.open(request, timeout=15) as response:
            raw = response.read(131073)
            if response.status != 200 or len(raw) > 131072:
                raise ValueError('Command response unavailable. Journal retained.')
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise ValueError('Invalid command response.')
            return result


def validate_request(request, command_id, gateway_id):
    spec = request['spec']
    fields.exact(spec, 'action id correlation_id gateway_id snapshot_id snapshot_revision expires_at kind parameters reality')
    if spec['action'] != 'request' or spec['id'] != command_id or request['id'] != command_id or spec['gateway_id'] != gateway_id or request['gateway_id'] != gateway_id:
        raise ValueError('Command identity mismatch.')
    for key in ('id', 'correlation_id', 'gateway_id'):
        fields.uuid(spec[key])
    fields.identifier(spec['snapshot_id']); fields.identifier(request['robot_id'])
    if type(spec['snapshot_revision']) is not int or spec['snapshot_revision'] < 1 or request['snapshot_id'] != spec['snapshot_id'] or request['snapshot_revision'] != spec['snapshot_revision']:
        raise ValueError('Invalid snapshot reference.')
    if spec['kind'] != 'simulation.check' or spec['reality'] != 'simulation':
        raise ValueError('Physical commands are unsupported.')
    fields.exact(spec['parameters'], 'checks')
    if type(spec['parameters']['checks']) is not int or not 1 <= spec['parameters']['checks'] <= 10:
        raise ValueError('Invalid simulation parameters.')
    date(spec['expires_at'])
    return spec


def local_allowed(context, request):
    """The CLI reloads this operator-owned context at every authority check."""
    fields.exact(context, 'gateway_id robot_id snapshot_id snapshot_revision reality execution_authority interlocks_ok operator_mode observed_at')
    age = (datetime.now(timezone.utc)-date(context['observed_at'])).total_seconds()
    return (0 <= age <= 30 and context['reality'] == 'simulation' and context['operator_mode'] == 'simulation'
            and context['execution_authority'] is True and context['interlocks_ok'] is True
            and all(context[k] == request[k] for k in ('gateway_id', 'robot_id', 'snapshot_id', 'snapshot_revision'))
            and datetime.now(timezone.utc) < date(request['spec']['expires_at']))


def run_step(directory, endpoint_identity, command_id, gateway_id, transport, context, simulate=None):
    """Run one bounded software simulation. There is deliberately no hardware adapter."""
    fields.uuid(command_id); fields.uuid(gateway_id)
    # Hold an OS lock across the step; a second process must not execute the same latch.
    with queue_lock(directory):
        database = directory / 'commands.sqlite3'
        if not database.exists():
            fd = os.open(database, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd); sync_directory(directory)
        with closing(sqlite3.connect(database)) as db:
            os.chmod(database, 0o600)
            db.execute('pragma synchronous=FULL')
            db.execute('create table if not exists commands(id text primary key, binding text not null, fingerprint text not null, request text not null, stage text not null, report text)')
            db.commit()
            binding = hashlib.sha256((endpoint_identity+'|'+gateway_id).encode()).hexdigest()
            row = db.execute('select binding,fingerprint,request,stage,report from commands where id=?', (command_id,)).fetchone()
            if row and row[0] != binding:
                raise ValueError('Journal belongs to another endpoint or identity.')

            def save(stage, report=None):
                db.execute('update commands set stage=?,report=? where id=?', (stage, canonical(report) if report else None, command_id))
                db.commit()

            def report(state, reason, outcome=None):
                return {'action': 'report', 'id': command_id, 'event_id': str(uuid.uuid4()), 'state': state,
                        'outcome': outcome, 'reason': reason, 'observed_at': utc(), 'stop_confirmed': outcome == 'cancelled'}

            # Completed/uncertain evidence is retried verbatim, never simulated again.
            if row and row[3] in ('completed', 'rejected', 'unknown', 'blocked'):
                return transport(json.loads(row[4]))
            if row and row[3] == 'starting':
                evidence = report('unknown', 'Restart after execution latch; operator reconciliation required. Simulation was not relaunched.')
                save('unknown', evidence)
                return transport(evidence)

            delivered = transport({'action': 'dispatch', 'id': command_id})
            request = delivered.get('request')
            if not request:
                return {'state': delivered.get('state', 'unknown'), 'executed': False}
            spec = validate_request(request, command_id, gateway_id)
            fingerprint = hashlib.sha256(canonical(request).encode()).hexdigest()
            if row and row[1] != fingerprint:
                raise ValueError('Immutable command changed; operator reconciliation required.')
            if not row:
                if db.execute('select count(*) from commands').fetchone()[0] >= 1000:
                    raise ValueError('Journal full. Archive through the documented recovery process.')
                db.execute('insert into commands values(?,?,?,?,?,null)', (command_id, binding, fingerprint, canonical(request), 'prepared'))
                db.commit()
                # Lost journal / lost first dispatch response is deliberately fail-closed.
                if not delivered.get('first_dispatch'):
                    evidence = report('unknown', 'No local journal for an already dispatched request; operator reconciliation required.')
                    save('unknown', evidence)
                    return transport(evidence)
            if delivered['state'] not in ('dispatched', 'acknowledged'):
                return {'state': delivered['state'], 'executed': False}
            if delivered.get('cancel_requested') or not local_allowed(context(), request):
                evidence = report('rejected', 'Local authority, mode, interlock, expiry or exact configuration check denied acceptance.')
                save('rejected', evidence)
                return transport(evidence)
            ack = json.loads(row[4]) if row and row[3] == 'ack_pending' else report('acknowledged', 'Simulation request accepted locally; execution has not started.')
            save('ack_pending', ack)
            result = transport(ack)
            if result.get('state') != 'acknowledged':
                return {'state': result.get('state', 'unknown'), 'executed': False}
            if not local_allowed(context(), request):
                evidence = report('rejected', 'Local authority or configuration changed before execution.')
                save('rejected', evidence)
                return transport(evidence)
            # Commit BEFORE the start authorization call or simulated side effect.
            start = report('executing', 'Durable simulation execution latch committed.')
            save('starting', start)
            result = transport(start)
            if result.get('state') != 'executing':
                save('blocked', start)
                return {'state': result.get('state', 'unknown'), 'executed': False}
            if not local_allowed(context(), request):
                evidence = report('unknown', 'Local authority changed after start authorization; no simulation was launched.')
                save('unknown', evidence)
                return transport(evidence)
            try:
                outcome = 'succeeded'
                for number in range(spec['parameters']['checks']):
                    status = transport({'action': 'get', 'id': command_id})['status']
                    if status['cancel_requested_at'] is not None:
                        outcome = 'cancelled'; break  # Only this in-process simulation stops.
                    if status['state'] != 'executing' or not local_allowed(context(), request):
                        raise ValueError('Execution authority is no longer confirmed.')
                    if simulate is not None:
                        simulate(number)  # Test seam only; CLI never loads third-party code.
            except Exception:
                evidence = report('unknown', 'Simulation interrupted; reconcile locally. No automatic relaunch.')
                save('unknown', evidence)
                return transport(evidence)
            evidence = report('completed', 'Built-in software simulation finished; no physical job or robot outcome is implied.', outcome)
            save('completed', evidence)
            return transport(evidence)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--journal', required=True)
    parser.add_argument('--endpoint', required=True)
    parser.add_argument('--command-id', required=True)
    parser.add_argument('--gateway-id', required=True)
    parser.add_argument('--context', required=True, help='Fresh operator-owned simulation context JSON')
    parser.add_argument('--reviewed-simulation', action='store_true', required=True)
    args = parser.parse_args()
    try:
        directory = queue_path(args.journal)
        transport = Transport(args.endpoint, os.environ.get('UNIFY_MACHINE_TOKEN', ''))
        def context():
            raw = Path(args.context).read_bytes()
            if len(raw) > 4096:
                raise ValueError('Context exceeds limit.')
            return json.loads(raw)
        result = run_step(directory, args.endpoint, args.command_id, args.gateway_id, transport, context)
        print('Simulation state: '+str(result.get('state', 'unknown'))+'. Journal retained.')
        return 0
    except (ValueError, OSError, sqlite3.Error, KeyError, TypeError):
        print('Simulation step unconfirmed. Preserve journal and reconcile; do not relaunch with a new ID.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
