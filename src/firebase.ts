import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

// Web client config is public by design; access is enforced by firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyBLndk15i4A0Ve0iPVXnxCETVYf4Xl7iLg',
  authDomain: 'team-chat-walaa.firebaseapp.com',
  projectId: 'team-chat-walaa',
  storageBucket: 'team-chat-walaa.firebasestorage.app',
  messagingSenderId: '253128482281',
  appId: '1:253128482281:web:1fd070586be9fe527b7f78',
};

// Initialized lazily: client components are also prerendered on the server,
// where IndexedDB (needed by the persistent cache) does not exist.
let db: Firestore | undefined;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getDb(): Firestore {
  if (db) return db;
  const app = getFirebaseApp();
  // Persistent IndexedDB cache shared across tabs: history already on this device
  // is served from cache instead of being re-read (and re-billed) from the server.
  db =
    typeof window === 'undefined'
      ? getFirestore(app)
      : initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
  return db;
}
