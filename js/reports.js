// Figures for the dashboards and reports. Pure calculations over the user's data: no screen code here.
import { TYPES, accountBalance, addMonths, budgetRows, isoDate, loanStatus, monthEnd, monthKey, monthLabel, monthSummary, personOutstanding, totals } from './logic.js';

const num = (v) => Number(v) || 0;
const inRange = (e, from, to) => e.date >= from && e.date <= to;
const nameOf = (list, id, fallback) => (list.find((x) => x.id === id) || {}).name || fallback;

// ---------- years ----------
/** The year (starting in month `startMonth`, 1-12) that contains a date: { key, label, from, to, months }. */
export function yearOf(dateIso, startMonth) {
    const y = Number(dateIso.slice(0, 4));
    const m = Number(dateIso.slice(5, 7));
    const first = m >= startMonth ? y : y - 1;
    return yearByStart(first, startMonth);
}
export function yearByStart(firstYear, startMonth) {
    const startKey = `${firstYear}-${String(startMonth).padStart(2, '0')}`;
    const months = Array.from({ length: 12 }, (_, i) => addMonths(startKey, i));
    return {
        key: String(firstYear),
        label: startMonth === 1 ? String(firstYear) : `${firstYear}–${String(firstYear + 1).slice(2)}`,
        from: `${startKey}-01`,
        to: monthEnd(months[11]),
        months
    };
}
/** Every year that has entries, newest first (always includes the current one). */
export function yearsWithData(data, startMonth, today) {
    const keys = new Set([yearOf(today, startMonth).key]);
    data.entries.forEach((e) => keys.add(yearOf(e.date, startMonth).key));
    return [...keys].sort().reverse().map((k) => yearByStart(Number(k), startMonth));
}
export function firstEntryDate(data, today) {
    return data.entries.reduce((min, e) => (e.date < min ? e.date : min), today);
}

// ---------- building blocks ----------
/** Sum of expense (or income) by category between two dates: [{ id, label, value }], largest first. */
export function byCategory(data, from, to, type = 'expense') {
    const sums = {};
    for (const e of data.entries) {
        if (e.type === type && inRange(e, from, to)) {
            const k = e.categoryId || '';
            sums[k] = (sums[k] || 0) + num(e.amount);
        }
    }
    return Object.entries(sums)
        .map(([id, value]) => ({ id, label: nameOf(data.categories, id, 'No category'), value }))
        .sort((a, b) => b.value - a.value);
}
export function byAccount(data, from, to) {
    const sums = {};
    for (const e of data.entries) {
        if (e.type === 'expense' && inRange(e, from, to)) {
            sums[e.accountId] = (sums[e.accountId] || 0) + num(e.amount);
        }
    }
    return Object.entries(sums)
        .map(([id, value]) => ({ id, label: nameOf(data.accounts, id, 'Unknown account'), value }))
        .sort((a, b) => b.value - a.value);
}
/** Keeps the largest `keep` items and folds the rest into "Other". */
export function topWithOther(items, keep = 8) {
    if (items.length <= keep) {
        return items;
    }
    const head = items.slice(0, keep - 1);
    const rest = items.slice(keep - 1);
    return [...head, { id: 'other', label: `Other (${rest.length})`, value: rest.reduce((s, x) => s + x.value, 0) }];
}
/** Spending for each day of a month: [{ date, label, value }]. */
export function dailySpend(data, key) {
    const days = Number(monthEnd(key).slice(8));
    const out = Array.from({ length: days }, (_, i) => ({ date: `${key}-${String(i + 1).padStart(2, '0')}`, label: String(i + 1), value: 0 }));
    for (const e of data.entries) {
        if (e.type === 'expense' && monthKey(e.date) === key) {
            out[Number(e.date.slice(8)) - 1].value += num(e.amount);
        }
    }
    return out;
}
/** Income, expense, savings and closing net balance for each month of a list of month keys. */
export function monthsTable(data, months, today) {
    return months.map((key) => {
        const m = monthSummary(data, key);
        const future = `${key}-01` > today;
        return { key, label: monthLabel(key), income: m.income, expense: m.expense, savings: m.savings, opening: m.opening, closing: future ? null : m.closing.net };
    });
}
export function peopleRows(data, direction) {
    return data.people
        .filter((p) => p.direction === direction)
        .map((p) => ({ id: p.id, label: p.name, status: p.status || 'Active', phone: p.phone || '', value: personOutstanding(p, data.entries) }))
        .sort((a, b) => b.value - a.value);
}
export function accountRows(data) {
    return data.accounts
        .filter((a) => a.active !== false)
        .map((a) => {
            const bal = accountBalance(a, data.entries);
            return { id: a.id, label: a.name, kind: a.kind, value: a.kind === 'card' ? Math.max(0, -bal) : bal, limit: num(a.limit) };
        });
}

/** Every loan with where it stands today. */
export function loanRows(data, today) {
    return (data.loans || []).map((l) => ({ ...l, ...loanStatus(l, data.entries, today) }));
}
/** Every asset with its loan (if any) and its value net of the loan principal still owed. */
export function assetRows(data, today) {
    const loans = loanRows(data, today);
    return (data.assets || []).map((a) => {
        const loan = loans.find((l) => l.id === a.loanId) || null;
        return { ...a, price: num(a.price), value: num(a.value), loan, loanLeft: loan ? loan.principalLeft : 0, net: num(a.value) - (loan ? loan.principalLeft : 0) };
    });
}

/** Net worth = net balance + money owed to you + what your assets are worth - loan principal still owed. */
export function netWorth(data, today) {
    const t = totals(data);
    const assets = assetRows(data, today).filter((a) => a.status !== 'Sold').reduce((s, a) => s + a.value, 0);
    const loans = loanRows(data, today).reduce((s, l) => s + l.principalLeft, 0);
    return { net: t.net, toReceive: t.toReceive, assets, loans, worth: Math.round((t.net + t.toReceive + assets - loans) * 100) / 100 };
}

// ---------- reports ----------
// Each report: id, name, about, period ('range' | 'month' | 'year' | 'none') and build(data, p) ->
// { columns: [{ label, kind }], rows: [[...]], total: [...] | null }. kind: text | money | number | date | percent.
const money = (label) => ({ label, kind: 'money' });
const text = (label) => ({ label, kind: 'text' });
const sumCol = (rows, i) => rows.reduce((s, r) => s + num(r[i]), 0);

export const REPORTS = [
    {
        id: 'monthly-summary', name: 'Monthly summary', period: 'year', about: 'Opening balance, income, expense, savings and closing net balance for each month of a year.',
        build(data, p) {
            const rows = monthsTable(data, p.year.months, p.today).filter((m) => `${m.key}-01` <= p.today).map((m) => [m.label, m.opening, m.income, m.expense, m.savings, m.closing]);
            return { columns: [text('Month'), money('Opening balance'), money('Income'), money('Expense'), money('Savings'), money('Closing balance')], rows, total: ['Total', null, sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4), null] };
        }
    },
    {
        id: 'spend-by-category', name: 'Spend by category', period: 'range', about: 'How much was spent in each category, with its share of the total.',
        build(data, p) {
            const items = byCategory(data, p.from, p.to);
            const all = items.reduce((s, x) => s + x.value, 0);
            const count = (id) => data.entries.filter((e) => e.type === 'expense' && (e.categoryId || '') === id && inRange(e, p.from, p.to)).length;
            return { columns: [text('Category'), { label: 'Entries', kind: 'number' }, money('Spent'), { label: 'Share', kind: 'percent' }], rows: items.map((x) => [x.label, count(x.id), x.value, all ? x.value / all : 0]), total: ['Total', items.reduce((s, x) => s + count(x.id), 0), all, all ? 1 : 0] };
        }
    },
    {
        id: 'category-by-month', name: 'Category by month', period: 'year', about: 'Spending in each category, month by month, for a year.',
        build(data, p) {
            const months = p.year.months.filter((k) => `${k}-01` <= p.today);
            const cats = byCategory(data, p.year.from, p.year.to);
            const rows = cats.map((c) => {
                const perMonth = months.map((k) => data.entries.filter((e) => e.type === 'expense' && (e.categoryId || '') === c.id && monthKey(e.date) === k).reduce((s, e) => s + num(e.amount), 0));
                return [c.label, ...perMonth, c.value];
            });
            const short = (k) => monthLabel(k).replace(/\s?\d{4}$/, '').slice(0, 3);
            return { columns: [text('Category'), ...months.map((k) => money(short(k))), money('Total')], rows, total: ['Total', ...months.map((_, i) => sumCol(rows, i + 1)), sumCol(rows, months.length + 1)] };
        }
    },
    {
        id: 'daily-spend', name: 'Daily spend', period: 'range', about: 'Total spent on each day that has expenses.',
        build(data, p) {
            const days = {};
            data.entries.filter((e) => e.type === 'expense' && inRange(e, p.from, p.to)).forEach((e) => {
                days[e.date] = days[e.date] || { n: 0, sum: 0 };
                days[e.date].n += 1;
                days[e.date].sum += num(e.amount);
            });
            const rows = Object.keys(days).sort().reverse().map((d) => [d, days[d].n, days[d].sum]);
            return { columns: [{ label: 'Date', kind: 'date' }, { label: 'Entries', kind: 'number' }, money('Spent')], rows, total: ['Total', sumCol(rows, 1), sumCol(rows, 2)] };
        }
    },
    {
        id: 'budget-vs-actual', name: 'Budget vs actual', period: 'month', about: 'Planned and spent for each category in one month.',
        build(data, p) {
            const rows = budgetRows(data, p.month).filter((r) => r.planned || r.spent).sort((a, b) => b.planned - a.planned || b.spent - a.spent)
                .map((r) => [r.name, r.planned, r.spent, r.planned - r.spent, r.planned ? r.spent / r.planned : null]);
            return { columns: [text('Category'), money('Budget'), money('Spent'), money('Left'), { label: 'Used', kind: 'percent' }], rows, total: ['Total', sumCol(rows, 1), sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 1) ? sumCol(rows, 2) / sumCol(rows, 1) : null] };
        }
    },
    {
        id: 'top-expenses', name: 'Top expenses', period: 'range', about: 'The 25 largest single expenses.',
        build(data, p) {
            const rows = data.entries.filter((e) => e.type === 'expense' && inRange(e, p.from, p.to)).sort((a, b) => num(b.amount) - num(a.amount)).slice(0, 25)
                .map((e) => [e.date, e.description, nameOf(data.categories, e.categoryId, ''), nameOf(data.accounts, e.accountId, ''), num(e.amount)]);
            return { columns: [{ label: 'Date', kind: 'date' }, text('Description'), text('Category'), text('Account'), money('Amount')], rows, total: ['Total', '', '', '', sumCol(rows, 4)] };
        }
    },
    {
        id: 'spend-by-account', name: 'Spend by account', period: 'range', about: 'How much was spent from each account or card.',
        build(data, p) {
            const items = byAccount(data, p.from, p.to);
            const all = items.reduce((s, x) => s + x.value, 0);
            return { columns: [text('Account'), money('Spent'), { label: 'Share', kind: 'percent' }], rows: items.map((x) => [x.label, x.value, all ? x.value / all : 0]), total: ['Total', all, all ? 1 : 0] };
        }
    },
    {
        id: 'income-by-source', name: 'Income by source', period: 'range', about: 'Income in each income category.',
        build(data, p) {
            const items = byCategory(data, p.from, p.to, 'income');
            const all = items.reduce((s, x) => s + x.value, 0);
            return { columns: [text('Source'), money('Income'), { label: 'Share', kind: 'percent' }], rows: items.map((x) => [x.label, x.value, all ? x.value / all : 0]), total: ['Total', all, all ? 1 : 0] };
        }
    },
    {
        id: 'year-over-year', name: 'Year over year', period: 'none', about: 'Income, expense and savings for every year with entries.',
        build(data, p) {
            const rows = yearsWithData(data, p.yearStart, p.today).reverse().map((y) => {
                const income = data.entries.filter((e) => e.type === 'income' && inRange(e, y.from, y.to)).reduce((s, e) => s + num(e.amount), 0);
                const expense = data.entries.filter((e) => e.type === 'expense' && inRange(e, y.from, y.to)).reduce((s, e) => s + num(e.amount), 0);
                return [y.label, income, expense, income - expense, income ? (income - expense) / income : null];
            });
            return { columns: [text('Year'), money('Income'), money('Expense'), money('Savings'), { label: 'Savings rate', kind: 'percent' }], rows, total: null };
        }
    },
    {
        id: 'lending-activity', name: 'Lending activity', period: 'range', about: 'Money lent, got back, borrowed and repaid.',
        build(data, p) {
            const rows = data.entries.filter((e) => ['lent', 'gotback', 'borrowed', 'repaid'].includes(e.type) && inRange(e, p.from, p.to)).sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((e) => [e.date, nameOf(data.people, e.personId, ''), TYPES[e.type].label, e.description, nameOf(data.accounts, e.accountId, ''), num(e.amount)]);
            return { columns: [{ label: 'Date', kind: 'date' }, text('Person'), text('Type'), text('Description'), text('Account'), money('Amount')], rows, total: null };
        }
    },
    {
        id: 'money-to-receive', name: 'Money to receive', period: 'none', about: 'People who owe you, with what is still outstanding.',
        build(data) {
            const rows = peopleRows(data, 'owesMe').filter((r) => r.status !== 'Bad Debt' && r.value !== 0).map((r) => [r.label, r.status, r.phone, r.value]);
            return { columns: [text('Person'), text('Status'), text('Phone'), money('Owes you')], rows, total: ['Total', '', '', sumCol(rows, 3)] };
        }
    },
    {
        id: 'owed-to-people', name: 'Owed to people', period: 'none', about: 'People you owe, with what is still to pay.',
        build(data) {
            const rows = peopleRows(data, 'iOwe').filter((r) => r.value !== 0).map((r) => [r.label, r.status, r.phone, r.value]);
            return { columns: [text('Person'), text('Status'), text('Phone'), money('You owe')], rows, total: ['Total', '', '', sumCol(rows, 3)] };
        }
    },
    {
        id: 'bad-debts', name: 'Bad debts', period: 'none', about: 'Money lent that is not expected back.',
        build(data) {
            const rows = peopleRows(data, 'owesMe').filter((r) => r.status === 'Bad Debt').map((r) => [r.label, r.phone, r.value]);
            return { columns: [text('Person'), text('Phone'), money('Amount')], rows, total: ['Total', '', sumCol(rows, 2)] };
        }
    },
    {
        id: 'account-balances', name: 'Account balances', period: 'none', about: 'Every open account with its balance, or the amount owed on a card.',
        build(data) {
            const order = { cash: 0, bank: 1, wallet: 2, card: 3 };
            const kind = { cash: 'Cash', bank: 'Bank', wallet: 'Wallet', card: 'Credit card' };
            const rows = accountRows(data).sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label))
                .map((a) => [a.label, kind[a.kind], a.kind === 'card' ? null : a.value, a.kind === 'card' ? a.value : null, a.kind === 'card' && a.limit ? a.limit - a.value : null]);
            return { columns: [text('Account'), text('Type'), money('Balance'), money('Owed'), money('Credit left')], rows, total: ['Total', '', sumCol(rows, 2), sumCol(rows, 3), sumCol(rows, 4)] };
        }
    },
    {
        id: 'asset-register', name: 'Asset register', period: 'none', about: 'Everything you own: price paid, what it is worth now, the loan on it and the interest.',
        build(data, p) {
            const rows = assetRows(data, p.today).sort((a, b) => b.value - a.value)
                .map((a) => [a.name, a.type, a.status || 'Owned', a.boughtOn || null, a.price, a.value, a.value - a.price, a.loanLeft, a.net, a.loan ? a.loan.interestPaid : null, a.loan ? a.loan.interestLeft : null]);
            return { columns: [text('Asset'), text('Kind'), text('Status'), { label: 'Bought', kind: 'date' }, money('Price paid'), money('Worth now'), money('Gain / loss'), money('Loan left'), money('Net value'), money('Interest paid'), money('Interest to pay')],
                rows, total: ['Total', '', '', null, sumCol(rows, 4), sumCol(rows, 5), sumCol(rows, 6), sumCol(rows, 7), sumCol(rows, 8), sumCol(rows, 9), sumCol(rows, 10)] };
        }
    },
    {
        id: 'loan-summary', name: 'Loan summary', period: 'none', about: 'Every EMI loan: what was financed, what is paid, and the principal and interest still to pay.',
        build(data, p) {
            const rows = loanRows(data, p.today).sort((a, b) => b.outstanding - a.outstanding)
                .map((l) => [l.name, l.lender || '', l.rate / 100, num(l.financed), num(l.emi), `${l.paid} of ${l.months}`, l.principalPaid, l.interestPaid, l.principalLeft, l.interestLeft, l.outstanding]);
            return { columns: [text('Loan'), text('Financed by'), { label: 'Rate a year', kind: 'rate' }, money('Financed'), money('EMI'), text('EMIs paid'), money('Principal paid'), money('Interest paid'), money('Principal left'), money('Interest to pay'), money('Still to pay')],
                rows, total: ['Total', '', null, sumCol(rows, 3), sumCol(rows, 4), '', sumCol(rows, 6), sumCol(rows, 7), sumCol(rows, 8), sumCol(rows, 9), sumCol(rows, 10)] };
        }
    },
    {
        id: 'emi-payments', name: 'EMI payments', period: 'range', about: 'Every EMI paid in the period, by loan.',
        build(data, p) {
            const rows = data.entries.filter((e) => e.loanId && inRange(e, p.from, p.to)).sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((e) => [e.date, nameOf(data.loans || [], e.loanId, 'Deleted loan'), e.description, nameOf(data.accounts, e.accountId, ''), num(e.amount)]);
            return { columns: [{ label: 'Date', kind: 'date' }, text('Loan'), text('Description'), text('Account'), money('Amount')], rows, total: ['Total', '', '', '', sumCol(rows, 4)] };
        }
    },
    {
        id: 'all-entries', name: 'All entries', period: 'range', about: 'Every entry in the period, newest first: the full ledger, for checking or exporting.',
        build(data, p) {
            const rows = data.entries.filter((e) => inRange(e, p.from, p.to)).sort((a, b) => (a.date === b.date ? num(b.createdAt) - num(a.createdAt) : a.date < b.date ? 1 : -1))
                .map((e) => [e.date, TYPES[e.type].label, e.description, nameOf(data.categories, e.categoryId, ''), nameOf(data.accounts, e.accountId, ''), nameOf(data.accounts, e.toAccountId, ''), nameOf(data.people, e.personId, ''), num(e.amount)]);
            return { columns: [{ label: 'Date', kind: 'date' }, text('Type'), text('Description'), text('Category'), text('Account'), text('To account'), text('Person'), money('Amount')], rows, total: null };
        }
    }
];

/** A report's table as CSV text (plain numbers and ISO dates, so a spreadsheet reads them correctly). */
export function toCsv(table) {
    const cell = (v, kind) => {
        if (v === null || v === undefined) {
            return '';
        }
        const s = kind === 'percent' || kind === 'rate' ? (Math.round(v * 10000) / 100).toString() + '%' : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
        // quoted when needed; a leading = + - @ is neutralised so a spreadsheet never runs it as a formula
        const safe = typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s;
        return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [table.columns.map((c) => cell(c.label)).join(',')];
    table.rows.forEach((r) => lines.push(r.map((v, i) => cell(v, table.columns[i].kind)).join(',')));
    if (table.total) {
        lines.push(table.total.map((v, i) => cell(v, table.columns[i].kind)).join(','));
    }
    return lines.join('\n');
}

/** Ready-made periods for the range reports. */
export function presets(data, today, yearStart) {
    const thisMonth = monthKey(today);
    const lastMonth = addMonths(thisMonth, -1);
    const year = yearOf(today, yearStart);
    const lastYear = yearByStart(Number(year.key) - 1, yearStart);
    return [
        { id: 'this-month', label: 'This month', from: `${thisMonth}-01`, to: today },
        { id: 'last-month', label: 'Last month', from: `${lastMonth}-01`, to: monthEnd(lastMonth) },
        { id: 'last-3', label: 'Last 3 months', from: `${addMonths(thisMonth, -2)}-01`, to: today },
        { id: 'this-year', label: `This year (${year.label})`, from: year.from, to: today },
        { id: 'last-year', label: `Last year (${lastYear.label})`, from: lastYear.from, to: lastYear.to },
        { id: 'all', label: 'All time', from: firstEntryDate(data, today), to: today },
        { id: 'custom', label: 'Custom dates', from: null, to: null }
    ];
}

export { totals, isoDate };
