import { BaseReportData } from '../types';
import { effectiveForm } from './display';
import {
  dispatchPowerAutomateFlow,
  fetchReportEvidence,
  fetchReporterIdentity
} from './firebase';
import { logAudit } from './audit';

export interface RestoreResult {
  ok: boolean;
  message: string;
}

const RESTRICTED = '[restricted]';

/**
 * "Sync to Excel" for ONE report. Re-sends it to the same Power Automate flow
 * with restore = true. The flow adds the Excel row only if it is missing,
 * re-uploads evidence to SharePoint, and sends NO email.
 *
 * The browser cannot read the flow's reply (no-cors), so this can only confirm
 * that the report was sent, not that Excel was updated.
 */
export async function restoreReportToExcel(report: BaseReportData): Promise<RestoreResult> {
  try {
    const isAnonymous = report.reporting === 'Anonymous';

    // Identity: always blank for Anonymous; "[restricted]" if this owner cannot read it
    let identity = { name: '', department: '', position: '', contact: '' };
    if (!isAnonymous) {
      const stored = await fetchReporterIdentity(report.reportId);
      identity = stored
        ? {
            name: stored.name || '',
            department: stored.department || '',
            position: stored.position || '',
            contact: stored.contact || ''
          }
        : {
            name: RESTRICTED,
            department: RESTRICTED,
            position: RESTRICTED,
            contact: RESTRICTED
          };
    }

    // Evidence files come from the Firestore backup
    const expected = report.evidenceCount || 0;
    const evidenceFiles = expected > 0 ? await fetchReportEvidence(report.form, report.reportId) : [];
    if (evidenceFiles.length < expected) {
      return {
        ok: false,
        message: `Only ${evidenceFiles.length} of ${expected} evidence files could be read from Firestore. Nothing was sent.`
      };
    }

    // Leave out Firestore-only fields
    const { createdAt, status, notes, deleted, ...reportFields } = report;

    // A case moved to another type goes to that type's existing Excel table (case number kept).
    // Its main description is copied into the new type's description column so it isn't blank.
    const target = effectiveForm(report);
    const fields: Record<string, any> = { ...reportFields };
    if (target !== report.form) {
      const description = fields.whatIsHazard || fields.whatHappened || fields.whatIsConcern || fields.description || '';
      if (target === 'hazard') fields.whatIsHazard = fields.whatIsHazard || description;
      if (target === 'occurrence') fields.whatHappened = fields.whatHappened || description;
      if (target === 'concern') fields.whatIsConcern = fields.whatIsConcern || description;
    }

    const sent = dispatchPowerAutomateFlow(
      target,
      report.reportId,
      { ...fields, ...identity },
      report.category || '',
      expected,
      report.evidenceFolder || '',
      evidenceFiles,
      true
    );

    if (!sent) {
      return {
        ok: false,
        message: `No Power Automate URL is configured for this form (VITE_FLOW_URL_${target.toUpperCase()}).`
      };
    }

    await logAudit('case.excel-sync', 'case', report.reportId, `Sent ${report.reportId} to the ${target} Excel sheet`, {
      sheet: target,
      reporterIdentityIncluded: !isAnonymous
    });
    return {
      ok: true,
      message: 'Sent to Power Automate. Check the Excel workbook in a minute. This app cannot see the flow\u2019s reply.'
    };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Could not prepare the report for syncing.' };
  }
}
