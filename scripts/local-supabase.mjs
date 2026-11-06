import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const project = 'npk-unify';
export const network = 'npk-unify-loopback';
export const origin = 'http://127.0.0.1:3002';
export const apiURL = 'http://127.0.0.1:54321';
export function run(command, args, input) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024, timeout: 600000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`${command === 'docker' ? 'Docker' : 'Supabase CLI'} ${args[0]} failed. Check Docker Desktop is running and the local ports are free. No reset was attempted.`);
  return result.stdout;
}
export function cli(...args) { dockerReady(); return run(process.execPath, [resolve(root, 'node_modules/supabase/dist/supabase.js'), ...args]); }
export function assertLocalStatus(status) {
  if (status.API_URL !== apiURL || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Expected this local stack at 127.0.0.1:54321 with legacy anon/service-role keys. Refusing other targets.');
  for (const key of ['ANON_KEY', 'SERVICE_ROLE_KEY']) if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(status[key])) throw new Error('This adapter requires JWT-shaped local keys.');
  return status;
}
export function status() { return assertLocalStatus(JSON.parse(cli('status', '-o', 'json'))); }
export function assertLocalDocker(endpoint) {
  if (typeof endpoint !== 'string' || !(endpoint.startsWith('unix:///') || endpoint.startsWith('npipe:////./pipe/'))) throw new Error('Only a local Docker Unix socket or Windows named pipe is allowed. Switch to the local Docker Desktop context; remote/TCP contexts are refused.');
}
export function dockerReady() {
  const check = spawnSync('docker', ['info', '--format', '{{.OSType}}'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (check.error || check.status !== 0 || check.stdout.trim() !== 'linux') throw new Error('Docker Linux engine unavailable. In Administrator PowerShell run wsl --install, restart if requested, then install/open Docker Desktop with the WSL 2 backend. Wait for Engine running, reopen your terminal and retry npm run db:setup.');
  const contexts=JSON.parse(run('docker',['context','inspect']));
  assertLocalDocker(process.env.DOCKER_CONTEXT ? contexts[0]?.Endpoints?.docker?.Host : process.env.DOCKER_HOST || contexts[0]?.Endpoints?.docker?.Host);
}
export function sql(query) {
  dockerReady();
  return run('docker', ['exec', '-i', `supabase_db_${project}`, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], query);
}
export function configure() {
  const s = status();
  const values = { BETA_ENABLED: 'true', BETA_ORIGIN: origin, SUPABASE_URL: apiURL, SUPABASE_ANON_KEY: s.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY };
  const path = resolve(root, 'beta/.env.local');
  const text = '# Generated for local Supabase only. Server-side; never commit.\n' + Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n') + '\n';
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (current !== text) throw new Error('beta/.env.local already exists and differs. Preserved it. Back it up privately and reconcile it with the local setup guide before retrying.');
  } else writeFileSync(path, text, { flag: 'wx', mode: 0o600 });
  console.log('Local server configuration ready in ignored beta/.env.local (keys not printed).');
  return values;
}
export function start() {
  dockerReady();
  const inspected = spawnSync('docker', ['network', 'inspect', network], { encoding:'utf8', windowsHide:true });
  if (inspected.status === 0) {
    const item=JSON.parse(inspected.stdout)[0];
    if (item.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') throw new Error('Existing local network is not loopback-bound. Preserved it; inspect its configuration.');
  } else run('docker', ['network','create','-o','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network]);
  console.log('Starting local Supabase; the first run downloads container images.');
  cli('start', '--network-id', network);
  // Existing volumes are resumed. Pending migrations only; never reset or push remotely.
  cli('migration', 'up', '--local');
  configure();
  console.log('Database ready. Studio: http://127.0.0.1:54323. App: npm run dev:local');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action=process.argv[2];
    if (action==='start') start();
    else if (action==='env') configure();
    else if (action==='status') { status(); console.log('Local API: '+apiURL+'; Studio: http://127.0.0.1:54323'); }
    else if (action==='stop') { cli('stop'); console.log('Stopped local stack; database volumes retained.'); }
    else throw new Error('Use start, env, status or stop.');
  } catch(error) { console.error(error.message); process.exitCode=1; }
}
