/* ============================================================================
   FIREBASE SETUP — Rate My Professor + Q&A Board backend
   ============================================================================
   Without this filled in, those two features still work, but ratings/questions
   are saved only in each visitor's own browser (not shared with other
   students). Filling this in makes them shared across everyone, in real time.

   HOW TO SET IT UP (free, ~5 minutes, no credit card needed):
   1. Go to https://console.firebase.google.com and sign in with any Google account.
   2. Click "Add project" → name it anything (e.g. "beu-hub") → finish creation.
   3. In the left sidebar: Build → Firestore Database → "Create database" →
      pick a location close to India → start in **test mode** for now (you can
      lock down access rules later — see note at the bottom of this file).
   4. In the left sidebar: Project settings (gear icon) → scroll to "Your apps" →
      click the "</>" (Web) icon → register the app (any nickname) → it will
      show you a `firebaseConfig` object. Copy those values into the object
      below, replacing the placeholder strings.
   5. Re-deploy the site. That's it — no server, no hosting bill, nothing else
      to run. Open the site on two different devices/browsers and confirm a
      professor/rating/question you add on one shows up on the other.

   SECURITY NOTE: "test mode" Firestore rules allow anyone to read/write for
   30 days, which is fine for getting this running quickly, but before real
   traffic, tighten the rules (Firestore → Rules) to at least something like:

     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /{collection}/{doc} {
           allow read: if true;
           allow create: if request.resource.data.keys().hasAll(['date']);
           allow update, delete: if false; // no edits/deletes from the client
         }
       }
     }

   This still lets anyone submit ratings/answers (there's no login system on
   this site), but stops them from editing or deleting other people's entries.
   If you want real moderation (deleting spam, banning users), that needs
   Firebase Auth + an admin panel, which is a bigger follow-up project.
   ============================================================================ */

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

let firestoreDB = null;
let firebaseReady = false;

(function initFirebaseBackend(){
  const isConfigured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY";
  if(!isConfigured){
    console.info('[BEU Hub] Firebase not configured yet — Rate My Professor and Q&A Board will run in local-only mode. See firebase-config.js to enable a shared backend.');
    return;
  }
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    firestoreDB = firebase.firestore();
    firebaseReady = true;
    console.info('[BEU Hub] Firebase backend connected — ratings/questions are now shared across all students.');
  }catch(err){
    console.error('[BEU Hub] Firebase failed to initialize, falling back to local-only mode:', err);
    firebaseReady = false;
  }
})();
