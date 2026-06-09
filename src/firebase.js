import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// After creating your web app in Firebase Console:
// Project Settings → Your apps → Add web app → copy firebaseConfig here
const firebaseConfig = {
  apiKey:            'PASTE_YOUR_WEB_API_KEY',
  authDomain:        'the-council-89570.firebaseapp.com',
  projectId:         'the-council-89570',
  storageBucket:     'the-council-89570.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId:             'PASTE_APP_ID',
};

const app = initializeApp(firebaseConfig);

export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const functions = getFunctions(app);
