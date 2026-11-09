/**
 * Announcement queue (e.g. scheduled maintenance), stored in the `announcements` collection.
 * Everyone can read it (public forms included); only Super Admins can change it.
 * Several can be live at once: the banner slides through them, each in its own colour.
 */
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  limit
} from 'firebase/firestore';
import { getFirebaseHandles } from './firebase';

export type AnnouncementLevel = 'info' | 'notice' | 'warning' | 'critical';

export interface Announcement {
  id: string;
  active: boolean;
  message: string;
  level: AnnouncementLevel;
  /** Start showing at this time (optional) */
  showFrom: Date | null;
  /** Stop showing after this time (optional) */
  showUntil: Date | null;
  updatedBy?: string;
  updatedAt?: Date | null;
}

export type AnnouncementInput = Omit<Announcement, 'id' | 'updatedBy' | 'updatedAt'>;

export const LEVELS: AnnouncementLevel[] = ['critical', 'warning', 'notice', 'info'];
/** Most important first in the queue */
const PRIORITY: Record<AnnouncementLevel, number> = { critical: 0, warning: 1, notice: 2, info: 3 };

const MAX_ANNOUNCEMENTS = 20;

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalise(id: string, d: any): Announcement {
  return {
    id,
    active: d?.active === true,
    message: d?.message || '',
    level: (LEVELS.includes(d?.level) ? d.level : 'info') as AnnouncementLevel,
    showFrom: toDate(d?.showFrom),
    showUntil: toDate(d?.showUntil),
    updatedBy: d?.updatedBy || '',
    updatedAt: toDate(d?.updatedAt)
  };
}

/** Queue order: most important level first, then most recently updated. */
export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort(
    (a, b) => PRIORITY[a.level] - PRIORITY[b.level] || (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0)
  );
}

export type AnnouncementStatus = 'showing' | 'scheduled' | 'ended' | 'off';

export function announcementStatus(a: Announcement, now = new Date()): AnnouncementStatus {
  if (!a.active || !a.message.trim()) return 'off';
  if (a.showFrom && now < a.showFrom) return 'scheduled';
  if (a.showUntil && now >= a.showUntil) return 'ended';
  return 'showing';
}

// ---------- preview mode (no Firebase): kept in this browser only ----------
const PREVIEW_KEY = 'za_preview_announcements';
const previewListeners = new Set<(list: Announcement[]) => void>();
function readPreview(): Announcement[] {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    return raw ? (JSON.parse(raw) as any[]).map((a) => normalise(a.id, a)) : [];
  } catch {
    return [];
  }
}
function writePreview(list: Announcement[]) {
  localStorage.setItem(PREVIEW_KEY, JSON.stringify(list));
  previewListeners.forEach((cb) => cb(sortAnnouncements(readPreview())));
}

/** Live updates of all announcements (sorted). Returns an unsubscribe function. */
export function subscribeAnnouncements(cb: (list: Announcement[]) => void): () => void {
  const { db } = getFirebaseHandles();
  if (!db) {
    previewListeners.add(cb);
    cb(sortAnnouncements(readPreview()));
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREVIEW_KEY) cb(sortAnnouncements(readPreview()));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      previewListeners.delete(cb);
      window.removeEventListener('storage', onStorage);
    };
  }
  return onSnapshot(
    query(collection(db, 'announcements'), limit(MAX_ANNOUNCEMENTS)),
    (snap) => cb(sortAnnouncements(snap.docs.map((d) => normalise(d.id, d.data())))),
    () => cb([]) // e.g. rules not deployed yet: just show nothing
  );
}

/** Super Admin: create (no id) or update an announcement. */
export async function saveAnnouncement(id: string | null, a: AnnouncementInput, byEmail: string): Promise<void> {
  const message = a.message.trim().slice(0, 500);
  if (!message) throw new Error('Write the message first.');
  const { db } = getFirebaseHandles();
  if (!db) {
    const list = readPreview();
    const value: Announcement = { ...a, message, id: id || `a${Date.now()}`, updatedBy: byEmail, updatedAt: new Date() };
    writePreview(id ? list.map((x) => (x.id === id ? value : x)) : [...list, value]);
    return;
  }
  const data: Record<string, any> = {
    active: a.active,
    message,
    level: a.level,
    showFrom: a.showFrom ? Timestamp.fromDate(a.showFrom) : null,
    showUntil: a.showUntil ? Timestamp.fromDate(a.showUntil) : null,
    updatedBy: byEmail,
    updatedAt: serverTimestamp()
  };
  try {
    if (id) await setDoc(doc(db, 'announcements', id), data, { merge: true });
    else await addDoc(collection(db, 'announcements'), { ...data, createdAt: serverTimestamp() });
  } catch (e: any) {
    throw new Error(
      e?.code === 'permission-denied'
        ? 'Permission denied. Only Super Admins can change announcements, and the latest firestore.rules must be deployed.'
        : e?.message || 'Could not save the announcement.'
    );
  }
}

/** Super Admin: switch an announcement on or off without editing it. */
export async function setAnnouncementActive(a: Announcement, active: boolean, byEmail: string): Promise<void> {
  return saveAnnouncement(a.id, { ...a, active }, byEmail);
}

/** Super Admin: delete an announcement. */
export async function deleteAnnouncement(id: string): Promise<void> {
  const { db } = getFirebaseHandles();
  if (!db) {
    writePreview(readPreview().filter((x) => x.id !== id));
    return;
  }
  try {
    await deleteDoc(doc(db, 'announcements', id));
  } catch (e: any) {
    throw new Error(e?.code === 'permission-denied' ? 'Permission denied.' : e?.message || 'Could not delete.');
  }
}
