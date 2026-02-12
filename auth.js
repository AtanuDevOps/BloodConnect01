// Auth (Signup + Login) using Firebase compat SDK
// Assumes firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js and firebase-config.js are loaded
(function () {
  var app = (firebase.apps && firebase.apps.length) ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  var auth = firebase.auth(app);
  var db = firebase.firestore(app);

  var btnUser = document.getElementById("btnUser");
  var btnDonor = document.getElementById("btnDonor");
  var btnCreate = document.getElementById("btnCreate");
  var btnSignIn = document.getElementById("btnSignIn");
  var bloodGroupWrap = document.getElementById("bloodGroupWrap");
  var bloodGroupInput = document.getElementById("bloodGroup");
  var errorEl = document.getElementById("error");

  var selectedRole = "user";

  try {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (_) {}

  auth.onAuthStateChanged(async function (user) {
    if (!user) return;
    try {
      var uid = user.uid;
      var snap = await db.collection("users").doc(uid).get();
      var role = (snap.exists && snap.data().role) ? snap.data().role : "user";
      if (role === "donor") {
        window.location.href = "donor-dashboard.html";
      } else {
        window.location.href = "user-dashboard.html";
      }
    } catch (e) {
      console.error("[Auth] Failed to check existing session:", e);
    }
  });

  function setRole(role) {
    selectedRole = role;
    if (role === "donor") {
      btnDonor.classList.add("active");
      btnUser.classList.remove("active");
      bloodGroupWrap.classList.add("show");
      bloodGroupInput.required = true;
    } else {
      btnUser.classList.add("active");
      btnDonor.classList.remove("active");
      bloodGroupWrap.classList.remove("show");
      bloodGroupInput.required = false;
    }
  }

  btnUser && btnUser.addEventListener("click", function () { setRole("user"); });
  btnDonor && btnDonor.addEventListener("click", function () { setRole("donor"); });

  async function createAccount() {
    errorEl.textContent = "";
    var name = (document.getElementById("name").value || "").trim();
    var email = (document.getElementById("email").value || "").trim();
    var password = document.getElementById("password").value;
    var bloodGroup = (bloodGroupInput.value || "").trim();

    if (selectedRole === "donor" && !bloodGroup) {
      errorEl.textContent = "Blood group is required.";
      console.warn("[Auth] Missing blood group for donor role");
      return;
    }

    try {
      console.log("[Auth] Creating account…");
      var cred = await auth.createUserWithEmailAndPassword(email, password);
      var user = cred.user;
      var uid = user.uid;
      if (name) {
        await user.updateProfile({ displayName: name });
      }

      var data = {
        name: name,
        email: email,
        role: selectedRole,
        profileLocked: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      if (selectedRole === "donor") data.bloodGroup = bloodGroup;

      console.log("[Auth] Writing Firestore users doc for uid:", uid, data);
      await db.collection("users").doc(uid).set(data);
      console.log("[Auth] Account created and profile saved");

      if (selectedRole === "donor") {
        window.location.href = "donor-dashboard.html";
      } else {
        window.location.href = "user-dashboard.html";
      }
    } catch (err) {
      console.error("[Auth] Create account error:", err);
      errorEl.textContent = err && err.message ? err.message : "Signup failed";
    }
  }

  async function signIn() {
    errorEl.textContent = "";
    var email = (document.getElementById("email").value || "").trim();
    var password = document.getElementById("password").value;
    try {
      console.log("[Auth] Signing in…");
      var cred = await auth.signInWithEmailAndPassword(email, password);
      var uid = cred.user.uid;
      console.log("[Auth] Signed in, fetching user profile:", uid);
      var snap = await db.collection("users").doc(uid).get();
      if (!snap.exists) {
        console.warn("[Auth] No profile document found for uid:", uid);
        errorEl.textContent = "Profile not found. Please contact support.";
        return;
      }
      var profile = snap.data();
      console.log("[Auth] Loaded profile:", profile);

      if (profile.role === "donor") {
        window.location.href = "donor-dashboard.html";
      } else {
        window.location.href = "user-dashboard.html";
      }
    } catch (err) {
      console.error("[Auth] Sign in error:", err);
      errorEl.textContent = err && err.message ? err.message : "Sign-in failed";
    }
  }

  btnCreate && btnCreate.addEventListener("click", createAccount);
  btnSignIn && btnSignIn.addEventListener("click", signIn);
})(); 
