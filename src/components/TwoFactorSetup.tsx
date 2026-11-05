import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  multiFactor,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  TotpSecret,
  User
} from 'firebase/auth';
import { ShieldCheck, Loader2, Mail, AlertTriangle, CheckCircle2, Smartphone, LogOut, Copy } from 'lucide-react';
import { getFirebaseHandles } from '../lib/firebase';
import { ZambiaAirwaysLogo } from './ZambiaAirwaysLogo';

const ISSUER = 'Zambia Airways QSA';

function friendly(e: any): string {
  const code: string = e?.code || '';
  if (code === 'auth/requires-recent-login') return 'For security, please sign out and sign in again, then set up 2FA straight away.';
  if (code === 'auth/invalid-verification-code') return 'That code is not right. Enter the current 6-digit code shown in your app.';
  if (code === 'auth/unverified-email') return 'Please verify your email address first.';
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation')
    return 'Authenticator-app 2FA is not switched on for this Firebase project yet. Ask your Super Admin to run: npm run setup:firebase -- --enable-2fa';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
  return e?.message || 'Something went wrong.';
}

/** Is the signed-in user enrolled in authenticator-app 2FA? */
export function isEnrolledIn2fa(user: User | null | undefined): boolean {
  if (!user || typeof (user as any).getIdToken !== 'function') return false;
  return multiFactor(user).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

interface FlowProps {
  /** Called after successful enrolment (the user is then signed out to sign in with a code) */
  onEnrolled: () => void;
}

/** The three steps: verify email → scan QR → confirm code. */
const EnrollFlow: React.FC<FlowProps> = ({ onEnrolled }) => {
  const { auth } = getFirebaseHandles();
  const user = auth?.currentUser || null;
  const [verified, setVerified] = useState<boolean>(Boolean(user?.emailVerified));
  const [sentVerification, setSentVerification] = useState(false);
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qr, setQr] = useState<string>('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const startSecret = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const session = await multiFactor(user).getSession();
      const s = await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(s);
      setQr(await QRCode.toDataURL(s.generateQrCodeUrl(user.email || 'user', ISSUER), { margin: 1, width: 220 }));
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (verified && !secret) startSecret();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified]);

  if (!user) {
    return <p className="text-xs text-slate-500">2FA is only available when connected to Firebase.</p>;
  }

  const sendVerification = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendEmailVerification(user);
      setSentVerification(true);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const checkVerified = async () => {
    setBusy(true);
    setError(null);
    try {
      await user.reload();
      if (user.emailVerified) {
        // Fresh token so Firebase knows the email is now verified
        await user.getIdToken(true);
        setVerified(true);
      } else {
        setError("Your email isn't verified yet. Click the link in the email (check spam), then try again.");
      }
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) return;
    setBusy(true);
    setError(null);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.replace(/\s/g, ''));
      await multiFactor(user).enroll(assertion, 'Authenticator app');
      onEnrolled();
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-left">
      {/* Step 1 */}
      <div className={`rounded-xl border p-4 ${verified ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
          {verified ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Mail className="w-4 h-4 text-[#F37C1C]" />}
          1. Verify your email
        </div>
        {verified ? (
          <p className="text-xs text-emerald-800 mt-1">{user.email} is verified.</p>
        ) : (
          <div className="mt-2 space-y-2 text-xs text-slate-600">
            <p>We need to confirm {user.email} belongs to you.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={sendVerification}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 font-bold text-slate-700 disabled:opacity-50"
              >
                {sentVerification ? 'Send the email again' : 'Send verification email'}
              </button>
              {sentVerification && (
                <button
                  type="button"
                  onClick={checkVerified}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white font-bold disabled:opacity-50"
                >
                  I've clicked the link
                </button>
              )}
            </div>
            {sentVerification && <p className="text-[11px]">Sent. It comes from noreply@…firebaseapp.com and may land in spam.</p>}
          </div>
        )}
      </div>

      {/* Step 2 */}
      <div className={`rounded-xl border p-4 ${!verified ? 'opacity-50' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
          <Smartphone className="w-4 h-4 text-[#F37C1C]" /> 2. Scan with your authenticator app
        </div>
        {verified && (
          <div className="mt-2 text-xs text-slate-600 space-y-2">
            <p>
              Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone, tap <strong>+</strong>, and scan this code.
            </p>
            {qr ? (
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <img src={qr} alt="2FA QR code" className="w-[180px] h-[180px] border border-slate-200 rounded-lg" />
                <div className="text-[11px] space-y-1">
                  <p>Can't scan? Enter this key instead (time-based):</p>
                  <code className="block px-2 py-1 rounded bg-slate-100 border border-slate-200 font-mono break-all">{secret?.secretKey}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(secret?.secretKey || '').then(() => setCopied(true)).catch(() => undefined)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50 font-bold"
                  >
                    <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy key'}
                  </button>
                </div>
              </div>
            ) : busy ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <button type="button" onClick={startSecret} className="px-3 py-1.5 rounded-lg border border-slate-300 font-bold">
                Show QR code
              </button>
            )}
          </div>
        )}
      </div>

      {/* Step 3 */}
      <form onSubmit={enroll} className={`rounded-xl border p-4 ${!secret ? 'opacity-50' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
          <ShieldCheck className="w-4 h-4 text-[#F37C1C]" /> 3. Enter the 6-digit code
        </div>
        <div className="mt-2 flex gap-2">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            disabled={!secret}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-36 px-3 py-2 rounded-lg border border-slate-300 font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40"
          />
          <button
            type="submit"
            disabled={!secret || busy || code.replace(/\s/g, '').length < 6}
            className="px-4 py-2 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy && secret ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Turn on 2FA
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

/** Full page: 2FA is required and this user hasn't set it up yet. */
export const TwoFactorRequired: React.FC<{ email: string; enrolled: boolean; onSignOut: () => void }> = ({
  email,
  enrolled,
  onSignOut
}) => {
  const [done, setDone] = useState(false);
  return (
    <div className="min-h-screen bg-[#07190e] flex items-center justify-center py-10 px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl p-7 sm:p-9 space-y-5">
        <div className="flex justify-center">
          <ZambiaAirwaysLogo variant="full" theme="light" size="md" showSubtitle={false} />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-black text-slate-900 flex items-center justify-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#F37C1C]" /> Set up two-step sign-in
          </h1>
          <p className="text-xs text-slate-500 mt-1.5">
            The QSA CMS holds sensitive safety data, so every account ({email}) needs an authenticator-app code to sign in.
          </p>
        </div>
        {enrolled ? (
          <p className="text-sm text-slate-700 text-center">
            2FA is already set up on your account, but this session didn't use it. Sign out and sign in again with your code.
          </p>
        ) : done ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 text-center space-y-1">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
            <p className="font-bold">2FA is on.</p>
            <p className="text-xs">Sign in again: after your password you'll be asked for the code from your app.</p>
          </div>
        ) : (
          <EnrollFlow onEnrolled={() => setDone(true)} />
        )}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onSignOut}
            className={`flex items-center gap-1.5 text-xs font-bold ${done || enrolled ? 'px-4 py-2 rounded-lg bg-slate-800 text-white' : 'text-slate-500 hover:text-rose-700'}`}
          >
            <LogOut className="w-3.5 h-3.5" /> {done || enrolled ? 'Sign in again' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Card for "My Account": shows 2FA status and lets users turn it on. */
export const TwoFactorStatus: React.FC<{ onEnrolled: () => void }> = ({ onEnrolled }) => {
  const { auth } = getFirebaseHandles();
  const user = auth?.currentUser || null;
  const [open, setOpen] = useState(false);
  const enrolled = isEnrolledIn2fa(user);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
        <ShieldCheck className="w-4 h-4 text-[#1B8E44]" /> Two-Step Sign-In (2FA)
      </div>
      {!user ? (
        <p className="text-xs text-slate-500">Not available in preview mode (needs Firebase).</p>
      ) : enrolled ? (
        <p className="text-xs text-emerald-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> On: you sign in with a code from your authenticator app.
          Lost your phone? Ask a Super Admin to reset your 2FA.
        </p>
      ) : open ? (
        <EnrollFlow onEnrolled={onEnrolled} />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">Off. Protect your account with a 6-digit code from your phone.</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold"
          >
            Set up 2FA
          </button>
        </div>
      )}
    </div>
  );
};
