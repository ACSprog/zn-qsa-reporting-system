import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  DocumentData
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
  OAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  BaseReportData,
  FormType,
  ProcessedEvidenceFile,
  ReporterIdentity,
  ReportStatus
} from '../types';
import { stripIdentityIfAnonymous, getCategoryForForm } from './idGenerator';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'MY_FIREBASE_API_KEY' &&
  firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (err) {
    console.warn('Firebase initialization failed; falling back to in-memory session mode:', err);
  }
}

// In-Memory fallback store for preview / local testing before Firebase config is set
// NOTE: Per guidelines, localStorage is NOT used for report data.
const inMemoryStore = {
  reports: new Map<string, BaseReportData>(),
  identities: new Map<string, ReporterIdentity>(),
  evidence: new Map<string, ProcessedEvidenceFile[]>(),
  admins: new Set<string>(['admin-demo-user', 'zambiaiarwaysltd@gmail.com', 'admin@zambiaairways.co.zm']),
  qsaAdmins: new Set<string>(['qsa-demo-user', 'zambiaiarwaysltd@gmail.com', 'admin@zambiaairways.co.zm'])
};

/**
 * Submits a safety report atomically with evidence documents and optional identity
 */
export async function submitSafetyReport(
  form: FormType,
  reportId: string,
  rawFormData: Record<string, any>,
  evidenceFiles: ProcessedEvidenceFile[]
): Promise<{ success: boolean; reportId: string; error?: string }> {
  const reporting = rawFormData.reporting || 'Named';
  const cleanData = stripIdentityIfAnonymous(rawFormData, reporting);
  const evidenceCount = evidenceFiles.length;
  const evidenceBaseFolder = (import.meta.env.VITE_EVIDENCE_FOLDER_URL || '').replace(/\/+$/, '');
  const evidenceFolder = evidenceCount > 0 && evidenceBaseFolder ? `${evidenceBaseFolder}/${reportId}` : '';
  const category = getCategoryForForm(form, cleanData);

  // Isolate identity data
  const identityData: ReporterIdentity = {
    reportId,
    reporting,
    name: cleanData.name || '',
    department: cleanData.department || '',
    position: cleanData.position || '',
    contact: cleanData.contact || ''
  };

  // Build report document (excluding identity fields)
  const reportDocData: Record<string, any> = {
    ...cleanData,
    reportId,
    form,
    category,
    status: 'New',
    notes: '',
    deleted: false,
    evidenceCount,
    evidenceFolder,
    dateReported: new Date().toISOString().split('T')[0]
  };

  // Strip the four identity fields from report document
  delete reportDocData.name;
  delete reportDocData.department;
  delete reportDocData.position;
  delete reportDocData.contact;

  if (db) {
    try {
      const batch = writeBatch(db);

      // 1. Report Document
      const reportRef = doc(db, form, reportId);
      batch.set(reportRef, {
        ...reportDocData,
        createdAt: serverTimestamp()
      });

      // 2. Identity Document (ONLY for Named and Confidential, NEVER for Anonymous)
      if (reporting !== 'Anonymous') {
        const identityRef = doc(db, 'identities', reportId);
        batch.set(identityRef, {
          ...identityData,
          createdAt: serverTimestamp()
        });
      }

      // 3. Evidence Subcollection docs: {form}/{reportId}/evidence/{n}
      evidenceFiles.forEach((file, index) => {
        const order = index + 1;
        const evidenceRef = doc(db!, form, reportId, 'evidence', String(order));
        batch.set(evidenceRef, {
          name: file.name,
          contentType: file.contentType,
          size: file.size,
          data: file.base64,
          order,
          createdAt: serverTimestamp()
        });
      });

      await batch.commit();
    } catch (err: any) {
      return { success: false, reportId, error: err?.message || 'Database write error' };
    }
  } else {
    // In-memory fallback
    const timestamp = new Date();
    inMemoryStore.reports.set(reportId, {
      ...reportDocData,
      createdAt: timestamp
    } as BaseReportData);

    if (reporting !== 'Anonymous') {
      inMemoryStore.identities.set(reportId, {
        ...identityData,
        createdAt: timestamp
      });
    }

    inMemoryStore.evidence.set(reportId, [...evidenceFiles]);
  }

  // 4. Send to Power Automate HTTP trigger (non-blocking, mode: 'no-cors')
  dispatchPowerAutomateFlow(form, reportId, cleanData, category, evidenceCount, evidenceFolder, evidenceFiles);

  return { success: true, reportId };
}

/**
 * Power Automate dispatch per Section 1 & Section 11
 */
function dispatchPowerAutomateFlow(
  form: FormType,
  reportId: string,
  data: Record<string, any>,
  category: string,
  evidenceCount: number,
  evidenceFolder: string,
  evidenceFiles: ProcessedEvidenceFile[]
) {
  const envKey = `VITE_FLOW_URL_${form.toUpperCase()}`;
  const flowUrl = (import.meta.env as any)[envKey];
  const token = import.meta.env.VITE_FLOW_TOKEN || '';

  if (!flowUrl) {
    return; // No endpoint configured
  }

  const payload = {
    token,
    form,
    reportId,
    dateReported: new Date().toISOString().split('T')[0],
    category,
    reporting: data.reporting,
    name: data.reporting === 'Anonymous' ? '' : data.name || '',
    department: data.reporting === 'Anonymous' ? '' : data.department || '',
    position: data.reporting === 'Anonymous' ? '' : data.position || '',
    contact: data.reporting === 'Anonymous' ? '' : data.contact || '',
    eventDate: data.eventDate || '',
    eventTime: data.eventTime || '',
    location: data.location || '',
    flightNo: data.flightNo || '',
    aircraftReg: data.aircraftReg || '',
    aircraftType: data.aircraftType || '',
    urgent: data.urgent || 'No',
    exposedToRisk: data.exposedToRisk || 'No',
    notified: data.notified || 'No',
    notifiedWho: data.notifiedWho || '',
    evidenceCount,
    evidenceFolder,
    evidence: evidenceFiles.map((f) => ({
      name: f.name,
      contentType: f.contentType,
      size: f.size,
      base64: f.base64
    })),
    ...data
  };

  fetch(flowUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Non-blocking fire and forget as mandated in spec
  });
}

/**
 * Fetch all reports across forms for Admin Dashboard
 */
export async function fetchAllReports(formFilter?: FormType): Promise<BaseReportData[]> {
  const formsToFetch: FormType[] = formFilter
    ? [formFilter]
    : ['hazard', 'incident', 'accident', 'concern'];

  if (db) {
    const results: BaseReportData[] = [];
    for (const f of formsToFetch) {
      try {
        const colRef = collection(db, f);
        const q = query(colRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          results.push({ ...(d.data() as BaseReportData), reportId: d.id, form: f });
        });
      } catch (e) {
        console.error(`Error querying ${f}:`, e);
      }
    }
    return results;
  } else {
    // In-memory fallback
    const list = Array.from(inMemoryStore.reports.values());
    if (formFilter) {
      return list.filter((r) => r.form === formFilter);
    }
    return list;
  }
}

/**
 * Update report status, notes or archive status (admin only)
 */
export async function updateReportMetadata(
  form: FormType,
  reportId: string,
  updates: { status?: ReportStatus; notes?: string; deleted?: boolean }
): Promise<boolean> {
  if (db) {
    try {
      const ref = doc(db, form, reportId);
      await updateDoc(ref, updates);
      return true;
    } catch (e) {
      console.error('Failed to update report metadata:', e);
      return false;
    }
  } else {
    const rep = inMemoryStore.reports.get(reportId);
    if (rep) {
      inMemoryStore.reports.set(reportId, { ...rep, ...updates });
      return true;
    }
    return false;
  }
}

/**
 * Fetch reporter identity for a specific report
 */
export async function fetchReporterIdentity(reportId: string): Promise<ReporterIdentity | null> {
  if (db) {
    try {
      const ref = doc(db, 'identities', reportId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return snap.data() as ReporterIdentity;
      }
      return null;
    } catch {
      // Permission denied or doesn't exist
      return null;
    }
  } else {
    return inMemoryStore.identities.get(reportId) || null;
  }
}

/**
 * Fetch evidence subcollection documents for a specific report
 */
export async function fetchReportEvidence(
  form: FormType,
  reportId: string
): Promise<ProcessedEvidenceFile[]> {
  if (db) {
    try {
      const colRef = collection(db, form, reportId, 'evidence');
      const q = query(colRef, orderBy('order', 'asc'));
      const snap = await getDocs(q);
      const files: ProcessedEvidenceFile[] = [];
      snap.forEach((d) => {
        const item = d.data();
        files.push({
          name: item.name,
          contentType: item.contentType,
          size: item.size,
          base64: item.data
        });
      });
      return files;
    } catch (e) {
      console.error('Failed to fetch evidence subcollection:', e);
      return [];
    }
  } else {
    return inMemoryStore.evidence.get(reportId) || [];
  }
}

/**
 * Role Check helper
 */
export async function verifyUserRoles(user: User | { uid: string; email?: string | null }): Promise<{
  isAdmin: boolean;
  isQsaAdmin: boolean;
}> {
  if (!user) return { isAdmin: false, isQsaAdmin: false };

  if (db) {
    try {
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      const qsaDoc = await getDoc(doc(db, 'qsaAdmins', user.uid));
      return {
        isAdmin: adminDoc.exists(),
        isQsaAdmin: qsaDoc.exists()
      };
    } catch {
      return { isAdmin: false, isQsaAdmin: false };
    }
  } else {
    // In-memory or preview role resolution
    const isMockAdmin = inMemoryStore.admins.has(user.uid) || (user.email ? inMemoryStore.admins.has(user.email) : false);
    const isMockQsa = inMemoryStore.qsaAdmins.has(user.uid) || (user.email ? inMemoryStore.qsaAdmins.has(user.email) : false);
    return {
      isAdmin: isMockAdmin || true, // Allow review in mock preview
      isQsaAdmin: isMockQsa || true
    };
  }
}

// In-memory mock session handlers for local preview mode
let mockUser: any = null;
const mockAuthListeners: Array<(user: any) => void> = [];

/**
 * Authentication handlers
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: User | any | null; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { user: null, error: 'Please enter both your email address and password.' };
  }

  if (auth) {
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      return { user: cred.user };
    } catch (err: any) {
      let message = 'Invalid email or password. Please verify your credentials.';
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        message = 'Invalid email or password. Please check your credentials and try again.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'Access temporarily disabled due to many failed login attempts. Please reset your password or try again later.';
      } else if (err.message) {
        message = err.message;
      }
      return { user: null, error: message };
    }
  } else {
    // In-memory preview mode
    if (password.length < 6) {
      return { user: null, error: 'Password must be at least 6 characters.' };
    }
    const fakeUid = 'user-' + Math.random().toString(36).substring(2, 9);
    mockUser = {
      uid: fakeUid,
      email: cleanEmail,
      displayName: cleanEmail.split('@')[0].toUpperCase() + ' (Safety Officer)'
    };
    inMemoryStore.admins.add(fakeUid);
    inMemoryStore.admins.add(cleanEmail);
    inMemoryStore.qsaAdmins.add(fakeUid);
    inMemoryStore.qsaAdmins.add(cleanEmail);
    mockAuthListeners.forEach((cb) => cb(mockUser));
    return { user: mockUser };
  }
}

export async function sendResetPasswordEmail(
  email: string
): Promise<{ success: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { success: false, error: 'Please provide an email address.' };
  }

  if (auth) {
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to dispatch password reset email.' };
    }
  } else {
    return { success: true };
  }
}

export async function signInWithMicrosoft(): Promise<User | null> {
  if (auth) {
    const provider = new OAuthProvider('microsoft.com');
    provider.addScope('User.Read');
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }
  return null;
}

export async function signInWithGoogle(): Promise<User | null> {
  if (auth) {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }
  return null;
}

export async function signOutUser(): Promise<void> {
  if (auth) {
    await fbSignOut(auth);
  } else {
    mockUser = null;
    mockAuthListeners.forEach((cb) => cb(null));
  }
}

export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  if (auth) {
    return onAuthStateChanged(auth, callback);
  }
  // In-memory fallback
  mockAuthListeners.push(callback);
  callback(mockUser);
  return () => {
    const idx = mockAuthListeners.indexOf(callback);
    if (idx !== -1) mockAuthListeners.splice(idx, 1);
  };
}
