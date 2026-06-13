import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey:            'AIzaSyB6KEbMzfSlOo6UdXhHjHAnziDfJIU-EmM',
  authDomain:        'the-council-89570.firebaseapp.com',
  projectId:         'the-council-89570',
  storageBucket:     'the-council-89570.firebasestorage.app',
  messagingSenderId: '882011984204',
  appId:             '1:882011984204:web:e74ff2059ffb0ff1c7ffe9',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Offline-first: writes go to IndexedDB immediately, sync to server in the
// background and auto-retry on reconnect. Prevents silent data loss on any
// brief network interruption.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const functions = getFunctions(app);
