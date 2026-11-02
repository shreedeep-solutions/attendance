# Staff Attendance & Payroll v2: Shreedeep Solutions

Attendance is recorded automatically by QR scans. Nobody can type or edit their own attendance, including the staff member who used to mark it.

```
Office PC (QR screen)            Staff phone (own, approved)            Firebase (rules enforce everything)
QR changes every 15 s   ──scan──▶ selfie + same internet + GPS ──────▶ punch saved with SERVER time
                                                                       admins only: corrections (with reason)
GitHub Actions every 10 min ──▶ alerts, reminders, 11 PM month-end PDF, payslip emails
```

## Files
| File | What it is |
|---|---|
| `index.html` | App page. Your Firebase config goes here. |
| `app.js` | App logic: admin portal, staff phone app, office QR screen |
| `engine.js` | All calculations (days, leave, salary, reports). Used by the app and the jobs. |
| `mock-firebase.js` | DEMO only. Used automatically when the Firebase config is empty. |
| `manifest.json`, `sw.js`, `icons/` | Installable app (PWA), offline support, notifications |
| `database.rules.json` | **Security rules.** Paste these into Firebase. |
| `.github/workflows/attendance-jobs.yml`, `jobs/` | Automatic jobs run by GitHub Actions |

---

## 1. Firebase (about 15 min)
1. Go to console.firebase.google.com and **Add project**: `attendance-shreedeep` (Analytics off).
2. **Build → Realtime Database → Create database**: location **Singapore (asia-southeast1)**, locked mode.
3. **Rules** tab: replace everything with the contents of `database.rules.json`, then **Publish**.
4. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password** and **Anonymous**.
5. **Authentication → Settings → Authorized domains**: add `shreedeep-solutions.github.io` and `attendance.shreedeepsolutions.com`.
6. **Project settings (⚙) → Your apps → Web `</>`**: register the app, copy the config, and paste it into `CFG.firebase` at the bottom of `index.html`. Make sure `databaseURL` is filled.
7. **Project settings → Service accounts → Generate new private key**: this downloads a JSON file. Keep it private; it is needed in step 3.

Everything here runs on the free Spark plan. Selfies are about 15 KB each and are deleted automatically after 90 days.

## 2. GitHub Pages
1. Create a **public** repo `shreedeep-solutions/attendance`. A public repo is what makes Pages and Actions free. Secrets stay private.
2. Upload **all** files and folders, including `.github/` and `jobs/`, but **not** `VAPID-KEYS-KEEP-PRIVATE.txt`.
3. **Settings → Pages**: Deploy from branch `main` / root.
4. Optional subdomain: add a file `CNAME` containing `attendance.shreedeepsolutions.com`. At Namecheap, add a CNAME record `attendance` → `shreedeep-solutions.github.io`. Then tick **Enforce HTTPS**.
   *The camera and notifications need HTTPS, so always use the https:// address.*

## 3. Automatic jobs: GitHub Actions secrets
Go to repo **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Entire contents of the service-account JSON from step 1.7 |
| `FIREBASE_DB_URL` | Your `databaseURL`, e.g. `https://attendance-shreedeep-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `GMAIL_USER` | `shreedeepsolutions@gmail.com` |
| `GMAIL_APP_PASSWORD` | Google Account → Security → 2-Step Verification → **App passwords** → create "Attendance" (16 letters) |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | From `VAPID-KEYS-KEEP-PRIVATE.txt` |
| `APP_URL` | `https://attendance.shreedeepsolutions.com/index.html` |

Then open **Actions → Attendance jobs → Run workflow** once to test. The admin Dashboard shows "Automatic jobs — last run".
*GitHub pauses scheduled jobs after 60 days without a commit and sends an email first. Click "Enable workflow" or make any small commit.*

## 4. First day
1. **Admin:** open `…/index.html?admin` → *New partner? Create admin account*. **Deepali first**; the first account becomes the owner. Run the setup wizard (it adds the 4 staff). Shriraj then signs up and Deepali approves him in **Devices**.
2. **Staff tab:** enter each person's salary, mobile, email (payslips are emailed here), date of birth and joining date.
3. **Settings:**
   - Do this from a phone *inside the office*: tap "Use this device's location". Then Save.
   - **Import Maharashtra holidays.** The 2026 Government list is built in. Add the 2027 list when the Government notifies it in December.
   - Upload both partners' signatures and the firm stamp. Add the month-end report emails.
4. **Office PC:** open `…/index.html?kiosk` and note the 6-letter code. Approve it in **Devices**. Press *Full screen*. Keep the PC on the **same Wi-Fi/router as the staff phones**, and stop it from sleeping (Windows → Power → Screen: never).
5. **Each staff phone:** open the site, tap *Staff*, pick their name and take a selfie. Approve in **Devices** after checking the selfie. Then on the phone: *More → Install app* and *Enable notifications*.

## 5. Daily use
- **Staff** tap *Scan office QR* (or point the normal camera at the screen). The app checks the network and location, takes a selfie, then they choose *Check in / Start break / End break / Check out*. Checking out early asks for a reason.
- **Leave:** staff apply in the app, admins approve in **Requests**, and the register fills itself. Sick leave over 2 days needs a medical note. Busy periods block other leave.
- **Forgot to scan:** staff send a correction request and an admin approves it.
- **Corrections** by admins always need a reason. A correction older than 7 days needs the *other* partner's approval. Everything goes to the **Log**.
- **Month end:** at about 11 PM on the last day, partners get the PDF report by email. Review it, then **Salary → Finalise & lock**. Payslip PDFs are emailed to staff and appear in their app. Payslips print signed & stamped or unsigned.

## How the numbers work
- Hours (in → out) ≥ 8 = full day; ≥ 4 = half day; less = absent. Editable in Settings.
- No check-out = half day until corrected.
- Late = more than 15 min after the shift start. Each person can have their own shift.
- Per day = monthly ÷ days in month. Weekly off (Tuesday) and holidays are paid.
- Working on an off day = an extra day's pay, or comp-off (Settings).
- Paid leave: credited monthly, carry-forward and April reset are options. Leave beyond the balance is unpaid.
- Salary revisions: if a revision is backdated into locked months, the arrears are added automatically in the next open month.

## Honest limits
- A website cannot read the Wi-Fi name. It compares the **internet address** of the phone with the office PC. Phones on mobile data or another router fail, which is what we want. If the office has two internet connections, keep the PC and the phones on one of them.
- GPS can be faked with special Android apps, so by default far-away scans are only **flagged**. The QR + same-network + selfie checks are the real protection.
- Scanning needs internet (by design). The app still opens offline and shows the last saved data.
- If the internet provider changes the office address, the QR screen picks up the new one within 5 minutes. Anyone who fails during that window just scans again.

## Merging into one Shreedeep portal later (#100)
1. **One login for everything.** Point every app (TaskFlow, HabitFlow, Billing, Attendance…) at **one Firebase project** and use Firebase Auth email login. Each app keeps its own database root (`att/`, `tasks/` …). Copy each app's rules under its own root key in one rules file.
2. **One portal page.** Create `portal.shreedeepsolutions.com`: a single page with the shared login and a tile per app, showing only the tiles allowed by `roles/{uid}` (admin / staff).
3. **Each app becomes a module.** Move each app's `render()` into a function such as `Attendance.mount(el)`, loaded only when its tile is opened. This app is already split this way (`engine.js` + views), so it moves over as-is.
4. **Shared pieces.** One staff list (`people/`, used by Attendance, TaskFlow ranking and HabitFlow), one notifications service (the GitHub Actions job already does it), and one design (the maroon theme).
5. **Order of work:** move one app at a time behind the portal, keeping the old address live until each move is checked.
