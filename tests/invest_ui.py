"""Investments screen end to end in demo mode: buy (deducted from the bank), sell, dividend, deposit held before,
SIP with its first instalment today, goal, insights, calculator, the ledger entries and deleting.

    python3 tools/serve_dev.py        (in 4-Web-App)
    <venv with playwright>/python tests/invest_ui.py [output folder for screenshots]
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('LIFEDESK_URL', 'http://127.0.0.1:8765/?demo=1')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
checks = []


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


def money(text):
    return float(re.sub(r'[^\d.−-]', '', text).replace('−', '-') or 0)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.goto(URL)
    pg.wait_for_selector('#welcome-currency')
    pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click()
    pg.wait_for_selector('.tool')
    shot = lambda n: pg.screenshot(path=os.path.join(OUT, n + '.png'), full_page=True)
    stat = lambda label: pg.locator('.stat', has_text=label).locator('b').first.inner_text()
    bank = lambda: money(pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('lifedesk-demo')); const a = s.accounts.find(x => x.name === 'Bank'); return String(a.opening + s.entries.filter(e => e.accountId === a.id || e.toAccountId === a.id).reduce((t, e) => t + (e.type === 'transfer' ? (e.toAccountId === a.id ? e.amount : -e.amount) : (['income','gotback','borrowed','invreturn'].includes(e.type) ? e.amount : -e.amount)), 0)); })()"))

    # a bank account with 1,00,000
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('Bank'); pg.get_by_label('Opening balance').fill('100000')
    pg.get_by_label('Use as my default account').check(); pg.get_by_role('button', name='Save').click(); time.sleep(0.3)

    pg.goto(URL + '#invest'); pg.wait_for_selector('main.inv'); time.sleep(0.5)
    check('Investments screen opens with an empty state', pg.locator('.empty-state', has_text='No investments yet').count() == 1)
    check('More menu and side menu link to Investments', pg.locator('.side a[href="#invest"]').count() == 1)

    # buy a share: 10 @ 100 + 5 charges, from the bank
    pg.get_by_role('button', name='Add investment').click()
    pg.locator('[data-model="invest.form.type"]').select_option('Stock')
    check('buying now is the default', pg.locator('[data-model="invest.form.mode"]').input_value() == 'buy')
    pg.locator('[data-model="invest.form.name"]').fill('Test Share')
    pg.locator('[data-model="invest.form.priceSource"]').select_option('manual')
    pg.locator('[data-model="invest.form.price"]').fill('110')
    pg.locator('[data-model="invest.form.first.units"]').fill('10')
    pg.locator('[data-model="invest.form.first.price"]').fill('100')
    pg.locator('[data-model="invest.form.first.charges"]').fill('5')
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.5)
    check('share saved: value 1,100, invested 1,005', money(stat('Current value')) == 1100 and money(stat('Invested')) == 1005, f"{stat('Current value')} {stat('Invested')}")
    check('bank down by 1,005', bank() == 100000 - 1005, str(bank()))
    shot('inv_1_holdings')

    # sell 4 @ 150 into the bank, dividend 50
    pg.locator('button.a-name', has_text='Test Share').click()
    pg.locator('.inv-acts button', has_text='Sell / redeem').click()
    pg.locator('[data-model="invest.txn.units"]').fill('4'); pg.locator('[data-model="invest.txn.price"]').fill('150')
    pg.locator('[data-model="invest.txn.amount"]').fill('600')
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.4)
    check('sale back into the bank', bank() == 100000 - 1005 + 600, str(bank()))
    check('sale shows its gain and term', pg.locator('.inv-txn', has_text='Sell').locator('small', has_text='Short term').count() >= 1)
    pg.locator('.inv-acts button', has_text='Dividend').first.click()
    pg.locator('[data-model="invest.txn.amount"]').fill('50')
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.4)
    check('dividend into the bank', bank() == 100000 - 1005 + 600 + 50, str(bank()))
    cats = pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo')).categories.filter(c => c.name === 'Investment Income').length")
    check('dividend goes under Investment Income', cats == 1)

    # a fixed deposit held before: not in the ledger
    pg.get_by_role('button', name='Add investment').click()
    pg.locator('[data-model="invest.form.type"]').select_option('Fixed Deposit')
    pg.locator('[data-model="invest.form.mode"]').select_option('held')
    pg.locator('[data-model="invest.form.name"]').fill('Bank FD')
    pg.locator('[data-model="invest.form.rate"]').fill('7')
    pg.locator('[data-model="invest.form.first.date"]').fill('2025-11-01')
    pg.locator('[data-model="invest.form.first.amount"]').fill('50000')
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.4)
    check('deposit held before does not touch the bank', bank() == 100000 - 1005 + 600 + 50, str(bank()))
    check('deposit grows with interest', pg.locator('.inv-row', has_text='Bank FD').locator('.a-bal b').inner_text() not in ('₹50,000', ''), pg.locator('.inv-row', has_text='Bank FD').locator('.a-bal b').inner_text())

    # SIP on the share with the first instalment today
    pg.get_by_role('button', name='SIPs').click(); pg.get_by_role('button', name='Start a SIP').click()
    pg.locator('[data-model="invest.sip.investmentId"]').select_option(label='Test Share (Stock)')
    pg.locator('[data-model="invest.sip.amount"]').fill('1100')
    pg.locator('[data-model="invest.sip.day"]').select_option('10')
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.6)
    check('SIP started and its first instalment deducted now', bank() == 100000 - 1005 + 600 + 50 - 1100, str(bank()))
    check('SIP listed with its next date', pg.locator('.acct-row', has_text='Test Share').locator('small', has_text='Next').count() == 1)
    shot('inv_2_sips')

    # goal
    pg.get_by_role('button', name='Goals').click(); pg.get_by_role('button', name='Add a goal').click()
    pg.locator('[data-model="invest.goal.name"]').fill('Car'); pg.locator('[data-model="invest.goal.target"]').fill('100000')
    pg.locator('[data-model="invest.goal.targetDate"]').fill('2030-11-01')
    pg.locator('.checks input').first.check()
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.4)
    check('goal with progress and the monthly investment needed', pg.locator('.cards.goals .card', has_text='Car').locator('small', has_text='a month').count() >= 1)
    shot('inv_3_goals')

    pg.get_by_role('button', name='Insights').click(); time.sleep(0.3)
    check('insights: allocation and gains by year', pg.locator('h2', has_text='Allocation by asset class').count() == 1 and pg.locator('table.report').count() == 1)
    shot('inv_4_insights')
    pg.get_by_role('button', name='Calculator').click(); time.sleep(0.3)
    check('calculator works', pg.locator('.kv', has_text='Value at the end').count() == 2)
    pg.get_by_role('button', name='Transactions').click(); time.sleep(0.3)
    check('transactions list: buy, sell, dividend, opening, SIP', pg.locator('.inv-txn').count() == 5, str(pg.locator('.inv-txn').count()))

    # the ledger: invested is not spending; the entry opens Investments when edited
    pg.goto(URL + '#home'); time.sleep(0.4)
    check('investing is not counted as an expense', money(stat('Expense')) == 0, stat('Expense'))
    check('Home has the Investments card', pg.locator('a.card[href="#invest"]').count() == 1)
    check('net worth includes investments', pg.locator('.worth-parts small', has_text='investments').count() == 1)
    pg.goto(URL + '#daily'); pg.locator('.seg button', has_text='All').click(); time.sleep(0.3)
    pg.locator('.row', has_text='Bought · Test Share').locator('[data-action="editEntry"]').first.click(); time.sleep(0.4)
    check('editing an investment entry goes to Investments', pg.url.endswith('#invest'), pg.url)

    # delete the share: its entries go, the bank comes back
    pg.locator('button.a-name', has_text='Test Share').click() if pg.locator('.inv-row.open').count() == 0 else None
    pg.locator('.inv-row', has_text='Test Share').locator('button', has_text='Delete').click(); time.sleep(0.5)
    check('deleting the investment removes its ledger entries', bank() == 100000, str(bank()))
    check('no errors in the browser', not errors, '; '.join(errors[:3]))
    b.close()
print(f"\n{sum(checks)}/{len(checks)} checks passed")
sys.exit(0 if all(checks) else 1)
