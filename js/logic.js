// Pure calculations: no screen and no storage code here, so the same rules can be tested on their own.

export const TYPES = {
    expense: { label: 'Expense', short: 'Expense', icon: 'cart', sign: -1, hint: 'Money you spent.' },
    income: { label: 'Income', short: 'Income', icon: 'income', sign: 1, hint: 'Money you earned or received.' },
    transfer: { label: 'Transfer', short: 'Transfer', icon: 'transfer', sign: 0, hint: 'Move money between your own accounts, or pay a card bill.' },
    lent: { label: 'Lent / Given', short: 'Lent', icon: 'lent', sign: -1, hint: 'Money you gave to someone who will pay it back.' },
    gotback: { label: 'Got Back', short: 'Got back', icon: 'gotback', sign: 1, hint: 'Someone returned money they owed you.' },
    borrowed: { label: 'Borrowed', short: 'Borrowed', icon: 'borrowed', sign: 1, hint: 'Money you took from someone and will pay back.' },
    repaid: { label: 'Repaid', short: 'Repaid', icon: 'repaid', sign: -1, hint: 'You paid back someone you owe.' },
    asset: { label: 'Asset purchase', short: 'Asset', icon: 'asset', sign: -1, hint: 'Something valuable you bought: a vehicle, gadget, gold or property. It is added to My assets.' }
};
export const ASSET_TYPES = ['Vehicle', 'Electronics', 'Property', 'Gold & Jewellery', 'Furniture & Appliances', 'Investment', 'Other'];
export const PERSON_TYPES = ['lent', 'gotback', 'borrowed', 'repaid'];
export const ACCOUNT_KINDS = { bank: 'Bank', wallet: 'Wallet', cash: 'Cash', card: 'Credit card' };

const num = (v) => Number(v) || 0;

// ---------- currency and region (set from the user's preferences) ----------
const REGION_CURRENCY = {
    IN: 'INR', US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD',
    BH: 'BHD', OM: 'OMR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', JP: 'JPY', CN: 'CNY', HK: 'HKD', KR: 'KRW', MY: 'MYR',
    TH: 'THB', ID: 'IDR', PH: 'PHP', VN: 'VND', ZA: 'ZAR', NG: 'NGN', KE: 'KES', EG: 'EGP', BR: 'BRL', MX: 'MXN', AR: 'ARS',
    CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', TR: 'TRY', RU: 'RUB', IL: 'ILS',
    DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR', IE: 'EUR', PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR'
};
const ZONE_CURRENCY = { 'Asia/Kolkata': 'INR', 'Asia/Calcutta': 'INR', 'Asia/Dubai': 'AED', 'Europe/London': 'GBP', 'Asia/Singapore': 'SGD' };
let format = { locale: undefined, currency: 'USD' };

/** The currency this device most likely uses: from the browser's region, then its time zone. */
export function guessCurrency() {
    const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    const region = (lang.split('-')[1] || '').toUpperCase();
    if (REGION_CURRENCY[region] && region !== 'US') {
        return REGION_CURRENCY[region];
    }
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (ZONE_CURRENCY[zone]) {
            return ZONE_CURRENCY[zone];
        }
    } catch (e) {
        // no time zone information
    }
    return REGION_CURRENCY[region] || 'USD';
}

/** Every currency the browser knows, with its name, for the currency picker. */
export function currencyList() {
    let codes = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'AUD', 'CAD', 'SGD', 'JPY', 'CNY'];
    try {
        codes = Intl.supportedValuesOf('currency');
    } catch (e) {
        // older browser: the short list above
    }
    let names = null;
    try {
        names = new Intl.DisplayNames(undefined, { type: 'currency' });
    } catch (e) {
        // no display names
    }
    return codes.map((code) => ({ code, name: names ? names.of(code) : code })).sort((a, b) => a.name.localeCompare(b.name));
}

export function setFormat(prefs) {
    const currency = (prefs && prefs.currency) || guessCurrency();
    let locale = (prefs && prefs.locale) || (typeof navigator !== 'undefined' ? navigator.language : undefined);
    if (currency === 'INR' && !/-IN$/.test(locale || '')) {
        locale = 'en-IN'; // lakh / crore grouping for rupees
    }
    format = { locale, currency };
}
export function currentFormat() {
    return { ...format };
}

/** An amount in the user's currency; decimals only when the amount has them. */
export function money(value) {
    const n = Math.round(num(value) * 100) / 100;
    const whole = Number.isInteger(n);
    try {
        return new Intl.NumberFormat(format.locale, {
            style: 'currency',
            currency: format.currency,
            currencyDisplay: 'narrowSymbol',
            minimumFractionDigits: whole ? 0 : 2,
            maximumFractionDigits: whole ? 0 : 2
        }).format(n);
    } catch (e) {
        return `${format.currency} ${n.toLocaleString()}`;
    }
}
/** Short amounts for chart axes: 1.2K, 3.5M (lakh and crore for rupees). No currency symbol. */
export function compact(value) {
    try {
        return new Intl.NumberFormat(format.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(num(value));
    } catch (e) {
        return String(Math.round(num(value)));
    }
}
/** The currency symbol on its own (for the amount boxes). */
export function symbol() {
    try {
        const parts = new Intl.NumberFormat(format.locale, { style: 'currency', currency: format.currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
        return (parts.find((x) => x.type === 'currency') || {}).value || format.currency;
    } catch (e) {
        return format.currency;
    }
}
export function dateText(iso, options) {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(format.locale, options);
}
export function isoDate(d = new Date()) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function monthKey(iso) {
    return (iso || '').slice(0, 7);
}
export function addMonths(key, n) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return isoDate(d).slice(0, 7);
}
export function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(format.locale, { month: 'long', year: 'numeric' });
}
export function monthEnd(key) {
    const [y, m] = key.split('-').map(Number);
    return isoDate(new Date(y, m, 0));
}

// ---------- loans bought on EMI ----------
/** A date n months later, keeping the day (or the month's last day when it is shorter). */
export function addMonthsToDate(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const first = new Date(y, m - 1 + n, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return isoDate(new Date(first.getFullYear(), first.getMonth(), Math.min(d, last)));
}

/**
 * The yearly interest rate (%) a lender is charging, worked out from the amount financed, the EMI and the number
 * of EMIs (reducing-balance method: financed = EMI x (1 - (1 + r)^-n) / r, r per month). 0 for a no-cost EMI.
 */
export function impliedRate(financed, emi, months) {
    return Math.round(monthlyRate(financed, emi, months) * 12 * 10000) / 100;
}
/** The same rate per month, as a fraction and not rounded: used for the principal / interest split. */
export function monthlyRate(financed, emi, months) {
    const p = num(financed);
    const e = num(emi);
    const n = Math.round(num(months));
    if (!(p > 0) || !(e > 0) || !(n > 0) || e * n <= p) {
        return 0;
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 100; i += 1) {
        const r = (lo + hi) / 2;
        if ((e * (1 - (1 + r) ** -n)) / r > p) {
            lo = r;
        } else {
            hi = r;
        }
    }
    return (lo + hi) / 2;
}

/** Where a loan stands: EMIs paid and left, what is still to pay, and the EMIs due up to the end of this month. */
export function loanStatus(loan, entries, today) {
    const paid = entries.filter((e) => e.loanId === loan.id).length;
    const months = Math.round(num(loan.months));
    const left = Math.max(0, months - paid);
    const monthEndDate = monthEnd(monthKey(today));
    const due = [];
    for (let k = paid; k < months; k += 1) {
        const date = addMonthsToDate(loan.firstDate, k);
        if (date > monthEndDate) {
            break;
        }
        due.push({ number: k + 1, date });
    }
    // Split of what was paid into principal and interest, from the loan's own schedule (reducing balance).
    const emi = num(loan.emi);
    const financed = num(loan.financed);
    const totalInterest = Math.max(0, emi * months - financed);
    const r = monthlyRate(financed, emi, months);
    const k = Math.min(paid, months);
    const principalLeft = left === 0 ? 0 : r > 0 ? Math.max(0, financed * (1 + r) ** k - (emi * ((1 + r) ** k - 1)) / r) : Math.max(0, financed - emi * k);
    const interestPaid = Math.min(totalInterest, Math.max(0, Math.round((emi * k - (financed - principalLeft)) * 100) / 100));
    return { paid, left, months, outstanding: left * emi, next: left ? addMonthsToDate(loan.firstDate, paid) : null, due,
        principalLeft: Math.round(principalLeft * 100) / 100, principalPaid: Math.round((financed - principalLeft) * 100) / 100,
        interestPaid, interestLeft: Math.round((totalInterest - interestPaid) * 100) / 100, totalInterest };
}

/** How an entry moves one account: + money in, − money out, 0 not involved. */
export function accountDelta(entry, accountId) {
    const amt = num(entry.amount);
    if (entry.type === 'transfer') {
        return (entry.toAccountId === accountId ? amt : 0) - (entry.accountId === accountId ? amt : 0);
    }
    if (entry.accountId !== accountId) {
        return 0;
    }
    return TYPES[entry.type].sign * amt;
}

/** Balance of an account up to and including a date (all time when no date). A card's balance is negative when money is owed. */
export function accountBalance(account, entries, upTo) {
    let bal = 0;
    if (!upTo || !account.openingDate || account.openingDate <= upTo) {
        bal = account.kind === 'card' ? -num(account.opening) : num(account.opening);
    }
    for (const e of entries) {
        if (!upTo || e.date <= upTo) {
            bal += accountDelta(e, account.id);
        }
    }
    return bal;
}

/** What a person owes you (owesMe) or you owe them (iOwe), up to a date. */
export function personOutstanding(person, entries, upTo) {
    let out = num(person.opening);
    for (const e of entries) {
        if (e.personId !== person.id || (upTo && e.date > upTo)) {
            continue;
        }
        const amt = num(e.amount);
        if (person.direction === 'owesMe') {
            out += e.type === 'lent' ? amt : e.type === 'gotback' ? -amt : 0;
        } else {
            out += e.type === 'borrowed' ? amt : e.type === 'repaid' ? -amt : 0;
        }
    }
    return out;
}

/** Bank + wallets, cash, card owed, owed to people, to receive and the net balance, up to a date. */
export function totals(data, upTo) {
    const t = { bank: 0, cash: 0, cardOwed: 0, owedToPeople: 0, toReceive: 0 };
    for (const a of data.accounts) {
        const bal = accountBalance(a, data.entries, upTo);
        if (a.kind === 'card') {
            t.cardOwed += -bal;
        } else if (a.kind === 'cash') {
            t.cash += bal;
        } else {
            t.bank += bal;
        }
    }
    for (const p of data.people) {
        const out = personOutstanding(p, data.entries, upTo);
        if (p.direction === 'iOwe') {
            t.owedToPeople += out;
        } else if (p.status !== 'Bad Debt') {
            t.toReceive += out;
        }
    }
    t.inHand = t.bank + t.cash;
    t.net = t.inHand - t.cardOwed - t.owedToPeople;
    return t;
}

/** Income, expense, savings and opening / closing net balance of one month (YYYY-MM). */
export function monthSummary(data, key) {
    let income = 0;
    let expense = 0;
    for (const e of data.entries) {
        if (monthKey(e.date) !== key) {
            continue;
        }
        if (e.type === 'income') {
            income += num(e.amount);
        } else if (e.type === 'expense') {
            expense += num(e.amount);
        }
    }
    const closing = totals(data, monthEnd(key));
    const opening = totals(data, monthEnd(addMonths(key, -1)));
    // An account that starts this month brings its opening balance into the month's opening.
    for (const a of data.accounts) {
        if (a.openingDate && monthKey(a.openingDate) === key) {
            const o = num(a.opening);
            if (a.kind === 'card') {
                opening.net -= o;
            } else {
                opening.net += o;
            }
        }
    }
    return { income, expense, savings: income - expense, opening: opening.net, closing };
}

/** Spending by category for a month: { categoryId: amount }. */
export function spendByCategory(entries, key) {
    const out = {};
    for (const e of entries) {
        if (e.type === 'expense' && monthKey(e.date) === key && e.categoryId) {
            out[e.categoryId] = (out[e.categoryId] || 0) + num(e.amount);
        }
    }
    return out;
}

/** Budget rows for a month: planned, spent, last month and 3-month average per expense category. */
export function budgetRows(data, key) {
    const plan = (data.budgets.find((b) => b.id === key) || {}).lines || {};
    const spent = spendByCategory(data.entries, key);
    const prev = [1, 2, 3].map((n) => spendByCategory(data.entries, addMonths(key, -n)));
    return data.categories
        .filter((c) => c.type === 'expense')
        .map((c) => {
            const planned = num(plan[c.id]);
            const used = num(spent[c.id]);
            return {
                id: c.id,
                name: c.name,
                planned,
                spent: used,
                lastMonth: num(prev[0][c.id]),
                average: Math.round(prev.reduce((s, m) => s + num(m[c.id]), 0) / 3),
                percent: planned > 0 ? Math.round((used / planned) * 100) : used > 0 ? 100 : 0,
                over: planned > 0 ? used > planned : used > 0
            };
        });
}

/** The category whose keyword appears in the description (longest keyword wins). */
export function suggestCategory(categories, description, type) {
    const text = ` ${(description || '').toLowerCase()} `;
    let best = null;
    let bestLen = 0;
    for (const c of categories) {
        if (c.type !== type) {
            continue;
        }
        for (const k of c.keywords || []) {
            if (k.length > bestLen && text.includes(k)) {
                best = c.id;
                bestLen = k.length;
            }
        }
    }
    return best;
}

/** Entries between two dates (inclusive), newest first, grouped by day with a total. */
export function groupByDay(entries, from, to, filter) {
    const days = new Map();
    const list = entries
        .filter((e) => e.date >= from && e.date <= to && (!filter || filter(e)))
        .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
    for (const e of list) {
        if (!days.has(e.date)) {
            days.set(e.date, { date: e.date, entries: [], total: 0 });
        }
        const d = days.get(e.date);
        d.entries.push(e);
        d.total += num(e.amount);
    }
    return [...days.values()];
}

/** Checks an entry before saving; returns a message, or null when it is fine. */
export function validateEntry(e, data) {
    if (!(num(e.amount) > 0)) {
        return 'Enter an amount greater than zero.';
    }
    if (!e.date) {
        return 'Choose a date.';
    }
    if (e.date > isoDate()) {
        return 'The date cannot be in the future.';
    }
    if (!e.accountId) {
        return 'Choose an account.';
    }
    if (e.type === 'transfer') {
        if (!e.toAccountId) {
            return 'Choose the account the money goes to.';
        }
        if (e.toAccountId === e.accountId) {
            return 'Choose two different accounts.';
        }
    }
    if ((e.type === 'expense' || e.type === 'income') && !e.categoryId) {
        return 'Choose a category.';
    }
    if (PERSON_TYPES.includes(e.type)) {
        const p = data.people.find((x) => x.id === e.personId);
        if (!p) {
            return 'Choose a person.';
        }
        const need = e.type === 'lent' || e.type === 'gotback' ? 'owesMe' : 'iOwe';
        if (p.direction !== need) {
            return need === 'owesMe' ? 'Choose a person who owes you.' : 'Choose a person you owe.';
        }
    }
    return null;
}
