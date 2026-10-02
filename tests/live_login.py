"""Sign-up with an email code, against the real Firebase project, from localhost (an authorised address).

The email-code service is replaced by a stand-in here (a test cannot read an inbox): it accepts the code 123456
and refuses to mark the account verified. So this checks the screens and the order of steps, and that an account
whose email is not verified ends on the "Verify your email" screen. The throw-away account (example.com, no email
is sent) is deleted at the end.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/live_login.py
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/'
OTP = 'http://localhost:8765/__otp'
EMAIL = f'selftest.{int(time.time())}@example.com'
PASSWORD = 'Test-' + str(int(time.time()))[-6:] + '-pw'
checks = []
calls = []


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


def stand_in(route):
    req = json.loads(route.request.post_data or '{}')
    calls.append(req.get('action'))
    if req.get('action') == 'send':
        body = {'ok': True, 'minutes': 10}
    elif req.get('action') == 'verify':
        body = {'ok': True} if req.get('code') == '123456' else {'ok': False, 'error': 'wrong', 'triesLeft': 4}
    else:
        body = {'ok': False, 'error': 'not_verified'}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(body))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(f"localStorage.setItem('lifedesk-otp-endpoint', '{OTP}')")
    ctx.route(OTP, stand_in)
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    answers = []
    pg.on('dialog', lambda d: d.accept(answers.pop(0)) if d.type == 'prompt' else d.accept())
    toast = lambda: pg.locator('.toast').last.inner_text() if pg.locator('.toast').count() else ''
    # daily limit reached: a notice on the form that points to Google, and no account is created
    lim = b.new_context(viewport={'width': 390, 'height': 844})
    lim.add_init_script(f"localStorage.setItem('lifedesk-otp-endpoint', '{OTP}')")
    lim.route(OTP, lambda route: route.fulfill(status=200, content_type='application/json', body='{"ok": false, "error": "daily"}'))
    lp = lim.new_page(); lp.goto(URL); lp.wait_for_selector('.login-form')
    lp.get_by_role('button', name='Create an account').click()
    lp.get_by_label('Your name').fill('Limit Test'); lp.get_by_label('Email').fill('limit.test@example.com')
    lp.locator('[data-model="login.password"]').fill('long-enough-pw'); lp.get_by_role('button', name='Send verification code').click()
    lp.wait_for_selector('.notice.stacked', timeout=20000)
    text = lp.locator('.notice.stacked').inner_text()
    check('daily limit: notice stays on the form and points to Google', 'test version' in text and 'Continue with Google' in text and lp.locator('input.code').count() == 0, text[:60])
    lp.screenshot(path='tests/out/12_limit.png'); lim.close()

    pg.goto(URL + '#more'); pg.wait_for_selector('.login-form')  # as if the user had signed out from the Account screen

    pg.get_by_label('Email').fill(EMAIL); pg.locator('[data-model="login.password"]').fill('wrong-password')
    pg.get_by_role('button', name='Sign in', exact=True).click(); pg.wait_for_selector('.toast.warn', timeout=20000)
    check('unknown account is refused in plain words', 'Firebase' not in toast(), toast())

    pg.get_by_role('button', name='Create an account').click()
    pg.get_by_label('Your name').fill('Self Test'); pg.get_by_label('Email').fill(EMAIL)
    pg.locator('[data-model="login.password"]').fill('short'); pg.get_by_role('button', name='Send verification code').click()
    pg.wait_for_selector('.toast.warn'); check('short password refused before any code is sent', '8 characters' in toast() and not calls, toast())
    pg.locator('[data-model="login.password"]').fill(PASSWORD); pg.get_by_role('button', name='Send verification code').click()
    pg.wait_for_selector('input.code', timeout=20000)
    check('code screen shown, code requested once', calls == ['send'] and EMAIL in pg.locator('.login-form').inner_text(), str(calls))

    pg.locator('input.code').fill('111111'); pg.get_by_role('button', name='Verify and create account').click()
    pg.wait_for_selector('.toast.warn:has-text("not right")', timeout=20000)
    check('wrong code refused, still on the code screen', pg.locator('input.code').count() == 1, toast())
    pg.screenshot(path='tests/out/10_code.png')

    pg.locator('input.code').fill('123456'); pg.get_by_role('button', name='Verify and create account').click()
    pg.wait_for_selector('h1:has-text("Verify your email")', timeout=30000)
    check('account created only after the right code', calls == ['send', 'verify', 'verify', 'confirm'], str(calls))
    check('unverified account lands on "Verify your email", not in the app', pg.locator('.tool').count() == 0 and EMAIL in pg.locator('.login-form').inner_text())
    pg.screenshot(path='tests/out/11_verify.png')

    check('address reset: the next sign-in starts on All tools', '#' not in pg.url, pg.url)
    answers.append('DELETE')
    pg.get_by_role('button', name='Delete this account').click()
    pg.wait_for_selector('h2:has-text("Sign in")', timeout=30000)
    pg.get_by_label('Email').fill(EMAIL); pg.locator('[data-model="login.password"]').fill(PASSWORD)
    pg.get_by_role('button', name='Sign in', exact=True).click(); pg.wait_for_selector('.toast.warn:has-text("not right")', timeout=20000)
    check('test account deleted: it can no longer sign in', True, toast())
    check('no page errors', not errors, str(errors[:3]))
    b.close()
print(f'{sum(checks)}/{len(checks)} checks passed ({EMAIL})')
sys.exit(0 if all(checks) else 1)
