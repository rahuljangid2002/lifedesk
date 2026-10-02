"""Records the LifeDesk demo video in demo mode with the made-up sample data (no real account, no real figures).

    python3 -m http.server 8765                       (in 4-Web-App)
    <venv>/python demo/record_video.py                -> docs/LifeDesk - Demo Video.mp4
    <venv>/python demo/record_video.py budget reports -> re-record only these scenes
    <venv>/python demo/record_video.py --mobile       -> docs/LifeDesk - Demo Video (Mobile).mp4, portrait 1080 x 1920,
                                                         the app in its phone layout

Each scene: narration (macOS voice Samantha, en_US) -> browser recording (Playwright) -> mp4 with voice and captions.
"""
import json, os, shutil, subprocess, sys, time, wave

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

import live

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = '--mobile' in sys.argv  # portrait video of the phone layout
WORK = os.path.join(HERE, 'work_m' if MOBILE else 'work')
OUT = os.path.join(os.path.dirname(HERE), 'docs')
STATE = os.path.join(WORK, 'state.json')
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE, RATE = 'Samantha', '178'  # American English, female
W, H = 1440, 900
MW, MH, MSCALE = 432, 768, 2.5  # phone viewport (9:16); x 2.5 = 1080 x 1920
URL = 'http://localhost:8765/'
DEMO = URL + '?demo=1'
MARK = {}

# A caption bar and a visible pointer, added to every page (the recorder does not draw the mouse).
OVERLAY = """
(() => {
  const add = () => {
    if (document.getElementById('demo-cap')) return;
    const small = window.innerWidth < 600;
    const c = document.createElement('div'); c.id = 'demo-cap';
    c.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);z-index:99999;background:rgba(11,19,36,.93);color:#fff;'
      + 'font:600 ' + (small ? '13px' : '19px') + ' system-ui,-apple-system,sans-serif;padding:' + (small ? '8px 12px' : '11px 22px')
      + ';border-radius:12px;max-width:86vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.35);display:none;bottom:' + (small ? '84px' : '26px');
    document.body.appendChild(c);
    const k = document.createElement('div'); k.id = 'demo-cur';
    k.style.cssText = 'position:fixed;z-index:99998;width:24px;height:24px;border-radius:50%;background:rgba(37,99,235,.28);'
      + 'border:2px solid #2563eb;pointer-events:none;transform:translate(-50%,-50%);left:-60px;top:-60px;transition:left .3s ease,top .3s ease';
    document.body.appendChild(k);
    addEventListener('mousemove', (e) => { k.style.left = e.clientX + 'px'; k.style.top = e.clientY + 'px'; }, true);
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();
"""


def caption(page, text):
    page.evaluate("t => { const c = document.getElementById('demo-cap'); if (c) { c.textContent = t; c.style.display = t ? 'block' : 'none'; } }", text)


def start(page, url, settle=1.5):
    page.goto(url, timeout=60000)
    page.wait_for_load_state('networkidle')
    time.sleep(settle)
    MARK.setdefault('start', time.time())


def nav(page, route, settle=1.0):
    page.evaluate("r => { location.hash = r; }", route)
    time.sleep(settle)


def tap(page, locator, pause=0.5):
    locator.scroll_into_view_if_needed()
    locator.hover()
    time.sleep(0.45)
    locator.click()
    time.sleep(pause)


def scroll(page, total, steps=30, pause=0.05):
    box = page.viewport_size
    page.mouse.move(box['width'] * 0.62, box['height'] * 0.55)
    for _ in range(steps):
        page.mouse.wheel(0, total / steps)
        time.sleep(pause)


def card(name, title, sub, points):
    path = os.path.join(WORK, f'card_{name}.html')
    with open(path, 'w') as f:
        f.write(f"""<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(135deg,#0b1324,#1b2a4a 60%,#2563eb);font-family:system-ui,-apple-system,sans-serif;color:#fff">
<style>@keyframes drift {{ from {{ transform: translateY(0) }} to {{ transform: translateY(-6px) }} }} .mark {{ animation: drift 1.6s ease-in-out infinite alternate }}</style><div style="text-align:center;max-width:980px;padding:0 22px"><div class="mark" style="width:110px;height:110px;border-radius:30px;margin:0 auto 26px;background:linear-gradient(135deg,#1b2a4a,#2563eb);
display:flex;align-items:center;justify-content:center;box-shadow:0 20px 50px rgba(0,0,0,.4)">
<svg width="62" height="62" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4M7.5 11.5l3-3 2.5 2.5 3.5-3.5"/></svg></div>
<h1 style="font-size:clamp(44px,9vw,64px);margin:0 0 10px;letter-spacing:-1px">{title}</h1><p style="font-size:24px;margin:0 0 30px;color:#c7d7fe">{sub}</p>
<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center">{''.join(f'<span style="background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:9px 18px;font-size:18px">{p}</span>' for p in points)}</div></div></body>""")
    return 'file://' + path


# ---------------- scenes ----------------
def s_title(page):
    start(page, card('title', 'LifeDesk', 'One login. Your everyday tools. Money first.',
                     ['Works in any browser', 'Phone and desktop', 'Any currency', 'Encrypted on your device', 'Free to host']), 0.6)
    time.sleep(3)  # the logo moves slightly, so the recorder keeps capturing frames of the card


def s_login(page):
    start(page, URL)
    page.wait_for_selector('.login-form', timeout=30000)
    caption(page, 'Sign in with email and password, or with Google')
    time.sleep(3)
    tap(page, page.get_by_role('button', name='Create an account'))
    caption(page, 'Creating an account: name, email and a password')
    page.get_by_label('Your name').type('Aarav Mehta', delay=55)
    page.get_by_label('Email').type(live.EMAIL, delay=30)
    page.locator('[data-model="login.password"]').type(live.PASSWORD, delay=25)
    tap(page, page.get_by_role('button', name='Send verification code'), 1.2)
    page.wait_for_selector('input.code', timeout=20000)
    caption(page, 'A 6-digit code is emailed and typed here')
    page.locator('input.code').type('482913', delay=200)
    time.sleep(1.2)
    tap(page, page.get_by_role('button', name='Verify and create account'), 1)
    page.wait_for_selector('h2:has-text("Protect your data")', timeout=40000)
    caption(page, 'A data passphrase: your data is encrypted on your device')
    time.sleep(2.5)
    page.locator('[data-model="vault.pass"]').type('river-stone-lantern', delay=45)
    page.locator('[data-model="vault.pass2"]').type('river-stone-lantern', delay=45)
    tap(page, page.get_by_role('button', name='Set passphrase'), 1)
    page.wait_for_selector('#recovery-code', timeout=40000)
    caption(page, 'A recovery code, shown once. Nobody else can read your data, not even the people who run LifeDesk')
    time.sleep(6)


def s_hub(page):
    start(page, DEMO + '#hub')
    caption(page, 'All tools: Money today, renewal reminders next')
    time.sleep(4)
    page.locator('a.tool').first.hover()
    time.sleep(2.5)
    tap(page, page.locator('a.tool').first, 1.2)
    caption(page, 'Money home: this month at a glance')
    time.sleep(3.5)
    scroll(page, 330)
    caption(page, 'Net worth: balance, money owed to you and assets, less loans')
    time.sleep(4)
    scroll(page, 420)
    caption(page, 'Accounts, budget, people and the latest entries')
    time.sleep(3.5)


def s_add(page):
    start(page, DEMO + '#add')
    caption(page, 'Add Entry: seven kinds of entry in one form')
    time.sleep(3)
    amount = page.get_by_label('Amount')
    amount.hover(); amount.click(); page.keyboard.type('450', delay=140)
    desc = page.get_by_label('Description')
    desc.click(); desc.type('Coffee with team', delay=70)
    caption(page, 'The category is suggested from the description')
    time.sleep(2.5)
    tap(page, page.locator('.chip', has_text='Credit Card'))
    caption(page, 'Pick the account and save')
    tap(page, page.get_by_role('button', name='Save Expense'), 2.2)
    caption(page, 'Recent entries: the pencil opens one to change or delete')
    tap(page, page.locator('.row', has_text='Coffee with team').get_by_role('button', name='Edit'), 1.2)
    amount = page.get_by_label('Amount')
    amount.click(); page.keyboard.press('Meta+A'); page.keyboard.type('480', delay=140)
    amount.evaluate('el => el.blur()')
    tap(page, page.get_by_role('button', name='Save changes'), 2.5)


def s_emi(page):
    start(page, DEMO + '#add')
    tap(page, page.locator('.tile-btn[data-type=asset]'), 0.6)
    caption(page, 'Asset: something valuable you bought')
    amount = page.get_by_label('Amount')
    amount.click(); page.keyboard.type('120000', delay=90)
    page.get_by_label('Description').click(); page.keyboard.type('Motorbike', delay=70)
    page.get_by_label('Kind of asset').select_option('Vehicle')
    amount.evaluate('el => el.blur()')
    time.sleep(0.8)
    scroll(page, 330, steps=18)
    tap(page, page.get_by_label('Bought on EMI / finance'), 0.8)
    caption(page, 'Bought on EMI: enter the EMI and the number of months')
    scroll(page, 380, steps=18)
    page.get_by_label('EMI per month').click(); page.keyboard.type('5500', delay=130)
    page.get_by_label('Number of EMIs').click(); page.keyboard.type('24', delay=200)
    page.get_by_label('Number of EMIs').evaluate('el => el.blur()')
    caption(page, 'The interest rate is worked out as you type')
    page.locator('#emi-rate').hover()
    time.sleep(4.5)
    scroll(page, 320, steps=15)
    tap(page, page.get_by_role('button', name='Save EMI purchase'), 2)
    nav(page, 'assets', 1.2)
    caption(page, 'My assets: price, value, the loan left, interest paid and still to pay')
    time.sleep(5)


def s_pay(page):
    start(page, DEMO + '#pay')
    caption(page, 'Payments: every EMI and credit card bill in one place')
    time.sleep(4)
    tap(page, page.locator('.acct-row', has_text='Car (sample)').get_by_role('button'), 2)
    caption(page, 'An EMI you pay is recorded as an expense')
    time.sleep(2)
    tap(page, page.get_by_role('button', name='Pay bill'), 0.8)
    caption(page, 'A card bill, in full or in part')
    time.sleep(1.5)
    tap(page, page.get_by_role('button', name='Pay', exact=True), 2)
    scroll(page, 420)
    caption(page, 'Paid recently')
    time.sleep(3)


def s_daily(page):
    start(page, DEMO + '#daily')
    tap(page, page.get_by_role('button', name='Previous month'), 0.8)
    caption(page, 'Daily Expenses: every entry by date, with the day total')
    time.sleep(3.5)
    scroll(page, 600)
    time.sleep(1.5)
    scroll(page, -600, steps=15, pause=0.03)
    page.locator('[data-model="daily.category"]').hover(); time.sleep(0.4)
    page.locator('[data-model="daily.category"]').select_option(label='Food & Dining')
    caption(page, 'Filter by view, category, account or text')
    time.sleep(4)
    page.locator('[data-model="daily.category"]').select_option('')
    tap(page, page.get_by_role('button', name='All entries'), 2.5)


def s_budget(page):
    start(page, DEMO + '#budget')
    tap(page, page.get_by_role('button', name='Previous month'), 0.8)
    caption(page, 'Budget: one row per category, largest first, with what is left')
    time.sleep(4.5)
    tap(page, page.locator('.budget-row', has_text='Food & Dining').get_by_role('button', name='See entries'), 1)
    caption(page, 'See entries: the expenses behind a category')
    time.sleep(4)
    tap(page, page.locator('.budget-row', has_text='Food & Dining').get_by_role('button', name='Hide entries'), 0.6)
    box = page.get_by_label('Budget for Food & Dining')
    box.hover(); box.click(); page.keyboard.press('Meta+A'); page.keyboard.type('5000', delay=150)
    box.evaluate('el => el.blur()')
    caption(page, 'Change an amount: a bar offers to save')
    time.sleep(2.5)
    tap(page, page.locator('.savebar').get_by_role('button', name='Save budget'), 2.5)


def s_dash(page):
    start(page, DEMO + '#insights')
    tap(page, page.get_by_role('button', name='Previous month'), 0.8)
    caption(page, 'Monthly dashboard: income, expense and savings against last month')
    time.sleep(4.5)
    scroll(page, 430)
    caption(page, 'Spend by category, and budget against actual')
    time.sleep(4)
    scroll(page, 560)
    day = page.locator('.chart-card', has_text='Daily spend').locator('.hit').nth(1)
    day.hover(force=True)
    caption(page, 'Daily spend: point at a bar for its figure')
    time.sleep(3.5)
    scroll(page, -1100, steps=20, pause=0.03)
    tap(page, page.get_by_role('button', name='Yearly', exact=True), 1)
    caption(page, 'Yearly: income against expense, and the net balance trend')
    time.sleep(3)
    scroll(page, 520)
    time.sleep(3.5)
    scroll(page, -600, steps=15, pause=0.03)
    tap(page, page.get_by_role('button', name='Balances', exact=True), 1)
    caption(page, 'Balances: by account, by card and by person, with net worth')
    time.sleep(3)
    tap(page, page.get_by_role('button', name='Loans & assets'), 1)
    caption(page, 'Loans and assets: principal, interest paid and interest still to pay')
    time.sleep(3.5)
    scroll(page, 560)
    time.sleep(3)


def s_reports(page):
    start(page, DEMO + '#reports')
    caption(page, 'Reports: 18 tables with totals')
    time.sleep(3.5)
    page.locator('[data-model="reports.id"]').hover(); time.sleep(0.4)
    page.locator('[data-model="reports.id"]').select_option('spend-by-category')
    page.locator('[data-model="reports.preset"]').select_option('last-month')
    caption(page, 'Choose a report and a period')
    time.sleep(4)
    page.locator('[data-model="reports.id"]').select_option('category-by-month')
    caption(page, 'Category by month, for the year')
    time.sleep(4)
    page.get_by_role('button', name='Download CSV').hover()
    caption(page, 'Download CSV opens in any spreadsheet')
    time.sleep(3.5)


def s_people(page):
    start(page, DEMO + '#people')
    caption(page, 'People & Loans: who owes you, and whom you owe')
    time.sleep(3.5)
    tap(page, page.locator('.p-head', has_text='Alex'), 1)
    caption(page, 'Open a person for quick actions and their history')
    time.sleep(3)
    tap(page, page.get_by_role('button', name='Got money back'), 0.8)
    box = page.locator('.person .amount input')
    box.click(); page.keyboard.press('Meta+A'); page.keyboard.type('1000', delay=150)
    tap(page, page.locator('.person .form').get_by_role('button', name='Save'), 2.5)
    tap(page, page.get_by_role('button', name='I owe', exact=True), 2.5)


def s_accounts(page):
    start(page, DEMO + '#accounts')
    caption(page, 'My Accounts: cash and bank, wallets, credit cards')
    time.sleep(6)


def s_settings(page):
    start(page, DEMO + '#more')
    caption(page, 'Account: appearance, privacy, currency, categories, backup and sample data')
    time.sleep(3.5)
    tap(page, page.get_by_role('button', name='Dark', exact=True), 1.5)
    caption(page, 'Light, dark, or follow the device')
    nav(page, 'insights', 2.8)
    nav(page, 'more', 1)
    tap(page, page.get_by_role('button', name='Light', exact=True), 1)
    page.locator('[data-currency]').hover(); time.sleep(0.4)
    page.locator('[data-currency]').select_option('USD')
    caption(page, 'Change currency: convert every amount at today\'s rate, or keep the numbers')
    time.sleep(5)
    tap(page, page.get_by_role('button', name='Cancel'), 1)


def s_mobile(page):
    start(page, DEMO + '#home')
    caption(page, 'On a phone: the same app, with a bottom bar')
    time.sleep(3.5)
    scroll(page, 500, steps=25)
    time.sleep(1.5)
    tap(page, page.locator('.tabbar a', has_text='Add'), 2.5)
    tap(page, page.locator('.tabbar a', has_text='Daily'), 2.5)
    nav(page, 'insights', 1.5)
    caption(page, 'Dashboards on the phone')
    scroll(page, 700, steps=35)
    time.sleep(2.5)


def s_outro(page):
    start(page, card('outro', 'LifeDesk', 'All your money, in one place. More tools on the way.',
                     ['rahuljangid2002.github.io/lifedesk', 'Add to Home screen on your phone', 'Encrypted: only you can read your data']), 0.6)
    time.sleep(3)


SCENES = [
    ('title', s_title, 'card', "This is LifeDesk: one login for your everyday tools. The first tool is Money, a personal finance app that runs in any browser, on a phone or a desktop, in any currency. Everything in this demo is made-up sample data."),
    ('login', s_login, 'login', "You sign in with an email and password, or with Google. A new account confirms its email with a six digit code. Then you choose a data passphrase. Your data is encrypted on your own device before it is saved, so nobody else can read it, not even the people who run LifeDesk. You also get a recovery code, shown once, in case you forget the passphrase."),
    ('hub', s_hub, 'app', "After signing in, you land on All tools. Money is ready today, and renewal reminders are next. Money home shows this month's income, expense and net balance. Below that is your net worth: your balance, plus money owed to you and your assets, less your loans. Then your accounts, the budget, people, and the latest entries."),
    ('add', s_add, 'app', "Add Entry handles eight kinds of entry in one form. Type the amount and a description, and the category is filled in for you, from keywords and from what you chose before. Pick the account, and save. Every recent entry has a pencil, so a mistake can be corrected, or deleted, and all balances follow."),
    ('emi', s_emi, 'app', "When you buy something valuable, choose Asset. If you bought it on E M I, tick the box and enter the E M I and the number of months. The interest rate is worked out as you type. Saving creates the asset and its loan. My assets then shows what each thing cost, what it is worth, the loan left, and the interest paid and still to pay."),
    ('pay', s_pay, 'app', "The Payments screen puts every E M I and credit card bill in one place. Paying an E M I records it as an expense. A card bill can be paid in full, or in part, and everything paid is listed below."),
    ('daily', s_daily, 'app', "Daily Expenses lists every entry date by date, with the total for each day, the average per day and the highest day. You can filter by category, account or text, or switch between spending, income and all entries."),
    ('budget', s_budget, 'app', "The Budget screen has one row for each category, with the largest first, showing what is spent and what is left. See entries opens the expenses behind a category. When you change an amount, a bar offers to save it."),
    ('dash', s_dash, 'app', "Dashboards turn the entries into pictures. The monthly dashboard compares income, expense and savings with last month, and shows spend by category, budget against actual, and spend for each day. The yearly dashboard shows income against expense, and the net balance trend. Balances shows every account, card and person. Loans and assets shows what is still owed, and how much of it is interest."),
    ('reports', s_reports, 'app', "There are eighteen reports. Choose a report and a period, such as last month or the whole year. Each report is a table with totals, and it can be downloaded as a file that opens in any spreadsheet."),
    ('people', s_people, 'app', "People and Loans shows who owes you, and whom you owe. Open a person to record money returned, or lent again, in one step, and to see the full history."),
    ('accounts', s_accounts, 'app', "My Accounts lists cash and bank accounts, wallets and credit cards, each with its balance."),
    ('settings', s_settings, 'app', "Under Account, you choose light or dark, or let the app follow your device. You can change your currency, and either convert every amount at today's exchange rate, or keep the numbers as they are. You can also add categories, download a backup, and load or remove the sample data."),
    ('mobile', s_mobile, 'phone', "On a phone, it is the same app with a bar at the bottom. Add it to the home screen, and it opens like any other app."),
    ('outro', s_outro, 'card', "That is LifeDesk. Your data is encrypted and private to you, and it is free to host. Thank you for watching."),
]


def audio(name, text):
    path = os.path.join(WORK, f'{name}.wav')
    subprocess.run(['say', '-v', VOICE, '-r', RATE, '--data-format=LEI16@22050', '-o', path, text], check=True)
    with wave.open(path) as a:
        return path, a.getnframes() / a.getframerate()


def prepare(pw):
    """Demo mode with rupees and the sample data, saved once and reused by every scene."""
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={'width': W, 'height': H})
    pg = ctx.new_page()
    pg.on('dialog', lambda d: d.accept())
    pg.goto(DEMO); pg.wait_for_selector('#welcome-currency')
    pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(DEMO + '#more'); pg.get_by_role('button', name='Load sample data').click()
    pg.wait_for_selector('button:has-text("Remove sample data")'); time.sleep(4)
    ctx.storage_state(path=STATE)
    b.close()


def record(pw, name, fn, kind):
    vw, vh = (MW, MH) if MOBILE else (390, 844) if kind == 'phone' else (W, H)
    out_w, out_h = vw, vh  # the recorder captures CSS pixels and never enlarges; the mobile cut is upscaled by ffmpeg
    browser = pw.chromium.launch()
    vdir = os.path.join(WORK, f'v_{name}')
    shutil.rmtree(vdir, ignore_errors=True)
    ctx = browser.new_context(viewport={'width': vw, 'height': vh}, record_video_dir=vdir, record_video_size={'width': out_w, 'height': out_h}, device_scale_factor=MSCALE if MOBILE else 1,
                              storage_state=STATE if kind in ('app', 'phone') else None, color_scheme='light')
    ctx.add_init_script(OVERLAY)
    if kind == 'login':
        # the code email is not really sent in the demo: the code service is answered here, and a throw-away
        # account is created so the real passphrase screens can be shown (deleted again in main)
        ctx.add_init_script(live.FLAGS)
        live.answer_codes(ctx)
    t0 = time.time()
    page = ctx.new_page()
    page.on('dialog', lambda d: d.accept())
    MARK.clear()
    fn(page)
    end = time.time() - t0
    begin = MARK.get('start', time.time()) - t0
    page.close(); ctx.close(); browser.close()
    webm = [os.path.join(vdir, f) for f in os.listdir(vdir) if f.endswith('.webm')][0]
    return webm, begin, end


def build(name, webm, begin, end, apath, alen, kind):
    shown = end - begin
    speed = min(1.6, max(1.0, shown / (alen + 1.5)))  # page work is slower than the voice: play it a little faster
    dur = max(alen + 1.2, shown / speed)
    sp = f'setpts=(PTS-STARTPTS)/{speed:.3f},'
    if MOBILE:
        vf = f'scale=1080:1920:flags=lanczos,{sp}fps=30,tpad=stop_mode=clone:stop_duration=30'
    elif kind == 'phone':
        vf = f'scale=-2:{H - 56},pad={W}:{H}:(ow-iw)/2:28:color=0xF4F5F7,{sp}fps=30,tpad=stop_mode=clone:stop_duration=30'
    else:
        vf = f'{sp}fps=30,tpad=stop_mode=clone:stop_duration=30'
    out = os.path.join(WORK, f'{name}.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-ss', f'{begin:.2f}', '-i', webm, '-i', apath,
                    '-filter_complex', f'[0:v]{vf}[v];[1:a]adelay=500|500,apad,aresample=44100[a]', '-map', '[v]', '-map', '[a]',
                    '-t', f'{dur:.2f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', out], check=True)
    return dur


def main():
    os.makedirs(WORK, exist_ok=True); os.makedirs(OUT, exist_ok=True)
    only = set(a for a in sys.argv[1:] if not a.startswith('--'))
    scenes = [x for x in SCENES if not (MOBILE and x[0] == 'mobile')]  # the phone scene is the whole video here
    total = 0
    with sync_playwright() as pw:
        prepare(pw)
        for name, fn, kind, text in scenes:
            mp4 = os.path.join(WORK, f'{name}.mp4')
            if only and name not in only and os.path.exists(mp4):
                continue
            apath, alen = audio(name, text)
            webm, begin, end = record(pw, name, fn, kind)
            dur = build(name, webm, begin, end, apath, alen, kind)
            total += dur
            print(f'{name}: voice {alen:.1f}s, shown {end - begin:.1f}s, scene {dur:.1f}s', flush=True)
            if kind == 'login':
                print('throw-away account deleted:', live.cleanup(), flush=True)
    for name, *_ in scenes:
        probe = subprocess.run([FFMPEG, '-i', os.path.join(WORK, name + '.mp4')], capture_output=True, text=True).stderr
        if 'Video:' not in probe:
            raise SystemExit(f'scene {name} has no picture; not joining')
    lst = os.path.join(WORK, 'list.txt')
    with open(lst, 'w') as f:
        for name, *_ in scenes:
            f.write(f"file '{os.path.join(WORK, name + '.mp4')}'\n")
    final = os.path.join(OUT, 'LifeDesk - Demo Video (Mobile).mp4' if MOBILE else 'LifeDesk - Demo Video.mp4')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', final], check=True)
    print('video', final)


if __name__ == '__main__':
    main()
