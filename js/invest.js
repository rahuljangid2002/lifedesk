// Investments: pure calculations (no screen and no storage code), the same rules as the Salesforce version.
// A holding's figures are always worked out from its transactions - units, first-in-first-out cost, realised gain
// with its term, dividends and interest, today's value, maturity amount and XIRR - nothing computed is stored.

export const INV_TYPES = ['Mutual Fund', 'Stock', 'ETF', 'Fixed Deposit', 'Recurring Deposit', 'Provident Fund', 'Pension Fund', 'Gold', 'Gold Bond', 'Bond', 'Crypto', 'Other'];
// counted in units with a price; the others (deposits, provident and pension funds, other) are counted by amount
export const UNIT_TYPES = ['Mutual Fund', 'Stock', 'ETF', 'Gold', 'Gold Bond', 'Crypto', 'Bond'];
export const RATE_TYPES = ['Fixed Deposit', 'Recurring Deposit', 'Provident Fund', 'Pension Fund', 'Bond', 'Other'];
export const ASSET_CLASSES = ['Equity', 'Debt', 'Hybrid', 'Gold', 'Cash', 'Crypto', 'Other'];
export const COMPOUNDING = ['Quarterly', 'Monthly', 'Half-yearly', 'Yearly', 'Interest paid out'];
export const TXN_KINDS = {
    buy: 'Buy / add money',
    sip: 'SIP instalment',
    opening: 'Bought before (not in the ledger)',
    sell: 'Sell / redeem / withdraw',
    dividend: 'Dividend paid out',
    interest: 'Interest paid out',
    reinvest: 'Dividend reinvested',
    bonus: 'Bonus units / shares',
    split: 'Split',
    charges: 'Charges',
    maturity: 'Maturity / closure'
};
const BUYS = ['buy', 'sip', 'opening', 'reinvest'];
const MONEY_OUT = ['buy', 'sip', 'charges'];
const MONEY_BACK = ['sell', 'maturity'];
export const PAYOUTS = ['dividend', 'interest'];
export const NO_ACCOUNT = ['opening', 'reinvest', 'bonus', 'split'];
// days after which a sale is long term: equity and equity-heavy funds 12 months, others 24 months
const LONG_EQUITY = 365;
const LONG_OTHER = 730;

const num = (v) => Number(v) || 0;
const round2 = (v) => Math.round(v * 100) / 100;
const dayMs = 86400000;
export function daysBetween(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);
}
const isoPlusDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * dayMs).toISOString().slice(0, 10);

export const isUnitBased = (inv, txns = []) => UNIT_TYPES.includes(inv.type) || txns.some((t) => num(t.units) > 0);

/** Asset class for the allocation, from the type and the fund's category or name. */
export function defaultAssetClass(type, category, name) {
    const hint = `${category || ''} ${name || ''}`.toLowerCase();
    if (type === 'Mutual Fund' || type === 'ETF') {
        if (/gold|silver/.test(hint)) {
            return 'Gold';
        }
        if (/hybrid|balanced|asset allocation|arbitrage/.test(hint)) {
            return 'Hybrid';
        }
        if (/debt|liquid|gilt|bond|money market|overnight|duration/.test(hint)) {
            return 'Debt';
        }
        return 'Equity';
    }
    return { Stock: 'Equity', 'Fixed Deposit': 'Debt', 'Recurring Deposit': 'Debt', 'Provident Fund': 'Debt', Bond: 'Debt', 'Pension Fund': 'Hybrid', Gold: 'Gold', 'Gold Bond': 'Gold', Crypto: 'Crypto' }[type] || 'Other';
}

/** A deposit's value: compound interest from one date to another ("Interest paid out" keeps the principal). */
export function accrue(principal, ratePct, compounding, from, to) {
    const p = num(principal);
    if (!p || num(ratePct) <= 0 || !from || !to || to <= from || compounding === 'Interest paid out') {
        return p;
    }
    const n = { Monthly: 12, 'Half-yearly': 2, Yearly: 1 }[compounding] || 4;
    const years = daysBetween(from, to) / 365;
    return p * Math.pow(1 + num(ratePct) / 100 / n, n * years);
}

/** XIRR: the yearly rate (percent) that makes the dated amounts add up to nothing; null when it cannot be worked out. */
export function xirr(flows) {
    if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) {
        return null;
    }
    const d0 = flows.reduce((m, f) => (f.date < m ? f.date : m), flows[0].date);
    const t = flows.map((f) => daysBetween(d0, f.date) / 365);
    const npv = (r) => flows.reduce((s, f, k) => s + f.amount / Math.pow(1 + r, t[k]), 0);
    let r = 0.1;
    for (let i = 0; i < 60; i++) {
        let f = 0;
        let df = 0;
        flows.forEach((x, k) => {
            const base = Math.pow(1 + r, t[k]);
            f += x.amount / base;
            df -= (t[k] * x.amount) / (base * (1 + r));
        });
        if (Math.abs(f) < 1e-4) {
            return round2(r * 100);
        }
        if (!df) {
            break;
        }
        const next = r - f / df;
        if (!(next > -0.9999) || next > 1e6 || Number.isNaN(next)) {
            break;
        }
        if (Math.abs(next - r) < 1e-7) {
            return round2(next * 100);
        }
        r = next;
    }
    let lo = -0.9999;
    let hi = 100;
    let flo = npv(lo);
    if (flo * npv(hi) > 0) {
        return null;
    }
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const fm = npv(mid);
        if (Math.abs(fm) < 1e-4 || hi - lo < 1e-7) {
            return round2(mid * 100);
        }
        if (flo * fm < 0) {
            hi = mid;
        } else {
            lo = mid;
            flo = fm;
        }
    }
    return round2(((lo + hi) / 2) * 100);
}

/** Money in (negative) or back (positive) of a transaction, for XIRR; null when no money moved. */
export function cashFlow(t) {
    const amt = num(t.amount);
    const ch = num(t.charges);
    if (t.kind === 'buy' || t.kind === 'sip' || t.kind === 'opening') {
        return -(amt + ch);
    }
    if (t.kind === 'charges') {
        return -amt;
    }
    if (PAYOUTS.includes(t.kind)) {
        return amt;
    }
    if (MONEY_BACK.includes(t.kind)) {
        return amt - ch;
    }
    return null;
}

const ORDER = { opening: 0, buy: 1, sip: 1, reinvest: 1, split: 2, bonus: 2, sell: 4, maturity: 4 };
const rank = (k) => (k in ORDER ? ORDER[k] : 3);

/**
 * Everything about one holding, from its confirmed transactions (oldest first; on one date buys before sales).
 * Returns the figures, a gain and term for each sale, and an error when more units are sold than held.
 */
export function holding(inv, allTxns, today) {
    const txns = allTxns.filter((t) => t.investmentId === inv.id && t.status !== 'pending')
        .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : rank(a.kind) - rank(b.kind) || (num(a.createdAt) - num(b.createdAt))));
    const unitMode = isUnitBased(inv, txns);
    const cls = inv.assetClass || defaultAssetClass(inv.type, inv.category, inv.name);
    const longAfter = cls === 'Equity' || cls === 'Hybrid' ? LONG_EQUITY : LONG_OTHER;
    let lots = [];
    let putIn = 0;
    let takenOut = 0;
    let realised = 0;
    let income = 0;
    let sold = false;
    let first = null;
    let error = null;
    const flows = [];
    const gains = {};
    const held = () => lots.reduce((s, l) => s + l.units, 0);
    for (const t of txns) {
        const amt = num(t.amount);
        const ch = num(t.charges);
        const u = num(t.units);
        if (t.kind === 'buy' || t.kind === 'sip' || t.kind === 'opening') {
            lots.push({ d: t.date, units: unitMode ? u : 0, cost: amt + ch });
            putIn += amt + ch;
            flows.push({ amount: -(amt + ch), date: t.date });
            first = first || t.date;
        } else if (t.kind === 'reinvest') {
            lots.push({ d: t.date, units: unitMode ? u : 0, cost: amt });
        } else if (t.kind === 'bonus') {
            lots.push({ d: t.date, units: u > 0 ? u : held() * num(t.ratio), cost: 0 });
        } else if (t.kind === 'split') {
            lots.forEach((l) => {
                l.units *= num(t.ratio) || 1;
            });
        } else if (t.kind === 'charges') {
            putIn += amt;
            flows.push({ amount: -amt, date: t.date });
        } else if (PAYOUTS.includes(t.kind)) {
            income += amt;
            flows.push({ amount: amt, date: t.date });
        } else if (MONEY_BACK.includes(t.kind)) {
            const proceeds = amt - ch;
            let costOut = 0;
            let longPart = 0;
            let shortPart = 0;
            const termOf = (l) => (daysBetween(l.d, t.date) > longAfter ? longPart++ : shortPart++);
            if (t.kind === 'maturity') {
                lots.forEach((l) => {
                    costOut += l.cost;
                    termOf(l);
                });
                lots = [];
            } else if (unitMode) {
                let need = u;
                if (need > held() + 0.0005) {
                    error = `Selling ${+need.toFixed(4)} units on ${t.date}, but only ${+held().toFixed(4)} are held then.`;
                }
                while (need > 1e-5 && lots.length) {
                    const l = lots[0];
                    const take = Math.min(l.units, need);
                    const part = l.units ? (l.cost * take) / l.units : l.cost;
                    costOut += part;
                    termOf(l);
                    l.units -= take;
                    l.cost -= part;
                    need -= take;
                    if (l.units <= 1e-5) {
                        lots.shift();
                    }
                }
            } else {
                let need = proceeds;
                while (need > 0.005 && lots.length) {
                    const l = lots[0];
                    const take = Math.min(l.cost, need);
                    costOut += take;
                    termOf(l);
                    l.cost -= take;
                    need -= take;
                    if (l.cost <= 0.005) {
                        lots.shift();
                    }
                }
            }
            const gain = round2(proceeds - costOut);
            gains[t.id] = { gain, term: longPart && shortPart ? 'Mixed' : longPart ? 'Long term' : 'Short term' };
            realised += gain;
            takenOut += proceeds;
            sold = true;
            flows.push({ amount: proceeds, date: t.date });
        }
    }
    const units = held();
    const cost = lots.reduce((s, l) => s + l.cost, 0);
    const valueDate = inv.maturityDate && inv.maturityDate < today ? inv.maturityDate : today;
    let value;
    if (!lots.length) {
        value = 0;
    } else if (inv.manualValue !== null && inv.manualValue !== undefined && inv.manualValue !== '') {
        value = num(inv.manualValue);
    } else if (unitMode) {
        value = units * (num(inv.price) > 0 ? num(inv.price) : units ? cost / units : 0);
    } else {
        value = lots.reduce((s, l) => s + accrue(l.cost, inv.rate, inv.compounding, l.d, valueDate), 0);
    }
    let maturityAmount = null;
    if (!unitMode && lots.length && inv.maturityDate && num(inv.rate) > 0) {
        maturityAmount = round2(lots.reduce((s, l) => s + accrue(l.cost, inv.rate, inv.compounding, l.d, inv.maturityDate), 0));
    }
    value = round2(value);
    const allFlows = value > 0 ? [...flows, { amount: value, date: today }] : flows;
    const rate = first && daysBetween(first, today) >= 30 ? xirr(allFlows) : null;
    let status = inv.status || 'Active';
    if (status === 'Active' && !lots.length && sold) {
        status = 'Closed';
    } else if (status !== 'Active' && lots.length && (status === 'Closed' || units > 0 || cost > 0)) {
        status = 'Active';
    }
    const prev = num(inv.prevPrice);
    return {
        unitMode, assetClass: cls, units: unitMode ? round4(units) : null, avgCost: unitMode && units > 0 ? round4(cost / units) : null,
        invested: round2(cost), putIn: round2(putIn), takenOut: round2(takenOut), realised: round2(realised), income: round2(income),
        value, gain: round2(value - cost), gainPct: cost > 0 ? round2(((value - cost) / cost) * 100) : null,
        totalGain: round2(value + takenOut + income - putIn), dayChange: prev > 0 && units > 0 && num(inv.price) > 0 ? round2(units * (num(inv.price) - prev)) : 0,
        maturityAmount, xirr: rate, first, status, gains, error, flows
    };
}
const round4 = (v) => Math.round(v * 10000) / 10000;

/** Monthly investment (end of each month) that grows today's value to the target by the target date. */
export function monthlyNeeded(target, current, targetDate, returnPct, today) {
    if (num(target) <= 0 || !targetDate) {
        return null;
    }
    const [ty, tm] = today.split('-').map(Number);
    const [gy, gm] = targetDate.split('-').map(Number);
    const months = (gy - ty) * 12 + (gm - tm);
    const r = Math.pow(1 + num(returnPct) / 100, 1 / 12) - 1;
    const gap = num(target) - num(current) * Math.pow(1 + r, Math.max(months, 0));
    if (gap <= 0) {
        return 0;
    }
    if (months <= 0) {
        return Math.ceil(gap);
    }
    return Math.ceil(r === 0 ? gap / months : (gap * r) / (Math.pow(1 + r, months) - 1));
}

// ---------- SIPs ----------
const onDay = (y, m, day) => {
    const d = Math.max(1, Math.min(28, Number(day) || 1));
    const date = new Date(Date.UTC(y, m, d));
    return date.toISOString().slice(0, 10);
};
/** The first instalment on or after the start date. */
export function firstDue(start, frequency, day) {
    if (!start) {
        return null;
    }
    if (frequency === 'Weekly') {
        return start;
    }
    const [y, m] = start.split('-').map(Number);
    const d = onDay(y, m - 1, day);
    return d < start ? onDay(y, m, day) : d;
}
/** The instalment after one on the given date. */
export function nextDue(due, frequency, day) {
    if (frequency === 'Weekly') {
        return isoPlusDays(due, 7);
    }
    const [y, m] = due.split('-').map(Number);
    return onDay(y, m - 1 + (frequency === 'Quarterly' ? 3 : 1), day);
}
export function stepped(amount, pct, plus) {
    let a = num(amount);
    if (num(pct) > 0) {
        a *= 1 + num(pct) / 100;
    }
    if (num(plus) > 0) {
        a += num(plus);
    }
    return Math.round(a);
}
export const monthlyEquivalent = (s) => (s.frequency === 'Weekly' ? Math.round((num(s.amount) * 52) / 12) : s.frequency === 'Quarterly' ? Math.round(num(s.amount) / 3) : num(s.amount));
const addYear = (iso) => `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;

/**
 * The instalments of a SIP that are due up to today, with the SIP's new state. prices: { date: price } (empty when the
 * investment has no price source). Instalments of a unit-based holding without their day's price wait as pending,
 * except when the price is simply not out yet (fewer than 4 days late): then nothing more is recorded this time.
 */
export function dueInstalments(sip, inv, prices, today) {
    const out = [];
    let due = sip.nextDue;
    let amount = num(sip.amount);
    let stepUp = sip.nextStepUp || null;
    let last = sip.lastDone || null;
    const unitBased = UNIT_TYPES.includes(inv.type);
    const priceDays = Object.keys(prices || {}).sort();
    let guard = 0;
    while (due && due <= today && guard++ < 60) {
        if (sip.endDate && due > sip.endDate) {
            break;
        }
        const t = { id: `sip-${sip.id}-${due}`, investmentId: inv.id, sipId: sip.id, kind: 'sip', date: due, amount, accountId: sip.accountId || null, notes: `SIP ${sip.name || inv.name}` };
        if (!unitBased) {
            t.status = sip.autoRecord === false ? 'pending' : 'confirmed';
        } else {
            const day = priceDays.find((d) => d >= due && d <= today);
            if (sip.autoRecord !== false && day) {
                t.status = 'confirmed';
                t.price = prices[day];
                t.units = Math.floor((amount / t.price) * 10000) / 10000;
            } else if (sip.autoRecord !== false && priceDays.length && daysBetween(due, today) < 4) {
                break;
            } else {
                t.status = 'pending';
            }
        }
        out.push(t);
        last = due;
        due = nextDue(due, sip.frequency, sip.day);
        if (stepUp && due >= stepUp) {
            amount = stepped(amount, sip.stepUpPct, sip.stepUpAmount);
            stepUp = addYear(stepUp);
        }
    }
    const status = sip.endDate && due && due > sip.endDate ? 'Completed' : sip.status;
    return { txns: out, sip: { ...sip, nextDue: due, lastDone: last, amount, nextStepUp: stepUp, status } };
}

// ---------- the ledger ----------
/** The ledger entry a transaction writes (type, amount, account), or null when no money moved through your accounts. */
export function ledgerFor(t) {
    if (t.status === 'pending' || !t.accountId) {
        return null;
    }
    const amt = num(t.amount);
    const ch = num(t.charges);
    let type = null;
    let amount = amt;
    if (MONEY_OUT.includes(t.kind)) {
        type = 'invest';
        amount = t.kind === 'charges' ? amt : amt + ch;
    } else if (MONEY_BACK.includes(t.kind)) {
        type = 'invreturn';
        amount = amt - ch;
    } else if (PAYOUTS.includes(t.kind)) {
        type = 'income';
    }
    return type && amount > 0 ? { type, amount: round2(amount) } : null;
}

/** Fills amount, units or price from the other two, and checks the transaction; returns { txn, error }. */
export function prepareTxn(input, inv, today) {
    const t = { ...input };
    if (!t.date) {
        return { error: 'Choose the date.' };
    }
    if (t.status !== 'pending' && t.date > today) {
        return { error: 'A transaction cannot be dated in the future.' };
    }
    if (NO_ACCOUNT.includes(t.kind)) {
        t.accountId = null;
    }
    const unitMode = UNIT_TYPES.includes(inv.type) || num(t.units) > 0;
    if (unitMode && (BUYS.includes(t.kind) || t.kind === 'sell')) {
        if (!num(t.amount) && num(t.units) > 0 && num(t.price) > 0) {
            t.amount = round2(num(t.units) * num(t.price));
        } else if (!num(t.units) && num(t.amount) > 0 && num(t.price) > 0) {
            t.units = Math.floor((num(t.amount) / num(t.price)) * 10000) / 10000;
        } else if (!num(t.price) && num(t.units) > 0 && num(t.amount) > 0) {
            t.price = round4(num(t.amount) / num(t.units));
        }
        if (t.status !== 'pending' && !(num(t.units) > 0)) {
            return { error: 'Enter the units, or the amount and the price.' };
        }
    }
    if (t.kind === 'split' && !(num(t.ratio) > 0)) {
        return { error: 'Enter the split ratio: new units for each old unit (2 for a 1:2 split).' };
    }
    if (t.kind === 'bonus' && !(num(t.units) > 0) && !(num(t.ratio) > 0)) {
        return { error: 'Enter the bonus units, or the bonus ratio.' };
    }
    if (!['split', 'bonus'].includes(t.kind) && t.status !== 'pending' && !(num(t.amount) > 0)) {
        return { error: 'Enter the amount.' };
    }
    ['units', 'price', 'amount', 'charges', 'ratio'].forEach((k) => {
        t[k] = t[k] === '' || t[k] === undefined || t[k] === null ? null : Number(t[k]);
    });
    return { txn: t };
}

// ---------- the whole portfolio ----------
/** Holdings with their figures, plus totals, allocation, upcoming SIPs and maturities, yearly gains and XIRR. */
export function portfolio(data, today, yearOf) {
    const invs = data.investments || [];
    const txns = data.invTxns || [];
    const rows = invs.map((inv) => ({ ...inv, ...holding(inv, txns, today), statusSet: inv.status }));
    const active = rows.filter((r) => r.status === 'Active');
    const sum = (list, k) => list.reduce((s, x) => s + num(x[k]), 0);
    const value = sum(active, 'value');
    const invested = sum(active, 'invested');
    const slice = (key) => {
        const m = {};
        active.forEach((r) => {
            const k = key(r) || 'Not set';
            m[k] = m[k] || { label: k, value: 0, invested: 0 };
            m[k].value += r.value;
            m[k].invested += r.invested;
        });
        return Object.values(m).sort((a, b) => b.value - a.value).map((x) => ({ ...x, pct: value > 0 ? round1((x.value / value) * 100) : 0 }));
    };
    const flows = [];
    const years = {};
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    txns.filter((t) => t.status !== 'pending').forEach((t) => {
        const r = byId[t.investmentId];
        if (!r || r.statusSet === 'Watchlist') {
            return;
        }
        const f = cashFlow(t);
        if (f !== null) {
            flows.push({ amount: f, date: t.date });
        }
        const fy = yearOf ? yearOf(t.date) : t.date.slice(0, 4);
        const y = (years[fy] = years[fy] || { year: fy, shortTerm: 0, longTerm: 0, income: 0, invested: 0, withdrawn: 0 });
        const g = r.gains[t.id];
        if (g) {
            if (g.term === 'Long term') {
                y.longTerm += g.gain;
            } else {
                y.shortTerm += g.gain;
            }
        }
        if (PAYOUTS.includes(t.kind)) {
            y.income += num(t.amount);
        } else if (f !== null && f < 0) {
            y.invested -= f;
        } else if (f !== null && f > 0) {
            y.withdrawn += f;
        }
    });
    if (value > 0) {
        flows.push({ amount: value, date: today });
    }
    const firstFlow = flows.reduce((m, f) => (!m || f.date < m ? f.date : m), null);
    const sips = (data.sips || []).map((s) => ({ ...s, monthly: monthlyEquivalent(s), investmentName: (byId[s.investmentId] || {}).name || '' }));
    const upcoming = [];
    const horizon = isoPlusDays(today, 30);
    sips.filter((s) => s.status === 'Active').forEach((s) => {
        let d = s.nextDue;
        let n = 0;
        while (d && d <= horizon && n++ < 6 && !(s.endDate && d > s.endDate)) {
            upcoming.push({ date: d, what: 'SIP', name: s.investmentName, amount: num(s.amount), id: s.id });
            d = nextDue(d, s.frequency, s.day);
        }
    });
    active.forEach((r) => {
        if (r.maturityDate && r.maturityDate >= today && r.maturityDate <= isoPlusDays(today, 120)) {
            upcoming.push({ date: r.maturityDate, what: 'Matures', name: r.name, amount: r.maturityAmount || r.value, id: r.id });
        }
    });
    upcoming.sort((a, b) => (a.date < b.date ? -1 : 1));
    return {
        rows, active, value: round2(value), invested: round2(invested), gain: round2(value - invested),
        gainPct: invested > 0 ? round2(((value - invested) / invested) * 100) : 0,
        dayChange: round2(sum(active, 'dayChange')), totalGain: round2(rows.filter((r) => r.statusSet !== 'Watchlist').reduce((s, r) => s + r.totalGain, 0)),
        xirr: firstFlow && daysBetween(firstFlow, today) >= 30 ? xirr(flows) : null,
        byClass: slice((r) => r.assetClass), byType: slice((r) => r.type), byPlatform: slice((r) => r.platform),
        sips, sipPerMonth: sips.filter((s) => s.status === 'Active').reduce((s, x) => s + x.monthly, 0),
        pending: txns.filter((t) => t.status === 'pending'), upcoming,
        years: Object.values(years).sort((a, b) => (a.year < b.year ? 1 : -1))
    };
}
const round1 = (v) => Math.round(v * 10) / 10;

/** Goals with their value (linked active investments), progress and the monthly investment needed. */
export function goalRows(data, rows, today) {
    return (data.goals || []).map((g) => {
        const linked = rows.filter((r) => r.goalId === g.id && r.status === 'Active');
        const value = linked.reduce((s, r) => s + r.value, 0);
        const sipPerMonth = (data.sips || []).filter((s) => s.status === 'Active' && linked.some((r) => r.id === s.investmentId)).reduce((s, x) => s + monthlyEquivalent(x), 0);
        const needed = monthlyNeeded(g.target, value, g.targetDate, g.expectedReturn ?? 12, today);
        return { ...g, value: round2(value), linked: linked.length, progress: num(g.target) > 0 ? Math.min(100, round1((value / num(g.target)) * 100)) : 0, needed, sipPerMonth, onTrack: !needed || sipPerMonth >= needed };
    });
}

// ---------- calculators ----------
export function sipFuture(monthly, years, ratePct, stepUpPct) {
    const r = Math.pow(1 + num(ratePct) / 100, 1 / 12) - 1;
    let value = 0;
    let invested = 0;
    let amount = num(monthly);
    for (let m = 1; m <= num(years) * 12; m++) {
        value = (value + amount) * (1 + r);
        invested += amount;
        if (m % 12 === 0) {
            amount *= 1 + num(stepUpPct) / 100;
        }
    }
    return { value, invested };
}
export function goalPlan(target, years, ratePct) {
    const n = num(years) * 12;
    const r = Math.pow(1 + num(ratePct) / 100, 1 / 12) - 1;
    const monthly = n > 0 ? (r === 0 ? num(target) / n : (num(target) * r) / ((Math.pow(1 + r, n) - 1) * (1 + r))) : 0;
    return { monthly, lump: num(target) / Math.pow(1 + num(ratePct) / 100, num(years)) };
}
