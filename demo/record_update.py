"""Records the "What's new" video (October 2026 update): the new look and motion, Renewal reminders, notifications
and email, clear messages, and working offline. Demo mode with the made-up sample data only.

    python3 -m http.server 8765                          (in 4-Web-App)
    <venv>/python demo/record_update.py --mobile         -> docs/LifeDesk - What's New (Mobile).mp4, portrait 1080 x 1920
    <venv>/python demo/record_update.py --mobile renew   -> re-record only that scene

Built on record_video.py (same voice, captions and pointer). The app scenes are filmed at half speed and played back
at double, which gives 50 smooth frames a second at the true speed: the recorder alone captures 25, too few for the
screen transitions.
"""
import os, subprocess, sys, time
from datetime import date, timedelta

from playwright.sync_api import sync_playwright

import record_video as R

SLOW = 2  # filmed at 1/2 speed, played at 2x
FPS = 50
iso = lambda n: (date.today() + timedelta(days=n)).isoformat()
w = lambda seconds: time.sleep(seconds * SLOW)


def slow(page):
    """Halves the speed of every animation and transition on this page (the film is played back at double)."""
    cdp = page.context.new_cdp_session(page)
    cdp.send('Animation.enable')
    cdp.send('Animation.setPlaybackRate', {'playbackRate': 1 / SLOW})


def tap(page, locator, pause=1.2):
    locator.scroll_into_view_if_needed()
    locator.hover()
    w(0.35)
    locator.click()
    w(pause)


def glide(page, total, seconds=1.6):
    """Scrolls evenly (scrolling is not slowed by slow(), so it is spread over twice the time here)."""
    box = page.viewport_size
    page.mouse.move(box['width'] * 0.5, box['height'] * 0.5)
    steps = 40
    for _ in range(steps):
        page.mouse.wheel(0, total / steps)
        time.sleep(seconds * SLOW / steps)


def row(page, name):
    return page.locator('.acct-row', has_text=name)


# ---------------- scenes ----------------
def s_title(page):
    R.start(page, R.card('u_title', 'LifeDesk', "What's new: the October update",
                         ['A new design', 'Renewal reminders', 'Notifications and email', 'Works offline']), 0.6)
    time.sleep(3)


def s_design(page):
    R.start(page, R.DEMO + '#hub'); slow(page)
    R.caption(page, 'A new look, with motion like the apps on your phone')
    w(1.4)
    tap(page, page.locator('a.tool', has_text='Account Management'), 1.7)
    R.caption(page, 'Large titles, cards and a floating bar')
    tap(page, page.locator('.tabbar a', has_text='Daily'), 1.2)
    tap(page, page.locator('.tabbar a', has_text='Budget'), 1.2)
    R.caption(page, 'Money is now Account Management, with a More tab')
    tap(page, page.locator('.tabbar a', has_text='More'), 1.4)
    tap(page, page.locator('main .row', has_text='My accounts'), 1.6)
    R.caption(page, 'Forms slide up as a sheet')
    tap(page, page.get_by_role('button', name='＋ Bank account'), 1.5)
    page.get_by_label('Name').type('City Bank', delay=70 * SLOW)
    w(0.8)
    tap(page, page.get_by_role('button', name='Cancel'), 0.9)
    tap(page, page.locator('.hero .back'), 1.5)
    tap(page, page.locator('a.card', has_text='Account & backup'), 1.5)
    R.caption(page, 'Dark mode is true black')
    tap(page, page.get_by_role('button', name='Dark', exact=True), 1.7)
    tap(page, page.locator('.hero .back'), 1.6)
    w(0.6)


def s_renew(page):
    R.start(page, R.DEMO + '#hub'); slow(page)
    R.caption(page, 'New tool: Renewal reminders')
    w(1.2)
    tap(page, page.locator('a.tool', has_text='Renewal reminders'), 1.8)
    R.caption(page, 'Overdue, due soon and later, at a glance')
    glide(page, 520, 2.0); w(0.8); glide(page, -520, 1.2); w(0.4)
    R.caption(page, 'Insurance, subscriptions, documents, warranties')
    tap(page, page.get_by_role('button', name='Add reminder'), 1.5)
    page.get_by_label('Name').type('Bike insurance', delay=60 * SLOW)
    page.get_by_label('Due or expiry date').fill(iso(5)); w(0.5)
    page.get_by_label('Amount (optional)').type('2400', delay=90 * SLOW)
    page.get_by_label('Remind me').select_option('7'); w(0.8)
    tap(page, page.get_by_role('button', name='Save'), 2.2)
    R.caption(page, 'Renewed moves it to the next date and can record the payment')
    tap(page, row(page, 'Electricity bill').get_by_role('button', name='Renewed'), 1.8)
    category = page.locator('[data-model="renewals.renew.categoryId"]')
    if not category.input_value():
        category.select_option(label='Utilities & Recharge')
    w(1.2)
    tap(page, page.get_by_role('button', name='Mark renewed'), 2.6)


def notify_card():
    """A still page for the part that cannot be shown inside the app in demo mode: what arrives on the device and in the inbox."""
    path = os.path.join(R.WORK, 'card_u_notify.html')
    email = open(os.path.join(R.WORK, 'email.html'), encoding='utf-8').read()
    note = lambda cls, title, body, when: f"""<div class="n {cls}"><img src="{R.URL}icons/icon-192.png"><div><div class="top"><b>LifeDesk</b><span>{when}</span></div>
        <div class="t">{title}</div><div class="b">{body}</div></div></div>"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(f"""<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {{ margin: 0; min-height: 100vh; box-sizing: border-box; padding: 26px 16px 20px; background: #f2f2f7; color: #101828;
         font-family: -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; gap: 12px; overflow: hidden; }}
  h1 {{ margin: 4px 0 2px; font-size: clamp(24px, 6.4vw, 40px); font-weight: 800; letter-spacing: -0.03em; text-align: center; line-height: 1.12; max-width: 16em; }}
  p.sub {{ margin: 0 0 6px; color: #667085; font-size: clamp(13px, 3.4vw, 19px); text-align: center; max-width: 30em; }}
  .n {{ width: min(100%, 560px); box-sizing: border-box; display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 20px; background: rgba(255,255,255,.92);
        box-shadow: 0 10px 30px rgba(16,24,40,.12), 0 1px 2px rgba(16,24,40,.06); opacity: 0; animation: drop .7s cubic-bezier(.16,1,.3,1) forwards; }}
  .n img {{ width: 40px; height: 40px; border-radius: 10px; flex: none; }}
  .n .top {{ display: flex; justify-content: space-between; font-size: 12px; color: #667085; }} .n .top b {{ color: #101828; font-weight: 600; }}
  .n .t {{ font-weight: 700; font-size: 15px; margin-top: 2px; }} .n .b {{ font-size: 14px; color: #344054; line-height: 1.35; }}
  .n1 {{ animation-delay: .5s; }} .n2 {{ animation-delay: 2.1s; }}
  .mail {{ width: min(100%, 560px); border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(16,24,40,.12); opacity: 0; animation: rise .8s cubic-bezier(.16,1,.3,1) 3.9s forwards; }}
  .mail > div {{ padding: 0 !important; background: none !important; }}
  .tag {{ align-self: center; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #667085; opacity: 0; animation: rise .6s ease 3.7s forwards; margin-top: 4px; }}
  .dot {{ width: 8px; height: 8px; border-radius: 50%; background: #2563eb; animation: pulse 1.2s ease-in-out infinite alternate; }}
  @keyframes drop {{ from {{ opacity: 0; transform: translateY(-18px) scale(.97); }} to {{ opacity: 1; }} }}
  @keyframes rise {{ from {{ opacity: 0; transform: translateY(18px); }} to {{ opacity: 1; }} }}
  @keyframes pulse {{ to {{ transform: scale(1.5); opacity: .5; }} }}
</style>
<h1>Reminded, even when the app is closed</h1><p class="sub">Every morning from the day you choose, until you mark it renewed</p>
{note('n1', '🔔 Renewal due tomorrow', 'Due on Sun, 11 Oct. Renew it today to stay covered.', 'now')}
{note('n2', '🔔 3 renewals need attention', 'Overdue: 1 · Due today: 1 · Due tomorrow: 1. Tap to see them in LifeDesk.', '9:02 AM')}
<div class="tag">And by email, if you want</div>
<div class="mail">{email}</div><div class="dot"></div>""")
    return 'file://' + path


def s_notify(page):
    R.start(page, notify_card(), 0.6)
    time.sleep(9.5)


def s_trust(page):
    R.start(page, R.DEMO + '#renewals'); slow(page)
    R.caption(page, 'Every action confirms with a clear message')
    w(1.0)
    tap(page, row(page, 'Health insurance').get_by_role('button', name='Delete'), 2.4)
    tap(page, page.get_by_role('button', name='Add reminder'), 1.2)
    tap(page, page.get_by_role('button', name='Save'), 2.2)
    tap(page, page.get_by_role('button', name='Cancel'), 0.8)
    R.caption(page, '')
    page.context.set_offline(True)
    page.wait_for_selector('.offline')
    w(4.2)
    tap(page, page.get_by_role('button', name='Continue offline'), 1.2)
    R.nav(page, 'add', 1.2 * SLOW)
    R.caption(page, 'No internet? Keep adding entries')
    page.get_by_label('Amount').type('180', delay=110 * SLOW)
    page.get_by_label('Description').type('Lunch with team', delay=55 * SLOW); w(0.8)
    if not page.locator('#add-category').input_value():
        page.locator('#add-category').select_option(label='Food & Dining')
    tap(page, page.get_by_role('button', name='Save Expense'), 2.2)
    R.caption(page, 'They sync when you are back online')
    page.context.set_offline(False)
    page.wait_for_selector('.toast:has-text("back online")', timeout=20000)
    w(2.6)


def s_outro(page):
    R.start(page, R.card('u_outro', 'LifeDesk', 'Reminders, notifications and a new design: live now',
                         ['rahuljangid2002.github.io/lifedesk', 'Free', 'Encrypted: only you can read your data', 'Phone and desktop']), 0.6)
    time.sleep(3)


# name, scene, kind ('card' = a still page at normal speed, 'app' = the app at half speed), narration
SCENES = [
    ('u_title', s_title, 'card', "LifeDesk has a big update. Here is what is new."),
    ('u_design', s_design, 'app', "First, a new design. Large titles, clean cards and a floating bar, with screens that glide in and back like the apps on your phone. Money is now called Account Management, and its More tab holds everything else: payments, dashboards, reports, people, accounts and assets. Forms slide up as a sheet, so you never lose your place. And dark mode is true black."),
    ('u_renew', s_renew, 'app', "The new tool is Renewal reminders. Add your insurance, subscriptions, documents or a warranty, with a due date. LifeDesk sorts them into overdue, due soon and later, and shows what they cost in a year. Press Renewed, and a reminder moves to its next date. It can also record the payment as an expense."),
    ('u_notify', s_notify, 'card', "You are reminded even when the app is closed. A notification arrives on your phone or computer, and an email if you want one, every morning from the day you choose, until you mark it renewed. Your reminders stay encrypted, so a message says when something is due, and names appear only if you choose to include them."),
    ('u_trust', s_trust, 'app', "Every action now confirms with a clear message: green when it is done, red when something is missing. And LifeDesk now works without internet. If the connection drops, you see a clear screen, and you can continue offline. Keep adding entries, and they sync by themselves when you are back online."),
    ('u_outro', s_outro, 'card', "Renewal reminders, notifications and the new design are live now. The link is in the comments. Tell me what you would like next."),
]


def prepare_email(pw):
    """The reminder email exactly as the sender builds it (backend/push-sender.gs), for the notifications card."""
    b = pw.chromium.launch(); pg = b.new_page()
    pg.goto(R.URL + 'manifest.webmanifest')
    html = pg.evaluate("""async (days) => {
        const src = await (await fetch('/backend/push-sender.gs')).text();
        const S = new Function(src + '; return { messagesFor, emailFor };')();
        return S.emailFor(S.messagesFor({ dates: [
            { due: days[0], remind: 30, name: 'Health insurance', amount: '₹10,500' }, { due: days[1], remind: 3, name: 'Electricity bill', amount: '₹1,500' },
            { due: days[2], remind: 30, name: 'Car insurance', amount: '₹6,500' }] }, days[1])).html;
    }""", [iso(-3), iso(0), iso(1)])
    b.close()
    with open(os.path.join(R.WORK, 'email.html'), 'w', encoding='utf-8') as f:
        f.write(html)


def record(pw, name, fn, kind):
    vw, vh = (R.MW, R.MH) if R.MOBILE else (R.W, R.H)
    browser = pw.chromium.launch()
    vdir = os.path.join(R.WORK, f'v_{name}')
    R.shutil.rmtree(vdir, ignore_errors=True)
    ctx = browser.new_context(viewport={'width': vw, 'height': vh}, record_video_dir=vdir, record_video_size={'width': vw, 'height': vh},
                              device_scale_factor=R.MSCALE if R.MOBILE else 1, storage_state=R.STATE if kind == 'app' else None, color_scheme='light')
    ctx.add_init_script(R.OVERLAY)
    t0 = time.time()
    page = ctx.new_page()
    page.on('dialog', lambda d: d.accept())
    R.MARK.clear()
    fn(page)
    end = time.time() - t0
    begin = R.MARK.get('start', time.time()) - t0
    page.close(); ctx.close(); browser.close()
    return [os.path.join(vdir, f) for f in os.listdir(vdir) if f.endswith('.webm')][0], begin, end


def build(name, webm, begin, end, apath, alen, kind):
    speed = SLOW if kind == 'app' else 1
    dur = max(alen + 1.2, (end - begin) / speed)
    size = 'scale=1080:1920:flags=lanczos,' if R.MOBILE else ''
    vf = f'{size}setpts=(PTS-STARTPTS)/{speed},fps={FPS},tpad=stop_mode=clone:stop_duration=30'
    out = os.path.join(R.WORK, f'{name}.mp4')
    subprocess.run([R.FFMPEG, '-y', '-loglevel', 'error', '-ss', f'{begin:.2f}', '-i', webm, '-i', apath,
                    '-filter_complex', f'[0:v]{vf}[v];[1:a]adelay=500|500,apad,aresample=44100[a]', '-map', '[v]', '-map', '[a]',
                    '-t', f'{dur:.2f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', str(FPS),
                    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', out], check=True)
    return dur


def main():
    os.makedirs(R.WORK, exist_ok=True); os.makedirs(R.OUT, exist_ok=True)
    only = set(a for a in sys.argv[1:] if not a.startswith('--'))
    total = 0
    with sync_playwright() as pw:
        R.prepare(pw)
        prepare_email(pw)
        for name, fn, kind, text in SCENES:
            mp4 = os.path.join(R.WORK, f'{name}.mp4')
            if only and name.replace('u_', '') not in only and name not in only and os.path.exists(mp4):
                continue
            apath, alen = R.audio(name, text)
            webm, begin, end = record(pw, name, fn, kind)
            dur = build(name, webm, begin, end, apath, alen, kind)
            total += dur
            print(f'{name}: voice {alen:.1f}s, shown {(end - begin) / (SLOW if kind == "app" else 1):.1f}s, scene {dur:.1f}s', flush=True)
    lst = os.path.join(R.WORK, 'u_list.txt')
    with open(lst, 'w') as f:
        for name, *_ in SCENES:
            f.write(f"file '{os.path.join(R.WORK, name + '.mp4')}'\n")
    final = os.path.join(R.OUT, "LifeDesk - What's New (Mobile).mp4" if R.MOBILE else "LifeDesk - What's New.mp4")
    subprocess.run([R.FFMPEG, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', final], check=True)
    print('video', final)


if __name__ == '__main__':
    main()
