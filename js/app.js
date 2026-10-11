// LifeDesk: one login, several tools. The start screen (hub) lists the tools; Money is the first one.
// Each screen is a function that returns HTML from the current data and state; clicks and typing are
// handled once, at the bottom, through data-action / data-model attributes.
// To add a tool: add it to TOOLS, add its screens to SCREENS, and keep its data in its own collections.
import * as L from './logic.js';
import * as S from './store.js';
import { icon } from './icons.js';
import { SAMPLE_START, buildSample, sampleDocs } from './sample.js';
import { currentReport, dashboards, reports } from './insights.js';
import { netWorth, toCsv } from './reports.js';
import { pushSettings as PUSH } from './config.js';
import * as Voice from './voice.js';

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
    more: { addingCategory: false, busy: false, change: null },
    assets: { form: null },
    renewals: { form: null, renew: null, showDone: false, leaving: [], leavingAt: 0, arrived: [], arrivedAt: 0 },
    push: { busy: false },
    fresh: false, // true for the one drawing right after moving to another screen
    voice: { open: false, lang: 'en', phase: 'idle', interim: '', note: '', log: [], review: null },
    addMenu: false, // the choice above the + of the bottom bar: type or speak
    net: { offline: !navigator.onLine, dismissed: false, checking: false, failedStart: false },
    vault: { pass: '', pass2: '', code: null, saved: false, mode: 'pass', recovery: '', busy: false },
    insights: { tab: 'monthly', month: thisMonth(), year: null },
    reports: { id: 'monthly-summary', preset: 'this-month', from: null, to: null, month: null, year: null },
    login: { mode: 'signin', step: 'form', name: '', email: '', password: '', code: '', show: false, busy: false, limit: false }
};

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byId = (list, id) => list.find((x) => x.id === id);
const shortDate = (iso) => L.dateText(iso, { day: 'numeric', month: 'short' });
const longDay = (iso) => (iso === today() ? `Today · ${shortDate(iso)}` : L.dateText(iso, { weekday: 'short', day: 'numeric', month: 'short' }));
const KIND_ORDER = { cash: 0, bank: 1, wallet: 2, card: 3 };
const sortedAccounts = () => [...S.data.accounts].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
const activeAccounts = () => sortedAccounts().filter((a) => a.active !== false);
const defaultAccount = () => activeAccounts().find((a) => a.isDefault) || activeAccounts()[0];
const accountName = (id) => (byId(S.data.accounts, id) || {}).name || '';
const categoryName = (id) => (byId(S.data.categories, id) || {}).name || '';
const personName = (id) => (byId(S.data.people, id) || {}).name || '';
const KIND_ICON = { bank: 'bank', wallet: 'wallet', cash: 'cash', card: 'card' };

// Light / dark: 'system' follows the device; 'light' and 'dark' are fixed. Kept on this device (it also has to
// apply on the sign-in screen, before any account is known). index.html applies it before the first paint.
const THEME_KEY = 'lifedesk-theme';
function theme() {
    try {
        const t = localStorage.getItem(THEME_KEY);
        return t === 'light' || t === 'dark' ? t : 'system';
    } catch (e) {
        return 'system';
    }
}
function applyTheme(t) {
    if (t === 'light' || t === 'dark') {
        document.documentElement.dataset.theme = t;
    } else {
        delete document.documentElement.dataset.theme;
    }
}

/** Plain words for the sign-in errors people can actually hit. */
const AUTH_ERRORS = {
    'auth/requires-recent-login': 'For safety, sign out, sign in again, and then delete the account.',
    'auth/invalid-credential': 'Email or password is not right. Check them, or use "Forgot password?".',
    'auth/wrong-password': 'Email or password is not right. Check them, or use "Forgot password?".',
    'auth/user-not-found': 'No account with this email yet. Use "Create an account".',
    'auth/invalid-login-credentials': 'Email or password is not right. Check them, or use "Forgot password?".',
    'auth/email-already-in-use': 'This email already has an account. Sign in, or use "Forgot password?".',
    'auth/weak-password': 'That password is too easy to guess. Use at least 8 characters.',
    'auth/missing-password': 'Enter your password.',
    'auth/account-exists-with-different-credential': 'This email is already registered with Google sign-in. Use "Continue with Google".',
    'auth/user-disabled': 'This account has been switched off. Contact the app owner.',
    'auth/operation-not-allowed': 'This sign-in method is not switched on yet. Please use the other one, or tell the app owner.',
    'auth/unauthorized-domain': 'Sign-in is not allowed from this web address yet. The app owner needs to add it in Firebase.',
    'auth/unauthorized-continue-uri': 'Sign-in is not allowed from this web address yet. The app owner needs to add it in Firebase.',
    'auth/invalid-email': 'That email address does not look right. Please check it.',
    'auth/popup-blocked': 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing. Try again.',
    'auth/cancelled-popup-request': 'The Google sign-in window was closed before finishing. Try again.',
    'auth/network-request-failed': 'No internet connection. Check your network and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/quota-exceeded': 'Today\'s limit for sign-in emails is used up. Use Google sign-in, or try tomorrow.',
    'permission-denied': 'You do not have access to this data. Sign out and sign in again.',
    unavailable: 'Cannot reach the server. Your changes are kept and will be sent when you are back online.'
};
function errorText(e) {
    return AUTH_ERRORS[e && e.code] || (e && e.message) || 'Something went wrong.';
}

/** A message at the top. action = { label, run }: a button in it (such as Undo); the message then stays longer. */
function toast(message, kind = 'ok', action = null) {
    state.toast = { message, kind, action };
    render();
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
        state.toast = null;
        render();
    }, action ? 8000 : 3200);
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
        back: null,
        onEmi: false,
        emiAmount: '',
        emiMonths: '',
        emiFirst: L.addMonthsToDate(today(), 1),
        emiDown: '',
        emiRate: '',
        emiRateTouched: false,
        emiLender: '',
        assetType: 'Electronics',
        assetValue: ''
    };
}

// ---------- loans bought on EMI ----------
const loanRows = () => S.data.loans.map((l) => ({ ...l, ...L.loanStatus(l, S.data.entries, today()) }));
const dueEmis = () => loanRows().flatMap((l) => l.due.map((d) => ({ ...d, loan: l })));
const longDate = (iso) => L.dateText(iso, { day: 'numeric', month: 'short', year: 'numeric' });
/** What the EMI form adds up to: amount financed, total to pay, interest and the yearly rate. */
function emiSums(f) {
    const price = Number(f.amount) || 0;
    const down = Number(f.emiDown) || 0;
    const emi = Number(f.emiAmount) || 0;
    const months = Math.round(Number(f.emiMonths) || 0);
    const financed = price - down;
    const calculated = L.impliedRate(financed, emi, months);
    const typed = !!f.emiRateTouched && f.emiRate !== '' && f.emiRate !== null;
    return { price, down, emi, months, financed, total: down + emi * months, interest: emi * months - financed, calculated, typed, rate: typed ? Number(f.emiRate) : calculated };
}
function dueList() {
    const due = dueEmis();
    if (!due.length) {
        return '';
    }
    return `<h3>EMIs due this month</h3><section class="list">${due.map((d) => `<div class="row"><span class="row-icon">${icon('repaid')}</span>
        <span class="row-text"><b>${esc(d.loan.name)} · EMI ${d.number} of ${d.loan.months}</b><small>Due ${longDate(d.date)} · from ${esc(accountName(d.loan.accountId))}</small></span>
        <span class="amt">${L.money(d.loan.emi)}</span><button class="btn primary" data-action="payEmi" data-id="${d.loan.id}">Pay</button></div>`).join('')}</section>`;
}
/** The line under the EMI fields: updated as you type, without redrawing the form. */
function emiSummary(f) {
    const s = emiSums(f);
    if (!(s.price > 0 && s.emi > 0 && s.months > 0)) {
        return '';
    }
    if (s.emi * s.months < s.financed) {
        return `<div class="notice">The EMIs add up to ${L.money(s.emi * s.months)}, less than the ${L.money(s.financed)} financed.</div>`;
    }
    return `<div class="banner"><div><b>Financed ${L.money(s.financed)} · ${s.months} × ${L.money(s.emi)}</b><small>Total to pay ${L.money(s.total)} · interest ${L.money(Math.max(0, s.interest))} · ${s.rate}% a year${s.typed ? '' : ' (calculated)'}</small></div></div>`;
}
function emiBlock(f) {
    if ((f.type !== 'expense' && f.type !== 'asset') || f.id) {
        return '';
    }
    const m = emiSums(f);
    const ready = m.price > 0 && m.emi > 0 && m.months > 0;
    const field = (label, model, attrs) => `<label>${label}<input ${attrs} value="${esc(f[model])}" data-model="add.${model}" data-then="emi"></label>`;
    return `<label class="check"><input type="checkbox" data-action="emiToggle" ${f.onEmi ? 'checked' : ''}> Bought on EMI / finance</label>
        ${f.onEmi ? `<div class="form"><small>Enter the full price above. Only the down payment is spent today; each EMI is recorded when you pay it.</small>
            <div class="grid2">${field('EMI per month', 'emiAmount', 'type="number" inputmode="decimal" min="0" step="0.01"')}${field('Number of EMIs', 'emiMonths', 'type="number" inputmode="numeric" min="1" step="1"')}</div>
            <div class="grid2">${field('First EMI date', 'emiFirst', 'type="date"')}${field('Down payment (optional)', 'emiDown', 'type="number" inputmode="decimal" min="0" step="0.01" placeholder="0"')}</div>
            <div class="grid2"><label><span>Interest rate, % a year <span class="pill" id="emi-rate-pill" ${m.typed ? 'hidden' : ''}>Calculated</span></span><input id="emi-rate" type="number" inputmode="decimal" min="0" step="0.01" placeholder="fills in as you type" value="${esc(m.typed ? f.emiRate : ready ? m.calculated : '')}" data-model="add.emiRate" data-then="emi"></label>
            ${field('Financed by (optional)', 'emiLender', 'type="text" placeholder="e.g. bank or store"')}</div>
            <small>The rate is worked out as you type, from the price, down payment, EMI and number of EMIs (reducing-balance method: financed = EMI × (1 − (1 + r)<sup>−n</sup>) ÷ r, r per month). Type over it to use your own; clear it to go back to the calculated one. A flat rate quoted by a store is lower than this.</small>
            <div id="emi-summary">${emiSummary(f)}</div>
        </div>` : ''}`;
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
    return `<div class="login ${state.login.limit && state.login.mode === 'signup' ? 'limit-hit' : ''}">
        <div class="logo">${icon('logo')}</div>
        <h1>LifeDesk</h1>
        <p>Your everyday desk: money, budget, people and loans today, with more tools on the way.</p>
        ${S.methods.password ? passwordForm() : ''}
        ${S.methods.google ? `${S.methods.password ? '<div class="or"><span>or</span></div>' : ''}<button class="btn wide" data-action="google">${icon('google')} Continue with Google</button>` : ''}
        ${S.methods.emailLink ? `<div class="or"><span>or sign in with a link sent to your email</span></div>
        <input type="email" id="login-email" placeholder="you@example.com" autocomplete="email" aria-label="Email">
        <button class="btn wide" data-action="emailLink">Email me a sign-in link</button>` : ''}
        <small>Your data is private to you.</small>
    </div>`;
}

/** Email + password: sign in, create an account, or ask for a password reset email. */
function passwordForm() {
    const f = state.login;
    const email = `<label class="left">Email<input type="email" value="${esc(f.email)}" data-model="login.email" placeholder="you@example.com" autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="email"></label>`;
    const password = (label, auto) => `<label class="left">${label}<span class="pw"><input type="${f.show ? 'text' : 'password'}" value="${esc(f.password)}" data-model="login.password" autocomplete="${auto}" autocapitalize="none" spellcheck="false" data-enter="loginSubmit"><button type="button" class="link-btn" data-action="loginShow">${f.show ? 'Hide' : 'Show'}</button></span></label>`;
    const busy = f.busy ? 'disabled' : '';
    if (f.mode === 'reset') {
        return `<form class="login-form" data-form="loginSubmit"><h2>Reset your password</h2>
            <small>Enter your email and we will send you a link to set a new password.</small>
            ${email}
            <button class="btn primary wide" data-action="loginSubmit" ${busy}>Send reset email</button>
            <button type="button" class="link-btn" data-action="loginMode" data-mode="signin">Back to sign in</button></form>`;
    }
    if (f.mode === 'signup' && f.step === 'code') {
        return `<form class="login-form" data-form="loginSubmit"><h2>Check your email</h2>
            <small class="left-text">We sent a 6-digit code to <b>${esc(f.email)}</b>. It works for 10 minutes; look in spam if you do not see it.</small>
            ${codeInput('login.code', f.code)}
            <button class="btn primary wide" data-action="loginSubmit" ${busy}>Verify and create account</button>
            <div class="split"><button type="button" class="link-btn" data-action="loginResend" ${busy}>Send a new code</button><button type="button" class="link-btn" data-action="loginBack">Change email</button></div></form>`;
    }
    if (f.mode === 'signup') {
        return `<form class="login-form" data-form="loginSubmit"><h2>Create your account</h2>
            ${f.limit ? `<div class="notice stacked" role="alert"><b>Email sign-up is paused for today</b><span>This is a test version and today's limit for verification emails has been reached, so new accounts cannot be created by email right now.</span><span>You can still use <b>Continue with Google</b> below, or try again tomorrow. If you already have an account, <button type="button" class="link-btn" data-action="loginMode" data-mode="signin">sign in</button> as usual.</span></div>` : ''}
            <label class="left">Your name<input type="text" value="${esc(f.name)}" data-model="login.name" autocomplete="name"></label>
            ${email}
            ${password('Password (at least 8 characters)', 'new-password')}
            <button class="btn primary wide" data-action="loginSubmit" ${busy}>Send verification code</button>
            <small>We email you a one-time code to confirm the address.</small>
            <small>Already have an account? <button type="button" class="link-btn" data-action="loginMode" data-mode="signin">Sign in</button></small></form>`;
    }
    return `<form class="login-form" data-form="loginSubmit"><h2>Sign in</h2>
        ${email}
        ${password('Password', 'current-password')}
        <button type="button" class="link-btn right" data-action="loginMode" data-mode="reset">Forgot password?</button>
        <button class="btn primary wide" data-action="loginSubmit" ${busy}>Sign in</button>
        <small>New here? <button type="button" class="link-btn" data-action="loginMode" data-mode="signup">Create an account</button></small></form>`;
}

const codeInput = (model, value) => `<label class="left">Verification code<input class="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="••••••" value="${esc(value)}" data-model="${model}"></label>`;

/** Signed in with a password, but the email was never confirmed (sign-up was interrupted). */
function unverified() {
    const f = state.login;
    return `<div class="login">
        <div class="logo">${icon('logo')}</div>
        <h1>Verify your email</h1>
        <form class="login-form" data-form="verifySubmit">
            <small class="left-text">Your account <b>${esc(S.user.contact)}</b> needs its email confirmed before it can be used.</small>
            ${f.step === 'code' ? `${codeInput('login.code', f.code)}
            <button class="btn primary wide" data-action="verifySubmit" ${f.busy ? 'disabled' : ''}>Verify</button>
            <button type="button" class="link-btn" data-action="verifySend">Send a new code</button>`
            : `<button class="btn primary wide" data-action="verifySend" ${f.busy ? 'disabled' : ''}>Email me a code</button>`}
        </form>
        <div class="split wrap"><button class="btn" data-action="signOut">${icon('logout')} Sign out</button><button class="btn danger" data-action="deleteAccount">${icon('trash')} Delete this account</button></div>
    </div>`;
}

/** Encryption: set the passphrase (first time), save the recovery code, or unlock a device that has no key yet. */
function vaultScreen() {
    const v = state.vault;
    const busy = v.busy ? 'disabled' : '';
    const pw = (label, model, auto) => `<label class="left">${label}<input type="password" value="${esc(v[model])}" data-model="vault.${model}" autocomplete="${auto}" autocapitalize="none" spellcheck="false"></label>`;
    let body;
    if (v.code) {
        body = `<form class="login-form" data-form="vaultEnter"><h2>Save your recovery code</h2>
            <small class="left-text">If you ever forget your passphrase, this code is the <b>only</b> way back to your data. Write it down or keep it in a password manager. It is shown once.</small>
            <div class="recovery" id="recovery-code">${esc(v.code)}</div>
            <button type="button" class="btn" data-action="vaultCopy">Copy the code</button>
            <label class="check"><input type="checkbox" data-action="vaultSaved" ${v.saved ? 'checked' : ''}> I have saved this code somewhere safe</label>
            <button class="btn primary wide" data-action="vaultEnter" ${v.saved ? '' : 'disabled'}>Continue</button></form>`;
    } else if (state.status === 'needPassphrase') {
        body = `<form class="login-form" data-form="vaultCreate"><h2>Protect your data</h2>
            <small class="left-text">Your data is encrypted on your device before it is saved, so nobody else can read it: not other users, and not the people who run LifeDesk. Choose a passphrase for it. It is separate from your sign-in password and is asked once on each device.</small>
            ${pw('Data passphrase (at least 8 characters)', 'pass', 'new-password')}${pw('Type it again', 'pass2', 'new-password')}
            <div class="notice stacked"><b>Nobody can reset this for you.</b><span>If you forget the passphrase and lose the recovery code shown next, your data cannot be recovered.</span></div>
            <button class="btn primary wide" data-action="vaultCreate" ${busy}>${v.busy ? 'Setting up…' : 'Set passphrase'}</button></form>`;
    } else if (v.mode === 'recovery') {
        body = `<form class="login-form" data-form="vaultRecover"><h2>Use your recovery code</h2>
            <label class="left">Recovery code<input type="text" value="${esc(v.recovery)}" data-model="vault.recovery" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"></label>
            ${pw('New data passphrase (at least 8 characters)', 'pass', 'new-password')}${pw('Type it again', 'pass2', 'new-password')}
            <button class="btn primary wide" data-action="vaultRecover" ${busy}>${v.busy ? 'Checking…' : 'Unlock and set new passphrase'}</button>
            <button type="button" class="link-btn" data-action="vaultMode" data-mode="pass">I remember my passphrase</button></form>`;
    } else {
        body = `<form class="login-form" data-form="vaultUnlock"><h2>Unlock your data</h2>
            <small class="left-text">Your data is encrypted. Enter your data passphrase to open it on this device. You will not be asked again here.</small>
            ${pw('Data passphrase', 'pass', 'current-password')}
            <button class="btn primary wide" data-action="vaultUnlock" ${busy}>${v.busy ? 'Unlocking…' : 'Unlock'}</button>
            <button type="button" class="link-btn" data-action="vaultMode" data-mode="recovery">Forgot it? Use your recovery code</button></form>`;
    }
    return `<div class="login"><div class="logo">${icon('logo')}</div><h1>LifeDesk</h1>${body}
        <button class="link-btn" data-action="signOut">${icon('logout')} Sign out (${esc(S.user.contact)})</button></div>`;
}

/**
 * Shown over everything while there is no internet (and when the app is opened without it). It goes away by itself
 * when the connection returns. "Continue offline" is offered once the user's data is on this device: screens keep
 * working from the saved copy and changes are sent when the connection is back.
 */
function offlineScreen() {
    const n = state.net;
    const canContinue = state.status === 'ready' && !n.failedStart;
    return `<div class="offline" role="alertdialog" aria-labelledby="offline-title" aria-describedby="offline-text">
        <div class="offline-glow a"></div><div class="offline-glow b"></div><div class="offline-glow c"></div>
        <div class="offline-card">
            <div class="offline-art" aria-hidden="true">
                <span class="ring r1"></span><span class="ring r2"></span><span class="ring r3"></span>
                <span class="offline-icon"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 18.5c4.7-4.4 10.9-7 18-7 2.6 0 5.1 .35 7.5 1"/><path d="M42 18.5a26.3 26.3 0 0 0-4.6-3.6"/>
                    <path d="M12.5 25.5a16.8 16.8 0 0 1 8.3-4.3"/><path d="M35.5 25.5a16.9 16.9 0 0 0-5-3.3"/>
                    <path d="M18.8 32.2a8.2 8.2 0 0 1 10.4 0"/><circle cx="24" cy="38.2" r="1.6" fill="currentColor" stroke="none"/>
                    <path class="slash" d="M8 6l32 36"/></svg></span>
            </div>
            <small class="offline-chip"><i></i> No connection</small>
            <h1 id="offline-title">You're offline</h1>
            <p id="offline-text">${canContinue ? 'LifeDesk cannot reach the internet. Your data is safe on this device, and anything you change will be sent when you are back online.' : 'LifeDesk cannot reach the internet. Check your Wi-Fi or mobile data and it will open as soon as you are connected.'}</p>
            <div class="offline-actions">
                <button class="offline-btn primary" data-action="netRetry" ${n.checking ? 'disabled' : ''}>${n.checking ? '<span class="spin"></span> Checking…' : 'Try again'}</button>
                ${canContinue ? '<button class="offline-btn" data-action="netContinue">Continue offline</button>' : ''}
            </div>
            <ul class="offline-tips">
                <li>Check that Wi-Fi or mobile data is on</li><li>Turn off aeroplane mode</li><li>Move closer to your router, or try another network</li>
            </ul>
            <small class="offline-foot"><span class="dots"><i></i><i></i><i></i></span> Reconnecting automatically</small>
        </div>
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

// Back links return to the screen the user came from. trail = the screens visited, in order; going back pops it.
const trail = [];
const SCREEN_NAMES = { hub: 'LifeDesk', home: 'Home', menu: 'More', add: 'Add entry', daily: 'Daily', budget: 'Budget', pay: 'Payments', insights: 'Dashboards', reports: 'Reports',
    people: 'People & Loans', accounts: 'My accounts', assets: 'My assets', renewals: 'Renewal reminders', more: 'Account & backup' };
/** The link at the top of an inner screen: to the previous screen when there is one, otherwise to `fallback`. */
function backLink(fallback) {
    const prev = trail.length > 1 ? trail[trail.length - 2] : null;
    return prev
        ? `<a class="back" href="#${prev}" data-action="goBack">${icon('chevLeft')} ${esc(SCREEN_NAMES[prev] || 'Back')}</a>`
        : `<a class="back" href="#${fallback}">${icon('chevLeft')} ${esc(SCREEN_NAMES[fallback])}</a>`;
}

/** Tools on the start screen. ready: false shows the tile as coming soon. */
const TOOLS = [
    { id: 'money', name: 'Account Management', icon: 'coins', route: 'home', ready: true, about: 'Accounts, daily expenses, budget, people and loans' },
    { id: 'reminders', name: 'Renewal reminders', icon: 'bell', route: 'renewals', ready: true, about: 'Insurance, subscriptions, documents and bills that come up for renewal' }
];

function hub() {
    const t = L.totals(S.data);
    const m = L.monthSummary(S.data, thisMonth());
    const rc = renewalCounts();
    const tiles = TOOLS.map((tool) =>
        tool.ready
            ? `<a class="tool" href="#${tool.route}"><span class="tool-icon">${icon(tool.icon)}</span><span class="tool-text"><b>${tool.name}</b><small>${tool.about}</small>${tool.id === 'money' ? `<small class="tool-figure">Net balance ${L.money(t.net)} · spent ${L.money(m.expense)} this month</small>` : ''}${tool.id === 'reminders' ? `<small class="tool-figure">${rc.total ? [rc.overdue ? `${rc.overdue} overdue` : '', rc.soon ? `${rc.soon} due soon` : '', !rc.overdue && !rc.soon ? 'Nothing due soon' : ''].filter(Boolean).join(' · ') : 'Add your first reminder'}</small>` : ''}</span><span class="tool-go">${icon('chevRight')}</span></a>`
            : `<div class="tool soon"><span class="tool-icon">${icon(tool.icon)}</span><span class="tool-text"><b>${tool.name}</b><small>${tool.about}</small></span><span class="pill">Coming soon</span></div>`
    ).join('');
    return `<header class="hero">
        <small class="eyebrow">LifeDesk</small><h1>Hello, ${esc(S.user.name.split(' ')[0])}</h1>
        <p class="hero-sub">${new Date().toLocaleDateString(L.currentFormat().locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </header>
    <main>
        ${S.isDemo ? `<div class="notice">Demo mode: your data is saved only in this browser.</div>` : ''}
        ${rc.overdue || rc.soon ? `<a class="notice" href="#renewals">${[rc.overdue ? `${plural(rc.overdue, 'renewal')} overdue` : '', rc.soon ? `${plural(rc.soon, 'renewal')} due soon` : ''].filter(Boolean).join(' · ')} – tap to see</a>` : ''}
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
        <small class="eyebrow">Account Management</small><h1>${L.monthLabel(key)}</h1>
        <div class="stats">${stat('Income', L.money(m.income))}${stat('Expense', L.money(m.expense))}${stat('Net balance', L.money(t.net))}</div>
        <p class="hero-sub">Money in hand ${L.money(t.inHand)}${t.cardOwed ? ` · Card owed ${L.money(t.cardOwed)}` : ''}${t.owedToPeople ? ` · Owed to people ${L.money(t.owedToPeople)}` : ''}</p>
    </header>
    <main class="dash">
        <div class="shortcuts span">
            <a class="shortcut main" href="#add">${icon('plus')}<span>Add Entry</span></a>
            <a class="shortcut" href="#people">${icon('users')}<span>People &amp; Loans</span></a>
            <a class="shortcut" href="#budget">${icon('target')}<span>Budget</span></a>
            <a class="shortcut" href="#pay">${icon('card')}<span>Payments</span></a>
            <a class="shortcut" href="#daily">${icon('calendar')}<span>Daily</span></a>
            <a class="shortcut" href="#insights">${icon('chart')}<span>Dashboards</span></a>
            <a class="shortcut" href="#reports">${icon('table')}<span>Reports</span></a>
            <button class="shortcut" data-action="voiceOpen">${icon('mic')}<span>Voice entry</span></button>
        </div>
        ${dueEmis().length ? `<a class="notice span" href="#pay">${dueEmis().length} EMI${dueEmis().length > 1 ? 's' : ''} due this month – tap to pay</a>` : ''}
        ${t.cardOwed > 0 ? `<a class="notice span" href="#pay">Credit card owed ${L.money(t.cardOwed)} – tap to pay</a>` : ''}
        ${(() => { const w = netWorth(S.data, today()); return `<a class="card link span worth" href="#insights"><div class="card-head"><span><small>Net worth</small><b class="big">${L.money(w.worth)}</b></span>
            <span class="worth-parts"><small>Net balance ${L.money(w.net)}</small><small>+ owed to you ${L.money(w.toReceive)}</small><small>+ assets ${L.money(w.assets)}</small><small>− loans ${L.money(w.loans)}</small></span></div></a>`; })()}
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
        .map(([k, v]) => `<button class="tile-btn t-${k} ${f.type === k ? 'on' : ''}" data-action="setType" data-type="${k}" title="${v.label}" aria-pressed="${f.type === k}">${icon(v.icon)}<span>${v.short}</span></button>`)
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
            ${editing ? '' : dueList()}
            <div class="pane-head"><h2>${editing ? 'Edit entry' : 'New entry'}</h2><small>${L.TYPES[f.type].hint}</small>${editing ? '' : `<button class="btn voice-btn" data-action="voiceOpen">${icon('mic')} Speak it</button>`}</div>
            <div class="type-grid">${tiles}</div>
            <label class="amount ${L.TYPES[f.type].sign > 0 ? 'in' : L.TYPES[f.type].sign < 0 ? 'out' : ''}"><span>${esc(L.symbol())}</span><input inputmode="decimal" type="number" min="0" step="0.01" placeholder="0" value="${esc(f.amount)}" data-model="add.amount" aria-label="Amount"></label>
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
            ${f.type === 'asset' && !editing ? `<div class="grid2"><label>Kind of asset<select data-model="add.assetType">${L.ASSET_TYPES.map((x) => `<option ${x === f.assetType ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
                <label>What it is worth now (optional)<input type="number" inputmode="decimal" min="0" step="0.01" value="${esc(f.assetValue)}" data-model="add.assetValue" placeholder="same as the price"></label></div>
                <small>The description is used as the asset's name in My assets.</small>` : ''}
            ${emiBlock(f)}
            <label>Notes (optional)<input type="text" value="${esc(f.notes)}" data-model="add.notes"></label>
            <button class="btn primary wide" data-action="saveEntry">${editing ? 'Save changes' : f.onEmi && (f.type === 'expense' || f.type === 'asset') ? 'Save EMI purchase' : `Save ${L.TYPES[f.type].label}`}</button>
            ${editing ? `<div class="split"><button class="btn" data-action="cancelEdit">Cancel</button><button class="btn danger" data-action="deleteEntry">${icon('trash')} Delete entry</button></div>` : ''}
        </div>
        ${editing ? '' : `<div class="pane"><h3>Recent entries</h3>${recent.length
            ? `<section class="list">${recent.map((e) => entryRow(e, true)).join('')}</section>`
            : `<div class="empty-state">${icon('calendar')}<b>No entries yet</b><small>What you save appears here, newest first, ready to edit or delete.</small></div>`}</div>`}
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
    const cats = S.data.categories.filter((c) => (d.view === 'income' ? c.type === 'income' : d.view === 'spend' ? c.type === 'expense' : true)).sort((x, y) => x.name.localeCompare(y.name));
    const seg = (v, label) => `<button class="${d.view === v ? 'on' : ''}" data-action="dailyView" data-view="${v}">${label}</button>`;
    return `<header class="hero">
        <small class="eyebrow center">Daily Expenses</small>
        ${d.custom ? `<h1 class="center">${from && to ? `${shortDate(from)} – ${shortDate(to)}` : 'Custom dates'}</h1>` : monthNav(d.month, 'dailyMonth')}
        <div class="stats">${stat(d.view === 'income' ? 'Income' : d.view === 'spend' ? 'Spent' : 'Entries', d.view === 'all' ? count : L.money(total))}${stat('Per day', d.view === 'all' ? '–' : L.money(Math.round(total / span)))}${stat('Highest day', top && d.view !== 'all' ? `${shortDate(top.date)} · ${L.money(top.total)}` : '–')}</div>
    </header>
    <main>
        <div class="filterbar">
            <div class="seg">${seg('spend', 'Spending')}${seg('income', 'Income')}${seg('all', 'All entries')}</div>
            <label class="pick"><span>Category</span><select data-model="daily.category" data-rerender><option value="">All</option>${cats.map((c) => `<option value="${c.id}" ${c.id === d.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            <label class="pick"><span>Account</span><select data-model="daily.account" data-rerender><option value="">All</option>${sortedAccounts().map((a) => `<option value="${a.id}" ${a.id === d.account ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
            <label class="pick grow"><span>Search</span><input type="search" placeholder="description…" value="${esc(d.search)}" data-model="daily.search" data-rerender-soft></label>
        </div>
        <div class="toolbar">
            ${d.custom ? `<div class="filterbar"><label class="pick"><span>From</span><input type="date" value="${esc(d.from)}" max="${today()}" data-model="daily.from" data-rerender></label><label class="pick"><span>To</span><input type="date" value="${esc(d.to)}" max="${today()}" data-model="daily.to" data-rerender></label><button class="link-btn" data-action="dailyCustom">Back to months</button></div>`
                : `<button class="link-btn" data-action="dailyCustom">${icon('calendar')} Custom dates</button>`}
            ${days.length ? `<button class="link-btn" data-action="dailyToggleAll">${d.closed.size ? 'Expand all' : 'Collapse all'}</button>` : ''}
        </div>
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
    const plan = (r) => Number(value(r)) || 0;
    const planned = rows.reduce((s, r) => s + plan(r), 0);
    const spent = rows.reduce((s, r) => s + r.spent, 0);
    const income = L.monthSummary(S.data, L.addMonths(b.month, -1)).income;
    // In use first (largest budget on top), then the categories with nothing this month, A to Z.
    const inUse = rows.filter((r) => r.planned || r.spent).sort((x, y) => y.planned - x.planned || y.spent - x.spent || x.name.localeCompare(y.name));
    const unused = rows.filter((r) => !r.planned && !r.spent).sort((x, y) => x.name.localeCompare(y.name));
    const line = (r) => {
        const p = plan(r);
        const pct = p ? Math.min(100, Math.round((r.spent / p) * 100)) : r.spent ? 100 : 0;
        const colour = p ? (r.spent > p ? 'red' : pct >= 90 ? 'orange' : '') : r.spent ? 'red' : '';
        const open = b.open === r.id;
        const entries = open ? S.data.entries.filter((e) => e.type === 'expense' && e.categoryId === r.id && L.monthKey(e.date) === b.month).sort((x, y) => (x.date < y.date ? 1 : -1)) : [];
        const left = p - r.spent;
        return `<div class="budget-row ${open ? 'open' : ''}">
            <div class="b-name"><b>${esc(r.name)}</b><small>${r.lastMonth || r.average ? `Last month ${L.money(r.lastMonth)} · 3-month avg ${L.money(r.average)}` : 'No recent spend'}</small></div>
            <div class="b-progress">${p || r.spent ? `<div class="bar"><i class="${colour}" style="width:${pct}%"></i></div>
                <small>${L.money(r.spent)}${p ? ` of ${L.money(p)}` : ''} spent${p ? ` · <span class="${left < 0 ? 'over' : ''}">${left < 0 ? `${L.money(-left)} over` : `${L.money(left)} left`}</span>` : ' · no budget'}${r.spent ? ` · <button class="link-btn" data-action="budgetOpen" data-id="${r.id}">${open ? 'Hide entries' : 'See entries'}</button>` : ''}</small>` : '<small>Nothing planned or spent</small>'}</div>
            <label class="mini">${esc(L.symbol())}<input type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${esc(value(r))}" data-budget="${r.id}" aria-label="Budget for ${esc(r.name)}"></label>
            ${open ? `<div class="b-entries list inner">${entries.map((e) => entryRow(e, true)).join('') || '<p class="empty">No expenses yet.</p>'}<div class="row total"><span class="row-text"><b>Total</b></span><span class="amt">${L.money(r.spent)}</span></div></div>` : ''}
        </div>`;
    };
    const table = (title, list) => (list.length ? `<h3>${title}</h3><section class="list btable"><div class="b-head"><span>Category</span><span>Spent this month</span><span>Budget</span></div>${list.map(line).join('')}</section>` : '');
    const dirty = !!b.edits;
    return `<header class="hero">
        <small class="eyebrow center">Budget</small>${monthNav(b.month, 'budgetMonth')}
        <div class="stats">${stat('Planned', L.money(planned))}${stat('Spent so far', L.money(spent))}${stat('Last month income', L.money(income))}</div>
    </header>
    <main>
        <div class="toolbar"><div class="split wrap"><button class="btn" data-action="budgetCopy">Copy last month</button><button class="btn" data-action="budgetAverage">Use 3-month average</button></div>
            <button class="btn primary wide-only" data-action="budgetSave" ${dirty ? '' : 'disabled'}>${dirty ? 'Save budget' : 'Budget saved'}</button></div>
        ${table('In use this month', inUse)}
        ${table(inUse.length ? 'Other categories' : 'Categories', unused)}
        <div class="savebar" ${dirty ? '' : 'hidden'}><span>You have unsaved budget changes.</span><button class="btn primary" data-action="budgetSave">Save budget</button></div>
    </main>`;
}

/** My assets: what you own, what it cost, what it is worth, and the loan on it. */
function assetsView() {
    const st = state.assets;
    const rows = S.data.assets.map((a) => {
        const loan = a.loanId ? loanRows().find((l) => l.id === a.loanId) : null;
        return { ...a, loan, net: Number(a.value) - (loan ? loan.principalLeft : 0) };
    }).sort((x, y) => Number(y.value) - Number(x.value));
    const owned = rows.filter((a) => a.status !== 'Sold');
    const sum = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
    const f = st.form;
    const list = rows.map((a) => `<div class="acct-row">
        <div class="a-name"><span class="row-icon">${icon('asset')}</span><span><b>${esc(a.name)}</b><small>${[esc(a.type), a.boughtOn ? `bought ${longDate(a.boughtOn)}` : '', a.status === 'Sold' ? 'Sold' : ''].filter(Boolean).join(' · ')}</small></span></div>
        <div class="a-detail"><small>Price paid ${L.money(a.price)}${a.loan ? ` · loan left ${L.money(a.loan.principalLeft)} (${a.loan.left} EMIs)` : ' · no loan'}</small>
            ${a.loan ? `<small>Interest paid ${L.money(a.loan.interestPaid)} · interest still to pay ${L.money(a.loan.interestLeft)}</small>` : ''}</div>
        <div class="a-bal"><b class="big">${L.money(a.value)}</b><small>worth now</small></div>
        <div class="a-actions"><button class="btn" data-action="assetEdit" data-id="${a.id}">Edit</button><button class="btn ghost danger" data-action="assetDelete" data-id="${a.id}">Delete</button></div>
    </div>`).join('');
    return `<header class="hero">
        ${backLink('menu')}
        <small class="eyebrow">My assets</small><h1>What you own</h1>
        <div class="stats">${stat('Worth now', L.money(sum(owned, (a) => Number(a.value))))}${stat('Loans on assets', L.money(sum(owned, (a) => (a.loan ? a.loan.principalLeft : 0))))}${stat('Net value', L.money(sum(owned, (a) => a.net)))}</div>
    </header>
    <main>
        ${f ? `<section class="card form"><h3>${f.id ? 'Edit asset' : 'Add an asset you already own'}</h3>
            <div class="grid3"><label>Name<input type="text" value="${esc(f.name)}" data-model="assets.form.name"></label>
            <label>Kind<select data-model="assets.form.type">${L.ASSET_TYPES.map((x) => `<option ${x === f.type ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label>Status<select data-model="assets.form.status">${['Owned', 'Sold'].map((x) => `<option ${x === f.status ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label>Price paid<input type="number" inputmode="decimal" min="0" value="${esc(f.price)}" data-model="assets.form.price"></label>
            <label>Worth now<input type="number" inputmode="decimal" min="0" value="${esc(f.value)}" data-model="assets.form.value"></label>
            <label>Bought on<input type="date" max="${today()}" value="${esc(f.boughtOn || '')}" data-model="assets.form.boughtOn"></label></div>
            <small>Adding an asset here does not take money from an account. To record a purchase, use Add Entry → Asset.</small>
            <div class="split"><button class="btn" data-action="assetCancel">Cancel</button><button class="btn primary" data-action="assetSave">Save</button></div></section>`
            : `<div class="toolbar"><div class="split wrap"><a class="btn primary" href="#add">${icon('plus')} Buy an asset</a><button class="btn" data-action="assetNew">Add one I already own</button></div></div>`}
        ${list ? `<section class="list atable">${list}</section>` : `<div class="empty-state">${icon('asset')}<b>No assets yet</b><small>On Add Entry choose Asset to record a purchase, or add something you already own.</small></div>`}
    </main>`;
}

/** Payments: EMIs and credit card bills in one place, with what was paid recently. */
function payView() {
    const loans = loanRows().filter((l) => l.left).sort((a, b) => (a.next < b.next ? -1 : 1));
    const cards = activeAccounts().filter((a) => a.kind === 'card').map((a) => ({ ...a, owed: Math.max(0, -L.accountBalance(a, S.data.entries)) }));
    const isCardPay = (e) => e.type === 'transfer' && (byId(S.data.accounts, e.toAccountId) || {}).kind === 'card';
    const paid = S.data.entries.filter((e) => e.loanId || isCardPay(e)).sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
    const month = thisMonth();
    const dueNow = dueEmis();
    const sum = (list, fn) => list.reduce((t, x) => t + fn(x), 0);
    const p = state.accounts.pay;
    const loanList = loans.map((l) => {
        const due = l.due.length;
        return `<div class="acct-row">
            <div class="a-name"><span class="row-icon">${icon('repaid')}</span><span><b>${esc(l.name)}</b><small>EMI ${l.paid + 1} of ${l.months} · from ${esc(accountName(l.accountId))}</small></span></div>
            <div class="a-detail"><small>${l.next < today() ? `<span class="over">${due > 1 ? `${due} EMIs overdue` : 'Overdue'}</span> · was due ${longDate(l.next)}` : due ? `Due this month · ${longDate(l.next)}` : `Next ${longDate(l.next)}`}</small><small>${L.money(l.outstanding)} still to pay</small></div>
            <div class="a-bal"><b class="big">${L.money(l.emi)}</b><small>EMI</small></div>
            <div class="a-actions"><button class="btn ${due ? 'primary' : ''}" data-action="payEmi" data-id="${l.id}">${due ? 'Pay EMI' : 'Pay early'}</button></div>
        </div>`;
    }).join('');
    const cardList = cards.map((a) => `<div class="acct-row ${p && p.cardId === a.id ? 'open' : ''}">
            <div class="a-name"><span class="row-icon">${icon('card')}</span><span><b>${esc(a.name)}</b><small>${a.dueDay ? `Bill due on ${a.dueDay}` : 'Credit card'}</small></span></div>
            <div class="a-detail">${a.limit ? `<small>${L.money(a.limit - a.owed)} left of ${L.money(a.limit)}</small>` : ''}</div>
            <div class="a-bal"><b class="big">${L.money(a.owed)}</b><small>owed</small></div>
            <div class="a-actions">${a.owed > 0 ? `<button class="btn primary" data-action="payOpen" data-id="${a.id}">Pay bill</button>` : '<small>Nothing owed</small>'}</div>
            ${p && p.cardId === a.id ? `<div class="a-panel">${payForm(a, a.owed)}</div>` : ''}
        </div>`).join('');
    return `<header class="hero">
        ${backLink('menu')}
        <small class="eyebrow">Payments</small><h1>EMIs and card bills</h1>
        <div class="stats">${stat('EMIs due now', L.money(sum(dueNow, (d) => Number(d.loan.emi))))}${stat('Card owed', L.money(sum(cards, (a) => a.owed)))}${stat('Paid this month', L.money(sum(paid.filter((e) => L.monthKey(e.date) === month), (e) => Number(e.amount))))}</div>
    </header>
    <main>
        <h3>EMIs</h3>
        ${loanList ? `<section class="list atable">${loanList}</section>` : `<div class="empty-state">${icon('repaid')}<b>No EMIs to pay</b><small>Loans appear here when you buy something on EMI from Add Entry.</small></div>`}
        <small>An EMI you pay is recorded as an expense under loan payments, so it shows in your spending and budget.</small>
        <h3>Credit card bills</h3>
        ${cardList ? `<section class="list atable">${cardList}</section>` : `<div class="empty-state">${icon('card')}<b>No credit cards</b><small>Add a card under My accounts.</small></div>`}
        <small>Paying a card bill moves money from your account to the card. It is not counted as a new expense, because what you bought with the card was already counted on the day you bought it.</small>
        <h3>Paid recently</h3>
        ${paid.length ? `<section class="list">${paid.slice(0, 15).map((e) => entryRow(e, true)).join('')}</section>` : '<p class="empty">Nothing paid yet.</p>'}
    </main>`;
}

// ---------- push notifications (renewal reminders, start of month) ----------
// This device is "on" when it has saved its notification address here. The account-wide settings and the due dates
// live in S.push (users/{uid}/push/schedule), the only unencrypted record.
const pushSlot = () => `lifedesk-push-${S.user.uid}`;
const pushDevice = () => {
    try {
        return localStorage.getItem(pushSlot());
    } catch (e) {
        return null;
    }
};
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
/** null when this browser can take notifications, otherwise why not, in words. */
function pushBlocker() {
    if (!PUSH.enabled) {
        return 'Notifications are not set up for this site yet.';
    }
    if (isIos() && !isStandalone()) {
        return 'On iPhone and iPad, first add LifeDesk to the Home Screen (Share → Add to Home Screen), open it from there, then turn this on.';
    }
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return 'This browser cannot show notifications. Try Chrome, Edge, Firefox or Safari.';
    }
    if (Notification.permission === 'denied') {
        return 'Notifications are blocked for LifeDesk in this browser. Allow them in the browser or phone settings, then try again.';
    }
    return null;
}
/** What the sender needs and nothing more: due date and remind-me days of each open reminder. */
// With "include names and amounts in emails" ticked, name and amount go along as plain text (the email server must read them).
const pushDates = (on = !(S.push && S.push.renewals === false), named = !!(S.push && S.push.email && S.push.emailDetails)) => (!on ? [] : S.data.reminders.filter((r) => !r.done && r.due)
    .map((r) => ({ due: r.due, remind: Number(r.remindDays ?? 30), ...(named ? { name: r.name, amount: Number(r.amount) ? L.money(r.amount) : '' } : {}) }))
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : String(a.name || '').localeCompare(String(b.name || '')))));
const pushZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let pushTimer = null;
/** Keeps the dates in the schedule in step with the reminders, from whichever device changes them. */
function syncPushSoon() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
        if (S.isDemo || !S.push || state.status !== 'ready') {
            return;
        }
        const dates = pushDates();
        if (JSON.stringify(dates) !== JSON.stringify(S.push.dates || []) || S.push.tz !== pushZone()) {
            await S.pushUpdate({ dates, tz: pushZone() }).catch((e) => console.error(e));
        }
    }, 1200);
}

/**
 * Once per sign-in: a device that has notifications on checks that its address is still listed and current. The
 * address changes or dies when the browser resets the background script, and the sender drops dead ones; without
 * this the device would show "on" but get nothing.
 */
async function repairPushDevice() {
    const saved = pushDevice();
    if (!saved || !S.push || pushBlocker() || Notification.permission !== 'granted') {
        return;
    }
    const token = await S.pushToken(PUSH.vapidKey);
    if (token !== saved || !(S.push.tokens || []).includes(token)) {
        await S.pushSwap(saved, token);
        localStorage.setItem(pushSlot(), token);
        render();
    }
}

function notificationsCard() {
    if (S.isDemo) {
        return `<section class="card"><div class="card-head"><h2>Notifications</h2><span class="pill">Off</span></div>
            <small>Sign in to get a notification or email when a renewal is due and at the start of each month. Demo mode has no account to send them to.</small></section>`;
    }
    const on = !!pushDevice() && !!S.push;
    const p = S.push || {};
    const mail = !!p.email;
    const busy = state.push.busy ? 'disabled' : '';
    const blocker = on ? null : pushBlocker();
    const pill = [on ? 'This device' : '', mail ? 'Email' : ''].filter(Boolean).join(' + ') || 'Off';
    return `<section class="card"><div class="card-head"><h2>Notifications</h2><span class="pill">${pill}</span></div>
        <small>Around 9 in the morning, your time, when a renewal is due and at the start of each month, even when LifeDesk is closed.</small>
        <b class="sub">On this device</b>
        ${on ? `<small>${(p.tokens || []).length > 1 ? `On. ${(p.tokens || []).length} devices get them.` : 'On. Only this device gets them; turn them on on your other devices too.'}</small>
            <div class="split wrap"><button class="btn" data-action="pushTest" ${busy}>Show a test notification</button><button class="btn ghost danger" data-action="pushOff" ${busy}>Turn off on this device</button></div>`
            : blocker ? `<small class="over">${esc(blocker)}</small>` : `<div class="split wrap"><button class="btn primary" data-action="pushOn" ${busy}>${icon('bell')} Turn on for this device</button></div>`}
        <b class="sub">By email</b>
        <label class="check"><input type="checkbox" data-action="emailToggle" ${mail ? 'checked' : ''} ${busy}> Also send them by email to ${esc(S.user.contact)}</label>
        ${mail ? `<label class="check"><input type="checkbox" data-action="emailDetails" ${p.emailDetails ? 'checked' : ''} ${busy}> Include reminder names and amounts in emails</label>
            <small>${p.emailDetails ? 'Names and amounts of your reminders are kept readable for the email sender. The rest of your data stays encrypted.' : 'Off: emails say when a renewal is due, not which one, because names and amounts are encrypted.'}</small>` : ''}
        ${on || mail ? `<b class="sub">What to send</b>
            <label class="check"><input type="checkbox" data-action="pushPref" data-pref="renewals" ${p.renewals !== false ? 'checked' : ''} ${busy}> Renewal reminders: every day from the remind-me day until you press Renewed (also while overdue)</label>
            <label class="check"><input type="checkbox" data-action="pushPref" data-pref="monthStart" ${p.monthStart !== false ? 'checked' : ''} ${busy}> Start of each month: a nudge to look at last month</label>` : ''}
        <small>Privacy: to know when to remind you, the due dates of your reminders are kept without encryption${p.emailDetails ? ', and so are their names and amounts (you chose to include them in emails)' : ', with nothing else: no names, amounts or notes'}. All of it is deleted when you turn off notifications on your last device and email.</small>
    </section>`;
}

// ---------- Renewal reminders (its own tool: data in the "reminders" collection) ----------
const remRows = () => S.data.reminders.map((r) => ({ ...r, ...L.reminderStatus(r, today()) })).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.name.localeCompare(b.name)));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Due in 4 days", "Due today", "Overdue by 3 days": the state in words, not left to colour. */
function dueWords(r) {
    if (r.state === 'done') {
        return `Renewed${r.lastRenewed ? ` ${longDate(r.lastRenewed)}` : ''} · no repeat`;
    }
    if (r.state === 'overdue') {
        return `<span class="over">Overdue by ${plural(-r.days, 'day')}</span> · was due ${longDate(r.due)}`;
    }
    const when = r.days === 0 ? 'Due today' : r.days === 1 ? 'Due tomorrow' : `Due in ${plural(r.days, 'day')}`;
    return `${r.state === 'soon' ? `<b class="soon">${when}</b>` : when} · ${longDate(r.due)}`;
}

/** [collection, id] pairs of the sample reminders now in the data. */
const sampleReminders = () => sampleDocs(S.data).filter(([c]) => c === 'reminders');

/** Hub figure and notice: how many reminders need attention. */
function renewalCounts() {
    const rows = remRows();
    return { overdue: rows.filter((r) => r.state === 'overdue').length, soon: rows.filter((r) => r.state === 'soon').length, total: rows.filter((r) => r.state !== 'done').length };
}

function renewForm(r) {
    const f = state.renewals.renew;
    const pays = activeAccounts();
    const cats = S.data.categories.filter((c) => c.type === 'expense').sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="form">
        ${Number(r.repeat) > 0
            ? `<label>Next due date<input type="date" value="${esc(f.next)}" data-model="renewals.renew.next"></label><small>${esc(L.repeatLabel(r.repeat))}: worked out from the current due date. Change it if the new period starts on another day.</small>`
            : '<small>This is a one-time reminder. After renewing, it moves to Done.</small>'}
        <label class="check"><input type="checkbox" data-action="remRecord" ${f.record ? 'checked' : ''}> Record the payment in Account Management as an expense</label>
        ${f.record ? `<div class="grid3">
            <label>Amount paid<input type="number" inputmode="decimal" min="0" value="${esc(f.amount)}" data-model="renewals.renew.amount"></label>
            <label>Paid from<select data-model="renewals.renew.accountId"><option value="">Choose an account</option>${pays.map((a) => `<option value="${a.id}" ${a.id === f.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
            <label>Category<select data-model="renewals.renew.categoryId"><option value="">Choose a category</option>${cats.map((c) => `<option value="${c.id}" ${c.id === f.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
            <small>Saved with today's date, so it shows in Daily expenses, the budget and reports.</small>` : ''}
        <div class="split"><button class="btn" data-action="remRenewCancel">Cancel</button><button class="btn primary" data-action="remRenewSave">Mark renewed</button></div>
    </div>`;
}

// Reminder rows move: one that is deleted, renewed or removed fades and slides away before the list closes over it;
// one that is added, or lands in a new group, opens up and fades in with a short highlight (css/ios.css).
// The screen is redrawn whenever the data changes, so each row is told how far into its movement it already is.
const REM_LEAVE_MS = 420;
const REM_ARRIVE_MS = 1800;
let remArriveTimer = null;
function remLeave(ids) {
    state.renewals.leaving = ids;
    state.renewals.leavingAt = Date.now();
    render();
    return new Promise((resolve) => window.setTimeout(resolve, REM_LEAVE_MS));
}
function remArrive(ids) {
    window.clearTimeout(remArriveTimer);
    state.renewals.leaving = [];
    state.renewals.arrived = ids;
    state.renewals.arrivedAt = Date.now();
    remArriveTimer = window.setTimeout(() => {
        state.renewals.arrived = [];
    }, REM_ARRIVE_MS);
}
function remMotion(id) {
    const st = state.renewals;
    if (st.leaving.includes(id)) {
        return { cls: 'rem-leaving', style: `style="animation-delay:-${Date.now() - st.leavingAt}ms"` };
    }
    if (st.arrived.includes(id) && Date.now() - st.arrivedAt < REM_ARRIVE_MS) {
        return { cls: 'rem-arrived', style: `style="animation-delay:-${Date.now() - st.arrivedAt}ms"` };
    }
    return { cls: '', style: '' };
}

function renewals() {
    const st = state.renewals;
    const rows = remRows();
    const groups = [['overdue', 'Overdue'], ['soon', 'Due soon'], ['later', 'Later']];
    const f = st.form;
    const row = (r) => `<div class="acct-row rem-${r.state} ${st.renew && st.renew.id === r.id ? 'open' : ''} ${remMotion(r.id).cls}" ${remMotion(r.id).style} data-rem="${r.id}">
        <div class="a-name"><span class="row-icon">${icon('bell')}</span><span><b>${esc(r.name)}</b><small>${[esc(r.kind), esc(L.repeatLabel(r.repeat)), r.state === 'done' ? '' : `remind ${plural(Number(r.remindDays ?? 30), 'day')} before`].filter(Boolean).join(' · ')}</small></span></div>
        <div class="a-detail"><small>${dueWords(r)}</small>${r.notes ? `<small>${esc(r.notes)}</small>` : ''}</div>
        <div class="a-bal"><b class="big">${Number(r.amount) ? L.money(r.amount) : '–'}</b><small>${Number(r.amount) ? (Number(r.repeat) ? 'each time' : 'once') : 'no cost'}</small></div>
        <div class="a-actions">${r.state === 'done'
            ? `<button class="btn" data-action="remUndo" data-id="${r.id}">Undo</button>`
            : `<button class="btn ${r.state === 'later' ? '' : 'primary'}" data-action="remRenewOpen" data-id="${r.id}">Renewed</button><button class="btn" data-action="remEdit" data-id="${r.id}">Edit</button>`}<button class="btn ghost danger" data-action="remDelete" data-id="${r.id}">Delete</button></div>
        ${st.renew && st.renew.id === r.id ? `<div class="a-panel">${renewForm(r)}</div>` : ''}
    </div>`;
    const lists = groups.map(([key, title]) => {
        const list = rows.filter((r) => r.state === key);
        return list.length ? `<h3>${title} · ${list.length}</h3><section class="list atable">${list.map(row).join('')}</section>` : '';
    }).join('');
    const done = rows.filter((r) => r.state === 'done');
    const c = renewalCounts();
    return `<header class="hero">
        <a class="back" href="#hub">${icon('chevLeft')} LifeDesk</a>
        <small class="eyebrow">Renewal reminders</small><h1>What comes up next</h1>
        <div class="stats">${stat('Overdue', c.overdue)}${stat('Due soon', c.soon)}${stat('Yearly cost', L.money(L.yearlyCost(S.data.reminders)))}</div>
    </header>
    <main>
        ${f ? `<section class="card form"><h3>${f.id ? 'Edit reminder' : 'New reminder'}</h3>
            <div class="grid3"><label>Name<input type="text" value="${esc(f.name)}" placeholder="e.g. Car insurance" data-model="renewals.form.name"></label>
            <label>Kind<select data-model="renewals.form.kind">${L.REMINDER_KINDS.map((x) => `<option ${x === f.kind ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
            <label>Due or expiry date<input type="date" value="${esc(f.due)}" data-model="renewals.form.due"></label>
            <label>Repeats<select data-model="renewals.form.repeat">${L.REPEATS.map(([m, label]) => `<option value="${m}" ${m === Number(f.repeat) ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <label>Amount (optional)<input type="number" inputmode="decimal" min="0" value="${esc(f.amount)}" data-model="renewals.form.amount"></label>
            <label>Remind me<select data-model="renewals.form.remindDays">${L.REMIND_DAYS.map((d) => `<option value="${d}" ${d === Number(f.remindDays) ? 'selected' : ''}>${plural(d, 'day')} before</option>`).join('')}</select></label>
            <label>Usually paid from (optional)<select data-model="renewals.form.accountId"><option value="">No account</option>${activeAccounts().map((a) => `<option value="${a.id}" ${a.id === f.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
            <label class="span2">Notes (optional)<input type="text" value="${esc(f.notes)}" placeholder="e.g. policy number, where the papers are" data-model="renewals.form.notes"></label></div>
            <div class="split"><button class="btn" data-action="remCancel">Cancel</button><button class="btn primary" data-action="remSave">Save</button></div></section>`
            : `<div class="toolbar"><div class="split wrap"><button class="btn primary" data-action="remNew">${icon('plus')} Add reminder</button>${sampleReminders().length
                ? `<button class="btn ghost danger" data-action="remSampleRemove">Remove sample reminders</button>`
                : `<button class="btn" data-action="remSampleLoad">Add sample reminders</button>`}</div></div>`}
        ${!S.isDemo && !(pushDevice() && S.push) && c.total ? `<a class="notice" href="#more">${icon('bell')} Get a notification when a renewal is due, even with LifeDesk closed – turn on under Account</a>` : ''}
        ${c.total ? lists : `<div class="empty-state">${icon('bell')}<b>No reminders yet</b><small>Add insurance, subscriptions, documents like a passport or licence, a vehicle service or a warranty. LifeDesk shows each one when it is coming up.</small></div>`}
        ${done.length ? `<div class="toolbar"><button class="btn ghost" data-action="remShowDone">${st.showDone ? 'Hide' : 'Show'} done · ${done.length}</button></div>${st.showDone ? `<section class="list atable">${done.map(row).join('')}</section>` : ''}` : ''}
        <small>A reminder shows under Due soon from the number of days before its date you chose. With notifications or email on (Account → Notifications), you get a reminder every morning from then until you press Renewed. Repeating ones then move to their next date.</small>
    </main>`;
}

function loansView() {
    const s = state.people;
    const loans = loanRows().sort((a, b) => b.outstanding - a.outstanding);
    const seg = (v, label) => `<button class="${s.view === v ? 'on' : ''}" data-action="peopleView" data-view="${v}">${label}</button>`;
    const rows = loans.map((l) => `<div class="acct-row">
        <div class="a-name"><span class="row-icon">${icon('repaid')}</span><span><b>${esc(l.name)}</b><small>${[l.lender ? esc(l.lender) : '', `${l.rate}% a year${l.rateCalculated ? ' (calculated)' : ''}`, `financed ${L.money(l.financed)}`, `interest paid ${L.money(l.interestPaid)}, to pay ${L.money(l.interestLeft)}`].filter(Boolean).join(' · ')}</small></span></div>
        <div class="a-detail"><div class="bar"><i style="width:${Math.round((l.paid / l.months) * 100)}%"></i></div><small>${l.paid} of ${l.months} EMIs paid · ${l.left ? `next ${longDate(l.next)}` : 'fully paid'}</small></div>
        <div class="a-bal"><b class="big">${L.money(l.outstanding)}</b><small>${l.left} × ${L.money(l.emi)} to pay</small></div>
        <div class="a-actions">${l.left ? `<button class="btn primary" data-action="payEmi" data-id="${l.id}">Pay EMI</button>` : ''}<button class="btn ghost danger" data-action="loanDelete" data-id="${l.id}">Delete</button></div>
    </div>`).join('');
    return `<header class="hero">
        ${backLink('menu')}
        <small class="eyebrow">People &amp; Loans</small><h1>Loans on EMI</h1>
        <div class="stats">${stat('Still to pay', L.money(loans.reduce((t, l) => t + l.outstanding, 0)))}${stat('EMI per month', L.money(loans.filter((l) => l.left).reduce((t, l) => t + Number(l.emi), 0)))}${stat('Loans', loans.length)}</div>
    </header>
    <main>
        <div class="toolbar"><div class="seg fit">${seg('owesMe', 'Owe me')}${seg('iOwe', 'I owe')}${seg('loans', 'Loans')}</div><a class="btn primary" href="#add">${icon('plus')} Buy on EMI</a></div>
        ${rows ? `<section class="list atable">${rows}</section>` : `<div class="empty-state">${icon('repaid')}<b>No loans yet</b><small>On Add Entry, choose Expense and tick "Bought on EMI / finance".</small></div>`}
    </main>`;
}

function people() {
    const s = state.people;
    if (s.view === 'loans') {
        return loansView();
    }
    const t = L.totals(S.data);
    const list = S.data.people
        .filter((p) => p.direction === s.view)
        .map((p) => ({ ...p, out: L.personOutstanding(p, S.data.entries) }))
        .sort((a, b) => b.out - a.out || a.name.localeCompare(b.name));
    const seg = (v, label) => `<button class="${s.view === v ? 'on' : ''}" data-action="peopleView" data-view="${v}">${label}</button>`;
    const initials = (name) => name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
    const rows = list
        .map((p) => {
            const open = s.selected === p.id;
            const status = p.status || 'Active';
            const history = open ? S.data.entries.filter((e) => e.personId === p.id).sort((a, b) => (a.date < b.date ? 1 : -1)) : [];
            const quick = p.direction === 'owesMe' ? [['gotback', 'Got money back'], ['lent', 'Gave more']] : [['repaid', 'Paid back'], ['borrowed', 'Borrowed more']];
            const form = open && s.form;
            return `<div class="person ${open ? 'open' : ''}">
                <button class="card-head p-head" data-action="personOpen" data-id="${p.id}" aria-expanded="${open}">
                    <span class="avatar">${esc(initials(p.name))}</span>
                    <span class="p-name"><b>${esc(p.name)}</b><small>${p.direction === 'owesMe' ? 'Owes you' : 'You owe'}</small></span>
                    <span class="badge ${status === 'Bad Debt' ? 'bad' : status === 'Settled' ? 'done' : ''}">${status}</span>
                    <b class="big">${L.money(p.out)}</b>${icon(open ? 'chevDown' : 'chevRight')}
                </button>
                ${open ? `<div class="p-panel">
                    <div class="pane">
                        <div class="split wrap">${quick.map(([k, label]) => `<button class="btn ${k === quick[0][0] ? 'primary' : ''}" data-action="personForm" data-type="${k}">${label}</button>`).join('')}</div>
                        ${form ? `<div class="form"><h3>${esc(form.label)}</h3>
                            <label class="amount small"><span>${esc(L.symbol())}</span><input type="number" inputmode="decimal" min="0" step="0.01" value="${esc(form.amount)}" data-model="people.form.amount" aria-label="Amount"></label>
                            <div class="grid2"><label>Date<input type="date" max="${today()}" value="${esc(form.date)}" data-model="people.form.date"></label>
                            <label>${L.TYPES[form.type].sign > 0 ? 'Received into' : 'Paid from'}<select data-model="people.form.accountId">${activeAccounts().filter((a) => a.kind !== 'card').map((a) => `<option value="${a.id}" ${a.id === form.accountId ? 'selected' : ''}>${esc(a.name)} (${L.money(L.accountBalance(a, S.data.entries))})</option>`).join('')}</select></label></div>
                            <div class="split"><button class="btn" data-action="personFormCancel">Cancel</button><button class="btn primary" data-action="personFormSave">Save</button></div></div>` : ''}
                        <h3>Status</h3><div class="seg fit">${['Active', 'Settled', 'Bad Debt'].map((x) => `<button class="${x === status ? 'on' : ''}" data-action="personStatus" data-status="${x}">${x}</button>`).join('')}</div>
                        <div class="grid2"><label>Phone<input type="tel" value="${esc(p.phone || '')}" data-person-field="phone" data-id="${p.id}"></label>
                        <label>Notes<input type="text" value="${esc(p.notes || '')}" data-person-field="notes" data-id="${p.id}"></label></div>
                        ${history.length ? '' : `<div><button class="btn ghost danger" data-action="personDelete" data-id="${p.id}">${icon('trash')} Delete person</button></div>`}
                    </div>
                    <div class="pane"><h3>History</h3><div class="list">${history.map((e) => entryRow(e, true)).join('') || `<p class="empty">No entries yet.${p.opening ? ` Balance comes from the opening amount of ${L.money(p.opening)}.` : ''}</p>`}</div></div>
                </div>` : ''}
            </div>`;
        })
        .join('');
    return `<header class="hero">
        ${backLink('menu')}
        <small class="eyebrow">People &amp; Loans</small><h1>Who owes whom</h1>
        <div class="stats">${stat('To receive', L.money(t.toReceive))}${stat('I owe', L.money(t.owedToPeople))}${stat('People', S.data.people.length)}</div>
    </header>
    <main>
        <div class="toolbar"><div class="seg fit">${seg('owesMe', 'Owe me')}${seg('iOwe', 'I owe')}${seg('loans', 'Loans')}</div>
        ${s.adding ? '' : `<button class="btn primary" data-action="personAddToggle">${icon('plus')} Add person</button>`}</div>
        ${s.adding ? `<section class="card form"><h3>Add person</h3>
            <div class="grid3"><label>Name<input type="text" id="np-name"></label>
            <label>${s.view === 'owesMe' ? 'They already owe you (optional)' : 'You already owe them (optional)'}<input type="number" inputmode="decimal" min="0" id="np-opening" placeholder="0"></label>
            <label>Phone (optional)<input type="tel" id="np-phone"></label></div>
            <div class="split"><button class="btn" data-action="personAddToggle">Cancel</button><button class="btn primary" data-action="personAddSave">Add</button></div></section>` : ''}
        ${rows ? `<section class="list ptable">${rows}</section>`
            : `<div class="empty-state">${icon('users')}<b>${s.view === 'owesMe' ? 'Nobody owes you' : 'You owe nobody'}</b><small>Add a person, or record a Lent or Borrowed entry, and they appear here.</small></div>`}
    </main>`;
}

function accounts() {
    const s = state.accounts;
    const t = L.totals(S.data);
    const list = sortedAccounts().filter((a) => s.showClosed || a.active !== false);
    const row = (a) => {
        const bal = L.accountBalance(a, S.data.entries);
        const owed = Math.max(0, -bal);
        const isCard = a.kind === 'card';
        const used = isCard && a.limit ? Math.min(100, Math.round((owed / a.limit) * 100)) : 0;
        const meta = [a.last4 ? `•••• ${esc(a.last4)}` : '', isCard && a.dueDay ? `Bill due on ${a.dueDay}` : '', a.isDefault ? 'Default' : '', a.active === false ? 'Closed' : ''].filter(Boolean).join(' · ') || L.ACCOUNT_KINDS[a.kind];
        const paying = s.pay && s.pay.cardId === a.id;
        return `<div class="acct-row ${paying ? 'open' : ''}">
            <div class="a-name"><span class="row-icon">${icon(KIND_ICON[a.kind])}</span><span><b>${esc(a.name)}</b><small>${meta}</small></span></div>
            <div class="a-detail">${isCard && a.limit ? `<div class="bar"><i class="${used >= 90 ? 'red' : used >= 70 ? 'orange' : ''}" style="width:${used}%"></i></div><small>${L.money(a.limit - owed)} left of ${L.money(a.limit)}</small>` : ''}</div>
            <div class="a-bal"><b class="big">${L.money(isCard ? owed : bal)}</b><small>${isCard ? 'owed' : 'balance'}</small></div>
            <div class="a-actions">
                ${isCard && owed > 0 && a.active !== false ? `<button class="btn primary" data-action="payOpen" data-id="${a.id}">Pay bill</button>` : ''}
                <button class="btn" data-action="accountEdit" data-id="${a.id}">Edit</button>
                ${a.active === false ? `<button class="btn" data-action="accountReopen" data-id="${a.id}">Reopen</button>` : a.kind === 'cash' ? '' : `<button class="btn ghost danger" data-action="accountRemove" data-id="${a.id}">Remove</button>`}
            </div>
            ${paying ? `<div class="a-panel">${payForm(a, owed)}</div>` : ''}
        </div>`;
    };
    const group = (title, kinds) => {
        const items = list.filter((a) => kinds.includes(a.kind));
        return items.length ? `<h3>${title}</h3><section class="list atable">${items.map(row).join('')}</section>` : '';
    };
    return `<header class="hero">
        ${backLink('menu')}
        <small class="eyebrow">My accounts</small><h1>Banks, cash and credit cards</h1>
        <div class="stats">${stat('Bank + cash', L.money(t.inHand))}${stat('Card owed', L.money(t.cardOwed))}${stat('Net balance', L.money(t.net))}</div>
    </header>
    <main>
        ${s.form ? accountForm() : `<div class="toolbar"><div class="split wrap"><button class="btn primary" data-action="accountNew" data-kind="bank">＋ Bank account</button><button class="btn" data-action="accountNew" data-kind="card">＋ Credit card</button><button class="btn" data-action="accountNew" data-kind="wallet">＋ Wallet</button></div>
            ${S.data.accounts.some((a) => a.active === false) ? `<button class="link-btn" data-action="accountsClosed">${s.showClosed ? 'Hide closed accounts' : 'Show closed accounts'}</button>` : ''}</div>`}
        ${group('Cash and bank', ['cash', 'bank'])}
        ${group('Wallets', ['wallet'])}
        ${group('Credit cards', ['card'])}
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

/** Shown after another currency is picked: convert the amounts at a rate, or keep the numbers. */
function currencyChange(from) {
    const c = state.more.change;
    if (!c) {
        return '';
    }
    const busy = state.more.busy ? 'disabled' : '';
    return `<div class="form"><b>Change from ${from} to ${c.to}</b>
        <label>Exchange rate: 1 ${from} = how many ${c.to}?<input type="number" inputmode="decimal" min="0" step="any" value="${esc(c.rate)}" data-model="more.change.rate" placeholder="${c.loading ? 'getting today\'s rate…' : 'type the rate'}"></label>
        <small>${c.loading ? 'Getting today\'s rate…' : c.source ? `Today's rate from ${esc(c.source)}. You can change it.` : 'Could not get today\'s rate. Type it to convert.'}</small>
        <small><b>Convert amounts</b> multiplies every amount you have saved (entries, account opening balances and limits, people, budgets, loans) by this rate, once. <b>Keep the numbers</b> only changes the symbol.</small>
        <label class="check"><input type="checkbox" data-action="currencyBackup" ${c.backup ? 'checked' : ''}> Download a backup file before converting (recommended)</label>
        <div class="split wrap"><button class="btn primary" data-action="currencyConvert" ${busy}>Convert amounts</button><button class="btn" data-action="currencyKeep" ${busy}>Keep the numbers</button><button class="btn ghost" data-action="currencyCancel" ${busy}>Cancel</button></div></div>`;
}

/** Account Management → More: the tool's screens that are not on the bottom bar, and its categories. */
function menu() {
    const link = (route, ic, label, about) => `<a class="row" href="#${route}"><span class="row-icon">${icon(ic)}</span><span class="row-text"><b>${label}</b><small>${about}</small></span>${icon('chevRight')}</a>`;
    return `<header class="hero"><a class="back" href="#hub">${icon('chevLeft')} LifeDesk</a><small class="eyebrow">Account Management</small><h1>More</h1></header>
    <main class="dash">
        <section class="card span"><div class="list inner flush">
            ${link('pay', 'card', 'Payments', 'EMIs and credit card bills')}${link('insights', 'chart', 'Dashboards', 'Monthly, yearly, balances, loans and assets')}${link('reports', 'table', 'Reports', '18 tables with totals and CSV download')}
            ${link('people', 'users', 'People &amp; Loans', 'Who owes you, whom you owe, loans on EMI')}${link('accounts', 'wallet', 'My accounts', 'Banks, cash, wallets and credit cards')}${link('assets', 'asset', 'My assets', 'What you own and what it is worth')}
        </div></section>
        <section class="card"><div class="card-head"><h2>Categories</h2><button class="link-btn" data-action="categoryToggle">${state.more.addingCategory ? 'Cancel' : '＋ Add'}</button></div>
            ${state.more.addingCategory ? `<div class="form"><label>Name<input type="text" id="nc-name"></label><label>Type<select id="nc-type"><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Keywords, comma separated (used to suggest it)<input type="text" id="nc-keys" placeholder="e.g. fuel, diesel"></label><button class="btn primary" data-action="categorySave">Add category</button></div>` : ''}
            <small>${S.data.categories.filter((c) => c.type === 'expense').length} expense and ${S.data.categories.filter((c) => c.type === 'income').length} income categories</small></section>
        <a class="card link span" href="#more"><div class="card-head"><span><b>Account &amp; backup</b><small>Sign-in, notifications, currency, appearance, backup</small></span>${icon('chevRight')}</div></a>
    </main>`;
}

function more() {
    const f = L.currentFormat();
    return `<header class="hero">${backLink('hub')}<small class="eyebrow">Account &amp; backup</small><h1>${esc(S.user.name)}</h1><p class="hero-sub">${esc(S.user.contact)}</p></header>
    <main class="dash">
        ${S.isDemo ? `<div class="notice span">Demo mode: your data is saved only in this browser.</div>` : ''}
        <section class="card"><div class="card-head"><h2>Appearance</h2></div>
            <div class="seg">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, label]) => `<button class="${theme() === v ? 'on' : ''}" data-action="setTheme" data-theme="${v}" aria-pressed="${theme() === v}">${label}</button>`).join('')}</div>
            <small>${theme() === 'system' ? 'Follows this device: light by day or dark, whichever the device is set to.' : `Always ${theme()} on this device, whatever the device setting.`} Saved on this device only.</small></section>
        ${S.isDemo ? '' : `<section class="card"><div class="card-head"><h2>Privacy</h2><span class="pill">Encrypted</span></div>
            <small>Your data is encrypted on this device with your data passphrase before it is saved. In the database it is unreadable text, even to the people who run LifeDesk. If you forget the passphrase, use your recovery code on the unlock screen.</small>
            <div class="split wrap"><button class="btn" data-action="lockDevice">Lock this device</button></div></section>`}
        ${notificationsCard()}
        ${voiceCard()}
        <section class="card"><div class="card-head"><h2>Region</h2></div>
            <label>Currency<select data-currency>${currencyOptions(state.more.change ? state.more.change.to : f.currency)}</select></label>
            ${currencyChange(f.currency)}
            <small>Example: ${L.money(1234567.5)} · ${L.dateText(today(), { day: 'numeric', month: 'long', year: 'numeric' })}. Pick another currency to convert your amounts at today's rate, or to change only the symbol.</small></section>
        <section class="card"><div class="card-head"><h2>Backup</h2></div>
            <div class="split wrap"><button class="btn" data-action="exportData">Download my data</button><label class="btn file">Restore from file<input type="file" accept="application/json" data-file="import" hidden></label></div>
            <small>${S.data.entries.length} entries · ${S.data.accounts.length} accounts · ${S.data.people.length} people</small></section>
        <section class="card"><div class="card-head"><h2>Sample data</h2>${sampleDocs(S.data).length ? '<span class="pill">Loaded</span>' : ''}</div>
            <small>Made-up history from ${L.dateText(SAMPLE_START, { day: 'numeric', month: 'long', year: 'numeric' })} to today, for trying the app: salary, rent, bills, shopping, card payments, lending, budgets, and assets bought on EMI with their loans, in sample accounts. Your own entries are not changed, and it can be removed again.</small>
            <div class="split wrap">${sampleDocs(S.data).length
                ? `<button class="btn danger" data-action="sampleRemove" ${state.more.busy ? 'disabled' : ''}>${icon('trash')} Remove sample data</button>`
                : `<button class="btn" data-action="sampleLoad" ${state.more.busy ? 'disabled' : ''}>Load sample data</button>`}</div>
            ${state.more.busy ? '<small>Working… this can take a few seconds.</small>' : ''}</section>
        <div class="span split wrap">${S.isDemo ? `<button class="btn danger" data-action="demoReset">Erase demo data</button>` : `<button class="btn" data-action="signOut">${icon('logout')} Sign out</button><button class="btn danger" data-action="deleteAccount">${icon('trash')} Delete my account and data</button>`}</div>
    </main>`;
}

// helpers the dashboard and report screens share with the rest
const kit = { today, icon, stat, monthNav, entryRow, back: () => backLink('menu') };
const SCREENS = { hub, home, add: addEntry, daily, budget, people, accounts, assets: assetsView, pay: payView, renewals, menu, more, insights: () => dashboards(state.insights, kit), reports: () => reports(state.reports, kit) };
const NO_TABS = ['hub', 'renewals', 'more']; // the bottom bar belongs to Account Management; LifeDesk-wide screens and other tools do not show it
// phone: bottom bar
const NAV = [['home', 'home', 'Home'], ['daily', 'calendar', 'Daily'], ['add', 'plus', 'Add'], ['budget', 'target', 'Budget'], ['menu', 'grid', 'More']];
const TAB_ROUTES = NAV.map(([route]) => route);
// wide screens: side menu
const SIDE = [
    ['LifeDesk', [['hub', 'grid', 'All tools']]],
    ['Account Management', [['home', 'home', 'Home'], ['add', 'plus', 'Add entry'], ['daily', 'calendar', 'Daily expenses'], ['budget', 'target', 'Budget'], ['pay', 'card', 'Payments'], ['insights', 'chart', 'Dashboards'], ['reports', 'table', 'Reports'], ['people', 'users', 'People & Loans'], ['accounts', 'wallet', 'My accounts'], ['assets', 'asset', 'My assets']]],
    ['Renewals', [['renewals', 'bell', 'Renewal reminders']]],
    ['You', [['more', 'user', 'Account & backup']]]
];

let renderedRoute = null; // the screen the last drawing was for
function render() {
    if (state.net.offline && !state.net.dismissed) {
        app.innerHTML = offlineScreen() + toastHtml();
        return;
    }
    if (state.status === 'loading') {
        app.innerHTML = `<div class="loading"><div class="logo">${icon('logo')}</div><p>Loading…</p></div>`;
        return;
    }
    if (state.status === 'needPassphrase' || state.status === 'locked' || state.vault.code) {
        const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.model : null;
        app.innerHTML = vaultScreen() + toastHtml();
        const el = focus && app.querySelector(`[data-model="${focus}"]`);
        if (el) {
            el.focus();
        }
        return;
    }
    if (state.status === 'signedOut' || state.status === 'unverified') {
        const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.model : null;
        app.innerHTML = (state.status === 'signedOut' ? login() : unverified()) + toastHtml();
        const el = focus && app.querySelector(`[data-model="${focus}"]`);
        if (el) {
            el.focus();
        }
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
    const fresh = state.fresh ? 'fresh' : ''; // only the first drawing after moving to a screen
    state.fresh = false;
    const focus = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.model : null;
    // rows that scroll sideways (the account chips) keep their place when the same screen is drawn again
    const slid = renderedRoute === state.route ? [...app.querySelectorAll('.chips')].map((el) => el.scrollLeft) : [];
    renderedRoute = state.route;
    const side = SIDE.map(([title, links]) => `<small>${title}</small>${links.map(([r, ic, label]) => `<a href="#${r}" class="${state.route === r ? 'on' : ''}">${icon(ic)}<span>${label}</span></a>${r === 'add' ? `<button class="side-voice" data-action="voiceOpen">${icon('mic')}<span>Voice entry</span></button>` : ''}`).join('')}`).join('');
    app.innerHTML = `<div class="app">
        <aside class="side"><a class="brand" href="#hub"><span class="logo small">${icon('logo')}</span>LifeDesk</a><nav>${side}</nav><div class="side-user"><b>${esc(S.user.name)}</b><small>${esc(S.user.contact)}</small></div></aside>
        <div class="navbar" aria-hidden="true"></div>
        <div class="shell ${fresh}">${screen()}</div>
        ${NO_TABS.includes(state.route) ? '' : `<nav class="tabbar">${NAV.map(([r, ic, label]) => (r === 'add'
            ? `<a href="#add" class="add ${state.route === r ? 'on' : ''} ${state.addMenu ? 'open' : ''}" data-action="addMenu" aria-haspopup="menu" aria-expanded="${!!state.addMenu}" title="Add an entry: tap to choose, hold to speak"><span>${icon(ic)}</span>${label}</a>`
            : `<a href="#${r}" class="${state.route === r ? 'on' : ''}"><span>${icon(ic)}</span>${label}</a>`)).join('')}</nav>
            ${state.addMenu ? `<button class="add-menu-back" data-action="addMenuClose" aria-label="Close the menu"></button>
            <div class="add-menu" role="menu" aria-label="Add an entry">
                <button role="menuitem" data-action="addMenuVoice"><span class="mi speak">${icon('mic')}</span><span><b>Speak an entry</b><small>Say it in English or हिन्दी</small></span></button>
                <a role="menuitem" href="#add" data-action="addMenuType"><span class="mi">${icon('edit')}</span><span><b>Type an entry</b><small>Fill in the form yourself</small></span></a>
                <small class="add-menu-tip">Tip: press and hold + to speak straight away</small>
            </div>` : ''}`}
    </div>${voiceSheet()}${state.net.offline ? `<button class="net-chip" data-action="netShow" title="You are offline. Changes are sent when you are back online."><i></i> Offline</button>` : ''}${toastHtml()}`;
    app.querySelectorAll('.chips').forEach((el, n) => {
        if (slid[n]) {
            el.scrollLeft = slid[n];
        }
    });
    if (focus) {
        const el = app.querySelector(`[data-model="${focus}"]`);
        if (el) {
            el.focus();
            if (el.setSelectionRange && el.type !== 'number' && el.type !== 'date') {
                el.setSelectionRange(el.value.length, el.value.length);
            }
        }
    }
    markEntered();
    fillNavbar();
}
// ---------- voice entry ----------
// The browser listens and speaks (Web Speech API: no service is added by LifeDesk); js/voice.js turns the words into
// an entry and says what to ask. Nothing is stored until everything an entry needs has been said.
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const VOICE_TEXT = {
    en: { idle: 'Tap the microphone to speak', starting: 'Get ready…', listening: 'Your turn: speak now', asking: 'LifeDesk is speaking', saving: 'Saving…',
        sub: { starting: 'Opening the microphone', asking: 'Please wait, then answer. Tap the circle to answer now.', saving: 'One moment' }, assistant: 'LifeDesk', noSpeech: "I didn't hear anything. Tap the microphone and speak.",
        blocked: "The microphone is blocked for LifeDesk. Allow it in the browser's site settings, then tap the microphone.", network: 'Voice entry needs an internet connection.',
        noMic: 'No microphone was found on this device.', failed: 'Listening did not work this time. Tap the microphone to try again.',
        examples: ['Spent 450 on groceries from HDFC', 'Received 50,000 salary', 'Lent 2,000 to Shubham yesterday', 'Spent 300 on petrol and 120 on milk'], tryTitle: 'Try saying', you: 'You', by: 'saved by voice',
        takeTime: 'Take your time. Tap the microphone when you have finished.', heardAs: 'I heard', tapInstead: 'Tap Save or Cancel below', confirmHint: 'Say “yes” to save, or “no”', female: 'Female voice', male: 'Male voice', 
        reviewOne: 'Check it before saving', reviewMany: 'Check these {n} entries before saving', save: 'Save', saveAll: 'Save all {n}', cancel: 'Cancel', declined: 'Okay, nothing was saved.' },
    hi: { idle: 'बोलने के लिए माइक दबाएं', starting: 'तैयार हो जाइए…', listening: 'अब आपकी बारी: बोलिए', asking: 'LifeDesk बोल रहा है', saving: 'सेव कर रहा हूँ…',
        sub: { starting: 'माइक खुल रहा है', asking: 'रुकिए, फिर जवाब दीजिए। अभी जवाब देने के लिए गोले को दबाएं।', saving: 'एक क्षण' }, assistant: 'LifeDesk', noSpeech: 'कुछ सुनाई नहीं दिया। माइक दबाकर बोलिए।',
        blocked: 'LifeDesk के लिए माइक बंद है। ब्राउज़र की साइट सेटिंग में अनुमति दें, फिर माइक दबाएं।', network: 'वॉइस एंट्री के लिए इंटरनेट चाहिए।',
        noMic: 'इस डिवाइस पर माइक नहीं मिला।', failed: 'इस बार सुनना नहीं हो पाया। दोबारा माइक दबाएं।',
        examples: ['किराने पर 450 रुपये खर्च किए', '50,000 सैलरी मिली', 'शुभम को कल 2,000 उधार दिए', 'पेट्रोल पर 300 और दूध पर 120 रुपये खर्च किए'], tryTitle: 'ऐसे बोलिए', you: 'आप', by: 'वॉइस से सेव हुआ',
        takeTime: 'आराम से बोलिए। पूरा होने पर माइक दबाएं।', heardAs: 'मैंने सुना', tapInstead: 'नीचे सेव या रद्द दबाएं', confirmHint: 'सेव करने के लिए “हाँ” बोलिए, या “नहीं”', female: 'महिला आवाज़', male: 'पुरुष आवाज़', 
        reviewOne: 'सेव करने से पहले जांच लें', reviewMany: 'सेव करने से पहले ये {n} एंट्री जांच लें', save: 'सेव करें', saveAll: 'सभी {n} सेव करें', cancel: 'रद्द करें', declined: 'ठीक है, कुछ सेव नहीं हुआ।' }
};
let voiceSession = null;
let voiceRec = null;
const voiceLang = () => {
    try {
        return localStorage.getItem('lifedesk-voice-lang') || ((navigator.language || '').toLowerCase().startsWith('hi') ? 'hi' : 'en');
    } catch (e) {
        return 'en';
    }
};
/** null when this browser can do voice entry, otherwise why not. */
const voiceBlocker = () => (!window.isSecureContext ? 'insecure' : !SpeechRec ? 'unsupported' : null);
const voiceCtx = () => ({ accounts: activeAccounts(), categories: S.data.categories, people: S.data.people, entries: S.data.entries, today: today(),
    defaultAccountId: (defaultAccount() || {}).id || null, suggest: (d, t) => L.suggestCategory(S.data.categories, d, t, S.data.entries) });

const voiceGender = () => {
    try {
        return localStorage.getItem('lifedesk-voice-gender') === 'male' ? 'male' : 'female';
    } catch (e) {
        return 'female';
    }
};
// The voices are the device's own. Browsers do not say which are male, female or good, so they are ranked by
// their well-known names (Voice.rateVoice): natural ones first, never the novelty ones. The user can also pick
// one by name, per language, under Account. Without a voice of the gender chosen, the nearest one is used at a
// slightly lower or higher pitch.
const voiceChoice = (lang) => {
    try {
        return localStorage.getItem(`lifedesk-voice-name-${lang}`) || '';
    } catch (e) {
        return '';
    }
};
const voiceList = () => (window.speechSynthesis && typeof window.speechSynthesis.getVoices === 'function' ? window.speechSynthesis.getVoices() : []);
/** The device's voices for a language, best first for the gender chosen: [{ voice, score, gender }]. */
function voicesFor(lang, gender) {
    return voiceList().map((voice) => ({ voice, ...Voice.rateVoice(voice, lang, gender) })).filter((x) => x.score > -100).sort((x, y) => y.score - x.score || x.voice.name.localeCompare(y.voice.name));
}
/** The voice to speak with: { voice, pitch, exact } (exact: it is a voice of the gender asked for, or one picked by name). */
function voicePick(lang, gender) {
    const list = voicesFor(lang, gender);
    const chosen = voiceChoice(lang) && list.find((x) => x.voice.voiceURI === voiceChoice(lang) || x.voice.name === voiceChoice(lang));
    if (chosen) {
        return { voice: chosen.voice, pitch: 1, exact: true };
    }
    const best = list[0];
    if (!best) {
        return { voice: null, pitch: gender === 'male' ? 0.82 : 1.1, exact: false };
    }
    return best.gender === gender ? { voice: best.voice, pitch: 1, exact: true } : { voice: best.voice, pitch: gender === 'male' ? 0.82 : 1.1, exact: false };
}
if (window.speechSynthesis && typeof window.speechSynthesis.getVoices === 'function') {
    window.speechSynthesis.getVoices(); // browsers load their list of voices only after it is first asked for
    if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', () => {
            if (state.route === 'more' && state.status === 'ready') {
                render(); // the list on the Account page fills in once the device has loaded its voices
            }
        });
    }
}

let voiceTone = null;
/** "Your turn": a small vibration, and a short two-note chime (not on Android, whose microphone makes its own sound). */
function voiceCue(quiet) {
    if (navigator.vibrate) {
        navigator.vibrate(18);
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (quiet || !Ctx) {
        return;
    }
    try {
        voiceTone = voiceTone || new Ctx();
        const now = voiceTone.currentTime;
        [[880, 0], [1320, 0.09]].forEach(([hz, at]) => {
            const osc = voiceTone.createOscillator();
            const gain = voiceTone.createGain();
            osc.frequency.value = hz;
            gain.gain.setValueAtTime(0.0001, now + at);
            gain.gain.exponentialRampToValueAtTime(0.12, now + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.11);
            osc.connect(gain).connect(voiceTone.destination);
            osc.start(now + at);
            osc.stop(now + at + 0.12);
        });
    } catch (e) {
        // no sound on this device: the screen still shows whose turn it is
    }
}
let voiceSpeakTimer = null;
let voiceLastSaid = ''; // what the assistant last spoke: the microphone may pick it up again
/**
 * Speaks, then calls `then` once. Some phones never report that speaking has ended, so the end is also noticed
 * directly (the browser says whether it is still speaking); without that, the microphone opened seconds late and
 * the user's quick "yes" was missed.
 */
function voiceSay(text, then) {
    window.clearInterval(voiceSpeakTimer);
    const done = () => {
        window.clearInterval(voiceSpeakTimer);
        if (then) {
            const next = then;
            then = null;
            next();
        }
    };
    const synth = window.speechSynthesis;
    if (!synth || !window.SpeechSynthesisUtterance) {
        return window.setTimeout(done, 500);
    }
    synth.cancel();
    voiceLastSaid = text;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = Voice.LANGS[state.voice.lang].code;
    const pick = voicePick(state.voice.lang, voiceGender());
    if (pick.voice) {
        try {
            u.voice = pick.voice;
        } catch (e) {
            // the device took its voice away in the meantime: its default voice speaks
        }
    }
    u.pitch = pick.pitch;
    u.rate = 0.94; // a little slower than the default: amounts and names are easier to catch
    u.volume = 1;
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
    const began = Date.now();
    let spoke = false;
    voiceSpeakTimer = window.setInterval(() => {
        const speaking = synth.speaking === true || synth.pending === true;
        spoke = spoke || speaking;
        const waited = Date.now() - began;
        // finished speaking, or it never started (blocked or no voice), or the longest it could take has passed
        // (about 13 letters a second; some phones go on reporting "speaking" long after they have stopped)
        if ((spoke && !speaking) || (!spoke && waited > 1200 && typeof synth.speaking === 'boolean') || waited > 900 + text.length * 95) {
            done();
        }
    }, 120);
    return null;
}

// How long the microphone waits (milliseconds). before = for the user to start speaking; pause = of silence after
// the last word before the sentence is taken as finished (2 seconds, for a sentence and for an answer alike).
const VOICE_WAIT = { before: 30000, pause: 2000, beforeAnswer: 20000, pauseAnswer: 2000 };
let voiceSilence = null; // the timer that ends the sentence after a pause
let voiceUserStop = false; // the user tapped the microphone to finish

function voiceStop() {
    window.clearTimeout(voiceSilence);
    if (voiceRec) {
        voiceRec.onresult = voiceRec.onerror = voiceRec.onend = null;
        try {
            voiceRec.abort();
        } catch (e) {
            // already stopped
        }
        voiceRec = null;
    }
}

/**
 * Listens for one sentence (or one answer). The browser's recogniser gives up after a few seconds of silence; here
 * it is started again, quietly, until the user has had time to think and speak, and a sentence ends only after a
 * real pause or a tap on the microphone.
 */
function voiceListen() {
    const v = state.voice;
    if (!v.open) {
        return;
    }
    voiceStop();
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    const answering = v.log.length > 0 && v.log[v.log.length - 1].who === 'app' && !v.log[v.log.length - 1].kind; // a question was just asked
    const patience = answering ? VOICE_WAIT.beforeAnswer : VOICE_WAIT.before;
    const pause = answering ? VOICE_WAIT.pauseAnswer : VOICE_WAIT.pause;
    const started = Date.now();
    const t = VOICE_TEXT[v.lang];
    let kept = ''; // from earlier runs of the recogniser in this same turn
    let done = false;
    let problem = '';
    voiceUserStop = false;

    const finish = (heard) => {
        if (done) {
            return;
        }
        done = true;
        voiceStop();
        v.interim = '';
        if (heard) {
            return voiceHeard(heard);
        }
        v.phase = 'idle';
        // while entries are waiting for a yes, silence is not a problem: the Save button is right there
        v.note = problem || (v.review ? '' : t.noSpeech);
        return render();
    };
    // Chrome on Android cannot keep listening through a pause (and repeats itself when asked to): there, each run
    // of the recogniser hears one stretch of speech, and it is started again while the user may still be going on.
    const oneStretch = /Android/i.test(navigator.userAgent);
    let lastHeardAt = 0;
    const live = () => {
        if (!done && v.phase !== 'listening') {
            v.phase = 'listening'; // shown only once the microphone is really open
            render();
            voiceCue(oneStretch);
        }
    };
    const begin = () => {
        const rec = new SpeechRec();
        voiceRec = rec;
        rec.lang = Voice.LANGS[v.lang].code;
        rec.interimResults = true;
        rec.continuous = !oneStretch; // do not stop at the first short pause
        rec.maxAlternatives = 1;
        let said = '';
        rec.onstart = live;
        rec.onaudiostart = live;
        rec.onresult = (event) => {
            const pieces = [];
            for (let i = 0; i < event.results.length; i += 1) {
                pieces.push(event.results[i][0].transcript);
            }
            said = Voice.joinHeard(pieces);
            v.interim = Voice.joinHeard([kept, said]);
            lastHeardAt = Date.now();
            live();
            const box = document.getElementById('voice-interim'); // only the words are redrawn while speaking
            if (box) {
                box.textContent = v.interim;
            }
            window.clearTimeout(voiceSilence);
            voiceSilence = window.setTimeout(() => finish(v.interim), pause);
        };
        rec.onerror = (event) => {
            problem = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? t.blocked : event.error === 'network' ? t.network : event.error === 'audio-capture' ? t.noMic : problem;
        };
        rec.onend = () => {
            if (done || voiceRec !== rec) {
                return;
            }
            kept = Voice.joinHeard([kept, said]);
            if (problem || voiceUserStop) {
                return finish(kept); // cannot listen at all, or stopped by the user
            }
            if (kept) {
                // spoken, and this run of the recogniser has ended. Where a run is one stretch of speech, the user may
                // only have paused: listen on until the pause has lasted (the timer set at the last word ends it).
                return oneStretch && Date.now() - lastHeardAt < pause ? begin() : finish(kept);
            }
            if (Date.now() - started >= patience) {
                return finish(''); // waited long enough
            }
            return begin(); // nothing said yet and the recogniser gave up: keep listening while the user thinks
        };
        try {
            rec.start();
        } catch (e) {
            problem = t.failed;
            finish('');
        }
    };
    v.phase = 'starting';
    v.note = '';
    v.interim = '';
    render();
    begin();
    window.setTimeout(() => {
        if (!done && voiceRec) {
            live(); // a browser that does not report the microphone opening
        }
    }, 2000);
}

/** One line for an entry waiting to be saved: what the review list shows, and the sentence the voice reads. */
function voiceLine(item) {
    const e = item.entry;
    const lang = state.voice.lang;
    const who = item.person ? item.person.name : personName(e.personId);
    const what = e.type === 'transfer' ? `${accountName(e.accountId)} → ${accountName(e.toAccountId)}` : categoryName(e.categoryId) || who || e.description || L.TYPES[e.type].label;
    // for the voice: no signs or brackets ("&" is "and", "(sample)" is left out), the amount in words
    const say = (name) => String(name || '').replace(/\s*\(sample\)/i, '').replace(/&/g, lang === 'hi' ? 'और' : 'and').replace(/\s+-\s+/g, ' ').trim();
    const spoken = Voice.entryWords(e.type, { money: Voice.moneyWords(e.amount || 0, lang, L.currentFormat().currency), category: say(categoryName(e.categoryId)), account: say(accountName(e.accountId)),
        toAccount: say(accountName(e.toAccountId)), person: say(who), description: say(e.description) }, lang);
    return { title: e.description || what, detail: [L.TYPES[e.type].short, e.description && what !== e.description ? what : '', e.type === 'transfer' ? '' : accountName(e.accountId), e.date === today() ? '' : shortDate(e.date)].filter(Boolean).join(' · '),
        shown: [L.money(e.amount || 0), what, e.type === 'transfer' ? '' : accountName(e.accountId)].filter(Boolean).join(' · '), spoken };
}

async function voiceHeard(text) {
    const v = state.voice;
    if (Voice.isEcho(text, voiceLastSaid)) {
        voiceLastSaid = ''; // the microphone caught the assistant's own question: not an answer, listen again
        return voiceListen();
    }
    v.heard = text;
    v.log.push({ who: 'you', text });
    voiceSession = voiceSession || Voice.createSession(v.lang);
    const r = Voice.hear(voiceSession, text, voiceCtx());
    if (r.status === 'ask') {
        v.log.push({ who: 'app', text: r.say });
        v.question = r.say;
        v.phase = 'asking';
        render();
        return voiceSay(r.say, voiceListen);
    }
    if (r.status === 'confirm') {
        // everything is understood: show it and ask. Nothing is stored until the user says yes or presses Save.
        v.review = r.items;
        v.unclear = r.unclear || 0;
        v.editing = null;
        if (v.unclear >= 2) {
            // twice neither a yes nor a no was heard: stop asking, the entries wait for the Save or Cancel button
            v.phase = 'idle';
            return render();
        }
        const ask = r.say(r.items.map((item) => voiceLine(item).spoken));
        v.log.push({ who: 'app', text: ask });
        v.question = ask.split(/[.।] /).pop(); // the list is on the screen already: only the question itself is written out
        v.phase = 'asking';
        render();
        return voiceSay(ask, voiceListen);
    }
    if (r.status === 'abort') {
        voiceSession = null;
        v.review = null;
        v.question = '';
        v.log.push({ who: 'app', text: r.say, kind: 'warn' });
        v.phase = 'idle';
        render();
        return voiceSay(r.say);
    }
    return voiceStore(r.items, r.say);
}

/** Stores the reviewed entries exactly as Add Entry would, all together, with one Undo for all of them. */
async function voiceStore(items, spoken) {
    const v = state.voice;
    const pairs = [];
    for (const item of items) {
        const e = item.entry;
        let personId = e.personId;
        if (item.person) {
            const made = pairs.find((p) => p[0] === 'people' && p[1].name === item.person.name); // the same new person in two entries is created once
            personId = made ? made[1].id : S.newId();
            if (!made) {
                pairs.push(['people', { id: personId, name: item.person.name, direction: item.person.direction, opening: 0, status: 'Active' }]);
            }
        }
        const entry = { id: S.newId(), type: e.type, amount: Number(e.amount), date: e.date, description: (e.description || '').trim() || L.TYPES[e.type].label, accountId: e.accountId, toAccountId: e.toAccountId,
            categoryId: e.categoryId, personId: L.PERSON_TYPES.includes(e.type) ? personId : null, notes: '', createdAt: Date.now() + pairs.length, loanId: null, loanDown: null, assetId: null, byVoice: true };
        if (e.type === 'asset') {
            entry.assetId = S.newId();
            pairs.push(['assets', { id: entry.assetId, name: entry.description, type: 'Other', price: entry.amount, value: entry.amount, boughtOn: entry.date, loanId: null, status: 'Owned', createdAt: Date.now() }]);
        }
        const problem = L.validateEntry(entry, { people: [...S.data.people, ...pairs.filter((p) => p[0] === 'people').map((p) => p[1])] });
        if (problem) {
            // one entry cannot be stored yet (for example, no category): nothing is stored, and the entries stay on
            // the screen with that entry opened for changing
            voiceStop();
            v.phase = 'idle';
            v.unclear = 2;
            v.editing = items.indexOf(item);
            v.note = items.length > 1 ? `${voiceLine(item).title}: ${problem}` : problem;
            render();
            return voiceSay(problem);
        }
        pairs.push(['entries', entry]);
    }
    voiceStop();
    v.phase = 'saving';
    render();
    await S.saveMany(pairs);
    voiceSession = null;
    const first = voiceLine(items[0]);
    const t = VOICE_TEXT[v.lang];
    state.voice = { ...v, open: false, log: [], review: null, phase: 'idle' };
    voiceForget();
    toast(items.length === 1 ? `${L.TYPES[items[0].entry.type].short} · ${first.shown} – ${t.by}.` : `${items.length} entries (${L.money(items.reduce((sum, x) => sum + Number(x.entry.amount), 0))}) – ${t.by}.`, 'ok', { label: 'Undo', run: async () => {
        await S.removeMany(pairs.map(([c, doc]) => [c, doc.id]));
        toast('Removed. Nothing was kept.');
    } });
    voiceSay(spoken || (v.lang === 'hi' ? (items.length === 1 ? 'दर्ज हो गया।' : `${items.length} एंट्री दर्ज हो गईं।`) : items.length === 1 ? 'Stored.' : `${items.length} entries stored.`));
}

/** The form under an entry on the review screen: everything about it can be changed before it is saved. */
function voiceEditor(item, i) {
    const e = item.entry;
    const field = (name) => `data-vfield="${name}" data-i="${i}"`;
    const accounts = (selected, skip) => `<option value="">Choose an account</option>${activeAccounts().filter((a) => a.id !== skip).map((a) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)} · ${L.ACCOUNT_KINDS[a.kind]}</option>`).join('')}`;
    const inflow = ['income', 'gotback', 'borrowed'].includes(e.type);
    const cats = S.data.categories.filter((c) => c.type === e.type).sort((a, b) => a.name.localeCompare(b.name));
    const people = S.data.people.filter((p) => p.direction === (e.type === 'lent' || e.type === 'gotback' ? 'owesMe' : 'iOwe'));
    return `<div class="voice-edit">
        <label>Amount<input type="number" inputmode="decimal" min="0" step="any" value="${esc(e.amount || '')}" ${field('amount')}></label>
        ${e.type === 'expense' || e.type === 'income' ? `<label>Category<select ${field('categoryId')}><option value="">Choose a category</option>${cats.map((c) => `<option value="${c.id}" ${c.id === e.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        ${e.type === 'transfer'
            ? `<label>From<select ${field('accountId')}>${accounts(e.accountId, e.toAccountId)}</select></label><label>To<select ${field('toAccountId')}>${accounts(e.toAccountId, e.accountId)}</select></label>`
            : `<label>${inflow ? 'Received into' : 'Paid from'}<select ${field('accountId')}>${accounts(e.accountId)}</select></label>`}
        ${L.PERSON_TYPES.includes(e.type) ? `<label>Person<select ${field('personId')}>${item.person ? `<option value="" selected>New: ${esc(item.person.name)}</option>` : '<option value="">Choose a person</option>'}${people.map((p) => `<option value="${p.id}" ${p.id === e.personId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
        <label>Date<input type="date" max="${today()}" value="${esc(e.date)}" ${field('date')}></label>
        <label class="wide">Description<input type="text" value="${esc(e.description || '')}" placeholder="${esc(L.TYPES[e.type].label)}" ${field('description')}></label>
        <button class="btn wide" data-action="voiceEditDone">Done</button>
    </div>`;
}

const VOICE_SAMPLE = {
    en: () => `Hello. I will read your entries back to you, like this: ${Voice.entryWords('expense', { money: Voice.moneyWords(450, 'en', L.currentFormat().currency), category: 'Groceries', account: 'your bank' }, 'en')}. Should I store this?`,
    hi: (gender) => `नमस्ते। मैं आपकी एंट्री ऐसे पढ़कर ${gender === 'male' ? 'सुनाऊंगा' : 'सुनाऊंगी'}: ${Voice.entryWords('expense', { money: Voice.moneyWords(450, 'hi', L.currentFormat().currency), category: 'किराने', account: 'आपके बैंक' }, 'hi')}। क्या इसे दर्ज करूं?`
};
/** Account page: the assistant's voice. Female or male, and optionally one of the device's voices by name, per language. */
function voiceCard() {
    const lang = state.more.voiceLang || voiceLang();
    const gender = voiceGender();
    const list = voicesFor(lang, gender);
    const pick = voicePick(lang, gender);
    const quality = (name) => (/natural|neural/i.test(name) ? ' · natural' : /premium/i.test(name) ? ' · premium' : /enhanced/i.test(name) ? ' · enhanced' : '');
    const label = (x) => `${x.voice.name.replace(/^Microsoft /, '').replace(/ Online \(Natural\).*$/, '')}${x.gender ? ` · ${x.gender}` : ''}${quality(x.voice.name)}${x.voice.lang.replace('_', '-').toLowerCase() === Voice.LANGS[lang].code.toLowerCase() ? '' : ` · ${x.voice.lang.replace('_', '-')}`}`;
    const seg = (items, action, attr, on) => `<div class="seg">${items.map(([k, text]) => `<button class="${on === k ? 'on' : ''}" data-action="${action}" data-${attr}="${k}" aria-pressed="${on === k}">${text}</button>`).join('')}</div>`;
    return `<section class="card"><div class="card-head"><h2>Voice assistant</h2><span class="pill">${voiceBlocker() ? 'Not in this browser' : 'Ready'}</span></div>
        <small>The voice that asks the questions and reads your entries back when you speak an entry.</small>
        ${seg([['female', 'Female voice'], ['male', 'Male voice']], 'voiceGender', 'gender', gender)}
        ${seg(Object.entries(Voice.LANGS).map(([k, l]) => [k, l.label]), 'voiceCardLang', 'lang', lang)}
        <label>Voice for ${Voice.LANGS[lang].label}<select data-voice-name="${lang}">
            <option value="">Automatic: the best ${gender} voice on this device</option>
            ${list.filter((x) => x.score > -100 && !(x.score < -150)).map((x) => `<option value="${esc(x.voice.voiceURI || x.voice.name)}" ${voiceChoice(lang) && (voiceChoice(lang) === x.voice.voiceURI || voiceChoice(lang) === x.voice.name) ? 'selected' : ''}>${esc(label(x))}</option>`).join('')}
        </select></label>
        <small>${pick.voice ? `Now using: <b>${esc(pick.voice.name)}</b>${pick.exact ? '' : ` at a ${gender === 'male' ? 'lower' : 'higher'} pitch, because this device has no ${gender} voice for ${Voice.LANGS[lang].label}`}.` : 'This device has not listed its voices yet, or has none for this language; its default voice is used.'}
            The voices belong to this device and browser, so they differ between a phone and a computer. Saved on this device only.</small>
        <div class="split wrap"><button class="btn" data-action="voiceSample">${icon('speaker')} Play a sample</button></div>
        ${voiceBlocker() ? '<small>Speaking an entry works in Chrome and Edge (computer and Android) and Safari (iPhone, iPad, Mac).</small>' : ''}</section>`;
}

/** What stays written under the assistant: the user's last words, and a closing message (nothing was saved…). The
 * question being asked is shown next to the assistant itself, so it is not repeated here. */
function voiceBubbles(v) {
    const you = [...v.log].reverse().find((m) => m.who === 'you');
    const last = v.log[v.log.length - 1];
    return [you, last && last.who === 'app' && last.kind ? last : null].filter(Boolean);
}

// Behind the sheet: a tap anywhere outside it closes voice entry (and never reaches the screen underneath).
const VOICE_BACK = '<button class="voice-back" data-action="voiceClose" aria-label="Dismiss voice entry" tabindex="-1"></button>';
let voiceOpenedAt = 0;
let voiceThen = ''; // where to go once the sheet's place in the browser history has been given back
// Opening the sheet adds a step to the browser history, so the phone's Back button closes the sheet instead of leaving the screen.
function voiceRemember() {
    try {
        if (!(window.history.state && window.history.state.voice)) {
            window.history.pushState({ voice: true }, '');
        }
    } catch (e) {
        // without it Back behaves as before
    }
}
function voiceForget() {
    if (window.history.state && window.history.state.voice) {
        window.history.back();
        return true;
    }
    return false;
}

function voiceSheet() {
    const v = state.voice;
    if (!v.open) {
        return '';
    }
    const blocker = voiceBlocker();
    if (blocker) {
        return `${VOICE_BACK}<section class="card form voice" role="dialog" aria-label="Voice entry"><h3>Voice entry</h3>
            <div class="voice-stage off"><span class="voice-mic off" aria-hidden="true">${icon('mic')}</span><b class="voice-status">Voice entry is not available in this browser</b></div>
            <p class="voice-note">${blocker === 'insecure' ? 'Voice entry needs a secure (https) address. Open LifeDesk at its normal address and try again.'
                : 'This browser cannot turn speech into text. Voice entry works in:'}</p>
            ${blocker === 'insecure' ? '' : `<ul class="voice-where"><li><b>Chrome</b> and <b>Edge</b> – on a computer and on Android phones</li><li><b>Safari</b> – on iPhone, iPad and Mac</li></ul>
                <p class="voice-note">It does not work in Firefox. You can still add the entry by typing.</p>`}
            <div class="split"><button class="btn" data-action="voiceClose">Close</button><a class="btn primary" href="#add" data-action="voiceClose">Type the entry</a></div></section>`;
    }
    const t = VOICE_TEXT[v.lang];
    const turn = v.phase === 'listening' ? 'you' : ['asking', 'starting', 'saving'].includes(v.phase) ? 'app' : 'idle';
    return `${VOICE_BACK}<section class="card form voice ${v.editing !== null && v.editing !== undefined ? 'editing' : ''}" role="dialog" aria-label="Voice entry"><h3>${v.editing !== null && v.editing !== undefined ? 'Change the entry' : 'Voice entry'}</h3>
        <div class="seg voice-lang" role="group" aria-label="Language">${Object.entries(Voice.LANGS).map(([k, l]) => `<button class="${v.lang === k ? 'on' : ''}" data-action="voiceLang" data-lang="${k}" aria-pressed="${v.lang === k}">${l.label}</button>`).join('')}</div>
        <div class="voice-turns" aria-hidden="true">
            <span class="turn ${turn === 'app' ? 'on' : ''}">${icon('speaker')} ${t.assistant}</span>
            <span class="turn you ${turn === 'you' ? 'on' : ''}">${icon('mic')} ${t.you}</span>
        </div>
        <div class="voice-stage ${v.phase}">
            <button class="voice-mic" data-action="voiceMic" aria-label="${v.phase === 'listening' ? 'Stop listening' : v.phase === 'asking' ? 'Answer now' : 'Start listening'}"><span class="ring r1"></span><span class="ring r2"></span>${v.phase === 'asking'
                ? `<span class="voice-bars"><i></i><i></i><i></i><i></i><i></i></span>` : v.phase === 'starting' || v.phase === 'saving' ? '<span class="voice-wait"></span>' : icon('mic')}</button>
            <b class="voice-status" role="status">${esc(v.review && v.phase === 'idle' ? (v.unclear >= 2 ? t.tapInstead : t.confirmHint) : t[v.phase] || t.idle)}</b>
            ${v.phase === 'listening' ? `<small class="voice-hint">${t.takeTime}</small>` : t.sub[v.phase] ? `<small class="voice-hint">${t.sub[v.phase]}</small>` : ''}
            ${v.question && (v.phase === 'asking' || v.phase === 'starting' || v.phase === 'listening' || v.review) ? `<p class="voice-q"><small>${t.assistant}</small>${esc(v.question)}</p>` : ''}
            <p class="voice-interim" id="voice-interim">${esc(v.interim)}</p>
            ${v.review && v.unclear && v.heard ? `<small class="voice-heard">${t.heardAs} “${esc(v.heard)}”</small>` : ''}
            ${v.note ? `<p class="voice-note warn">${esc(v.note)}</p>` : ''}
        </div>
        ${v.review ? '' : v.log.length ? `<div class="voice-log">${voiceBubbles(v).map((m) => `<div class="vb from-${m.who} ${m.kind || ''}"><small>${m.who === 'you' ? t.you : 'LifeDesk'}</small>${esc(m.text)}</div>`).join('')}</div>`
            : `<div class="voice-try"><small>${t.tryTitle}</small>${t.examples.map((x) => `<span>“${esc(x)}”</span>`).join('')}</div>`}
        ${v.review ? `<div class="voice-review"><small>${v.review.length === 1 ? t.reviewOne : t.reviewMany.replace('{n}', v.review.length)}</small>
            <div class="list inner flush">${v.review.map((item, i) => {
                const line = voiceLine(item);
                return `<div class="row ${v.editing === i ? 'editing' : ''}"><span class="row-icon t-${item.entry.type}">${icon(L.TYPES[item.entry.type].icon)}</span><span class="row-text"><b>${esc(line.title)}</b><small>${esc(line.detail)}</small></span>
                    <b class="amount-cell">${L.money(item.entry.amount || 0)}</b>
                    <button class="icon-btn edit" data-action="voiceEdit" data-i="${i}" aria-label="Change ${esc(line.title)}" aria-expanded="${v.editing === i}" title="Change it">${icon('edit')}</button>
                    ${v.review.length > 1 ? `<button class="icon-btn" data-action="voiceDrop" data-i="${i}" aria-label="Remove ${esc(line.title)}" title="Remove this one">${icon('trash')}</button>` : ''}</div>
                    ${v.editing === i ? voiceEditor(item, i) : ''}`;
            }).join('')}</div></div>
            <div class="split"><button class="btn" data-action="voiceReject">${t.cancel}</button><button class="btn primary" data-action="voiceAccept" ${v.phase === 'saving' ? 'disabled' : ''}>${v.review.length === 1 ? t.save : t.saveAll.replace('{n}', v.review.length)}</button></div>`
            : `<div class="split"><button class="btn" data-action="voiceClose">Close</button></div>`}
        <small class="voice-privacy">Your browser turns the speech into text (Google's service in Chrome, Apple's in Safari). LifeDesk keeps only the entry, encrypted like the rest. Say “cancel” to stop.</small>
    </section>`;
}

/** Phones: once the large title has scrolled away, a frosted bar at the top keeps the screen's title (and its back link). */
function fillNavbar() {
    const bar = app.querySelector('.navbar');
    const title = app.querySelector('.hero h1');
    if (!bar || !title) {
        return;
    }
    const back = app.querySelector('.hero .back');
    bar.innerHTML = `${back ? back.outerHTML : '<span></span>'}<b>${esc(title.textContent)}</b>`;
    bar.classList.toggle('show', title.getBoundingClientRect().bottom < 8);
}
window.addEventListener('scroll', () => {
    const bar = app.querySelector('.navbar');
    const title = app.querySelector('.hero h1');
    if (bar && title) {
        bar.classList.toggle('show', title.getBoundingClientRect().bottom < 8);
    }
}, { passive: true });

const OPENABLE = '.card.form, .a-panel, .p-body, .emi-box, .asset-box, .a-detail .form, section.card > .form';
let openBefore = new Set();
/** After each drawing: what was not open a moment ago gets the "enter" movement. */
function markEntered() {
    const now = new Set();
    app.querySelectorAll(OPENABLE).forEach((el, i) => {
        const key = `${state.route}|${el.className}|${el.closest('[data-rem], .acct-row, .person, .card') ? (el.closest('[data-rem], .acct-row, .person, .card').querySelector('b, h2, h3') || {}).textContent : i}`;
        now.add(key);
        if (!openBefore.has(key)) {
            el.classList.add('enter');
        }
    });
    openBefore = now;
}

// A banner at the top, like a Salesforce toast: icon, message, close button. It slides in once, even though the
// screen is redrawn while it shows.
const TOAST_ICONS = {
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff"/><path d="M7.5 12.4l3 3 6-6.4" fill="none" stroke="#2e844a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff"/><path d="M12 6.8v6.4" fill="none" stroke="#ba0517" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.9" r="1.4" fill="#ba0517"/></svg>'
};
function toastHtml() {
    const t = state.toast;
    if (!t) {
        return '';
    }
    const pop = t.shown ? '' : 'pop';
    t.shown = true;
    return `<div class="toast ${t.kind} ${pop}" role="${t.kind === 'warn' ? 'alert' : 'status'}"><span class="toast-icon">${TOAST_ICONS[t.kind] || TOAST_ICONS.ok}</span><span class="toast-text">${esc(t.message)}</span>${t.action ? `<button class="toast-act" data-action="toastAct">${esc(t.action.label)}</button>` : ''}
        <button class="toast-close" data-action="toastClose" aria-label="Close" title="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div>`;
}

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
        state.vault = { pass: '', pass2: '', code: null, saved: false, mode: 'pass', recovery: '', busy: false };
        state.login = { mode: 'signin', step: 'form', name: '', email: '', password: '', code: '', show: false, busy: false };
        await S.signOut();
    },
    loginMode(el) {
        state.login.mode = el.dataset.mode;
        state.login.step = 'form';
        state.login.password = '';
        state.login.code = '';
        render();
    },
    loginShow() {
        state.login.show = !state.login.show;
        render();
    },
    async loginSubmit() {
        const f = state.login;
        if (f.busy) {
            return;
        }
        const email = f.email.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return toast('Enter your email address.', 'warn');
        }
        if (f.mode !== 'reset' && !f.password) {
            return toast('Enter your password.', 'warn');
        }
        if (f.mode === 'signup' && f.password.length < 8) {
            return toast('Choose a password with at least 8 characters.', 'warn');
        }
        f.busy = true;
        render();
        try {
            if (f.mode === 'reset') {
                await S.resetPassword(email);
                f.mode = 'signin';
                toast(`If ${email} has an account, a reset email is on its way. Check spam too.`);
            } else if (f.mode === 'signup' && f.step === 'form') {
                try {
                    await S.sendCode(email);
                    f.limit = false;
                } catch (e) {
                    if (e.code === 'daily') {
                        f.limit = true; // stays on the form as a notice, not a passing message
                        return;
                    }
                    throw e;
                }
                f.step = 'code';
                f.code = '';
                toast(`Code sent to ${email}.`);
                return;
            } else if (f.mode === 'signup') {
                if (f.code.replace(/\D/g, '').length !== 6) {
                    toast('Enter the 6-digit code from the email.', 'warn');
                    return;
                }
                await S.verifyCode(email, f.code);
                await S.signUpPassword(f.name.trim(), email, f.password);
                f.step = 'form';
                f.code = '';
            } else {
                await S.signInPassword(email, f.password);
            }
            f.password = '';
        } finally {
            f.busy = false;
            render();
        }
    },
    async loginResend() {
        try {
            await S.sendCode(state.login.email.trim());
        } catch (e) {
            if (e.code === 'daily') {
                state.login.limit = true;
                state.login.step = 'form';
                return render();
            }
            throw e;
        }
        state.login.code = '';
        toast('A new code is on its way.');
    },
    loginBack() {
        state.login.step = 'form';
        state.login.code = '';
        render();
    },
    // signed in but the email was never confirmed
    async verifySend() {
        const f = state.login;
        f.busy = true;
        render();
        try {
            await S.sendCode(S.user.contact);
            f.step = 'code';
            f.code = '';
            toast(`Code sent to ${S.user.contact}.`);
        } finally {
            f.busy = false;
            render();
        }
    },
    async verifySubmit() {
        const f = state.login;
        if (f.step !== 'code') {
            return actions.verifySend();
        }
        if (f.busy) {
            return;
        }
        if (f.code.replace(/\D/g, '').length !== 6) {
            return toast('Enter the 6-digit code from the email.', 'warn');
        }
        f.busy = true;
        render();
        try {
            await S.verifyCode(S.user.contact, f.code);
            await S.confirmVerified();
            f.step = 'form';
            f.code = '';
        } finally {
            f.busy = false;
            render();
        }
    },
    // encryption
    async vaultRun(work) {
        const v = state.vault;
        if (v.busy) {
            return;
        }
        v.busy = true;
        render();
        try {
            await work(v);
        } finally {
            v.busy = false;
            render();
        }
    },
    newPassProblem(v) {
        return v.pass.length < 8 ? 'Choose a passphrase with at least 8 characters.' : v.pass !== v.pass2 ? 'The two passphrases are not the same.' : null;
    },
    async vaultCreate() {
        const problem = actions.newPassProblem(state.vault);
        if (problem) {
            return toast(problem, 'warn');
        }
        await actions.vaultRun(async (v) => {
            v.code = await S.createPassphrase(v.pass);
            v.pass = v.pass2 = '';
            toast('Passphrase set. Your data is now encrypted.');
        });
    },
    vaultSaved() {
        state.vault.saved = !state.vault.saved;
        render();
    },
    async vaultCopy() {
        try {
            await navigator.clipboard.writeText(state.vault.code);
            toast('Recovery code copied.');
        } catch (e) {
            toast('Could not copy. Select the code and copy it by hand.', 'warn');
        }
    },
    vaultEnter() {
        if (!state.vault.saved) {
            return toast('Tick the box once you have saved the code.', 'warn');
        }
        state.vault = { pass: '', pass2: '', code: null, saved: false, mode: 'pass', recovery: '', busy: false };
        S.enterData();
    },
    vaultMode(el) {
        state.vault.mode = el.dataset.mode;
        state.vault.pass = state.vault.pass2 = '';
        render();
    },
    async vaultUnlock() {
        await actions.vaultRun(async (v) => {
            if (await S.unlock(v.pass)) {
                v.pass = '';
                toast('Unlocked.');
            } else {
                toast('That passphrase is not right.', 'warn');
            }
        });
    },
    async vaultRecover() {
        const problem = actions.newPassProblem(state.vault);
        if (problem) {
            return toast(problem, 'warn');
        }
        await actions.vaultRun(async (v) => {
            if (await S.unlockWithRecovery(v.recovery, v.pass)) {
                state.vault = { pass: '', pass2: '', code: null, saved: false, mode: 'pass', recovery: '', busy: false };
                toast('Unlocked. Your new passphrase is set.');
            } else {
                toast('That recovery code is not right.', 'warn');
            }
        });
    },
    lockDevice() {
        if (window.confirm('Lock this device? Your data passphrase will be asked the next time. Nothing is deleted.')) {
            S.lockDevice();
            toast('This device is locked.');
        }
    },
    async welcomeSave() {
        const currency = document.getElementById('welcome-currency').value;
        await S.save('settings', { id: 'prefs', currency });
        toast(`Currency set to ${currency}.`);
    },

    // add entry
    setType(el) {
        const f = state.add;
        f.type = el.dataset.type;
        f.categoryId = f.categoryTouched ? null : L.suggestCategory(S.data.categories, f.description, f.type, S.data.entries);
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
    assetNew() {
        state.assets.form = { id: null, name: '', type: 'Vehicle', status: 'Owned', price: '', value: '', boughtOn: '' };
        render();
    },
    assetEdit(el) {
        state.assets.form = { ...byId(S.data.assets, el.dataset.id) };
        render();
        window.scrollTo(0, 0);
    },
    assetCancel() {
        state.assets.form = null;
        render();
    },
    async assetSave() {
        const f = state.assets.form;
        if (!String(f.name).trim()) {
            return toast('Enter a name.', 'warn');
        }
        const price = Number(f.price) || 0;
        const doc = { ...f, id: f.id || S.newId(), name: String(f.name).trim(), price, value: f.value === '' ? price : Number(f.value) || 0, boughtOn: f.boughtOn || null, loanId: f.loanId || null, createdAt: f.createdAt || Date.now() };
        state.assets.form = null;
        await S.save('assets', doc);
        toast(`${doc.name} saved.`);
    },
    async assetDelete(el) {
        const a = byId(S.data.assets, el.dataset.id);
        if (window.confirm(`Delete ${a.name} from My assets?\nEntries and any loan stay as they are.`)) {
            await S.remove('assets', a.id);
            toast(`${a.name} deleted.`);
        }
    },
    // offline screen
    async netRetry() {
        state.net.checking = true;
        render();
        const online = await reachable();
        state.net.checking = false;
        if (online) {
            backOnline();
        } else {
            toast('Still no connection. Check your Wi-Fi or mobile data.', 'warn');
        }
    },
    netContinue() {
        state.net.dismissed = true;
        render();
    },
    netShow() {
        state.net.dismissed = false;
        render();
    },
    async toastAct() {
        const act = state.toast && state.toast.action;
        if (act) {
            window.clearTimeout(toast.timer);
            state.toast = null;
            await act.run();
        }
    },
    // the + of the bottom bar: a tap offers typing or speaking; holding it starts speaking at once (see "hold" below)
    addMenu(el, event) {
        event.preventDefault();
        if (plusHeld) {
            plusHeld = false; // the press was a hold: voice is already open
            return;
        }
        state.addMenu = !state.addMenu;
        render();
    },
    addMenuClose() {
        state.addMenu = false;
        render();
    },
    addMenuType() {
        state.addMenu = false;
        if (state.route === 'add') {
            render(); // already there: the link changes nothing, so only the menu is closed
        }
    },
    addMenuVoice() {
        state.addMenu = false;
        actions.voiceOpen();
    },
    // voice entry
    voiceOpen() {
        state.addMenu = false;
        voiceSession = null;
        state.voice = { open: true, lang: voiceLang(), phase: 'idle', interim: '', note: '', log: [], review: null, unclear: 0, heard: '', question: '', editing: null };
        voiceOpenedAt = Date.now();
        voiceRemember();
        if (voiceBlocker()) {
            return render();
        }
        voiceListen(); // the tap that opened the sheet is what lets the browser ask for the microphone
    },
    voiceClose(el, event) {
        // the finger that opened the sheet (a long press on +) must not close it again as it lifts
        if (el && el.classList.contains('voice-back') && Date.now() - voiceOpenedAt < 450) {
            return;
        }
        voiceStop();
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        voiceSession = null;
        state.voice.open = false;
        plusHeld = false;
        // "Type the entry" is a link: give the history step back first, then follow it (see the popstate listener)
        const go = el && el.tagName === 'A' ? el.getAttribute('href') : '';
        if (go && window.history.state && window.history.state.voice) {
            event.preventDefault();
            voiceThen = go;
        }
        voiceForget();
        render();
    },
    voiceLang(el) {
        state.voice.lang = el.dataset.lang;
        try {
            localStorage.setItem('lifedesk-voice-lang', el.dataset.lang);
        } catch (e) {
            // the choice then lasts for this visit only
        }
        voiceSession = null;
        state.voice.log = [];
        state.voice.review = null;
        voiceListen();
    },
    voiceGender(el) {
        try {
            localStorage.setItem('lifedesk-voice-gender', el.dataset.gender);
            Object.keys(Voice.LANGS).forEach((k) => localStorage.removeItem(`lifedesk-voice-name-${k}`)); // back to the best voice of that kind
        } catch (e) {
            // the choice then lasts for this visit only
        }
        render();
        actions.voiceSample();
    },
    voiceCardLang(el) {
        state.more.voiceLang = el.dataset.lang;
        render();
    },
    voiceSample() {
        const lang = state.more.voiceLang || voiceLang();
        state.voice.lang = lang;
        voiceSay(VOICE_SAMPLE[lang](voiceGender()));
    },
    // the review before saving: Save and Cancel do what saying yes and no do
    voiceAccept() {
        const items = state.voice.review;
        if (items && items.length) {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            return voiceStore(items);
        }
        return null;
    },
    voiceReject() {
        const v = state.voice;
        voiceStop();
        voiceSession = null;
        v.review = null;
        v.log.push({ who: 'app', text: VOICE_TEXT[v.lang].declined, kind: 'warn' });
        v.phase = 'idle';
        render();
        voiceSay(VOICE_TEXT[v.lang].declined);
    },
    voiceEdit(el) {
        const v = state.voice;
        const i = Number(el.dataset.i);
        v.editing = v.editing === i ? null : i;
        voiceStop(); // while changing something by hand the microphone is closed; Save, or a tap on it, goes on
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        v.phase = 'idle';
        v.unclear = 2;
        v.heard = ''; // nothing was misheard: the user chose to change something
        v.note = '';
        render();
    },
    voiceEditDone() {
        state.voice.editing = null;
        render();
    },
    voiceDrop(el) {
        const v = state.voice;
        v.editing = null;
        v.review = Voice.drop(voiceSession, Number(el.dataset.i), voiceCtx());
        if (!v.review.length) {
            return actions.voiceReject();
        }
        return render();
    },
    voiceMic() {
        if ((state.voice.phase === 'listening' || state.voice.phase === 'starting') && voiceRec) {
            voiceUserStop = true;
            window.clearTimeout(voiceSilence);
            return voiceRec.stop(); // finishes with whatever was heard, without waiting for a pause
        }
        return voiceListen();
    },
    toastClose() {
        window.clearTimeout(toast.timer);
        state.toast = null;
        render();
    },
    goBack(el, event) {
        event.preventDefault(); // the browser's own back keeps its history in step (the link's address is the fallback)
        window.history.back();
    },
    // push notifications
    async pushOn() {
        const blocker = pushBlocker();
        if (blocker) {
            return toast(blocker, 'warn');
        }
        state.push.busy = true;
        render();
        try {
            if ((await Notification.requestPermission()) !== 'granted') {
                return toast('Notifications were not allowed. Allow them in the browser or phone settings to turn this on.', 'warn');
            }
            let token;
            try {
                token = await S.pushToken(PUSH.vapidKey);
            } catch (e) {
                console.error(e);
                // private / incognito windows refuse push without saying so; so do some locked-down browsers
                return toast(/permission|denied|abort/i.test(`${e.name} ${e.message}`) ? 'This browser window cannot receive notifications. Private or incognito windows cannot; open LifeDesk in a normal window and try again.' : `Notifications could not be turned on: ${e.message}`, 'warn');
            }
            const p = S.push || {};
            await S.pushAdd(token, { enabled: true, renewals: p.renewals !== false, monthStart: p.monthStart !== false, tz: pushZone(), dates: pushDates() });
            localStorage.setItem(pushSlot(), token);
            toast('Notifications are on for this device.');
        } finally {
            state.push.busy = false;
            render();
        }
    },
    async pushOff() {
        state.push.busy = true;
        render();
        try {
            await S.pushRemove(pushDevice());
            localStorage.removeItem(pushSlot());
            toast('Notifications are off on this device.');
        } finally {
            state.push.busy = false;
            render();
        }
    },
    async pushPref(el) {
        const key = el.dataset.pref;
        const value = !(S.push && S.push[key] !== false);
        await S.pushUpdate(key === 'renewals' ? { renewals: value, dates: pushDates(value) } : { [key]: value });
        toast(`${key === 'renewals' ? 'Renewal reminders' : 'Start-of-month reminder'} turned ${value ? 'on' : 'off'}.`);
    },
    async emailToggle() {
        const value = !(S.push && S.push.email);
        state.push.busy = true;
        render();
        try {
            if (value) {
                const p = S.push || {};
                await S.pushUpdate({ enabled: true, email: true, emailDetails: false, renewals: p.renewals !== false, monthStart: p.monthStart !== false, tz: pushZone(),
                    dates: pushDates(p.renewals !== false, false) });
                toast(`Reminders will also be emailed to ${S.user.contact}.`);
            } else {
                await S.pushUpdate({ email: false, emailDetails: false, dates: pushDates(undefined, false) });
                await S.pushRemove(null); // deletes the schedule when no device is left either
                toast('Email reminders are off.');
            }
        } finally {
            state.push.busy = false;
            render();
        }
    },
    async emailDetails() {
        const value = !(S.push && S.push.emailDetails);
        if (value && !window.confirm('Include reminder names and amounts in emails?\nTo write them into the email, they are kept readable for the email sender (only the names and amounts of reminders). Everything else stays encrypted.')) {
            return render();
        }
        await S.pushUpdate({ emailDetails: value, dates: pushDates(undefined, value) });
        toast(value ? 'Emails will include reminder names and amounts.' : 'Emails will no longer include names and amounts.');
    },
    async pushTest() {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('✅ Notifications work on this device', { body: 'Renewal reminders and a start-of-month nudge will appear here.', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'lifedesk-test', data: { link: './#more' } });
    },
    // renewal reminders
    remNew() {
        state.renewals.form = { id: null, name: '', kind: 'Insurance', due: '', repeat: 12, amount: '', remindDays: 30, accountId: (defaultAccount() || {}).id || '', notes: '' };
        state.renewals.renew = null;
        render();
    },
    remEdit(el) {
        state.renewals.form = { ...byId(S.data.reminders, el.dataset.id) };
        state.renewals.renew = null;
        render();
        window.scrollTo(0, 0);
    },
    remCancel() {
        state.renewals.form = null;
        render();
    },
    async remSave() {
        const f = state.renewals.form;
        if (!String(f.name).trim()) {
            return toast('Enter a name.', 'warn');
        }
        if (!f.due) {
            return toast('Choose the due or expiry date.', 'warn');
        }
        if (Number(f.amount) < 0) {
            return toast('The amount cannot be below zero.', 'warn');
        }
        const doc = { ...f, id: f.id || S.newId(), name: String(f.name).trim(), notes: String(f.notes || '').trim(), repeat: Number(f.repeat) || 0, amount: Number(f.amount) || 0,
            remindDays: Number(f.remindDays) || 0, accountId: f.accountId || null, done: false, createdAt: f.createdAt || Date.now() };
        state.renewals.form = null;
        remArrive([doc.id]);
        await S.save('reminders', doc);
        toast(`${doc.name} saved.`);
    },
    remRenewOpen(el) {
        const r = byId(S.data.reminders, el.dataset.id);
        const account = byId(S.data.accounts, r.accountId) && byId(S.data.accounts, r.accountId).active !== false ? r.accountId : (defaultAccount() || {}).id || '';
        state.renewals.renew = { id: r.id, next: L.nextDue(r) || '', record: Number(r.amount) > 0, amount: Number(r.amount) || '', accountId: account,
            categoryId: L.suggestCategory(S.data.categories, `${r.name} ${r.kind}`, 'expense', S.data.entries) || '' };
        state.renewals.form = null;
        render();
    },
    remRenewCancel() {
        state.renewals.renew = null;
        render();
    },
    remRecord() {
        state.renewals.renew.record = !state.renewals.renew.record;
        render();
    },
    async remRenewSave() {
        const f = state.renewals.renew;
        const r = byId(S.data.reminders, f.id);
        const repeating = Number(r.repeat) > 0;
        if (repeating && !f.next) {
            return toast('Choose the next due date.', 'warn');
        }
        if (repeating && f.next <= r.due) {
            return toast('The next due date must be after the current one.', 'warn');
        }
        const pairs = [['reminders', repeating ? { ...r, due: f.next, lastRenewed: today() } : { ...r, done: true, lastRenewed: today() }]];
        if (f.record) {
            const entry = { id: S.newId(), type: 'expense', amount: Number(f.amount), date: today(), description: `${r.name} – renewed`, accountId: f.accountId, toAccountId: null,
                categoryId: f.categoryId, personId: null, reminderId: r.id, notes: '', createdAt: Date.now() };
            const problem = L.validateEntry(entry, S.data);
            if (problem) {
                return toast(problem, 'warn');
            }
            pairs.push(['entries', entry]);
        }
        state.renewals.renew = null;
        await remLeave([r.id]); // it leaves its place, then appears where it now belongs
        remArrive([r.id]);
        await S.saveAll(pairs);
        toast(`${r.name} renewed${repeating ? `, next due ${longDate(f.next)}` : ''}${f.record ? ` · ${L.money(f.amount)} recorded` : ''}.`);
    },
    async remUndo(el) {
        const r = byId(S.data.reminders, el.dataset.id);
        await remLeave([r.id]);
        remArrive([r.id]);
        await S.save('reminders', { ...r, done: false });
        toast(`${r.name} is open again.`);
    },
    remShowDone() {
        state.renewals.showDone = !state.renewals.showDone;
        render();
    },
    // made-up reminders only (Account → Sample data adds these too, with the money sample)
    async remSampleLoad() {
        const pairs = buildSample(S.data, today(), L.currentFormat().currency).filter(([c]) => c === 'reminders')
            .map(([c, doc]) => [c, { ...doc, accountId: byId(S.data.accounts, doc.accountId) ? doc.accountId : null }]);
        if (!window.confirm(`Add ${pairs.length} sample reminders?\nMade-up ones dated from today: one overdue, one due today, one tomorrow, one in 2 days, and others later. Your own reminders stay as they are, and you can remove the sample ones here.`)) {
            return;
        }
        remArrive(pairs.map(([, doc]) => doc.id));
        await S.saveAll(pairs);
        toast(`${pairs.length} sample reminders added.`);
    },
    async remSampleRemove() {
        const pairs = sampleReminders();
        if (!window.confirm(`Remove the ${pairs.length} sample reminders? Your own reminders are kept.`)) {
            return;
        }
        await remLeave(pairs.map(([, id]) => id));
        await S.removeMany(pairs);
        state.renewals.leaving = [];
        toast('Sample reminders removed.');
    },
    async remDelete(el) {
        const r = byId(S.data.reminders, el.dataset.id);
        if (window.confirm(`Delete the reminder ${r.name}?\nAny payment already recorded in Account Management stays.`)) {
            await remLeave([r.id]);
            await S.remove('reminders', r.id);
            state.renewals.leaving = [];
            toast(`${r.name} deleted.`);
        }
    },
    emiToggle() {
        state.add.onEmi = !state.add.onEmi;
        render();
    },
    async saveEmi() {
        const f = state.add;
        const s = emiSums(f);
        const problem = !(s.price > 0) ? 'Enter the full price.'
            : !f.accountId ? 'Choose the account the EMIs are paid from.'
            : byId(S.data.accounts, f.accountId).kind === 'card' ? 'Choose a bank, wallet or cash account for the EMIs.'
            : f.type === 'expense' && !f.categoryId ? 'Choose a category.'
            : f.type === 'asset' && !f.description.trim() ? 'Enter what you bought in Description: it becomes the asset name.'
            : !(s.emi > 0) ? 'Enter the EMI per month.'
            : !(s.months >= 1) ? 'Enter the number of EMIs.'
            : !f.emiFirst ? 'Choose the first EMI date.'
            : s.down < 0 || s.down >= s.price ? 'The down payment must be less than the price.'
            : s.emi * s.months < s.financed ? `The EMIs add up to ${L.money(s.emi * s.months)}, less than the ${L.money(s.financed)} financed. Check the EMI and the number of EMIs.`
            : f.date > today() ? 'The date cannot be in the future.' : null;
        if (problem) {
            return toast(problem, 'warn');
        }
        const name = f.description.trim() || 'Purchase on EMI';
        const loan = { id: S.newId(), name, lender: f.emiLender.trim(), price: s.price, downPayment: s.down, financed: s.financed, emi: s.emi, months: s.months,
            firstDate: f.emiFirst, rate: s.rate, rateCalculated: !s.typed, accountId: f.accountId, categoryId: f.type === 'expense' ? f.categoryId : null, boughtOn: f.date, assetId: null, createdAt: Date.now() };
        const pairs = [['loans', loan]];
        if (f.type === 'asset') {
            loan.assetId = S.newId();
            pairs.push(['assets', { id: loan.assetId, name, type: f.assetType, price: s.price, value: Number(f.assetValue) || s.price, boughtOn: f.date, loanId: loan.id, status: 'Owned', createdAt: Date.now() }]);
        }
        if (s.down > 0) {
            pairs.push(['entries', { id: S.newId(), type: f.type, amount: s.down, date: f.date, description: `${name} – down payment`, accountId: f.accountId, toAccountId: null,
                categoryId: loan.categoryId, personId: null, notes: f.notes.trim(), loanDown: loan.id, assetId: loan.assetId, createdAt: Date.now() }]);
        }
        state.add = blankEntry();
        await S.saveMany(pairs);
        toast(`${name}: ${s.months} EMIs of ${L.money(s.emi)} set up${s.down ? `, ${L.money(s.down)} paid today` : ''}.`);
    },
    async payEmi(el) {
        const loan = loanRows().find((l) => l.id === el.dataset.id);
        if (!loan || !loan.left) {
            return;
        }
        const number = loan.paid + 1;
        const category = S.data.categories.find((c) => c.type === 'expense' && /loan|instalment|emi/i.test(c.name));
        await S.save('entries', { id: S.newId(), type: 'expense', amount: Number(loan.emi), date: loan.next > today() ? today() : loan.next, description: `${loan.name} – EMI ${number} of ${loan.months}`,
            accountId: loan.accountId, toAccountId: null, categoryId: category ? category.id : loan.categoryId, personId: null, notes: '', loanId: loan.id, createdAt: Date.now() });
        toast(`EMI ${number} of ${loan.months} paid. ${L.money((loan.left - 1) * loan.emi)} still to pay.`);
    },
    async loanDelete(el) {
        const loan = byId(S.data.loans, el.dataset.id);
        if (window.confirm(`Delete the loan "${loan.name}"?\nEMIs already paid stay as expenses.`)) {
            await S.remove('loans', loan.id);
            toast('Loan deleted.');
        }
    },
    async saveEntry() {
        const f = state.add;
        if (f.onEmi && (f.type === 'expense' || f.type === 'asset') && !f.id) {
            return actions.saveEmi();
        }
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
            createdAt: existing ? existing.createdAt : Date.now(),
            // links an edit must keep
            loanId: existing ? existing.loanId || null : null,
            loanDown: existing ? existing.loanDown || null : null,
            assetId: existing ? existing.assetId || null : null
        };
        if (f.type === 'asset' && !f.id) {
            if (!f.description.trim()) {
                return toast('Enter what you bought in Description: it becomes the asset name.', 'warn');
            }
            entry.assetId = S.newId();
            pairs.push(['assets', { id: entry.assetId, name: f.description.trim(), type: f.assetType, price: entry.amount, value: Number(f.assetValue) || entry.amount, boughtOn: f.date, loanId: null, status: 'Owned', createdAt: Date.now() }]);
        }
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
        toast(`${p.name} marked ${el.dataset.status}.`);
    },
    async personDelete(el) {
        const p = byId(S.data.people, el.dataset.id);
        if (window.confirm(`Delete ${p.name}?`)) {
            state.people.selected = null;
            await S.remove('people', p.id);
            toast(`${p.name} deleted.`);
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
        const a = byId(S.data.accounts, el.dataset.id);
        await S.save('accounts', { ...a, active: true });
        toast(`${a.name} reopened.`);
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

    // dashboards and reports
    insTab(el) {
        state.insights.tab = el.dataset.tab;
        render();
    },
    insMonth(el) {
        state.insights.month = L.addMonths(state.insights.month, Number(el.dataset.step));
        render();
    },
    reportDownload() {
        const { report, period, table } = currentReport(state.reports, today());
        // the BOM lets spreadsheet programs read currency symbols and non-English names correctly
        const url = URL.createObjectURL(new Blob(['\ufeff' + toCsv(table)], { type: 'text/csv;charset=utf-8' }));
        const name = `lifedesk-${report.id}-${period.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.csv`;
        Object.assign(document.createElement('a'), { href: url, download: name }).click();
        URL.revokeObjectURL(url);
    },

    async currencyKeep() {
        const to = state.more.change.to;
        state.more.change = null;
        await S.save('settings', { ...(S.prefs() || { id: 'prefs' }), currency: to });
        toast(`Amounts are now shown in ${to}. The numbers were not changed.`);
    },
    currencyBackup() {
        state.more.change.backup = !state.more.change.backup;
        render();
    },
    currencyCancel() {
        state.more.change = null;
        render();
    },
    async currencyConvert() {
        const { to, rate, backup } = state.more.change;
        const from = L.currentFormat().currency;
        const r = Number(rate);
        if (!(r > 0)) {
            return toast('Enter the exchange rate first.', 'warn');
        }
        if (!window.confirm(`Convert every saved amount from ${from} to ${to} at 1 ${from} = ${r} ${to}?\n${backup ? 'A backup file is downloaded first.' : 'No backup file will be downloaded, so this cannot be undone exactly.'} This changes your data.`)) {
            return;
        }
        if (backup) {
            actions.exportData(); // the way back, if the rate was wrong
        }
        const x = (v) => (v === null || v === undefined || v === '' ? v : Math.round(Number(v) * r * 100) / 100);
        const pairs = [];
        S.data.entries.forEach((e) => pairs.push(['entries', { ...e, amount: x(e.amount) }]));
        S.data.accounts.forEach((a) => pairs.push(['accounts', { ...a, opening: x(a.opening), limit: x(a.limit) }]));
        S.data.people.forEach((p) => pairs.push(['people', { ...p, opening: x(p.opening) }]));
        S.data.budgets.forEach((b) => pairs.push(['budgets', { ...b, lines: Object.fromEntries(Object.entries(b.lines || {}).map(([k, v]) => [k, x(v)])) }]));
        S.data.loans.forEach((l) => pairs.push(['loans', { ...l, price: x(l.price), downPayment: x(l.downPayment), financed: x(l.financed), emi: x(l.emi) }]));
        S.data.assets.forEach((a) => pairs.push(['assets', { ...a, price: x(a.price), value: x(a.value) }]));
        S.data.reminders.forEach((r) => pairs.push(['reminders', { ...r, amount: x(r.amount) }]));
        pairs.push(['settings', { ...(S.prefs() || { id: 'prefs' }), currency: to }]);
        state.more.busy = true;
        render();
        try {
            await S.saveAll(pairs);
            state.more.change = null;
            toast(`Converted to ${to} at ${r}.${backup ? ` A backup of the ${from} amounts was downloaded.` : ''}`);
        } finally {
            state.more.busy = false;
            render();
        }
    },
    setTheme(el) {
        const t = el.dataset.theme;
        try {
            t === 'system' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, t);
        } catch (e) {
            // private browsing: the choice lasts until the page is closed
        }
        applyTheme(t);
        render();
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
    async sampleLoad() {
        const pairs = buildSample(S.data, today(), L.currentFormat().currency);
        const entries = pairs.filter((p) => p[0] === 'entries').length;
        if (!window.confirm(`Add sample data?\n${entries} made-up entries from 1 March 2025 to today, in four sample accounts, with three sample people, three assets and two loans on EMI. Your own entries stay as they are, and you can remove the sample data here later.`)) {
            return;
        }
        state.more.busy = true;
        render();
        try {
            await S.saveAll(pairs);
            toast(`${entries} sample entries added.`);
        } finally {
            state.more.busy = false;
            render();
        }
    },
    async sampleRemove() {
        const pairs = sampleDocs(S.data);
        if (!window.confirm(`Remove all sample data (${pairs.length} items)? Your own entries are kept.`)) {
            return;
        }
        state.more.busy = true;
        render();
        try {
            await S.removeMany(pairs);
            toast('Sample data removed.');
        } finally {
            state.more.busy = false;
            render();
        }
    },
    async deleteAccount() {
        if (!window.confirm('Delete your LifeDesk account and ALL your data?\nThis cannot be undone. Download a backup first if you may want it.')) {
            return;
        }
        if (window.prompt('Type DELETE to confirm.') !== 'DELETE') {
            return toast('Nothing was deleted.');
        }
        await S.deleteAccount();
        state.login = { mode: 'signin', step: 'form', name: '', email: '', password: '', code: '', show: false, busy: false };
        toast('Your account and data were deleted.');
    },
    async demoReset() {
        if (window.confirm('Erase all demo data in this browser?')) {
            await S.clearDemo();
            toast('Demo data erased.');
        }
    }
};

/** Keeps the trail in step with the address: a step back to the previous screen pops it, anything else adds to it. */
function trackRoute() {
    const r = SCREENS[state.route] ? state.route : 'hub';
    const from = trail[trail.length - 1];
    if (trail[trail.length - 2] === r) {
        trail.pop();
        return 'back';
    }
    if (from !== r) {
        trail.push(r);
        // between the tabs of the bottom bar it is a switch, not a step deeper
        return TAB_ROUTES.includes(from) && TAB_ROUTES.includes(r) ? 'tab' : 'forward';
    }
    return null;
}

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
        toast(errorText(e), 'warn');
    }
});

app.addEventListener('input', (event) => {
    const el = event.target;
    if (el.dataset.vfield && voiceSession) {
        // the review form of voice entry: applied as it is typed (the list is redrawn when the field is left)
        state.voice.review = Voice.edit(voiceSession, Number(el.dataset.i), { [el.dataset.vfield]: el.value }, voiceCtx());
        state.voice.note = '';
        return;
    }
    if (el.dataset.model) {
        setPath(el.dataset.model, el.type === 'checkbox' ? el.checked : el.value);
        if (el.dataset.then === 'suggest' && !state.add.categoryTouched) {
            const id = L.suggestCategory(S.data.categories, state.add.description, state.add.type, S.data.entries);
            state.add.categoryId = id;
            const select = document.getElementById('add-category');
            if (select) {
                select.value = id || '';
            }
        }
        const emiBox = document.getElementById('emi-summary');
        if (emiBox && (el.dataset.then === 'emi' || el.dataset.model === 'add.amount')) {
            const f = state.add;
            const rateBox = document.getElementById('emi-rate');
            if (el === rateBox) {
                f.emiRateTouched = el.value !== ''; // cleared: back to the calculated rate
            }
            const m = emiSums(f);
            if (!m.typed && el !== rateBox) {
                rateBox.value = m.price > 0 && m.emi > 0 && m.months > 0 ? m.calculated : '';
            }
            document.getElementById('emi-rate-pill').hidden = m.typed;
            emiBox.innerHTML = emiSummary(f);
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
        app.querySelectorAll('[data-action="budgetSave"]').forEach((btn) => {
            btn.disabled = false;
            btn.textContent = 'Save budget';
        });
        const bar = app.querySelector('.savebar');
        if (bar) {
            bar.hidden = false;
        }
    }
});
// Enter in the sign-in form submits it (and the browser never reloads the page for the form)
app.addEventListener('submit', (event) => event.preventDefault());
app.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.closest('[data-form]')) {
        event.preventDefault();
        try {
            await actions[event.target.closest('[data-form]').dataset.form]();
        } catch (e) {
            console.error(e);
            toast(errorText(e), 'warn');
        }
    }
});
app.addEventListener('change', async (event) => {
    const el = event.target;
    try {
        if (el.dataset.vfield && voiceSession) {
            state.voice.review = Voice.edit(voiceSession, Number(el.dataset.i), { [el.dataset.vfield]: el.value }, voiceCtx());
            return render();
        }
        if (el.dataset.voiceName) {
            try {
                if (el.value) {
                    localStorage.setItem(`lifedesk-voice-name-${el.dataset.voiceName}`, el.value);
                } else {
                    localStorage.removeItem(`lifedesk-voice-name-${el.dataset.voiceName}`);
                }
            } catch (e) {
                // the choice then lasts for this visit only
            }
            render();
            return actions.voiceSample();
        }
        if (el.dataset.model && 'rerender' in el.dataset) {
            setPath(el.dataset.model, el.value);
            render();
        }
        if (el.dataset.personField) {
            const p = byId(S.data.people, el.dataset.id);
            await S.save('people', { ...p, [el.dataset.personField]: el.value.trim() });
            toast(`${p.name} saved.`);
        }
        if ('currency' in el.dataset) {
            const from = L.currentFormat().currency;
            if (el.value === from) {
                state.more.change = null;
                return render();
            }
            const change = { to: el.value, rate: '', loading: true, source: '', backup: true };
            state.more.change = change;
            render();
            try {
                const res = await (await fetch(`https://open.er-api.com/v6/latest/${from}`)).json();
                const rate = res && res.rates ? res.rates[change.to] : null;
                if (rate) {
                    change.rate = String(rate);
                    change.source = 'open.er-api.com';
                }
            } catch (e) {
                // no connection or the service is down: the rate is typed by hand
            }
            change.loading = false;
            if (state.more.change === change) {
                render();
            }
            return;
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
        toast(errorText(e), 'warn');
    }
});

// ---------- chart tooltips: the same on hover and on keyboard focus ----------
const tipBox = document.createElement('div');
tipBox.className = 'tip';
tipBox.hidden = true;
document.body.appendChild(tipBox);
function showTip(el, x, y) {
    tipBox.textContent = ''; // built with text nodes: names come from the user's data
    const title = document.createElement('small');
    title.textContent = el.dataset.tip;
    tipBox.appendChild(title);
    for (const row of JSON.parse(el.dataset.tipRows || '[]')) {
        const line = document.createElement('div');
        if (row.slot) {
            const key = document.createElement('i');
            key.className = `key s${row.slot}`;
            line.appendChild(key);
        }
        const value = document.createElement('b');
        value.textContent = row.value;
        const name = document.createElement('span');
        name.textContent = row.name;
        line.append(value, name);
        tipBox.appendChild(line);
    }
    tipBox.hidden = false;
    const w = tipBox.offsetWidth;
    const h = tipBox.offsetHeight;
    tipBox.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2))}px`;
    tipBox.style.top = `${y - h - 12 < 8 ? y + 16 : y - h - 12}px`;
}
app.addEventListener('pointermove', (event) => {
    const el = event.target.closest ? event.target.closest('[data-tip]') : null;
    if (el) {
        showTip(el, event.clientX, event.clientY);
    } else {
        tipBox.hidden = true;
    }
});
app.addEventListener('pointerleave', () => (tipBox.hidden = true));
app.addEventListener('focusin', (event) => {
    const el = event.target.closest ? event.target.closest('[data-tip]') : null;
    if (el) {
        const r = el.getBoundingClientRect();
        showTip(el, r.left + r.width / 2, r.top);
    }
});
app.addEventListener('focusout', () => (tipBox.hidden = true));
// charts are drawn for the current width: redraw when the window changes between phone and desktop size
let wasWide = window.innerWidth >= 900;
window.addEventListener('resize', () => {
    const wide = window.innerWidth >= 900;
    if (wide !== wasWide && (state.route === 'insights' || state.route === 'reports')) {
        render();
    }
    wasWide = wide;
});

// ---------- press and hold the + of the bottom bar: speak an entry at once ----------
let plusHeld = false;
let plusTimer = null;
app.addEventListener('pointerdown', (event) => {
    if (event.target.closest && event.target.closest('.tabbar a.add')) {
        plusHeld = false;
        window.clearTimeout(plusTimer);
        plusTimer = window.setTimeout(() => {
            plusHeld = true;
            if (navigator.vibrate) {
                navigator.vibrate(12);
            }
            actions.voiceOpen();
        }, 480);
    }
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => app.addEventListener(type, () => window.clearTimeout(plusTimer), true));
app.addEventListener('contextmenu', (event) => {
    if (event.target.closest && event.target.closest('.tabbar a.add')) {
        event.preventDefault(); // a long press on a link would otherwise open the browser's own menu
    }
});

// ---------- connection ----------
/** True when a tiny request really reaches the site (the browser's own "online" only means a network is attached). */
async function reachable() {
    try {
        const res = await fetch(`manifest.webmanifest?ping=${Date.now()}`, { cache: 'no-store' }); // sw.js lets "ping" requests go straight to the network
        return res.ok;
    } catch (e) {
        return false;
    }
}
function backOnline() {
    const was = state.net.offline;
    state.net.offline = false;
    state.net.dismissed = false;
    if (state.net.failedStart) {
        window.location.reload(); // the app never started: start it now
        return;
    }
    if (was) {
        toast('You are back online.');
    } else {
        render();
    }
}
window.addEventListener('offline', () => {
    state.net.offline = true;
    state.net.dismissed = false;
    window.clearTimeout(toast.timer);
    state.toast = null; // an older message (such as "back online") does not belong on this screen
    render();
});
window.addEventListener('online', backOnline);

// The phone's (or browser's) Back button while voice entry is open: close the sheet and stay on the screen.
window.addEventListener('popstate', () => {
    if (state.voice.open) {
        actions.voiceClose();
        return;
    }
    if (voiceThen) {
        const go = voiceThen;
        voiceThen = '';
        window.location.hash = go;
    }
});
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.voice.open) {
        actions.voiceClose();
    }
});

window.addEventListener('hashchange', () => {
    state.route = window.location.hash.slice(1) || 'hub';
    state.addMenu = false;
    if (state.voice.open) {
        // another screen was opened while the sheet was up: stop listening, the sheet does not follow
        voiceStop();
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        voiceSession = null;
        state.voice.open = false;
    }
    const way = trackRoute();
    const show = () => {
        window.scrollTo(0, 0);
        tipBox.hidden = true;
        state.fresh = way === 'tab';
        render();
    };
    // Screens slide like a phone's own apps: forward from the right, back from the left, tabs cross-fade (css/ios.css).
    // Without the browser feature, or when the user asked for less motion, the screen simply changes.
    if (way && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.dataset.nav = way;
        const move = document.startViewTransition(show);
        // a second move before the first has finished skips the first one: expected, not an error
        move.ready.catch(() => {});
        move.finished.catch(() => {});
    } else {
        show();
    }
});

state.route = window.location.hash.slice(1) || 'hub';
trackRoute();
render();
let pushFor = null; // the user whose notification schedule has been read
S.init((status) => {
    // Signed out (or not yet verified): forget the screen that was open, so the next sign-in starts on All tools.
    // A page reload while signed in never passes through here, so it stays on the screen it was on.
    if (['signedOut', 'unverified', 'needPassphrase', 'locked'].includes(status) && state.route !== 'hub') {
        state.route = 'hub';
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        trail.length = 0;
        trail.push('hub');
    }
    state.status = status;
    if (status === 'ready' && !S.isDemo) {
        if (pushFor !== S.user.uid) {
            pushFor = S.user.uid;
            S.loadPush().then(() => (render(), syncPushSoon(), repairPushDevice())).catch((e) => console.error(e));
        } else {
            syncPushSoon();
        }
    } else if (status !== 'ready') {
        pushFor = null;
    }
    render();
}).catch(async (e) => {
    console.error(e);
    if (!navigator.onLine || !(await reachable())) {
        state.net.offline = true;
        state.net.failedStart = true;
        render();
        return;
    }
    app.innerHTML = `<div class="loading"><p>Could not start: ${esc(e.message)}</p></div>`;
});

if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}
