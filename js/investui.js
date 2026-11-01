// Investments screen: holdings, SIPs, transactions, goals, insights and calculators, with live prices.
// Same tool as Salesforce's Investments. The figures come from js/invest.js (pure); this file draws the screen and
// handles its actions. Money in and out of an account is written to the ledger as an entry (type invest / invreturn,
// dividends and interest as income), so balances, net worth and the month's figures follow by themselves.
import * as I from './invest.js';
import * as P from './prices.js';
import { hbars, columns } from './charts.js';

export const INV_STATE = () => ({
    tab: 'holdings', status: 'Active', type: 'All', sort: 'value', open: null,
    form: null, txn: null, sip: null, goal: null, price: null, pending: {},
    search: { q: '', results: [], busy: false, note: '' },
    filter: { inv: '', kind: '', year: '' },
    calc: { monthly: 10000, years: 15, rate: 12, stepUp: 10, lump: 100000, target: 5000000, goalYears: 10 },
    refreshing: false
});

const TABS = [['holdings', 'Holdings'], ['sips', 'SIPs'], ['txns', 'Transactions'], ['goals', 'Goals'], ['insights', 'Insights'], ['calc', 'Calculator']];
const TYPE_ICON = { Stock: 'chart', ETF: 'chart', Crypto: 'coins', Gold: 'coins', 'Gold Bond': 'coins', 'Fixed Deposit': 'bank', 'Recurring Deposit': 'bank', 'Provident Fund': 'bank', 'Pension Fund': 'bank' };
const PRICE_KEY = 'lifedesk-prices-at';
const PRICE_EVERY_MS = 6 * 3600 * 1000;
const INCOME_CATEGORY = 'Investment Income';

/** The Investments screen and its actions. c: helpers from app.js (state, S, L, icon, esc, stat, toast, render, ...). */
export function investTool(c) {
    const { S, L, icon, esc, stat } = c;
    const st = () => c.state.invest;
    const num = (v) => Number(v) || 0;
    const money = (v) => L.money(v);
    const signed = (v) => `${num(v) > 0 ? '+' : ''}${L.money(v)}`;
    const pct = (v, d = 1) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '–' : `${num(v) > 0 ? '+' : ''}${num(v).toFixed(d)}%`);
    const tone = (v) => (num(v) > 0 ? 'in' : num(v) < 0 ? 'out' : '');
    const today = () => c.today();
    const currency = () => L.currentFormat().currency;
    const yearOf = (iso) => c.yearOf(iso);
    const port = () => I.portfolio(S.data, today(), yearOf);
    const invById = (id) => S.data.investments.find((x) => x.id === id);
    const opt = (list, sel) => list.map((x) => (Array.isArray(x) ? `<option value="${esc(x[0])}" ${x[0] === sel ? 'selected' : ''}>${esc(x[1])}</option>` : `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`)).join('');
    const accountOpts = (sel, none = 'None (not in my accounts)') => `${c.activeAccounts().map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} · ${money(L.accountBalance(a, S.data.entries))}</option>`).join('')}<option value="" ${!sel ? 'selected' : ''}>${none}</option>`;
    const defaultAcc = () => (c.defaultAccount() || {}).id || '';
    const dateText = (iso) => (iso ? c.longDate(iso) : '');

    // ---------------------------------------------------------------- the screen
    function screen() {
        const s = st();
        const p = port();
        const tabs = `<div class="seg inv-tabs">${TABS.map(([k, label]) => `<button class="${s.tab === k ? 'on' : ''}" data-action="invTab" data-tab="${k}">${label}${k === 'sips' && p.sips.filter((x) => x.status === 'Active').length ? ` <span class="pill">${p.sips.filter((x) => x.status === 'Active').length}</span>` : ''}</button>`).join('')}</div>`;
        const body = { holdings, sips: sipsTab, txns: txnsTab, goals: goalsTab, insights: insightsTab, calc: calcTab }[s.tab] || holdings;
        return `<header class="hero">
            ${c.backLink('menu')}
            <small class="eyebrow">Investments</small><h1>Your portfolio</h1>
            <div class="stats four">${stat('Current value', money(p.value))}${stat('Invested', money(p.invested))}${stat(`Gain · ${pct(p.gainPct)}`, `<span class="${tone(p.gain)}">${signed(p.gain)}</span>`)}${stat('Today · XIRR', `<span class="${tone(p.dayChange)}">${signed(p.dayChange)}</span> · ${p.xirr === null ? '–' : pct(p.xirr)}`)}</div>
        </header>
        <main class="inv">
            ${tabs}
            ${forms(p)}
            ${p.pending.length && (s.tab === 'holdings' || s.tab === 'sips') ? pendingCard(p) : ''}
            ${body(p)}
        </main>`;
    }

    function forms(p) {
        const s = st();
        return s.form ? invForm() : s.txn ? txnForm() : s.sip ? sipForm(p) : s.goal ? goalForm(p) : s.price ? priceForm() : '';
    }

    // ---------- holdings ----------
    function holdings(p) {
        const s = st();
        let rows = p.rows.filter((r) => (s.status === 'All' || r.status === s.status) && (s.type === 'All' || r.type === s.type));
        const key = s.sort;
        rows = rows.sort((a, b) => (key === 'name' ? a.name.localeCompare(b.name) : (num(b[key]) || -Infinity) - (num(a[key]) || -Infinity)));
        const groups = {};
        rows.forEach((r) => (groups[r.type] = groups[r.type] || []).push(r));
        const types = [...new Set(p.rows.map((r) => r.type))];
        const fresh = (() => {
            const days = p.active.map((r) => r.priceDate).filter(Boolean).sort();
            return days.length ? `Prices as of ${dateText(days[days.length - 1])}` : 'No prices fetched yet';
        })();
        const lists = Object.entries(groups).map(([type, list]) => {
            const value = list.reduce((t, r) => t + r.value, 0);
            const cost = list.reduce((t, r) => t + r.invested, 0);
            return `<h3 class="inv-group"><span>${esc(type)}</span><small>${list[0].status === 'Watchlist' ? `${list.length} followed` : `${money(value)} · ${signed(value - cost)}`}</small></h3>
                <section class="list atable">${list.map(holdingRow).join('')}</section>`;
        }).join('');
        return `<div class="toolbar"><div class="split wrap">
                <button class="btn primary" data-action="invNew">${c.icon('plus')} Add investment</button>
                <button class="btn" data-action="invRefresh" ${s.refreshing ? 'disabled' : ''}>${s.refreshing ? 'Refreshing…' : 'Refresh prices'}</button>
                <button class="btn ghost" data-action="invSamples">${p.rows.some(isSample) ? 'Remove samples' : 'Try with samples'}</button></div></div>
            <div class="filterbar">
                <label class="pick"><span>Show</span><select data-model="invest.status" data-rerender>${opt(['Active', 'Watchlist', 'Closed', 'All'], s.status)}</select></label>
                <label class="pick"><span>Type</span><select data-model="invest.type" data-rerender>${opt([['All', 'All types'], ...types.map((t) => [t, t])], s.type)}</select></label>
                <label class="pick"><span>Sort</span><select data-model="invest.sort" data-rerender>${opt([['value', 'Value'], ['gainPct', 'Gain %'], ['gain', 'Gain'], ['dayChange', "Today's change"], ['xirr', 'XIRR'], ['name', 'Name']], s.sort)}</select></label>
            </div>
            <small class="muted">${fresh} · mutual fund NAVs are fetched when you open this screen${P.sharesAvailable ? ', and share prices too' : '; share, ETF and crypto prices are typed in until the price service is set up'}.</small>
            ${!p.rows.length ? `<div class="empty-state">${icon('chart')}<b>No investments yet</b><small>Add a mutual fund, SIP, shares, a fixed or recurring deposit, a provident or pension fund, gold, bonds or crypto. Money you put in or take out goes to your ledger.</small></div>`
                : lists || '<p class="empty">Nothing matches these filters.</p>'}`;
    }

    function holdingRow(r) {
        const open = st().open === r.id;
        const watch = r.status === 'Watchlist';
        const meta = [r.platform, r.unitMode && r.units ? `${+r.units.toFixed(3)} units @ ${L.money(r.avgCost)}` : '', r.goalId ? `Goal: ${(S.data.goals.find((g) => g.id === r.goalId) || {}).name || ''}` : ''].filter(Boolean).map(esc).join(' · ');
        const dayPct = num(r.prevPrice) > 0 && num(r.price) > 0 ? ((r.price - r.prevPrice) / r.prevPrice) * 100 : null;
        const priceLine = r.unitMode || r.price ? (r.price ? `${L.money(r.price)}${r.priceDate ? ` · ${c.shortDate(r.priceDate)}` : ''}` : 'No price yet') : r.rate ? `${r.rate}% · ${esc(r.compounding || '')}` : '';
        const sips = S.data.sips.filter((x) => x.investmentId === r.id && x.status === 'Active').length;
        return `<div class="acct-row inv-row ${open ? 'open' : ''} ${r.status === 'Closed' ? 'closed' : ''}">
            <button class="a-name plain" data-action="invOpen" data-id="${r.id}"><span class="row-icon">${icon(TYPE_ICON[r.type] || 'chart')}</span><span><b>${esc(r.name)}</b><small>${meta || esc(r.category || r.fundHouse || r.type)}</small></span></button>
            <div class="a-detail"><small>${priceLine}</small>${r.dayChange || dayPct !== null ? `<small class="${tone(r.dayChange || dayPct)}">${r.dayChange ? signed(r.dayChange) : ''}${dayPct !== null ? ` (${pct(dayPct, 2)})` : ''}</small>` : ''}</div>
            <div class="a-bal"><b class="big">${watch ? (r.price ? L.money(r.price) : '–') : money(r.value)}</b>
                <small class="${tone(watch ? 0 : r.status === 'Closed' ? r.realised : r.gain)}">${watch ? alertText(r) : r.status === 'Closed' ? `Realised ${signed(r.realised)}` : `${signed(r.gain)} (${pct(r.gainPct)})`}</small>
                <small>${r.xirr !== null ? `XIRR ${pct(r.xirr)}` : ''}${sips ? `${r.xirr !== null ? ' · ' : ''}SIP ×${sips}` : ''}</small></div>
            ${open ? `<div class="a-panel">${details(r)}</div>` : ''}
        </div>`;
    }

    function details(r) {
        const facts = [
            ['Total put in', money(r.putIn)], ['Taken out', money(r.takenOut)], ['Realised gain', signed(r.realised)], ['Dividends & interest', money(r.income)],
            ['Total gain', signed(r.totalGain)], ['First invested', dateText(r.first)], ['Interest rate', r.rate ? `${r.rate}% (${r.compounding || 'Quarterly'})` : ''],
            ['Maturity', r.maturityDate ? `${dateText(r.maturityDate)}${r.maturityAmount ? ` · ${money(r.maturityAmount)}` : ''}` : ''], ['Lock-in until', dateText(r.lockIn)],
            ['Price alerts', alertText(r)], ['Scheme code', r.schemeCode], ['Symbol', r.symbol], ['ISIN', r.isin], ['Fund house / issuer', r.fundHouse], ['Category', r.category],
            ['Folio / account', r.folio], ['Nominee', r.nominee], ['Price', r.priceSource === 'manual' ? 'Typed in by you' : 'Fetched automatically'], ['Notes', r.notes]
        ].filter(([, v]) => v && v !== '–');
        const txns = S.data.invTxns.filter((t) => t.investmentId === r.id).sort((a, b) => (a.date < b.date ? 1 : -1));
        const acts = r.status === 'Watchlist'
            ? [['buy', 'Buy now'], ['alert', 'Price alerts']]
            : [['buy', r.unitMode ? 'Buy more' : 'Add money'], ['sell', r.unitMode ? 'Sell / redeem' : 'Withdraw'], ['dividend', 'Dividend'], ['interest', 'Interest'],
                ...(r.unitMode ? [['reinvest', 'Dividend reinvested'], ['bonus', 'Bonus'], ['split', 'Split']] : []), ['charges', 'Charges'], ['maturity', 'Matured / closed'],
                ['sipnew', 'Start a SIP'], ['price', r.unitMode ? 'Update price' : 'Update value'], ['alert', 'Price alerts']];
        return `<div class="split wrap inv-acts">${acts.map(([k, label]) => `<button class="btn" data-action="invAct" data-act="${k}" data-id="${r.id}">${label}</button>`).join('')}
                <button class="btn" data-action="invEdit" data-id="${r.id}">Edit details</button><button class="btn ghost danger" data-action="invDelete" data-id="${r.id}">Delete</button></div>
            ${r.error ? `<p class="notice warn">${esc(r.error)}</p>` : ''}
            <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
            <h3>Transactions</h3>
            ${txns.length ? `<div class="list inner">${txns.map((t) => txnRow(t, r, false)).join('')}</div>` : '<p class="empty">No transactions yet.</p>'}`;
    }

    function txnRow(t, inv, withName) {
        const g = inv && inv.gains ? inv.gains[t.id] : null;
        const units = num(t.units) && t.kind !== 'bonus' ? `${+num(t.units).toFixed(4)} units${num(t.price) ? ` @ ${L.money(t.price)}` : ''}` : '';
        const amount = t.kind === 'split' ? `1 : ${num(t.ratio)}` : t.kind === 'bonus' ? `${+num(t.units).toFixed(4) || `ratio ${num(t.ratio)}`} units` : money(num(t.amount));
        const acct = t.accountId ? `Ledger · ${c.accountName(t.accountId)}` : 'Not in the ledger';
        return `<div class="row inv-txn">
            <span class="row-text"><b>${withName ? esc(inv ? inv.name : '') : esc(I.TXN_KINDS[t.kind] || t.kind)}</b>
                <small>${c.shortDate(t.date)}${withName ? ` · ${esc(I.TXN_KINDS[t.kind] || t.kind)}` : ''}${units ? ` · ${esc(units)}` : ''} · ${esc(acct)}${t.status === 'pending' ? ' · waits for units' : ''}</small></span>
            <span class="amt-col"><b>${esc(amount)}</b>${g ? `<small class="${tone(g.gain)}">${signed(g.gain)} · ${g.term}</small>` : ''}</span>
            <span class="row-btns"><button class="icon-btn" data-action="invTxnEdit" data-id="${t.id}" title="Change" aria-label="Change">${icon('edit')}</button><button class="icon-btn" data-action="invTxnDelete" data-id="${t.id}" title="Delete" aria-label="Delete">${icon('trash')}</button></span>
        </div>`;
    }

    function alertText(r) {
        const parts = [];
        if (num(r.alertAbove)) {
            parts.push(`above ${L.money(r.alertAbove)}`);
        }
        if (num(r.alertBelow)) {
            parts.push(`below ${L.money(r.alertBelow)}`);
        }
        return parts.length ? `Alert ${parts.join(' / ')}` : '';
    }

    function pendingCard(p) {
        const s = st();
        return `<section class="card warn-card"><div class="card-head"><h2>${p.pending.length} SIP instalment${p.pending.length === 1 ? '' : 's'} to confirm</h2></div>
            <small>Enter the units from your statement (or fetch the price of the day), then confirm. Confirmed instalments count in the holding and go to the ledger.</small>
            ${p.pending.map((t) => {
                const inv = invById(t.investmentId) || {};
                const e = s.pending[t.id] || {};
                const unitBased = I.UNIT_TYPES.includes(inv.type);
                return `<div class="pending-row"><span class="row-text"><b>${esc(inv.name || '')}</b><small>${c.shortDate(t.date)} · ${money(t.amount)}</small></span>
                    ${unitBased ? `<label>Units<input type="number" inputmode="decimal" step="0.0001" min="0" value="${esc(e.units ?? '')}" data-model="invest.pending.${t.id}.units"></label>
                    <label>Price<input type="number" inputmode="decimal" step="0.0001" min="0" value="${esc(e.price ?? '')}" data-model="invest.pending.${t.id}.price"></label>` : ''}
                    <label>Paid from<select data-model="invest.pending.${t.id}.accountId">${accountOpts(e.accountId ?? t.accountId)}</select></label>
                    <div class="split wrap">${unitBased && (inv.schemeCode || (inv.symbol && P.sharesAvailable)) ? `<button class="btn" data-action="invPendingPrice" data-id="${t.id}">Fetch price</button>` : ''}
                        <button class="btn primary" data-action="invPendingConfirm" data-id="${t.id}">Confirm</button><button class="btn ghost danger" data-action="invTxnDelete" data-id="${t.id}">Remove</button></div></div>`;
            }).join('')}</section>`;
    }

    // ---------- the forms ----------
    function invForm() {
        const f = st().form;
        const unit = I.UNIT_TYPES.includes(f.type);
        const rate = I.RATE_TYPES.includes(f.type);
        const fund = f.type === 'Mutual Fund';
        const shares = ['Stock', 'ETF', 'Crypto', 'Gold', 'Gold Bond', 'Bond'].includes(f.type);
        const se = st().search;
        const m = (k) => `data-model="invest.form.${k}"`;
        const first = f.first || {};
        return `<section class="card form"><h3>${f.isNew ? 'Add an investment' : `Change ${esc(f.name)}`}</h3>
            <div class="grid3">
                <label>Type<select ${m('type')} data-rerender>${opt(I.INV_TYPES, f.type)}</select></label>
                ${f.isNew ? `<label class="span2">How do you hold it?<select ${m('mode')} data-rerender>${opt([['buy', 'Buying it now (deducted from my account)'], ['held', 'Bought before I used LifeDesk (no deduction)'], ['watch', 'Only follow its price (watchlist)']], f.mode)}</select></label>`
                    : `<label>Status<select ${m('status')}>${opt([['Active', 'Holding it'], ['Watchlist', 'Watchlist (not bought)'], ['Closed', 'Closed']], f.status)}</select></label>`}
            </div>
            ${fund || shares ? `<div class="inv-search" data-form="invSearch">
                <label>${fund ? 'Find the fund (India, AMFI)' : 'Find the share, ETF or coin'}<span class="pw"><input type="search" value="${esc(se.q)}" data-model="invest.search.q" placeholder="${fund ? 'e.g. flexi cap direct growth' : 'e.g. apple, reliance, bitcoin'}"><button type="button" class="link-btn" data-action="invSearch">${se.busy ? 'Searching…' : 'Search'}</button></span></label>
                ${shares && !P.sharesAvailable ? '<small class="muted">Share search needs the LifeDesk price service (not set up yet). Type the name and the price yourself.</small>' : ''}
                ${se.results.length ? `<div class="results">${se.results.map((x, i) => `<button class="result" data-action="invPick" data-i="${i}"><b>${esc(x.name)}</b><small>${esc([x.kind, x.exchange].filter(Boolean).join(' · '))}</small></button>`).join('')}</div>` : ''}
                ${se.note ? `<small class="ok">${esc(se.note)}</small>` : ''}</div>` : ''}
            <div class="grid3">
                <label class="span2">Name<input type="text" maxlength="80" value="${esc(f.name)}" ${m('name')} placeholder="e.g. Bank FD 7%, Apple, Index fund"></label>
                <label>Platform / broker / bank<input type="text" maxlength="80" value="${esc(f.platform)}" ${m('platform')}></label>
                ${unit ? `<label>Scheme code (funds)<input type="text" value="${esc(f.schemeCode)}" ${m('schemeCode')}></label>
                    <label>Symbol (shares, ETFs, crypto)<input type="text" value="${esc(f.symbol)}" ${m('symbol')} placeholder="e.g. AAPL, RELIANCE.NS, BTC-USD"></label>
                    <label>Price<select ${m('priceSource')}>${opt([['auto', 'Fetched automatically'], ['manual', 'I type it in']], f.priceSource)}</select></label>` : ''}
                ${rate ? `<label>Interest rate (% a year)<input type="number" inputmode="decimal" step="0.01" min="0" value="${esc(f.rate)}" ${m('rate')}></label>
                    <label>Compounding<select ${m('compounding')}>${opt(I.COMPOUNDING, f.compounding)}</select></label>
                    <label>Value from statement (optional)<input type="number" inputmode="decimal" min="0" value="${esc(f.manualValue)}" ${m('manualValue')} placeholder="worked out from the rate"></label>
                    <label>Start date<input type="date" value="${esc(f.startDate)}" ${m('startDate')}></label>
                    <label>Maturity date<input type="date" value="${esc(f.maturityDate)}" ${m('maturityDate')}></label>` : ''}
                <label>Linked account<select ${m('accountId')}>${accountOpts(f.accountId)}</select></label>
                <label>Goal<select ${m('goalId')}><option value="">No goal</option>${S.data.goals.map((g) => `<option value="${g.id}" ${g.id === f.goalId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
                <label>Asset class<select ${m('assetClass')}><option value="">From the type</option>${opt(I.ASSET_CLASSES, f.assetClass)}</select></label>
                <label>Folio / account no.<input type="text" value="${esc(f.folio)}" ${m('folio')}></label>
                <label>Lock-in until<input type="date" value="${esc(f.lockIn)}" ${m('lockIn')}></label>
                <label>Nominee<input type="text" value="${esc(f.nominee)}" ${m('nominee')}></label>
                <label>Alert when price above<input type="number" inputmode="decimal" min="0" value="${esc(f.alertAbove)}" ${m('alertAbove')}></label>
                <label>Alert when price below<input type="number" inputmode="decimal" min="0" value="${esc(f.alertBelow)}" ${m('alertBelow')}></label>
                ${unit ? `<label>Price now (if typed in)<input type="number" inputmode="decimal" min="0" step="0.0001" value="${esc(f.price)}" ${m('price')}></label>` : ''}
                <label class="span2">Notes<input type="text" value="${esc(f.notes)}" ${m('notes')}></label>
            </div>
            ${f.isNew && f.mode !== 'watch' ? `<h3>${f.mode === 'buy' ? 'What you are buying' : 'What you hold now'}</h3>
                <div class="grid3"><label>Date<input type="date" max="${today()}" value="${esc(first.date)}" data-model="invest.form.first.date"></label>
                ${unit ? `<label>Units<input type="number" inputmode="decimal" step="0.0001" min="0" value="${esc(first.units)}" data-model="invest.form.first.units"></label>
                    <label>${f.mode === 'held' ? 'Average buy price' : 'Price'}<input type="number" inputmode="decimal" step="0.0001" min="0" value="${esc(first.price)}" data-model="invest.form.first.price"></label>` : ''}
                <label>${unit ? 'Amount (units × price, or type it)' : 'Amount put in'}<input type="number" inputmode="decimal" min="0" value="${esc(first.amount)}" data-model="invest.form.first.amount"></label>
                ${f.mode === 'buy' ? `<label>Charges (brokerage, fees)<input type="number" inputmode="decimal" min="0" value="${esc(first.charges)}" data-model="invest.form.first.charges"></label>
                    <label>Paid from<select data-model="invest.form.first.accountId">${accountOpts(first.accountId)}</select></label>` : ''}</div>
                <small>${f.mode === 'buy' ? 'The amount (with charges) goes out of the account you choose and is written to the ledger.' : 'Not written to the ledger: for what you bought before using LifeDesk. Add more past buys later for an exact XIRR.'}</small>
                <label class="check"><input type="checkbox" ${f.addSip ? 'checked' : ''} data-model="invest.form.addSip" data-rerender> Add a SIP / recurring deposit for it</label>
                ${f.addSip ? sipFields('invest.form.sip', f.sip, true) : ''}` : ''}
            <div class="split"><button class="btn" data-action="invCancel">Cancel</button><button class="btn primary" data-action="invSave">Save</button></div></section>`;
    }

    function sipFields(path, s, isNew) {
        const m = (k) => `data-model="${path}.${k}"`;
        return `<div class="grid3">
            <label>Instalment amount<input type="number" inputmode="decimal" min="0" value="${esc(s.amount)}" ${m('amount')}></label>
            <label>Frequency<select ${m('frequency')}>${opt(['Monthly', 'Quarterly', 'Weekly'], s.frequency)}</select></label>
            <label>Day of month<select ${m('day')}>${Array.from({ length: 28 }, (_, i) => `<option ${String(i + 1) === String(s.day) ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
            <label>Start date<input type="date" value="${esc(s.startDate)}" ${m('startDate')}></label>
            <label>End date (optional)<input type="date" value="${esc(s.endDate)}" ${m('endDate')}></label>
            <label>Paid from<select ${m('accountId')}>${accountOpts(s.accountId)}</select></label>
            <label>Yearly step-up %<input type="number" inputmode="decimal" min="0" step="0.5" value="${esc(s.stepUpPct)}" ${m('stepUpPct')}></label>
            <label>or yearly step-up amount<input type="number" inputmode="decimal" min="0" value="${esc(s.stepUpAmount)}" ${m('stepUpAmount')}></label>
            <label>Mandate (optional)<input type="text" value="${esc(s.mandate)}" ${m('mandate')}></label></div>
            <label class="check"><input type="checkbox" ${s.autoRecord !== false ? 'checked' : ''} ${m('autoRecord')}> Record each instalment automatically at its day's price</label>
            ${isNew ? `<label class="check"><input type="checkbox" ${s.firstToday ? 'checked' : ''} ${m('firstToday')}> First instalment paid today (deducted now)</label>` : ''}
            <small>Off: an instalment waits on this screen for you to enter the units from your statement. A start date in the past records the past instalments too.</small>`;
    }

    function txnForm() {
        const t = st().txn;
        const inv = invById(t.investmentId) || {};
        const unit = I.UNIT_TYPES.includes(inv.type) || num(t.units) > 0;
        const showUnits = unit && ['buy', 'sip', 'opening', 'sell', 'reinvest', 'bonus'].includes(t.kind);
        const showPrice = unit && ['buy', 'sip', 'opening', 'sell', 'reinvest'].includes(t.kind);
        const showAmount = !['bonus', 'split'].includes(t.kind);
        const showCharges = ['buy', 'sip', 'sell', 'maturity'].includes(t.kind);
        const showRatio = ['bonus', 'split'].includes(t.kind);
        const showAccount = !I.NO_ACCOUNT.includes(t.kind);
        const h = I.holding(inv, S.data.invTxns.filter((x) => x.id !== t.id), today());
        const m = (k) => `data-model="invest.txn.${k}"`;
        const hasSource = inv.schemeCode || (inv.symbol && P.sharesAvailable);
        return `<section class="card form"><h3>${t.id ? 'Change' : esc(I.TXN_KINDS[t.kind])}: ${esc(inv.name || '')}</h3>
            <div class="grid3">
                <label>What happened<select ${m('kind')} data-rerender>${opt(Object.entries(I.TXN_KINDS), t.kind)}</select></label>
                <label>Date<input type="date" max="${today()}" value="${esc(t.date)}" ${m('date')}></label>
                ${showUnits ? `<label>Units<input type="number" inputmode="decimal" step="0.0001" min="0" value="${esc(t.units ?? '')}" ${m('units')}></label>` : ''}
                ${showPrice ? `<label>Price / NAV<input type="number" inputmode="decimal" step="0.0001" min="0" value="${esc(t.price ?? '')}" ${m('price')}></label>` : ''}
                ${showAmount ? `<label>${showPrice ? 'Amount (or units × price)' : t.kind === 'maturity' ? 'Amount received' : 'Amount'}<input type="number" inputmode="decimal" min="0" value="${esc(t.amount ?? '')}" ${m('amount')}></label>` : ''}
                ${showCharges ? `<label>Charges (brokerage, exit load, tax)<input type="number" inputmode="decimal" min="0" value="${esc(t.charges ?? '')}" ${m('charges')}></label>` : ''}
                ${showRatio ? `<label>${t.kind === 'split' ? 'New units for each old unit (2 = 1:2)' : 'Free units for each unit held'}<input type="number" inputmode="decimal" min="0" step="0.0001" value="${esc(t.ratio ?? '')}" ${m('ratio')}></label>` : ''}
                ${showAccount ? `<label>${['buy', 'sip', 'charges'].includes(t.kind) ? 'Paid from' : 'Received in'}<select ${m('accountId')}>${accountOpts(t.accountId)}</select></label>` : ''}
                <label class="span2">Notes (optional)<input type="text" maxlength="255" value="${esc(t.notes ?? '')}" ${m('notes')}></label>
            </div>
            <div class="split wrap">${t.kind === 'sell' && unit ? `<small>You hold ${+num(h.units).toFixed(4)} units.</small><button class="btn" data-action="invSellAll">Sell all</button>` : ''}
                ${showPrice && hasSource ? `<button class="btn" data-action="invPriceOn">Fetch the price for this date</button>` : ''}</div>
            <small>${t.kind === 'opening' ? 'For what you bought before using LifeDesk: counted in the holding, not written to the ledger.' : ['reinvest', 'bonus', 'split'].includes(t.kind) ? 'No money moves, so nothing is written to the ledger.' : 'With an account chosen, the money is written to the ledger and the account balance changes. Choose None for money that did not pass through your accounts.'}</small>
            <div class="split"><button class="btn" data-action="invCancel">Cancel</button><button class="btn primary" data-action="invTxnSave">Save</button></div></section>`;
    }

    function sipForm(p) {
        const s = st().sip;
        const isNew = !s.id;
        return `<section class="card form"><h3>${isNew ? 'Start a SIP' : 'Change the SIP'}</h3>
            <div class="grid3">${isNew ? `<label class="span2">Invest into<select data-model="invest.sip.investmentId">${p.rows.filter((r) => r.status !== 'Closed').map((r) => `<option value="${r.id}" ${r.id === s.investmentId ? 'selected' : ''}>${esc(r.name)} (${esc(r.type)})</option>`).join('')}</select></label>` : ''}
            <label>Name (optional)<input type="text" value="${esc(s.name)}" data-model="invest.sip.name"></label></div>
            ${sipFields('invest.sip', s, isNew)}
            <div class="split"><button class="btn" data-action="invCancel">Cancel</button><button class="btn primary" data-action="invSipSave">Save</button></div></section>`;
    }

    function goalForm(p) {
        const g = st().goal;
        return `<section class="card form"><h3>Investment goal</h3>
            <div class="grid3"><label>Goal<input type="text" maxlength="80" value="${esc(g.name)}" data-model="invest.goal.name" placeholder="e.g. Retirement, Child's education"></label>
            <label>Target amount<input type="number" inputmode="decimal" min="0" value="${esc(g.target)}" data-model="invest.goal.target"></label>
            <label>Target date<input type="date" value="${esc(g.targetDate)}" data-model="invest.goal.targetDate"></label>
            <label>Expected return (% a year)<input type="number" inputmode="decimal" min="0" step="0.5" value="${esc(g.expectedReturn)}" data-model="invest.goal.expectedReturn"></label>
            <label>Priority<select data-model="invest.goal.priority">${opt(['High', 'Medium', 'Low'], g.priority)}</select></label>
            <label>Notes (optional)<input type="text" value="${esc(g.notes)}" data-model="invest.goal.notes"></label></div>
            <h3>Investments for this goal</h3>
            <div class="checks">${p.rows.filter((r) => r.status === 'Active').map((r) => `<label class="check"><input type="checkbox" data-action="invGoalLink" data-id="${r.id}" ${g.links.includes(r.id) ? 'checked' : ''}> ${esc(r.name)} · ${money(r.value)}</label>`).join('') || '<small>Add investments first.</small>'}</div>
            <div class="split"><button class="btn" data-action="invCancel">Cancel</button><button class="btn primary" data-action="invGoalSave">Save</button></div></section>`;
    }

    function priceForm() {
        const f = st().price;
        return `<section class="card form"><h3>${f.alertsOnly ? 'Price alerts' : 'Update'}: ${esc(f.name)}</h3>
            <div class="grid3">${f.alertsOnly ? '' : `${f.unit ? `<label>Price / NAV today<input type="number" inputmode="decimal" min="0" step="0.0001" value="${esc(f.price)}" data-model="invest.price.price"></label>` : ''}
                <label>Total value (overrides the worked-out value)<input type="number" inputmode="decimal" min="0" value="${esc(f.manualValue)}" data-model="invest.price.manualValue"></label>`}
            <label>Alert when price above<input type="number" inputmode="decimal" min="0" value="${esc(f.alertAbove)}" data-model="invest.price.alertAbove"></label>
            <label>Alert when price below<input type="number" inputmode="decimal" min="0" value="${esc(f.alertBelow)}" data-model="invest.price.alertBelow"></label></div>
            <small>An alert shows once, when a fetched price crosses it, and is then cleared.</small>
            <div class="split"><button class="btn" data-action="invCancel">Cancel</button><button class="btn primary" data-action="invPriceSave">Save</button></div></section>`;
    }

    // ---------- SIPs ----------
    function sipsTab(p) {
        const active = p.sips.filter((s) => s.status === 'Active');
        const next = [...active].filter((s) => s.nextDue).sort((a, b) => (a.nextDue < b.nextDue ? -1 : 1))[0];
        const rows = [...p.sips].sort((a, b) => (a.status === b.status ? (a.nextDue || '') < (b.nextDue || '') ? -1 : 1 : a.status === 'Active' ? -1 : 1)).map((s) => {
            const due = s.status === 'Active' && s.nextDue && s.nextDue <= today();
            const done = S.data.invTxns.filter((t) => t.sipId === s.id && t.status !== 'pending');
            const total = done.reduce((t, x) => t + num(x.amount) + num(x.charges), 0);
            const step = num(s.stepUpPct) ? `+${s.stepUpPct}% a year` : num(s.stepUpAmount) ? `+${L.money(s.stepUpAmount)} a year` : '';
            return `<div class="acct-row sip-row">
                <div class="a-name"><span class="row-icon">${icon('repaid')}</span><span><b>${esc(s.investmentName)}</b><small>${esc([s.frequency, s.frequency !== 'Weekly' ? `on day ${s.day}` : '', step, s.autoRecord !== false ? 'recorded automatically' : 'you confirm the units'].filter(Boolean).join(' · '))}</small></span></div>
                <div class="a-detail"><small>${s.status === 'Active' ? `${due ? '<span class="over">Due</span>' : 'Next'} ${dateText(s.nextDue)}` : esc(s.status)}</small><small>${done.length} done · ${money(total)} · ${s.endDate ? `ends ${dateText(s.endDate)}` : 'no end date'}</small></div>
                <div class="a-bal"><b class="big">${money(s.amount)}</b><small>${s.accountId ? `from ${esc(c.accountName(s.accountId))}` : 'not in the ledger'}</small></div>
                <div class="a-actions"><span class="pill">${esc(s.status)}</span>
                    ${due ? `<button class="btn primary" data-action="invSipRun" data-id="${s.id}">Record now</button>` : ''}
                    ${s.status === 'Active' ? `<button class="btn" data-action="invSipSkip" data-id="${s.id}">Skip next</button><button class="btn" data-action="invSipStatus" data-status="Paused" data-id="${s.id}">Pause</button><button class="btn" data-action="invSipStatus" data-status="Stopped" data-id="${s.id}">Stop</button>` : ''}
                    ${s.status === 'Paused' || s.status === 'Stopped' ? `<button class="btn" data-action="invSipStatus" data-status="Active" data-id="${s.id}">Resume</button>` : ''}
                    <button class="btn" data-action="invSipEdit" data-id="${s.id}">Edit</button><button class="btn ghost danger" data-action="invSipDelete" data-id="${s.id}">Delete</button></div>
            </div>`;
        }).join('');
        return `<div class="tiles inv-tiles">${stat('SIPs a month', money(p.sipPerMonth))}${stat('Running', `${active.length} active`)}${stat('Next instalment', next ? `${c.shortDate(next.nextDue)} · ${esc(next.investmentName)}` : '–')}</div>
            <div class="toolbar"><button class="btn primary" data-action="invSipNew">${icon('plus')} Start a SIP</button></div>
            ${rows ? `<section class="list atable">${rows}</section>` : `<div class="empty-state">${icon('repaid')}<b>No SIPs yet</b><small>Start a SIP on a fund (or a recurring deposit). Each instalment is recorded on its day at that day's price, the money goes out of the account you choose, and a yearly step-up raises the amount.</small></div>`}`;
    }

    // ---------- transactions ----------
    function txnsTab(p) {
        const f = st().filter;
        const byIdRow = Object.fromEntries(p.rows.map((r) => [r.id, r]));
        const list = S.data.invTxns.filter((t) => t.status !== 'pending' && (!f.inv || t.investmentId === f.inv) && (!f.kind || t.kind === f.kind) && (!f.year || yearOf(t.date) === f.year))
            .sort((a, b) => (a.date === b.date ? num(b.createdAt) - num(a.createdAt) : a.date < b.date ? 1 : -1));
        const years = [...new Set(S.data.invTxns.map((t) => yearOf(t.date)))].sort().reverse();
        let put = 0;
        let back = 0;
        let gain = 0;
        list.forEach((t) => {
            const flow = I.cashFlow(t);
            if (flow !== null && flow < 0) {
                put -= flow;
            } else if (flow !== null) {
                back += flow;
            }
            const g = (byIdRow[t.investmentId] || {}).gains;
            gain += g && g[t.id] ? g[t.id].gain : 0;
        });
        return `<div class="filterbar">
                <label class="pick"><span>Investment</span><select data-model="invest.filter.inv" data-rerender><option value="">All</option>${p.rows.map((r) => `<option value="${r.id}" ${r.id === f.inv ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
                <label class="pick"><span>Kind</span><select data-model="invest.filter.kind" data-rerender><option value="">All</option>${opt(Object.entries(I.TXN_KINDS), f.kind)}</select></label>
                <label class="pick"><span>Year</span><select data-model="invest.filter.year" data-rerender><option value="">All</option>${opt(years, f.year)}</select></label>
                <button class="btn" data-action="invCsv">Download CSV</button></div>
            ${list.length ? `<small class="muted">Put in ${money(put)} · got back ${money(back)} · realised ${signed(gain)}</small>
                <section class="list">${list.map((t) => txnRow(t, byIdRow[t.investmentId], true)).join('')}</section>` : '<p class="empty">No transactions here yet.</p>'}`;
    }

    // ---------- goals ----------
    function goalsTab(p) {
        const goals = I.goalRows(S.data, p.rows, today());
        return `<div class="toolbar"><button class="btn primary" data-action="invGoalNew">${icon('plus')} Add a goal</button></div>
            ${goals.length ? `<div class="cards goals">${goals.map((g) => `<section class="card"><div class="card-head"><h2>${esc(g.name)}</h2><span class="pill ${g.onTrack ? 'ok' : 'warn'}">${g.onTrack ? 'On track' : 'Behind'}</span></div>
                <b class="big">${money(g.value)} <small>of ${money(g.target)}</small></b>
                <div class="bar"><i style="width:${g.progress}%"></i></div>
                <small>${g.progress}% · ${g.targetDate ? `by ${dateText(g.targetDate)}` : 'no date'} · ${g.linked} investment${g.linked === 1 ? '' : 's'}</small>
                <small>${g.needed ? `Invest ${money(g.needed)} a month at ${num(g.expectedReturn ?? 12)}% to get there` : 'On target with what is invested'} · SIPs now ${money(g.sipPerMonth)} a month</small>
                <div class="split wrap"><button class="btn" data-action="invGoalEdit" data-id="${g.id}">Edit</button><button class="btn ghost danger" data-action="invGoalDelete" data-id="${g.id}">Delete</button></div></section>`).join('')}</div>`
                : `<div class="empty-state">${icon('target')}<b>No goals yet</b><small>A goal (a house, retirement, a child's education) with a target and a date. Link investments to it to see the progress and the monthly investment that gets you there.</small></div>`}`;
    }

    // ---------- insights ----------
    function insightsTab(p) {
        const sliceItems = (list) => list.map((x) => ({ label: `${x.label} · ${x.pct}%`, value: x.value }));
        const movers = p.active.filter((r) => r.invested > 0 && r.gainPct !== null).sort((a, b) => b.gainPct - a.gainPct);
        const months = [];
        for (let i = 11; i >= 0; i--) {
            months.push(L.addMonths(L.monthKey(today()), -i));
        }
        const flowIn = months.map((k) => S.data.invTxns.filter((t) => t.status !== 'pending' && L.monthKey(t.date) === k).reduce((s, t) => { const f = I.cashFlow(t); return s + (f !== null && f < 0 && t.kind !== 'opening' ? -f : 0); }, 0));
        const flowOut = months.map((k) => S.data.invTxns.filter((t) => t.status !== 'pending' && L.monthKey(t.date) === k && ['sell', 'maturity'].includes(t.kind)).reduce((s, t) => s + num(t.amount) - num(t.charges), 0));
        const thisYear = p.years.find((y) => y.year === yearOf(today()));
        const india = currency() === 'INR';
        return `<div class="inv-grid">
            <section class="card span"><div class="card-head"><h2>Allocation by asset class</h2></div>${hbars(sliceItems(p.byClass), money, 'Add investments to see the allocation.')}</section>
            <section class="card"><div class="card-head"><h2>By type</h2></div>${hbars(sliceItems(p.byType), money)}</section>
            <section class="card"><div class="card-head"><h2>By platform</h2></div>${hbars(sliceItems(p.byPlatform), money)}</section>
            ${valueByMonth().length > 1 ? `<section class="card span"><div class="card-head"><h2>Value and cost by month</h2></div>${columns(valueByMonth().map((x) => L.monthLabel(x.id).slice(0, 3)), [{ name: 'Value', slot: 1, values: valueByMonth().map((x) => num(x.value)) }, { name: 'Cost', slot: 2, values: valueByMonth().map((x) => num(x.invested)) }], money, L.compact)}</section>` : `<section class="card span"><div class="card-head"><h2>Value and cost by month</h2></div><p class="empty">Builds up from this month: LifeDesk keeps the value of your investments each month.</p></section>`}
            <section class="card span"><div class="card-head"><h2>Money in and out by month</h2></div>${columns(months.map((k) => L.monthLabel(k).slice(0, 3)), [{ name: 'Put in', slot: 1, values: flowIn }, { name: 'Taken out', slot: 2, values: flowOut }], money, L.compact)}</section>
            <section class="card"><div class="card-head"><h2>Best performers</h2></div>${movers.slice(0, 5).map((r) => `<div class="kv"><span>${esc(r.name)}</span><b class="${tone(r.gain)}">${pct(r.gainPct)} · ${signed(r.gain)}</b></div>`).join('') || '<p class="empty">Nothing yet.</p>'}
                ${movers.filter((r) => r.gainPct < 0).length ? `<h3>In loss</h3>${movers.filter((r) => r.gainPct < 0).slice(-5).reverse().map((r) => `<div class="kv"><span>${esc(r.name)}</span><b class="out">${pct(r.gainPct)} · ${signed(r.gain)}</b></div>`).join('')}` : ''}</section>
            <section class="card"><div class="card-head"><h2>Coming up</h2></div>${p.upcoming.map((u) => `<div class="kv"><span>${c.shortDate(u.date)} · ${u.what} · ${esc(u.name)}</span><b>${money(u.amount)}</b></div>`).join('') || '<p class="empty">No SIP or maturity in the next 30 days.</p>'}</section>
            <section class="card span"><div class="card-head"><h2>Gains and income by year</h2></div>
                ${p.years.length ? `<div class="table-wrap"><table class="report"><thead><tr><th>Year</th><th>Put in</th><th>Taken out</th><th>Short-term gain</th><th>Long-term gain</th><th>Dividends &amp; interest</th></tr></thead><tbody>
                    ${p.years.map((y) => `<tr><td>${esc(y.year)}</td><td>${money(y.invested)}</td><td>${money(y.withdrawn)}</td><td class="${tone(y.shortTerm)}">${signed(y.shortTerm)}</td><td class="${tone(y.longTerm)}">${signed(y.longTerm)}</td><td>${money(y.income)}</td></tr>`).join('')}</tbody></table></div>
                    ${india ? `<small>${thisYear ? `This year: long-term gains ${signed(thisYear.longTerm)}${125000 - thisYear.longTerm > 0 ? ` – about ${money(125000 - thisYear.longTerm)} more fits in the yearly ₹1.25 lakh long-term equity limit.` : '.'}` : 'Nothing sold this year yet.'}</small>` : ''}
                    <small>Gains use first-in-first-out. Long term = held over 12 months for equity and equity-heavy funds, over 24 months for others. Tax rules differ by country and change; check before filing.</small>`
                    : '<p class="empty">Nothing sold or paid out yet.</p>'}</section>
        </div>`;
    }

    // ---------- calculator ----------
    function calcTab() {
        const k = st().calc;
        const sip = I.sipFuture(k.monthly, k.years, k.rate, k.stepUp);
        const lump = num(k.lump) * Math.pow(1 + num(k.rate) / 100, num(k.years));
        const goal = I.goalPlan(k.target, k.goalYears, k.rate);
        const f = (label, key, step = 1) => `<label>${label}<input type="number" inputmode="decimal" step="${step}" value="${esc(k[key])}" data-model="invest.calc.${key}" data-rerender></label>`;
        return `<div class="inv-grid three">
            <section class="card"><div class="card-head"><h2>SIP calculator</h2></div><div class="grid2">${f('Monthly SIP', 'monthly')}${f('Years', 'years')}${f('Expected return % a year', 'rate', 0.5)}${f('Yearly step-up %', 'stepUp')}</div>
                <div class="kv"><span>You put in</span><b>${money(sip.invested)}</b></div><div class="kv"><span>Value at the end</span><b class="in">${money(sip.value)}</b></div>
                <div class="kv"><span>Growth</span><b>${money(sip.value - sip.invested)} · ${sip.invested ? (sip.value / sip.invested).toFixed(2) : '–'}×</b></div></section>
            <section class="card"><div class="card-head"><h2>One-time investment</h2></div><div class="grid2">${f('Amount', 'lump')}${f('Years', 'years')}</div>
                <div class="kv"><span>Value at the end</span><b class="in">${money(lump)}</b></div><div class="kv"><span>Growth</span><b>${money(lump - num(k.lump))}</b></div></section>
            <section class="card"><div class="card-head"><h2>Goal planner</h2></div><div class="grid2">${f('Amount needed', 'target')}${f('In years', 'goalYears')}</div>
                <div class="kv"><span>Monthly SIP needed</span><b>${money(goal.monthly)}</b></div><div class="kv"><span>Or one-time today</span><b>${money(goal.lump)}</b></div>
                <small>Uses the expected return of the SIP calculator (${num(k.rate)}% a year).</small></section>
        </div>`;
    }

    // ---------------------------------------------------------------- saving
    const isSample = (doc) => String(doc.id).startsWith('sample-');

    function incomeCategory(pairs) {
        let cat = S.data.categories.find((x) => x.type === 'income' && x.name.toLowerCase() === INCOME_CATEGORY.toLowerCase());
        if (!cat) {
            cat = { id: S.newId(), name: INCOME_CATEGORY, type: 'income', keywords: ['dividend', 'interest', 'coupon'], active: true };
            pairs.push(['categories', cat]);
        }
        return cat.id;
    }

    /** [collection, doc] pairs that save a transaction and its ledger entry; ids of entries to remove. */
    function txnPairs(t, inv) {
        const pairs = [['invTxns', t]];
        const removes = [];
        const led = I.ledgerFor(t);
        const entryId = `inv-${t.id}`;
        const existing = S.data.entries.find((e) => e.id === entryId);
        if (led) {
            const words = { buy: 'Bought', sip: 'SIP', charges: 'Charges', sell: 'Sold', maturity: 'Matured', dividend: 'Dividend', interest: 'Interest' };
            pairs.push(['entries', {
                id: entryId, type: led.type, amount: led.amount, date: t.date, accountId: t.accountId, toAccountId: null, personId: null,
                categoryId: led.type === 'income' ? incomeCategory(pairs) : null, description: `${words[t.kind]} · ${inv.name}`, notes: t.notes || '',
                investmentId: inv.id, invTxnId: t.id, createdAt: existing ? existing.createdAt : Date.now()
            }]);
        } else if (existing) {
            removes.push(['entries', entryId]);
        }
        return { pairs, removes };
    }

    async function saveTxns(list, fallbackInv) {
        const pairs = [];
        const removes = [];
        for (const t of list) {
            const inv = invById(t.investmentId) || fallbackInv;
            const r = txnPairs(t, inv);
            pairs.push(...r.pairs);
            removes.push(...r.removes);
        }
        // check that no sale needs more units than are held
        const merged = [...S.data.invTxns.filter((x) => !list.some((t) => t.id === x.id)), ...list];
        for (const id of new Set(list.map((t) => t.investmentId))) {
            const inv = invById(id) || fallbackInv;
            if (inv) {
                const h = I.holding(inv, merged, today());
                if (h.error) {
                    throw new Error(h.error);
                }
            }
        }
        await S.saveMany(pairs);
        if (removes.length) {
            await S.removeMany(removes);
        }
    }

    async function removeTxns(ids) {
        const removes = [];
        ids.forEach((id) => {
            removes.push(['invTxns', id]);
            if (S.data.entries.some((e) => e.id === `inv-${id}`)) {
                removes.push(['entries', `inv-${id}`]);
            }
        });
        if (removes.length) {
            await S.removeMany(removes);
        }
    }

    const blankSip = (invId, accountId) => ({ id: null, investmentId: invId, name: '', amount: '', frequency: 'Monthly', day: '5', startDate: today(), endDate: '', accountId, stepUpPct: '', stepUpAmount: '', autoRecord: true, firstToday: true, mandate: '', notes: '' });

    function sipDoc(f, inv) {
        const startDate = f.startDate || today();
        const stepUp = num(f.stepUpPct) > 0 || num(f.stepUpAmount) > 0;
        const plan = { frequency: f.frequency || 'Monthly', day: Number(f.day) || Number(startDate.slice(8, 10)) || 1, startDate };
        const old = f.id ? S.data.sips.find((x) => x.id === f.id) : null;
        let nextDue = old ? old.nextDue : I.firstDue(startDate, plan.frequency, plan.day);
        if (old && (old.startDate !== plan.startDate || String(old.day) !== String(plan.day) || old.frequency !== plan.frequency)) {
            const from = old.lastDone && old.lastDone >= startDate ? I.nextDue(old.lastDone, plan.frequency, plan.day) : startDate;
            nextDue = I.firstDue(from, plan.frequency, plan.day);
        }
        return {
            id: f.id || S.newId(), investmentId: f.investmentId || inv.id, name: String(f.name || '').trim() || `SIP ${inv.name}`, amount: num(f.amount), ...plan,
            endDate: f.endDate || null, accountId: f.accountId || null, stepUpPct: num(f.stepUpPct) || null, stepUpAmount: num(f.stepUpAmount) || null,
            nextStepUp: stepUp ? (old && old.nextStepUp) || `${Number(startDate.slice(0, 4)) + 1}${startDate.slice(4)}` : null,
            autoRecord: f.autoRecord !== false, mandate: f.mandate || '', notes: f.notes || '', status: old ? old.status : 'Active', lastDone: old ? old.lastDone : null, nextDue,
            createdAt: old ? old.createdAt : Date.now()
        };
    }

    /** The first instalment of a new SIP, paid today: recorded at the latest price and deducted now. */
    async function firstInstalment(sip, inv) {
        const t = { id: `sip-${sip.id}-${today()}`, investmentId: inv.id, sipId: sip.id, kind: 'sip', date: today(), amount: sip.amount, accountId: sip.accountId, notes: 'First instalment', status: 'confirmed', createdAt: Date.now() };
        if (I.UNIT_TYPES.includes(inv.type)) {
            let q = null;
            try {
                q = await P.latest(inv, today(), currency());
            } catch (e) {
                q = null;
            }
            if (q && q.price) {
                t.price = q.price;
                t.units = Math.floor((sip.amount / q.price) * 10000) / 10000;
            } else if (num(inv.price) > 0) {
                t.price = num(inv.price);
                t.units = Math.floor((sip.amount / t.price) * 10000) / 10000;
            } else {
                t.status = 'pending';
            }
        }
        const sipNext = sip.nextDue && sip.nextDue <= today() ? { ...sip, lastDone: today(), nextDue: I.nextDue(sip.nextDue, sip.frequency, sip.day) } : sip;
        await saveTxns([t], inv);
        await S.save('sips', sipNext);
    }

    /** Records every SIP instalment that is due (prices fetched first). Safe to run twice: an instalment's id is fixed. */
    async function recordDueSips(only) {
        const due = S.data.sips.filter((s) => s.status === 'Active' && !isSample(s) && s.nextDue && s.nextDue <= today() && (!only || s.id === only));
        let recorded = 0;
        let pending = 0;
        for (const s of due) {
            const inv = invById(s.investmentId);
            if (!inv) {
                continue;
            }
            let prices = {};
            if (I.UNIT_TYPES.includes(inv.type)) {
                try {
                    prices = await P.history(inv, s.nextDue, today(), currency());
                } catch (e) {
                    prices = {};
                }
            }
            const r = I.dueInstalments(s, inv, prices, today());
            if (r.txns.length) {
                await saveTxns(r.txns.map((t) => ({ ...t, createdAt: Date.now() })));
                recorded += r.txns.filter((t) => t.status === 'confirmed').length;
                pending += r.txns.filter((t) => t.status === 'pending').length;
            }
            if (r.sip.nextDue !== s.nextDue || r.sip.status !== s.status || r.sip.amount !== s.amount) {
                await S.save('sips', r.sip);
            }
        }
        return { recorded, pending };
    }

    /** Fetches the latest prices (automatic price source with a scheme code, or a symbol when the service is set up). */
    async function refreshPrices(quiet) {
        const list = S.data.investments.filter((i) => (i.status || 'Active') !== 'Closed' && i.priceSource !== 'manual' && !isSample(i) && (i.schemeCode || (i.symbol && P.sharesAvailable)));
        const pairs = [];
        const alerts = [];
        for (const inv of list) {
            try {
                const q = await P.latest(inv, today(), currency());
                if (!q || !q.price) {
                    continue;
                }
                const next = { ...inv, price: q.price, priceDate: q.asOf, prevPrice: q.previous ?? (inv.priceDate && inv.priceDate !== q.asOf ? inv.price : inv.prevPrice ?? null) };
                ['fundHouse', 'category', 'isin'].forEach((k) => {
                    if (!next[k] && q[k]) {
                        next[k] = q[k];
                    }
                });
                if (num(inv.alertAbove) && q.price >= num(inv.alertAbove)) {
                    alerts.push(`${inv.name} is ${L.money(q.price)}, above your ${L.money(inv.alertAbove)}`);
                    next.alertAbove = null;
                } else if (num(inv.alertBelow) && q.price <= num(inv.alertBelow)) {
                    alerts.push(`${inv.name} is ${L.money(q.price)}, below your ${L.money(inv.alertBelow)}`);
                    next.alertBelow = null;
                }
                pairs.push(['investments', next]);
            } catch (e) {
                // one price that cannot be fetched does not stop the others
            }
        }
        if (pairs.length) {
            await S.saveMany(pairs);
        }
        try {
            localStorage.setItem(PRICE_KEY, String(Date.now()));
        } catch (e) {
            // private window
        }
        if (alerts.length) {
            c.toast(`Price alert: ${alerts.join('; ')}.`, 'warn');
            c.localNotify('Price alert', `${alerts.join('; ')}.`, 'invest');
        } else if (!quiet) {
            c.toast(pairs.length ? `${pairs.length} price${pairs.length === 1 ? '' : 's'} updated.` : list.length ? 'Prices could not be fetched right now.' : 'Nothing has an automatic price yet.', pairs.length || !list.length ? 'ok' : 'warn');
        }
        return pairs.length;
    }

    /** Keeps this month's value and cost of the investments (the chart "Value by month"); saved only when it changed. */
    async function snapshot() {
        if (!S.data.investments.some((i) => !isSample(i))) {
            return;
        }
        const p = port();
        const key = L.monthKey(today());
        const old = (S.data.invSnapshots || []).find((x) => x.id === key);
        if (!old || Math.abs(num(old.value) - p.value) >= 1 || Math.abs(num(old.invested) - p.invested) >= 1) {
            await S.save('invSnapshots', { id: key, value: p.value, invested: p.invested, updated: today() });
        }
    }

    /** Value and cost at the end of each month that has a record, for a chart. */
    function valueByMonth() {
        return [...(S.data.invSnapshots || [])].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(-24);
    }

    /** Opening the screen: SIP instalments that are due, then prices when the last fetch is older than 6 hours. */
    async function onOpen() {
        let last = 0;
        try {
            last = Number(localStorage.getItem(PRICE_KEY)) || 0;
        } catch (e) {
            last = 0;
        }
        try {
            const r = await recordDueSips();
            if (r.recorded) {
                c.localNotify('SIP instalments recorded', `${r.recorded} recorded at their day's price.`, 'invest');
            }
            if (r.recorded || r.pending) {
                c.toast(`${r.recorded ? `${r.recorded} SIP instalment${r.recorded === 1 ? '' : 's'} recorded` : ''}${r.recorded && r.pending ? ' · ' : ''}${r.pending ? `${r.pending} to confirm` : ''}.`);
            }
        } catch (e) {
            console.error(e);
        }
        if (Date.now() - last > PRICE_EVERY_MS && navigator.onLine) {
            st().refreshing = true;
            c.render();
            try {
                await refreshPrices(true);
            } finally {
                st().refreshing = false;
                c.render();
            }
        }
        snapshot().catch(() => {});
    }

    function sampleDocs() {
        const t = today();
        const back = (months, day = 5) => {
            const d = new Date(`${t}T00:00:00Z`);
            d.setUTCMonth(d.getUTCMonth() - months);
            d.setUTCDate(day);
            return d.toISOString().slice(0, 10);
        };
        const k = currency() === 'INR' ? 1 : currency() === 'JPY' ? 1.6 : 0.012;
        const r = (v) => Math.round(v * k * 100) / 100;
        const g = { id: 'sample-goal-house', name: 'House down payment (sample)', target: r(1500000), targetDate: `${Number(t.slice(0, 4)) + 4}${t.slice(4)}`, expectedReturn: 12, priority: 'High', notes: '' };
        const inv = (id, name, type, extra) => ({ id: `sample-inv-${id}`, name, type, status: 'Active', priceSource: 'manual', platform: '', accountId: null, goalId: null, createdAt: 1, ...extra });
        const invs = [
            inv('flexi', 'Flexi Cap Fund – Direct (sample)', 'Mutual Fund', { price: r(88.8), prevPrice: r(88.2), priceDate: t, platform: 'Fund app', goalId: g.id }),
            inv('index', 'Index Fund (sample)', 'Mutual Fund', { price: r(27.4), prevPrice: r(27.6), priceDate: t, platform: 'Fund app', goalId: g.id }),
            inv('share', 'Large Company Share (sample)', 'Stock', { price: r(1250), prevPrice: r(1236), priceDate: t, platform: 'Broker' }),
            inv('fd', 'Bank Fixed Deposit 7.1% (sample)', 'Fixed Deposit', { rate: 7.1, compounding: 'Quarterly', startDate: back(8, 1), maturityDate: back(-4, 1), platform: 'Bank' }),
            inv('pf', 'Provident Fund (sample)', 'Provident Fund', { rate: 7.1, compounding: 'Yearly', platform: 'Employer' })
        ];
        const tx = (id, invId, kind, date, extra) => ({ id: `sample-txn-${id}`, investmentId: `sample-inv-${invId}`, kind, date, status: 'confirmed', accountId: null, createdAt: 1, ...extra });
        const navs = [70.5, 72.1, 74.0, 73.2, 76.8, 79.3, 81.0, 83.4, 82.9, 85.6, 87.1, 88.0];
        const txns = [
            tx('index', 'index', 'opening', back(24), { units: 1500, amount: r(30000) }),
            tx('share-buy', 'share', 'buy', back(14), { units: 20, price: r(1100), amount: r(22000), charges: r(30) }),
            tx('share-sell', 'share', 'sell', back(1), { units: 5, price: r(1280), amount: r(6400), charges: r(20) }),
            tx('share-div', 'share', 'dividend', back(3), { amount: r(150) }),
            tx('fd', 'fd', 'opening', back(8, 1), { amount: r(100000) }),
            tx('pf-1', 'pf', 'opening', back(36), { amount: r(150000) }),
            tx('pf-2', 'pf', 'opening', back(12), { amount: r(150000) }),
            ...navs.map((n, i) => tx(`sip-${i}`, 'flexi', 'sip', back(12 - i), { amount: r(5000), price: r(n), units: Math.floor((5000 / n) * 10000) / 10000, sipId: 'sample-sip-flexi' }))
        ];
        const sip = { id: 'sample-sip-flexi', investmentId: 'sample-inv-flexi', name: 'SIP Flexi Cap (sample)', amount: r(5000), frequency: 'Monthly', day: 5, startDate: back(12), endDate: null, accountId: null, stepUpPct: 10, stepUpAmount: null, nextStepUp: back(-1), autoRecord: true, status: 'Active', lastDone: back(1), nextDue: I.firstDue(new Date(Date.parse(`${t}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), 'Monthly', 5) };
        return [['goals', g], ...invs.map((x) => ['investments', x]), ...txns.map((x) => ['invTxns', x]), ['sips', sip]];
    }

    // ---------------------------------------------------------------- actions
    const actions = {
        invTab(el) {
            const s = st();
            s.tab = el.dataset.tab;
            s.form = s.txn = s.sip = s.goal = s.price = null;
            c.render();
        },
        invOpen(el) {
            st().open = st().open === el.dataset.id ? null : el.dataset.id;
            c.render();
        },
        invNew() {
            const acc = defaultAcc();
            Object.assign(st(), { txn: null, sip: null, goal: null, price: null, search: { q: '', results: [], busy: false, note: '' } });
            st().form = {
                isNew: true, mode: 'buy', type: 'Mutual Fund', status: 'Active', priceSource: 'auto', compounding: 'Quarterly', accountId: acc, name: '', platform: '', goalId: '', assetClass: '',
                first: { date: today(), units: '', price: '', amount: '', charges: '', accountId: acc }, addSip: false, sip: blankSip(null, acc)
            };
            c.render();
            window.scrollTo(0, 0);
        },
        invEdit(el) {
            const inv = invById(el.dataset.id);
            Object.assign(st(), { txn: null, sip: null, goal: null, price: null, search: { q: '', results: [], busy: false, note: '' } });
            st().form = { ...inv, isNew: false, goalId: inv.goalId || '', assetClass: inv.assetClass || '' };
            c.render();
            window.scrollTo(0, 0);
        },
        invCancel() {
            Object.assign(st(), { form: null, txn: null, sip: null, goal: null, price: null });
            c.render();
        },
        async invSearch() {
            const s = st();
            const f = s.form;
            s.search.busy = true;
            s.search.note = '';
            c.render();
            try {
                s.search.results = f.type === 'Mutual Fund' ? await P.searchFunds(s.search.q) : await P.searchSymbols(s.search.q);
                if (!s.search.results.length) {
                    s.search.note = 'Nothing found. Try fewer words.';
                }
            } catch (e) {
                s.search.results = [];
                c.toast(e.message, 'warn');
            } finally {
                s.search.busy = false;
                c.render();
            }
        },
        async invPick(el) {
            const s = st();
            const x = s.search.results[Number(el.dataset.i)];
            const f = s.form;
            const fund = f.type === 'Mutual Fund';
            Object.assign(f, { name: x.name, schemeCode: fund ? x.code : '', symbol: fund ? '' : x.code, priceSource: 'auto' });
            if (!fund && x.kind === 'ETF' && f.type === 'Stock') {
                f.type = 'ETF';
            } else if (!fund && x.kind === 'Crypto') {
                f.type = 'Crypto';
            }
            s.search = { q: '', results: [], busy: false, note: 'Getting the price…' };
            c.render();
            try {
                const q = await P.latest(f, today(), currency());
                if (q) {
                    Object.assign(f, { fundHouse: q.fundHouse || f.fundHouse, category: q.category || f.category, isin: q.isin || f.isin, price: q.price, prevPrice: q.previous, priceDate: q.asOf });
                    if (f.mode === 'buy' && !f.first.price) {
                        f.first.price = q.price;
                    }
                    s.search.note = `${fund ? 'NAV' : 'Price'} ${L.money(q.price)} on ${c.shortDate(q.asOf)}`;
                }
            } catch (e) {
                s.search.note = 'The price is not available right now; it is fetched again later.';
            }
            c.render();
        },
        async invSave() {
            const f = st().form;
            if (!String(f.name || '').trim()) {
                return c.toast('Enter the name, or pick it from the search.', 'warn');
            }
            const num0 = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
            const doc = {
                id: f.id || S.newId(), name: String(f.name).trim().slice(0, 80), type: f.type, assetClass: f.assetClass || null,
                status: f.isNew ? (f.mode === 'watch' ? 'Watchlist' : 'Active') : f.status || 'Active',
                schemeCode: (f.schemeCode || '').trim() || null, symbol: (f.symbol || '').trim().toUpperCase() || null, isin: f.isin || null, fundHouse: f.fundHouse || null, category: f.category || null,
                platform: (f.platform || '').trim(), folio: f.folio || '', accountId: f.accountId || null, goalId: f.goalId || null, rate: num0(f.rate), compounding: f.compounding || 'Quarterly',
                startDate: f.startDate || null, maturityDate: f.maturityDate || null, lockIn: f.lockIn || null, alertAbove: num0(f.alertAbove), alertBelow: num0(f.alertBelow),
                priceSource: f.priceSource || 'auto', price: num0(f.price), prevPrice: num0(f.prevPrice), priceDate: f.priceDate || (num0(f.price) ? today() : null),
                manualValue: num0(f.manualValue), nominee: f.nominee || '', notes: f.notes || '', createdAt: f.createdAt || Date.now()
            };
            if (f.isNew && f.mode !== 'watch') {
                const x = f.first;
                if (!num(x.amount) && !num(x.units)) {
                    return c.toast('Enter what you hold: the units and price, or the amount.', 'warn');
                }
                if (f.mode === 'buy' && !x.accountId) {
                    return c.toast('Choose the account it was paid from, so it is deducted there.', 'warn');
                }
                const prep = I.prepareTxn({ id: S.newId(), investmentId: doc.id, kind: f.mode === 'buy' ? 'buy' : 'opening', date: x.date || today(), units: x.units, price: x.price, amount: x.amount, charges: f.mode === 'buy' ? x.charges : null, accountId: f.mode === 'buy' ? x.accountId : null, status: 'confirmed', createdAt: Date.now() }, doc, today());
                if (prep.error) {
                    return c.toast(prep.error, 'warn');
                }
                await S.save('investments', doc);
                await saveTxns([prep.txn], doc);
                if (f.addSip && num(f.sip.amount) > 0) {
                    const sip = sipDoc({ ...f.sip, investmentId: doc.id }, doc);
                    await S.save('sips', sip);
                    if (f.sip.firstToday) {
                        await firstInstalment(sip, doc);
                    }
                }
            } else {
                await S.save('investments', doc);
            }
            st().form = null;
            c.toast(`${doc.name} saved.`);
        },
        async invDelete(el) {
            const inv = invById(el.dataset.id);
            if (!window.confirm(`Delete ${inv.name} with all its transactions and SIPs?\nLedger entries it wrote are removed too, so account balances change back.`)) {
                return;
            }
            const txIds = S.data.invTxns.filter((t) => t.investmentId === inv.id).map((t) => t.id);
            await removeTxns(txIds);
            const rest = [...S.data.sips.filter((s) => s.investmentId === inv.id).map((s) => ['sips', s.id]), ['investments', inv.id]];
            await S.removeMany(rest);
            st().open = null;
            c.toast(`${inv.name} deleted.`);
        },
        invAct(el) {
            const inv = invById(el.dataset.id);
            const act = el.dataset.act;
            Object.assign(st(), { form: null, txn: null, sip: null, goal: null, price: null });
            if (act === 'sipnew') {
                st().sip = blankSip(inv.id, inv.accountId || defaultAcc());
                st().tab = 'sips';
            } else if (act === 'price' || act === 'alert') {
                st().price = { id: inv.id, name: inv.name, unit: I.UNIT_TYPES.includes(inv.type), price: inv.price ?? '', manualValue: inv.manualValue ?? '', alertAbove: inv.alertAbove ?? '', alertBelow: inv.alertBelow ?? '', alertsOnly: act === 'alert' };
            } else {
                const kind = act;
                const h = I.holding(inv, S.data.invTxns, today());
                st().txn = { id: null, investmentId: inv.id, kind, date: today(), units: '', price: '', amount: kind === 'maturity' && h.maturityAmount ? h.maturityAmount : '', charges: '', ratio: '', accountId: inv.accountId || defaultAcc(), notes: '' };
            }
            c.render();
            window.scrollTo(0, 0);
        },
        invSellAll() {
            const t = st().txn;
            const inv = invById(t.investmentId);
            const h = I.holding(inv, S.data.invTxns.filter((x) => x.id !== t.id), today());
            t.units = h.units;
            if (num(t.price)) {
                t.amount = Math.round(num(t.units) * num(t.price) * 100) / 100;
            }
            c.render();
        },
        async invPriceOn() {
            const t = st().txn;
            try {
                const q = await P.priceOn(invById(t.investmentId), t.date, currency());
                if (!q) {
                    return c.toast('No price for that date.', 'warn');
                }
                t.price = q.price;
                if (num(t.units)) {
                    t.amount = Math.round(num(t.units) * q.price * 100) / 100;
                } else if (num(t.amount)) {
                    t.units = Math.floor((num(t.amount) / q.price) * 10000) / 10000;
                }
                c.toast(`Price filled: ${L.money(q.price)} on ${c.shortDate(q.asOf)}.`);
            } catch (e) {
                c.toast(e.message, 'warn');
            }
        },
        async invTxnSave() {
            const t = st().txn;
            const inv = invById(t.investmentId);
            if (['buy', 'sip', 'charges'].includes(t.kind) && !t.accountId && !window.confirm('No account is chosen, so nothing is deducted from your bank. Save anyway?')) {
                return;
            }
            const old = t.id ? S.data.invTxns.find((x) => x.id === t.id) : null;
            const prep = I.prepareTxn({ ...t, id: t.id || S.newId(), status: 'confirmed', createdAt: old ? old.createdAt : Date.now(), sipId: old ? old.sipId || null : null }, inv, today());
            if (prep.error) {
                return c.toast(prep.error, 'warn');
            }
            try {
                await saveTxns([prep.txn]);
            } catch (e) {
                return c.toast(e.message, 'warn');
            }
            st().txn = null;
            st().open = inv.id;
            c.toast('Transaction saved.');
        },
        invTxnEdit(el) {
            const t = S.data.invTxns.find((x) => x.id === el.dataset.id);
            Object.assign(st(), { form: null, sip: null, goal: null, price: null });
            st().txn = { ...t, units: t.units ?? '', price: t.price ?? '', amount: t.amount ?? '', charges: t.charges ?? '', ratio: t.ratio ?? '', accountId: t.accountId || '' };
            c.render();
            window.scrollTo(0, 0);
        },
        async invTxnDelete(el) {
            const t = S.data.invTxns.find((x) => x.id === el.dataset.id);
            const ledger = S.data.entries.some((e) => e.id === `inv-${t.id}`) ? ' Its ledger entry is removed too, so the account balance changes back.' : '';
            if (window.confirm(`Delete this ${I.TXN_KINDS[t.kind] || t.kind} of ${L.money(t.amount)}?${ledger}`)) {
                await removeTxns([t.id]);
                c.toast('Transaction deleted.');
            }
        },
        async invPendingPrice(el) {
            const t = S.data.invTxns.find((x) => x.id === el.dataset.id);
            try {
                const q = await P.priceOn(invById(t.investmentId), t.date, currency());
                if (!q) {
                    return c.toast('No price for that date yet.', 'warn');
                }
                st().pending[t.id] = { ...(st().pending[t.id] || {}), price: q.price, units: Math.floor((num(t.amount) / q.price) * 10000) / 10000 };
                c.render();
            } catch (e) {
                c.toast(e.message, 'warn');
            }
        },
        async invPendingConfirm(el) {
            const t = S.data.invTxns.find((x) => x.id === el.dataset.id);
            const e = st().pending[t.id] || {};
            const inv = invById(t.investmentId);
            const prep = I.prepareTxn({ ...t, units: e.units ?? t.units, price: e.price ?? t.price, accountId: e.accountId ?? t.accountId, status: 'confirmed' }, inv, today());
            if (prep.error) {
                return c.toast(prep.error, 'warn');
            }
            await saveTxns([prep.txn]);
            delete st().pending[t.id];
            c.toast('Instalment confirmed.');
        },
        async invPriceSave() {
            const f = st().price;
            const inv = invById(f.id);
            const n = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
            const next = { ...inv, alertAbove: n(f.alertAbove), alertBelow: n(f.alertBelow) };
            if (!f.alertsOnly) {
                next.manualValue = n(f.manualValue);
                if (n(f.price) !== null && n(f.price) !== inv.price) {
                    next.prevPrice = inv.price ?? null;
                    next.price = n(f.price);
                    next.priceDate = today();
                }
            }
            await S.save('investments', next);
            st().price = null;
            c.toast('Saved.');
        },
        async invRefresh() {
            st().refreshing = true;
            c.render();
            try {
                await refreshPrices(false);
            } finally {
                st().refreshing = false;
                c.render();
            }
        },
        async invSamples() {
            const has = S.data.investments.some(isSample);
            if (has) {
                const pairs = [...S.data.invTxns.filter(isSample).map((x) => ['invTxns', x.id]), ...S.data.sips.filter(isSample).map((x) => ['sips', x.id]), ...S.data.investments.filter(isSample).map((x) => ['investments', x.id]), ...S.data.goals.filter(isSample).map((x) => ['goals', x.id])];
                await S.removeMany(pairs);
                c.toast('Sample investments removed.');
            } else {
                await S.saveMany(sampleDocs());
                c.toast('Sample investments added (nothing written to the ledger).');
            }
        },
        // SIPs
        invSipNew() {
            const p = port();
            const first = p.rows.find((r) => r.status !== 'Closed');
            if (!first) {
                return c.toast('Add the investment first: a SIP invests into one of your investments.', 'warn');
            }
            Object.assign(st(), { form: null, txn: null, goal: null, price: null });
            st().sip = blankSip(first.id, first.accountId || defaultAcc());
            c.render();
            window.scrollTo(0, 0);
        },
        invSipEdit(el) {
            const s = S.data.sips.find((x) => x.id === el.dataset.id);
            Object.assign(st(), { form: null, txn: null, goal: null, price: null });
            st().sip = { ...s, day: String(s.day), endDate: s.endDate || '', stepUpPct: s.stepUpPct ?? '', stepUpAmount: s.stepUpAmount ?? '', accountId: s.accountId || '' };
            c.render();
            window.scrollTo(0, 0);
        },
        async invSipSave() {
            const f = st().sip;
            if (!(num(f.amount) > 0)) {
                return c.toast('Enter the instalment amount.', 'warn');
            }
            if (f.endDate && f.startDate && f.endDate < f.startDate) {
                return c.toast('The end date is before the start date.', 'warn');
            }
            const inv = invById(f.investmentId);
            const doc = sipDoc(f, inv);
            await S.save('sips', doc);
            if (!f.id && f.firstToday) {
                await firstInstalment(doc, inv);
            }
            st().sip = null;
            c.toast(f.id ? 'SIP saved.' : 'SIP started.');
        },
        async invSipStatus(el) {
            const s = S.data.sips.find((x) => x.id === el.dataset.id);
            const next = { ...s, status: el.dataset.status };
            if (next.status === 'Active') {
                // resuming starts from the next date: missed instalments are not recorded
                let guard = 0;
                while (next.nextDue && next.nextDue < today() && guard++ < 600) {
                    next.nextDue = I.nextDue(next.nextDue, next.frequency, next.day);
                }
            } else if (next.status === 'Stopped' && !window.confirm(`Stop ${s.name}? Its instalments so far stay in the holding.`)) {
                return;
            }
            await S.save('sips', next);
            c.toast(next.status === 'Active' ? 'SIP running again from its next date.' : `SIP ${next.status.toLowerCase()}.`);
        },
        async invSipSkip(el) {
            const s = S.data.sips.find((x) => x.id === el.dataset.id);
            await S.save('sips', { ...s, nextDue: I.nextDue(s.nextDue || today(), s.frequency, s.day) });
            c.toast('Next instalment skipped.');
        },
        async invSipRun(el) {
            const r = await recordDueSips(el.dataset.id);
            c.toast(r.recorded || r.pending ? `${r.recorded} recorded${r.pending ? `, ${r.pending} to confirm` : ''}.` : 'The price for that day is not out yet. Try again later.', r.recorded || r.pending ? 'ok' : 'warn');
        },
        async invSipDelete(el) {
            const s = S.data.sips.find((x) => x.id === el.dataset.id);
            if (window.confirm(`Delete ${s.name}? The instalments already recorded stay.`)) {
                await S.remove('sips', s.id);
                c.toast('SIP deleted.');
            }
        },
        // goals
        invGoalNew() {
            Object.assign(st(), { form: null, txn: null, sip: null, price: null });
            st().goal = { id: null, name: '', target: '', targetDate: '', expectedReturn: 12, priority: 'Medium', notes: '', links: [] };
            c.render();
            window.scrollTo(0, 0);
        },
        invGoalEdit(el) {
            const g = S.data.goals.find((x) => x.id === el.dataset.id);
            Object.assign(st(), { form: null, txn: null, sip: null, price: null });
            st().goal = { ...g, links: S.data.investments.filter((i) => i.goalId === g.id).map((i) => i.id) };
            c.render();
            window.scrollTo(0, 0);
        },
        invGoalLink(el) {
            const g = st().goal;
            const id = el.dataset.id;
            g.links = el.checked ? [...new Set([...g.links, id])] : g.links.filter((x) => x !== id);
        },
        async invGoalSave() {
            const g = st().goal;
            if (!String(g.name || '').trim() || !(num(g.target) > 0)) {
                return c.toast('Enter the goal name and the target amount.', 'warn');
            }
            const doc = { id: g.id || S.newId(), name: String(g.name).trim().slice(0, 80), target: num(g.target), targetDate: g.targetDate || null, expectedReturn: g.expectedReturn === '' ? 12 : num(g.expectedReturn), priority: g.priority || 'Medium', notes: g.notes || '' };
            const pairs = [['goals', doc]];
            S.data.investments.forEach((i) => {
                const want = g.links.includes(i.id) ? doc.id : i.goalId === doc.id ? null : i.goalId || null;
                if ((i.goalId || null) !== want) {
                    pairs.push(['investments', { ...i, goalId: want }]);
                }
            });
            await S.saveMany(pairs);
            st().goal = null;
            c.toast('Goal saved.');
        },
        async invGoalDelete(el) {
            const g = S.data.goals.find((x) => x.id === el.dataset.id);
            if (window.confirm(`Delete the goal ${g.name}? Its investments stay.`)) {
                const pairs = S.data.investments.filter((i) => i.goalId === g.id).map((i) => ['investments', { ...i, goalId: null }]);
                if (pairs.length) {
                    await S.saveMany(pairs);
                }
                await S.remove('goals', g.id);
                c.toast('Goal deleted.');
            }
        },
        invCsv() {
            const p = port();
            const byIdRow = Object.fromEntries(p.rows.map((r) => [r.id, r]));
            const rows = S.data.invTxns.filter((t) => t.status !== 'pending').sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => {
                const r = byIdRow[t.investmentId] || {};
                const g = r.gains && r.gains[t.id];
                return [t.date, r.name || '', I.TXN_KINDS[t.kind] || t.kind, t.units ?? '', t.price ?? '', t.amount ?? '', t.charges ?? '', c.accountName(t.accountId), g ? g.gain : '', g ? g.term : '', yearOf(t.date), t.notes || ''];
            });
            const csv = [['Date', 'Investment', 'Type', 'Units', 'Price', 'Amount', 'Charges', 'Account', 'Realised gain', 'Term', 'Year', 'Notes'], ...rows]
                .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
            const a = Object.assign(document.createElement('a'), { href: url, download: `investment-transactions-${today()}.csv` });
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    return { screen, actions, onOpen, recordDueSips, port, sampleDocs, snapshot, valueByMonth };
}
