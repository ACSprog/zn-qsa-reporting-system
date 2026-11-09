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
