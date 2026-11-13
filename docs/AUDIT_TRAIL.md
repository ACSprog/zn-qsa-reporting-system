# Audit Trail: Zambia Airways QSA Safety Reporting System

How the system records, protects and reports activity, mapped to **ISO/IEC 27001:2022 Annex A**
(guidance in ISO/IEC 27002:2022) and to the protection of safety data in **ICAO Annex 19**.
Hand this document to an auditor together with the exports described in section 6.

---

## 1. Control mapping

| Requirement | How the system meets it |
|---|---|
| **A.8.15 Logging: record events** | Every action taken in the CMS writes an audit entry (section 2). Failed attempts are recorded too, including failed sign-ins and wrong authenticator codes. |
| **A.8.15: content of each entry** | User ID and e-mail, the user's CMS role, the action, its outcome (success / failure), the case or account affected, before and after values, the device (browser and operating system), and the date and time (section 3). |
| **A.8.15: protection of log information** | Append-only. The database security rules allow entries to be **added** but never **changed or deleted**, by anyone, including Super Admins. Entries can only be written in the signed-in user's own name. |
| **A.8.15: privileged users can't avoid logging** | A change to a case is **refused by the database** unless its audit entry is saved in the same operation (`auditRef` check in `firestore.rules`). A case cannot be permanently deleted unless its deletion record exists first. |
| **A.8.16 Monitoring activities** | Audit Log page with filters (period, area, person, failed only) and a **Record review** sign-off; each review is itself an entry, with the reviewer's comment. |
| **A.8.17 Clock synchronisation** | Times are set by Google Cloud's servers (UTC) when the entry is saved, never by the user's computer. Exports show UTC and local time. |
| **A.5.15 / A.8.3 Access control, need-to-know** | Full log: **Super Admins only**. Managers see only the history of individual cases (case panel and case audit pack). Officers and Viewers can't read the log. Enforced by the database rules, not only by the screens. |
| **A.5.3 Segregation of duties** | Super Admins' own actions are logged and visible to the other Super Admins; regular review should be done by someone other than the person who acted. |
| **A.5.33 Protection of records** | Entries are kept indefinitely by the system; nothing in the CMS can remove them. |
| **ICAO Annex 19: protection of safety data** | Reporter identities are **never** written into the log or the case audit pack. The log records *who viewed* an identity and when, not the identity itself. |

## 2. What is recorded

| Area | Actions |
|---|---|
| Sign-ins and passwords | Signed in (password, or password + authenticator code), failed sign-in, wrong authenticator code, signed out, changed own password, set a new password from the e-mailed link |
| Cases | Status / notes updated (before and after), reporter identity viewed, moved to another report type, archive requested / approved / rejected, archived, restored, permanently deleted (with reason), sent to Excel / SharePoint |
| User accounts | User added, role changed (before and after), blocked, unblocked, 2FA started / stopped, CMS access removed, password reset mail sent, account unlocked, Super Admin confirmation requested / approved / declined / withdrawn |
| Security settings | 2FA switched on for everyone |
| Announcements | Created, edited, switched on/off, deleted |
| Exports | Cases exported from the inbox (and whether reporter identities were included), audit log exported, case audit pack exported |
| Audit | Audit log review recorded (period, number of entries, comment) |

Submitting a report is recorded on the case itself (server time `createdAt`) and is shown as the
first line of every case history.

## 3. Fields in each entry

| Field | Meaning |
|---|---|
| `at` | Server date and time (UTC) |
| `actorUid`, `actorEmail` | The signed-in account (for failed sign-ins: the e-mail that was tried) |
| `actorRole` | Viewer / Officer / Manager / Super Admin at the time |
| `action` | What was done (see section 2) |
| `outcome` | `success` or `failure` |
| `targetType`, `targetId` | Case number, account e-mail, or other item affected |
| `summary` | One-line description |
| `details` | Before / after values, reasons, comments |
| `device` | Browser and operating system |

## 4. Who can see what

| | Super Admin | Manager | Officer / Viewer |
|---|---|---|---|
| Full Audit Log page, filters, Excel export, review sign-off | ✓ | – | – |
| History of a case (case panel) | ✓ | ✓ | – |
| Case audit pack (PDF) | ✓ | ✓ | – |
| Edit or delete entries | ✗ | ✗ | ✗ |

## 5. Review procedure (A.8.16)

Suggested: a Super Admin who was not the main actor reviews the log **monthly**:

1. CMS → **Audit Log**, choose the month, press **Load period**.
2. Filter **Failed only**; look at repeated failed sign-ins, permission failures, unusual times.
3. Check identity views, permanent deletions, role changes and exports including identities
   against legitimate need.
4. Press **Record review of this period** and write the findings ("No unusual activity" or what was
   followed up).

## 6. Answering an audit query

| The auditor asks for… | Do this |
|---|---|
| Everything that happened to case X | CMS → Audit Log → **Case audit pack** (or open the case → **Case audit pack (PDF)**) → Save as PDF |
| All activity in a period | Audit Log → set From / To → **Export to Excel**. The file includes an *About this extract* sheet stating how the log is kept |
| What a person did | Audit Log → choose the person → Export |
| Who accessed reporter identities | Audit Log → search "identity" → Export |
| Changes to user access | Audit Log → area **User accounts** → Export |
| Evidence that the log is reviewed | Audit Log → area **Audit reviews** → Export |

Every export is itself recorded in the log.

## 7. Known limitations (to declare to the auditor)

1. **IP addresses are not recorded.** The system runs without its own server on the no-cost
   Firebase plan, so the browser cannot reliably learn its public IP address; the device
   (browser and operating system) is recorded instead.
2. **Account and settings actions are recorded by the CMS but not enforced by the database rules**
   (case changes are enforced). Someone with a CMS account who bypassed the CMS and called the
   database directly could change their own permitted account settings without an entry. The
   resulting state is still visible on the account.
3. **Reading data outside the CMS is not logged.** Viewing a reporter identity *in the CMS* is
   recorded; a direct database read is not. Google Cloud "Data Access" audit logs would cover this
   but are outside the no-cost plan.
4. **Firebase project owners** (Google accounts with Owner role on the project) can delete data from
   the Firebase console, bypassing the rules. Keep the number of owners to a minimum; Google Cloud
   keeps its own Admin Activity log of console changes.
5. **History starts when the audit trail was introduced.** Earlier moves and archive decisions are
   still shown from the records kept on each case (section 5 of the case audit pack).
6. **Storage:** entries are about 1 KB each and count towards the 1 GiB database quota of the
   no-cost plan (roughly a million entries per GB).

## 8. Retention

The system keeps entries indefinitely. Set the retention period in the QSA records procedure (in line
with ZCAA / company requirements for SMS records). Exports from the Audit Log page can be archived
to SharePoint as a periodic backup.
