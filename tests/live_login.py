"""Real sign-up / sign-in check against the Firebase project, from localhost (an authorised address).
Creates a throw-away account on example.com (no email is sent), uses it, then deletes the account and its data.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/live_login.py
"""
import sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/'
EMAIL = f'selftest.{int(time.time())}@example.com'
PASSWORD = 'Test-' + str(int(time.time()))[-6:] + '-pw'
checks = []


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    answers = []
    pg.on('dialog', lambda d: d.accept(answers.pop(0)) if d.type == 'prompt' else d.accept())
    toast = lambda: pg.locator('.toast').inner_text() if pg.locator('.toast').count() else ''
    pg.goto(URL); pg.wait_for_selector('.login-form')

    # wrong password for an account that does not exist
    pg.get_by_label('Email').fill(EMAIL); pg.locator('[data-model="login.password"]').fill('wrong-password')
    pg.get_by_role('button', name='Sign in', exact=True).click(); pg.wait_for_selector('.toast.warn', timeout=20000)
    check('unknown account is refused in plain words', 'Firebase' not in toast() and 'not right' in toast() or 'No account' in toast(), toast())

    # create the account
    pg.get_by_role('button', name='Create an account').click()
    pg.get_by_label('Your name').fill('Self Test'); pg.get_by_label('Email').fill(EMAIL)
    pg.locator('[data-model="login.password"]').fill('short'); pg.get_by_role('button', name='Create account').click()
    pg.wait_for_selector('.toast.warn'); check('short password refused', '8 characters' in toast(), toast())
    pg.locator('[data-model="login.password"]').fill(PASSWORD); pg.get_by_role('button', name='Create account').click()
    pg.wait_for_selector('#welcome-currency', timeout=30000)
    check('account created, first-visit screen shown', True)
    pg.locator('#welcome-currency').select_option('GBP'); pg.get_by_role('button', name='Continue').click()
    pg.wait_for_selector('.tool', timeout=30000)
    check('start screen greets by name', 'Hello, Self' in pg.locator('.hero h1').inner_text(), pg.locator('.hero h1').inner_text())
    check('no demo banner in live mode', pg.locator('.notice').count() == 0)

    # save something to the cloud
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('Test Bank'); pg.get_by_label('Opening balance').fill('2500'); pg.get_by_role('button', name='Save').click()
    pg.wait_for_selector('.card:has-text("Test Bank")', timeout=20000)
    check('account saved, shown in pounds', '£2,500' in pg.locator('.card', has_text='Test Bank').inner_text())

    # sign out, sign in again in a fresh browser: the data must come back from the cloud
    pg.goto(URL + '#more'); pg.get_by_role('button', name='Sign out').click(); pg.wait_for_selector('.login-form', timeout=20000)
    check('signed out', True)
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}); p2 = ctx2.new_page()
    p2.on('dialog', lambda d: d.accept(answers.pop(0)) if d.type == 'prompt' else d.accept())
    p2.goto(URL); p2.wait_for_selector('.login-form')
    p2.get_by_label('Email').fill(EMAIL); p2.locator('[data-model="login.password"]').fill('not-my-password')
    p2.get_by_role('button', name='Sign in', exact=True).click(); p2.wait_for_selector('.toast.warn', timeout=20000)
    check('wrong password refused', 'not right' in p2.locator('.toast').inner_text(), p2.locator('.toast').inner_text())
    p2.locator('[data-model="login.password"]').fill(PASSWORD); p2.keyboard.press('Enter')
    p2.wait_for_selector('.tool', timeout=30000)
    p2.goto(URL + '#accounts'); p2.wait_for_selector('.card:has-text("Test Bank")', timeout=20000)
    check('fresh browser: data came back from the cloud', '£2,500' in p2.locator('.card', has_text='Test Bank').inner_text())

    # clean up: delete the test account and its data
    answers.append('DELETE')
    p2.goto(URL + '#more'); p2.get_by_role('button', name='Delete my account and data').click()
    p2.wait_for_selector('.login-form', timeout=30000)
    check('test account deleted', True)
    p2.get_by_label('Email').fill(EMAIL); p2.locator('[data-model="login.password"]').fill(PASSWORD)
    p2.get_by_role('button', name='Sign in', exact=True).click(); p2.wait_for_selector('.toast.warn', timeout=20000)
    check('deleted account can no longer sign in', True, p2.locator('.toast').inner_text())
    check('no page errors', not errors, str(errors[:3]))
    b.close()
print(f'{sum(checks)}/{len(checks)} checks passed ({EMAIL})')
sys.exit(0 if all(checks) else 1)
