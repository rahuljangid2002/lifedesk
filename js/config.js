// Firebase settings for this app.
//
// Leave apiKey empty to run in DEMO MODE: no login, data stays in this browser only.
// (Adding ?demo=1 to the address also opens demo mode, e.g. for the automated test.)
// To turn on real login and cloud storage, paste the values from
// Firebase console → Project settings → Your apps → Web app → "firebaseConfig".
// These values are public identifiers, not passwords: access is protected by the login
// and by the rules in firestore.rules.
export const firebaseConfig = {
    apiKey: 'AIzaSyCV6JwF2Unc3QljVGBa1Mff8SCiVSzIUIc',
    authDomain: 'lifedesk-43dc1.firebaseapp.com',
    projectId: 'lifedesk-43dc1',
    storageBucket: 'lifedesk-43dc1.firebasestorage.app',
    messagingSenderId: '317761864681',
    appId: '1:317761864681:web:6f5755d992be6d9cea8178'
};

// Sign-in methods shown on the login screen (enable the same ones in Firebase console → Authentication).
export const loginMethods = {
    google: true,
    emailLink: true,
    phoneOtp: false // needs the Firebase Blaze plan (SMS is charged); switch on later
};
