import { FieldDefinition, FormType } from '../types';
import {
  HAZARD_GROUPS,
  HAZARD_CATEGORIES,
  INCIDENT_TYPES,
  CONCERN_CATEGORIES,
  YES_NO_OPTIONS,
  URGENT_OPTIONS,
  RECURRING_OPTIONS
} from './options';

export interface FormMeta {
  type: FormType;
  title: string;
  prefix: string;
  collection: string;
  tableName: string;
  useWhen: string;
  categoryField: string;
}

export const FORMS_META: Record<FormType, FormMeta> = {
  hazard: {
    type: 'hazard',
    title: 'Hazard Report',
    prefix: 'HAZ',
    collection: 'hazard',
    tableName: 'tblHazard',
    useWhen: 'Use when you notice something that could cause harm or create a safety risk, even if nothing has happened yet.',
    categoryField: 'hazardCategory'
  },
  incident: {
    type: 'incident',
    title: 'Incident Report',
    prefix: 'INC',
    collection: 'incident',
    tableName: 'tblIncident',
    useWhen: 'Use when an unplanned event has occurred. Report what happened; QSA will determine the required follow-up.',
    categoryField: 'incidentType'
  },
  accident: {
    type: 'accident',
    title: 'Accident Report',
    prefix: 'ACC',
    collection: 'accident',
    tableName: 'tblAccident',
    useWhen: 'Use when an occurrence has resulted in actual injury, death, significant damage or another serious consequence. Report facts only.',
    categoryField: ''
  },
  concern: {
    type: 'concern',
    title: 'Safety Concern Report',
    prefix: 'SC',
    collection: 'concern',
    tableName: 'tblConcern',
    useWhen: 'Use when you have a safety-related concern that needs attention but does not clearly fit an immediate hazard or incident.',
    categoryField: 'concernCategory'
  }
};

/**
 * Common Section 1: Basic Information
 */
export const COMMON_SECTION_1_FIELDS: FieldDefinition[] = [
  {
    key: 'eventDate',
    label: 'Date of Event / Observation',
    type: 'date',
    required: true,
    section: 1,
    placeholder: 'YYYY-MM-DD'
  },
  {
    key: 'eventTime',
    label: 'Time (if known)',
    type: 'time',
    required: false,
    section: 1,
    placeholder: 'HH:MM (UTC or Local)'
  },
  {
    key: 'location',
    label: 'Location / Station',
    type: 'text',
    required: true,
    section: 1,
    placeholder: 'e.g. Kenneth Kaunda Int Airport (LUN), Stand 4, Hangar A'
  },
  {
    key: 'flightNo',
    label: 'Flight No. (if applicable)',
    type: 'text',
    required: false,
    section: 1,
    placeholder: 'e.g. Z9 102'
  },
  {
    key: 'aircraftReg',
    label: 'Aircraft Registration (if applicable)',
    type: 'text',
    required: false,
    section: 1,
    placeholder: 'e.g. 9J-...'
  },
  {
    key: 'aircraftType',
    label: 'Aircraft Type (if applicable)',
    type: 'text',
    required: false,
    section: 1,
    placeholder: 'e.g. DHC-8 Q400 / B737'
  }
];

/**
 * Common Section 3: Immediate / Follow-up Information
 */
export const COMMON_SECTION_3_FIELDS: FieldDefinition[] = [
  {
    key: 'urgent',
    label: 'Does it require urgent attention?',
    type: 'radio',
    required: true,
    section: 3,
    options: URGENT_OPTIONS
  },
  {
    key: 'exposedToRisk',
    label: 'Is anyone currently exposed to immediate risk?',
    type: 'radio',
    required: true,
    section: 3,
    options: YES_NO_OPTIONS
  },
  {
    key: 'notified',
    label: 'Did you notify anyone at the time?',
    type: 'radio',
    required: true,
    section: 3,
    options: YES_NO_OPTIONS
  },
  {
    key: 'notifiedWho',
    label: 'Person / department notified (if applicable)',
    type: 'text',
    required: false,
    section: 3,
    placeholder: 'e.g. Shift Duty Manager, Ramp Supervisor, Chief Pilot'
  }
];

/**
 * Hazard Specific Section 2 fields
 */
export const HAZARD_SPECIFIC_FIELDS: FieldDefinition[] = [
  {
    key: 'hazardGroup',
    label: 'Hazard Group',
    type: 'select',
    required: false,
    section: 2,
    options: HAZARD_GROUPS
  },
  {
    key: 'hazardCategory',
    label: 'Hazard Category',
    type: 'select',
    required: false,
    section: 2,
    options: HAZARD_CATEGORIES
  },
  {
    key: 'whereIdentified',
    label: 'Where was the hazard identified?',
    type: 'text',
    required: true,
    section: 2,
    placeholder: 'Exact location, room, ramp bay or work process'
  },
  {
    key: 'whatIsHazard',
    label: 'What is the hazard?',
    type: 'textarea',
    required: true,
    section: 2,
    placeholder: 'Describe the condition, object or practice that represents a hazard...'
  },
  {
    key: 'whatCouldHappen',
    label: 'What could happen if it is not controlled?',
    type: 'textarea',
    required: true,
    section: 2,
    placeholder: 'Worst credible outcome or consequence (damage, injury, delay)...'
  },
  {
    key: 'whoAffected',
    label: 'Who / what could be affected?',
    type: 'text',
    required: false,
    section: 2,
    placeholder: 'e.g. Ground crew, passengers, aircraft fuselage, fueling vehicles'
  },
  {
    key: 'existingControl',
    label: 'Existing control or safeguard, if known',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Current barriers or procedures already in place, if any...'
  },
  {
    key: 'immediateAction',
    label: 'Action you took immediately, if any',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Immediate measures taken to eliminate or mitigate the risk...'
  },
  {
    key: 'evidence',
    label: 'Supporting evidence / attachment reference (optional)',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Notes about evidence, logbook entry references, or witness tags...'
  }
];

/**
 * Incident Specific Section 2 fields
 */
export const INCIDENT_SPECIFIC_FIELDS: FieldDefinition[] = [
  {
    key: 'incidentType',
    label: 'Incident Type / Category',
    type: 'select',
    required: true,
    section: 2,
    options: INCIDENT_TYPES
  },
  {
    key: 'whatHappened',
    label: 'Briefly, what happened?',
    type: 'textarea',
    required: true,
    section: 2,
    placeholder: 'Clear, factual description of the occurrence...'
  },
  {
    key: 'before',
    label: 'What was happening immediately before the event?',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Flight phase, operational state, tasks being performed...'
  },
  {
    key: 'actionTaken',
    label: 'What action was taken?',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Corrective or recovery actions taken by the crew / personnel...'
  },
  {
    key: 'underControl',
    label: 'Was the situation brought under control?',
    type: 'radio',
    required: false,
    section: 2,
    options: YES_NO_OPTIONS
  },
  {
    key: 'injuryOrDamage',
    label: 'Was there injury or damage?',
    type: 'radio',
    required: false,
    section: 2,
    options: YES_NO_OPTIONS
  },
  {
    key: 'operationalImpact',
    label: 'Operational impact (delay, return, diversion, cancellation, etc.)',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Details of schedule disruption or technical downtime...'
  },
  {
    key: 'emergencyProcedures',
    label: 'Were emergency procedures used?',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Checklists executed, alerts declared (PAN PAN, MAYDAY)...'
  },
  {
    key: 'atcInvolved',
    label: 'Was ATC / airport / another organisation involved?',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Airport fire service, handling agent, air traffic control unit...'
  },
  {
    key: 'evidence',
    label: 'Supporting evidence / attachment reference (optional)',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Flight recorder tags, log entries, photos uploaded below...'
  }
];

/**
 * Accident Specific Section 2 fields
 */
export const ACCIDENT_SPECIFIC_FIELDS: FieldDefinition[] = [
  {
    key: 'description',
    label: 'Brief description of what happened',
    type: 'textarea',
    required: true,
    section: 2,
    placeholder: 'Factual summary of the accident sequence...'
  },
  {
    key: 'accidentLocation',
    label: 'Accident location',
    type: 'text',
    required: true,
    section: 2,
    placeholder: 'Exact location (runway coordinate, airport section, en-route coordinate)'
  },
  {
    key: 'phase',
    label: 'Phase of operation / activity',
    type: 'text',
    required: false,
    section: 2,
    placeholder: 'e.g. Taxi, Take-off roll, En-route cruise, Landing rollout, Maintenance'
  },
  {
    key: 'equipment',
    label: 'Aircraft / vehicle / equipment involved (if applicable)',
    type: 'text',
    required: false,
    section: 2,
    placeholder: 'Aircraft type/registration, tug ID, loader unit number'
  },
  {
    key: 'personsInvolved',
    label: 'Persons involved / affected',
    type: 'text',
    required: false,
    section: 2,
    placeholder: 'Total persons on board (POB), passengers, ground personnel'
  },
  {
    key: 'injured',
    label: 'Was anyone injured?',
    type: 'radio',
    required: true,
    section: 2,
    options: YES_NO_OPTIONS
  },
  {
    key: 'injuryDetails',
    label: 'Known injury details: fatality / serious / minor / none',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'State confirmed medical status if known...'
  },
  {
    key: 'damage',
    label: 'Known aircraft / equipment / property damage',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Structural damage, hull loss, component destruction...'
  },
  {
    key: 'emergencyServices',
    label: 'Emergency services / evacuation / rescue involved?',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Airport Rescue & Fire Fighting (RFFS), local hospital, police...'
  },
  {
    key: 'immediateAction',
    label: 'Immediate action taken',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Site secured, power disabled, evacuation completed...'
  },
  {
    key: 'evidence',
    label: 'Supporting evidence',
    type: 'textarea',
    required: false,
    section: 2,
    hint: 'Do not disturb or alter evidence unless necessary for safety.',
    placeholder: 'Note scene preservation status, camera angles, physical markings...'
  }
];

/**
 * Safety Concern Specific Section 2 fields
 */
export const CONCERN_SPECIFIC_FIELDS: FieldDefinition[] = [
  {
    key: 'concernCategory',
    label: 'Concern Category',
    type: 'select',
    required: true,
    section: 2,
    options: CONCERN_CATEGORIES
  },
  {
    key: 'whatIsConcern',
    label: 'What is the safety concern?',
    type: 'textarea',
    required: true,
    section: 2,
    placeholder: 'Describe the underlying condition, system weakness or emerging trend...'
  },
  {
    key: 'whereExists',
    label: 'Where / in which activity does it exist?',
    type: 'text',
    required: false,
    section: 2,
    placeholder: 'Specific route, shift, department, procedure or aircraft fleet'
  },
  {
    key: 'howLong',
    label: 'How long has it existed, if known?',
    type: 'text',
    required: false,
    section: 2,
    placeholder: 'e.g. Past 3 weeks, since winter schedule change'
  },
  {
    key: 'recurring',
    label: 'Is it recurring?',
    type: 'radio',
    required: false,
    section: 2,
    options: RECURRING_OPTIONS
  },
  {
    key: 'whoAffected',
    label: 'Who / what could be affected?',
    type: 'text',
    required: false,
    section: 2,
    placeholder: 'Who might be put at risk if this trend continues?'
  },
  {
    key: 'whatCouldHappen',
    label: 'What could happen if it is not addressed?',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Potential long-term safety consequences or hazards...'
  },
  {
    key: 'raisedBefore',
    label: 'Have you raised it before?',
    type: 'radio',
    required: false,
    section: 2,
    options: RECURRING_OPTIONS
  },
  {
    key: 'suggestion',
    label: 'What do you think could improve the situation?',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Suggestions for policy adjustment, equipment, refresher training...'
  },
  {
    key: 'evidence',
    label: 'Supporting evidence / attachment reference (optional)',
    type: 'textarea',
    required: false,
    section: 2,
    placeholder: 'Emails, shift reports, or photo documentation attached below...'
  }
];

export function getFormFields(form: FormType): FieldDefinition[] {
  let specificFields: FieldDefinition[] = [];
  switch (form) {
    case 'hazard':
      specificFields = HAZARD_SPECIFIC_FIELDS;
      break;
    case 'incident':
      specificFields = INCIDENT_SPECIFIC_FIELDS;
      break;
    case 'accident':
      specificFields = ACCIDENT_SPECIFIC_FIELDS;
      break;
    case 'concern':
      specificFields = CONCERN_SPECIFIC_FIELDS;
      break;
  }

  return [...COMMON_SECTION_1_FIELDS, ...specificFields, ...COMMON_SECTION_3_FIELDS];
}
