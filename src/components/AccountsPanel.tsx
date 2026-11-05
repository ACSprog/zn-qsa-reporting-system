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
  ChevronRight,
  Copy
} from 'lucide-react';
import {
  CmsAccount,
  AddAccountResult,
  ROLE_INFO,
  listCmsAccounts,
  addCmsAccount,
  setAccountRole,
  removeCmsAccount,
  sendAccountPasswordReset,
  changeOwnPassword,
  isWelcomeFlowConfigured
} from '../lib/accounts';
import { CmsRole } from '../types';

const ROLES: CmsRole[] = ['viewer', 'officer', 'manager'];

interface AccountsPanelProps {
  currentUid: string;
  currentEmail: string;
  /** Managers can manage users; everyone else only sees "Change my password" */
  canManage: boolean;
  /** Called after the user changes their own password */
  onPasswordChanged?: () => void;
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

export const AccountsPanel: React.FC<AccountsPanelProps> = ({ currentUid, currentEmail, canManage, onPasswordChanged }) => {
  const [accounts, setAccounts] = useState<CmsAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [listNotice, setListNotice] = useState<Notice>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Add user form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<CmsRole>('officer');
  const [lastAdded, setLastAdded] = useState<{ email: string; result: AddAccountResult } | null>(null);
  const [copied, setCopied] = useState(false);
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
    setLastAdded(null);
    setCopied(false);
    setAdding(true);
    const who = newEmail.trim();
    try {
      const res = await addCmsAccount(
        { email: newEmail, name: newName, role: newRole, existingUid: existingUid || undefined },
        currentEmail
      );
      setLastAdded({ email: who, result: res });
      const first = res.createdLogin ? `Login created for ${who} as ${ROLE_INFO[newRole].label}.` : `${who} now has ${ROLE_INFO[newRole].label} access.`;
      if (res.preview) {
        setAddNotice({ kind: 'ok', text: `${first} (Preview mode: no email is sent.)` });
      } else if (res.emailVia === 'outlook') {
        setAddNotice({ kind: 'ok', text: `${first} Their login details have been sent from the company mailbox.` });
      } else if (res.emailVia === 'firebase') {
        setAddNotice({
          kind: 'ok',
          text: `${first} The company welcome email is not set up yet, so Firebase emailed them a link to set their password.`
        });
      } else if (res.emailError) {
        setAddNotice({ kind: 'error', text: `${first} Could not send an email (${res.emailError.replace(/\.$/, '')}).` });
      } else {
        setAddNotice({ kind: 'ok', text: first });
      }
      setNewEmail('');
      setNewName('');
      setNewRole('officer');
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

  const handleRoleChange = async (acc: CmsAccount, role: CmsRole) => {
    if (role === acc.role) return;
    if (!window.confirm(`Change ${acc.email || acc.uid} from ${ROLE_INFO[acc.role].label} to ${ROLE_INFO[role].label}?\n\n${ROLE_INFO[role].description}`)) return;
    setBusyUid(acc.uid);
    setListNotice(null);
    try {
      await setAccountRole(acc, role);
      setListNotice({ kind: 'ok', text: `${acc.email || acc.uid} is now a ${ROLE_INFO[role].label}.` });
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
      await removeCmsAccount(acc);
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
      onPasswordChanged?.();
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
            ? 'Add CMS users, choose their privilege level, and send password reset links.'
            : 'Change your password. Ask a Manager if you need another user added or reset.'}
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
                      <select
                        value={acc.role}
                        disabled={busy || isMe}
                        onChange={(e) => handleRoleChange(acc, e.target.value as CmsRole)}
                        title={isMe ? 'You cannot change your own level' : ROLE_INFO[acc.role].description}
                        className={`text-[11px] font-black rounded-full px-2.5 py-1 border disabled:opacity-80 disabled:cursor-not-allowed ${
                          acc.role === 'manager'
                            ? 'bg-[#F37C1C]/15 text-[#b95a0d] border-[#F37C1C]/30'
                            : acc.role === 'officer'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_INFO[r].label}
                          </option>
                        ))}
                      </select>
                      {acc.mustChangePassword && (
                        <div className="text-[10px] text-amber-700 mt-1">Hasn't set their own password yet</div>
                      )}
                      {!acc.hasAccess && (
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
          {ROLES.map((r) => (
            <span key={r} className="block">
              <strong>{ROLE_INFO[r].label}:</strong> {ROLE_INFO[r].description}
            </span>
          ))}
          <span className="block mt-1">
            "Send reset email" comes from Firebase (<em>noreply@…firebaseapp.com</em>) and may land in spam.
          </span>
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
            {isWelcomeFlowConfigured()
              ? 'Creates their login and emails their login details (with a temporary password) from the company mailbox. They must change the password at first sign-in.'
              : 'Creates their login with a temporary password they must change at first sign-in. The company welcome email is not set up yet (VITE_FLOW_URL_ACCOUNTS), so Firebase emails them a set-password link instead.'}
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputCls} placeholder="name@zambiaairways.co.zm" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Full name (optional)</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} maxLength={200} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Privilege level</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as CmsRole)} className={inputCls}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_INFO[r].label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">{ROLE_INFO[newRole].description}</p>
          </div>
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
          {lastAdded?.result.tempPassword && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 space-y-1.5">
              <div className="font-bold">Temporary password for {lastAdded.email}</div>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 rounded bg-white border border-amber-200 font-mono text-sm tracking-wider">
                  {lastAdded.result.tempPassword}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(lastAdded.result.tempPassword || '').then(() => setCopied(true)).catch(() => undefined);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-300 hover:bg-amber-100 font-bold"
                >
                  <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-[11px]">
                Only shown now. Give it to them yourself if the email doesn't arrive. They'll be asked to change it when they first sign in.
              </div>
            </div>
          )}
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
