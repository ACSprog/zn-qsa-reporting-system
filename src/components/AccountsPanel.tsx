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
  Copy,
  Ban,
  CircleCheck,
  ShieldOff,
  Lock
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
  isWelcomeFlowConfigured,
  setAccountBlocked,
  requestSuperAdminAction,
  cancelSuperAdminAction,
  needsConfirmation,
  describePendingAction,
  assignableRoles,
  canManageAccount,
  ALL_ROLES,
  getRequire2fa,
  setRequire2fa,
  reset2faCommand
} from '../lib/accounts';
import { CmsRole } from '../types';
import { TwoFactorStatus } from './TwoFactorSetup';
import { NewPasswordFields, PasswordField, checkPassword } from './PasswordUI';

interface AccountsPanelProps {
  currentUid: string;
  currentEmail: string;
  /** Managers can manage users; everyone else only sees "Change my password" */
  canManage: boolean;
  /** The signed-in user's level (decides which users and levels they can manage) */
  myRole: CmsRole | null;
  /** Called after the user changes their own password */
  onPasswordChanged?: () => void;
  /** Called after the user turns on 2FA (they should sign in again) */
  onTwoFactorEnrolled?: () => void;
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

export const AccountsPanel: React.FC<AccountsPanelProps> = ({ currentUid, currentEmail, canManage, myRole, onPasswordChanged, onTwoFactorEnrolled }) => {
  const assignable = assignableRoles(myRole);
  const isSuperAdmin = myRole === 'superadmin';

  // Super Admin security controls
  const [require2fa, setRequire2faState] = useState<boolean | null>(null);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [securityNotice, setSecurityNotice] = useState<Notice>(null);
  const [resetFor, setResetFor] = useState<CmsAccount | null>(null);
  const [resetCopied, setResetCopied] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    getRequire2fa()
      .then(setRequire2faState)
      .catch(() => setRequire2faState(null));
  }, [isSuperAdmin]);

  const toggleRequire2fa = async () => {
    if (require2fa === null) return;
    const next = !require2fa;
    if (
      !window.confirm(
        next
          ? 'Require 2FA for every CMS user?\n\nAnyone without an authenticator app set up will be asked to set one up at their next sign-in, and cannot see reports until they do.'
          : 'Stop requiring 2FA?\n\nUse this only in an emergency (e.g. people locked out). Users who already set up 2FA will still be asked for their code.'
      )
    )
      return;
    setSavingSecurity(true);
    setSecurityNotice(null);
    try {
      await setRequire2fa(next, currentEmail);
      setRequire2faState(next);
      setSecurityNotice({
        kind: 'ok',
        text: next
          ? '2FA is now required. Users set it up at their next sign-in; anyone signed in without it must sign in again.'
          : '2FA is no longer required.'
      });
    } catch (e: any) {
      setSecurityNotice({ kind: 'error', text: e.message });
    } finally {
      setSavingSecurity(false);
    }
  };
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

  // Changes to another Super Admin become a request they must confirm themselves
  const requestConfirmation = async (acc: CmsAccount, type: 'remove' | 'block' | 'role', newRole?: CmsRole) => {
    const who = acc.name || acc.email || acc.uid;
    const what =
      type === 'remove' ? 'remove their Super Admin account' : type === 'block' ? 'block their account' : `change their level to ${ROLE_INFO[newRole!].label}`;
    if (
      !window.confirm(
        `${who} is a Super Admin, so they must confirm this themselves.\n\nSend a request to ${what}? It happens only when they approve it in the CMS.`
      )
    )
      return;
    setBusyUid(acc.uid);
    setListNotice(null);
    try {
      await requestSuperAdminAction(acc, type, newRole, { uid: currentUid, email: currentEmail });
      setListNotice({ kind: 'ok', text: `Request sent. ${who} will be asked to confirm the next time they open the CMS.` });
      refresh();
    } catch (e: any) {
      setListNotice({ kind: 'error', text: e.message });
    } finally {
      setBusyUid(null);
    }
  };

  const handleCancelRequest = async (acc: CmsAccount) => {
    setBusyUid(acc.uid);
    setListNotice(null);
    try {
      await cancelSuperAdminAction(acc);
      setListNotice({ kind: 'ok', text: 'Request withdrawn.' });
      refresh();
    } catch (e: any) {
      setListNotice({ kind: 'error', text: e.message });
    } finally {
      setBusyUid(null);
    }
  };

  const handleRoleChange = async (acc: CmsAccount, role: CmsRole) => {
    if (role === acc.role) return;
    if (needsConfirmation(acc)) return requestConfirmation(acc, 'role', role);
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

  const handleBlock = async (acc: CmsAccount) => {
    const block = !acc.blocked;
    if (block && needsConfirmation(acc)) return requestConfirmation(acc, 'block');
    if (
      !window.confirm(
        block
          ? `Block ${acc.email || acc.uid}?\nThey lose access to the CMS immediately. You can unblock them at any time.`
          : `Unblock ${acc.email || acc.uid}? They will be able to sign in again as ${ROLE_INFO[acc.role].label}.`
      )
    )
      return;
    setBusyUid(acc.uid);
    setListNotice(null);
    try {
      await setAccountBlocked(acc, block);
      setListNotice({ kind: 'ok', text: `${acc.email || acc.uid} has been ${block ? 'blocked' : 'unblocked'}.` });
      refresh();
    } catch (e: any) {
      setListNotice({ kind: 'error', text: e.message });
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemove = async (acc: CmsAccount) => {
    if (needsConfirmation(acc)) return requestConfirmation(acc, 'remove');
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
    if (!checkPassword(newPw, newPw2).acceptable) {
      setPwNotice({ kind: 'error', text: 'Please meet the required items in the checklist.' });
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

      {isSuperAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                <Lock className="w-4 h-4 text-[#1B8E44]" /> Security (Super Admin)
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Two-step sign-in for all CMS users:{' '}
                {require2fa === null ? (
                  'checking...'
                ) : require2fa ? (
                  <strong className="text-emerald-700">Required</strong>
                ) : (
                  <strong className="text-amber-700">Not required</strong>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleRequire2fa}
              disabled={savingSecurity || require2fa === null}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold disabled:opacity-50 ${
                require2fa
                  ? 'border border-amber-300 text-amber-800 hover:bg-amber-50'
                  : 'bg-[#1B8E44] hover:bg-[#147236] text-white'
              }`}
            >
              {savingSecurity ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : require2fa ? (
                <ShieldOff className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              {require2fa ? 'Stop requiring 2FA' : 'Require 2FA for everyone'}
            </button>
          </div>
          <NoticeBox notice={securityNotice} />
        </div>
      )}

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

        {resetFor && (
          <div className="mx-5 mt-4 p-4 rounded-xl border border-slate-300 bg-slate-50 text-xs text-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <strong className="flex items-center gap-1.5">
                <ShieldOff className="w-4 h-4 text-slate-500" /> Reset 2FA for {resetFor.email}
              </strong>
              <button type="button" onClick={() => setResetFor(null)} className="text-slate-400 hover:text-slate-700 font-bold">
                Close
              </button>
            </div>
            <p>
              On the free Firebase plan the browser isn't allowed to remove someone else's authenticator, so this step is run from a
              computer that has the project code and the Firebase CLI, signed in with the Google account that owns this Firebase project
              (<code>firebase login:use owner@gmail.com</code>). In the project folder, run:
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="px-2.5 py-1.5 rounded bg-white border border-slate-300 font-mono">{reset2faCommand(resetFor.email)}</code>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(reset2faCommand(resetFor.email))
                    .then(() => setResetCopied(true))
                    .catch(() => undefined)
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 hover:bg-white font-bold"
              >
                <Copy className="w-3 h-3" /> {resetCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Afterwards they sign in with their password and set up their new phone. Tip: block the account while their phone is missing if you are worried it was stolen.
            </p>
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
                const canAct = !isMe && canManageAccount(myRole, acc) && !acc.pendingAction;
                const lockedReason = isMe
                  ? 'You cannot change your own account. Another Super Admin can, with your confirmation.'
                  : acc.pendingAction
                    ? 'A request is waiting for their confirmation'
                    : 'Only a Super Admin can change Managers and Super Admins';
                const roleOptions = assignable.includes(acc.role) ? assignable : [acc.role, ...assignable];
                return (
                  <tr key={acc.uid} className={`hover:bg-slate-50/60 ${acc.blocked ? 'bg-slate-50 opacity-75' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        {acc.name || acc.email || <span className="italic text-slate-400">No email on record</span>}
                        {isMe && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-slate-900 text-white">YOU</span>
                        )}
                        {acc.blocked && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-600 text-white">BLOCKED</span>
                        )}
                      </div>
                      {acc.name && acc.email && <div className="text-slate-500">{acc.email}</div>}
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">UID: {acc.uid}</div>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={acc.role}
                        disabled={busy || !canAct}
                        onChange={(e) => handleRoleChange(acc, e.target.value as CmsRole)}
                        title={canAct ? ROLE_INFO[acc.role].description : lockedReason}
                        className={`text-[11px] font-black rounded-full px-2.5 py-1 border disabled:opacity-80 disabled:cursor-not-allowed ${
                          acc.role === 'superadmin'
                            ? 'bg-[#0d3b1f] text-white border-[#0d3b1f]'
                            : acc.role === 'manager'
                            ? 'bg-[#F37C1C]/15 text-[#b95a0d] border-[#F37C1C]/30'
                            : acc.role === 'officer'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r} disabled={!assignable.includes(r)}>
                            {ROLE_INFO[r].label}
                          </option>
                        ))}
                      </select>
                      {acc.pendingAction && (
                        <div className="mt-1.5 text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 max-w-[220px]">
                          Waiting for them to confirm: {describePendingAction(acc.pendingAction)}
                          <span className="block text-amber-700/80">asked by {acc.pendingAction.requestedByEmail}</span>
                          {acc.pendingAction.requestedBy === currentUid && (
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(acc)}
                              disabled={busy}
                              className="mt-0.5 font-bold underline hover:text-amber-950"
                            >
                              Withdraw request
                            </button>
                          )}
                        </div>
                      )}
                      {acc.mustChangePassword && (
                        <div className="text-[10px] text-amber-700 mt-1">Still on temporary password (updates at their next CMS sign-in)</div>
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
                        {isSuperAdmin && (
                          <button
                            onClick={() => {
                              setResetFor(acc);
                              setResetCopied(false);
                            }}
                            disabled={!acc.email}
                            title="Remove this user's authenticator app (lost or new phone)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 disabled:opacity-40"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                            Reset 2FA
                          </button>
                        )}
                        <button
                          onClick={() => handleBlock(acc)}
                          disabled={busy || !canAct}
                          title={canAct ? (acc.blocked ? 'Let this user sign in again' : 'Stop this user signing in (can be undone)') : lockedReason}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border font-bold disabled:opacity-40 ${
                            acc.blocked
                              ? 'border-emerald-200 hover:bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 hover:bg-amber-50 text-amber-700'
                          }`}
                        >
                          {acc.blocked ? <CircleCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          {acc.blocked ? 'Unblock' : 'Block'}
                        </button>
                        <button
                          onClick={() => handleRemove(acc)}
                          disabled={busy || !canAct}
                          title={canAct ? 'Remove CMS access (for people who have left)' : lockedReason}
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
          {ALL_ROLES.map((r) => (
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
              {assignable.map((r) => (
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
          <PasswordField id="current-password" label="Current password" value={curPw} onChange={setCurPw} disabled={changingPw} />
          <NewPasswordFields value={newPw} repeat={newPw2} onChange={setNewPw} onRepeatChange={setNewPw2} disabled={changingPw} />
          <NoticeBox notice={pwNotice} />
          <button type="submit" disabled={changingPw} className={primaryBtn}>
            {changingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            Change password
          </button>
        </form>

        <TwoFactorStatus onEnrolled={() => onTwoFactorEnrolled?.()} />
      </div>
    </div>
  );
};
