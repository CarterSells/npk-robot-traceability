import { compareField, formatField } from '../demo/records.ts';
import type { Field, Provenance, Snapshot, Result } from '../demo/records.ts';

export type Definition = { id: string; component: string; name: string; type: 'number' | 'text' | 'boolean'; unit: string; category: 'configuration' | 'condition' | 'measurement' };
export type CustomField = Definition & { value: Field; provenance: Provenance };
export type MappingField = Definition & { source: string; unitSource?: string };
export type Mapping = { id: string; name: string; format: 'json' | 'csv'; fields: MappingField[] };
export type Candidate = { source: string; component: string; name: string; type: Definition['type']; unit: string; unitSource?: string; sample: unknown; blocked: boolean };
export type SourceDocument = { format: 'json' | 'csv'; rows: unknown[]; candidates: Candidate[] };
const MAX = 2 * 1024 * 1024;
const definitionKeys = ['id', 'component', 'name', 'type', 'unit', 'category'];
function fail(message: string): never { throw new Error(`Custom metadata: ${message}`); }
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('unsupported object or fields.');
}
function text(value: unknown, max = 120): asserts value is string { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`expected nonempty text of at most ${max} characters.`); }
function id(value: unknown) { text(value); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) fail('invalid stable field or mapping ID.'); }
export function sensitivePath(path: string): boolean {
  return /(?:password|passwd|secret|credential|private.?key|api.?key|access.?token|auth.?token|source.?code|raw.?weights|raw.?dataset|recording)/i.test(path) || /(?:^|\/)token(?:\/|$)/i.test(path);
}
function definition(d: Record<string, unknown>) {
  id(d.id); text(d.component); text(d.name);
  if (!['number', 'text', 'boolean'].includes(d.type as string) || !['configuration', 'condition', 'measurement'].includes(d.category as string)) fail('choose a supported type and category.');
  if (typeof d.unit !== 'string' || d.unit.length > 40 || (d.type === 'number' ? !d.unit.trim() : d.unit !== '')) fail('numbers need a unit (use 1 for dimensionless); text and booleans have no unit.');
}
export function validateCustom(fields: unknown): asserts fields is CustomField[] {
  if (!Array.isArray(fields) || !fields.length || fields.length > 100) fail('expected 1–100 custom fields.');
  const ids = new Set();
  for (const d of fields) {
    object(d, [...definitionKeys, 'value', 'provenance']); definition(d);
    if (ids.has(d.id)) fail('duplicate stable field ID.'); ids.add(d.id);
    object(d.value, ['state', 'value', 'reason']);
    if (d.value.state === 'known') {
      if ('reason' in d.value) fail('known fields cannot carry a reason.');
      const v = d.value.value;
      if (d.type === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : d.type === 'boolean' ? typeof v !== 'boolean' : typeof v !== 'string' || !v.trim() || v.length > 512) fail('value does not match the confirmed type.');
    } else {
      if (!['unknown', 'not-applicable'].includes(d.value.state as string) || 'value' in d.value) fail('invalid missing-information state.');
      text(d.value.reason, 2048);
    }
    object(d.provenance, ['source', 'method', 'author', 'observedAt', 'recordedAt', 'evidence', 'available']);
    for (const k of ['source', 'method', 'author', 'evidence']) text(d.provenance[k], 512);
    for (const k of ['observedAt', 'recordedAt']) {
      const date = d.provenance[k];
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().replace('.000Z', 'Z') !== date) fail('use a real UTC observation and recording time.');
    }
    if ((d.provenance.observedAt as string) > (d.provenance.recordedAt as string) || typeof d.provenance.available !== 'boolean') fail('invalid evidence availability or time order.');
  }
}
export function validateMapping(value: unknown): asserts value is Mapping {
  object(value, ['id', 'name', 'format', 'fields']); id(value.id); text(value.name);
  if (!['json', 'csv'].includes(value.format as string) || !Array.isArray(value.fields) || !value.fields.length || value.fields.length > 100) fail('mapping needs JSON or CSV and 1–100 approved fields.');
  const ids = new Set(), paths = new Set();
  for (const d of value.fields) {
    object(d, [...definitionKeys, 'source', 'unitSource']); definition(d);
    for (const key of ['source', ...('unitSource' in d ? ['unitSource'] : [])]) {
      text(d[key], 512);
      if (!(d[key] as string).startsWith('/') || /~(?![01])/.test(d[key] as string) || sensitivePath(d[key] as string)) fail('source must be an approved JSON pointer; sensitive paths are blocked.');
    }
    if (ids.has(d.id) || paths.has(d.source)) fail('duplicate field ID or source path in mapping.');
    ids.add(d.id); paths.add(d.source);
  }
}
export function parseMapping(text: string): Mapping {
  const envelope = strictJSON(text);
  object(envelope, ['format', 'version', 'mapping']);
  if (envelope.format !== 'unify-mapping' || envelope.version !== 1) fail('expected a Tavrik mapping file, version 1.');
  validateMapping(envelope.mapping); return envelope.mapping;
}
export function exportMapping(mapping: Mapping): string { validateMapping(mapping); return JSON.stringify({ format: 'unify-mapping', version: 1, mapping }, null, 2); }

// Detect duplicate object keys before JSON.parse could silently discard them.
function strictJSON(raw: string): unknown {
  if (new TextEncoder().encode(raw).length > MAX) fail('file exceeds 2 MiB.');
  raw = raw.replace(/^\uFEFF/, '');
  try {
    const stack: { keys: Set<string>; object: boolean }[] = [];
    const tokens = raw.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ?? [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === '{' || token === '[') {
        stack.push({ keys: new Set(), object: token === '{' });
        if (stack.length > 16) fail('maximum nesting depth is 16.');
      } else if (token === '}' || token === ']') stack.pop();
      else if (token.startsWith('"') && tokens[i + 1] === ':' && stack.at(-1)?.object) {
        const key = JSON.parse(token), keys = stack.at(-1)!.keys;
        if (keys.has(key)) fail('duplicate JSON keys are not allowed.'); keys.add(key);
      }
    }
    return JSON.parse(raw);
  } catch (e) { if (e instanceof Error && e.message.startsWith('Custom metadata:')) throw e; fail('invalid JSON.'); }
}
function csv(raw: string): unknown[] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false, closed = false;
  function cell() { row.push(value); value = ''; closed = false; }
  function end() { cell(); rows.push(row); row = []; if (rows.length > 1001) fail('CSV limit is 1,000 data rows.'); }
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quoted) { if (char === '"') { if (raw[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } } else value += char; }
    else if (char === ',') cell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && raw[i + 1] === '\n') i++; end(); }
    else if (char === '"' && value === '' && !closed) quoted = true;
    else { if (closed || char === '"') fail('invalid CSV quoting.'); value += char; }
    if (row.length > 200 || value.length > MAX) fail('CSV limits exceeded.');
  }
  if (quoted) fail('unterminated CSV quote.');
  if (value || row.length || closed) end();
  const header = rows.shift();
  if (!header?.length || header.length > 200 || header.some(x => !x.trim() || x.length > 120) || new Set(header).size !== header.length || !rows.length) fail('CSV needs unique nonempty column headers and at least one data row.');
  return rows.map(row => { if (row.length !== header.length) fail('CSV rows must match the header width.'); return Object.fromEntries(header.map((key, i) => [key, row[i]])); });
}
function pointerPart(value: string) { return value.replaceAll('~', '~0').replaceAll('/', '~1'); }
export function readPointer(root: unknown, pointer: string): unknown {
  let current = root;
  for (const part of pointer.slice(1).split('/').map(p => p.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(part)) return undefined;
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
const numeric = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
function inferred(value: unknown): Definition['type'] {
  if (typeof value === 'number' || typeof value === 'string' && numeric.test(value)) return 'number';
  if (typeof value === 'boolean' || value === 'true' || value === 'false') return 'boolean';
  return 'text';
}
export function inspectSource(raw: string, format: 'json' | 'csv'): SourceDocument {
  if (new TextEncoder().encode(raw).length > MAX) fail('file exceeds 2 MiB.');
  const rows = format === 'csv' ? csv(raw.replace(/^\uFEFF/, '')) : [strictJSON(raw)];
  if (!rows[0] || typeof rows[0] !== 'object' || Array.isArray(rows[0])) fail('JSON must be an object; CSV represents one snapshot per selected row.');
  const candidates = new Map<string, Candidate>(); let visited = 0;
  function visit(value: unknown, parts: string[], unit = '', unitSource?: string) {
    if (++visited > 20000 || parts.length > 16) fail('metadata is too large or deeply nested.');
    const source = '/' + parts.map(pointerPart).join('/');
    if (parts.length && sensitivePath(source)) {
      candidates.set(source, { source, component: parts.slice(0, -1).join(' / ') || 'Robot', name: parts.at(-1)!, type: 'text', unit: '', sample: undefined, blocked: true });
    } else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (!Array.isArray(value) && Object.hasOwn(record, 'value') && typeof record.unit === 'string') {
        visit(record.value, [...parts, 'value'], record.unit, (parts.length ? source : '') + '/unit');
        for (const [key, child] of Object.entries(record)) if (key !== 'value' && key !== 'unit') visit(child, [...parts, key]);
      } else for (const [key, child] of Object.entries(value)) visit(child, [...parts, key]);
    } else {
      const prior = candidates.get(source);
      if (!prior || prior.sample === null || prior.sample === '') {
        const labelParts = unitSource ? parts.slice(0, -1) : parts;
        const rawName = labelParts.at(-1) ?? 'Value', headerUnit = rawName.match(/^(.*?)\s*\[([^\]]+)\]$/);
        const type = format === 'csv' ? inferred(value) : typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text';
        candidates.set(source, { source, component: labelParts.slice(0, -1).join(' / ') || 'Robot', name: headerUnit?.[1] || rawName, type, unit: type === 'number' ? unit || headerUnit?.[2] || '' : '', ...(unitSource ? { unitSource } : {}), sample: value, blocked: false });
      }
    }
    if (candidates.size > 200) fail('maximum 200 discoverable fields; export a smaller metadata selection.');
  }
  for (const row of rows) visit(row, []);
  return { format, rows, candidates: [...candidates.values()] };
}
export function applyMapping(mapping: Mapping, document: SourceDocument, row: number, provenance: Provenance): CustomField[] {
  validateMapping(mapping);
  if (mapping.format !== document.format || !Number.isInteger(row) || row < 0 || row >= document.rows.length) fail('mapping format or selected row does not match.');
  const custom = mapping.fields.map(({ source, unitSource, ...d }) => {
    let raw = readPointer(document.rows[row], source), value: Field;
    const sourceUnit = unitSource ? readPointer(document.rows[row], unitSource) : undefined;
    if (raw === null || raw === undefined || raw === '') value = { state: 'unknown', reason: 'Mapped source field is missing or empty.' };
    else if (unitSource && sourceUnit !== d.unit) value = { state: 'unknown', reason: 'Source unit is missing or differs from the approved mapping. Review before comparing.' };
    else {
      if (document.format === 'csv') {
        if (d.type === 'number' && typeof raw === 'string' && numeric.test(raw)) raw = Number(raw);
        if (d.type === 'boolean' && (raw === 'true' || raw === 'false')) raw = raw === 'true';
      }
      const valid = d.type === 'number' ? typeof raw === 'number' && Number.isFinite(raw) : d.type === 'boolean' ? typeof raw === 'boolean' : typeof raw === 'string' && !!raw.trim() && raw.length <= 512;
      value = valid ? { state: 'known', value: raw as string | number | boolean } : { state: 'unknown', reason: 'Source value does not match the approved type or size.' };
    }
    return { ...d, value, provenance: { ...provenance, method: 'Engineer-approved file metadata; physical state unverified', evidence: `Mapping ${mapping.id}; field ${d.id}${document.format === 'csv' ? `; CSV data row ${row + 1} (1-based)` : ''}` } };
  });
  validateCustom(custom); return custom;
}
export function formatCustom(field: CustomField): string { return formatField(field.value) + (field.value.state === 'known' && field.type === 'number' ? ` ${field.unit}` : ''); }
export function compareCustom(a: Snapshot, b: Snapshot) {
  const left = new Map((a.custom ?? []).map(f => [f.id, f])), right = new Map((b.custom ?? []).map(f => [f.id, f]));
  const warnings: string[] = [];
  const rows = [...new Set([...left.keys(), ...right.keys()])].sort().map(id => {
    const before = left.get(id), after = right.get(id), def = after ?? before!;
    const missing: Field = { state: 'unknown', reason: 'Field was not recorded in this snapshot.' };
    const compatible = !before || !after || ['type', 'unit', 'component', 'name', 'category'].every(k => before[k as keyof Definition] === after[k as keyof Definition]);
    const result: Result = compatible ? compareField(before?.value ?? missing, after?.value ?? missing) : 'Unknown';
    if (!compatible) warnings.push(`${def.component} / ${def.name}: definitions or units differ; no conversion or equivalence is assumed.`);
    if (def.category === 'condition' && result !== 'Unchanged') warnings.push(`${def.component} / ${def.name}: custom test condition is ${result.toLowerCase()}; comparability is limited.`);
    const display = (f?: CustomField): Field => f ? f.value.state === 'known' ? { state: 'known', value: formatCustom(f) } : f.value : missing;
    return { key: `custom:${id}`, group: def.component, label: def.name, before: display(before), after: display(after), result };
  });
  return { rows, warnings };
}
