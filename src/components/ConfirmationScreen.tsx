import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  Printer,
  PlusCircle,
  Home,
  ShieldCheck,
  Lock,
  EyeOff,
  UserCheck
} from 'lucide-react';
import { ReportingType } from '../types';
import { ZambiaAirwaysLogo } from './ZambiaAirwaysLogo';

interface ConfirmationScreenProps {
  reportId: string;
  reporting: ReportingType;
  onNewReport: () => void;
  onGoHome: () => void;
}

export const ConfirmationScreen: React.FC<ConfirmationScreenProps> = ({
  reportId,
  reporting,
  onNewReport,
  onGoHome
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(reportId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden text-center p-8 sm:p-10">
        {/* Airline Emblem */}
        <div className="flex justify-center mb-5">
          <ZambiaAirwaysLogo variant="emblem" size="lg" />
        </div>

        <span className="text-xs font-bold uppercase tracking-widest text-[#1B8E44] bg-[#1B8E44]/10 px-3.5 py-1 rounded-full border border-[#1B8E44]/30">
          Report Successfully Received
        </span>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">
          Safety Report Recorded
        </h1>

        <p className="text-sm text-slate-600 mt-2 max-w-lg mx-auto">
          Thank you for reporting. Your submission has been securely committed to the master safety database.
          QSA will review the report and determine any required risk assessment, investigation or corrective action.
        </p>

        {/* Highlighted Report ID Card */}
        <div className="bg-slate-50 border-2 border-[#1B8E44]/30 rounded-xl p-6 my-6 max-w-md mx-auto text-center shadow-xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            Official Reference ID
          </div>
          <div className="text-xl sm:text-2xl font-mono font-black text-[#F37C1C] tracking-wider">
            {reportId}
          </div>

          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors shadow-2xs"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#1B8E44]" />
                  <span className="text-[#1B8E44] font-bold">Copied to clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Report ID</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Protection Note */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mb-8">
          {reporting === 'Anonymous' ? (
            <div className="flex items-center gap-1.5 text-emerald-800 bg-[#1B8E44]/10 px-3.5 py-2 rounded-lg border border-[#1B8E44]/30">
              <EyeOff className="w-4 h-4 text-[#1B8E44] shrink-0" />
              <span>Submitted Anonymously • No identity or device metadata recorded</span>
            </div>
          ) : reporting === 'Confidential' ? (
            <div className="flex items-center gap-1.5 text-orange-950 bg-[#F37C1C]/15 px-3.5 py-2 rounded-lg border border-[#F37C1C]/40">
              <Lock className="w-4 h-4 text-[#F37C1C] shrink-0" />
              <span>Submitted Confidentially • Identity restricted to authorized QSA Admins</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-700 bg-slate-100 px-3.5 py-2 rounded-lg border border-slate-200">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>Named Report • Associated with your reporter details</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={onNewReport}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-bold text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-4 h-4 text-[#F37C1C]" />
            <span>Submit Another Report</span>
          </button>

          <button
            onClick={handlePrint}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>

          <button
            onClick={onGoHome}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            <span>Return to Home</span>
          </button>
        </div>
      </div>
    </div>
  );
};
