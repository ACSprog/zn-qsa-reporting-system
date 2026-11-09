/**
 * Site-wide announcement banner (e.g. scheduled maintenance), stored in settings/announcement.
 * Everyone can read it (public forms included); only Super Admins can change it.
 */
import { doc, onSnapshot, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getFirebaseHandles } from './firebase';

export type AnnouncementLevel = 'info' | 'warning' | 'critical';

export interface Announcement {
  active: boolean;
  message: string;
  level: AnnouncementLevel;
  /** Stop showing after this time (optional) */
  showUntil: Date | null;
  updatedBy?: string;
  updatedAt?: Date | null;
}

export const EMPTY_ANNOUNCEMENT: Announcement = { active: false, message: '', level: 'info', showUntil: null };

// Preview mode (no Firebase): kept in this browser only
const PREVIEW_KEY = 'za_preview_announcement';
const previewListeners = new Set<(a: Announcement) => void>();
function readPreview(): Announcement {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (!raw) return EMPTY_ANNOUNCEMENT;
    const a = JSON.parse(raw);
    return { ...EMPTY_ANNOUNCEMENT, ...a, showUntil: toDate(a.showUntil), updatedAt: toDate(a.updatedAt) };
  } catch {
    return EMPTY_ANNOUNCEMENT;
  }
}

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Live updates of the announcement. Returns an unsubscribe function. */
export function subscribeAnnouncement(cb: (a: Announcement) => void): () => void {
  const { db } = getFirebaseHandles();
  if (!db) {
    previewListeners.add(cb);
    cb(readPreview());
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREVIEW_KEY) cb(readPreview());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      previewListeners.delete(cb);
      window.removeEventListener('storage', onStorage);
    };
  }
  return onSnapshot(
    doc(db, 'settings', 'announcement'),
    (snap) => {
      const d = snap.data();
      cb(
        d
          ? {
              active: d.active === true,
              message: d.message || '',
              level: (['info', 'warning', 'critical'].includes(d.level) ? d.level : 'info') as AnnouncementLevel,
              showUntil: toDate(d.showUntil),
              updatedBy: d.updatedBy || '',
              updatedAt: toDate(d.updatedAt)
            }
          : EMPTY_ANNOUNCEMENT
      );
    },
    () => cb(EMPTY_ANNOUNCEMENT) // e.g. rules not deployed yet: just show nothing
  );
}

/** Whether the banner should be on screen right now. */
export function isAnnouncementVisible(a: Announcement, now = new Date()): boolean {
  return a.active && a.message.trim().length > 0 && (!a.showUntil || now < a.showUntil);
}

/** Super Admin: save (or switch off) the announcement. */
export async function saveAnnouncement(a: Announcement, byEmail: string): Promise<void> {
  const message = a.message.trim().slice(0, 500);
  const { db } = getFirebaseHandles();
  if (!db) {
    const value = { ...a, message, updatedBy: byEmail, updatedAt: new Date() };
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(value));
    previewListeners.forEach((cb) => cb({ ...value }));
    return;
  }
  try {
    await setDoc(doc(db, 'settings', 'announcement'), {
      active: a.active,
      message,
      level: a.level,
      showUntil: a.showUntil ? Timestamp.fromDate(a.showUntil) : null,
      updatedBy: byEmail,
      updatedAt: serverTimestamp()
    });
  } catch (e: any) {
    throw new Error(
      e?.code === 'permission-denied'
        ? 'Permission denied. Only Super Admins can change the announcement, and the latest firestore.rules must be deployed.'
        : e?.message || 'Could not save the announcement.'
    );
  }
}
