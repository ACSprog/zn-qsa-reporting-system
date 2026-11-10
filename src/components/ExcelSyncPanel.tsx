import React, { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, RefreshCw, Loader2, Square, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BaseReportData, CmsRole, FormType } from '../types';
import { reportGroup } from '../lib/display';
import { restoreReportToExcel } from '../lib/restoreToExcel';

type GroupFilter = 'all' | 'hazard' | 'occurrence' | 'concern';

const GROUP_LABEL: Record<Exclude<GroupFilter, 'all'>, string> = {
  hazard: 'Hazard',
  occurrence: 'Accident / Incident',
  concern: 'Safety Concern'
};

interface Props {
  reports: BaseReportData[];
  role: CmsRole | null;
}

interface RunResult {
  reportId: string;
  ok: boolean;
  message: string;
}

/**
 * SharePoint & Excel Sync page: re-send many cases to Power Automate (restore = true:
 * the flow adds the Excel row and saves evidence, with no email) with a progress bar.
 */
export default function ExcelSyncPanel({ reports, role }: Props) {
  const canSync = role === 'officer' || role === 'manager' || role === 'superadmin';
  const [group, setGroup] = useState<GroupFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [results, setResults] = useState<RunResult[] | null>(null);
  const stopRef = useRef(false);

  const matching = useMemo(
    () =>
      reports
        .filter((r) => (includeArchived ? true : !r.deleted))
        .filter((r) => group === 'all' || reportGroup(r) === (group as FormType))
        .filter((r) => !from || (r.dateReported || '') >= from)
        .filter((r) => !to || (r.dateReported || '') <= to)
        .sort((a, b) => (a.dateReported || '').localeCompare(b.dateReported || '') || a.reportId.localeCompare(b.reportId)),
    [reports, group, from, to, includeArchived]
  );

  const chosen = matching.filter((r) => selected.has(r.reportId));
  const allTicked = matching.length > 0 && matching.every((r) => selected.has(r.reportId));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allTicked ? new Set() : new Set(matching.map((r) => r.reportId)));

  const run = async () => {
    if (chosen.length === 0) return;
    if (
      !window.confirm(
        `Send ${chosen.length} case${chosen.length === 1 ? '' : 's'} to Excel / SharePoint?\n\n` +
          'Cases already in Excel get a second row, so only send cases whose row is missing (or clear the sheet first). ' +
          'No QSA email is sent if the flow checks the "restore" flag.'
      )
    )
      return;
    stopRef.current = false;
    setRunning(true);
    setResults(null);
    const out: RunResult[] = [];
    for (let i = 0; i < chosen.length; i++) {
      if (stopRef.current) break;
      const r = chosen[i];
      setProgress({ done: i, total: chosen.length, current: r.reportId });
      const res = await restoreReportToExcel(r);
      out.push({ reportId: r.reportId, ok: res.ok, message: res.message });
      // Space the messages out so Power Automate isn't flooded
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    setProgress({ done: out.length, total: chosen.length, current: '' });
    setResults(out);
    setRunning(false);
    if (out.every((x) => x.ok)) setSelected(new Set());
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const sentOk = results?.filter((x) => x.ok).length || 0;
  const failed = results?.filter((x) => !x.ok) || [];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-black text-slate-900">Excel & SharePoint Sync</h2>
        <p className="text-xs text-slate-500">
          Re-send cases from the Firestore master record to the Excel workbook and SharePoint evidence folder.
        </p>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4 text-xs text-slate-600 leading-relaxed">
        <div className="w-11 h-11 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-[#1B8E44] shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <p>
            New submissions go to Excel automatically. Use this page when rows are missing: for example after the
            workbook was cleared, or for cases submitted before the Excel step was set up.
          </p>
          <p>
            <strong>Cases already in Excel get a duplicate row</strong>, so tick only the missing ones. Rows appear within a
            few minutes; the browser can&apos;t read the flow&apos;s reply, so check the flow&apos;s run history if one is
            missing.
          </p>
        </div>
      </div>

      {!canSync ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600">
          Viewers can&apos;t send cases to Excel. Ask a QSA Officer or Manager.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span className="font-bold text-slate-600 block">Report type</span>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as GroupFilter)}
                disabled={running}
                className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="all">All types</option>
                <option value="hazard">Hazard</option>
                <option value="occurrence">Accident / Incident</option>
                <option value="concern">Safety Concern</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-bold text-slate-600 block">Reported from</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={running} className="w-full px-2.5 py-2 rounded-lg border border-slate-300" />
            </label>
            <label className="space-y-1">
              <span className="font-bold text-slate-600 block">Reported to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={running} className="w-full px-2.5 py-2 rounded-lg border border-slate-300" />
            </label>
            <label className="flex items-center gap-2 sm:pt-5 font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} disabled={running} className="w-4 h-4 accent-[#1B8E44]" />
              Include archived cases
            </label>
          </div>

          {/* Action bar + progress */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 space-y-2.5">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-bold text-slate-800">
                {chosen.length} of {matching.length} case{matching.length === 1 ? '' : 's'} selected
              </span>
              {!running ? (
                <button
                  type="button"
                  onClick={run}
                  disabled={chosen.length === 0}
                  className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white font-bold disabled:opacity-40"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Send {chosen.length || ''} to Excel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => (stopRef.current = true)}
                  className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold"
                >
                  <Square className="w-3.5 h-3.5" /> Stop after this case
                </button>
              )}
            </div>

            {progress && (
              <div className="space-y-1">
                <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-[#1B8E44] transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    {running && <Loader2 className="w-3 h-3 animate-spin" />}
                    {running ? `Sending ${progress.done + 1} of ${progress.total}: ${progress.current}` : `Finished ${progress.done} of ${progress.total}`}
                  </span>
                  <span className="font-bold">{pct}%</span>
                </div>
              </div>
            )}

            {results && !running && (
              <div className={`text-xs rounded-lg px-3 py-2 border ${failed.length ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                <div className="flex items-center gap-1.5 font-bold">
                  {failed.length ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {sentOk} sent{failed.length ? `, ${failed.length} not sent` : ''}
                  {results.length < (progress?.total || 0) ? ` (stopped early)` : ''}
                </div>
                {failed.slice(0, 5).map((f) => (
                  <div key={f.reportId} className="mt-1">
                    {f.reportId}: {f.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Case list */}
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-700 font-extrabold uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="py-2.5 pl-4 pr-0 w-8">
                    <input type="checkbox" checked={allTicked} onChange={toggleAll} disabled={running || matching.length === 0} aria-label="Select all cases shown" className="w-4 h-4 accent-[#1B8E44]" />
                  </th>
                  <th className="py-2.5 px-3">Report ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Date reported</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matching.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      No cases match these filters.
                    </td>
                  </tr>
                ) : (
                  matching.map((r) => {
                    const res = results?.find((x) => x.reportId === r.reportId);
                    return (
                      <tr key={`${r.form}/${r.reportId}`} className={selected.has(r.reportId) ? 'bg-emerald-50/50' : ''}>
                        <td className="py-2 pl-4 pr-0">
                          <input type="checkbox" checked={selected.has(r.reportId)} onChange={() => toggle(r.reportId)} disabled={running} aria-label={`Select ${r.reportId}`} className="w-4 h-4 accent-[#1B8E44]" />
                        </td>
                        <td className="py-2 px-3 font-mono font-black text-slate-900">
                          {r.reportId}
                          {res && (res.ok ? <CheckCircle2 className="inline w-3.5 h-3.5 ml-1.5 text-emerald-600" /> : <AlertTriangle className="inline w-3.5 h-3.5 ml-1.5 text-rose-600" />)}
                        </td>
                        <td className="py-2 px-3">{GROUP_LABEL[reportGroup(r) as Exclude<GroupFilter, 'all'>] || r.form}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{r.dateReported || '-'}</td>
                        <td className="py-2 px-3 max-w-[200px] truncate" title={r.location}>{r.location || '-'}</td>
                        <td className="py-2 px-3">{r.deleted ? 'Archived' : r.status}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
