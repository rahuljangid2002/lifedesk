/**
 * LifeDesk – push notification sender (Google Apps Script, runs every hour on a timer).
 *
 * Each signed-in user who turns notifications on has one unencrypted record, users/{uid}/push/schedule:
 *   tokens     the notification address of each device that turned notifications on
 *   tz         their time zone, e.g. "Asia/Kolkata"
 *   renewals   true = renewal reminders;  monthStart  true = a nudge on the 1st of each month
 *   dates      [{ due: "2026-10-13", remind: 30 }] – the due date and remind-me days of each open reminder;
 *              no names, amounts or notes (those stay encrypted, so a message never says which reminder)
 *   lastSent   the user's local date this script last handled them (written here, so nobody gets a second message)
 *
 * Once a day per user, from 9 in the morning their time, it sends what is due:
 *   - a renewal reminder when one enters its remind-me window, the day before, on the day, the day after
 *     (overdue) and then once a week while it stays overdue;
 *   - on the 1st of the month, a start-of-month nudge.
 * Messages go through Firebase Cloud Messaging (free). Devices that no longer exist are removed from tokens.
 *
 * Runs as the person who sets it up, who must be an owner of the Firebase project; no private key is stored.
 * Set-up steps are in backend/README.md ("Push notifications").
 */
const PROJECT_ID = 'lifedesk-43dc1';
const DATABASE_ID = 'default'; // same as firestoreDatabase in js/config.js
const APP_URL = 'https://rahuljangid2002.github.io/lifedesk/';
const SEND_FROM_HOUR = 9; // local time of each user

// ---------- the words: change them here ----------
const TEXT = {
  renewalTitle: 'Renewal reminder',
  renewalOne: 'A renewal is {when}. Open LifeDesk to see it.',
  renewalMany: '{count} renewals need attention: {list}. Open LifeDesk to see them.',
  monthTitle: '{month} has started',
  monthBody: 'Take a minute to look at last month and set this month\'s budget in LifeDesk.',
  testTitle: 'LifeDesk test',
  testBody: 'Push notifications from LifeDesk reach this device.'
};

// ---------- what to send (no Google services here, so it can be tested anywhere) ----------

/** Whole days from one yyyy-mm-dd date to another. */
function daysBetween(from, to) {
  const t = function (iso) { const p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); };
  return Math.round((t(to) - t(from)) / 86400000);
}

/** True on the days a reminder should notify: window start, day before, the day, day after, then weekly. */
function notifyToday(days, remind) {
  if (days >= 0) {
    return days === remind || days === 1 || days === 0;
  }
  return (-days) % 7 === 1;
}

function whenWords(days) {
  if (days < 0) {
    return 'overdue by ' + (-days) + ' day' + (days === -1 ? '' : 's');
  }
  return days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : 'due in ' + days + ' days';
}

/**
 * The messages for one user on their local date `today` ("yyyy-mm-dd"); monthName is the name of that month.
 * Returns [{ title, body, link, tag }].
 */
function messagesFor(schedule, today, monthName) {
  const out = [];
  if (schedule.renewals !== false) {
    const due = (schedule.dates || [])
      .map(function (d) { return { days: daysBetween(today, d.due), remind: Number(d.remind) || 0 }; })
      .filter(function (d) { return notifyToday(d.days, d.remind); })
      .sort(function (a, b) { return a.days - b.days; });
    if (due.length === 1) {
      out.push({ title: TEXT.renewalTitle, body: TEXT.renewalOne.replace('{when}', whenWords(due[0].days)), link: APP_URL + '#renewals', tag: 'renewals' });
    } else if (due.length > 1) {
      const list = due.map(function (d) { return 'one ' + whenWords(d.days); }).join(', ');
      out.push({ title: TEXT.renewalTitle, body: TEXT.renewalMany.replace('{count}', due.length).replace('{list}', list), link: APP_URL + '#renewals', tag: 'renewals' });
    }
  }
  if (schedule.monthStart !== false && today.slice(8) === '01') {
    out.push({ title: TEXT.monthTitle.replace('{month}', monthName), body: TEXT.monthBody, link: APP_URL + '#home', tag: 'month-start' });
  }
  return out;
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
    if (hour < SEND_FROM_HOUR || s.data.lastSent === today || !(s.data.tokens || []).length) {
      return;
    }
    const messages = messagesFor(s.data, today, Utilities.formatDate(now, tz, 'MMMM'));
    const gone = deliver(s.data.tokens, messages);
    sent += messages.length;
    const fields = { lastSent: { stringValue: today } };
    const mask = ['lastSent'];
    if (gone.length) {
      fields.tokens = { arrayValue: { values: s.data.tokens.filter(function (t) { return gone.indexOf(t) < 0; }).map(function (t) { return { stringValue: t }; }) } };
      mask.push('tokens');
    }
    firestore('patch', '/' + s.path + '?' + mask.map(function (m) { return 'updateMask.fieldPaths=' + m; }).join('&'), { fields: fields });
  });
  Logger.log('Messages sent: ' + sent);
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
        payload: JSON.stringify({ message: { token: token, webpush: { headers: { Urgency: 'normal', TTL: '86400' }, data: { title: m.title, body: m.body, link: m.link, tag: m.tag } } } }),
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
