/**
 * LifeDesk – push notification sender (Google Apps Script, runs every hour on a timer).
 *
 * Each signed-in user who turns notifications on has one unencrypted record, users/{uid}/push/schedule:
 *   tokens     the notification address of each device that turned notifications on
 *   tz         their time zone, e.g. "Asia/Kolkata"
 *   renewals   true = renewal reminders;  monthStart  true = a nudge on the 1st of each month
 *   dates      [{ due: "2026-10-13", remind: 30 }] – the due date and remind-me days of each open reminder;
 *              no names, amounts or notes (those stay encrypted, so a message never says which reminder) –
 *              unless the user ticked "Include names and amounts in emails": then also { name, amount } (text)
 *   email      true = also send each day's messages by email, to the account's sign-in email address
 *              (looked up in Firebase Authentication, not stored here)
 *   lastSent   the user's local date this script last handled them (written here, so nobody gets a second message)
 *
 * Once a day per user, from 9 in the morning their time, it sends what is due:
 *   - renewal reminders every day from each reminder's remind-me day, through its due date, and every day after
 *     while it is overdue, until the user marks it Renewed in LifeDesk;
 *   - on the 1st of the month, a start-of-month nudge.
 * The words are in TEXT below.
 * Messages go through Firebase Cloud Messaging (free), as urgent, so phones deliver them at once and can wake the screen. Devices that no longer exist are removed from tokens.
 * Emails go from your Gmail (about 100 a day on a free account, shared with the email-code script); this script
 * stops emailing when fewer than EMAIL_RESERVE are left, so sign-up codes keep working.
 *
 * Runs as the person who sets it up, who must be an owner of the Firebase project; no private key is stored.
 * Set-up steps are in backend/README.md ("Push notifications").
 */
const PROJECT_ID = 'lifedesk-43dc1';
const DATABASE_ID = 'default'; // same as firestoreDatabase in js/config.js
const APP_URL = 'https://rahuljangid2002.github.io/lifedesk/';
const SEND_FROM_HOUR = 9; // local time of each user
const EMAIL_RESERVE = 25; // emails a day kept free for sign-up codes
const EMAIL_COLOURS = { brandDark: '#0b1324', brand: '#1b2a4a', accent: '#2563eb', text: '#101828', muted: '#667085', line: '#e3e6eb', page: '#f4f5f7', red: '#b42318', orange: '#b54708' };

// ---------- the words: change them here ----------
// {days} = days left, {date} = the due date ("Sat, 10 Oct"), {ago} = days overdue, {count} = how many,
// {month} / {lastMonth} = month names. Names and amounts are encrypted, so a message never says which renewal.
const TEXT = {
  soonTitle: '🔔 Renewal due in {days} days',
  soonBody: 'Due on {date}. Plan ahead, then mark it renewed in LifeDesk.',
  tomorrowTitle: '🔔 Renewal due tomorrow',
  tomorrowBody: 'Due on {date}. Renew it today to stay covered.',
  todayTitle: '⏰ Renewal due today',
  todayBody: 'Due today, {date}. Renew it and mark it done in LifeDesk.',
  overdueTitle: '⚠️ Renewal overdue',
  overdueBody: 'It was due on {date} ({ago} ago). Renew it as soon as you can.',
  manyTitle: '🔔 {count} renewals need attention',
  manyBody: '{list}. Tap to see them in LifeDesk.',
  monthTitle: '📅 {month} has started',
  monthBody: 'See how {lastMonth} went and set this month\'s budget in LifeDesk.',
  testTitle: '✅ LifeDesk notifications are on',
  testBody: 'Renewal reminders and a start-of-month nudge will appear here.'
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------- what to send (no Google services here, so it can be tested anywhere) ----------

/** Whole days from one yyyy-mm-dd date to another. */
function daysBetween(from, to) {
  const t = function (iso) { const p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  return Math.round((t(to) - t(from)) / 86400000);
}

/**
 * True on the days a reminder should notify: every day from its remind-me day (remind days before the due date)
 * through the due date, and every day after it while it stays overdue – until the user presses Renewed in
 * LifeDesk, which moves the due date (or ends a one-time reminder) and so stops it.
 */
function notifyToday(days, remind) {
  return days <= Math.max(0, remind);
}

/** "Sat, 10 Oct" from "2026-10-10". */
function dateWords(iso) {
  const p = iso.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return WEEKDAYS[d.getUTCDay()] + ', ' + p[2] + ' ' + MONTHS[p[1] - 1].slice(0, 3);
}
const plural = function (n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); };
const fill = function (text, values) { return text.replace(/\{(\w+)\}/g, function (m, k) { return k in values ? values[k] : m; }); };

/** Title and text for one renewal, by how close it is. */
function oneRenewal(days, due) {
  const v = { days: days, date: dateWords(due), ago: plural(-days, 'day') };
  const kind = days < 0 ? 'overdue' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'soon';
  return { title: fill(TEXT[kind + 'Title'], v), body: fill(TEXT[kind + 'Body'], v) };
}

/**
 * The messages for one user on their local date `today` ("yyyy-mm-dd"). Returns [{ title, body, link, tag }].
 */
function messagesFor(schedule, today) {
  const out = [];
  if (schedule.renewals !== false) {
    const due = (schedule.dates || [])
      .map(function (d) { return { due: d.due, days: daysBetween(today, d.due), remind: Number(d.remind) || 0, name: d.name || '', amount: d.amount || '' }; })
      .filter(function (d) { return notifyToday(d.days, d.remind); })
      .sort(function (a, b) { return a.days - b.days; });
    if (due.length === 1) {
      const m = oneRenewal(due[0].days, due[0].due);
      out.push({ title: m.title, body: m.body, link: APP_URL + '#renewals', tag: 'renewals', rows: due });
    } else if (due.length > 1) {
      const groups = [];
      due.forEach(function (d) {
        const label = d.days < 0 ? 'Overdue' : d.days === 0 ? 'Due today' : d.days === 1 ? 'Due tomorrow' : 'Due in ' + d.days + ' days';
        const g = groups.filter(function (x) { return x.label === label; })[0];
        if (g) g.n += 1; else groups.push({ label: label, n: 1 });
      });
      out.push({ title: fill(TEXT.manyTitle, { count: due.length }), body: fill(TEXT.manyBody, { list: groups.map(function (g) { return g.label + ': ' + g.n; }).join(' · ') }),
        link: APP_URL + '#renewals', tag: 'renewals', rows: due });
    }
  }
  if (schedule.monthStart !== false && today.slice(8) === '01') {
    const m = Number(today.slice(5, 7)) - 1;
    out.push({ title: fill(TEXT.monthTitle, { month: MONTHS[m] }), body: fill(TEXT.monthBody, { lastMonth: MONTHS[(m + 11) % 12] }), link: APP_URL + '#home', tag: 'month-start' });
  }
  return out;
}

// ---------- the email (also no Google services, so it can be tested) ----------
const esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
const noEmoji = function (t) { return t.replace(/^[^A-Za-z0-9]+/, ''); };

/** "Due tomorrow · Sun, 4 Oct", "Overdue by 2 days · was due Thu, 1 Oct". */
function whenLine(d) {
  if (d.days < 0) return 'Overdue by ' + plural(-d.days, 'day') + ' · was due ' + dateWords(d.due);
  return (d.days === 0 ? 'Due today' : d.days === 1 ? 'Due tomorrow' : 'Due in ' + d.days + ' days') + ' · ' + dateWords(d.due);
}

/** One email for the day's messages: { subject, html, text }, or null when there is nothing to send. */
function emailFor(messages) {
  if (!messages.length) return null;
  const c = EMAIL_COLOURS;
  const subject = messages.map(function (m) { return noEmoji(m.title); }).join(' · ');
  const text = [];
  const blocks = messages.map(function (m) {
    text.push(noEmoji(m.title), m.body);
    let rows = '';
    if (m.rows) {
      rows = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0 4px">' + m.rows.map(function (d) {
        const colour = d.days < 0 ? c.red : d.days <= 1 ? c.orange : c.text;
        text.push('- ' + (d.name || 'A renewal') + (d.amount ? ' (' + d.amount + ')' : '') + ': ' + whenLine(d));
        return '<tr><td style="padding:10px 0;border-top:1px solid ' + c.line + ';font:600 15px Arial,sans-serif;color:' + c.text + '">' + esc(d.name || 'A renewal') +
          '<div style="font:400 13px Arial,sans-serif;color:' + colour + ';padding-top:3px">' + esc(whenLine(d)) + '</div></td>' +
          '<td align="right" style="padding:10px 0;border-top:1px solid ' + c.line + ';font:700 15px Arial,sans-serif;color:' + c.text + ';white-space:nowrap">' + esc(d.amount) + '</td></tr>';
      }).join('') + '</table>';
    }
    return '<h2 style="margin:0 0 6px;font:700 19px Arial,sans-serif;color:' + c.text + '">' + esc(m.title) + '</h2>' +
      '<p style="margin:0;font:400 15px/1.5 Arial,sans-serif;color:' + c.muted + '">' + esc(m.body) + '</p>' + rows +
      '<p style="margin:18px 0 26px"><a href="' + esc(m.link) + '" style="display:inline-block;background:' + c.accent + ';color:#ffffff;text-decoration:none;font:600 15px Arial,sans-serif;padding:11px 20px;border-radius:10px">Open LifeDesk</a></p>';
  });
  const named = messages.some(function (m) { return m.rows && m.rows.some(function (d) { return d.name; }); });
  const footer = (named ? '' : 'Reminder names and amounts are encrypted, so they are not in this email. You can include them under Account → Notifications in LifeDesk. ') +
    'You get this because email reminders are on in LifeDesk (Account → Notifications), where you can turn them off.';
  text.push('', 'Open LifeDesk: ' + APP_URL, '', footer);
  const html = '<div style="background:' + c.page + ';padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden">' +
    '<tr><td style="background:' + c.brandDark + ';background-image:linear-gradient(135deg,' + c.brandDark + ',' + c.brand + ');padding:18px 24px;font:700 18px Arial,sans-serif;color:#ffffff">LifeDesk</td></tr>' +
    '<tr><td style="padding:24px 24px 0">' + blocks.join('') + '</td></tr>' +
    '<tr><td style="padding:16px 24px 22px;border-top:1px solid ' + c.line + ';font:400 12px/1.5 Arial,sans-serif;color:' + c.muted + '">' + esc(footer) + '</td></tr></table></div>';
  return { subject: subject, html: html, text: text.join('\n') };
}

/** Firestore's typed JSON to plain values. */
function plain(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) return fieldsToObject(v.mapValue.fields || {});
  return null;
}
function fieldsToObject(fields) {
  const o = {};
  Object.keys(fields).forEach(function (k) { o[k] = plain(fields[k]); });
  return o;
}

// ---------- the timer ----------

/** Run once by hand: checks access and starts the hourly timer. */
function setup() {
  const res = firestore('post', ':runQuery', { structuredQuery: { from: [{ collectionId: 'push', allDescendants: true }], limit: 1 } });
  if (res.getResponseCode() !== 200) {
    throw new Error('PROBLEM: cannot read the database (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  }
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDue').timeBased().everyHours(1).create();
  Logger.log('OK: the database can be read, and sendDue now runs every hour.');
}

/** The hourly job. */
function sendDue() {
  const now = new Date();
  let sent = 0;
  let mailed = 0;
  allSchedules().forEach(function (s) {
    const tz = s.data.tz || 'UTC';
    let today;
    let hour;
    try {
      today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
      hour = Number(Utilities.formatDate(now, tz, 'H'));
    } catch (e) {
      return; // unknown time zone
    }
    if (hour < SEND_FROM_HOUR || s.data.lastSent === today || (!(s.data.tokens || []).length && !s.data.email)) {
      return;
    }
    const messages = messagesFor(s.data, today);
    const gone = deliver(s.data.tokens || [], messages);
    sent += messages.length;
    if (s.data.email) {
      mailed += sendEmail(s.path, messages);
    }
    const fields = { lastSent: { stringValue: today } };
    const mask = ['lastSent'];
    if (gone.length) {
      fields.tokens = { arrayValue: { values: s.data.tokens.filter(function (t) { return gone.indexOf(t) < 0; }).map(function (t) { return { stringValue: t }; }) } };
      mask.push('tokens');
    }
    firestore('patch', '/' + s.path + '?' + mask.map(function (m) { return 'updateMask.fieldPaths=' + m; }).join('&'), { fields: fields });
  });
  Logger.log('Messages sent: ' + sent + ', emails: ' + mailed);
}

/** Run by hand after turning notifications on in LifeDesk: a test message to the devices turned on most recently. */
function sendTest() {
  const list = allSchedules().sort(function (a, b) { return (b.data.updated || 0) - (a.data.updated || 0); });
  if (!list.length) {
    throw new Error('Nobody has turned notifications on yet. Turn them on in LifeDesk (Account → Notifications) first.');
  }
  const gone = deliver(list[0].data.tokens || [], [{ title: TEXT.testTitle, body: TEXT.testBody, link: APP_URL + '#more', tag: 'test' }]);
  Logger.log('Test sent to ' + ((list[0].data.tokens || []).length - gone.length) + ' device(s)' + (gone.length ? '; ' + gone.length + ' no longer exist' : '') + '.');
}

/**
 * Run by hand to test with real reminders: sends today's real messages now to the devices turned on most recently,
 * ignoring the 9 am start and the once-a-day limit (and not counting as today's send). Logs each reminder date and
 * whether it notifies today.
 */
function sendDueNowTest() {
  const list = allSchedules().sort(function (a, b) { return (b.data.updated || 0) - (a.data.updated || 0); });
  if (!list.length) {
    throw new Error('Nobody has turned notifications on yet. Turn them on in LifeDesk (Account → Notifications) first.');
  }
  const s = list[0].data;
  const now = new Date();
  const tz = s.tz || 'UTC';
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  (s.dates || []).forEach(function (d) {
    const days = daysBetween(today, d.due);
    Logger.log('Reminder due ' + d.due + ' (remind ' + d.remind + ' days before): ' + (days < 0 ? 'overdue by ' + plural(-days, 'day') : days === 0 ? 'due today' : 'due in ' + plural(days, 'day')) + ' – ' + (notifyToday(days, Number(d.remind) || 0) ? 'NOTIFIES TODAY' : 'not today'));
  });
  const messages = messagesFor(s, today);
  if (!messages.length) {
    Logger.log('Nothing to send today (' + today + ', ' + tz + '). Add a reminder due today or tomorrow in LifeDesk, wait a few seconds, then run this again.');
    return;
  }
  const gone = deliver(s.tokens || [], messages);
  messages.forEach(function (m) { Logger.log('Sent: ' + m.title + ' – ' + m.body); });
  Logger.log('To ' + ((s.tokens || []).length - gone.length) + ' of ' + (s.tokens || []).length + ' listed device(s)' + (gone.length ? '; ' + gone.length + ' no longer exist(s) and will be removed by the hourly job (open LifeDesk on that device to register it again)' : '') + '.');
  if (s.email) {
    Logger.log(sendEmail(list[0].path, messages) ? 'Email sent.' : 'Email NOT sent (see above).');
  } else {
    Logger.log('Email is off for this user (Account → Notifications → Also send by email).');
  }
}

/**
 * Run by hand to test the REAL hourly job: clears today's "already sent" mark of the user who changed their
 * notification settings most recently, and runs sendDue once, 5 minutes from now (the hourly timer keeps running).
 * Add or change a reminder in LifeDesk first, e.g. one due tomorrow.
 */
function testRealRunIn5Minutes() {
  const list = allSchedules().sort(function (a, b) { return (b.data.updated || 0) - (a.data.updated || 0); });
  if (!list.length) {
    throw new Error('Nobody has turned notifications on yet. Turn them on in LifeDesk (Account → Notifications) first.');
  }
  firestore('patch', '/' + list[0].path + '?updateMask.fieldPaths=lastSent', { fields: { lastSent: { stringValue: '' } } });
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDueOnce') ScriptApp.deleteTrigger(t);
  });
  const at = new Date(Date.now() + 5 * 60 * 1000);
  ScriptApp.newTrigger('sendDueOnce').timeBased().at(at).create();
  Logger.log('Today\'s mark cleared for ' + (list[0].data.tokens || []).length + ' device(s)' + (list[0].data.email ? ' + email' : '') +
    '. The real job runs once at about ' + Utilities.formatDate(at, list[0].data.tz || 'UTC', 'HH:mm') + ' (your time); Google may start it up to a few minutes late.' +
    ' If the hourly job runs first, it sends instead – either way you get one message. See Executions (left menu) for its log.');
}

/** The one-off run made by testRealRunIn5Minutes: removes its own timer, then runs the real job. */
function sendDueOnce() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDueOnce') ScriptApp.deleteTrigger(t);
  });
  sendDue();
}

// ---------- Google services ----------

function firestore(method, path, body) {
  return UrlFetchApp.fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/' + DATABASE_ID + '/documents' + path, {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID },
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true
  });
}

/** Every users/{uid}/push/schedule record: [{ path: "users/…/push/schedule", data }]. */
function allSchedules() {
  const res = firestore('post', ':runQuery', { structuredQuery: { from: [{ collectionId: 'push', allDescendants: true }] } });
  if (res.getResponseCode() !== 200) {
    throw new Error('Cannot read the database (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText())
    .filter(function (r) { return r.document && /\/push\/schedule$/.test(r.document.name); })
    .map(function (r) { return { path: r.document.name.split('/documents/')[1], data: fieldsToObject(r.document.fields || {}) }; });
}

/** The sign-in email of the user whose schedule is at path "users/{uid}/push/schedule". */
function emailOf(path) {
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT_ID + '/accounts:lookup', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID },
    payload: JSON.stringify({ localId: [path.split('/')[1]] }),
    muteHttpExceptions: true
  });
  const user = res.getResponseCode() === 200 ? (JSON.parse(res.getContentText()).users || [])[0] : null;
  return user && user.email && user.emailVerified !== false ? user.email : null;
}

/** Emails the day's messages; 1 when sent, 0 when not (nothing to send, no address, or the daily limit is near). */
function sendEmail(path, messages) {
  const mail = emailFor(messages);
  if (!mail) return 0;
  if (MailApp.getRemainingDailyQuota() <= EMAIL_RESERVE) {
    Logger.log('Email skipped: only ' + MailApp.getRemainingDailyQuota() + ' emails left today, kept for sign-up codes.');
    return 0;
  }
  const to = emailOf(path);
  if (!to) {
    Logger.log('Email skipped: no verified email address for ' + path);
    return 0;
  }
  MailApp.sendEmail({ to: to, subject: mail.subject, body: mail.text, htmlBody: mail.html, name: 'LifeDesk' });
  return 1;
}

/** Sends each message to each device; returns the device tokens that no longer exist. */
function deliver(tokens, messages) {
  const gone = [];
  tokens.forEach(function (token) {
    messages.forEach(function (m) {
      if (gone.indexOf(token) >= 0) return;
      const res = UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/' + PROJECT_ID + '/messages:send', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJECT_ID },
        payload: JSON.stringify({ message: { token: token, webpush: { headers: { Urgency: 'high', TTL: '86400' }, data: { title: m.title, body: m.body, link: m.link, tag: m.tag } } } }),
        muteHttpExceptions: true
      });
      const code = res.getResponseCode();
      if (code === 404 || (code === 400 && /UNREGISTERED|registration token is not a valid/i.test(res.getContentText()))) {
        gone.push(token);
      } else if (code !== 200) {
        Logger.log('Send failed (' + code + '): ' + res.getContentText().slice(0, 300));
      }
    });
  });
  return gone;
}
