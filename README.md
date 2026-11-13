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
- **Other devices on the same Wi-Fi** (e.g. a phone): open `http://<this computer's IP>:3000`. Allow Node/Java through the firewall for ports 3000, 8180 and 9099 if asked.
- Data is saved to `.emulator-data/` when you stop the emulators with Ctrl+C. Delete that folder to start fresh.
- The emulators use the project ID `demo-zn-qsa`, so nothing can reach a real Firebase project. `VITE_USE_FIREBASE_EMULATORS` is ignored in production builds.

### Running Local and Online Side by Side
Keep your online (development) Firebase project's `VITE_FIREBASE_*` values in `.env.local`, then pick a backend per command. Both can run at the same time:

| Command | Backend | URL |
|---|---|---|
| `npm run dev:online` | Online Firebase project from `.env.local` | http://localhost:3000 |
| `npm run dev:local` | Local emulators (run `npm run emulators` first) | http://localhost:3001 |
| `npm run dev` | Whatever `.env.local` says | http://localhost:3000 |

The dashboard badge shows which one you are on ("Online Firestore Connected" or "Local emulators"). The two keep separate data and separate logins.

### One-Command Setup of an Online Firebase Project
After creating a Firebase project and registering a Web app in the console (and putting its `VITE_FIREBASE_*` values in `.env.local`):
```bash
firebase login:use you@gmail.com        # the Google account that owns the project
npm run setup:firebase -- --email admin@example.com --password YourPassword
```
This creates the Firestore database (default location `africa-south1`, change with `--location`), publishes `firestore.rules`, turns on Email/Password sign-in, creates the admin login and adds it to `admins` and `qsaAdmins`. It shows the account and project and asks before changing anything, and is safe to re-run. Works on the free Spark plan. Options: `--project <id>`, `--account <email>`, `--location <loc>`, `--yes`.

### CMS Privilege Levels & User Accounts
Each CMS user has one of four levels (stored as `role` on `admins/{uid}`):

| Level | Can |
|---|---|
| **Viewer** | View reports and attachments |
| **Officer** | Also update status and notes, and **request deletion** of a report (with a reason) |
| **Manager** | Also **approve or reject deletion requests**, archive/restore reports, see reporter identities, and add / change / block / remove **Viewers and Officers** |
| **Super Admin** | Everything, including creating, promoting, blocking and removing **Managers and Super Admins** |

Nobody can change, block or remove their own account. `npm run setup:firebase` makes the given login a Super Admin. Older setups' `qsaAdmins` members are treated as Managers until a Super Admin changes them; `admins` docs without a role are Officers.

Approved deletions **archive** the report: it disappears from the inbox but is kept, with who requested/approved it and why, and a Manager can restore it from the **Archived** view.

**User Accounts** (Managers and Super Admins): add a user with a level; the app creates their login with a temporary password and emails their login details from the company mailbox via Power Automate (`VITE_FLOW_URL_ACCOUNTS`, see `docs/POWER_AUTOMATE.md` section 5). They must choose their own password at first sign-in. Without that flow, Firebase emails a set-password link instead and the temporary password is shown to the Manager. **Block** stops access immediately but keeps the user listed (one click to unblock); **Remove** is for people who have left. Everyone can change their own password under **My Account**.

**Super Admin two-person rule:** another Super Admin can only *request* to remove, block or change the level of a Super Admin. The Super Admin concerned sees the request at the top of the CMS and must **Approve** it (or Decline). Requests can be withdrawn. Unblocking a Super Admin needs no confirmation. If a Super Admin has left and can't answer, the Firebase project owner can delete their `admins/{uid}` document in the Firebase console.

**Password changes:** after setting a password from an email link, or the first-sign-in "Set your own password" screen, users are taken to the sign-in page with their email filled in.

### Two-Step Sign-In (2FA)
Authenticator-app codes (Google / Microsoft Authenticator), required for every CMS user and enforced by the security rules.

```bash
npm run setup:firebase -- --email you@zambiaairways.co.zm --enable-2fa
```
This upgrades the project to *Firebase Authentication with Identity Platform* (free on the Spark plan, up to 3,000 daily active users), turns on authenticator-app 2FA, and sets `settings/security.require2fa = true`. At their next sign-in each user verifies their email, scans a QR code and confirms a code; after that, sign-in asks for the 6-digit code after the password.

- **Super Admin controls** (User Accounts → Security): switch **Require 2FA for everyone** on. Turning it on is only allowed from a session that itself used 2FA, so nobody can lock everyone out with a project where authenticator codes don't work. There is no "off for everyone" button in the CMS.
- **Start / Stop 2FA for one person** (Super Admins only, not for themselves): the button on the user's row sets `admins/{uid}.twoFactor` to `on` or `off`, which wins over the everyone setting. **Start 2FA**: they must set up an authenticator app (straight away if signed in). **Stop 2FA**: they sign in with just their password; if they had an authenticator app, it is asked for once more at their next sign-in and then removed. The row shows **2FA ON** (signs in with an authenticator code; recorded by the user's own sign-in in `admins/{uid}.twoFactorEnrolled`), **2FA SET-UP PENDING** (required but not set up yet) or **2FA OFF**.
- **Lost phone:** a Super Admin clicks **Reset 2FA** on the user's row to get the exact command, e.g. `npm run reset-2fa -- --email person@zambiaairways.co.zm --project <project-id>`, and runs it from a computer with this repo and the Firebase CLI signed in as the project owner. (Doing it with one click from the browser would need a Cloud Function, i.e. the Blaze plan.) The user sets 2FA up again at next sign-in.
- **Emergency** (no Super Admin can sign in): `npm run setup:firebase -- --email you@... --relax-2fa` stops requiring 2FA.
- The local emulators don't support authenticator-app 2FA, so it is never required there.

These features need the current `firestore.rules` deployed: `firebase deploy --only firestore:rules` (the setup script does this).

### Wrong-password lockout
After **5 wrong passwords** in a row the account is locked (`signInLocks/{email}`), and the sign-in page tells the user to contact a Manager or Super Admin. "Forgot password?" is also refused while locked. A Manager or Super Admin unlocks it with **Unlock & send password reset mail** on the user's row. The security rules refuse a locked account access even if the password is later guessed. A successful sign-in clears the count.

### CMS Sessions
- Signed out after **15 minutes without activity** (60-second "Are you still there?" warning first). Activity in any CMS tab counts.
- Must sign in again after **8 hours**, even if active. The security rules refuse sessions older than 12 hours as a backstop.
- Closing the browser signs you out; refreshing the page does not.
- Change the limits with `VITE_CMS_IDLE_MINUTES` and `VITE_CMS_MAX_SESSION_HOURS` (max 12) in `.env.local` / the build environment.

### Branded Password-Reset & Email-Verification Page
Links in Firebase's emails can open the app's own page (`/auth/action`) instead of Firebase's plain one. Point them at your deployed site once per project:
```bash
npm run setup:firebase -- --email you@zambiaairways.co.zm --action-url https://zn-qsa-reporting-system-test.web.app
```
(Or Firebase console → Authentication → Templates → pencil → *Customize action URL* → `https://<site>/auth/action`.) The site must be deployed first. After resetting, users can continue straight into the CMS, and the "temporary password" label on User Accounts clears automatically at their next sign-in.

### Report Types, Search and Announcements
- **Report types:** Hazard (`HAZ-`), **Incident / Accident** (`IA-`, one combined form; the reporter says whether it was an incident or an accident) and Safety Concern (`SC-`). Old `INC-`/`ACC-` records still show in the CMS under Incidents / Accidents.
- **"Open" reporting:** what used to be called "Named" is shown as **Open** everywhere (the stored value is still `Named`).
- **Wrong report type:** Managers can use **Change type** on a case to move it (e.g. Hazard → Incident / Accident). The case number stays the same and the move is recorded.
- **Search:** the box at the top of the CMS (shortcut `/`) searches every field of every case; all words must match.
- **Urgent:** closed cases no longer show the flashing URGENT badge or count as Urgent Action.
- **Announcements:** Super Admins manage them under **CMS Configuration** (e.g. scheduled maintenance). Several can be live at once: the banner at the top of every page (public forms included) slides through them, most important first, each in its colour (Critical red, Maintenance orange, Notice black, Information green), with optional "show from" / "show until" times.
- **Case-number email:** reporters can optionally enter an email address to receive their case number (Power Automate flow `VITE_FLOW_URL_RECEIPTS`, see `docs/POWER_AUTOMATE.md` section 6). The address is never stored with the report.

### Production Build & Firebase Deployment
```bash
# Build production bundle
npm run build

# Deploy Hosting and Firestore Security Rules to Firebase
firebase deploy --only hosting,firestore:rules
```

---

### Automatic deployment (GitHub Actions)

`.github/workflows/deploy.yml` builds the site and publishes it to Firebase Hosting each time a
pull request is merged into `main` (or when you press **Run workflow** under the repo's
**Actions** tab). One-time setup:

1. `firebase init hosting:github --project zn-qsa-reporting-system-test`: sign in to GitHub
   when asked, enter `ACSprog/zn-qsa-reporting-system`, and answer **No** to the build-script
   and merge-deploy questions. It creates a deploy service account and saves its key as a
   repository secret named `FIREBASE_SERVICE_ACCOUNT_ZN_QSA_REPORTING_SYSTEM_TEST`. Delete any
   `.github/workflows/firebase-hosting-*.yml` files it writes (don't commit them). If it asks to overwrite an existing file, answer **No**.
2. On GitHub, **Settings -> Secrets and variables -> Actions -> New repository secret**: name
   `ENV_LOCAL`, value = the whole of your `.env.local` file.

Firestore rules are not deployed automatically: run `firebase deploy --only firestore:rules`
when `firestore.rules` changes. At go-live, change `FIREBASE_PROJECT` and the service-account secret name
in the workflow, and `ENV_LOCAL`, to the live project.

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

### Deleting cases
- **Archive** (Managers and Super Admins) hides a case but keeps it; it can be restored. Officers can request it.
- **Delete permanently** (Super Admins only): the bin button next to **Inspect**, or **Delete permanently** in the case view. You must type the case number and give a reason. It removes the case, its evidence files and the reporter's identity for good. An audit record (case number, who, when, reason; no case content) is kept in `caseDeletions/{reportId}`. Rows already copied to Excel / SharePoint are **not** removed.
