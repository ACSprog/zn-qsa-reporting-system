import React, { useEffect, useState } from 'react';
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
  checkActionCode
} from 'firebase/auth';
import { KeyRound, Loader2, CheckCircle2, AlertTriangle, MailCheck, Eye, EyeOff, Lock } from 'lucide-react';
import { ZambiaAirwaysLogo } from '../components/ZambiaAirwaysLogo';
import { getFirebaseHandles, signInWithEmail } from '../lib/firebase';
import { markCmsActivity } from '../components/SessionGuard';

/**
 * Branded handler for the links in Firebase e-mails (password reset, email verification).
 * Firebase is pointed here with `npm run setup:firebase -- --email ... --action-url https://<site>/auth/action`
 * (or Firebase console > Authentication > Templates > Customize action URL).
 */
interface Props {
  onGoToCms: () => void;
  onGoHome: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'reset'; email: string }
  | { kind: 'reset-done'; email: string }
  | { kind: 'verified' }
  | { kind: 'recovered'; email: string }
  | { kind: 'error'; message: string };

function linkError(e: any): string {
  const code: string = e?.code || '';
  if (code === 'auth/expired-action-code') return 'This link has expired. Ask for a new one from the CMS sign-in page ("Forgot password?") or from a Manager.';
  if (code === 'auth/invalid-action-code') return 'This link is not valid any more. It may already have been used, or a newer email was sent. Use the most recent email, or ask for a new link.';
  if (code === 'auth/user-disabled') return 'This account has been disabled. Contact the QSA department.';
  if (code === 'auth/user-not-found') return 'This account no longer exists. Contact the QSA department.';
  return e?.message || 'Something went wrong with this link.';
}

export const AuthActionPage: React.FC<Props> = ({ onGoToCms, onGoHome }) => {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') || '';
  const oobCode = params.get('oobCode') || '';

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const { auth } = getFirebaseHandles();
    if (!auth) {
      setState({ kind: 'error', message: 'This page needs the Firebase connection (it is not available in preview mode).' });
      return;
    }
    if (!oobCode) {
      setState({ kind: 'error', message: 'This link is incomplete. Open it again from the email, or copy the whole link into your browser.' });
      return;
    }
    (async () => {
      try {
        if (mode === 'resetPassword') {
          const email = await verifyPasswordResetCode(auth, oobCode);
          setState({ kind: 'reset', email });
        } else if (mode === 'verifyEmail') {
          await applyActionCode(auth, oobCode);
          await auth.currentUser?.reload().catch(() => undefined);
          setState({ kind: 'verified' });
        } else if (mode === 'recoverEmail') {
          const info = await checkActionCode(auth, oobCode);
          await applyActionCode(auth, oobCode);
          setState({ kind: 'recovered', email: info.data.email || '' });
        } else {
          setState({ kind: 'error', message: 'This kind of link is not used by the QSA system.' });
        }
      } catch (e) {
        setState({ kind: 'error', message: linkError(e) });
      }
    })();
  }, [mode, oobCode]);

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind !== 'reset') return;
    setFormError(null);
    if (pw.length < 8) {
      setFormError('Use at least 8 characters.');
      return;
    }
    if (pw !== pw2) {
      setFormError('The two passwords do not match.');
      return;
    }
    const { auth } = getFirebaseHandles();
    if (!auth) return;
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, pw);
      setState({ kind: 'reset-done', email: state.email });
      try {
        localStorage.setItem('za_cms_remembered_email', state.email);
      } catch {
        /* ignore */
      }
    } catch (err: any) {
      setFormError(err?.code === 'auth/weak-password' ? 'That password is too weak. Use at least 8 characters.' : linkError(err));
    } finally {
      setBusy(false);
    }
  };

  // Sign straight into the CMS with the new password (clears the "temporary password" label too)
  const continueToCms = async () => {
    if (state.kind !== 'reset-done') return;
    setBusy(true);
    markCmsActivity();
    try {
      await signInWithEmail(state.email, pw);
    } finally {
      setBusy(false);
      onGoToCms();
    }
  };

  const inputCls =
    'w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40 focus:border-[#1B8E44]';

  return (
    <div className="min-h-screen bg-[#07190e] flex flex-col items-center justify-center py-10 px-4">
      {/* Livery ribbon */}
      <div className="fixed top-0 left-0 right-0 h-1.5 flex z-50">
        <div className="flex-1 bg-[#1B8E44]" />
        <div className="w-20 bg-[#DE2010]" />
        <div className="w-20 bg-[#1E2522]" />
        <div className="w-24 bg-[#F37C1C]" />
      </div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-7 sm:p-9 space-y-5">
        <div className="flex justify-center">
          <ZambiaAirwaysLogo variant="full" theme="light" size="md" showSubtitle={false} />
        </div>
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1B8E44]/10 text-[#1B8E44] text-xs font-black tracking-wider uppercase">
            <Lock className="w-3.5 h-3.5 text-[#F37C1C]" /> QSA Safety Reporting System
          </span>
        </div>

        {state.kind === 'loading' && (
          <div className="flex flex-col items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin text-[#1B8E44]" /> Checking your link...
          </div>
        )}

        {state.kind === 'reset' && (
          <form onSubmit={submitReset} className="space-y-4">
            <div className="text-center">
              <h1 className="text-xl font-black text-slate-900">Choose a new password</h1>
              <p className="text-xs text-slate-500 mt-1.5">
                for <strong className="text-slate-700">{state.email}</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">New password (at least 8 characters)</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  autoFocus
                  required
                  minLength={8}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  autoComplete="new-password"
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                  title={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Repeat new password</label>
              <input
                type={show ? 'text' : 'password'}
                required
                minLength={8}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
                className={inputCls}
              />
            </div>
            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#F37C1C]" />}
              Save new password
            </button>
          </form>
        )}

        {state.kind === 'reset-done' && (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <div>
              <h1 className="text-xl font-black text-slate-900">Password saved</h1>
              <p className="text-xs text-slate-500 mt-1.5">You can now sign in to the QSA CMS with your new password.</p>
            </div>
            <button
              type="button"
              onClick={continueToCms}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#F37C1C]" />}
              Continue to the CMS
            </button>
          </div>
        )}

        {state.kind === 'verified' && (
          <div className="text-center space-y-3">
            <MailCheck className="w-10 h-10 text-emerald-600 mx-auto" />
            <h1 className="text-xl font-black text-slate-900">Email verified</h1>
            <p className="text-xs text-slate-600">
              Thank you. If you were setting up two-step sign-in, go back to that tab and click <strong>"I've clicked the link"</strong>.
            </p>
            <button type="button" onClick={onGoToCms} className="text-xs font-bold text-[#1B8E44] hover:underline">
              Or open the CMS here
            </button>
          </div>
        )}

        {state.kind === 'recovered' && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h1 className="text-xl font-black text-slate-900">Email address restored</h1>
            <p className="text-xs text-slate-600">
              Your sign-in email is back to <strong>{state.email}</strong>. If you didn't request the change, reset your password and tell the QSA department.
            </p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto" />
            <h1 className="text-lg font-black text-slate-900">This link can't be used</h1>
            <p className="text-xs text-slate-600">{state.message}</p>
            <button type="button" onClick={onGoToCms} className="text-xs font-bold text-[#1B8E44] hover:underline">
              Go to the CMS sign-in page
            </button>
          </div>
        )}
      </div>

      <button type="button" onClick={onGoHome} className="mt-5 text-xs font-bold text-emerald-200/80 hover:text-white">
        Zambia Airways Safety Reporting
      </button>
    </div>
  );
};
