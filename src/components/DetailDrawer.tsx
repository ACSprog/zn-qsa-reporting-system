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
  Eye
} from 'lucide-react';
import {
  BaseReportData,
  ProcessedEvidenceFile,
  ReporterIdentity,
  ReportStatus
} from '../types';
import { FORMS_META, getFormFields } from '../config/fields';
import { STATUS_OPTIONS } from '../config/options';
import {
  fetchReportEvidence,
  fetchReporterIdentity,
  updateReportMetadata
} from '../lib/firebase';
import { triggerFileDownload } from '../lib/evidence';

interface DetailDrawerProps {
  report: BaseReportData | null;
  onClose: () => void;
  onReportUpdated: () => void;
  isQsaAdmin: boolean;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  report,
  onClose,
  onReportUpdated,
  isQsaAdmin
}) => {
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

  useEffect(() => {
    if (!report) return;

    setCurrentStatus(report.status || 'New');
    setCurrentNotes(report.notes || '');
    setSaveSuccess(false);

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

  const handleToggleArchive = async () => {
    const nextDeleted = !report.deleted;
    const ok = await updateReportMetadata(report.form, report.reportId, {
      deleted: nextDeleted
    });
    if (ok) {
      onReportUpdated();
      onClose();
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
              {report.urgent === 'Yes' && (
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
              {meta.title} Details
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
                  onChange={(e) => setCurrentStatus(e.target.value as ReportStatus)}
                  className="w-full text-sm font-semibold bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveStatusAndNotes}
                  className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Review Updates</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Internal QSA Notes
              </label>
              <textarea
                rows={2}
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
                Reporter Identity ({report.reporting})
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Mode: {report.reporting}
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

              {report.evidenceFolder && (
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

        {/* Drawer Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
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
