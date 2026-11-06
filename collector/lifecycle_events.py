"""Allowlisted execution metadata; no command execution or automatic capture."""
import math
import re

STATES = {'requested', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed-out', 'unknown'}

def exact(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys.split()):
        raise ValueError('Missing or unsupported execution fields.')

def text(value, maximum=240):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError('Invalid execution text.')

def identifier(value):
    text(value, 120)
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]*', value):
        raise ValueError('Invalid record identifier.')

def uuid(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', value):
        raise ValueError('Invalid UUID.')

def number(value, integer=False):
    if type(value) not in (int, float) or (integer and type(value) is not int):
        raise ValueError('Invalid observation number.')
    try:
        valid = math.isfinite(value) and value >= 0 and (not integer or value <= 9007199254740991)
    except OverflowError:
        valid = False
    if not valid:
        raise ValueError('Invalid observation number.')

def validate_payload(event):
    exact(event['payload'], 'attempt evidence')
    a, e = event['payload']['attempt'], event['payload']['evidence']
    exact(a, 'job_id attempt_id retry_of robot_id snapshot_id snapshot_revision source_identity procedure procedure_version task environment components reality method')
    for key in ('job_id', 'attempt_id', 'source_identity'):
        uuid(a[key])
    if a['retry_of'] is not None:
        uuid(a['retry_of'])
        if a['retry_of'] == a['attempt_id']:
            raise ValueError('Retry must identify a prior attempt.')
    for key in ('robot_id', 'snapshot_id'):
        identifier(a[key])
    number(a['snapshot_revision'], integer=True)
    if a['snapshot_revision'] < 1 or a['method'] != 'collector' or a['reality'] not in ('real', 'simulation', 'synthetic'):
        raise ValueError('Invalid execution context.')
    if a['source_identity'] != event['source_identity'] or a['attempt_id'] != event['run_id']:
        raise ValueError('Envelope must match exact attempt and source.')
    for key in ('procedure', 'procedure_version', 'task', 'environment', 'components'):
        f = a[key]
        if isinstance(f, dict) and f.get('state') == 'known':
            exact(f, 'state value'); text(f['value'])
        else:
            exact(f, 'state reason'); text(f['reason'])
            if f['state'] not in ('unknown', 'not-applicable'):
                raise ValueError('Invalid evidence state.')
    exact(e, 'kind payload correction_of reason')
    if e['correction_of'] is None:
        if e['reason'] is not None:
            raise ValueError('Reason requires correction reference.')
    else:
        uuid(e['correction_of']); text(e['reason'])
        if e['correction_of'] == event['event_id']:
            raise ValueError('Cannot correct itself.')
    p, kind = e['payload'], e['kind']
    if kind in ('state', 'step'):
        exact(p, 'state' if kind == 'state' else 'state step_id')
        if p['state'] not in STATES:
            raise ValueError('Invalid execution state.')
        if kind == 'step': identifier(p['step_id'])
    elif kind == 'acknowledged':
        exact(p, '')
        if e['correction_of'] is not None: raise ValueError('Cannot correct acknowledgement.')
    elif kind == 'measurement':
        exact(p, 'name state value unit reason'); identifier(p['name']); text(p['unit'], 40)
        if p['state'] == 'known':
            if type(p['value']) not in (int, float) or p['reason'] is not None:
                raise ValueError('Invalid measurement.')
            try: valid = math.isfinite(p['value'])
            except OverflowError: valid = False
            if not valid: raise ValueError('Invalid measurement.')
        elif p['state'] in ('unknown', 'not-applicable') and p['value'] is None: text(p['reason'])
        else: raise ValueError('Missing measurement is not zero.')
        if p['name'] in ('duration', 'downtime') and (p['unit'] != 's' or (p['value'] is not None and p['value'] < 0)):
            raise ValueError('Duration and downtime require nonnegative seconds.')
    elif kind == 'label':
        exact(p, 'name value evidence'); identifier(p['name']); text(p['value']); text(p['evidence'], 500)
    elif kind == 'component':
        exact(p, 'component_id action evidence hours cycles'); identifier(p['component_id']); text(p['evidence'], 500)
        if p['action'] not in ('installed', 'removed', 'maintained', 'serviced'): raise ValueError('Invalid component action.')
        if p['hours'] is not None: number(p['hours'])
        if p['cycles'] is not None: number(p['cycles'], integer=True)
    else: raise ValueError('Unsupported execution evidence.')
