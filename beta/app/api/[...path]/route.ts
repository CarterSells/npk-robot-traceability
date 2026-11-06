import { createHandler } from '../../../../lib/beta/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const handle = createHandler();
export const GET = handle;
export const POST = handle;
