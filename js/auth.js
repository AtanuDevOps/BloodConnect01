import { firebaseConfig } from "../config/firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const btnUser = document.getElementById("btnUser");
const btnDonor = document.getElementById("btnDonor");
const bloodGroupWrap = document.getElementById("bloodGroupWrap");
const bloodGroupInput = document.getElementById("bloodGroup");
const form = document.getElementById("signupForm");
const errorEl = document.getElementById("error");

let selectedRole = "user";

btnUser.addEventListener("click", () => {
  selectedRole = "user";
  btnUser.classList.add("active");
  btnDonor.classList.remove("active");
  bloodGroupWrap.classList.add("hidden");
  bloodGroupInput.required = false;
});

btnDonor.addEventListener("click", () => {
  selectedRole = "donor";
  btnDonor.classList.add("active");
  btnUser.classList.remove("active");
  bloodGroupWrap.classList.remove("hidden");
  bloodGroupInput.required = true;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const bloodGroup = bloodGroupInput.value.trim();

  if (selectedRole === "donor" && !bloodGroup) {
    errorEl.textContent = "Blood group is required.";
    return;
  }

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    if (name) {
      await updateProfile(userCred.user, { displayName: name });
    }

    const userDocRef = doc(db, "users", uid);
    const baseUserData = { name, phone, email, role: selectedRole };
    await setDoc(userDocRef, baseUserData);

    if (selectedRole === "donor") {
      const donorDocRef = doc(db, "donors", uid);
      await setDoc(donorDocRef, {
        name,
        phone,
        bloodGroup,
        isLocked: true,
        available: true,
        lastDonation: null
      });
      window.location.href = "donor-dashboard.html";
    } else {
      window.location.href = "dashboard.html";
    }
  } catch (err) {
    errorEl.textContent = err.message || "Signup failed";
  }
});

export async function upgradeToDonor(bloodGroup) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  if (!bloodGroup) throw new Error("Blood group required");
  const uid = user.uid;

  const usersRef = doc(db, "users", uid);
  const userSnap = await getDoc(usersRef);
  const name = user.displayName || (userSnap.exists() ? userSnap.data().name : "");
  const phone = userSnap.exists() ? userSnap.data().phone : "";

  const donorRef = doc(db, "donors", uid);
  const donorSnap = await getDoc(donorRef);
  if (!donorSnap.exists()) {
    await setDoc(donorRef, {
      name,
      phone,
      bloodGroup,
      isLocked: true,
      available: true,
      lastDonation: null
    });
  }

  await updateDoc(usersRef, { role: "donor" });
}

window.upgradeToDonor = upgradeToDonor;
