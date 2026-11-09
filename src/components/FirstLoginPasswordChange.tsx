import React, { useState } from 'react';
import { KeyRound, Loader2, AlertTriangle, LogOut } from 'lucide-react';
import { changeOwnPassword, clearMustChangePassword, isWelcomeFlowConfigured } from '../lib/accounts';
import { AuthShell, NewPasswordFields, PasswordField, checkPassword, setLoginNotice } from './PasswordUI';

interface Props {
  email: string;
  /** Called after the password is changed (the CMS then signs out to the sign-in page) */
  onPasswordChanged: () => void;
  /** Called when the user says they already chose their own password */
  onSkipped: () => void;
  onSignOut: () => void;
}

/** Shown after a user signs in with a temporary password. */
export const FirstLoginPasswordChange: React.FC<Props> = ({ email, onPasswordChanged, onSkipped, onSignOut }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!checkPassword(next, next2).acceptable) {
      setError('Please meet the required items in the checklist.');
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      setLoginNotice('Your password has been changed. Sign in with your new password.', email);
      onPasswordChanged();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearMustChangePassword();
      onSkipped();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Set your own password"
      subtitle={
        <>
          Welcome, <strong className="text-slate-700">{email}</strong>. You signed in with a temporary password. Choose your own to continue.
        </>
      }
      footer={
        <button type="button" onClick={onSignOut} className="text-xs font-bold text-emerald-200/80 hover:text-white inline-flex items-center gap-1.5">
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      }
    >
      <form onSubmit={submit} className="space-y-5 text-left">
        <PasswordField id="temp-password" label="Temporary password (from your email)" value={current} onChange={setCurrent} autoFocus disabled={busy} />
        <div className="border-t border-slate-100" />
        <NewPasswordFields value={next} repeat={next2} onChange={setNext} onRepeatChange={setNext2} disabled={busy} />
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !current || !checkPassword(next, next2).acceptable}
          className="w-full py-3.5 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-sm shadow-lg shadow-[#1B8E44]/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none transition"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#F37C1C]" />}
          Save password
        </button>
        {!isWelcomeFlowConfigured() && (
          <button type="button" onClick={skip} disabled={busy} className="w-full text-[11px] text-slate-500 hover:text-slate-800 underline">
            I already chose my own password from the email link
          </button>
        )}
      </form>
    </AuthShell>
  );
};
