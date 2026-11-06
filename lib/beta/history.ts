import { emptyBundle, MAX_BYTES, parseBundle } from '../local/records.ts';
import type { Bundle } from '../local/records.ts';

export const collections = ['robots','snapshots','runs','corrections','mappings','investigation_revisions'] as const;
type Row = { key: string; revision: number; payload: unknown; submitted_version: number };
export type HistoryPage = { rows: Row[]; watermark: number; next: Row | null };
export type PageReader = (data: Record<string, unknown>) => Promise<HistoryPage>;

// Compatibility adapter only: bounded memory and explicit overflow. History is never truncated.
export async function boundedHistory(page: PageReader, synthetic: boolean, watermark: number): Promise<Bundle | null> {
  const b = emptyBundle(); b.synthetic = synthetic; b.version = 2;
  let bytes = 256;
  for (const collection of collections) {
    const items: unknown[] = []; let after = '', revision = 0;
    while (true) {
      const result = await page({ collection, after, revision, watermark });
      for (const row of result.rows) { bytes += Buffer.byteLength(JSON.stringify(row.payload)); items.push(row.payload); }
      if (bytes > MAX_BYTES - 1024 || items.length > 1000) return null;
      if (!result.next) break;
      after = result.next.key; revision = result.next.revision;
    }
    if (collection === 'robots' || collection === 'snapshots' || collection === 'runs') (b.records[collection] as unknown[]) = items;
    else if (collection === 'investigation_revisions') b.investigations = items as Bundle['investigations'];
    else (b[collection] as unknown[]) = items;
  }
  return parseBundle(JSON.stringify(b));
}

// Watermark fixes content; each page reauthorizes. EOF without complete=true is a failed export.
export function streamHistory(page: PageReader, synthetic: boolean, watermark: number, executionLimits?:Record<string,number>): ReadableStream<Uint8Array> {
  const encode = new TextEncoder();
  async function* lines() {
    yield { format: 'unify-history', version: executionLimits?2:1, synthetic, watermark, ...(executionLimits?{executionLimits}:{}) };
    for (const collection of [...collections, 'audit_events',...Object.keys(executionLimits??{})]) {
      let after = '', revision = 0;
      while (true) {
        const result = await page({ collection, after, revision, watermark:executionLimits?.[collection]??watermark });
        for (const row of result.rows) yield { collection, ...row };
        if (!result.next) break;
        after = result.next.key; revision = result.next.revision;
      }
    }
    // Even an empty final collection requires authorization before completion.
    await page({ collection: 'robots', limit: 1, watermark });
    yield { complete: true, watermark };
  }
  const iterator = lines();
  return new ReadableStream({ async pull(controller) { try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(encode.encode(JSON.stringify(next.value)+'\n')); } catch { controller.error(new Error('Export interrupted. Discard the incomplete file and retry after signing in.')); } }, async cancel() { await iterator.return(undefined); } });
}
