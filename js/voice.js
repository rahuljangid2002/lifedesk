// Voice entry: turning a spoken sentence into an entry, and asking for whatever is still missing.
// There is no speech and no storage in this file (the browser listens and speaks, see app.js): only plain rules,
// in English and Hindi, so they can be tested on their own. Nothing here calls a service.
//
//   const s = createSession('en');
//   hear(s, 'spent 450 on groceries and 200 on petrol', ctx)   -> { status: 'confirm', items: [two entries], say }
//   hear(s, 'yes', ctx)                                        -> { status: 'save', items }      (only now is anything stored)
//   hear(s, 'lent 2000', ctx)                                  -> { status: 'ask', say: 'Who did you lend it to?' }
//   hear(s, 'hello there', ctx)                                -> { status: 'abort', say: "I didn't catch an entry…" }
//
// ctx = { accounts (open ones), categories, people, entries, today: 'yyyy-mm-dd', defaultAccountId, suggest(description, type) }

export const LANGS = { en: { code: 'en-IN', label: 'English' }, hi: { code: 'hi-IN', label: 'हिन्दी' } };

// ---------- what the recogniser heard ----------
/**
 * Puts the pieces a recogniser hands over into one sentence. Some browsers (Chrome on Android, while it keeps
 * listening) send the whole sentence so far again with every new word; others send each part once. So a piece
 * that continues what is already there replaces it, a piece already contained is skipped, and anything else is added.
 */
export function joinHeard(pieces) {
    let all = '';
    for (const raw of pieces) {
        const piece = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!piece) {
            continue;
        }
        const a = all.toLowerCase();
        const p = piece.toLowerCase();
        if (!all || p.startsWith(a)) {
            all = piece; // the same sentence, grown
        } else if (a.endsWith(p) || a.includes(` ${p} `) || a.startsWith(`${p} `)) {
            // said already
        } else {
            // overlap at the join ("spent 450 on" + "450 on groceries") is not repeated
            const aw = all.split(' ');
            const pw = piece.split(' ');
            let k = Math.min(aw.length, pw.length);
            while (k > 0 && aw.slice(-k).join(' ').toLowerCase() !== pw.slice(0, k).join(' ').toLowerCase()) {
                k -= 1;
            }
            all = `${all} ${pw.slice(k).join(' ')}`.trim();
        }
    }
    return all;
}

/**
 * True when what was "heard" is the assistant's own voice coming back through the microphone: a run of its words,
 * in the same order, is part of what was just spoken. Such a piece is ignored, not taken as an answer.
 * (For the same reason the spoken questions avoid the words "yes", "no" and "save": a scrap of the question picked
 * up by the microphone must never read as an answer.)
 */
export function isEcho(heard, spoken) {
    const h = tidy(heard).split(' ').filter(Boolean);
    const said = tidy(spoken).split(' ').filter(Boolean);
    if (h.length < 3 || said.length < 3) {
        return false; // one or two words ("yes", "HDFC bank") are an answer, not an echo
    }
    // the longest run of words that appear in the same order in what was spoken
    let best = 0;
    for (let i = 0; i < h.length; i += 1) {
        for (let j = 0; j < said.length; j += 1) {
            let k = 0;
            while (i + k < h.length && j + k < said.length && h[i + k] === said[j + k]) {
                k += 1;
            }
            best = Math.max(best, k);
        }
    }
    return best >= Math.max(3, Math.ceil(h.length * 0.7));
}

// ---------- numbers ----------
const EN_NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const HI_NUM_LIST = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पांच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
    'बीस', 'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाईस', 'उनतीस', 'तीस', 'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस',
    'चालीस', 'इकतालीस', 'बयालीस', 'तैंतालीस', 'चौवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास', 'पचास', 'इक्यावन', 'बावन', 'तिरपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ',
    'साठ', 'इकसठ', 'बासठ', 'तिरसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सड़सठ', 'अड़सठ', 'उनहत्तर', 'सत्तर', 'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी',
    'अस्सी', 'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी', 'नब्बे', 'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे'];
const HI_NUM = Object.fromEntries(HI_NUM_LIST.map((w, i) => [w, i]));
// other common spellings
Object.assign(HI_NUM, { 'पाँच': 5, 'छः': 6, 'छे': 6, 'छ': 6, 'पन्द्रह': 15, 'पंद्रा': 15, 'अठ्ठाईस': 28, 'उन्तीस': 29, 'चौतीस': 34, 'पैतीस': 35, 'चवालीस': 44, 'पैंतालिस': 45, 'पचपन': 55, 'नब्बें': 90 });
// Hindi written in English letters (only read when Hindi is the chosen language: "do" and "char" are English words too)
const HI_ROMAN = { ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13,
    chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, bis: 20, pachees: 25, pachis: 25, tees: 30, tis: 30, chalis: 40, chaalis: 40, pachas: 50, pachaas: 50,
    sattar: 70, assi: 80, nabbe: 90 };
const MULT = { hundred: 100, hundreds: 100, 'सौ': 100, sau: 100, thousand: 1000, thousands: 1000, k: 1000, 'हजार': 1000, 'हज़ार': 1000, hazaar: 1000, hazar: 1000,
    lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, 'लाख': 1e5, crore: 1e7, crores: 1e7, 'करोड़': 1e7, 'करोड': 1e7, million: 1e6 };
// "डेढ़ सौ" = 150, "ढाई हज़ार" = 2,500, "साढ़े तीन सौ" = 350, "सवा सौ" = 125, "पौने दो सौ" = 175
const FRACTION = { 'डेढ़': ['is', 1.5], 'डेढ': ['is', 1.5], dedh: ['is', 1.5], 'ढाई': ['is', 2.5], dhai: ['is', 2.5], 'साढ़े': ['add', 0.5], 'साढे': ['add', 0.5], sadhe: ['add', 0.5],
    'सवा': ['add', 0.25], sava: ['add', 0.25], 'पौने': ['add', -0.25], paune: ['add', -0.25] };
const CURRENCY = ['rupees', 'rupee', 'rs', 'inr', 'bucks', 'रुपये', 'रुपए', 'रुपया', 'रुपय', 'रू', 'रु', 'rupaye', 'rupay', 'rupaiye', 'rupya', 'dollars', 'dollar', 'euros', 'euro', 'pounds'];

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
/** Lower case, digits in one script, amounts without commas, punctuation gone. */
export function tidy(text) {
    return String(text || '').toLowerCase()
        .replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS.indexOf(d))
        .replace(/[₹$€£]/g, ' rupees ')
        .replace(/(\d),(?=\d)/g, '$1')
        .replace(/(\d)\s*(k|lakh|lac|crore)\b/g, '$1 $2')
        .replace(/\brs\.?(?=\s|\d|$)/g, ' rupees ')
        .replace(/(\d)(st|nd|rd|th)\b/g, '$1 th')
        .replace(/[.,!?;:"“”‘’'()।\-]+(?=\s|$)/g, ' ')
        .replace(/[!?;:"“”‘’()।]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}
const words = (text) => (text ? text.split(' ') : []);

function numberOf(word, lang) {
    if (/^\d+(\.\d+)?$/.test(word)) {
        return Number(word);
    }
    if (word in EN_NUM) {
        return EN_NUM[word];
    }
    if (word in HI_NUM) {
        return HI_NUM[word];
    }
    return lang === 'hi' && word in HI_ROMAN ? HI_ROMAN[word] : null;
}

/**
 * Every number spoken in the words: [{ value, from, to (word positions, to is exclusive), money: true when a
 * currency word sits next to it }]. "four fifty" is 450, "two thousand five hundred" 2,500, "डेढ़ लाख" 1,50,000.
 */
export function numbersIn(list, lang) {
    const found = [];
    let i = 0;
    while (i < list.length) {
        let total = 0; // thousands, lakhs and crores already closed
        let current = 0; // the part still being built (up to 999)
        let add = 0; // from "साढ़े", "सवा", "पौने": applied to the next number
        let used = false;
        let multiplied = false;
        let j = i;
        for (; j < list.length; j += 1) {
            const word = list[j];
            const n = numberOf(word, lang);
            const spoken = !/^\d/.test(word); // a number word, not digits
            if (word in FRACTION && (lang === 'hi' || /[^\x00-\x7f]/.test(word))) {
                const [kind, value] = FRACTION[word];
                if (kind === 'is') {
                    current = value;
                } else {
                    add = value;
                }
                used = true;
            } else if (n !== null) {
                const tail = current % 100;
                if (current === 0) {
                    current = n + add;
                    add = 0;
                } else if (!spoken) {
                    break; // two separate figures side by side ("2 450")
                } else if (current >= 100 && tail === 0 && n < 100) {
                    current += n; // "five hundred fifty"
                } else if (tail >= 20 && tail % 10 === 0 && n < 10) {
                    current += n; // "twenty five", "five hundred fifty five"
                } else if (current >= 1 && current <= 9 && n >= 10 && n <= 99 && !multiplied && Number.isInteger(current) && !/^\d/.test(list[j - 1])) {
                    current = current * 100 + n; // "four fifty"
                } else {
                    break;
                }
                used = true;
            } else if (word in MULT && (used || MULT[word] >= 100) && !(word === 'k' && !used)) {
                const m = MULT[word];
                const base = current ? current : 1 + add;
                add = 0;
                if (m === 100) {
                    current = base * 100;
                } else {
                    total += base * m;
                    current = 0;
                }
                used = true;
                multiplied = true;
            } else if (word === 'and' && used && j + 1 < list.length && numberOf(list[j + 1], lang) !== null) {
                continue;
            } else {
                break;
            }
        }
        if (used && j > i) {
            const value = Math.round((total + current) * 100) / 100;
            const money = CURRENCY.includes(list[j]) || CURRENCY.includes(list[i - 1]);
            if (value > 0) {
                found.push({ value, from: i, to: j, money });
            }
            i = j;
        } else {
            i += 1;
        }
    }
    return found;
}

// ---------- what kind of entry ----------
// Checked in this order: the more specific phrases first ("got back" before "got", "उधार दिया" before "दिया").
const TYPE_WORDS = [
    ['gotback', ['got back', 'received back', 'paid me back', 'returned to me', 'returned my', 'gave back', 'gave me back', 'वापस मिले', 'वापस मिला', 'वापस मिली', 'वापस आए', 'वापस आया', 'लौटाए', 'लौटाया', 'लौटा दिए', 'लौटा दिया',
        'wapas mile', 'wapas mila', 'wapas aaye', 'lautaye', 'lautaya', 'lauta diye', 'lauta diya']],
    ['repaid', ['repaid', 'paid back', 'pay back', 'returned to', 'gave back to', 'वापस दिए', 'वापस दिया', 'वापस किए', 'वापस किया', 'चुकाए', 'चुकाया', 'चुका दिए', 'चुका दिया', 'wapas diye', 'wapas diya', 'wapas kiye', 'chukaye', 'chukaya', 'chuka diye', 'chuka diya']],
    ['lent', ['lent', 'lend', 'loaned', 'gave a loan', 'उधार दिए', 'उधार दिया', 'उधार दी', 'को उधार', 'udhaar diye', 'udhaar diya', 'udhar diye', 'udhar diya', 'ko udhaar', 'ko udhar']],
    ['borrowed', ['borrowed', 'borrow', 'took a loan', 'took from', 'taken from', 'उधार लिए', 'उधार लिया', 'उधार ली', 'से उधार', 'udhaar liye', 'udhaar liya', 'udhar liye', 'udhar liya', 'se udhaar', 'se udhar']],
    ['transfer', ['transferred', 'transfer', 'moved', 'withdrew', 'withdrawn', 'withdraw', 'deposited', 'deposit', 'ट्रांसफर', 'ट्रान्सफर', 'निकाले', 'निकाला', 'जमा किए', 'जमा किया', 'जमा कर', 'nikale', 'nikala', 'jama kiye', 'jama kiya']],
    ['asset', ['asset', 'एसेट', 'संपत्ति']],
    ['income', ['received', 'receive', 'earned', 'income', 'credited', 'salary', 'got paid', 'got', 'मिले', 'मिला', 'मिली', 'आए', 'आया', 'आई', 'कमाए', 'कमाया', 'सैलरी', 'वेतन', 'तनख्वाह', 'आमदनी', 'mile', 'mila', 'mili', 'aaye', 'aaya', 'kamaye', 'kamaya', 'tankhwah', 'aamdani']],
    ['expense', ['spent', 'spend', 'paid', 'pay', 'bought', 'purchased', 'expense', 'cost', 'खर्च', 'खर्चा', 'दिए', 'दिया', 'दी', 'भरे', 'भरा', 'खरीदे', 'खरीदा', 'खरीदी', 'लगे', 'kharch', 'kharcha', 'diye', 'diya', 'bhare', 'bhara', 'kharide', 'kharida', 'kharidi', 'lage']]
];
const KIND_NOUNS = ['salary', 'income', 'सैलरी', 'वेतन', 'तनख्वाह', 'आमदनी', 'tankhwah', 'aamdani'];
const padded = (text) => ` ${text} `;
function typeIn(text) {
    const t = padded(text);
    for (const [type, list] of TYPE_WORDS) {
        const hit = list.find((w) => t.includes(` ${w} `));
        if (hit) {
            return { type, word: hit };
        }
    }
    return null;
}

// ---------- names: accounts, people, categories ----------
const HINDI_LETTERS = [['डब्ल्यू', 'w'], ['एक्स', 'x'], ['क्यू', 'q'], ['जेड', 'z'], ['ज़ेड', 'z'], ['वाई', 'y'], ['आई', 'i'], ['एच', 'h'], ['एफ', 'f'], ['एल', 'l'], ['एम', 'm'], ['एन', 'n'], ['एस', 's'],
    ['बी', 'b'], ['सी', 'c'], ['डी', 'd'], ['जी', 'g'], ['जे', 'j'], ['के', 'k'], ['पी', 'p'], ['टी', 't'], ['यू', 'u'], ['वी', 'v'], ['आर', 'r'], ['ओ', 'o'], ['ई', 'e'], ['ए', 'a']];
/** "एचडीएफसी" -> "hdfc", "आईसीआईसीआई" -> "icici" (English letters spelt out in Hindi); null when the word is not that. */
function hindiAcronym(word) {
    let rest = word;
    let out = '';
    while (rest) {
        const hit = HINDI_LETTERS.find(([h]) => rest.startsWith(h));
        if (!hit) {
            return null;
        }
        out += hit[1];
        rest = rest.slice(hit[0].length);
    }
    return out.length >= 2 ? out : null;
}
const CONSONANTS = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ङ': 'n', 'ञ': 'n', 'ं': 'n', 'ँ': 'n' };
/** The consonants of a name, in English letters: how "शुभम" and "Shubham" are told to be the same name. */
function skeleton(name) {
    const s = String(name || '').toLowerCase();
    if (/[ऀ-ॿ]/.test(s)) {
        return [...s].map((ch) => CONSONANTS[ch] || '').join('').replace(/w/g, 'v');
    }
    return s.replace(/[^a-z]/g, '').replace(/ph/g, 'f').replace(/w/g, 'v').replace(/ee|oo|[aeiou]/g, '').replace(/(.)\1+/g, '$1');
}
const plainName = (name) => tidy(String(name || '').replace(/\(sample\)/i, ''));
const FILLER_NAME_WORDS = ['bank', 'account', 'card', 'credit', 'wallet', 'cash', 'the', 'my', 'main', 'savings', 'saving'];

/** The thing (account, person, category) whose name is said in the text, longest name first; null when none is. */
export function named(text, things) {
    const t = padded(text);
    const said = words(text);
    const spelt = said.map((w) => hindiAcronym(w)).filter(Boolean);
    const sounds = said.filter((w) => /[ऀ-ॿ]/.test(w) && w.length >= 3).map(skeleton).filter((s) => s.length >= 3);
    let best = null;
    let bestLen = 0;
    for (const thing of things) {
        const name = plainName(thing.name);
        if (!name) {
            continue;
        }
        const first = name.split(' ').find((w) => w.length >= 3 && !FILLER_NAME_WORDS.includes(w));
        let len = 0;
        if (t.includes(` ${name} `)) {
            len = name.length + 100;
        } else if (first && t.includes(` ${first} `)) {
            len = first.length;
        } else if (first && spelt.includes(first)) {
            len = first.length;
        } else if (first && first.length >= 4 && sounds.includes(skeleton(first))) {
            len = first.length - 1;
        }
        if (len > bestLen) {
            best = thing;
            bestLen = len;
        }
    }
    return best;
}

const KIND_WORDS = { cash: ['cash', 'कैश', 'नकद', 'नगद', 'naqad', 'nakad'], card: ['credit card', 'card', 'क्रेडिट कार्ड', 'कार्ड'], wallet: ['wallet', 'paytm', 'phonepe', 'gpay', 'upi', 'वॉलेट', 'पेटीएम'], bank: ['bank', 'बैंक'] };
function accountByKind(text, accounts, defaultId) {
    const t = padded(text);
    for (const [kind, list] of Object.entries(KIND_WORDS)) {
        if (list.some((w) => t.includes(` ${w} `))) {
            const ofKind = accounts.filter((a) => a.kind === kind);
            if (ofKind.length) {
                return ofKind.find((a) => a.id === defaultId) || ofKind.find((a) => a.isDefault) || ofKind[0];
            }
        }
    }
    return null;
}

// Names people call a bank, card or wallet by. When one is said and no account of the user's has that name, the
// assistant says so and asks which account to use, rather than quietly using another one.
const BANK_NAMES = ['sbi', 'hdfc', 'icici', 'axis', 'kotak', 'pnb', 'bob', 'boi', 'canara', 'idfc', 'indusind', 'idbi', 'federal', 'rbl', 'uco', 'citi', 'hsbc', 'amex', 'paytm', 'phonepe', 'gpay', 'mobikwik', 'cred', 'slice',
    'bajaj', 'yes bank', 'union bank', 'state bank', 'bank of india', 'bank of baroda', 'punjab national', 'indian bank', 'central bank', 'google pay', 'amazon pay', 'credit card', 'debit card',
    'एसबीआई', 'एचडीएफसी', 'आईसीआईसीआई', 'एक्सिस', 'कोटक', 'पीएनबी', 'केनरा', 'पेटीएम', 'फोनपे', 'स्टेट बैंक', 'क्रेडिट कार्ड', 'डेबिट कार्ड'];
// things that are bought, not paid from: "a power bank", "a gift card", "a memory card"
const THINGS = ['power', 'piggy', 'blood', 'food', 'data', 'river', 'question', 'sim', 'gift', 'greeting', 'business', 'visiting', 'id', 'aadhaar', 'aadhar', 'pan', 'ration', 'memory', 'sd'];
const NOT_A_BANK = [...THINGS, 'my', 'the', 'a', 'credit', 'debit', 'new', 'another', 'other', 'which', 'what', 'any', 'same'];
const GENERIC_ACCOUNT_WORDS = ['credit card', 'debit card', 'क्रेडिट कार्ड', 'डेबिट कार्ड'];
const ACCOUNT_NOUNS = ['bank', 'account', 'card', 'wallet', 'बैंक', 'खाते', 'खाता', 'अकाउंट', 'कार्ड', 'वॉलेट'];
const BEFORE_ACCOUNT = ['from', 'by', 'using', 'via', 'through', 'in', 'into', 'to', 'with'];
/** A bank / card / wallet named in the words that is not one of the user's accounts: { name, from, to }, or null. */
function strangerAccount(list) {
    const text = padded(list.join(' '));
    for (const name of BANK_NAMES) {
        const at = text.indexOf(` ${name} `);
        if (at >= 0) {
            const from = text.slice(0, at).split(' ').filter(Boolean).length;
            const size = name.split(' ').length;
            const withNoun = ACCOUNT_NOUNS.includes(list[from + size]) ? 1 : 0;
            return { name: list.slice(from, from + size + withNoun).join(' '), from, to: from + size + withNoun };
        }
    }
    // "pnb bank", "from xyz bank", "abc card", "p n b bank", "xyz बैंक से": a name right before the word bank / card / wallet
    for (let i = 1; i < list.length; i += 1) {
        const before = list[i - 1];
        if (ACCOUNT_NOUNS.includes(list[i]) && !SMALL_WORDS.has(before) && numberOf(before, 'en') === null && !ACCOUNT_NOUNS.includes(before) && before !== '·'
            && !NOT_A_BANK.includes(before) && !TYPE_WORDS.some(([, l]) => l.includes(before))) {
            let from = i - 1;
            while (before.length === 1 && from > 0 && list[from - 1].length === 1 && /[a-z]/.test(list[from - 1])) {
                from -= 1; // letters said one by one: "p n b bank"
            }
            const name = from < i - 1 ? `${list.slice(from, i).join('')} ${list[i]}` : `${before} ${list[i]}`;
            return { name, from, to: i + 1 };
        }
    }
    return null;
}
/**
 * Which account the words mean: { account } (one of the user's), { stranger } (a bank / card / wallet that was
 * named but is not one of theirs: it must be asked about, never replaced by another), or null (none said).
 * The user's own account names are looked for first; a bare "cash" or "card" comes last.
 */
function whichAccount(text, ctx) {
    const own = named(text, ctx.accounts);
    if (own) {
        return { account: own };
    }
    const list = words(text).map((w, i, all) => ((ACCOUNT_NOUNS.includes(w) && THINGS.includes(all[i - 1])) || (THINGS.includes(w) && ACCOUNT_NOUNS.includes(all[i + 1])) ? '·' : w));
    const byKind = accountByKind(list.join(' '), ctx.accounts, ctx.defaultAccountId); // "a power bank" is not "my bank"
    const stranger = strangerAccount(list);
    if (stranger && !(GENERIC_ACCOUNT_WORDS.includes(stranger.name) && byKind)) {
        return { stranger };
    }
    return byKind ? { account: byKind } : null;
}
const nameCase = (name) => (/[\u0900-\u097f]/.test(name) ? name : name.split(' ').map((w) => (w.length <= 4 && !ACCOUNT_NOUNS.includes(w) && !['yes', 'cred', 'bank'].includes(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' '));

// Hindi words that point to a category: the English word the categories' own keywords use is added to the description
const HINDI_HINTS = { 'खाना': 'food', 'खाने': 'food', 'चाय': 'tea', 'नाश्ता': 'breakfast', 'नाश्ते': 'breakfast', 'कॉफी': 'coffee', 'लंच': 'lunch', 'डिनर': 'dinner', 'मिठाई': 'sweets', 'पिज्जा': 'pizza',
    'दूध': 'milk', 'सब्जी': 'vegetables', 'सब्ज़ी': 'vegetables', 'सब्जियां': 'vegetables', 'फल': 'fruits', 'किराना': 'grocery', 'किराने': 'grocery', 'राशन': 'grocery', 'पेट्रोल': 'petrol', 'डीजल': 'diesel', 'डीज़ल': 'diesel',
    'किराया': 'rent', 'किराए': 'rent', 'बिजली': 'electricity', 'रिचार्ज': 'recharge', 'मोबाइल': 'mobile', 'इंटरनेट': 'internet', 'गैस': 'gas', 'पानी': 'water', 'दवाई': 'medicine', 'दवा': 'medicine', 'दवाइयां': 'medicine',
    'डॉक्टर': 'doctor', 'अस्पताल': 'hospital', 'कपड़े': 'clothes', 'कपड़ों': 'clothes', 'जूते': 'shoes', 'फिल्म': 'movie', 'मूवी': 'movie', 'टैक्सी': 'taxi', 'ऑटो': 'auto', 'ट्रेन': 'train', 'टिकट': 'ticket', 'फीस': 'fees',
    'स्कूल': 'school', 'सैलरी': 'salary', 'वेतन': 'salary', 'तनख्वाह': 'salary', 'ब्याज': 'interest', 'बीमा': 'insurance', 'जिम': 'gym', 'ईएमआई': 'emi', 'किस्त': 'emi', 'शॉपिंग': 'shopping', 'तोहफा': 'gift', 'गिफ्ट': 'gift',
    khana: 'food', khane: 'food', chai: 'tea', nashta: 'breakfast', doodh: 'milk', dudh: 'milk', sabzi: 'vegetables', sabji: 'vegetables', kirana: 'grocery', ration: 'grocery', kiraya: 'rent', bijli: 'electricity',
    dawai: 'medicine', dawa: 'medicine', kapde: 'clothes', mithai: 'sweets', byaj: 'interest', bima: 'insurance', kist: 'emi' };

// ---------- dates ----------
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const HI_MONTHS = ['जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
const DAYS = [['sunday', 'रविवार', 'इतवार'], ['monday', 'सोमवार'], ['tuesday', 'मंगलवार'], ['wednesday', 'बुधवार'], ['thursday', 'गुरुवार', 'बृहस्पतिवार'], ['friday', 'शुक्रवार'], ['saturday', 'शनिवार']];
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (iso) => new Date(`${iso}T00:00:00`);
/** The date said, and the word positions it used: { date, from, to }, or null (then it is today). Never a future day. */
function dateIn(list, today) {
    const shift = (n) => { const d = dayOf(today); d.setDate(d.getDate() + n); return isoOf(d); };
    const text = list.join(' ');
    const at = (phrase) => {
        const parts = phrase.split(' ');
        for (let i = 0; i + parts.length <= list.length; i += 1) {
            if (parts.every((p, k) => list[i + k] === p)) {
                return { from: i, to: i + parts.length };
            }
        }
        return null;
    };
    for (const [phrase, back] of [['day before yesterday', 2], ['परसों', 2], ['parso', 2], ['parson', 2], ['yesterday', 1], ['कल', 1], ['today', 0], ['आज', 0], ['aaj', 0]]) {
        const hit = at(phrase);
        if (hit) {
            return { date: shift(-back), ...hit };
        }
    }
    if (padded(text).includes(' kal ')) {
        return { date: shift(-1), ...at('kal') };
    }
    for (let i = 0; i < list.length; i += 1) {
        // "on monday", "last friday", "सोमवार को": the most recent such day
        const dow = DAYS.findIndex((names) => names.includes(list[i]));
        if (dow >= 0) {
            const now = dayOf(today).getDay();
            const back = (now - dow + 7) % 7 || 7;
            const from = ['on', 'last', 'पिछले'].includes(list[i - 1]) ? i - 1 : i;
            return { date: shift(-back), from, to: list[i + 1] === 'को' ? i + 2 : i + 1 };
        }
        // "5 october", "october 5", "on the 5th", "5 तारीख"
        const month = MONTHS.findIndex((m) => m === list[i] || m.slice(0, 3) === list[i]);
        const hiMonth = HI_MONTHS.indexOf(list[i]);
        const m = month >= 0 ? month : hiMonth;
        if (m >= 0) {
            const before = /^\d{1,2}$/.test(list[i - 1] || '') ? i - 1 : list[i - 1] === 'th' && /^\d{1,2}$/.test(list[i - 2] || '') ? i - 2 : -1;
            const after = /^\d{1,2}$/.test(list[i + 1] || '') ? i + 1 : -1;
            const dayAt = before >= 0 ? before : after;
            if (dayAt >= 0) {
                const year = dayOf(today).getFullYear();
                let d = new Date(year, m, Number(list[dayAt]));
                if (isoOf(d) > today) {
                    d = new Date(year - 1, m, Number(list[dayAt]));
                }
                const to = Math.max(i, dayAt, list[dayAt + 1] === 'th' ? dayAt + 1 : 0) + 1;
                const from = Math.min(i, dayAt);
                return { date: isoOf(d), from: ['on', 'the'].includes(list[from - 1]) ? from - 1 : from, to };
            }
        }
        if (/^\d{1,2}$/.test(list[i]) && (list[i + 1] === 'th' || list[i + 1] === 'तारीख' || list[i + 1] === 'tarikh') && Number(list[i]) >= 1 && Number(list[i]) <= 31) {
            const now = dayOf(today);
            let d = new Date(now.getFullYear(), now.getMonth(), Number(list[i]));
            if (isoOf(d) > today) {
                d = new Date(now.getFullYear(), now.getMonth() - 1, Number(list[i]));
            }
            let from = i;
            while (['on', 'the'].includes(list[from - 1])) {
                from -= 1;
            }
            return { date: isoOf(d), from, to: list[i + 2] === 'को' ? i + 3 : i + 2 };
        }
    }
    return null;
}

// ---------- one sentence ----------
const SMALL_WORDS = new Set(['i', 'i\'ve', 'have', 'had', 'just', 'a', 'an', 'the', 'of', 'for', 'on', 'in', 'into', 'at', 'to', 'from', 'by', 'via', 'using', 'with', 'my', 'me', 'was', 'is', 'it', 'and', 'some', 'worth', 'please', 'add',
    'entry', 'amount', 'money', 'account', 'th', 'today', 'as', 'that', 'this', 'up',
    'मैंने', 'मैने', 'मुझे', 'मेरे', 'मेरी', 'मेरा', 'में', 'से', 'को', 'का', 'की', 'के', 'पर', 'लिए', 'किए', 'किया', 'कर', 'हैं', 'है', 'थे', 'था', 'हुए', 'हुआ', 'ने', 'और', 'एक', 'खाते', 'अकाउंट', 'गए', 'गया', 'दिए', 'दिया',
    'maine', 'mujhe', 'mere', 'meri', 'mera', 'mein', 'me', 'se', 'ko', 'ka', 'ki', 'ke', 'par', 'liye', 'kiye', 'kiya', 'hain', 'hai', 'the', 'tha', 'hue', 'hua', 'ne', 'aur']);
const TITLE = (s) => s.replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());

/**
 * What one sentence says: { type, typeSaid, amount, date, accountId, accountSaid, toAccountId, personId, newPerson,
 * categoryId, description }. Nothing is guessed that was not said, except the type (an amount alone is an expense).
 */
export function understand(raw, ctx, lang = 'en', carried = null) {
    let text = tidy(raw);
    let list = words(text);
    const out = { type: 'expense', typeSaid: false, amount: null, date: ctx.today, dateSaid: false, accountId: null, accountSaid: false, strangerAccount: null, toAccountId: null, personId: null, newPerson: null, categoryId: null, description: '' };
    const drop = new Set(); // word positions that are not part of the description

    const when = dateIn(list, ctx.today);
    if (when) {
        out.date = when.date;
        out.dateSaid = true;
        for (let i = when.from; i < when.to; i += 1) {
            drop.add(i);
        }
    }
    const kept = list.map((w, i) => (drop.has(i) ? '·' : w)); // the date's own number must not be read as the amount
    const numbers = numbersIn(kept, lang);
    const pick = numbers.find((n) => n.money) || [...numbers].sort((a, b) => b.value - a.value)[0];
    if (pick) {
        out.amount = pick.value;
        for (let i = pick.from; i < pick.to; i += 1) {
            drop.add(i);
        }
    }
    list.forEach((w, i) => {
        if (CURRENCY.includes(w)) {
            drop.add(i);
        }
    });

    const kind = typeIn(text);
    if (kind) {
        out.type = kind.type;
        out.typeSaid = true;
    } else if (carried) {
        out.type = carried.type; // "spent 450 on groceries and 200 on petrol": the second one is spent too
    }
    if (!out.dateSaid && carried && carried.dateSaid) {
        out.date = carried.date; // "yesterday … and …": both were yesterday
        out.dateSaid = true;
    }
    const dropPhrase = (phrase) => {
        const parts = phrase.split(' ');
        for (let i = 0; i + parts.length <= list.length; i += 1) {
            if (parts.every((p, k) => list[i + k] === p)) {
                parts.forEach((p, k) => drop.add(i + k));
            }
        }
    };
    if (kind && !KIND_NOUNS.includes(kind.word)) {
        dropPhrase(kind.word); // "spent", "received"… are not part of the description; "salary" is
    }
    const dropName = (thing) => {
        if (!thing) {
            return;
        }
        const name = plainName(thing.name);
        dropPhrase(name);
        const first = name.split(' ').find((w) => w.length >= 3 && !FILLER_NAME_WORDS.includes(w));
        list.forEach((w, i) => {
            if (w === first || hindiAcronym(w) === first || (first && first.length >= 4 && /[ऀ-ॿ]/.test(w) && skeleton(w) === skeleton(first))) {
                drop.add(i);
            }
        });
    };

    // accounts: for a transfer, "from X to Y" (X से Y में); otherwise the one account said
    if (out.type === 'transfer') {
        const split = text.match(/^(.*?)\s(?:to|into|में|mein)\s(.*)$/);
        const hiSplit = text.match(/^(.*?)\sसे\s(.*)$/) || text.match(/^(.*?)\sse\s(.*)$/);
        let from = null;
        let to = null;
        const own = (part) => { const w = whichAccount(part, ctx); return w && w.account ? w.account : null; };
        if (hiSplit && own(hiSplit[1]) && own(hiSplit[2])) {
            from = own(hiSplit[1]);
            to = own(hiSplit[2]);
        } else if (split) {
            from = own(split[1]);
            to = own(split[2]);
        } else {
            from = own(text);
        }
        const t = padded(text);
        if (!to && [' withdrew ', ' withdrawn ', ' withdraw ', ' निकाले ', ' निकाला ', ' nikale ', ' nikala '].some((w) => t.includes(w))) {
            to = ctx.accounts.find((a) => a.kind === 'cash') || null; // taking money out of the bank
        }
        if ([' deposited ', ' deposit ', ' जमा '].some((w) => t.includes(w)) && from && !to) {
            const cash = ctx.accounts.find((a) => a.kind === 'cash');
            if (cash && from.id !== cash.id) {
                to = from; // "deposited 5000 in HDFC": cash goes into the bank
                from = cash;
            }
        }
        if (from && to && from.id === to.id) {
            to = null;
        }
        if (from) {
            out.accountId = from.id;
            out.accountSaid = true;
        }
        if (to) {
            out.toAccountId = to.id;
        }
        dropName(from);
        dropName(to);
        if (!from || !to) {
            const stranger = strangerAccount(list.map((w, i) => (drop.has(i) ? '·' : w)));
            if (stranger) {
                out.strangerAccount = nameCase(stranger.name);
                for (let i = stranger.from; i < stranger.to; i += 1) {
                    drop.add(i);
                }
            }
        }
    } else {
        const which = whichAccount(text, ctx);
        if (which && which.account) {
            out.accountId = which.account.id;
            out.accountSaid = true;
            dropName(which.account);
            Object.values(KIND_WORDS).flat().forEach((phrase) => {
                const parts = phrase.split(' ');
                for (let i = 0; i + parts.length <= list.length; i += 1) {
                    if (parts.every((part, k) => list[i + k] === part) && !THINGS.includes(list[i - 1])) {
                        parts.forEach((part, k) => drop.add(i + k)); // "from the bank", but not "a power bank"
                    }
                }
            });
        } else if (which) {
            out.strangerAccount = nameCase(which.stranger.name); // said, but the user has no such account: asked about, never guessed
            for (let i = which.stranger.from; i < which.stranger.to; i += 1) {
                drop.add(i);
            }
        }
    }

    // a person, for money lent or borrowed
    const personal = ['lent', 'gotback', 'borrowed', 'repaid'].includes(out.type);
    if (personal) {
        const p = named(text, ctx.people);
        if (p) {
            out.personId = p.id;
            dropName(p);
        } else {
            // an unknown name: the word after "to / from", or before "को / से / ने"
            const stop = (w) => !w || SMALL_WORDS.has(w) || numberOf(w, lang) !== null || w in MULT || CURRENCY.includes(w) || TYPE_WORDS.some(([, l]) => l.includes(w));
            let at = -1;
            list.forEach((w, i) => {
                if (at < 0 && ['to', 'from'].includes(w) && !drop.has(i + 1) && !stop(list[i + 1])) {
                    at = i + 1;
                }
                if (at < 0 && ['को', 'से', 'ने', 'ko', 'se', 'ne'].includes(w) && i > 0 && !drop.has(i - 1) && !stop(list[i - 1])) {
                    at = i - 1;
                }
            });
            if (at >= 0) {
                out.newPerson = /[ऀ-ॿ]/.test(list[at]) ? list[at] : TITLE(list[at]);
                drop.add(at);
            }
        }
    }

    const rest = list.filter((w, i) => !drop.has(i) && !SMALL_WORDS.has(w));
    out.description = rest.join(' ').trim();
    if (out.description && !/[ऀ-ॿ]/.test(out.description)) {
        out.description = out.description.charAt(0).toUpperCase() + out.description.slice(1);
    }

    if (out.type === 'expense' || out.type === 'income') {
        const cats = ctx.categories.filter((c) => c.type === out.type);
        const hints = list.map((w) => HINDI_HINTS[w]).filter(Boolean).join(' ');
        const byName = named(text, cats);
        out.categoryId = (byName && byName.id) || ctx.suggest(`${out.description} ${hints}`.trim(), out.type) || (hints ? ctx.suggest(hints, out.type) : null) || null;
    }
    return out;
}

// ---------- several entries in one sentence ----------
const INFLOW = ['income', 'gotback', 'borrowed']; // money coming in; everything else goes out
const JOINERS = ['and', 'then', 'also', 'plus', '&', 'और', 'फिर', 'तथा', 'aur', 'phir'];
/** True when these words hold an amount of money: a figure next to a currency word, or any figure of 10 or more that is not a date. */
function hasAmount(list, today, lang) {
    const when = dateIn(list, today);
    const kept = list.map((w, i) => (when && i >= when.from && i < when.to ? '·' : w));
    return numbersIn(kept, lang).some((n) => n.money || n.value >= 10);
}
/**
 * One sentence can hold several entries: "spent 450 on groceries and 200 on petrol and received 5000 salary".
 * It is cut at "and / then / और / फिर" only where both sides have their own amount, so "two hundred and fifty",
 * "dinner and drinks 800" and "2 shirts and 1 jeans for 1500" each stay one entry.
 */
export function understandAll(raw, ctx, lang = 'en') {
    const list = words(tidy(raw));
    const inNumber = new Set();
    numbersIn(list, lang).forEach((n) => {
        for (let i = n.from; i < n.to; i += 1) {
            inNumber.add(i);
        }
    });
    const parts = [[]];
    list.forEach((w, i) => {
        if (JOINERS.includes(w) && !inNumber.has(i) && parts[parts.length - 1].length) {
            parts.push([w]); // the joining word stays at the front, in case the pieces are put back together
        } else {
            parts[parts.length - 1].push(w);
        }
    });
    // a piece without its own amount belongs to its neighbour
    const merged = [];
    for (const part of parts) {
        const body = JOINERS.includes(part[0]) ? part.slice(1) : part;
        if (merged.length && (!hasAmount(body, ctx.today, lang) || !hasAmount(merged[merged.length - 1].body, ctx.today, lang))) {
            merged[merged.length - 1].body = merged[merged.length - 1].body.concat(part);
        } else {
            merged.push({ body });
        }
    }
    const out = [];
    for (const piece of merged) {
        out.push(understand(piece.body.join(' '), ctx, lang, out.length ? out[out.length - 1] : null));
    }
    // "spent 450 on groceries and 200 on petrol from HDFC": the account said once is the account of both
    out.forEach((s, i) => {
        if (!s.accountId && !s.strangerAccount && s.type !== 'transfer') {
            const same = (o) => o !== s && o.accountSaid && o.type !== 'transfer' && INFLOW.includes(o.type) === INFLOW.includes(s.type);
            const donor = out.slice(0, i).reverse().find(same) || out.slice(i + 1).find(same);
            if (donor) {
                s.accountId = donor.accountId;
            }
        }
    });
    return out;
}

// ---------- the conversation ----------
const SAY = {
    en: {
        nothing: "I didn't catch an entry, so nothing was saved. Try something like: spent 450 on groceries.",
        cancelled: 'Cancelled. Nothing was saved.',
        declined: 'Okay, nothing was saved.',
        gaveUp: "I still couldn't understand, so nothing was saved. Please try again.",
        amount: 'How much?',
        category: 'Which category?',
        person: { lent: 'Who did you lend it to?', gotback: 'Who gave it back?', borrowed: 'Who did you borrow it from?', repaid: 'Who did you pay back?' },
        toAccount: 'To which account?',
        fromAccount: 'From which account?',
        account: { out: 'Which account did you pay from?', in: 'Which account did it come into?' },
        stranger: (name) => `You don't have an account called ${name}. `,
        youHave: (names) => ` You have ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]}.`,
        noAccounts: 'Add an account first, under My accounts. Nothing was saved.',
        assetName: 'What did you buy?',
        confirmPerson: (name) => `I don't know ${name}. Add ${name} as a new person?`,
        forEntry: (n, label) => `For entry ${n}${label ? `, ${label}` : ''}: `,
        confirm: (lines) => (lines.length === 1 ? `${lines[0]}. Should I store this?` : `${lines.length} entries. ${lines.map((l, i) => `${i + 1}: ${l}`).join('. ')}. Should I store these?`),
        yesOrNo: 'Sorry, I missed that. Should I store this?',
        again: 'Sorry, I did not get that. ',
        saved: (count) => (count === 1 ? 'Stored.' : `${count} entries stored.`)
    },
    hi: {
        nothing: 'कोई एंट्री समझ नहीं आई, इसलिए कुछ सेव नहीं हुआ। ऐसे बोलिए: किराने पर 450 रुपये खर्च किए।',
        cancelled: 'रद्द किया। कुछ सेव नहीं हुआ।',
        declined: 'ठीक है, कुछ सेव नहीं हुआ।',
        gaveUp: 'मैं अब भी नहीं समझ पाया, इसलिए कुछ सेव नहीं हुआ। कृपया दोबारा कोशिश करें।',
        amount: 'कितने रुपये?',
        category: 'किस कैटेगरी में?',
        person: { lent: 'किसको उधार दिए?', gotback: 'किसने वापस दिए?', borrowed: 'किससे उधार लिए?', repaid: 'किसको वापस दिए?' },
        toAccount: 'किस अकाउंट में?',
        fromAccount: 'किस अकाउंट से?',
        account: { out: 'किस अकाउंट से दिए?', in: 'किस अकाउंट में आए?' },
        stranger: (name) => `${name} नाम का कोई अकाउंट नहीं है। `,
        youHave: (names) => ` आपके अकाउंट हैं: ${names.join(', ')}।`,
        noAccounts: 'पहले My accounts में एक अकाउंट जोड़ें। कुछ सेव नहीं हुआ।',
        assetName: 'क्या खरीदा?',
        confirmPerson: (name) => `${name} मेरी सूची में नहीं है। क्या ${name} को नए व्यक्ति के रूप में जोड़ूं?`,
        forEntry: (n, label) => `एंट्री ${n}${label ? `, ${label}` : ''} के लिए: `,
        confirm: (lines) => (lines.length === 1 ? `${lines[0]}। क्या इसे दर्ज करूं?` : `${lines.length} एंट्री। ${lines.map((l, i) => `${i + 1}: ${l}`).join('। ')}। क्या इन्हें दर्ज करूं?`),
        yesOrNo: 'माफ़ कीजिए, दोबारा बताइए। क्या इसे दर्ज करूं?',
        again: 'माफ़ कीजिए, समझ नहीं आया। ',
        saved: (count) => (count === 1 ? 'दर्ज हो गया।' : `${count} एंट्री दर्ज हो गईं।`)
    }
};
const CANCEL = ['cancel', 'stop', 'never mind', 'nevermind', 'forget it', 'रद्द', 'कैंसिल', 'रहने दो', 'छोड़ो', 'बंद करो', 'rehne do', 'chhodo'];
const has = (text, list) => list.some((w) => padded(text).includes(` ${w} `));
// Short words are the hardest for a recogniser: "yes" comes back as "yas", "s" or (with Hindi chosen) "यस"; "no" as
// "know" or "नो". All of these are accepted. If both a yes and a no are heard, it is a no: nothing is stored.
const YES = ['yes', 'yeah', 'yep', 'yup', 'ya', 'yah', 'yea', 'yas', 'yess', 'yes yes', 'yes please', 'ok', 'okay', 'k', 'sure', 'add', 'correct', 'right', 'confirm', 'done', 'go ahead', 'do it', 'save', 'save it', 'save them',
    'हाँ', 'हां', 'हा', 'जी', 'हाँ जी', 'जी हाँ', 'हम्म', 'ठीक', 'ठीक है', 'सही', 'जोड़ो', 'जोड़ दो', 'सेव', 'सेव करो', 'सेव कर दो', 'कर दो', 'कर दीजिए', 'यस', 'येस', 'यस यस', 'ओके', 'ओक',
    'haan', 'han', 'ha', 'haa', 'ji', 'theek', 'theek hai', 'thik hai', 'sahi', 'jodo', 'kar do', 'save kar do'];
const NO = ['no', 'nope', 'nah', 'naa', 'know', 'no no', 'no thanks', 'not now', "don't", 'do not', "don't save", 'do not save', 'wrong', 'incorrect',
    'नहीं', 'नही', 'ना', 'न', 'मत', 'मत करो', 'नहीं करना', 'गलत', 'नो', 'नो नो', 'nahi', 'nahin', 'nai', 'na', 'mat', 'mat karo', 'galat'];
/** 'yes', 'no', or null when the words are neither. */
export function yesOrNo(raw) {
    const text = tidy(raw);
    if (has(text, NO)) {
        return 'no';
    }
    return has(text, YES) || text === 's' ? 'yes' : null;
}

export function createSession(lang = 'en') {
    return { lang: lang === 'hi' ? 'hi' : 'en', items: null, at: 0, pending: null, tries: 0 };
}

/** What is still needed before this entry can be saved, in the order it is asked. */
function missing(s) {
    if (!(s.amount > 0)) {
        return 'amount';
    }
    if (s.type === 'transfer') {
        return !s.accountId ? 'fromAccount' : !s.toAccountId ? 'toAccount' : null;
    }
    if (['lent', 'gotback', 'borrowed', 'repaid'].includes(s.type) && !(s.personId || s.createPerson)) {
        return s.newPerson ? 'confirmPerson' : 'person';
    }
    if (s.type === 'asset' && !s.description) {
        return 'assetName';
    }
    if ((s.type === 'expense' || s.type === 'income') && !s.categoryId) {
        return 'category';
    }
    return s.accountId ? null : 'account'; // where the money went from, or came into: asked, not assumed
}

function question(session, s, slot) {
    const say = SAY[session.lang];
    const which = session.items.length > 1 ? say.forEntry(session.items.indexOf(s) + 1, [s.amount ? String(s.amount) : '', s.description].filter(Boolean).join(' ')) : '';
    let ask = slot === 'person' ? say.person[s.type] : slot === 'confirmPerson' ? say.confirmPerson(s.newPerson) : slot === 'account' ? say.account[INFLOW.includes(s.type) ? 'in' : 'out'] : say[slot];
    if (['account', 'fromAccount', 'toAccount'].includes(slot) && s.strangerAccount) {
        // a bank was named that is not among the user's accounts: say so, and say which ones there are
        ask = say.stranger(s.strangerAccount) + ask + say.youHave(session.accountNames || []);
    }
    return which + ask;
}

/** The entries as they would be stored: [{ entry, person }] (person = someone new to create with it, or null). */
export function review(session, ctx) {
    return (session.items || []).map((s) => {
        const personal = ['lent', 'gotback', 'borrowed', 'repaid'].includes(s.type);
        return {
            entry: { type: s.type, amount: s.amount, date: s.date, description: s.description, accountId: s.accountId || null,
                toAccountId: s.type === 'transfer' ? s.toAccountId : null, categoryId: s.type === 'expense' || s.type === 'income' ? s.categoryId : null, personId: personal ? s.personId : null },
            person: personal && !s.personId ? { name: s.createPerson, direction: s.type === 'lent' || s.type === 'gotback' ? 'owesMe' : 'iOwe' } : null
        };
    });
}

/** Takes one entry out of the list being reviewed. Returns what is left (none: there is nothing to save). */
export function drop(session, index, ctx) {
    session.items.splice(index, 1);
    return review(session, ctx);
}

/**
 * Takes what was just said. Returns one of
 *   { status: 'ask', say, slot }             something is missing in one of the entries: ask and listen again
 *   { status: 'confirm', items, say(lines) }  everything is there: show the entries and ask before storing
 *                                             (lines = one short description per entry, made by the screen)
 *   { status: 'save', items, say }           the user said yes
 *   { status: 'abort', say, reason }         nothing is stored: 'nothing' understood, 'cancelled', 'declined' (said no),
 *                                             or 'gaveUp' after two answers that could not be understood
 * items = [{ entry, person }], see review().
 */
export function hear(session, raw, ctx) {
    const say = SAY[session.lang];
    const text = tidy(raw);
    if (has(text, CANCEL)) {
        return { status: 'abort', reason: 'cancelled', say: say.cancelled };
    }
    session.accountNames = ctx.accounts.map((a) => String(a.name).replace(/\s*\(sample\)/i, ''));
    if (!session.items) {
        const all = understandAll(raw, ctx, session.lang);
        // nothing an entry is made of was said: no amount, no kind of entry, no person, category or account
        const real = all.filter((s) => s.amount || s.typeSaid || s.personId || s.newPerson || s.categoryId || s.accountSaid);
        if (!real.length) {
            return { status: 'abort', reason: 'nothing', say: say.nothing };
        }
        if (!ctx.accounts.length) {
            return { status: 'abort', reason: 'noAccounts', say: say.noAccounts };
        }
        session.items = real;
    } else if (session.pending === 'save') {
        const answer = yesOrNo(raw);
        if (answer === 'no') {
            return { status: 'abort', reason: 'declined', say: say.declined };
        }
        if (answer === 'yes') {
            return { status: 'save', items: review(session, ctx), say: say.saved(session.items.length) };
        }
        // neither a yes nor a no: asked once more aloud; after that the entries simply wait for Save or Cancel.
        // They are never thrown away because a short word was misheard.
        session.tries += 1;
        return { status: 'confirm', items: review(session, ctx), unclear: session.tries, heard: String(raw).trim(), say: () => say.yesOrNo };
    } else {
        const s = session.items[session.at];
        const slot = session.pending;
        let got = false;
        let strangerAnswer = false;
        if (slot === 'amount') {
            const n = numbersIn(words(text), session.lang).sort((a, b) => Number(b.money) - Number(a.money) || b.value - a.value)[0];
            if (n) {
                s.amount = n.value;
                got = true;
            }
        } else if (slot === 'category') {
            const cats = ctx.categories.filter((c) => c.type === s.type);
            const hints = words(text).map((w) => HINDI_HINTS[w]).filter(Boolean).join(' ');
            const byName = named(text, cats) || cats.find((c) => plainName(c.name).split(' ').some((w) => w.length >= 4 && padded(text).includes(` ${w} `)));
            const id = (byName && byName.id) || ctx.suggest(`${text} ${hints}`.trim(), s.type);
            if (id) {
                s.categoryId = id;
                got = true;
            }
        } else if (slot === 'person') {
            const p = named(text, ctx.people);
            const name = words(text).filter((w) => !SMALL_WORDS.has(w)).slice(0, 2).join(' ');
            if (p) {
                s.personId = p.id;
                got = true;
            } else if (name && numbersIn(words(text), session.lang).length === 0) {
                s.newPerson = /[\u0900-\u097f]/.test(name) ? name : TITLE(name);
                got = true;
            }
        } else if (slot === 'confirmPerson') {
            if (yesOrNo(raw) === 'no') {
                s.newPerson = null;
                got = true;
            } else if (yesOrNo(raw) === 'yes') {
                s.createPerson = s.newPerson;
                got = true;
            } else {
                const p = named(text, ctx.people); // they said another name instead
                if (p) {
                    s.personId = p.id;
                    s.newPerson = null;
                    got = true;
                }
            }
        } else if (slot === 'toAccount' || slot === 'fromAccount' || slot === 'account') {
            const which = whichAccount(text, ctx);
            const a = which && which.account ? which.account : null;
            const other = slot === 'toAccount' ? s.accountId : slot === 'fromAccount' ? s.toAccountId : null;
            if (which && which.stranger) {
                s.strangerAccount = nameCase(which.stranger.name); // "PNB bank" when there is no such account: say so and ask again
                strangerAnswer = true;
            }
            if (a && a.id !== other) {
                s[slot === 'toAccount' ? 'toAccountId' : 'accountId'] = a.id;
                s.strangerAccount = null;
                got = true;
                if (slot === 'account') {
                    // the same answer covers the other entries of this sentence that go the same way and have no account
                    session.items.forEach((o) => {
                        if (o !== s && !o.accountId && !o.strangerAccount && o.type !== 'transfer' && INFLOW.includes(o.type) === INFLOW.includes(s.type)) {
                            o.accountId = a.id;
                        }
                    });
                }
            }
        } else if (slot === 'assetName') {
            const name = words(text).filter((w) => !SMALL_WORDS.has(w)).join(' ');
            if (name) {
                s.description = /[\u0900-\u097f]/.test(name) ? name : TITLE(name);
                got = true;
            }
        }
        if (!got) {
            session.tries += 1;
            if (session.tries >= 2) {
                return { status: 'abort', reason: 'gaveUp', say: say.gaveUp };
            }
            return { status: 'ask', slot, say: (strangerAnswer ? '' : say.again) + question(session, s, slot) };
        }
    }
    // the first entry that still needs something
    for (let i = 0; i < session.items.length; i += 1) {
        const s = session.items[i];
        if (!s.accountId && !s.strangerAccount && s.type !== 'transfer' && ctx.accounts.length === 1) {
            s.accountId = ctx.accounts[0].id; // only one account exists: there is nothing to ask
        }
        const need = missing(s);
        if (need) {
            if (need !== session.pending || i !== session.at) {
                session.tries = 0;
            }
            session.at = i;
            session.pending = need;
            return { status: 'ask', slot: need, say: question(session, s, need) };
        }
    }
    // all complete: nothing is stored until the user says yes
    session.pending = 'save';
    session.tries = 0;
    return { status: 'confirm', items: review(session, ctx), say: (lines) => say.confirm(lines) };
}
