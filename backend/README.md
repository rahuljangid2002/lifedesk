# Email one-time codes (Google Apps Script)

A new email + password account must confirm its email with a 6-digit code before it is created. Firebase has no
built-in emailed code, so this small script does it, for free:

1. `send` – emails a 6-digit code (from your Gmail) to the address.
2. `verify` – checks the code typed by the user (10 minutes, 5 tries).
3. `confirm` – after the account is created, marks its email as verified in Firebase Authentication.

`firestore.rules` refuses every email + password account whose email is not verified, so skipping the code
(for example by calling Firebase directly) gives an account that cannot read or save anything.

The script runs as **you**, and must be deployed from the Google account that owns the Firebase project
(`lifedesk-43dc1`). No private key is stored. Limits: about 100 emails a day on a free Google account (the script
stops at 90), 3 codes per address per 15 minutes.

## Set up (about 10 minutes, once)

1. Open https://script.google.com with the Google account that owns the Firebase project → **New project**.
   Name it `LifeDesk email codes` (click "Untitled project").
2. Delete what is in `Code.gs` and paste all of `email-codes.gs`.
3. Left side: **Project Settings** (gear) → tick **Show "appsscript.json" manifest file in editor**.
   Back in **Editor**, open `appsscript.json`, delete its contents and paste all of this folder's `appsscript.json`. Save.
4. In the function drop-down at the top choose **selfTest** → **Run**.
   - Google asks for permission: **Review permissions** → choose your account → "Google hasn't verified this app" →
     **Advanced** → **Go to LifeDesk email codes (unsafe)** → **Allow**. (It is your own script; the warning appears
     for every personal script.)
   - The log at the bottom must say `OK: this account can manage users of lifedesk-43dc1`.
     If it says PROBLEM, copy that line to Claude before going on.
5. **Deploy → New deployment** → gear → **Web app** → Execute as **Me**, Who has access **Anyone** → **Deploy**.
   Copy the **Web app URL** (it ends in `/exec`).
6. Put that URL in `js/config.js` as `otpEndpoint` and publish the app (`git push`). It is an address, not a secret.
7. Firebase console → Firestore Database → **Security** tab → paste `firestore.rules` → **Publish**.

## Changing the script later

After editing the code: **Deploy → Manage deployments → pencil → Version: New version → Deploy**.
The URL stays the same.

# Push notifications (Google Apps Script, every hour)

Renewal reminders and a start-of-month nudge reach the phone or computer even when LifeDesk is closed. The app
asks for permission and saves the device's notification address with the reminders' due dates (no names, amounts
or notes) in `users/{uid}/push/schedule`. `push-sender.gs` runs every hour, and from 9 in the morning in each
user's own time zone sends what is due that day through Firebase Cloud Messaging. Both are free.

It runs as **you** and must be set up from the Google account that owns the Firebase project. No private key.
On iPhone and iPad, notifications work only after LifeDesk is added to the Home Screen (iOS 16.4 or later).

## Set up (about 10 minutes, once)

1. https://script.google.com (owner account) → **New project** → name it `LifeDesk push sender`.
2. Replace `Code.gs` with all of `push-sender.gs`.
3. **Project Settings** (gear) → tick **Show "appsscript.json" manifest file in editor**. In **Editor**, replace
   `appsscript.json` with all of `push-sender.appsscript.json`. Save.
4. Function drop-down → **setup** → **Run** → allow the permissions (same "unsafe" warning as the email-code
   script: **Advanced** → **Go to LifeDesk push sender** → **Allow**).
   The log must say `OK: the database can be read, and sendDue now runs every hour.`
   If it says PROBLEM, copy that line to Claude.
5. In LifeDesk (signed in): **Account & backup → Notifications → Turn on for this device**, allow notifications.
6. Back in the script: function **sendTest** → **Run**. The device should show "LifeDesk test" within a minute.

Nothing to deploy: the timer (Triggers, clock icon) runs `sendDue` every hour. Words of the messages: `TEXT` at
the top of the script. To stop all notifications: delete the trigger.
