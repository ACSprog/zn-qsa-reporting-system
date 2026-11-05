import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  KeyRound,
  Mail,
  ShieldCheck,
  Trash2,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import {
  CmsAccount,
  listCmsAccounts,
  addCmsAccount,
  setQsaAccess,
  removeCmsAccount,
  sendAccountPasswordReset,
  changeOwnPassword
} from '../lib/accounts';

interface AccountsPanelProps {
  currentUid: string;
  currentEmail: string;
  /** QSA Inspectors can manage users; Safety Officers only see "Change my password" */
  canManage: boolean;
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const NoticeBox: React.FC<{ notice: Notice }> = ({ notice }) => {
  if (!notice) return null;
  const ok = notice.kind === 'ok';
  return (
    <div
      className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
        ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'
      }`}
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
      )}
      <span>{notice.text}</span>
    </div>
  );
};

const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40 focus:border-[#1B8E44]';
const primaryBtn =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed';

export const AccountsPanel: React.FC<AccountsPanelProps> = ({ currentUid, currentEmail, canManage }) => {
  const [accounts, setAccounts] = useState<CmsAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [listNotice, setListNotice] = useState<Notice>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Add user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newQsa, setNewQsa] = useState(false);
  const [existingUid, setExistingUid] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addNotice, setAddNotice] = useState<Notice>(null);

  // Change own password form
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [pwNotice, setPwNotice] = useState<Notice>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setAccounts(await listCmsAccounts());
    } catch (e: any) {
      setListNotice({ kind: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManage) refresh();
  }, [canManage]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddNotice(null);
    setAdding(true);
    try {
      const res = await addCmsAccount(
        { email: newEmail, name: newName, qsa: newQsa, existingUid: existingUid || undefined },
        currentEmail
      );
      const who = newEmail.trim();
      const first = res.createdLogin ? `Login created for ${who}.` : `CMS access granted to ${who}.`;
      if (res.preview) {
        setAddNotice({ kind: 'ok', text: `${first} (Preview mode: no email is sent.)` });
      } else if (res.resetEmailSent) {
        setAddNotice({ kind: 'ok', text: `${first} They have been emailed a link to set their password (ask them to check spam).` });
      } else {
        const reason = (res.resetError || 'unknown error').replace(/\.$/, '');
        setAddNotice({ kind: 'error', text: `${first} Could not send the set-password email (${reason}). Use "Send reset email" in the list above.` });
      }
      setNewEmail('');
      setNewName('');
      setNewQsa(false);
      setExistingUid('');
      refresh();
    } catch (err: any) {
      setAddNotice({ kind: 'error', text: err.message });
      if (/already has a login/.test(err.message)) setShowAdvanced(true);
    } finally {
      setAdding(false);
    }
  };

  const handleReset = async (acc: CmsAccount) => {
    if (!acc.email) return;
    setBusyUid(acc.uid);
    setListNotice(null);
    try {
      await sendAccountPasswordReset(acc.email);
      setListNotice({ kind: 'ok', text: `Password reset email sent to ${acc.email}. The link lets them choose a new password (ask them to check spam).` });
    } catch (e: any) {
      setListNotice({ kind: 'error', text: e.message });
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleQsa = async (acc: CmsAccount) => {
    const on = !acc.isQsaAdmin;
    if (!on && !window.confirm(`Remove QSA Inspector rights from ${acc.email || acc.uid}?\nThey will no longer see reporter identities or manage accounts.`)) return;
    setBusyUid(acc.uid);
    setListNotice(null);
    try {
      await setQsaAccess(acc, on, currentEmail);
      setListNotice({ kind: 'ok', text: `${acc.email || acc.uid} is now ${on ? 'a QSA Inspector' : 'a Safety Officer'}.` });
      refresh();
    } catch (e: any) {
      setListNotice({ kind: 'error', text: e.message });
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemove = async (acc: CmsAccount) => {
    if (!window.confirm(`Remove all CMS access for ${acc.email || acc.uid}?\nThey will no longer be able to sign in to the CMS.`)) return;
    setBusyUid(acc.uid);
    setListNotice(null);
    try {
      await removeCmsAccount(acc.uid);
      setListNotice({ kind: 'ok', text: `CMS access removed for ${acc.email || acc.uid}.` });
      refresh();
    } catch (e: any) {
      setListNotice({ kind: 'error', text: e.message });
    } finally {
      setBusyUid(null);
    }
  };

  const handleChangePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwNotice(null);
    if (newPw !== newPw2) {
      setPwNotice({ kind: 'error', text: 'The two new passwords do not match.' });
      return;
    }
    setChangingPw(true);
    try {
      await changeOwnPassword(curPw, newPw);
      setPwNotice({ kind: 'ok', text: 'Your password has been changed.' });
      setCurPw('');
      setNewPw('');
      setNewPw2('');
    } catch (err: any) {
      setPwNotice({ kind: 'error', text: err.message });
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg font-black text-slate-900">User Accounts</h2>
        <p className="text-xs text-slate-500">
          {canManage
            ? 'Add CMS users, send password reset links, and control who can see confidential reporter identities.'
            : 'Change your password. Ask a QSA Inspector if you need another user added or reset.'}
        </p>
      </div>

      {canManage && (
      <>
      {/* Account list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Users className="w-4 h-4 text-[#1B8E44]" />
            CMS Users <span className="text-xs font-bold text-slate-400">({accounts.length})</span>
          </div>
          <button
            onClick={refresh}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
            title="Reload users"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {listNotice && (
          <div className="px-5 pt-4">
            <NoticeBox notice={listNotice} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-5 py-2.5 font-bold">User</th>
                <th className="text-left px-3 py-2.5 font-bold">Role</th>
                <th className="text-right px-5 py-2.5 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((acc) => {
                const isMe = acc.uid === currentUid;
                const busy = busyUid === acc.uid;
                return (
                  <tr key={acc.uid} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        {acc.name || acc.email || <span className="italic text-slate-400">No email on record</span>}
                        {isMe && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-900 text-white">YOU</span>
                        )}
                      </div>
                      {acc.name && acc.email && <div className="text-slate-500">{acc.email}</div>}
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">UID: {acc.uid}</div>
                    </td>
                    <td className="px-3 py-3">
                      {acc.isQsaAdmin ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#F37C1C]/15 text-[#b95a0d] border border-[#F37C1C]/30">
                          <ShieldCheck className="w-3 h-3" /> QSA Inspector
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          Safety Officer
                        </span>
                      )}
                      {!acc.isAdmin && (
                        <div className="text-[10px] text-rose-600 mt-1">Missing CMS access (not in admins)</div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleReset(acc)}
                          disabled={busy || !acc.email}
                          title={acc.email ? 'Email this user a link to set a new password' : 'No email on record'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 disabled:opacity-40"
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                          Send reset email
                        </button>
                        <button
                          onClick={() => handleToggleQsa(acc)}
                          disabled={busy || isMe || !acc.isAdmin}
                          title={isMe ? 'You cannot change your own role' : acc.isQsaAdmin ? 'Make Safety Officer' : 'Make QSA Inspector'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 disabled:opacity-40"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {acc.isQsaAdmin ? 'Make Officer' : 'Make QSA'}
                        </button>
                        <button
                          onClick={() => handleRemove(acc)}
                          disabled={busy || isMe}
                          title={isMe ? 'You cannot remove your own access' : 'Remove CMS access'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 font-bold text-rose-700 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && accounts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 text-[11px] text-slate-500">
          <strong>Safety Officer:</strong> can view and manage reports. <strong>QSA Inspector:</strong> can also see reporter identities and manage these accounts.
          Reset emails come from Firebase (<em>noreply@…firebaseapp.com</em>) and may land in spam.
        </div>
      </div>

      </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add user */}
        {canManage && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3.5">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <UserPlus className="w-4 h-4 text-[#1B8E44]" /> Add a User
          </div>
          <p className="text-[11px] text-slate-500">
            Creates their login and emails them a link to choose their own password.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputCls} placeholder="name@zambiaairways.co.zm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Full name (optional)</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} maxLength={200} />
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
            <input type="checkbox" checked={newQsa} onChange={(e) => setNewQsa(e.target.checked)} className="mt-0.5" />
            <span>
              <strong>QSA Inspector</strong>: can see confidential reporter identities and manage user accounts
            </span>
          </label>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800"
          >
            {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            The person already has a login
          </button>
          {showAdvanced && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Existing login UID</label>
              <input type="text" value={existingUid} onChange={(e) => setExistingUid(e.target.value)} className={`${inputCls} font-mono`} placeholder="From Firebase console → Authentication → Users" />
            </div>
          )}
          <NoticeBox notice={addNotice} />
          <button type="submit" disabled={adding} className={primaryBtn}>
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Add user
          </button>
        </form>
        )}

        {/* Change own password */}
        <form onSubmit={handleChangePw} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3.5">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <KeyRound className="w-4 h-4 text-[#1B8E44]" /> Change My Password
          </div>
          <p className="text-[11px] text-slate-500">Signed in as {currentEmail}</p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Current password</label>
            <input type="password" required value={curPw} onChange={(e) => setCurPw(e.target.value)} className={inputCls} autoComplete="current-password" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">New password (at least 8 characters)</label>
            <input type="password" required minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Repeat new password</label>
            <input type="password" required minLength={8} value={newPw2} onChange={(e) => setNewPw2(e.target.value)} className={inputCls} autoComplete="new-password" />
          </div>
          <NoticeBox notice={pwNotice} />
          <button type="submit" disabled={changingPw} className={primaryBtn}>
            {changingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            Change password
          </button>
        </form>
      </div>
    </div>
  );
};
