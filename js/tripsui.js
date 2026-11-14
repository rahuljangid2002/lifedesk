// Trips screen: trips with dates and members, what each trip cost, who owes you what, and settling up.
// Same tool as Salesforce's Trips. The figures come from js/trips.js (pure). A shared trip expense is added on the
// Add Entry screen ("For a trip"); this screen lists it and can delete it (all its shares together).
import * as T from './trips.js';

export const TRIP_STATE = () => ({ open: null, form: null, newName: '', settle: null, opening: false });

/** The Trips screen, its actions and the helpers Home and Add Entry use. c: helpers from app.js. */
export function tripTool(c) {
    const { S, L, icon, esc, stat } = c;
    const st = () => c.state.trips;
    const today = () => c.today();
    const trips = () => S.data.trips || [];
    const tripById = (id) => trips().find((t) => t.id === id);
    const summary = (t) => T.tripSummary(t, S.data.entries, S.data.people, today());
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const range = (t) => (t.start === t.end ? c.shortDate(t.start) : `${c.shortDate(t.start)} – ${c.shortDate(t.end)}`);
    const dates = (t) => `${range(t)} · ${plural(T.tripDays(t), 'day')}`;
    const owesMePeople = () => S.data.people.filter((p) => p.direction === 'owesMe' && p.status !== 'Bad Debt').sort((a, b) => a.name.localeCompare(b.name));
    const nameOf = (id) => (S.data.people.find((p) => p.id === id) || {}).name || 'Someone';
    const initials = (name) => String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
    const statusWords = (t, status) => {
        if (status !== 'Upcoming') {
            return status;
        }
        const n = L.daysBetween(today(), t.start);
        return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
    };
    const badge = (t, status) => `<span class="trip-status ts-${status.toLowerCase()}">${esc(statusWords(t, status))}</span>`;
    const who = (t) => ((t.members || []).length ? `You + ${t.members.map(nameOf).join(', ')}` : 'Just you');

    // ---------------------------------------------------------------- the screen
    function screen() {
        const s = st();
        if (s.open && !tripById(s.open)) {
            s.open = null;
        }
        const rows = trips().map((t) => ({ t, sum: summary(t) }));
        const active = rows.filter((r) => r.sum.status !== 'Completed').length;
        const owed = rows.reduce((x, r) => x + Math.max(0, r.sum.owedToMe), 0);
        return `<header class="hero">
            ${c.backLink('menu')}
            <small class="eyebrow">Trips</small><h1>Trip expenses, shared fairly</h1>
            <div class="stats">${stat('Trips', rows.length)}${stat('Active', active)}${stat('Owed to you', L.money(owed))}</div>
        </header>
        <main class="trips">
            ${s.form ? form() : s.open ? detail(tripById(s.open)) : list(rows)}
        </main>`;
    }

    function list(rows) {
        const order = { Ongoing: 0, Upcoming: 1, Completed: 2 };
        const cards = rows
            .sort((a, b) => order[a.sum.status] - order[b.sum.status] || (a.t.start < b.t.start ? 1 : -1))
            .map(({ t, sum }) => `<button class="card link trip-card" data-action="tripOpen" data-id="${t.id}">
                <span class="trip-top"><span class="trip-ic">${icon('trip')}</span><span class="trip-name"><b>${esc(t.name)}</b><small>${esc(dates(t))}</small></span>${badge(t, sum.status)}</span>
                <small class="trip-who">${esc(who(t))}</small>
                <span class="trip-nums">${num('Spent', L.money(sum.totalSpent))}${num('Your share', L.money(sum.myShare))}${num('Owed to you', L.money(sum.owedToMe), 'in')}</span>
                <small class="trip-foot">${plural(sum.expenseCount, 'expense')} ${icon('chevRight')}</small>
            </button>`)
            .join('');
        return `<div class="toolbar"><button class="btn primary" data-action="tripNew">${icon('plus')} New trip</button></div>
            ${cards ? `<div class="trip-cards">${cards}</div>` : `<div class="empty-state">${icon('trip')}<b>No trips yet</b><small>Create a trip with its dates and who is going. Then, on Add Entry, choose "For a trip": the expense is split equally. Your share is your expense, and the others' shares show in People &amp; Loans as money they owe you.</small></div>`}`;
    }

    const num = (label, value, tone = '') => `<span><small>${label}</small><b class="${tone}">${value}</b></span>`;

    function detail(t) {
        const s = st();
        const sum = summary(t);
        const budget = Number(t.budget) || 0;
        const pct = budget ? Math.min(100, Math.round((sum.totalSpent / budget) * 100)) : 0;
        const members = sum.members
            .map((m) => {
                const settling = s.settle && s.settle.personId === m.personId;
                return `<div class="trip-member">
                    <span class="avatar">${esc(initials(m.name))}</span>
                    <span class="trip-name"><b>${esc(m.name)}</b><small>shares ${L.money(m.shared)}${m.settled ? ` · paid back ${L.money(m.settled)}` : ''}</small></span>
                    <b class="${m.owes > 0 ? 'in' : m.owes < 0 ? 'out' : 'muted'}">${m.owes > 0 ? `owes you ${L.money(m.owes)}` : m.owes < 0 ? `you owe ${L.money(-m.owes)}` : 'all settled'}</b>
                    ${m.owes > 0 && !settling ? `<button class="btn" data-action="tripSettle" data-id="${m.personId}">Settle up</button>` : ''}
                    ${settling ? `<div class="form trip-settle">
                        <label class="amount small"><span>${esc(L.symbol())}</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${esc(s.settle.amount)}" data-model="trips.settle.amount" aria-label="Amount received"></label>
                        <div class="grid2"><label>Received into<select data-model="trips.settle.accountId">${c.activeAccounts().filter((a) => a.kind !== 'card').map((a) => `<option value="${a.id}" ${a.id === s.settle.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
                        <label>Date<input type="date" max="${today()}" value="${esc(s.settle.date)}" data-model="trips.settle.date"></label></div>
                        <div class="split"><button class="btn" data-action="tripSettleCancel">Cancel</button><button class="btn primary" data-action="tripSettleSave">Record</button></div>
                    </div>` : ''}
                </div>`;
            })
            .join('');
        const expenses = sum.expenses
            .map((x) => `<div class="trip-exp">
                <span class="trip-date">${esc(c.shortDate(x.date))}</span>
                <span class="trip-name"><b>${esc(x.description || 'Trip expense')}</b><small>${esc([x.includesMe ? 'You' : '', ...x.sharedWith].filter(Boolean).join(', '))} · ${x.shareCount > 1 ? `split ${x.shareCount} ways` : 'not shared'}</small><small>${esc([x.categoryId ? c.categoryName(x.categoryId) : '', c.accountName(x.accountId)].filter(Boolean).join(' · '))}</small></span>
                <span class="trip-amt"><b>${L.money(x.bill)}</b><small>${x.includesMe ? `your share ${L.money(x.myShare)}` : 'you paid for others'}</small></span>
                <button class="icon-btn" data-action="tripExpDelete" data-key="${esc(x.key)}" title="Delete expense" aria-label="Delete expense">${icon('trash')}</button>
            </div>`)
            .join('');
        return `<div class="toolbar"><button class="link-btn" data-action="tripBack">${icon('chevLeft')} All trips</button>
            <div class="split"><button class="btn" data-action="tripEdit">${icon('edit')} Change</button><button class="btn danger" data-action="tripDelete">${icon('trash')}</button></div></div>
            <section class="card trip-hero">
                <div class="trip-top"><span class="trip-ic big">${icon('trip')}</span><span class="trip-name"><h2>${esc(t.name)}</h2><small>${esc(dates(t))}</small></span>${badge(t, sum.status)}</div>
                <div class="trip-nums big">${num('Total spent', L.money(sum.totalSpent))}${num('Your share', L.money(sum.myShare))}${num('Owed to you', L.money(sum.owedToMe), 'in')}</div>
                ${budget ? `<div class="trip-budget"><small>${L.money(sum.totalSpent)} of ${L.money(budget)} budget</small><small>${sum.totalSpent > budget ? `${L.money(sum.totalSpent - budget)} over` : `${L.money(budget - sum.totalSpent)} left`}</small></div>
                    <div class="bar"><i class="${sum.totalSpent > budget ? 'red' : ''}" style="width:${pct}%"></i></div>` : ''}
                ${t.notes ? `<small>${esc(t.notes)}</small>` : ''}
                <div><button class="btn primary" data-action="tripExpense" data-id="${t.id}">${icon('plus')} Add trip expense</button></div>
            </section>
            <h3>Who owes what</h3>
            ${members ? `<section class="list trip-list">${members}</section>` : '<p class="empty">Only you on this trip. Tap Change to add the people who are going.</p>'}
            <h3>Expenses</h3>
            ${expenses ? `<section class="list trip-list">${expenses}</section>` : '<p class="empty">No expenses yet. Tap Add trip expense, or choose "For a trip" on Add Entry.</p>'}`;
    }

    function form() {
        const f = st().form;
        const chosen = new Set(f.members);
        const people = owesMePeople();
        return `<section class="card form">
            <h2>${f.id ? 'Change trip' : 'New trip'}</h2>
            <label>Trip name<input type="text" maxlength="80" placeholder="e.g. Weekend in the hills" value="${esc(f.name)}" data-model="trips.form.name"></label>
            <div class="grid3"><label>Start date<input type="date" value="${esc(f.start)}" data-model="trips.form.start"></label>
            <label>End date<input type="date" value="${esc(f.end)}" data-model="trips.form.end"></label>
            <label>Budget for the whole trip (optional)<input type="number" inputmode="decimal" min="0" step="1" value="${esc(f.budget)}" data-model="trips.form.budget"></label></div>
            <label>Notes (optional)<input type="text" maxlength="255" value="${esc(f.notes)}" data-model="trips.form.notes"></label>
            <h3>Who is going</h3>
            <small>${f.members.length + f.newNames.length ? `You + ${plural(f.members.length + f.newNames.length, 'person')}` : 'Only you so far: tap people below to add them'}. You are always on your own trips.</small>
            ${people.length ? `<div class="pills">${people.map((p) => `<button class="pill-btn ${chosen.has(p.id) ? 'on' : ''}" data-action="tripPerson" data-id="${p.id}" aria-pressed="${chosen.has(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
            <div class="split" data-form="tripAddName"><input type="text" maxlength="80" placeholder="Add someone new (name)" value="${esc(st().newName)}" data-model="trips.newName" aria-label="New person's name"><button class="btn" data-action="tripAddName">${icon('plus')} Add</button></div>
            ${f.newNames.length ? `<div class="pills">${f.newNames.map((n) => `<span class="pill-btn on">${esc(n)} <small>new</small> <button class="link-btn" data-action="tripRemoveName" data-name="${esc(n)}" aria-label="Remove">×</button></span>`).join('')}</div>` : ''}
            <small>New names are added to People &amp; Loans (owe you), where their trip shares show as money they owe you.</small>
            <div class="split"><button class="btn" data-action="tripCancel">Cancel</button><button class="btn primary" data-action="tripSave">Save trip</button></div>
        </section>`;
    }

    // ---------------------------------------------------------------- Home tile
    function homeCard() {
        const h = T.homeTrip(trips(), S.data.entries, S.data.people, today());
        if (!h) {
            return `<a class="card link span trip-home empty-trip" href="#trips"><span class="trip-top"><span class="trip-ic">${icon('trip')}</span><span class="trip-name"><b>Going on a trip?</b><small>Split expenses with family and friends</small></span><span class="trip-chev">${icon('chevRight')}</span></span></a>`;
        }
        const { trip: t, sum } = h;
        const owing = sum.members.filter((m) => m.owes > 0);
        return `<section class="card span trip-home">
            <button class="trip-open" data-action="tripOpen" data-id="${t.id}">
                <span class="trip-top"><span class="trip-ic">${icon('trip')}</span><span class="trip-name"><b>${esc(t.name)}</b><small>${esc(dates(t))}</small></span>${badge(t, sum.status)}</span>
                <small class="trip-who">${esc(who(t))}</small>
                <span class="trip-nums">${num('Spent', L.money(sum.totalSpent))}${num('Your share', L.money(sum.myShare))}${num('Owed to you', L.money(sum.owedToMe), 'in')}${Number(t.budget) ? num('Budget left', L.money(Number(t.budget) - sum.totalSpent)) : ''}</span>
                ${owing.length ? `<small class="trip-who">${esc(owing.map((m) => `${m.name} ${L.money(m.owes)}`).join(' · '))}</small>` : ''}
            </button>
            <div class="split">${sum.status !== 'Completed' ? `<button class="btn primary" data-action="tripExpense" data-id="${t.id}">${icon('plus')} Add trip expense</button>` : ''}<button class="link-btn" data-action="tripOpen" data-id="${t.id}">Open trip ${icon('chevRight')}</button></div>
        </section>`;
    }

    // ---------------------------------------------------------------- Add Entry: "For a trip"
    /** Trips to choose from: ongoing and upcoming first, then the ones that ended in the last 180 days. */
    function options(date) {
        const since = L.addMonthsToDate(today(), -6);
        const rows = trips().filter((t) => t.end >= since).map((t) => ({ t, status: T.tripStatus(t, today()) }));
        const order = { Ongoing: 0, Upcoming: 1, Completed: 2 };
        rows.sort((a, b) => order[a.status] - order[b.status] || (a.t.start < b.t.start ? 1 : -1));
        const onDate = rows.find((r) => date >= r.t.start && date <= r.t.end);
        return { rows, onDate: onDate ? onDate.t : null };
    }

    /** The "For a trip" part of the Add Entry form (expense only, new entries only). */
    function addBlock(f) {
        if (f.type !== 'expense' || f.id || f.onEmi || f.paidByMode) {
            return '';
        }
        const head = `<label class="check"><input type="checkbox" ${f.forTrip ? 'checked' : ''} data-action="addTripToggle"> For a trip? Split it with the people who were with you</label>`;
        if (!f.forTrip) {
            return `<div class="trip-box">${head}</div>`;
        }
        const { rows } = options(f.date);
        if (!rows.length) {
            return `<div class="trip-box">${head}<small>No trips yet. <a href="#trips">Create one</a> with its dates and who is going.</small></div>`;
        }
        const t = tripById(f.tripId);
        const on = new Set(f.tripShare || []);
        const pills = t ? [`<button class="pill-btn ${f.tripMe ? 'on' : ''}" data-action="addTripPerson" data-id="me" aria-pressed="${f.tripMe}">You</button>`,
            ...(t.members || []).map((id) => `<button class="pill-btn ${on.has(id) ? 'on' : ''}" data-action="addTripPerson" data-id="${id}" aria-pressed="${on.has(id)}">${esc(nameOf(id))}</button>`)].join('') : '';
        const outside = t && f.date && (f.date < t.start || f.date > t.end);
        return `<div class="trip-box">${head}
            <label>Trip<select data-action-change="addTripPick">${rows.map((r) => `<option value="${r.t.id}" ${r.t.id === f.tripId ? 'selected' : ''}>${esc(r.t.name)} · ${esc(range(r.t))}</option>`).join('')}</select></label>
            ${outside ? `<small class="warn-text">The date is outside the trip (${esc(range(t))}).</small>` : ''}
            <small><b>Who shared it?</b> Tap to include or leave out.</small>
            <div class="pills">${pills}</div>
            ${t && !(t.members || []).length ? '<small>No one else is on this trip yet. Add members on the Trips screen to split expenses.</small>' : ''}
            <p class="trip-split" id="trip-split">${splitText(f)}</p>
            <a class="link-btn" href="#trips">${icon('trip')} Manage trips</a>
        </div>`;
    }

    function splitText(f) {
        const s = T.splitShares(Number(f.amount) || 0, f.tripShare || [], !!f.tripMe);
        const amt = Number(f.amount) || 0;
        if (!s.count) {
            return 'Choose who shared this expense.';
        }
        if (s.count === 1 && f.tripMe) {
            return `Only you: ${L.money(amt)} is your expense, tagged to the trip.`;
        }
        const others = s.others.length;
        const each = amt / s.count;
        return `${L.money(amt)} split ${s.count} ways = ${L.money(each)} each. ${f.tripMe ? `Your share ${L.money(each)}. ` : 'You paid only for the others. '}${others === 1 ? '1 person owes' : `${others} people owe`} you ${L.money(each * others)} (shown in People & Loans).`;
    }

    /** Chooses a trip on the form: everyone on it shares by default. */
    function pick(f, id) {
        const t = tripById(id);
        f.tripId = t ? t.id : null;
        f.tripShare = t ? [...(t.members || [])] : [];
        f.tripMe = true;
    }

    /** Opens Add Entry ready for a trip expense. */
    function startExpense(id) {
        const f = c.blankEntry();
        f.type = 'expense';
        f.forTrip = true;
        pick(f, id);
        f.back = c.state.route === 'add' ? null : c.state.route;
        c.state.add = f;
        c.state.route === 'add' ? c.render() : c.go('add');
    }

    /** The entries to save for a trip expense on the form, or a message when something is missing. */
    function entriesFor(f, base) {
        if (!f.tripId || !tripById(f.tripId)) {
            return { problem: 'Choose the trip, or turn off "For a trip".' };
        }
        const count = (f.tripShare || []).length + (f.tripMe ? 1 : 0);
        if (!count) {
            return { problem: 'Tap the people who shared this expense.' };
        }
        if (f.tripMe && !f.categoryId) {
            return { problem: 'Choose a category for your share.' };
        }
        const names = Object.fromEntries((f.tripShare || []).map((id) => [id, nameOf(id)]));
        const list = T.tripEntries({ base, amount: Number(f.amount), description: f.description, categoryId: f.tripMe ? f.categoryId : null, tripId: f.tripId, personIds: f.tripShare, includeMe: !!f.tripMe, names, ids: S.newId, splitKey: S.newId() });
        return { entries: list, count };
    }

    // ---------------------------------------------------------------- actions
    const actions = {
        tripOpen(el) {
            st().open = el.dataset.id;
            st().form = null;
            st().settle = null;
            st().opening = c.state.route !== 'trips'; // arriving with a trip chosen (from Home or an entry)
            c.state.route === 'trips' ? c.render() : c.go('trips');
        },
        tripBack() {
            st().open = null;
            st().settle = null;
            c.render();
        },
        tripNew() {
            st().form = { id: null, name: '', start: today(), end: today(), budget: '', notes: '', members: [], newNames: [] };
            st().newName = '';
            c.render();
        },
        tripEdit() {
            const t = tripById(st().open);
            st().form = { id: t.id, name: t.name, start: t.start, end: t.end, budget: t.budget ? String(t.budget) : '', notes: t.notes || '', members: [...(t.members || [])], newNames: [] };
            st().newName = '';
            c.render();
        },
        tripCancel() {
            st().form = null;
            c.render();
        },
        tripPerson(el) {
            const f = st().form;
            const id = el.dataset.id;
            f.members = f.members.includes(id) ? f.members.filter((x) => x !== id) : [...f.members, id];
            c.render();
        },
        tripAddName() {
            const f = st().form;
            const name = String(st().newName || '').trim();
            if (!name) {
                return;
            }
            const existing = owesMePeople().find((p) => p.name.toLowerCase() === name.toLowerCase());
            if (existing) {
                if (!f.members.includes(existing.id)) {
                    f.members.push(existing.id);
                }
            } else if (!f.newNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
                f.newNames.push(name);
            }
            st().newName = '';
            c.render();
        },
        tripRemoveName(el) {
            const f = st().form;
            f.newNames = f.newNames.filter((n) => n !== el.dataset.name);
            c.render();
        },
        async tripSave() {
            const f = st().form;
            if (String(st().newName || '').trim()) {
                actions.tripAddName();
            }
            if (!f.name.trim()) {
                return c.toast('Give the trip a name.', 'warn');
            }
            if (!f.start || !f.end) {
                return c.toast('Choose the start and end dates.', 'warn');
            }
            if (f.end < f.start) {
                return c.toast("The end date can't be before the start date.", 'warn');
            }
            const existing = f.id ? tripById(f.id) : null;
            if (existing) {
                const removed = (existing.members || []).filter((id) => !f.members.includes(id));
                const busy = removed.find((id) => S.data.entries.some((e) => e.tripId === f.id && e.personId === id));
                if (busy) {
                    return c.toast(`${nameOf(busy)} already has trip expenses, so they can't be removed.`, 'warn');
                }
            }
            const pairs = [];
            const members = [...f.members];
            for (const name of f.newNames) {
                const id = S.newId();
                pairs.push(['people', { id, name, direction: 'owesMe', opening: 0, status: 'Active' }]);
                members.push(id);
            }
            const trip = { id: f.id || S.newId(), name: f.name.trim().slice(0, 80), start: f.start, end: f.end, budget: Number(f.budget) || null, notes: String(f.notes || '').trim(), members, createdAt: existing ? existing.createdAt : Date.now() };
            pairs.push(['trips', trip]);
            await S.saveMany(pairs);
            st().form = null;
            st().open = trip.id;
            c.toast(existing ? 'Trip saved.' : `${trip.name} created.`);
        },
        async tripDelete() {
            const t = tripById(st().open);
            if (S.data.entries.some((e) => e.tripId === t.id)) {
                return c.toast('This trip has expenses. Delete them first, then delete the trip.', 'warn');
            }
            if (!window.confirm(`Delete the trip ${t.name}?`)) {
                return;
            }
            st().open = null;
            await S.remove('trips', t.id);
            c.toast('Trip deleted.');
        },
        tripExpense(el) {
            startExpense(el.dataset.id);
        },
        async tripExpDelete(el) {
            const key = el.dataset.key;
            const list = S.data.entries.filter((e) => e.splitKey === key);
            if (!list.length) {
                return;
            }
            const sum = summary(tripById(list[0].tripId));
            const x = sum.expenses.find((e) => e.key === key);
            if (!window.confirm(`Delete this trip expense?\n${x.description} (${L.money(x.bill)}): your share and everyone's share are deleted.`)) {
                return;
            }
            await S.removeMany(list.map((e) => ['entries', e.id]));
            c.toast(`${x.description} was removed from the trip.`);
        },
        tripSettle(el) {
            const m = summary(tripById(st().open)).members.find((x) => x.personId === el.dataset.id);
            const acc = c.activeAccounts().filter((a) => a.kind !== 'card');
            const def = acc.find((a) => a.isDefault) || acc[0];
            st().settle = { personId: m.personId, amount: String(m.owes), accountId: def ? def.id : null, date: today() };
            c.render();
        },
        tripSettleCancel() {
            st().settle = null;
            c.render();
        },
        async tripSettleSave() {
            const s = st().settle;
            const t = tripById(st().open);
            const entry = { id: S.newId(), type: 'gotback', amount: Number(s.amount), date: s.date, description: `Received from ${nameOf(s.personId)} for ${t.name}`.slice(0, 255), accountId: s.accountId, personId: s.personId, tripId: t.id, notes: '', createdAt: Date.now(), receipts: [] };
            const problem = L.validateEntry(entry, S.data);
            if (problem) {
                return c.toast(problem, 'warn');
            }
            st().settle = null;
            await S.save('entries', entry);
            c.toast(`${L.money(entry.amount)} received from ${nameOf(s.personId)}.`);
        },

        // Add Entry
        addTripToggle(el) {
            const f = c.state.add;
            f.forTrip = el.checked;
            if (f.forTrip && !f.tripId) {
                const { rows, onDate } = options(f.date);
                if (rows.length) {
                    pick(f, (onDate || rows[0].t).id);
                }
            }
            c.render();
        },
        addTripPick(el) {
            pick(c.state.add, el.value);
            c.render();
        },
        addTripPerson(el) {
            const f = c.state.add;
            const id = el.dataset.id;
            if (id === 'me') {
                f.tripMe = !f.tripMe;
            } else {
                const on = new Set(f.tripShare || []);
                on.has(id) ? on.delete(id) : on.add(id);
                f.tripShare = [...on];
            }
            c.render();
        }
    };

    /** Arriving on the Trips screen from the menu shows the list; from Home or an entry, the chosen trip. */
    function arrive() {
        if (!st().opening) {
            st().open = null;
            st().form = null;
            st().settle = null;
        }
        st().opening = false;
    }

    return { screen, homeCard, arrive, addBlock, splitText, entriesFor, startExpense, actions, summary };
}
