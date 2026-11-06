import { rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';

// Next exports its not-found HTML at this path. Remove that generated route
// so a static host cannot return a misleading HTTP 200 for the local workspace.
const output = resolve('out');
for (const route of ['local', 'workspace']) {
  const localRoute = resolve(output, route);
  if (dirname(localRoute) !== output || basename(localRoute) !== route) throw new Error('Unexpected local export path.');
  await rm(localRoute, { recursive: true, force: true });
  console.log(`Excluded development-only /${route}/ from the public static export.`);
}
