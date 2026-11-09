/**
 * Editable option lists for dropdowns and radio selections.
 * Zambia Airways (2014) Limited - Safety Management System (SMS)
 */

export const HAZARD_GROUPS = [
  'Flight Operations',
  'Ground Handling & Ramp Services',
  'Maintenance & Engineering',
  'Cabin Safety',
  'Dispatch & Flight Planning',
  'Security & Cargo',
  'Facilities, Hangars & Infrastructure',
  'Information Technology & Avionics',
  'Occupational Health & Environment',
  'Other / Uncategorized'
];

/** Plain-language categories, shared by the Hazard and Safety Concern forms */
const PLAIN_SAFETY_CATEGORIES = [
  'Equipment / Machinery',
  'Human Factors',
  'Environmental',
  'Procedural / Operational',
  'Maintenance Related',
  'Security Related',
  'Other'
];

export const HAZARD_CATEGORIES = PLAIN_SAFETY_CATEGORIES;

export const INCIDENT_TYPES = [
  'Airspace Infringement / Deviation',
  'Altitude / Heading Deviation',
  'ATC Communication / Language Breakdown',
  'Bird / Wildlife Strike',
  'Cabin Smoke, Fume or Odour',
  'Dangerous Goods Spillage / Packaging Failure',
  'Engine Shutdown / In-Flight Turn Back (IFTB)',
  'Fire / Smoke Warning or Alert',
  'Flight Control or Instrumentation Warning',
  'Fuel Imbalance / Low Fuel Advisory',
  'Ground Damage / Vehicle Contact',
  'Hard Landing / Tail Strike',
  'Hydraulic / Electrical Anomaly',
  'Laser Illumination Encounter',
  'Near Collision / TCAS Advisory',
  'Passenger Disturbance / Unruly Passenger',
  'Runway Incursion / Excursion',
  'Security Breach / Sabotage Suspect',
  'Turbulence Encounter with Injury',
  'Unstabilized Approach / Go-Around',
  'Other Operational Occurrence'
];

export const CONCERN_CATEGORIES = PLAIN_SAFETY_CATEGORIES;

export const YES_NO_OPTIONS = ['Yes', 'No'];

export const URGENT_OPTIONS = ['Yes', 'No', 'Not sure'];

export const RECURRING_OPTIONS = ['Yes', 'No', 'Not sure'];

export const REPORTING_TYPES = [
  {
    value: 'Named',
    label: 'Open',
    description: 'Your name and details are recorded with the report.'
  },
  {
    value: 'Confidential',
    label: 'Confidential',
    description: 'Your details are recorded but restricted to QSA.'
  },
  {
    value: 'Anonymous',
    label: 'Anonymous',
    description: 'No personal details are collected.'
  }
];

export const STATUS_OPTIONS = [
  'New',
  'Under review',
  'Action required',
  'Closed'
];
