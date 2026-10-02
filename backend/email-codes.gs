/**
 * LifeDesk – email one-time codes (Google Apps Script web app).
 *
 * Emails a 6-digit code, checks it, and then marks the user's email as verified in Firebase Authentication.
 * The database rules refuse every email + password account whose email is not verified, so an account that
 * skipped this step cannot read or save anything.
 *
 * Runs as the person who deploys it, who must be an owner of the Firebase project (that is what lets it mark
 * an email as verified; no private key is stored anywhere). Emails are sent from that person's Gmail.
 * Limits: Gmail allows about 100 emails a day on a free account; DAILY_LIMIT below stays under that.
 *
 * Set-up steps are in backend/README.md.
 */
const PROJECT_ID = 'lifedesk-43dc1';
const WEB_API_KEY = 'AIzaSyCV6JwF2Unc3QljVGBa1Mff8SCiVSzIUIc'; // public identifier, same as in js/config.js
const APP_NAME = 'LifeDesk';

// ---------- the words in the email: change them here ----------
// {code} = the 6 digits, {app} = APP_NAME, {minutes} = how long the code works
const EMAIL_TEXT = {
  subject: 'Your {app} verification code: {code}',
  heading: 'Confirm your email',
  intro: 'Use this code to finish creating your {app} account.',
  validity: 'This code works for {minutes} minutes and can be used once.',
  safety: 'If you did not ask for this code, you can ignore this email. Nobody can create the account without it. Never share this code with anyone; {app} will never ask you for it.',
  footer: '{app} – your everyday desk for money, budget and reminders.'
};
const EMAIL_COLOURS = { brandDark: '#312e81', brand: '#4f46e5', text: '#0f172a', muted: '#5b6780', codeBg: '#eef0ff', page: '#f3f5fb' };

const CODE_MINUTES = 10; // a code works for this long
const MAX_TRIES = 5; // wrong guesses before a new code is needed
const SENDS_PER_EMAIL = 3; // codes per address per 15 minutes
const DAILY_LIMIT = 90; // codes per day, all users together
const VERIFIED_MINUTES = 30; // after a correct code, time allowed to finish creating the account

function doGet() {
  return json({ ok: true, service: APP_NAME + ' email codes' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    if (req.action === 'send') return json(sendCode(req.email));
    if (req.action === 'verify') return json(verifyCode(req.email, req.code));
    if (req.action === 'confirm') return json(confirmAccount(req.idToken));
    return json({ ok: false, error: 'bad_request' });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

/** Emails a new code to the address. */
function sendCode(rawEmail) {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, error: 'bad_email' };
  const cache = CacheService.getScriptCache();
  const key = keyOf(email);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sends = Number(cache.get('n:' + key) || 0);
    if (sends >= SENDS_PER_EMAIL) return { ok: false, error: 'rate' };
    const props = PropertiesService.getScriptProperties();
    const day = 'day:' + Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd');
    const today = Number(props.getProperty(day) || 0);
    if (today >= DAILY_LIMIT) return { ok: false, error: 'daily' };
    props.setProperty(day, String(today + 1));
    cache.put('n:' + key, String(sends + 1), 15 * 60);
  } finally {
    lock.releaseLock();
  }
  const code = newCode();
  cache.put('c:' + key, JSON.stringify({ hash: hashOf(code + '|' + email), tries: 0, until: Date.now() + CODE_MINUTES * 60000 }), CODE_MINUTES * 60);
  MailApp.sendEmail({
    to: email,
    name: APP_NAME,
    subject: fill(EMAIL_TEXT.subject, code),
    body: emailText(code),
    htmlBody: emailHtml(code)
  });
  return { ok: true, minutes: CODE_MINUTES };
}

/** Checks the code typed by the user. */
function verifyCode(rawEmail, rawCode) {
  const email = cleanEmail(rawEmail);
  const code = String(rawCode || '').replace(/\D/g, '');
  if (!email || code.length !== 6) return { ok: false, error: 'wrong' };
  const cache = CacheService.getScriptCache();
  const key = keyOf(email);
  const saved = cache.get('c:' + key);
  if (!saved) return { ok: false, error: 'expired' };
  const rec = JSON.parse(saved);
  const left = Math.floor((rec.until - Date.now()) / 1000);
  if (left <= 0) {
    cache.remove('c:' + key);
    return { ok: false, error: 'expired' };
  }
  if (rec.hash !== hashOf(code + '|' + email)) {
    rec.tries += 1;
    if (rec.tries >= MAX_TRIES) {
      cache.remove('c:' + key);
      return { ok: false, error: 'too_many' };
    }
    cache.put('c:' + key, JSON.stringify(rec), left);
    return { ok: false, error: 'wrong', triesLeft: MAX_TRIES - rec.tries };
  }
  cache.remove('c:' + key);
  cache.put('v:' + key, '1', VERIFIED_MINUTES * 60);
  return { ok: true };
}

/** After the account exists: marks its email as verified in Firebase, if that email passed the code check. */
function confirmAccount(idToken) {
  if (!idToken) return { ok: false, error: 'bad_request' };
  const lookup = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_API_KEY, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true
  });
  if (lookup.getResponseCode() !== 200) return { ok: false, error: 'not_signed_in' };
  const account = (JSON.parse(lookup.getContentText()).users || [])[0];
  if (!account || !account.email) return { ok: false, error: 'not_signed_in' };
  if (account.emailVerified) return { ok: true };
  const cache = CacheService.getScriptCache();
  const key = keyOf(cleanEmail(account.email));
  if (!cache.get('v:' + key)) return { ok: false, error: 'not_verified' };
  const update = adminCall('accounts:update', { localId: account.localId, emailVerified: true });
  if (update.getResponseCode() !== 200) {
    console.error('accounts:update ' + update.getResponseCode() + ' ' + update.getContentText());
    return { ok: false, error: 'server' };
  }
  cache.remove('v:' + key);
  return { ok: true };
}

/** Firebase Authentication admin call, as the project owner who deployed this script. */
function adminCall(method, payload) {
  return UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT_ID + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

/**
 * Run this once from the editor (Run ▸ selfTest) after pasting the code. It asks for permission, then checks
 * that this account may manage the Firebase project's users and how many emails are left today.
 */
function selfTest() {
  const res = adminCall('accounts:query', { returnUserInfo: false, limit: '1' });
  const ok = res.getResponseCode() === 200;
  console.log(ok ? 'OK: this account can manage users of ' + PROJECT_ID : 'PROBLEM ' + res.getResponseCode() + ': ' + res.getContentText());
  console.log('Emails left today for this Google account: ' + MailApp.getRemainingDailyQuota());
  return ok;
}

function fill(text, code) {
  return text.replace(/\{code\}/g, code).replace(/\{app\}/g, APP_NAME).replace(/\{minutes\}/g, String(CODE_MINUTES));
}

/** Plain-text version, for mail apps that do not show formatted email. */
function emailText(code) {
  return [fill(EMAIL_TEXT.heading, code), '', fill(EMAIL_TEXT.intro, code), '', '    ' + code, '',
    fill(EMAIL_TEXT.validity, code), '', fill(EMAIL_TEXT.safety, code), '', fill(EMAIL_TEXT.footer, code)].join('\n');
}

/** Formatted version: tables and inline styles only, which every mail app understands. */
function emailHtml(code) {
  const c = EMAIL_COLOURS;
  const font = 'font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;';
  return '<div style="margin:0;padding:24px 12px;background:' + c.page + ';">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;' + font + '">'
    + '<tr><td style="background:' + c.brand + ';background:linear-gradient(135deg,' + c.brandDark + ',' + c.brand + ');padding:22px 28px;color:#ffffff;font-size:20px;font-weight:bold;' + font + '">' + APP_NAME + '</td></tr>'
    + '<tr><td style="padding:28px 28px 8px;color:' + c.text + ';' + font + '">'
    + '<p style="margin:0 0 8px;font-size:20px;font-weight:bold;">' + fill(EMAIL_TEXT.heading, code) + '</p>'
    + '<p style="margin:0;font-size:15px;line-height:22px;color:' + c.muted + ';">' + fill(EMAIL_TEXT.intro, code) + '</p></td></tr>'
    + '<tr><td style="padding:16px 28px;">'
    + '<div style="background:' + c.codeBg + ';border-radius:12px;padding:18px 12px;text-align:center;font-family:Menlo,Consolas,monospace;font-size:34px;font-weight:bold;letter-spacing:10px;color:' + c.brandDark + ';">' + code + '</div></td></tr>'
    + '<tr><td style="padding:4px 28px 24px;color:' + c.text + ';' + font + '">'
    + '<p style="margin:0 0 14px;font-size:14px;line-height:21px;">' + fill(EMAIL_TEXT.validity, code) + '</p>'
    + '<p style="margin:0;font-size:13px;line-height:20px;color:' + c.muted + ';">' + fill(EMAIL_TEXT.safety, code) + '</p></td></tr>'
    + '<tr><td style="padding:16px 28px;border-top:1px solid #e2e7f0;font-size:12px;color:' + c.muted + ';' + font + '">' + fill(EMAIL_TEXT.footer, code) + '</td></tr>'
    + '</table></div>';
}

/** Run from the editor to see the email: sends one to your own address (uses one email of today's allowance). */
function previewEmail() {
  const me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: me, name: APP_NAME, subject: fill(EMAIL_TEXT.subject, '123456'), body: emailText('123456'), htmlBody: emailHtml('123456') });
  console.log('Preview sent to ' + me);
}

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254 ? email : '';
}
function hashOf(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text));
}
function keyOf(email) {
  return hashOf(email).slice(0, 40);
}
function newCode() {
  const n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16) % 1000000;
  return ('000000' + n).slice(-6);
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
