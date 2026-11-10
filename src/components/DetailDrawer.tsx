import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  Calendar,
  MapPin,
  AlertTriangle,
  FolderOpen,
  Download,
  FileText,
  User,
  Shield,
  Lock,
  EyeOff,
  Archive,
  RotateCcw,
  CheckCircle,
  ExternalLink,
  Loader2,
  Save,
  Eye,
  RefreshCw,
  Trash2,
  XCircle
} from 'lucide-react';
import {
  BaseReportData,
  ProcessedEvidenceFile,
  ReporterIdentity,
  ReportStatus,
  CmsRole,
  isManagerRole
} from '../types';
import { FORMS_META, getFormFields } from '../config/fields';
import { STATUS_OPTIONS } from '../config/options';
import {
  fetchReportEvidence,
  fetchReporterIdentity,
  updateReportMetadata,
  requestReportDeletion,
  decideDeletionRequest,
  reclassifyReport
} from '../lib/firebase';
import { isOpenUrgent, isUsableLink, reportingLabel, effectiveForm } from '../lib/display';
import { ACTIVE_FORMS, FormType } from '../types';
import { triggerFileDownload } from '../lib/evidence';
import { restoreReportToExcel } from '../lib/restoreToExcel';
import { confirmAndDeleteCase } from '../lib/caseDeletion';

interface DetailDrawerProps {
  report: BaseReportData | null;
  onClose: () => void;
  onReportUpdated: () => void;
  isQsaAdmin: boolean;
  /** viewer: read only; officer: edit + request deletion; manager: approve/archive/restore */
  role: CmsRole;
  currentUser: { uid: string; email?: string | null } | null;
}

function formatWhen(v: any): string {
  if (!v) return '';
  const d = typeof v?.toDate === 'function' ? v.toDate() : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  report,
  onClose,
  onReportUpdated,
  isQsaAdmin,
  role,
  currentUser
}) => {
  const isManager = isManagerRole(role);
  const canEdit = isManager || role === 'officer';

  const [showDeleteForm, setShowDeleteForm] = useState<boolean>(false);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [deletionBusy, setDeletionBusy] = useState<boolean>(false);
  const [deletionMessage, setDeletionMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Manager: move to the right report type (keeps the case number)
  const [showMoveForm, setShowMoveForm] = useState<boolean>(false);
  const [moveTo, setMoveTo] = useState<FormType | ''>('');
  const [moveReason, setMoveReason] = useState<string>('');
  const [moveBusy, setMoveBusy] = useState<boolean>(false);
  const [moveMessage, setMoveMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<ProcessedEvidenceFile[]>([]);
  const [loadingEvidence, setLoadingEvidence] = useState<boolean>(false);

  const [identity, setIdentity] = useState<ReporterIdentity | null>(null);
  const [identityRestricted, setIdentityRestricted] = useState<boolean>(false);
  const [loadingIdentity, setLoadingIdentity] = useState<boolean>(false);

  const [currentStatus, setCurrentStatus] = useState<ReportStatus>('New');
  const [currentNotes, setCurrentNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const [previewImage, setPreviewImage] = useState<ProcessedEvidenceFile | null>(null);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [caseIdCopied, setCaseIdCopied] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!report) return;

    setCurrentStatus(report.status || 'New');
    setCurrentNotes(report.notes || '');
    setSaveSuccess(false);
    setSyncMessage(null);
    setShowDeleteForm(false);
    setDeleteReason('');
    setDeletionMessage(null);
    setShowMoveForm(false);
    setMoveTo('');
    setMoveReason('');
    setMoveMessage(null);

    // 1. Load evidence subcollection on drawer open ONLY (per spec)
    if (report.evidenceCount > 0) {
      setLoadingEvidence(true);
      fetchReportEvidence(report.form, report.reportId)
        .then((files) => setEvidenceFiles(files))
        .finally(() => setLoadingEvidence(false));
    } else {
      setEvidenceFiles([]);
    }

    // 2. Load identity if not anonymous
    if (report.reporting === 'Anonymous') {
      setIdentity(null);
      setIdentityRestricted(false);
    } else {
      setLoadingIdentity(true);
      fetchReporterIdentity(report.reportId)
        .then((id) => {
          if (id) {
            setIdentity(id);
            setIdentityRestricted(false);
          } else {
            setIdentityRestricted(!isQsaAdmin);
          }
        })
        .catch(() => {
          setIdentityRestricted(true);
        })
        .finally(() => setLoadingIdentity(false));
    }
  }, [report, isQsaAdmin]);

  if (!report) return null;

  const meta = FORMS_META[report.form];
  const allFieldDefs = getFormFields(report.form);

  const handleSaveStatusAndNotes = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const ok = await updateReportMetadata(report.form, report.reportId, {
        status: currentStatus,
        notes: currentNotes
      });
      if (ok) {
        setSaveSuccess(true);
        onReportUpdated();
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncToExcel = async () => {
    const confirmed = window.confirm(
      `Re-send ${report.reportId} to Excel and SharePoint?\n\nIf this case is already in Excel it gets a second row, so only do this when its row is missing.`
    );
    if (!confirmed) return;
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const result = await restoreReportToExcel(report);
      setSyncMessage(result.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const pendingRequest = report.deletionRequest?.status === 'pending' ? report.deletionRequest : null;
  const currentType = effectiveForm(report);

  const handleMove = async () => {
    if (!currentUser || !moveTo) return;
    if (!window.confirm(`Move ${report.reportId} from ${FORMS_META[currentType].title} to ${FORMS_META[moveTo].title}?\nThe case number stays the same.`)) return;
    setMoveBusy(true);
    setMoveMessage(null);
    try {
      const ok = await reclassifyReport(report, moveTo, moveReason, currentUser);
      if (ok) {
        setShowMoveForm(false);
        setMoveTo('');
        setMoveReason('');
        setMoveMessage({ kind: 'ok', text: `Moved to ${FORMS_META[moveTo].title}. Case number unchanged.` });
        onReportUpdated();
      } else {
        setMoveMessage({ kind: 'error', text: 'Could not move the case. You may not have permission.' });
      }
    } finally {
      setMoveBusy(false);
    }
  };

  // Manager only: archive or restore directly
  const handleToggleArchive = async () => {
    const nextDeleted = !report.deleted;
    if (
      !window.confirm(
        nextDeleted
          ? `Archive ${report.reportId}? It will be hidden from the inbox but kept, and can be restored.`
          : `Restore ${report.reportId} to the inbox?`
      )
    )
      return;
    const ok = await updateReportMetadata(report.form, report.reportId, {
      deleted: nextDeleted
    });
    if (ok) {
      onReportUpdated();
      onClose();
    } else {
      setDeletionMessage({ kind: 'error', text: 'Could not update the report. You may not have permission.' });
    }
  };

  // Super Admin: delete the case for good
  const handlePermanentDelete = async () => {
    if (!currentUser) return;
    try {
      if (await confirmAndDeleteCase(report, currentUser)) {
        onReportUpdated();
        onClose();
      }
    } catch (e: any) {
      setDeletionMessage({ kind: 'error', text: e.message });
    }
  };

  // Officer: ask a Manager to delete
  const handleRequestDeletion = async () => {
    if (!currentUser) return;
    setDeletionBusy(true);
    setDeletionMessage(null);
    try {
      const res = await requestReportDeletion(report, deleteReason, currentUser);
      if (res.ok) {
        setShowDeleteForm(false);
        setDeleteReason('');
        setDeletionMessage({ kind: 'ok', text: 'Deletion request sent. A Manager must approve it before the report is removed.' });
        onReportUpdated();
      } else {
        setDeletionMessage({ kind: 'error', text: res.error || 'Could not send the request.' });
      }
    } finally {
      setDeletionBusy(false);
    }
  };

  // Manager: approve (archive) or reject
  const handleDecide = async (approve: boolean) => {
    if (!currentUser) return;
    if (
      !window.confirm(
        approve
          ? `Approve deletion of ${report.reportId}? It will be archived (hidden from the inbox, restorable by a Manager).`
          : `Reject the deletion request for ${report.reportId}? The report stays in the inbox.`
      )
    )
      return;
    setDeletionBusy(true);
    setDeletionMessage(null);
    try {
      const ok = await decideDeletionRequest(report, approve, currentUser);
      if (ok) {
        onReportUpdated();
        if (approve) onClose();
        else setDeletionMessage({ kind: 'ok', text: 'Deletion request rejected.' });
      } else {
        setDeletionMessage({ kind: 'error', text: 'Could not save the decision. You may not have permission.' });
      }
    } finally {
      setDeletionBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="bg-[#0d3b1f] text-white p-5 flex items-center justify-between shrink-0 border-b border-[#1b8e44]/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black text-[#F37C1C]">
                {report.reportId}
              </span>
              {isOpenUrgent(report) && (
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#DE2010] text-white animate-pulse">
                  Urgent
                </span>
              )}
              {report.deleted && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-600 text-white">
                  Archived
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-white mt-1">
              {FORMS_META[effectiveForm(report)].title} Details
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-emerald-200 hover:text-white rounded-lg hover:bg-[#14522a] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Deletion request / decision */}
          {pendingRequest && (
            <div className="border border-rose-200 bg-rose-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-rose-800">
                <Trash2 className="w-4 h-4" /> Deletion requested
              </div>
              <p className="text-xs text-rose-900">
                <strong>{pendingRequest.requestedByEmail || pendingRequest.requestedBy}</strong>
                {formatWhen(pendingRequest.requestedAt) && <> on {formatWhen(pendingRequest.requestedAt)}</>}
              </p>
              <p className="text-xs text-rose-900 whitespace-pre-wrap bg-white/70 border border-rose-100 rounded-lg p-2.5">
                {pendingRequest.reason}
              </p>
              {isManager ? (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={deletionBusy}
                    onClick={() => handleDecide(true)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {deletionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Approve &amp; archive
                  </button>
                  <button
                    type="button"
                    disabled={deletionBusy}
                    onClick={() => handleDecide(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-rose-700">Awaiting a Manager's approval.</p>
              )}
            </div>
          )}

          {!pendingRequest && report.deletionRequest?.status === 'rejected' && (
            <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 text-[11px] text-slate-600">
              A deletion request by {report.deletionRequest.requestedByEmail || 'an officer'} was rejected by{' '}
              {report.deletionRequest.decidedByEmail || 'a Manager'}
              {formatWhen(report.deletionRequest.decidedAt) && <> on {formatWhen(report.deletionRequest.decidedAt)}</>}.
            </div>
          )}

          {report.deleted && report.deletionRequest?.status === 'approved' && (
            <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 text-[11px] text-slate-600">
              Archived after a deletion request by {report.deletionRequest.requestedByEmail || 'an officer'}, approved by{' '}
              {report.deletionRequest.decidedByEmail || 'a Manager'}
              {formatWhen(report.deletionRequest.decidedAt) && <> on {formatWhen(report.deletionRequest.decidedAt)}</>}.
              Reason: {report.deletionRequest.reason}
            </div>
          )}

          {deletionMessage && (
            <div
              className={`p-3 rounded-xl text-xs border ${
                deletionMessage.kind === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {deletionMessage.text}
            </div>
          )}

          {/* Report type (Managers can move a case submitted under the wrong type) */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold uppercase tracking-wider text-slate-500">Case number: </span>
                  <span className="font-mono font-black text-slate-900 text-sm">{report.reportId}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(report.reportId).then(
                        () => {
                          setCaseIdCopied(true);
                          setTimeout(() => setCaseIdCopied(false), 1500);
                        },
                        () => undefined
                      );
                    }}
                    title="Copy the case number"
                    className="text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                  >
                    {caseIdCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div>
                  <span className="font-bold uppercase tracking-wider text-slate-500">Report type: </span>
                  <span className="font-black text-slate-900">{FORMS_META[currentType].title}</span>
                </div>
              </div>
              {isManager && !report.deleted && !showMoveForm && (
                <button
                  type="button"
                  onClick={() => setShowMoveForm(true)}
                  className="text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Change type
                </button>
              )}
            </div>
            {report.reclassification && (
              <p className="text-[11px] text-slate-500">
                Moved from {FORMS_META[report.reclassification.from]?.title || report.reclassification.from} by{' '}
                {report.reclassification.byEmail || 'a Manager'}
                {formatWhen(report.reclassification.at) && <> on {formatWhen(report.reclassification.at)}</>}
                {report.reclassification.reason ? <>: {report.reclassification.reason}</> : '.'} The answers below are from the
                original {FORMS_META[report.form].title} form.
              </p>
            )}
            {showMoveForm && (
              <div className="space-y-2 pt-1">
                <select
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value as FormType)}
                  className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2"
                >
                  <option value="">Move to...</option>
                  {ACTIVE_FORMS.filter((f) => f !== currentType).map((f) => (
                    <option key={f} value={f}>
                      {FORMS_META[f].title}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  maxLength={500}
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="Reason (optional), e.g. reporter chose Hazard but an incident occurred"
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!moveTo || moveBusy}
                    onClick={handleMove}
                    className="px-3 py-1.5 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {moveBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Move case
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMoveForm(false)}
                    className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {moveMessage && (
              <p className={`text-[11px] ${moveMessage.kind === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>{moveMessage.text}</p>
            )}
          </div>

          {/* Status & Review Controls */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                QSA Review & Status
              </h3>
              {saveSuccess && (
                <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Saved
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Investigation Status
                </label>
                <select
                  value={currentStatus}
                  disabled={!canEdit}
                  onChange={(e) => setCurrentStatus(e.target.value as ReportStatus)}
                  className="disabled:opacity-70 disabled:cursor-not-allowed w-full text-sm font-semibold bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                {canEdit ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveStatusAndNotes}
                  className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Review Updates</span>
                </button>
                ) : (
                  <span className="text-[11px] text-slate-500 flex items-center gap-1.5 pb-2">
                    <Eye className="w-3.5 h-3.5" /> View-only access
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Internal QSA Notes
              </label>
              <textarea
                rows={2}
                readOnly={!canEdit}
                value={currentNotes}
                onChange={(e) => setCurrentNotes(e.target.value)}
                placeholder="Enter investigation notes, assigned action items or safety board references..."
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Reporter Identity (Access Controlled) */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-500" />
                Reporter Identity ({reportingLabel(report.reporting)})
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Mode: {reportingLabel(report.reporting)}
              </span>
            </div>

            {report.reporting === 'Anonymous' ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Submitted Anonymously • No reporter identity or personal metadata recorded.</span>
              </div>
            ) : identityRestricted ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Restricted to authorized QSA Administrators.</span>
              </div>
            ) : loadingIdentity ? (
              <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading identity details...
              </div>
            ) : identity ? (
              <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                <div>
                  <span className="text-slate-400 block">Name:</span>
                  <span className="font-semibold text-slate-800">{identity.name || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Department:</span>
                  <span className="font-semibold text-slate-800">{identity.department || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Position / Role:</span>
                  <span className="font-semibold text-slate-800">{identity.position || '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Contact:</span>
                  <span className="font-semibold text-slate-800">{identity.contact || '—'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block">Email for updates:</span>
                  {identity.email ? (
                    <a href={`mailto:${identity.email}?subject=${encodeURIComponent(`Your safety report ${report.reportId}`)}`} className="font-semibold text-[#1B8E44] hover:underline break-all">
                      {identity.email}
                    </a>
                  ) : (
                    <span className="font-semibold text-slate-800">—</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">No identity document on file.</div>
            )}
          </div>

          {/* Evidence Attachments Section */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FolderOpen className="w-4 h-4 text-slate-500" />
                Evidence Attachments ({report.evidenceCount || 0})
              </span>

              {isUsableLink(report.evidenceFolder) && (
                <a
                  href={report.evidenceFolder}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open in SharePoint
                </a>
              )}
            </div>

            {loadingEvidence ? (
              <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> Loading files from Firestore...
              </div>
            ) : evidenceFiles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {evidenceFiles.map((file, idx) => {
                  const isPdf = file.contentType === 'application/pdf';
                  const sizeKb = Math.round(file.size / 1024);
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isPdf ? (
                          <FileText className="w-6 h-6 text-rose-500 shrink-0" />
                        ) : (
                          <div
                            onClick={() => setPreviewImage(file)}
                            className="w-8 h-8 rounded bg-white border border-slate-200 overflow-hidden cursor-pointer shrink-0"
                          >
                            <img
                              src={`data:${file.contentType};base64,${file.base64}`}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 font-mono truncate">
                            {file.name}
                          </p>
                          <p className="text-[10px] text-slate-500">{sizeKb} KB</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {!isPdf && (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(file)}
                            className="p-1 text-slate-500 hover:text-slate-800 rounded"
                            title="View enlarged"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => triggerFileDownload(file.base64, file.contentType, file.name)}
                          className="p-1 text-emerald-600 hover:text-emerald-800 rounded hover:bg-emerald-50"
                          title="Download file"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No evidence files attached to this report.</p>
            )}
          </div>

          {/* Form Fields Data Grid */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200 pb-2">
              All Submitted Fields
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-400 block">Date Reported</span>
                <span className="font-semibold text-slate-800">{report.dateReported || '—'}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-400 block">Date / Time of Event</span>
                <span className="font-semibold text-slate-800">
                  {report.eventDate} {report.eventTime ? `at ${report.eventTime}` : ''}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 sm:col-span-2">
                <span className="text-slate-400 block">Location / Station</span>
                <span className="font-semibold text-slate-800">{report.location}</span>
              </div>
              {/* No longer asked on the forms: only shown for older reports that have them */}
              {(report.flightNo || report.aircraftReg || report.aircraftType) && (
                <>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block">Flight No.</span>
                    <span className="font-semibold text-slate-800">{report.flightNo || '—'}</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className="text-slate-400 block">Aircraft Reg & Type</span>
                    <span className="font-semibold text-slate-800">
                      {report.aircraftReg || '—'} {report.aircraftType ? `(${report.aircraftType})` : ''}
                    </span>
                  </div>
                </>
              )}
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-400 block">Urgent Attention?</span>
                <span className={`font-bold ${report.urgent === 'Yes' ? 'text-rose-600' : 'text-slate-800'}`}>
                  {report.urgent}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-400 block">Exposed to Immediate Risk?</span>
                <span className={`font-bold ${report.exposedToRisk === 'Yes' ? 'text-rose-600' : 'text-slate-800'}`}>
                  {report.exposedToRisk}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-400 block">Notified at time?</span>
                <span className="font-semibold text-slate-800">{report.notified}</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <span className="text-slate-400 block">Notified Whom?</span>
                <span className="font-semibold text-slate-800">{report.notifiedWho || '—'}</span>
              </div>
            </div>

            {/* Form Specific Detailed Narrative Fields */}
            <div className="space-y-3 pt-2">
              {allFieldDefs
                .filter((f) => f.section === 2 && f.key !== 'evidence')
                .map((field) => {
                  const val = report[field.key];
                  if (!val) return null;
                  return (
                    <div key={field.key} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                      <span className="font-bold text-slate-700 block mb-1">
                        {field.label}
                      </span>
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {val}
                      </p>
                    </div>
                  );
                })}

              {report.evidence && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                  <span className="font-bold text-slate-700 block mb-1">
                    Supporting evidence / attachment reference (notes)
                  </span>
                  <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {report.evidence}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sync to Excel */}
        {canEdit && (
        <div className="px-4 py-3 border-t border-slate-200 bg-white shrink-0 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 leading-snug">
            {syncMessage ??
              'Re-send this report to Excel and SharePoint if its row or files are missing. For many cases, use the SharePoint & Excel Sync page.'}
          </p>
          <button
            type="button"
            onClick={handleSyncToExcel}
            disabled={isSyncing}
            className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {isSyncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sync to Excel</span>
          </button>
        </div>
        )}

        {/* Drawer Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex-1 mr-3">
            {isManager && !pendingRequest && (
              <button
                type="button"
                onClick={handleToggleArchive}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
              >
                {report.deleted ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Restore from Archive</span>
                  </>
                ) : (
                  <>
                    <Archive className="w-3.5 h-3.5 text-amber-600" />
                    <span>Archive Report</span>
                  </>
                )}
              </button>
            )}

            {role === 'superadmin' && (
              <button
                type="button"
                onClick={handlePermanentDelete}
                title="Delete this case, its evidence and the reporter's details for good"
                className="mt-2 text-xs font-semibold px-3 py-1.5 rounded border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete permanently</span>
              </button>
            )}

            {role === 'officer' && !report.deleted && !pendingRequest && !showDeleteForm && (
              <button
                type="button"
                onClick={() => setShowDeleteForm(true)}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Request Deletion</span>
              </button>
            )}

            {role === 'officer' && showDeleteForm && (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Why should this report be deleted? (e.g. duplicate of HAZ-..., test submission)"
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-rose-400"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deletionBusy || !deleteReason.trim()}
                    onClick={handleRequestDeletion}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {deletionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Send for approval
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteForm(false);
                      setDeleteReason('');
                    }}
                    className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>

      {/* Enlarged Photo Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-xl overflow-hidden max-w-3xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-slate-900 text-white flex justify-between items-center text-xs font-mono">
              <span>{previewImage.name}</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-white px-2 py-0.5"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={`data:${previewImage.contentType};base64,${previewImage.base64}`}
                alt={previewImage.name}
                className="max-h-[70vh] object-contain rounded"
              />
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
              <span className="text-slate-600">Size: {Math.round(previewImage.size / 1024)} KB</span>
              <button
                type="button"
                onClick={() => triggerFileDownload(previewImage.base64, previewImage.contentType, previewImage.name)}
                className="px-3 py-1 bg-emerald-600 text-white font-semibold rounded hover:bg-emerald-700 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
