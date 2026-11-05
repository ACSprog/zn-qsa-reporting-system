/**
 * Removes a user's authenticator-app 2FA (lost or replaced phone).
 * They set it up again at their next sign-in (if 2FA is required) or under My Account.
 *
 *   npm run reset-2fa -- --email person@zambiaairways.co.zm
 *
 * Options: --project <id> (default: VITE_FIREBASE_PROJECT_ID in .env.local), --account <google email>, --yes
 * Run by whoever owns the Firebase project (the browser can't do this on the free plan).
 */
import {
  ok,
  step,
  SetupError,
  fail,
  parseArgs,
  readEnvLocal,
  ask,
  loadFirebaseTools,
  apiError
} from './fb-cli.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = (typeof args.project === 'string' && args.project) || readEnvLocal('VITE_FIREBASE_PROJECT_ID');
  const email = typeof args.email === 'string' ? args.email.trim().toLowerCase() : '';
  if (!projectId) fail('No project ID. Put VITE_FIREBASE_PROJECT_ID in .env.local or pass --project <id>.');
  if (projectId.startsWith('demo-')) fail('The local emulators do not use authenticator-app 2FA; nothing to reset.');
  if (!email.includes('@')) fail('Give the user\'s email:  --email person@zambiaairways.co.zm');

  const fbt = loadFirebaseTools();
  let account;
  try {
    account = fbt.auth.selectAccount(typeof args.account === 'string' ? args.account : undefined, process.cwd());
  } catch (e) {
    fail(e.message);
  }
  if (!account?.user?.email) fail('You are not signed in to the Firebase CLI. Run:  firebase login');

  console.log(`\nReset 2FA for ${email}`);
  console.log(`  Google account : ${account.user.email}`);
  console.log(`  Project        : ${projectId}`);
  if (!args.yes) {
    const answer = await ask('\nRemove this user\'s authenticator app? They must set up 2FA again. (y/N) ');
    if (!/^y(es)?$/i.test(answer)) {
      console.log('Cancelled.');
      return;
    }
  }

  try {
    await fbt.requireAuth({ user: account.user, tokens: account.tokens, projectRoot: process.cwd(), project: projectId });
  } catch (e) {
    fail(`Could not use the signed-in account: ${e.message}\nTry: firebase login --reauth`);
  }
  const identityApi = new fbt.apiv2.Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v1' });
  const userProject = { headers: { 'x-goog-user-project': projectId } };

  step('Finding the user...');
  let uid;
  try {
    const found = await identityApi.post(`/projects/${projectId}/accounts:lookup`, { email: [email] }, userProject);
    const user = found.body?.users?.[0];
    if (!user) fail(`No login found for ${email}.`);
    uid = user.localId;
    const factors = user.mfaInfo?.length || 0;
    ok(`Found UID ${uid} with ${factors} second factor${factors === 1 ? '' : 's'}.`);
    if (!factors) {
      console.log('Nothing to reset.');
      return;
    }
  } catch (e) {
    if (e instanceof SetupError) throw e;
    fail(`Could not look up the user: ${apiError(e)}`);
  }

  step('Removing their authenticator app...');
  try {
    await identityApi.post(`/projects/${projectId}/accounts:update`, { localId: uid, mfa: {} }, userProject);
    ok('Done. They will be asked to set up 2FA again at their next sign-in.');
  } catch (e) {
    fail(`Could not reset 2FA: ${apiError(e)}`);
  }
}

main().catch((e) => {
  if (e instanceof SetupError) console.error(`\n\x1b[31m✘ ${e.message}\x1b[0m`);
  else console.error('\n\x1b[31m✘ Unexpected error:\x1b[0m', e?.message || e);
  process.exitCode = 1;
});
