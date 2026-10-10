"""Voice entry on the screen, in demo mode, with the browser's listening replaced by a stand-in that "hears" the lines
given here (window.__say) and a stand-in voice that records what was spoken (window.__spoken): complete sentences,
follow-up questions, nothing understood, cancel, Undo, Hindi, and the message in a browser that cannot do it.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/voice_ui.py [output folder for screenshots]
"""
import os, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:8765/?demo=1'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
checks = []

STAND_IN = """
window.__say = []; window.__spoken = []; window.__lang = []; window.__pitch = [];
class FakeRecognition {
    start() { window.__lang.push(this.lang); setTimeout(() => this.onstart && this.onstart(), 20); this._t = setTimeout(() => {
        const text = window.__say.shift(); window.__starts = (window.__starts || 0) + 1;
        if (text === undefined || text === '') { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); return; }
        const result = [{ transcript: text }]; result.isFinal = true;
        this.onresult && this.onresult({ resultIndex: 0, results: [result] });
        this.onend && this.onend();
    }, 120); }
    stop() { clearTimeout(this._t); this.onend && this.onend(); }
    abort() { clearTimeout(this._t); }
}
window.SpeechRecognition = FakeRecognition; window.webkitSpeechRecognition = FakeRecognition;
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, speak(u) { window.__spoken.push(u.text); window.__pitch.push(u.pitch); setTimeout(() => u.onend && u.onend(), 40); } } });
"""


# A phone-like stand-in (Chrome on Android): each run hears one stretch of speech and then ends; the words arrive as
# the whole sentence so far, again and again; and the voice never reports that it has finished speaking.
STAND_IN_PHONE = """
window.__say = []; window.__spoken = []; window.__starts = 0; window.__turn = true; window.__continuous = [];
class PhoneRecognition {
    start() { window.__starts += 1; window.__continuous.push(this.continuous); setTimeout(() => this.onstart && this.onstart(), 30);
        const text = window.__turn ? window.__say.shift() : undefined;
        if (text === undefined) { this._t = setTimeout(() => { this.onerror && this.onerror({ error: 'no-speech' }); this.onend && this.onend(); }, 250); return; }
        window.__turn = false; // this stretch of speech belongs to one turn; the next start hears silence until a question is asked
        const words = text.split(' '); const results = []; let n = 0;
        const step = () => { n += 1; const r = [{ transcript: words.slice(0, n).join(' ') }]; r.isFinal = true; results.push(r);
            this.onresult && this.onresult({ resultIndex: results.length - 1, results: results.slice() });
            this._t = n < words.length ? setTimeout(step, 60) : setTimeout(() => this.onend && this.onend(), 150); };
        this._t = setTimeout(step, 150); }
    stop() { clearTimeout(this._t); this.onend && this.onend(); }
    abort() { clearTimeout(this._t); }
}
window.SpeechRecognition = PhoneRecognition; window.webkitSpeechRecognition = PhoneRecognition;
const synth = { speaking: false, pending: false, cancel() { this.speaking = false; }, getVoices() { return []; },
    speak(u) { window.__spoken.push(u.text); window.__spokeAt = Date.now(); this.speaking = true; setTimeout(() => { this.speaking = false; window.__turn = true; window.__quietAt = Date.now(); }, 400); } };  // never calls u.onend
Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
"""


def check(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, '' if ok else detail)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script(STAND_IN)
    pg = ctx.new_page(); errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    db = lambda: pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo'))")
    shot = lambda n: pg.screenshot(path=os.path.join(OUT, n + '.png'))
    def speak(*lines):
        pg.evaluate('(l) => { window.__say = l; window.__spoken = []; }', list(lines))
    last = lambda: sorted(db()['entries'], key=lambda e: e['createdAt'])[-1]

    pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click(); pg.get_by_label('Name').fill('HDFC Bank'); pg.get_by_label('Opening balance').fill('10000')
    pg.get_by_label('Use as my default account').check(); pg.get_by_role('button', name='Save').click(); time.sleep(0.4)
    pg.goto(URL + '#people'); pg.get_by_role('button', name='Add person').click(); pg.locator('#np-name').fill('Shubham'); pg.locator('[data-action="personAddSave"]').click(); time.sleep(3.6)
    start = len(db()['entries'])

    # a complete sentence from Home: shown for checking first, stored only after Save, with Undo
    pg.goto(URL + '#home'); pg.wait_for_selector('.shortcut')
    check('Home has a Voice entry shortcut', pg.locator('.shortcut', has_text='Voice entry').count() == 1)
    speak('Spent 450 on groceries from HDFC')
    pg.locator('.shortcut', has_text='Voice entry').click(); pg.wait_for_selector('.voice-review'); time.sleep(0.5)
    row = pg.locator('.voice-review .row').inner_text()
    check('complete sentence: NOT stored yet; the review shows Groceries, HDFC Bank and 450, and asks aloud', len(db()['entries']) == start and 'Groceries' in row and 'HDFC Bank' in row and '450' in row and 'Should I store this?' in pg.evaluate('window.__spoken')[0], row.replace('\n', ' | ') + ' // ' + str(pg.evaluate('window.__spoken')))
    shot('v0_review_one')
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_selector('.toast')
    e = last()
    check('Save: stored as an expense of 450 in Groceries from HDFC, marked as a voice entry', len(db()['entries']) == start + 1 and e['type'] == 'expense' and e['amount'] == 450 and e['description'] == 'Groceries' and e.get('byVoice') is True, str(e))
    check('…the sheet closes and a message says what was saved, with Undo', pg.locator('.voice').count() == 0 and '450' in pg.locator('.toast-text').inner_text() and 'Groceries' in pg.locator('.toast-text').inner_text() and pg.locator('.toast-act').inner_text() == 'Undo', pg.locator('.toast-text').inner_text())
    pg.locator('.toast-act').click(); time.sleep(0.4)
    check('Undo removes it again', len(db()['entries']) == start and 'Removed' in pg.locator('.toast-text').inner_text())

    # saying no, or pressing Cancel, stores nothing
    pg.locator('.toast-close').click(); speak('Spent 999 on groceries from HDFC', 'no')
    pg.goto(URL + '#add'); pg.wait_for_selector('.voice-btn'); pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.vb.from-app.warn'); time.sleep(0.3)
    check('"no" to the question: nothing stored, and it says so', len(db()['entries']) == start and 'nothing was saved' in pg.locator('.vb.from-app.warn').inner_text() and pg.locator('.voice-review').count() == 0)
    speak('Spent 888 on groceries from HDFC'); pg.locator('.voice-mic').click(); pg.wait_for_selector('.voice-review'); time.sleep(0.4)
    pg.get_by_role('button', name='Cancel', exact=True).click(); time.sleep(0.3)
    check('Cancel on the review: nothing stored', len(db()['entries']) == start and pg.locator('.voice-review').count() == 0)
    pg.get_by_role('button', name='Close').click()

    # a yes or no that is not understood never throws the entry away: asked once more, then it waits for a button
    speak('Spent 777 on groceries from HDFC', 'banana', 'umbrella'); pg.get_by_role('button', name='Speak it').click()
    pg.wait_for_selector('.voice-status:has-text("Tap Save or Cancel below")', timeout=20000); time.sleep(0.3)
    said = pg.evaluate('window.__spoken')
    check('unclear answers to the question: asked once more, then left waiting with the entry kept', len(db()['entries']) == start and pg.locator('.voice-review .row').count() == 1 and said[1] == 'Sorry, I missed that. Should I store this?' and len(said) == 2, str(said))
    check('…and it shows what it heard: I heard “umbrella”', 'umbrella' in pg.locator('.voice-heard').inner_text(), pg.locator('.voice-heard').inner_text())
    shot('v7_heard_unclear')
    speak('yas'); pg.locator('.voice-mic').click(); pg.wait_for_selector('.toast')
    check('tapping the microphone and saying "yas" (a misheard yes) stores it', last()['amount'] == 777)
    pg.locator('.toast-act').click(); time.sleep(0.4); pg.locator('.toast-close').click()

    # changing an entry on the review screen before it is saved: amount, category, account, description
    speak('Spent 600 on groceries from HDFC'); pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.voice-review'); time.sleep(0.4)
    pg.locator('.voice-review [data-action="voiceEdit"]').click(); pg.wait_for_selector('.voice-edit'); time.sleep(0.2)
    check('the review has a change button that opens a form with amount, category, account, date and description', pg.locator('.voice-edit [data-vfield]').evaluate_all('els => els.map(e => e.dataset.vfield)') == ['amount', 'categoryId', 'accountId', 'date', 'description'])
    pg.locator('.voice-edit [data-vfield="amount"]').fill('650.5')
    pg.locator('.voice-edit [data-vfield="categoryId"]').select_option(label='Food & Dining'); time.sleep(0.2)
    pg.locator('.voice-edit [data-vfield="accountId"]').select_option(label='Cash · Cash'); time.sleep(0.2)
    pg.locator('.voice-edit [data-vfield="description"]').fill('Dinner with family'); pg.locator('.voice-edit [data-vfield="description"]').blur(); time.sleep(0.2)
    row = pg.locator('.voice-review .row').first.inner_text().replace('\n', ' ')
    check('the row shows the changes at once', 'Dinner with family' in row and 'Food & Dining' in row and '650.5' in row and 'Cash' in row, row)
    shot('v8_review_editing')
    pg.locator('.voice-edit [data-vfield="categoryId"]').select_option(''); time.sleep(0.2)
    pg.get_by_role('button', name='Save', exact=True).click(); time.sleep(0.5)
    check('Save without a category is refused, and the entry stays on the screen to be fixed', len(db()['entries']) == start and 'Choose a category' in pg.locator('.voice-note.warn').inner_text() and pg.locator('.voice-edit').count() == 1, pg.locator('.voice-note.warn').inner_text() if pg.locator('.voice-note.warn').count() else 'no note')
    pg.locator('.voice-edit [data-vfield="categoryId"]').select_option(label='Food & Dining'); time.sleep(0.2)
    pg.get_by_role('button', name='Done').click(); time.sleep(0.2)
    pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_selector('.toast')
    e = last(); fd = next(c for c in db()['categories'] if c['name'] == 'Food & Dining'); cash0 = next(a for a in db()['accounts'] if a['kind'] == 'cash')
    check('stored with the changed amount, category, account and description', e['amount'] == 650.5 and e['categoryId'] == fd['id'] and e['accountId'] == cash0['id'] and e['description'] == 'Dinner with family', str(e))
    pg.locator('.toast-act').click(); time.sleep(0.4); pg.locator('.toast-close').click()
    # …or by voice: "make it 500" at the question
    speak('Spent 450 on groceries from HDFC', 'make it 500', 'yes'); pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    said = pg.evaluate('window.__spoken')
    check('a spoken correction ("make it 500") is applied, read back ("Changed. …") and asked about again', last()['amount'] == 500 and said[1].startswith('Changed. ') and said[1].endswith('Should I store this?'), str(said))
    pg.locator('.toast-act').click(); time.sleep(0.4); pg.locator('.toast-close').click()

    # something missing: asked aloud, then confirmed by voice, then stored
    speak('Spent on groceries from cash', '450', 'yes')
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    said = pg.evaluate('window.__spoken')
    check('amount missing: asked "How much?", then "Should I store this?", stored after "yes", read back', said[0] == 'How much?' and 'Should I store this?' in said[1] and said[-1] == 'Stored.' and last()['amount'] == 450 and len(db()['entries']) == start + 1, str(said))
    pg.locator('.toast-close').click(); speak('Lent 2000', 'Shubham', 'cash', 'yes')
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    e = last(); shub = next(x for x in db()['people'] if x['name'] == 'Shubham')
    check('person missing: asked who, then stored as lent to Shubham', pg.evaluate('window.__spoken')[0] == 'Who did you lend it to?' and e['type'] == 'lent' and e['personId'] == shub['id'] and e['amount'] == 2000, str(e))

    # a new person is only created after a yes
    pg.locator('.toast-close').click(); speak('Lent 700 to Rohan from cash', 'yes', 'yes'); people = len(db()['people'])
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    d = db(); rohan = [x for x in d['people'] if x['name'] == 'Rohan']
    check('unknown name: asks before adding, then creates Rohan (owes me) with the entry', 'Add Rohan as a new person?' in pg.evaluate('window.__spoken')[0] and len(d['people']) == people + 1 and rohan and rohan[0]['direction'] == 'owesMe' and last()['personId'] == rohan[0]['id'])
    pg.locator('.toast-act').click(); time.sleep(0.4)
    check('Undo of that removes both the entry and the new person', not [x for x in db()['people'] if x['name'] == 'Rohan'] and len(db()['entries']) == start + 2)

    # which account: asked when it was not said, and asked about when the bank named is not one of the user's
    pg.locator('.toast-close').click(); speak('Spent 320 on groceries', 'cash', 'yes'); hd = next(a for a in db()['accounts'] if a['name'] == 'HDFC Bank'); cash = next(a for a in db()['accounts'] if a['kind'] == 'cash')
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    check('no account said: asks "Which account did you pay from?" before anything else is stored', pg.evaluate('window.__spoken')[0] == 'Which account did you pay from?' and last()['accountId'] == cash['id'] and last()['amount'] == 320, str(pg.evaluate('window.__spoken')))
    pg.locator('.toast-close').click(); speak('Spent 330 on groceries from SBI', 'hdfc', 'yes')
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    q = pg.evaluate('window.__spoken')[0]
    check('a bank that is not among the accounts ("SBI"): says so, lists the accounts, uses the one answered', q.startswith("You don't have an account called SBI. Which account did you pay from? You have ") and 'HDFC Bank' in q and 'Cash' in q and last()['accountId'] == hd['id'] and last()['description'] == 'Groceries', q)
    pg.locator('.toast-act').click(); time.sleep(0.4)

    # the bug: "PNB bank" given as the answer was stored on another bank. It must be reported and asked again.
    pg.locator('.toast-close').click(); speak('Spent 340 on groceries', 'PNB bank', 'hdfc', 'yes'); n0 = len(db()['entries'])
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    said = pg.evaluate('window.__spoken')
    check('answering "PNB bank": told "You don\'t have an account called PNB Bank", asked again, stored on HDFC only after that', said[0] == 'Which account did you pay from?' and said[1].startswith("You don't have an account called PNB Bank. Which account did you pay from? You have ") and last()['accountId'] == hd['id'] and last()['amount'] == 340 and len(db()['entries']) == n0 + 1, str(said[:2]))
    pg.locator('.toast-act').click(); time.sleep(0.4)
    pg.locator('.toast-close').click(); speak('Spent 350 on groceries', 'PNB bank', 'axis bank')
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.vb.from-app.warn'); time.sleep(0.3)
    check('two banks that do not exist: nothing is stored on any account', len(db()['entries']) == n0 and pg.locator('.voice-review').count() == 0)
    pg.get_by_role('button', name='Close').click(); time.sleep(0.2)

    # several entries in one sentence: reviewed together, one removed, the rest stored together
    speak('Spent 450 on groceries and 200 on petrol from HDFC and received 5000 salary in HDFC'); n = len(db()['entries'])
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.voice-review'); time.sleep(0.5)
    rows = [r.replace('\n', ' ') for r in pg.locator('.voice-review .row').all_inner_texts()]
    check('three entries in one sentence: all three in the review, none stored yet', len(rows) == 3 and 'Groceries' in rows[0] and '450' in rows[0] and '200' in rows[1] and 'Income' in rows[2] and '5,000' in rows[2] and len(db()['entries']) == n and pg.get_by_role('button', name='Save all 3').count() == 1, str(rows))
    check('…and read out as "3 entries … Should I store these?"', pg.evaluate('window.__spoken')[0].startswith('3 entries.') and pg.evaluate('window.__spoken')[0].endswith('Should I store these?'), str(pg.evaluate('window.__spoken')))
    shot('v0_review_many')
    pg.locator('.voice-review [data-action="voiceDrop"]').nth(1).click(); time.sleep(0.3)
    check('removing one from the review leaves two', pg.locator('.voice-review .row').count() == 2 and pg.get_by_role('button', name='Save all 2').count() == 1)
    pg.get_by_role('button', name='Save all 2').click(); pg.wait_for_selector('.toast')
    new = sorted(db()['entries'], key=lambda e: e['createdAt'])[n:]
    check('Save all: the two that were kept are stored (groceries 450, salary 5,000), petrol is not', [(e['type'], e['amount']) for e in new] == [('expense', 450), ('income', 5000)] and '2 entries' in pg.locator('.toast-text').inner_text(), str([(e['type'], e['amount']) for e in new]))
    pg.locator('.toast-act').click(); time.sleep(0.4)
    check('one Undo removes both', len(db()['entries']) == n)
    pg.locator('.toast-close').click()

    # thinking before speaking: the recogniser gives up on silence, LifeDesk keeps listening, no second tap needed
    speak('', '', '', 'Spent 275 on groceries from HDFC'); pg.evaluate('window.__starts = 0')
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.voice-review', timeout=20000); time.sleep(0.3)
    check('silence before speaking: the microphone is started again by itself until the sentence comes', pg.evaluate('window.__starts') >= 4 and '275' in pg.locator('.voice-review .row').inner_text(), str(pg.evaluate('window.__starts')))
    pg.get_by_role('button', name='Cancel', exact=True).click(); time.sleep(0.3); pg.get_by_role('button', name='Close').click(); time.sleep(0.2)

    # nothing understood, and cancel: nothing stored, the sheet stays for another try
    speak('Hello how are you'); n = len(db()['entries'])
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.vb.from-app'); time.sleep(0.3)
    check('nothing understood: says so, stores nothing, stays open', len(db()['entries']) == n and "didn't catch an entry" in pg.locator('.vb.from-app').inner_text() and pg.locator('.voice').count() == 1 and pg.locator('.toast').count() == 0)
    shot('v1_not_understood')
    speak('Spent 300', 'cancel'); pg.locator('.voice-mic').click(); pg.wait_for_selector('.vb.from-app:has-text("Cancelled")'); time.sleep(0.2)
    check('"cancel" in answer to a question: nothing stored', len(db()['entries']) == n and pg.locator('.vb.from-app').all_inner_texts()[-1].endswith('Cancelled. Nothing was saved.'), str(pg.locator('.vb.from-app').all_inner_texts()))
    speak('Spent 300', 'umm', 'what'); pg.locator('.voice-mic').click(); pg.wait_for_selector('.vb.from-app:has-text("still couldn")'); time.sleep(0.2)
    check('two answers not understood: gives up, nothing stored', len(db()['entries']) == n)
    speak(); pg.locator('.voice-mic').click(); time.sleep(0.6)
    check('while listening: "Take your time…" is shown and nothing is reported yet', 'Take your time' in pg.locator('.voice-hint').inner_text() and pg.locator('.voice-note.warn').count() == 0 and pg.locator('.voice-stage.listening').count() == 1)
    pg.locator('.voice-mic').click(); pg.wait_for_selector('.voice-note.warn', timeout=10000); time.sleep(0.2)  # a tap on the microphone ends the wait
    check('silence: says nothing was heard, nothing stored', "didn't hear anything" in pg.locator('.voice-note.warn').inner_text() and len(db()['entries']) == n)

    # Hindi
    speak('HDFC से किराने पर 450 रुपये खर्च किए', 'हाँ'); pg.evaluate('window.__lang = []')
    pg.get_by_role('button', name='हिन्दी').click(); pg.wait_for_selector('.toast')
    e = last()
    check('Hindi: listens in hi-IN and stores "HDFC से किराने पर 450 रुपये खर्च किए" as 450 in Groceries', pg.evaluate('window.__lang')[-1] == 'hi-IN' and e['amount'] == 450 and e['type'] == 'expense' and 'दर्ज हो गया' in pg.evaluate('window.__spoken')[-1], str(e))
    pg.locator('.toast-close').click(); speak('450 खर्च किए', 'किराना', 'कैश', 'हाँ')
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.toast')
    check('Hindi stays chosen; missing category is asked in Hindi', pg.evaluate('window.__spoken')[0] == 'किस कैटेगरी में?' and last()['amount'] == 450)
    pg.locator('.toast-close').click(); speak(); pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.voice'); time.sleep(0.4); shot('v2_sheet_hindi')
    pg.get_by_role('button', name='English').click(); time.sleep(0.4); shot('v3_sheet_english')
    check('the sheet fits a phone without sideways scrolling', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth'))
    pg.get_by_role('button', name='Close').click(); time.sleep(0.2)
    check('Close shuts the sheet', pg.locator('.voice').count() == 0)
    # the assistant's voice is chosen on the Account page (not in the voice sheet): female (default) or male
    pg.goto(URL + '#more'); pg.wait_for_selector('.card:has-text("Voice assistant")'); time.sleep(0.3)
    card = pg.locator('.card', has_text='Voice assistant'); pg.evaluate('window.__pitch = []; window.__spoken = []')
    check('Account page has a Voice assistant card with Female voice chosen', 'on' in card.get_by_role('button', name='Female voice', exact=True).get_attribute('class'))
    card.get_by_role('button', name='Male voice', exact=True).click(); time.sleep(0.4)
    check('Male voice: chosen, remembered, and a sample is spoken lower', pg.evaluate("localStorage.getItem('lifedesk-voice-gender')") == 'male' and (pg.evaluate('window.__spoken')[-1].startswith('Hello. I will read your entries back') or pg.evaluate('window.__spoken')[-1].startswith('नमस्ते')) and pg.evaluate('window.__pitch')[-1] < 1 and 'on' in card.get_by_role('button', name='Male voice', exact=True).get_attribute('class'), str(pg.evaluate('window.__pitch')))
    card.get_by_role('button', name='Female voice', exact=True).click(); time.sleep(0.4)
    check('Female voice: a sample is spoken higher', pg.evaluate("localStorage.getItem('lifedesk-voice-gender')") == 'female' and pg.evaluate('window.__pitch')[-1] > 1)
    card.screenshot(path=os.path.join(OUT, 'v6_account_voice_card.png'))
    speak(); pg.goto(URL + '#add'); pg.wait_for_selector('.voice-btn'); pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.voice'); time.sleep(0.3)
    check('the voice sheet no longer has the voice choice (language only)', pg.locator('.voice [data-action="voiceGender"]').count() == 0 and pg.locator('.voice [data-action="voiceLang"]').count() == 2)
    shot('v3_sheet_english'); pg.get_by_role('button', name='Close').click(); time.sleep(0.2)

    # the + of the bottom bar: a tap offers typing or speaking; holding it starts speaking at once
    pg.goto(URL + '#home'); pg.wait_for_selector('.shortcut'); time.sleep(0.3)
    plus = pg.locator('.tabbar a.add')
    plus.click(); time.sleep(0.4)
    items = [x.replace('\n', ' ') for x in pg.locator('.add-menu [role=menuitem]').all_inner_texts()]
    check('tap +: a menu with Speak an entry and Type an entry (still on Home)', len(items) == 2 and items[0].startswith('Speak an entry') and items[1].startswith('Type an entry') and pg.url.endswith('#home') and 'open' in plus.get_attribute('class'), str(items))
    shot('v5_plus_menu')
    pg.locator('.add-menu-back').click(position={'x': 20, 'y': 60}); time.sleep(0.3)
    check('tapping outside closes the menu', pg.locator('.add-menu').count() == 0)
    plus.click(); pg.get_by_role('menuitem', name='Type an entry').click(); time.sleep(0.5)
    check('Type an entry opens Add Entry', pg.url.endswith('#add') and pg.locator('.add-menu').count() == 0 and pg.locator('.type-grid').count() == 1)
    speak(); plus.click(); time.sleep(0.3); pg.get_by_role('menuitem', name='Speak an entry').click(); pg.wait_for_selector('.voice'); time.sleep(0.2)
    check('Speak an entry opens the voice sheet', pg.locator('.voice .voice-mic').count() == 1 and pg.locator('.add-menu').count() == 0)
    pg.get_by_role('button', name='Close').click(); time.sleep(0.2)
    speak(); box = plus.bounding_box(); pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2); pg.mouse.down(); time.sleep(0.75); pg.mouse.up(); time.sleep(0.4)
    check('press and hold +: voice opens straight away, without the menu', pg.locator('.voice .voice-mic').count() == 1 and pg.locator('.add-menu').count() == 0)
    pg.get_by_role('button', name='Close').click(); time.sleep(0.2)
    plus.click(); time.sleep(0.3)
    check('after a hold, a normal tap shows the menu again', pg.locator('.add-menu').count() == 1)
    pg.locator('.add-menu-back').click(position={'x': 20, 'y': 60})
    check('no errors in the browser', not errors, str(errors[:3]))
    ctx.close()

    # a phone (Chrome on Android): repeated pieces are shown once, a pause does not cut the sentence, and the
    # microphone opens as soon as the question has been spoken even though the phone never says speaking ended
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36')
    ctx.add_init_script(STAND_IN_PHONE); pg = ctx.new_page(); errors2 = []
    pg.on('pageerror', lambda e: errors2.append(str(e))); pg.on('dialog', lambda d: d.accept())
    db = lambda: pg.evaluate("JSON.parse(localStorage.getItem('lifedesk-demo'))")
    pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(URL + '#add'); pg.wait_for_selector('.voice-btn'); n = len(db()['entries'])
    pg.evaluate("window.__say = ['Spent 450 on groceries', 'yes']; window.__turn = true")
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('#voice-interim:has-text("groceries")', timeout=20000)
    heard = pg.locator('#voice-interim').inner_text()
    check('phone: the sentence is written once while speaking, not repeated', heard == 'Spent 450 on groceries', heard)
    check('phone: listens one stretch at a time (not the mode that repeats itself)', set(pg.evaluate('window.__continuous')) == {False}, str(set(pg.evaluate('window.__continuous'))))
    pg.wait_for_selector('.voice-review', timeout=20000)
    title = pg.locator('.voice-review .row b').first.inner_text()
    row = pg.locator('.voice-review .row').inner_text().replace('\n', ' ')
    check('phone: understood as one clean entry: "Groceries", 450', title == 'Groceries' and '450' in row, row)
    pg.wait_for_selector('.toast', timeout=20000)
    gap = pg.evaluate('window.__quietAt - window.__spokeAt')
    check('phone: "yes" right after the question is heard the first time, although the phone never reported that speaking ended', len(db()['entries']) == n + 1 and db()['entries'][-1]['amount'] == 450 and 'Should I store this?' in pg.evaluate('window.__spoken')[0], str(pg.evaluate('window.__spoken')))
    check('no errors in the browser (phone)', not errors2, str(errors2[:2]))
    ctx.close()

    # choosing among the device's voices: the best of the gender asked for, per language, or one picked by name
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    ctx.add_init_script(STAND_IN + """
        const VOICES = [['Veena', 'en-IN'], ['Rishi', 'en-IN'], ['Daniel', 'en-GB'], ['Samantha', 'en-US'], ['Zarvox', 'en-US'], ['Lekha', 'hi-IN']].map(([name, lang]) => ({ name, lang, voiceURI: name }));
        window.__used = [];
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };  // the real one accepts only the browser's own voice objects
        Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, getVoices() { return VOICES; }, addEventListener() {},
            speak(u) { window.__spoken.push(u.text); window.__used.push([u.voice ? u.voice.name : null, u.pitch, u.rate]); setTimeout(() => u.onend && u.onend(), 40); } } });
    """)
    pg = ctx.new_page(); errors3 = []
    pg.on('pageerror', lambda e: errors3.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.locator('#welcome-currency').select_option('INR'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(URL + '#more'); pg.wait_for_selector('.card:has-text("Voice assistant")'); time.sleep(0.3)
    card = lambda: pg.locator('.card', has_text='Voice assistant'); used = lambda: pg.evaluate('window.__used')[-1]
    check('Account: female by default, now using Veena; the list offers the device voices, without the novelty one', 'Now using: Veena' in card().inner_text().replace('\n', ' ') and 'Zarvox' not in card().locator('select').inner_text() and 'Rishi' in card().locator('select').inner_text(), card().inner_text()[:200])
    card().get_by_role('button', name='Play a sample').click(); time.sleep(0.3)
    check('the sample is a real sentence, in the chosen voice at its own pitch, a little slower than normal', used()[0] == 'Veena' and used()[1] == 1 and 0.9 <= used()[2] < 1 and '450 rupees for Groceries, from your bank' in pg.evaluate('window.__spoken')[-1], str(used()) + pg.evaluate('window.__spoken')[-1][:80])
    card().get_by_role('button', name='Male voice', exact=True).click(); time.sleep(0.4)
    check('Male voice: Rishi is used (a real male voice, not a pitched one)', used()[0] == 'Rishi' and used()[1] == 1 and 'Now using: Rishi' in card().inner_text().replace('\n', ' '), str(used()))
    card().get_by_role('button', name='हिन्दी').click(); time.sleep(0.3); card().get_by_role('button', name='Play a sample').click(); time.sleep(0.3)
    check('Hindi with Male chosen: the device has only a female Hindi voice, so it is used lower, and the card says so', used()[0] == 'Lekha' and used()[1] < 1 and 'no male voice for हिन्दी' in card().inner_text().replace('\n', ' ') and 'सुनाऊंगा' in pg.evaluate('window.__spoken')[-1], str(used()))
    card().get_by_role('button', name='English').click(); time.sleep(0.3)
    card().locator('select').select_option('Daniel'); time.sleep(0.4)
    check('picking a voice by name: Daniel is used from then on, and remembered', used()[0] == 'Daniel' and pg.evaluate("localStorage.getItem('lifedesk-voice-name-en')") == 'Daniel' and 'Now using: Daniel' in card().inner_text().replace('\n', ' '), str(used()))
    card().screenshot(path=os.path.join(OUT, 'v9_voice_card.png'))
    pg.goto(URL + '#accounts'); pg.get_by_role('button', name='＋ Bank account').click(); pg.get_by_label('Name').fill('HDFC Bank'); pg.get_by_label('Opening balance').fill('1000'); pg.get_by_role('button', name='Save').click(); time.sleep(0.5)
    pg.goto(URL + '#add'); pg.wait_for_selector('.voice-btn'); pg.evaluate("window.__say = ['Spent 150000 on groceries from HDFC', 'no']; window.__spoken = []")
    pg.get_by_role('button', name='Speak it').click(); pg.wait_for_selector('.vb.from-app.warn'); time.sleep(0.2)
    check('an entry is read back as a sentence in that voice: "1 lakh 50 thousand rupees for Groceries and Household, from HDFC Bank. Should I store this?"', pg.evaluate('window.__spoken')[0] == '1 lakh 50 thousand rupees for Groceries and Household, from HDFC Bank. Should I store this?' and pg.evaluate('window.__used')[-2][0] == 'Daniel', pg.evaluate('window.__spoken')[0])
    check('no errors in the browser (voices)', not errors3, str(errors3[:2]))
    ctx.close()

    # a browser without speech recognition: the button explains where it works
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script("delete window.SpeechRecognition; delete window.webkitSpeechRecognition; Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined });")
    pg = ctx.new_page()
    pg.goto(URL); pg.wait_for_selector('#welcome-currency'); pg.get_by_role('button', name='Continue').click(); pg.wait_for_selector('.tool')
    pg.goto(URL + '#home'); pg.wait_for_selector('.tabbar'); pg.locator('.shortcut', has_text='Voice entry').click(); pg.wait_for_selector('.voice')
    text = pg.locator('.voice').inner_text()
    check('unsupported browser: says so and lists where it works (Chrome, Edge, Safari; not Firefox)', 'not available in this browser' in text and all(w in text for w in ['Chrome', 'Edge', 'Safari', 'Firefox']) and pg.locator('.voice-mic[data-action]').count() == 0, text[:200])
    pg.screenshot(path=os.path.join(OUT, 'v4_unsupported.png'))
    pg.get_by_role('link', name='Type the entry').click(); time.sleep(0.4)
    check('…and offers typing instead', pg.url.endswith('#add') and pg.locator('.voice').count() == 0)
    b.close()

print(f'{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
