# Power Automate Flow Setup: Zambia Airways Safety Reporting System

This document outlines the step-by-step setup for the Microsoft Power Automate HTTP trigger flow that integrates with the Zambia Airways Safety Reporting web app.

---

## 1. Overview & Architecture

When a safety report is submitted from the web application:
1. Firestore is updated first as the master transactional store.
2. The browser immediately POSTs the report payload as a JSON string to the designated Power Automate HTTP webhook (no-cors mode).
3. Power Automate performs:
   - Shared secret token & duplicate verification.
   - Saves evidence attachments into SharePoint Online (`/Safety Evidence/{reportId}`).
   - Appends a new row to the corresponding Excel table (`tblHazard`, `tblOccurrence` or `tblConcern`).
   - Looks up recipient routing in `tblRouting`.
   - Sends notification emails to the responsible QSA safety officer with strict confidentiality/anonymity protections.

---

## 2. One-Time Prerequisites

### A. Excel Online Workbook Setup
Create a single Excel workbook named `Safety Reports.xlsx` stored in your organization's SharePoint Documents or designated Service Account OneDrive.

Inside this workbook, create sheets with official Excel Tables (press `Ctrl + T` to convert the ranges to named tables).

> **Incident and Accident are now one form.** New cases use the combined **Incident / Accident** form (case numbers `IA-…`, form value `occurrence`, table `tblOccurrence`, flow URL `VITE_FLOW_URL_OCCURRENCE`). `tblIncident` / `tblAccident` and their flows are only needed if you already have old INC-/ACC- records to restore. The `Reporting` column receives **Open**, Confidential or Anonymous ("Open" was called "Named" before).

1. **`tblHazard`** (Sheet: `Hazard`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Hazard Group`, `Hazard Category`, `Where was the hazard identified?`, `What is the hazard?`, `What could happen if it is not controlled?`, `Who / what could be affected?`, `Existing control or safeguard (if known)`, `Action you took immediately (if any)`, `Supporting evidence / attachment reference`, `Evidence Files`, `Evidence Folder`

2. **`tblOccurrence`** (Sheet: `Incident-Accident`): the combined form
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Incident or Accident`, `Category`, `Briefly, what happened?`, `What was happening immediately before the event?`, `Phase of operation / activity`, `Aircraft / vehicle / equipment involved`, `Persons involved / affected`, `What action was taken?`, `Was the situation brought under control?`, `Was anyone injured?`, `Known injury details`, `Known aircraft / equipment / property damage`, `Operational impact`, `Emergency procedures / services / evacuation`, `Was ATC / airport / another organisation involved?`, `Supporting evidence / attachment reference`, `Evidence Files`, `Evidence Folder`

   Payload keys for those columns: `occurrenceType`, `incidentType`, `whatHappened`, `before`, `phase`, `equipment`, `personsInvolved`, `actionTaken`, `underControl`, `injured`, `injuryDetails`, `damage`, `operationalImpact`, `emergencyProcedures`, `atcInvolved`, `evidence`. `category` arrives as e.g. `Accident: Ground handling`.

   *Old forms (only if you have INC-/ACC- records):*

   **`tblIncident`** (Sheet: `Incident`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Incident Type / Category`, `Briefly, what happened?`, `What was happening immediately before the event?`, `What action was taken?`, `Was the situation brought under control?`, `Was there injury or damage?`, `Operational impact`, `Were emergency procedures used?`, `Was ATC / airport / another organisation involved?`, `Supporting evidence / attachment reference`, `Evidence Files`, `Evidence Folder`

   **`tblAccident`** (Sheet: `Accident`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Brief description of what happened`, `Accident location`, `Phase of operation / activity`, `Aircraft / vehicle / equipment involved`, `Persons involved / affected`, `Was anyone injured?`, `Known injury details`, `Known aircraft / equipment / property damage`, `Emergency services / evacuation / rescue involved?`, `Immediate action taken`, `Supporting evidence`, `Evidence Files`, `Evidence Folder`

3. **`tblConcern`** (Sheet: `Concern`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Concern Category`, `What is the safety concern?`, `Where / in which activity does it exist?`, `How long has it existed, if known?`, `Is it recurring?`, `Who / what could be affected?`, `What could happen if it is not addressed?`, `Have you raised it before?`, `What do you think could improve the situation?`, `Supporting evidence / attachment reference`, `Evidence Files`, `Evidence Folder`

4. **`tblRouting`** (Sheet: `Routing`)
   Headers:
   `Form`, `Category`, `Email`

   Example rows:
   - `hazard` | `Flight Operations` | `qsa.flightops@zambiaairways.co.zm`
   - `hazard` | `Ground Operations` | `qsa.ground@zambiaairways.co.zm`
   - `hazard` | *(blank)* | `qsa@zambiaairways.co.zm`
   - `occurrence` | `Accident: ` *(any accident)* | `emergency.director@zambiaairways.co.zm`
   - `occurrence` | *(blank)* | `incident.desk@zambiaairways.co.zm`
   (Tip: route on `occurrenceType` = `Accident` to reach the emergency contacts first.)
   - `concern` | *(blank)* | `qsa@zambiaairways.co.zm`

### B. SharePoint Online Evidence Library
In your team or QSA site (e.g. `https://zambiaairways.sharepoint.com/sites/QSA`), create or ensure the folder:
`/Shared Documents/Safety Evidence`
Ensure access permissions are restricted strictly to authorized QSA safety personnel.

---

## 3. Power Automate Flow Step-by-Step

You can build either a single flow that switches on `triggerBody()?['form']` or 4 separate flows for Hazard, Incident, Accident, Concern. (A single flow branching by `form` or 4 flows with separate trigger URLs both work).

### Step 1: Trigger — When an HTTP request is received
- **Who can trigger the flow:** `Anyone`
- Click **Settings** on the trigger:
  - Turn **Concurrency Control** ON.
  - Set **Degree of Parallelism** to `1`.
- **Request Body JSON Schema**:
```json
{
  "type": "object",
  "properties": {
    "token": { "type": "string" },
    "form": { "type": "string" },
    "reportId": { "type": "string" },
    "dateReported": { "type": "string" },
    "category": { "type": "string" },
    "reporting": { "type": "string" },
    "name": { "type": "string" },
    "department": { "type": "string" },
    "position": { "type": "string" },
    "contact": { "type": "string" },
    "eventDate": { "type": "string" },
    "eventTime": { "type": "string" },
    "location": { "type": "string" },
    "flightNo": { "type": "string" },
    "aircraftReg": { "type": "string" },
    "aircraftType": { "type": "string" },
    "urgent": { "type": "string" },
    "exposedToRisk": { "type": "string" },
    "notified": { "type": "string" },
    "notifiedWho": { "type": "string" },
    "restore": { "type": "boolean" },
    "evidenceCount": { "type": "integer" },
    "evidenceFolder": { "type": "string" },
    "evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "contentType": { "type": "string" },
          "size": { "type": "integer" },
          "base64": { "type": "string" }
        }
      }
    }
  }
}
```

### Step 2: Shared Secret Verification & Duplicate Guard
- Add a **Condition**:
  `triggerBody()?['token']` is equal to `YOUR_SHARED_SECRET_TOKEN`
  AND `triggerBody()?['reportId']` is not empty.
- If **No**: Add **Terminate** action (Status: Cancelled).
- If **Yes**: Proceed.

### Step 3: Immediate 202 Response
Add a **Response** action:
- **Status Code:** `202`
- **Body:** `{"status": "accepted", "reportId": "@{triggerBody()?['reportId']}"}`

### Step 4: Check For Duplicate in Excel
Add an **Excel Online (Business) — Get rows** action:
- **Location:** Your SharePoint site or OneDrive
- **Document Library:** `Documents`
- **File:** `Safety Reports.xlsx`
- **Table:** Depending on form (`tblHazard`, `tblIncident`, etc.)
- **Filter Query:** `Report ID eq '@{triggerBody()?['reportId']}'`
- **Top Count:** `1`

Add an **Initialize variable** action named `rowExists` (Boolean) with the value:
`greater(length(body('Get_rows')?['value']), 0)`

Add a **Condition** (duplicate guard) using **And**:
- `rowExists` is equal to `true`
- `equals(triggerBody()?['restore'], true)` is equal to `false`

If **Yes**: Add **Terminate** (Status: Succeeded). This prevents duplicate processing for normal submissions. When `restore` is `true` (Sync to Excel in the dashboard), the flow continues instead.

### Step 5: Save Evidence to SharePoint
Add a **Condition**:
`triggerBody()?['evidenceCount']` is greater than `0`.

If **Yes**:
- Add an **Apply to each** loop over `triggerBody()?['evidence']`.
- In the loop's **Settings**, turn on **Concurrency Control** and set to `1`.
- Inside the loop, add **SharePoint — Create file**:
  - **Site Address:** Your QSA SharePoint site
  - **Folder Path:** `/Shared Documents/Safety Evidence/@{triggerBody()?['reportId']}`
  - **File Name:** `items('Apply_to_each')?['name']`
  - **File Content:** Expression: `base64ToBinary(items('Apply_to_each')?['base64'])`
  - **When restoring:** if a file already exists in the folder, Create file returns a conflict error. Configure the actions after the loop (Step 6 onward) to run after **is successful** and **has failed**, so a "file already exists" error does not stop the flow. Test this with a report whose evidence is already in SharePoint.

### Step 6: Add Row into Excel Table
Put this step inside a **Condition**: `rowExists` is equal to `false`. (When restoring a report whose row still exists, skip it.)

Add **Excel Online (Business) — Add a row into a table**:
Map the columns to the trigger body properties:
- `Report ID`: `triggerBody()?['reportId']`
- `Date Reported`: `triggerBody()?['dateReported']`
- `Reporting`: `triggerBody()?['reporting']`
- `Reporter Name`: If `reporting` = 'Anonymous' then `""` else `triggerBody()?['name']`
- `Department / Work Area`: If `reporting` = 'Anonymous' then `""` else `triggerBody()?['department']`
- `Position / Role`: If `reporting` = 'Anonymous' then `""` else `triggerBody()?['position']`
- `Contact`: If `reporting` = 'Anonymous' then `""` else `triggerBody()?['contact']`
- Form specific columns: map respective fields (`hazardGroup`, `whatHappened`, etc.)
- `Evidence Files`: `triggerBody()?['evidenceCount']`
- `Evidence Folder`: `triggerBody()?['evidenceFolder']`

### Step 7: Lookup Recipient in tblRouting
> Put Steps 7 and 8 inside a **Condition**: `equals(triggerBody()?['restore'], true)` is equal to `false`. When restoring, skip both so no email is sent.
Add **Excel Online (Business) — List rows present in a table** for `tblRouting`.
- Filter or use **Filter array** to find matching row where `Form eq '@{triggerBody()?['form']}'` and `Category eq '@{triggerBody()?['category']}'`.
- If no category match, fallback to `Category eq ''`.
- If still empty, use fallback safety manager address `qsa@zambiaairways.co.zm`.

### Step 8: Send Notification Email (V2)
Add **Office 365 Outlook — Send an email (V2)**:
- **To:** Destination address from Step 7
- **Subject:**
  `@{if(or(equals(triggerBody()?['urgent'],'Yes'),equals(triggerBody()?['exposedToRisk'],'Yes')), '[URGENT] ', '')}New @{toUpper(triggerBody()?['form'])} Report @{triggerBody()?['reportId']}`
- **Body (HTML)**:
  - Form Type and Reference ID
  - Date Reported, Event Date & Time, Location
  - Category / Group
  - Summary / Main description
  - Immediate Risk & Urgency indicator
  - If `evidenceCount > 0`: Include link to Evidence Folder in SharePoint.
  - Link to the Admin Dashboard.
  - **Confidentiality / Anonymity Enforced:**
    - If `reporting == 'Anonymous'`: Do NOT display any reporter details.
    - If `reporting == 'Confidential'`: Do NOT display reporter name or contact in the email (QSA review in dashboard only).
    - If `reporting == 'Open'` (older payloads: `'Named'`): Reporter name and department may be listed.

### Step 9: Error Handling Scope
Enclose steps 4–8 in a **Scope** named `Try_Processing`.
Add a second **Scope** named `Catch_Failure` configured with **Configure run after: has failed, has timed out**:
- Inside `Catch_Failure`, add an email alert to the safety system administrator with the execution link and error details.

---

## 4. Size & Limit Best Practices
- Client-side image compression already ensures files do not exceed 600 KB each (max 5 files = ~3-4 MB payload).
- This stays comfortably within Power Automate's 100 MB request limit and SharePoint 250 MB single-file upload limit.

---

## 5. Account Welcome Email Flow (new CMS users)

When a Manager adds a user under **CMS → User Accounts**, the app creates the login with a temporary password and POSTs the details to a second flow, which emails the new user from the company mailbox. The user must change the temporary password the first time they sign in.

If `VITE_FLOW_URL_ACCOUNTS` is empty, the app falls back to Firebase's own "set your password" email, and the Manager sees the temporary password on screen.

### Step 1: Trigger: When an HTTP request is received
- **Who can trigger the flow:** `Anyone`
- **Request Body JSON Schema**:
```json
{
  "type": "object",
  "properties": {
    "token": { "type": "string" },
    "type": { "type": "string" },
    "email": { "type": "string" },
    "name": { "type": "string" },
    "role": { "type": "string" },
    "roleLabel": { "type": "string" },
    "roleDescription": { "type": "string" },
    "tempPassword": { "type": "string" },
    "loginUrl": { "type": "string" },
    "invitedBy": { "type": "string" }
  }
}
```
- Copy the generated **HTTP URL** into `VITE_FLOW_URL_ACCOUNTS` (same `VITE_FLOW_TOKEN` as the report flows), then rebuild and redeploy the site.

### Step 2: Safety checks (Condition) — required
The token is visible to anyone who inspects the website code, so the flow itself must make sure it can only send this one kind of email to staff. Add a **Condition** with **all** of these, and **Terminate** (Status: Cancelled) if any is false:
- `triggerBody()?['token']` **is equal to** your secret token
- `triggerBody()?['type']` **is equal to** `account-invite`
- `toLower(triggerBody()?['email'])` **ends with** `@zambiaairways.co.zm`
- `length(triggerBody()?['tempPassword'])` **is less than or equal to** `20`

### Step 3: Respond (optional)
**Response** action, Status Code `202`. The browser does not read it (no-cors), so this only keeps the run tidy.

### Step 4: Send an email (V2) (Office 365 Outlook)
Send from the QSA shared mailbox if you have one (**Send an email from a shared mailbox (V2)**).
- **To:** `triggerBody()?['email']`
- **Subject:** `Your Zambia Airways QSA CMS login`
- **Importance:** Normal
- **Body** (HTML). Type the login address yourself rather than using `loginUrl` from the request, so the email can never point anywhere else:
```html
<p>Dear @{coalesce(triggerBody()?['name'], 'colleague')},</p>
<p>An account has been created for you on the Zambia Airways QSA Safety Reporting CMS.</p>
<p><b>Access level:</b> @{triggerBody()?['roleLabel']}. @{triggerBody()?['roleDescription']}</p>
<p><b>Sign in at:</b> <a href="https://YOUR-LIVE-SITE/admin">https://YOUR-LIVE-SITE/admin</a><br/>
<b>Email:</b> @{triggerBody()?['email']}<br/>
<b>Temporary password:</b> @{triggerBody()?['tempPassword']}</p>
<p>You will be asked to choose your own password the first time you sign in. Do not share this email.</p>
<p>If you were not expecting this, contact the QSA department.</p>
```
- For an existing login (Manager used "Existing login UID"), `tempPassword` is empty. Add a Condition on `empty(triggerBody()?['tempPassword'])` and, if true, send the same email without the password line ("use your existing password").

### Step 5: Run history hygiene
Flow run history stores the temporary password. In the trigger's **Settings**, turn on **Secure Inputs** (and **Secure Outputs** on the email action) so it is hidden from run history.

---

## 6. Case-Number Email Flow (reporters, optional)

On every form, reporters can type an email address to receive their case number. The app sends **only** the address, the case number and the report type to this flow; the address is never saved in Firestore, so anonymous reports stay anonymous in the database.

### Step 1: Trigger: When an HTTP request is received
- **Who can trigger the flow:** `Anyone`
- **Request Body JSON Schema**:
```json
{
  "type": "object",
  "properties": {
    "token": { "type": "string" },
    "type": { "type": "string" },
    "email": { "type": "string" },
    "reportId": { "type": "string" },
    "formTitle": { "type": "string" },
    "reporting": { "type": "string" },
    "submittedAt": { "type": "string" }
  }
}
```
- Copy the generated **HTTP URL** into `VITE_FLOW_URL_RECEIPTS` (same `VITE_FLOW_TOKEN`), rebuild and redeploy.
- In the trigger's **Settings**, turn on **Secure Inputs** so addresses don't sit in run history (important for anonymous reporters).

### Step 2: Safety checks (Condition) — required
Terminate (Cancelled) unless **all** are true:
- `triggerBody()?['token']` equals your secret token
- `triggerBody()?['type']` equals `case-receipt`
- `length(triggerBody()?['reportId'])` is less than or equal to `30`
- `length(triggerBody()?['email'])` is less than or equal to `254`

Optional: to stop the form being used to email strangers, also require the address to end with `@zambiaairways.co.zm` (only if all reporters are staff).

### Step 3: Send an email (V2)
- **To:** `triggerBody()?['email']`
- **Subject:** `Your Zambia Airways safety report: @{triggerBody()?['reportId']}`
- **Body:** keep it to the case number and type. Never include report details:
```html
<p>Thank you for your report.</p>
<p><b>Case number:</b> @{triggerBody()?['reportId']}<br/>
<b>Report type:</b> @{triggerBody()?['formTitle']}</p>
<p>Keep this number if you need to contact QSA about your report.</p>
```

---

## 7. Cases moved to another report type

A Manager can move a case submitted under the wrong type (e.g. Hazard → Incident / Accident). The case **keeps its number and its row in the original Excel table**; the CMS stores `reclassifiedTo` and a record of who moved it. If you also want it on the new sheet, add the row manually or filter the original sheet on the CMS export.
