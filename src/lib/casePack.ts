/**
 * Case audit pack: one printable document (save as PDF) with everything about one case:
 * the report as submitted, its current review state, and its full audit history.
 * The reporter's identity is never included (ICAO Annex 19 protection of safety data).
 */
import { BaseReportData } from '../types';
import { FORMS_META, getFormFields } from '../config/fields';
import { effectiveForm, reportingLabel } from './display';
import { AuditEntry, actionLabel, describeChanges, fetchCaseHistory, logAudit } from './audit';
import { currentActor } from './firebase';

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const multiline = (v: unknown) => esc(v).replace(/\n/g, '<br>');

function toDate(v: any): Date | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const local = (d: Date | null) =>
  d ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const utc = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '');

export function buildCasePackHtml(report: BaseReportData, history: AuditEntry[], generatedBy: string, role: string): string {
  const now = new Date();
  const type = effectiveForm(report);
  const moved = type !== report.form;
  const submitted = toDate(report.createdAt);

  const answers = getFormFields(report.form)
    .filter((f) => !['name', 'department', 'position', 'contact'].includes(f.key))
    .map((f) => ({ label: f.label, value: (report as any)[f.key] }))
    .filter((a) => a.value !== undefined && a.value !== null && String(a.value).trim() !== '');

  const identityText =
    report.reporting === 'Anonymous'
      ? 'Anonymous report: no identity was collected.'
      : 'Withheld from this pack to protect the reporter (ICAO Annex 19). Available from the QSA Manager on a formal request.';

  // History: the submission itself, then every recorded action
  const rows: string[] = [];
  rows.push(`<tr>
    <td>${esc(local(submitted))}<div class="utc">${esc(utc(submitted))}</div></td>
    <td>Reporter<div class="muted">public reporting form</div></td>
    <td>Report submitted</td><td class="ok">Success</td>
    <td colspan="2">Case ${esc(report.reportId)} received as ${esc(FORMS_META[report.form].title)} (${esc(reportingLabel(report.reporting))})</td>
  </tr>`);
  for (const e of history) {
    const ch = describeChanges(e.details);
    rows.push(`<tr>
      <td>${esc(local(e.at))}<div class="utc">${esc(utc(e.at))}</div></td>
      <td>${esc(e.actorEmail || '(unknown)')}<div class="muted">${esc(e.actorRole)}${e.device ? ' · ' + esc(e.device) : ''}</div></td>
      <td>${esc(actionLabel(e.action))}<div class="muted">${esc(e.summary)}</div></td>
      <td class="${e.outcome === 'failure' ? 'bad' : 'ok'}">${e.outcome === 'failure' ? 'Failed' : 'Success'}</td>
      <td>${multiline(ch.before)}</td>
      <td>${multiline(ch.after)}${ch.other ? `<div class="muted">${multiline(ch.other)}</div>` : ''}</td>
    </tr>`);
  }

  // Records kept on the case itself (also covers actions taken before the audit trail started)
  const legacy: string[] = [];
  if (report.reclassification) {
    const r: any = report.reclassification;
    legacy.push(`Moved from ${esc(r.from)} to ${esc(r.to)} by ${esc(r.byEmail)} on ${esc(local(toDate(r.at)))}${r.reason ? ` · Reason: ${esc(r.reason)}` : ''}`);
  }
  if (report.deletionRequest) {
    const d: any = report.deletionRequest;
    legacy.push(
      `Archive request by ${esc(d.requestedByEmail)} on ${esc(local(toDate(d.requestedAt)))} · Reason: ${esc(d.reason)} · Status: ${esc(d.status)}` +
        (d.decidedByEmail ? ` (decided by ${esc(d.decidedByEmail)} on ${esc(local(toDate(d.decidedAt)))})` : '')
    );
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Case audit pack ${esc(report.reportId)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e2522; font-size: 11px; margin: 0; }
  .bar { height: 6px; background: linear-gradient(90deg,#1B8E44 0 70%,#DE2010 70% 80%,#1E2522 80% 90%,#F37C1C 90%); }
  header { display:flex; justify-content:space-between; align-items:flex-end; padding: 12px 0 8px; border-bottom: 2px solid #1B8E44; }
  h1 { font-size: 18px; margin: 0; color:#0d3b1f; } h2 { font-size: 13px; margin: 18px 0 6px; color:#0d3b1f; border-bottom:1px solid #d6e4da; padding-bottom:3px; }
  .org { font-size: 11px; font-weight: bold; color: #1B8E44; letter-spacing: .04em; text-transform: uppercase; }
  .meta { text-align:right; font-size:10px; color:#4b5563; }
  table { width:100%; border-collapse: collapse; } td, th { border:1px solid #d1d5db; padding:5px 6px; vertical-align: top; text-align:left; }
  th { background:#eef6f0; font-size:10px; text-transform:uppercase; letter-spacing:.03em; }
  .kv td:first-child { width: 32%; background:#f8faf9; font-weight:bold; }
  .muted { color:#6b7280; font-size:10px; margin-top:2px; } .utc { color:#6b7280; font-size:9px; }
  .ok { color:#147236; font-weight:bold; } .bad { color:#b91c1c; font-weight:bold; }
  .note { background:#f8faf9; border:1px solid #d6e4da; padding:8px; border-radius:4px; font-size:10px; color:#374151; }
  tr { page-break-inside: avoid; } thead { display: table-header-group; }
  footer { margin-top: 16px; font-size: 9px; color:#6b7280; border-top:1px solid #e5e7eb; padding-top:6px; }
  @media screen { body { max-width: 900px; margin: 0 auto; padding: 0 16px 32px; } }
</style></head><body>
<div class="bar"></div>
<header>
  <div><div class="org">Zambia Airways · Quality &amp; Safety Assurance</div><h1>Case Audit Pack: ${esc(report.reportId)}</h1></div>
  <div class="meta">Generated ${esc(local(now))}<br>${esc(utc(now))}<br>by ${esc(generatedBy)}${role ? ` (${esc(role)})` : ''}</div>
</header>

<h2>1. Case summary</h2>
<table class="kv">
  <tr><td>Case number</td><td>${esc(report.reportId)}</td></tr>
  <tr><td>Report type</td><td>${esc(FORMS_META[type].title)}${moved ? ` (submitted as ${esc(FORMS_META[report.form].title)}, moved)` : ''}</td></tr>
  <tr><td>Submitted</td><td>${esc(local(submitted))} · ${esc(utc(submitted))}</td></tr>
  <tr><td>Reporting mode</td><td>${esc(reportingLabel(report.reporting))}</td></tr>
  <tr><td>Category</td><td>${esc(report.category || '')}</td></tr>
  <tr><td>Current status</td><td>${esc(report.status || 'New')}${report.deleted ? ' · ARCHIVED' : ''}</td></tr>
  <tr><td>Evidence files</td><td>${esc(report.evidenceCount || 0)}</td></tr>
  <tr><td>Reporter identity</td><td>${esc(identityText)}</td></tr>
</table>

<h2>2. Report as submitted</h2>
<table class="kv">${answers.map((a) => `<tr><td>${esc(a.label)}</td><td>${multiline(a.value)}</td></tr>`).join('') || '<tr><td colspan="2">No answers recorded.</td></tr>'}</table>

<h2>3. QSA review (current)</h2>
<table class="kv">
  <tr><td>Investigation status</td><td>${esc(report.status || 'New')}</td></tr>
  <tr><td>Internal QSA notes</td><td>${multiline(report.notes || '(none)')}</td></tr>
</table>

<h2>4. Audit history</h2>
<table>
  <thead><tr><th style="width:15%">Date &amp; time</th><th style="width:19%">Person</th><th style="width:22%">Action</th><th style="width:7%">Outcome</th><th>Before</th><th>After</th></tr></thead>
  <tbody>${rows.join('')}</tbody>
</table>
${legacy.length ? `<h2>5. Records kept on the case</h2><div class="note">${legacy.join('<br>')}</div>` : ''}

<footer>
  Each entry is written by the system at the moment of the action, time-stamped by Google's servers (UTC; ISO/IEC 27001 A.8.17)
  and cannot be edited or deleted by any user, including administrators (A.8.15). The person is the account signed in at the time.
  Actions taken before the audit trail was introduced are not listed in section 4; records kept on the case are shown in section 5.
</footer>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}

/** Builds the pack, opens it ready to print / save as PDF, and records the export. */
export async function openCasePack(report: BaseReportData, role: string): Promise<void> {
  const history = await fetchCaseHistory(report.reportId);
  const html = buildCasePackHtml(report, history, currentActor()?.email || '', role);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const win = window.open(url, '_blank');
  if (!win) {
    // Pop-up blocked: download the file instead (open it and print to PDF)
    const a = document.createElement('a');
    a.href = url;
    a.download = `Case_Audit_Pack_${report.reportId}.html`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  await logAudit('export.case-pack', 'case', report.reportId, `Exported the case audit pack for ${report.reportId}`, { historyEntries: history.length });
}
