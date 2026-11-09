/**
 * "Email me my case number": sends the case number to the reporter through the company
 * mailbox (Power Automate flow VITE_FLOW_URL_RECEIPTS, see docs/POWER_AUTOMATE.md).
 *
 * The address is NEVER stored with the report or anywhere in Firestore, so anonymous reports
 * stay anonymous in the database. Only the address, case number and report type go to the flow.
 */
import { FormType, ReportingType } from '../types';
import { FORMS_META } from '../config/fields';

export function isReceiptEmailConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FLOW_URL_RECEIPTS);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && email.trim().length <= 254;
}

/** Fire-and-forget. Returns false if the receipts flow isn't set up. */
export function sendCaseReceipt(email: string, reportId: string, form: FormType, reporting: ReportingType): boolean {
  const flowUrl = import.meta.env.VITE_FLOW_URL_RECEIPTS;
  if (!flowUrl || !isValidEmail(email)) return false;
  const body = {
    token: import.meta.env.VITE_FLOW_TOKEN || '',
    type: 'case-receipt',
    email: email.trim().toLowerCase(),
    reportId,
    formTitle: FORMS_META[form]?.title || form,
    reporting: reporting === 'Named' ? 'Open' : reporting,
    submittedAt: new Date().toISOString()
  };
  fetch(flowUrl, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  }).catch(() => undefined);
  return true;
}
