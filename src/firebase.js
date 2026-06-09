import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// After creating your web app in Firebase Console:
// Project Settings → Your apps → Add web app → copy firebaseConfig here
const firebaseConfig = {
  apiKey:            'AIzaSyB6KEbMzfSlOo6UdXhHjHAnziDfJIU-EmM',
  authDomain:        'the-council-89570.firebaseapp.com',
  projectId:         'the-council-89570',
  storageBucket:     'the-council-89570.firebasestorage.app',
  messagingSenderId: '882011984204',
  appId:             '1:882011984204:web:e74ff2059ffb0ff1c7ffe9',
};

const app = initializeApp(firebaseConfig);

export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const functions = getFunctions(app);
