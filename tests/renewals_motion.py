"""Renewal reminders move, in demo mode: a deleted row fades out before it goes, a new row fades in with a highlight,
Renewed moves a row to its new group the same way, and the sample reminders come and go together.

    tools/serve_dev.py                 (serves 4-Web-App on 127.0.0.1:8765)
    <venv with playwright>/python tests/renewals_motion.py
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
    for width, height, label in ((390, 844, 'phone'), (1280, 800, 'desktop')):
        pg = b.new_context(viewport={'width': width, 'height': height}).new_page(); errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        db = lambda: pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo'))")
        cls = lambda name: pg.evaluate("(n) => { const r = [...document.querySelectorAll('.acct-row')].find(x => x.textContent.includes(n)); return r ? r.className : null; }", name)
        pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
        pg.goto(URL + '#renewals'); time.sleep(0.4)

        # add: fades in with a highlight, which is dropped after a moment
        pg.get_by_role('button', name='Add reminder').click()
        pg.get_by_label('Name').fill('Car insurance'); pg.get_by_label('Due or expiry date').fill('2030-01-15'); pg.get_by_label('Amount (optional)').fill('40')
        pg.get_by_role('button', name='Save').click(); time.sleep(0.25)
        check(f'{label}: a new reminder arrives with the fade-in', 'rem-arrived' in (cls('Car insurance') or ''), str(cls('Car insurance')))
        opacity = pg.evaluate("getComputedStyle([...document.querySelectorAll('.acct-row')].find(x => x.textContent.includes('Car insurance'))).animationName")
        check(f'{label}: …using the arrive and highlight movement', 'rem-arrive' in opacity and 'rem-glow' in opacity, opacity)
        time.sleep(2.2); pg.locator('.toast-close').click() if pg.locator('.toast-close').count() else None; time.sleep(0.3)
        check(f'{label}: the highlight is gone after a moment', 'rem-arrived' not in (cls('Car insurance') or ''), str(cls('Car insurance')))

        # a second one, so the list keeps a row after the delete
        pg.get_by_role('button', name='Add reminder').click()
        pg.get_by_label('Name').fill('Gym'); pg.get_by_label('Due or expiry date').fill('2030-02-15'); pg.get_by_role('button', name='Save').click(); time.sleep(2.4)

        # delete: fades out first, is only then removed
        pg.locator('.acct-row', has_text='Gym').get_by_role('button', name='Delete').click(); time.sleep(0.12)
        check(f'{label}: a deleted reminder fades out first', 'rem-leaving' in (cls('Gym') or ''), str(cls('Gym')))
        check(f'{label}: …and is still stored while it fades', len(db()['reminders']) == 2)
        time.sleep(0.9)
        check(f'{label}: then it is gone, from the screen and from the data', cls('Gym') is None and len(db()['reminders']) == 1 and 'deleted' in pg.locator('.toast-text').inner_text())

        # Renewed: leaves its place and arrives at the new date
        pg.locator('.acct-row', has_text='Car insurance').get_by_role('button', name='Renewed').click(); time.sleep(0.3)
        if pg.locator('[data-action="remRecord"]').is_checked():
            pg.locator('[data-action="remRecord"]').uncheck()
        pg.get_by_role('button', name='Mark renewed').click(); time.sleep(0.12)
        check(f'{label}: Renewed: the row leaves its place', 'rem-leaving' in (cls('Car insurance') or ''), str(cls('Car insurance')))
        time.sleep(0.8)
        check(f'{label}: …and arrives with its next date', 'rem-arrived' in (cls('Car insurance') or '') and db()['reminders'][0]['due'] == '2031-01-15', f"{cls('Car insurance')} {db()['reminders'][0]['due']}")

        # sample reminders come and go together
        time.sleep(2); pg.get_by_role('button', name='Add sample reminders').click(); time.sleep(0.3)
        arrived = pg.locator('.acct-row.rem-arrived').count()
        check(f'{label}: the sample reminders fade in together', arrived == 9 and len(db()['reminders']) == 10, str(arrived))
        time.sleep(2.2); pg.get_by_role('button', name='Remove sample reminders').click(); time.sleep(0.12)
        check(f'{label}: …and fade out together', pg.locator('.acct-row.rem-leaving').count() == 9, str(pg.locator('.acct-row.rem-leaving').count()))
        time.sleep(1)
        check(f'{label}: leaving only your own reminder', len(db()['reminders']) == 1 and pg.locator('.acct-row').count() == 1)
        check(f'{label}: no errors', not errors, str(errors[:2]))
    b.close()

print(f'\n{sum(checks)}/{len(checks)} passed')
raise SystemExit(0 if all(checks) else 1)
