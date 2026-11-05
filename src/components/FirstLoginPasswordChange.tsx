import React, { useState } from 'react';
import { KeyRound, Loader2, AlertTriangle, LogOut } from 'lucide-react';
import { changeOwnPassword, clearMustChangePassword, isWelcomeFlowConfigured } from '../lib/accounts';
import { ZambiaAirwaysLogo } from './ZambiaAirwaysLogo';

interface Props {
  email: string;
  onDone: () => void;
  onSignOut: () => void;
}

/** Shown after a user signs in with a temporary password. */
export const FirstLoginPasswordChange: React.FC<Props> = ({ email, onDone, onSignOut }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40 focus:border-[#1B8E44]';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== next2) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearMustChangePassword();
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07190e] flex items-center justify-center py-10 px-4">
      <form onSubmit={submit} className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-7 sm:p-9 space-y-5">
        <div className="flex justify-center">
          <ZambiaAirwaysLogo variant="full" theme="light" size="md" showSubtitle={false} />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-black text-slate-900 flex items-center justify-center gap-2">
            <KeyRound className="w-5 h-5 text-[#F37C1C]" /> Set your own password
          </h1>
          <p className="text-xs text-slate-500 mt-1.5">
            Welcome, {email}. You signed in with a temporary password. Choose your own to continue.
          </p>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Temporary password (from your email)</label>
          <input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} autoComplete="current-password" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">New password (at least 8 characters)</label>
          <input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} autoComplete="new-password" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Repeat new password</label>
          <input type="password" required minLength={8} value={next2} onChange={(e) => setNext2(e.target.value)} className={inputCls} autoComplete="new-password" />
        </div>
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#F37C1C]" />}
          Save password and continue
        </button>
        <div className="flex items-center justify-between text-[11px]">
          {!isWelcomeFlowConfigured() ? (
            <button type="button" onClick={skip} disabled={busy} className="text-slate-500 hover:text-slate-800 underline">
              I already chose my own password from the email link
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onSignOut} className="text-slate-500 hover:text-rose-700 flex items-center gap-1">
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </form>
    </div>
  );
};
