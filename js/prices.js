// Prices for Investments, fetched by the browser.
//  - Mutual funds (India, AMFI): mfapi.in answers browsers directly - search, latest NAV and NAV on a date.
//  - Shares, ETFs and crypto: Yahoo Finance does not answer browsers, so they go through LifeDesk's small price
//    service (backend/prices.gs, an Apps Script). Without it (pricesEndpoint empty) their price is typed in.
import { pricesEndpoint } from './config.js';

const MF = 'https://api.mfapi.in';
export const sharesAvailable = !!pricesEndpoint;

const ddmmyyyy = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const fromDdmmyyyy = (s) => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;
const shift = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

async function getJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`The price service answered ${res.status}.`);
    }
    return res.json();
}

export async function searchFunds(q) {
    if (!q || q.trim().length < 3) {
        return [];
    }
    const list = await getJson(`${MF}/mf/search?q=${encodeURIComponent(q.trim())}`);
    return (list || []).slice(0, 30).map((x) => ({ code: String(x.schemeCode), name: x.schemeName, kind: 'Mutual Fund', exchange: `AMFI ${x.schemeCode}` }));
}

/** NAVs between two dates: { 'YYYY-MM-DD': nav }, plus the scheme's details. */
export async function fundHistory(code, from, to) {
    const body = await getJson(`${MF}/mf/${encodeURIComponent(code)}?startDate=${ddmmyyyy(from)}&endDate=${ddmmyyyy(to)}`);
    const navs = {};
    (body.data || []).forEach((d) => {
        navs[fromDdmmyyyy(d.date)] = Number(d.nav);
    });
    const m = body.meta || {};
    return { navs, meta: { name: m.scheme_name, fundHouse: m.fund_house, category: m.scheme_category, isin: m.isin_growth } };
}

/** Latest NAV with the one before it. */
export async function fundQuote(code, today) {
    const { navs, meta } = await fundHistory(code, shift(today, -14), today);
    const days = Object.keys(navs).sort();
    if (!days.length) {
        throw new Error('No NAV in the last two weeks.');
    }
    const last = days[days.length - 1];
    return { price: navs[last], previous: days.length > 1 ? navs[days[days.length - 2]] : null, asOf: last, ...meta };
}

async function service(params) {
    if (!pricesEndpoint) {
        throw new Error('Share prices need the LifeDesk price service (see backend/README.md). Type the price for now.');
    }
    const res = await getJson(`${pricesEndpoint}?${new URLSearchParams(params)}`);
    if (!res.ok) {
        throw new Error(res.error || 'No price found.');
    }
    return res;
}
export async function searchSymbols(q) {
    if (!q || q.trim().length < 2) {
        return [];
    }
    return (await service({ action: 'search', q: q.trim() })).results || [];
}
/** Latest price in the given currency (prices in another currency are converted by the service). */
export async function symbolQuote(symbol, currency) {
    return service({ action: 'quote', symbol, currency });
}
export async function symbolHistory(symbol, from, to, currency) {
    return (await service({ action: 'history', symbol, from, to, currency })).prices || {};
}

/** Latest price of an investment from its scheme code or symbol; null when it has neither. */
export async function latest(inv, today, currency) {
    if (inv.schemeCode) {
        return fundQuote(inv.schemeCode, today);
    }
    if (inv.symbol && sharesAvailable) {
        return symbolQuote(inv.symbol, currency);
    }
    return null;
}

/** Prices between two dates for an investment: { date: price } ({} without a price source). */
export async function history(inv, from, to, currency) {
    if (inv.schemeCode) {
        return (await fundHistory(inv.schemeCode, from, to)).navs;
    }
    if (inv.symbol && sharesAvailable) {
        return symbolHistory(inv.symbol, from, to, currency);
    }
    return {};
}

/** The last price on or before a date (to fill a transaction); null when there is none. */
export async function priceOn(inv, date, currency) {
    const prices = await history(inv, shift(date, -10), date, currency);
    const day = Object.keys(prices).filter((d) => d <= date).sort().pop();
    return day ? { price: prices[day], asOf: day } : null;
}
