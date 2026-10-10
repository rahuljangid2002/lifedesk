"""The Add entry form stays steady, in demo mode: changing the kind of entry does not move the form (the line under the
heading always has room for two lines), and the row of account chips keeps its place after one is chosen.

    tools/serve_dev.py                 (serves 4-Web-App on 127.0.0.1:8765)
    <venv with playwright>/python tests/add_steady.py
"""
import time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/?demo=1'
checks = []


def check(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, '' if ok else detail)


with sync_playwright() as p:
    b = p.chromium.launch()
    for width, height, label in ((390, 844, 'phone'), (320, 700, 'small phone'), (1280, 800, 'desktop')):
        pg = b.new_context(viewport={'width': width, 'height': height}).new_page(); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
        pg.goto(URL + '#accounts')
        for name in ('ICICI', 'Bank of India', 'Kotak', 'State Bank Savings', 'Axis Salary'):
            pg.get_by_role('button', name='＋ Bank account').click(); pg.get_by_label('Name').fill(name); pg.get_by_label('Opening balance').fill('1000'); pg.get_by_role('button', name='Save').click(); time.sleep(0.35)
        pg.goto(URL + '#add'); pg.wait_for_selector('.type-grid'); time.sleep(0.8)

        # 1. the kind of entry
        tops, hints = {}, {}
        for kind in pg.locator('.type-grid .tile-btn').evaluate_all('els => els.map(e => e.dataset.type)'):
            pg.locator(f'.type-grid .tile-btn[data-type="{kind}"]').click(); time.sleep(0.25)
            tops[kind] = round(pg.locator('.type-grid').bounding_box()['y'] + pg.evaluate('window.scrollY'))
            box = pg.locator('.pane-head small'); hints[kind] = (box.inner_text(), pg.evaluate('(el) => el.scrollHeight <= el.clientHeight + 1', box.element_handle()))
        check(f'{label}: the form stays in the same place for all {len(tops)} kinds of entry', len(set(tops.values())) == 1, str(tops))
        check(f'{label}: every hint is shown in full (none cut off)', all(fits for _, fits in hints.values()), str([k for k, (_, fits) in hints.items() if not fits]))
        pg.locator('.type-grid .tile-btn[data-type="expense"]').click(); time.sleep(0.25)

        # 2. the account chips
        row = pg.locator('.chips').first
        scrolls = pg.evaluate('(el) => el.scrollWidth > el.clientWidth + 4', row.element_handle())
        if scrolls:
            pg.evaluate('(el) => { el.scrollLeft = el.scrollWidth; }', row.element_handle()); time.sleep(0.2)
            before = pg.evaluate('(el) => el.scrollLeft', row.element_handle())
            row.locator('.chip').last.click(); time.sleep(0.4)
            row = pg.locator('.chips').first
            after = pg.evaluate('(el) => el.scrollLeft', row.element_handle())
            check(f'{label}: choosing the last account keeps the row where it was scrolled to', before > 0 and abs(after - before) <= 1 and 'on' in row.locator('.chip').last.get_attribute('class'), f'{before} -> {after}')
            visible = pg.evaluate('(el) => { const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect(); return r.right <= p.right + 1 && r.left >= p.left - 1; }', row.locator('.chip.on').element_handle())
            check(f'{label}: …and the chosen account is still in view', visible)
            pg.locator('[data-model="add.amount"]').fill('25'); time.sleep(0.3)
            check(f'{label}: typing the amount does not move the row either', abs(pg.evaluate('(el) => el.scrollLeft', pg.locator('.chips').first.element_handle()) - before) <= 1)
            pg.goto(URL + '#home'); pg.wait_for_selector('.shortcut'); pg.goto(URL + '#add'); pg.wait_for_selector('.chips'); time.sleep(0.5)
            check(f'{label}: coming back to the screen later starts the row from the beginning', pg.evaluate('(el) => el.scrollLeft', pg.locator('.chips').first.element_handle()) == 0)
        else:
            row.locator('.chip').last.click(); time.sleep(0.3)
            check(f'{label}: the accounts wrap (no sideways scrolling) and the last one can be chosen', 'on' in pg.locator('.chips').first.locator('.chip').last.get_attribute('class'))
        check(f'{label}: no errors', not errors, str(errors[:2]))
    b.close()

print(f'\n{sum(checks)}/{len(checks)} passed')
raise SystemExit(0 if all(checks) else 1)
