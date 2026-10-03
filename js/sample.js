// Made-up history for trying the Money tool: salary, rent, bills, shopping, card payments, lending and budgets
// from 1 March 2025 to today. Everything it creates has an id starting with "sample-" (budgets carry sample: true),
// so it can be removed again without touching the user's own entries. The same input always gives the same data.
import { addMonths, addMonthsToDate, impliedRate, monthEnd, monthKey } from './logic.js';

export const SAMPLE_START = '2025-03-01';
const PREFIX = 'sample-';

// Rough size of everyday amounts in each currency, so the figures look natural (1 = dollars / euros / pounds).
const SCALE = { INR: 25, PKR: 90, BDT: 35, LKR: 100, NPR: 40, JPY: 150, KRW: 1300, IDR: 15000, VND: 25000, PHP: 55, THB: 35,
    AED: 3.7, SAR: 3.75, QAR: 3.6, MYR: 4.5, CNY: 7, ZAR: 18, MXN: 18, BRL: 5, TRY: 30, RUB: 90, NGN: 1500, KES: 130, EGP: 50 };

/** Small repeatable random generator (same seed, same numbers). */
function generator(seed) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function isSample(doc) {
    return String(doc.id).startsWith(PREFIX) || doc.sample === true;
}

/** [collection, doc] pairs to save. `data` is the user's current data (their categories and Cash account are reused). */
export function buildSample(data, today, currency) {
    const rnd = generator(20250301);
    const scale = SCALE[currency] || 1;
    const step = scale >= 1000 ? 1000 : scale >= 20 ? 10 : 1;
    const amt = (base, spread = 0) => Math.max(step, Math.round((base * (1 + (rnd() * 2 - 1) * spread) * scale) / step) * step);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const pairs = [];

    // ---------- accounts ----------
    const acc = (key, name, kind, extra) => {
        const doc = { id: `${PREFIX}acc-${key}`, name, kind, opening: 0, openingDate: SAMPLE_START, limit: null, dueDay: null, last4: '', isDefault: false, active: true, ...extra };
        pairs.push(['accounts', doc]);
        return doc.id;
    };
    const bank = acc('bank', 'Main Bank (sample)', 'bank', { opening: amt(2500), last4: '4821' });
    const savings = acc('savings', 'Savings (sample)', 'bank', { opening: amt(5000), last4: '7730' });
    const wallet = acc('wallet', 'Wallet (sample)', 'wallet', { opening: amt(120) });
    const card = acc('card', 'Credit Card (sample)', 'card', { limit: amt(4000), dueDay: 15, last4: '1109' });
    const cashAccount = data.accounts.find((a) => a.kind === 'cash' && a.active !== false);
    const cash = cashAccount ? cashAccount.id : acc('cash', 'Cash (sample)', 'cash');

    // ---------- categories (the user's own, found by name) ----------
    const fallback = (type) => (data.categories.find((c) => c.type === type && /misc|other/i.test(c.name)) || data.categories.find((c) => c.type === type) || {}).id || null;
    const cat = (type, ...names) => {
        for (const n of names) {
            const hit = data.categories.find((c) => c.type === type && c.name.toLowerCase() === n.toLowerCase());
            if (hit) {
                return hit.id;
            }
        }
        return fallback(type);
    };
    const C = {
        food: cat('expense', 'Food & Dining'),
        groceries: cat('expense', 'Groceries & Household'),
        fuel: cat('expense', 'Vehicle - Fuel'),
        vehicle: cat('expense', 'Vehicle - Service & Upkeep'),
        loan: cat('expense', 'Loan & Instalment Payments', 'EMI & Loan Payments'),
        housing: cat('expense', 'Housing & Society'),
        utilities: cat('expense', 'Utilities & Recharge'),
        subs: cat('expense', 'Subscriptions'),
        family: cat('expense', 'Family Support'),
        health: cat('expense', 'Health & Fitness'),
        care: cat('expense', 'Personal Care'),
        shopping: cat('expense', 'Shopping & Clothing'),
        travel: cat('expense', 'Travel & Transport'),
        fun: cat('expense', 'Entertainment & Gifts'),
        giving: cat('expense', 'Donations & Charity', 'Religious & Donations'),
        fees: cat('expense', 'Fees & Charges'),
        salary: cat('income', 'Salary'),
        freelance: cat('income', 'Freelancing'),
        interest: cat('income', 'Interest'),
        refunds: cat('income', 'Gifts, Cashback & Refunds')
    };

    // ---------- people ----------
    const person = (key, name, direction, extra) => {
        const doc = { id: `${PREFIX}person-${key}`, name, direction, opening: 0, status: 'Active', phone: '', notes: '', ...extra };
        pairs.push(['people', doc]);
        return doc.id;
    };
    const alex = person('alex', 'Alex (sample)', 'owesMe', { notes: 'Colleague. Pays back in parts.' });
    const sam = person('sam', 'Sam (sample)', 'owesMe', { status: 'Bad Debt', notes: 'Moved away; not expected back.' });
    const jordan = person('jordan', 'Jordan (sample)', 'iOwe', { notes: 'Helped with the deposit.' });

    // ---------- entries ----------
    let n = 0;
    let cardOwed = 0;
    let stamp = Date.parse(`${SAMPLE_START}T08:00:00Z`);
    const add = (date, type, amount, description, accountId, extra = {}) => {
        if (date > today) {
            return;
        }
        n += 1;
        stamp += 60000;
        if (type === 'expense' && accountId === card) {
            cardOwed += amount;
        }
        pairs.push(['entries', { id: `${PREFIX}entry-${String(n).padStart(4, '0')}`, type, amount, date, description, accountId, toAccountId: null, categoryId: null, personId: null, notes: '', createdAt: stamp, ...extra }]);
    };
    const spend = (date, base, spread, description, accountId, categoryId) => add(date, 'expense', amt(base, spread), description, accountId, { categoryId });

    const GROCERS = ['Weekly groceries', 'Supermarket run', 'Fruit and vegetables', 'Household supplies'];
    const MEALS = ['Lunch with team', 'Dinner out', 'Coffee and snacks', 'Takeaway dinner', 'Breakfast cafe', 'Pizza night'];
    const SHOPS = ['New shoes', 'Shirt and jeans', 'Phone cover', 'Headphones', 'Kitchen items', 'Online order'];
    const FUN = ['Movie tickets', 'Birthday gift', 'Concert tickets', 'Board game night'];
    const TRIPS = ['Train tickets', 'Taxi to airport', 'Weekend bus trip', 'Hotel for two nights'];

    // ---------- assets and loans ----------
    // A car on a 42-month loan with interest, a laptop on a 6-month no-cost EMI, and gold bought outright.
    const loan = (key, name, lender, price, down, emi, months, firstDate, boughtOn) => {
        const financed = price - down;
        const doc = { id: `${PREFIX}loan-${key}`, name, lender, price, downPayment: down, financed, emi, months, firstDate, rate: impliedRate(financed, emi, months), rateCalculated: true,
            accountId: bank, categoryId: null, boughtOn, assetId: `${PREFIX}asset-${key}`, createdAt: stamp };
        pairs.push(['loans', doc]);
        return doc;
    };
    const asset = (key, name, type, price, value, boughtOn, loanId) =>
        pairs.push(['assets', { id: `${PREFIX}asset-${key}`, name, type, price, value, boughtOn, loanId, status: 'Owned', createdAt: stamp }]);
    const carDown = amt(1500);
    const car = loan('car', 'Car (sample)', 'City Auto Finance', amt(8000), carDown, amt(180), 42, '2025-06-10', '2025-06-01');
    asset('car', 'Car (sample)', 'Vehicle', car.price, amt(7000), '2025-06-01', car.id);
    add('2025-06-01', 'asset', carDown, 'Car (sample) – down payment', savings, { loanDown: car.id, assetId: car.assetId });
    const laptopEmi = amt(200);
    const laptop = loan('laptop', 'Laptop (sample)', 'Store no-cost EMI', laptopEmi * 6, 0, laptopEmi, 6, '2026-06-12', '2026-06-02');
    asset('laptop', 'Laptop (sample)', 'Electronics', laptop.price, amt(1000), '2026-06-02', laptop.id);
    asset('gold', 'Gold coins (sample)', 'Gold & Jewellery', amt(2000), amt(2600), '2025-10-20', null);
    add('2025-10-20', 'asset', amt(2000), 'Gold coins (sample)', savings, { assetId: `${PREFIX}asset-gold` });
    const payEmi = (l) => {
        for (let k = 0; k < l.months; k += 1) {
            const date = addMonthsToDate(l.firstDate, k);
            if (date > today) {
                break;
            }
            add(date, 'expense', l.emi, `${l.name} – EMI ${k + 1} of ${l.months}`, bank, { categoryId: C.loan, loanId: l.id });
        }
    };
    payEmi(car);
    payEmi(laptop);

    for (let key = monthKey(SAMPLE_START), i = 0; key <= monthKey(today); key = addMonths(key, 1), i += 1) {
        const lastDay = Number(monthEnd(key).slice(8));
        const day = (d) => `${key}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
        const month = Number(key.slice(5));
        const raise = key >= '2026-04' ? 1.08 : 1;

        add(day(1), 'income', amt(3400 * raise), 'Salary', bank, { categoryId: C.salary });
        spend(day(2), 900, 0, 'House rent', bank, C.housing);
        add(day(3), 'transfer', amt(400), 'Monthly saving', bank, { toAccountId: savings });
        add(day(1), 'transfer', amt(i === 0 ? 500 : 170), 'Cash withdrawal', bank, { toAccountId: cash }); // a cushion in the first month
        add(day(1), 'transfer', amt(62), 'Wallet top-up', bank, { toAccountId: wallet });
        spend(day(5), 75, 0.25, 'Electricity bill', bank, C.utilities);
        spend(day(6), 30, 0, 'Internet bill', bank, C.utilities);
        spend(day(7), 12, 0, 'Music and video subscription', card, C.subs);
        spend(day(9), 22, 0.1, 'Mobile recharge', wallet, C.utilities);
        spend(day(8), 150, 0, 'Sent to parents', bank, C.family);

        // paying last month's card bill in full
        if (i > 0 && cardOwed > 0 && day(15) <= today) {
            add(day(15), 'transfer', cardOwed, 'Card bill paid in full – Credit Card (sample)', bank, { toAccountId: card });
            cardOwed = 0;
        }

        for (const d of [3, 10, 17, 24, 29]) {
            if (d <= lastDay) {
                spend(day(d), 95, 0.3, pick(GROCERS), rnd() < 0.85 ? card : cash, C.groceries);
            }
        }
        for (const d of [6, 16, 26]) {
            spend(day(d), 42, 0.2, 'Fuel', card, C.fuel);
        }
        const meals = 6 + Math.floor(rnd() * 4);
        for (let m = 0; m < meals; m += 1) {
            spend(day(2 + Math.floor(rnd() * 26)), 18, 0.6, pick(MEALS), pick([card, card, cash, wallet]), C.food);
        }
        spend(day(12 + Math.floor(rnd() * 6)), 25, 0.3, 'Haircut', cash, C.care);
        if (rnd() < 0.75) {
            spend(day(11 + Math.floor(rnd() * 15)), 110, 0.6, pick(SHOPS), card, C.shopping);
        }
        if (rnd() < 0.6) {
            spend(day(13 + Math.floor(rnd() * 14)), 35, 0.5, pick(FUN), pick([card, wallet]), C.fun);
        }
        if (rnd() < 0.35) {
            spend(day(8 + Math.floor(rnd() * 18)), 45, 0.5, 'Pharmacy', cash, C.health);
        }
        if (month % 3 === 0) {
            spend(day(20), 60, 0, 'Gym – three months', card, C.health);
            add(day(28), 'income', amt(38, 0.15), 'Savings interest', savings, { categoryId: C.interest });
        }
        if (month % 4 === 1) {
            spend(day(22), 130, 0.2, 'Car service', card, C.vehicle);
        }
        if ([5, 10, 12].includes(month)) {
            spend(day(19), 260, 0.3, pick(TRIPS), card, C.travel);
        }
        if ([11, 12].includes(month)) {
            spend(day(21), 180, 0.3, 'Festival shopping and gifts', card, C.fun);
        }
        if (rnd() < 0.3) {
            spend(day(14), 20, 0.4, 'Donation', cash, C.giving);
        }
        if (rnd() < 0.4) {
            add(day(18 + Math.floor(rnd() * 8)), 'income', amt(450, 0.4), 'Freelance project', bank, { categoryId: C.freelance });
        }
        if (rnd() < 0.15) {
            add(day(23), 'income', amt(25, 0.4), 'Cashback', bank, { categoryId: C.refunds });
        }
        if (month === 1) {
            spend(day(9), 15, 0, 'Bank yearly charges', bank, C.fees);
        }

        // people
        if (key === '2025-05') {
            add(day(12), 'lent', amt(300), 'Lent to Alex for a deposit', bank, { personId: alex });
        }
        if (key === '2025-07' || key === '2025-09') {
            add(day(20), 'gotback', amt(100), 'Alex paid back part', bank, { personId: alex });
        }
        if (key === '2025-12') {
            add(day(6), 'lent', amt(150), 'Lent to Sam', bank, { personId: sam });
        }
        if (key === '2026-02') {
            add(day(9), 'borrowed', amt(500), 'Borrowed from Jordan', bank, { personId: jordan });
        }
        if (key === '2026-04' || key === '2026-06') {
            add(day(25), 'repaid', amt(200), 'Paid Jordan back part', bank, { personId: jordan });
        }

        // budget, only where the user has none of their own
        if (!data.budgets.some((b) => b.id === key && !b.sample)) {
            const lines = {};
            const plan = { groceries: 500, food: 170, fuel: 130, housing: 900, utilities: 140, subs: 15, family: 150, shopping: 120, fun: 60, care: 30, health: 40, loan: (key >= '2025-06' ? 180 : 0) + (key >= '2026-06' && key <= '2026-11' ? 200 : 0) };
            for (const [k, v] of Object.entries(plan)) {
                if (v && C[k]) {
                    lines[C[k]] = amt(v);
                }
            }
            pairs.push(['budgets', { id: key, lines, sample: true }]);
        }
    }
    // ---------- renewal reminders, dated from today so some are always due ----------
    const inDays = (n) => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const reminder = (key, name, kind, days, repeat, amount, remindDays, notes = '') =>
        pairs.push(['reminders', { id: `${PREFIX}rem-${key}`, name, kind, due: inDays(days), repeat, amount, remindDays, notes, accountId: bank, done: false, createdAt: stamp }]);
    reminder('health', 'Health insurance (sample)', 'Insurance', -3, 12, amt(420), 30, 'Policy no. HI-000123');
    reminder('stream', 'Streaming plan (sample)', 'Subscription', 4, 1, amt(8), 7);
    reminder('car-ins', 'Car insurance (sample)', 'Insurance', 12, 12, amt(260), 30, 'Policy no. MV-000456');
    reminder('phone', 'Phone plan (sample)', 'Subscription', 21, 3, amt(30), 7);
    reminder('service', 'Car service (sample)', 'Vehicle', 48, 6, amt(90), 15);
    reminder('passport', 'Passport renewal (sample)', 'Document', 140, 120, amt(60), 90, 'Book the appointment early');
    reminder('warranty', 'Laptop warranty ends (sample)', 'Warranty', 260, 0, 0, 30);
    return pairs;
}

/** [collection, id] pairs of everything the sample created. */
export function sampleDocs(data) {
    const out = [];
    for (const c of ['entries', 'people', 'accounts', 'budgets', 'loans', 'assets', 'reminders']) {
        for (const doc of data[c]) {
            if (isSample(doc)) {
                out.push([c, doc.id]);
            }
        }
    }
    return out;
}
