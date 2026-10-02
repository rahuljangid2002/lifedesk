// Pure calculations: no screen and no storage code here, so the same rules can be tested on their own.

export const TYPES = {
    expense: { label: 'Expense', icon: '🛒', sign: -1 },
    income: { label: 'Income', icon: '💰', sign: 1 },
    transfer: { label: 'Transfer', icon: '🔁', sign: 0 },
    lent: { label: 'Lent / Given', icon: '📤', sign: -1 },
    gotback: { label: 'Got Back', icon: '📥', sign: 1 },
    borrowed: { label: 'Borrowed', icon: '🤝', sign: 1 },
    repaid: { label: 'Repaid', icon: '↩️', sign: -1 }
};
export const PERSON_TYPES = ['lent', 'gotback', 'borrowed', 'repaid'];
export const ACCOUNT_KINDS = { bank: 'Bank', wallet: 'Wallet', cash: 'Cash', card: 'Credit card' };

const num = (v) => Number(v) || 0;

export function inr(value) {
    const n = Math.round(num(value));
    return `${n < 0 ? '−' : ''}₹${Math.abs(n).toLocaleString('en-IN')}`;
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
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
export function monthEnd(key) {
    const [y, m] = key.split('-').map(Number);
    return isoDate(new Date(y, m, 0));
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
