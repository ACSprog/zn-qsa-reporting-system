import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Shield,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Lock,
  EyeOff,
  HeartHandshake
} from 'lucide-react';
import { FormType } from '../types';
import { FORMS_META } from '../config/fields';
import { ZambiaAirwaysLogo } from '../components/ZambiaAirwaysLogo';

interface HomePageProps {
  onSelectForm: (form: FormType) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectForm }) => {
  return (
    <div className="space-y-12">
      {/* Hero Section with Official Zambia Airways Palette */}
      <section className="bg-gradient-to-b from-[#0d3b1f] via-[#104926] to-[#092a16] text-white py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-b border-[#1b8e44]/40 shadow-md relative overflow-hidden">
        {/* Subtle decorative background watermarks */}
        <div className="absolute -top-12 -right-12 w-96 h-96 bg-[#F37C1C]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-96 h-96 bg-[#1B8E44]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center space-y-4 relative z-10">
          <div className="flex justify-center mb-2">
            <ZambiaAirwaysLogo variant="full" size="md" showSubtitle={false} />
          </div>


          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Safety Reporting System
          </h1>

          <p className="text-sm sm:text-base text-emerald-100/90 max-w-3xl mx-auto leading-relaxed">
            Report any hazard, operational incident, accident, or safety concern.
            Every submission is reviewed by Quality & Safety Assurance (QSA) to safeguard our passengers, flight crew, ground personnel, and aircraft.
          </p>

          {/* Core Guarantees Banner */}
          <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto text-left text-xs">
            <div className="bg-[#0e3c20]/90 border border-[#1b8e44]/60 rounded-xl p-3 flex items-start gap-2.5 shadow-sm">
              <EyeOff className="w-5 h-5 text-[#F37C1C] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white font-bold block">100% Anonymous Option</strong>
                <span className="text-emerald-100/70">No IP addresses, device metadata or personal logs stored.</span>
              </div>
            </div>

            <div className="bg-[#0e3c20]/90 border border-[#1b8e44]/60 rounded-xl p-3 flex items-start gap-2.5 shadow-sm">
              <Lock className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white font-bold block">Confidential Handling</strong>
                <span className="text-emerald-100/70">Strictly restricted to designated QSA Safety Officers.</span>
              </div>
            </div>

            <div className="sm:col-span-2 bg-[#0e3c20]/90 border border-[#1b8e44]/60 rounded-xl p-3.5 flex items-start gap-2.5 shadow-sm">
              <HeartHandshake className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
              <div>
                <strong className="text-white font-bold block">Just Culture Commitment</strong>
                <span className="text-emerald-100/80 leading-relaxed">
                  We encourage open and honest reporting. All reports will be treated fairly and confidentially. Employees will not
                  be penalised for reporting genuine safety concerns or honest mistakes. We believe in learning, accountability and
                  continuous improvement.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Primary Reporting Cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <span className="text-xs font-bold text-[#F37C1C] uppercase tracking-widest">
            REPORTING CATEGORIES
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            Choose a Safety Occurrence Type
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Select the form that best reflects what you observed, encountered, or would like to prevent
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* 1. Hazard Card (Copper-Orange Theme) */}
          <div
            onClick={() => onSelectForm('hazard')}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-[#F37C1C] shadow-sm hover:shadow-xl transition-all duration-200 p-6 sm:p-7 flex flex-col justify-between cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#F37C1C]/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F37C1C] group-hover:bg-[#F37C1C] group-hover:text-white transition-colors shadow-xs">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <span className="font-mono text-xs font-bold text-orange-900 bg-orange-100 px-2.5 py-1 rounded-md border border-[#F37C1C]/40">
                  HAZ
                </span>
              </div>

              <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-[#F37C1C] transition-colors">
                Hazard Report
              </h3>

              <div className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                When to use:
              </div>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                {FORMS_META.hazard.useWhen}
              </p>
              {FORMS_META.hazard.example && (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  <strong className="font-bold text-slate-600">Example:</strong> {FORMS_META.hazard.example}
                </p>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-[#F37C1C] group-hover:translate-x-1 transition-transform">
              <span>Open Hazard Form</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* 2. Incident / Accident Card (Flag Red Theme): one combined form */}
          <div
            onClick={() => onSelectForm('occurrence')}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-[#DE2010] shadow-sm hover:shadow-xl transition-all duration-200 p-6 sm:p-7 flex flex-col justify-between cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-rose-500/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-[#DE2010] group-hover:bg-[#DE2010] group-hover:text-white transition-colors shadow-xs">
                  <Shield className="w-6 h-6" />
                </div>
                <span className="font-mono text-xs font-bold text-rose-900 bg-rose-100 px-2.5 py-1 rounded-md border border-rose-300">
                  IA
                </span>
              </div>

              <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-[#DE2010] transition-colors">
                Accident / Incident Report
              </h3>

              <div className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                When to use:
              </div>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                {FORMS_META.occurrence.useWhen}
              </p>
              {FORMS_META.occurrence.example && (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  <strong className="font-bold text-slate-600">Example:</strong> {FORMS_META.occurrence.example}
                </p>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-[#DE2010] group-hover:translate-x-1 transition-transform">
              <span>Open Accident / Incident Form</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* 3. Safety Concern Card (Airline Green Theme) */}
          <div
            onClick={() => onSelectForm('concern')}
            className="group bg-white rounded-2xl border-2 border-slate-200 hover:border-[#1B8E44] shadow-sm hover:shadow-xl transition-all duration-200 p-6 sm:p-7 flex flex-col justify-between cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-28 h-28 bg-[#1B8E44]/10 rounded-bl-full pointer-events-none transition-transform group-hover:scale-110" />

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#1B8E44] group-hover:bg-[#1B8E44] group-hover:text-white transition-colors shadow-xs">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <span className="font-mono text-xs font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-md border border-[#1B8E44]/40">
                  SC
                </span>
              </div>

              <h3 className="text-xl font-extrabold text-slate-900 group-hover:text-[#1B8E44] transition-colors">
                Safety Concern Report
              </h3>

              <div className="mt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                When to use:
              </div>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                {FORMS_META.concern.useWhen}
              </p>
              {FORMS_META.concern.example && (
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  <strong className="font-bold text-slate-600">Example:</strong> {FORMS_META.concern.example}
                </p>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-sm font-bold text-[#1B8E44] group-hover:translate-x-1 transition-transform">
              <span>Open Safety Concern Form</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </section>

      {/* Emergency Notice */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-amber-50/90 border-l-4 border-[#F37C1C] rounded-r-xl p-5 shadow-xs flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-[#F37C1C] shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-slate-700 space-y-1">
            <h4 className="font-bold text-slate-900">
              Immediate Safety Emergency?
            </h4>
            <p>
              If an aircraft, passenger, or employee is exposed to immediate danger, notify Airport Operations / Air Traffic Control and call QSA on{' '}
              <a href="tel:+260211431511" className="font-bold text-slate-900 underline">+260 211 431 511</a> straight away, in addition to submitting this report.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
