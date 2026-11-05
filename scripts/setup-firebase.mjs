/**
 * One-command setup of an ONLINE Firebase project for this app (works on the free Spark plan).
 *
 *   npm run setup:firebase -- --email you@example.com --password YourPassword
 *
 * What it does (safe to re-run; existing things are left as they are):
 *   1. Creates the Firestore database if the project doesn't have one yet
 *   2. Publishes firestore.rules and turns on Email/Password sign-in (firebase deploy)
 *   3. Creates the admin login (or reuses it if the email already exists)
 *   4. Gives that user the highest level (admins/{uid} with role "manager")
 *
 * Options:
 *   --project <id>      Firebase project ID (default: VITE_FIREBASE_PROJECT_ID from .env.local)
 *   --account <email>   Google account to use (default: the account the Firebase CLI uses in this folder)
 *   --location <loc>    Database location if it has to be created (default: africa-south1). Cannot be changed later.
 *   --yes               Skip the confirmation question
 *
 * Needs the Firebase CLI (npm install -g firebase-tools) and `firebase login`.
 */
import { createRequire } from 'module';
import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import readline from 'readline';

const DEFAULT_LOCATION = 'africa-south1';

// ---------- helpers ----------
const ok = (m) => console.log(`\x1b[32m✔\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[36m▶\x1b[0m ${m}`);
class SetupError extends Error {}
// Throw instead of process.exit(): exiting while the readline handle is still closing
// crashes Node on Windows with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
function fail(message) {
  throw new SetupError(message);
}

function parseArgs(argv) {
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

function readEnvLocal(key) {
  const file = path.join(process.cwd(), '.env.local');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadFirebaseTools() {
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

function apiError(e) {
  const ctx = e?.context?.body?.error;
  return ctx?.message || ctx?.status || e?.message || String(e);
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = (typeof args.project === 'string' && args.project) || readEnvLocal('VITE_FIREBASE_PROJECT_ID');
  const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  const password = typeof args.password === 'string' ? args.password : '';
  const location = typeof args.location === 'string' ? args.location : DEFAULT_LOCATION;

  if (!projectId) fail('No project ID. Put VITE_FIREBASE_PROJECT_ID in .env.local or pass --project <id>.');
  if (projectId.startsWith('demo-')) fail(`"${projectId}" is the local emulator project. Use npm run seed:emulators for that.`);
  if (!email || !email.includes('@')) fail('Give the admin login email:  --email you@example.com');
  if (password.length < 6) fail('Give a password of at least 6 characters:  --password YourPassword');

  const fbt = loadFirebaseTools();

  // Which Google account?
  let account;
  try {
    account = fbt.auth.selectAccount(typeof args.account === 'string' ? args.account : undefined, process.cwd());
  } catch (e) {
    fail(e.message);
  }
  if (!account?.user?.email) fail('You are not signed in to the Firebase CLI. Run:  firebase login');
  const accountEmail = account.user.email;

  console.log('\nFirebase setup for the QSA Reporting System');
  console.log('──────────────────────────────────────────');
  console.log(`  Google account : ${accountEmail}`);
  console.log(`  Project        : ${projectId}`);
  console.log(`  Admin login    : ${email}`);
  console.log(`  DB location    : ${location} (only used if the database doesn't exist yet)`);
  console.log(`  Firebase CLI   : v${fbt.version}`);

  if (!args.yes) {
    const answer = await ask('\nIs this the right account and project? (y/N) ');
    if (!/^y(es)?$/i.test(answer)) {
      console.log('Cancelled. To use another account: firebase login:use <email>  (or pass --account <email>)');
      return;
    }
  }

  // Authenticate API calls as the chosen account (same credentials the Firebase CLI uses)
  try {
    await fbt.requireAuth({ user: account.user, tokens: account.tokens, projectRoot: process.cwd(), project: projectId });
  } catch (e) {
    fail(`Could not use the signed-in account: ${e.message}\nTry: firebase login --reauth`);
  }
  const firestoreApi = new fbt.apiv2.Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  const identityApi = new fbt.apiv2.Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1' });
  const userProject = { headers: { 'x-goog-user-project': projectId } };

  // 0. Make sure the Google APIs this setup needs are switched on (new projects start with them off)
  step('Switching on the Firestore and Authentication services...');
  for (const api of ['firestore.googleapis.com', 'identitytoolkit.googleapis.com']) {
    try {
      await fbt.ensureApi(projectId, `https://${api}`, 'setup', true);
      ok(api);
    } catch (e) {
      if (e?.status === 403) {
        fail(`${accountEmail} is not allowed to change project "${projectId}".\n  Check the project ID, and that this Google account owns the project (firebase login:use <email>).\n  (${apiError(e)})`);
      }
      fail(`Could not switch on ${api}: ${apiError(e)}\n  You can switch it on here, then run this again: https://console.cloud.google.com/apis/library/${api}?project=${projectId}`);
    }
  }

  // 1. Firestore database
  step('Checking the Firestore database...');
  const dbPath = `/projects/${projectId}/databases/(default)`;
  let dbExists = false;
  for (let attempt = 0; ; attempt++) {
    try {
      await firestoreApi.get(dbPath);
      dbExists = true;
      ok('Firestore database already exists.');
      break;
    } catch (e) {
      if (e?.status === 404) break; // no database yet: create it below
      const justEnabled = e?.status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(apiError(e));
      if (justEnabled && attempt < 18) {
        if (attempt === 0) console.log('  Waiting for the newly switched-on service to be ready (can take a couple of minutes)...');
        await sleep(10000);
        continue;
      }
      if (justEnabled) fail('The Firestore service is still starting up. Wait a few minutes, then run this command again.');
      if (e?.status === 403) {
        fail(`Access denied to project "${projectId}" for ${accountEmail}.\n  Check the project ID and that this account owns the project.\n  (${apiError(e)})`);
      }
      fail(`Could not check the database: ${apiError(e)}`);
    }
  }
  if (!dbExists) {
    console.log(`  Creating it in ${location}...`);
    try {
      await firestoreApi.post(`/projects/${projectId}/databases`, { type: 'FIRESTORE_NATIVE', locationId: location }, {
        queryParams: { databaseId: '(default)' }
      });
    } catch (e) {
      const msg = apiError(e);
      if (/SERVICE_DISABLED|has not been used|is disabled/i.test(msg)) {
        fail(`The Firestore API isn't enabled yet for this project.\n  Open https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=${projectId}, click Enable, wait a minute, and run this again.`);
      }
      fail(`Could not create the database: ${msg}\n  If the location is the problem, re-run with e.g. --location europe-west1`);
    }
    for (let i = 0; i < 40 && !dbExists; i++) {
      await sleep(3000);
      try {
        await firestoreApi.get(dbPath);
        dbExists = true;
      } catch { /* still creating */ }
    }
    if (!dbExists) fail('The database is still being created. Wait a minute and run this command again.');
    ok(`Firestore database created in ${location}.`);
  }

  // 2. Rules + Email/Password sign-in, through the normal Firebase CLI deploy
  step('Publishing security rules and turning on Email/Password sign-in...');
  const deploy = spawnSync(
    'firebase',
    ['deploy', '--only', 'firestore:rules,auth', '--project', projectId, '--account', accountEmail, '--non-interactive'],
    { stdio: 'inherit', shell: true }
  );
  if (deploy.status !== 0) {
    fail('firebase deploy failed (see the messages above).\n  If it mentions "auth", update the CLI: npm install -g firebase-tools@latest\n  You can also turn on Email/Password manually: Firebase console > Authentication > Sign-in method.');
  }
  ok('Rules published and Email/Password sign-in enabled.');

  // 3. Admin user
  step(`Creating the admin login ${email}...`);
  let uid = '';
  for (let attempt = 0; attempt < 5 && !uid; attempt++) {
    try {
      const found = await identityApi.post(`/projects/${projectId}/accounts:lookup`, { email: [email] }, userProject);
      if (found.body?.users?.length) {
        uid = found.body.users[0].localId;
        ok(`Login already exists (password left unchanged). UID: ${uid}`);
        break;
      }
      const created = await identityApi.post(`/projects/${projectId}/accounts`, { email, password }, userProject);
      uid = created.body.localId;
      ok(`Login created. UID: ${uid}`);
    } catch (e) {
      const msg = apiError(e);
      if (attempt < 4 && /CONFIGURATION_NOT_FOUND|not found/i.test(msg)) {
        await sleep(5000); // sign-in was just enabled; give it a moment
        continue;
      }
      fail(`Could not create the login: ${msg}`);
    }
  }
  if (!uid) fail('Could not create the login. Wait a minute and run this command again.');

  // 4. Admin role documents
  step('Giving the login Manager access (highest level)...');
  for (const collection of ['admins']) {
    try {
      await firestoreApi.patch(`${dbPath}/documents/${collection}/${uid}`, {
        fields: { enabled: { booleanValue: true }, email: { stringValue: email }, role: { stringValue: 'manager' } }
      });
      ok(`${collection}/${uid}`);
    } catch (e) {
      fail(`Could not write ${collection}/${uid}: ${apiError(e)}`);
    }
  }

  console.log(`\n\x1b[32mAll done.\x1b[0m Start the app with  npm run dev:online  and sign in at http://localhost:3000/admin`);
  console.log(`  Email: ${email}`);
}

main().catch((e) => {
  if (e instanceof SetupError) console.error(`\n\x1b[31m✘ ${e.message}\x1b[0m`);
  else console.error('\n\x1b[31m✘ Unexpected error:\x1b[0m', e?.message || e);
  process.exitCode = 1;
});
