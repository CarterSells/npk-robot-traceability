// Notifications contain only publication watermarks. Records are fetched through
// their independently authorized endpoints. Each tick rechecks current access.
export function portalStream(check: () => Promise<string>, signal: AbortSignal, interval = 5000) {
  let stopped = false, ticks = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let wake: (() => void) | undefined;
  const stop = () => { stopped = true; clearTimeout(timer); wake?.(); };
  signal.addEventListener('abort', stop, { once: true });
  const cleanup = () => { stop(); signal.removeEventListener('abort', stop); };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (ticks++) await new Promise<void>(resolve => { wake = resolve; timer = setTimeout(resolve, interval); });
      if (stopped || signal.aborted) { cleanup(); try { controller.close(); } catch {} return; }
      try {
        const revision = await check();
        if (stopped || signal.aborted) { cleanup(); try { controller.close(); } catch {} return; }
        controller.enqueue(new TextEncoder().encode(`event: checked\ndata: ${JSON.stringify({ revision, checkedAt: new Date().toISOString() })}\n\n`));
        // Bound requests so session renewal and hosting timeouts can recover.
        if (ticks >= 5) { cleanup(); controller.close(); }
      } catch {
        if (stopped) { cleanup(); try { controller.close(); } catch {} return; }
        if (!stopped) {
          controller.enqueue(new TextEncoder().encode('event: unavailable\ndata: {}\n\n'));
          cleanup(); controller.close();
        }
      }
    },
    cancel() { cleanup(); },
  });
}
