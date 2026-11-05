/**
 * Creates a QSA admin login in the local Firebase emulators.
 * Run while `npm run emulators` is running:
 *   npm run seed:emulators
 *   npm run seed:emulators -- you@zambiaairways.co.zm yourPassword
 * Only talks to the emulators on this computer (project demo-zn-qsa); it cannot touch a real project.
 */
const PROJECT_ID = 'demo-zn-qsa';
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const FIRESTORE = `http://127.0.0.1:8081/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const email = (process.argv[2] || 'admin@zambiaairways.co.zm').trim().toLowerCase();
const password = process.argv[3] || 'safety2026';

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

async function getOrCreateUser() {
  const signUp = await post(`${AUTH}/accounts:signUp?key=demo-api-key`, { email, password, returnSecureToken: true });
  if (signUp.ok) return signUp.json.localId;
  if (signUp.json?.error?.message !== 'EMAIL_EXISTS') throw new Error(signUp.json?.error?.message || 'sign-up failed');
  const signIn = await post(`${AUTH}/accounts:signInWithPassword?key=demo-api-key`, { email, password, returnSecureToken: true });
  if (!signIn.ok) throw new Error(`User ${email} already exists with a different password.`);
  return signIn.json.localId;
}

async function setRoleDoc(collection, uid) {
  const res = await fetch(`${FIRESTORE}/${collection}/${uid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, // emulator admin bypass
    body: JSON.stringify({ fields: { enabled: { booleanValue: true }, email: { stringValue: email } } })
  });
  if (!res.ok) throw new Error(`Could not write ${collection}/${uid}: ${res.status} ${await res.text()}`);
}

try {
  const uid = await getOrCreateUser();
  await setRoleDoc('admins', uid);
  await setRoleDoc('qsaAdmins', uid);
  console.log(`✔ Admin ready in local emulators\n  Email:    ${email}\n  Password: ${password}\n  UID:      ${uid}`);
} catch (e) {
  const msg = e?.cause?.code === 'ECONNREFUSED' ? 'Emulators are not running. Start them first with: npm run emulators' : e.message;
  console.error(`✘ ${msg}`);
  process.exit(1);
}
