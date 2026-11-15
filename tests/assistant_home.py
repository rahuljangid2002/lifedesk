"""Assistant (money check-up, suggestions, questions), the Money health tile, the six-month averages with "% so far" and
quick add on Home - in demo mode with the sample data.

    python3 tools/serve_dev.py        (in 4-Web-App)
    <venv with playwright>/python tests/assistant_home.py [output folder for screenshots]
"""
import json, os, re, sys, time
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
    pg = b.new_page(viewport={'width': 1680, 'height': 1000})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('dialog', lambda d: d.accept()); pg.add_init_script("new MutationObserver(() => { const b = document.querySelector('.ask-layer:not(.closing) .ask-ok'); if (b && !b.dataset.auto) { b.dataset.auto = '1'; setTimeout(() => b.click(), 30); } }).observe(document, { childList: true, subtree: true })")  # the app's own glass confirm dialog: press OK
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.goto(URL)
    pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    shot = lambda n: pg.screenshot(path=os.path.join(OUT, n + '.png'), full_page=True)
    demo = lambda js: pg.evaluate(f"(() => {{ const s = JSON.parse(localStorage.getItem('lifedesk-demo')); return {js}; }})()")

    # ---------- the rules on their own ----------
    topics = pg.evaluate("""import('./js/assistant.js').then((A) => ['Give me a complete summary', 'What should I do this month?', 'Where is my money going?', 'Am I within budget?',
        'How much am I saving?', 'How is my net worth changing?', 'Are my EMIs too high?', 'Should I prepay loans or invest?', 'Which bills are due?', 'Who owes me money?',
        'Is my portfolio too risky?', 'Which investments are doing best and worst?', 'Am I investing enough?', 'What about tax on my gains?', 'hello'].map(A.topicOf))""")
    check('questions go to the right topic', topics == ['summary', 'todo', 'spending', 'budget', 'saving', 'networth', 'emi', 'loans', 'bills', 'people',
        'investments-risk', 'investments-performance', 'investments-enough', 'investments-tax', 'help'], json.dumps(topics))
    empty = pg.evaluate("""Promise.all([import('./js/assistant.js'), import('./js/logic.js')]).then(([A, L]) => {
        const data = { accounts: [], categories: [], entries: [], people: [], budgets: [], loans: [], assets: [], reminders: [], investments: [], invTxns: [], sips: [], goals: [], bills: [], trips: [] };
        const r = A.checkup(data, L.isoDate(), {});
        return { areas: r.areas.length, score: r.score, keys: r.tips.map((t) => t.key) };
    })""")
    check('with no data: 5 areas, a score, and "set a budget" / "start investing"', empty['areas'] == 5 and 10 <= empty['score'] <= 100 and 'budget-set' in empty['keys'] and 'invest-none' in empty['keys'], json.dumps(empty))

    # ---------- sample data ----------
    pg.goto(URL + '#more'); time.sleep(0.4); pg.get_by_role('button', name='Load sample data').click(); time.sleep(4)

    # ---------- Assistant ----------
    pg.goto(URL + '#assistant'); time.sleep(1)
    score = int(pg.locator('.as-hero .as-ring b').inner_text())
    check('Assistant shows the money health score', 10 <= score <= 100, str(score))
    check('five areas, each with a score', pg.locator('.as-area').count() == 5)
    check('Top 3 for today', pg.locator('.as-tips').first.locator('.as-rank').count() == 3)
    check('the card owed on the sample card is the first thing to do', 'credit card' in pg.locator('.as-tip .as-rank').first.locator('xpath=..').inner_text().lower())
    shot('a1_assistant')
    pg.locator('.as-area', has_text='Debt & cards').click(); time.sleep(0.3)
    areas = set(pg.locator('.as-tip .as-tag').all_inner_texts())
    check('an area card shows only its suggestions', all(a.lower().startswith('debt & cards') for a in areas) and len(areas) > 0, str(areas))
    pg.locator('.as-area', has_text='Debt & cards').click(); time.sleep(0.3)
    first = pg.locator('.as-tip').nth(4).locator('b').first.inner_text()
    n_before = pg.locator('.as-tip').count()
    pg.locator('.as-tip').nth(4).get_by_role('button', name='✓ Done').click(); time.sleep(0.3)
    check('Done hides a suggestion for today', pg.locator('.as-tip').count() == n_before - 1 or pg.locator('.as-tip', has_text=first).count() < 2, first)
    pg.reload(); time.sleep(1)
    check('…and stays done after reloading', 'Show done (1)' in pg.locator('.as-list-head').inner_text())
    pg.locator('.pill-btn', has_text='Give me a complete summary').click(); time.sleep(0.3)
    check('a question gets an answer from the rules', pg.locator('.as-msg.bot').count() == 1 and 'This month' in pg.locator('.as-msg.bot').inner_text())
    pg.locator('[data-model="assistant.text"]').fill('who owes me?'); pg.locator('[data-model="assistant.text"]').press('Enter'); time.sleep(0.3)
    check('a typed question is answered too (Enter works)', pg.locator('.as-msg.bot').count() == 2 and 'owed to you' in pg.locator('.as-msg.bot').last.inner_text())
    pg.locator('.as-groups button', has_text='Investments').click(); pg.locator('.pill-btn', has_text='Is my portfolio too risky?').click(); time.sleep(0.3)
    ans = pg.locator('.as-msg.bot').last.inner_text()
    check('investment questions answer from the portfolio (the sample has none: it says so and suggests starting)', ('Mix: equity' in ans) or ('no investments yet' in ans and 'Start investing' in ans), ans[:120])
    shot('a2_assistant_chat')
    link = pg.locator('.as-tip [data-action="asOpen"]').first
    target = link.get_attribute('data-link'); link.click(); time.sleep(0.5)
    check('a suggestion opens the screen to act on', pg.url.endswith('#' + target), pg.url)

    # ---------- Home: health tile ----------
    pg.goto(URL + '#home'); time.sleep(1)
    check('Home: Money health tile with the same score', int(pg.locator('.as-home .as-ring b').inner_text()) == score)
    # ---------- Home: six-month averages ----------
    avg = pg.evaluate("Promise.all([import('./js/logic.js')]).then(([L]) => { const s = JSON.parse(localStorage.getItem('lifedesk-demo')); return L.averages(s, L.monthKey(L.isoDate()), 6); })")
    figs = pg.locator('.avg-figs b').all_inner_texts()
    check('averages: six completed months', avg['months'] == 6 and 'six months' in pg.locator('.avg-card h2').inner_text(), json.dumps(avg))
    check('averages: income, expense and saved match the months', abs(money(figs[0]) - avg['income']) < 1 and abs(money(figs[1]) - avg['expense']) < 1 and abs(money(figs[2]) - avg['saved']) < 1, str(figs))
    so_far = pg.locator('.avg-figs small', has_text='so far').all_inner_texts()
    check('averages: this month as a % of a usual month', len(so_far) == 2, str(so_far))
    shot('a3_home')

    # ---------- Home: quick add ----------
    n0 = demo("s.entries.length")
    pg.locator('[data-model="quick.amount"]').fill('250')
    pg.locator('[data-model="quick.description"]').fill('Weekly groceries')
    time.sleep(0.2)
    check('quick add suggests the category from what was typed', pg.locator('#quick-category option:checked').inner_text().startswith('Groceries'), pg.locator('#quick-category option:checked').inner_text())
    pg.locator('.quick-add').click(); time.sleep(0.4)
    saved = demo("s.entries.filter(e => e.description === 'Weekly groceries' && e.amount === 250 && e.date === new Date().toISOString().slice(0, 10)).length")
    check('quick add saves an expense dated today', demo("s.entries.length") == n0 + 1)
    check('…and offers Undo', pg.locator('.toast', has_text='Undo').count() == 1)
    pg.locator('.toast').get_by_role('button', name='Undo').click(); time.sleep(0.4)
    check('Undo removes it again', demo("s.entries.length") == n0)
    pg.locator('.quick-type button', has_text='Income').click(); time.sleep(0.2)
    pg.locator('[data-model="quick.amount"]').fill('80'); pg.locator('[data-model="quick.description"]').fill('Gift')
    pg.locator('#quick-category').select_option(index=1); pg.locator('[data-model="quick.amount"]').press('Enter'); time.sleep(0.4)
    check('quick add takes income too (Enter saves)', demo("s.entries.some(e => e.type === 'income' && e.amount === 80 && e.description === 'Gift')"))
    pg.locator('[data-model="quick.amount"]').fill('0'); pg.locator('.quick-add').click(); time.sleep(0.3)
    check('a zero amount is refused', pg.locator('.toast', has_text='greater than zero').count() == 1)
    heights = pg.evaluate("[...document.querySelectorAll('.quick > *')].filter(e => getComputedStyle(e).display !== 'none' && !e.classList.contains('quick-more')).map(e => Math.round(e.getBoundingClientRect().height))")
    check('quick add: every control has the same height', len(set(heights)) == 1, str(heights))

    # ---------- phone ----------
    for route in ('home', 'assistant'):
        pg.set_viewport_size({'width': 390, 'height': 900}); pg.goto(URL + '#' + route); time.sleep(1.2)
        check(f'phone: no sideways scrolling on {route}', not pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1'))
        shot(f'a4_phone_{route}')
    # ---------- phone: the + opens a sheet of quick actions ----------
    pg.set_viewport_size({'width': 390, 'height': 844}); pg.goto(URL + '#home'); time.sleep(1.2)
    pg.locator('.tabbar a.add').click(); time.sleep(0.7)
    geo = pg.evaluate("(() => { const m = document.querySelector('.add-menu').getBoundingClientRect(), d = document.querySelector('.dock-pill').getBoundingClientRect(); return { bottom: m.bottom, top: m.top, dockTop: d.top, h: innerHeight }; })()")
    check('+: a half-height card of quick actions grows above the dock', pg.locator('.add-menu .sheet-head', has_text='Quick actions').count() == 1 and geo['bottom'] <= geo['dockTop'] and (geo['bottom'] - geo['top']) <= geo['h'] * 0.52, json.dumps(geo))
    check('+: the + turns into a close button', pg.locator('.tabbar a.add.fab.open').count() == 1)
    check('+: the page behind is tinted, blurred and pulled back', pg.locator('.app.sheet-open').count() == 1 and 'blur' in pg.evaluate("getComputedStyle(document.querySelector('.add-menu-back')).backdropFilter") and pg.evaluate("getComputedStyle(document.querySelector('.app > .shell')).transform") != 'none')
    check('+: speak, type, the sample trip, 8 kinds and 12 screens', pg.locator('.qa-main [role=menuitem]').count() == 3 and pg.locator('.qa-grid').first.locator('.qa').count() == 8 and pg.locator('.qa-grid').last.locator('.qa').count() == 12)
    check('+: the sheet scrolls', pg.locator('.sheet-body').evaluate('e => e.scrollHeight > e.clientHeight'))
    shot('a5_phone_plus_sheet')
    pg.locator('.add-menu-back').click(position={'x': 40, 'y': 40}); time.sleep(0.6)
    check('+: tapping outside closes it and the page comes back', pg.locator('.add-menu').count() == 0 and pg.locator('.app.sheet-open').count() == 0)
    pg.locator('.tabbar a.add').click(); time.sleep(0.6); pg.locator('.qa', has_text='Transfer').click(); time.sleep(0.8)
    check('+: a kind opens Add Entry with that kind chosen', pg.url.endswith('#add') and pg.locator('.tile-btn.t-transfer.on').count() == 1)
    pg.locator('.tabbar a.add').click(); time.sleep(0.6); pg.locator('[data-action="addMenuTrip"]').click(); time.sleep(0.8)
    check('+: Trip expense opens the form ready to split', pg.locator('.trip-box select[data-action-change="addTripPick"]').count() == 1)
    pg.locator('.tabbar a.add').click(); time.sleep(0.5); pg.keyboard.press('Escape'); time.sleep(0.6)
    check('+: Escape closes it', pg.locator('.add-menu').count() == 0)
    check('no script errors', not errors, '; '.join(errors[:3]))
    b.close()

print(f'\n{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
