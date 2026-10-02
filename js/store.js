// Data layer for LifeDesk. Each tool keeps its data in its own collections under the user
// (Money: accounts, categories, entries, people, budgets; shared: settings); a new tool adds its names to COLLECTIONS.
// Two back ends behind the same functions:
//   - demo: this browser's localStorage, no login (used when config.js has no Firebase settings)
//   - firebase: Firebase Authentication + Cloud Firestore, each user under users/{uid}/...
import { firebaseConfig, firestoreDatabase, loginMethods, otpEndpoint } from './config.js';
import { STARTER_CATEGORIES } from './seed.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
const COLLECTIONS = ['accounts', 'categories', 'entries', 'people', 'budgets', 'settings'];
const DEMO_KEY = 'lifedesk-demo';
const EMAIL_KEY = 'lifedesk-email';

export const isDemo = !firebaseConfig.apiKey || new URLSearchParams(window.location.search).get('demo') === '1';
export const methods = loginMethods;
export const data = { accounts: [], categories: [], entries: [], people: [], budgets: [], settings: [] };

/** The user's preferences (currency, region); null until they have chosen. */
export function prefs() {
    return data.settings.find((x) => x.id === 'prefs') || null;
}
export let user = null; // { uid, name, contact }

let listener = () => {};
let fb = null; // firebase modules and handles
let unsubscribe = [];
let loaded = new Set();
let confirming = false; // sign-up in progress: the account exists but its email is being marked verified

// On this computer only, tests may point the email-code calls somewhere else.
const OTP_URL = (window.location.hostname === 'localhost' && localStorage.getItem('lifedesk-otp-endpoint')) || otpEndpoint;
export const canSignUp = !!OTP_URL;

export function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** cb(state): 'loading' | 'signedOut' | 'unverified' (email not confirmed yet) | 'ready' (data changed). */
export async function init(cb) {
    listener = cb;
    if (isDemo) {
        user = { uid: 'demo', name: 'Demo user', contact: 'Data stays on this device' };
        Object.assign(data, readDemo());
        await seedIfNew();
        listener('ready');
        return;
    }
    listener('loading');
    const [app, auth, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`)
    ]);
    const fbApp = app.initializeApp(firebaseConfig);
    const db = fs.initializeFirestore(fbApp, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }, firestoreDatabase);
    fb = { auth, fs, db, handle: auth.getAuth(fbApp) };
    // Coming back from the link in a sign-in email
    if (auth.isSignInWithEmailLink(fb.handle, window.location.href)) {
        const email = localStorage.getItem(EMAIL_KEY) || window.prompt('Confirm your email to finish signing in');
        if (email) {
            try {
                await auth.signInWithEmailLink(fb.handle, email, window.location.href);
                localStorage.removeItem(EMAIL_KEY);
            } catch (e) {
                window.alert(`Sign-in link did not work: ${e.message}`);
            }
            window.history.replaceState({}, '', window.location.pathname);
        }
    }
    auth.onAuthStateChanged(fb.handle, (u) => {
        unsubscribe.forEach((fn) => fn());
        unsubscribe = [];
        loaded = new Set();
        COLLECTIONS.forEach((c) => (data[c] = []));
        if (!u) {
            user = null;
            listener('signedOut');
            return;
        }
        user = { uid: u.uid, name: u.displayName || u.email || u.phoneNumber || 'You', contact: u.email || u.phoneNumber || '' };
        if (!isVerified(u)) {
            // the database refuses unverified email + password accounts, so do not even ask it
            listener(confirming ? 'loading' : 'unverified');
            return;
        }
        subscribe(u);
    });
}

/** Google accounts are verified by Google; email + password accounts by the one-time code. */
function isVerified(u) {
    return u.emailVerified || !u.providerData.some((p) => p.providerId === 'password');
}

function subscribe(u) {
    listener('loading');
    for (const c of COLLECTIONS) {
        unsubscribe.push(
            fb.fs.onSnapshot(
                fb.fs.collection(fb.db, 'users', u.uid, c),
                async (snap) => {
                    data[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
                    loaded.add(c);
                    if (loaded.size === COLLECTIONS.length) {
                        await seedIfNew();
                        listener('ready');
                    }
                },
                (err) => {
                    console.error('data listener', c, err.code);
                    if (err.code === 'permission-denied') {
                        listener('unverified'); // the database does not accept this account yet
                    }
                }
            )
        );
    }
}

// ---------- email one-time codes ----------
const OTP_ERRORS = {
    bad_email: 'That email address does not look right. Please check it.',
    rate: 'Too many codes were sent to this address. Wait 15 minutes and try again.',
    daily: 'New email accounts cannot be created right now: this test version has reached today\'s limit. Use Continue with Google, or try again tomorrow.',
    wrong: 'That code is not right. Check the email and try again.',
    expired: 'That code is no longer valid. Send a new one.',
    too_many: 'Too many wrong tries. Send a new code.',
    not_verified: 'The email is not verified yet. Enter the code we sent you.',
    not_signed_in: 'Please sign in again.',
    offline: 'Cannot reach the verification service. Check your connection and try again.'
};

async function otpCall(body) {
    if (!OTP_URL) {
        throw new Error('Creating an account with email is not switched on yet. Use Continue with Google.');
    }
    let res;
    try {
        // no content type: a plain request that Apps Script accepts from a browser without extra checks
        res = await (await fetch(OTP_URL, { method: 'POST', body: JSON.stringify(body) })).json();
    } catch (e) {
        throw new Error(OTP_ERRORS.offline);
    }
    if (!res.ok) {
        const err = new Error(OTP_ERRORS[res.error] || 'The verification service had a problem. Try again in a minute.');
        err.code = res.error;
        throw err;
    }
    return res;
}

export function sendCode(email) {
    return otpCall({ action: 'send', email });
}
export function verifyCode(email, code) {
    return otpCall({ action: 'verify', email, code });
}

/** For a signed-in account whose email passed the code check: marks it verified and opens the data. */
export async function confirmVerified() {
    const u = fb.handle.currentUser;
    await otpCall({ action: 'confirm', idToken: await u.getIdToken() });
    await u.reload();
    await u.getIdToken(true); // the database reads "verified" from a fresh token
    subscribe(fb.handle.currentUser);
}

/** A new user starts with the starter categories and a Cash account. */
let seeding = false;
async function seedIfNew() {
    if (seeding || data.categories.length || data.accounts.length) {
        return;
    }
    seeding = true;
    const docs = STARTER_CATEGORIES.map((c) => ['categories', { ...c, id: newId() }]);
    docs.push(['accounts', { id: newId(), name: 'Cash', kind: 'cash', opening: 0, openingDate: null, active: true, isDefault: true }]);
    await saveMany(docs);
    seeding = false;
}

// ---------- writes ----------
export async function save(collection, doc) {
    await saveMany([[collection, doc]]);
    return doc.id;
}

export async function saveMany(pairs) {
    for (const [, doc] of pairs) {
        if (!doc.id) {
            doc.id = newId();
        }
    }
    if (isDemo) {
        for (const [c, doc] of pairs) {
            const i = data[c].findIndex((x) => x.id === doc.id);
            if (i >= 0) {
                data[c][i] = { ...doc };
            } else {
                data[c].push({ ...doc });
            }
        }
        writeDemo();
        listener('ready');
        return;
    }
    const batch = fb.fs.writeBatch(fb.db);
    for (const [c, doc] of pairs) {
        const { id, ...rest } = doc;
        batch.set(fb.fs.doc(fb.db, 'users', user.uid, c, id), clean(rest));
    }
    await batch.commit();
}

export async function remove(collection, id) {
    if (isDemo) {
        data[collection] = data[collection].filter((x) => x.id !== id);
        writeDemo();
        listener('ready');
        return;
    }
    await fb.fs.deleteDoc(fb.fs.doc(fb.db, 'users', user.uid, collection, id));
}

/** Firestore refuses undefined values. */
function clean(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = v === undefined ? null : v;
    }
    return out;
}

// ---------- sign in / out ----------
export async function signInGoogle() {
    const provider = new fb.auth.GoogleAuthProvider();
    await fb.auth.signInWithPopup(fb.handle, provider);
}

/** Email + password. The email is the user name. */
export async function signInPassword(email, password) {
    await fb.auth.signInWithEmailAndPassword(fb.handle, email, password);
}

/** Creates the account for an email that has just passed the code check (verifyCode), then opens it. */
export async function signUpPassword(name, email, password) {
    confirming = true;
    try {
        const cred = await fb.auth.createUserWithEmailAndPassword(fb.handle, email, password);
        if (name) {
            await fb.auth.updateProfile(cred.user, { displayName: name });
            if (user) {
                user.name = name; // the sign-in event fired before the name was stored
            }
        }
        await confirmVerified();
    } catch (e) {
        if (fb.handle.currentUser && !isVerified(fb.handle.currentUser)) {
            listener('unverified'); // account exists; the user can finish from the verify screen
        }
        throw e;
    } finally {
        confirming = false;
    }
}

export async function resetPassword(email) {
    await fb.auth.sendPasswordResetEmail(fb.handle, email);
}

export async function sendEmailLink(email) {
    await fb.auth.sendSignInLinkToEmail(fb.handle, email, {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: true
    });
    localStorage.setItem(EMAIL_KEY, email);
}

export async function signOut() {
    if (!isDemo) {
        await fb.auth.signOut(fb.handle);
    }
}

/** Removes everything the user stored, then the login itself. */
export async function deleteAccount() {
    const current = fb.handle.currentUser;
    const pairs = [];
    for (const c of COLLECTIONS) {
        for (const doc of data[c]) {
            pairs.push([c, doc.id]);
        }
    }
    for (let i = 0; i < pairs.length; i += 400) {
        const batch = fb.fs.writeBatch(fb.db);
        pairs.slice(i, i + 400).forEach(([c, id]) => batch.delete(fb.fs.doc(fb.db, 'users', current.uid, c, id)));
        await batch.commit();
    }
    unsubscribe.forEach((fn) => fn());
    unsubscribe = [];
    await fb.auth.deleteUser(current);
}

// ---------- backup ----------
export function exportJson() {
    return JSON.stringify({ app: 'LifeDesk', exportedAt: new Date().toISOString(), ...data }, null, 1);
}

export async function importJson(text) {
    const parsed = JSON.parse(text);
    const pairs = [];
    for (const c of COLLECTIONS) {
        for (const doc of parsed[c] || []) {
            if (doc && doc.id) {
                pairs.push([c, doc]);
            }
        }
    }
    if (!pairs.length) {
        throw new Error('No LifeDesk data found in this file.');
    }
    // Firestore batches take up to 500 writes
    for (let i = 0; i < pairs.length; i += 400) {
        await saveMany(pairs.slice(i, i + 400));
    }
    return pairs.length;
}

export async function clearDemo() {
    localStorage.removeItem(DEMO_KEY);
    COLLECTIONS.forEach((c) => (data[c] = []));
    await seedIfNew();
    listener('ready');
}

function readDemo() {
    try {
        const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}');
        const out = {};
        COLLECTIONS.forEach((c) => (out[c] = Array.isArray(saved[c]) ? saved[c] : []));
        return out;
    } catch (e) {
        return { accounts: [], categories: [], entries: [], people: [], budgets: [], settings: [] };
    }
}
function writeDemo() {
    localStorage.setItem(DEMO_KEY, JSON.stringify(data));
}
