"""Trips in demo mode: create a trip with members, a shared expense from Add Entry (split equally: your share is an
expense, the others' shares are lent), People & Loans, the Home tile, settle up, deleting, editing rules, and the
pure split rules in js/trips.js.

    python3 tools/serve_dev.py        (in 4-Web-App)
    <venv with playwright>/python tests/trips.py [output folder for screenshots]
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('LIFEDESK_URL', 'http://127.0.0.1:8765/?demo=1')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
checks = []


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.goto(URL)
    pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    shot = lambda n: pg.screenshot(path=os.path.join(OUT, n + '.png'), full_page=True)
    demo = lambda js: pg.evaluate(f"(() => {{ const s = JSON.parse(localStorage.getItem('lifedesk-demo')); return {js}; }})()")

    # ---------- pure rules ----------
    rules = pg.evaluate("""import('./js/trips.js').then((T) => ({
        three: T.splitShares(1000, ['a', 'b', 'a', null], true),
        others: T.splitShares(100, ['a', 'b', 'c'], false),
        none: T.splitShares(100, [], false),
        status: [T.tripStatus({ start: '2026-01-10', end: '2026-01-12' }, '2026-01-09'), T.tripStatus({ start: '2026-01-10', end: '2026-01-12' }, '2026-01-11'), T.tripStatus({ start: '2026-01-10', end: '2026-01-12' }, '2026-01-13')],
        days: T.tripDays({ start: '2026-01-10', end: '2026-01-12' })
    }))""")
    check('1,000 between you and 2 people: 333.34 + 333.33 + 333.33', rules['three']['count'] == 3 and rules['three']['mine'] == 333.34 and [o['amount'] for o in rules['three']['others']] == [333.33, 333.33], json.dumps(rules['three']))
    check('100 for 3 others only: the extra cent goes to the first person', rules['others']['mine'] == 0 and [o['amount'] for o in rules['others']['others']] == [33.34, 33.33, 33.33])
    check('nobody shares: nothing to split', rules['none']['count'] == 0 and rules['none']['others'] == [])
    check('status Upcoming / Ongoing / Completed and 3 days', rules['status'] == ['Upcoming', 'Ongoing', 'Completed'] and rules['days'] == 3)

    # ---------- an account and a person who owes you already ----------
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('Bank'); pg.get_by_label('Opening balance').fill('50000')
    pg.get_by_label('Use as my default account').check(); pg.get_by_role('button', name='Save').click(); time.sleep(0.3)
    bank = demo("s.accounts.find(a => a.name === 'Bank').id")
    food = demo("s.categories.find(c => c.name === 'Food & Dining').id")
    pg.goto(URL + '#people'); pg.get_by_role('button', name='Add person').click()
    pg.locator('#np-name').fill('Alex'); pg.get_by_role('button', name='Add', exact=True).click(); time.sleep(0.3)

    # ---------- Home without a trip, then a new trip ----------
    pg.goto(URL + '#home'); time.sleep(0.3)
    check('Home invites to plan a trip when there is none', pg.locator('.trip-home', has_text='Going on a trip?').count() == 1)
    pg.goto(URL + '#trips'); time.sleep(0.3)
    check('Trips screen opens empty', pg.locator('.empty-state', has_text='No trips yet').count() == 1)
    pg.get_by_role('button', name='New trip').click(); time.sleep(0.2)
    pg.locator('[data-model="trips.form.name"]').fill('Weekend trip')
    pg.locator('[data-model="trips.form.budget"]').fill('8000')
    pg.locator('.pill-btn', has_text='Alex').click(); time.sleep(0.2)
    pg.locator('[data-model="trips.newName"]').fill('Sam'); pg.get_by_role('button', name='Add', exact=True).click(); time.sleep(0.2)
    pg.locator('[data-model="trips.newName"]').fill('alex'); pg.get_by_role('button', name='Add', exact=True).click(); time.sleep(0.2)
    check('a typed name that already exists is not added twice', pg.locator('span.pill-btn').count() == 1)
    shot('t1_trip_form')
    pg.get_by_role('button', name='Save trip').click(); time.sleep(0.4)
    check('trip saved with 2 members', demo("s.trips.length === 1 && s.trips[0].members.length === 2"))
    check('the new name is a person who owes you', demo("s.people.some(p => p.name === 'Sam' && p.direction === 'owesMe')"))
    check('the trip opens after saving, Ongoing today', pg.locator('.trip-hero', has_text='Weekend trip').count() == 1 and pg.locator('.trip-hero .ts-ongoing').count() == 1)
    trip = demo("s.trips[0].id")

    # ---------- a shared expense from Add Entry ----------
    pg.get_by_role('button', name='Add trip expense').first.click(); time.sleep(0.4)
    check('Add trip expense opens Add Entry with the trip chosen and everyone ticked', pg.locator('.trip-box select').input_value() == trip and pg.locator('.trip-box .pill-btn.on').count() == 3)
    pg.get_by_label('Amount').fill('3000'); pg.get_by_label('Description').fill('Hotel'); pg.locator('#add-category').select_option(food)
    pg.locator(f'.chip[data-id="{bank}"]').click(); time.sleep(0.2)
    check('the split is explained as you type', '1,000.00 each' in pg.locator('#trip-split').inner_text() or '1,000 each' in pg.locator('#trip-split').inner_text(), pg.locator('#trip-split').inner_text())
    check('no EMI, no "someone paid" and no "repeats" for a trip expense', pg.locator('text=Bought on EMI').count() == 0 and pg.locator('.chip', has_text='Someone paid').count() == 0 and pg.locator('[data-model="add.repeat"]').count() == 0)
    shot('t2_add_trip_expense')
    pg.get_by_role('button', name='Save trip expense').click(); time.sleep(0.8)
    check('saving goes back to the trip it was started from', pg.locator('.trip-hero', has_text='Weekend trip').count() == 1, pg.url)
    rows = demo("s.entries.filter(e => e.tripId).map(e => ({ type: e.type, amount: e.amount, person: e.personId, cat: e.categoryId, key: e.splitKey, bill: e.billAmount, count: e.shareCount }))")
    check('3 entries: your expense 1,000 + 1,000 lent to each person', len(rows) == 3 and sorted((r['type'], r['amount']) for r in rows) == [('expense', 1000), ('lent', 1000), ('lent', 1000)], json.dumps(rows))
    check('all share one split key, the bill and the count', len({r['key'] for r in rows}) == 1 and all(r['bill'] == 3000 and r['count'] == 3 for r in rows))
    check('only your share has a category', [r['cat'] for r in rows if r['type'] == 'expense'] == [food] and all(r['cat'] is None for r in rows if r['type'] == 'lent'))
    check('the bank went down by the full 3,000', demo(f"s.entries.filter(e => e.accountId === '{bank}').reduce((x, e) => x + e.amount, 0)") == 3000)

    # a second one only for Alex: no category needed
    pg.goto(URL + '#add'); time.sleep(0.2)
    check('"For a trip" is remembered for the next entry', pg.locator('.trip-box select').count() == 1)
    pg.get_by_label('Amount').fill('600'); pg.get_by_label('Description').fill('His ticket')
    pg.locator('.trip-box .pill-btn', has_text='You').click(); pg.locator('.trip-box .pill-btn', has_text='Sam').click(); time.sleep(0.2)
    check('paid only for others: the category is not asked', pg.locator('#add-category').count() == 0)
    pg.locator(f'.chip[data-id="{bank}"]').click()
    pg.get_by_role('button', name='Save trip expense').click(); time.sleep(0.5)
    check('one lent entry of 600 to Alex', demo("s.entries.filter(e => e.tripId && e.description.startsWith('His ticket')).length === 1 && s.entries.some(e => e.type === 'lent' && e.amount === 600)"))

    # ---------- the trip, People & Loans, Home ----------
    pg.goto(URL + '#trips'); time.sleep(0.3)
    pg.locator('.trip-card').first.click(); time.sleep(0.3)
    nums = pg.locator('.trip-hero .trip-nums b').all_inner_texts()
    check('trip totals: spent 3,600 · your share 1,000 · owed to you 2,600', nums[:3] == ['₹3,600', '₹1,000', '₹2,600'], str(nums))
    check('Alex owes 1,600 and Sam 1,000', pg.locator('.trip-member', has_text='Alex').locator('b.in').inner_text().endswith('1,600') and pg.locator('.trip-member', has_text='Sam').locator('b.in').inner_text().endswith('1,000'))
    check('2 expenses listed, newest first', pg.locator('.trip-exp').count() == 2)
    check('avatars use the first letters of words only', pg.locator('.trip-member .avatar').first.inner_text() in ('A', 'S'))
    shot('t3_trip_detail')
    pg.goto(URL + '#people'); time.sleep(0.3)
    check('People & Loans: Alex owes 1,600', '1,600' in pg.locator('.person', has_text='Alex').locator('b.big').inner_text())
    pg.goto(URL + '#home'); time.sleep(0.3)
    check('Home tile shows the trip and what is owed', pg.locator('.trip-home', has_text='Weekend trip').count() == 1 and '2,600' in pg.locator('.trip-home').inner_text())
    shot('t4_home')

    # ---------- editing and settling ----------
    pg.goto(URL + '#daily'); time.sleep(0.3)
    pg.locator('.row', has_text='Hotel').first.locator('[data-action="editEntry"]').click(); time.sleep(0.4)
    check('a shared entry opens the trip instead of the editor', pg.locator('.trip-hero').count() == 1)
    pg.locator('.trip-member', has_text='Alex').get_by_role('button', name='Settle up').click(); time.sleep(0.2)
    check('settle up offers the full amount owed', pg.locator('[data-model="trips.settle.amount"]').input_value() == '1600')
    pg.get_by_role('button', name='Record').click(); time.sleep(0.4)
    check('Alex is all settled for the trip', pg.locator('.trip-member', has_text='Alex').locator('b', has_text='all settled').count() == 1)
    check('…and the money came in as Got Back linked to the trip', demo(f"s.entries.some(e => e.type === 'gotback' && e.amount === 1600 && e.tripId === '{trip}')"))

    # ---------- deleting ----------
    pg.locator('.trip-exp', has_text='Hotel').locator('[data-action="tripExpDelete"]').click(); time.sleep(0.4)
    check('deleting a trip expense removes every share', demo("s.entries.filter(e => e.description && e.description.startsWith('Hotel')).length") == 0)
    pg.get_by_role('button', name='Change').click(); time.sleep(0.2)
    pg.locator('.pill-btn', has_text='Alex').click(); pg.get_by_role('button', name='Save trip').click(); time.sleep(0.3)
    check('a member with trip entries cannot be removed', demo("s.trips[0].members.length") == 2)
    pg.get_by_role('button', name='Cancel').click(); time.sleep(0.2)
    pg.locator('[data-action="tripDelete"]').click(); time.sleep(0.3)
    check('a trip with entries is not deleted', demo("s.trips.length") == 1)

    # ---------- phone width ----------
    pg.set_viewport_size({'width': 390, 'height': 900}); pg.goto(URL + '#home'); time.sleep(1.5)
    pg.locator('.trip-home').scroll_into_view_if_needed(); time.sleep(0.8); pg.screenshot(path=os.path.join(OUT, 't5_phone_home.png'))
    wide = pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
    check('phone: no sideways scrolling on Home', not wide)
    pg.goto(URL + '#trips'); time.sleep(1.2); pg.locator('.trip-card').first.click(); time.sleep(1.5); shot('t6_phone_trip')
    check('phone: no sideways scrolling on the trip', not pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1'))
    # forms open as a sheet on the phone: it must sit fully on the screen (an animation name clash once pushed it half off)
    pg.goto(URL + '#home'); time.sleep(0.8); pg.goto(URL + '#trips'); time.sleep(1.2); pg.get_by_role('button', name='New trip').click(); time.sleep(1.2)
    r = pg.evaluate("(() => { const b = document.querySelector('section.card.form').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), innerWidth]; })()")
    check('phone: the New trip sheet sits fully on the screen', r[0] >= 0 and r[1] <= r[2], str(r))
    pg.goto(URL + '#people'); time.sleep(1.2); pg.get_by_role('button', name='Add person').click(); time.sleep(1.2)
    r = pg.evaluate("(() => { const b = document.querySelector('section.card.form').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), innerWidth]; })()")
    check('phone: the Add person sheet sits fully on the screen', r[0] >= 0 and r[1] <= r[2], str(r))

    check('no script errors', not errors, '; '.join(errors[:3]))
    b.close()

print(f'\n{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
