# Zambia Airways Safety Reporting System

Official Safety Management System (SMS) web application for **Zambia Airways (2014) Limited** to report hazards, operational incidents, accidents, and safety concerns in compliance with ZCAA (Zambia Civil Aviation Authority) regulations and ICAO Annex 19.

Built with **React + TypeScript + Vite + Tailwind CSS**, integrating with **Firebase Firestore & Authentication (Spark Plan)**, **Microsoft 365 / Power Automate**, and **Microsoft Graph (Excel Online & SharePoint)**.

---

## 1. Architecture & Hard Constraints

- **Multi-Portal Separation:** The system strictly separates public reporter interfaces from administrative operations:
  - **Public Reporting Portal (`/`):** Clean, accessible, mobile-first interface for flight crew, ground personnel, passengers, and staff. Contains no administrative buttons or portal controls.
  - **Direct Form URLs:** Each reporting category has a distinct direct URL:
    - Hazard Form: `/hazard`
    - Incident Form: `/incident`
    - Accident Form: `/accident`
    - Safety Concern Form: `/concern`
  - **QSA Owner Portal (`/admin`):** Fully isolated administrative portal accessed strictly by authenticated safety managers and inspectors for investigation, risk assessment, archive management, and Microsoft Graph synchronization.
- **Firebase Spark Plan Compliance:** No Firebase Cloud Functions and no Firebase Cloud Storage (`firebase/storage`, buckets). Evidence attachments are processed client-side, stored as sanitized base64 chunks (<600 KB) in a Firestore subcollection, and mirrored into SharePoint Online via Power Automate HTTP webhooks.
- **Client-Side Sanitization:** Images are decoded, normalized for rotation, stripped of all EXIF/GPS/device metadata via canvas redraw, resized to ≤1600 px, iteratively compressed to ≤600 KB, and assigned sequential neutral names (`evidence-1.jpg`, `evidence-2.jpg`).
- **Anonymity Protections:** Anonymous reports strictly suppress and clear the four reporter identity fields (`name`, `department`, `position`, `contact`) both in the UI and payload. PDF attachments are disabled for anonymous reports to prevent author metadata leakage. No IP addresses or device fingerprints are recorded.
- **Master Firestore Transaction:** All report submissions execute as an atomic `writeBatch` in Firestore.
- **Non-blocking Power Automate Dispatch:** Submissions POST payload JSON to Power Automate with `mode: 'no-cors'` without blocking user confirmation.
- **Bi-directional Reconciliation:** Built-in **Sync to Excel** using MSAL and Microsoft Graph allows safety managers to restore deleted rows and evidence files to Excel and SharePoint from the Firestore master.

---

## 2. Local Development & Deployment

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Populate VITE_ variables in .env.local with your Firebase & Microsoft credentials

# 3. Start local Vite development server
npm run dev
```

### Production Build & Firebase Deployment
```bash
# Build production bundle
npm run build

# Deploy Hosting and Firestore Security Rules to Firebase
firebase deploy --only hosting,firestore:rules
```

---

## 3. Firebase Setup (Spark Plan)

1. Open the [Firebase Console](https://console.firebase.google.com/) and create a new project (e.g. `zambia-airways-safety`).
2. **Enable Firestore Database:**
   - Select **Cloud Firestore** -> **Create database**.
   - Choose production mode and your preferred region (e.g., `europe-west2` or `us-central1`).
3. **Enable Authentication:**
   - Go to **Authentication** -> **Sign-in method**.
   - Enable **Microsoft** (`OAuthProvider("microsoft.com")`).
   - Enable **Google** (`GoogleAuthProvider`).
4. **Provision Initial Administrators (RBAC):**
   - After signing in with your Microsoft or Google corporate account in the app, note your Firebase Authentication UID.
   - In Firestore Console, create a document in `admins/{uid}`:
     ```json
     { "enabled": true, "email": "safety.manager@zambiaairways.co.zm" }
     ```
   - To grant permission to view confidential reporter identities, also create a document in `qsaAdmins/{uid}`:
     ```json
     { "enabled": true, "qsaOfficer": true }
     ```
5. **Hard Constraint Reminder:** Do **not** enable Cloud Storage. The app runs completely on the free Spark tier.

---

## 4. Microsoft Entra ID (Azure AD) App Registration

To enable the **Sync to Excel** feature using MSAL and Microsoft Graph:

1. Open the [Microsoft Entra Admin Center](https://entra.microsoft.com/).
2. Navigate to **Identity** -> **Applications** -> **App registrations** -> **New registration**.
   - **Name:** `Zambia Airways Safety Sync`
   - **Supported account types:** Accounts in this organizational directory only (Single tenant) or Multitenant.
   - **Redirect URI:** Select **Single-page application (SPA)** and add:
     - `http://localhost:3000`
     - `http://localhost:5173`
     - `https://{your-firebase-project}.web.app`
3. Under **API permissions**, add Microsoft Graph **Delegated permissions**:
   - `User.Read`
   - `Files.ReadWrite.All` (required to read/append rows to the Excel workbook and upload evidence to SharePoint)
4. Click **Grant admin consent for Zambia Airways (2014) Limited**.
5. Copy the **Application (client) ID** and **Directory (tenant) ID** into your `.env.local` file:
   - `VITE_MSAL_CLIENT_ID`
   - `VITE_MSAL_TENANT_ID`

---

## 5. Testing Checklist

Use this checklist to verify production readiness:

- [ ] **Reporting Modes:**
  - Submit a **Named** report: verify reporter name, department, position, and contact are stored in `identities/{reportId}`.
  - Submit a **Confidential** report: verify identity is stored in `identities/{reportId}` and inaccessible to non-QSA admins.
  - Submit an **Anonymous** report: verify that selecting "Anonymous" immediately clears and hides the four identity fields, no `identities/{reportId}` document is created, and the Excel row leaves identity cells completely blank.
- [ ] **Evidence Upload Limits:**
  - Attach 1 photo: confirms successful compression and neutral name (`evidence-1.jpg`).
  - Attach 5 photos: verifies maximum limit accepted.
  - Attempt to attach a 6th file: confirms error message stating maximum 5 files exceeded.
- [ ] **Image Compression & EXIF Stripping:**
  - Upload a high-resolution smartphone camera photo (>5 MB with GPS enabled).
  - Verify client-side compression reduces size to ≤600 KB and longest dimension to ≤1600 px.
  - Verify that camera EXIF and GPS geolocation metadata are completely stripped.
- [ ] **Anonymous PDF Refusal:**
  - Select "Anonymous" and attempt to upload a PDF file.
  - Confirm the system rejects the PDF with a notification explaining author metadata risk.
- [ ] **Power Automate Integration:**
  - Verify that submitting a report fires the HTTP webhook without blocking the user confirmation screen.
  - Check that the row appears in Excel (`tblHazard`, `tblIncident`, `tblAccident`, or `tblConcern`).
  - Check that evidence files are written to SharePoint `/Safety Evidence/{reportId}`.
  - Check notification email delivery to the routed safety recipient.
- [ ] **Reconciliation & Sync to Excel:**
  - Delete a test row from Excel and remove the SharePoint evidence folder.
  - Open `/admin`, click **Sync to Excel**, run **Preview** to verify the dry-run summary.
  - Click **Sync to Excel**: verify that the row and missing evidence files are restored without triggering new email notifications.
