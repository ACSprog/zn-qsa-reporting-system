import React, { useState } from 'react';

interface ZambiaAirwaysLogoProps {
  className?: string;
  variant?: 'full' | 'emblem' | 'wordmark';
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

/**
 * Official Zambia Airways Logo from www.zambia-airways.com
 * Source: /Cms_Data/Sites/ZambiaAirways/Files/zambia-logo.png
 */
export const ZambiaAirwaysLogo: React.FC<ZambiaAirwaysLogoProps> = ({
  className = '',
  variant = 'full',
  theme = 'dark',
  size = 'md',
  showSubtitle = true
}) => {
  const [imgError, setImgError] = useState(false);

  // Height configurations
  const heightClasses = {
    sm: 'h-9',
    md: 'h-12 sm:h-14',
    lg: 'h-16 sm:h-20',
    xl: 'h-24 sm:h-28'
  }[size];

  return (
    <div className={`flex items-center gap-3.5 select-none ${className}`}>
      {/* Official High-Resolution Logo from www.zambia-airways.com */}
      <div className="relative shrink-0 flex items-center">
        {!imgError ? (
          <div className="bg-white/95 rounded-xl px-2.5 py-1.5 shadow-sm border border-emerald-900/10 flex items-center justify-center backdrop-blur-xs">
            <img
              src="/zambia-airways-logo.png"
              alt="Zambia Airways (2014) Limited Official Logo"
              className={`${heightClasses} w-auto object-contain drop-shadow-2xs`}
              loading="eager"
              onError={() => setImgError(true)}
            />
          </div>
        ) : (
          /* High-fidelity Vector Fallback if image asset fails to load */
          <div className="flex items-center gap-2.5 bg-white/95 rounded-xl p-2 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-[#1B8E44] flex items-center justify-center text-white border-2 border-[#F37C1C]">
              <span className="font-black text-xs text-[#F37C1C]">Z9</span>
            </div>
            <div className="text-left font-black tracking-tight text-[#1B8E44] text-base leading-none">
              ZAMBIA <span className="text-[#F37C1C]">AIRWAYS</span>
            </div>
          </div>
        )}
      </div>

      {/* Corporate Division & QSA System Tag */}
      {showSubtitle && variant === 'full' && (
        <div className="hidden lg:flex flex-col border-l border-emerald-400/30 pl-3 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-white tracking-wider uppercase">
              Quality & Safety Assurance
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#F37C1C] text-slate-950">
              QSA
            </span>
          </div>
          <span className="text-[11px] text-emerald-200/90 font-medium mt-0.5">
            Safety Management System (SMS) Portal
          </span>
        </div>
      )}
    </div>
  );
};
