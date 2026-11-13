import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ScrollText, Download, Loader2, Search, FileDown, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { BaseReportData } from '../types';
import {
  AuditEntry,
  actionLabel,
  changeRows,
  describeChanges,
  fetchAuditLog,
  formatAuditTime,
  logAudit
} from '../lib/audit';
import { openCasePack } from '../lib/casePack';
import { currentActor } from '../lib/firebase';

interface Props {
  reports: BaseReportData[];
}

const AREAS: Record<string, string> = {
  all: 'All areas',
  case: 'Cases',
  account: 'User accounts',
  session: 'Sign-ins & passwords',
  settings: 'Security settings',
  announcement: 'Announcements',
  export: 'Exports',
  audit: 'Audit reviews'
};

const isoDay = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

const utcText = (d: Date) => d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');

/**
 * Audit Log page (Super Admins): every recorded action for a period, with filters, an Excel
 * export for auditors, the case audit pack, and a "record review" sign-off (ISO 27001 A.8.16).
 */
export default function AuditLogPanel({ reports }: Props) {
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 30 * 86400000)));
  const [to, setTo] = useState(isoDay(today));
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [area, setArea] = useState('all');
  const [person, setPerson] = useState('all');
  const [outcome, setOutcome] = useState<'all' | 'success' | 'failure'>('all');
  const [search, setSearch] = useState('');

  const [caseNo, setCaseNo] = useState('');
  const [packMsg, setPackMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [packBusy, setPackBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const start = new Date(`${from}T00:00:00`);
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1); // include the whole "to" day
      setEntries(await fetchAuditLog(start, end));
    } catch (e: any) {
      setError(
        e?.code === 'permission-denied'
          ? 'Permission denied. Only Super Admins can read the full audit log, and the latest security rules must be published (firebase deploy --only firestore:rules).'
          : e?.message || 'Could not load the audit log.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const people = useMemo(
    () => Array.from(new Set((entries || []).map((e) => e.actorEmail).filter(Boolean))).sort(),
    [entries]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries || []).filter(
      (e) =>
        (area === 'all' || e.targetType === area) &&
        (person === 'all' || e.actorEmail === person) &&
        (outcome === 'all' || e.outcome === outcome) &&
        (!q ||
          [e.targetId, e.actorEmail, e.summary, actionLabel(e.action), JSON.stringify(e.details)]
            .join(' ')
            .toLowerCase()
            .includes(q))
    );
  }, [entries, area, person, outcome, search]);

  const failures = shown.filter((e) => e.outcome === 'failure').length;
  const lastReview = (entries || []).find((e) => e.action === 'audit.reviewed');

  const filterText = [
    `Period: ${from} to ${to} (local time)`,
    area !== 'all' ? `Area: ${AREAS[area]}` : '',
    person !== 'all' ? `Person: ${person}` : '',
    outcome !== 'all' ? `Outcome: ${outcome}` : '',
    search.trim() ? `Search: "${search.trim()}"` : ''
  ]
    .filter(Boolean)
    .join(' · ');

  const exportExcel = async () => {
    if (!shown.length) return;
    const now = new Date();
    const rows = shown
      .slice()
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((e, i) => {
        const ch = describeChanges(e.details);
        return {
          'No.': i + 1,
          'Date & time (UTC)': utcText(e.at),
          'Date & time (local)': formatAuditTime(e.at),
          Person: e.actorEmail || '(not signed in)',
          Role: e.actorRole,
          Action: actionLabel(e.action),
          Outcome: e.outcome === 'failure' ? 'Failed' : 'Success',
          Area: AREAS[e.targetType] || e.targetType,
          'Case / item': e.targetId,
          Description: e.summary,
          Before: ch.before,
          After: ch.after,
          'Other details': ch.other,
          Device: e.device,
          'Entry ID': e.id
        };
      });
    const about = [
      ['Zambia Airways · Quality & Safety Assurance'],
      ['Safety Reporting System: audit log extract'],
      [],
      ['Generated (UTC)', utcText(now)],
      ['Generated by', currentActor()?.email || ''],
      ['Selection', filterText],
      ['Entries', rows.length],
      ['Failed actions', failures],
      [],
      ['How the log is kept'],
      ['Content (ISO/IEC 27001:2022 A.8.15)', 'Each entry records the user, their role, the action, its outcome (success/failure), the case or account affected, before and after values, the device, and the date and time.'],
      ['Integrity (A.8.15)', 'Entries can only be added. No user, including Super Admins, can edit or delete them; the database security rules refuse it. Case changes are refused unless their entry is saved with them.'],
      ['Time source (A.8.17)', 'Times are set by Google Cloud servers (UTC), not by the user’s computer.'],
      ['Access (A.5.15, A.8.3)', 'Full log: Super Admins only. Managers see only the history of individual cases.'],
      ['Review (A.8.16)', lastReview ? `Last recorded review: ${utcText(lastReview.at)} by ${lastReview.actorEmail}` : 'No review recorded in this period.'],
      ['Reporter identities', 'Never included in the log content (ICAO Annex 19). The log records who viewed an identity, not the identity itself.'],
      ['Entry ID', 'The system’s unique reference for each entry, for follow-up questions.']
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 34 }, { wch: 9 }, { wch: 18 }, { wch: 22 }, { wch: 50 }, { wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Audit log');
    const wsAbout = XLSX.utils.aoa_to_sheet(about);
    wsAbout['!cols'] = [{ wch: 34 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, wsAbout, 'About this extract');
    const filename = `ZN_QSA_Audit_Log_${from}_to_${to}.xlsx`;
    XLSX.writeFile(wb, filename);
    await logAudit('export.audit-log', 'audit', filename, `Exported ${rows.length} audit entries (${filterText})`, { entries: rows.length, selection: filterText });
  };

  const recordReview = async () => {
    const comment = window.prompt(
      `Record that you reviewed the audit log for ${from} to ${to}.\n\nFindings or comment (e.g. "No unusual activity" or what you followed up):`
    );
    if (comment === null) return;
    await logAudit('audit.reviewed', 'audit', `${from}..${to}`, `Reviewed the audit log for ${from} to ${to}`, {
      period: `${from} to ${to}`,
      entriesReviewed: shown.length,
      failedActions: failures,
      comment: comment.trim() || '(no comment)'
    });
    load();
  };

  const exportPack = async () => {
    setPackMsg(null);
    const id = caseNo.trim().toUpperCase();
    const report = reports.find((r) => r.reportId.toUpperCase() === id);
    if (!report) {
      setPackMsg({ ok: false, text: `No case ${id || '(blank)'} in the CMS. Permanently deleted cases have only their deletion record in the log.` });
      return;
    }
    setPackBusy(true);
    try {
      await openCasePack(report, 'Super Admin');
      setPackMsg({ ok: true, text: `Audit pack for ${report.reportId} opened. Choose "Save as PDF" in the print window.` });
    } catch (e: any) {
      setPackMsg({ ok: false, text: e?.message || 'Could not build the audit pack.' });
    } finally {
      setPackBusy(false);
    }
  };

  const input = 'text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="p-6 space-y-5">
      {/* Intro */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex gap-3">
        <ScrollText className="w-6 h-6 text-[#1B8E44] shrink-0" />
        <div className="text-xs text-slate-600 space-y-1">
          <p className="text-sm font-extrabold text-slate-900">Audit Log</p>
          <p>
            Every action in the CMS is recorded here: who, when (server time, UTC), what changed (before and after), on
            which case or account, from which device, and whether it succeeded. Entries cannot be edited or deleted by
            anyone. This follows ISO/IEC 27001:2022 controls A.8.15 (logging), A.8.16 (monitoring) and A.8.17 (clock
            synchronisation).
          </p>
        </div>
      </div>

      {/* Answer an audit query */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <FileDown className="w-4 h-4 text-[#F37C1C]" /> Audit query about one case
          </p>
          <p className="text-[11px] text-slate-500">
            One document with the report, its review and its full history, ready to save as PDF and send. Reporter
            identities are left out.
          </p>
          <div className="flex gap-2">
            <input value={caseNo} onChange={(e) => setCaseNo(e.target.value)} placeholder="Case number, e.g. HZ-20261112-0007" className={`${input} flex-1 font-mono`} />
            <button onClick={exportPack} disabled={packBusy} className="px-3 py-1.5 rounded-lg bg-[#0d3b1f] hover:bg-[#164a27] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
              {packBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Case audit pack
            </button>
          </div>
          {packMsg && <p className={`text-[11px] font-semibold ${packMsg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{packMsg.text}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#F37C1C]" /> Regular review (A.8.16)
          </p>
          <p className="text-[11px] text-slate-500">
            Look through the period below, then record your review. The review is itself logged and appears in exports.
          </p>
          <p className="text-[11px] text-slate-700">
            {lastReview
              ? `Last review in this period: ${formatAuditTime(lastReview.at)} by ${lastReview.actorEmail}`
              : 'No review recorded in the period shown.'}
          </p>
          <button onClick={recordReview} disabled={!entries} className="px-3 py-1.5 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            <ShieldCheck className="w-3.5 h-3.5" /> Record review of this period
          </button>
        </div>
      </div>

      {/* Period + filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="text-[11px] font-semibold text-slate-600">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} block mt-0.5`} />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} block mt-0.5`} />
          </label>
          <button onClick={load} disabled={loading} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Load period
          </button>
          <div className="flex-1" />
          <button onClick={exportExcel} disabled={!shown.length} className="px-3 py-1.5 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export {shown.length} to Excel
          </button>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <select value={area} onChange={(e) => setArea(e.target.value)} className={input}>
            {Object.entries(AREAS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={input}>
            <option value="all">Everyone</option>
            {people.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as any)} className={input}>
            <option value="all">Success and failed</option>
            <option value="success">Success only</option>
            <option value="failure">Failed only</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search case number, e-mail, words…" className={`${input} w-full pl-8`} />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          {entries ? `${shown.length} of ${entries.length} entries` : ''}
          {failures > 0 && <span className="ml-2 text-rose-700 font-semibold">{failures} failed</span>}
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Date &amp; time</th>
              <th className="text-left px-3 py-2">Person</th>
              <th className="text-left px-3 py-2">Action</th>
              <th className="text-left px-3 py-2">Case / item</th>
              <th className="text-left px-3 py-2">Details</th>
              <th className="text-left px-3 py-2">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((e) => {
              return (
                <tr key={e.id} className={e.outcome === 'failure' ? 'bg-rose-50/60' : ''}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {formatAuditTime(e.at)}
                    <div className="text-[10px] text-slate-400">{utcText(e.at)}</div>
                  </td>
                  <td className="px-3 py-2">
                    {e.actorEmail || '(not signed in)'}
                    <div className="text-[10px] text-slate-400">{[e.actorRole, e.device].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{actionLabel(e.action)}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{e.targetId}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-md">
                    {e.summary}
                    {changeRows(e.details).map((c) => (
                      <div key={c.field} className="text-[10px] text-slate-500 whitespace-pre-wrap mt-0.5">
                        <span className="font-semibold">{c.field}:</span>{' '}
                        {c.before && <span className="text-rose-700/80 line-through decoration-rose-400/60">{c.before}</span>}
                        {c.before && c.after && ' → '}
                        <span className="text-emerald-800">{c.after}</span>
                      </div>
                    ))}
                  </td>
                  <td className={`px-3 py-2 font-bold ${e.outcome === 'failure' ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {e.outcome === 'failure' ? 'Failed' : 'Success'}
                  </td>
                </tr>
              );
            })}
            {entries && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No entries match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
