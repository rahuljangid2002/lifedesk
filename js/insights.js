// Dashboards (Monthly, Yearly, Balances and people) and Reports for the Money tool.
// Screens only: the figures come from reports.js and logic.js, the drawing from charts.js.
import * as L from './logic.js';
import * as S from './store.js';
import * as R from './reports.js';
import { columns, hbars, line, meters } from './charts.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The month a year starts in: the user's choice, else April for rupees (financial year) and January elsewhere. */
export function yearStart() {
    const p = S.prefs() || {};
    return Number(p.yearStart) || (L.currentFormat().currency === 'INR' ? 4 : 1);
}

const size = () => {
    const wide = window.innerWidth >= 900;
    return { half: wide ? 540 : 340, full: wide ? 1100 : 340, h: wide ? 240 : 200 };
};
const card = (title, note, body, span) => `<section class="card chart-card ${span ? 'span' : ''}"><div class="card-head"><span><h2>${title}</h2>${note ? `<small>${note}</small>` : ''}</span></div>${body}</section>`;

/** A headline number, with an optional change against the period before. */
function kpi(label, value, change) {
    let delta = '';
    if (change && change.prev) {
        const pct = Math.round(((change.now - change.prev) / Math.abs(change.prev)) * 100);
        if (pct !== 0) {
            const good = pct > 0 === change.upIsGood;
            delta = `<small class="delta ${good ? 'good' : 'bad'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${change.versus}</small>`;
        } else {
            delta = `<small class="delta">Same as ${change.versus}</small>`;
        }
    }
    return `<div class="kpi"><small>${label}</small><b>${value}</b>${delta}</div>`;
}

function topExpenses(from, to, h) {
    const list = S.data.entries.filter((e) => e.type === 'expense' && e.date >= from && e.date <= to).sort((a, b) => b.amount - a.amount).slice(0, 10);
    return list.length ? `<div class="list inner flush">${list.map((e) => h.entryRow(e, true)).join('')}</div>` : '<p class="empty">No expenses in this period.</p>';
}

function monthly(st, h) {
    const key = st.month;
    const m = L.monthSummary(S.data, key);
    const prev = L.monthSummary(S.data, L.addMonths(key, -1));
    const from = `${key}-01`;
    const to = L.monthEnd(key);
    const sz = size();
    const cats = R.topWithOther(R.byCategory(S.data, from, to));
    const days = R.dailySpend(S.data, key);
    const budget = L.budgetRows(S.data, key).filter((r) => r.planned).sort((a, b) => b.planned - a.planned).slice(0, 8).map((r) => ({ label: r.name, value: r.spent, limit: r.planned }));
    const lending = R.REPORTS.find((r) => r.id === 'lending-activity').build(S.data, { from, to });
    const versus = 'last month';
    return {
        hero: `${h.monthNav(key, 'insMonth')}
            <div class="stats">${h.stat('Opening balance', L.money(m.opening))}${h.stat('Closing balance', L.money(m.closing.net))}${h.stat('Money in hand', L.money(m.closing.inHand))}</div>`,
        body: `<div class="kpis">
                ${kpi('Income', L.money(m.income), { now: m.income, prev: prev.income, upIsGood: true, versus })}
                ${kpi('Expense', L.money(m.expense), { now: m.expense, prev: prev.expense, upIsGood: false, versus })}
                ${kpi('Savings', L.money(m.savings), { now: m.savings, prev: prev.savings, upIsGood: true, versus })}
                ${kpi('Savings rate', m.income ? `${Math.round((m.savings / m.income) * 100)}%` : '–')}
                ${kpi('Card owed', L.money(m.closing.cardOwed))}
                ${kpi('Owed to people', L.money(m.closing.owedToPeople))}
            </div>
            <div class="cards two">
                ${card('Spend by category', 'Largest first', hbars(cats, L.money))}
                ${card('Budget vs actual', 'Categories with a budget', meters(budget, L.money))}
                ${card('Daily spend', 'Total spent each day', columns(days.map((d) => ({ short: d.label, full: L.dateText(d.date, { weekday: 'short', day: 'numeric', month: 'short' }) })), [{ name: 'Spent', slot: 1, values: days.map((d) => d.value) }], L.money, L.compact, sz.full, sz.h), true)}
                ${card('Spend by account', 'Where the money was paid from', hbars(R.byAccount(S.data, from, to), L.money))}
                ${card('Top 10 expenses', 'Largest single entries', topExpenses(from, to, h))}
                ${lending.rows.length ? card('Lending activity', 'Lent, got back, borrowed and repaid', table(lending, 10), true) : ''}
            </div>`
    };
}

function yearly(st, h) {
    const start = yearStart();
    const years = R.yearsWithData(S.data, start, h.today());
    const year = years.find((y) => y.key === st.year) || years[0];
    const rows = R.monthsTable(S.data, year.months, h.today());
    const past = rows.filter((r) => `${r.key}-01` <= h.today());
    const income = past.reduce((s, r) => s + r.income, 0);
    const expense = past.reduce((s, r) => s + r.expense, 0);
    const sz = size();
    const labels = rows.map((r) => ({ short: r.label.slice(0, 3), full: r.label }));
    const highest = past.reduce((a, b) => (!a || b.expense > a.expense ? b : a), null);
    const lastClosing = [...past].reverse().find((r) => r.closing !== null);
    return {
        hero: `<h1>${start === 1 ? 'Year' : 'Financial year'} ${year.label}</h1>
            <div class="stats">${h.stat('Income', L.money(income))}${h.stat('Expense', L.money(expense))}${h.stat('Savings', L.money(income - expense))}</div>`,
        filters: `<label class="pick"><span>Year</span><select data-model="insights.year" data-rerender>${years.map((y) => `<option value="${y.key}" ${y.key === year.key ? 'selected' : ''}>${y.label}</option>`).join('')}</select></label>
            <label class="pick"><span>Year starts in</span><select data-setting="yearStart">${MONTHS.map((n, i) => `<option value="${i + 1}" ${i + 1 === start ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`,
        body: `<div class="kpis">
                ${kpi('Savings rate', income ? `${Math.round(((income - expense) / income) * 100)}%` : '–')}
                ${kpi('Average month', past.length ? L.money(Math.round(expense / past.length)) : '–')}
                ${kpi('Highest spending month', highest && highest.expense ? `${highest.label.split(' ')[0]} · ${L.money(highest.expense)}` : '–')}
                ${kpi('Closing balance', lastClosing ? L.money(lastClosing.closing) : '–')}
            </div>
            <div class="cards two">
                ${card('Income vs expense by month', '', columns(labels, [{ name: 'Income', slot: 1, values: rows.map((r) => r.income) }, { name: 'Expense', slot: 2, values: rows.map((r) => r.expense) }], L.money, L.compact, sz.full, sz.h), true)}
                ${card('Net balance trend', 'Bank + cash − card owed − owed to people, at each month end', line(labels, rows.map((r) => r.closing), 'Net balance', L.money, L.compact, sz.full, sz.h), true)}
                ${card('Top categories', 'Spending in the year', hbars(R.topWithOther(R.byCategory(S.data, year.from, year.to)), L.money))}
                ${card('Income by source', 'Income in the year', hbars(R.byCategory(S.data, year.from, year.to, 'income'), L.money))}
            </div>`
    };
}

function balances(st, h) {
    const t = L.totals(S.data);
    const accounts = R.accountRows(S.data);
    const cards = accounts.filter((a) => a.kind === 'card');
    const credit = cards.reduce((s, a) => s + Math.max(0, a.limit - a.value), 0);
    const owes = R.peopleRows(S.data, 'owesMe');
    const bad = owes.filter((p) => p.status === 'Bad Debt').reduce((s, p) => s + p.value, 0);
    const bars = (list) => list.filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
    return {
        hero: `<h1>Balances and people</h1>
            <div class="stats">${h.stat('In accounts', L.money(t.inHand))}${h.stat('Card owed', L.money(t.cardOwed))}${h.stat('Net balance', L.money(t.net))}</div>`,
        body: `<div class="kpis">
                ${kpi('Credit available', L.money(credit))}
                ${kpi('To receive', L.money(t.toReceive))}
                ${kpi('Owed to people', L.money(t.owedToPeople))}
                ${kpi('Bad debts', L.money(bad))}
            </div>
            <div class="cards two">
                ${card('Balance by account', 'Cash, banks and wallets', hbars(bars(accounts.filter((a) => a.kind !== 'card')), L.money, 'No money in any account.'))}
                ${card('Card owed by card', 'What each credit card is owed', hbars(bars(cards), L.money, 'Nothing owed on any card.'))}
                ${card('Owed to me', 'By person, bad debts excluded', hbars(bars(owes.filter((p) => p.status !== 'Bad Debt')), L.money, 'Nobody owes you.'))}
                ${card('I owe', 'By person', hbars(bars(R.peopleRows(S.data, 'iOwe')), L.money, 'You owe nobody.'))}
            </div>`
    };
}

const TABS = [['monthly', 'Monthly', monthly], ['yearly', 'Yearly', yearly], ['balances', 'Balances', balances]];

export function dashboards(st, h) {
    const tab = TABS.find((t) => t[0] === st.tab) || TABS[0];
    const view = tab[2](st, h);
    return `<header class="hero"><small class="eyebrow ${tab[0] === 'monthly' ? 'center' : ''}">Dashboards</small>${view.hero}</header>
    <main>
        <div class="filterbar"><div class="seg">${TABS.map(([id, label]) => `<button class="${id === tab[0] ? 'on' : ''}" data-action="insTab" data-tab="${id}">${label}</button>`).join('')}</div>
            ${view.filters || ''}</div>
        ${view.body}
    </main>`;
}

// ---------- reports ----------
function cell(v, kind) {
    if (v === null || v === undefined || v === '') {
        return '–';
    }
    if (kind === 'money') {
        return L.money(v);
    }
    if (kind === 'percent') {
        return `${Math.round(v * 100)}%`;
    }
    if (kind === 'date') {
        return L.dateText(v, { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return String(v);
}
const numeric = (kind) => kind === 'money' || kind === 'number' || kind === 'percent';

function table(t, limit = 500) {
    if (!t.rows.length) {
        return '<p class="empty">Nothing to show for this period.</p>';
    }
    const shown = t.rows.slice(0, limit);
    return `<div class="table-wrap"><table class="report">
        <thead><tr>${t.columns.map((c) => `<th class="${numeric(c.kind) ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
        <tbody>${shown.map((r) => `<tr>${r.map((v, i) => `<td class="${numeric(t.columns[i].kind) ? 'num' : ''}">${esc(cell(v, t.columns[i].kind))}</td>`).join('')}</tr>`).join('')}</tbody>
        ${t.total ? `<tfoot><tr>${t.total.map((v, i) => `<td class="${numeric(t.columns[i].kind) ? 'num' : ''}">${v === null || v === '' ? '' : esc(cell(v, t.columns[i].kind))}</td>`).join('')}</tr></tfoot>` : ''}
    </table></div>${t.rows.length > limit ? `<small>Showing the first ${limit} of ${t.rows.length} rows. The download has all of them.</small>` : ''}`;
}

/** The chosen report with its period worked out: { report, table, period (text) }. */
export function currentReport(st, today) {
    const report = R.REPORTS.find((r) => r.id === st.id) || R.REPORTS[0];
    const start = yearStart();
    const params = { today, yearStart: start };
    let period = 'As of today';
    if (report.period === 'range') {
        const list = R.presets(S.data, today, start);
        const preset = list.find((p) => p.id === st.preset) || list[0];
        params.from = preset.id === 'custom' ? st.from || `${L.monthKey(today)}-01` : preset.from;
        params.to = preset.id === 'custom' ? st.to || today : preset.to;
        period = `${L.dateText(params.from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${L.dateText(params.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else if (report.period === 'month') {
        params.month = st.month || L.monthKey(today);
        period = L.monthLabel(params.month);
    } else if (report.period === 'year') {
        const years = R.yearsWithData(S.data, start, today);
        params.year = years.find((y) => y.key === st.year) || years[0];
        period = `${start === 1 ? 'Year' : 'Financial year'} ${params.year.label}`;
    }
    return { report, params, period, table: report.build(S.data, params) };
}

export function reports(st, h) {
    const today = h.today();
    const { report, params, period, table: t } = currentReport(st, today);
    const start = yearStart();
    let control = '';
    if (report.period === 'range') {
        const list = R.presets(S.data, today, start);
        const preset = list.find((p) => p.id === st.preset) || list[0];
        control = `<label class="pick"><span>Period</span><select data-model="reports.preset" data-rerender>${list.map((p) => `<option value="${p.id}" ${p.id === preset.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
            ${preset.id === 'custom' ? `<label class="pick"><span>From</span><input type="date" value="${esc(params.from)}" max="${today}" data-model="reports.from" data-rerender></label><label class="pick"><span>To</span><input type="date" value="${esc(params.to)}" max="${today}" data-model="reports.to" data-rerender></label>` : ''}`;
    } else if (report.period === 'month') {
        control = `<label class="pick"><span>Month</span><input type="month" value="${esc(params.month)}" max="${L.monthKey(today)}" data-model="reports.month" data-rerender></label>`;
    } else if (report.period === 'year') {
        control = `<label class="pick"><span>Year</span><select data-model="reports.year" data-rerender>${R.yearsWithData(S.data, start, today).map((y) => `<option value="${y.key}" ${y.key === params.year.key ? 'selected' : ''}>${y.label}</option>`).join('')}</select></label>`;
    }
    return `<header class="hero"><small class="eyebrow">Reports</small><h1>${esc(report.name)}</h1><p class="hero-sub">${esc(report.about)}</p></header>
    <main>
        <div class="toolbar">
            <div class="filterbar"><label class="pick"><span>Report</span><select data-model="reports.id" data-rerender>${R.REPORTS.map((r) => `<option value="${r.id}" ${r.id === report.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>${control}</div>
            <button class="btn" data-action="reportDownload" ${t.rows.length ? '' : 'disabled'}>${h.icon('income')} Download CSV</button>
        </div>
        <section class="card flush"><div class="card-head pad"><span><h2>${esc(report.name)}</h2><small>${esc(period)} · ${t.rows.length} ${t.rows.length === 1 ? 'row' : 'rows'}</small></span></div>${table(t)}</section>
    </main>`;
}
