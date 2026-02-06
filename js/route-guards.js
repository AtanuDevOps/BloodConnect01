import { firebaseConfig } from "../config/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export function enforceDonorDashboard() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "signup.html";
      return;
    }
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const role = userSnap.exists() ? userSnap.data().role : "user";
    if (role !== "donor") {
      window.location.href = "dashboard.html";
    }
  });
}

enforceDonorDashboard();
