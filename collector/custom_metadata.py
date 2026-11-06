"""Approved JSON/CSV scalar mappings. No discovery, network, or robot writes."""
import csv
import io
import re
from pathlib import Path

DEFINITION = ('id', 'component', 'name', 'type', 'unit', 'category')
NUMERIC = re.compile(r'-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\Z')


def definition(d, c):
    c.identifier(d.get('id'), 'custom.id')
    for k in ('component', 'name'):
        c.text(d.get(k), 'custom.' + k, 120)
    c.require(d.get('type') in ('number', 'text', 'boolean') and d.get('category') in ('configuration', 'condition', 'measurement'), 'custom', 'invalid type or purpose')
    if d['type'] == 'number':
        c.text(d.get('unit'), 'custom.unit', 40)
    else:
        c.require(d.get('unit') == '', 'custom', 'text and boolean fields have no unit')


def validate_mapping(mapping, c):
    c.obj(mapping, ('id', 'name', 'format', 'fields'), 'mapping')
    c.identifier(mapping.get('id'), 'mapping.id')
    c.text(mapping.get('name'), 'mapping.name', 120)
    c.require(mapping.get('format') in ('json', 'csv') and isinstance(mapping.get('fields'), list) and 1 <= len(mapping['fields']) <= 100, 'mapping', 'expected JSON/CSV mapping with 1–100 fields')
    ids, paths = set(), set()
    for d in mapping['fields']:
        c.obj(d, (*DEFINITION, 'source', 'unitSource'), 'mapping field')
        definition(d, c)
        for k in ('source', 'unitSource') if 'unitSource' in d else ('source',):
            path = c.text(d.get(k), 'mapping pointer')
            sensitive = re.search(r'password|passwd|secret|credential|private.?key|api.?key|access.?token|auth.?token|source.?code|raw.?weights|raw.?dataset|recording|(?:^|/)token(?:/|$)', path, re.I)
            c.require(path.startswith('/') and not re.search(r'~(?![01])', path) and not sensitive, 'mapping', 'invalid or sensitive source pointer')
        c.require(d['id'] not in ids and d['source'] not in paths, 'mapping', 'duplicate field or source')
        ids.add(d['id'])
        paths.add(d['source'])


def validate_custom(fields, c):
    c.require(isinstance(fields, list) and 1 <= len(fields) <= 100, 'custom', 'expected 1–100 custom fields')
    ids = set()
    for d in fields:
        c.obj(d, (*DEFINITION, 'value', 'provenance'), 'custom')
        definition(d, c)
        c.require(d['id'] not in ids, 'custom', 'duplicate field ID')
        ids.add(d['id'])
        f = c.obj(d.get('value'), ('state', 'value', 'reason'), 'custom.value')
        if f.get('state') == 'known':
            c.require('reason' not in f, 'custom.value', 'known values cannot have a reason')
            if d['type'] == 'number':
                c.number(f.get('value'), 'custom.value', True)
            elif d['type'] == 'text':
                c.text(f.get('value'), 'custom.value')
            else:
                c.require(type(f.get('value')) is bool, 'custom.value', 'expected boolean')
        else:
            c.require(f.get('state') in ('unknown', 'not-applicable') and 'value' not in f, 'custom.value', 'invalid state')
            c.text(f.get('reason'), 'custom.reason', 2048)
        p = c.obj(d.get('provenance'), ('source', 'method', 'author', 'observedAt', 'recordedAt', 'evidence', 'available'), 'custom.provenance')
        for k in ('source', 'method', 'author', 'evidence'):
            c.text(p.get(k), 'custom.provenance')
        c.stamp(p.get('observedAt'), 'custom.observedAt')
        c.stamp(p.get('recordedAt'), 'custom.recordedAt')
        c.require(p['observedAt'] <= p['recordedAt'] and type(p.get('available')) is bool, 'custom.provenance', 'invalid time or availability')


def pointer(root, path):
    for part in path[1:].split('/'):
        part = part.replace('~1', '/').replace('~0', '~')
        if isinstance(root, dict):
            root = root.get(part)
        elif isinstance(root, list) and re.fullmatch(r'0|[1-9]\d*', part) and len(part) < 10 and int(part) < len(root):
            root = root[int(part)]
        else:
            return None
    return root


def capture(config, base, author, c):
    c.obj(config, ('source', 'mapping', 'row', 'observedAt'), 'custom config')
    observed = c.stamp(config.get('observedAt'), 'custom.observedAt')
    envelope = c.read_json(Path(base) / c.text(config.get('mapping'), 'custom.mapping', 4096))
    c.obj(envelope, ('format', 'version', 'mapping'), 'mapping file')
    c.require(envelope.get('format') == 'unify-mapping' and type(envelope.get('version')) is int and envelope['version'] == 1, 'mapping file', 'expected mapping version 1')
    mapping = envelope.get('mapping')
    validate_mapping(mapping, c)
    row = config.get('row', 0)
    c.require(type(row) is int and 0 <= row < 1000 and (mapping['format'] == 'csv' or row == 0), 'custom.row', 'use a zero-based row index; JSON has one row')
    path = Path(base) / c.text(config.get('source'), 'custom.source', 4096)
    available, root = True, None
    try:
        if mapping['format'] == 'json':
            root = c.read_json(path)
            c.require(isinstance(root, dict), 'metadata', 'JSON must be an object')
        else:
            with path.open('rb') as stream:
                raw = stream.read(c.MAX_BYTES + 1)
            c.require(len(raw) <= c.MAX_BYTES, 'metadata', 'file exceeds 2 MiB')
            rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig'), newline=''), strict=True))
            c.require(2 <= len(rows) <= 1001 and 1 <= len(rows[0]) <= 200, 'metadata', 'invalid CSV size')
            header = rows.pop(0)
            c.require(len(set(header)) == len(header) and all(len(r) == len(header) for r in rows) and row < len(rows), 'metadata', 'invalid CSV columns or row')
            for name in header:
                c.text(name, 'CSV header', 120)
            root = dict(zip(header, rows[row]))
    except (c.Invalid, OSError, UnicodeError, csv.Error, RecursionError):
        available = False
    fields = []
    for d in mapping['fields']:
        raw = pointer(root, d['source']) if available else None
        if raw is None or raw == '':
            value = c.unknown('Mapped source field is missing or empty.' if available else 'Configured metadata source is unavailable or invalid.')
        elif 'unitSource' in d and pointer(root, d['unitSource']) != d['unit']:
            value = c.unknown('Source unit is missing or differs from the approved mapping. Review before comparing.')
        else:
            if mapping['format'] == 'csv' and isinstance(raw, str):
                if d['type'] == 'number' and NUMERIC.fullmatch(raw):
                    raw = float(raw)
                elif d['type'] == 'boolean' and raw in ('true', 'false'):
                    raw = raw == 'true'
            try:
                if d['type'] == 'number':
                    c.number(raw, 'custom.value', True)
                elif d['type'] == 'text':
                    c.text(raw, 'custom.value')
                else:
                    c.require(type(raw) is bool, 'custom.value', 'expected boolean')
                value = {'state': 'known', 'value': raw}
            except c.Invalid:
                value = c.unknown('Source value does not match the approved type or size.')
        evidence = 'Mapping ' + mapping['id'] + '; field ' + d['id']
        if mapping['format'] == 'csv':
            evidence += f'; CSV data row {row + 1} (1-based)'
        fields.append({**{k: d[k] for k in DEFINITION}, 'value': value, 'provenance': {'source': 'Approved engineer metadata export', 'method': 'Engineer-approved file metadata; physical state unverified', 'author': author, 'observedAt': observed, 'recordedAt': c.now(), 'evidence': evidence, 'available': available}})
    validate_custom(fields, c)
    return mapping, fields
