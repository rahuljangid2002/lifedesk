/**
 * LifeDesk price service: share, ETF and crypto prices for the Investments screen (Yahoo Finance does not answer
 * browsers directly). Deploy as a web app: Execute as Me, Who has access: Anyone. Paste its /exec address into
 * js/config.js as pricesEndpoint. It reads only public market data and keeps nothing.
 *   ?action=search&q=infosys
 *   ?action=quote&symbol=RELIANCE.NS&currency=INR
 *   ?action=history&symbol=RELIANCE.NS&from=2026-10-01&to=2026-10-31&currency=INR
 */
var YAHOO = 'https://query1.finance.yahoo.com';
var KINDS = { EQUITY: 'Stock', ETF: 'ETF', MUTUALFUND: 'Mutual Fund', CRYPTOCURRENCY: 'Crypto', INDEX: 'Index' };

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out;
  try {
    if (p.action === 'search') {
      out = { ok: true, results: search(p.q) };
    } else if (p.action === 'quote') {
      out = quote(p.symbol, p.currency);
    } else if (p.action === 'history') {
      out = { ok: true, prices: history(p.symbol, p.from, p.to, p.currency) };
    } else {
      out = { ok: false, error: 'Unknown action.' };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function getJson(url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (LifeDesk)' } });
  if (res.getResponseCode() !== 200) {
    throw new Error('Price source answered ' + res.getResponseCode());
  }
  return JSON.parse(res.getContentText());
}

function search(q) {
  if (!q || q.length < 2) return [];
  var body = getJson(YAHOO + '/v1/finance/search?quotesCount=15&newsCount=0&q=' + encodeURIComponent(q));
  var list = [];
  (body.quotes || []).forEach(function (x) {
    if (!x.symbol || !KINDS[x.quoteType] || x.quoteType === 'INDEX') return;
    list.push({ code: x.symbol, name: x.longname || x.shortname || x.symbol, kind: KINDS[x.quoteType], exchange: x.exchDisp || '' });
  });
  return list;
}

function chart(symbol, params) {
  var body = getJson(YAHOO + '/v8/finance/chart/' + encodeURIComponent(symbol) + params);
  var r = body.chart && body.chart.result && body.chart.result[0];
  if (!r) throw new Error('No price found for ' + symbol + '.');
  return r;
}

var fxCache = {};
function rate(from, to) {
  from = (from || to || 'USD').toUpperCase();
  to = (to || from).toUpperCase();
  if (from === to) return 1;
  var key = from + to;
  if (!fxCache[key]) {
    fxCache[key] = chart(key + '=X', '?range=1d&interval=1d').meta.regularMarketPrice;
  }
  return fxCache[key];
}

function closes(r) {
  var q = r.indicators && r.indicators.quote && r.indicators.quote[0];
  return (q && q.close) || [];
}

function quote(symbol, currency) {
  var r = chart(symbol, '?range=5d&interval=1d');
  var fx = rate(r.meta.currency, currency);
  var list = closes(r).filter(function (c) { return c !== null; });
  var prev = list.length >= 2 ? list[list.length - 2] : r.meta.chartPreviousClose;
  return {
    ok: true, name: r.meta.longName || r.meta.shortName || symbol, currencyCode: r.meta.currency,
    price: round4(r.meta.regularMarketPrice * fx), previous: prev ? round4(prev * fx) : null,
    asOf: Utilities.formatDate(new Date(r.meta.regularMarketTime * 1000), r.meta.exchangeTimezoneName || 'UTC', 'yyyy-MM-dd')
  };
}

function history(symbol, from, to, currency) {
  var p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000);
  var p2 = Math.floor(new Date(to + 'T00:00:00Z').getTime() / 1000) + 86400;
  var r = chart(symbol, '?interval=1d&period1=' + p1 + '&period2=' + p2);
  var fx = rate(r.meta.currency, currency);
  var out = {};
  var c = closes(r);
  (r.timestamp || []).forEach(function (t, i) {
    if (c[i] !== null && c[i] !== undefined) {
      out[Utilities.formatDate(new Date(t * 1000), r.meta.exchangeTimezoneName || 'UTC', 'yyyy-MM-dd')] = round4(c[i] * fx);
    }
  });
  return out;
}

function round4(v) { return Math.round(v * 10000) / 10000; }
