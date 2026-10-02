"""End-to-end check of the encryption against the real Firebase project, from localhost.

It signs up a throw-away account (example.com; the email-code service is replaced by a stand-in and, on localhost
only, the app is told to treat the account as verified), sets a passphrase, saves data, and then reads the database
directly over Google's REST API, the way an administrator would, to confirm that only unreadable text is stored.
It also checks a second device, a wrong passphrase, the recovery code, older unencrypted data, and deletes the account.

Needs the database rules that let a not-yet-verified account store its own data (the ones published on 2 Oct 2026);
with the stricter rules from PENDING-STEPS.txt this test cannot save and will stop at the first data step.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/encryption.py
"""
import json, sys, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/'
OTP = 'http://localhost:8765/__otp'
KEY = 'AIzaSyCV6JwF2Unc3QljVGBa1Mff8SCiVSzIUIc'
DOCS = 'https://firestore.googleapis.com/v1/projects/lifedesk-43dc1/databases/default/documents'
EMAIL = f'selftest.enc.{int(time.time())}@example.com'
PASSWORD = 'Login-' + str(int(time.time()))[-6:] + '-pw'
PHRASE, PHRASE2 = 'correct horse battery', 'a brand new phrase 42'
checks = []


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


def rest(url, body=None, token=None, method=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    try:
        text = urllib.request.urlopen(req).read().decode()
        return 200, json.loads(text) if text.strip() else {}
    except urllib.error.HTTPError as e:
        return e.code, {}


def stand_in(route):
    req = json.loads(route.request.post_data or '{}')
    ok = req.get('action') != 'verify' or req.get('code') == '123456'
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': ok, **({} if ok else {'error': 'wrong'})}))


def device(browser):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(f"localStorage.setItem('lifedesk-otp-endpoint', '{OTP}'); localStorage.setItem('lifedesk-test-verified', '1');")
    ctx.route(OTP, stand_in)
    page = ctx.new_page()
    page.on('dialog', lambda d: d.accept('DELETE') if d.type == 'prompt' else d.accept())
    return page


def sign_in(page):
    page.goto(URL); page.wait_for_selector('.login-form')
    page.get_by_label('Email').fill(EMAIL); page.locator('[data-model="login.password"]').fill(PASSWORD)
    page.get_by_role('button', name='Sign in', exact=True).click()


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = device(b)
    toast = lambda page: page.locator('.toast').last.inner_text() if page.locator('.toast').count() else ''

    # sign up, then the passphrase
    pg.goto(URL); pg.wait_for_selector('.login-form'); pg.get_by_role('button', name='Create an account').click()
    pg.get_by_label('Your name').fill('Enc Test'); pg.get_by_label('Email').fill(EMAIL); pg.locator('[data-model="login.password"]').fill(PASSWORD)
    pg.get_by_role('button', name='Send verification code').click(); pg.wait_for_selector('input.code')
    pg.locator('input.code').fill('123456'); pg.get_by_role('button', name='Verify and create account').click()
    pg.wait_for_selector('h2:has-text("Protect your data")', timeout=40000)
    check('new account is asked for a data passphrase before anything else', pg.locator('.tool').count() == 0)
    pg.locator('[data-model="vault.pass"]').fill(PHRASE); pg.locator('[data-model="vault.pass2"]').fill('something else'); pg.get_by_role('button', name='Set passphrase').click()
    pg.wait_for_selector('.toast.warn'); check('two different passphrases are refused', 'not the same' in toast(pg), toast(pg))
    pg.locator('[data-model="vault.pass2"]').fill(PHRASE); pg.get_by_role('button', name='Set passphrase').click()
    pg.wait_for_selector('#recovery-code', timeout=40000)
    code = pg.locator('#recovery-code').inner_text()
    check('recovery code shown; Continue waits until it is marked as saved', len(code.replace('-', '')) == 20 and pg.get_by_role('button', name='Continue').is_disabled(), code[:4] + '-…')
    pg.get_by_label('I have saved this code somewhere safe').check(); pg.get_by_role('button', name='Continue').click()
    pg.wait_for_selector('#welcome-currency', timeout=40000); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool', timeout=40000)
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click()
    pg.get_by_label('Name').fill('Secret Bank'); pg.get_by_label('Opening balance').fill('4321'); pg.get_by_role('button', name='Save').click()
    pg.wait_for_selector('.acct-row:has-text("Secret Bank")', timeout=30000); time.sleep(2)

    # what an administrator sees in the database
    _, auth = rest(f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}', {'email': EMAIL, 'password': PASSWORD, 'returnSecureToken': True})
    token, uid = auth['idToken'], auth['localId']
    # the ids of what the app holds, then each document fetched straight from the database
    ids = pg.evaluate("import('./js/store.js').then(S => Object.fromEntries(['accounts', 'categories', 'settings'].map(c => [c, S.data[c].map(d => d.id)])))")
    stored = {c: [rest(f'{DOCS}/users/{uid}/{c}/{i}', token=token)[1] for i in ids[c]] for c in ids}
    docs = [d for c in stored.values() for d in c]
    raw = json.dumps(stored)
    check('database: every document holds one field, "enc", and nothing else', len(docs) >= 29 and all(list(d.get('fields', {}).keys()) == ['enc'] for d in docs), f'{len(docs)} documents')
    leaks = [w for w in ['Secret Bank', '4321', 'Cash', 'Groceries', 'Salary', 'bank', 'keywords', 'currency', 'USD', 'INR'] if w in raw]
    check('database: no name, amount, category or setting is readable', len(raw) > 5000 and not leaks, f'{len(raw)} characters examined, found {leaks}')
    _, vault = rest(f'{DOCS}/users/{uid}/vault/key', token=token)
    vraw = json.dumps(vault)
    check('database: the key is stored only locked (salt + wrapped key), never the passphrase or recovery code', PHRASE not in vraw and code not in vraw and code.replace('-', '') not in vraw and set(vault['fields'].keys()) == {'v', 'iterations', 'pass', 'recovery'}, str(sorted(vault['fields'].keys())))
    encs = [d['fields']['enc']['stringValue'] for d in docs]
    check('database: every document is encrypted with its own random IV', len(set(e.split('.')[0] for e in encs)) == len(encs))

    # the same device is not asked again; a second device is
    pg.reload(); pg.wait_for_selector('.acct-row:has-text("Secret Bank")', timeout=40000)
    check('same device: opens without asking for the passphrase again', pg.locator('h2:has-text("Unlock your data")').count() == 0)
    p2 = device(b); sign_in(p2); p2.wait_for_selector('h2:has-text("Unlock your data")', timeout=40000)
    check('second device: data stays locked until the passphrase is entered', p2.locator('.tool').count() == 0)
    p2.locator('[data-model="vault.pass"]').fill('not the passphrase'); p2.get_by_role('button', name='Unlock', exact=True).click()
    p2.wait_for_selector('.toast.warn', timeout=40000); check('second device: a wrong passphrase is refused', 'not right' in toast(p2) and p2.locator('.tool').count() == 0, toast(p2))
    p2.locator('[data-model="vault.pass"]').fill(PHRASE); p2.get_by_role('button', name='Unlock', exact=True).click()
    p2.wait_for_selector('.tool', timeout=40000); p2.goto(URL + '#accounts'); p2.wait_for_selector('.acct-row:has-text("Secret Bank")', timeout=30000)
    check('second device: the right passphrase shows the data', '4,321' in p2.locator('.acct-row', has_text='Secret Bank').inner_text())

    # forgotten passphrase: recovery code
    p2.goto(URL + '#more'); p2.get_by_role('button', name='Lock this device').click(); p2.wait_for_selector('h2:has-text("Unlock your data")', timeout=20000)
    p2.get_by_role('button', name='Forgot it? Use your recovery code').click()
    p2.get_by_label('Recovery code').fill('AAAA-BBBB-CCCC-DDDD-EEEE'); p2.locator('[data-model="vault.pass"]').fill(PHRASE2); p2.locator('[data-model="vault.pass2"]').fill(PHRASE2)
    p2.get_by_role('button', name='Unlock and set new passphrase').click(); p2.wait_for_selector('.toast.warn:has-text("recovery code")', timeout=40000)
    check('recovery: a wrong code is refused', p2.locator('.tool').count() == 0, toast(p2))
    p2.get_by_label('Recovery code').fill(code.lower().replace('-', ' ')); p2.get_by_role('button', name='Unlock and set new passphrase').click()
    p2.wait_for_selector('.tool', timeout=40000); p2.goto(URL + '#accounts'); p2.wait_for_selector('.acct-row:has-text("Secret Bank")', timeout=30000)
    check('recovery: the code (typed in lower case with spaces) opens the data and sets a new passphrase', True)
    p3 = device(b); sign_in(p3); p3.wait_for_selector('h2:has-text("Unlock your data")', timeout=40000)
    p3.locator('[data-model="vault.pass"]').fill(PHRASE); p3.get_by_role('button', name='Unlock', exact=True).click(); p3.wait_for_selector('.toast.warn', timeout=40000)
    old_refused = p3.locator('.tool').count() == 0
    p3.locator('[data-model="vault.pass"]').fill(PHRASE2); p3.get_by_role('button', name='Unlock', exact=True).click(); p3.wait_for_selector('.tool', timeout=40000)
    check('recovery: afterwards the old passphrase is refused and the new one works', old_refused)

    # data saved before encryption existed is encrypted the first time it is opened
    rest(f'{DOCS}/users/{uid}/accounts?documentId=legacy', {'fields': {'name': {'stringValue': 'Old Plain Bank'}, 'kind': {'stringValue': 'bank'}, 'opening': {'integerValue': '77'}, 'active': {'booleanValue': True}}}, token)
    p3.goto(URL + '#accounts'); p3.wait_for_selector('.acct-row:has-text("Old Plain Bank")', timeout=30000); time.sleep(3)
    _, legacy = rest(f'{DOCS}/users/{uid}/accounts/legacy', token=token)
    check('older unencrypted data is shown, and encrypted in the database once opened', list(legacy['fields'].keys()) == ['enc'], str(list(legacy['fields'].keys())))

    # clean up
    p3.goto(URL + '#more'); p3.get_by_role('button', name='Delete my account and data').click(); p3.wait_for_selector('.login-form', timeout=40000)
    code_after = rest(f'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}', {'email': EMAIL, 'password': PASSWORD, 'returnSecureToken': True})[0]
    left = rest(f'{DOCS}/users/{uid}/accounts?pageSize=5', token=token)[1].get('documents', [])
    check('test account, its data and its key are deleted', code_after != 200 and not left and rest(f'{DOCS}/users/{uid}/vault/key', token=token)[0] != 200, f'sign-in {code_after}')
    b.close()
print(f'{sum(checks)}/{len(checks)} checks passed ({EMAIL})')
sys.exit(0 if all(checks) else 1)
