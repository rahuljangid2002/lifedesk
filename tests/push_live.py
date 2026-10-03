"""Push notifications against the real Firebase project, from localhost, with a throw-away account (example.com).

Turns notifications on (gets a real device address from Firebase Cloud Messaging), then reads the database the way
the sender does, to confirm the schedule holds only due dates, time zone and device address while the reminders
themselves stay encrypted; checks the dates follow edits, a pushed message is shown by the service worker, turning
off deletes the schedule, and deleting the account removes everything. Same rules caveat as tests/encryption.py.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/push_live.py
"""
import json, sys, time
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
sys.path.insert(0, __import__('os').path.dirname(__file__))
import encryption_helpers as H

EMAIL = f'selftest.push.{int(time.time())}@example.com'
PASSWORD = 'Login-' + str(int(time.time()))[-6:] + '-pw'
checks = []
iso = lambda n: (date.today() + timedelta(days=n)).isoformat()


def check(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, detail)


with sync_playwright() as p:
    # a visible window with a normal profile: headless reports notifications as blocked, incognito refuses push
    import tempfile
    pg = H.device(p.chromium, notifications=True, profile=tempfile.mkdtemp(prefix='lifedesk-push-'))
    H.sign_up(pg, EMAIL, PASSWORD, 'correct horse battery')
    try:
        _, auth = H.rest(f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={H.KEY}', {'email': EMAIL, 'password': PASSWORD, 'returnSecureToken': True})
        token, uid = auth['idToken'], auth['localId']
        schedule = lambda: H.rest(f'{H.DOCS}/users/{uid}/push/schedule', token=token)

        # a bank and two reminders
        pg.goto(H.URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
        pg.get_by_label('Name').fill('Push Bank'); pg.get_by_label('Opening balance').fill('100'); pg.get_by_role('button', name='Save').click()
        pg.wait_for_selector('.acct-row:has-text("Push Bank")', timeout=30000)
        pg.goto(H.URL + '#renewals')
        for name, days, remind in [('Secret Policy', 12, 30), ('Hidden Subscription', 3, 7)]:
            pg.get_by_role('button', name='Add reminder').click()
            pg.get_by_label('Name').fill(name); pg.get_by_label('Due or expiry date').fill(iso(days)); pg.get_by_label('Amount (optional)').fill('777')
            pg.get_by_label('Remind me').select_option(str(remind)); pg.get_by_role('button', name='Save').click()
            pg.wait_for_selector(f'.acct-row:has-text("{name}")', timeout=30000)
        check('renewals: banner offers notifications while they are off', pg.locator('.notice', has_text='Get a notification').count() == 1)
        check('database: no schedule before notifications are turned on', schedule()[0] == 404, str(schedule()[0]))

        # turn on
        pg.goto(H.URL + '#more'); pg.get_by_role('button', name='Turn on for this device').click()
        pg.wait_for_selector('.toast:has-text("otification")', timeout=60000)
        t = pg.locator('.toast').last.inner_text()
        check('turn on: Firebase gives this browser a notification address', 'on for this device' in t, t)
        time.sleep(1.5)
        code, doc = schedule()
        f = doc.get('fields', {})
        plain = {k: H.plain(v) for k, v in f.items()}
        check('schedule: one device address, time zone, both kinds on', code == 200 and len(plain.get('tokens', [])) == 1 and len(plain['tokens'][0]) > 100 and plain.get('tz') and plain.get('renewals') is True and plain.get('monthStart') is True, json.dumps({k: v for k, v in plain.items() if k != 'tokens'}))
        check('schedule: only the due dates and remind-me days, nearest first', plain.get('dates') == [{'due': iso(3), 'remind': 7}, {'due': iso(12), 'remind': 30}], str(plain.get('dates')))
        raw = json.dumps(doc)
        check('schedule: no reminder name or amount in it', not any(w in raw for w in ['Secret Policy', 'Hidden Subscription', '777', 'Push Bank']))
        ids = pg.evaluate("import('./js/store.js').then(S => S.data.reminders.map(r => r.id))")
        rems = [H.rest(f'{H.DOCS}/users/{uid}/reminders/{i}', token=token)[1] for i in ids]
        check('reminders themselves stay encrypted', len(rems) == 2 and all(list(r['fields'].keys()) == ['enc'] for r in rems))
        pg.locator('.card', has_text='Notifications').screenshot(path=__import__('os').path.join(__import__('os').path.dirname(__file__), 'out', 'push_card_on.png'))
        check('Account: card says on for this device, with both choices', pg.locator('.card', has_text='Notifications').locator('.pill').inner_text() == 'This device' and pg.locator('[data-pref]').count() == 2)

        # a message pushed to the service worker is shown, and opens the right screen
        pg.evaluate("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(l => l.forEach(n => n.close()))")
        sw = next(w for w in pg.context.service_workers if w.url.endswith('/sw.js'))
        # a push event as the browser would deliver it (made inside the worker; the browser's own one is the same)
        sw.evaluate('''(payload) => { const e = new PushEvent('push', { data: payload }); try { self.dispatchEvent(e); } catch (x) {} }''',
                    json.dumps({'data': {'title': 'Renewal reminder', 'body': 'A renewal is due in 7 days. Open LifeDesk to see it.', 'link': 'http://localhost:8765/#renewals', 'tag': 'renewals'}}))
        time.sleep(1.5)
        notes = pg.evaluate("navigator.serviceWorker.ready.then(r => r.getNotifications()).then(l => l.map(n => ({ title: n.title, body: n.body, link: n.data && n.data.link })))")
        check('service worker shows a pushed message with its title, text and screen', any(n['title'] == 'Renewal reminder' and 'due in 7 days' in n['body'] and n['link'].endswith('#renewals') for n in notes), str(notes))

        # dates follow edits: renew the subscription (monthly by default is yearly; set next date) and delete the policy
        pg.goto(H.URL + '#renewals'); pg.locator('.acct-row', has_text='Hidden Subscription').get_by_role('button', name='Renewed').click()
        pg.get_by_label('Next due date').fill(iso(33)); rec = pg.locator('[data-action="remRecord"]')
        if rec.is_checked():
            rec.click()
        pg.get_by_role('button', name='Mark renewed').click(); time.sleep(0.5)
        pg.locator('.acct-row', has_text='Secret Policy').get_by_role('button', name='Delete').click()
        time.sleep(4)
        check('schedule: dates follow a renewal and a delete', H.plain(schedule()[1]['fields']['dates']) == [{'due': iso(33), 'remind': 7}], str(H.plain(schedule()[1]['fields'].get('dates'))))
        check('renewals: banner gone once notifications are on', pg.locator('.notice', has_text='Get a notification').count() == 0)

        # switch renewal reminders off: the dates are removed
        pg.goto(H.URL + '#more'); pg.locator('[data-pref="renewals"]').click(); time.sleep(2)
        s = {k: H.plain(v) for k, v in schedule()[1]['fields'].items()}
        check('renewal reminders off: dates emptied, month start kept', s.get('renewals') is False and s.get('dates') == [] and s.get('monthStart') is True, str({k: v for k, v in s.items() if k != 'tokens'}))
        pg.locator('[data-pref="renewals"]').click(); time.sleep(2)
        check('renewal reminders back on: dates back', H.plain(schedule()[1]['fields']['dates']) == [{'due': iso(33), 'remind': 7}])

        # the sender dropped this device's address (as it does for dead ones): the next open lists it again
        tok = plain['tokens'][0]
        H.rest(f'{H.DOCS}/users/{uid}/push/schedule?updateMask.fieldPaths=tokens', {'fields': {'tokens': {'arrayValue': {}}}}, token, method='PATCH')
        check('test setup: address removed from the database', not H.plain(schedule()[1]['fields'].get('tokens', {'arrayValue': {}})))
        pg.reload(); pg.wait_for_selector('.tool, main', timeout=40000); time.sleep(5)
        check('next open: the device lists itself again', H.plain(schedule()[1]['fields']['tokens']) == [tok], str(len(H.plain(schedule()[1]['fields'].get('tokens', {'arrayValue': {}})))))

        # email: on, with and without names; a device can be turned off while email keeps the schedule
        sched = lambda: {k: H.plain(v) for k, v in schedule()[1]['fields'].items()}
        pg.get_by_label('Also send them by email to').click(); time.sleep(2)
        e = sched()
        check('email on: saved, names still not stored', e.get('email') is True and not e.get('emailDetails') and all('name' not in d for d in e['dates']) and 'Hidden Subscription' not in json.dumps(e))
        pg.get_by_label('Include reminder names and amounts in emails').click(); time.sleep(2)
        e = sched()
        check('names in emails (confirmed): name and amount stored with the date', e.get('emailDetails') is True and e['dates'][0].get('name') == 'Hidden Subscription' and '777' in e['dates'][0].get('amount', ''), str(e['dates']))
        pg.get_by_label('Include reminder names and amounts in emails').click(); time.sleep(2)
        e = sched()
        check('names off again: removed from the database', not e.get('emailDetails') and all('name' not in d for d in e['dates']) and 'Hidden Subscription' not in json.dumps(e))
        pg.get_by_role('button', name='Turn off on this device').click(); pg.wait_for_selector('.toast:has-text("off on this device")', timeout=30000); time.sleep(1)
        e = sched()
        check('device off while email is on: schedule kept, no device left', schedule()[0] == 200 and not e.get('tokens') and e.get('email') is True, str(e.get('tokens')))
        pg.get_by_label('Also send them by email to').click(); time.sleep(2)
        check('email off with no device: the schedule is deleted', schedule()[0] == 404, str(schedule()[0]))
        pg.get_by_role('button', name='Turn on for this device').click(); pg.wait_for_selector('.toast:has-text("on for this device")', timeout=60000); time.sleep(1)

        # turn off on the last device: the schedule is deleted
        pg.get_by_role('button', name='Turn off on this device').click(); pg.wait_for_selector('.toast:has-text("off on this device")', timeout=30000); time.sleep(1)
        check('turn off on the only device: the schedule is deleted from the database', schedule()[0] == 404, str(schedule()[0]))

        # on again, then delete the account: everything goes
        pg.get_by_role('button', name='Turn on for this device').click(); pg.wait_for_selector('.toast:has-text("on for this device")', timeout=60000); time.sleep(1)
        on_again = schedule()[0] == 200
        pg.get_by_role('button', name='Delete my account and data').click(); pg.wait_for_selector('.login-form', timeout=40000)
        check('delete account: schedule removed with everything else', on_again and schedule()[0] != 200)
        check('no errors in the browser console', not [e for e in pg.errors if 'favicon' not in e], str(pg.errors[:3]))
    finally:
        # never leave the throw-away account behind
        try:
            if pg.locator('.login-form').count() == 0:
                pg.goto(H.URL + '#more'); pg.get_by_role('button', name='Delete my account and data').click(); pg.wait_for_selector('.login-form', timeout=40000)
        except Exception as e:
            print('CLEAN-UP FAILED, delete by hand:', EMAIL, e)
    pg.context.close()
print(f'{sum(checks)}/{len(checks)} checks passed ({EMAIL})')
sys.exit(0 if all(checks) else 1)
