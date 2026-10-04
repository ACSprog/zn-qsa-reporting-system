export type FormType = 'hazard' | 'incident' | 'accident' | 'concern';

export type ReportingType = 'Named' | 'Confidential' | 'Anonymous';

export type ReportStatus = 'New' | 'Under review' | 'Action required' | 'Closed';

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
