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
   - Appends a new row to the corresponding Excel table (`tblHazard`, `tblIncident`, `tblAccident`, or `tblConcern`).
   - Looks up recipient routing in `tblRouting`.
   - Sends notification emails to the responsible QSA safety officer with strict confidentiality/anonymity protections.

---

## 2. One-Time Prerequisites

### A. Excel Online Workbook Setup
Create a single Excel workbook named `Safety Reports.xlsx` stored in your organization's SharePoint Documents or designated Service Account OneDrive.

Inside this workbook, create five sheets with official Excel Tables (press `Ctrl + T` to convert the ranges to named tables):

1. **`tblHazard`** (Sheet: `Hazard`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Hazard Group`, `Hazard Category`, `Where was the hazard identified?`, `What is the hazard?`, `What could happen if it is not controlled?`, `Who / what could be affected?`, `Existing control or safeguard (if known)`, `Action you took immediately (if any)`, `Supporting evidence / attachment reference`, `Evidence Files`, `Evidence Folder`

2. **`tblIncident`** (Sheet: `Incident`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Incident Type / Category`, `Briefly, what happened?`, `What was happening immediately before the event?`, `What action was taken?`, `Was the situation brought under control?`, `Was there injury or damage?`, `Operational impact`, `Were emergency procedures used?`, `Was ATC / airport / another organisation involved?`, `Supporting evidence / attachment reference`, `Evidence Files`, `Evidence Folder`

3. **`tblAccident`** (Sheet: `Accident`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Brief description of what happened`, `Accident location`, `Phase of operation / activity`, `Aircraft / vehicle / equipment involved`, `Persons involved / affected`, `Was anyone injured?`, `Known injury details`, `Known aircraft / equipment / property damage`, `Emergency services / evacuation / rescue involved?`, `Immediate action taken`, `Supporting evidence`, `Evidence Files`, `Evidence Folder`

4. **`tblConcern`** (Sheet: `Concern`)
   Headers:
   `Report ID`, `Date Reported`, `Reporting`, `Reporter Name`, `Department / Work Area`, `Position / Role`, `Contact`, `Date of Event / Observation`, `Time (if known)`, `Location / Station`, `Flight No. (if applicable)`, `Aircraft Registration (if applicable)`, `Aircraft Type (if applicable)`, `Does it require urgent attention?`, `Is anyone currently exposed to immediate risk?`, `Did you notify anyone at the time?`, `Person / department notified (if applicable)`, `Concern Category`, `What is the safety concern?`, `Where / in which activity does it exist?`, `How long has it existed, if known?`, `Is it recurring?`, `Who / what could be affected?`, `What could happen if it is not addressed?`, `Have you raised it before?`, `What do you think could improve the situation?`, `Supporting evidence / attachment reference`, `Evidence Files`, `Evidence Folder`

5. **`tblRouting`** (Sheet: `Routing`)
   Headers:
   `Form`, `Category`, `Email`

   Example rows:
   - `hazard` | `Flight Operations` | `qsa.flightops@zambiaairways.co.zm`
   - `hazard` | `Ground Operations` | `qsa.ground@zambiaairways.co.zm`
   - `hazard` | *(blank)* | `qsa@zambiaairways.co.zm`
   - `incident`| *(blank)* | `incident.desk@zambiaairways.co.zm`
   - `accident`| *(blank)* | `emergency.director@zambiaairways.co.zm`
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

Add a **Condition**: `length(body('Get_rows')?['value'])` is greater than 0.
- If **Yes**: Add **Terminate** (Status: Succeeded) — prevents duplicate processing.

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

### Step 6: Add Row into Excel Table
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
    - If `reporting == 'Named'`: Reporter name and department may be listed.

### Step 9: Error Handling Scope
Enclose steps 4–8 in a **Scope** named `Try_Processing`.
Add a second **Scope** named `Catch_Failure` configured with **Configure run after: has failed, has timed out**:
- Inside `Catch_Failure`, add an email alert to the safety system administrator with the execution link and error details.

---

## 4. Size & Limit Best Practices
- Client-side image compression already ensures files do not exceed 600 KB each (max 5 files = ~3-4 MB payload).
- This stays comfortably within Power Automate's 100 MB request limit and SharePoint 250 MB single-file upload limit.
