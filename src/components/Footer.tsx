import React from 'react';
import { ShieldCheck, HeartHandshake, FileCheck, PhoneCall } from 'lucide-react';
import { ZambiaAirwaysLogo } from './ZambiaAirwaysLogo';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#092a16] text-slate-300 border-t border-[#1b8e44]/40 mt-16 text-sm relative overflow-hidden">
      {/* Decorative top ribbon in airline colors */}
      <div className="h-1 w-full flex">
        <div className="flex-1 bg-[#1B8E44]" />
        <div className="w-16 sm:w-28 bg-[#DE2010]" />
        <div className="w-16 sm:w-28 bg-[#1E2522]" />
        <div className="w-20 sm:w-36 bg-[#F37C1C]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        {/* Core Mandatory QSA Notice */}
        <div className="bg-[#0e3d21] border border-[#1b8e44]/50 rounded-xl p-5 mb-8 text-center sm:text-left sm:flex sm:items-center sm:justify-between shadow-md">
          <div className="flex items-center gap-3.5 mb-3 sm:mb-0">
            <div className="w-11 h-11 rounded-full bg-[#1b8e44]/20 border border-[#1b8e44] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-[#F37C1C]" />
            </div>
            <div>
              <h4 className="text-white font-bold text-base">
                Zambia Airways Just Culture & Safety Commitment
              </h4>
              <p className="text-emerald-100 text-xs sm:text-sm mt-0.5">
                Thank you for reporting. QSA will review the report and determine any required risk assessment, investigation or corrective action.
              </p>
            </div>
          </div>
          <div className="shrink-0 flex items-center justify-center gap-2 text-xs font-bold text-[#F37C1C] bg-[#F37C1C]/15 px-3.5 py-2 rounded-lg border border-[#F37C1C]/40">
            <HeartHandshake className="w-4 h-4 text-[#F37C1C]" />
            Non-Punitive Reporting Policy
          </div>
        </div>

        {/* Corporate & Regulatory Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 pb-6 border-b border-[#164a27] text-xs text-emerald-100/80">
          <div>
            <div className="mb-3">
              <ZambiaAirwaysLogo variant="full" theme="dark" size="sm" showSubtitle={false} />
            </div>
            <p className="leading-relaxed text-slate-300">
              Kenneth Kaunda International Airport (KKIA), Lusaka, Zambia.
              Operational Safety Management System (SMS) certified under Zambia Civil Aviation Authority (ZCAA) regulations and ICAO Annex 19.
            </p>
          </div>

          <div>
            <span className="text-white font-bold text-sm block mb-1">
              Quality, Safety & Airworthiness (QSA)
            </span>
            <p className="leading-relaxed text-slate-300">
              Direct all inquiries or confidential follow-ups regarding voluntary safety reports to the Safety Management Office.
            </p>
            <div className="flex items-center gap-1.5 mt-2.5 text-[#F37C1C] font-semibold">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>QSA Emergency / Urgent Line: Ext. 2100 / Duty Officer</span>
            </div>
          </div>

          <div>
            <span className="text-white font-bold text-sm block mb-1">
              Confidentiality & Anonymity
            </span>
            <p className="leading-relaxed text-slate-300">
              Reports submitted anonymously do not collect device identifiers, IP addresses, or digital fingerprints. Image EXIF metadata is stripped client-side prior to transmission.
            </p>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-emerald-200/60 gap-3">
          <p>© {new Date().getFullYear()} Zambia Airways (2014) Limited. All rights reserved.</p>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-slate-300">
              <FileCheck className="w-3.5 h-3.5 text-[#F37C1C]" /> Form Revision 3.2
            </span>
            <span>•</span>
            <span className="text-[#F37C1C] font-semibold">The Wings of the Nation</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
