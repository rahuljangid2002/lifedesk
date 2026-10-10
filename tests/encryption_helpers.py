"""Shared pieces for tests that use a throw-away account on the real Firebase project (see tests/encryption.py)."""
import json, time, urllib.request, urllib.error

URL = 'http://localhost:8765/'
OTP = 'http://localhost:8765/__otp'
KEY = 'AIzaSyCV6JwF2Unc3QljVGBa1Mff8SCiVSzIUIc'
DOCS = 'https://firestore.googleapis.com/v1/projects/lifedesk-43dc1/databases/default/documents'


def rest(url, body=None, token=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        text = urllib.request.urlopen(req).read().decode()
        return 200, json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as e:
        return e.code, {}


def plain(v):
    """Firestore's typed JSON to plain values."""
    if 'stringValue' in v: return v['stringValue']
    if 'booleanValue' in v: return v['booleanValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return v['doubleValue']
    if 'arrayValue' in v: return [plain(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v: return {k: plain(x) for k, x in v['mapValue'].get('fields', {}).items()}
    return None


def stand_in(route):
    req = json.loads(route.request.post_data or '{}')
    ok = req.get('action') != 'verify' or req.get('code') == '123456'
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': ok, **({} if ok else {'error': 'wrong'})}))


def device(browser, notifications=False, profile=None):
    """browser: a launched browser, or (with profile = a folder) the Playwright chromium type for a normal,
    non-incognito profile – Chrome refuses push notifications in incognito, which is what new_context gives."""
    ctx = browser.launch_persistent_context(profile, headless=False, viewport={'width': 390, 'height': 844}) if profile else browser.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(f"localStorage.setItem('lifedesk-otp-endpoint', '{OTP}'); localStorage.setItem('lifedesk-test-verified', '1');")
    ctx.route(OTP, stand_in)
    if notifications:
        ctx.grant_permissions(['notifications'], origin=URL.rstrip('/'))
    page = ctx.new_page()
    page.errors = []
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: page.errors.append(str(e)))
    page.on('dialog', lambda d: d.accept('DELETE') if d.type == 'prompt' else d.accept())
    return page


def sign_up(pg, email, password, phrase):
    """New account → passphrase → recovery code saved → currency: ends on All tools."""
    pg.goto(URL); pg.wait_for_selector('.login-form'); pg.get_by_role('button', name='Create an account').click()
    pg.get_by_label('Your name').fill('Test User'); pg.get_by_label('Email').fill(email); pg.locator('[data-model="login.password"]').fill(password)
    pg.get_by_role('button', name='Send verification code').click(); pg.wait_for_selector('input.code')
    pg.locator('input.code').fill('123456'); pg.get_by_role('button', name='Verify and create account').click()
    pg.wait_for_selector('h2:has-text("Protect your data")', timeout=40000)
    pg.locator('[data-model="vault.pass"]').fill(phrase); pg.locator('[data-model="vault.pass2"]').fill(phrase); pg.get_by_role('button', name='Set passphrase').click()
    pg.wait_for_selector('#recovery-code', timeout=40000)
    pg.get_by_label('I have saved this code somewhere safe').check(); pg.get_by_role('button', name='Continue').click()
    pg.wait_for_selector('#welcome-currency', timeout=40000); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool', timeout=40000)
