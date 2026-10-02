// LifeDesk: one login, several tools. The start screen (hub) lists the tools; Money is the first one.
// Each screen is a function that returns HTML from the current data and state; clicks and typing are
// handled once, at the bottom, through data-action / data-model attributes.
// To add a tool: add it to TOOLS, add its screens to SCREENS, and keep its data in its own collections.
import * as L from './logic.js';
import * as S from './store.js';
import { icon } from './icons.js';

const app = document.getElementById('app');
const today = () => L.isoDate();
const thisMonth = () => L.monthKey(today());

const state = {
    status: 'loading',
    route: 'hub',
    toast: null,
    add: null,
    daily: { month: thisMonth(), custom: false, from: null, to: null, view: 'spend', category: '', account: '', search: '', closed: new Set() },
    budget: { month: thisMonth(), edits: null, open: null },
    people: { view: 'owesMe', selected: null, form: null, adding: false },
    accounts: { form: null, pay: null, showClosed: false },
    more: { addingCategory: false }
};

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byId = (list, id) => list.find((x) => x.id === id);
const shortDate = (iso) => L.dateText(iso, { day: 'numeric', month: 'short' });
const longDay = (iso) => (iso === today() ? `Today · ${shortDate(iso)}` : L.dateText(iso, { weekday: 'short', day: 'numeric', month: 'short' }));
const activeAccounts = () => S.data.accounts.filter((a) => a.active !== false);
const defaultAccount = () => activeAccounts().find((a) => a.isDefault) || activeAccounts()[0];
const accountName = (id) => (byId(S.data.accounts, id) || {}).name || '';
const categoryName = (id) => (byId(S.data.categories, id) || {}).name || '';
const personName = (id) => (byId(S.data.people, id) || {}).name || '';
const KIND_ICON = { bank: 'bank', wallet: 'wallet', cash: 'cash', card: 'card' };

function toast(message, kind = 'ok') {
    state.toast = { message, kind };
    render();
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
        state.toast = null;
        render();
    }, 3200);
}

function blankEntry(keep) {
    const acc = defaultAccount();
    return {
        id: null,
        type: 'expense',
        amount: '',
        date: keep ? keep.date : today(),
        description: '',
        accountId: keep ? keep.accountId : acc ? acc.id : null,
        toAccountId: null,
        categoryId: null,
        categoryTouched: false,
        personId: null,
        newPerson: '',
        notes: '',
        back: null
    };
}

function go(route) {
    window.location.hash = route;
}

function entryMeta(e) {
    const bits = [];
    if (e.type !== 'expense') {
        bits.push(L.TYPES[e.type].label);
    }
    if (e.categoryId) {
        bits.push(categoryName(e.categoryId));
    }
    bits.push(e.type === 'transfer' ? `${accountName(e.accountId)} → ${accountName(e.toAccountId)}` : accountName(e.accountId));
    if (e.personId) {
        bits.push(personName(e.personId));
    }
    return bits.filter(Boolean).join(' · ');
}
function entryAmount(e) {
    const sign = L.TYPES[e.type].sign;
    return `<span class="amt ${sign > 0 ? 'in' : ''}">${sign > 0 ? '+' : sign < 0 ? '−' : ''}${L.money(Math.abs(e.amount))}</span>`;
}
function entryRow(e, withDate) {
    return `<div class="row">
        <span class="row-icon t-${e.type}">${icon(L.TYPES[e.type].icon)}</span>
        <span class="row-text"><b>${esc(e.description || L.TYPES[e.type].label)}</b><small>${withDate ? `${shortDate(e.date)} · ` : ''}${esc(entryMeta(e))}</small></span>
        ${entryAmount(e)}
        <button class="icon-btn" data-action="editEntry" data-id="${e.id}" title="Edit" aria-label="Edit">${icon('edit')}</button>
    </div>`;
}
function monthNav(key, action) {
    return `<div class="month-nav">
        <button class="icon-btn light" data-action="${action}" data-step="-1" aria-label="Previous month">${icon('chevLeft')}</button>
        <h1>${L.monthLabel(key)}</h1>
        <button class="icon-btn light" data-action="${action}" data-step="1" aria-label="Next month">${icon('chevRight')}</button>
    </div>`;
}
// long amounts get a smaller size instead of breaking across lines
const stat = (label, value) => {
    const len = String(value).length;
    return `<div class="stat"><small>${label}</small><b class="${len > 12 ? 'xlong' : len > 9 ? 'long' : ''}">${value}</b></div>`;
};
const currencyOptions = (selected) =>
    L.currencyList()
        .map((c) => `<option value="${c.code}" ${c.code === selected ? 'selected' : ''}>${esc(c.name)} (${c.code})</option>`)
        .join('');

// ---------- screens ----------
function login() {
    return `<div class="login">
        <div class="logo">${icon('logo')}</div>
        <h1>LifeDesk</h1>
        <p>Your everyday desk: money, budget, people and loans today, with more tools on the way.</p>
        ${S.methods.google ? `<button class="btn primary wide" data-action="google">Continue with Google</button>` : ''}
        ${S.methods.emailLink ? `<div class="or">or sign in with a link sent to your email</div>
        <input type="email" id="login-email" placeholder="you@example.com" autocomplete="email" aria-label="Email">
        <button class="btn wide" data-action="emailLink">Email me a sign-in link</button>` : ''}
        <small>New here? The same buttons create your account. Your data is private to you.</small>
    </div>`;
}

/** First visit: choose the currency amounts are shown in. */
function welcome() {
    return `<div class="login">
        <div class="logo">${icon('logo')}</div>
        <h1>Welcome to LifeDesk</h1>
        <p>Choose the currency you use. Amounts, numbers and dates follow your region; you can change this later under Account.</p>
        <label class="left">Currency<select id="welcome-currency">${currencyOptions(L.guessCurrency())}</select></label>
        <button class="btn primary wide" data-action="welcomeSave">Continue</button>
    </div>`;
}

/** Tools on the start screen. ready: false shows the tile as coming soon. */
const TOOLS = [
    { id: 'money', name: 'Money', icon: 'coins', route: 'home', ready: true, about: 'Accounts, daily expenses, budget, people and loans' },
    { id: 'reminders', name: 'Renewal reminders', icon: 'bell', route: null, ready: false, about: 'Insurance, subscriptions, documents and bills that come up for renewal' }
];

function hub() {
    const t = L.totals(S.data);
    const m = L.monthSummary(S.data, thisMonth());
    const tiles = TOOLS.map((tool) =>
        tool.ready
            ? `<a class="tool" href="#${tool.route}"><span class="tool-icon">${icon(tool.icon)}</span><span class="tool-text"><b>${tool.name}</b><small>${tool.about}</small>${tool.id === 'money' ? `<small class="tool-figure">Net balance ${L.money(t.net)} · spent ${L.money(m.expense)} this month</small>` : ''}</span><span class="tool-go">${icon('chevRight')}</span></a>`
            : `<div class="tool soon"><span class="tool-icon">${icon(tool.icon)}</span><span class="tool-text"><b>${tool.name}</b><small>${tool.about}</small></span><span class="pill">Coming soon</span></div>`
    ).join('');
    return `<header class="hero">
        <small class="eyebrow">LifeDesk</small><h1>Hello, ${esc(S.user.name.split(' ')[0])}</h1>
        <p class="hero-sub">${new Date().toLocaleDateString(L.currentFormat().locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </header>
    <main>
        ${S.isDemo ? `<div class="notice">Demo mode: your data is saved only in this browser.</div>` : ''}
        <h3>Your tools</h3>
        <div class="cards">${tiles}</div>
        <a class="card link" href="#more"><div class="card-head"><span><b>Account &amp; backup</b><small>${esc(S.user.contact)}</small></span>${icon('chevRight')}</div></a>
    </main>`;
}

function home() {
    const key = thisMonth();
    const m = L.monthSummary(S.data, key);
    const t = L.totals(S.data);
    const rows = L.budgetRows(S.data, key);
    const planned = rows.reduce((s, r) => s + r.planned, 0);
    const spent = rows.reduce((s, r) => s + r.spent, 0);
    const pct = planned ? Math.min(100, Math.round((spent / planned) * 100)) : 0;
    const accounts = activeAccounts()
        .map((a) => {
            const bal = L.accountBalance(a, S.data.entries);
            return `<div class="tile"><span class="tile-top">${icon(KIND_ICON[a.kind])}<small>${L.ACCOUNT_KINDS[a.kind]}</small></span><small>${esc(a.name)}</small><b>${a.kind === 'card' ? `${L.money(Math.max(0, -bal))} owed` : L.money(bal)}</b></div>`;
        })
        .join('');
    const recent = [...S.data.entries].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1)).slice(0, 5);
    return `<header class="hero">
        <a class="back" href="#hub">${icon('chevLeft')} LifeDesk</a>
        <small class="eyebrow">Money</small><h1>${L.monthLabel(key)}</h1>
        <div class="stats">${stat('Income', L.money(m.income))}${stat('Expense', L.money(m.expense))}${stat('Net balance', L.money(t.net))}</div>
        <p class="hero-sub">Money in hand ${L.money(t.inHand)}${t.cardOwed ? ` · Card owed ${L.money(t.cardOwed)}` : ''}${t.owedToPeople ? ` · Owed to people ${L.money(t.owedToPeople)}` : ''}</p>
    </header>
    <main class="dash">
        <div class="shortcuts span">
            <a class="shortcut main" href="#add">${icon('plus')}<span>Add Entry</span></a>
            <a class="shortcut" href="#people">${icon('users')}<span>People &amp; Loans</span></a>
            <a class="shortcut" href="#budget">${icon('target')}<span>Budget</span></a>
            <a class="shortcut" href="#daily">${icon('calendar')}<span>Daily</span></a>
        </div>
        ${t.cardOwed > 0 ? `<a class="notice span" href="#accounts">Credit card owed ${L.money(t.cardOwed)} – tap to pay</a>` : ''}
        <section class="card"><div class="card-head"><h2>Accounts</h2><a href="#accounts">Manage</a></div><div class="tiles">${accounts}</div></section>
        <div class="stack">
            <a class="card link" href="#budget"><div class="card-head"><h2>Budget this month</h2><span class="pill">${planned ? `${pct}%` : 'Not set'}</span></div>
                <div class="bar"><i class="${pct >= 100 ? 'red' : pct >= 90 ? 'orange' : ''}" style="width:${pct}%"></i></div>
                <small>${L.money(spent)} spent${planned ? ` of ${L.money(planned)}` : ''}</small></a>
            <a class="card link" href="#people"><div class="card-head"><h2>People &amp; Loans</h2>${icon('chevRight')}</div>
                <div class="tiles">${stat('To receive', L.money(t.toReceive))}${stat('I owe', L.money(t.owedToPeople))}</div></a>
        </div>
        ${recent.length ? `<section class="card span"><div class="card-head"><h2>Latest entries</h2><a href="#daily">See all</a></div><div class="list inner">${recent.map((e) => entryRow(e, true)).join('')}</div></section>` : ''}
    </main>`;
}

function addEntry() {
    if (!state.add) {
        state.add = blankEntry();
    }
    const f = state.add;
    const editing = !!f.id;
    const m = L.monthSummary(S.data, thisMonth());
    const t = L.totals(S.data);
    const tiles = Object.entries(L.TYPES)
        .map(([k, v]) => `<button class="tile-btn t-${k} ${f.type === k ? 'on' : ''}" data-action="setType" data-type="${k}">${icon(v.icon)}<span>${v.label}</span></button>`)
        .join('');
    const chips = (selected, action, skip) =>
        activeAccounts()
            .filter((a) => a.id !== skip)
            .map((a) => {
                const bal = L.accountBalance(a, S.data.entries);
                return `<button class="chip ${a.id === selected ? 'on' : ''}" data-action="${action}" data-id="${a.id}">${icon(KIND_ICON[a.kind])}<span><b>${esc(a.name)}</b><small>${a.kind === 'card' ? `Owes ${L.money(Math.max(0, -bal))}` : L.money(bal)}</small></span></button>`;
            })
            .join('');
    const needsCategory = f.type === 'expense' || f.type === 'income';
    const needsPerson = L.PERSON_TYPES.includes(f.type);
    const direction = f.type === 'lent' || f.type === 'gotback' ? 'owesMe' : 'iOwe';
    const cats = S.data.categories.filter((c) => c.type === f.type).sort((a, b) => a.name.localeCompare(b.name));
    const people = S.data.people.filter((p) => p.direction === direction);
    const recent = [...S.data.entries]
        .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1))
        .slice(0, 15);
    return `<header class="hero">
        <small class="eyebrow">This month</small><h1>${L.monthLabel(thisMonth())}</h1>
        <div class="stats">${stat('Income', L.money(m.income))}${stat('Expense', L.money(m.expense))}${stat('Net balance', L.money(t.net))}</div>
        <p class="hero-sub">Bank ${L.money(t.bank)} · Cash ${L.money(t.cash)}${t.cardOwed ? ` · Card owed ${L.money(t.cardOwed)}` : ''}</p>
    </header>
    <main class="two">
        <div class="pane">
            ${editing ? `<div class="banner"><div><b>Editing an entry</b><small>${esc(f.label)}</small></div><button class="btn" data-action="cancelEdit">Cancel</button></div>` : ''}
            <h3>What kind of entry?</h3>
            <div class="type-grid">${tiles}</div>
            <label class="amount"><span>${esc(L.symbol())}</span><input inputmode="decimal" type="number" min="0" step="0.01" placeholder="0" value="${esc(f.amount)}" data-model="add.amount" aria-label="Amount"></label>
            <div class="grid2">
                <label>Date<input type="date" max="${today()}" value="${esc(f.date)}" data-model="add.date"></label>
                <label>Description<input type="text" placeholder="e.g. Fuel, Salary, Groceries" value="${esc(f.description)}" data-model="add.description" data-then="suggest" maxlength="255"></label>
            </div>
            <h3>${f.type === 'transfer' ? 'From account' : L.TYPES[f.type].sign > 0 ? 'Received into' : 'Paid from'}</h3>
            <div class="chips">${chips(f.accountId, 'setAccount')}</div>
            ${f.type === 'transfer' ? `<h3>To account</h3><div class="chips">${chips(f.toAccountId, 'setToAccount', f.accountId)}</div>` : ''}
            ${needsCategory ? `<label>Category<select data-model="add.categoryId" data-then="touchCategory" id="add-category"><option value="">Choose a category</option>${cats.map((c) => `<option value="${c.id}" ${c.id === f.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
            ${needsPerson ? `<label>${direction === 'owesMe' ? 'Person (owes you)' : 'Person (you owe)'}<select data-model="add.personId" data-rerender><option value="">Choose a person</option>${people.map((p) => `<option value="${p.id}" ${p.id === f.personId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}<option value="__new" ${f.personId === '__new' ? 'selected' : ''}>＋ New person</option></select></label>
                ${f.personId === '__new' ? `<label>New person's name<input type="text" value="${esc(f.newPerson)}" data-model="add.newPerson"></label>` : ''}` : ''}
            <label>Notes (optional)<input type="text" value="${esc(f.notes)}" data-model="add.notes"></label>
            <button class="btn primary wide" data-action="saveEntry">${editing ? 'Save changes' : `Save ${L.TYPES[f.type].label}`}</button>
            ${editing ? `<div class="split"><button class="btn" data-action="cancelEdit">Cancel</button><button class="btn danger" data-action="deleteEntry">${icon('trash')} Delete entry</button></div>` : ''}
        </div>
        ${!editing && recent.length ? `<div class="pane"><h3>Recent entries</h3><section class="list">${recent.map((e) => entryRow(e, true)).join('')}</section></div>` : ''}
    </main>`;
}

function daily() {
    const d = state.daily;
    const from = d.custom ? d.from : `${d.month}-01`;
    const to = d.custom ? d.to : L.monthEnd(d.month);
    const inView = (e) => (d.view === 'spend' ? e.type === 'expense' : d.view === 'income' ? e.type === 'income' : true);
    const q = d.search.trim().toLowerCase();
    const filter = (e) =>
        inView(e) &&
        (!d.category || e.categoryId === d.category) &&
        (!d.account || e.accountId === d.account || e.toAccountId === d.account) &&
        (!q || `${e.description || ''} ${categoryName(e.categoryId)} ${personName(e.personId)}`.toLowerCase().includes(q));
    const days = from && to ? L.groupByDay(S.data.entries, from, to, filter) : [];
    const total = days.reduce((s, x) => s + x.total, 0);
    const count = days.reduce((s, x) => s + x.entries.length, 0);
    const lastDay = to > today() ? today() : to;
    const span = Math.max(1, Math.round((new Date(lastDay) - new Date(from)) / 86400000) + 1);
    const top = days.reduce((a, b) => (!a || b.total > a.total ? b : a), null);
    const cats = S.data.categories.filter((c) => (d.view === 'income' ? c.type === 'income' : d.view === 'spend' ? c.type === 'expense' : true));
    const seg = (v, label) => `<button class="${d.view === v ? 'on' : ''}" data-action="dailyView" data-view="${v}">${label}</button>`;
    return `<header class="hero">
        <small class="eyebrow center">Daily Expenses</small>
        ${d.custom ? `<h1 class="center">${from && to ? `${shortDate(from)} – ${shortDate(to)}` : 'Custom dates'}</h1>` : monthNav(d.month, 'dailyMonth')}
        <div class="stats">${stat(d.view === 'income' ? 'Income' : d.view === 'spend' ? 'Spent' : 'Entries', d.view === 'all' ? count : L.money(total))}${stat('Per day', d.view === 'all' ? '–' : L.money(Math.round(total / span)))}${stat('Highest day', top && d.view !== 'all' ? `${shortDate(top.date)} · ${L.money(top.total)}` : '–')}</div>
    </header>
    <main class="narrow">
        <div class="split"><button class="link-btn" data-action="dailyCustom">${d.custom ? 'Back to months' : `${icon('calendar')} Custom dates`}</button>${days.length ? `<button class="link-btn" data-action="dailyToggleAll">${d.closed.size ? 'Expand all' : 'Collapse all'}</button>` : ''}</div>
        ${d.custom ? `<div class="grid2"><label>From<input type="date" value="${esc(d.from)}" data-model="daily.from" data-rerender></label><label>To<input type="date" value="${esc(d.to)}" data-model="daily.to" data-rerender></label></div>` : ''}
        <div class="seg">${seg('spend', 'Spending')}${seg('income', 'Income')}${seg('all', 'All entries')}</div>
        <div class="grid2">
            <select data-model="daily.category" data-rerender aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option value="${c.id}" ${c.id === d.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
            <select data-model="daily.account" data-rerender aria-label="Account"><option value="">All accounts</option>${S.data.accounts.map((a) => `<option value="${a.id}" ${a.id === d.account ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
        </div>
        <input type="search" placeholder="Search description…" value="${esc(d.search)}" data-model="daily.search" data-rerender-soft aria-label="Search">
        <div id="daily-days">${dailyDays(days)}</div>
    </main>`;
}
function dailyDays(days) {
    const d = state.daily;
    if (!days.length) {
        return '<p class="empty">No entries for these dates and filters.</p>';
    }
    return days
        .map((x) => {
            const open = !d.closed.has(x.date);
            return `<section class="day"><button class="day-head" data-action="dailyToggle" data-date="${x.date}">${icon(open ? 'chevDown' : 'chevRight')}<b>${longDay(x.date)}</b><small>${x.entries.length} ${x.entries.length === 1 ? 'entry' : 'entries'}</small><b>${L.money(x.total)}</b></button>
                ${open ? x.entries.map((e) => entryRow(e, false)).join('') : ''}</section>`;
        })
        .join('');
}

function budget() {
    const b = state.budget;
    const rows = L.budgetRows(S.data, b.month);
    const value = (r) => (b.edits && r.id in b.edits ? b.edits[r.id] : r.planned || '');
    const planned = rows.reduce((s, r) => s + (Number(value(r)) || 0), 0);
    const spent = rows.reduce((s, r) => s + r.spent, 0);
    const income = L.monthSummary(S.data, L.addMonths(b.month, -1)).income;
    const list = rows
        .map((r) => {
            const plan = Number(value(r)) || 0;
            const pct = plan ? Math.min(100, Math.round((r.spent / plan) * 100)) : r.spent ? 100 : 0;
            const colour = plan ? (r.spent > plan ? 'red' : pct >= 90 ? 'orange' : '') : r.spent ? 'red' : '';
            const open = b.open === r.id;
            const entries = open ? S.data.entries.filter((e) => e.type === 'expense' && e.categoryId === r.id && L.monthKey(e.date) === b.month).sort((x, y) => (x.date < y.date ? 1 : -1)) : [];
            return `<section class="card budget-row ${open ? 'open span' : ''}">
                <div class="card-head"><button class="row-name" data-action="budgetOpen" data-id="${r.id}"><b>${esc(r.name)}</b><small>${r.lastMonth || r.average ? `Last month ${L.money(r.lastMonth)} · 3-month avg ${L.money(r.average)}` : 'No recent spend'}</small></button>
                    <label class="mini">${esc(L.symbol())}<input type="number" inputmode="numeric" min="0" step="1" value="${esc(value(r))}" data-budget="${r.id}" aria-label="Budget for ${esc(r.name)}"></label></div>
                ${plan || r.spent ? `<div class="bar"><i class="${colour}" style="width:${pct}%"></i></div><small>${L.money(r.spent)}${plan ? ` of ${L.money(plan)}` : ''} spent${r.spent ? ` · <button class="link-btn" data-action="budgetOpen" data-id="${r.id}">${open ? 'Hide entries' : 'See entries'}</button>` : ''}</small>` : ''}
                ${open ? `<div class="list inner">${entries.map((e) => entryRow(e, true)).join('') || '<p class="empty">No expenses yet.</p>'}<div class="row total"><span class="row-text"><b>Total</b></span><span class="amt">${L.money(r.spent)}</span></div></div>` : ''}
            </section>`;
        })
        .join('');
    return `<header class="hero">
        <small class="eyebrow center">Budget</small>${monthNav(b.month, 'budgetMonth')}
        <div class="stats">${stat('Planned', L.money(planned))}${stat('Spent so far', L.money(spent))}${stat('Last month income', L.money(income))}</div>
    </header>
    <main>
        <div class="split wrap"><button class="btn" data-action="budgetCopy">Copy last month</button><button class="btn" data-action="budgetAverage">Use 3-month average</button></div>
        <div class="cards">${list}</div>
        <div class="sticky"><button class="btn primary wide" data-action="budgetSave" ${b.edits ? '' : 'disabled'}>${b.edits ? 'Save budget' : 'Budget saved'}</button></div>
    </main>`;
}

function people() {
    const s = state.people;
    const t = L.totals(S.data);
    const list = S.data.people
        .filter((p) => p.direction === s.view)
        .map((p) => ({ ...p, out: L.personOutstanding(p, S.data.entries) }))
        .sort((a, b) => b.out - a.out);
    const seg = (v, label) => `<button class="${s.view === v ? 'on' : ''}" data-action="peopleView" data-view="${v}">${label}</button>`;
    const cards = list
        .map((p) => {
            const open = s.selected === p.id;
            const status = p.status || 'Active';
            const history = open ? S.data.entries.filter((e) => e.personId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
            const quick = p.direction === 'owesMe' ? [['gotback', 'Got money back'], ['lent', 'Gave more']] : [['repaid', 'Paid back'], ['borrowed', 'Borrowed more']];
            const form = open && s.form;
            return `<section class="card person ${open ? 'open span' : ''}">
                <button class="card-head row-name" data-action="personOpen" data-id="${p.id}"><span><b>${esc(p.name)}</b><small>${p.direction === 'owesMe' ? 'Owes you' : 'You owe'} · <span class="badge ${status === 'Bad Debt' ? 'bad' : status === 'Settled' ? 'done' : ''}">${status}</span></small></span><b class="big">${L.money(p.out)}</b></button>
                ${open ? `<div class="split wrap">${quick.map(([k, label]) => `<button class="btn ${k === quick[0][0] ? 'primary' : ''}" data-action="personForm" data-type="${k}">${label}</button>`).join('')}</div>
                    ${form ? `<div class="form"><h3>${esc(form.label)}</h3>
                        <label class="amount small"><span>${esc(L.symbol())}</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${esc(form.amount)}" data-model="people.form.amount" aria-label="Amount"></label>
                        <label>Date<input type="date" max="${today()}" value="${esc(form.date)}" data-model="people.form.date"></label>
                        <label>${L.TYPES[form.type].sign > 0 ? 'Received into' : 'Paid from'}<select data-model="people.form.accountId">${activeAccounts().filter((a) => a.kind !== 'card').map((a) => `<option value="${a.id}" ${a.id === form.accountId ? 'selected' : ''}>${esc(a.name)} (${L.money(L.accountBalance(a, S.data.entries))})</option>`).join('')}</select></label>
                        <div class="split"><button class="btn" data-action="personFormCancel">Cancel</button><button class="btn primary" data-action="personFormSave">Save</button></div></div>` : ''}
                    <h3>Status</h3><div class="split wrap">${['Active', 'Settled', 'Bad Debt'].map((x) => `<button class="btn ${x === status ? 'on' : ''}" data-action="personStatus" data-status="${x}" ${x === status ? 'disabled' : ''}>${x}</button>`).join('')}</div>
                    <div class="grid2"><label>Phone<input type="tel" value="${esc(p.phone || '')}" data-person-field="phone" data-id="${p.id}"></label>
                    <label>Notes<input type="text" value="${esc(p.notes || '')}" data-person-field="notes" data-id="${p.id}"></label></div>
                    <h3>History</h3><div class="list inner">${history.map((e) => entryRow(e, true)).join('') || `<p class="empty">No entries yet.${p.opening ? ` Balance comes from the opening amount of ${L.money(p.opening)}.` : ''}</p>`}</div>
                    ${history.length ? '' : `<button class="btn danger" data-action="personDelete" data-id="${p.id}">${icon('trash')} Delete person</button>`}` : ''}
            </section>`;
        })
        .join('');
    return `<header class="hero">
        <small class="eyebrow">People &amp; Loans</small><h1>Who owes whom</h1>
        <div class="stats">${stat('To receive', L.money(t.toReceive))}${stat('I owe', L.money(t.owedToPeople))}${stat('People', S.data.people.length)}</div>
    </header>
    <main>
        <div class="toolbar"><div class="seg">${seg('owesMe', 'Owe me')}${seg('iOwe', 'I owe')}</div>
        ${s.adding ? '' : `<button class="btn" data-action="personAddToggle">${icon('plus')} Add person</button>`}</div>
        ${s.adding ? `<section class="card form"><h3>Add person</h3>
            <label>Name<input type="text" id="np-name"></label>
            <label>${s.view === 'owesMe' ? 'They already owe you (optional)' : 'You already owe them (optional)'}<input type="number" inputmode="decimal" min="0" id="np-opening" placeholder="0"></label>
            <label>Phone (optional)<input type="tel" id="np-phone"></label>
            <div class="split"><button class="btn" data-action="personAddToggle">Cancel</button><button class="btn primary" data-action="personAddSave">Add</button></div></section>` : ''}
        <div class="cards">${cards || '<p class="empty span">Nobody here yet.</p>'}</div>
    </main>`;
}

function accounts() {
    const s = state.accounts;
    const t = L.totals(S.data);
    const list = S.data.accounts.filter((a) => s.showClosed || a.active !== false);
    const cards = list
        .map((a) => {
            const bal = L.accountBalance(a, S.data.entries);
            const owed = Math.max(0, -bal);
            const used = a.kind === 'card' && a.limit ? Math.min(100, Math.round((owed / a.limit) * 100)) : 0;
            const meta = [L.ACCOUNT_KINDS[a.kind], a.last4 ? `•••• ${esc(a.last4)}` : '', a.kind === 'card' && a.dueDay ? `Bill due on ${a.dueDay}` : '', a.isDefault ? 'Default' : '', a.active === false ? 'Closed' : ''].filter(Boolean).join(' · ');
            const paying = s.pay && s.pay.cardId === a.id;
            return `<section class="card ${paying ? 'open span' : ''}">
                <div class="card-head"><span class="with-icon"><span class="row-icon">${icon(KIND_ICON[a.kind])}</span><span><b>${esc(a.name)}</b><small>${meta}</small></span></span><b class="big">${a.kind === 'card' ? `${L.money(owed)} owed` : L.money(bal)}</b></div>
                ${a.kind === 'card' && a.limit ? `<div class="bar"><i class="${used >= 90 ? 'red' : used >= 70 ? 'orange' : ''}" style="width:${used}%"></i></div><small>${L.money(a.limit - owed)} left of ${L.money(a.limit)}</small>` : ''}
                <div class="split wrap">
                    ${a.kind === 'card' && owed > 0 && a.active !== false ? `<button class="btn primary" data-action="payOpen" data-id="${a.id}">Pay bill</button>` : ''}
                    <button class="btn" data-action="accountEdit" data-id="${a.id}">Edit</button>
                    ${a.active === false ? `<button class="btn" data-action="accountReopen" data-id="${a.id}">Reopen</button>` : a.kind === 'cash' ? '' : `<button class="btn danger" data-action="accountRemove" data-id="${a.id}">Remove</button>`}
                </div>
                ${paying ? payForm(a, owed) : ''}
            </section>`;
        })
        .join('');
    return `<header class="hero">
        <small class="eyebrow">My accounts</small><h1>Banks, cash and credit cards</h1>
        <div class="stats">${stat('Bank + cash', L.money(t.inHand))}${stat('Card owed', L.money(t.cardOwed))}${stat('Net balance', L.money(t.net))}</div>
    </header>
    <main>
        ${s.form ? accountForm() : `<div class="split wrap"><button class="btn primary" data-action="accountNew" data-kind="bank">＋ Bank account</button><button class="btn" data-action="accountNew" data-kind="card">＋ Credit card</button><button class="btn" data-action="accountNew" data-kind="wallet">＋ Wallet</button></div>`}
        <div class="cards">${cards}</div>
        ${S.data.accounts.some((a) => a.active === false) ? `<button class="link-btn" data-action="accountsClosed">${s.showClosed ? 'Hide closed accounts' : 'Show closed accounts'}</button>` : ''}
    </main>`;
}
function accountForm() {
    const f = state.accounts.form;
    const card = f.kind === 'card';
    return `<section class="card form"><h3>${f.id ? 'Edit' : 'Add'} ${L.ACCOUNT_KINDS[f.kind].toLowerCase()}</h3>
        <label>Name<input type="text" value="${esc(f.name)}" data-model="accounts.form.name" placeholder="${card ? 'e.g. Visa card' : 'e.g. Main bank'}"></label>
        <div class="grid2">
            <label>${card ? 'Amount owed at the start' : 'Opening balance'}<input type="number" inputmode="decimal" min="0" value="${esc(f.opening)}" data-model="accounts.form.opening" placeholder="0"></label>
            <label>As of date<input type="date" max="${today()}" value="${esc(f.openingDate || '')}" data-model="accounts.form.openingDate"></label>
        </div>
        ${card ? `<div class="grid2"><label>Credit limit<input type="number" inputmode="numeric" min="0" value="${esc(f.limit)}" data-model="accounts.form.limit"></label><label>Bill due day (1–31)<input type="number" inputmode="numeric" min="1" max="31" value="${esc(f.dueDay)}" data-model="accounts.form.dueDay"></label></div>` : ''}
        <label>Last 4 digits (optional)<input type="text" inputmode="numeric" maxlength="4" value="${esc(f.last4)}" data-model="accounts.form.last4"></label>
        ${card ? '' : `<label class="check"><input type="checkbox" ${f.isDefault ? 'checked' : ''} data-model="accounts.form.isDefault"> Use as my default account</label>`}
        <div class="split"><button class="btn" data-action="accountCancel">Cancel</button><button class="btn primary" data-action="accountSave">Save</button></div></section>`;
}
function payForm(card, owed) {
    const p = state.accounts.pay;
    const sources = activeAccounts().filter((a) => a.kind !== 'card');
    return `<div class="form"><h3>Pay ${esc(card.name)} bill</h3>
        <div class="seg"><button class="${p.mode === 'full' ? 'on' : ''}" data-action="payMode" data-mode="full">Full ${L.money(owed)}</button><button class="${p.mode === 'part' ? 'on' : ''}" data-action="payMode" data-mode="part">Partial</button></div>
        ${p.mode === 'part' ? `<label>Amount<input type="number" inputmode="decimal" min="0" max="${owed}" value="${esc(p.amount)}" data-model="accounts.pay.amount"></label>` : ''}
        <label>Pay from<select data-model="accounts.pay.fromId">${sources.map((a) => `<option value="${a.id}" ${a.id === p.fromId ? 'selected' : ''}>${esc(a.name)} (${L.money(L.accountBalance(a, S.data.entries))})</option>`).join('')}</select></label>
        <div class="split"><button class="btn" data-action="payCancel">Cancel</button><button class="btn primary" data-action="paySave">Pay</button></div></div>`;
}

function more() {
    const f = L.currentFormat();
    return `<header class="hero"><a class="back" href="#hub">${icon('chevLeft')} LifeDesk</a><small class="eyebrow">Account &amp; backup</small><h1>${esc(S.user.name)}</h1><p class="hero-sub">${esc(S.user.contact)}</p></header>
    <main class="dash">
        ${S.isDemo ? `<div class="notice span">Demo mode: your data is saved only in this browser.</div>` : ''}
        <section class="card"><div class="card-head"><h2>Region</h2></div>
            <label>Currency<select data-setting="currency">${currencyOptions(f.currency)}</select></label>
            <small>Example: ${L.money(1234567.5)} · ${L.dateText(today(), { day: 'numeric', month: 'long', year: 'numeric' })}. Changing the currency changes how amounts are shown; it does not convert them.</small></section>
        <section class="card"><div class="card-head"><h2>Money</h2></div>
            <a class="row nav-row" href="#home">Money home ${icon('chevRight')}</a><a class="row nav-row" href="#people">People &amp; Loans ${icon('chevRight')}</a><a class="row nav-row" href="#accounts">My Accounts ${icon('chevRight')}</a></section>
        <section class="card"><div class="card-head"><h2>Money categories</h2><button class="link-btn" data-action="categoryToggle">${state.more.addingCategory ? 'Cancel' : '＋ Add'}</button></div>
            ${state.more.addingCategory ? `<div class="form"><label>Name<input type="text" id="nc-name"></label><label>Type<select id="nc-type"><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Keywords, comma separated (used to suggest it)<input type="text" id="nc-keys" placeholder="e.g. fuel, diesel"></label><button class="btn primary" data-action="categorySave">Add category</button></div>` : ''}
            <small>${S.data.categories.filter((c) => c.type === 'expense').length} expense and ${S.data.categories.filter((c) => c.type === 'income').length} income categories</small></section>
        <section class="card"><div class="card-head"><h2>Backup</h2></div>
            <div class="split wrap"><button class="btn" data-action="exportData">Download my data</button><label class="btn file">Restore from file<input type="file" accept="application/json" data-file="import" hidden></label></div>
            <small>${S.data.entries.length} entries · ${S.data.accounts.length} accounts · ${S.data.people.length} people</small></section>
        <div class="span">${S.isDemo ? `<button class="btn danger wide" data-action="demoReset">Erase demo data</button>` : `<button class="btn wide" data-action="signOut">${icon('logout')} Sign out</button>`}</div>
    </main>`;
}

const SCREENS = { hub, home, add: addEntry, daily, budget, people, accounts, more };
const NO_TABS = ['hub'];
// phone: bottom bar
const NAV = [['home', 'home', 'Home'], ['daily', 'calendar', 'Daily'], ['add', 'plus', 'Add'], ['budget', 'target', 'Budget'], ['more', 'user', 'Account']];
// wide screens: side menu
const SIDE = [
    ['LifeDesk', [['hub', 'grid', 'All tools']]],
    ['Money', [['home', 'home', 'Home'], ['add', 'plus', 'Add entry'], ['daily', 'calendar', 'Daily expenses'], ['budget', 'target', 'Budget'], ['people', 'users', 'People & Loans'], ['accounts', 'wallet', 'My accounts']]],
    ['You', [['more', 'user', 'Account & backup']]]
];

function render() {
    if (state.status === 'loading') {
        app.innerHTML = `<div class="loading"><div class="logo">${icon('logo')}</div><p>Loading…</p></div>`;
        return;
    }
    if (state.status === 'signedOut') {
        app.innerHTML = login() + toastHtml();
        return;
    }
    L.setFormat(S.prefs());
    if (!S.prefs()) {
        app.innerHTML = welcome() + toastHtml();
        return;
    }
    if (!SCREENS[state.route]) {
        state.route = 'hub';
    }
    const screen = SCREENS[state.route];
    const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.model : null;
    const side = SIDE.map(([title, links]) => `<small>${title}</small>${links.map(([r, ic, label]) => `<a href="#${r}" class="${state.route === r ? 'on' : ''}">${icon(ic)}<span>${label}</span></a>`).join('')}`).join('');
    app.innerHTML = `<div class="app">
        <aside class="side"><a class="brand" href="#hub"><span class="logo small">${icon('logo')}</span>LifeDesk</a><nav>${side}</nav><div class="side-user"><b>${esc(S.user.name)}</b><small>${esc(S.user.contact)}</small></div></aside>
        <div class="shell">${screen()}</div>
        ${NO_TABS.includes(state.route) ? '' : `<nav class="tabbar">${NAV.map(([r, ic, label]) => `<a href="#${r}" class="${state.route === r ? 'on' : ''} ${r === 'add' ? 'add' : ''}"><span>${icon(ic)}</span>${label}</a>`).join('')}</nav>`}
    </div>${toastHtml()}`;
    if (focus) {
        const el = app.querySelector(`[data-model="${focus}"]`);
        if (el) {
            el.focus();
            if (el.setSelectionRange && el.type !== 'number' && el.type !== 'date') {
                el.setSelectionRange(el.value.length, el.value.length);
            }
        }
    }
}
const toastHtml = () => (state.toast ? `<div class="toast ${state.toast.kind}" role="status">${esc(state.toast.message)}</div>` : '');

// ---------- actions ----------
const actions = {
    // login and first visit
    async google() {
        await S.signInGoogle();
    },
    async emailLink() {
        const email = document.getElementById('login-email').value.trim();
        if (!email) {
            return toast('Enter your email address.', 'warn');
        }
        await S.sendEmailLink(email);
        toast(`Sign-in link sent to ${email}. Open it on this device.`);
    },
    async signOut() {
        await S.signOut();
    },
    async welcomeSave() {
        await S.save('settings', { id: 'prefs', currency: document.getElementById('welcome-currency').value });
    },

    // add entry
    setType(el) {
        const f = state.add;
        f.type = el.dataset.type;
        f.categoryId = f.categoryTouched ? null : L.suggestCategory(S.data.categories, f.description, f.type);
        f.categoryTouched = false;
        f.personId = null;
        if (f.type !== 'transfer') {
            f.toAccountId = null;
        }
        render();
    },
    setAccount(el) {
        state.add.accountId = el.dataset.id;
        if (state.add.toAccountId === el.dataset.id) {
            state.add.toAccountId = null;
        }
        render();
    },
    setToAccount(el) {
        state.add.toAccountId = el.dataset.id;
        render();
    },
    async saveEntry() {
        const f = state.add;
        let personId = f.personId;
        const pairs = [];
        if (L.PERSON_TYPES.includes(f.type) && personId === '__new') {
            if (!f.newPerson.trim()) {
                return toast("Enter the new person's name.", 'warn');
            }
            personId = S.newId();
            pairs.push(['people', { id: personId, name: f.newPerson.trim(), direction: f.type === 'lent' || f.type === 'gotback' ? 'owesMe' : 'iOwe', opening: 0, status: 'Active' }]);
        }
        const existing = f.id ? byId(S.data.entries, f.id) : null;
        const entry = {
            id: f.id || S.newId(),
            type: f.type,
            amount: Number(f.amount),
            date: f.date,
            description: f.description.trim() || L.TYPES[f.type].label,
            accountId: f.accountId,
            toAccountId: f.type === 'transfer' ? f.toAccountId : null,
            categoryId: f.type === 'expense' || f.type === 'income' ? f.categoryId || null : null,
            personId: L.PERSON_TYPES.includes(f.type) ? personId : null,
            notes: f.notes.trim(),
            createdAt: existing ? existing.createdAt : Date.now()
        };
        const problem = L.validateEntry(entry, { people: [...S.data.people, ...pairs.map((p) => p[1])] });
        if (problem) {
            return toast(problem, 'warn');
        }
        pairs.push(['entries', entry]);
        const back = f.back;
        state.add = blankEntry(f.id ? null : f);
        await S.saveMany(pairs);
        toast(f.id ? 'Changes saved.' : `${entry.description} · ${L.money(entry.amount)} saved.`);
        if (back) {
            go(back);
        }
    },
    editEntry(el) {
        const e = byId(S.data.entries, el.dataset.id);
        if (!e) {
            return;
        }
        state.add = { ...blankEntry(), ...e, amount: String(e.amount), categoryTouched: true, newPerson: '', notes: e.notes || '', label: `${e.description} · ${L.money(e.amount)} · ${shortDate(e.date)}`, back: state.route === 'add' ? null : state.route };
        if (state.route === 'add') {
            render();
            window.scrollTo(0, 0);
        } else {
            go('add');
        }
    },
    cancelEdit() {
        const back = state.add.back;
        state.add = blankEntry();
        back ? go(back) : render();
    },
    async deleteEntry() {
        const f = state.add;
        if (!window.confirm(`Delete this entry?\n${f.label}\nBalances and budget follow. This cannot be undone.`)) {
            return;
        }
        const back = f.back;
        state.add = blankEntry();
        await S.remove('entries', f.id);
        toast('Entry deleted.');
        if (back) {
            go(back);
        }
    },

    // daily
    dailyMonth(el) {
        state.daily.month = L.addMonths(state.daily.month, Number(el.dataset.step));
        render();
    },
    dailyCustom() {
        const d = state.daily;
        d.custom = !d.custom;
        if (d.custom) {
            d.from = `${d.month}-01`;
            d.to = L.monthEnd(d.month) > today() ? today() : L.monthEnd(d.month);
        }
        render();
    },
    dailyView(el) {
        state.daily.view = el.dataset.view;
        state.daily.category = '';
        render();
    },
    dailyToggle(el) {
        const c = state.daily.closed;
        c.has(el.dataset.date) ? c.delete(el.dataset.date) : c.add(el.dataset.date);
        render();
    },
    dailyToggleAll() {
        const d = state.daily;
        d.closed = d.closed.size ? new Set() : new Set(S.data.entries.map((e) => e.date));
        render();
    },

    // budget
    budgetMonth(el) {
        if (state.budget.edits && !window.confirm('Discard unsaved budget changes?')) {
            return;
        }
        state.budget = { month: L.addMonths(state.budget.month, Number(el.dataset.step)), edits: null, open: null };
        render();
    },
    budgetOpen(el) {
        state.budget.open = state.budget.open === el.dataset.id ? null : el.dataset.id;
        render();
    },
    budgetCopy() {
        const prev = (byId(S.data.budgets, L.addMonths(state.budget.month, -1)) || {}).lines || {};
        if (!Object.keys(prev).length) {
            return toast('Last month has no budget to copy.', 'warn');
        }
        state.budget.edits = { ...prev };
        render();
    },
    budgetAverage() {
        const edits = {};
        L.budgetRows(S.data, state.budget.month).forEach((r) => {
            if (r.average) {
                edits[r.id] = Math.ceil(r.average / 100) * 100;
            }
        });
        if (!Object.keys(edits).length) {
            return toast('No spending in the last 3 months yet.', 'warn');
        }
        state.budget.edits = edits;
        render();
    },
    async budgetSave() {
        const b = state.budget;
        const current = (byId(S.data.budgets, b.month) || {}).lines || {};
        const lines = {};
        for (const [id, v] of Object.entries({ ...current, ...b.edits })) {
            if (Number(v) > 0) {
                lines[id] = Number(v);
            }
        }
        b.edits = null;
        await S.save('budgets', { id: b.month, lines });
        toast(`Budget for ${L.monthLabel(b.month)} saved.`);
    },

    // people
    peopleView(el) {
        state.people = { view: el.dataset.view, selected: null, form: null, adding: false };
        render();
    },
    personOpen(el) {
        const s = state.people;
        s.selected = s.selected === el.dataset.id ? null : el.dataset.id;
        s.form = null;
        render();
    },
    personAddToggle() {
        state.people.adding = !state.people.adding;
        render();
    },
    async personAddSave() {
        const name = document.getElementById('np-name').value.trim();
        if (!name) {
            return toast('Enter a name.', 'warn');
        }
        const person = { id: S.newId(), name, direction: state.people.view, opening: Number(document.getElementById('np-opening').value) || 0, phone: document.getElementById('np-phone').value.trim(), status: 'Active' };
        state.people.adding = false;
        state.people.selected = person.id;
        await S.save('people', person);
        toast(`${name} added.`);
    },
    personForm(el) {
        const p = byId(S.data.people, state.people.selected);
        const type = el.dataset.type;
        const out = L.personOutstanding(p, S.data.entries);
        const acc = activeAccounts().filter((a) => a.kind !== 'card');
        state.people.form = { type, label: el.textContent.trim(), amount: (type === 'gotback' || type === 'repaid') && out > 0 ? String(out) : '', date: today(), accountId: (acc.find((a) => a.isDefault) || acc[0] || {}).id };
        render();
    },
    personFormCancel() {
        state.people.form = null;
        render();
    },
    async personFormSave() {
        const f = state.people.form;
        const p = byId(S.data.people, state.people.selected);
        const entry = { id: S.newId(), type: f.type, amount: Number(f.amount), date: f.date, description: `${f.label} – ${p.name}`, accountId: f.accountId, toAccountId: null, categoryId: null, personId: p.id, notes: '', createdAt: Date.now() };
        const problem = L.validateEntry(entry, S.data);
        if (problem) {
            return toast(problem, 'warn');
        }
        state.people.form = null;
        await S.save('entries', entry);
        toast(`${p.name}: ${L.money(L.personOutstanding(p, S.data.entries))} ${p.direction === 'owesMe' ? 'still owed to you' : 'still to pay'}.`);
    },
    async personStatus(el) {
        const p = byId(S.data.people, state.people.selected);
        await S.save('people', { ...p, status: el.dataset.status });
    },
    async personDelete(el) {
        const p = byId(S.data.people, el.dataset.id);
        if (window.confirm(`Delete ${p.name}?`)) {
            state.people.selected = null;
            await S.remove('people', p.id);
        }
    },

    // accounts
    accountNew(el) {
        state.accounts.form = { id: null, kind: el.dataset.kind, name: '', opening: '', openingDate: `${thisMonth()}-01`, limit: '', dueDay: '', last4: '', isDefault: false };
        render();
    },
    accountEdit(el) {
        const a = byId(S.data.accounts, el.dataset.id);
        state.accounts.form = { ...a, opening: a.opening || '', limit: a.limit || '', dueDay: a.dueDay || '', last4: a.last4 || '' };
        render();
        window.scrollTo(0, 0);
    },
    accountCancel() {
        state.accounts.form = null;
        render();
    },
    async accountSave() {
        const f = state.accounts.form;
        if (!String(f.name).trim()) {
            return toast('Enter a name.', 'warn');
        }
        if (f.last4 && !/^\d{4}$/.test(f.last4)) {
            return toast('Last 4 digits must be 4 numbers.', 'warn');
        }
        if (f.kind === 'card' && !(Number(f.limit) > 0)) {
            return toast('Enter the credit limit.', 'warn');
        }
        if (f.dueDay && !(Number(f.dueDay) >= 1 && Number(f.dueDay) <= 31)) {
            return toast('Bill due day must be 1 to 31.', 'warn');
        }
        const doc = { id: f.id || S.newId(), kind: f.kind, name: String(f.name).trim(), opening: Number(f.opening) || 0, openingDate: f.openingDate || null, limit: Number(f.limit) || null, dueDay: Number(f.dueDay) || null, last4: f.last4 || '', isDefault: f.kind !== 'card' && !!f.isDefault, active: f.active !== false };
        const pairs = [['accounts', doc]];
        if (doc.isDefault) {
            S.data.accounts.filter((a) => a.isDefault && a.id !== doc.id).forEach((a) => pairs.push(['accounts', { ...a, isDefault: false }]));
        }
        state.accounts.form = null;
        await S.saveMany(pairs);
        toast(`${doc.name} saved.`);
    },
    async accountRemove(el) {
        const a = byId(S.data.accounts, el.dataset.id);
        const used = S.data.entries.some((e) => e.accountId === a.id || e.toAccountId === a.id);
        const bal = L.accountBalance(a, S.data.entries);
        if (!used) {
            if (window.confirm(`Delete ${a.name}? It has no entries.`)) {
                await S.remove('accounts', a.id);
                toast(`${a.name} deleted.`);
            }
            return;
        }
        if (Math.round(bal * 100) !== 0) {
            return toast(`${a.name} still has ${a.kind === 'card' ? 'an amount owed' : 'a balance'} of ${L.money(Math.abs(bal))}. Move or pay it first.`, 'warn');
        }
        if (window.confirm(`Close ${a.name}? Its history is kept and you can reopen it.`)) {
            await S.save('accounts', { ...a, active: false, isDefault: false });
            toast(`${a.name} closed.`);
        }
    },
    async accountReopen(el) {
        await S.save('accounts', { ...byId(S.data.accounts, el.dataset.id), active: true });
    },
    accountsClosed() {
        state.accounts.showClosed = !state.accounts.showClosed;
        render();
    },
    payOpen(el) {
        const sources = activeAccounts().filter((a) => a.kind !== 'card');
        state.accounts.pay = { cardId: el.dataset.id, mode: 'full', amount: '', fromId: (sources.find((a) => a.isDefault) || sources[0] || {}).id };
        render();
    },
    payMode(el) {
        state.accounts.pay.mode = el.dataset.mode;
        render();
    },
    payCancel() {
        state.accounts.pay = null;
        render();
    },
    async paySave() {
        const p = state.accounts.pay;
        const card = byId(S.data.accounts, p.cardId);
        const owed = Math.max(0, -L.accountBalance(card, S.data.entries));
        const amount = p.mode === 'full' ? owed : Number(p.amount);
        if (!(amount > 0)) {
            return toast('Enter the amount to pay.', 'warn');
        }
        if (amount > owed + 0.005) {
            return toast(`That is more than the ${L.money(owed)} owed.`, 'warn');
        }
        if (!p.fromId) {
            return toast('Add a bank account or use Cash to pay from.', 'warn');
        }
        state.accounts.pay = null;
        await S.save('entries', { id: S.newId(), type: 'transfer', amount, date: today(), description: `Card bill ${amount >= owed ? 'paid in full' : 'part payment'} – ${card.name}`, accountId: p.fromId, toAccountId: card.id, categoryId: null, personId: null, notes: '', createdAt: Date.now() });
        toast(`${L.money(amount)} paid to ${card.name}.`);
    },

    // account & backup
    categoryToggle() {
        state.more.addingCategory = !state.more.addingCategory;
        render();
    },
    async categorySave() {
        const name = document.getElementById('nc-name').value.trim();
        if (!name) {
            return toast('Enter a category name.', 'warn');
        }
        const keywords = document.getElementById('nc-keys').value.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
        state.more.addingCategory = false;
        await S.save('categories', { id: S.newId(), name, type: document.getElementById('nc-type').value, keywords });
        toast(`${name} added.`);
    },
    exportData() {
        const url = URL.createObjectURL(new Blob([S.exportJson()], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `lifedesk-${today()}.json` });
        a.click();
        URL.revokeObjectURL(url);
    },
    async demoReset() {
        if (window.confirm('Erase all demo data in this browser?')) {
            await S.clearDemo();
            toast('Demo data erased.');
        }
    }
};

// ---------- events ----------
function setPath(path, value) {
    const keys = path.split('.');
    let obj = state;
    for (const k of keys.slice(0, -1)) {
        obj = obj[k];
        if (!obj) {
            return;
        }
    }
    obj[keys[keys.length - 1]] = value;
}

app.addEventListener('click', async (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || el.disabled) {
        return;
    }
    try {
        await actions[el.dataset.action](el, event);
    } catch (e) {
        console.error(e);
        toast(e.message || 'Something went wrong.', 'warn');
    }
});

app.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.model) {
        setPath(el.dataset.model, el.type === 'checkbox' ? el.checked : el.value);
        if (el.dataset.then === 'suggest' && !state.add.categoryTouched) {
            const id = L.suggestCategory(S.data.categories, state.add.description, state.add.type);
            state.add.categoryId = id;
            const select = document.getElementById('add-category');
            if (select) {
                select.value = id || '';
            }
        }
        if (el.dataset.then === 'touchCategory') {
            state.add.categoryTouched = true;
        }
        if ('rerenderSoft' in el.dataset) {
            // keep the keyboard open while typing a search: only the list is redrawn
            const tmp = document.createElement('div');
            tmp.innerHTML = daily();
            document.getElementById('daily-days').innerHTML = tmp.querySelector('#daily-days').innerHTML;
        }
    }
    if (el.dataset.budget) {
        const b = state.budget;
        b.edits = b.edits || {};
        b.edits[el.dataset.budget] = el.value;
        const btn = app.querySelector('[data-action="budgetSave"]');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save budget';
        }
    }
});
app.addEventListener('change', async (event) => {
    const el = event.target;
    try {
        if (el.dataset.model && 'rerender' in el.dataset) {
            setPath(el.dataset.model, el.value);
            render();
        }
        if (el.dataset.personField) {
            const p = byId(S.data.people, el.dataset.id);
            await S.save('people', { ...p, [el.dataset.personField]: el.value.trim() });
        }
        if (el.dataset.setting) {
            await S.save('settings', { ...(S.prefs() || { id: 'prefs' }), [el.dataset.setting]: el.value });
            toast('Saved.');
        }
        if (el.dataset.file === 'import' && el.files[0]) {
            const n = await S.importJson(await el.files[0].text());
            toast(`${n} records restored.`);
        }
    } catch (e) {
        console.error(e);
        toast(e.message || 'Something went wrong.', 'warn');
    }
});

window.addEventListener('hashchange', () => {
    state.route = window.location.hash.slice(1) || 'hub';
    window.scrollTo(0, 0);
    render();
});

state.route = window.location.hash.slice(1) || 'hub';
render();
S.init((status) => {
    state.status = status;
    render();
}).catch((e) => {
    console.error(e);
    app.innerHTML = `<div class="loading"><p>Could not start: ${esc(e.message)}</p></div>`;
});

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
