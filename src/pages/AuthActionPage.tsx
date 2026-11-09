import React, { useEffect, useState } from 'react';
import { verifyPasswordResetCode, confirmPasswordReset, applyActionCode, checkActionCode } from 'firebase/auth';
import { KeyRound, Loader2, CheckCircle2, AlertTriangle, MailCheck, ArrowRight } from 'lucide-react';
import { getFirebaseHandles } from '../lib/firebase';
import { AuthShell, NewPasswordFields, checkPassword, setLoginNotice } from '../components/PasswordUI';

/**
 * Branded handler for the links in Firebase e-mails (password reset, email verification).
 * Reached either via the console "Customize action URL" setting, or because the emails are sent
 * with handleCodeInApp (Firebase's default page then forwards mode + oobCode here).
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

const REDIRECT_SECONDS = 4;

function linkError(e: any): string {
  const code: string = e?.code || '';
  if (code === 'auth/expired-action-code')
    return 'This link has expired. Ask for a new one from the CMS sign-in page ("Forgot password?") or from a Manager.';
  if (code === 'auth/invalid-action-code')
    return 'This link is not valid any more. It may already have been used, or a newer email was sent. Use the most recent email, or ask for a new link.';
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
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    const { auth } = getFirebaseHandles();
    if (!auth) {
      setState({ kind: 'error', message: 'This page needs the Firebase connection (it is not available in preview mode).' });
      return;
    }
    if (!oobCode) {
      // Arriving here with no code at all means Firebase's own page already finished the job
      // and its "Continue" button sent the user on: just take them to sign in.
      if (!mode) {
        onGoToCms();
        return;
      }
      setState({ kind: 'error', message: 'This link is incomplete. Open it again from the email, or copy the whole link into your browser.' });
      return;
    }
    (async () => {
      try {
        if (mode === 'resetPassword') {
          setState({ kind: 'reset', email: await verifyPasswordResetCode(auth, oobCode) });
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

  // After a reset: count down, then open the CMS sign-in page
  useEffect(() => {
    if (state.kind !== 'reset-done') return;
    if (countdown <= 0) {
      onGoToCms();
      return;
    }
    const t = window.setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [state.kind, countdown, onGoToCms]);

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.kind !== 'reset') return;
    setFormError(null);
    if (!checkPassword(pw, pw2).acceptable) {
      setFormError('Please meet the required items in the checklist.');
      return;
    }
    const { auth } = getFirebaseHandles();
    if (!auth) return;
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, pw);
      setLoginNotice('Your password has been changed. Sign in with your new password.', state.email);
      setState({ kind: 'reset-done', email: state.email });
    } catch (err: any) {
      setFormError(err?.code === 'auth/weak-password' ? 'That password is too weak. Use at least 8 characters.' : linkError(err));
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <button type="button" onClick={onGoHome} className="text-xs font-bold text-emerald-200/80 hover:text-white">
      Zambia Airways Safety Reporting
    </button>
  );

  if (state.kind === 'loading') {
    return (
      <AuthShell title="One moment" footer={footer}>
        <div className="flex flex-col items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-[#1B8E44]" /> Checking your link...
        </div>
      </AuthShell>
    );
  }

  if (state.kind === 'reset') {
    return (
      <AuthShell
        title="Choose a new password"
        subtitle={
          <>
            for <strong className="text-slate-700">{state.email}</strong>
          </>
        }
        footer={footer}
      >
        <form onSubmit={submitReset} className="space-y-5 text-left">
          <NewPasswordFields value={pw} repeat={pw2} onChange={setPw} onRepeatChange={setPw2} autoFocus disabled={busy} />
          {formError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !checkPassword(pw, pw2).acceptable}
            className="w-full py-3.5 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-sm shadow-lg shadow-[#1B8E44]/25 flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none transition"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#F37C1C]" />}
            Save new password
          </button>
        </form>
      </AuthShell>
    );
  }

  if (state.kind === 'reset-done') {
    return (
      <AuthShell title="Password saved" footer={footer}>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#1B8E44]/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-[#1B8E44]" />
          </div>
          <p className="text-sm text-slate-600">
            Taking you to the sign-in page in <strong className="font-mono">{countdown}</strong>s. Sign in with{' '}
            <strong>{state.email}</strong> and your new password.
          </p>
          <button
            type="button"
            onClick={onGoToCms}
            className="w-full py-3.5 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-sm flex items-center justify-center gap-2"
          >
            Go to sign in now <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </AuthShell>
    );
  }

  if (state.kind === 'verified') {
    return (
      <AuthShell title="Email verified" footer={footer}>
        <div className="text-center space-y-3">
          <MailCheck className="w-12 h-12 text-[#1B8E44] mx-auto" />
          <p className="text-sm text-slate-600">
            Thank you. If you were setting up two-step sign-in, go back to that tab and click <strong>"I've clicked the link"</strong>.
          </p>
          <button type="button" onClick={onGoToCms} className="text-xs font-bold text-[#1B8E44] hover:underline">
            Or open the CMS sign-in page here
          </button>
        </div>
      </AuthShell>
    );
  }

  if (state.kind === 'recovered') {
    return (
      <AuthShell title="Email address restored" footer={footer}>
        <p className="text-sm text-slate-600 text-center">
          Your sign-in email is back to <strong>{state.email}</strong>. If you didn't request the change, reset your password and tell the QSA
          department.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="This link can't be used" footer={footer}>
      <div className="text-center space-y-3">
        <AlertTriangle className="w-12 h-12 text-[#DE2010] mx-auto" />
        <p className="text-sm text-slate-600">{state.message}</p>
        <button type="button" onClick={onGoToCms} className="text-xs font-bold text-[#1B8E44] hover:underline">
          Go to the CMS sign-in page
        </button>
      </div>
    </AuthShell>
  );
};
