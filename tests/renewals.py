"""Renewal reminders in demo mode: due states, renewing (with and without a Money entry), one-time reminders,
editing, deleting, the yearly cost, the hub notice, currency conversion and the sample reminders.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/renewals.py [output folder for screenshots]
"""
import os, re, sys, time
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

URL = os.environ.get('LIFEDESK_URL', 'http://localhost:8765/?demo=1')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
checks = []
TODAY = date.today()
iso = lambda n: (TODAY + timedelta(days=n)).isoformat()


def check(name, ok, detail=''):
    ok = bool(ok)
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


def money(text):
    return float(re.sub(r'[^\d.−-]', '', text).replace('−', '-') or 0)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    stat = lambda label: pg.locator('.stat', has_text=label).locator('b').first.inner_text()
    shot = lambda n: pg.screenshot(path=os.path.join(OUT, n + '.png'), full_page=True)
    db = lambda: pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo'))")
    row = lambda name: pg.locator('.acct-row', has_text=name)

    # ---------- the date rules, straight from logic.js ----------
    pg.goto(URL); pg.wait_for_selector('#welcome-currency')
    r = pg.evaluate("""async () => {
        const L = await import('./js/logic.js');
        const s = (due, remindDays) => L.reminderStatus({ due, remindDays }, '2026-10-03');
        return {
            jan31: L.nextDue({ due: '2026-01-31', repeat: 1 }), leap: L.nextDue({ due: '2028-02-29', repeat: 12 }), once: L.nextDue({ due: '2026-05-01', repeat: 0 }),
            dst: L.daysBetween('2026-03-01', '2026-04-01'), year: L.daysBetween('2026-10-03', '2027-10-03'), back: L.daysBetween('2026-10-05', '2026-10-03'),
            edge: s('2026-11-02', 30).state, past: s('2026-11-03', 30).state, today: s('2026-10-03', 0), over: s('2026-10-02', 30),
            done: L.reminderStatus({ due: '2020-01-01', done: true }, '2026-10-03').state,
            cost: L.yearlyCost([{ amount: 100, repeat: 3 }, { amount: 50, repeat: 1 }, { amount: 999, repeat: 0 }, { amount: 70, repeat: 12, done: true }])
        };
    }""")
    check('next due: 31 Jan monthly -> 28 Feb, 29 Feb yearly -> 28 Feb, one-time -> none', r['jan31'] == '2026-02-28' and r['leap'] == '2029-02-28' and r['once'] is None, str([r['jan31'], r['leap'], r['once']]))
    check('days between: whole days across a clock change, a year and backwards', r['dst'] == 31 and r['year'] == 365 and r['back'] == -2, str([r['dst'], r['year'], r['back']]))
    check('status: 30 days out is due soon, 31 is later, today is soon (0 days), yesterday is overdue (-1)', r['edge'] == 'soon' and r['past'] == 'later' and r['today'] == {'state': 'soon', 'days': 0} and r['over'] == {'state': 'overdue', 'days': -1}, str(r))
    check('status: a renewed one-time reminder is done; yearly cost counts only repeating, open ones', r['done'] == 'done' and r['cost'] == 400 + 600, str(r['cost']))

    # ---------- first visit, one bank account ----------
    pg.locator('#welcome-currency').select_option('USD'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    check('hub: Renewal reminders is an open tool with a first-step hint', 'Add your first reminder' in pg.locator('a.tool', has_text='Renewal reminders').inner_text())
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('City Bank'); pg.get_by_label('Opening balance').fill('5000')
    pg.get_by_label('Use as my default account').check(); pg.get_by_role('button', name='Save').click(); time.sleep(0.3)

    pg.goto(URL + '#renewals'); time.sleep(0.2)
    check('renewals: empty state explains what to add', 'No reminders yet' in pg.locator('main').inner_text())
    check('renewals: no Money bottom bar on this tool', pg.locator('.tabbar').count() == 0)

    def add(name, kind, days, repeat, amount, remind, notes=''):
        pg.get_by_role('button', name='Add reminder').click()
        pg.get_by_label('Name').fill(name); pg.get_by_label('Kind').select_option(kind)
        pg.get_by_label('Due or expiry date').fill(iso(days)); pg.get_by_label('Repeats').select_option(str(repeat))
        pg.get_by_label('Amount (optional)').fill(str(amount)); pg.get_by_label('Remind me').select_option(str(remind))
        if notes:
            pg.get_by_label('Notes (optional)').fill(notes)
        pg.get_by_role('button', name='Save').click(); time.sleep(0.25)

    pg.get_by_role('button', name='Add reminder').click(); pg.get_by_role('button', name='Save').click(); time.sleep(0.2)
    check('save without a name is refused', pg.locator('.toast.warn').count() == 1 and pg.locator('.form').count() == 1)
    pg.get_by_role('button', name='Cancel').click()
    add('Car insurance', 'Insurance', 10, 12, 500, 30, 'Policy MV-1')
    add('Gym membership', 'Membership', -2, 1, 40, 7)
    add('Passport', 'Document', 400, 0, 0, 90)
    txt = pg.locator('main').inner_text().lower()  # headings are shown in capitals
    check('grouped: Overdue · 1, Due soon · 1, Later · 1', all(h in txt for h in ['overdue · 1', 'due soon · 1', 'later · 1']), '')
    check('overdue gym says "Overdue by 2 days"', 'Overdue by 2 days' in row('Gym membership').inner_text())
    check('car insurance says "Due in 10 days" and keeps its notes', 'Due in 10 days' in row('Car insurance').inner_text() and 'Policy MV-1' in row('Car insurance').inner_text())
    check('stats: 1 overdue, 1 due soon, yearly cost 500 + 12 × 40 = 980', stat('Overdue') == '1' and stat('Due soon') == '1' and money(stat('Yearly cost')) == 980, stat('Yearly cost'))
    shot('r1_renewals_phone')

    pg.goto(URL + '#hub'); time.sleep(0.2)
    check('hub: notice and tile count the overdue and due-soon reminders', '1 renewal overdue · 1 renewal due soon' in pg.locator('.notice', has_text='renewal').inner_text() and '1 overdue · 1 due soon' in pg.locator('a.tool', has_text='Renewal reminders').inner_text())
    pg.locator('.notice', has_text='renewal').click(); time.sleep(0.2)
    check('hub notice opens the reminders', pg.url.endswith('#renewals'))

    # renew the monthly gym and record the payment in Money
    row('Gym membership').get_by_role('button', name='Renewed').click(); time.sleep(0.2)
    gym_due = date.fromisoformat(iso(-2))
    m, y = (gym_due.month % 12) + 1, gym_due.year + (gym_due.month == 12)
    import calendar
    expect_next = date(y, m, min(gym_due.day, calendar.monthrange(y, m)[1])).isoformat()
    check('renew: next due date is filled in one month on', pg.get_by_label('Next due date').input_value() == expect_next, pg.get_by_label('Next due date').input_value())
    check('renew: payment pre-ticked with the amount and the default account', pg.get_by_label('Amount paid').input_value() == '40' and pg.locator('[data-model="renewals.renew.accountId"] option:checked').inner_text() == 'City Bank')
    if not pg.locator('[data-model="renewals.renew.categoryId"]').input_value():
        pg.locator('[data-model="renewals.renew.categoryId"]').select_option(index=1)
    pg.get_by_role('button', name='Mark renewed').click(); time.sleep(0.3)
    d = db()
    gym = next(x for x in d['reminders'] if x['name'] == 'Gym membership')
    paid = [e for e in d['entries'] if e.get('reminderId') == gym['id']]
    check('renew: gym moves to its next date and leaves Overdue', gym['due'] == expect_next and 'overdue ·' not in pg.locator('main').inner_text().lower(), gym['due'])
    check('renew: one 40 expense from City Bank dated today, linked to the reminder', len(paid) == 1 and paid[0]['amount'] == 40 and paid[0]['type'] == 'expense' and paid[0]['date'] == TODAY.isoformat() and paid[0]['categoryId'], str(paid))
    pg.goto(URL + '#accounts'); time.sleep(0.2)
    check('Money: City Bank balance drops to 4,960', '$4,960' in row('City Bank').inner_text(), row('City Bank').inner_text().replace('\n', ' ')[:80])

    # a renewal with a next date not after the current one is refused
    pg.goto(URL + '#renewals'); row('Car insurance').get_by_role('button', name='Renewed').click(); time.sleep(0.2)
    pg.get_by_label('Next due date').fill(iso(10)); pg.get_by_role('button', name='Mark renewed').click(); time.sleep(0.2)
    check('renew: next date must be after the current due date', pg.locator('.toast.warn').count() == 1 and next(x for x in db()['reminders'] if x['name'] == 'Car insurance')['due'] == iso(10))
    pg.get_by_role('button', name='Cancel').click()

    # one-time passport: renew without recording, it moves to Done; Undo brings it back
    row('Passport').get_by_role('button', name='Renewed').click(); time.sleep(0.2)
    check('one-time: no next date, payment not ticked when there is no amount', pg.get_by_label('Next due date').count() == 0 and not pg.locator('[data-action="remRecord"]').is_checked())
    before = len(db()['entries'])
    pg.get_by_role('button', name='Mark renewed').click(); time.sleep(0.3)
    check('one-time: moves to Done, no entry added', 'Show done · 1' in pg.locator('main').inner_text() and len(db()['entries']) == before and row('Passport').count() == 0)
    pg.get_by_role('button', name='Show done · 1').click(); time.sleep(0.2)
    row('Passport').get_by_role('button', name='Undo').click(); time.sleep(0.3)
    check('undo: passport is back under Later', 'rem-later' in row('Passport').get_attribute('class'))

    # edit and delete
    row('Car insurance').get_by_role('button', name='Edit').click(); pg.get_by_label('Amount (optional)').fill('600'); pg.get_by_role('button', name='Save').click(); time.sleep(0.3)
    check('edit: yearly cost becomes 600 + 480 = 1,080', money(stat('Yearly cost')) == 1080, stat('Yearly cost'))
    row('Passport').get_by_role('button', name='Delete').click(); time.sleep(0.3)
    check('delete: passport is gone', row('Passport').count() == 0 and len(db()['reminders']) == 2)

    # currency conversion includes reminder amounts
    pg.goto(URL + '#more'); pg.locator('[data-currency]').select_option('EUR'); time.sleep(1.5)
    pg.locator('[data-model="more.change.rate"]').fill('2')
    box = pg.get_by_label('Download a backup file before converting (recommended)')
    if box.is_checked():
        box.click()
    pg.get_by_role('button', name='Convert amounts').click(); time.sleep(0.6)
    car = next(x for x in db()['reminders'] if x['name'] == 'Car insurance')
    check('currency change converts reminder amounts (600 × 2 = 1,200)', car['amount'] == 1200, str(car['amount']))

    # wide screen: side menu entry and layout
    pg.set_viewport_size({'width': 1440, 'height': 900}); pg.goto(URL + '#renewals'); time.sleep(0.3)
    check('desktop: side menu has Renewal reminders, marked as open', 'on' in (pg.locator('.side a[href="#renewals"]').get_attribute('class') or ''))
    shot('r2_renewals_desktop')

    # sample data adds seven reminders, removing it takes them away again
    pg.goto(URL + '#more'); pg.get_by_role('button', name='Load sample data').click()
    pg.wait_for_selector('button:has-text("Remove sample data")', timeout=30000)
    sample = [x for x in db()['reminders'] if x['id'].startswith('sample-')]
    check('sample: 7 reminders, one overdue and some due soon', len(sample) == 7, str(len(sample)))
    pg.goto(URL + '#renewals'); time.sleep(0.3); shot('r3_renewals_sample')
    check('sample: overdue health insurance shows first', pg.locator('.acct-row').first.inner_text().startswith('Health insurance (sample)'))
    pg.goto(URL + '#more'); pg.get_by_role('button', name='Remove sample data').click()
    pg.wait_for_selector('button:has-text("Load sample data")', timeout=30000)
    check('sample removed: only my 2 reminders are left', len(db()['reminders']) == 2)

    check('no errors in the browser console', not errors, str(errors[:3]))
    b.close()

print(f'{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
