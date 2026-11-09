import React, { useState, useId } from 'react';
import {
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Lock,
  EyeOff,
  UserCheck,
  Send,
  Loader2
} from 'lucide-react';
import {
  FormType,
  ReportingType,
  ProcessedEvidenceFile
} from '../types';
import {
  FORMS_META,
  getFormFields,
  isFieldVisible
} from '../config/fields';
import { REPORTING_TYPES } from '../config/options';
import { generateReportId, stripIdentityIfAnonymous } from '../lib/idGenerator';
import { EvidenceUpload } from './EvidenceUpload';
import { isValidEmail, sendCaseReceipt } from '../lib/receipts';

export interface CaseReceipt {
  email: string;
  /** false when the email flow isn't set up yet */
  sent: boolean;
}
import { submitSafetyReport } from '../lib/firebase';
import { ZambiaAirwaysLogo } from './ZambiaAirwaysLogo';

interface FormRendererProps {
  form: FormType;
  onSuccess: (reportId: string, reporting: ReportingType, receipt?: CaseReceipt) => void;
  onCancel: () => void;
}

export const FormRenderer: React.FC<FormRendererProps> = ({
  form,
  onSuccess,
  onCancel
}) => {
  const meta = FORMS_META[form];
  const honeypotId = useId();

  // Automatic readonly Report ID and Date
  const [reportId] = useState<string>(() => generateReportId(form));
  const [dateReported] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Form State
  const [reporting, setReporting] = useState<ReportingType>('Named');
  const [formData, setFormData] = useState<Record<string, any>>({
    reporting: 'Named',
    name: '',
    department: '',
    position: '',
    contact: '',
    eventDate: new Date().toISOString().split('T')[0],
    eventTime: '',
    location: '',
    urgent: 'No',
    exposedToRisk: 'No',
    notified: 'No'
  });

  const [evidenceFiles, setEvidenceFiles] = useState<ProcessedEvidenceFile[]>([]);
  const [honeypot, setHoneypot] = useState<string>(''); // Bot detection trap
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Optional address for the case number. Kept out of formData so it is never saved with the report.
  const [receiptEmail, setReceiptEmail] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Handle Reporting type switch with strict state clearance for Anonymous
  const handleReportingChange = (newReporting: ReportingType) => {
    setReporting(newReporting);
    if (newReporting === 'Anonymous') {
      // Identity fields must disappear and be cleared immediately from state
      setFormData((prev) => ({
        ...prev,
        reporting: 'Anonymous',
        name: '',
        department: '',
        position: '',
        contact: ''
      }));
      // Filter out any existing PDFs from evidence files
      setEvidenceFiles((prev) => prev.filter((f) => f.contentType !== 'application/pdf'));
    } else {
      setFormData((prev) => ({
        ...prev,
        reporting: newReporting
      }));
    }
  };

  const handleInputChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate identity if NOT anonymous
    if (reporting !== 'Anonymous') {
      if (!formData.name || !formData.name.trim()) {
        newErrors.name = 'Reporter Name is required for Open and Confidential reports.';
      }
    }

    // Validate common section 1 fields
    if (!formData.eventDate) {
      newErrors.eventDate = 'Date of Event / Observation is required.';
    }
    if (!formData.location || !formData.location.trim()) {
      newErrors.location = 'Location / Station is required.';
    }

    // Validate common section 3 fields
    if (!formData.urgent) {
      newErrors.urgent = 'Please indicate if this requires urgent attention.';
    }
    if (!formData.exposedToRisk) {
      newErrors.exposedToRisk = 'Please indicate if anyone is currently exposed to immediate risk.';
    }
    if (!formData.notified) {
      newErrors.notified = 'Please specify if you notified anyone at the time.';
    }
    if (receiptEmail.trim() && !isValidEmail(receiptEmail)) {
      newErrors.receiptEmail = 'Check the email address, or leave it blank.';
    }

    // Validate form specific fields
    const allFields = getFormFields(form);
    for (const field of allFields) {
      if (field.section === 2 && field.required && isFieldVisible(field, formData)) {
        const val = formData[field.key];
        if (val === undefined || val === null || String(val).trim() === '') {
          newErrors[field.key] = `${field.label} is required.`;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Bot trap check: if honeypot filled, silently pretend success.
    // Logged so a real user hit by browser autofill can be diagnosed from the console.
    if (honeypot.trim()) {
      console.warn('[SafetyReport] Bot-trap field was filled; report was NOT saved.');
      onSuccess(reportId, reporting);
      return;
    }

    if (!validateForm()) {
      const firstErrorKey = Object.keys(errors)[0];
      if (firstErrorKey) {
        const el = document.getElementById(`field-${firstErrorKey}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsSubmitting(true);

    try {
      // Drop answers to questions that no longer apply (e.g. injury details after switching to "No")
      const visibleData: Record<string, any> = { ...formData };
      for (const f of getFormFields(form)) {
        if (!isFieldVisible(f, formData)) delete visibleData[f.key];
      }
      // Double guarantee: strip identity if anonymous
      const payloadData = stripIdentityIfAnonymous(
        {
          ...visibleData,
          reporting
        },
        reporting
      );

      const result = await submitSafetyReport(form, reportId, payloadData, evidenceFiles);

      if (result.success) {
        const email = receiptEmail.trim();
        const receipt: CaseReceipt | undefined = email
          ? { email, sent: sendCaseReceipt(email, reportId, form, reporting) }
          : undefined;
        onSuccess(reportId, reporting, receipt);
      } else {
        setSubmitError(result.error || 'Failed to submit report. Please try again.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'An unexpected error occurred while saving the report.');
      setIsSubmitting(false);
    }
  };

  // Extract form-specific fields for Section 2
  const section2Fields = getFormFields(form).filter((f) => f.section === 2 && isFieldVisible(f, formData));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      {/* Paper-form style Header Card with Zambia Airways Livery */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        {/* Top Flag Ribbon */}
        <div className="h-1.5 w-full flex">
          <div className="flex-1 bg-[#1B8E44]" />
          <div className="w-16 bg-[#DE2010]" />
          <div className="w-16 bg-[#1E2522]" />
          <div className="w-20 bg-[#F37C1C]" />
        </div>

        <div className="bg-gradient-to-r from-[#0d3b1f] to-[#124b27] text-white p-5 sm:p-6 border-b border-[#1b8e44]/40">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="mb-2">
                <ZambiaAirwaysLogo variant="full" theme="dark" size="sm" showSubtitle={false} />
              </div>

              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-[#F37C1C] uppercase tracking-widest">
                  Official Safety Reporting Form
                </span>
                <span className="text-white/40">•</span>
                <span className="text-xs text-emerald-200 font-medium">QSA Safety Document</span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                {meta.title}
              </h1>
              <p className="text-xs sm:text-sm text-emerald-100/90 mt-1 max-w-2xl leading-relaxed">
                {meta.useWhen}
              </p>
            </div>

            {/* Read-Only Automatic Metadata */}
            <div className="bg-[#082614] rounded-xl p-3 sm:text-right border border-[#1b8e44]/60 shrink-0 shadow-inner">
              <div className="text-[11px] text-emerald-300 font-mono uppercase tracking-wider">
                System Report ID
              </div>
              <div className="text-sm sm:text-base font-extrabold font-mono text-[#F37C1C]">
                {reportId}
              </div>
              <div className="text-[11px] text-emerald-200/80 font-mono mt-1">
                Date: <span className="text-white font-semibold">{dateReported}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Error Alert if submission fails */}
        {submitError && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 text-sm text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Submission failed:</strong> {submitError}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-10">
          {/* Honeypot field */}
          {/* Name and autocomplete chosen so browser/password-manager autofill never fills it
              (the old name contained "company", which Chrome autofills from saved addresses). */}
          <div className="opacity-0 absolute -left-[9999px]" aria-hidden="true">
            <label htmlFor={honeypotId}>Leave this field blank</label>
            <input
              id={honeypotId}
              type="text"
              name="za_hp_check"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              autoComplete="one-time-code"
              tabIndex={-1}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
            />
          </div>

          {/* ======================================================== */}
          {/* SECTION 1: BASIC INFORMATION */}
          {/* ======================================================== */}
          <section className="space-y-6">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-md bg-[#1B8E44] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  1
                </span>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Basic Information & Reporter Identity
                </h2>
              </div>
              <span className="text-xs text-slate-500 italic">* required fields</span>
            </div>

            {/* Reporting Type Selector */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 sm:p-5">
              <label className="block text-sm font-bold text-slate-800 mb-2">
                Reporting Method <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {REPORTING_TYPES.map((type) => {
                  const isSelected = reporting === type.value;
                  return (
                    <label
                      key={type.value}
                      className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        isSelected
                          ? type.value === 'Anonymous'
                            ? 'border-[#1B8E44] bg-emerald-50/50 shadow-sm'
                            : type.value === 'Confidential'
                            ? 'border-[#F37C1C] bg-orange-50/50 shadow-sm'
                            : 'border-slate-800 bg-slate-50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="reporting"
                            value={type.value}
                            checked={isSelected}
                            onChange={() => handleReportingChange(type.value as ReportingType)}
                            className="w-4 h-4 text-[#1B8E44] focus:ring-[#1B8E44] border-slate-300"
                          />
                          <span className="text-sm font-bold text-slate-900">
                            {type.label}
                          </span>
                        </div>
                        {type.value === 'Named' && <UserCheck className="w-4 h-4 text-slate-400" />}
                        {type.value === 'Confidential' && <Lock className="w-4 h-4 text-[#F37C1C]" />}
                        {type.value === 'Anonymous' && <EyeOff className="w-4 h-4 text-[#1B8E44]" />}
                      </div>
                      <p className="text-xs text-slate-500 pl-6 leading-relaxed">
                        {type.description}
                      </p>
                    </label>
                  );
                })}
              </div>

              {/* Note banner under Reporting choice */}
              <div className="mt-3 text-xs text-slate-600 flex items-center gap-1.5 pl-1">
                <HelpCircle className="w-3.5 h-3.5 text-[#F37C1C]" />
                <span className="font-medium">
                  {reporting === 'Named' && 'Your details are recorded with the report.'}
                  {reporting === 'Confidential' && 'Your details are recorded but restricted to QSA.'}
                  {reporting === 'Anonymous' && 'No personal details are collected.'}
                </span>
              </div>
            </div>

            {/* Reporter Identity Fields: Disappear entirely when Anonymous */}
            {reporting !== 'Anonymous' ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-bold text-slate-800">
                    Reporter Contact Details ({reporting})
                  </h3>
                  <span className="text-xs text-slate-500">
                    Name is mandatory for {reporting} reports
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Reporter Name */}
                  <div id="field-name">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reporter Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="Your full name"
                      className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                        errors.name
                          ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/30'
                          : 'border-slate-300 focus:ring-[#1B8E44] focus:border-[#1B8E44]'
                      }`}
                    />
                    {errors.name && (
                      <p className="text-xs text-rose-600 mt-1">{errors.name}</p>
                    )}
                  </div>

                  {/* Department / Work Area */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Department / Work Area
                    </label>
                    <input
                      type="text"
                      value={formData.department || ''}
                      onChange={(e) => handleInputChange('department', e.target.value)}
                      placeholder="e.g. Flight Ops, Ground Ops, Maintenance, Cabin Crew"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                    />
                  </div>

                  {/* Position / Role */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Position / Role
                    </label>
                    <input
                      type="text"
                      value={formData.position || ''}
                      onChange={(e) => handleInputChange('position', e.target.value)}
                      placeholder="e.g. First Officer, Ramp Lead, Avionics Technician"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                    />
                  </div>

                  {/* Contact */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact (Phone or Email)
                    </label>
                    <input
                      type="text"
                      value={formData.contact || ''}
                      onChange={(e) => handleInputChange('contact', e.target.value)}
                      placeholder="Extension, phone number, or company email"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {/* Event Occurrence Context Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Date of Event */}
              <div id="field-eventDate">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date of Event / Observation <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.eventDate || ''}
                  onChange={(e) => handleInputChange('eventDate', e.target.value)}
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                    errors.eventDate
                      ? 'border-rose-300 focus:ring-rose-400'
                      : 'border-slate-300 focus:ring-[#1B8E44] focus:border-[#1B8E44]'
                  }`}
                />
                {errors.eventDate && (
                  <p className="text-xs text-rose-600 mt-1">{errors.eventDate}</p>
                )}
              </div>

              {/* Time of Event */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Time (if known)
                </label>
                <input
                  type="time"
                  value={formData.eventTime || ''}
                  onChange={(e) => handleInputChange('eventTime', e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                />
              </div>

              {/* Location / Station */}
              <div id="field-location" className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Location / Station <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={(e) => handleInputChange('location', e.target.value)}
                  placeholder="e.g. Kenneth Kaunda Int Airport (LUN), Gate 3, Apron Stand 4"
                  className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                    errors.location
                      ? 'border-rose-300 focus:ring-rose-400'
                      : 'border-slate-300 focus:ring-[#1B8E44] focus:border-[#1B8E44]'
                  }`}
                />
                {errors.location && (
                  <p className="text-xs text-rose-600 mt-1">{errors.location}</p>
                )}
              </div>

              {meta.askFlightDetails && (
              <>
              {/* Flight No */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Flight No. (if applicable)
                </label>
                <input
                  type="text"
                  value={formData.flightNo || ''}
                  onChange={(e) => handleInputChange('flightNo', e.target.value)}
                  placeholder="e.g. Z9 101"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                />
              </div>

              {/* Aircraft Registration & Type */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Aircraft Reg.
                  </label>
                  <input
                    type="text"
                    value={formData.aircraftReg || ''}
                    onChange={(e) => handleInputChange('aircraftReg', e.target.value)}
                    placeholder="e.g. 9J-..."
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Aircraft Type
                  </label>
                  <input
                    type="text"
                    value={formData.aircraftType || ''}
                    onChange={(e) => handleInputChange('aircraftType', e.target.value)}
                    placeholder="e.g. Q400 / B737"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                  />
                </div>
              </div>
              </>
              )}
            </div>
          </section>

          {/* ======================================================== */}
          {/* SECTION 2: FORM-SPECIFIC DETAILS & EVIDENCE */}
          {/* ======================================================== */}
          <section className="space-y-6">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-md bg-[#F37C1C] text-slate-950 flex items-center justify-center font-bold text-sm shadow-xs">
                  2
                </span>
                <h2 className="text-lg font-extrabold text-slate-900">
                  {meta.title} Details & Evidence Attachments
                </h2>
              </div>
              <span className="text-xs text-slate-500">Provide clear facts</span>
            </div>

            {/* Dynamic Rendering of Section 2 Fields */}
            <div className="space-y-5">
              {section2Fields.map((field) => {
                if (field.key === 'evidence') return null;

                const fieldId = `field-${field.key}`;
                const hasError = Boolean(errors[field.key]);

                return (
                  <div key={field.key} id={fieldId} className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-800">
                      {field.label} {field.required && <span className="text-rose-500">*</span>}
                    </label>

                    {field.hint && (
                      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 mb-1.5">
                        {field.hint}
                      </p>
                    )}

                    {field.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={formData[field.key] || ''}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className={`w-full px-3.5 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                          hasError
                            ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/20'
                            : 'border-slate-300 focus:ring-[#1B8E44] focus:border-[#1B8E44]'
                        }`}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={formData[field.key] || ''}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        className={`w-full px-3.5 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 bg-white ${
                          hasError
                            ? 'border-rose-300 focus:ring-rose-400'
                            : 'border-slate-300 focus:ring-[#1B8E44] focus:border-[#1B8E44]'
                        }`}
                      >
                        <option value="">-- Select option --</option>
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'radio' ? (
                      <div className="flex items-center gap-6 pt-1">
                        {field.options?.map((opt) => (
                          <label key={opt} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={field.key}
                              value={opt}
                              checked={formData[field.key] === opt}
                              onChange={(e) => handleInputChange(field.key, e.target.value)}
                              className="w-4 h-4 text-[#1B8E44] focus:ring-[#1B8E44] border-slate-300"
                            />
                            <span className="text-sm text-slate-800">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={formData[field.key] || ''}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className={`w-full px-3.5 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                          hasError
                            ? 'border-rose-300 focus:ring-rose-400'
                            : 'border-slate-300 focus:ring-[#1B8E44] focus:border-[#1B8E44]'
                        }`}
                      />
                    )}

                    {hasError && (
                      <p className="text-xs text-rose-600 mt-1">{errors[field.key]}</p>
                    )}
                  </div>
                );
              })}

              {/* Supporting Evidence Reference Text Field */}
              <div className="space-y-1 pt-2">
                <label className="block text-xs font-semibold text-slate-800">
                  Supporting evidence / attachment reference (optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.evidence || ''}
                  onChange={(e) => handleInputChange('evidence', e.target.value)}
                  placeholder="Reference technical logs, flight report numbers, physical tag IDs, or describe attachments..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                />
              </div>

              {/* Evidence Upload Component */}
              <div className="pt-2">
                <EvidenceUpload
                  files={evidenceFiles}
                  onChange={setEvidenceFiles}
                  reporting={reporting}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </section>

          {/* ======================================================== */}
          {/* SECTION 3: IMMEDIATE / FOLLOW-UP INFORMATION */}
          {/* ======================================================== */}
          <section className="space-y-6">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-md bg-[#0d3b1f] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  3
                </span>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Immediate / Follow-up Information
                </h2>
              </div>
              <span className="text-xs text-slate-500">Risk Assessment</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/80 border border-slate-200 rounded-xl p-5">
              {/* Urgent Attention Radio */}
              <div id="field-urgent" className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Does it require urgent attention? <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-4 pt-1">
                  {['Yes', 'No', 'Not sure'].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="urgent"
                        value={opt}
                        checked={formData.urgent === opt}
                        onChange={(e) => handleInputChange('urgent', e.target.value)}
                        className="w-4 h-4 text-[#DE2010] focus:ring-[#DE2010] border-slate-300"
                      />
                      <span className={`text-sm ${opt === 'Yes' ? 'font-bold text-[#DE2010]' : 'text-slate-800'}`}>
                        {opt}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.urgent && <p className="text-xs text-rose-600">{errors.urgent}</p>}
              </div>

              {/* Immediate Risk Exposure Radio */}
              <div id="field-exposedToRisk" className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Is anyone currently exposed to immediate risk? <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-4 pt-1">
                  {['Yes', 'No'].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="exposedToRisk"
                        value={opt}
                        checked={formData.exposedToRisk === opt}
                        onChange={(e) => handleInputChange('exposedToRisk', e.target.value)}
                        className="w-4 h-4 text-[#DE2010] focus:ring-[#DE2010] border-slate-300"
                      />
                      <span className={`text-sm ${opt === 'Yes' ? 'font-bold text-[#DE2010]' : 'text-slate-800'}`}>
                        {opt}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.exposedToRisk && <p className="text-xs text-rose-600">{errors.exposedToRisk}</p>}
              </div>

              {/* Did you notify anyone? */}
              <div id="field-notified" className="space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Did you notify anyone at the time? <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-4 pt-1">
                  {['Yes', 'No'].map((opt) => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="notified"
                        value={opt}
                        checked={formData.notified === opt}
                        onChange={(e) => handleInputChange('notified', e.target.value)}
                        className="w-4 h-4 text-[#1B8E44] focus:ring-[#1B8E44] border-slate-300"
                      />
                      <span className="text-sm text-slate-800">{opt}</span>
                    </label>
                  ))}
                </div>
                {errors.notified && <p className="text-xs text-rose-600">{errors.notified}</p>}
              </div>

              {/* Person / Department Notified */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-800">
                  Person / department notified (if applicable)
                </label>
                <input
                  type="text"
                  value={formData.notifiedWho || ''}
                  onChange={(e) => handleInputChange('notifiedWho', e.target.value)}
                  placeholder="e.g. Duty Captain, Ramp Lead, ATC Tower"
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#1B8E44] focus:border-[#1B8E44]"
                />
              </div>
            </div>
          </section>

          {/* Optional: email the case number (never stored with the report) */}
          <div id="field-receiptEmail" className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-2">
            <label htmlFor="receiptEmail" className="block text-sm font-bold text-slate-800">
              Email me my case number <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="receiptEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={receiptEmail}
              onChange={(e) => setReceiptEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isSubmitting}
              className={`w-full sm:max-w-md px-3 py-2.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40 ${
                errors.receiptEmail ? 'border-rose-400' : 'border-slate-300'
              }`}
            />
            {errors.receiptEmail && <p className="text-xs text-rose-600">{errors.receiptEmail}</p>}
            <p className="text-xs text-slate-500">
              {reporting === 'Anonymous'
                ? 'Your report stays anonymous: the address is only used to send you the case number and is not saved with the report.'
                : 'We send you the case number for your records. The address is not saved with the report.'}
            </p>
          </div>

          {/* Form Actions & Submission */}
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-100 transition-colors"
            >
              Cancel / Back to Home
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-3 rounded-lg bg-[#1B8E44] hover:bg-[#147236] active:bg-[#0e5527] text-white font-extrabold text-sm shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#F37C1C]" />
                  <span>Uploading & Submitting Report...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-[#F37C1C]" />
                  <span>Submit {meta.title}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Mandatory Form Footer Statement */}
      <div className="text-center text-xs text-slate-500 px-4">
        Thank you for reporting. QSA will review the report and determine any required risk assessment, investigation or corrective action.
      </div>
    </div>
  );
};
