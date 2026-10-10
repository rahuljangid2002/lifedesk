"""Voice entry rules (js/voice.js), run in a browser: reading amounts, kinds of entry, accounts, people, categories
and dates out of a spoken sentence in English and Hindi, and the questions asked for what is missing.

    python3 -m http.server 8765        (in 4-Web-App)
    <venv with playwright>/python tests/voice_rules.py
"""
import sys
from playwright.sync_api import sync_playwright

checks = []


def check(name, ok, detail=''):
    checks.append(bool(ok))
    print(('PASS' if ok else 'FAIL'), name, '' if ok else detail)


JS = """async (cases) => {
    const V = await import('/js/voice.js'); const L = await import('/js/logic.js'); const { STARTER_CATEGORIES } = await import('/js/seed.js');
    const categories = STARTER_CATEGORIES.map((c, i) => ({ ...c, id: 'c' + i }));
    const ctx = {
        accounts: [{ id: 'cash', name: 'Cash', kind: 'cash' }, { id: 'icici', name: 'ICICI', kind: 'bank', isDefault: true }, { id: 'hdfc', name: 'HDFC Bank', kind: 'bank' }, { id: 'card', name: 'Kotak Bank CC', kind: 'card' }],
        people: [{ id: 'shubham', name: 'Shubham Vaishnav', direction: 'owesMe' }, { id: 'yash', name: 'Yash Dagdi', direction: 'owesMe' }],
        categories, entries: [], today: '2026-10-10', defaultAccountId: 'icici', suggest: (d, t) => L.suggestCategory(categories, d, t, [])
    };
    const cat = (id) => (categories.find((c) => c.id === id) || {}).name || null;
    return {
        talks: cases.map(([lang, ...said]) => {
            const s = V.createSession(lang); let r = null; const asked = []; let confirmed = false; let confirmSay = null;
            let accountAsked = null;
            const lines = [...said];
            for (let guard = 0; guard < 14; guard += 1) {
                // the lines given are said in turn; when they run out, a question about the account is answered "ICICI"
                // (most cases are about something else). Its wording is kept; it is not listed in `asked`.
                let line = lines.shift();
                if (line === undefined) { if (r && r.status === 'ask' && r.slot === 'account') { accountAsked = accountAsked || r.say; line = 'ICICI'; } else break; }
                r = V.hear(s, line, ctx);
                if (r.status === 'ask') { if (!(r.slot === 'account' && lines.length === 0)) asked.push(r.slot); }
                else if (r.status === 'confirm') { confirmed = true; confirmSay = r.say(r.items.map((x) => String(x.entry.amount))); }
                else break;
            }
            // everything said: a complete set waits for a yes, and only then is it handed over for storing
            const waiting = r.status === 'confirm';
            if (waiting) { r = V.hear(s, lang === 'hi' ? 'हाँ' : 'yes', ctx); }
            const items = (r.items || []).map((x) => ({ ...x.entry, category: cat(x.entry.categoryId), person: x.person || null }));
            return { status: r.status, reason: r.reason || null, slot: r.slot || null, asked, accountAsked, confirmed, waiting, confirmSay, sayAsk: r.status === 'ask' ? r.say : null, sayAbort: r.status === 'abort' ? r.say : null,
                     entry: items[0] || null, entries: items, person: items[0] ? items[0].person : null };
        }),
        asks: [['en', 'spent 450 on groceries'], ['en', 'received 5000 salary'], ['en', 'spent 450 on groceries from SBI'], ['hi', 'एसबीआई से किराने पर 450 रुपये खर्च किए'], ['hi', 'किराने पर 450 रुपये खर्च किए']]
            .map(([lang, t]) => V.hear(V.createSession(lang), t, ctx).say),
        joined: [['spent', 'spent 450', 'spent 450 on groceries'], ['spent 450', 'on groceries'], ['spent 450 on groceries', 'spent 450 on groceries'], ['Spent 450 on', '450 on groceries from cash'],
                 ['spent 450', '', '  on   groceries '], ['yes', 'Yes'], ['किराने पर', 'किराने पर 450 रुपये', 'किराने पर 450 रुपये खर्च किए']].map((x) => V.joinHeard(x)),
        yn: ['yes', 'Yes.', 'yeah', 'ya', 'yas', 's', 'ok', 'okay', 'save it', 'yes please', 'हाँ', 'हां', 'जी हाँ', 'यस', 'येस', 'ओके', 'haan', 'ठीक है', 'कर दो',
             'no', 'No.', 'nope', 'know', 'नहीं', 'नही', 'नो', 'nahi', 'मत करो', 'yes no', 'no yes', "don't save",
             'maybe', 'groceries', 'hmm what', ''].map((x) => V.yesOrNo(x)),
        echo: [['shall i save it', '450, Groceries, Cash. Should I store this?'], ['should i store this', '450, Groceries, Cash. Should I store this?'], ['groceries cash should i store', '450, Groceries, Cash. Should I store this?'],
               ['yes', '450, Groceries, Cash. Should I store this?'], ['HDFC bank', 'Which account did you pay from? You have Cash, HDFC Bank and ICICI.'], ['from hdfc bank', 'Which account did you pay from? You have Cash, HDFC Bank and ICICI.'],
               ['which account did you pay from', 'Which account did you pay from? You have Cash, HDFC Bank and ICICI.'], ['store this', 'Should I store this?']].map(([h, sp]) => V.isEcho(h, sp)),
        wording: (() => { const s = V.createSession('en'); const r1 = V.hear(s, 'Spent 450 on groceries from hdfc', ctx); const h = V.createSession('hi'); const r2 = V.hear(h, 'HDFC से किराने पर 450 रुपये खर्च किए', ctx);
                          return [r1.say(['450']), r2.say(['450']), V.yesOrNo(r1.say(['450'])), V.yesOrNo(r2.say(['450'])), V.yesOrNo('Sorry, I missed that. Should I store this?'), V.yesOrNo('माफ़ कीजिए, दोबारा बताइए। क्या इसे दर्ज करूं?')]; })(),
        fix: (() => {
            const run = (first, ...more) => { const s = V.createSession('en'); let r = V.hear(s, first, ctx); const said = []; for (const m of more) { r = V.hear(s, m, ctx); said.push(r.status === 'confirm' ? r.say(r.items.map((x) => String(x.entry.amount))) : r.status); }
                return { status: r.status, said, e: r.items ? { ...r.items[0].entry, category: cat(r.items[0].entry.categoryId) } : null }; };
            const s = V.createSession('en'); V.hear(s, 'Spent 450 on groceries from hdfc', ctx);
            const edited = V.edit(s, 0, { amount: '512.5', categoryId: categories.find((c) => c.name === 'Food & Dining').id, accountId: 'cash', date: '2026-10-08', description: 'Lunch out' }, ctx)[0].entry;
            const cleared = V.edit(s, 0, { categoryId: '', amount: '' }, ctx)[0].entry;
            return { amount: run('Spent 450 on groceries from hdfc', 'make it 500', 'yes'), account: run('Spent 450 on groceries from hdfc', 'from cash', 'yes'), category: run('Spent 450 on groceries from hdfc', 'category food', 'yes'),
                     both: run('Spent 450 on groceries from hdfc', 'no'), many: run('Spent 450 on groceries and 200 on petrol from hdfc', 'make it 500'),
                     edited: { ...edited, category: cat(edited.categoryId) }, cleared, afterYes: V.hear(s, 'yes', ctx).items[0].entry };
        })(),
        money: [[450, 'en'], [45300, 'en'], [150000, 'en'], [12005300, 'en'], [2500.5, 'en'], [100000, 'en'], [450, 'hi'], [150000, 'hi'], [20000000, 'hi']].map(([a, l]) => V.moneyWords(a, l, 'INR')).concat([V.moneyWords(450, 'en', 'USD'), V.moneyWords(99.5, 'en', 'EUR')]),
        words: [V.entryWords('expense', { money: '450 rupees', category: 'Groceries and Household', account: 'HDFC Bank' }, 'en'), V.entryWords('income', { money: '5000 rupees', category: 'Salary', account: 'ICICI' }, 'en'),
                V.entryWords('transfer', { money: '5000 rupees', account: 'ICICI', toAccount: 'Cash' }, 'en'), V.entryWords('lent', { money: '2000 rupees', person: 'Shubham', account: 'Cash' }, 'en'),
                V.entryWords('gotback', { money: '500 rupees', person: 'Yash', account: 'Cash' }, 'en'), V.entryWords('expense', { money: '450 रुपये', category: 'Groceries', account: 'HDFC Bank' }, 'hi'),
                V.entryWords('lent', { money: '2000 रुपये', person: 'शुभम', account: 'Cash' }, 'hi'), V.entryWords('transfer', { money: '5000 रुपये', account: 'ICICI', toAccount: 'Cash' }, 'hi')],
        voices: (() => {
            const all = [['Veena', 'en-IN'], ['Rishi', 'en-IN'], ['Microsoft Neerja Online (Natural) - English (India)', 'en-IN'], ['Microsoft Prabhat Online (Natural) - English (India)', 'en-IN'], ['Daniel', 'en-GB'], ['Samantha', 'en-US'],
                         ['Samantha (Enhanced)', 'en-US'], ['Zarvox', 'en-US'], ['Fred', 'en-US'], ['Lekha', 'hi-IN'], ['Google हिन्दी', 'hi-IN'], ['English India', 'en_IN'], ['Thomas', 'fr-FR']].map(([name, lang]) => ({ name, lang }));
            const best = (list, lang, gender) => { const r = list.map((v) => ({ v, ...V.rateVoice(v, lang, gender) })).filter((x) => x.score > -100).sort((a, b) => b.score - a.score)[0]; return r ? [r.v.name, r.gender] : null; };
            const mac = all.filter((v) => !/Microsoft/.test(v.name));
            return { edgeF: best(all, 'en', 'female'), edgeM: best(all, 'en', 'male'), macF: best(mac, 'en', 'female'), macM: best(mac, 'en', 'male'), hiF: best(all, 'hi', 'female'), hiM: best(all, 'hi', 'male'),
                     noIndianMale: best(mac.filter((v) => v.name !== 'Rishi'), 'en', 'male'), android: best([{ name: 'English India', lang: 'en_IN' }, { name: 'English United States', lang: 'en_US' }], 'en', 'male'),
                     novelty: V.rateVoice({ name: 'Zarvox', lang: 'en-US' }, 'en', 'male').score < 0, french: V.rateVoice({ name: 'Thomas', lang: 'fr-FR' }, 'en', 'male').score < -100 };
        })(),
        second: (() => { const s = V.createSession('en'); V.hear(s, 'Spent 450 on groceries', ctx); return V.hear(s, 'PNB bank', ctx).say; })(),
        one: (() => { const c1 = { ...ctx, accounts: [ctx.accounts[1]] }; const s = V.createSession('en'); const r = V.hear(s, 'spent 450 on groceries', c1); return { status: r.status, account: r.items && r.items[0].entry.accountId }; })(),
        none: V.hear(V.createSession('en'), 'spent 450 on groceries', { ...ctx, accounts: [] }),
        nums: [['en', 'four fifty'], ['en', 'two thousand five hundred'], ['en', '1.5 k'], ['en', '2 lakh'], ['en', 'five hundred fifty five'], ['en', 'one lakh twenty thousand'], ['en', 'twenty five'], ['en', 'two hundred and fifty'],
               ['hi', 'ढाई लाख'], ['hi', 'सवा सौ'], ['hi', 'पौने दो सौ'], ['hi', 'पच्चीस हज़ार'], ['hi', 'साढ़े तीन सौ'], ['hi', 'डेढ़ सौ'], ['hi', 'pachas'], ['hi', 'do hazaar'], ['en', 'do'], ['hi', '४५०']]
            .map(([lang, t]) => (V.numbersIn(V.tidy(t).split(' '), lang)[0] || {}).value ?? null)
    };
}"""

E = lambda **k: k
CASES = [
    # ---- English: complete sentences
    ['en', 'Spent 450 on groceries from HDFC'], ['en', 'Received 50,000 salary in ICICI'], ['en', 'Lent 2000 to Shubham yesterday'], ['en', 'Paid 1200 for petrol by credit card'],
    ['en', 'Transfer 5000 from ICICI to cash'], ['en', 'spent four fifty on coffee'], ['en', 'two thousand five hundred rupees for rent'], ['en', 'bought 2 shirts for rupees 1500'],
    ['en', 'paid 300 for electricity on 5th'], ['en', 'spent 250 on lunch on monday'], ['en', 'withdrew 2000 from hdfc'], ['en', 'got back 500 from yash'], ['en', 'salary 50000'],
    # ---- English: something missing, asked for
    ['en', 'Spent on groceries', '450'], ['en', 'Lent 2000', 'Shubham'], ['en', 'Lent 2000 to Rohan', 'yes'], ['en', 'Lent 2000 to Rohan', 'no', 'yash'], ['en', 'Transfer 5000 from ICICI', 'cash'],
    ['en', 'Paid 300 for xyzabc', 'shopping'], ['en', 'Hello how are you'], ['en', 'spent on groceries', 'blah blah', 'still nothing'], ['en', 'Lent 2000', 'cancel'], ['en', 'Spent 450'],
    # ---- Hindi
    ['hi', 'किराने पर 450 रुपये खर्च किए'], ['hi', 'मुझे 50000 सैलरी मिली'], ['hi', 'शुभम को 2000 उधार दिए'], ['hi', 'पेट्रोल पर साढ़े तीन सौ रुपये खर्च किए'], ['hi', 'डेढ़ हज़ार का खाना'],
    ['hi', 'एचडीएफसी से कैश में 5000 ट्रांसफर किए'], ['hi', 'कल चाय पर पचास रुपये दिए'], ['hi', '450 खर्च किए', 'किराना'], ['hi', 'शुभम को उधार दिए', 'दो हज़ार'], ['hi', 'रहने दो'], ['hi', 'नमस्ते आप कैसे हैं'],
    ['hi', 'रोहन को 500 उधार दिए', 'हाँ'], ['hi', 'HDFC से 300 रुपये बिजली का बिल भरा'],
    # ---- confirm before storing, and several entries in one sentence (from index 36)
    ['en', 'Spent 450 on groceries from HDFC', 'no'], ['en', 'Spent 450 on groceries from HDFC', 'maybe later', 'hmm'], ['en', 'Spent 450 on groceries from HDFC', 'what', 'yes'],
    ['en', 'Spent 450 on groceries and 200 on petrol and received 5000 salary'], ['en', 'spent two hundred and fifty on lunch'], ['en', 'dinner and drinks 800'], ['en', 'bought 2 shirts and 1 jeans for 1500'],
    ['en', 'yesterday spent 300 on coffee and 120 on milk'], ['en', 'spent 450 on groceries and lent 2000 from hdfc', 'Shubham'], ['en', 'spent 450 on groceries and paid 300 for xyzabc from cash', 'shopping'],
    ['en', 'paid 100 for tea then 60 for bread then 40 for milk'], ['hi', 'किराने पर 450 रुपये खर्च किए और पेट्रोल पर 200 रुपये'], ['hi', 'चाय और समोसा 50 रुपये'], ['hi', '450 खर्च किए और 5000 सैलरी मिली', 'किराना'],
    ['hi', 'HDFC से किराने पर 450 रुपये खर्च किए', 'नहीं'],
    # ---- which account: asked when not said, and asked about when the bank named is not one of the user's (from index 51)
    ['en', 'spent 450 on groceries', 'cash', 'yes'], ['en', 'received 5000 salary', 'hdfc', 'yes'], ['en', 'spent 450 on groceries from SBI', 'hdfc', 'yes'], ['en', 'paid 300 for lunch by axis card', 'cash', 'yes'],
    ['en', 'spent 450 on groceries from SBI', 'sbi', 'sbi again'], ['en', 'Spent 450 on groceries and 200 on petrol from HDFC'], ['en', 'Spent 450 on groceries and 200 on petrol', 'cash', 'yes'],
    ['en', 'Transfer 5000 to cash', 'hdfc', 'yes'], ['hi', 'एसबीआई से किराने पर 450 रुपये खर्च किए', 'कैश', 'हाँ'], ['hi', 'किराने पर 450 रुपये खर्च किए', 'एचडीएफसी', 'हाँ'], ['en', 'paid 800 for dinner from xyz bank', 'kotak', 'yes'],
    # ---- a bank the user does not have, given as the ANSWER to "which account?" (the bug: it was stored on another bank) (from index 62)
    ['en', 'Spent 450 on groceries', 'PNB bank', 'hdfc', 'yes'], ['en', 'Spent 450 on groceries', 'PNB bank', 'axis bank'], ['en', 'paid 500 for lunch pnb bank', 'cash', 'yes'], ['en', 'paid 500 for lunch p n b bank', 'cash', 'yes'],
    ['en', 'transfer 5000 from pnb bank to cash', 'hdfc', 'yes'], ['hi', 'पीएनबी बैंक से 450 रुपये किराने पर खर्च किए', 'कैश', 'हाँ'], ['en', 'bought a power bank for 1500', 'shopping', 'cash', 'yes'],
    ['en', 'Spent 450 on groceries', 'PNB bank'], ['en', 'Spent 450 on groceries', 'bank', 'yes'], ['en', 'Spent 450 on groceries', 'hdfc bank', 'yes'], ['en', 'received 9000 salary', 'pnb', 'icici', 'yes'],
    ['en', 'Spent 450 on groceries from hdfc', 'ya'], ['en', 'Spent 450 on groceries from hdfc', 'yes please save it'], ['hi', 'HDFC से किराने पर 450 रुपये खर्च किए', 'जी हाँ'],
]

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto('http://localhost:8765/manifest.webmanifest')
    r = pg.evaluate(JS, CASES)
    b.close()

t = r['talks']
def saved(i, **want):
    x = t[i]
    if x['status'] != 'save':
        return False
    e = x['entry']
    return all(e.get(k) == v for k, v in want.items())
show = lambda i: str({k: v for k, v in t[i].items() if v not in (None, [], '')})[:260]

check('en: "Spent 450 on groceries from HDFC" → expense 450, Groceries, HDFC, today', saved(0, type='expense', amount=450, category='Groceries & Household', accountId='hdfc', date='2026-10-10', description='Groceries'), show(0))
check('en: "Received 50,000 salary in ICICI" → income 50,000, Salary', saved(1, type='income', amount=50000, category='Salary', accountId='icici'), show(1))
check('en: "Lent 2000 to Shubham yesterday" → lent, Shubham, 9 Oct, usual account', saved(2, type='lent', amount=2000, personId='shubham', date='2026-10-09', accountId='icici'), show(2))
check('en: "Paid 1200 for petrol by credit card" → fuel, the card', saved(3, type='expense', amount=1200, category='Vehicle - Fuel', accountId='card'), show(3))
check('en: "Transfer 5000 from ICICI to cash"', saved(4, type='transfer', amount=5000, accountId='icici', toAccountId='cash'), show(4))
check('en: "spent four fifty on coffee" → 450, Food & Dining', saved(5, amount=450, category='Food & Dining'), show(5))
check('en: "two thousand five hundred rupees for rent" → 2,500 expense', saved(6, type='expense', amount=2500), show(6))
check('en: "bought 2 shirts for rupees 1500" → the amount is 1,500, not 2', saved(7, amount=1500), show(7))
check('en: "paid 300 for electricity on 5th" → 300 on 5 Oct (5 is the date)', saved(8, amount=300, date='2026-10-05'), show(8))
check('en: "spent 250 on lunch on monday" → last Monday, 5 Oct', saved(9, amount=250, date='2026-10-05', category='Food & Dining'), show(9))
check('en: "withdrew 2000 from hdfc" → transfer HDFC → Cash', saved(10, type='transfer', accountId='hdfc', toAccountId='cash'), show(10))
check('en: "got back 500 from yash"', saved(11, type='gotback', amount=500, personId='yash'), show(11))
check('en: "salary 50000" → income, Salary', saved(12, type='income', amount=50000, category='Salary'), show(12))
check('en: "Spent on groceries" → asks How much? → "450" → saved', t[13]['asked'] == ['amount'] and saved(13, amount=450, category='Groceries & Household'), show(13))
check('en: "Lent 2000" → asks who → "Shubham" → saved', t[14]['asked'] == ['person'] and saved(14, personId='shubham', amount=2000), show(14))
check('en: unknown "Rohan" → asks to add → "yes" → saved with a new person who owes me', t[15]['asked'] == ['confirmPerson'] and saved(15, amount=2000) and t[15]['person'] == {'name': 'Rohan', 'direction': 'owesMe'}, show(15))
check('en: unknown "Rohan" → "no" → asks who → "yash" → saved to Yash, nobody created', t[16]['asked'] == ['confirmPerson', 'person'] and saved(16, personId='yash') and t[16]['person'] is None, show(16))
check('en: "Transfer 5000 from ICICI" → asks to which account → "cash"', t[17]['asked'] == ['toAccount'] and saved(17, accountId='icici', toAccountId='cash'), show(17))
check('en: no category found → asks → "shopping" → Shopping & Clothing', t[18]['asked'] == ['category'] and saved(18, amount=300, category='Shopping & Clothing'), show(18))
check('en: "Hello how are you" → nothing understood, nothing stored', t[19]['status'] == 'abort' and t[19]['reason'] == 'nothing', show(19))
check('en: two answers not understood → gives up, nothing stored', t[20]['status'] == 'abort' and t[20]['reason'] == 'gaveUp' and t[20]['asked'] == ['amount', 'amount'], show(20))
check('en: "cancel" during a question → nothing stored', t[21]['status'] == 'abort' and t[21]['reason'] == 'cancelled', show(21))
check('en: "Spent 450" alone → still asks the category', t[22]['status'] == 'ask' and t[22]['slot'] == 'category' and t[22]['sayAsk'] == 'Which category?', show(22))
check('hi: "किराने पर 450 रुपये खर्च किए" → expense 450, Groceries', saved(23, type='expense', amount=450, category='Groceries & Household'), show(23))
check('hi: "मुझे 50000 सैलरी मिली" → income, Salary', saved(24, type='income', amount=50000, category='Salary'), show(24))
check('hi: "शुभम को 2000 उधार दिए" → lent to Shubham (name matched by sound)', saved(25, type='lent', amount=2000, personId='shubham'), show(25))
check('hi: "पेट्रोल पर साढ़े तीन सौ रुपये खर्च किए" → 350, fuel', saved(26, amount=350, category='Vehicle - Fuel'), show(26))
check('hi: "डेढ़ हज़ार का खाना" → 1,500, Food & Dining', saved(27, type='expense', amount=1500, category='Food & Dining'), show(27))
check('hi: "एचडीएफसी से कैश में 5000 ट्रांसफर किए" → transfer HDFC → Cash (letters spelt in Hindi)', saved(28, type='transfer', amount=5000, accountId='hdfc', toAccountId='cash'), show(28))
check('hi: "कल चाय पर पचास रुपये दिए" → 50, yesterday, Food & Dining', saved(29, amount=50, date='2026-10-09', category='Food & Dining'), show(29))
check('hi: "450 खर्च किए" → asks किस कैटेगरी में? → "किराना" → saved', t[30]['asked'] == ['category'] and saved(30, amount=450, category='Groceries & Household'), show(30))
check('hi: "शुभम को उधार दिए" → asks कितने रुपये? → "दो हज़ार" → 2,000', t[31]['asked'] == ['amount'] and saved(31, amount=2000, personId='shubham'), show(31))
check('hi: "रहने दो" → cancelled; "नमस्ते आप कैसे हैं" → nothing stored', t[32]['reason'] == 'cancelled' and t[33]['status'] == 'abort' and t[33]['reason'] == 'nothing' and 'सेव नहीं' in t[33]['sayAbort'], show(33))
check('hi: unknown "रोहन" → asks to add → "हाँ" → new person', t[34]['asked'] == ['confirmPerson'] and saved(34, amount=500) and t[34]['person'] == {'name': 'रोहन', 'direction': 'owesMe'}, show(34))
check('hi with English words: "HDFC से 300 रुपये बिजली का बिल भरा" → 300, utilities, HDFC', saved(35, amount=300, accountId='hdfc', category='Utilities & Recharge'), show(35))
m = lambda i: [(e['type'], e['amount'], e['category'] or e.get('personId')) for e in t[i]['entries']]
check('every complete entry waits for a yes before it is handed over for storing', all(t[i]['confirmed'] for i in [0, 1, 2, 13, 14, 23, 51, 53, 57]) and all(t[i]['waiting'] for i in [0, 1, 2, 13, 14, 23]))
check('en: "no" to "Shall I save it?" → nothing stored', t[36]['status'] == 'abort' and t[36]['reason'] == 'declined' and t[36]['sayAbort'] == 'Okay, nothing was saved.', show(36))
check('en: two unclear answers to the confirmation → NOT thrown away: the entry still waits, and a yes stores it', t[37]['status'] == 'save' and t[37]['waiting'] and t[37]['entry']['amount'] == 450, show(37))
check('en: one unclear answer, then "yes" → stored; the question is asked once more ("Sorry, I missed that…")', t[38]['status'] == 'save' and t[38]['confirmSay'] == 'Sorry, I missed that. Should I store this?', show(38))
check('en: three entries in one sentence: groceries 450, petrol 200 (also spent), salary 5,000 (income)', m(39) == [('expense', 450, 'Groceries & Household'), ('expense', 200, 'Vehicle - Fuel'), ('income', 5000, 'Salary')], str(m(39)))
check('en: "two hundred and fifty on lunch" is one entry of 250', m(40) == [('expense', 250, 'Food & Dining')], str(m(40)))
check('en: "dinner and drinks 800" is one entry', m(41) == [('expense', 800, 'Food & Dining')] and t[41]['entry']['description'] == 'Dinner drinks', str(m(41)) + ' ' + str(t[41]['entry'] and t[41]['entry']['description']))
check('en: "2 shirts and 1 jeans for 1500" is one entry of 1,500', len(t[42]['entries']) <= 1 and (t[42]['status'] == 'ask' or t[42]['entry']['amount'] == 1500), show(42))
check('en: "yesterday spent 300 on coffee and 120 on milk": both dated yesterday', [(e['amount'], e['date']) for e in t[43]['entries']] == [(300, '2026-10-09'), (120, '2026-10-09')], str([(e['amount'], e['date']) for e in t[43]['entries']]))
check('en: two entries, the second missing its person: asked "For entry 2…", then both stored', t[44]['asked'] == ['person'] and m(44) == [('expense', 450, 'Groceries & Household'), ('lent', 2000, 'shubham')], str(m(44)) + str(t[44]['asked']))
check('en: two entries, the second without a category: asked for it, then both stored', t[45]['asked'] == ['category'] and m(45) == [('expense', 450, 'Groceries & Household'), ('expense', 300, 'Shopping & Clothing')], str(m(45)))
check('en: "… then … then …" gives three entries', [e['amount'] for e in t[46]['entries']] == [100, 60, 40], str(m(46)))
check('hi: "… और …" gives two entries: किराना 450, पेट्रोल 200', m(47) == [('expense', 450, 'Groceries & Household'), ('expense', 200, 'Vehicle - Fuel')], str(m(47)))
check('hi: "चाय और समोसा 50 रुपये" is one entry', m(48) == [('expense', 50, 'Food & Dining')], str(m(48)))
check('hi: an expense and an income together; the missing category is asked for', t[49]['asked'] == ['category'] and m(49) == [('expense', 450, 'Groceries & Household'), ('income', 5000, 'Salary')], str(m(49)) + str(t[49]['asked']))
check('hi: "नहीं" to "क्या इसे सेव करूं?" → nothing stored', t[50]['status'] == 'abort' and t[50]['reason'] == 'declined', show(50))
check('the account is not assumed: asked for whenever it was not said', all(t[i]['accountAsked'] for i in [2, 5, 6, 12, 13, 14, 23, 24]) and not any(t[i]['accountAsked'] for i in [0, 1, 3, 4, 10]), str([(i, bool(t[i]['accountAsked'])) for i in [0, 1, 2, 3, 4, 5, 6, 10, 12, 13, 14, 23, 24]]))
check('en: "spent 450 on groceries" → asks "Which account did you pay from?" → "cash"', t[51]['asked'] == ['account'] and saved(51, accountId='cash', amount=450), show(51))
check('en: income without an account → asks which account it came into → "hdfc"', t[52]['asked'] == ['account'] and saved(52, type='income', accountId='hdfc'), show(52))
check('en: "from SBI" (no such account) → asked about, then "hdfc" is used; SBI is not part of the description', t[53]['asked'] == ['account'] and saved(53, accountId='hdfc', description='Groceries'), show(53))
check('en: "by axis card" (no such account) → asked about → "cash"', t[54]['asked'] == ['account'] and saved(54, accountId='cash', category='Food & Dining'), show(54))
check('en: answering with the unknown bank twice → gives up, nothing stored', t[55]['status'] == 'abort' and t[55]['reason'] == 'gaveUp', show(55))
check('en: an account said once covers both entries of the sentence, with no question', [e['accountId'] for e in t[56]['entries']] == ['hdfc', 'hdfc'] and t[56]['asked'] == [] and not t[56]['accountAsked'], show(56))
check('en: two entries without an account: asked once, the answer covers both', t[57]['asked'] == ['account'] and [e['accountId'] for e in t[57]['entries']] == ['cash', 'cash'], str(t[57]['asked']) + str([e['accountId'] for e in t[57]['entries']]))
check('en: "Transfer 5000 to cash" → asks from which account → "hdfc"', t[58]['asked'] == ['fromAccount'] and saved(58, accountId='hdfc', toAccountId='cash'), show(58))
check('hi: "एसबीआई से …" (no such account) → asked about → "कैश"', t[59]['asked'] == ['account'] and saved(59, accountId='cash', amount=450, category='Groceries & Household'), show(59))
check('hi: no account said → asks "किस अकाउंट से दिए?" → "एचडीएफसी"', t[60]['asked'] == ['account'] and saved(60, accountId='hdfc'), show(60))
check('en: "from xyz bank" (any unknown name before "bank") → asked about → "kotak" card', t[61]['asked'] == ['account'] and saved(61, accountId='card', amount=800), show(61))
want = [450, 2500, 1500, 200000, 555, 120000, 25, 250, 250000, 125, 175, 25000, 350, 150, 50, 2000, None, 450]
check('BUG FIX: answering "PNB bank" (no such account) is NOT stored on another bank: it is asked about again, then "hdfc" is used', t[62]['asked'] == ['account', 'account'] and saved(62, accountId='hdfc', amount=450), show(62))
check('…answering with two banks that do not exist → gives up, nothing stored', t[63]['status'] == 'abort' and t[63]['reason'] == 'gaveUp', show(63))
check('en: "pnb bank" without "from", and "p n b bank" said letter by letter: both asked about, neither left in the description', t[64]['asked'] == ['account'] and saved(64, accountId='cash', description='Lunch') and t[65]['asked'] == ['account'] and saved(65, accountId='cash', description='Lunch'), show(64) + ' // ' + show(65))
check('en: transfer from a bank that does not exist → asked from which account → "hdfc"', t[66]['asked'] == ['fromAccount'] and saved(66, type='transfer', accountId='hdfc', toAccountId='cash'), show(66))
check('hi: "पीएनबी बैंक से …" (no such account) → asked about → "कैश"', t[67]['asked'] == ['account'] and saved(67, accountId='cash', amount=450), show(67))
check('en: "a power bank" is a thing bought, not a bank: asked the ordinary account question', t[68]['asked'] == ['category', 'account'] and saved(68, accountId='cash', amount=1500) and 'ower bank' in t[68]['entry']['description'], show(68))
check('the second question names the missing bank: "You don\'t have an account called PNB Bank. …"', r['second'] == "You don't have an account called PNB Bank. Which account did you pay from? You have Cash, ICICI, HDFC Bank and Kotak Bank CC.", str(r['second']))
check('en: a bare "bank" still means the usual bank; "hdfc bank" means HDFC', saved(70, accountId='icici') and saved(71, accountId='hdfc'), show(70) + ' // ' + show(71))
check('en: income answered with "pnb" (not an account) → asked again → "icici"', t[72]['asked'] == ['account', 'account'] and saved(72, type='income', accountId='icici'), show(72))
check('more ways to say yes are understood: "ya", "yes please save it", "जी हाँ"', all(t[i]['status'] == 'save' for i in [73, 74, 75]), str([t[i]['status'] for i in [73, 74, 75]]))
check('yes in many forms, also as a phone writes it: yas, s, यस, ओके, "ठीक है", "कर दो"…', r['yn'][:19] == ['yes'] * 19, str(r['yn'][:19]))
check('no in many forms: know, नो, "मत करो"; a yes and a no together is a no', r['yn'][19:31] == ['no'] * 12, str(r['yn'][19:31]))
check('anything else is neither', r['yn'][31:] == [None, None, None, None], str(r['yn'][31:]))
check('the assistant hearing itself is ignored, real answers are not ("HDFC bank", "from hdfc bank", "yes", "store this")', r['echo'] == [False, True, True, False, False, False, True, False], str(r['echo']))
check('the spoken questions hold no word that could be taken as a yes or a no', r['wording'][0] == '450. Should I store this?' and r['wording'][1] == '450। क्या इसे दर्ज करूं?' and r['wording'][2:] == [None, None, None, None], str(r['wording']))
check('amounts for the voice: plain below one lakh, lakh and crore above, paise, Hindi words, other currencies by name', r['money'] == ['450 rupees', '45300 rupees', '1 lakh 50 thousand rupees', '1 crore 20 lakh 5 thousand 300 rupees', '2500 rupees 50 paise', '1 lakh rupees', '450 रुपये', '1 लाख 50 हज़ार रुपये', '2 करोड़ रुपये', '450 US dollars', '99.5 euros'], str(r['money']))
check('entries as sentences: "450 rupees for Groceries and Household, from HDFC Bank", "… lent to Shubham, from Cash", and in Hindi', r['words'] == ['450 rupees for Groceries and Household, from HDFC Bank', '5000 rupees, Salary, into ICICI', '5000 rupees from ICICI to Cash', '2000 rupees lent to Shubham, from Cash', '500 rupees got back from Yash, into Cash',
      'Groceries के लिए 450 रुपये, HDFC Bank से', 'शुभम को 2000 रुपये उधार, Cash से', 'ICICI से Cash में 5000 रुपये'], str(r['words']))
v = r['voices']
check('best voice: the natural Indian-English ones where the browser has them (Neerja for female, Prabhat for male)', v['edgeF'] == ['Microsoft Neerja Online (Natural) - English (India)', 'female'] and v['edgeM'] == ['Microsoft Prabhat Online (Natural) - English (India)', 'male'], str([v['edgeF'], v['edgeM']]))
check('…on a Mac: Veena (female) and Rishi (male); Hindi: Lekha or Google हिन्दी; never Zarvox or a French voice', v['macF'][0] == 'Veena' and v['macM'][0] == 'Rishi' and v['hiF'][0] in ('Lekha', 'Google हिन्दी') and v['novelty'] and v['french'], str([v['macF'], v['macM'], v['hiF']]))
check('…no Indian male voice: a real male English voice (Daniel) rather than a pitched female one; no male Hindi voice: the Hindi one is used', v['noIndianMale'] == ['Daniel', 'male'] and v['hiM'][0] in ('Lekha', 'Google हिन्दी') and v['hiM'][1] == 'female', str([v['noIndianMale'], v['hiM']]))
check('…a phone that only lists "English India": that voice is used (gender unknown)', v['android'] == ['English India', None], str(v['android']))
f = r['fix']
check('at the confirmation, "make it 500" changes the amount, says "Changed." and asks again; "yes" then stores 500', f['amount']['status'] == 'save' and f['amount']['e']['amount'] == 500 and f['amount']['said'][0] == 'Changed. 500. Should I store this?', str(f['amount']))
check('…"from cash" changes the account; "category food" changes the category', f['account']['e']['accountId'] == 'cash' and f['account']['e']['amount'] == 450 and f['category']['e']['category'] == 'Food & Dining' and f['category']['e']['accountId'] == 'hdfc', str(f['account']['e']) + str(f['category']['e']))
check('…a plain "no" is still a no; with several entries a spoken change is not guessed at (it asks again)', f['both']['status'] == 'abort' and f['many']['status'] == 'confirm' and f['many']['said'][0] == 'Sorry, I missed that. Should I store this?', str(f['both']['status']) + str(f['many']))
check('edit(): amount, category, account, date and description of a reviewed entry can all be changed', f['edited']['amount'] == 512.5 and f['edited']['category'] == 'Food & Dining' and f['edited']['accountId'] == 'cash' and f['edited']['date'] == '2026-10-08' and f['edited']['description'] == 'Lunch out', str(f['edited']))
check('edit(): a cleared category or amount stays cleared (Save then refuses it), also after "yes"', f['cleared']['categoryId'] is None and f['cleared']['amount'] is None and f['afterYes']['categoryId'] is None, str(f['cleared']))
check('heard pieces are merged without repeats (a phone re-sends the sentence so far with each word)', r['joined'] == ['spent 450 on groceries', 'spent 450 on groceries', 'spent 450 on groceries', 'Spent 450 on groceries from cash', 'spent 450 on groceries', 'Yes', 'किराने पर 450 रुपये खर्च किए'], str(r['joined']))
a = r['asks']
check('wording: "Which account did you pay from?" / "…did it come into?"', a[0] == 'Which account did you pay from?' and a[1] == 'Which account did it come into?', str(a[:2]))
check('wording for an unknown bank: says so and lists the accounts there are', a[2] == "You don't have an account called SBI. Which account did you pay from? You have Cash, ICICI, HDFC Bank and Kotak Bank CC.", a[2])
check('Hindi wording: "एसबीआई नाम का कोई अकाउंट नहीं है। किस अकाउंट से दिए? आपके अकाउंट हैं: …" and "किस अकाउंट से दिए?"', a[3].startswith('एसबीआई नाम का कोई अकाउंट नहीं है। किस अकाउंट से दिए? आपके अकाउंट हैं: Cash') and a[4] == 'किस अकाउंट से दिए?', a[3] + ' // ' + a[4])
check('only one account exists: it is used without asking; no account at all: nothing stored, told to add one', r['one'] == {'status': 'confirm', 'account': 'icici'} and r['none']['status'] == 'abort' and r['none']['reason'] == 'noAccounts', str(r['one']) + str(r['none']))
check('numbers: four fifty, lakhs, "and", ढाई लाख, सवा सौ, पौने दो सौ, साढ़े तीन सौ, Hindi in English letters, Hindi digits', r['nums'] == want, str(r['nums']))
check('no errors in the browser', not errors, str(errors[:2]))
print(f'{sum(checks)}/{len(checks)} checks passed')
sys.exit(0 if all(checks) else 1)
