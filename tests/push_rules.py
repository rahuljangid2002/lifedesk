"""The push sender's rules (backend/push-sender.gs), run in a browser: which days notify and what the text says.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/push_rules.py
"""
import sys
from playwright.sync_api import sync_playwright

checks = []


def check(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, detail)


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto('http://localhost:8765/manifest.webmanifest')
    r = pg.evaluate("""async () => {
        const src = await (await fetch('/backend/push-sender.gs')).text();
        const S = new Function(src + '; return { daysBetween, notifyToday, messagesFor, fieldsToObject };')();
        const T = '2026-10-03';
        const m = (dates, extra = {}) => S.messagesFor({ dates, ...extra }, extra.today || T, extra.month || 'October');
        const days = (n) => { const d = new Date(Date.UTC(2026, 9, 3 + n)); return d.toISOString().slice(0, 10); };
        const fires = (remind) => Array.from({ length: 50 }, (_, i) => i - 25).filter((n) => S.notifyToday(n, remind));
        return {
            fires30: fires(30), fires7: fires(7), fires0: fires(0),
            one: m([{ due: days(7), remind: 7 }]),
            none: m([{ due: days(5), remind: 7 }]),
            many: m([{ due: days(1), remind: 30 }, { due: days(-1), remind: 30 }, { due: days(0), remind: 3 }, { due: days(40), remind: 30 }]),
            off: m([{ due: days(0), remind: 3 }], { renewals: false }),
            month: m([], { today: '2026-11-01', month: 'November' }), monthOff: m([], { today: '2026-11-01', monthStart: false }),
            notFirst: m([], { today: '2026-11-02' }),
            fields: S.fieldsToObject({ tz: { stringValue: 'Asia/Kolkata' }, renewals: { booleanValue: true }, tokens: { arrayValue: { values: [{ stringValue: 'a' }] } },
                dates: { arrayValue: { values: [{ mapValue: { fields: { due: { stringValue: '2026-10-10' }, remind: { integerValue: '7' } } } }] } } }),
            leap: S.daysBetween('2028-02-28', '2028-03-01')
        };
    }""")
    b.close()

check('remind 30: on day 30, the day before, the day, then 1, 8, 15, 22 days overdue', r['fires30'] == [-22, -15, -8, -1, 0, 1], str(r['fires30']))
check('remind 7: day 7 too', r['fires7'] == [-22, -15, -8, -1, 0, 1, 7], str(r['fires7']))
check('remind 0: no extra day', r['fires0'] == [-22, -15, -8, -1, 0, 1], str(r['fires0']))
check('one reminder entering its window: "A renewal is due in 7 days."', len(r['one']) == 1 and r['one'][0]['body'].startswith('A renewal is due in 7 days.') and r['one'][0]['link'].endswith('#renewals'), str(r['one']))
check('inside the window between notify days: nothing', r['none'] == [], str(r['none']))
check('three due in one message, nearest first, the far one left out', len(r['many']) == 1 and '3 renewals need attention: one overdue by 1 day, one due today, one due tomorrow.' in r['many'][0]['body'], r['many'][0]['body'] if r['many'] else '')
check('renewals switched off: no renewal message', r['off'] == [])
check('1st of the month: "November has started", opens Money home', len(r['month']) == 1 and r['month'][0]['title'] == 'November has started' and r['month'][0]['link'].endswith('#home'), str(r['month']))
check('start of month switched off, or not the 1st: nothing', r['monthOff'] == [] and r['notFirst'] == [])
check('database values read back as plain values', r['fields'] == {'tz': 'Asia/Kolkata', 'renewals': True, 'tokens': ['a'], 'dates': [{'due': '2026-10-10', 'remind': 7}]}, str(r['fields']))
check('days across a leap day', r['leap'] == 2)
print(f'{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
