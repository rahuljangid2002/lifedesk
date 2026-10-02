"""Screenshots of every screen with the sample data loaded (demo mode), wide and phone, for a visual review.
    <venv>/python tests/shots.py   -> tests/out/v_*.png
"""
import os, time
from playwright.sync_api import sync_playwright
U = 'http://localhost:8765/?demo=1'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1680, 'height': 1000}); pg.on('dialog', lambda d: d.accept())
    pg.goto(U); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(U + '#more'); pg.get_by_role('button', name='Load sample data').click(); pg.wait_for_selector('button:has-text("Remove sample data")'); time.sleep(3.5)
    for size, tag in (({'width': 1680, 'height': 1000}, 'w'), ({'width': 390, 'height': 844}, 'm')):
        pg.set_viewport_size(size)
        for r in ['hub', 'home', 'add', 'daily', 'budget', 'people', 'accounts', 'more']:
            pg.goto(U + '#' + r); time.sleep(0.4)
            if r == 'people':
                pg.locator('.p-head').first.click(); time.sleep(0.3)
            pg.screenshot(path=os.path.join(OUT, f'v_{tag}_{r}.png'))
    b.close()
