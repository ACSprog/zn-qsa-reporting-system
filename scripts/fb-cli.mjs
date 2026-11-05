/** Shared helpers for scripts that use the Firebase CLI's signed-in Google account. */
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import readline from 'readline';

export const ok = (m) => console.log(`\x1b[32m✔\x1b[0m ${m}`);
export const step = (m) => console.log(`\n\x1b[36m▶\x1b[0m ${m}`);
export class SetupError extends Error {}
// Throw instead of process.exit(): exiting while the readline handle is still closing
// crashes Node on Windows with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
export function fail(message) {
  throw new SetupError(message);
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

export function readEnvLocal(key) {
  const file = path.join(process.cwd(), '.env.local');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

export function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadFirebaseTools() {
  const candidates = [];
  try {
    candidates.push(path.dirname(createRequire(import.meta.url).resolve('firebase-tools/package.json')));
  } catch { /* not installed locally */ }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    candidates.push(path.join(globalRoot, 'firebase-tools'));
  } catch { /* npm not on PATH */ }
  const dir = candidates.find((d) => existsSync(path.join(d, 'lib', 'apiv2.js')));
  if (!dir) fail('Firebase CLI not found. Install it with:  npm install -g firebase-tools');
  const req = createRequire(path.join(dir, 'package.json'));
  return {
    version: req('./package.json').version,
    auth: req('./lib/auth'),
    apiv2: req('./lib/apiv2'),
    requireAuth: req('./lib/requireAuth').requireAuth,
    ensureApi: req('./lib/ensureApiEnabled').ensure
  };
}

export function apiError(e) {
  const ctx = e?.context?.body?.error;
  return ctx?.message || ctx?.status || e?.message || String(e);
}

