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

// The Firestore database ID as shown in Firebase console → Firestore Database (this project's is "default";
// older projects use "(default)").
export const firestoreDatabase = 'default';

// Sign-in methods shown on the login screen (enable the same ones in Firebase console → Authentication).
export const loginMethods = {
    google: true,
    password: true, // email + password, with "Create account" and "Forgot password?"
    emailLink: false, // one-time sign-in link by email (the free plan sends only a few a day)
    phoneOtp: false // needs the Firebase Blaze plan (SMS is charged); switch on later
};
