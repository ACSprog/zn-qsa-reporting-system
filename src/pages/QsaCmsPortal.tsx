import React, { useEffect, useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Lock,
  LogOut,
  RefreshCw,
  Download,
  Search,
  ShieldAlert,
  Filter,
  AlertTriangle,
  FileSpreadsheet,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Archive,
  ChevronRight,
  Shield,
  Loader2,
  Paperclip,
  FolderOpen,
  Inbox,
  BarChart3,
  Settings,
  Sparkles,
  Mail,
  EyeOff,
  KeyRound,
  X,
  Users,
  Home,
  Trash2
} from 'lucide-react';
import { confirmAndDeleteCase, confirmAndBulkDelete } from '../lib/caseDeletion';
import ExcelSyncPanel from '../components/ExcelSyncPanel';
import {
  BaseReportData,
  CmsRole,
  PendingAdminAction,
  isManagerRole,
  FormType,
  ReportingType,
  ReportStatus
} from '../types';
import { FORMS_META } from '../config/fields';
import { STATUS_OPTIONS } from '../config/options';
import {
  fetchAllReports,
  signInWithEmail,
  sendResetPasswordEmail,
  signOutUser,
  subscribeToAuthState,
  verifyUserRoles,
  LOCKED_MESSAGE,
  effectiveRequire2fa,
  recordMy2faInUse,
  fetchReporterIdentity,
  completeMfaSignIn,
  subscribeMyAdminRecord,
  subscribeToAllReports,
  backendMode,
  clearPreviewReports,
  usingEmulators
} from '../lib/firebase';
import { DetailDrawer } from '../components/DetailDrawer';
import { AccountsPanel } from '../components/AccountsPanel';
import { ROLE_INFO, describePendingAction, answerMyPendingAction } from '../lib/accounts';
import {
  isOpenUrgent,
  reportingLabel,
  reportGroup,
  effectiveForm,
  occurrenceKind,
  searchableText,
  matchesSearch
} from '../lib/display';
import { FirstLoginPasswordChange } from '../components/FirstLoginPasswordChange';
import { TwoFactorRequired, isEnrolledIn2fa, removeOwnAuthenticator } from '../components/TwoFactorSetup';
import type { MultiFactorResolver } from 'firebase/auth';
import { SessionGuard, markCmsActivity, clearCmsActivity } from '../components/SessionGuard';
import { AnnouncementEditor } from '../components/AnnouncementBanner';
import { takeLoginNotice, setLoginNotice } from '../components/PasswordUI';
import { ZambiaAirwaysLogo } from '../components/ZambiaAirwaysLogo';

const ISSUER_LABEL = 'Zambia Airways QSA';

type CmsTab = 'inbox' | 'analytics' | 'sync' | 'accounts' | 'settings';

interface QsaCmsPortalProps {
  onNavigatePublicSite?: () => void;
  onNavigatePublicForm?: (form: FormType) => void;
}

export const QsaCmsPortal: React.FC<QsaCmsPortalProps> = ({ onNavigatePublicSite }) => {
  // Authentication & Authorization state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isVerifyingAuth, setIsVerifyingAuth] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isQsaAdmin, setIsQsaAdmin] = useState<boolean>(false);
  const [role, setRole] = useState<CmsRole | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  // 2FA
  const [require2fa, setRequire2fa] = useState<boolean>(false);
  const [global2fa, setGlobal2fa] = useState<boolean>(false);
  const [session2fa, setSession2fa] = useState<boolean>(false);
  const [enrolled2fa, setEnrolled2fa] = useState<boolean>(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [mfaCode, setMfaCode] = useState<string>('');
  // Why the user was signed out automatically (inactivity / session limit)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  // A Super Admin's request about this user's own account, waiting for their answer
  const [myPendingAction, setMyPendingAction] = useState<PendingAdminAction | undefined>(undefined);
  const [answeringPending, setAnsweringPending] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  // Good news for the sign-in page (e.g. "password changed")
  const [loginNotice, setLoginNoticeText] = useState<string | null>(null);
  useEffect(() => {
    if (currentUser) return;
    const n = takeLoginNotice();
    if (n) {
      setLoginNoticeText(n.text);
      if (n.email) setLoginEmail(n.email);
    }
  }, [currentUser]);
  const isManager = isManagerRole(role);
  const [authError, setAuthError] = useState<string | null>(null);

  // Active CMS Navigation Tab
  const [activeCmsTab, setActiveCmsTab] = useState<CmsTab>('inbox');

  // Reports data state
  const [reports, setReports] = useState<BaseReportData[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<BaseReportData | null>(null);

  // Submissions Inbox Filters
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'all' | FormType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [urgentOnly, setUrgentOnly] = useState<boolean>(false);
  const [reportingFilter, setReportingFilter] = useState<string>('all');
  const [hasEvidenceOnly, setHasEvidenceOnly] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [pendingDeletionOnly, setPendingDeletionOnly] = useState<boolean>(false);


  // Email & Password Sign-in state
  const [loginEmail, setLoginEmail] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('za_cms_remembered_email') || '';
    }
    return '';
  });
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return Boolean(localStorage.getItem('za_cms_remembered_email'));
    }
    return true;
  });
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);

  // Forgot Password Dialog state
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Subscribe to Firebase Auth
  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (user) => {
      setIsVerifyingAuth(true);
      if (user) {
        setCurrentUser(user);
        const roles = await verifyUserRoles(user);
        if (!roles.isAdmin) {
          setAuthError(
            roles.locked
              ? LOCKED_MESSAGE
              : roles.blocked
                ? 'Your account has been blocked. Contact a QSA Manager if you think this is a mistake.'
                : 'Access Denied: Your account is not authorized as a Zambia Airways safety administrator.'
          );
          await signOutUser();
          setIsAdmin(false);
          setIsQsaAdmin(false);
          setRole(null);
          setCurrentUser(null);
        } else {
          setIsAdmin(true);
          setIsQsaAdmin(roles.isQsaAdmin);
          setRole(roles.role);
          setMustChangePassword(roles.mustChangePassword);
          setMyPendingAction(roles.pendingAction);
          setRequire2fa(roles.require2fa);
          setGlobal2fa(roles.global2fa === true);
          if (typeof (user as any).getIdTokenResult === 'function') {
            const token = await (user as any).getIdTokenResult();
            setSession2fa(Boolean(token.signInSecondFactor));
            // A Super Admin switched 2FA off for this user: remove their authenticator now
            // (they have just signed in, so Firebase allows it) so it isn't asked for again.
            if (roles.twoFactorOff && isEnrolledIn2fa(user as any)) {
              try {
                await recordMy2faInUse(user.uid, false);
                await removeOwnAuthenticator(user as any);
                // Firebase ends the session when the factor it used is removed: start clean
                setLoginNotice('Two-step sign-in has been switched off for your account by a Super Admin. Sign in again with just your password.', user.email || undefined);
                await signOutUser();
                setIsVerifyingAuth(false);
                return;
              } catch (e) {
                console.warn('Could not remove the authenticator:', e);
              }
            }
            const inUse = isEnrolledIn2fa(user as any);
            setEnrolled2fa(inUse);
            // Keep the "2FA ON / OFF" badge that Super Admins see in step with reality
            if (inUse && token.signInSecondFactor && roles.twoFactorEnrolled !== true) recordMy2faInUse(user.uid, true);
            if (!inUse && roles.twoFactorEnrolled === true) recordMy2faInUse(user.uid, false);
          } else {
            setSession2fa(false);
            setEnrolled2fa(false);
          }
          setAuthError(null);
        }
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        setIsQsaAdmin(false);
        setRole(null);
        setMustChangePassword(false);
      }
      setIsVerifyingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // Manual refresh (live listener below normally keeps data current)
  const loadReports = async () => {
    if (!isAdmin) return;
    setLoadingReports(true);
    try {
      const data = await fetchAllReports();
      setReports(data);
      setReportsError(null);
    } catch (err: any) {
      console.error('Failed to load reports in CMS:', err);
      setReportsError(err?.message || 'Failed to load reports.');
    } finally {
      setLoadingReports(false);
    }
  };

  // Live subscription: new submissions appear without pressing Refresh.
  // Only once the session may read reports (2FA done if required); restarts with a clean slate
  // whenever that changes, so an old "permission denied" never lingers after signing in again.
  const canReadReports = isAdmin && !(require2fa && !session2fa);
  useEffect(() => {
    setReportsError(null);
    if (!canReadReports) return;
    setLoadingReports(true);
    const unsubscribe = subscribeToAllReports(
      (data) => {
        setReports(data);
        setLoadingReports(false);
      },
      (message) => {
        setReportsError(message);
        setLoadingReports(false);
      }
    );
    return () => unsubscribe();
  }, [canReadReports]);

  // Keep the open detail drawer in sync with live data
  useEffect(() => {
    setSelectedReport((current) => {
      if (!current) return current;
      return reports.find((r) => r.reportId === current.reportId && r.form === current.form) || current;
    });
  }, [reports]);

  const handleEmailPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSessionNotice(null);
    markCmsActivity(); // fresh session: don't count time from a previous one
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError('Please enter both your email address and password.');
      return;
    }

    setIsSubmittingAuth(true);
    try {
      const res = await signInWithEmail(loginEmail, loginPassword);
      if (res.mfaResolver) {
        setMfaResolver(res.mfaResolver);
        setMfaCode('');
      } else if (res.error) {
        setAuthError(res.error);
      } else if (res.user) {
        if (rememberMe) {
          localStorage.setItem('za_cms_remembered_email', loginEmail.trim());
        } else {
          localStorage.removeItem('za_cms_remembered_email');
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication error.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleMfaCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaResolver) return;
    setAuthError(null);
    markCmsActivity();
    setIsSubmittingAuth(true);
    try {
      const res = await completeMfaSignIn(mfaResolver, mfaCode);
      if (res.error) {
        setAuthError(res.error);
      } else {
        setMfaResolver(null);
        setMfaCode('');
        if (rememberMe) localStorage.setItem('za_cms_remembered_email', loginEmail.trim());
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetSuccess(null);
    if (!resetEmail.trim()) {
      setResetError('Please enter your corporate email address.');
      return;
    }

    setIsResetting(true);
    try {
      const res = await sendResetPasswordEmail(resetEmail.trim());
      if (res.success) {
        setResetSuccess(`Password reset instructions sent to ${resetEmail}. Check your inbox or spam folder.`);
      } else {
        setResetError(res.error || 'Failed to dispatch reset email.');
      }
    } catch (err: any) {
      setResetError(err?.message || 'Failed to dispatch reset email.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSignOut = async () => {
    clearCmsActivity();
    setReportsError(null);
    await signOutUser();
    setCurrentUser(null);
    setIsAdmin(false);
    setIsQsaAdmin(false);
    setReports([]);
  };

  // Watch this user's own account record while signed in
  useEffect(() => {
    if (!currentUser?.uid || !isAdmin) return;
    return subscribeMyAdminRecord(currentUser.uid, async (rec) => {
      setMyPendingAction(rec.pendingAction);
      // A Super Admin started/stopped 2FA for me: apply straight away (Start shows the setup screen)
      if (rec.exists) setRequire2fa(effectiveRequire2fa(global2fa, rec.twoFactor));
      if (!rec.exists || rec.blocked) {
        setSessionNotice(
          rec.blocked
            ? 'Your account has been blocked. Contact a QSA Manager if you think this is a mistake.'
            : 'Your CMS access has been removed.'
        );
        await handleSignOut();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, isAdmin, global2fa]);

  const answerPending = async (approve: boolean) => {
    if (!myPendingAction) return;
    const what = describePendingAction(myPendingAction, 'your');
    if (
      !window.confirm(
        approve
          ? `Approve ${myPendingAction.requestedByEmail}'s request to ${what}?${
              myPendingAction.type === 'role' ? '' : '\nYou will be signed out.'
            }`
          : `Decline the request to ${what}?`
      )
    )
      return;
    setAnsweringPending(true);
    setPendingError(null);
    try {
      await answerMyPendingAction(myPendingAction, approve);
      if (approve && myPendingAction.type === 'role') {
        const roles = await verifyUserRoles(currentUser);
        setRole(roles.role);
        setIsQsaAdmin(roles.isQsaAdmin);
        setActiveCmsTab('inbox');
      }
      // remove / block: the live record watcher signs the user out
    } catch (e: any) {
      setPendingError(e.message);
    } finally {
      setAnsweringPending(false);
    }
  };

  // Automatic sign-out (inactivity or maximum session length)
  const handleSessionExpired = async (message: string) => {
    setSessionNotice(message);
    setSelectedReport(null);
    await handleSignOut();
  };

  // Searchable text per case, rebuilt only when reports change
  const searchIndex = useMemo(() => {
    const m = new Map<string, string>();
    reports.forEach((r) => m.set(`${r.form}/${r.reportId}`, searchableText(r, FORMS_META[effectiveForm(r)]?.title || r.form)));
    return m;
  }, [reports]);

  // "/" jumps to the search box, like most web apps
  const globalSearchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        globalSearchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Filtered reports for Inbox
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      // Archive filter
      if (!showArchived && r.deleted) return false;
      if (showArchived && !r.deleted) return false;

      // Deletion requests awaiting a Manager
      if (pendingDeletionOnly && r.deletionRequest?.status !== 'pending') return false;

      // Category filter
      if (selectedCategoryTab !== 'all' && reportGroup(r) !== selectedCategoryTab) return false;

      // Status filter
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;

      // Urgency filter
      if (urgentOnly && !isOpenUrgent(r)) return false;

      // Reporting filter
      if (reportingFilter !== 'all' && r.reporting !== reportingFilter) return false;

      // Has Evidence
      if (hasEvidenceOnly && (!r.evidenceCount || r.evidenceCount <= 0)) return false;

      // Date range
      if (startDate && r.dateReported && r.dateReported < startDate) return false;
      if (endDate && r.dateReported && r.dateReported > endDate) return false;

      // Search query
      // Search every field of the case (all words must match)
      if (searchQuery.trim()) {
        const text = searchIndex.get(`${r.form}/${r.reportId}`) || '';
        if (!matchesSearch(text, searchQuery)) return false;
      }

      return true;
    });
  }, [

    reports,
    selectedCategoryTab,
    statusFilter,
    urgentOnly,
    reportingFilter,
    hasEvidenceOnly,
    pendingDeletionOnly,
    startDate,
    endDate,
    searchQuery,
    showArchived
  ]);

  // Super Admin bulk delete: ticked cases (only ones still visible with the current filters)
  const canBulkDelete = role === 'superadmin';
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<{ kind: 'busy' | 'ok' | 'error'; text: string } | null>(null);
  const visibleIds = useMemo(() => new Set(filteredReports.map((r) => r.reportId)), [filteredReports]);
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleSelected = filteredReports.length > 0 && filteredReports.every((r) => selectedIds.has(r.reportId));
  const toggleSelectAll = () =>
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredReports.map((r) => r.reportId)));
  const handleBulkDelete = async () => {
    if (!currentUser) return;
    const chosen = filteredReports.filter((r) => selectedIds.has(r.reportId));
    const res = await confirmAndBulkDelete(chosen, currentUser, (done, total) =>
      setBulkStatus({ kind: 'busy', text: `Deleting ${Math.min(done + 1, total)} of ${total}…` })
    );
    if (!res) {
      setBulkStatus(null);
      return;
    }
    setSelectedIds(new Set(res.failed.map((f) => f.reportId)));
    setBulkStatus(
      res.failed.length === 0
        ? { kind: 'ok', text: `${res.deleted.length} case${res.deleted.length === 1 ? '' : 's'} deleted permanently.` }
        : {
            kind: 'error',
            text: `${res.deleted.length} deleted, ${res.failed.length} could not be deleted (still ticked): ${res.failed[0].error}`
          }
    );
    loadReports();
  };

  // Export to Excel / CSV
  const handleExport = async (format: 'xlsx' | 'csv') => {
    if (filteredReports.length === 0) return;

    const exportRows = await Promise.all(
      filteredReports.map(async (r) => {
        let reporterName = '';
        let reporterDept = '';
        let reporterPos = '';
        let reporterContact = '';

        if (r.reporting !== 'Anonymous' && isQsaAdmin) {
          const id = await fetchReporterIdentity(r.reportId);
          if (id) {
            reporterName = id.name || '';
            reporterDept = id.department || '';
            reporterPos = id.position || '';
            reporterContact = id.contact || '';
          }
        }

        return {
          'Report ID': r.reportId,
          'Form Category': FORMS_META[effectiveForm(r)].title,
          'Reporting Type': reportingLabel(r.reporting),
          'Date Reported': r.dateReported || '',
          'Event Date': r.eventDate || '',
          'Event Time': r.eventTime || '',
          'Location / Station': r.location || '',
          'Flight No': r.flightNo || '',
          'Aircraft Reg': r.aircraftReg || '',
          'Aircraft Type': r.aircraftType || '',
          'Category / Type': r.category || '',
          'Urgent Attention': r.urgent || 'No',
          'Immediate Risk': r.exposedToRisk || 'No',
          'Notified Anyone': r.notified || 'No',
          'Notified Who': r.notifiedWho || '',
          'Status': r.status || 'New',
          'Audit Notes': r.notes || '',
          'Evidence Files Count': r.evidenceCount || 0,
          'Reporter Name': reporterName || '(Confidential / N/A)',
          'Reporter Department': reporterDept || '',
          'Reporter Position': reporterPos || '',
          'Reporter Contact': reporterContact || ''
        };
      })
    );

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Safety Reports');

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Zambia_Airways_Safety_Reports_${dateStr}.${format}`;

    if (format === 'xlsx') {
      XLSX.writeFile(workbook, filename);
    } else {
      XLSX.writeFile(workbook, filename, { bookType: 'csv' });
    }
  };

  // Metrics calculation
  const pendingDeletionCount = useMemo(
    () => reports.filter((r) => !r.deleted && r.deletionRequest?.status === 'pending').length,
    [reports]
  );

  const metrics = useMemo(() => {
    const total = reports.length;
    const newCount = reports.filter((r) => (r.status || 'New') === 'New').length;
    const urgentCount = reports.filter((r) => isOpenUrgent(r)).length;
    const underReview = reports.filter((r) => r.status === 'Under review' || r.status === 'Action required').length;
    const closedCount = reports.filter((r) => r.status === 'Closed').length;
    const hazards = reports.filter((r) => reportGroup(r) === 'hazard').length;
    const incidents = reports.filter((r) => occurrenceKind(r) === 'Incident').length;
    const accidents = reports.filter((r) => occurrenceKind(r) === 'Accident').length;
    const concerns = reports.filter((r) => reportGroup(r) === 'concern').length;
    return { total, new: newCount, urgent: urgentCount, underReview, closed: closedCount, hazards, incidents, accidents, concerns };
  }, [reports]);

  // 1. Loading State
  if (isVerifyingAuth) {
    return (
      <div className="min-h-screen bg-[#081f11] flex items-center justify-center p-4">
        <div className="bg-[#0e3b1f] border border-[#1b8e44]/40 rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-2xl">
          <div className="flex justify-center">
            <ZambiaAirwaysLogo variant="emblem" size="md" />
          </div>
          <Loader2 className="w-8 h-8 animate-spin text-[#F37C1C] mx-auto" />
          <h3 className="text-white font-extrabold text-base">
            Connecting to QSA CMS Console...
          </h3>
          <p className="text-xs text-emerald-200">
            Verifying security credentials and role-based permissions...
          </p>
        </div>
      </div>
    );
  }

  // 2. Not signed in / Access Denied Screen (CMS Access Barrier)
  if (!currentUser || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#07190e] flex flex-col justify-between py-10 px-4">
        {/* Top ribbon */}
        <div className="fixed top-0 left-0 right-0 h-1.5 flex z-50">
          <div className="flex-1 bg-[#1B8E44]" />
          <div className="w-20 bg-[#DE2010]" />
          <div className="w-20 bg-[#1E2522]" />
          <div className="w-24 bg-[#F37C1C]" />
        </div>

        <div className="max-w-md w-full mx-auto my-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden p-7 sm:p-9 text-center space-y-6">
            {/* Logo */}
            <div className="flex justify-center">
              <ZambiaAirwaysLogo variant="full" theme="light" size="md" showSubtitle={false} />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1B8E44]/10 text-[#1B8E44] text-xs font-black tracking-wider uppercase mb-2">
                <Lock className="w-3.5 h-3.5 text-[#F37C1C]" />
                QSA System CMS Console
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                Safety Management Login
              </h1>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Backend Content & Safety Management System for authorized Zambia Airways flight safety officers and QSA administrators.
              </p>
            </div>

            {loginNotice && !authError && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 text-left flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B8E44] shrink-0 mt-0.5" />
                <span>{loginNotice}</span>
              </div>
            )}

            {sessionNotice && !authError && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 text-left flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{sessionNotice}</span>
              </div>
            )}

            {authError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-left flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {import.meta.env.DEV && (
            <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-3.5 text-left shadow-2xs">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#F37C1C]" />
                  Demo Sign-In Credentials
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail('admin@zambiaairways.co.zm');
                    setLoginPassword('safety2026');
                    setAuthError(null);
                  }}
                  className="text-[11px] font-bold text-white bg-[#1B8E44] hover:bg-[#147236] px-2.5 py-1 rounded-md transition-colors shadow-2xs cursor-pointer"
                >
                  Click to Auto-fill
                </button>
              </div>
              <div className="text-[11px] font-mono text-slate-700 bg-white/80 p-2 rounded-lg border border-emerald-200/60 space-y-0.5">
                <div>Email: <strong className="text-slate-900 font-bold">admin@zambiaairways.co.zm</strong></div>
                <div>Password: <strong className="text-slate-900 font-bold">safety2026</strong></div>
              </div>
              {backendMode !== 'firestore' && (
                <p className="text-[10px] text-emerald-900/80 mt-1.5">
                  Preview: sign in as <code>viewer@…</code> or <code>officer@…</code> (any password, 6+ characters) to try the lower privilege levels.
                </p>
              )}
            </div>

            )}

            {mfaResolver && (
              <form onSubmit={handleMfaCode} className="space-y-4 text-left pt-1">
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                  <Shield className="w-4 h-4 text-[#1B8E44] shrink-0 mt-0.5" />
                  <span>
                    Password accepted. Open your authenticator app and enter the 6-digit code for <strong>{ISSUER_LABEL}</strong>.
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Authentication code</label>
                  <input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 font-mono text-xl tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmittingAuth || mfaCode.replace(/\s/g, '').length < 6}
                  className="w-full py-3 px-4 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isSubmittingAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4 text-[#F37C1C]" />}
                  <span>Verify and sign in</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMfaResolver(null);
                    setMfaCode('');
                    setAuthError(null);
                  }}
                  className="w-full text-xs text-slate-500 hover:text-slate-800"
                >
                  Back
                </button>
              </form>
            )}

            {/* Email & Password Authentication Form */}
            {!mfaResolver && (
            <form onSubmit={handleEmailPasswordSignIn} className="space-y-4 text-left pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Corporate Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="safety.officer@zambiaairways.co.zm"
                    autoComplete="email"
                    className="w-full pl-9 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:border-[#1B8E44] focus:ring-2 focus:ring-[#1B8E44]/20 outline-none transition-all font-medium text-slate-900 bg-white"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(loginEmail);
                      setIsResetModalOpen(true);
                      setResetError(null);
                      setResetSuccess(null);
                    }}
                    className="text-[11px] font-semibold text-[#1B8E44] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    className="w-full pl-9 pr-10 py-2.5 text-xs rounded-xl border border-slate-300 focus:border-[#1B8E44] focus:ring-2 focus:ring-[#1B8E44]/20 outline-none transition-all font-medium text-slate-900 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#1B8E44] focus:ring-[#1B8E44]"
                  />
                  <span>Remember this email</span>
                </label>
              </div>

              {/* Primary Submit Button */}
              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 px-4 rounded-xl bg-[#1B8E44] hover:bg-[#147236] text-white font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {isSubmittingAuth ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 text-[#F37C1C]" />
                    <span>Sign In to QSA CMS</span>
                  </>
                )}
              </button>
            </form>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-slate-600">Zambia Airways Safety System</span>
              <span className="font-mono text-[11px]">ZCAA SMS v3.2</span>
            </div>
          </div>
        </div>

        {onNavigatePublicSite && (
          <div className="max-w-md w-full mx-auto mt-4 text-center">
            <button
              type="button"
              onClick={onNavigatePublicSite}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-200/80 hover:text-white transition-colors"
            >
              <Home className="w-3.5 h-3.5" />
              Back to the public reporting site
            </button>
          </div>
        )}

        {/* Password Reset Modal */}
        {isResetModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#1B8E44]">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Reset CMS Password
                  </h3>
                </div>
                <button
                  onClick={() => setIsResetModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your registered corporate email to receive a password reset link.
              </p>

              {resetError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  {resetSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordReset} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="officer@zambiaairways.co.zm"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1B8E44] outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsResetModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting}
                    className="px-4 py-1.5 rounded-lg bg-[#1B8E44] hover:bg-[#147236] text-white text-xs font-bold shadow-2xs flex items-center gap-1.5"
                  >
                    {isResetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Send Reset Email</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-emerald-200/50">
          Zambia Airways (2014) Limited • Quality & Safety Assurance (QSA) Management Console
        </div>
      </div>
    );
  }

  // Signed in with a temporary password: make them choose their own first
  // Signed in from here on: watch for inactivity and the maximum session length
  const sessionGuard = <SessionGuard user={currentUser} onExpire={handleSessionExpired} />;

  if (mustChangePassword) {
    return (
      <>
        {sessionGuard}
        <FirstLoginPasswordChange
          email={currentUser?.email || ''}
          onPasswordChanged={handleSignOut}
          onSkipped={() => setMustChangePassword(false)}
          onSignOut={handleSignOut}
        />
      </>
    );
  }

  // 2FA required for everyone but this session didn't use it (not set up yet)
  if (require2fa && !session2fa) {
    return (
      <>
        {sessionGuard}
        <TwoFactorRequired email={currentUser?.email || ''} enrolled={enrolled2fa} onSignOut={handleSignOut} />
      </>
    );
  }

  // 3. Full CMS Dashboard Layout
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row text-slate-900 font-sans selection:bg-[#1B8E44] selection:text-white">
      {sessionGuard}
      {/* ======================================================== */}
      {/* CMS SIDEBAR */}
      {/* ======================================================== */}
      <aside className="w-full md:w-64 bg-[#0a2313] text-white flex flex-col justify-between shrink-0 border-r border-[#164a27] shadow-xl">
        <div>
          {/* Top Brand Banner */}
          <div className="p-4 sm:p-5 border-b border-[#164a27]">
            <ZambiaAirwaysLogo variant="full" theme="dark" size="sm" showSubtitle={false} />
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                QSA CMS Console
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#F37C1C]/20 text-[#F37C1C] border border-[#F37C1C]/40">
                v3.2 Active
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 text-xs font-bold">
            <button
              onClick={() => setActiveCmsTab('inbox')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all ${
                activeCmsTab === 'inbox'
                  ? 'bg-[#1B8E44] text-white shadow-sm'
                  : 'text-emerald-100/80 hover:bg-[#123e20] hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Inbox className="w-4 h-4 text-[#F37C1C]" />
                <span>Submissions Inbox</span>
              </div>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-black/30 text-white">
                {metrics.total}
              </span>
            </button>

            <button
              onClick={() => setActiveCmsTab('analytics')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all ${
                activeCmsTab === 'analytics'
                  ? 'bg-[#1B8E44] text-white shadow-sm'
                  : 'text-emerald-100/80 hover:bg-[#123e20] hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-[#F37C1C]" />
              <span>Safety Analytics</span>
            </button>

            <button
              onClick={() => setActiveCmsTab('sync')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all ${
                activeCmsTab === 'sync'
                  ? 'bg-[#1B8E44] text-white shadow-sm'
                  : 'text-emerald-100/80 hover:bg-[#123e20] hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-[#F37C1C]" />
              <span>SharePoint & Excel Sync</span>
            </button>

            <button
              onClick={() => setActiveCmsTab('accounts')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all ${
                activeCmsTab === 'accounts'
                  ? 'bg-[#1B8E44] text-white shadow-sm'
                  : 'text-emerald-100/80 hover:bg-[#123e20] hover:text-white'
              }`}
            >
              <Users className="w-4 h-4 text-[#F37C1C]" />
              <span>{isManager ? 'User Accounts' : 'My Account'}</span>
            </button>

            <button
              onClick={() => setActiveCmsTab('settings')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-all ${
                activeCmsTab === 'settings'
                  ? 'bg-[#1B8E44] text-white shadow-sm'
                  : 'text-emerald-100/80 hover:bg-[#123e20] hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4 text-[#F37C1C]" />
              <span>CMS Configuration</span>
            </button>

          </nav>
        </div>

        {/* Bottom Officer Status & Controls */}
        <div className="p-3 border-t border-[#164a27] bg-[#071b0e]/70">
          <div className="px-2.5 py-2 rounded-lg bg-[#0e3b1f] border border-[#1b8e44]/40 flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <div className="text-xs font-extrabold text-white truncate">
                {currentUser?.displayName || currentUser?.email}
              </div>
              <div className="text-[10px] text-emerald-300 flex items-center gap-1 font-medium mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {role ? ROLE_INFO[role].label : ''}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-md hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition-colors"
              title="Sign out of CMS"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MAIN CMS WORKSPACE */}
      {/* ======================================================== */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top CMS Header Ribbon */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <span className="text-[#1B8E44] uppercase tracking-wider">CMS Console</span>
            <span>/</span>
            <span className="text-slate-900 capitalize font-extrabold">
              {activeCmsTab === 'inbox' && 'Submissions Management'}
              {activeCmsTab === 'analytics' && 'Safety Analytics & Metrics'}
              {activeCmsTab === 'sync' && 'Excel & SharePoint Sync Engine'}
              {activeCmsTab === 'accounts' && (isManager ? 'User Accounts' : 'My Account')}
              {activeCmsTab === 'settings' && 'CMS Policy Settings'}
            </span>
          </div>

          {/* Search all cases (every field, every report type) */}
          <div className="relative flex-1 max-w-md mx-2 hidden md:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={globalSearchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (activeCmsTab !== 'inbox') setActiveCmsTab('inbox');
                if (e.target.value && selectedCategoryTab !== 'all') setSelectedCategoryTab('all');
              }}
              placeholder="Search all cases: number, location, flight, words... ( / )"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1B8E44]/40"
              aria-label="Search all cases"
            />
            {searchQuery.trim() && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 bg-white px-1.5 rounded">
                {filteredReports.length} found
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {backendMode === 'firestore' && !reportsError ? (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{usingEmulators ? 'Local emulators (live)' : 'Online Firestore Connected (live)'}</span>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>
                  {backendMode === 'local'
                    ? 'Preview mode: saved in this browser'
                    : backendMode === 'memory'
                      ? 'Preview mode: not connected to Firestore'
                      : 'Firestore read error'}
                </span>
              </div>
            )}

            {onNavigatePublicSite && (
              <button
                onClick={onNavigatePublicSite}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors flex items-center gap-1.5 text-xs font-bold"
                title="Go to the public reporting homepage"
              >
                <Home className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Homepage</span>
              </button>
            )}

            <button
              onClick={loadReports}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors flex items-center gap-1.5 text-xs font-bold"
              title="Refresh database records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>
          </div>
        </header>

        {/* Tab 1: Submissions Inbox */}
        {/* A Super Admin asked to change this (Super Admin) user's own account */}
        {myPendingAction && (
          <div className="mx-4 sm:mx-6 mt-4 sm:mt-6 p-4 rounded-2xl border-2 border-amber-300 bg-amber-50 text-amber-950 shadow-sm">
            <div className="flex items-start gap-3 flex-wrap">
              <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm font-black">Your confirmation is needed</p>
                <p className="text-xs mt-0.5">
                  <strong>{myPendingAction.requestedByEmail}</strong> has asked to{' '}
                  <strong>{describePendingAction(myPendingAction, 'your')}</strong>. Nothing changes unless you approve.
                </p>
                {pendingError && <p className="text-xs text-rose-700 mt-1">{pendingError}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={answeringPending}
                  onClick={() => answerPending(false)}
                  className="px-3.5 py-2 rounded-lg border border-amber-400 bg-white hover:bg-amber-100 text-xs font-bold disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={answeringPending}
                  onClick={() => answerPending(true)}
                  className="px-3.5 py-2 rounded-lg bg-[#DE2010] hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                >
                  {answeringPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Approve
                </button>
              </div>
            </div>
          </div>
        )}

        {activeCmsTab === 'inbox' && (
          <div className="p-4 sm:p-6 space-y-6">
            {backendMode === 'local' && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="flex-1">
                  <strong>Preview mode — saved in this browser only.</strong> Reports submitted from any tab of this
                  browser on this computer appear here and survive reloads. Reports from other browsers or devices
                  will not. Connect Firebase (<code>VITE_FIREBASE_*</code> in <code>.env.local</code>) for real use.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete all preview reports saved in this browser?')) clearPreviewReports();
                  }}
                  className="shrink-0 text-[11px] font-bold text-amber-900 border border-amber-300 hover:bg-amber-100 px-2 py-1 rounded-md"
                >
                  Clear test data
                </button>
              </div>
            )}
            {backendMode === 'memory' && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Preview mode — Firebase is not configured.</strong> Reports are only kept in this browser tab
                  and are lost on reload. Submissions made in another tab, browser or device will not appear here.
                  Set the <code>VITE_FIREBASE_*</code> variables (see <code>.env.example</code>) and restart the app to use the real database.
                </span>
              </div>
            )}
            {isManager && pendingDeletionCount > 0 && !pendingDeletionOnly && (
              <button
                type="button"
                onClick={() => {
                  setPendingDeletionOnly(true);
                  setShowArchived(false);
                }}
                className="w-full text-left p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center gap-2 hover:bg-rose-100 transition-colors"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>{pendingDeletionCount} deletion request{pendingDeletionCount === 1 ? '' : 's'} awaiting your approval.</strong>{' '}
                  Click to review.
                </span>
              </button>
            )}
            {reportsError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span><strong>Some reports could not be loaded.</strong> {reportsError}</span>
              </div>
            )}
            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Total</span>
                <span className="text-2xl font-black text-slate-900 mt-0.5 block">{metrics.total}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block">New Pending</span>
                <span className="text-2xl font-black text-emerald-700 mt-0.5 block">{metrics.new}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/20 shadow-2xs">
                <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider block">Urgent Action</span>
                <span className="text-2xl font-black text-rose-700 mt-0.5 block">{metrics.urgent}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block">Hazards</span>
                <span className="text-2xl font-black text-amber-700 mt-0.5 block">{metrics.hazards}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-[#1E2522] uppercase tracking-wider block">Incidents</span>
                <span className="text-2xl font-black text-[#1E2522] mt-0.5 block">{metrics.incidents}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block">Accidents</span>
                <span className="text-2xl font-black text-rose-700 mt-0.5 block">{metrics.accidents}</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block">Concerns</span>
                <span className="text-2xl font-black text-emerald-700 mt-0.5 block">{metrics.concerns}</span>
              </div>
            </div>

            {/* Main Submissions Table Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Category Filter Tabs */}
              <div className="border-b border-slate-200 px-4 sm:px-6 pt-3 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-1">
                  {[
                    { id: 'all', label: 'All Reports' },
                    { id: 'hazard', label: 'Hazards (HAZ)' },
                    { id: 'occurrence', label: 'Accidents / Incidents (IA)' },
                    { id: 'concern', label: 'Concerns (SC)' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedCategoryTab(tab.id as any)}
                      className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                        selectedCategoryTab === tab.id
                          ? 'border-[#1B8E44] text-[#1B8E44]'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 pb-2">
                  <button
                    onClick={() => handleExport('xlsx')}
                    disabled={filteredReports.length === 0}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-[#1B8E44]" />
                    <span>Export Excel</span>
                  </button>
                  <button
                    onClick={() => handleExport('csv')}
                    disabled={filteredReports.length === 0}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                  >
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Filters row */}
              <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/50 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search every field..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-[#1B8E44]"
                    />
                  </div>

                  {/* Status Filter */}
                  <div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-[#1B8E44] font-medium"
                    >
                      <option value="all">All Statuses</option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          Status: {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reporting Type */}
                  <div>
                    <select
                      value={reportingFilter}
                      onChange={(e) => setReportingFilter(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-[#1B8E44] font-medium"
                    >
                      <option value="all">All Reporting Methods</option>
                      <option value="Named">Open Reports</option>
                      <option value="Confidential">Confidential Reports</option>
                      <option value="Anonymous">Anonymous Reports</option>
                    </select>
                  </div>

                  {/* Quick Toggles */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={urgentOnly}
                        onChange={(e) => setUrgentOnly(e.target.checked)}
                        className="w-4 h-4 text-rose-600 rounded border-slate-300"
                      />
                      <span className="font-bold text-rose-700">Urgent Only</span>
                    </label>

                    <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasEvidenceOnly}
                        onChange={(e) => setHasEvidenceOnly(e.target.checked)}
                        className="w-4 h-4 text-[#1B8E44] rounded border-slate-300"
                      />
                      <span>With Attachments</span>
                    </label>

                    {isManager && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={pendingDeletionOnly}
                          onChange={(e) => {
                            setPendingDeletionOnly(e.target.checked);
                            if (e.target.checked) setShowArchived(false);
                          }}
                          className="w-4 h-4 text-rose-600 rounded border-slate-300"
                        />
                        <span className="font-bold text-rose-700">
                          Deletion requests ({pendingDeletionCount})
                        </span>
                      </label>
                    )}

                    {isManager && (
                      <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={showArchived}
                          onChange={(e) => {
                            setShowArchived(e.target.checked);
                            if (e.target.checked) setPendingDeletionOnly(false);
                          }}
                          className="w-4 h-4 text-slate-600 rounded border-slate-300"
                        />
                        <span>Archived</span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Report type + date range (type stays in step with the tabs above) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                  <label className="space-y-1 text-xs">
                    <span className="font-bold text-slate-600 block">Report type</span>
                    <select
                      value={selectedCategoryTab}
                      onChange={(e) => setSelectedCategoryTab(e.target.value as any)}
                      className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-[#1B8E44] font-medium"
                    >
                      <option value="all">All types</option>
                      <option value="hazard">Hazard</option>
                      <option value="occurrence">Accident / Incident</option>
                      <option value="concern">Safety Concern</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-bold text-slate-600 block">Reported from</span>
                    <input
                      type="date"
                      value={startDate}
                      max={endDate || undefined}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-[#1B8E44]"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="font-bold text-slate-600 block">Reported to</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full py-1.5 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-[#1B8E44]"
                    />
                  </label>
                  <div>
                    {(startDate || endDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate('');
                          setEndDate('');
                        }}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline py-1.5"
                      >
                        Clear dates
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Super Admin: bulk delete bar */}
              {canBulkDelete && (selectedIds.size > 0 || bulkStatus) && (
                <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-3 text-xs">
                  {selectedIds.size > 0 && (
                    <>
                      <span className="font-bold text-slate-800">
                        {selectedIds.size} case{selectedIds.size === 1 ? '' : 's'} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        disabled={bulkStatus?.kind === 'busy'}
                        className="font-semibold text-slate-600 hover:text-slate-900 underline disabled:opacity-50"
                      >
                        Clear
                      </button>
                      {canBulkDelete && (
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        disabled={bulkStatus?.kind === 'busy'}
                        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#DE2010] hover:bg-[#b81a0d] text-white font-bold disabled:opacity-50"
                      >
                        {bulkStatus?.kind === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        Delete selected permanently ({selectedIds.size})
                      </button>
                      )}
                    </>
                  )}
                  {bulkStatus && (
                    <span
                      className={`w-full font-semibold ${
                        bulkStatus.kind === 'error' ? 'text-rose-700' : bulkStatus.kind === 'ok' ? 'text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {bulkStatus.text}
                      {bulkStatus.kind !== 'busy' && (
                        <button type="button" onClick={() => setBulkStatus(null)} className="ml-2 underline text-slate-500">
                          Dismiss
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* Table Data */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-extrabold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      {canBulkDelete && (
                        <th className="py-3 pl-4 pr-0 w-8">
                          <input
                            type="checkbox"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAll}
                            disabled={filteredReports.length === 0 || bulkStatus?.kind === 'busy'}
                            title="Select all cases shown"
                            aria-label="Select all cases shown"
                            className="w-4 h-4 accent-[#DE2010] cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="py-3 px-4">Report ID</th>
                      <th className="py-3 px-4">Form</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Date Reported</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Urgent</th>
                      <th className="py-3 px-4">Evidence</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {filteredReports.length === 0 ? (
                      <tr>
                        <td colSpan={canBulkDelete ? 10 : 9} className="py-12 text-center text-slate-500">
                          <FolderOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-bold">No safety reports match your filters</p>
                          <p className="text-[11px] text-slate-400 mt-1">Try adjusting the search criteria or status filter.</p>
                        </td>
                      </tr>
                    ) : (
                      filteredReports.map((report) => (
                        <tr
                          key={report.reportId}
                          onClick={() => setSelectedReport(report)}
                          className={`hover:bg-emerald-50/40 cursor-pointer transition-colors ${
                            selectedIds.has(report.reportId) ? 'bg-emerald-50/60' : isOpenUrgent(report) ? 'bg-rose-50/30' : ''
                          }`}
                        >
                          {canBulkDelete && (
                            <td className="py-3.5 pl-4 pr-0" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(report.reportId)}
                                onChange={() => toggleSelected(report.reportId)}
                                disabled={bulkStatus?.kind === 'busy'}
                                aria-label={`Select ${report.reportId}`}
                                className="w-4 h-4 accent-[#DE2010] cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                            {report.reportId}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`font-mono text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                                occurrenceKind(report) === 'Accident'
                                  ? 'bg-[#DE2010] text-white border-[#DE2010]'
                                  : occurrenceKind(report) === 'Incident'
                                    ? 'bg-[#1E2522] text-white border-[#1E2522]'
                                    : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                              title={report.reclassifiedTo ? `Moved from ${FORMS_META[report.form].title}` : undefined}
                            >
                              {occurrenceKind(report) || FORMS_META[effectiveForm(report)].prefix}
                            </span>
                            {report.reclassifiedTo && report.reclassifiedTo !== report.form && (
                              <span
                                className="block mt-1 w-max text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap"
                                title={`Submitted as ${FORMS_META[report.form].title}, moved to ${FORMS_META[effectiveForm(report)].title}. The case number was kept.`}
                              >
                                Moved {FORMS_META[report.form].prefix} → {FORMS_META[effectiveForm(report)].prefix}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                report.reporting === 'Anonymous'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : report.reporting === 'Confidential'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {reportingLabel(report.reporting)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-mono">
                            {report.dateReported || '-'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-800 max-w-[160px] truncate" title={report.location}>
                            {report.location || '-'}
                          </td>
                          <td className="py-3.5 px-4">
                            {isOpenUrgent(report) ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#DE2010] text-white animate-pulse">
                                Urgent
                              </span>
                            ) : report.urgent === 'Yes' ? (
                              <span className="text-[10px] font-bold text-slate-400" title="Was marked urgent; the case is closed">
                                Urgent (closed)
                              </span>
                            ) : (
                              <span className="text-slate-400">No</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {report.evidenceCount && report.evidenceCount > 0 ? (
                              <span className="inline-flex items-center gap-1 font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                <Paperclip className="w-3 h-3 text-[#1B8E44]" />
                                {report.evidenceCount}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                                report.status === 'Closed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : report.status === 'Under review'
                                  ? 'bg-sky-100 text-sky-800'
                                  : report.status === 'Action required'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-slate-200 text-slate-800'
                              }`}
                            >
                              {report.status || 'New'}
                            </span>
                            {!report.deleted && report.deletionRequest?.status === 'pending' && (
                              <span className="block mt-1 text-[9px] font-black uppercase text-rose-700">
                                Deletion requested
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedReport(report);
                              }}
                              className="px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-[#1B8E44] hover:text-white hover:border-[#1B8E44] text-slate-700 font-bold transition-all shadow-2xs"
                            >
                              Inspect
                            </button>
                            {role === 'superadmin' && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!currentUser) return;
                                  try {
                                    if (await confirmAndDeleteCase(report, currentUser)) loadReports();
                                  } catch (err: any) {
                                    window.alert(err.message);
                                  }
                                }}
                                title="Delete permanently"
                                aria-label={`Delete ${report.reportId} permanently`}
                                className="ml-1.5 p-1.5 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all align-middle"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Safety Analytics & KPIs */}
        {activeCmsTab === 'analytics' && (
          <div className="p-4 sm:p-6 space-y-6">
            <div>
              <h2 className="text-lg font-black text-slate-900">Safety Performance Indicators (SPI)</h2>
              <p className="text-xs text-slate-500">ICAO Annex 19 safety assurance and resolution metrics</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Occurrence Categories</span>
                <div className="space-y-2 pt-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Hazards</span>
                      <span>{metrics.hazards} ({metrics.total ? Math.round((metrics.hazards / metrics.total) * 100) : 0}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#F37C1C] h-full"
                        style={{ width: `${metrics.total ? (metrics.hazards / metrics.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Incidents</span>
                      <span>{metrics.incidents} ({metrics.total ? Math.round((metrics.incidents / metrics.total) * 100) : 0}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#1E2522] h-full"
                        style={{ width: `${metrics.total ? (metrics.incidents / metrics.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Accidents</span>
                      <span>{metrics.accidents} ({metrics.total ? Math.round((metrics.accidents / metrics.total) * 100) : 0}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#DE2010] h-full"
                        style={{ width: `${metrics.total ? (metrics.accidents / metrics.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>Safety Concerns</span>
                      <span>{metrics.concerns} ({metrics.total ? Math.round((metrics.concerns / metrics.total) * 100) : 0}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#1B8E44] h-full"
                        style={{ width: `${metrics.total ? (metrics.concerns / metrics.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Investigation Resolution</span>
                <div className="text-3xl font-black text-slate-900">
                  {metrics.total ? Math.round((metrics.closed / metrics.total) * 100) : 100}%
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Percentage of logged reports resolved and marked as Closed following QSA risk assessment.
                </p>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-900">
                  Active Under Review: <strong>{metrics.underReview}</strong>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reporting Trust Indicator</span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Anonymous Reports</span>
                    <span>{reports.filter((r) => r.reporting === 'Anonymous').length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Confidential Reports</span>
                    <span>{reports.filter((r) => r.reporting === 'Confidential').length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>Open Reports</span>
                    <span>{reports.filter((r) => r.reporting === 'Named').length}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Demonstrates active engagement with Zambia Airways Just Culture policy.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Excel & SharePoint Sync */}
        {activeCmsTab === 'sync' && <ExcelSyncPanel reports={reports} role={role} />}

        {/* Tab 5: CMS Configuration */}
        {activeCmsTab === 'accounts' && (
          <AccountsPanel
            currentUid={currentUser?.uid || ''}
            currentEmail={currentUser?.email || ''}
            canManage={isManager}
            myRole={role}
            onPasswordChanged={async () => {
              // Same as everywhere else: after a password change, sign in again with the new one
              setLoginNotice('Your password has been changed. Sign in with your new password.', currentUser?.email || undefined);
              await handleSignOut();
            }}
            onTwoFactorEnrolled={async () => {
              window.alert('2FA is now on. Please sign in again: after your password you will be asked for the code from your app.');
              await handleSignOut();
            }}
          />
        )}

        {activeCmsTab === 'settings' && (
          <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
            <div>
              <h2 className="text-lg font-black text-slate-900">QSA CMS System Settings</h2>
              <p className="text-xs text-slate-500">System configuration, regulatory parameters, and compliance details</p>
            </div>

            {role === 'superadmin' && <AnnouncementEditor currentEmail={currentUser?.email || ''} />}

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Airline Operator</span>
                  <div className="font-extrabold text-slate-900">Zambia Airways (2014) Limited</div>
                  <div className="text-slate-500">IATA: Z9 • ICAO: AZB</div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Regulatory Standard</span>
                  <div className="font-extrabold text-slate-900">ZCAA Safety Management System</div>
                  <div className="text-slate-500">ICAO Annex 19 Safety Framework</div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">QSA Department</span>
                  <div className="font-extrabold text-slate-900">+260 211 431 511</div>
                  <div className="text-slate-500">qsa@zambiaairways.co.zm</div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">CMS System Architecture</span>
                  <div className="font-extrabold text-slate-900">Independent Multi-Portal Routing</div>
                  <div className="text-slate-500">Firebase Firestore Spark Tier (Atomic WriteBatch)</div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 text-xs text-slate-500">
                Access to this CMS is verified against the Firestore <code>admins</code> collection. Each user has a privilege level: <strong>Viewer</strong> (read only), <strong>Officer</strong> (update reports, request deletion) or <strong>Manager</strong> (approve deletions, see reporter identities, manage users).
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Detail Inspection Drawer */}
      <DetailDrawer
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onReportUpdated={() => {
          // The live listener refreshes the list and the open drawer automatically
          loadReports();
        }}
        isQsaAdmin={isQsaAdmin}
        role={role || 'viewer'}
        currentUser={currentUser}
      />

    </div>
  );
};
