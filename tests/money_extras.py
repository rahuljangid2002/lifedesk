"""Monthly bills and Due this month, receipts, paid by someone, follow-ups and WhatsApp, Edit EMI plan, budget alerts,
the Home figures, the new reports and the sender's bill / SIP / maturity messages - in demo mode.

    python3 tools/serve_dev.py        (in 4-Web-App)
    <venv with playwright>/python tests/money_extras.py [output folder for screenshots]
"""
import base64, os, re, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('LIFEDESK_URL', 'http://127.0.0.1:8765/?demo=1')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
checks = []
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADq0/Z4F2AAAAAElFTkSuQmCC')


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


def money(text):
    return float(re.sub(r'[^\d.−-]', '', text).replace('−', '-') or 0)


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
    stat = lambda label: pg.locator('.stat', has_text=label).locator('b').first.inner_text()
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('Bank'); pg.get_by_label('Opening balance').fill('100000')
    pg.get_by_label('Use as my default account').check(); pg.get_by_role('button', name='Save').click(); time.sleep(0.3)
    bank_id = demo("s.accounts.find(a => a.name === 'Bank').id")
    food = demo("s.categories.find(c => c.name === 'Food & Dining').id")
    housing = demo("(s.categories.find(c => /hous|rent/i.test(c.name) && c.type === 'expense') || s.categories.find(c => c.type === 'expense')).id")

    # ---------- monthly bills ----------
    pg.goto(URL + '#pay'); time.sleep(0.3)
    pg.get_by_role('button', name='Add a bill').click()
    pg.locator('[data-model="bills.form.description"]').fill('Rent'); pg.locator('[data-model="bills.form.amount"]').fill('15000')
    pg.locator('[data-model="bills.form.categoryId"]').select_option(housing); pg.locator('[data-model="bills.form.day"]').select_option('1')
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.3)
    pg.get_by_role('button', name='Add a bill').click()
    pg.locator('[data-model="bills.form.description"]').fill('Gym'); pg.locator('[data-model="bills.form.amount"]').fill('1500')
    pg.locator('[data-model="bills.form.categoryId"]').select_option(housing); pg.locator('[data-model="bills.form.day"]').select_option('28')
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.3)
    check('two monthly bills listed', pg.locator('.bill-row').count() == 2)
    shot('x0_payments_bills')
    check('Due this month lists both on Payments', pg.locator('.due-card .row').count() == 2, str(pg.locator('.due-card .row').count()))
    pg.goto(URL + '#home'); time.sleep(0.3)
    check('Home says 2 bills are due', pg.locator('.notice', has_text='2 bills due this month').count() == 1)
    pg.goto(URL + '#daily'); time.sleep(0.3)
    shot('x0_daily_due')
    check('Daily Expenses shows Due this month', pg.locator('.due-card', has_text='Rent').count() == 1)
    pg.locator('.due-card .row', has_text='Rent').get_by_role('button', name='Paid').click(); time.sleep(0.4)
    check('Paid: rent recorded as an expense of this month, linked to its bill', demo("s.entries.filter(e => e.billId && e.description === 'Rent' && e.amount === 15000).length") == 1)
    check('…and it leaves the due list', pg.locator('.due-card .row', has_text='Rent').count() == 0)
    pg.locator('.due-card .row', has_text='Gym').get_by_role('button', name='Skip').click(); time.sleep(0.3)
    check('Skip: gym skipped this month, nothing due', pg.locator('.due-card').count() == 0)
    # repeat every month from Add Entry
    pg.goto(URL + '#add'); pg.get_by_label('Amount').fill('299'); pg.get_by_label('Description').fill('Music subscription')
    pg.locator('#add-category').select_option(food)
    pg.locator('[data-model="add.repeat"]').check(); time.sleep(0.2)
    pg.get_by_role('button', name='Save Expense').click(); time.sleep(0.4)
    check('"Repeats every month" adds a bill, already paid for this month', demo("s.bills.some(b => b.description === 'Music subscription') && s.entries.some(e => e.description === 'Music subscription' && e.billId)") and pg.locator('.due-card .row', has_text='Music').count() == 0)
    shot('x1_add_entry')

    # ---------- receipts ----------
    pg.goto(URL + '#add'); pg.get_by_label('Amount').fill('450'); pg.get_by_label('Description').fill('Dinner')
    pg.locator('#add-category').select_option(food)
    pg.locator('input[data-file="receipt"]').set_input_files(files=[{'name': 'bill.png', 'mimeType': 'image/png', 'buffer': PNG}]); time.sleep(0.8)
    check('a chosen photo waits to be saved with the entry', pg.locator('.receipt', has_text='bill.jpg').count() == 1)
    shot('x1_receipt_attached')
    pg.get_by_role('button', name='Save Expense').click(); time.sleep(0.6)
    rec = demo("(s.entries.find(e => e.description === 'Dinner') || {}).receipts || []")
    files = pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('lifedesk-demo-files') || '{}')).length")
    check('the entry lists its receipt and the file is stored', len(rec) == 1 and files == 1, f'{rec} {files}')
    pg.goto(URL + '#daily'); time.sleep(0.3)
    check('Daily shows the receipt mark', pg.locator('.row', has_text='Dinner').locator('small', has_text='📎').count() == 1)
    pg.locator('.row', has_text='Dinner').locator('[data-action="editEntry"]').click(); time.sleep(0.4)
    with pg.expect_popup() as pop:
        pg.locator('.receipt', has_text='bill.jpg').get_by_role('button', name='View').click()
    check('View opens the receipt', pop.value is not None)
    pop.value.close()
    pg.get_by_role('button', name='Cancel').first.click(); time.sleep(0.3)

    # ---------- paid by someone ----------
    before = demo(f"s.entries.filter(e => e.accountId === '{bank_id}').length")
    pg.goto(URL + '#add'); pg.get_by_label('Amount').fill('800'); pg.get_by_label('Description').fill('Movie tickets')
    pg.locator('#add-category').select_option(food)
    pg.locator('.chip', has_text='Someone paid').click(); time.sleep(0.2)
    pg.locator('[data-model="add.paidBy"]').select_option('__new'); time.sleep(0.2)
    pg.locator('[data-model="add.newPayer"]').fill('Ravi')
    shot('x1_someone_paid')
    pg.get_by_role('button', name='Save Expense').click(); time.sleep(0.4)
    e = demo("s.entries.find(e => e.description === 'Movie tickets')")
    check('paid by someone: no account, linked to Ravi', e and not e.get('accountId') and bool(e.get('paidBy')), str(e))
    pg.goto(URL + '#people'); pg.locator('.seg button', has_text='I owe').first.click(); time.sleep(0.3)
    check('People: you owe Ravi 800', money(pg.locator('.person', has_text='Ravi').locator('.big').inner_text()) == 800)

    # ---------- follow-ups and WhatsApp ----------
    pg.goto(URL + '#add'); pg.locator('[data-type="lent"]').click(); pg.get_by_label('Amount').fill('2000')
    pg.locator('[data-model="add.personId"]').select_option('__new'); time.sleep(0.2); pg.locator('[data-model="add.newPerson"]').fill('Shubham')
    pg.get_by_role('button', name='Save Lent / Given').click(); time.sleep(0.4)
    pg.goto(URL + '#people'); time.sleep(0.3); pg.locator('.seg button', has_text='Owe me').first.click(); time.sleep(0.3); pg.locator('.person', has_text='Shubham').locator('.p-head').click(); time.sleep(0.3)
    pg.locator('input[data-person-field="phone"]').fill('9876543210'); pg.locator('input[data-person-field="phone"]').blur(); time.sleep(0.3)
    today = pg.evaluate("new Date().toISOString().slice(0,10)")
    pg.locator('input[data-person-field="followUp"]').fill(today); pg.locator('input[data-person-field="followUp"]').dispatch_event('change'); time.sleep(0.4)
    shot('x3_follow_up_whatsapp')
    check('follow-up badge on the person', pg.locator('.person', has_text='Shubham').locator('.badge.follow').count() == 1)
    with pg.expect_popup() as pop:
        pg.get_by_role('button', name='Remind on WhatsApp').click()
    check('WhatsApp opens with the number (with 91) and the amount', ('wa.me/919876543210' in pop.value.url or 'phone=919876543210' in pop.value.url) and '2%2C000' in pop.value.url, pop.value.url[:120])
    pop.value.close()
    pg.goto(URL + '#home'); time.sleep(0.3)
    check('Home says a follow-up is due', pg.locator('.notice', has_text='follow-up').count() == 1)

    # ---------- EMI plan ----------
    pg.goto(URL + '#add'); pg.get_by_label('Amount').fill('30000'); pg.get_by_label('Description').fill('Laptop')
    pg.locator('#add-category').select_option(food)
    pg.get_by_label('Bought on EMI / finance').check()
    pg.locator('[data-model="add.emiAmount"]').fill('5000'); pg.locator('[data-model="add.emiMonths"]').fill('6')
    pg.get_by_role('button', name='Save EMI purchase').click(); time.sleep(0.5)
    pg.goto(URL + '#people'); pg.locator('.seg button', has_text='Loans').first.click(); time.sleep(0.3)
    pg.get_by_role('button', name='Edit plan').click()
    pg.locator('[data-model="people.loanForm.emi"]').fill('4000'); pg.locator('[data-model="people.loanForm.months"]').fill('8')
    shot('x4_edit_emi_plan')
    pg.get_by_role('button', name='Save plan').click(); time.sleep(0.4)
    check('Edit EMI plan: 8 × 4,000 still to pay', money(pg.locator('.acct-row', has_text='Laptop').locator('.a-bal b').inner_text()) == 32000, pg.locator('.acct-row', has_text='Laptop').locator('.a-bal b').inner_text())

    # ---------- budget alert ----------
    pg.goto(URL + '#budget'); time.sleep(0.3)
    pg.locator(f'[data-budget="{food}"]').fill('2000'); pg.get_by_role('button', name='Save budget').first.click(); time.sleep(0.3)
    pg.goto(URL + '#add'); pg.get_by_label('Amount').fill('600'); pg.get_by_label('Description').fill('Lunch party')
    pg.locator('#add-category').select_option(food)
    pg.get_by_role('button', name='Save Expense').click(); time.sleep(4)
    pg.screenshot(path=os.path.join(OUT, 'x5_budget_alert.png'))
    check('budget alert when Food reaches 90%', 'budget' in pg.locator('.toast').inner_text().lower(), pg.locator('.toast').inner_text())

    # ---------- Home figures ----------
    pg.goto(URL + '#home'); time.sleep(0.4)
    for label in ['Invested', 'Spent + Invested', 'Total money out', 'Card owed']:
        check(f'Home shows {label}', pg.locator('.home-stats .stat', has_text=label).count() >= 1)
    out = money(pg.locator('.home-stats .stat', has_text='Total money out').locator('b').inner_text())
    check('Total money out = rent + music + dinner + lent + lunch (paid-for-me excluded)', out == 15000 + 299 + 450 + 2000 + 600, str(out))
    shot('x2_home')
    ph = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, storage_state=pg.context.storage_state()).new_page()
    ph.goto(URL + '#home'); time.sleep(1.5); ph.screenshot(path=os.path.join(OUT, 'x2_home_phone.png'), full_page=True); ph.close()

    # ---------- reports ----------
    pg.goto(URL + '#reports'); time.sleep(0.3)
    for rid, text in [('back-dated', None), ('missing-receipts', 'Rent'), ('paid-for-me', 'Ravi'), ('monthly-bills', 'Skipped')]:
        pg.locator('[data-model="reports.id"]').select_option(rid); time.sleep(0.3)
        ok = pg.locator('table.report').count() == 1 or pg.locator('main .empty').count() == 1
        if text:
            ok = ok and pg.locator('table.report', has_text=text).count() == 1
        check(f'report {rid}', ok)

    # ---------- the sender: bills, SIPs, maturities ----------
    msgs = pg.evaluate("""async () => {
        const src = await (await fetch('/backend/push-sender.gs')).text();
        const fn = new Function(src + '; return messagesFor;')();
        return [fn({ money: true, items: [{ due: '2026-11-10', kind: 'bill' }, { due: '2026-11-10', kind: 'bill' }, { due: '2026-11-10', kind: 'sip' }, { due: '2026-11-17', kind: 'maturity' }] }, '2026-11-10'),
                fn({ money: false, items: [{ due: '2026-11-10', kind: 'bill' }] }, '2026-11-10')];
    }""")
    check('sender: "2 bills and 1 SIP instalment" today and a deposit maturing in 7 days', len(msgs[0]) == 2 and '2 bills and 1 SIP instalment' in msgs[0][0]['body'] and 'in 7 days' in msgs[0][1]['title'], str(msgs[0]))
    check('sender: nothing when bill reminders are off', msgs[1] == [])
    check('no errors in the browser', not errors, '; '.join(errors[:3]))
    b.close()
print(f"\n{sum(checks)}/{len(checks)} checks passed")
sys.exit(0 if all(checks) else 1)
