/** Small display helpers shared by the public forms and the CMS. */
import { BaseReportData, FormType, ReportingType, formGroup } from '../types';

/**
 * "Named" reports are shown as "Open" reports (the stored value stays 'Named' so existing
 * records, security rules and identity handling keep working).
 */
export function reportingLabel(value: ReportingType | string | undefined): string {
  if (value === 'Named') return 'Open';
  return value || '';
}

/** Urgent only matters while a case is still being worked on. */
export function isOpenUrgent(r: Pick<BaseReportData, 'urgent' | 'status' | 'deleted'>): boolean {
  return r.urgent === 'Yes' && r.status !== 'Closed' && !r.deleted;
}

/** A real https link (not empty, not a "{tenant}"-style placeholder from .env.example). */
export function isUsableLink(url: string | undefined | null): url is string {
  return Boolean(url && /^https:\/\/[^\s{}]+$/i.test(url));
}

/**
 * Everything a CMS user might search for in a case: number, type, every answer, status, notes,
 * deletion / move reasons. (Reporter identities are not on the report, so never searched.)
 */
export function searchableText(r: BaseReportData, typeTitle: string): string {
  const parts: string[] = [typeTitle, reportingLabel(r.reporting)];
  const add = (v: unknown, depth: number) => {
    if (v == null || depth > 2) return;
    if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => add(x, depth + 1));
    else if (typeof v === 'object' && typeof (v as any).toDate !== 'function') Object.values(v as object).forEach((x) => add(x, depth + 1));
  };
  Object.entries(r).forEach(([k, v]) => {
    if (k !== 'evidenceFiles') add(v, 0);
  });
  return parts.join(' \u0001 ').toLowerCase();
}

/** Every word of the query must appear somewhere in the case. */
export function matchesSearch(text: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => text.includes(t));
}

/** The report type a case currently belongs to (a Manager may have moved it). */
export function effectiveForm(r: Pick<BaseReportData, 'form' | 'reclassifiedTo'>): FormType {
  return r.reclassifiedTo || r.form;
}

/** Tab / counter group: old INC and ACC records count as Incident / Accident cases. */
export function reportGroup(r: Pick<BaseReportData, 'form' | 'reclassifiedTo'>): FormType {
  return formGroup(effectiveForm(r));
}

/** For Incident / Accident cases: which of the two it is. */
export function occurrenceKind(r: BaseReportData): 'Incident' | 'Accident' | null {
  const form = effectiveForm(r);
  if (form === 'accident') return 'Accident';
  if (form === 'incident') return 'Incident';
  if (form === 'occurrence') return (r as any).occurrenceType === 'Accident' ? 'Accident' : 'Incident';
  return null;
}
