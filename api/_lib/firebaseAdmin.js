// SETUP REQUIRED: Generate a Firebase service account key from:
// Firebase Console → Project Settings → Service Accounts → Generate New Private Key
// Paste the full JSON as the FIREBASE_SERVICE_ACCOUNT env var in Vercel (Settings → Environment Variables).
// Keep this secret — it grants admin access to your entire Firestore database.

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

export const db = admin.firestore();
