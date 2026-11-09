import React, { useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  AlertTriangle,
  AlertOctagon,
  Info,
  X,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  Power
} from 'lucide-react';
import {
  Announcement,
  AnnouncementLevel,
  AnnouncementStatus,
  LEVELS,
  announcementStatus,
  deleteAnnouncement,
  saveAnnouncement,
  setAnnouncementActive,
  subscribeAnnouncements
} from '../lib/announcement';

export const LEVEL_STYLE: Record<
  AnnouncementLevel,
  { bg: string; text: string; accent: string; icon: React.ReactNode; label: string; chip: string }
> = {
  critical: {
    bg: 'bg-[#DE2010]',
    text: 'text-white',
    accent: 'bg-white',
    icon: <AlertOctagon className="w-4 h-4 shrink-0" />,
    label: 'Critical (e.g. system unavailable)',
    chip: 'bg-[#DE2010] text-white'
  },
  warning: {
    bg: 'bg-[#F37C1C]',
    text: 'text-slate-950',
    accent: 'bg-slate-950',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
    label: 'Maintenance / warning',
    chip: 'bg-[#F37C1C] text-slate-950'
  },
  notice: {
    bg: 'bg-[#1E2522]',
    text: 'text-white',
    accent: 'bg-[#F37C1C]',
    icon: <Megaphone className="w-4 h-4 shrink-0 text-[#F37C1C]" />,
    label: 'Notice',
    chip: 'bg-[#1E2522] text-white'
  },
  info: {
    bg: 'bg-[#1B8E44]',
    text: 'text-white',
    accent: 'bg-white',
    icon: <Info className="w-4 h-4 shrink-0" />,
    label: 'Information',
    chip: 'bg-[#1B8E44] text-white'
  }
};

const SLIDE_SECONDS = 7;
const DISMISSED_KEY = 'za_announcements_dismissed';

function formatWhen(d: Date | null): string {
  return d ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function slideKey(a: Announcement): string {
  return `${a.id}|${a.updatedAt instanceof Date ? a.updatedAt.getTime() : ''}`;
}

/** Shown at the top of every page: slides through all live announcements, each in its colour. */
export const AnnouncementBanner: React.FC = () => {
  const [all, setAll] = useState<Announcement[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => subscribeAnnouncements(setAll), []);
  // Re-check schedules every 30 s
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const queue = useMemo(
    () =>
      all.filter(
        (a) => announcementStatus(a, now) === 'showing' && (a.level === 'critical' || !dismissed.includes(slideKey(a)))
      ),
    [all, now, dismissed]
  );

  // Keep the index valid when the queue changes
  useEffect(() => {
    if (index >= queue.length) setIndex(0);
  }, [queue.length, index]);

  // Auto-advance
  useEffect(() => {
    if (queue.length < 2 || paused) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % queue.length), SLIDE_SECONDS * 1000);
    return () => window.clearTimeout(t);
  }, [index, queue.length, paused]);

  if (queue.length === 0) return null;
  const current = queue[Math.min(index, queue.length - 1)];
  const style = LEVEL_STYLE[current.level];
  const many = queue.length > 1;

  const dismiss = (a: Announcement) => {
    const next = [...dismissed, slideKey(a)];
    setDismissed(next);
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`${style.bg} ${style.text} relative overflow-hidden transition-colors duration-700 motion-reduce:transition-none`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Announcements"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-2 px-3 sm:px-4">
        {many && (
          <button
            type="button"
            onClick={() => setIndex((i) => (i - 1 + queue.length) % queue.length)}
            className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-black/10 shrink-0"
            aria-label="Previous announcement"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Sliding track */}
        <div className="flex-1 overflow-hidden">
          <div
            className="flex transition-transform duration-700 ease-in-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${Math.min(index, queue.length - 1) * 100}%)` }}
          >
            {queue.map((a, i) => {
              const s = LEVEL_STYLE[a.level];
              return (
                <div
                  key={a.id}
                  className={`w-full shrink-0 flex items-start gap-2.5 py-2.5 text-sm ${s.text}`}
                  role={a.level === 'critical' || a.level === 'warning' ? 'alert' : 'status'}
                  aria-hidden={i !== index}
                >
                  <span className="mt-0.5">{s.icon}</span>
                  <p className="flex-1 font-semibold leading-snug whitespace-pre-wrap">
                    {a.message}
                    {a.showUntil && <span className="font-normal opacity-80"> (until {formatWhen(a.showUntil)})</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {many && (
          <>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0" aria-hidden="true">
              {queue.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  tabIndex={-1}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === index ? `w-5 ${style.accent}` : `w-1.5 ${style.accent} opacity-40 hover:opacity-70`
                  }`}
                />
              ))}
            </div>
            <span className="sm:hidden text-[10px] font-bold opacity-80 shrink-0">
              {index + 1}/{queue.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex((i) => (i + 1) % queue.length)}
              className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-black/10 shrink-0"
              aria-label="Next announcement"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        {current.level !== 'critical' && (
          <button
            type="button"
            onClick={() => dismiss(current)}
            className="p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-black/10 shrink-0"
            title="Hide this message"
            aria-label="Hide this message"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress bar for the current slide */}
      {many && !paused && (
        <div
          key={`${current.id}-${index}`}
          className={`absolute bottom-0 left-0 h-0.5 ${style.accent} opacity-50 motion-reduce:hidden`}
          style={{ animation: `za-slide-progress ${SLIDE_SECONDS}s linear forwards` }}
        />
      )}
      <style>{`@keyframes za-slide-progress { from { width: 0% } to { width: 100% } }`}</style>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Super Admin editor                                                  */
/* ------------------------------------------------------------------ */

function toLocalInput(d: Date | null): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_CHIP: Record<AnnouncementStatus, { label: string; cls: string }> = {
  showing: { label: 'Showing', cls: 'bg-emerald-100 text-emerald-800' },
  scheduled: { label: 'Scheduled', cls: 'bg-sky-100 text-sky-800' },
  ended: { label: 'Ended', cls: 'bg-slate-100 text-slate-500' },
  off: { label: 'Off', cls: 'bg-slate-100 text-slate-500' }
};

export const AnnouncementEditor: React.FC<{ currentEmail: string }> = ({ currentEmail }) => {
  const [list, setList] = useState<Announcement[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<AnnouncementLevel>('warning');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => subscribeAnnouncements(setList), []);

  const startNew = () => {
    setEditingId(null);
    setMessage('');
    setLevel('warning');
    setFrom('');
    setUntil('');
    setNotice(null);
    setFormOpen(true);
  };

  const startEdit = (a: Announcement) => {
    setEditingId(a.id);
    setMessage(a.message);
    setLevel(a.level);
    setFrom(toLocalInput(a.showFrom));
    setUntil(toLocalInput(a.showUntil));
    setNotice(null);
    setFormOpen(true);
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: 'ok', text: ok });
    } catch (e: any) {
      setNotice({ kind: 'error', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const showFrom = from ? new Date(from) : null;
    const showUntil = until ? new Date(until) : null;
    if (showUntil && showUntil <= new Date()) {
      setNotice({ kind: 'error', text: '"Show until" is in the past. Pick a later time or clear it.' });
      return;
    }
    if (showFrom && showUntil && showUntil <= showFrom) {
      setNotice({ kind: 'error', text: '"Show until" must be after "Show from".' });
      return;
    }
    await run(async () => {
      await saveAnnouncement(editingId, { active: true, message, level, showFrom, showUntil }, currentEmail);
      setFormOpen(false);
      setEditingId(null);
    }, editingId ? 'Announcement updated.' : 'Announcement published.');
  };

  const liveCount = list.filter((a) => announcementStatus(a) === 'showing').length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Megaphone className="w-4 h-4 text-[#1B8E44]" /> Announcements (Super Admin)
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Shown at the top of every page, including the public forms. Several can run at once: they slide one after another,
            most important first, each in its own colour. {liveCount > 0 && <strong>{liveCount} showing now.</strong>}
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold"
          >
            <Plus className="w-3.5 h-3.5" /> New announcement
          </button>
        )}
      </div>

      {/* Existing announcements */}
      {list.length > 0 && (
        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
          {list.map((a) => {
            const st = announcementStatus(a);
            return (
              <li key={a.id} className="p-3 flex items-start gap-3 flex-wrap">
                <span className={`mt-0.5 text-[9px] font-black uppercase px-2 py-0.5 rounded ${LEVEL_STYLE[a.level].chip}`}>{a.level}</span>
                <div className="flex-1 min-w-[180px]">
                  <p className="text-xs text-slate-800 font-semibold">{a.message}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {a.showFrom && <>From {formatWhen(a.showFrom)} </>}
                    {a.showUntil && <>until {formatWhen(a.showUntil)} </>}
                    {a.updatedBy && <>· by {a.updatedBy}</>}
                  </p>
                </div>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${STATUS_CHIP[st].cls}`}>{STATUS_CHIP[st].label}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title={a.active ? 'Switch off' : 'Switch on'}
                    disabled={busy}
                    onClick={() => run(() => setAnnouncementActive(a, !a.active, currentEmail), a.active ? 'Switched off.' : 'Switched on.')}
                    className={`p-1.5 rounded-md border ${a.active ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-400'} hover:bg-slate-50`}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" title="Edit" disabled={busy} onClick={() => startEdit(a)} className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Delete this announcement?')) run(() => deleteAnnouncement(a.id), 'Announcement deleted.');
                    }}
                    className="p-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {list.length === 0 && !formOpen && <p className="text-xs text-slate-400">No announcements yet.</p>}

      {/* New / edit form */}
      {formOpen && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-slate-600">{editingId ? 'Edit announcement' : 'New announcement'}</div>
          <textarea
            rows={2}
            maxLength={500}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. The reporting system will be unavailable on Sat 14 Nov from 22:00 to 23:00 for scheduled maintenance."
            className="w-full text-sm border border-slate-300 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40"
          />
          <div>
            <div className="text-xs font-bold text-slate-700 mb-1">Type and colour</div>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLevel(l)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition ${LEVEL_STYLE[l].chip} ${
                    level === l ? 'border-slate-900 ring-2 ring-offset-1 ring-slate-900/30' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  {LEVEL_STYLE[l].label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-700">
              Show from (optional)
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full text-sm font-normal border border-slate-300 rounded-lg p-2 bg-white" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Show until (optional)
              <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="mt-1 w-full text-sm font-normal border border-slate-300 rounded-lg p-2 bg-white" />
            </label>
          </div>
          {message.trim() && (
            <div className="rounded-lg overflow-hidden border border-slate-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 bg-white">Preview</div>
              <div className={`${LEVEL_STYLE[level].bg} ${LEVEL_STYLE[level].text} px-3 py-2 text-sm flex items-start gap-2 transition-colors duration-500`}>
                {LEVEL_STYLE[level].icon}
                <span className="font-semibold">{message}</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !message.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
              {editingId ? 'Save changes' : 'Publish'}
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="px-3.5 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-bold">
              Cancel
            </button>
          </div>
        </form>
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
    </div>
  );
};
