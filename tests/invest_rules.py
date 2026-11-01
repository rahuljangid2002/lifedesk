"""Investments: the calculations in js/invest.js (FIFO, gains and terms, deposits, XIRR, goals, SIP dates, ledger).

    python3 tools/serve_dev.py        (in 4-Web-App)
    <venv with playwright>/python tests/invest_rules.py
"""
import json, os, sys
from playwright.sync_api import sync_playwright

URL = os.environ.get('LIFEDESK_URL', 'http://127.0.0.1:8765/?demo=1')
checks = []


def check(name, ok, detail=''):
    checks.append(ok)
    print(('PASS' if ok else 'FAIL'), name, detail)


JS = r"""
async () => {
  const I = await import('/js/invest.js');
  const out = {};
  const today = '2026-11-01';
  // FIFO: 100 @10 long ago, 100 @20 recently, sell 150 @24
  const inv = { id: 'a', name: 'Fund', type: 'Mutual Fund', price: 25 };
  const tx = [
    { id: 't1', investmentId: 'a', kind: 'buy', date: '2025-06-01', units: 100, price: 10, amount: 1000 },
    { id: 't2', investmentId: 'a', kind: 'buy', date: '2026-07-24', units: 100, price: 20, amount: 2000 },
  ];
  let h = I.holding(inv, tx, today);
  out.before = { units: h.units, cost: h.invested, avg: h.avgCost, value: h.value, cls: h.assetClass };
  tx.push({ id: 't3', investmentId: 'a', kind: 'sell', date: today, units: 150, price: 24, amount: 3600 });
  h = I.holding(inv, tx, today);
  out.after = { units: h.units, cost: h.invested, realised: h.realised, term: h.gains.t3.term, gain: h.gains.t3.gain, xirr: h.xirr };
  out.oversell = I.holding(inv, [...tx, { id: 't4', investmentId: 'a', kind: 'sell', date: today, units: 60, price: 24, amount: 1440 }], today).error;
  // split, bonus, reinvest, dividend
  const st = { id: 's', name: 'Share', type: 'Stock', price: 600 };
  const sx = [
    { id: 'b', investmentId: 's', kind: 'buy', date: '2025-09-01', units: 10, price: 1000, amount: 10000 },
    { id: 'c', investmentId: 's', kind: 'split', date: '2025-12-01', ratio: 2 },
    { id: 'd', investmentId: 's', kind: 'bonus', date: '2026-03-01', ratio: 1 },
    { id: 'e', investmentId: 's', kind: 'dividend', date: '2026-06-01', amount: 250 },
    { id: 'f', investmentId: 's', kind: 'reinvest', date: '2026-08-01', units: 1, price: 500, amount: 500 },
  ];
  h = I.holding(st, sx, today);
  out.corp = { units: h.units, cost: h.invested, income: h.income, putIn: h.putIn, value: h.value };
  // fixed deposit: 8% quarterly for a year, maturity in two, then matured
  const fd = { id: 'fd', name: 'FD', type: 'Fixed Deposit', rate: 8, compounding: 'Quarterly', maturityDate: '2027-11-01' };
  const fx = [{ id: 'o', investmentId: 'fd', kind: 'opening', date: '2025-11-01', amount: 100000 }];
  h = I.holding(fd, fx, today);
  out.fd = { value: h.value, maturity: h.maturityAmount, units: h.units };
  h = I.holding(fd, [...fx, { id: 'm', investmentId: 'fd', kind: 'maturity', date: today, amount: 108200 }], today);
  out.fdDone = { status: h.status, realised: h.realised, value: h.value };
  out.payout = I.accrue(5000, 7, 'Interest paid out', '2025-01-01', today);
  // xirr
  out.x10 = I.xirr([{ amount: -1000, date: '2025-01-01' }, { amount: 1100, date: '2026-01-01' }]);
  out.xLoss = I.xirr([{ amount: -1000, date: '2025-01-01' }, { amount: 500, date: '2026-01-01' }]);
  out.xNone = I.xirr([{ amount: -1000, date: '2025-01-01' }]);
  // goals and calculators
  out.monthly = I.monthlyNeeded(1200000, 0, '2036-11-01', 0, today);
  out.met = I.monthlyNeeded(1000, 5000, '2027-11-01', 10, today);
  out.plan = I.goalPlan(1200000, 10, 0).monthly;
  // SIP dates and step-up
  out.dates = [I.firstDue('2026-03-01', 'Monthly', 5), I.firstDue('2026-03-09', 'Monthly', 5), I.nextDue('2026-03-28', 'Quarterly', 31), I.nextDue('2026-03-09', 'Weekly', 5), I.nextDue('2026-12-10', 'Monthly', 10)];
  out.step = [I.stepped(5000, 10, null), I.stepped(5000, null, 1000)];
  // due instalments: weekly from 20 days ago, prices every day
  const prices = {};
  for (let d = 0; d <= 25; d++) { const dt = new Date(Date.UTC(2026, 9, 7 + d)).toISOString().slice(0, 10); prices[dt] = 100 - d * 0.5; }
  const sip = { id: 'p', name: 'SIP', investmentId: 'a', amount: 5000, frequency: 'Weekly', day: 12, nextDue: '2026-10-12', status: 'Active', autoRecord: true, accountId: 'bank' };
  const r = I.dueInstalments(sip, inv, prices, today);
  out.due = { n: r.txns.length, first: r.txns[0], next: r.sip.nextDue, last: r.sip.lastDone };
  out.duePending = I.dueInstalments({ ...sip, autoRecord: false }, inv, prices, today).txns.map((t) => t.status);
  out.dueWait = I.dueInstalments({ ...sip, nextDue: '2026-10-31' }, inv, {}, today).txns.length;
  // ledger
  out.ledger = [
    I.ledgerFor({ kind: 'buy', amount: 5000, charges: 5, accountId: 'x', status: 'confirmed' }),
    I.ledgerFor({ kind: 'sell', amount: 3600, charges: 20, accountId: 'x', status: 'confirmed' }),
    I.ledgerFor({ kind: 'dividend', amount: 120, accountId: 'x', status: 'confirmed' }),
    I.ledgerFor({ kind: 'opening', amount: 9000, accountId: null, status: 'confirmed' }),
    I.ledgerFor({ kind: 'buy', amount: 5000, accountId: 'x', status: 'pending' }),
  ];
  out.prep = [I.prepareTxn({ kind: 'buy', date: today, units: 10, price: 50 }, inv, today).txn.amount,
              I.prepareTxn({ kind: 'buy', date: today, amount: 100 }, inv, today).error,
              I.prepareTxn({ kind: 'buy', date: '2026-12-01', units: 1, price: 1 }, inv, today).error,
              I.prepareTxn({ kind: 'split', date: today }, inv, today).error];
  out.classes = [I.defaultAssetClass('Mutual Fund', 'Debt Scheme - Liquid Fund'), I.defaultAssetClass('ETF', null, 'Gold BeES'), I.defaultAssetClass('Pension Fund'), I.defaultAssetClass('Crypto'), I.defaultAssetClass('Other')];
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(URL)
    o = pg.evaluate(JS)
    b.close()

check('FIFO before sale: 200 units, cost 3,000, average 15, value 5,000, equity', o['before'] == {'units': 200, 'cost': 3000, 'avg': 15, 'value': 5000, 'cls': 'Equity'}, json.dumps(o['before']))
check('sale of 150: 100 old + 50 new units, gain 1,600, Mixed term', o['after']['units'] == 50 and o['after']['cost'] == 1000 and o['after']['gain'] == 1600 and o['after']['term'] == 'Mixed', json.dumps(o['after']))
check('XIRR is worked out after 30 days', o['after']['xirr'] is not None, str(o['after']['xirr']))
check('selling more than held is refused', bool(o['oversell']) and 'held' in o['oversell'], str(o['oversell']))
check('split 2, bonus 1:1 and a reinvested unit: 41 units, cost 10,500, value 24,600', o['corp'] == {'units': 41, 'cost': 10500, 'income': 250, 'putIn': 10000, 'value': 24600}, json.dumps(o['corp']))
check('deposit: about 8.24% after a year, maturity about 1,17,166', 108000 < o['fd']['value'] < 108500 and 117000 < o['fd']['maturity'] < 117500 and o['fd']['units'] is None, json.dumps(o['fd']))
check('maturity closes the deposit with its gain', o['fdDone'] == {'status': 'Closed', 'realised': 8200, 'value': 0}, json.dumps(o['fdDone']))
check('interest paid out keeps the principal', o['payout'] == 5000)
check('XIRR 10% / -50% / none', abs(o['x10'] - 10) < 0.1 and abs(o['xLoss'] + 50) < 0.1 and o['xNone'] is None, f"{o['x10']} {o['xLoss']} {o['xNone']}")
check('goal: 12 lakh in 10 years at 0% = 10,000 a month', o['monthly'] == 10000 and o['met'] == 0 and abs(o['plan'] - 10000) < 1, f"{o['monthly']} {o['met']} {o['plan']}")
check('SIP dates (monthly, next month, quarterly day 28, weekly, December to January)', o['dates'] == ['2026-03-05', '2026-04-05', '2026-06-28', '2026-03-16', '2027-01-10'], json.dumps(o['dates']))
check('step-up by percent and by amount', o['step'] == [5500, 6000])
check('weekly SIP: 3 instalments at their day\'s price, next one after today', o['due']['n'] == 3 and o['due']['first']['price'] == 97.5 and o['due']['first']['units'] == 51.282 and o['due']['next'] == '2026-11-02' and o['due']['last'] == '2026-10-26', json.dumps(o['due']))
check('instalments wait for units when not recorded automatically', o['duePending'] == ['pending'] * 3, json.dumps(o['duePending']))
check('a price that is not out yet: nothing recorded yet', o['dueWait'] == 1 or o['dueWait'] == 0, str(o['dueWait']))
check('ledger: buy with charges out, sale less charges back, dividend income, nothing for held or pending', o['ledger'] == [{'type': 'invest', 'amount': 5005}, {'type': 'invreturn', 'amount': 3580}, {'type': 'income', 'amount': 120}, None, None], json.dumps(o['ledger']))
check('amount from units x price; units required; no future dates; split ratio required', o['prep'][0] == 500 and 'units' in o['prep'][1] and 'future' in o['prep'][2] and 'ratio' in o['prep'][3], json.dumps(o['prep']))
check('asset classes from type and category', o['classes'] == ['Debt', 'Gold', 'Hybrid', 'Crypto', 'Other'], json.dumps(o['classes']))
print(f"\n{sum(checks)}/{len(checks)} checks passed")
sys.exit(0 if all(checks) else 1)
