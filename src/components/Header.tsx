import React from 'react';
import { Shield, AlertTriangle, AlertCircle, HelpCircle, Home } from 'lucide-react';
import { FormType } from '../types';
import { ZambiaAirwaysLogo } from './ZambiaAirwaysLogo';

interface HeaderProps {
  currentView: 'home' | 'form';
  selectedForm?: FormType;
  onNavigateHome: () => void;
  onSelectForm: (form: FormType) => void;
}

/**
 * Public Website Header
 * Pure public-facing header with zero administrative or CMS traces.
 */
export const Header: React.FC<HeaderProps> = ({
  currentView,
  selectedForm,
  onNavigateHome,
  onSelectForm
}) => {
  return (
    <header className="bg-[#0d3b1f] text-white border-b border-[#1b8e44]/40 shadow-lg sticky top-0 z-40">
      {/* Zambian Flag & Airline Livery Ribbon */}
      <div className="h-1.5 w-full flex">
        <div className="flex-1 bg-[#1B8E44]" title="Zambia Green - Natural Flora & Resources" />
        <div className="w-16 sm:w-28 bg-[#DE2010]" title="Zambia Red - Struggle for Freedom" />
        <div className="w-16 sm:w-28 bg-[#1E2522]" title="Zambia Black - The People of Zambia" />
        <div className="w-20 sm:w-36 bg-[#F37C1C]" title="Zambia Copper Orange - Mineral Wealth & Aviation" />
      </div>

      {/* Main Header Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Official Zambia Airways Logo */}
          <div
            className="cursor-pointer group select-none transition-opacity hover:opacity-95"
            onClick={onNavigateHome}
          >
            <ZambiaAirwaysLogo variant="full" theme="dark" size="md" />
          </div>

          {/* Public Home Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={onNavigateHome}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                currentView === 'home'
                  ? 'bg-[#1b8e44] text-white shadow-sm'
                  : 'text-emerald-100 hover:text-white hover:bg-[#14522a]'
              }`}
            >
              <Home className="w-4 h-4 text-[#F37C1C]" />
              <span>Safety Home</span>
            </button>
          </div>
        </div>
      </div>

      {/* Public Safety Form Tabs Navigation */}
      <div className="bg-[#092a16] border-t border-[#164a27] px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-2 overflow-x-auto text-xs font-medium scrollbar-none">
          <span className="text-emerald-300 uppercase tracking-wider text-[11px] font-bold mr-1 shrink-0 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-[#F37C1C]" /> Report Categories:
          </span>

          <button
            onClick={() => onSelectForm('hazard')}
            className={`px-3.5 py-1.5 rounded-md shrink-0 transition-all flex items-center gap-1.5 font-bold ${
              currentView === 'form' && selectedForm === 'hazard'
                ? 'bg-[#F37C1C] text-slate-950 shadow-xs'
                : 'text-emerald-100 hover:bg-[#14522a] hover:text-white'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Hazard (HAZ)
          </button>

          <button
            onClick={() => onSelectForm('incident')}
            className={`px-3.5 py-1.5 rounded-md shrink-0 transition-all flex items-center gap-1.5 font-bold ${
              currentView === 'form' && selectedForm === 'incident'
                ? 'bg-[#0284c7] text-white shadow-xs'
                : 'text-emerald-100 hover:bg-[#14522a] hover:text-white'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-sky-300" />
            Incident (INC)
          </button>

          <button
            onClick={() => onSelectForm('accident')}
            className={`px-3.5 py-1.5 rounded-md shrink-0 transition-all flex items-center gap-1.5 font-bold ${
              currentView === 'form' && selectedForm === 'accident'
                ? 'bg-[#DE2010] text-white shadow-xs'
                : 'text-emerald-100 hover:bg-[#14522a] hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-rose-300" />
            Accident (ACC)
          </button>

          <button
            onClick={() => onSelectForm('concern')}
            className={`px-3.5 py-1.5 rounded-md shrink-0 transition-all flex items-center gap-1.5 font-bold ${
              currentView === 'form' && selectedForm === 'concern'
                ? 'bg-[#1B8E44] text-white shadow-xs'
                : 'text-emerald-100 hover:bg-[#14522a] hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-emerald-300" />
            Safety Concern (SC)
          </button>
        </div>
      </div>
    </header>
  );
};
