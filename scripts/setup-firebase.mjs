/**
 * One-command setup of an ONLINE Firebase project for this app (works on the free Spark plan).
 *
 *   npm run setup:firebase -- --email you@example.com --password YourPassword
 *   npm run setup:firebase -- --email you@example.com --enable-2fa      (login already exists)
 *
 * What it does (safe to re-run; existing things are left as they are):
 *   1. Creates the Firestore database if the project doesn't have one yet
 *   2. Publishes firestore.rules and turns on Email/Password sign-in (firebase deploy)
 *   3. Creates the login (or reuses it if the email already exists; password unchanged)
 *   4. Makes that user a Super Admin (admins/{uid} with role "superadmin")
 *   5. With --enable-2fa: upgrades the project to Identity Platform (free on Spark, up to
 *      3,000 daily users), turns on authenticator-app (TOTP) 2FA, and makes it required
 *      for everyone (settings/security.require2fa = true)
 *
 * Options:
 *   --password <pw>     Only needed when the login doesn't exist yet
 *   --enable-2fa        Turn on and require authenticator-app 2FA (see 5.)
 *   --relax-2fa         Stop requiring 2FA (emergency; users who set it up still use it)
 *   --action-url <url>  Send password-reset / verification links to the app's own branded page,
 *                       e.g. https://zn-qsa-reporting-system-test.web.app (adds /auth/action)
 *   --project <id>      Firebase project ID (default: VITE_FIREBASE_PROJECT_ID from .env.local)
 *   --account <email>   Google account to use (default: the account the Firebase CLI uses in this folder)
 *   --location <loc>    Database location if it has to be created (default: africa-south1). Cannot be changed later.
 *   --yes               Skip the confirmation question
 *
 * Needs the Firebase CLI (npm install -g firebase-tools) and `firebase login`.
 */
import { spawnSync } from 'child_process';

const DEFAULT_LOCATION = 'africa-south1';

import {
  ok,
  step,
  SetupError,
  fail,
  parseArgs,
  readEnvLocal,
  ask,
  sleep,
  loadFirebaseTools,
  apiError
} from './fb-cli.mjs';

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
  if (password && password.length < 6) fail('The password must be at least 6 characters.');
  if (args['enable-2fa'] && args['relax-2fa']) fail('Use either --enable-2fa or --relax-2fa, not both.');
  let actionUrl = '';
  if (args['action-url']) {
    if (typeof args['action-url'] !== 'string') fail('Give the site address:  --action-url https://your-site.web.app');
    actionUrl = args['action-url'].trim().replace(/\/+$/, '');
    if (!/^https:\/\/|^http:\/\/localhost(:\d+)?/.test(actionUrl)) fail('--action-url must start with https:// (or http://localhost for testing).');
    if (!actionUrl.endsWith('/auth/action')) actionUrl += '/auth/action';
  }

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
  console.log(`  Level          : Super Admin`);
  if (args['enable-2fa']) console.log('  2FA            : turn on authenticator-app 2FA and REQUIRE it for everyone');
  if (args['relax-2fa']) console.log('  2FA            : stop requiring 2FA');
  if (actionUrl) console.log(`  Email links    : ${actionUrl}`);
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
      if (!password) fail(`There is no login for ${email} yet. Add --password <at least 6 characters> to create it.`);
      const created = await identityApi.post(`/projects/${projectId}/accounts`, { email, password }, userProject);
      uid = created.body.localId;
      ok(`Login created. UID: ${uid}`);
    } catch (e) {
      if (e instanceof SetupError) throw e;
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
  step('Making the login a Super Admin (highest level)...');
  for (const collection of ['admins']) {
    try {
      await firestoreApi.patch(`${dbPath}/documents/${collection}/${uid}`, {
        fields: { enabled: { booleanValue: true }, email: { stringValue: email }, role: { stringValue: 'superadmin' } }
      });
      ok(`${collection}/${uid}`);
    } catch (e) {
      fail(`Could not write ${collection}/${uid}: ${apiError(e)}`);
    }
  }

  // 5. Two-factor authentication
  const writeRequire2fa = async (value) => {
    await firestoreApi.patch(`${dbPath}/documents/settings/security`, {
      fields: { require2fa: { booleanValue: value } }
    });
  };
  if (args['enable-2fa']) {
    step('Turning on authenticator-app 2FA...');
    const identityV2 = new fbt.apiv2.Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v2' });
    const identityAdmin = new fbt.apiv2.Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'admin/v2' });
    try {
      await identityV2.post(`/projects/${projectId}/identityPlatform:initializeAuth`, {}, userProject);
      ok('Upgraded to Firebase Authentication with Identity Platform (free on Spark, up to 3,000 daily users).');
    } catch (e) {
      const msg = apiError(e);
      if (/already|ALREADY/.test(msg)) ok('Identity Platform already enabled.');
      else console.log(`  (Identity Platform upgrade said: ${msg}. Continuing.)`);
    }
    try {
      await identityAdmin.patch(
        `/projects/${projectId}/config`,
        { mfa: { providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } }] } },
        { ...userProject, queryParams: { updateMask: 'mfa.providerConfigs' } }
      );
      ok('Authenticator-app (TOTP) 2FA enabled for this project.');
    } catch (e) {
      fail(
        `Could not enable TOTP 2FA: ${apiError(e)}\n  In the Firebase console open Authentication > Settings and click "Upgrade" to Identity Platform (free on Spark), then run this command again.`
      );
    }
    try {
      await writeRequire2fa(true);
      ok('2FA is now REQUIRED: everyone sets it up at their next sign-in.');
    } catch (e) {
      fail(`Could not save settings/security: ${apiError(e)}`);
    }
  } else if (args['relax-2fa']) {
    step('Stopping the 2FA requirement...');
    try {
      await writeRequire2fa(false);
      ok('2FA is no longer required. Users who set it up still use it.');
    } catch (e) {
      fail(`Could not save settings/security: ${apiError(e)}`);
    }
  }

  // 6. Branded page for the links in Firebase emails
  if (actionUrl) {
    step('Pointing password-reset and verification emails at the app...');
    const identityAdmin2 = new fbt.apiv2.Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'admin/v2' });
    try {
      await identityAdmin2.patch(
        `/projects/${projectId}/config`,
        { notification: { sendEmail: { callbackUri: actionUrl } } },
        { ...userProject, queryParams: { updateMask: 'notification.sendEmail.callbackUri' } }
      );
      ok(`Email links now open ${actionUrl}`);
      if (!/\.(web\.app|firebaseapp\.com)\//.test(actionUrl + '/') && !actionUrl.startsWith('http://localhost')) {
        console.log('  Using your own domain? Add it under Firebase console > Authentication > Settings > Authorized domains.');
      }
    } catch (e) {
      fail(
        `Could not set the email link address: ${apiError(e)}\n  You can also set it in Firebase console > Authentication > Templates > (pencil) > Customize action URL.`
      );
    }
  }

  console.log(`\n\x1b[32mAll done.\x1b[0m Start the app with  npm run dev:online  and sign in at http://localhost:3000/admin`);
  console.log(`  Email: ${email}`);
  if (args['enable-2fa']) console.log('  You will be asked to set up your authenticator app when you sign in.');
}

main().catch((e) => {
  if (e instanceof SetupError) console.error(`\n\x1b[31m✘ ${e.message}\x1b[0m`);
  else console.error('\n\x1b[31m✘ Unexpected error:\x1b[0m', e?.message || e);
  process.exitCode = 1;
});
