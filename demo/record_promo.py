"""Records two short LinkedIn videos of LifeDesk, in demo mode with the made-up sample data only:

    ui          the new design and its motion
    offline     working without internet (opens with a punch line)
    voice       speaking an entry (opens with a punch line)
    reminders   Renewal reminders, a complete walkthrough (opens with a punch line)
    invest      Investments: funds, shares, SIPs, goals and insights (opens with a punch line)
    new         Trips, the Assistant, the new Home and the new bottom bar (opens with a punch line)
    trips / assistant / home / look   one short video per new feature
Each goes to its own folder under docs/LinkedIn/.

    tools/serve_dev.py                                              (serves 4-Web-App on 127.0.0.1:8765)
    <venv>/python demo/record_promo.py --mobile ui
    <venv>/python demo/record_promo.py --mobile reminders [scene ...]   re-record only those scenes of that video

Built on record_update.py (half-speed filming for smooth motion, the voice, captions and pointer) and record_video.py.
The opening cards are written for marketing: a few large words that arrive one after another.
"""
import os, subprocess, sys, time

from playwright.sync_api import sync_playwright

import record_video as R
import record_update as U

SLOW = U.SLOW
w, tap, glide, row, slow, iso = U.w, U.tap, U.glide, U.row, U.slow, U.iso


def punch(name, lines, foot=''):
    """A marketing card: large words that arrive one after another. lines = [(text, 'big' | 'mid' | 'accent' | 'small', seconds before it appears)]."""
    path = os.path.join(R.WORK, f'card_{name}.html')
    rows = ''.join(f'<div class="l {kind}" style="animation-delay:{delay}s">{text}</div>' for text, kind, delay in lines)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ margin: 0; height: 100vh; box-sizing: border-box; padding: 0 26px; display: flex; flex-direction: column; justify-content: center; gap: 14px; overflow: hidden;
         background: radial-gradient(120% 80% at 20% 0%, #1e3a8a 0%, #0b1324 55%, #05070d 100%); color: #fff;
         font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, 'Segoe UI', Roboto, sans-serif; }}
  .l {{ opacity: 0; transform: translateY(26px) scale(.98); animation: in .75s cubic-bezier(.16,1,.3,1) forwards; letter-spacing: -0.035em; line-height: 1.04; font-weight: 800; }}
  .big {{ font-size: clamp(40px, 12.4vw, 92px); }}
  .mid {{ font-size: clamp(28px, 8.2vw, 60px); color: #c7d7fe; font-weight: 700; }}
  .accent {{ font-size: clamp(40px, 12.4vw, 92px); background: linear-gradient(90deg, #60a5fa, #a78bfa); -webkit-background-clip: text; background-clip: text; color: transparent; }}
  .small {{ font-size: clamp(15px, 4.2vw, 26px); font-weight: 600; letter-spacing: -0.01em; color: #98a2b3; line-height: 1.35; }}
  .foot {{ position: fixed; left: 26px; right: 26px; bottom: 34px; display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; letter-spacing: .02em; color: #c7d7fe;
           opacity: 0; animation: in .8s ease .4s forwards; }}
  .foot i {{ width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(135deg, #1b2a4a, #2563eb); display: inline-flex; align-items: center; justify-content: center; }}
  .glow {{ position: fixed; width: 70vw; height: 70vw; right: -30vw; bottom: -20vw; border-radius: 50%; background: radial-gradient(circle, rgba(37,99,235,.45), transparent 65%);
           animation: drift 6s ease-in-out infinite alternate; }}
  @keyframes in {{ to {{ opacity: 1; transform: none; }} }}
  @keyframes drift {{ to {{ transform: translate(-8vw, -10vw) scale(1.15); }} }}
</style>
<div class="glow"></div>{rows}
<div class="foot"><i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4M7.5 11.5l3-3 2.5 2.5 3.5-3.5"/></svg></i>{foot or 'LifeDesk'}</div>""")
    return 'file://' + path


def steps_card(name, title, steps, sub=''):
    """A light card with numbered steps that arrive one by one (for what cannot be shown in demo mode)."""
    path = os.path.join(R.WORK, f'card_{name}.html')
    items = ''.join(f'<div class="s" style="animation-delay:{0.9 + i * 1.5}s"><b>{i + 1}</b><span>{text}</span></div>' for i, text in enumerate(steps))
    with open(path, 'w', encoding='utf-8') as f:
        f.write(f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ margin: 0; min-height: 100vh; box-sizing: border-box; padding: 0 22px; background: #f2f2f7; color: #101828; display: flex; flex-direction: column; justify-content: center; gap: 12px;
         font-family: -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }}
  h1 {{ margin: 0; font-size: clamp(28px, 8vw, 54px); font-weight: 800; letter-spacing: -0.035em; line-height: 1.08; }}
  p {{ margin: 0 0 8px; color: #667085; font-size: clamp(14px, 3.8vw, 22px); line-height: 1.4; }}
  .s {{ display: flex; align-items: center; gap: 14px; background: #fff; border-radius: 20px; padding: 15px 16px; box-shadow: 0 1px 2px rgba(16,24,40,.04), 0 6px 18px rgba(16,24,40,.07);
        font-size: clamp(15px, 4.1vw, 24px); font-weight: 600; line-height: 1.3; opacity: 0; transform: translateY(18px); animation: in .7s cubic-bezier(.16,1,.3,1) forwards; }}
  .s b {{ flex: none; width: 38px; height: 38px; border-radius: 12px; background: #eaf1ff; color: #1d4ed8; display: inline-flex; align-items: center; justify-content: center; font-size: 18px; }}
  @keyframes in {{ to {{ opacity: 1; transform: none; }} }}
</style>
<h1>{title}</h1><p>{sub}</p>{items}""")
    return 'file://' + path


hear, caption_top = U.hear, U.caption_top


# ================= video: the new look =================
def d_hook(page):
    R.start(page, punch('d_hook', [('Money apps', 'mid', 0.3), ('should feel', 'mid', 0.9), ('effortless.', 'accent', 1.6), ('LifeDesk has a completely new look.', 'small', 3.4)]), 0.3)
    time.sleep(6.6)


def d_design(page):
    R.start(page, R.DEMO + '#hub'); slow(page)
    R.caption(page, 'One login. Clean, calm, and quick to read')
    w(1.6)
    tap(page, page.locator('a.tool', has_text='Account Management'), 1.9)
    R.caption(page, 'Screens glide in and back, like the apps on your phone')
    glide(page, 420, 1.6); w(0.5); glide(page, -420, 1.1); w(0.3)
    tap(page, page.locator('.tabbar a', has_text='Daily'), 1.3)
    tap(page, page.locator('.tabbar a', has_text='Budget'), 1.3)
    R.caption(page, 'A floating bar keeps everything one tap away')
    tap(page, page.locator('.tabbar a', has_text='More'), 1.5)
    tap(page, page.locator('main .row', has_text='My accounts'), 1.7)
    R.caption(page, 'Forms slide up as a sheet')
    tap(page, page.get_by_role('button', name='＋ Bank account'), 1.5)
    page.get_by_label('Name').type('City Bank', delay=70 * SLOW)
    w(0.9)
    tap(page, page.get_by_role('button', name='Cancel'), 0.9)
    tap(page, page.locator('.hero .back'), 1.5)


def d_touch(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'The plus button is always within reach')
    w(1.0)
    tap(page, page.locator('.tabbar a.add'), 2.0)
    tap(page, page.get_by_role('menuitem', name='Type an entry'), 1.6)
    R.caption(page, 'Every save is confirmed with a clear message')
    page.get_by_label('Amount').type('240', delay=110 * SLOW)
    page.get_by_label('Description').type('Coffee with team', delay=55 * SLOW); w(0.7)
    if not page.locator('#add-category').input_value():
        page.locator('#add-category').select_option(label='Food & Dining')
    tap(page, page.get_by_role('button', name='Save Expense'), 2.6)
    R.caption(page, 'Dashboards that are easy on the eye')
    R.nav(page, 'insights', 1.4 * SLOW)
    glide(page, 520, 1.8); w(0.6)


def d_dark(page):
    R.start(page, R.DEMO + '#more'); slow(page)
    R.caption(page, 'Dark mode is true black')
    w(1.0)
    tap(page, page.get_by_role('button', name='Dark', exact=True), 1.8)
    R.nav(page, 'home', 1.5 * SLOW)
    glide(page, 420, 1.6); w(0.6)
    R.nav(page, 'renewals', 1.5 * SLOW)
    w(1.6)


def d_outro(page):
    R.start(page, punch('d_outro', [('Looks better.', 'big', 0.3), ('Feels faster.', 'accent', 1.1), ('Free, private, and in your browser.', 'small', 2.6), ('Try it: link in the comments', 'small', 3.4)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(6.5)


DESIGN = [
    ('d_hook', d_hook, 'card', "Money apps should feel effortless. So LifeDesk has a completely new look."),
    ('d_design', d_design, 'app', "Everything is redesigned. You get large titles, clean cards, and far less clutter. Open a tool, and the screen glides in. Go back, and it glides away, just like the apps already on your phone. A floating bar keeps home, daily expenses, budget and more one tap away. And forms no longer take you to another page. They slide up as a sheet, so you never lose your place."),
    ('d_touch', d_touch, 'app', "The plus button is always within reach. Fill in the amount and what it was for, and the category is chosen for you. Every save is confirmed with a clear message at the top, so you are never left guessing. And the dashboards are now as easy to read as the rest."),
    ('d_dark', d_dark, 'app', "And when the lights go down, dark mode is true black. Not grey, but black, on every screen: your home, your budget, and your reminders. It is easier on your eyes, and on your battery."),
    ('d_outro', d_outro, 'card', "It looks better, and it feels faster. LifeDesk is free, private, and runs in your browser. The link is in the comments."),
]


# ================= video: offline mode =================
def o_hook(page):
    R.start(page, punch('o_hook', [('No signal?', 'big', 0.3), ('No problem.', 'accent', 1.3), ('LifeDesk now works offline', 'small', 3.0)]), 0.3)
    time.sleep(5.2)


def o_problem(page):
    R.start(page, punch('o_problem', [('Most apps stop', 'mid', 0.3), ('the moment', 'mid', 0.9), ('your internet does.', 'big', 1.5), ('On a train. In a lift. On a flight.', 'small', 3.3)]), 0.3)
    time.sleep(6.6)


def o_drop(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'You are adding an expense…')
    w(1.8)
    R.caption(page, '')
    page.context.set_offline(True)
    page.wait_for_selector('.offline')
    w(5.4)
    page.locator('.offline-card li').first.hover(); w(2.0)
    tap(page, page.get_by_role('button', name='Continue offline'), 1.6)
    R.caption(page, 'A small chip reminds you that you are offline')
    w(2.4)


def o_work(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    page.context.set_offline(True)
    page.wait_for_selector('.offline')
    page.get_by_role('button', name='Continue offline').click(); w(0.6)
    R.caption(page, 'Keep adding entries, exactly as before')
    R.nav(page, 'add', 1.2 * SLOW)
    page.get_by_label('Amount').type('180', delay=110 * SLOW)
    page.get_by_label('Description').type('Lunch on the train', delay=55 * SLOW); w(0.8)
    if not page.locator('#add-category').input_value():
        page.locator('#add-category').select_option(label='Food & Dining')
    tap(page, page.get_by_role('button', name='Save Expense'), 2.4)
    if page.locator('.toast-close').count():
        page.locator('.toast-close').click()
    R.caption(page, 'Your budget and daily expenses still work')
    R.nav(page, 'daily', 1.4 * SLOW); w(1.6)
    R.nav(page, 'budget', 1.4 * SLOW); w(1.6)
    R.caption(page, 'Back online: everything syncs by itself')
    page.context.set_offline(False)
    page.wait_for_selector('.toast:has-text("back online")', timeout=20000)
    w(3.4)


def o_how(page):
    R.start(page, steps_card('o_how', 'How it works', ['Open LifeDesk once while you are online', 'Lost the connection? Tap “Continue offline”', 'Keep adding. It syncs when you are back'],
                             'Nothing to set up. Add it to your Home screen and it opens like any other app.'), 0.4)
    time.sleep(9.5)


def o_outro(page):
    R.start(page, punch('o_outro', [('Track your money', 'big', 0.3), ('anywhere.', 'accent', 1.1), ('Free, private, and in your browser.', 'small', 2.6), ('Try it: link in the comments', 'small', 3.4)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(6.2)


OFFLINE = [
    ('o_hook', o_hook, 'card', "No signal? No problem."),
    ('o_problem', o_problem, 'card', "Most apps stop the moment your internet does. On a train, in a lift, or on a flight."),
    ('o_drop', o_drop, 'app', "Here is what happens in LifeDesk. Your connection drops, and it tells you clearly, instead of failing silently. It even suggests what to check. If you do not want to wait, choose continue offline. A small chip stays on screen, so you always know."),
    ('o_work', o_work, 'app', "Then carry on as if nothing happened. Add your lunch, your ticket, anything. Your daily expenses and your budget keep working too. And the moment you are back online, everything syncs by itself, and a message confirms it."),
    ('o_how', o_how, 'card', "There is nothing to set up. Open LifeDesk once while you are online. If the connection goes, tap continue offline. Keep adding, and it syncs when you are back."),
    ('o_outro', o_outro, 'card', "Track your money anywhere. LifeDesk is free, private, and runs in your browser. The link is in the comments."),
]


# ================= video: voice entry =================
def v_hook(page):
    R.start(page, punch('v_hook', [('Stop typing', 'big', 0.3), ('your expenses.', 'big', 0.9), ('Just say them.', 'accent', 2.0)]), 0.3)
    time.sleep(5.4)


def v_problem(page):
    R.start(page, punch('v_problem', [('You buy something.', 'mid', 0.3), ('You mean to note it later.', 'mid', 1.5), ('By evening,', 'big', 3.0), ('it is forgotten.', 'accent', 3.6)]), 0.3)
    time.sleep(7.2)


def v_one(page):
    R.start(page, R.DEMO + '#home'); slow(page); caption_top(page)
    R.caption(page, 'Tap +, then “Speak an entry”')
    w(0.8)
    tap(page, page.locator('.tabbar a.add'), 1.3)
    hear(page, 'Spent 450 on groceries from main bank', 'yes')
    tap(page, page.get_by_role('menuitem', name='Speak an entry'), 0.4)
    R.caption(page, 'You say: “Spent 450 on groceries from Main Bank”')
    page.wait_for_selector('.voice-review', timeout=60000)
    R.caption(page, 'It shows what it understood, and asks before saving')
    page.wait_for_selector('.toast', timeout=60000)
    R.caption(page, 'You say “yes”. Saved, with Undo')
    w(2.2)


def v_ask(page):
    R.start(page, R.DEMO + '#home'); slow(page); caption_top(page)
    R.caption(page, 'Forgot to say the account?')
    w(0.6)
    hear(page, 'Spent 320 on lunch', 'cash', 'yes')
    tap(page, page.locator('.shortcut', has_text='Voice entry'), 0.4)
    R.caption(page, 'You say: “Spent 320 on lunch”')
    page.wait_for_selector('.voice-q', timeout=60000)
    R.caption(page, 'It asks: “Which account did you pay from?”')
    page.wait_for_selector('.voice-review', timeout=60000)
    R.caption(page, 'You answer “cash”, then “yes”')
    page.wait_for_selector('.toast', timeout=60000)
    w(1.8)


def v_many(page):
    R.start(page, R.DEMO + '#add'); slow(page); caption_top(page)
    R.caption(page, 'A whole day in one sentence')
    w(0.5)
    hear(page, 'Spent 300 on vegetables and 120 on milk from cash and received 5000 salary in main bank')
    tap(page, page.get_by_role('button', name='Speak it'), 0.4)
    page.wait_for_selector('.voice-review', timeout=60000)
    R.caption(page, 'Three entries, ready to check')
    w(1.6)
    R.caption(page, 'Change anything before saving')
    tap(page, page.locator('.voice-review [data-action="voiceEdit"]').first, 0.9)
    amount = page.locator('.voice-edit [data-vfield="amount"]')
    amount.fill(''); amount.type('320', delay=110 * SLOW); w(0.4)
    tap(page, page.get_by_role('button', name='Done'), 0.7)
    tap(page, page.get_by_role('button', name='Save all 3'), 0.3)
    page.wait_for_selector('.toast', timeout=60000)
    R.caption(page, 'Saved together, with one Undo')
    w(1.8)
    page.locator('.toast-close').click(); w(0.2)
    R.caption(page, 'English or हिन्दी')
    hear(page)
    tap(page, page.get_by_role('button', name='Speak it'), 0.6)
    hear(page, 'कैश से किराने पर 450 रुपये खर्च किए', 'हाँ')
    tap(page, page.get_by_role('button', name='हिन्दी'), 0.4)
    page.wait_for_selector('.voice-review', timeout=60000)
    page.wait_for_selector('.toast', timeout=60000)
    w(1.8)


def v_how(page):
    R.start(page, steps_card('v_how', 'Try it in 4 steps', ['Tap <b style="all:unset;font-weight:800">+</b> and choose “Speak an entry”', 'Allow the microphone, once', 'Say it: “Spent 450 on groceries”', 'Say “yes”, or tap Save'],
                             'Works in Chrome, Edge and Safari. English and हिन्दी.'), 0.4)
    time.sleep(10.5)


def v_trust(page):
    R.start(page, punch('v_trust', [('Nothing is saved', 'big', 0.3), ('until you say yes.', 'accent', 1.1), ('It never guesses an account you do not have.', 'small', 2.8), ('Encrypted on your device. No ads.', 'small', 3.6)]), 0.3)
    time.sleep(7.0)


def v_outro(page):
    R.start(page, punch('v_outro', [('Say it.', 'big', 0.3), ('It is tracked.', 'accent', 1.1), ('Free · Link in the comments', 'small', 2.8)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(5.6)


VOICE = [
    ('v_hook', v_hook, 'card', "Stop typing your expenses. Just say them."),
    ('v_problem', v_problem, 'card', "You buy something. You mean to note it later. And by evening, it is forgotten."),
    ('v_one', v_one, 'voice', "In LifeDesk, tap plus and choose speak an entry. Say what you spent, on what, and from which account. It shows what it understood, and asks before saving. Say yes, and it is done."),
    ('v_ask', v_ask, 'voice', "Leave something out, and it simply asks. Here, the account is missing, so it asks which one you paid from. You answer, it confirms, and it saves. It never guesses."),
    ('v_many', v_many, 'voice', "You can even say a whole day in one sentence. Vegetables, milk and your salary become three separate entries, each with its own category and account. Check them, change any amount before saving, and they are stored together, with a single undo. And it is not only English. Say it in Hindi, and it understands that too."),
    ('v_how', v_how, 'card', "To try it: tap plus, and choose speak an entry. Allow the microphone once. Say your entry. Then say yes, or tap save."),
    ('v_trust', v_trust, 'card', "Nothing is saved until you say yes. It never guesses an account you do not have. And your data is encrypted on your own device."),
    ('v_outro', v_outro, 'card', "Say it, and it is tracked. LifeDesk is free, and the link is in the comments."),
]


# ================= video 2: Renewal reminders, the complete walkthrough =================
def r_hook(page):
    R.start(page, punch('r_hook', [('Your insurance', 'mid', 0.3), ('expired', 'big', 0.9), ('yesterday.', 'accent', 1.5), ('Did anyone tell you?', 'mid', 3.3)]), 0.3)
    time.sleep(6.2)


def r_problem(page):
    R.start(page, punch('r_problem', [('Late fees.', 'big', 0.3), ('Lapsed cover.', 'big', 1.2), ('Lost warranties.', 'big', 2.1), ('It only takes one forgotten date.', 'small', 3.6)]), 0.3)
    time.sleep(6.4)


def r_promise(page):
    R.start(page, punch('r_promise', [('Never miss', 'big', 0.3), ('a renewal', 'big', 0.8), ('again.', 'accent', 1.4), ('Renewal reminders, in LifeDesk', 'small', 3.0)]), 0.3)
    time.sleep(5.6)


def r_open(page):
    R.start(page, R.DEMO + '#hub'); slow(page)
    R.caption(page, 'It tells you the moment you open the app')
    page.locator('a.notice', has_text='renewal').first.hover(); w(2.0)
    tap(page, page.locator('a.tool', has_text='Renewal reminders'), 2.0)
    R.caption(page, 'Overdue, due soon and later. Nothing hides')
    w(1.4); glide(page, 560, 2.2); w(0.9); glide(page, -560, 1.3); w(0.4)
    R.caption(page, 'And what it all costs you in a year')
    page.locator('.hero .stat').last.hover(); w(2.6)


def r_add(page):
    R.start(page, R.DEMO + '#renewals'); slow(page)
    R.caption(page, 'Step 1: add what comes up for renewal')
    w(0.8)
    tap(page, page.get_by_role('button', name='Add reminder'), 1.5)
    page.get_by_label('Name').type('Bike insurance', delay=60 * SLOW)
    page.get_by_label('Due or expiry date').fill(iso(5)); w(0.6)
    R.caption(page, 'Insurance, subscriptions, documents, warranties, bills')
    page.get_by_label('Kind').hover(); w(1.2)
    page.get_by_label('Amount (optional)').type('2400', delay=90 * SLOW)
    R.caption(page, 'Step 2: choose how early to be reminded')
    page.get_by_label('Remind me').select_option('7'); w(1.4)
    tap(page, page.get_by_role('button', name='Save'), 1.0)
    R.caption(page, 'Saved. It takes its place in the list')
    w(1.2)
    if page.locator('.toast-close').count():
        page.locator('.toast-close').click()
    row(page, 'Bike insurance').scroll_into_view_if_needed(); w(2.2)


def r_renew(page):
    R.start(page, R.DEMO + '#renewals'); slow(page)
    R.caption(page, 'Step 3: paid it? Press Renewed')
    w(0.8)
    tap(page, row(page, 'Electricity bill').get_by_role('button', name='Renewed'), 1.8)
    R.caption(page, 'Record the payment as an expense in the same step')
    category = page.locator('[data-model="renewals.renew.categoryId"]')
    if not category.input_value():
        category.select_option(label='Utilities & Recharge')
    w(1.8)
    tap(page, page.get_by_role('button', name='Mark renewed'), 0.6)
    R.caption(page, 'It moves to next month by itself')
    w(3.2)
    if page.locator('.toast-close').count():
        page.locator('.toast-close').click()
    R.caption(page, 'And the payment is already in your expenses')
    R.nav(page, 'daily', 1.6 * SLOW)
    w(2.6)


def r_manage(page):
    R.start(page, R.DEMO + '#renewals'); slow(page)
    R.caption(page, 'One-time things too: a warranty, a document')
    row(page, 'Laptop warranty').scroll_into_view_if_needed(); w(1.2)
    tap(page, row(page, 'Laptop warranty').get_by_role('button', name='Renewed'), 1.6)
    if page.locator('[data-action="remRecord"]').is_checked():
        page.locator('[data-action="remRecord"]').uncheck()
    tap(page, page.get_by_role('button', name='Mark renewed'), 2.6)
    if page.locator('.toast-close').count():
        page.locator('.toast-close').click()
    R.caption(page, 'Change or delete any reminder, any time')
    tap(page, row(page, 'Gym membership').get_by_role('button', name='Delete'), 2.8)
    if page.locator('.toast-close').count():
        page.locator('.toast-close').click()
    page.evaluate('window.scrollTo({ top: 0, behavior: "smooth" })'); w(1.6)


def r_notify(page):
    url = U.notify_card()
    # the card names a day: make it tomorrow, whenever this is recorded
    from datetime import date, timedelta
    path = url[len('file://'):]
    html = open(path, encoding='utf-8').read().replace('Due on Sun, 11 Oct.', 'Due on ' + (date.today() + timedelta(days=1)).strftime('%a, %-d %b') + '.')
    open(path, 'w', encoding='utf-8').write(html)
    R.start(page, url, 0.6)
    time.sleep(11.5)


def r_setup(page):
    R.start(page, steps_card('r_setup', 'Turn it on in 3 taps', ['Open <b style="all:unset;font-weight:800">Account</b> → Notifications', 'Tap “Turn on for this device”', 'Add email too, if you like'],
                             'Each phone or computer is turned on once. Then it works even when LifeDesk is closed.'), 0.4)
    time.sleep(8.5)


def r_privacy(page):
    R.start(page, punch('r_privacy', [('Encrypted', 'big', 0.3), ('on your device.', 'mid', 1.0), ('Only you can read your reminders.', 'small', 2.4), ('No bank login. No subscription. No ads.', 'small', 3.2)]), 0.3)
    time.sleep(6.6)


def r_outro(page):
    R.start(page, punch('r_outro', [('Add your first', 'big', 0.3), ('reminder', 'big', 0.8), ('today.', 'accent', 1.4), ('Free · Link in the comments', 'small', 3.0)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(6)


REMINDERS = [
    ('r_hook', r_hook, 'card', "Your insurance expired yesterday. Did anyone tell you?"),
    ('r_problem', r_problem, 'card', "Late fees. Lapsed cover. Lost warranties. It only takes one forgotten date."),
    ('r_promise', r_promise, 'card', "Never miss a renewal again. This is Renewal reminders, in LifeDesk."),
    ('r_open', r_open, 'app', "The moment you open LifeDesk, it tells you what needs attention. Everything sits in one list: overdue, due soon, and later. And at the top, what all of it costs you in a year."),
    ('r_add', r_add, 'app', "Adding one takes seconds. Give it a name and a due date. It can be insurance, a subscription, a document, a warranty or a bill. Say how often it repeats, and how many days before you want to be reminded. Save, and it takes its place in the list."),
    ('r_renew', r_renew, 'app', "When you have paid, press Renewed. You can record the payment as an expense in the same step. The reminder moves to its next date by itself, and the payment is already in your daily expenses and your budget."),
    ('r_manage', r_manage, 'app', "One-time things work too, like a warranty that ends, or a passport. Mark it done, and it leaves the list. And you can change or delete any reminder, whenever you like."),
    ('r_notify', r_notify, 'card', "Here is the part that matters. You are reminded even when the app is closed. A notification arrives every morning, from the day you chose, until you mark it renewed. And an email too, if you want one."),
    ('r_setup', r_setup, 'card', "Turning it on takes three taps. Open Account, then Notifications. Turn it on for this device. And add email if you like."),
    ('r_privacy', r_privacy, 'card', "Your reminders are encrypted on your own device. Only you can read them. No bank login, no subscription, and no ads."),
    ('r_outro', r_outro, 'card', "Add your first reminder today. It is free, and the link is in the comments."),
]


# ================= video: Investments =================
def samples(page):
    """The made-up portfolio of the Investments screen (it writes nothing to the ledger)."""
    btn = page.locator('[data-action="invSamples"]', has_text='Try with samples')
    if btn.count():
        btn.click(); w(0.6)
    if page.locator('.toast-close').count():
        page.locator('.toast-close').click()
    page.evaluate('window.scrollTo(0, 0)'); w(0.3)


def i_hook(page):
    R.start(page, punch('i_hook', [('Funds in one app.', 'mid', 0.3), ('Shares in another.', 'mid', 1.0), ('FD in the bank.', 'mid', 1.7), ('See it all in one place.', 'accent', 2.8)]), 0.3)
    time.sleep(6.4)


def i_problem(page):
    R.start(page, punch('i_problem', [('Is your money', 'big', 0.3), ('actually growing?', 'accent', 1.0), ('Most of us cannot say, because it is spread everywhere.', 'small', 2.6)]), 0.3)
    time.sleep(6.2)


def i_overview(page):
    R.start(page, R.DEMO + '#invest'); slow(page); samples(page)
    R.caption(page, 'Every investment, on one screen')
    w(2.2)
    page.locator('.hero .stat').nth(2).hover(); w(1.2)
    R.caption(page, 'Value, gain, today, and your real return (XIRR)')
    page.locator('.hero .stat').last.hover(); w(1.8)
    R.caption(page, 'Funds, shares, FDs, PF, gold and crypto')
    glide(page, 760, 2.4); w(0.6); glide(page, -760, 1.2); w(0.3)
    tap(page, page.locator('[data-action="invOpen"]', has_text='Flexi Cap'), 1.4)
    R.caption(page, 'Open one: buy more, sell, dividend, start a SIP')
    w(2.4)
    glide(page, 460, 2.0); w(1.6)
    R.caption(page, 'Every transaction, with its units and price')
    glide(page, 420, 1.8); w(1.8)


def i_add(page):
    R.start(page, R.DEMO + '#invest'); slow(page); samples(page)
    R.caption(page, 'Bought a share? Search it')
    tap(page, page.locator('[data-action="invNew"]'), 1.0)
    page.locator('[data-model="invest.form.type"]').select_option('Stock'); w(0.6)
    q = page.locator('[data-model="invest.search.q"]')
    q.click(); q.type('reliance', delay=90 * SLOW)
    tap(page, page.locator('[data-action="invSearch"]'), 0.3)
    page.wait_for_selector('.results .result', timeout=40000); w(1.0)
    tap(page, page.locator('.results .result', has_text='NSE').first, 0.3)
    page.wait_for_function("() => (document.querySelector('[data-model=\"invest.form.price\"]') || {}).value", timeout=40000)
    R.caption(page, "Today's price is filled in for you")
    w(1.8)
    units = page.locator('[data-model="invest.form.first.units"]')
    units.scroll_into_view_if_needed(); units.click(); units.type('10', delay=160 * SLOW)
    R.caption(page, 'And the money comes out of your bank account')
    page.locator('[data-model="invest.form.first.accountId"]').scroll_into_view_if_needed(); page.locator('[data-model="invest.form.first.accountId"]').hover(); w(2.6)
    tap(page, page.get_by_role('button', name='Save', exact=True), 1.6)
    R.caption(page, 'Saved. Your bank balance follows')
    w(1.6)


def i_sip(page):
    R.start(page, R.DEMO + '#invest'); slow(page); samples(page)
    R.caption(page, 'SIPs record themselves, on their day')
    tap(page, page.locator('[data-action="invTab"][data-tab="sips"]'), 1.6)
    page.locator('.sip-row').first.hover(); w(1.6)
    R.caption(page, 'With a yearly step-up, skip, pause or stop')
    w(1.4)
    page.locator('.sip-row').first.get_by_role('button', name='Skip next').hover(); w(1.2)
    R.caption(page, 'Goals: how far along, and what to add each month')
    tap(page, page.locator('[data-action="invTab"][data-tab="goals"]'), 1.6)
    page.locator('main.inv .card, main.inv section').filter(has_text='House down payment').first.hover(); w(2.4)


def i_insights(page):
    R.start(page, R.DEMO + '#invest'); slow(page); samples(page)
    R.caption(page, 'Where your money is, at a glance')
    tap(page, page.locator('[data-action="invTab"][data-tab="insights"]'), 1.4)
    glide(page, 620, 2.2); w(0.8)
    R.caption(page, 'Best performers, and what is coming up')
    glide(page, 900, 2.4); w(1.0)


def i_how(page):
    R.start(page, steps_card('i_how', 'Start in 3 steps', ['Open <b style="all:unset;font-weight:800">Investments</b> from More', 'Tap “Add investment” and search the fund or share', 'Add your SIPs once. They record themselves'],
                             'Try it first with sample investments: one tap, and one more to remove them.'), 0.4)
    time.sleep(9.5)


def i_trust(page):
    R.start(page, punch('i_trust', [('Not an expense.', 'big', 0.3), ('Not forgotten.', 'accent', 1.1), ('Investing leaves your bank, but never counts as spending.', 'small', 2.6), ('Encrypted on your device. No broker login. No ads.', 'small', 3.4)]), 0.3)
    time.sleep(9.4)


def i_outro(page):
    R.start(page, punch('i_outro', [('All your money.', 'big', 0.3), ('One place.', 'accent', 1.1), ('Free · Link in the comments', 'small', 2.8)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(5.8)


INVEST = [
    ('i_hook', i_hook, 'card', "Funds in one app. Shares in another. A fixed deposit in the bank. Now see it all in one place."),
    ('i_problem', i_problem, 'card', "Is your money actually growing? Most of us cannot say, because it is spread everywhere."),
    ('i_overview', i_overview, 'app', "This is Investments, in LifeDesk. Every investment on one screen: what it is worth, what you put in, your gain, today's change, and your real yearly return, the X I R R. Mutual funds, shares, fixed deposits, provident fund, gold and crypto, all together. Open any one to buy more, sell, record a dividend, or start a S I P."),
    ('i_add', i_add, 'app', "Adding one is quick. Search for the share or the fund, and today's price is filled in for you. Enter how many you bought. The money comes out of your bank account, so your balance stays right, without a second entry."),
    ('i_sip', i_sip, 'app', "S I Ps record themselves, on their day, at that day's price. Add a yearly step-up, or skip, pause and stop whenever you need to. And goals show how far along you are, and how much to add each month to get there."),
    ('i_insights', i_insights, 'app', "Insights show where your money is: by asset class, by type and by platform. Your value month by month, your best performers, and what is coming up next."),
    ('i_how', i_how, 'card', "To start: open Investments from the More menu. Tap add investment, and search for your fund or share. Add your S I Ps once, and they record themselves."),
    ('i_trust', i_trust, 'card', "Investing leaves your bank account, but it is never counted as spending. Everything is encrypted on your own device. No broker login, and no ads."),
    ('i_outro', i_outro, 'card', "All your money, in one place. LifeDesk is free, and the link is in the comments."),
]

# ================= video: Trips, the Assistant and the new design =================
def n_hook(page):
    R.start(page, punch('n_hook', [('Split the trip.', 'big', 0.3), ('Check your money.', 'mid', 1.0), ('In seconds.', 'accent', 1.8), ('New in LifeDesk: Trips, an Assistant and a fresh new design.', 'small', 3.4)]), 0.3)
    time.sleep(7.0)


def n_dock(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'A new bottom bar, with a round plus beside it')
    w(1.8)
    tap(page, page.locator('.tabbar a.add'), 2.2)
    R.caption(page, 'Quick actions grow out of the plus')
    w(1.4)
    R.sheet_scroll(page, 360); w(1.2)
    R.caption(page, 'Every kind of entry, and every screen, one tap away')
    w(1.4)
    R.sheet_scroll(page, -360); w(0.6)
    tap(page, page.locator('.tabbar a.add'), 1.6)


def n_trip(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'On a trip? Add a shared expense')
    w(1.0)
    tap(page, page.locator('.tabbar a.add'), 1.8)
    tap(page, page.locator('[data-action="addMenuTrip"]'), 1.8)
    R.caption(page, 'Everyone on the trip is ticked. Tap to leave someone out')
    page.get_by_label('Amount').type('3000', delay=120 * SLOW)
    page.get_by_label('Description').type('Dinner by the lake', delay=50 * SLOW); w(0.6)
    if not page.locator('#add-category').input_value():
        page.locator('#add-category').select_option(index=1)
    page.locator('.trip-box').scroll_into_view_if_needed(); w(0.4)
    R.caption(page, 'Split equally: your share, and what each person owes you')
    page.locator('#trip-split').hover(); w(2.4)
    tap(page, page.locator('.chips .chip').first, 0.8)
    tap(page, page.get_by_role('button', name='Save trip expense'), 2.0)


def n_settle(page):
    R.start(page, R.DEMO + '#trips'); slow(page)
    R.caption(page, 'Each trip: what it cost, and who owes what')
    tap(page, page.locator('.trip-card').first, 2.0)
    glide(page, 380, 1.6); w(0.6)
    R.caption(page, 'Friend paid you back? Settle up in one tap')
    tap(page, page.locator('.trip-member').first.get_by_role('button', name='Settle up'), 1.6)
    tap(page, page.get_by_role('button', name='Record'), 2.0)
    R.caption(page, 'Their share also shows in People & Loans')
    w(1.6)


def n_assist(page):
    R.start(page, R.DEMO + '#assistant'); slow(page)
    R.caption(page, 'The Assistant checks your money')
    w(2.0)
    R.caption(page, 'A score for spending, saving, debt, investments and bills')
    glide(page, 300, 1.4); w(0.8)
    tap(page, page.locator('.as-area', has_text='Spending'), 1.8)
    R.caption(page, 'And tells you what to do first')
    w(1.4)
    tap(page, page.locator('.as-area', has_text='Spending'), 1.0)
    R.caption(page, 'Ask a question. The answer comes from your own entries')
    page.locator('.as-chat').scroll_into_view_if_needed(); w(0.8)
    tap(page, page.locator('.pill-btn', has_text='Give me a complete summary'), 2.6)


def n_home(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'Add an expense right from Home')
    page.locator('.quick').scroll_into_view_if_needed(); w(0.6)
    page.locator('[data-model="quick.amount"]').click()
    page.locator('[data-model="quick.amount"]').type('250', delay=120 * SLOW)
    page.locator('[data-model="quick.description"]').click()
    page.locator('[data-model="quick.description"]').type('Weekly groceries', delay=50 * SLOW); w(0.8)
    R.caption(page, 'The category is filled in for you')
    w(1.2)
    tap(page, page.locator('.quick-add'), 1.8)
    R.caption(page, 'Your usual month, and how this month compares')
    page.locator('.avg-card').scroll_into_view_if_needed(); page.locator('.avg-card').hover(); w(2.4)
    R.caption(page, 'Money health, at a glance')
    page.locator('.as-home').scroll_into_view_if_needed(); page.locator('.as-home').hover(); w(2.4)


def n_trust(page):
    R.start(page, punch('n_trust', [('Your money.', 'big', 0.3), ('Your device.', 'accent', 1.1), ('The Assistant runs fixed rules in your browser. Nothing is sent anywhere.', 'small', 2.6), ('Everything is encrypted. No ads.', 'small', 3.4)]), 0.3)
    time.sleep(8.6)


def n_outro(page):
    R.start(page, punch('n_outro', [('Trips. Assistant.', 'big', 0.3), ('A new look.', 'accent', 1.1), ('Free · Link in the comments', 'small', 2.8)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(5.8)


NEW = [
    ('n_hook', n_hook, 'card', "Split a trip with friends. Check how your money is doing. All in seconds. Here is what is new in LifeDesk."),
    ('n_dock', n_dock, 'app', "First, a fresh new design. The tabs sit in a floating bar, with a round plus button beside it. Tap the plus, and quick actions grow out of it: speak an entry, type one, or jump to any screen."),
    ('n_trip', n_trip, 'app', "Going on a trip? Add a shared expense straight from the plus. Everyone on the trip is ticked, and you can leave anyone out. LifeDesk splits it equally: your share counts as your expense, and the others' shares become money they owe you."),
    ('n_settle', n_settle, 'app', "Each trip shows what it cost, your share, and who owes you what. When a friend pays you back, settle up in one tap. Their balance also shows in People and Loans."),
    ('n_assist', n_assist, 'app', "The new Assistant checks your money. It scores your spending, saving, debt, investments and bills, and tells you what to do first. Ask it a question, and the answer comes from your own entries."),
    ('n_home', n_home, 'app', "Home is smarter too. Add an expense in one line, and the category is filled in for you. See your usual month, the six month average, and how this month compares. And your money health, at a glance."),
    ('n_trust', n_trust, 'card', "The Assistant works with fixed rules, right in your browser. Nothing is sent anywhere. Everything is encrypted, and there are no ads."),
    ('n_outro', n_outro, 'card', "Trips, an Assistant, and a new look. LifeDesk is free, and the link is in the comments."),
]

# ================= one video per new feature (each reuses the scenes above, with its own opening and close) =================
def t_hook(page):
    R.start(page, punch('t_hook', [('Who paid?', 'big', 0.3), ('Who owes whom?', 'mid', 1.0), ('Sorted.', 'accent', 1.8), ('Trips, new in LifeDesk.', 'small', 3.3)]), 0.3)
    time.sleep(6.8)


def t_new(page):
    R.start(page, R.DEMO + '#trips'); slow(page)
    R.caption(page, 'Create a trip: dates, budget, and who is going')
    tap(page, page.get_by_role('button', name='New trip'), 1.6)
    page.locator('[data-model="trips.form.name"]').type('Goa with friends', delay=60 * SLOW); w(0.5)
    page.locator('[data-model="trips.form.budget"]').type('30000', delay=90 * SLOW); w(0.5)
    R.caption(page, 'Tap the friends who are going, or type a new name')
    box = page.locator('[data-model="trips.newName"]')
    box.scroll_into_view_if_needed(); w(0.6)
    box.click(force=True); box.type('Riya', delay=80 * SLOW); w(0.6)
    page.locator('[data-action="tripAddName"]').first.click(force=True); w(1.4)
    R.caption(page, 'New names are added to People & Loans')
    w(1.4)
    page.locator('[data-action="tripCancel"]').first.click(force=True); w(1.0)


def t_how(page):
    R.start(page, steps_card('t_how', 'Try it in 3 steps', ['Open <b style="all:unset;font-weight:800">Trips</b> and create a trip', 'Tap + → Trip expense, and save', 'Settle up when friends pay you back'],
                             'Want to look first? Load the sample data and open "Weekend in the hills".'), 0.4)
    time.sleep(9.5)


def t_outro(page):
    R.start(page, punch('t_outro', [('Split fairly.', 'big', 0.3), ('Settle simply.', 'accent', 1.1), ('Free · Link in the comments', 'small', 2.8)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(5.8)


def a_hook(page):
    R.start(page, punch('a_hook', [('How is my', 'mid', 0.3), ('money doing?', 'big', 0.9), ('Just ask.', 'accent', 1.8), ('The Assistant, new in LifeDesk.', 'small', 3.3)]), 0.3)
    time.sleep(6.8)


def a_tile(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'Money health on Home, every day')
    page.locator('.as-home').scroll_into_view_if_needed(); page.locator('.as-home').hover(); w(2.4)
    tap(page, page.locator('.as-home'), 2.0)
    R.caption(page, 'Tap it for every suggestion')
    w(1.4)


def a_outro(page):
    R.start(page, punch('a_outro', [('Know where', 'mid', 0.3), ('you stand.', 'big', 0.9), ('Free · Link in the comments', 'small', 2.8)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(5.8)


def h_hook(page):
    R.start(page, punch('h_hook', [('Overspending?', 'big', 0.3), ('See it early.', 'accent', 1.1), ('A smarter Home in LifeDesk.', 'small', 3.0)]), 0.3)
    time.sleep(6.4)


def h_outro(page):
    R.start(page, punch('h_outro', [('One line.', 'big', 0.3), ('One glance.', 'accent', 1.1), ('Free · Link in the comments', 'small', 2.8)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(5.8)


def l_hook(page):
    R.start(page, punch('l_hook', [('A fresh', 'mid', 0.3), ('new look.', 'big', 0.9), ('One tap away.', 'accent', 1.8), ('LifeDesk on your phone.', 'small', 3.3)]), 0.3)
    time.sleep(6.8)


def l_tabs(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'Tabs in a floating bar')
    for name in ('Daily', 'Budget', 'More', 'Home'):
        tap(page, page.locator('.dock-pill a', has_text=name), 1.3)
    R.caption(page, 'Screens glide in, like the apps on your phone')
    glide(page, 420, 1.6); w(0.4); glide(page, -420, 1.1)


def l_voice(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'Press and hold + to speak an entry')
    w(1.0)
    page.locator('.tabbar a.add').hover(); w(1.6)
    tap(page, page.locator('.tabbar a.add'), 1.6)
    tap(page, page.locator('.qa', has_text='Assistant'), 2.0)
    R.caption(page, 'Or jump to any screen in one tap')
    w(1.4)


def l_outro(page):
    R.start(page, punch('l_outro', [('Calm.', 'big', 0.3), ('Quick.', 'big', 0.8), ('Yours.', 'accent', 1.4), ('Free · Link in the comments', 'small', 2.8)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(5.8)


TRIPS = [
    ('t_hook', t_hook, 'card', "Back from a trip with friends. Who paid for what, and who owes whom? Now it is sorted."),
    ('t_new', t_new, 'app', "Trips, in LifeDesk. Create a trip with its dates, a budget, and who is going. Pick people you already have, or type a new name."),
    ('t_trip', n_trip, 'app', "Add a shared expense straight from the plus. Everyone on the trip is ticked, and you can leave anyone out. It is split equally: your share counts as your expense, and the others' shares become money they owe you."),
    ('t_settle', n_settle, 'app', "Each trip shows what it cost, your share, and who owes you what. When a friend pays you back, settle up in one tap."),
    ('t_how', t_how, 'card', "To try it: open Trips and create a trip. Tap plus, then Trip expense. Settle up when friends pay you back."),
    ('t_outro', t_outro, 'card', "Split fairly, and settle simply. LifeDesk is free, and the link is in the comments."),
]
ASSIST = [
    ('a_hook', a_hook, 'card', "How is my money doing? Now you can just ask."),
    ('a_check', n_assist, 'app', "Meet the Assistant in LifeDesk. It checks your money and scores your spending, saving, debt, investments and bills. It tells you what to do first, and answers your questions from your own entries."),
    ('a_tile', a_tile, 'app', "Your money health also sits on Home, so you see it every day. Tap it for every suggestion."),
    ('a_trust', n_trust, 'card', "The Assistant works with fixed rules, right in your browser. Nothing is sent anywhere. Everything is encrypted, and there are no ads."),
    ('a_outro', a_outro, 'card', "Know where you stand. LifeDesk is free, and the link is in the comments."),
]
HOME = [
    ('h_hook', h_hook, 'card', "Overspending this month? See it early, right on Home."),
    ('h_home', n_home, 'app', "Add an expense in one line, and the category is filled in for you. See your usual month, the six month average of income and spending, and how this month compares so far. And your money health, at a glance."),
    ('h_outro', h_outro, 'card', "One line to add, one glance to know. LifeDesk is free, and the link is in the comments."),
]
LOOK = [
    ('l_hook', l_hook, 'card', "A fresh new look for LifeDesk on your phone. Everything, one tap away."),
    ('l_tabs', l_tabs, 'app', "The tabs now sit in a floating bar, and screens glide in like the apps on your phone."),
    ('l_dock', n_dock, 'app', "Beside the bar is a round plus button. Tap it, and quick actions grow out of it, while the page behind steps back. Speak an entry, type one, add a trip expense, or jump to any screen."),
    ('l_voice', l_voice, 'app', "Press and hold the plus to speak an entry straight away. Or use it to jump to any screen in one tap."),
    ('l_outro', l_outro, 'card', "Calm, quick, and yours. LifeDesk is free, and the link is in the comments."),
]

# name -> (scenes, file title, folder under docs/LinkedIn)
VIDEOS = {'ui': (DESIGN, 'LifeDesk - New UI', '1 - New UI'), 'offline': (OFFLINE, 'LifeDesk - Offline Mode', '2 - Offline mode'),
          'voice': (VOICE, 'LifeDesk - Voice Entry', '3 - Voice entry'), 'reminders': (REMINDERS, 'LifeDesk - Renewal Reminders', '4 - Renewal Reminders'),
          'invest': (INVEST, 'LifeDesk - Investments', '5 - Investments'),
          'new': (NEW, 'LifeDesk - Trips, Assistant and New Look', '6 - Trips, Assistant and New Look'),
          'trips': (TRIPS, 'LifeDesk - Trips', '7 - Trips'), 'assistant': (ASSIST, 'LifeDesk - Assistant', '8 - Assistant'),
          'home': (HOME, 'LifeDesk - Smarter Home', '9 - Smarter Home'), 'look': (LOOK, 'LifeDesk - New Look', '10 - New Look')}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args or args[0] not in VIDEOS:
        raise SystemExit(__doc__)
    scenes, title, folder = VIDEOS[args[0]]
    only = set(args[1:])
    os.makedirs(R.WORK, exist_ok=True); os.makedirs(R.OUT, exist_ok=True)
    with sync_playwright() as pw:
        R.prepare(pw)
        U.prepare_email(pw)
        for name, fn, kind, text in scenes:
            mp4 = os.path.join(R.WORK, f'{name}.mp4')
            if only and name not in only and name.split('_', 1)[1] not in only and os.path.exists(mp4):
                continue
            apath, alen = R.audio(name, text)
            webm, begin, end = U.record(pw, name, fn, kind)
            dur = U.build(name, webm, begin, end, apath, alen, kind)
            print(f'{name}: voice {alen:.1f}s, shown {(end - begin) / (SLOW if kind in ("app", "voice") else 1):.1f}s, scene {dur:.1f}s', flush=True)
    lst = os.path.join(R.WORK, f'p_{args[0]}.txt')
    with open(lst, 'w') as f:
        for name, *_ in scenes:
            f.write(f"file '{os.path.join(R.WORK, name + '.mp4')}'\n")
    out = os.path.join(R.OUT, 'LinkedIn', folder)
    os.makedirs(out, exist_ok=True)
    final = os.path.join(out, title + (' (Mobile).mp4' if R.MOBILE else '.mp4'))
    subprocess.run([R.FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', final], check=True)
    print('video', final)


if __name__ == '__main__':
    main()
