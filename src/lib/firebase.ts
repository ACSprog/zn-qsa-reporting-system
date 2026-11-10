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
  deleteField,
  collection,
  query,
  where,
  orderBy,
  writeBatch,
  runTransaction,
  deleteDoc,
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
  sendSignInLinkToEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  MultiFactorResolver,
  ActionCodeSettings,
  User
} from 'firebase/auth';
import {
  BaseReportData,
  FormType,
  ProcessedEvidenceFile,
  ReporterIdentity,
  ReportStatus,
  CmsRole,
  DeletionRequest,
  ReclassificationRecord,
  PendingAdminAction,
  isManagerRole,
  ALL_REPORT_FORMS
} from '../types';
import { stripIdentityIfAnonymous, getCategoryForForm } from './idGenerator';
import { EXCEL_TABLE_FOR_FORM, buildExcelRow } from '../config/excelMapping';

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

/**
 * CMS session limits (override in .env.local / build env):
 *   VITE_CMS_IDLE_MINUTES        sign out after this many minutes without activity (default 15)
 *   VITE_CMS_MAX_SESSION_HOURS   sign in again after this many hours regardless (default 8, max 12;
 *                                firestore.rules refuse sessions older than 12 hours)
 */
function envNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, min), max) : fallback;
}
export const SESSION_LIMITS = {
  idleMinutes: envNumber(import.meta.env.VITE_CMS_IDLE_MINUTES, 15, 2, 240),
  maxSessionHours: envNumber(import.meta.env.VITE_CMS_MAX_SESSION_HOURS, 8, 1, 12)
};

/**
 * One-way fingerprint of a temporary password (SHA-256 of uid + password). Stored on the user's
 * admins doc so the CMS can tell, at sign-in, whether they are still using the temporary password.
 * The temporary password is random (~70 bits), so the fingerprint can't be reversed.
 */
export async function tempPasswordFingerprint(uid: string, password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${uid}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Password typed at the latest sign-in, kept in memory only until roles are checked (max 2 min). */
let pendingSignInPassword: { password: string; at: number } | null = null;
function takePendingPassword(): string | null {
  const p = pendingSignInPassword;
  pendingSignInPassword = null;
  return p && Date.now() - p.at < 120_000 ? p.password : null;
}

/** Resolves once the sign-in storage mode has been applied (await before signing in). */
let authPersistenceReady: Promise<void> = Promise.resolve();

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getFirestore(app);
    auth = getAuth(app);
    // Keep the CMS session only for this browser tab/window: closing it signs the user out
    authPersistenceReady = setPersistence(auth, browserSessionPersistence).catch((e) =>
      console.warn('Could not set session-only sign-in:', e)
    );
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
  evidenceFiles: ProcessedEvidenceFile[],
  /** "Email me my case number" address: kept with the identity for Open / Confidential only */
  receiptEmail: string = ''
): Promise<{ success: boolean; reportId: string; error?: string }> {
  const reporting = rawFormData.reporting || 'Named';
  const cleanData = stripIdentityIfAnonymous(rawFormData, reporting);
  const evidenceCount = evidenceFiles.length;
  const evidenceBaseFolder = (import.meta.env.VITE_EVIDENCE_FOLDER_URL || '').replace(/\/+$/, '');
  // Ignore an unset or placeholder ("{tenant}") SharePoint address so no broken link is stored
  const evidenceFolder =
    evidenceCount > 0 && /^https:\/\/[^\s{}]+$/i.test(evidenceBaseFolder) ? `${evidenceBaseFolder}/${reportId}` : '';
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
  const cleanReceiptEmail = receiptEmail.trim().toLowerCase().slice(0, 254);
  if (reporting !== 'Anonymous' && cleanReceiptEmail) identityData.email = cleanReceiptEmail;

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
    // 'Named' reports are called "Open" everywhere people see them (Excel, emails)
    reporting: data.reporting === 'Named' ? 'Open' : data.reporting,
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

  // Ready-made Excel row (column header -> value) so one "Add a row" step serves every form
  const excelPayload = {
    ...payload,
    excelTable: EXCEL_TABLE_FOR_FORM[form],
    excelRow: buildExcelRow(form, payload)
  };

  fetch(flowUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(excelPayload)
  }).catch(() => {
    // Non-blocking fire and forget as mandated in spec
  });

  return true;
}

const ALL_FORMS: FormType[] = ALL_REPORT_FORMS;

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
/**
 * Super Admin: permanently delete a case. An audit record (who, when, case number, reason;
 * no case content) is written first, then the evidence files, the reporter's identity and
 * the case itself are removed. Excel/SharePoint rows are not touched.
 */
export async function permanentlyDeleteReport(
  form: FormType,
  reportId: string,
  reason: string,
  by: { uid: string; email?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  if (!db) {
    inMemoryStore.reports.delete(reportId);
    inMemoryStore.evidence.delete(reportId);
    inMemoryStore.identities.delete(reportId);
    savePreviewStore();
    notifyInMemoryReportListeners();
    return { ok: true };
  }
  try {
    await setDoc(doc(db, 'caseDeletions', reportId), {
      reportId,
      form,
      deletedBy: by.uid,
      deletedByEmail: by.email || '',
      deletedAt: serverTimestamp(),
      reason: reason.slice(0, 500)
    });
    // One request per document keeps each well inside Firestore's lookup limit for rules
    for (const n of ['1', '2', '3', '4', '5']) await deleteDoc(doc(db, form, reportId, 'evidence', n));
    await deleteDoc(doc(db, 'identities', reportId));
    await deleteDoc(doc(db, form, reportId));
    return { ok: true };
  } catch (e: any) {
    console.error('Permanent delete failed:', e);
    return {
      ok: false,
      error:
        e?.code === 'permission-denied'
          ? 'Permission denied. Only Super Admins can delete cases permanently, and the latest security rules must be published.'
          : e?.message || String(e)
    };
  }
}

export async function updateReportMetadata(
  form: FormType,
  reportId: string,
  updates: {
    status?: ReportStatus;
    notes?: string;
    deleted?: boolean;
    deletionRequest?: DeletionRequest;
    reclassifiedTo?: FormType | null;
    reclassification?: ReclassificationRecord;
  }
): Promise<boolean> {
  if (db) {
    try {
      const ref = doc(db, form, reportId);
      // null means "remove the field" (e.g. a case moved back to its original type)
      const firestoreUpdates: Record<string, any> = { ...updates };
      for (const [k, v] of Object.entries(firestoreUpdates)) if (v === null) firestoreUpdates[k] = deleteField();
      await updateDoc(ref, firestoreUpdates);
      return true;
    } catch (e) {
      console.error('Failed to update report metadata:', e);
      return false;
    }
  } else {
    const rep = inMemoryStore.reports.get(reportId);
    if (rep) {
      const merged: Record<string, any> = { ...rep, ...updates };
      for (const [k, v] of Object.entries(updates)) if (v === null) delete merged[k];
      inMemoryStore.reports.set(reportId, merged as BaseReportData);
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
export interface UserRoles {
  isAdmin: boolean;
  /** Manager or Super Admin: can see reporter identities (kept for existing callers) */
  isQsaAdmin: boolean;
  role: CmsRole | null;
  mustChangePassword: boolean;
  /** Account exists but a Manager blocked it */
  blocked: boolean;
  /** settings/security.require2fa, unless a Super Admin switched 2FA off for this user */
  require2fa: boolean;
  /** A Super Admin switched 2FA off for this user (admins/{uid}.twoFactor == 'off') */
  twoFactorOff?: boolean;
  /** settings/security.require2fa (2FA required for everyone) */
  global2fa?: boolean;
  /** Per-person setting from a Super Admin: 'on', 'off', or undefined = follow everyone */
  twoFactor?: 'on' | 'off';
  /** What the user's record says about whether they use an authenticator app */
  twoFactorEnrolled?: boolean;
  /** Locked after too many wrong passwords */
  locked?: boolean;
  /** Super Admins: a change to their own account another Super Admin asked them to confirm */
  pendingAction?: PendingAdminAction;
}

const VALID_ROLES: CmsRole[] = ['viewer', 'officer', 'manager', 'superadmin'];

/** Preview mode only: sign in as viewer@..., officer@..., manager@... to try the lower levels */
function previewRoleFor(email?: string | null): CmsRole {
  const e = (email || '').toLowerCase();
  if (e.startsWith('viewer')) return 'viewer';
  if (e.startsWith('officer')) return 'officer';
  if (e.startsWith('manager')) return 'manager';
  return 'superadmin';
}

export async function verifyUserRoles(user: User | { uid: string; email?: string | null }): Promise<UserRoles> {
  const none: UserRoles = { isAdmin: false, isQsaAdmin: false, role: null, mustChangePassword: false, blocked: false, require2fa: false };
  if (!user) return none;

  if (db) {
    try {
      const adminDoc = await getDoc(doc(db, 'admins', user.uid));
      if (!adminDoc.exists()) return none;
      const data = adminDoc.data() || {};
      if (data.enabled === false) return { ...none, blocked: true };
      // Locked after 5 wrong passwords (the password may since have been guessed): no access.
      // Otherwise this successful sign-in clears any earlier failed attempts.
      if (user.email) {
        const lock = await getSignInLock(user.email);
        if (lock?.locked) return { ...none, locked: true };
        if (lock && lock.failures > 0) await deleteDoc(doc(db, 'signInLocks', user.email.toLowerCase())).catch(() => undefined);
      }

      // Still flagged as using a temporary password? If they just signed in with a different
      // password, they already chose their own (e.g. via the e-mailed link): clear the flag.
      const typedPassword = takePendingPassword();
      if (data.mustChangePassword === true && typedPassword && typeof data.tempPasswordHash === 'string') {
        const fingerprint = await tempPasswordFingerprint(user.uid, typedPassword);
        if (fingerprint !== data.tempPasswordHash) {
          try {
            await updateDoc(doc(db, 'admins', user.uid), { mustChangePassword: false, tempPasswordHash: deleteField() });
            data.mustChangePassword = false;
          } catch (e) {
            console.warn('Could not clear the temporary-password flag:', e);
          }
        }
      }
      const qsaDoc = await getDoc(doc(db, 'qsaAdmins', user.uid));
      const twoFactor: 'on' | 'off' | undefined = data.twoFactor === 'on' || data.twoFactor === 'off' ? data.twoFactor : undefined;
      let global2fa = false;
      try {
        const sec = await getDoc(doc(db, 'settings', 'security'));
        global2fa = sec.exists() && sec.data()?.require2fa === true;
      } catch {
        // older rules without settings access: treat as not required
      }
      const require2fa = effectiveRequire2fa(global2fa, twoFactor);
      const twoFactorOff = twoFactor === 'off';
      // Stored Super Admin wins; legacy qsaAdmins members are Managers; role-less docs are Officers
      const stored = data.role as CmsRole | undefined;
      const role: CmsRole =
        stored === 'superadmin'
          ? 'superadmin'
          : qsaDoc.exists()
            ? 'manager'
            : stored && VALID_ROLES.includes(stored)
              ? stored
              : 'officer';
      return {
        isAdmin: true,
        isQsaAdmin: isManagerRole(role),
        role,
        mustChangePassword: data.mustChangePassword === true,
        blocked: false,
        require2fa,
        twoFactorOff,
        global2fa,
        twoFactor,
        twoFactorEnrolled: data.twoFactorEnrolled === true,
        pendingAction: data.pendingAction || undefined
      };
    } catch {
      return none;
    }
  } else if (import.meta.env.PROD) {
    // Production build without Firebase config: nobody is an admin
    return none;
  } else {
    const role = previewRoleFor(user.email);
    return { isAdmin: true, isQsaAdmin: isManagerRole(role), role, mustChangePassword: false, blocked: false, require2fa: false };
  }
}

/**
 * Live view of the signed-in user's own admins doc: lets the CMS show confirmation requests
 * straight away, and end the session at once if the account is blocked or removed.
 */
export function subscribeMyAdminRecord(
  uid: string,
  onChange: (state: { exists: boolean; blocked: boolean; pendingAction?: PendingAdminAction; twoFactor?: 'on' | 'off' }) => void
): () => void {
  if (!db) return () => undefined;
  return onSnapshot(
    doc(db, 'admins', uid),
    (snap) => {
      const d = snap.data();
      onChange({
        exists: snap.exists(),
        blocked: d?.enabled === false,
        pendingAction: d?.pendingAction || undefined,
        twoFactor: d?.twoFactor === 'on' || d?.twoFactor === 'off' ? d.twoFactor : undefined
      });
    },
    () => undefined
  );
}

/** Officer: ask a Manager to delete (archive) a report. */
export async function requestReportDeletion(
  report: BaseReportData,
  reason: string,
  requester: { uid: string; email?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: 'Please give a reason for the deletion request.' };
  const request: DeletionRequest = {
    status: 'pending',
    requestedBy: requester.uid,
    requestedByEmail: requester.email || '',
    requestedAt: db ? serverTimestamp() : new Date().toISOString(),
    reason: trimmed.slice(0, 1000)
  };
  const ok = await updateReportMetadata(report.form, report.reportId, { deletionRequest: request });
  return ok ? { ok } : { ok, error: 'Could not send the request. You may not have permission, or a request is already pending.' };
}

/**
 * Manager: the case was submitted under the wrong report type. It keeps its case number and
 * answers; the CMS shows and counts it under the new type, with a record of the change.
 */
export async function reclassifyReport(
  report: BaseReportData,
  to: FormType,
  reason: string,
  manager: { uid: string; email?: string | null }
): Promise<boolean> {
  const current = report.reclassifiedTo || report.form;
  if (to === current) return true;
  const record: ReclassificationRecord = {
    from: current,
    to,
    by: manager.uid,
    byEmail: manager.email || '',
    at: db ? serverTimestamp() : new Date().toISOString(),
    reason: reason.trim().slice(0, 500)
  };
  // Moving back to the type it was submitted as clears the override
  const reclassifiedTo = to === report.form ? null : to;
  return updateReportMetadata(report.form, report.reportId, { reclassifiedTo, reclassification: record });
}

/** Manager: approve (archives the report) or reject a pending deletion request. */
export async function decideDeletionRequest(
  report: BaseReportData,
  approve: boolean,
  manager: { uid: string; email?: string | null }
): Promise<boolean> {
  const current = report.deletionRequest;
  if (!current || current.status !== 'pending') return false;
  const decided: DeletionRequest = {
    ...current,
    status: approve ? 'approved' : 'rejected',
    decidedBy: manager.uid,
    decidedByEmail: manager.email || '',
    decidedAt: db ? serverTimestamp() : new Date().toISOString()
  };
  return updateReportMetadata(report.form, report.reportId, approve ? { deletionRequest: decided, deleted: true } : { deletionRequest: decided });
}

// In-memory mock session handlers for local preview mode
let mockUser: any = null;
const mockAuthListeners: Array<(user: any) => void> = [];

/** Records on the user's own CMS record whether they use an authenticator app (for the 2FA ON badge). */
export async function recordMy2faInUse(uid: string, inUse: boolean): Promise<void> {
  if (!db) return;
  try {
    await updateDoc(doc(db, 'admins', uid), { twoFactorEnrolled: inUse });
  } catch (e) {
    console.warn('Could not record the 2FA status:', e);
  }
}

/** Is 2FA required for this person? Their own setting wins over the everyone setting. */
export function effectiveRequire2fa(global2fa: boolean, twoFactor?: 'on' | 'off'): boolean {
  return twoFactor === 'on' || (global2fa && twoFactor !== 'off');
}

/** Wrong passwords allowed before the account is locked (a Manager's password reset unlocks it). */
export const MAX_SIGNIN_ATTEMPTS = 5;
export const LOCKED_MESSAGE =
  'This account is locked after 5 wrong passwords. Contact a QSA Manager or Super Admin and ask them to send you a password reset email.';

export interface SignInLock {
  failures: number;
  locked: boolean;
}

/** Failed-sign-in record for an email (null if none, or it can't be read). */
export async function getSignInLock(email: string): Promise<SignInLock | null> {
  if (!db) return null;
  const id = email.trim().toLowerCase();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'signInLocks', id));
    if (!snap.exists()) return null;
    const d = snap.data() || {};
    return { failures: Number(d.failures) || 0, locked: d.locked === true };
  } catch {
    return null;
  }
}

/** Adds one wrong password to the email's counter; the 5th locks the account. */
async function recordFailedSignIn(email: string): Promise<SignInLock | null> {
  if (!db) return null;
  const ref = doc(db, 'signInLocks', email.trim().toLowerCase());
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists() ? snap.data() || {} : null;
      if (cur?.locked === true) return { failures: Number(cur.failures) || MAX_SIGNIN_ATTEMPTS, locked: true };
      const failures = (cur ? Number(cur.failures) || 0 : 0) + 1;
      const locked = failures >= MAX_SIGNIN_ATTEMPTS;
      if (!cur) {
        tx.set(ref, { failures, locked: false, lastFailureAt: serverTimestamp() });
      } else {
        tx.update(ref, {
          failures,
          locked,
          lastFailureAt: serverTimestamp(),
          ...(locked ? { lockedAt: serverTimestamp() } : {})
        });
      }
      return { failures, locked };
    });
  } catch (e) {
    console.warn('[auth] Could not record the failed sign-in:', e);
    return null;
  }
}

/**
 * Authentication handlers
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ user: User | any | null; error?: string; mfaResolver?: MultiFactorResolver }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { user: null, error: 'Please enter both your email address and password.' };
  }

  if (auth) {
    await authPersistenceReady;
    if ((await getSignInLock(cleanEmail))?.locked) {
      return { user: null, error: LOCKED_MESSAGE };
    }
    pendingSignInPassword = { password, at: Date.now() };
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      return { user: cred.user };
    } catch (err: any) {
      // Password was right; now the authenticator-app code is needed
      if (err?.code === 'auth/multi-factor-auth-required') {
        return { user: null, mfaResolver: getMultiFactorResolver(auth, err) };
      }
      let message = 'Invalid email or password. Please verify your credentials.';
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        const lock = await recordFailedSignIn(cleanEmail);
        if (lock?.locked) return { user: null, error: LOCKED_MESSAGE };
        const left = lock ? MAX_SIGNIN_ATTEMPTS - lock.failures : null;
        message =
          left === null
            ? 'Invalid email or password. Please check your credentials and try again.'
            : `Invalid email or password. ${left} attempt${left === 1 ? '' : 's'} left before the account is locked.`;
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
      displayName: cleanEmail.split('@')[0].toUpperCase(),
      signedInAt: Date.now()
    };
    inMemoryStore.admins.add(fakeUid);
    inMemoryStore.admins.add(cleanEmail);
    inMemoryStore.qsaAdmins.add(fakeUid);
    inMemoryStore.qsaAdmins.add(cleanEmail);
    mockAuthListeners.forEach((cb) => cb(mockUser));
    return { user: mockUser };
  }
}

/**
 * Firebase email links (reset / verification) get a "Continue" button back to the CMS sign-in,
 * even when Firebase's own page is used. Falls back to no button if this site's domain isn't
 * in Firebase Auth's authorized domains (so the email is still sent).
 */
export async function withCmsContinueLink<T>(send: (settings?: ActionCodeSettings) => Promise<T>): Promise<T> {
  const settings: ActionCodeSettings | undefined =
    typeof window !== 'undefined' ? { url: `${window.location.origin}/admin` } : undefined;
  try {
    return await send(settings);
  } catch (e: any) {
    if (settings && /continue-uri|unauthorized-domain/.test(e?.code || '')) return send(undefined);
    throw e;
  }
}

/**
 * "Set a new password" e-mail that opens OUR branded /auth/action page.
 *
 * Firebase's password-reset links always open Firebase's plain page unless the console
 * "Customize action URL" setting is saved, and that setting is locked on this project.
 * Sign-in links (mode=signIn) are different: Firebase forwards them to our page. So we send
 * a one-time sign-in link; our page signs the user in (asking for the 2FA code if they have it)
 * and lets them choose a new password.
 *
 * Needs "Email link (passwordless sign-in)" switched on under Authentication > Sign-in method >
 * Email/Password. If it is off, or the daily quota for these e-mails is used up (5/day on the
 * free Spark plan), it falls back to Firebase's classic reset e-mail so the user still gets a link.
 */
export async function sendPasswordLinkEmail(email: string): Promise<'branded' | 'classic'> {
  const cleanEmail = email.trim().toLowerCase();
  if (!auth) return 'branded'; // preview mode
  if (typeof window !== 'undefined') {
    try {
      const url = `${window.location.origin}/auth/action?flow=password&e=${encodeURIComponent(cleanEmail)}`;
      await sendSignInLinkToEmail(auth, cleanEmail, { url, handleCodeInApp: true });
      return 'branded';
    } catch (e: any) {
      const code: string = e?.code || '';
      if (!/operation-not-allowed|quota-exceeded|too-many-requests|continue-uri|unauthorized-domain|argument-error|admin-restricted/.test(code)) throw e;
      console.warn('[auth] Branded password link not available, using the classic reset e-mail:', code);
    }
  }
  await withCmsContinueLink((settings) => sendPasswordResetEmail(auth!, cleanEmail, settings));
  return 'classic';
}

/** When the current CMS session started (last real sign-in), in ms since epoch. */
export async function getSessionStartMs(user: any): Promise<number | null> {
  if (user && typeof user.getIdTokenResult === 'function') {
    try {
      const token = await user.getIdTokenResult();
      return token.authTime ? new Date(token.authTime).getTime() : null;
    } catch {
      return null;
    }
  }
  return user?.signedInAt ?? null; // preview mock
}

/** Second sign-in step: the 6-digit code from the authenticator app. */
export async function completeMfaSignIn(
  resolver: MultiFactorResolver,
  code: string
): Promise<{ user: User | null; error?: string }> {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) return { user: null, error: 'No authenticator app is set up for this account. Contact a Super Admin.' };
  try {
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.replace(/\s/g, ''));
    const cred = await resolver.resolveSignIn(assertion);
    return { user: cred.user };
  } catch (err: any) {
    if (err?.code === 'auth/invalid-verification-code' || err?.code === 'auth/totp-challenge-timeout') {
      return { user: null, error: 'That code is not right or has expired. Enter the current 6-digit code from your app.' };
    }
    if (err?.code === 'auth/too-many-requests') {
      return { user: null, error: 'Too many attempts. Wait a few minutes and try again.' };
    }
    return { user: null, error: err?.message || 'Could not verify the code.' };
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
    if ((await getSignInLock(cleanEmail))?.locked) {
      return { success: false, error: LOCKED_MESSAGE };
    }
    try {
      await sendPasswordLinkEmail(cleanEmail);
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
