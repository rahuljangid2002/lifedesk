"""Records two short LinkedIn videos of LifeDesk, in demo mode with the made-up sample data only:

    design      "LifeDesk - New Look and Offline (Mobile).mp4"   the new design, its motion, and working offline
    reminders   "LifeDesk - Renewal Reminders (Mobile).mp4"      a complete walkthrough, opening with a punch line

    tools/serve_dev.py                                              (serves 4-Web-App on 127.0.0.1:8765)
    <venv>/python demo/record_promo.py --mobile design
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


# ================= video 1: the new look, and working offline =================
def d_hook(page):
    R.start(page, punch('d_hook', [('Money apps', 'mid', 0.3), ('should feel', 'mid', 0.9), ('effortless.', 'accent', 1.6), ('LifeDesk has a new look,', 'small', 3.4), ('and it now works without internet.', 'small', 4.0)]), 0.3)
    time.sleep(7.5)


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
    R.caption(page, 'The plus button: type an entry, or just say it')
    w(1.0)
    tap(page, page.locator('.tabbar a.add'), 2.0)
    tap(page, page.get_by_role('menuitem', name='Type an entry'), 1.6)
    R.caption(page, 'Every save is confirmed with a clear message')
    page.get_by_label('Amount').type('240', delay=110 * SLOW)
    page.get_by_label('Description').type('Coffee with team', delay=55 * SLOW); w(0.7)
    if not page.locator('#add-category').input_value():
        page.locator('#add-category').select_option(label='Food & Dining')
    tap(page, page.get_by_role('button', name='Save Expense'), 2.6)
    R.caption(page, 'Dark mode is true black')
    R.nav(page, 'more', 1.3 * SLOW)
    tap(page, page.get_by_role('button', name='Dark', exact=True), 1.8)
    R.nav(page, 'home', 1.5 * SLOW)
    glide(page, 380, 1.5); w(0.8)


def d_offline(page):
    R.start(page, R.DEMO + '#home'); slow(page)
    R.caption(page, 'On a train, in a lift, on a flight…')
    w(1.6)
    R.caption(page, '')
    page.context.set_offline(True)
    page.wait_for_selector('.offline')
    w(4.6)
    tap(page, page.get_by_role('button', name='Continue offline'), 1.4)
    R.caption(page, 'No internet? Keep going')
    R.nav(page, 'add', 1.2 * SLOW)
    page.get_by_label('Amount').type('180', delay=110 * SLOW)
    page.get_by_label('Description').type('Lunch on the train', delay=55 * SLOW); w(0.8)
    if not page.locator('#add-category').input_value():
        page.locator('#add-category').select_option(label='Food & Dining')
    tap(page, page.get_by_role('button', name='Save Expense'), 2.4)
    R.caption(page, 'It syncs by itself when you are back online')
    page.context.set_offline(False)
    page.wait_for_selector('.toast:has-text("back online")', timeout=20000)
    w(3.0)


def d_outro(page):
    R.start(page, punch('d_outro', [('Looks better.', 'big', 0.3), ('Works anywhere.', 'accent', 1.1), ('Free, private, and in your browser.', 'small', 2.6), ('Try it: link in the comments', 'small', 3.4)], 'LifeDesk · rahuljangid2002.github.io/lifedesk'), 0.3)
    time.sleep(6.5)


DESIGN = [
    ('d_hook', d_hook, 'card', "Money apps should feel effortless. LifeDesk has a new look. And now, it works without internet."),
    ('d_design', d_design, 'app', "Everything is redesigned. You get large titles, clean cards, and far less clutter. Open a tool, and the screen glides in. Go back, and it glides away, just like the apps already on your phone. A floating bar keeps home, daily expenses, budget and more one tap away. And forms no longer take you to another page. They slide up as a sheet, so you never lose your place."),
    ('d_touch', d_touch, 'app', "The plus button is the heart of it. Tap it to type an entry, or simply say it out loud. Fill in the amount and what it was for, and the category is chosen for you. Every save is confirmed with a clear message at the top, so you are never left guessing. And when the lights go down, dark mode is true black."),
    ('d_offline', d_offline, 'app', "Now the part I like most. On a train, in a lift, or on a flight, your connection drops. LifeDesk tells you clearly, instead of failing silently. Choose continue offline, and carry on. Add your lunch, your ticket, anything. The moment you are back online, everything syncs by itself, and a message confirms it."),
    ('d_outro', d_outro, 'card', "It looks better, and it works anywhere. LifeDesk is free, private, and runs in your browser. The link is in the comments."),
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

VIDEOS = {'design': (DESIGN, 'LifeDesk - New Look and Offline'), 'reminders': (REMINDERS, 'LifeDesk - Renewal Reminders')}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args or args[0] not in VIDEOS:
        raise SystemExit(__doc__)
    scenes, title = VIDEOS[args[0]]
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
    final = os.path.join(R.OUT, title + (' (Mobile).mp4' if R.MOBILE else '.mp4'))
    subprocess.run([R.FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', final], check=True)
    print('video', final)


if __name__ == '__main__':
    main()
