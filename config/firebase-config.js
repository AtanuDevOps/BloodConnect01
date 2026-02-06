window.firebaseConfig = {
  apiKey: "AIzaSyBo1i8s5qhoscjaYMHynQ2OCO78W-3sb8c",
  authDomain: "bloodconnect2-6256a.firebaseapp.com",
  projectId: "bloodconnect2-6256a",
  storageBucket: "bloodconnect2-6256a.firebasestorage.app",
  messagingSenderId: "508542722954",
  appId: "1:508542722954:web:87db5774bb587269a41e73"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Auth & Firestore
const auth = firebase.auth();
const db = firebase.firestore();
