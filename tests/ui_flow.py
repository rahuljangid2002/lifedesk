"""End-to-end check of LifeDesk in demo mode (data in the browser only).

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/ui_flow.py [output folder for screenshots]
"""
import os, re, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/'
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
    pg.goto(URL); pg.wait_for_selector('.tool')
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
    check('accounts: net balance 8,000', money(stat('Net balance')) == 8000, stat('Net balance'))
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
    pg.locator('.tile-btn', has_text='Lent').click()
    pg.get_by_label('Amount').fill('500'); pg.get_by_label('Description').fill('Lunch money')
    pg.get_by_label('Person (owes you)').select_option('__new'); pg.get_by_label("New person's name").fill('Friend A')
    pg.get_by_role('button', name='Save Lent').click(); time.sleep(0.3)
    check('lent: money in hand down, net 6,501', money(stat('Net balance')) == 6501, stat('Net balance'))

    # People: got 200 back
    pg.goto(URL + '#people')
    check('people: to receive 500', money(stat('To receive')) == 500, stat('To receive'))
    pg.locator('.person', has_text='Friend A').locator('.card-head').click()
    pg.get_by_role('button', name='Got money back').click()
    pg.locator('.person input[type=number]').fill('200'); pg.locator('.person').get_by_role('button', name='Save').click(); time.sleep(0.3)
    check('people: to receive 300', money(stat('To receive')) == 300, stat('To receive'))
    shot('3_people')

    # Budget: plan 5,000 for fuel, open the category
    pg.goto(URL + '#budget')
    pg.get_by_label('Budget for Vehicle - Fuel').fill('5000'); pg.get_by_role('button', name='Save budget').click(); time.sleep(0.3)
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
    check('no console errors', not errors, str(errors[:3]))
    b.close()

print(f'{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
