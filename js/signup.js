// Requires firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js loaded before this file
// Requires config/firebase-config.js to define window.firebaseConfig

(function () {
  const app = firebase.initializeApp(window.firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);

  const btnUser = document.getElementById("btnUser");
  const btnDonor = document.getElementById("btnDonor");
  const bloodGroupWrap = document.getElementById("bloodGroupWrap");
  const bloodGroupInput = document.getElementById("bloodGroup");
  const form = document.getElementById("signupForm");
  const errorEl = document.getElementById("error");

  let selectedRole = "user";

  btnUser.addEventListener("click", function () {
    selectedRole = "user";
    btnUser.classList.add("active");
    btnDonor.classList.remove("active");
    bloodGroupWrap.classList.remove("show");
    bloodGroupInput.required = false;
  });

  btnDonor.addEventListener("click", function () {
    selectedRole = "donor";
    btnDonor.classList.add("active");
    btnUser.classList.remove("active");
    bloodGroupWrap.classList.add("show");
    bloodGroupInput.required = true;
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorEl.textContent = "";
    console.log("[Signup] Submit triggered");
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const bloodGroup = bloodGroupInput.value.trim();

    if (selectedRole === "donor" && !bloodGroup) {
      errorEl.textContent = "Blood group is required.";
      console.warn("[Signup] Missing blood group for donor role");
      return;
    }

    try {
      console.log("[Signup] Creating auth user…");
      const userCred = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCred.user;
      const uid = user.uid;
      if (name) {
        await user.updateProfile({ displayName: name });
      }

      const userData = {
        name: name,
        phone: phone,
        role: selectedRole,
        profileLocked: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (selectedRole === "donor") {
        userData.bloodGroup = bloodGroup;
      }

      console.log("[Signup] Writing Firestore users doc for uid:", uid, userData);
      await db.collection("users").doc(uid).set(userData);
      console.log("[Signup] Firestore write successful. Redirecting to dashboard…");
      window.location.href = "dashboard.html";
    } catch (err) {
      errorEl.textContent = err && err.message ? err.message : "Signup failed";
      console.error("[Signup] Error during signup:", err);
    }
  });

  async function upgradeToDonor(bloodGroup) {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    if (!bloodGroup) throw new Error("Blood group required");
    const uid = user.uid;

    const userDoc = await db.collection("users").doc(uid).get();
    const data = userDoc.exists ? userDoc.data() : {};
    const name = user.displayName || data.name || "";
    const phone = data.phone || "";

    const donorDoc = await db.collection("donors").doc(uid).get();
    if (!donorDoc.exists) {
      await db.collection("donors").doc(uid).set({
        name: name,
        phone: phone,
        bloodGroup: bloodGroup,
        isLocked: true,
        available: true,
        lastDonation: null
      });
    }

    await db.collection("users").doc(uid).update({ role: "donor" });
    return true;
  }

  window.upgradeToDonor = upgradeToDonor;
  window.currentUserProfile = null;
  function startAuthProfileListener() {
    console.log("[AuthState] Starting auth state listener");
    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        console.warn("[AuthState] No user logged in, redirecting to signin.html");
        window.location.href = "signin.html";
        return;
      }
      try {
        const uid = user.uid;
        console.log("[AuthState] User logged in:", uid);
        const snap = await db.collection("users").doc(uid).get();
        if (snap.exists) {
          window.currentUserProfile = snap.data();
          console.log("[AuthState] Loaded profile:", window.currentUserProfile);
        } else {
          window.currentUserProfile = null;
          console.warn("[AuthState] Profile document not found for uid:", uid);
        }
      } catch (err) {
        console.error("[AuthState] Failed to load profile:", err);
      }
    });
  }
  window.startAuthProfileListener = startAuthProfileListener;
  try {
    var path = (location.pathname || "").toLowerCase();
    if (!path.endsWith("signup.html")) {
      startAuthProfileListener();
    }
  } catch (_) {}
})(); 
