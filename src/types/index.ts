/**
 * 'occurrence' is the combined Incident / Accident form (IA- case numbers).
 * 'incident' and 'accident' are the old separate forms: no longer offered to reporters, but
 * their records stay readable in the CMS.
 */
export type FormType = 'hazard' | 'occurrence' | 'incident' | 'accident' | 'concern';

/** Forms reporters can submit today */
export const ACTIVE_FORMS: FormType[] = ['hazard', 'occurrence', 'concern'];

/** Every collection the CMS reads (includes the old separate incident/accident forms) */
export const ALL_REPORT_FORMS: FormType[] = ['hazard', 'occurrence', 'incident', 'accident', 'concern'];

/** Old INC/ACC records are shown together with the combined Incident / Accident cases */
export function formGroup(form: FormType): FormType {
  return form === 'incident' || form === 'accident' ? 'occurrence' : form;
}

export type ReportingType = 'Named' | 'Confidential' | 'Anonymous';

export type ReportStatus = 'New' | 'Under review' | 'Action required' | 'Closed';

/** CMS privilege levels (lowest to highest) */
export type CmsRole = 'viewer' | 'officer' | 'manager' | 'superadmin';

/** Manager and Super Admin share the Manager powers over reports */
export const isManagerRole = (role: CmsRole | null | undefined) => role === 'manager' || role === 'superadmin';

export interface ReclassificationRecord {
  from: FormType;
  to: FormType;
  by: string;
  byEmail: string;
  at: any;
  reason?: string;
}

export interface DeletionRequest {
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedByEmail: string;
  requestedAt: any;
  reason: string;
  decidedBy?: string;
  decidedByEmail?: string;
  decidedAt?: any;
}

export interface ProcessedEvidenceFile {
  name: string;        // e.g. evidence-1.jpg, evidence-2.pdf
  contentType: string; // e.g. image/jpeg, application/pdf
  size: number;        // in bytes
  base64: string;      // raw base64 string without data: URL prefix
}

export interface StoredEvidenceDocument {
  name: string;
  contentType: string;
  size: number;
  data: string;
  order: number;
  createdAt: any;
}

export interface ReporterIdentity {
  name: string;
  department: string;
  position: string;
  contact: string;
  reporting: ReportingType;
  reportId: string;
  createdAt?: any;
}

export interface BaseReportData {
  reportId: string;
  form: FormType;
  dateReported: string; // YYYY-MM-DD
  createdAt: any;
  status: ReportStatus;
  notes: string;
  deleted: boolean;
  evidenceCount: number;
  evidenceFolder: string;
  deletionRequest?: DeletionRequest;
  /** Set by a Manager when the case was submitted under the wrong report type (number unchanged) */
  reclassifiedTo?: FormType;
  reclassification?: ReclassificationRecord;
  
  // Section 1: Common basic information
  reporting: ReportingType;
  eventDate: string;
  eventTime?: string;
  location: string;
  flightNo?: string;
  aircraftReg?: string;
  aircraftType?: string;
  urgent: 'Yes' | 'No' | 'Not sure';
  exposedToRisk: 'Yes' | 'No';
  notified: 'Yes' | 'No';
  notifiedWho?: string;
  category?: string;

  // Form specific fields (flexible map for all specific fields)
  [key: string]: any;
}

export interface FieldDefinition {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'time' | 'select' | 'textarea' | 'radio';
  required?: boolean;
  section: 1 | 2 | 3;
  options?: string[];
  placeholder?: string;
  hint?: string;
  /** Only show (and require) this field when another field has the given value */
  showWhen?: { field: string; equals: string };
}

export interface SyncResultPerForm {
  form: FormType;
  tableName: string;
  inFirestore: number;
  inExcel: number;
  missingInExcel: number;
  rowsAdded: number;
  errors?: string[];
}

export interface SyncEvidenceResult {
  checked: number;
  missing: number;
  restored: number;
  errors?: string[];
}

export interface SyncSummary {
  forms: SyncResultPerForm[];
  evidence: SyncEvidenceResult;
  isPreview: boolean;
  timestamp: string;
}
