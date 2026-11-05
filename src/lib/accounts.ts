/**
 * CMS account management (QSA admins only).
 *
 * Works on the free Spark plan: everything runs in the browser.
 * - Passwords are reset by e-mailing the user a Firebase reset link. Setting another
 *   person's password directly needs the Admin SDK on a server (Cloud Functions, Blaze plan).
 * - New logins are created through a second, isolated Firebase Auth instance so the
 *   signed-in manager is not logged out.
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
  getDocs,
  writeBatch,
  deleteDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { getFirebaseHandles, usingEmulators } from './firebase';

export interface CmsAccount {
  uid: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isQsaAdmin: boolean;
}

export interface AddAccountInput {
  email: string;
  name?: string;
  qsa: boolean;
  /** Use an existing Firebase login instead of creating one */
  existingUid?: string;
}

// ---------- preview (no Firebase) mock ----------
const previewAccounts = new Map<string, CmsAccount>([
  ['admin-demo-user', { uid: 'admin-demo-user', email: 'admin@zambiaairways.co.zm', name: 'Demo Admin', isAdmin: true, isQsaAdmin: true }]
]);

function friendlyError(e: any): string {
  const code: string = e?.code || '';
  const map: Record<string, string> = {
    'auth/email-already-in-use':
      'This email already has a login. Copy its UID from Firebase console → Authentication → Users and paste it into "Existing login UID".',
    'auth/invalid-email': 'That email address is not valid.',
    'auth/operation-not-allowed': 'Email/Password sign-in is not turned on for this Firebase project.',
    'auth/wrong-password': 'Your current password is incorrect.',
    'auth/invalid-credential': 'Your current password is incorrect.',
    'auth/weak-password': 'The new password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/requires-recent-login': 'Please sign out and sign in again, then retry.',
    'permission-denied':
      'Permission denied. Only QSA admins can manage accounts, and the latest firestore.rules must be deployed.'
  };
  return map[code] || e?.message || 'Something went wrong.';
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('') + 'A!9';
}

/** All CMS users (anyone in admins and/or qsaAdmins). */
export async function listCmsAccounts(): Promise<CmsAccount[]> {
  const { db } = getFirebaseHandles();
  if (!db) return Array.from(previewAccounts.values());

  try {
    const [adminSnap, qsaSnap] = await Promise.all([
      getDocs(collection(db, 'admins')),
      getDocs(collection(db, 'qsaAdmins'))
    ]);
    const byUid = new Map<string, CmsAccount>();
    const upsert = (uid: string, data: any, role: 'admin' | 'qsa') => {
      const cur = byUid.get(uid) || { uid, email: '', name: '', isAdmin: false, isQsaAdmin: false };
      cur.email = cur.email || data?.email || '';
      cur.name = cur.name || data?.name || '';
      if (role === 'admin') cur.isAdmin = true;
      else cur.isQsaAdmin = true;
      byUid.set(uid, cur);
    };
    adminSnap.forEach((d) => upsert(d.id, d.data(), 'admin'));
    qsaSnap.forEach((d) => upsert(d.id, d.data(), 'qsa'));
    return Array.from(byUid.values()).sort((a, b) => (a.email || a.uid).localeCompare(b.email || b.uid));
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/**
 * Adds a CMS user. Creates their login (with a random password nobody knows) unless an
 * existing UID is given, grants access, then e-mails them a link to set their own password.
 */
export async function addCmsAccount(
  input: AddAccountInput,
  createdByEmail: string
): Promise<{ uid: string; createdLogin: boolean; resetEmailSent: boolean; resetError?: string; preview?: boolean }> {
  const email = input.email.trim().toLowerCase();
  const name = (input.name || '').trim();
  if (!email.includes('@')) throw new Error('Enter a valid email address.');

  const { db, auth, firebaseConfig } = getFirebaseHandles();

  if (!db || !auth) {
    const uid = input.existingUid?.trim() || 'preview-' + Math.random().toString(36).slice(2, 9);
    previewAccounts.set(uid, { uid, email, name, isAdmin: true, isQsaAdmin: input.qsa });
    return { uid, createdLogin: !input.existingUid, resetEmailSent: false, preview: true };
  }

  let uid = input.existingUid?.trim() || '';
  let createdLogin = false;

  if (!uid) {
    // Isolated Auth instance: creating a user would otherwise sign the manager out
    const secondaryApp = initializeApp(firebaseConfig, `account-admin-${Date.now()}`);
    try {
      const secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
      if (usingEmulators) {
        connectAuthEmulator(secondaryAuth, `http://${window.location.hostname}:9099`, { disableWarnings: true });
      }
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, randomPassword());
      uid = cred.user.uid;
      createdLogin = true;
      await signOut(secondaryAuth);
    } catch (e) {
      throw new Error(friendlyError(e));
    } finally {
      await deleteApp(secondaryApp).catch(() => undefined);
    }
  }

  try {
    const roleDoc: Record<string, any> = { enabled: true, email, createdAt: serverTimestamp(), createdBy: createdByEmail };
    if (name) roleDoc.name = name;
    const batch = writeBatch(db);
    batch.set(doc(db, 'admins', uid), roleDoc);
    if (input.qsa) batch.set(doc(db, 'qsaAdmins', uid), roleDoc);
    await batch.commit();
  } catch (e) {
    const msg = friendlyError(e);
    throw new Error(createdLogin ? `${msg} (The login ${email} was created but has no CMS access yet; add it again using UID ${uid}.)` : msg);
  }

  // Let the new user choose their own password
  try {
    await sendPasswordResetEmail(auth, email);
    return { uid, createdLogin, resetEmailSent: true };
  } catch (e) {
    return { uid, createdLogin, resetEmailSent: false, resetError: friendlyError(e) };
  }
}

/** Grant or remove confidential-identity access (and account-management rights). */
export async function setQsaAccess(account: CmsAccount, on: boolean, byEmail: string): Promise<void> {
  const { db } = getFirebaseHandles();
  if (!db) {
    const cur = previewAccounts.get(account.uid);
    if (cur) cur.isQsaAdmin = on;
    return;
  }
  try {
    if (on) {
      const roleDoc: Record<string, any> = { enabled: true, email: account.email, createdAt: serverTimestamp(), createdBy: byEmail };
      if (account.name) roleDoc.name = account.name;
      await setDoc(doc(db, 'qsaAdmins', account.uid), roleDoc);
    } else {
      await deleteDoc(doc(db, 'qsaAdmins', account.uid));
    }
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}

/**
 * Removes all CMS access. The Firebase login itself remains (deleting logins needs a
 * server), but it can no longer open the CMS or read reports.
 */
export async function removeCmsAccount(uid: string): Promise<void> {
  const { db } = getFirebaseHandles();
  if (!db) {
    previewAccounts.delete(uid);
    return;
  }
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'qsaAdmins', uid));
    batch.delete(doc(db, 'admins', uid));
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

/** Changes the signed-in user's own password. */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  const { auth } = getFirebaseHandles();
  if (!auth) return; // preview mode
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('You are not signed in.');
  if (newPassword.length < 8) throw new Error('Use at least 8 characters for the new password.');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, newPassword);
  } catch (e) {
    throw new Error(friendlyError(e));
  }
}
