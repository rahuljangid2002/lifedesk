# LifeDesk

**Live:** https://rahuljangid2002.github.io/lifedesk/ · demo without login: add `?demo=1`

One login, several everyday tools: **Account Management** (called Money at first; the same personal finance app as the
Salesforce version) and **Renewal reminders**. It is a web app that installs on a phone like an app, with an
iPhone-like look, voice entry in English and Hindi, and reminders by notification and email.
Plain HTML, CSS and JavaScript: no build step, so it can be hosted free on GitHub Pages.

## What is in it

The start screen lists the tools. Account Management has these screens:

| Screen | What it does |
|---|---|
| Home | This month's income, expense and net balance; money in hand; accounts; budget progress; people |
| Add Entry | Expense, Income, Transfer, Lent, Got Back, Borrowed, Repaid; category suggested from the description; recent entries with edit and delete |
| Daily Expenses | Every entry date by date with the day's total; a month or custom dates; filters and search |
| Budget | Amount per category per month; last month and 3-month average; copy last month; tap a category to see its expenses |
| Payments | EMIs (due, overdue, pay early) and credit card bills (full or part) in one place, with what was paid recently. An EMI paid is an expense; a card bill is a transfer |
| Dashboards | Monthly (opening and closing balance, income, expense, savings, spend by category, budget vs actual, daily spend, spend by account, top 10 expenses), Yearly (income vs expense by month, net balance trend, top categories, income by source; the year can start in any month) and Balances (by account, by card, by person) |
| Reports | 18 reports as tables with totals and CSV download: monthly summary, spend by category, category by month, daily spend, budget vs actual, top expenses, spend by account, income by source, year over year, lending activity, money to receive, owed to people, bad debts, account balances, all entries |
| People & Loans | Who owes you and whom you owe; history; quick "got back / gave more / paid back / borrowed more"; status |
| My Accounts | Banks, wallets and credit cards with limits; close or delete; pay a card bill in full or in part |
| Account | Currency; add categories; download or restore a backup file; **load or remove sample data** (made-up history from 1 March 2025 to today); sign out; delete my account |
| Voice entry | Speak an entry (English or Hindi) from the + button, "Speak it" on Add Entry or the Home shortcut; several entries in one sentence; asks for what is missing; nothing is saved before you confirm; edit first, Undo after. Uses the browser's own speech recognition (Chrome, Edge, Safari) |
| Renewal reminders (second tool) | Insurance, subscriptions, documents, warranties and bills with a due date, repeat and "remind me … days before"; Overdue / Due soon / Later; Renewed moves to the next date and can record the payment |
| Notifications | Account → Notifications: push notifications per device and an optional email, every morning from the chosen day until Renewed; a start-of-month reminder |
| Offline | A screen when the connection drops (Try again / Continue offline); changes are sent when back online |

Net balance = bank + cash − credit card owed − money owed to people.

**Encrypted:** after signing in, each user sets a data passphrase (and is shown a recovery code once). Every document
is encrypted on the device (AES-GCM, key wrapped with PBKDF2 from the passphrase and from the recovery code; see
`js/vault.js`) before it is saved, so the database holds only unreadable text, also for the project owner. Asked once
per device; Account → Lock this device. Still visible to the owner: sign-in email, document ids (budget ids are months),
collection names, how many documents there are and when they changed. A forgotten passphrase with a lost recovery code
cannot be recovered. The downloaded backup file is not encrypted.

**Any country:** on first login each user picks their currency (guessed from the device); amounts, number grouping
and dates follow their region. Changing it under Account offers two choices: convert every saved amount at an exchange rate
(today's rate from open.er-api.com, editable; a backup is downloaded first), or keep the numbers and change only the symbol.

**Light and dark:** Account → Appearance: System (follows the device), Light or Dark; kept on the device.

**Any screen:** phones get a bottom bar (with space for the iPhone notch and Android gesture bar); from 900px wide
there is a side menu and pages use two or three columns. Light and dark follow the device setting. Icons are drawn
(`js/icons.js`), so they look the same on Android, iOS and desktop.

**Buying on EMI:** Add Entry → Expense → "Bought on EMI / finance" (EMI, number of EMIs, first date, down payment,
rate calculated when left empty). Loans are listed under People & Loans → Loans; EMIs due this month appear on
Add Entry and Money home with a Pay button. Collection `loans`.

**Assets:** Add Entry → Asset creates the asset (optionally on EMI, which links its loan); My assets lists price paid,
worth now, loan left, interest paid and still to pay. Dashboards → Loans & assets; reports Asset register, Loan summary,
EMI payments. Collection `assets`.

Not built yet: changing an EMI plan,
"paid by someone", recurring bills, month-end summary email, receipts.

## Two modes

- **Demo mode** (now): `js/config.js` has no Firebase settings. No login; data is saved only in the browser you use.
- **Live mode** (now on): users sign in with **email + password** (create account, forgot password) or **Google**.
  A new email + password account must first confirm its email with a **6-digit code** (see `backend/README.md`).
  Each user's data is stored in the cloud, private to them, and shared across their devices. Account → "Delete my
  account and data" removes everything.

## Try it on this Mac

```bash
cd ~/Documents/Claude/Account-Maintenance/4-Web-App
python3 -m http.server 8765
```
Then open http://localhost:8765 (make the browser window narrow, or use your phone on the same Wi-Fi with the Mac's IP address).

## Turn on login and cloud storage (Firebase, free "Spark" plan)

1. https://console.firebase.google.com → **Add project**, name `lifedesk` (the project ID cannot be changed later). Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method**: enable **Google** and **Email/Password**
   (the "Email link" toggle is only needed if `emailLink` is switched on in `js/config.js`).
3. **Build → Firestore Database → Create database** (production mode; pick a location such as `asia-south1` Mumbai).
4. Firestore → **Rules**: paste the contents of `firestore.rules` and **Publish**. This is what keeps each user's data private.
5. **Project settings (gear) → Your apps → Web (`</>`)** → register an app → copy `apiKey`, `authDomain`, `projectId`
   and `appId` into `js/config.js`.
6. After hosting (below): Authentication → **Settings → Authorized domains** → add `<your-github-name>.github.io`.

The values in `js/config.js` are public identifiers, not passwords. Access is protected by the login and the rules.

## Host it free on GitHub Pages

Already set up: repository `rahuljangid2002/lifedesk`, Pages from branch `main`. To publish a change: `git push`
(the site updates in about a minute). The steps below are for setting it up again elsewhere.

1. Create a GitHub account and a new **public** repository named `lifedesk`.
2. In this folder:
   ```bash
   git remote add origin https://github.com/<your-github-name>/lifedesk.git
   git push -u origin main
   ```
3. On GitHub: repository → **Settings → Pages** → Source **Deploy from a branch** → Branch `main`, folder `/ (root)` → Save.
4. After a minute the app is at `https://<your-github-name>.github.io/lifedesk/`.
   On a phone: open it → browser menu → **Add to Home screen**.

## Mobile number + OTP (later)

SMS is the one part that is not free anywhere. Firebase supports it, but it needs the pay-as-you-go "Blaze" plan with a
card on the billing account, and each SMS is charged. When you want it: upgrade the project, enable **Phone** under
Sign-in method, and set `phoneOtp: true` in `js/config.js` (the login screen then needs the phone form added).

## Files

```
index.html            page shell
css/app.css           layout and colour tokens
css/ios.css           the look and the movement (large titles, frosted bars, sheets, screen transitions, offline screen, toasts, voice sheet)
js/config.js          Firebase settings and which sign-in buttons to show
js/store.js           data layer: demo (browser) or Firebase (login + Firestore)
js/logic.js           calculations: balances, month summary, budget, people, validation
js/app.js             start screen (TOOLS), all screens, navigation, toasts, notifications, the voice sheet
js/voice.js           voice entry rules (no screen code): numbers, type, account, category, date, questions, yes / no
js/seed.js            starter categories with keywords
js/icons.js           line icons
js/reports.js         figures for dashboards and reports (pure calculations), CSV
js/charts.js          small chart kit (bars, columns, line, meters; table twin and tooltip for each)
js/insights.js        Dashboards and Reports screens
js/sample.js          sample data generator (ids start with "sample-")
firestore.rules       database security rules (paste into Firebase)
backend/              Google Apps Scripts: sign-up codes (email-codes.gs) and the hourly reminder sender (push-sender.gs)
tools/                local servers: serve_dev.py (127.0.0.1:8765, no cache), serve_app.py (app files only, for a phone test)
sw.js, manifest.webmanifest, icons/   install on a phone and open offline
tests/                ui_flow, renewals, offline, voice_rules, voice_ui, voice_close, add_steady (demo mode); live_login, encryption, push_live (real Firebase); push_rules
```

## Data layout (Firestore)

Everything a user owns is under `users/{user id}/...`, and the rules give each user access to that area only.
Account Management uses `accounts | categories | entries | people | budgets/{YYYY-MM} | loans | assets`, Renewal reminders uses `reminders`, plus `settings/prefs` (currency)
and `push/schedule` (device tokens, time zone and reminder dates for the sender; the only document that is not encrypted). Balances are always calculated from the
entries, so editing or deleting an entry can never leave a balance out of date.

## Adding a tool (as Renewal reminders was)

1. Give it its own collection names (e.g. `reminders`) and add them to `COLLECTIONS` in `js/store.js`.
2. Put its calculations in their own file next to `js/logic.js`.
3. Add its screens to `SCREENS` and its tile to `TOOLS` in `js/app.js` (set `ready: true`).
No database rule change is needed: the rules already cover everything under the user.

## Test

```bash
python3 tools/serve_dev.py &                          # 127.0.0.1:8765, never cached
../3-Demo/demo/.venv/bin/python tests/ui_flow.py      # demo mode, every screen
../3-Demo/demo/.venv/bin/python tests/live_login.py   # real Firebase sign-up with a stand-in code service; deletes its test account
../3-Demo/demo/.venv/bin/python tests/encryption.py   # real Firebase: passphrase, what the database stores, second device, recovery
../3-Demo/demo/.venv/bin/python tests/renewals.py     # renewal reminders
../3-Demo/demo/.venv/bin/python tests/voice_ui.py     # voice entry with stand-ins for listening and speaking (also voice_rules, voice_close)
../3-Demo/demo/.venv/bin/python tests/offline.py      # the offline screen
../3-Demo/demo/.venv/bin/python tests/add_steady.py   # Add Entry stays steady
```
