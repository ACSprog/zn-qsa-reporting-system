import { PublicClientApplication, Configuration, AccountInfo } from '@azure/msal-browser';
import {
  BaseReportData,
  FormType,
  SyncSummary,
  SyncResultPerForm,
  SyncEvidenceResult
} from '../types';
import { FORMS_META } from '../config/fields';
import { buildHeaderToFieldMap } from '../config/excelMapping';
import {
  fetchAllReports,
  fetchReporterIdentity,
  fetchReportEvidence
} from './firebase';
import { base64ToBlob } from './evidence';

// Read configuration from environment
const MSAL_CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID || '';
const MSAL_TENANT_ID = import.meta.env.VITE_MSAL_TENANT_ID || 'common';
const GRAPH_SCOPES = (import.meta.env.VITE_GRAPH_SCOPES || 'Files.ReadWrite.All,User.Read')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);

const WORKBOOK_BASE = import.meta.env.VITE_WORKBOOK_BASE || '/me/drive/root:/Safety Reports.xlsx:';
const EVIDENCE_DRIVE_BASE = import.meta.env.VITE_EVIDENCE_DRIVE_BASE || '';
const EVIDENCE_FOLDER_URL = (import.meta.env.VITE_EVIDENCE_FOLDER_URL || '').replace(/\/+$/, '');

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

let msalInstance: PublicClientApplication | null = null;

export async function getMsalInstance(): Promise<PublicClientApplication | null> {
  if (!MSAL_CLIENT_ID) {
    return null;
  }
  if (!msalInstance) {
    const msalConfig: Configuration = {
      auth: {
        clientId: MSAL_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
        redirectUri: window.location.origin
      },
      cache: {
        cacheLocation: 'sessionStorage'
      }
    };
    msalInstance = new PublicClientApplication(msalConfig);
    await msalInstance.initialize();
  }
  return msalInstance;
}

/**
 * Acquire Microsoft Graph Access Token using MSAL (silent or interactive popup)
 */
export async function getGraphAccessToken(): Promise<string> {
  const msal = await getMsalInstance();
  if (!msal) {
    throw new Error(
      'Microsoft Entra Client ID (VITE_MSAL_CLIENT_ID) is not configured in your environment.'
    );
  }

  const accounts = msal.getAllAccounts();
  const request = {
    scopes: GRAPH_SCOPES,
    account: accounts.length > 0 ? accounts[0] : undefined
  };

  try {
    const silentResult = await msal.acquireTokenSilent(request);
    return silentResult.accessToken;
  } catch {
    const popupResult = await msal.acquireTokenPopup(request);
    return popupResult.accessToken;
  }
}

/**
 * Fetch wrapper with exponential backoff honoring Retry-After for Graph API rate limits
 */
async function graphFetch(
  url: string,
  token: string,
  options: RequestInit = {},
  retries = 3
): Promise<Response> {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, { ...options, headers });

    if ([429, 502, 503, 504].includes(response.status) && attempt < retries) {
      const retryAfterHeader = response.headers.get('Retry-After');
      let waitSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.pow(2, attempt + 1);
      if (isNaN(waitSeconds) || waitSeconds <= 0) waitSeconds = 2;
      await new Promise((res) => setTimeout(res, waitSeconds * 1000));
      continue;
    }

    return response;
  }

  throw new Error(`Graph request failed after ${retries} retries: ${url}`);
}

/**
 * Executes either a Preview (dry run) or a Live Sync against Microsoft Excel & SharePoint
 */
export async function executeExcelSync(
  previewMode: boolean,
  onProgress?: (msg: string) => void
): Promise<SyncSummary> {
  onProgress?.(previewMode ? 'Authenticating with Microsoft Graph for preview...' : 'Authenticating with Microsoft Graph...');
  
  let token = '';
  try {
    token = await getGraphAccessToken();
  } catch (authErr: any) {
    // If not configured, throw a clear error
    throw new Error(`Microsoft Authentication failed: ${authErr?.message || authErr}`);
  }

  const forms: FormType[] = ['hazard', 'occurrence', 'incident', 'accident', 'concern'];
  const formResults: SyncResultPerForm[] = [];
  const allMissingReports: { form: FormType; report: BaseReportData }[] = [];

  const cleanWorkbookBase = WORKBOOK_BASE.startsWith('/') ? WORKBOOK_BASE : `/${WORKBOOK_BASE}`;
  const graphWorkbookRoot = `${GRAPH_BASE_URL}${cleanWorkbookBase}`;

  // ==========================================
  // PHASE 1: ROWS SYNC
  // ==========================================
  for (const f of forms) {
    const meta = FORMS_META[f];
    const tableName = meta.tableName;
    onProgress?.(`Inspecting ${meta.title} (${tableName})...`);

    const result: SyncResultPerForm = {
      form: f,
      tableName,
      inFirestore: 0,
      inExcel: 0,
      missingInExcel: 0,
      rowsAdded: 0,
      errors: []
    };

    try {
      // 1. Fetch non-archived reports from Firestore
      const reports = (await fetchAllReports(f)).filter((r) => !r.deleted);
      result.inFirestore = reports.length;

      // 2. Fetch existing Report IDs in Excel table column
      const colUrl = `${graphWorkbookRoot}/workbook/tables/${encodeURIComponent(tableName)}/columns/Report%20ID?$select=values`;
      const colRes = await graphFetch(colUrl, token);

      if (!colRes.ok) {
        const errJson = await colRes.json().catch(() => ({}));
        result.errors?.push(`Could not read Excel table "${tableName}": ${errJson?.error?.message || colRes.statusText}`);
        formResults.push(result);
        continue;
      }

      const colData = await colRes.json();
      // Excel returns { values: [["Report ID"], ["HAZ-..."], ...] }
      const existingIds = new Set<string>();
      if (Array.isArray(colData.values)) {
        for (let i = 1; i < colData.values.length; i++) {
          const val = colData.values[i]?.[0];
          if (val) existingIds.add(String(val).trim());
        }
      }
      result.inExcel = existingIds.size;

      // 3. Find missing reports
      const missing = reports.filter((r) => !existingIds.has(r.reportId));
      result.missingInExcel = missing.length;
      missing.forEach((m) => allMissingReports.push({ form: f, report: m }));

      if (missing.length === 0 || previewMode) {
        formResults.push(result);
        continue;
      }

      // 4. Read header row to map columns properly
      const headerUrl = `${graphWorkbookRoot}/workbook/tables/${encodeURIComponent(tableName)}/headerRowRange?$select=values`;
      const headerRes = await graphFetch(headerUrl, token);
      if (!headerRes.ok) {
        result.errors?.push(`Could not read headers for "${tableName}"`);
        formResults.push(result);
        continue;
      }

      const headerData = await headerRes.json();
      const excelHeaders: string[] = (headerData.values?.[0] || []).map((h: any) => String(h).trim());
      const headerToField = buildHeaderToFieldMap(f);

      // 5. Build rows
      const rowsToAdd: any[][] = [];

      for (const rep of missing) {
        // Read identity if Named or Confidential
        let identityName = '';
        let identityDept = '';
        let identityPos = '';
        let identityContact = '';

        if (rep.reporting !== 'Anonymous') {
          try {
            const idDoc = await fetchReporterIdentity(rep.reportId);
            if (idDoc) {
              identityName = idDoc.name || '';
              identityDept = idDoc.department || '';
              identityPos = idDoc.position || '';
              identityContact = idDoc.contact || '';
            } else {
              identityName = '[restricted]';
              identityDept = '[restricted]';
              identityPos = '[restricted]';
              identityContact = '[restricted]';
            }
          } catch {
            identityName = '[restricted]';
            identityDept = '[restricted]';
            identityPos = '[restricted]';
            identityContact = '[restricted]';
          }
        }

        const repWithIdentity: Record<string, any> = {
          ...rep,
          name: identityName,
          department: identityDept,
          position: identityPos,
          contact: identityContact,
          evidenceCount: rep.evidenceCount || 0,
          evidenceFolder: rep.evidenceCount > 0 && EVIDENCE_FOLDER_URL ? `${EVIDENCE_FOLDER_URL}/${rep.reportId}` : ''
        };

        const rowValues = excelHeaders.map((hdr) => {
          const fieldKey = headerToField.get(hdr.toLowerCase());
          if (!fieldKey) return '';
          const val = repWithIdentity[fieldKey];
          if (val === undefined || val === null) return '';
          if (typeof val === 'boolean') return val ? 'Yes' : 'No';
          return String(val);
        });

        rowsToAdd.push(rowValues);
      }

      // 6. Post in chunks of 200
      const chunkSize = 200;
      let addedCount = 0;
      const addRowUrl = `${graphWorkbookRoot}/workbook/tables/${encodeURIComponent(tableName)}/rows/add`;

      for (let i = 0; i < rowsToAdd.length; i += chunkSize) {
        const chunk = rowsToAdd.slice(i, i + chunkSize);
        onProgress?.(`Adding rows to ${tableName} (${i + 1} - ${i + chunk.length} of ${rowsToAdd.length})...`);
        const addRes = await graphFetch(addRowUrl, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            index: null,
            values: chunk
          })
        });

        if (!addRes.ok) {
          const errData = await addRes.json().catch(() => ({}));
          result.errors?.push(`Failed writing row chunk into ${tableName}: ${errData?.error?.message || addRes.statusText}`);
        } else {
          addedCount += chunk.length;
        }
      }

      result.rowsAdded = addedCount;
    } catch (formErr: any) {
      result.errors?.push(`Error during ${tableName} sync: ${formErr?.message || formErr}`);
    }

    formResults.push(result);
  }

  // ==========================================
  // PHASE 2: EVIDENCE FILES SYNC
  // ==========================================
  const evidenceSummary: SyncEvidenceResult = {
    checked: 0,
    missing: 0,
    restored: 0,
    errors: []
  };

  if (!EVIDENCE_DRIVE_BASE) {
    evidenceSummary.errors?.push('VITE_EVIDENCE_DRIVE_BASE is not configured; skipping SharePoint evidence sync.');
    return {
      forms: formResults,
      evidence: evidenceSummary,
      isPreview: previewMode,
      timestamp: new Date().toISOString()
    };
  }

  onProgress?.('Inspecting SharePoint evidence folders...');
  const cleanDriveBase = EVIDENCE_DRIVE_BASE.startsWith('/') ? EVIDENCE_DRIVE_BASE : `/${EVIDENCE_DRIVE_BASE}`;
  const graphEvidenceRoot = `${GRAPH_BASE_URL}${cleanDriveBase}`;

  // Get all reports with evidenceCount > 0
  const allReportsWithEvidence: { form: FormType; report: BaseReportData }[] = [];
  for (const f of forms) {
    const list = (await fetchAllReports(f)).filter((r) => !r.deleted && (r.evidenceCount || 0) > 0);
    list.forEach((r) => allReportsWithEvidence.push({ form: f, report: r }));
  }

  for (const item of allReportsWithEvidence) {
    const { form, report } = item;
    evidenceSummary.checked += report.evidenceCount || 0;

    const listFolderUrl = `${graphEvidenceRoot}/${report.reportId}:/children?$select=name`;
    const folderRes = await graphFetch(listFolderUrl, token);

    let existingFileNames = new Set<string>();
    if (folderRes.status === 404) {
      // Folder does not exist yet; all files missing
      existingFileNames = new Set();
    } else if (folderRes.ok) {
      const folderData = await folderRes.json();
      if (Array.isArray(folderData.value)) {
        folderData.value.forEach((v: any) => existingFileNames.add(v.name));
      }
    } else {
      evidenceSummary.errors?.push(`Could not query evidence folder for ${report.reportId}`);
      continue;
    }

    // Load actual evidence documents from Firestore subcollection
    const evidenceDocs = await fetchReportEvidence(form, report.reportId);

    for (const ev of evidenceDocs) {
      if (!existingFileNames.has(ev.name)) {
        evidenceSummary.missing++;

        if (!previewMode) {
          onProgress?.(`Uploading missing file ${ev.name} for ${report.reportId}...`);
          try {
            const uploadUrl = `${graphEvidenceRoot}/${report.reportId}/${encodeURIComponent(ev.name)}:/content`;
            const fileBlob = base64ToBlob(ev.base64, ev.contentType);
            const uploadRes = await graphFetch(uploadUrl, token, {
              method: 'PUT',
              headers: { 'Content-Type': ev.contentType },
              body: fileBlob
            });

            if (uploadRes.ok) {
              evidenceSummary.restored++;
            } else {
              const uErr = await uploadRes.json().catch(() => ({}));
              evidenceSummary.errors?.push(`Failed to upload ${ev.name} (${report.reportId}): ${uErr?.error?.message || uploadRes.statusText}`);
            }
          } catch (upErr: any) {
            evidenceSummary.errors?.push(`Exception uploading ${ev.name}: ${upErr?.message || upErr}`);
          }
        }
      }
    }
  }

  return {
    forms: formResults,
    evidence: evidenceSummary,
    isPreview: previewMode,
    timestamp: new Date().toISOString()
  };
}
