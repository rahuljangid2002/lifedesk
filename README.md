# LifeDesk

**Live:** https://rahuljangid2002.github.io/lifedesk/ · demo without login: add `?demo=1`

One login, several everyday tools. The first tool is **Money** (the same personal finance app as the Salesforce
version); **Renewal reminders** and others come later. It is a web app that installs on a phone like an app.
Plain HTML, CSS and JavaScript: no build step, so it can be hosted free on GitHub Pages.

## What is in version 1

The start screen lists the tools. Money has these screens:

| Screen | What it does |
|---|---|
| Money Home | This month's income, expense and net balance; money in hand; accounts; budget progress; people |
| Add Entry | Expense, Income, Transfer, Lent, Got Back, Borrowed, Repaid; category suggested from the description; recent entries with edit and delete |
| Daily Expenses | Every entry date by date with the day's total; a month or custom dates; filters and search |
| Budget | Amount per category per month; last month and 3-month average; copy last month; tap a category to see its expenses |
| People & Loans | Who owes you and whom you owe; history; quick "got back / gave more / paid back / borrowed more"; status |
| My Accounts | Banks, wallets and credit cards with limits; close or delete; pay a card bill in full or in part |
| More | Add categories; download or restore a backup file; sign out |

Net balance = bank + cash − credit card owed − money owed to people.

**Any country:** on first login each user picks their currency (guessed from the device); amounts, number grouping
and dates follow their region. It can be changed under Account. Changing it does not convert existing amounts.

**Any screen:** phones get a bottom bar (with space for the iPhone notch and Android gesture bar); from 900px wide
there is a side menu and pages use two or three columns. Light and dark follow the device setting. Icons are drawn
(`js/icons.js`), so they look the same on Android, iOS and desktop.

Not in version 1 yet (planned next): buying on EMI and EMI plans, assets, "paid by someone", recurring bills,
charts / dashboards, month-end summary email, receipts.

## Two modes

- **Demo mode** (now): `js/config.js` has no Firebase settings. No login; data is saved only in the browser you use.
- **Live mode**: after you paste your Firebase settings into `js/config.js`. Users sign in with Google or a link sent to
  their email, and each user's data is stored in the cloud, private to them, and shared across their devices.

## Try it on this Mac

```bash
cd ~/Documents/Claude/Account-Maintenance/4-Web-App
python3 -m http.server 8765
```
Then open http://localhost:8765 (make the browser window narrow, or use your phone on the same Wi-Fi with the Mac's IP address).

## Turn on login and cloud storage (Firebase, free "Spark" plan)

1. https://console.firebase.google.com → **Add project**, name `lifedesk` (the project ID cannot be changed later). Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method**: enable **Google**, and **Email/Password** with
   **Email link (passwordless sign-in)** switched on.
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
css/app.css           styling
js/config.js          Firebase settings and which sign-in buttons to show
js/store.js           data layer: demo (browser) or Firebase (login + Firestore)
js/logic.js           calculations: balances, month summary, budget, people, validation
js/app.js             start screen (TOOLS), Money screens and navigation
js/seed.js            starter categories with keywords
js/icons.js           line icons
firestore.rules       database security rules (paste into Firebase)
sw.js, manifest.webmanifest, icons/   install on a phone and open offline
tests/ui_flow.py      end-to-end check in demo mode
```

## Data layout (Firestore)

Everything a user owns is under `users/{user id}/...`, and the rules give each user access to that area only.
Money uses `accounts | categories | entries | people | budgets/{YYYY-MM}`, plus `settings/prefs` (currency). Balances are always calculated from the
entries, so editing or deleting an entry can never leave a balance out of date.

## Adding a tool later (e.g. renewal reminders)

1. Give it its own collection names (e.g. `reminders`) and add them to `COLLECTIONS` in `js/store.js`.
2. Put its calculations in their own file next to `js/logic.js`.
3. Add its screens to `SCREENS` and its tile to `TOOLS` in `js/app.js` (set `ready: true`).
No database rule change is needed: the rules already cover everything under the user.

## Test

```bash
python3 -m http.server 8765 &
../3-Demo/demo/.venv/bin/python tests/ui_flow.py
```
