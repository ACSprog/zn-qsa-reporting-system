/**
 * CMS account management (Managers only).
 *
 * Works on the free Spark plan: everything runs in the browser.
 * - New users get a temporary password, e-mailed from the company Outlook mailbox through a
 *   Power Automate flow (VITE_FLOW_URL_ACCOUNTS), and must change it at first sign-in.
 *   Without that flow, Firebase's own "set your password" e-mail is sent instead.
 * - Setting another person's password later, or deleting logins, needs the Admin SDK on a
 *   server (Cloud Functions, Blaze plan), so existing users are reset by e-mailed link.
 * - New logins are created through a second, isolated Firebase Auth instance so the
 *   signed-in Manager is not logged out.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import {
  initializeAuth,
  inMemoryPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  setDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { getFirebaseHandles, usingEmulators } from './firebase';
import { CmsRole } from '../types';

export const ROLE_INFO: Record<CmsRole, { label: string; description: string }> = {
  viewer: { label: 'Viewer', description: 'Can view reports only.' },
  officer: {
    label: 'Officer',
    description: 'Can view reports, update status and notes, and request deletion (needs Manager approval).'
  },
  manager: {
    label: 'Manager',
    description: 'Approves deletions, archives/restores reports, sees reporter identities, manages Viewers and Officers.'
  },
  superadmin: {
    label: 'Super Admin',
    description: 'Everything a Manager can do, plus creating, promoting, blocking and removing Managers and Super Admins.'
  }
};

export const ALL_ROLES: CmsRole[] = ['viewer', 'officer', 'manager', 'superadmin'];

/** Levels a user with `myRole` may give to others. */
export function assignableRoles(myRole: CmsRole | null): CmsRole[] {
  if (myRole === 'superadmin') return ALL_ROLES;
  if (myRole === 'manager') return ['viewer', 'officer'];
  return [];
}

/** Whether `myRole` may change, block or remove `target` (never yourself; checked separately). */
export function canManageAccount(myRole: CmsRole | null, target: CmsAccount): boolean {
  if (myRole === 'superadmin') return true;
  if (myRole === 'manager') return (target.role === 'viewer' || target.role === 'officer') && !target.legacyManager;
  return false;
}

export interface CmsAccount {
  uid: string;
  email: string;
  name: string;
  role: CmsRole;
  /** Has an admins/{uid} doc (CMS access) */
  hasAccess: boolean;
  /** Older setups mark Managers with a qsaAdmins/{uid} doc */
  legacyManager: boolean;
  mustChangePassword: boolean;
  /** enabled == false: can't use the CMS until unblocked */
  blocked: boolean;
}

export interface AddAccountInput {
  email: string;
  name?: string;
  role: CmsRole;
  /** Use an existing Firebase login instead of creating one */
  existingUid?: string;
}

export interface AddAccountResult {
  uid: string;
  createdLogin: boolean;
  /** Only when a new login was created; show it to the Manager as a fallback */
  tempPassword?: string;
  /** How the user was notified */
  emailVia: 'outlook' | 'firebase' | 'none';
  emailError?: string;
  preview?: boolean;
}

// ---------- preview (no Firebase) mock ----------
const previewAccounts = new Map<string, CmsAccount>([
  [
    'admin-demo-user',
    {
      uid: 'admin-demo-user',
      email: 'admin@zambiaairways.co.zm',
      name: 'Demo Admin',
      role: 'superadmin',
      hasAccess: true,
      legacyManager: false,
      mustChangePassword: false,
      blocked: false
    }
  ]
]);

function friendlyError(e: any): string {
  const code: string = e?.code || '';
  const map: Record<string, string> = {
    'auth/email-already-in-use':
      'This email already has a login. Copy its UID from Firebase console → Authentication → Users and paste it into "Existing login UID".',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not turned on for this Firebase project.',
    'auth/wrong-password': 'The current password is incorrect.',
    'auth/invalid-credential': 'The current password is incorrect.',
    'auth/weak-password': 'The new password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/requires-recent-login': 'Please sign out and sign in again, then retry.',
    'permission-denied':
      'Permission denied. Managers can only manage Viewers and Officers, Super Admins can manage everyone, nobody can change their own account, and the latest firestore.rules must be deployed.'
  };
  return map[code] || e?.message || 'Something went wrong.';
}

/** Readable temporary password: no look-alike characters (0/O, 1/l/I). */
export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*?';
  const all = upper + lower + digits;
  const pick = (set: string, n: number) => {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => set[b % set.length]).join('');
  };
  const chars = (pick(upper, 2) + pick(lower, 2) + pick(digits, 2) + pick(symbols, 1) + pick(all, 5)).split('');
  // shuffle
  const bytes = new Uint8Array(chars.length);
  crypto.getRandomValues(bytes);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Sends the welcome e-mail through the company Outlook mailbox (Power Automate).
 * Returns false if no accounts flow is configured. Fire-and-forget: the browser can't
 * read the flow's response (no-cors), so delivery can't be confirmed here.
 */
function sendWelcomeEmailViaFlow(payload: {
  email: string;
  name: string;
  role: CmsRole;
  tempPassword: string;
  invitedBy: string;
}): boolean {
  const flowUrl = import.meta.env.VITE_FLOW_URL_ACCOUNTS;
  if (!flowUrl) return false;
  const body = {
    token: import.meta.env.VITE_FLOW_TOKEN || '',
    type: 'account-invite',
    email: payload.email,
    name: payload.name,
    role: payload.role,
    roleLabel: ROLE_INFO[payload.role].label,
    roleDescription: ROLE_INFO[payload.role].description,
    tempPassword: payload.tempPassword,
    loginUrl: `${window.location.origin}/admin`,
    invitedBy: payload.invitedBy
  };
  fetch(flowUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  }).catch(() => undefined);
  return true;
}

export function isWelcomeFlowConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FLOW_URL_ACCOUNTS);
}

/** All CMS users. */
export async function listCmsAccounts(): Promise<CmsAccount[]> {
  const { db } = getFirebaseHandles();
  if (!db) return Array.from(previewAccounts.values()).map((a) => ({ ...a }));

  try {
    const [adminSnap, qsaSnap] = await Promise.all([
      getDocs(collection(db, 'admins')),
      getDocs(collection(db, 'qsaAdmins'))
    ]);
    const byUid = new Map<string, CmsAccount>();
    adminSnap.forEach((d) => {
      const data = d.data() || {};
      const role = ALL_ROLES.includes(data.role) ? (data.role as CmsRole) : 'officer';
      byUid.set(d.id, {
        uid: d.id,
        email: data.email || '',
        name: data.name || '',
        role,
        hasAccess: true,
        legacyManager: false,
        mustChangePassword: data.mustChangePassword === true,
        blocked: data.enabled === false
      });
    });
    qsaSnap.forEach((d) => {
      const data = d.data() || {};
      const cur = byUid.get(d.id) || {
        uid: d.id,
        email: '',
        name: '',
        role: 'manager' as CmsRole,
        hasAccess: false,
        legacyManager: true,
        mustChangePassword: false,
        blocked: false
      };
      cur.legacyManager = true;
      if (cur.role !== 'superadmin') cur.role = 'manager';
      cur.email = cur.email || data.email || '';
      cur.name = cur.name || data.name || '';
      byUid.set(d.id, cur);
    });
    return Array.from(byUid.values()).sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/**
 * Adds a CMS user: creates their login with a temporary password (unless an existing UID
 * is given), grants the chosen level, and e-mails them their login details.
 */
export async function addCmsAccount(input: AddAccountInput, invitedByEmail: string): Promise<AddAccountResult> {
  const email = input.email.trim().toLowerCase();
  const name = (input.name || '').trim();
  if (!email.includes('@')) throw new Error('Enter a valid email address.');

  const { db, auth, firebaseConfig } = getFirebaseHandles();

  if (!db || !auth) {
    const uid = input.existingUid?.trim() || 'preview-' + Math.random().toString(36).slice(2, 9);
    const tempPassword = input.existingUid ? undefined : generateTempPassword();
    previewAccounts.set(uid, {
      uid,
      email,
      name,
      role: input.role,
      hasAccess: true,
      legacyManager: false,
      mustChangePassword: Boolean(tempPassword),
      blocked: false
    });
    return { uid, createdLogin: !input.existingUid, tempPassword, emailVia: 'none', preview: true };
  }

  let uid = input.existingUid?.trim() || '';
  let tempPassword: string | undefined;

  if (!uid) {
    tempPassword = generateTempPassword();
    // Isolated Auth instance: creating a user would otherwise sign the Manager out
    const secondaryApp = initializeApp(firebaseConfig, `account-admin-${Date.now()}`);
    try {
      const secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
      if (usingEmulators) {
        connectAuthEmulator(secondaryAuth, `http://${window.location.hostname}:9099`, { disableWarnings: true });
      }
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, tempPassword);
      uid = cred.user.uid;
      await signOut(secondaryAuth);
    } catch (e) {
      throw new Error(friendlyError(e));
    } finally {
      await deleteApp(secondaryApp).catch(() => undefined);
    }
  }
  const createdLogin = Boolean(tempPassword);

  try {
    const roleDoc: Record<string, any> = {
      enabled: true,
      email,
      role: input.role,
      mustChangePassword: createdLogin,
      createdAt: serverTimestamp(),
      createdBy: invitedByEmail
    };
    if (name) roleDoc.name = name;
    await setDoc(doc(db, 'admins', uid), roleDoc);
  } catch (e) {
    const msg = friendlyError(e);
    throw new Error(
      createdLogin
        ? `${msg} (The login ${email} was created but has no CMS access yet; add it again using UID ${uid}.)`
        : msg
    );
  }

  // Tell the user
  if (sendWelcomeEmailViaFlow({ email, name, role: input.role, tempPassword: tempPassword || '', invitedBy: invitedByEmail })) {
    return { uid, createdLogin, tempPassword, emailVia: 'outlook' };
  }
  if (!createdLogin) {
    return { uid, createdLogin, emailVia: 'none' };
  }
  try {
    await sendPasswordResetEmail(auth, email);
    return { uid, createdLogin, tempPassword, emailVia: 'firebase' };
  } catch (e) {
    return { uid, createdLogin, tempPassword, emailVia: 'none', emailError: friendlyError(e) };
  }
}

/** Change a user's privilege level. */
export async function setAccountRole(account: CmsAccount, role: CmsRole): Promise<void> {
  const { db } = getFirebaseHandles();
  if (!db) {
    const cur = previewAccounts.get(account.uid);
    if (cur) cur.role = role;
    return;
  }
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'admins', account.uid), { enabled: !account.blocked, email: account.email || '', role }, { merge: true });
    // Old-style Manager marker would otherwise keep them a Manager
    if (account.legacyManager && role !== 'manager') batch.delete(doc(db, 'qsaAdmins', account.uid));
    await batch.commit();
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/** Block (access stops immediately, user stays in the list) or unblock. */
export async function setAccountBlocked(account: CmsAccount, blocked: boolean): Promise<void> {
  const { db } = getFirebaseHandles();
  if (!db) {
    const cur = previewAccounts.get(account.uid);
    if (cur) cur.blocked = blocked;
    return;
  }
  try {
    await setDoc(
      doc(db, 'admins', account.uid),
      { enabled: !blocked, email: account.email || '', role: account.role },
      { merge: true }
    );
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/**
 * Removes all CMS access. The Firebase login itself remains (deleting logins needs a
 * server), but it can no longer open the CMS or read reports.
 */
export async function removeCmsAccount(account: CmsAccount): Promise<void> {
  const { db } = getFirebaseHandles();
  if (!db) {
    previewAccounts.delete(account.uid);
    return;
  }
  try {
    const batch = writeBatch(db);
    if (account.legacyManager) batch.delete(doc(db, 'qsaAdmins', account.uid));
    batch.delete(doc(db, 'admins', account.uid));
    await batch.commit();
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/** E-mails the user a link to choose a new password. */
export async function sendAccountPasswordReset(email: string): Promise<void> {
  const { auth } = getFirebaseHandles();
  if (!auth) return; // preview mode
  try {
    await sendPasswordResetEmail(auth, email.trim().toLowerCase());
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/** Changes the signed-in user's own password and clears any "must change" flag. */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new Error('Use at least 8 characters for the new password.');
  if (newPassword === currentPassword) throw new Error('The new password must be different from the current one.');
  const { auth, db } = getFirebaseHandles();
  if (!auth || !db) return; // preview mode
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('You are not signed in.');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
  try {
    await updateDoc(doc(db, 'admins', user.uid), { mustChangePassword: false });
  } catch {
    // Flag may not exist (older accounts) or the user has no admins doc; the password is changed either way
  }
}

/** Clears the signed-in user's "must change password" flag without changing the password. */
export async function clearMustChangePassword(): Promise<void> {
  const { auth, db } = getFirebaseHandles();
  if (!auth?.currentUser || !db) return;
  try {
    await updateDoc(doc(db, 'admins', auth.currentUser.uid), { mustChangePassword: false });
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

// ---------- Super Admin security controls ----------

/** Whether 2FA is currently required for every CMS user. */
export async function getRequire2fa(): Promise<boolean> {
  const { db } = getFirebaseHandles();
  if (!db) return previewRequire2fa;
  const snap = await getDoc(doc(db, 'settings', 'security'));
  return snap.exists() && snap.data()?.require2fa === true;
}

let previewRequire2fa = false;

/** Super Admin: switch the 2FA requirement on or off. */
export async function setRequire2fa(value: boolean, byEmail: string): Promise<void> {
  const { db, auth } = getFirebaseHandles();
  if (!db || !auth) {
    previewRequire2fa = value;
    return;
  }
  if (value) {
    const token = await auth.currentUser?.getIdTokenResult();
    if (!token?.signInSecondFactor) {
      throw new Error(
        'Set up 2FA on your own account first (My Account), then sign out and back in with your code. This proves authenticator codes work before everyone is required to use them.'
      );
    }
  }
  try {
    await setDoc(doc(db, 'settings', 'security'), { require2fa: value, updatedBy: byEmail, updatedAt: serverTimestamp() });
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/**
 * The command the project owner runs to remove someone's lost authenticator (free plan).
 * Includes this site's Firebase project, so it is right for test and live alike.
 */
export function reset2faCommand(email: string): string {
  const projectId = getFirebaseHandles().firebaseConfig.projectId;
  return `npm run reset-2fa -- --email ${email}${projectId ? ` --project ${projectId}` : ''}`;
}
