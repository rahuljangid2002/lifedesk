// Firebase settings for this app.
//
// Leave apiKey empty to run in DEMO MODE: no login, data stays in this browser only.
// To turn on real login and cloud storage, paste the values from
// Firebase console → Project settings → Your apps → Web app → "firebaseConfig".
// These values are public identifiers, not passwords: access is protected by the login
// and by the rules in firestore.rules.
export const firebaseConfig = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
};

// Sign-in methods shown on the login screen (enable the same ones in Firebase console → Authentication).
export const loginMethods = {
    google: true,
    emailLink: true,
    phoneOtp: false // needs the Firebase Blaze plan (SMS is charged); switch on later
};
