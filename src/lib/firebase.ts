import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
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
  onSnapshot,
  DocumentData
} from 'firebase/firestore';
import {
  getAuth,
  connectAuthEmulator,
  Auth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
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

/**
 * Local development against the Firebase Emulator Suite (npm run emulators).
 * Enabled with VITE_USE_FIREBASE_EMULATORS=true in .env.local. Never active in production builds.
 * Uses a "demo-" project ID so nothing can ever reach a real cloud project.
 */
export const usingEmulators =
  import.meta.env.DEV && String(import.meta.env.VITE_USE_FIREBASE_EMULATORS || '').toLowerCase() === 'true';
const EMULATOR_PROJECT_ID = 'demo-zn-qsa';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (usingEmulators ? 'demo-api-key' : ''),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: usingEmulators ? EMULATOR_PROJECT_ID : import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
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
    if (usingEmulators) {
      // Same host the page was opened from, so phones on your Wi-Fi reach the emulators on this computer
      const host = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
      connectFirestoreEmulator(db, host, 8180);
      connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
      console.info(`[Firebase] Using local emulators on ${host} (project ${EMULATOR_PROJECT_ID})`);
    }
  } catch (err) {
    console.warn('Firebase initialization failed; falling back to in-memory session mode:', err);
  }
}

/** Internal handles for other modules in src/lib (accounts management). */
export function getFirebaseHandles() {
  return { app, db, auth, firebaseConfig };
}

// Fallback store for preview / local testing before Firebase config is set.
// In development builds only, it is mirrored to this browser's localStorage so reports
// survive reloads and are shared between tabs. Production builds never use localStorage
// for report data (submissions fail loudly instead, see submitSafetyReport).
const inMemoryStore = {
  reports: new Map<string, BaseReportData>(),
  identities: new Map<string, ReporterIdentity>(),
  evidence: new Map<string, ProcessedEvidenceFile[]>(),
  admins: new Set<string>(['admin-demo-user', 'zambiaiarwaysltd@gmail.com', 'admin@zambiaairways.co.zm']),
  qsaAdmins: new Set<string>(['qsa-demo-user', 'zambiaiarwaysltd@gmail.com', 'admin@zambiaairways.co.zm'])
};

// Listeners for the in-memory store, so the dashboard updates live in preview mode too
const inMemoryReportListeners = new Set<() => void>();
function notifyInMemoryReportListeners() {
  inMemoryReportListeners.forEach((cb) => cb());
}

const PREVIEW_STORAGE_KEY = 'za_preview_store_v1';
const usePreviewLocalStorage =
  !db && import.meta.env.DEV && typeof window !== 'undefined' && (() => {
    try {
      return Boolean(window.localStorage);
    } catch {
      return false;
    }
  })();

function loadPreviewStore() {
  if (!usePreviewLocalStorage) return;
  try {
    const raw = window.localStorage.getItem(PREVIEW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    inMemoryStore.reports = new Map(Object.entries(parsed.reports || {}));
    inMemoryStore.identities = new Map(Object.entries(parsed.identities || {}));
    inMemoryStore.evidence = new Map(Object.entries(parsed.evidence || {}));
  } catch (e) {
    console.warn('[Preview] Could not read saved preview reports:', e);
  }
}

function savePreviewStore() {
  if (!usePreviewLocalStorage) return;
  const snapshot = (withEvidence: boolean) =>
    JSON.stringify({
      reports: Object.fromEntries(inMemoryStore.reports),
      identities: Object.fromEntries(inMemoryStore.identities),
      evidence: withEvidence ? Object.fromEntries(inMemoryStore.evidence) : {}
    });
  try {
    window.localStorage.setItem(PREVIEW_STORAGE_KEY, snapshot(true));
  } catch {
    // Browser storage is ~5 MB; photo attachments can exceed it. Keep the reports, drop the files.
    try {
      window.localStorage.setItem(PREVIEW_STORAGE_KEY, snapshot(false));
      console.warn('[Preview] Browser storage full: attachments are kept for this tab only.');
    } catch (e) {
      console.warn('[Preview] Could not save preview reports to browser storage:', e);
    }
  }
}

if (usePreviewLocalStorage) {
  loadPreviewStore();
  // Another tab submitted or updated a report: reload and refresh the dashboard
  window.addEventListener('storage', (e) => {
    if (e.key === PREVIEW_STORAGE_KEY) {
      loadPreviewStore();
      notifyInMemoryReportListeners();
    }
  });
}

/** Clears all preview reports saved in this browser (development only). */
export function clearPreviewReports() {
  inMemoryStore.reports.clear();
  inMemoryStore.identities.clear();
  inMemoryStore.evidence.clear();
  if (usePreviewLocalStorage) window.localStorage.removeItem(PREVIEW_STORAGE_KEY);
  notifyInMemoryReportListeners();
}

/**
 * Where reports are actually being stored.
 * 'firestore' = real database.
 * 'local'     = development preview: saved in this browser only (shared between its tabs).
 * 'memory'    = preview with no browser storage: lost on reload.
 */
export const backendMode: 'firestore' | 'local' | 'memory' = db
  ? 'firestore'
  : usePreviewLocalStorage
    ? 'local'
    : 'memory';

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
  } else if (import.meta.env.PROD) {
    // Production build without Firebase config: fail loudly instead of pretending to save
    return {
      success: false,
      reportId,
      error: 'The reporting database is not configured. Please contact QSA.'
    };
  } else {
    // In-memory fallback (local development only)
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
    savePreviewStore();
    notifyInMemoryReportListeners();
  }

  // 4. Send to Power Automate HTTP trigger (non-blocking, mode: 'no-cors')
  dispatchPowerAutomateFlow(form, reportId, cleanData, category, evidenceCount, evidenceFolder, evidenceFiles);

  return { success: true, reportId };
}

/**
 * Power Automate dispatch per Section 1 & Section 11.
 * Returns false when no flow URL is configured for the form.
 * `restore = true` is used by "Sync to Excel": the flow skips the email and
 * will not duplicate an existing Excel row.
 */
export function dispatchPowerAutomateFlow(
  form: FormType,
  reportId: string,
  data: Record<string, any>,
  category: string,
  evidenceCount: number,
  evidenceFolder: string,
  evidenceFiles: ProcessedEvidenceFile[],
  restore: boolean = false
): boolean {
  const envKey = `VITE_FLOW_URL_${form.toUpperCase()}`;
  const flowUrl = (import.meta.env as any)[envKey];
  const token = import.meta.env.VITE_FLOW_TOKEN || '';

  if (!flowUrl) {
    return false; // No endpoint configured
  }

  const isAnonymous = data.reporting === 'Anonymous';

  const payload = {
    // Spread FIRST so the explicit keys below always win. The form's own text
    // field is called `evidence`; the files array is deliberately named
    // `evidenceFiles` so the two can never overwrite each other.
    ...data,
    token,
    form,
    reportId,
    restore,
    dateReported: data.dateReported || new Date().toISOString().split('T')[0],
    category,
    reporting: data.reporting,
    name: isAnonymous ? '' : data.name || '',
    department: isAnonymous ? '' : data.department || '',
    position: isAnonymous ? '' : data.position || '',
    contact: isAnonymous ? '' : data.contact || '',
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
    evidenceFiles: evidenceFiles.map((f) => ({
      name: f.name,
      contentType: f.contentType,
      size: f.size,
      base64: f.base64
    }))
  };

  fetch(flowUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  }).catch(() => {
    // Non-blocking fire and forget as mandated in spec
  });

  return true;
}

const ALL_FORMS: FormType[] = ['hazard', 'incident', 'accident', 'concern'];

function sortNewestFirst(list: BaseReportData[]): BaseReportData[] {
  const toMillis = (v: any): number => {
    if (!v) return Number.MAX_SAFE_INTEGER; // pending server timestamp = just created
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    const n = new Date(v).getTime();
    return Number.isNaN(n) ? 0 : n;
  };
  return [...list].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

function describeFirestoreError(form: FormType, e: any): string {
  const code = e?.code || '';
  if (code === 'permission-denied') {
    return `Permission denied reading "${form}" reports. Check that your account has a document in the "admins" collection and that the latest firestore.rules are deployed.`;
  }
  return `Could not load "${form}" reports: ${e?.message || e}`;
}

/**
 * Fetch all reports across forms for Admin Dashboard.
 * Throws if any collection could not be read, so the dashboard can show why
 * instead of silently displaying an empty or partial list.
 */
export async function fetchAllReports(formFilter?: FormType): Promise<BaseReportData[]> {
  const formsToFetch: FormType[] = formFilter ? [formFilter] : ALL_FORMS;

  if (db) {
    const results: BaseReportData[] = [];
    const errors: string[] = [];
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
        errors.push(describeFirestoreError(f, e));
      }
    }
    if (errors.length) {
      throw new Error(errors.join(' '));
    }
    return sortNewestFirst(results);
  } else {
    // In-memory fallback
    const list = Array.from(inMemoryStore.reports.values());
    return sortNewestFirst(formFilter ? list.filter((r) => r.form === formFilter) : list);
  }
}

/**
 * Live subscription to all report collections. The callback fires immediately
 * with the current data and again whenever a report is created or changed,
 * so new submissions appear on the dashboard without a manual refresh.
 * Returns an unsubscribe function.
 */
export function subscribeToAllReports(
  onData: (reports: BaseReportData[]) => void,
  onError: (message: string) => void
): () => void {
  if (db) {
    const perForm = new Map<FormType, BaseReportData[]>();
    const emit = () => {
      // Wait until every collection has delivered its first snapshot
      if (perForm.size < ALL_FORMS.length) return;
      onData(sortNewestFirst(ALL_FORMS.flatMap((f) => perForm.get(f) || [])));
    };
    const unsubs = ALL_FORMS.map((f) =>
      onSnapshot(
        query(collection(db!, f), orderBy('createdAt', 'desc')),
        (snap) => {
          perForm.set(
            f,
            snap.docs.map((d) => ({ ...(d.data({ serverTimestamps: 'estimate' }) as BaseReportData), reportId: d.id, form: f }))
          );
          emit();
        },
        (e) => {
          console.error(`Live listener for ${f} failed:`, e);
          perForm.set(f, []);
          onError(describeFirestoreError(f, e));
          emit();
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }

  const push = () => onData(sortNewestFirst(Array.from(inMemoryStore.reports.values())));
  inMemoryReportListeners.add(push);
  push();
  return () => {
    inMemoryReportListeners.delete(push);
  };
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
      savePreviewStore();
      notifyInMemoryReportListeners();
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
  } else if (import.meta.env.PROD) {
    // Production build without Firebase config: nobody is an admin
    return { isAdmin: false, isQsaAdmin: false };
  } else {
    // In-memory or preview role resolution (local development only)
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
