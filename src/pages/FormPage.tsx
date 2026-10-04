import React, { useState } from 'react';
import { ArrowLeft, Home, ChevronRight } from 'lucide-react';
import { FormType, ReportingType } from '../types';
import { FORMS_META } from '../config/fields';
import { FormRenderer } from '../components/FormRenderer';
import { ConfirmationScreen } from '../components/ConfirmationScreen';

interface FormPageProps {
  form: FormType;
  onGoHome: () => void;
  onSelectForm: (f: FormType) => void;
}

export const FormPage: React.FC<FormPageProps> = ({ form, onGoHome, onSelectForm }) => {
  const meta = FORMS_META[form];

  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const [submittedReporting, setSubmittedReporting] = useState<ReportingType>('Named');

  const handleSuccess = (reportId: string, reporting: ReportingType) => {
    setSubmittedReportId(reportId);
    setSubmittedReporting(reporting);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleResetForNewReport = () => {
    setSubmittedReportId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (submittedReportId) {
    return (
      <ConfirmationScreen
        reportId={submittedReportId}
        reporting={submittedReporting}
        onNewReport={handleResetForNewReport}
        onGoHome={onGoHome}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onGoHome}
            className="hover:text-slate-800 transition-colors flex items-center gap-1 font-medium"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-800">{meta.title}</span>
        </div>

        <button
          onClick={onGoHome}
          className="hover:text-slate-800 transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Categories</span>
        </button>
      </div>

      {/* Render Form */}
      <FormRenderer
        form={form}
        onSuccess={handleSuccess}
        onCancel={onGoHome}
      />
    </div>
  );
};
