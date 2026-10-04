import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  Camera,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  Loader2,
  Eye
} from 'lucide-react';
import { ProcessedEvidenceFile, ReportingType } from '../types';
import {
  MAX_FILES_PER_REPORT,
  MAX_FILE_SIZE_BYTES,
  processEvidenceFiles,
  reindexEvidenceFiles
} from '../lib/evidence';

interface EvidenceUploadProps {
  files: ProcessedEvidenceFile[];
  onChange: (files: ProcessedEvidenceFile[]) => void;
  reporting: ReportingType;
  disabled?: boolean;
}

export const EvidenceUpload: React.FC<EvidenceUploadProps> = ({
  files,
  onChange,
  reporting,
  disabled
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProcessedEvidenceFile | null>(null);

  const isAnonymous = reporting === 'Anonymous';

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMessages([]);
    setIsProcessing(true);

    try {
      const incoming = Array.from(fileList);
      const result = await processEvidenceFiles(incoming, files.length, reporting);

      if (result.errors.length > 0) {
        setErrorMessages(result.errors);
      }

      if (result.processed.length > 0) {
        const combined = reindexEvidenceFiles([...files, ...result.processed]);
        onChange(combined);
      }
    } catch (err: any) {
      setErrorMessages([err?.message || 'Error occurred while processing files.']);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    onChange(reindexEvidenceFiles(updated));
  };

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
  const totalKb = Math.round(totalBytes / 1024);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-sm font-semibold text-slate-800">
            Attach Photos or Files
          </label>
          <p className="text-xs text-slate-500 mt-0.5">
            Maximum {MAX_FILES_PER_REPORT} files per report. Up to 600 KB per file.
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            files.length >= MAX_FILES_PER_REPORT
              ? 'bg-amber-100 text-amber-800'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {files.length} / {MAX_FILES_PER_REPORT} files
        </span>
      </div>

      {/* Anonymous Privacy Assurance Note */}
      {isAnonymous ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">Anonymous Protection Active:</strong>
            <p className="mt-0.5">
              Photos are automatically cleaned of location (GPS), camera model, and device data before sending.
              PDF attachments are disabled for anonymous submissions to prevent author name leakage.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2.5">
          <FileCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p>
            Accepted formats: JPEG, PNG, WebP, and PDF (max 600 KB each). All files are automatically assigned neutral reference names upon submission.
          </p>
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && files.length < MAX_FILES_PER_REPORT) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (!disabled) handleFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
          isDragging
            ? 'border-emerald-500 bg-emerald-50/50'
            : 'border-slate-300 hover:border-slate-400 bg-white'
        } ${disabled || files.length >= MAX_FILES_PER_REPORT ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => {
          if (!disabled && files.length < MAX_FILES_PER_REPORT && !isProcessing) {
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={isAnonymous ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'}
          multiple
          disabled={disabled || files.length >= MAX_FILES_PER_REPORT || isProcessing}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center justify-center py-4 text-slate-600">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
            <p className="text-sm font-semibold text-slate-800">Processing and sanitizing files...</p>
            <p className="text-xs text-slate-500 mt-1">
              Stripping EXIF/GPS tags, re-encoding JPEG, optimizing dimensions to ≤1600px.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <UploadCloud className="w-5 h-5 text-slate-700" />
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <Camera className="w-5 h-5 text-slate-700" />
              </div>
            </div>

            <p className="text-sm font-medium text-slate-700">
              <span className="text-emerald-700 font-bold hover:underline">Choose photos or files</span>, drag and drop, or capture on mobile
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isAnonymous
                ? 'Photos only (JPEG, PNG, WebP) • Up to 600 KB per photo'
                : 'JPEG, PNG, WebP or PDF • Up to 600 KB per file'}
            </p>
          </div>
        )}
      </div>

      {/* Error messages if any */}
      {errorMessages.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            Upload issues:
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {errorMessages.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* File List / Thumbnails */}
      {files.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
            <span>Processed Evidence Files</span>
            <span>Total size: {totalKb} KB</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {files.map((file, idx) => {
              const isPdf = file.contentType === 'application/pdf';
              const fileKb = Math.round(file.size / 1024);

              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 transition-colors"
                >
                  {/* Thumbnail / Icon */}
                  <div className="w-12 h-12 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden relative">
                    {isPdf ? (
                      <FileText className="w-6 h-6 text-rose-500" />
                    ) : (
                      <img
                        src={`data:${file.contentType};base64,${file.base64}`}
                        alt={file.name}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setPreviewFile(file)}
                      />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 font-mono truncate">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {fileKb} KB • {isPdf ? 'Document (PDF)' : 'JPEG (EXIF Stripped)'}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!isPdf && (
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
                        title="View image"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleRemove(idx)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Preview for uploaded image */}
      {previewFile && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-white rounded-xl overflow-hidden max-w-2xl w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs font-mono">
              <span>{previewFile.name} (Sanitized Evidence Preview)</span>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="text-slate-400 hover:text-white px-2 py-0.5 rounded"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-950 max-h-[75vh] overflow-auto">
              <img
                src={`data:${previewFile.contentType};base64,${previewFile.base64}`}
                alt={previewFile.name}
                className="max-h-[65vh] object-contain rounded"
              />
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600 flex justify-between items-center">
              <span>Size: {Math.round(previewFile.size / 1024)} KB</span>
              <span className="text-emerald-700 font-semibold">Metadata Stripped</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
