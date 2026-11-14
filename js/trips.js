// Trips: pure calculations (no screen, no storage), the same rules as Salesforce's Trips.
// A trip has dates and members (people who owe you). A shared trip expense is split equally between the people
// who shared it: your share is an expense (category, budget, spending), each other person's share is money lent to
// them, so it shows in People & Loans as money they owe you. All entries of one shared expense carry the same splitKey.

const num = (v) => Number(v) || 0;

/** Upcoming, Ongoing or Completed on a date (YYYY-MM-DD). */
export function tripStatus(trip, today) {
    if (today < trip.start) {
        return 'Upcoming';
    }
    return today > trip.end ? 'Completed' : 'Ongoing';
}

/** Days from the first to the last day of the trip, both counted. */
export function tripDays(trip) {
    if (!trip.start || !trip.end) {
        return 0;
    }
    return Math.round((Date.parse(`${trip.end}T00:00:00Z`) - Date.parse(`${trip.start}T00:00:00Z`)) / 86400000) + 1;
}

/**
 * Splits an amount equally. Returns { count, each, mine, others: [{ personId, amount }] }.
 * Cents left over from rounding go to your share, or to the first person when you did not share it.
 */
export function splitShares(amount, personIds, includeMe) {
    const people = [...new Set((personIds || []).filter(Boolean))];
    const count = people.length + (includeMe ? 1 : 0);
    if (!count || !(num(amount) > 0)) {
        return { count, each: 0, mine: 0, others: [] };
    }
    const cents = Math.round(num(amount) * 100);
    const eachCents = Math.floor(cents / count);
    let extra = cents - eachCents * count;
    let mine = 0;
    if (includeMe) {
        mine = (eachCents + extra) / 100;
        extra = 0;
    }
    const others = people.map((personId) => {
        const amt = (eachCents + extra) / 100;
        extra = 0;
        return { personId, amount: amt };
    });
    return { count, each: eachCents / 100, mine, others };
}

/**
 * The entries for one shared trip expense. base: the fields every entry shares (date, accountId, notes, createdAt...).
 * ids: a function giving a new id. Returns [] when nobody shares it.
 */
export function tripEntries({ base, amount, description, categoryId, tripId, personIds, includeMe, names, ids, splitKey, paidBy }) {
    if (paidBy) {
        // a member paid: only your share is yours to record, as an expense they paid for you (no account)
        // shared by you and the people ticked (the payer too, when ticked); nobody ticked = it was for you only
        const n = 1 + new Set((personIds || []).filter(Boolean)).size;
        const share = Math.round((Number(amount) / n) * 100) / 100;
        const what = String(description || '').trim() || 'Trip expense';
        return [{ ...base, id: ids(), type: 'expense', amount: share, description: what, categoryId, personId: null, accountId: null, paidBy,
            tripId, splitKey, billAmount: Number(amount) || 0, shareCount: n }];
    }
    const s = splitShares(amount, personIds, includeMe);
    if (!s.count) {
        return [];
    }
    const what = String(description || '').trim() || 'Trip expense';
    const common = { ...base, tripId, splitKey, billAmount: num(amount), shareCount: s.count };
    const out = [];
    if (includeMe) {
        out.push({ ...common, id: ids(), type: 'expense', amount: s.mine, description: what, categoryId, personId: null });
    }
    for (const o of s.others) {
        out.push({ ...common, id: ids(), type: 'lent', amount: o.amount, description: `${what} (${names[o.personId] || 'their'} share)`.slice(0, 255), categoryId: null, personId: o.personId });
    }
    return out;
}

/** A trip's figures: totals, each member's balance and its shared expenses (newest first). */
export function tripSummary(trip, entries, people, today) {
    const nameOf = (id) => (people.find((p) => p.id === id) || {}).name || 'Someone';
    const members = new Map((trip.members || []).map((id) => [id, { personId: id, name: nameOf(id), shared: 0, settled: 0, paidForMe: 0, owes: 0 }]));
    const bills = new Map();
    let myShare = 0;
    let paidForMe = 0;
    let lent = 0;
    let received = 0;
    const mine = entries.filter((e) => e.tripId === trip.id).sort((a, b) => (a.date === b.date ? num(b.createdAt) - num(a.createdAt) : a.date < b.date ? 1 : -1));
    for (const e of mine) {
        const amt = num(e.amount);
        for (const pid of [e.personId, e.paidBy]) {
            if (pid && !members.has(pid)) {
                members.set(pid, { personId: pid, name: nameOf(pid), shared: 0, settled: 0, paidForMe: 0, owes: 0 });
            }
        }
        if (e.type === 'expense') {
            myShare += amt;
            if (e.paidBy) {
                members.get(e.paidBy).paidForMe += amt;
                paidForMe += amt;
            }
        } else if (e.type === 'lent') {
            lent += amt;
            members.get(e.personId).shared += amt;
        } else if (e.type === 'gotback') {
            received += amt;
            members.get(e.personId).settled += amt;
        }
        if (!e.splitKey) {
            continue;
        }
        let b = bills.get(e.splitKey);
        if (!b) {
            b = { key: e.splitKey, date: e.date, bill: num(e.billAmount), shareCount: num(e.shareCount), accountId: e.accountId, paidBy: e.paidBy || null, paidByName: e.paidBy ? nameOf(e.paidBy) : null, description: null, categoryId: null, includesMe: false, myShare: 0, sharedWith: [], entryIds: [] };
            bills.set(e.splitKey, b);
        }
        b.entryIds.push(e.id);
        if (e.type === 'expense') {
            b.includesMe = true;
            b.myShare += amt;
            b.description = e.description;
            b.categoryId = e.categoryId;
        } else if (e.type === 'lent') {
            b.sharedWith.push(nameOf(e.personId));
            if (!b.description) {
                b.description = String(e.description).replace(/ \([^()]* share\)$/, '');
            }
        }
    }
    const list = [...members.values()].map((m) => ({ ...m, owes: Math.round((m.shared - m.settled - m.paidForMe) * 100) / 100 }));
    const billsTotal = [...bills.values()].reduce((x, b) => x + b.bill, 0);
    return {
        status: tripStatus(trip, today),
        days: tripDays(trip),
        totalSpent: billsTotal || myShare + lent,
        myShare,
        paidForMe,
        owedToMe: Math.round((lent - received - paidForMe) * 100) / 100,
        expenseCount: bills.size,
        members: list,
        expenses: [...bills.values()]
    };
}

/** The trip for Home: the ongoing one, else the soonest upcoming one, else the latest completed one still owed for. */
export function homeTrip(trips, entries, people, today) {
    const rows = trips.map((t) => ({ trip: t, sum: tripSummary(t, entries, people, today) }));
    const ongoing = rows.filter((r) => r.sum.status === 'Ongoing').sort((a, b) => (a.trip.start < b.trip.start ? 1 : -1))[0];
    if (ongoing) {
        return ongoing;
    }
    const upcoming = rows.filter((r) => r.sum.status === 'Upcoming').sort((a, b) => (a.trip.start < b.trip.start ? -1 : 1))[0];
    if (upcoming) {
        return upcoming;
    }
    return rows.filter((r) => r.sum.status === 'Completed' && r.sum.owedToMe > 0).sort((a, b) => (a.trip.end < b.trip.end ? 1 : -1))[0] || null;
}
