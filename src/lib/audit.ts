/**
 * Audit trail: one permanent entry for every action taken in the CMS (who, when, what, before
 * and after). Entries live in Firestore "auditLog"; the security rules let signed-in CMS users
 * add entries in their own name only, stamp the time on the server, and let nobody edit or
 * delete them. Managers and Super Admins can read and export them (Audit Log page, case
 * History, case audit pack).
 */
import {
  addDoc,
  collection,
  doc,
  WriteBatch,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where
} from 'firebase/firestore';
import { getFirebaseHandles, currentActor } from './firebase';

export type AuditTargetType = 'case' | 'account' | 'session' | 'settings' | 'announcement' | 'export' | 'audit';

/** Every kind of entry, with the wording shown on screen and in exports. */
export const AUDIT_ACTIONS: Record<string, string> = {
  'session.sign-in': 'Signed in to the CMS',
  'session.sign-in-failed': 'Failed sign-in attempt',
  'session.sign-out': 'Signed out',
  'session.password-changed': 'Changed own password',

  'case.review': 'Updated status / notes',
  'case.identity-viewed': 'Viewed reporter identity',
  'case.moved': 'Moved case to another report type',
  'case.archive-requested': 'Asked for case to be archived',
  'case.archive-approved': 'Approved archive request (case archived)',
  'case.archive-rejected': 'Rejected archive request',
  'case.archived': 'Archived case',
  'case.restored': 'Restored archived case',
  'case.deleted': 'Permanently deleted case',
  'case.excel-sync': 'Sent case to Excel / SharePoint',

  'account.added': 'Added CMS user',
  'account.role-changed': 'Changed user role',
  'account.blocked': 'Blocked user',
  'account.unblocked': 'Unblocked user',
  'account.2fa-on': 'Started 2FA for user',
  'account.2fa-off': 'Stopped 2FA for user',
  'account.removed': 'Removed CMS user',
  'account.password-reset-sent': 'Sent password reset mail',
  'account.unlocked': 'Unlocked user (after 5 wrong passwords)',
  'account.request-sent': 'Asked a Super Admin to confirm a change',
  'account.request-answered': 'Answered a confirmation request',

  'settings.require-2fa': 'Switched 2FA on for everyone',

  'announcement.saved': 'Saved announcement',
  'announcement.switched': 'Switched announcement on/off',
  'announcement.deleted': 'Deleted announcement',

  'export.reports': 'Exported cases from the inbox',
  'export.audit-log': 'Exported the audit log',
  'export.case-pack': 'Exported a case audit pack',
  'audit.reviewed': 'Reviewed the audit log'
};

export type AuditOutcome = 'success' | 'failure';

// The signed-in user's CMS level, recorded on each entry (set by the CMS when it loads the role)
let currentRole = '';
export function setAuditRole(role: string | null | undefined) {
  currentRole = role || '';
}

/** "Chrome 131 on Windows" style device description (ISO 27002 8.15 d: device identity) */
export function deviceDescription(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  const browser =
    /Edg\/(\d+)/.exec(ua)?.[1] ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
    : /OPR\/(\d+)/.exec(ua)?.[1] ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}`
    : /Firefox\/(\d+)/.exec(ua)?.[1] ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
    : /Chrome\/(\d+)/.exec(ua)?.[1] ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
    : /Version\/(\d+).*Safari/.exec(ua)?.[1] ? `Safari ${/Version\/(\d+).*Safari/.exec(ua)![1]}`
    : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${browser} on ${os}`.slice(0, 120);
}

export function actionLabel(action: string): string {
  return AUDIT_ACTIONS[action] || action;
}

export interface AuditEntry {
  id: string;
  /** Server time (Google, UTC) when the entry was written */
  at: Date;
  actorUid: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  outcome: AuditOutcome;
  device: string;
  targetType: AuditTargetType;
  targetId: string;
  summary: string;
  details: Record<string, any>;
}

const MAX_TEXT = 5000;

function clean(details: Record<string, any> = {}): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? v.slice(0, MAX_TEXT) : v;
  }
  return out;
}

// ---- preview mode (no Firebase): keep entries in this browser only ----
const PREVIEW_KEY = 'za_preview_audit_v1';
function previewLoad(): AuditEntry[] {
  try {
    const raw = window.localStorage.getItem(PREVIEW_KEY);
    return raw ? (JSON.parse(raw) as any[]).map((e) => ({ ...e, at: new Date(e.at) })) : [];
  } catch {
    return [];
  }
}
function previewSave(list: AuditEntry[]) {
  try {
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(list.slice(-5000)));
  } catch {
    /* storage full or blocked: preview only */
  }
}

interface LogOptions {
  outcome?: AuditOutcome;
  /** Failed sign-in: nobody is signed in, so the e-mail that was tried is recorded instead */
  attemptedEmail?: string;
}

function buildEntry(
  action: string,
  targetType: AuditTargetType,
  targetId: string,
  summary: string,
  details: Record<string, any> | undefined,
  opts: LogOptions
) {
  const actor = currentActor();
  return {
    actorUid: actor?.uid || '',
    actorEmail: (actor?.email || opts.attemptedEmail || '').slice(0, 254),
    actorRole: actor ? currentRole : '',
    action,
    outcome: opts.outcome || 'success',
    device: deviceDescription(),
    targetType,
    targetId: String(targetId || '').slice(0, 200),
    summary: String(summary || '').slice(0, 1000),
    details: clean(details)
  };
}

/**
 * Records one action. Never throws: a failed audit write must not stop the work itself
 * (it is reported in the browser console instead). Changes to cases do not use this: they
 * go through addAuditToBatch so the change and its entry are saved together or not at all.
 */
export async function logAudit(
  action: string,
  targetType: AuditTargetType,
  targetId: string,
  summary: string,
  details?: Record<string, any>,
  opts: LogOptions = {}
): Promise<void> {
  if (!currentActor() && action !== 'session.sign-in-failed') return;
  const { db } = getFirebaseHandles();
  const entry = buildEntry(action, targetType, targetId, summary, details, opts);
  try {
    if (db) {
      await addDoc(collection(db, 'auditLog'), { ...entry, at: serverTimestamp() });
    } else if (typeof window !== 'undefined') {
      previewAdd(entry);
    }
  } catch (e) {
    console.warn('[audit] Could not record', action, e);
  }
}

function previewAdd(entry: Omit<AuditEntry, 'id' | 'at'>) {
  const list = previewLoad();
  list.push({ ...entry, id: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`, at: new Date() });
  previewSave(list);
}

/**
 * Adds the audit entry for a case change to the same batch as the change, and returns its id.
 * The case must store this id in "auditRef": the security rules refuse a case change whose
 * audit entry is not written in the same batch, so case changes cannot skip the audit trail.
 */
export function addAuditToBatch(
  batch: WriteBatch,
  action: string,
  targetId: string,
  summary: string,
  details?: Record<string, any>
): string {
  const { db } = getFirebaseHandles();
  const ref = doc(collection(db!, 'auditLog'));
  batch.set(ref, { ...buildEntry(action, 'case', targetId, summary, details, {}), at: serverTimestamp() });
  return ref.id;
}

/** Preview mode counterpart of addAuditToBatch */
export function previewAudit(action: string, targetId: string, summary: string, details?: Record<string, any>) {
  if (typeof window !== 'undefined') previewAdd(buildEntry(action, 'case', targetId, summary, details, {}));
}

function toEntry(id: string, d: any): AuditEntry {
  const at = d.at instanceof Timestamp ? d.at.toDate() : d.at ? new Date(d.at) : new Date(0);
  return {
    id,
    at,
    actorUid: d.actorUid || '',
    actorEmail: d.actorEmail || '',
    actorRole: d.actorRole || '',
    action: d.action || '',
    outcome: d.outcome === 'failure' ? 'failure' : 'success',
    device: d.device || '',
    targetType: d.targetType || 'case',
    targetId: d.targetId || '',
    summary: d.summary || '',
    details: d.details || {}
  };
}

/** All entries between two dates (newest first). Super Admins only. */
export async function fetchAuditLog(from: Date, to: Date, max = 5000): Promise<AuditEntry[]> {
  const { db } = getFirebaseHandles();
  if (!db) {
    return previewLoad()
      .filter((e) => e.at >= from && e.at < to)
      .sort((a, b) => b.at.getTime() - a.at.getTime());
  }
  const snap = await getDocs(
    query(
      collection(db, 'auditLog'),
      where('at', '>=', Timestamp.fromDate(from)),
      where('at', '<', Timestamp.fromDate(to)),
      orderBy('at', 'desc'),
      fsLimit(max)
    )
  );
  return snap.docs.map((d) => toEntry(d.id, d.data({ serverTimestamps: 'estimate' })));
}

/** Everything recorded against one case (oldest first). Managers may read only these. */
export async function fetchCaseHistory(targetId: string): Promise<AuditEntry[]> {
  const { db } = getFirebaseHandles();
  const list = db
    ? (await getDocs(query(collection(db, 'auditLog'), where('targetType', '==', 'case'), where('targetId', '==', targetId)))).docs.map((d) =>
        toEntry(d.id, d.data({ serverTimestamps: 'estimate' }))
      )
    : previewLoad().filter((e) => e.targetType === 'case' && e.targetId === targetId);
  return list.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** "13 Nov 2026, 10:42" in the viewer's local time */
export function formatAuditTime(d: Date): string {
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/** Before/after text for tables and exports, e.g. "Status: New → Under review" */
export function describeChanges(details: Record<string, any>): { before: string; after: string; other: string } {
  const before: string[] = [];
  const after: string[] = [];
  const other: string[] = [];
  for (const [k, v] of Object.entries(details || {})) {
    if (k.startsWith('before_')) before.push(`${pretty(k.slice(7))}: ${v === '' ? '(blank)' : v}`);
    else if (k.startsWith('after_')) after.push(`${pretty(k.slice(6))}: ${v === '' ? '(blank)' : v}`);
    else other.push(`${pretty(k)}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  }
  return { before: before.join('\n'), after: after.join('\n'), other: other.join('\n') };
}

/** One row per changed field: "Status: New → Under review" */
export function changeRows(details: Record<string, any>): { field: string; before: string; after: string }[] {
  const keys = new Set<string>();
  for (const k of Object.keys(details || {})) {
    if (k.startsWith('before_')) keys.add(k.slice(7));
    if (k.startsWith('after_')) keys.add(k.slice(6));
  }
  return Array.from(keys).map((k) => ({
    field: pretty(k),
    before: details[`before_${k}`] === undefined ? '' : String(details[`before_${k}`]) || '(blank)',
    after: details[`after_${k}`] === undefined ? '' : String(details[`after_${k}`]) || '(blank)'
  }));
}

function pretty(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
