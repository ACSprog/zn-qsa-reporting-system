import { FormType, ReportingType } from '../types';
import { FORMS_META } from '../config/fields';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReportId(form: FormType, dateObj: Date = new Date()): string {
  const prefix = FORMS_META[form]?.prefix || 'SAF';
  
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  let randomPart = '';
  // Use crypto.getRandomValues for cryptographically sound random selection
  const randomBytes = new Uint8Array(5);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
    for (let i = 0; i < 5; i++) {
      randomPart += ALPHABET[randomBytes[i] % ALPHABET.length];
    }
  } else {
    for (let i = 0; i < 5; i++) {
      randomPart += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  }

  return `${prefix}-${dateStr}-${randomPart}`;
}

/**
 * Ensures reporter identity fields are completely blanked out when reporting is Anonymous.
 */
export function stripIdentityIfAnonymous<T extends Record<string, any>>(
  data: T,
  reporting: ReportingType
): T {
  if (reporting === 'Anonymous') {
    return {
      ...data,
      name: '',
      department: '',
      position: '',
      contact: ''
    };
  }
  return data;
}

/**
 * Extracts standard routing category based on Section 4:
 * hazardCategory for Hazard, incidentType for Incident, concernCategory for Concern, '' for Accident.
 */
export function getCategoryForForm(form: FormType, data: Record<string, any>): string {
  switch (form) {
    case 'hazard':
      return data.hazardCategory || '';
    case 'incident':
      return data.incidentType || '';
    case 'concern':
      return data.concernCategory || '';
    case 'accident':
      return '';
    default:
      return '';
  }
}
