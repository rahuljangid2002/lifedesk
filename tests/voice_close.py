"""Closing the voice sheet without its Close button, in demo mode with stand-ins for listening and speaking:
a tap outside the sheet, the phone's (browser's) Back button, and Escape; and that the browser history is left as it was.

    tools/serve_dev.py                 (serves 4-Web-App on 127.0.0.1:8765)
    <venv with playwright>/python tests/voice_close.py
"""
import time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/?demo=1'
checks = []

STAND_IN = """
window.__say = []; window.__spoken = [];
class FakeRecognition {
    start() { setTimeout(() => this.onstart && this.onstart(), 20); this._t = setTimeout(() => {
        const text = window.__say.shift();
        if (text === undefined || text === '') { return; }   // keeps "listening", like a quiet room
        const result = [{ transcript: text }]; result.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [result] });
        this.onend && this.onend();
    }, 120); }
    stop() { clearTimeout(this._t); window.__stopped = (window.__stopped || 0) + 1; this.onend && this.onend(); }
    abort() { clearTimeout(this._t); window.__stopped = (window.__stopped || 0) + 1; }
}
window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 40); } } });
"""


def check(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, '' if ok else detail)


def run(p, width, height, label):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': width, 'height': height}); ctx.add_init_script(STAND_IN)
    pg = ctx.new_page(); errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    db = lambda: pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo'))")
    route = lambda: pg.evaluate('location.hash')
    is_open = lambda: pg.locator('.voice').count() == 1
    def open_sheet():
        pg.locator('.shortcut', has_text='Voice entry').click(); pg.wait_for_selector('.voice'); time.sleep(0.6)

    pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click(); pg.get_by_label('Name').fill('HDFC Bank'); pg.get_by_label('Opening balance').fill('10000')
    pg.get_by_label('Use as my default account').check(); pg.get_by_role('button', name='Save').click(); time.sleep(0.4)
    pg.goto(URL + '#daily'); pg.wait_for_selector('.hero')
    pg.goto(URL + '#home'); pg.wait_for_selector('.shortcut'); n = len(db()['entries'])

    # a tap outside the sheet
    open_sheet()
    pg.mouse.click(12, 12); time.sleep(0.5)
    check(f'{label}: a tap outside the sheet closes it, and the screen underneath stays', not is_open() and route() == '#home', route())
    check(f'{label}: …and listening has stopped', pg.evaluate('window.__stopped || 0') >= 1)
    # a tap inside the sheet does not close it
    open_sheet()
    pg.locator('.voice h3').click(); time.sleep(0.3)
    check(f'{label}: a tap inside the sheet keeps it open', is_open())
    # the phone's Back button
    pg.go_back(); time.sleep(0.5)
    check(f'{label}: Back closes the sheet and stays on the same screen', not is_open() and route() == '#home', route())
    pg.go_back(); time.sleep(0.6)
    check(f'{label}: the next Back goes to the screen before, as usual (nothing left behind in the history)', route() == '#daily', route())
    pg.go_forward(); time.sleep(0.6); pg.wait_for_selector('.shortcut')
    # Escape
    open_sheet()
    pg.keyboard.press('Escape'); time.sleep(0.5)
    check(f'{label}: Escape closes the sheet', not is_open() and route() == '#home')
    # the Close button still works, and leaves the history clean
    open_sheet()
    pg.get_by_role('button', name='Close').click(); time.sleep(0.5)
    pg.go_back(); time.sleep(0.6)
    check(f'{label}: Close, then Back: goes to the screen before', not is_open() and route() == '#daily', route())
    pg.go_forward(); time.sleep(0.6); pg.wait_for_selector('.shortcut')
    # a tap outside while an entry waits to be confirmed: nothing is stored
    pg.evaluate("window.__say = ['Spent 450 on groceries from HDFC']")
    open_sheet(); pg.wait_for_selector('.voice-review'); time.sleep(0.3)
    pg.mouse.click(12, 12); time.sleep(0.5)
    check(f'{label}: closing by a tap outside while an entry waits: nothing is stored', not is_open() and len(db()['entries']) == n)
    # saving by voice gives the history step back too
    pg.evaluate("window.__say = ['Spent 450 on groceries from HDFC']")
    open_sheet(); pg.wait_for_selector('.voice-review'); time.sleep(0.3)
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_selector('.toast'); time.sleep(0.5)
    check(f'{label}: Save still stores the entry and closes the sheet', not is_open() and len(db()['entries']) == n + 1 and route() == '#home')
    pg.go_back(); time.sleep(0.6)
    check(f'{label}: …and Back afterwards goes to the screen before', route() == '#daily', route())
    check(f'{label}: no errors in the console', not errors, str(errors[:3]))
    b.close()

    # a browser that cannot listen: "Type the entry" closes the sheet and opens the form; Back returns to where it was
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': width, 'height': height})
    ctx.add_init_script('delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, "SpeechRecognition", {value: undefined}); Object.defineProperty(window, "webkitSpeechRecognition", {value: undefined});')
    pg = ctx.new_page()
    pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(URL + '#home'); pg.wait_for_selector('.shortcut')
    pg.locator('.shortcut', has_text='Voice entry').click(); pg.wait_for_selector('.voice'); time.sleep(0.4)
    pg.get_by_role('link', name='Type the entry').click(); time.sleep(0.8)
    check(f'{label}: "Type the entry" closes the sheet and opens the form', pg.locator('.voice').count() == 0 and pg.evaluate('location.hash') == '#add', pg.evaluate('location.hash'))
    pg.go_back(); time.sleep(0.6)
    check(f'{label}: …and Back from the form returns to Home', pg.evaluate('location.hash') == '#home', pg.evaluate('location.hash'))
    pg.locator('.shortcut', has_text='Voice entry').click(); pg.wait_for_selector('.voice'); time.sleep(0.5)
    pg.mouse.click(12, 12); time.sleep(0.5)
    check(f'{label}: the "not available" sheet also closes with a tap outside', pg.locator('.voice').count() == 0)
    b.close()


with sync_playwright() as p:
    run(p, 390, 844, 'phone')
    run(p, 1280, 800, 'desktop')

print(f'\n{sum(checks)}/{len(checks)} passed')
raise SystemExit(0 if all(checks) else 1)
