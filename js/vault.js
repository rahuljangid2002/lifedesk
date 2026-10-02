// Encryption of a user's data on their own device, so the database only ever holds unreadable text.
//
// One random 256-bit data key encrypts every document (AES-GCM, a fresh random IV per document).
// The data key itself is stored in the database only in wrapped form, twice: once locked with a key made from the
// user's passphrase, once with a key made from their recovery code (PBKDF2-SHA256, random salts). Neither the
// passphrase nor the recovery code nor the bare data key is ever sent anywhere.
const ITERATIONS = 310000;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
/** Recovery codes are compared without spaces, dashes or letter case. */
const tidy = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function kek(secret, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function wrap(raw, secret, iterations) {
    const salt = random(16);
    const iv = random(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kek(secret, salt, iterations), raw);
    return { salt: b64(salt), iv: b64(iv), key: b64(ct) };
}
async function unwrap(box, secret, iterations) {
    try {
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, await kek(secret, unb64(box.salt), iterations), unb64(box.key)));
    } catch (e) {
        return null; // wrong passphrase or code
    }
}

/** A recovery code like K7QM-2XHD-9TRA-V4PN-6WJE (no letters or digits that look alike). */
function newRecoveryCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = random(20);
    const chars = [...bytes].map((b) => letters[b % letters.length]);
    return [0, 4, 8, 12, 16].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** First time: makes the data key and returns what to store in the database, the key, and the recovery code. */
export async function createVault(passphrase) {
    const raw = random(32);
    const recovery = newRecoveryCode();
    return { raw, recovery, doc: { v: 1, iterations: ITERATIONS, pass: await wrap(raw, passphrase, ITERATIONS), recovery: await wrap(raw, tidy(recovery), ITERATIONS) } };
}
/** The data key from the passphrase, or null when it is wrong. */
export function openVault(doc, passphrase) {
    return unwrap(doc.pass, passphrase, doc.iterations);
}
export function openWithRecovery(doc, code) {
    return unwrap(doc.recovery, tidy(code), doc.iterations);
}
/** The same data key locked with a new passphrase (the recovery code stays as it is). */
export async function changePassphrase(doc, raw, passphrase) {
    return { ...doc, pass: await wrap(raw, passphrase, doc.iterations) };
}

export function importKey(raw) {
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encryptDoc(key, fields) {
    const iv = random(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(fields)));
    return { enc: `${b64(iv)}.${b64(ct)}` };
}
/** The fields of a stored document; a document saved before encryption was switched on is returned as it is. */
export async function decryptDoc(key, stored) {
    if (typeof stored.enc !== 'string') {
        return { fields: stored, plain: true };
    }
    const [iv, ct] = stored.enc.split('.');
    return { fields: JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct)))), plain: false };
}
export const keyToText = b64;
export const keyFromText = unb64;
