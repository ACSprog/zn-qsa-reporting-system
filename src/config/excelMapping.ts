import { FormType } from '../types';

export interface HeaderMapping {
  header: string;
  fieldKey: string;
}

export const COMMON_EXCEL_HEADERS: HeaderMapping[] = [
  { header: 'Report ID', fieldKey: 'reportId' },
  { header: 'Date Reported', fieldKey: 'dateReported' },
  { header: 'Reporting', fieldKey: 'reporting' },
  { header: 'Reporter Name', fieldKey: 'name' },
  { header: 'Department / Work Area', fieldKey: 'department' },
  { header: 'Position / Role', fieldKey: 'position' },
  { header: 'Contact', fieldKey: 'contact' },
  { header: 'Date of Event / Observation', fieldKey: 'eventDate' },
  { header: 'Time (if known)', fieldKey: 'eventTime' },
  { header: 'Location / Station', fieldKey: 'location' },
  { header: 'Does it require urgent attention?', fieldKey: 'urgent' },
  { header: 'Is anyone currently exposed to immediate risk?', fieldKey: 'exposedToRisk' },
  { header: 'Did you notify anyone at the time?', fieldKey: 'notified' },
  { header: 'Person / department notified (if applicable)', fieldKey: 'notifiedWho' }
];

export const HAZARD_EXCEL_HEADERS: HeaderMapping[] = [
  { header: 'Hazard Category', fieldKey: 'hazardCategory' },
  { header: 'Where was the hazard identified?', fieldKey: 'whereIdentified' },
  { header: 'What is the hazard?', fieldKey: 'whatIsHazard' },
  { header: 'What could happen if it is not controlled?', fieldKey: 'whatCouldHappen' },
  { header: 'Who / what could be affected?', fieldKey: 'whoAffected' },
  { header: 'Action you took immediately (if any)', fieldKey: 'immediateAction' },
  { header: 'Supporting evidence / attachment reference', fieldKey: 'evidence' }
];

export const INCIDENT_EXCEL_HEADERS: HeaderMapping[] = [
  { header: 'Incident Type / Category', fieldKey: 'incidentType' },
  { header: 'Briefly, what happened?', fieldKey: 'whatHappened' },
  { header: 'What was happening immediately before the event?', fieldKey: 'before' },
  { header: 'What action was taken?', fieldKey: 'actionTaken' },
  { header: 'Was the situation brought under control?', fieldKey: 'underControl' },
  { header: 'Was there injury or damage?', fieldKey: 'injuryOrDamage' },
  { header: 'Operational impact', fieldKey: 'operationalImpact' },
  { header: 'Were emergency procedures used?', fieldKey: 'emergencyProcedures' },
  { header: 'Was ATC / airport / another organisation involved?', fieldKey: 'atcInvolved' },
  { header: 'Supporting evidence / attachment reference', fieldKey: 'evidence' }
];

/** Combined Incident / Accident form (sheet / table tblOccurrence) */
export const OCCURRENCE_EXCEL_HEADERS: HeaderMapping[] = [
  { header: 'Incident or Accident', fieldKey: 'occurrenceType' },
  { header: 'Category', fieldKey: 'incidentType' },
  { header: 'Briefly, what happened?', fieldKey: 'whatHappened' },
  { header: 'What was happening immediately before the event?', fieldKey: 'before' },
  { header: 'Phase of operation / activity', fieldKey: 'phase' },
  { header: 'Aircraft / vehicle / equipment involved', fieldKey: 'equipment' },
  { header: 'Persons involved / affected', fieldKey: 'personsInvolved' },
  { header: 'What action was taken?', fieldKey: 'actionTaken' },
  { header: 'Was the situation brought under control?', fieldKey: 'underControl' },
  { header: 'Was anyone injured?', fieldKey: 'injured' },
  { header: 'Known injury details', fieldKey: 'injuryDetails' },
  { header: 'Known aircraft / equipment / property damage', fieldKey: 'damage' },
  { header: 'Operational impact', fieldKey: 'operationalImpact' },
  { header: 'Emergency procedures / services / evacuation', fieldKey: 'emergencyProcedures' },
  { header: 'Was ATC / airport / another organisation involved?', fieldKey: 'atcInvolved' },
  { header: 'Supporting evidence / attachment reference', fieldKey: 'evidence' }
];

export const ACCIDENT_EXCEL_HEADERS: HeaderMapping[] = [
  { header: 'Brief description of what happened', fieldKey: 'description' },
  { header: 'Accident location', fieldKey: 'accidentLocation' },
  { header: 'Phase of operation / activity', fieldKey: 'phase' },
  { header: 'Aircraft / vehicle / equipment involved', fieldKey: 'equipment' },
  { header: 'Persons involved / affected', fieldKey: 'personsInvolved' },
  { header: 'Was anyone injured?', fieldKey: 'injured' },
  { header: 'Known injury details', fieldKey: 'injuryDetails' },
  { header: 'Known aircraft / equipment / property damage', fieldKey: 'damage' },
  { header: 'Emergency services / evacuation / rescue involved?', fieldKey: 'emergencyServices' },
  { header: 'Immediate action taken', fieldKey: 'immediateAction' },
  { header: 'Supporting evidence', fieldKey: 'evidence' }
];

export const CONCERN_EXCEL_HEADERS: HeaderMapping[] = [
  { header: 'Concern Category', fieldKey: 'concernCategory' },
  { header: 'What is the safety concern?', fieldKey: 'whatIsConcern' },
  { header: 'Where / in which activity does it exist?', fieldKey: 'whereExists' },
  { header: 'How long has it existed, if known?', fieldKey: 'howLong' },
  { header: 'Is it recurring?', fieldKey: 'recurring' },
  { header: 'Who / what could be affected?', fieldKey: 'whoAffected' },
  { header: 'What could happen if it is not addressed?', fieldKey: 'whatCouldHappen' },
  { header: 'Have you raised it before?', fieldKey: 'raisedBefore' },
  { header: 'What do you think could improve the situation?', fieldKey: 'suggestion' },
  { header: 'Supporting evidence / attachment reference', fieldKey: 'evidence' }
];

export const EVIDENCE_TAIL_HEADERS: HeaderMapping[] = [
  { header: 'Evidence Files', fieldKey: 'evidenceCount' },
  { header: 'Evidence Folder', fieldKey: 'evidenceFolder' }
];

export function getExcelHeadersForForm(form: FormType): HeaderMapping[] {
  let specific: HeaderMapping[] = [];
  switch (form) {
    case 'hazard':
      specific = HAZARD_EXCEL_HEADERS;
      break;
    case 'occurrence':
      specific = OCCURRENCE_EXCEL_HEADERS;
      break;
    case 'incident':
      specific = INCIDENT_EXCEL_HEADERS;
      break;
    case 'accident':
      specific = ACCIDENT_EXCEL_HEADERS;
      break;
    case 'concern':
      specific = CONCERN_EXCEL_HEADERS;
      break;
  }
  return [...COMMON_EXCEL_HEADERS, ...specific, ...EVIDENCE_TAIL_HEADERS];
}

/** Excel table (in "Safety Reports.xlsx") that each form's cases go into */
export const EXCEL_TABLE_FOR_FORM: Record<FormType, string> = {
  hazard: 'tblHazard',
  occurrence: 'tblOccurrence',
  concern: 'tblConcern',
  incident: 'tblIncident',
  accident: 'tblAccident'
};

/**
 * One case as an Excel row: { "<column header>": "<value>" } for every column of the form's
 * table. Sent to Power Automate so a single "Add a row into a table" step works for all forms.
 */
export function buildExcelRow(form: FormType, data: Record<string, any>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const { header, fieldKey } of getExcelHeadersForForm(form)) {
    const v = data[fieldKey];
    row[header] = v === undefined || v === null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  }
  return row;
}

/**
 * Builds a normalized lookup dictionary (lowercase, trimmed) to map any incoming Excel header
 * (regardless of minor casing or spacing differences) to the canonical fieldKey.
 */
export function buildHeaderToFieldMap(form: FormType): Map<string, string> {
  const mappings = getExcelHeadersForForm(form);
  const map = new Map<string, string>();
  for (const m of mappings) {
    map.set(m.header.trim().toLowerCase(), m.fieldKey);
  }
  return map;
}
