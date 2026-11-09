import { BaseReportData } from '../types';
import { permanentlyDeleteReport } from './firebase';

/**
 * Super Admin: asks for confirmation (typing the case number) and a reason, then deletes the
 * case permanently. Returns true if it was deleted, false if cancelled; throws on failure.
 */
export async function confirmAndDeleteCase(
  report: BaseReportData,
  by: { uid: string; email?: string | null }
): Promise<boolean> {
  const typed = window.prompt(
    `PERMANENTLY DELETE ${report.reportId}?\n\n` +
      'This removes the case, its evidence files and the reporter\'s details for good. It cannot be undone. ' +
      '(To hide a case but keep it, use Archive instead.) Rows already copied to Excel / SharePoint are not removed.\n\n' +
      `Type the case number ${report.reportId} to confirm:`
  );
  if (typed === null) return false;
  if (typed.trim().toUpperCase() !== report.reportId.toUpperCase()) {
    window.alert('The case number did not match. Nothing was deleted.');
    return false;
  }
  const reason = window.prompt('Reason for deleting (kept in the deletion log):', '');
  if (reason === null) return false;
  const res = await permanentlyDeleteReport(report.form, report.reportId, reason.trim(), by);
  if (!res.ok) throw new Error(res.error || 'Could not delete the case.');
  return true;
}

/**
 * Super Admin: permanently delete several cases at once. Confirmation means typing
 * "DELETE <number of cases>" plus one reason for all of them. Cases are deleted one after
 * another; failures don't stop the rest. Returns null if cancelled.
 */
export async function confirmAndBulkDelete(
  reports: BaseReportData[],
  by: { uid: string; email?: string | null },
  onProgress?: (done: number, total: number) => void
): Promise<{ deleted: string[]; failed: { reportId: string; error: string }[] } | null> {
  const n = reports.length;
  if (n === 0) return null;
  const list = reports
    .slice(0, 15)
    .map((r) => `  • ${r.reportId}`)
    .join('\n');
  const more = n > 15 ? `\n  …and ${n - 15} more` : '';
  const phrase = `DELETE ${n}`;
  const typed = window.prompt(
    `PERMANENTLY DELETE ${n} CASE${n === 1 ? '' : 'S'}?\n\n${list}${more}\n\n` +
      'Each case, its evidence files and the reporter\'s details are removed for good. This cannot be undone. ' +
      'Rows already copied to Excel / SharePoint are not removed.\n\n' +
      `Type ${phrase} to confirm:`
  );
  if (typed === null) return null;
  if (typed.trim().toUpperCase() !== phrase) {
    window.alert(`You need to type ${phrase} exactly. Nothing was deleted.`);
    return null;
  }
  const reason = window.prompt('Reason for deleting these cases (kept in the deletion log):', '');
  if (reason === null) return null;

  const deleted: string[] = [];
  const failed: { reportId: string; error: string }[] = [];
  for (let i = 0; i < n; i++) {
    const r = reports[i];
    onProgress?.(i, n);
    const res = await permanentlyDeleteReport(r.form, r.reportId, reason.trim(), by);
    if (res.ok) deleted.push(r.reportId);
    else failed.push({ reportId: r.reportId, error: res.error || 'Unknown error' });
  }
  onProgress?.(n, n);
  return { deleted, failed };
}
