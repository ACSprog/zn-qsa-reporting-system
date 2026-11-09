import React, { useState } from 'react';
import { Eye, EyeOff, Check, X, Lock } from 'lucide-react';
import { ZambiaAirwaysLogo } from './ZambiaAirwaysLogo';

/* ------------------------------------------------------------------ */
/* Shared page frame for sign-in-style screens (matches the CMS login) */
/* ------------------------------------------------------------------ */

export const AuthShell: React.FC<{
  badge?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}> = ({ badge = 'QSA Safety Reporting System', title, subtitle, children, footer, wide }) => (
  <div className="min-h-screen bg-[#07190e] relative overflow-hidden flex flex-col items-center justify-center py-12 px-4">
    {/* Livery ribbon */}
    <div className="fixed top-0 left-0 right-0 h-1.5 flex z-50">
      <div className="flex-1 bg-[#1B8E44]" />
      <div className="w-20 bg-[#DE2010]" />
      <div className="w-20 bg-[#1E2522]" />
      <div className="w-24 bg-[#F37C1C]" />
    </div>
    {/* Soft glow behind the card */}
    <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[46rem] h-[46rem] rounded-full bg-[#1B8E44]/20 blur-3xl" />
    <div className="pointer-events-none absolute -bottom-48 -right-32 w-[30rem] h-[30rem] rounded-full bg-[#F37C1C]/10 blur-3xl" />

    <div className={`relative w-full ${wide ? 'max-w-lg' : 'max-w-md'}`}>
      <div className="bg-white rounded-3xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-[#1B8E44] via-[#F37C1C] to-[#DE2010]" />
        <div className="p-7 sm:p-9 space-y-6">
          <div className="flex justify-center">
            <ZambiaAirwaysLogo variant="full" theme="light" size="md" showSubtitle={false} />
          </div>
          <div className="text-center space-y-2 border-t border-slate-100 pt-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1B8E44]/10 text-[#1B8E44] text-[11px] font-black tracking-wider uppercase">
              <Lock className="w-3.5 h-3.5 text-[#F37C1C]" /> {badge}
            </span>
            {title && <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>}
            {subtitle && <p className="text-xs text-slate-500 leading-relaxed">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
      {footer && <div className="mt-5 text-center">{footer}</div>}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Password rules + strength                                           */
/* ------------------------------------------------------------------ */

export interface PasswordCheck {
  label: string;
  ok: boolean;
  required: boolean;
}

export function checkPassword(pw: string, repeat: string): { checks: PasswordCheck[]; acceptable: boolean; score: number } {
  const checks: PasswordCheck[] = [
    { label: 'At least 8 characters', ok: pw.length >= 8, required: true },
    { label: 'Contains a letter and a number', ok: /[a-z]/i.test(pw) && /\d/.test(pw), required: true },
    { label: 'Upper and lower case letters', ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw), required: false },
    { label: 'A symbol (e.g. ! @ # ?)', ok: /[^a-z0-9]/i.test(pw), required: false },
    { label: 'Both passwords match', ok: pw.length > 0 && pw === repeat, required: true }
  ];
  const acceptable = checks.every((c) => !c.required || c.ok);
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-z0-9]/i.test(pw)) score++;
  return { checks, acceptable, score: Math.min(score, 4) };
}

const STRENGTH = [
  { label: 'Too short', bar: 'bg-slate-300', text: 'text-slate-500' },
  { label: 'Weak', bar: 'bg-[#DE2010]', text: 'text-[#DE2010]' },
  { label: 'Fair', bar: 'bg-[#F37C1C]', text: 'text-[#c2610f]' },
  { label: 'Good', bar: 'bg-[#8bbf3c]', text: 'text-[#4d7a15]' },
  { label: 'Strong', bar: 'bg-[#1B8E44]', text: 'text-[#1B8E44]' }
];

const PasswordInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
  show: boolean;
  onToggle: () => void;
  disabled?: boolean;
}> = ({ id, label, value, onChange, autoComplete, autoFocus, show, onToggle, disabled }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-bold text-slate-700 mb-1.5">
      {label}
    </label>
    <div className="relative">
      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled}
        className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-300 bg-slate-50/60 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40 focus:border-[#1B8E44] transition"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        title={show ? 'Hide password' : 'Show password'}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  </div>
);

/** "Current password" style single field with show/hide. */
export const PasswordField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}> = ({ autoComplete = 'current-password', ...props }) => {
  const [show, setShow] = useState(false);
  return <PasswordInput {...props} autoComplete={autoComplete} show={show} onToggle={() => setShow((v) => !v)} />;
};

/** New password + repeat, with strength meter and a live checklist. */
export const NewPasswordFields: React.FC<{
  value: string;
  repeat: string;
  onChange: (v: string) => void;
  onRepeatChange: (v: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}> = ({ value, repeat, onChange, onRepeatChange, autoFocus, disabled }) => {
  const [show, setShow] = useState(false);
  const { checks, score } = checkPassword(value, repeat);
  const strength = STRENGTH[value.length < 8 ? 0 : score];

  return (
    <div className="space-y-4">
      <PasswordInput
        id="new-password"
        label="New password"
        value={value}
        onChange={onChange}
        autoComplete="new-password"
        autoFocus={autoFocus}
        show={show}
        onToggle={() => setShow((v) => !v)}
        disabled={disabled}
      />

      {/* Strength meter */}
      <div className="-mt-1">
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                value.length >= 8 && score >= i ? strength.bar : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
        {value && <p className={`text-[11px] font-bold mt-1 ${strength.text}`}>{strength.label}</p>}
      </div>

      <PasswordInput
        id="repeat-password"
        label="Repeat new password"
        value={repeat}
        onChange={onRepeatChange}
        autoComplete="new-password"
        show={show}
        onToggle={() => setShow((v) => !v)}
        disabled={disabled}
      />

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 border border-slate-200 p-3">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-[11px] ${c.ok ? 'text-[#1B8E44]' : 'text-slate-500'}`}>
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                c.ok ? 'bg-[#1B8E44] text-white' : 'bg-slate-200 text-slate-400'
              }`}
            >
              {c.ok ? <Check className="w-3 h-3" /> : <X className="w-2.5 h-2.5" />}
            </span>
            <span className={c.ok ? 'font-semibold' : ''}>
              {c.label}
              {!c.required && <span className="text-slate-400 font-normal"> (recommended)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Message shown on the sign-in page after a password change           */
/* ------------------------------------------------------------------ */

const LOGIN_NOTICE_KEY = 'za_cms_login_notice';

export function setLoginNotice(text: string, email?: string) {
  try {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, JSON.stringify({ text, email: email || '' }));
    if (email) localStorage.setItem('za_cms_remembered_email', email);
  } catch {
    /* ignore */
  }
}

export function takeLoginNotice(): { text: string; email: string } | null {
  try {
    const raw = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
