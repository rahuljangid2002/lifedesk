// Assistant: a check-up of all the money (spending and budget, saving, debt and cards, investments, bills and people)
// with a score for each area, suggestions sorted by importance and answers to questions matched by their words.
// Pure rules over the user's own data, in the browser: no AI and nothing sent anywhere. The same rules as Salesforce's
// Assistant tab. General guidance, not regulated financial advice.
import * as L from './logic.js';
import * as I from './invest.js';

export const AREAS = ['Spending', 'Saving', 'Debt & cards', 'Investments', 'Bills & people'];
export const QUESTIONS = {
    Overall: ['Give me a complete summary', 'What should I do this month?'],
    Spending: ['Where is my money going?', 'Am I within budget?'],
    Saving: ['How much am I saving?', 'How is my net worth changing?'],
    'Debt & cards': ['Should I prepay loans or invest?', 'Are my EMIs too high?'],
    Investments: ['Is my portfolio too risky?', 'Which investments are doing best and worst?', 'Am I investing enough?', 'What about tax on my gains?'],
    'Bills & people': ['Which bills are due?', 'Who owes me money?']
};

const num = (v) => Number(v) || 0;
const pct = (part, whole) => (num(whole) === 0 ? 0 : Math.round((num(part) / num(whole)) * 1000) / 10);
const whole = (v) => String(Math.round(num(v)));
const signed = (v) => `${num(v) >= 0 ? '+' : ''}${num(v).toFixed(1)}%`;
const m$ = (v) => L.money(v);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A suggestion. link: a screen of the app (route), tab: a tab of the Investments screen. */
function tip(key, area, tone, title, detail, link, priority, tab = null) {
    return { key, area, tone, title, detail, link, tab, priority };
}
const sortTips = (tips) => tips.sort((a, b) => a.priority - b.priority);

// ---------------------------------------------------------------- facts
/** What the rules look at. ctx: { yearOf, netWorth } from the app. */
export function facts(data, today, ctx = {}) {
    const key = L.monthKey(today);
    const f = { today, key };
    const month = L.monthSummary(data, key);
    const flows = L.monthFlows(data, key);
    f.month = { income: month.income, expense: month.expense, invested: flows.invested };
    f.totals = L.totals(data);
    // the last three months that have entries
    const seen = [1, 2, 3].map((n) => L.addMonths(key, -n)).filter((k) => data.entries.some((e) => L.monthKey(e.date) === k));
    f.monthsSeen = seen.length;
    let inc = 0;
    let exp = 0;
    let inv = 0;
    seen.forEach((k) => {
        const s = L.monthSummary(data, k);
        inc += s.income;
        exp += s.expense;
        inv += L.monthFlows(data, k).invested;
    });
    f.avgIncome = seen.length ? Math.round(inc / seen.length) : 0;
    f.avgExpense = seen.length ? Math.round(exp / seen.length) : 0;
    f.avgInvested = seen.length ? Math.round(inv / seen.length) : 0;
    f.savingsRate = seen.length && inc > 0 ? Math.round(((inc - exp) / inc) * 1000) / 10 : null;
    f.lastMonthExpense = seen.includes(L.addMonths(key, -1)) ? L.monthSummary(data, L.addMonths(key, -1)).expense : 0;
    // net worth at the last two month-ends (bank, cash, cards and people at that date; today's assets, investments and loans)
    const now = ctx.netWorth ? ctx.netWorth(data, today) : { assets: 0, investments: 0, loans: 0 };
    const at = (k) => {
        const t = L.totals(data, L.monthEnd(k));
        return Math.round((t.net + t.toReceive + num(now.assets) + num(now.investments) - num(now.loans)) * 100) / 100;
    };
    f.netWorthNow = seen.includes(L.addMonths(key, -1)) ? at(L.addMonths(key, -1)) : null;
    f.netWorthBefore = f.netWorthNow !== null && seen.includes(L.addMonths(key, -2)) ? at(L.addMonths(key, -2)) : null;
    // budget and categories
    const rows = L.budgetRows(data, key);
    f.budgetPlanned = rows.reduce((s, r) => s + r.planned, 0);
    f.budgetSpent = rows.reduce((s, r) => s + (r.planned > 0 ? r.spent : 0), 0);
    f.lines = rows.filter((r) => r.planned > 0).sort((a, b) => b.spent - a.spent);
    f.catNow = {};
    f.catAvg = {};
    rows.forEach((r) => {
        if (r.spent > 0) {
            f.catNow[r.name] = r.spent;
        }
        if (r.average > 0) {
            f.catAvg[r.name] = r.average;
        }
    });
    // bills and EMIs due this month
    f.due = L.billsDue(data, key, today).map((b) => ({ description: b.bill.description, amount: num(b.bill.amount), date: b.date }));
    const loans = (data.loans || []).map((l) => ({ ...l, ...L.loanStatus(l, data.entries, today) }));
    loans.forEach((l) => l.due.forEach((d) => f.due.push({ description: `${l.name} EMI ${d.number}`, amount: num(l.emi), date: d.date })));
    f.due.sort((a, b) => (a.date < b.date ? -1 : 1));
    f.dueAmount = f.due.reduce((s, d) => s + d.amount, 0);
    f.monthlyEmi = loans.filter((l) => l.left > 0).reduce((s, l) => s + num(l.emi), 0);
    f.loansOutstanding = loans.reduce((s, l) => s + num(l.outstanding), 0);
    f.costlyLoans = loans
        .filter((l) => l.left > 0)
        .map((l) => ({ name: l.name, rate: num(l.rate) || L.impliedRate(num(l.financed), num(l.emi), num(l.months)), outstanding: l.principalLeft }))
        .filter((l) => l.rate >= 10 && l.outstanding > 0)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 5);
    // renewals
    f.renewals = (data.reminders || [])
        .map((r) => ({ r, ...L.reminderStatus(r, today) }))
        .filter((x) => x.state === 'overdue' || x.state === 'soon')
        .sort((a, b) => a.days - b.days)
        .map((x) => ({ name: x.r.name, days: x.days, words: x.days < 0 ? `${plural(-x.days, 'day')} overdue` : x.days === 0 ? 'due today' : `due in ${plural(x.days, 'day')}` }));
    // people
    const people = data.people.map((p) => ({ ...p, out: L.personOutstanding(p, data.entries) }));
    f.followUpsDue = people.filter((p) => p.direction === 'owesMe' && (p.status || 'Active') === 'Active' && p.followUp && p.followUp <= today && p.out > 0).length;
    f.badDebts = people.filter((p) => p.direction === 'owesMe' && p.status === 'Bad Debt').reduce((s, p) => s + Math.max(0, p.out), 0);
    // investments
    const port = I.portfolio(data, today, ctx.yearOf);
    const real = port.active.filter((h) => !String(h.id).startsWith('sample-'));
    f.holdings = real.length ? real : port.active;
    f.samplesOnly = !real.length && port.active.length > 0;
    f.port = port;
    f.value = f.holdings.reduce((s, h) => s + num(h.value), 0);
    f.invested = f.holdings.reduce((s, h) => s + num(h.invested), 0);
    const byClass = {};
    f.holdings.forEach((h) => {
        const c = h.assetClass || 'Other';
        byClass[c] = (byClass[c] || 0) + num(h.value);
    });
    f.equityPct = f.value > 0 ? pct(num(byClass.Equity) + num(byClass.Hybrid) / 2, f.value) : 0;
    f.debtPct = f.value > 0 ? pct(num(byClass.Debt) + num(byClass.Cash) + num(byClass.Hybrid) / 2, f.value) : 0;
    f.goldPct = f.value > 0 ? pct(num(byClass.Gold), f.value) : 0;
    const sips = port.sips.filter((s) => s.status === 'Active');
    f.activeSips = sips.length;
    f.sipPerMonth = sips.reduce((s, x) => s + num(x.monthly), 0);
    f.sipsWithoutStepUp = sips.filter((s) => !num(s.stepUpPct) && !num(s.stepUpAmount)).length;
    f.goals = I.goalRows(data, port.rows, today);
    f.cash = f.totals.inHand;
    f.cardOwed = f.totals.cardOwed;
    return f;
}

// ---------------------------------------------------------------- investment rules
function investmentRules(f) {
    const tips = [];
    const add = (key, tone, title, detail, tab, priority) => tips.push(tip(key, 'Investments', tone, title, detail, tab === 'pay' || tab === 'people' ? tab : tab ? 'invest' : null, priority, tab === 'pay' || tab === 'people' ? null : tab));
    // cash first: the card, the emergency fund, costly loans
    if (f.cardOwed > 0) {
        add('card', 'risk', 'Clear the credit card first', `${m$(f.cardOwed)} is owed on cards. Card interest (often 30-40% a year) is far more than any investment earns, so pay it in full before investing more.`, 'pay', 1);
    }
    if (f.avgExpense > 0) {
        const months = Math.round((f.cash / f.avgExpense) * 10) / 10;
        if (months < 3) {
            add('emergency', 'risk', 'Build an emergency fund', `Bank and cash cover ${months} months of spending (${m$(f.cash)} against about ${m$(f.avgExpense)} a month). Aim for 6 months (${m$(f.avgExpense * 6)}) in a savings account or liquid fund before adding risk.`, null, 2);
        } else if (months < 6) {
            add('emergency', 'warn', 'Top up the emergency fund', `Bank and cash cover ${months} months of spending. Six months (${m$(f.avgExpense * 6)}) is the usual cushion.`, null, 6);
        } else if (months > 12) {
            add('idle', 'action', 'Put idle money to work', `Bank and cash cover ${months} months of spending. Keeping 6 months (${m$(f.avgExpense * 6)}) aside, about ${m$(f.cash - f.avgExpense * 6)} could go into investments suited to your goals, for example a SIP or a short-term debt fund.`, 'sips', 12);
        } else {
            add('emergency', 'good', 'Emergency fund in place', `Bank and cash cover ${months} months of spending: a healthy cushion.`, null, 40);
        }
    }
    f.costlyLoans.forEach((l) => add(`loan-${l.name}`, l.rate >= 14 ? 'warn' : 'info', `Weigh prepaying ${l.name}`, `${l.name} costs about ${l.rate.toFixed(1)}% a year on ${m$(l.outstanding)}. Prepaying it is a guaranteed return of that rate; it beats most debt investments and is close to long-term equity returns.`, 'people', l.rate >= 14 ? 5 : 20));
    if (!f.holdings.length) {
        return sortTips(tips);
    }
    // risk and mix
    if (f.value > 0) {
        if (f.equityPct >= 85) {
            add('equity-high', 'warn', 'Very equity-heavy', `Equity is ${whole(f.equityPct)}% of the portfolio. That can fall 30-40% in a bad year; money needed within 3 years is safer in debt funds or deposits.`, 'insights', 8);
        } else if (f.equityPct < 25 && f.value >= f.avgExpense * 6 && f.avgExpense > 0) {
            add('equity-low', 'info', 'Little growth exposure', `Equity is only ${whole(f.equityPct)}%. For goals more than 5-7 years away, a larger share in diversified equity funds usually grows more.`, 'insights', 25);
        } else {
            add('mix', 'good', 'Balanced mix', `Equity ${whole(f.equityPct)}%, debt and cash ${whole(f.debtPct)}%: a reasonable spread.`, 'insights', 45);
        }
        f.holdings.forEach((h) => {
            const w = pct(h.value, f.value);
            if (w >= 40 && f.holdings.length > 1) {
                add(`conc-${h.id}`, 'warn', `One holding is ${whole(w)}% of the portfolio`, `${h.name} is ${whole(w)}% of everything. If it falls, the whole portfolio feels it; new money could go elsewhere to spread the risk.`, 'holdings', 9);
            }
        });
    }
    if (f.holdings.length === 1) {
        add('single', 'info', 'Only one holding', `Everything is in ${f.holdings[0].name}. A second, different kind of investment spreads the risk.`, 'holdings', 22);
    }
    // SIPs and how much you invest
    if (!f.activeSips) {
        add('no-sip', 'action', 'Start a SIP', `A monthly SIP invests automatically and evens out market ups and downs.${f.avgIncome > 0 ? ` 10-20% of income (${m$(f.avgIncome * 0.1)}-${m$(f.avgIncome * 0.2)} a month) is a common target.` : ''}`, 'sips', 10);
    } else if (f.sipsWithoutStepUp) {
        add('step-up', 'action', 'Add a yearly step-up', `${plural(f.sipsWithoutStepUp, 'SIP')} ${f.sipsWithoutStepUp === 1 ? 'has' : 'have'} no step-up. Raising them 10% a year, as income grows, makes a large difference over time.`, 'sips', 15);
    }
    if (f.avgIncome > 0) {
        const rate = pct(f.avgInvested, f.avgIncome);
        if (rate < 10) {
            add('rate-low', 'action', 'Invest a little more each month', `Over the last ${plural(f.monthsSeen, 'month')} you invested about ${m$(f.avgInvested)} a month, ${whole(rate)}% of income. Moving towards 15-20% (${m$(f.avgIncome * 0.15)} a month) builds wealth faster.`, 'sips', 14);
        } else if (rate >= 20) {
            add('rate-good', 'good', 'Investing well', `You invested about ${whole(rate)}% of income a month recently. Keep it up.`, null, 42);
        }
    }
    if (f.port.pending.length) {
        add('pending', 'action', 'Confirm SIP instalments', `${plural(f.port.pending.length, 'instalment')} ${f.port.pending.length === 1 ? 'waits' : 'wait'} for units from the statement.`, 'sips', 3);
    }
    // goals
    if (!f.goals.length) {
        add('no-goal', 'info', 'Give your money a goal', "A goal (a house, retirement, a child's education) with a target and a date shows how much to invest each month to get there.", 'goals', 30);
    }
    f.goals.forEach((g) => {
        const need = num(g.needed);
        if (need > num(g.sipPerMonth) && need > 0) {
            add(`goal-${g.id}`, 'warn', `${g.name} is behind`, `${g.name} is ${whole(g.progress)}% there. It needs about ${m$(need)} a month${num(g.sipPerMonth) > 0 ? ` but SIPs give ${m$(g.sipPerMonth)}` : ' and no SIP is linked'}. Raise or link a SIP, or move the target date.`, 'goals', 7);
        } else {
            add(`goal-${g.id}`, 'good', `${g.name} is on track`, `${whole(g.progress)}% of ${m$(g.target)} reached.`, 'goals', 44);
        }
    });
    // performance, what is coming up, tax and upkeep
    const soon = L.addMonthsToDate(f.today, 1);
    f.holdings.forEach((h) => {
        if (h.gainPct !== null && h.gainPct !== undefined && num(h.invested) > 0) {
            const held = h.first ? L.daysBetween(h.first, f.today) : 9999;
            if (h.gainPct <= -15 && held > 365) {
                add(`lag-${h.id}`, 'warn', `Review ${h.name}`, `${h.name} is ${signed(h.gainPct)} after more than a year. Compare it with similar funds or shares before adding more.`, 'holdings', 16);
            } else if (h.gainPct >= 50 && pct(h.value, f.value) >= 20) {
                add(`rebal-${h.id}`, 'info', 'Consider booking some profit', `${h.name} is up ${signed(h.gainPct)} and now ${whole(pct(h.value, f.value))}% of the portfolio. Taking a little off brings the mix back in balance.`, 'holdings', 28);
            }
        }
        if (h.maturityDate && h.maturityDate >= f.today && h.maturityDate <= soon) {
            add(`mat-${h.id}`, 'action', `${h.name} matures ${L.dateText(h.maturityDate, { day: 'numeric', month: 'short' })}`, `Plan where the ${h.maturityAmount ? m$(h.maturityAmount) : 'money'} goes: renew it, or move it towards a goal.`, 'holdings', 4);
        }
        if (h.lockIn && h.lockIn >= f.today && h.lockIn <= soon) {
            add(`lock-${h.id}`, 'info', `${h.name} lock-in ends ${L.dateText(h.lockIn, { day: 'numeric', month: 'short' })}`, 'After that it can be redeemed if needed.', 'holdings', 26);
        }
        if (h.first && num(h.gain) > 0 && (h.assetClass === 'Equity' || h.assetClass === 'Hybrid')) {
            const days = L.daysBetween(h.first, f.today);
            if (days >= 300 && days < 365) {
                add(`ltcg-${h.id}`, 'info', `Wait before selling ${h.name}`, `Its first units turn long-term in ${plural(365 - days, 'day')}. Gains on equity held over a year are often taxed lower than short-term gains.`, 'holdings', 18);
            }
        }
        if (String(h.priceSource || '').toLowerCase() === 'manual' && h.priceDate && L.daysBetween(h.priceDate, f.today) > 60) {
            add(`stale-${h.id}`, 'action', `Update the value of ${h.name}`, `Its value was last typed in on ${L.dateText(h.priceDate, { day: 'numeric', month: 'short', year: 'numeric' })}.`, 'holdings', 24);
        }
        if (!String(h.nominee || '').trim() && f.avgExpense > 0 && num(h.value) >= f.avgExpense * 3) {
            add(`nominee-${h.id}`, 'info', `Add a nominee to ${h.name}`, `No nominee is recorded for this ${m$(h.value)} holding.`, 'holdings', 35);
        }
    });
    return sortTips(tips);
}

// ---------------------------------------------------------------- the rules by area
function allTips(f) {
    const inv = investmentRules(f);
    const out = [];
    // spending
    const spend = [];
    if (!f.budgetPlanned) {
        spend.push(tip('budget-set', 'Spending', 'action', "Set this month's budget", 'There is no budget for this month yet. A quick plan keeps spending on track.', 'budget', 12));
    }
    let over = 0;
    const flagged = new Set();
    f.lines.forEach((b) => {
        const used = pct(b.spent, b.planned);
        if (used > 100) {
            flagged.add(b.name);
        }
        if (used > 100 && over < 3) {
            over += 1;
            spend.push(tip(`over-${b.name}`, 'Spending', 'warn', `${b.name} is over budget`, `${m$(b.spent)} spent against ${m$(b.planned)} planned (${whole(used)}%). See what went in and slow down for the rest of the month.`, 'budget', 8));
        } else if (used >= 90 && used <= 100) {
            spend.push(tip(`near-${b.name}`, 'Spending', 'info', `${b.name} is close to its budget`, `${whole(used)}% used: ${m$(b.planned - b.spent)} left.`, 'budget', 24));
        }
    });
    const day = Number(f.today.slice(8, 10));
    const days = Number(L.monthEnd(f.key).slice(8, 10));
    if (day >= 7 && f.lastMonthExpense > 0) {
        const pace = Math.round((f.month.expense / day) * days);
        if (pace > f.lastMonthExpense * 1.2) {
            spend.push(tip('pace', 'Spending', 'warn', 'Spending faster than last month', `At this pace the month ends near ${m$(pace)}, against ${m$(f.lastMonthExpense)} last month.`, 'daily', 10));
        }
    }
    const usual = f.avgExpense / 20; // a category matters when it is at least 5% of a normal month
    Object.entries(f.catNow).forEach(([cat, now]) => {
        const avg = num(f.catAvg[cat]);
        if (!flagged.has(cat) && avg > 0 && avg >= usual && now > avg * 1.5) {
            spend.push(tip(`jump-${cat}`, 'Spending', 'info', `${cat} is higher than usual`, `${m$(now)} so far this month against about ${m$(avg)} in a normal month.`, 'daily', 26));
        }
    });
    if (!spend.length) {
        spend.push(tip('spend-ok', 'Spending', 'good', 'Spending is on track', 'No category is over its budget.', 'budget', 60));
    }
    out.push(...spend);
    // saving
    if (f.savingsRate !== null) {
        if (f.savingsRate < 0) {
            out.push(tip('saving-neg', 'Saving', 'risk', 'Spending more than you earn', `Over the last ${plural(f.monthsSeen, 'month')} spending was ${m$(f.avgExpense)} a month against ${m$(f.avgIncome)} income. Find the categories to cut first.`, 'daily', 3));
        } else if (f.savingsRate < 10) {
            out.push(tip('saving-low', 'Saving', 'warn', 'Saving very little', `You kept ${f.savingsRate}% of income. 20% or more (${m$(f.avgIncome * 0.2)} a month) gives room to invest and handle surprises.`, 'budget', 9));
        } else if (f.savingsRate < 20) {
            out.push(tip('saving-mid', 'Saving', 'action', 'Push savings towards 20%', `You keep ${f.savingsRate}% of income; another ${m$((f.avgIncome * (20 - f.savingsRate)) / 100)} a month would reach 20%.`, 'budget', 22));
        } else {
            out.push(tip('saving-good', 'Saving', 'good', 'Saving well', `You keep ${f.savingsRate}% of income. Keep it up.`, null, 55));
        }
    }
    if (f.netWorthNow !== null && f.netWorthBefore !== null && f.netWorthNow < f.netWorthBefore) {
        out.push(tip('networth-down', 'Saving', 'info', 'Net worth fell last month', `From ${m$(f.netWorthBefore)} to ${m$(f.netWorthNow)}. One-off costs happen; if it repeats, look at spending and loans.`, null, 30));
    }
    inv.filter((t) => t.key === 'emergency' || t.key === 'idle').forEach((t) => out.push({ ...t, area: 'Saving' }));
    // debt and cards
    const debt = inv.filter((t) => t.key === 'card' || t.key.startsWith('loan-')).map((t) => ({ ...t, area: 'Debt & cards' }));
    if (f.avgIncome > 0 && f.monthlyEmi > 0) {
        const share = pct(f.monthlyEmi, f.avgIncome);
        if (share > 40) {
            debt.push(tip('emi-high', 'Debt & cards', 'risk', `EMIs take ${whole(share)}% of income`, `${m$(f.monthlyEmi)} a month in EMIs. Above 40% leaves little room; avoid new loans and prepay the costliest when you can.`, 'people', 4));
        } else if (share > 30) {
            debt.push(tip('emi-mid', 'Debt & cards', 'warn', `EMIs take ${whole(share)}% of income`, 'Keep EMIs under about 30-35% of income before taking any new loan.', 'people', 13));
        } else {
            debt.push(tip('emi-ok', 'Debt & cards', 'good', 'EMIs are manageable', `${whole(share)}% of income goes to EMIs.`, 'people', 58));
        }
    }
    if (!debt.length) {
        debt.push(tip('debt-ok', 'Debt & cards', 'good', 'No costly debt', 'No card dues and no loan above 10% interest.', null, 59));
    }
    out.push(...debt);
    // investments
    out.push(...inv.filter((t) => !['card', 'emergency', 'idle'].includes(t.key) && !t.key.startsWith('loan-')));
    if (!f.holdings.length) {
        out.push(tip('invest-none', 'Investments', 'action', 'Start investing', 'Nothing is invested yet. Once the emergency fund is in place, a monthly SIP in a diversified fund is an easy start.', 'invest', 20));
    }
    // bills and people
    const billsPeople = [];
    const overdue = f.due.filter((d) => d.date < f.today);
    if (overdue.length) {
        billsPeople.push(tip('bills-overdue', 'Bills & people', 'warn', `${plural(overdue.length, 'bill')} ${overdue.length === 1 ? 'is' : 'are'} past due`, `${m$(overdue.reduce((s, d) => s + d.amount, 0))} was due earlier this month. Mark them paid (or skip) on Payments so balances stay right.`, 'pay', 6));
    } else if (f.due.length) {
        billsPeople.push(tip('bills-due', 'Bills & people', 'action', `${plural(f.due.length, 'bill')} due this month`, `${m$(f.dueAmount)} in all. Mark each one paid when it is.`, 'pay', 16));
    }
    const late = f.renewals.filter((r) => r.days < 0);
    if (late.length) {
        billsPeople.push(tip('renew-late', 'Bills & people', 'warn', `${plural(late.length, 'renewal')} ${late.length === 1 ? 'is' : 'are'} overdue`, `For example ${f.renewals[0].name} (${f.renewals[0].words}). Renew it, or mark it done.`, 'renewals', 7));
    } else if (f.renewals.length) {
        billsPeople.push(tip('renew-soon', 'Bills & people', 'action', `${plural(f.renewals.length, 'renewal')} due soon`, `Next: ${f.renewals[0].name} (${f.renewals[0].words}).`, 'renewals', 18));
    }
    if (f.followUpsDue) {
        billsPeople.push(tip('followups', 'Bills & people', 'action', `${plural(f.followUpsDue, 'follow-up')} due`, `${m$(f.totals.toReceive)} is owed to you in all. A friendly WhatsApp reminder from People & Loans helps.`, 'people', 14));
    } else if (f.totals.toReceive > 0) {
        billsPeople.push(tip('owed', 'Bills & people', 'info', `${m$(f.totals.toReceive)} is owed to you`, 'Set a follow-up date for each person so it is not forgotten.', 'people', 32));
    }
    if (f.totals.owedToPeople > 0) {
        billsPeople.push(tip('i-owe', 'Bills & people', 'info', `You owe ${m$(f.totals.owedToPeople)} to people`, 'Paying friends and family back on time keeps things simple.', 'people', 34));
    }
    if (!billsPeople.length) {
        billsPeople.push(tip('bills-ok', 'Bills & people', 'good', 'Nothing due or pending', 'No bills, renewals or follow-ups need you now.', null, 61));
    }
    out.push(...billsPeople);
    return sortTips(out);
}

function summaryLines(f) {
    const out = [`This month: ${m$(f.month.income)} in, ${m$(f.month.expense)} spent${f.month.invested > 0 ? `, ${m$(f.month.invested)} invested` : ''}.`];
    if (f.savingsRate !== null) {
        out.push(`Over the last ${plural(f.monthsSeen, 'month')} you kept ${f.savingsRate}% of your income (about ${m$(f.avgIncome - f.avgExpense)} a month).`);
    }
    if (f.budgetPlanned > 0) {
        out.push(`Budget: ${m$(f.budgetSpent)} of ${m$(f.budgetPlanned)} used (${whole(pct(f.budgetSpent, f.budgetPlanned))}%).`);
    }
    if (f.holdings.length) {
        const gain = f.value - f.invested;
        out.push(`Investments are worth ${m$(f.value)}, ${gain >= 0 ? 'up' : 'down'} ${m$(Math.abs(gain))} (${signed(pct(gain, f.invested))}) on what you put in.`);
    }
    if (f.netWorthNow !== null && f.netWorthBefore !== null) {
        const d = f.netWorthNow - f.netWorthBefore;
        out.push(`Net worth at the last month-end: ${m$(f.netWorthNow)} (${d >= 0 ? 'up' : 'down'} ${m$(Math.abs(d))} on the month before).`);
    }
    if (f.due.length) {
        out.push(`${plural(f.due.length, 'bill')} due this month, ${m$(f.dueAmount)} in all.`);
    }
    return out;
}

// ---------------------------------------------------------------- the check-up
export function checkup(data, today, ctx) {
    const f = facts(data, today, ctx);
    const tips = allTips(f);
    const score = Object.fromEntries(AREAS.map((a) => [a, 100]));
    const open = Object.fromEntries(AREAS.map((a) => [a, 0]));
    tips.forEach((t) => {
        const cut = t.tone === 'risk' ? 25 : t.tone === 'warn' ? 12 : t.tone === 'action' ? 5 : 0;
        score[t.area] = Math.max(10, score[t.area] - cut);
        if (t.tone !== 'good') {
            open[t.area] += 1;
        }
    });
    const areas = AREAS.map((name) => ({
        name,
        score: score[name],
        open: open[name],
        status: score[name] >= 80 ? (open[name] === 0 ? 'Going well' : 'Mostly fine') : score[name] >= 55 ? 'Needs a look' : 'Act now'
    }));
    const total = Math.round(areas.reduce((s, a) => s + a.score, 0) / AREAS.length);
    const urgent = tips.filter((t) => t.tone === 'risk' || t.tone === 'warn').length;
    const port = f.port;
    return {
        score: total,
        scoreLabel: total >= 80 ? 'In great shape' : total >= 60 ? 'Good, a few things to fix' : 'Needs attention',
        headline: urgent ? `${plural(urgent, 'thing')} ${urgent === 1 ? 'needs' : 'need'} your attention, most important first.` : 'Everything important is in order.',
        areas,
        tips,
        stats: [
            { label: 'Spent this month', value: f.month.expense, sub: f.lastMonthExpense > 0 ? `last month ${m$(f.lastMonthExpense)}` : '' },
            { label: 'Money in hand', value: f.cash, sub: 'bank + cash' },
            { label: 'Investments', value: port.value, sub: port.active.length ? `${port.gain >= 0 ? 'gain' : 'loss'} ${m$(Math.abs(port.gain))}` : 'none yet' },
            { label: 'Still to pay on loans', value: f.loansOutstanding, sub: `EMIs ${m$(f.monthlyEmi)} a month` }
        ],
        summary: summaryLines(f),
        questions: QUESTIONS
    };
}

// ---------------------------------------------------------------- questions
const TOPIC_WORDS = [
    ['summary', ['summary', 'summarise', 'summarize', 'overview', 'how am i doing', 'check-up', 'checkup', 'overall']],
    ['todo', ['what should i do', 'do this month', 'advice', 'advise', 'suggest', 'recommend', 'next step', 'improve', 'to do']],
    ['networth', ['net worth', 'networth', 'wealth']],
    ['budget', ['budget', 'within', 'overspend', 'over spend']],
    ['spending', ['spend', 'spent', 'expense', 'money going', 'where does', 'category']],
    ['saving', ['saving', 'save', 'savings']],
    ['emi', ['emi', 'too high']],
    ['loans', ['loan', 'prepay', 'debt']],
    ['bills', ['bill', 'renewal', 'insurance', 'due']],
    ['people', ['owe', 'lent', 'friend', 'follow']]
];
const INVEST_WORDS = [
    ['tax', ['tax', 'ltcg', 'stcg', 'long term', 'long-term', 'short term', 'short-term']],
    ['upcoming', ['upcoming', 'coming up', 'matur', 'lock-in', 'lock in']],
    ['goals', ['goal', 'target', 'house', 'retire', 'education', 'on track']],
    ['enough', ['enough', 'invest more', 'how much', 'sip amount']],
    ['performance', ['best', 'worst', 'perform', 'winner', 'loser', 'returns']],
    ['risk', ['risk', 'allocation', 'diversif', 'mix', 'equity', 'balance', 'portfolio']]
];

export function topicOf(question) {
    const q = String(question || '').toLowerCase();
    for (const [topic, words] of TOPIC_WORDS) {
        if (words.some((w) => q.includes(w))) {
            return topic;
        }
    }
    for (const [topic, words] of INVEST_WORDS) {
        if (words.some((w) => q.includes(w))) {
            return `investments-${topic}`;
        }
    }
    return 'help';
}

/** The answer to a question: { topic, lines, tips }. */
export function ask(question, data, today, ctx) {
    const f = facts(data, today, ctx);
    const all = allTips(f);
    const topic = topicOf(question);
    const byArea = (area, openOnly = true) => all.filter((t) => t.area === area && (!openOnly || t.tone !== 'good')).slice(0, 4);
    const r = { question, topic, lines: [], tips: [] };
    const invTips = (pred) => all.filter((t) => t.area === 'Investments' && pred(t.key)).slice(0, 4);
    if (topic === 'summary') {
        r.lines = summaryLines(f);
    } else if (topic === 'todo') {
        r.tips = all.filter((t) => t.tone !== 'good').slice(0, 5);
        r.lines.push(r.tips.length ? 'Here is what matters most right now:' : 'Nothing needs doing right now. Keep going as you are.');
    } else if (topic === 'spending') {
        r.lines.push(`This month so far: ${m$(f.month.expense)} spent${f.lastMonthExpense > 0 ? ` (last month ${m$(f.lastMonthExpense)})` : ''}.`);
        Object.entries(f.catNow).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([c, v]) => r.lines.push(`${c}: ${m$(v)}${f.catAvg[c] ? ` (usually about ${m$(f.catAvg[c])})` : ''}`));
        r.tips = byArea('Spending');
    } else if (topic === 'budget') {
        r.lines.push(f.budgetPlanned > 0 ? `Budget: ${m$(f.budgetSpent)} of ${m$(f.budgetPlanned)} used.` : 'No budget is set for this month.');
        f.lines.slice(0, 6).forEach((b) => r.lines.push(`${b.name}: ${m$(b.spent)} of ${m$(b.planned)} (${whole(pct(b.spent, b.planned))}%)`));
        r.tips = byArea('Spending');
    } else if (topic === 'saving') {
        r.lines.push(f.savingsRate === null ? 'Not enough months yet to work out your savings.' : `Last ${plural(f.monthsSeen, 'month')}: about ${m$(f.avgIncome)} in and ${m$(f.avgExpense)} spent a month, so you kept ${f.savingsRate}%.`);
        r.tips = byArea('Saving');
    } else if (topic === 'networth') {
        r.lines.push(f.netWorthNow === null ? 'Net worth needs at least one full month of entries; none yet.' : `Net worth at the last month-end: ${m$(f.netWorthNow)}${f.netWorthBefore !== null ? `, the month before ${m$(f.netWorthBefore)}.` : '.'}`);
        r.lines.push('It adds bank, cash, investments, assets and money owed to you, less loans and card dues.');
        r.tips = byArea('Saving', false);
    } else if (topic === 'emi') {
        r.lines.push(`EMIs: ${m$(f.monthlyEmi)} a month; ${m$(f.loansOutstanding)} still to pay.`);
        if (f.avgIncome > 0) {
            r.lines.push(`That is ${whole(pct(f.monthlyEmi, f.avgIncome))}% of your average income.`);
        }
        r.tips = byArea('Debt & cards');
    } else if (topic === 'loans') {
        r.lines.push('Prepaying a loan earns exactly its interest rate, with no risk. Loans above about 10-12% are usually worth prepaying before investing more; cheaper loans can run while you invest.');
        r.lines.push(f.costlyLoans.length ? 'Loans that cost 10% or more a year:' : 'No loan above 10% interest: investing is usually the better use of spare money.');
        r.tips = byArea('Debt & cards');
    } else if (topic === 'bills') {
        f.due.slice(0, 5).forEach((d) => r.lines.push(`${d.description}: ${m$(d.amount)}, due ${L.dateText(d.date, { day: 'numeric', month: 'short' })}`));
        f.renewals.slice(0, 3).forEach((x) => r.lines.push(`Renewal: ${x.name} (${x.words})`));
        if (!r.lines.length) {
            r.lines.push('Nothing is due right now.');
        }
        r.tips = byArea('Bills & people');
    } else if (topic === 'people') {
        r.lines.push(`${m$(f.totals.toReceive)} is owed to you${f.badDebts > 0 ? `, plus ${m$(f.badDebts)} marked bad debt` : ''}.`);
        if (f.followUpsDue) {
            r.lines.push(`${plural(f.followUpsDue, 'follow-up')} ${f.followUpsDue === 1 ? 'is' : 'are'} due today or earlier.`);
        }
        r.tips = byArea('Bills & people');
    } else if (topic.startsWith('investments-')) {
        const kind = topic.slice(12);
        if (!f.holdings.length) {
            r.lines.push('You have no investments yet. Add one on the Investments screen and ask again.');
            r.tips = invTips((k) => k === 'invest-none');
        } else if (kind === 'risk') {
            r.lines.push(`Mix: equity ${whole(f.equityPct)}%, debt and cash ${whole(f.debtPct)}%${f.goldPct > 0 ? `, gold ${whole(f.goldPct)}%` : ''}.`);
            r.lines.push('A common rule of thumb: money needed within 3 years in debt or deposits, money for 7+ years mostly in equity.');
            r.tips = invTips((k) => ['equity-high', 'equity-low', 'mix', 'single'].includes(k) || k.startsWith('conc-'));
        } else if (kind === 'performance') {
            const sorted = [...f.holdings].filter((h) => h.gainPct !== null && h.gainPct !== undefined).sort((a, b) => b.gainPct - a.gainPct);
            sorted.slice(0, 3).forEach((h, i) => r.lines.push(`Best ${i + 1}: ${h.name} ${signed(h.gainPct)} (${m$(h.gain)})${h.xirr !== null && h.xirr !== undefined ? `, XIRR ${signed(h.xirr)}` : ''}.`));
            if (sorted.length > 3) {
                const w = sorted[sorted.length - 1];
                r.lines.push(`Weakest: ${w.name} ${signed(w.gainPct)} (${m$(w.gain)}).`);
            }
            r.tips = invTips((k) => k.startsWith('lag-') || k.startsWith('rebal-'));
        } else if (kind === 'enough') {
            r.lines.push(`SIPs: ${m$(f.sipPerMonth)} a month.`);
            if (f.avgIncome > 0) {
                r.lines.push(`Last ${plural(f.monthsSeen, 'month')}: about ${m$(f.avgIncome)} income, ${m$(f.avgExpense)} spent and ${m$(f.avgInvested)} invested a month (${whole(pct(f.avgInvested, f.avgIncome))}% of income).`);
                r.lines.push(`15-20% of income (${m$(f.avgIncome * 0.15)}-${m$(f.avgIncome * 0.2)} a month) is a good long-term target.`);
            }
            r.tips = invTips((k) => ['no-sip', 'step-up', 'rate-low', 'rate-good', 'pending'].includes(k));
        } else if (kind === 'goals') {
            r.lines.push(f.goals.length ? `${plural(f.goals.length, 'goal')}:` : 'No goals yet.');
            r.tips = invTips((k) => k.startsWith('goal-') || k === 'no-goal');
        } else if (kind === 'upcoming') {
            (f.port.upcoming || []).slice(0, 6).forEach((u) => r.lines.push(`${L.dateText(u.date, { day: 'numeric', month: 'short' })}: ${u.name} – ${u.what}${u.amount ? ` ${m$(u.amount)}` : ''}`));
            if (!r.lines.length) {
                r.lines.push('Nothing in the coming weeks.');
            }
            r.tips = invTips((k) => k.startsWith('mat-') || k.startsWith('lock-'));
        } else if (kind === 'tax') {
            const y = (f.port.years || [])[0];
            if (y) {
                r.lines.push(`${y.year}: short-term gains ${m$(y.shortTerm)}, long-term gains ${m$(y.longTerm)}, dividends and interest ${m$(y.income)}.`);
            }
            r.lines.push('Investments held longer are often taxed lower than short-term gains; interest is usually taxed as income. This is a guide, not tax advice: check the rules where you live.');
            r.tips = invTips((k) => k.startsWith('ltcg-'));
        }
    } else {
        r.lines.push('I can help with spending and budget, saving and net worth, loans and EMIs, investments, bills, renewals and money people owe you. Try one of the questions below.');
    }
    return r;
}
