# Zambia Airways Safety Reporting System

Official Safety Management System (SMS) web application for **Zambia Airways (2014) Limited** to report hazards, operational incidents, accidents, and safety concerns in compliance with ZCAA (Zambia Civil Aviation Authority) regulations and ICAO Annex 19.

Built with **React + TypeScript + Vite + Tailwind CSS**, integrating with **Firebase Firestore & Authentication (Spark Plan)**, and **Microsoft 365 / Power Automate** (Excel Online & SharePoint).

---

## 1. Architecture & Hard Constraints

- **Multi-Portal Separation:** The system strictly separates public reporter interfaces from administrative operations:
  - **Public Reporting Portal (`/`):** Clean, accessible, mobile-first interface for flight crew, ground personnel, passengers, and staff. Contains no administrative buttons or portal controls.
  - **Direct Form URLs:** Each reporting category has a distinct direct URL:
    - Hazard Form: `/hazard`
    - Incident Form: `/incident`
    - Accident Form: `/accident`
    - Safety Concern Form: `/concern`
  - **QSA Owner Portal (`/admin`):** Fully isolated administrative portal accessed strictly by authenticated safety managers and inspectors for investigation, risk assessment, archive management, and Excel/SharePoint re-sync through Power Automate.
- **Firebase Spark Plan Compliance:** No Firebase Cloud Functions and no Firebase Cloud Storage (`firebase/storage`, buckets). Evidence attachments are processed client-side, stored as sanitized base64 chunks (<600 KB) in a Firestore subcollection, and mirrored into SharePoint Online via Power Automate HTTP webhooks.
- **Client-Side Sanitization:** Images are decoded, normalized for rotation, stripped of all EXIF/GPS/device metadata via canvas redraw, resized to ≤1600 px, iteratively compressed to ≤600 KB, and assigned sequential neutral names (`evidence-1.jpg`, `evidence-2.jpg`).
- **Anonymity Protections:** Anonymous reports strictly suppress and clear the four reporter identity fields (`name`, `department`, `position`, `contact`) both in the UI and payload. PDF attachments are disabled for anonymous reports to prevent author metadata leakage. No IP addresses or device fingerprints are recorded.
- **Master Firestore Transaction:** All report submissions execute as an atomic `writeBatch` in Firestore.
- **Non-blocking Power Automate Dispatch:** Submissions POST payload JSON to Power Automate with `mode: 'no-cors'` without blocking user confirmation.
- **Bi-directional Reconciliation:** Built-in **Sync to Excel** (through the same Power Automate flow) allows safety managers to restore deleted rows and evidence files to Excel and SharePoint from the Firestore master.

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

### Local Hosting with Firebase Emulators (no cloud project needed)
Runs a real Firestore database and login system on your own computer, with the same security rules as production. Reports are shared between every tab, browser and device that opens the app, and are kept between restarts.

**One-time setup**
1. Install **Java 21 or newer** (e.g. from https://adoptium.net), needed by the Firestore emulator.
2. Install the Firebase CLI: `npm install -g firebase-tools`
3. In `.env.local`, set `VITE_USE_FIREBASE_EMULATORS=true`.

**Each time you work** (use two terminals)
```bash
# Terminal 1: start the local database and login emulators
npm run emulators

# Terminal 2 (first time, and after clearing emulator data): create the QSA admin login
npm run seed:emulators            # admin@zambiaairways.co.zm / safety2026
# or: npm run seed:emulators -- you@example.com yourPassword

# Terminal 2: start the app
npm run dev
```
- Public forms: http://localhost:3000 · QSA dashboard: http://localhost:3000/admin
- Emulator dashboard (browse/edit data, users): http://localhost:4000
- **Other devices on the same Wi-Fi** (e.g. a phone): open `http://<this computer's IP>:3000`. Allow Node/Java through the firewall for ports 3000, 8081 and 9099 if asked.
- Data is saved to `.emulator-data/` when you stop the emulators with Ctrl+C. Delete that folder to start fresh.
- The emulators use the project ID `demo-zn-qsa`, so nothing can reach a real Firebase project. `VITE_USE_FIREBASE_EMULATORS` is ignored in production builds.

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

## 4. Sync to Excel (through Power Automate)

**Sync to Excel** needs no Microsoft app registration. The dashboard re-sends one report to the same Power Automate flow with `restore: true`, and the flow restores the Excel row and SharePoint files using its own connections.

1. Open `/admin`, open the report, and click **Sync to Excel** at the bottom of the details panel.
2. The app cannot read the flow's reply, so it can only confirm that the report was sent. Check the workbook after a minute.
3. If the Excel row already exists, nothing is duplicated. No notification email is sent.

The flow must implement the `restore` handling described in `docs/POWER_AUTOMATE.md`.

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
  - Open `/admin`, open that report, and click **Sync to Excel**.
  - Wait a minute: verify the row and the evidence files are restored, with no new email notification.
  - Click **Sync to Excel** again: verify nothing is duplicated.
