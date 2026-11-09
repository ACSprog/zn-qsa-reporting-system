import React, { useEffect, useState } from 'react';
import { Megaphone, AlertTriangle, AlertOctagon, X, Loader2, CheckCircle2 } from 'lucide-react';
import {
  Announcement,
  AnnouncementLevel,
  EMPTY_ANNOUNCEMENT,
  isAnnouncementVisible,
  saveAnnouncement,
  subscribeAnnouncement
} from '../lib/announcement';

const LEVEL_STYLE: Record<AnnouncementLevel, { bar: string; icon: React.ReactNode; label: string }> = {
  info: {
    bar: 'bg-[#0d3b1f] text-white border-b border-[#1B8E44]',
    icon: <Megaphone className="w-4 h-4 text-[#F37C1C] shrink-0" />,
    label: 'Information'
  },
  warning: {
    bar: 'bg-amber-400 text-slate-950 border-b border-amber-500',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
    label: 'Warning (e.g. scheduled maintenance)'
  },
  critical: {
    bar: 'bg-[#DE2010] text-white border-b border-red-800',
    icon: <AlertOctagon className="w-4 h-4 shrink-0" />,
    label: 'Critical (e.g. system unavailable)'
  }
};

function formatUntil(d: Date | null): string {
  return d ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

/** Shown at the top of every page while a Super Admin's announcement is active. */
export const AnnouncementBanner: React.FC = () => {
  const [a, setA] = useState<Announcement>(EMPTY_ANNOUNCEMENT);
  const [dismissedKey, setDismissedKey] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('za_announcement_dismissed');
    } catch {
      return null;
    }
  });
  const [, setTick] = useState(0);

  useEffect(() => subscribeAnnouncement(setA), []);
  // Re-check every minute so the banner disappears at its "show until" time
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!isAnnouncementVisible(a)) return null;
  // Dismissal lasts for this browser session and only for this exact message
  const key = `${a.message}|${a.updatedAt instanceof Date ? a.updatedAt.getTime() : ''}`;
  if (dismissedKey === key && a.level !== 'critical') return null;
  const style = LEVEL_STYLE[a.level];

  return (
    <div className={`${style.bar} px-4 py-2.5 text-sm`} role={a.level === 'info' ? 'status' : 'alert'}>
      <div className="max-w-7xl mx-auto flex items-start gap-2.5">
        {style.icon}
        <p className="flex-1 font-semibold leading-snug whitespace-pre-wrap">
          {a.message}
          {a.showUntil && <span className="font-normal opacity-80"> (until {formatUntil(a.showUntil)})</span>}
        </p>
        {a.level !== 'critical' && (
          <button
            type="button"
            onClick={() => {
              setDismissedKey(key);
              try {
                sessionStorage.setItem('za_announcement_dismissed', key);
              } catch {
                /* ignore */
              }
            }}
            className="opacity-70 hover:opacity-100 shrink-0"
            title="Hide this message"
            aria-label="Hide this message"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

function toLocalInput(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** CMS editor (Super Admin only). */
export const AnnouncementEditor: React.FC<{ currentEmail: string }> = ({ currentEmail }) => {
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState<Announcement>(EMPTY_ANNOUNCEMENT);
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<AnnouncementLevel>('warning');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(
    () =>
      subscribeAnnouncement((a) => {
        setCurrent(a);
        if (!loaded) {
          setMessage(a.message);
          setLevel(a.message ? a.level : 'warning');
          setUntil(toLocalInput(a.showUntil));
          setLoaded(true);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const save = async (active: boolean) => {
    setNotice(null);
    if (active && !message.trim()) {
      setNotice({ kind: 'error', text: 'Write the message first.' });
      return;
    }
    const showUntil = until ? new Date(until) : null;
    if (active && showUntil && showUntil <= new Date()) {
      setNotice({ kind: 'error', text: '"Show until" is in the past. Pick a later time or clear it.' });
      return;
    }
    setBusy(true);
    try {
      await saveAnnouncement({ active, message, level, showUntil }, currentEmail);
      setNotice({ kind: 'ok', text: active ? 'Announcement is now showing to everyone.' : 'Announcement removed.' });
    } catch (e: any) {
      setNotice({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const live = isAnnouncementVisible(current);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <Megaphone className="w-4 h-4 text-[#1B8E44]" /> Announcement Banner (Super Admin)
        </div>
        <span
          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
            live ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {live ? 'Showing now' : 'Not showing'}
        </span>
      </div>
      <p className="text-[11px] text-slate-500">
        Shown at the top of every page, including the public reporting forms, e.g. for scheduled maintenance.
      </p>
      <textarea
        rows={2}
        maxLength={500}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="e.g. The reporting system will be unavailable on Sat 14 Nov from 22:00 to 23:00 for scheduled maintenance."
        className="w-full text-sm border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs font-bold text-slate-700">
          Type
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as AnnouncementLevel)}
            className="mt-1 w-full text-sm font-normal border border-slate-300 rounded-lg p-2"
          >
            {(Object.keys(LEVEL_STYLE) as AnnouncementLevel[]).map((l) => (
              <option key={l} value={l}>
                {LEVEL_STYLE[l].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Show until (optional)
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="mt-1 w-full text-sm font-normal border border-slate-300 rounded-lg p-2"
          />
        </label>
      </div>
      {message.trim() && (
        <div className="rounded-lg overflow-hidden border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 bg-slate-50">Preview</div>
          <div className={`${LEVEL_STYLE[level].bar} px-3 py-2 text-sm flex items-start gap-2`}>
            {LEVEL_STYLE[level].icon}
            <span className="font-semibold">{message}</span>
          </div>
        </div>
      )}
      {notice && (
        <div
          className={`p-2.5 rounded-lg text-xs border flex items-start gap-1.5 ${
            notice.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.kind === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />}
          {notice.text}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
          {live ? 'Update announcement' : 'Publish announcement'}
        </button>
        {current.active && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save(false)}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold disabled:opacity-50"
          >
            Remove announcement
          </button>
        )}
      </div>
    </div>
  );
};
