import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ShieldAlert,
  FolderSync
} from 'lucide-react';
import { SyncSummary } from '../types';
import { executeExcelSync } from '../lib/syncToExcel';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [confirmRealSync, setConfirmRealSync] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleRun = async (preview: boolean) => {
    setIsRunning(true);
    setSyncError(null);
    setProgressMsg(preview ? 'Initializing dry run preview...' : 'Starting live synchronization...');
    setConfirmRealSync(false);

    try {
      const result = await executeExcelSync(preview, (msg) => {
        setProgressMsg(msg);
      });
      setSummary(result);
    } catch (err: any) {
      setSyncError(err?.message || 'Failed to complete synchronization.');
    } finally {
      setIsRunning(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#0d3b1f] text-white p-5 flex items-center justify-between border-b border-[#1b8e44]/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1b8e44]/30 border border-[#F37C1C]/40 flex items-center justify-center text-[#F37C1C]">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Sync to Excel & SharePoint
              </h2>
              <p className="text-xs text-emerald-200">
                Restores missing table rows and evidence files from Firestore master
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Explanation Box */}
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-4 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-1">
              Two-Phase Reconciliation Process:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Phase 1 (Excel Rows):</strong> Compares Firestore documents with the Excel tables (<code>tblHazard</code>, <code>tblIncident</code>, <code>tblAccident</code>, <code>tblConcern</code>) and appends missing rows in 200-item chunks.
              </li>
              <li>
                <strong>Phase 2 (SharePoint Evidence):</strong> Scans the <code>/Safety Evidence/{'{reportId}'}</code> SharePoint folders and restores any missing evidence files directly from the database.
              </li>
              <li>
                Restored rows never trigger duplicate email alerts. Confidentiality and anonymity rules are preserved.
              </li>
            </ul>
          </div>

          {/* Real Sync Confirmation Warning */}
          {confirmRealSync && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Confirm Live Synchronization
                  </h4>
                  <p className="text-xs text-amber-800 mt-1">
                    This operation writes directly to your organization's Microsoft 365 Excel workbook and SharePoint library. Are you sure you want to proceed?
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmRealSync(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleRun(false)}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
                >
                  Confirm & Sync Now
                </button>
              </div>
            </div>
          )}

          {/* Running Progress State */}
          {isRunning && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <div className="text-sm font-bold text-slate-900">
                Synchronization in Progress
              </div>
              <p className="text-xs font-mono text-emerald-800">
                {progressMsg}
              </p>
            </div>
          )}

          {/* Error Banner */}
          {syncError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">Synchronization failed:</strong>
                <p className="mt-0.5">{syncError}</p>
                <p className="mt-1 text-[11px] text-rose-600">
                  Verify that your Azure AD App Registration (<code>VITE_MSAL_CLIENT_ID</code>) and permissions (<code>Files.ReadWrite.All</code>) are configured.
                </p>
              </div>
            </div>
          )}

          {/* Results Summary Panel */}
          {summary && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  {summary.isPreview ? 'Dry Run Preview Results' : 'Synchronization Results'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {new Date(summary.timestamp).toLocaleTimeString()}
                </span>
              </div>

              {/* Table per form */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Form / Table</th>
                      <th className="py-2.5 px-2 text-center">In Firestore</th>
                      <th className="py-2.5 px-2 text-center">In Excel</th>
                      <th className="py-2.5 px-2 text-center">Missing</th>
                      <th className="py-2.5 px-2 text-center">
                        {summary.isPreview ? 'Will Add' : 'Rows Added'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {summary.forms.map((f) => (
                      <tr key={f.form} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-semibold text-slate-900">
                          {f.tableName}
                        </td>
                        <td className="py-2 px-2 text-center">{f.inFirestore}</td>
                        <td className="py-2 px-2 text-center">{f.inExcel}</td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`font-semibold ${
                              f.missingInExcel > 0 ? 'text-amber-600' : 'text-slate-500'
                            }`}
                          >
                            {f.missingInExcel}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center font-bold text-emerald-700">
                          {summary.isPreview ? f.missingInExcel : f.rowsAdded}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Evidence Recovery Results */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-xs text-slate-700">
                <div className="flex items-center gap-2">
                  <FolderSync className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold">SharePoint Evidence Files:</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Checked: <strong>{summary.evidence.checked}</strong></span>
                  <span>Missing: <strong className="text-amber-600">{summary.evidence.missing}</strong></span>
                  <span>Restored: <strong className="text-emerald-700">{summary.evidence.restored}</strong></span>
                </div>
              </div>

              {/* Any Errors logged */}
              {summary.forms.some((f) => f.errors && f.errors.length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                  <span className="font-bold block">Noted Warnings:</span>
                  <ul className="list-disc pl-5">
                    {summary.forms
                      .flatMap((f) => f.errors || [])
                      .map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            disabled={isRunning}
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Close
          </button>

          <div className="flex items-center gap-2.5">
            {/* Preview (Dry Run) Button */}
            <button
              type="button"
              disabled={isRunning || confirmRealSync}
              onClick={() => handleRun(true)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-white text-xs font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>

            {/* Sync to Excel Button */}
            <button
              type="button"
              disabled={isRunning || confirmRealSync}
              onClick={() => setConfirmRealSync(true)}
              className="px-5 py-2 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#F37C1C]" />
              <span>Sync to Excel</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
