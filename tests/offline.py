"""The offline screen: shown when the connection drops, "Try again", "Continue offline" with its chip, automatic
return when the connection is back – in demo mode, and with a throw-away account on the real Firebase project,
where the app must also OPEN without internet (Firebase's files and the user's data are kept on the device).

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/offline.py
"""
import os, sys, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
import encryption_helpers as H

checks = []
EMAIL = f'selftest.off.{int(time.time())}@example.com'
PASSWORD = 'Login-' + str(int(time.time()))[-6:] + '-pw'


def check(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, detail)


with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- demo mode ----------
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    U = H.URL + '?demo=1'
    pg.goto(U); pg.wait_for_selector('#welcome-currency'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(U + '#home'); pg.wait_for_selector('.tabbar'); time.sleep(3.4)
    ctx.set_offline(True); pg.wait_for_selector('.offline')
    check('connection lost: the offline screen covers the app', pg.locator('.offline h1').inner_text() == "You're offline" and pg.locator('.tabbar').count() == 0 and pg.locator('.toast').count() == 0)
    check('it offers Try again and Continue offline', pg.get_by_role('button', name='Try again').count() == 1 and pg.get_by_role('button', name='Continue offline').count() == 1)
    box = pg.locator('.offline-card').bounding_box()
    check('the card fits a phone screen without sideways scrolling', box['x'] >= 0 and box['x'] + box['width'] <= 390 and pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    pg.get_by_role('button', name='Try again').click(); pg.wait_for_selector('.toast.warn')
    check('Try again while still offline: says so, stays on the screen', 'Still no connection' in pg.locator('.toast-text').inner_text() and pg.locator('.offline').count() == 1)
    pg.locator('.toast-close').click(); pg.get_by_role('button', name='Continue offline').click(); time.sleep(0.3)
    check('Continue offline: the app is back with an Offline chip', pg.locator('.offline').count() == 0 and pg.locator('.tabbar').count() == 1 and pg.locator('.net-chip').inner_text().strip() == 'Offline')
    pg.goto(U + '#add'); pg.get_by_label('Amount').fill('120'); pg.get_by_label('Description').fill('Tea offline'); time.sleep(0.2)
    if not pg.locator('#add-category').input_value():
        pg.locator('#add-category').select_option(index=1)
    pg.get_by_role('button', name='Save Expense').click(); pg.wait_for_selector('.toast')
    check('an entry can be saved while offline', 'saved' in pg.locator('.toast-text').inner_text(), pg.locator('.toast-text').inner_text())
    pg.locator('.net-chip').click(); time.sleep(0.2)
    check('the chip opens the offline screen again', pg.locator('.offline').count() == 1)
    ctx.set_offline(False); pg.wait_for_selector('.toast:has-text("back online")')
    check('connection back: the screen goes away by itself, with a message, on the same page', pg.locator('.offline').count() == 0 and pg.locator('.net-chip').count() == 0 and pg.url.endswith('#add'))
    ctx.set_offline(True); pg.wait_for_selector('.offline'); pg.route('**/manifest.webmanifest?ping=*', lambda r: r.fulfill(status=200, body='{}'))
    ctx.set_offline(False); time.sleep(0.4); ctx.set_offline(True); pg.wait_for_selector('.offline')
    check('offline again: the screen is back without the old message on it', pg.locator('.toast').count() == 0)
    ctx.set_offline(False); time.sleep(0.4)
    check('no errors in the browser (demo)', not errors, str(errors[:2]))
    ctx.close()

    # ---------- a real account: opening the app without internet ----------
    pg = H.device(b); ctx = pg.context
    H.sign_up(pg, EMAIL, PASSWORD, 'correct horse battery')
    try:
        pg.goto(H.URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
        pg.get_by_label('Name').fill('Offline Bank'); pg.get_by_label('Opening balance').fill('2500'); pg.get_by_role('button', name='Save').click()
        pg.wait_for_selector('.acct-row:has-text("Offline Bank")', timeout=30000); time.sleep(2)
        pg.reload(); pg.wait_for_selector('.acct-row:has-text("Offline Bank")', timeout=40000); time.sleep(2)  # second load: the service worker keeps Firebase's files
        ctx.set_offline(True); pg.wait_for_selector('.offline')
        check('signed in, connection lost: offline screen with Continue offline', pg.get_by_role('button', name='Continue offline').count() == 1)
        pg.reload(); pg.wait_for_selector('.offline', timeout=40000); pg.wait_for_selector('button:has-text("Continue offline")', timeout=40000)
        check('app opened WITHOUT internet: it starts (no "Could not start"), from the copy on this device', pg.locator('text=Could not start').count() == 0)
        pg.get_by_role('button', name='Continue offline').click(); pg.wait_for_selector('.acct-row:has-text("Offline Bank")', timeout=20000)
        check('…and shows the saved data: Offline Bank with 2,500', '2,500' in pg.locator('.acct-row', has_text='Offline Bank').inner_text())
        ctx.set_offline(False); pg.wait_for_selector('.toast:has-text("back online")', timeout=20000)
        check('back online: message shown, data still there', pg.locator('.acct-row', has_text='Offline Bank').count() == 1)
    finally:
        try:
            ctx.set_offline(False)
            if pg.locator('.login-form').count() == 0:
                pg.goto(H.URL + '#more'); pg.get_by_role('button', name='Delete my account and data').click(); pg.wait_for_selector('.login-form', timeout=40000)
        except Exception as e:
            print('CLEAN-UP FAILED, delete by hand:', EMAIL, e)
    b.close()
print(f'{sum(checks)}/{len(checks)} checks passed ({EMAIL})')
sys.exit(0 if all(checks) else 1)
