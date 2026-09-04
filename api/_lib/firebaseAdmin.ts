import { cert, getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Same non-default Firestore database the client SDK targets
// (src/services/firebase.ts / firebase-applet-config.json).
const FIRESTORE_DATABASE_ID = 'ai-studio-shiftledger-e3037eb6-83a9-4627-b92c-f13d28a0f47a';

let app: App | null = null;

// Lazy on purpose: server.ts imports this module unconditionally at boot
// (it also serves everything else, Copilot/invite or not), and reading a
// missing FIREBASE_SERVICE_ACCOUNT_KEY at *import* time would crash the
// whole app locally for anyone who hasn't set that secret yet, not just
// these two endpoints. Only throw once something actually tries to use it.
function getAdminApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY is not set. Generate one in the Firebase console ' +
      '(Project Settings -> Service Accounts -> Generate new private key) and set the ' +
      'full JSON as this environment variable (locally in .env, and in Vercel\'s project settings).'
    );
  }
  app = initializeApp({ credential: cert(JSON.parse(raw)) });
  return app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp(), FIRESTORE_DATABASE_ID);
}
