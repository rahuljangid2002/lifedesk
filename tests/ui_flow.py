"""End-to-end check of LifeDesk in demo mode (data in the browser only).

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/ui_flow.py [output folder for screenshots]
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/?demo=1'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
checks = []


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


def money(text):
    return int(re.sub(r'[^\d−-]', '', text).replace('−', '-') or 0)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector('#welcome-currency')
    check('first visit asks for the currency', pg.locator('#welcome-currency option').count() > 100, str(pg.locator('#welcome-currency option').count()))
    pg.locator('#welcome-currency').select_option('USD'); pg.get_by_role('button', name='Continue').click()
    pg.wait_for_selector('.tool')
    check('start screen lists Money and a coming-soon tool', pg.locator('a.tool', has_text='Money').count() == 1 and pg.locator('.tool.soon').count() == 1)
    stat = lambda label: pg.locator('.stat', has_text=label).locator('b').first.inner_text()
    shot = lambda n: pg.screenshot(path=os.path.join(OUT, n + '.png'), full_page=True)

    # My Accounts: a bank with 10,000 and a card owing 2,000
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('HDFC Bank'); pg.get_by_label('Opening balance').fill('10000')
    pg.get_by_label('Use as my default account').check(); pg.get_by_role('button', name='Save').click()
    pg.get_by_role('button', name='＋ Credit card').click()
    pg.get_by_label('Name').fill('Axis Card'); pg.get_by_label('Amount owed at the start').fill('2000')
    pg.get_by_label('Credit limit').fill('50000'); pg.get_by_label('Bill due day (1–31)').fill('15')
    pg.get_by_role('button', name='Save').click(); time.sleep(0.3)
    check('accounts: net balance 8,000 in dollars', stat('Net balance') == '$8,000', stat('Net balance'))
    shot('1_accounts')

    # Add Entry: expense with category suggestion
    pg.goto(URL + '#add')
    pg.get_by_label('Amount').fill('1111'); pg.get_by_label('Description').fill('Car petrol')
    check('category suggested from description', pg.locator('#add-category option:checked').inner_text() == 'Vehicle - Fuel',
          pg.locator('#add-category option:checked').inner_text())
    check('default account preselected', 'on' in pg.locator('.chip', has_text='HDFC Bank').get_attribute('class'))
    pg.get_by_role('button', name='Save Expense').click(); time.sleep(0.3)
    check('expense: net balance 6,889', money(stat('Net balance')) == 6889, stat('Net balance'))
    check('expense in month total', money(stat('Expense')) == 1111, stat('Expense'))
    pg.get_by_role('button', name='Save Expense').click(); time.sleep(0.2)
    check('empty save is refused', pg.locator('.toast.warn').count() == 1)
    shot('2_add_entry')

    # Edit it to 999, then lend 500 to a new person
    pg.locator('.row', has_text='Car petrol').get_by_role('button', name='Edit').click()
    pg.get_by_label('Amount').fill('999'); pg.get_by_role('button', name='Save changes').click(); time.sleep(0.3)
    check('edit: net balance 7,001', money(stat('Net balance')) == 7001, stat('Net balance'))
    pg.locator('.tile-btn[data-type=lent]').click()
    pg.get_by_label('Amount').fill('500'); pg.get_by_label('Description').fill('Lunch money')
    pg.get_by_label('Person (owes you)').select_option('__new'); pg.get_by_label("New person's name").fill('Friend A')
    pg.get_by_role('button', name='Save Lent').click(); time.sleep(0.3)
    check('lent: money in hand down, net 6,501', money(stat('Net balance')) == 6501, stat('Net balance'))

    # People: got 200 back
    pg.goto(URL + '#people')
    check('people: to receive 500', money(stat('To receive')) == 500, stat('To receive'))
    pg.locator('.person', has_text='Friend A').locator('.card-head').click()
    pg.get_by_role('button', name='Got money back').click()
    pg.locator('.person .amount input').fill('200'); pg.locator('.person').get_by_role('button', name='Save').click(); time.sleep(0.3)
    check('people: to receive 300', money(stat('To receive')) == 300, stat('To receive'))
    shot('3_people')

    # Budget: plan 5,000 for fuel, open the category
    pg.goto(URL + '#budget')
    check('budget: no unsaved-changes bar before editing', not pg.locator('.savebar').is_visible())
    pg.get_by_label('Budget for Vehicle - Fuel').fill('5000')
    check('budget: unsaved-changes bar appears after editing', pg.locator('.savebar').is_visible())
    pg.locator('.savebar').get_by_role('button', name='Save budget').click(); time.sleep(0.3)
    check('budget: saved, bar gone, used category listed first', not pg.locator('.savebar').is_visible() and 'Vehicle - Fuel' in pg.locator('.budget-row').first.inner_text())
    check('budget: planned 5,000 and spent 999', money(stat('Planned')) == 5000 and money(stat('Spent so far')) == 999)
    pg.locator('.budget-row', has_text='Vehicle - Fuel').get_by_role('button', name='See entries').click()
    check('budget drill-down lists the expense', pg.locator('.budget-row.open .row', has_text='Car petrol').count() == 1)
    shot('4_budget')

    # Daily Expenses
    pg.goto(URL + '#daily')
    check('daily: spent 999', money(stat('Spent')) == 999, stat('Spent'))
    pg.get_by_role('button', name='All entries').click()
    check('daily: all entries shows 3', stat('Entries') == '3', stat('Entries'))
    shot('5_daily')

    # Pay the card bill in full from the bank
    pg.goto(URL + '#accounts')
    pg.get_by_role('button', name='Pay bill').click(); pg.get_by_role('button', name='Pay', exact=True).click(); time.sleep(0.3)
    check('card paid: owed 0, net unchanged 6,701', money(stat('Card owed')) == 0 and money(stat('Net balance')) == 6701,
          f"{stat('Card owed')} / {stat('Net balance')}")

    # Home and persistence across a reload
    pg.goto(URL + '#home'); pg.reload(); pg.wait_for_selector('.tabbar')
    check('reload keeps data: net 6,701', money(stat('Net balance')) == 6701, stat('Net balance'))
    shot('6_home')

    # Delete the expense
    pg.goto(URL + '#daily'); pg.locator('.row', has_text='Car petrol').get_by_role('button', name='Edit').click()
    pg.get_by_role('button', name='Delete entry').click(); time.sleep(0.3)
    check('delete returns to Daily', pg.url.endswith('#daily'), pg.url)
    pg.goto(URL + '#home')
    check('delete: net 7,700', money(stat('Net balance')) == 7700, stat('Net balance'))

    pg.goto(URL); pg.wait_for_selector('.tool')
    check('start screen shows the Money figure', '7,700' in pg.locator('a.tool', has_text='Money').inner_text())
    pg.locator('a.tool', has_text='Money').click()
    pg.wait_for_selector('.tabbar')
    check('Money tile opens Money home', pg.url.endswith('#home') and pg.locator('.tabbar').count() == 1, pg.url)
    pg.goto(URL); pg.wait_for_selector('.tool'); shot('0_hub')

    # Sample data: load, look, remove
    before = pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo')).entries.length")
    pg.goto(URL + '#more'); pg.get_by_role('button', name='Load sample data').click()
    pg.wait_for_selector('button:has-text("Remove sample data")')
    d = pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo'))")
    sample = [e for e in d['entries'] if e['id'].startswith('sample-')]
    check('sample: about 19 months of entries from 1 March 2025', len(sample) > 500 and min(e['date'] for e in sample) == '2025-03-01', f"{len(sample)} entries, {min(e['date'] for e in sample)} to {max(e['date'] for e in sample)}")
    import datetime
    check('sample: nothing dated in the future', max(e['date'] for e in sample) <= datetime.date.today().isoformat())
    check('sample: every expense and income has a category', all(e['categoryId'] for e in sample if e['type'] in ('expense', 'income')))
    # running balance of every non-card account, day by day, over the whole history
    kinds = {a['id']: a['kind'] for a in d['accounts']}
    bal = {a['id']: (a.get('opening') or 0) for a in d['accounts'] if a['kind'] != 'card'}
    lowest = dict(bal)
    sign = {'expense': -1, 'income': 1, 'lent': -1, 'gotback': 1, 'borrowed': 1, 'repaid': -1}
    for e in sorted(d['entries'], key=lambda e: (e['date'], e.get('createdAt', 0))):
        if e['type'] == 'transfer':
            moves = [(e['accountId'], -e['amount']), (e['toAccountId'], e['amount'])]
        else:
            moves = [(e['accountId'], sign[e['type']] * e['amount'])]
        for acc_id, delta in moves:
            if acc_id in bal:
                bal[acc_id] += delta
                lowest[acc_id] = min(lowest[acc_id], bal[acc_id])
    names = {a['id']: a['name'] for a in d['accounts']}
    below = {names[k]: v for k, v in lowest.items() if v < 0 and (k.startswith('sample-') or kinds[k] == 'cash')}
    check('sample: no bank, wallet or cash balance is ever below zero', not below, str(below) if below else 'lowest: ' + ', '.join(f'{names[k]} {round(v)}' for k, v in lowest.items()))
    card_owed = -sum((1 if e.get('toAccountId') == 'sample-acc-card' else -1 if e['accountId'] == 'sample-acc-card' and e['type'] == 'expense' else 0) * e['amount'] for e in d['entries'])
    check('sample: card owes only the charges since its last bill payment', 0 < card_owed < 2000, str(card_owed))
    pg.goto(URL + '#accounts'); time.sleep(0.4)
    shot('s_accounts')
    pg.goto(URL + '#home'); time.sleep(0.3); shot('s_home')
    pg.goto(URL + '#daily'); pg.get_by_role('button', name='Previous month').click(); time.sleep(0.3)
    check('sample: last month has a full set of days', pg.locator('.day').count() > 15, str(pg.locator('.day').count()))
    shot('s_daily')
    pg.goto(URL + '#budget'); pg.get_by_role('button', name='Previous month').click(); time.sleep(0.3); shot('s_budget')
    check('sample: budget planned and spent last month', money(stat('Planned')) > 0 and money(stat('Spent so far')) > 0)
    pg.goto(URL + '#people'); time.sleep(0.3); shot('s_people')
    # Alex: lent 300, paid back 200 -> 100; plus the 300 Friend A owes from earlier in this test. Sam is a bad debt, not counted.
    check('sample: to receive is 400 (Alex 100 + Friend A 300)', money(stat('To receive')) == 400, stat('To receive'))
    # Dashboards and reports, checked against totals worked out here from the raw entries
    import calendar
    today_d = datetime.date.today()
    last = (today_d.replace(day=1) - datetime.timedelta(days=1))
    lm = last.strftime('%Y-%m')
    spent_lm = sum(e['amount'] for e in d['entries'] if e['type'] == 'expense' and e['date'].startswith(lm))
    income_lm = sum(e['amount'] for e in d['entries'] if e['type'] == 'income' and e['date'].startswith(lm))
    kpi = lambda label: pg.locator('.kpi', has_text=label).locator('b').first.inner_text()
    pg.goto(URL + '#insights'); pg.get_by_role('button', name='Previous month').click(); time.sleep(0.4)
    check('dashboard: last month income and expense match the entries', money(kpi('Income')) == round(income_lm) and money(kpi('Expense')) == round(spent_lm), f"{kpi('Income')} / {kpi('Expense')} vs {income_lm} / {spent_lm}")
    cat_card = pg.locator('.chart-card', has_text='Spend by category')
    bars_total = sum(money(v) for v in cat_card.locator('.hb-value').all_inner_texts())
    check('dashboard: category bars add up to the month expense', bars_total == round(spent_lm), f'{bars_total} vs {spent_lm}')
    check('dashboard: at most 8 category bars (the rest folded into Other)', cat_card.locator('.hbar').count() <= 8, str(cat_card.locator('.hbar').count()))
    day_card = pg.locator('.chart-card', has_text='Daily spend')
    check('dashboard: one hover band per day of the month', day_card.locator('.hit').count() == calendar.monthrange(last.year, last.month)[1], str(day_card.locator('.hit').count()))
    day_card.locator('.hit').nth(1).hover(force=True); time.sleep(0.2)
    check('dashboard: hovering a day shows its date and amount', pg.locator('.tip').is_visible() and '$' in pg.locator('.tip').inner_text(), pg.locator('.tip').inner_text().replace('\n', ' | '))
    check('dashboard: one series has no legend', day_card.locator('.legend').count() == 0)
    check('dashboard: every chart has a table twin', pg.locator('.chart-card .twin').count() >= 4, str(pg.locator('.chart-card .twin').count()))
    check('dashboard: budget meters say their state in words', pg.locator('.meter .m-state').count() > 0 and all('%' in v for v in pg.locator('.meter .m-value').all_inner_texts()))
    shot('i_monthly')
    pg.get_by_role('button', name='Yearly').click(); time.sleep(0.4)
    ive = pg.locator('.chart-card', has_text='Income vs expense by month')
    check('yearly: two series have a legend naming both', ive.locator('.legend span').all_inner_texts() == ['Income', 'Expense'], str(ive.locator('.legend span').all_inner_texts()))
    check('yearly: twelve months on the axis', ive.locator('.hit').count() == 12)
    check('yearly: net balance trend drawn with its last value labelled', pg.locator('.chart-card', has_text='Net balance trend').locator('path.line').count() == 1 and pg.locator('.end-label').count() == 1)
    shot('i_yearly')
    pg.get_by_role('button', name='Balances').click(); time.sleep(0.4)
    bank_bars = sum(money(v) for v in pg.locator('.chart-card', has_text='Balance by account').locator('.hb-value').all_inner_texts())
    check('balances: account bars add up to In accounts', bank_bars == money(stat('In accounts')), f"{bank_bars} vs {stat('In accounts')}")
    shot('i_balances')

    pg.goto(URL + '#reports'); time.sleep(0.3)
    names = pg.locator('[data-model="reports.id"] option').all_inner_texts()
    broken = []
    for value in pg.locator('[data-model="reports.id"] option').evaluate_all('els => els.map(e => e.value)'):
        pg.locator('[data-model="reports.id"]').select_option(value); time.sleep(0.15)
        if pg.locator('.hero h1').count() != 1 or (pg.locator('table.report').count() == 0 and pg.locator('main .empty').count() == 0):
            broken.append(value)
    check(f'reports: all {len(names)} open without an error', len(names) == 15 and not broken, str(broken))
    pg.locator('[data-model="reports.id"]').select_option('spend-by-category'); pg.locator('[data-model="reports.preset"]').select_option('last-month'); time.sleep(0.3)
    total = money(pg.locator('table.report tfoot td').nth(2).inner_text())
    check('report: spend by category for last month totals the month expense', total == round(spent_lm), f'{total} vs {spent_lm}')
    with pg.expect_download() as dl:
        pg.get_by_role('button', name='Download CSV').click()
    csv_text = open(dl.value.path(), encoding='utf-8-sig').read()
    import csv, io
    rows = list(csv.reader(io.StringIO(csv_text)))
    check('report: CSV has the header, plain numbers and the same total', rows[0][:3] == ['Category', 'Entries', 'Spent'] and rows[-1][0] == 'Total' and round(float(rows[-1][2])) == round(spent_lm), f'{rows[0]} … {rows[-1]}')
    pg.locator('[data-model="reports.id"]').select_option('all-entries'); pg.locator('[data-model="reports.preset"]').select_option('all'); time.sleep(0.4)
    check('report: all entries lists every entry (first 500 shown)', f"{len(d['entries'])} rows" in pg.locator('main').inner_text() and pg.locator('table.report tbody tr').count() == min(500, len(d['entries'])), f"{pg.locator('table.report tbody tr').count()} rows shown")
    shot('i_reports')

    pg.goto(URL + '#more'); pg.get_by_role('button', name='Remove sample data').click()
    pg.wait_for_selector('button:has-text("Load sample data")')
    after = pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo'))")
    check('sample removed: own entries untouched', len(after['entries']) == before and not [a for a in after['accounts'] if a['id'].startswith('sample-')] and not [b for b in after['budgets'] if b.get('sample')], f"{len(after['entries'])} entries")

    # Appearance: Light / Dark / System
    bg = lambda: pg.evaluate("getComputedStyle(document.body).backgroundColor")
    pg.goto(URL + '#more'); light_bg = bg()
    pg.get_by_role('button', name='Dark', exact=True).click(); time.sleep(0.2)
    check('theme: Dark turns the page dark', pg.evaluate("document.documentElement.dataset.theme") == 'dark' and bg() != light_bg, bg())
    dark_bg = bg(); pg.reload(); pg.wait_for_selector('.seg')
    check('theme: the choice survives a reload', bg() == dark_bg)
    pg.emulate_media(color_scheme='dark'); pg.get_by_role('button', name='Light', exact=True).click(); time.sleep(0.2)
    check('theme: Light stays light even when the device is dark', bg() == light_bg, bg())
    pg.get_by_role('button', name='System', exact=True).click(); time.sleep(0.2)
    check('theme: System follows the device (dark here)', pg.evaluate("document.documentElement.dataset.theme === undefined") and bg() == dark_bg, bg())
    pg.emulate_media(color_scheme='light'); time.sleep(0.2)
    check('theme: System follows the device (light here)', bg() == light_bg, bg())

    # Change the currency: amounts follow, nothing is converted
    pg.goto(URL + '#more'); pg.locator('[data-setting=currency]').select_option('EUR'); time.sleep(0.4)
    pg.goto(URL + '#home'); pg.wait_for_selector('.tabbar')
    check('currency change: euro shown', '€' in stat('Net balance') and money(stat('Net balance')) == 7700, stat('Net balance'))
    pg.goto(URL + '#more'); pg.locator('[data-setting=currency]').select_option('INR'); time.sleep(0.4)
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('Savings'); pg.get_by_label('Opening balance').fill('1234567'); pg.get_by_role('button', name='Save').click(); time.sleep(0.3)
    check('rupees use lakh grouping', '₹12,34,567' in pg.locator('.acct-row', has_text='Savings').inner_text(), pg.locator('.acct-row', has_text='Savings').inner_text()[:60])

    # Desktop width: side menu instead of the bottom bar
    pg.set_viewport_size({'width': 1680, 'height': 950}); pg.goto(URL + '#add'); time.sleep(0.3); shot('w_add')
    pg.set_viewport_size({'width': 1366, 'height': 850}); pg.goto(URL + '#home'); pg.wait_for_selector('.side')
    check('desktop: side menu shown, bottom bar hidden', pg.locator('.side').is_visible() and not pg.locator('.tabbar').is_visible())
    check('desktop: no sideways scrolling', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    for r in ['home', 'add', 'daily', 'budget', 'people', 'accounts', 'more', 'hub']:
        pg.goto(URL + '#' + r); time.sleep(0.3); shot('d_' + r)
    pg.set_viewport_size({'width': 390, 'height': 844})
    wide = []
    for r in ['home', 'add', 'daily', 'budget', 'people', 'accounts', 'more']:
        pg.goto(URL + '#' + r); time.sleep(0.3)
        if not pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'):
            wide.append(r)
        pg.screenshot(path=os.path.join(OUT, 'm_' + r + '.png'))
    check('phone: no sideways scrolling on any screen', not wide, str(wide))
    pg.emulate_media(color_scheme='dark'); pg.goto(URL + '#home'); time.sleep(0.3)
    pg.screenshot(path=os.path.join(OUT, 'm_home_dark.png'))
    check('no console errors', not errors, str(errors[:3]))
    b.close()

print(f'{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
