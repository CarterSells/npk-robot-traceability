import { canonical } from '../demo/records.ts';
import type { Value } from '../demo/records.ts';
import { exportBundle, parseBundle } from '../local/records.ts';
import type { Bundle } from '../local/records.ts';

// An organization save may only append. Imported authors remain reported authors;
// the authenticated submitter is recorded separately by the database.
export function appendBundle(current: Bundle, incoming: Bundle): Bundle {
  const next = parseBundle(exportBundle(current));
  parseBundle(exportBundle(incoming));
  if (current.records.robots.length && current.synthetic !== incoming.synthetic) throw new Error('Synthetic and real records cannot mix.');
  next.synthetic = incoming.synthetic;
  next.version = Math.max(current.version, incoming.version) as 1 | 2;
  function merge<T>(target: T[], source: T[], key: (item: T) => string) {
    for (const item of source) {
      const prior = target.find(p => key(p) === key(item));
      if (prior && canonical(prior as Value) !== canonical(item as Value)) throw new Error('An existing record conflicts. Append a correction instead.');
      if (!prior) target.push(structuredClone(item));
    }
  }
  merge(next.records.robots, incoming.records.robots, r => r.id);
  merge(next.records.snapshots, incoming.records.snapshots, s => `${s.id}:${s.revision}`);
  merge(next.records.runs, incoming.records.runs, r => r.id);
  merge(next.corrections, incoming.corrections, c => `${c.snapshotId}:${c.revision}`);
  if (incoming.mappings?.length) { next.mappings ??= []; merge(next.mappings, incoming.mappings, m => m.id); }
  if (incoming.investigations?.length) { next.investigations ??= []; merge(next.investigations, incoming.investigations, e => `${e.id}:${e.revision}`); }
  return parseBundle(exportBundle(next));
}
