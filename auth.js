// Unified Auth (Login + Signup) using Firebase compat SDK
(function () {
  var app = (firebase.apps && firebase.apps.length) ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  var auth = firebase.auth(app);
  var db = firebase.firestore(app);

  // UI Elements
  var loginToggle = document.getElementById("loginToggle");
  var signupToggle = document.getElementById("signupToggle");
  var toggleSelector = document.getElementById("toggleSelector");
  var formTitle = document.getElementById("formTitle");
  var formSubtitle = document.getElementById("formSubtitle");
  var submitBtn = document.getElementById("submitBtn");
  var authForm = document.getElementById("authForm");
  var errorEl = document.getElementById("error");

  // Fields
  var nameField = document.getElementById("nameField");
  var signupSpecificFields = document.getElementById("signupSpecificFields");
  var identifierInput = document.getElementById("identifier");
  var identifierLabel = document.getElementById("identifierLabel");
  var passwordInput = document.getElementById("password");

  var isLogin = true;

  try {
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  } catch (_) {}

  // Auth Guard: Redirect already logged-in users
  // We use a flag to skip this during the active signup/login process
  var isProcessing = false;

  auth.onAuthStateChanged(async function (user) {
    if (!user || isProcessing) return;
    try {
      // Only redirect if we're not actively logging in/signing up
      console.log("[Auth] User already logged in, redirecting to feed...");
      window.location.href = "blood-requests.html";
    } catch (e) {
      console.error("[Auth] Navigation error:", e);
    }
  });

  // Toggle Logic
  function updateUI() {
    if (isLogin) {
      toggleSelector.style.left = "4px";
      loginToggle.classList.add("active");
      signupToggle.classList.remove("active");
      formTitle.textContent = "LOGIN";
      formSubtitle.textContent = "LOG IN WITH YOUR DETAILS";
      submitBtn.textContent = "LOGIN";
      nameField.style.display = "none";
      signupSpecificFields.style.display = "none";
    } else {
      toggleSelector.style.left = "50%";
      signupToggle.classList.add("active");
      loginToggle.classList.remove("active");
      formTitle.textContent = "SIGN UP";
      formSubtitle.textContent = "SIGN UP WITH YOUR DETAILS";
      submitBtn.textContent = "SIGN UP";
      nameField.style.display = "grid";
      signupSpecificFields.style.display = "block";
    }
    errorEl.textContent = "";
  }

  loginToggle.addEventListener("click", function() {
    isLogin = true;
    updateUI();
  });

  signupToggle.addEventListener("click", function() {
    isLogin = false;
    updateUI();
  });

  // Validation
  function validate() {
    errorEl.textContent = "";
    var password = passwordInput.value;
    if (password.length < 6) {
      errorEl.textContent = "Password must be at least 6 characters.";
      return false;
    }
    return true;
  }

  // Submission
  authForm.addEventListener("submit", async function(e) {
    e.preventDefault();
    if (!validate()) return;

    var identifier = identifierInput.value.trim();
    var password = passwordInput.value;
    var email = identifier;

    // Basic check: if no @, assume it's a phone and append dummy domain for Firebase auth
    // (Firebase requires email for email/pass provider)
    if (identifier.indexOf('@') === -1) {
      email = identifier + "@bloodconnect.local";
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Processing...";
    isProcessing = true; // Prevent onAuthStateChanged from redirecting early

    try {
      if (isLogin) {
        // LOGIN
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = "blood-requests.html";
      } else {
        // SIGN UP
        var name = document.getElementById("name").value.trim();
        var bloodGroup = document.getElementById("bloodGroup").value;
        var location = document.getElementById("location").value.trim();

        if (!bloodGroup) {
          throw new Error("Please select your blood group.");
        }

        // 1. Create the account (Wait for UID)
        var cred = await auth.createUserWithEmailAndPassword(email, password);
        var user = cred.user;
        
        // 2. Prepare tasks to run in parallel
        var tasks = [];
        
        if (name) {
          tasks.push(user.updateProfile({ displayName: name }));
        }

        var userData = {
          name: name,
          phone: identifier.indexOf('@') === -1 ? identifier : "",
          email: identifier.indexOf('@') !== -1 ? identifier : "",
          bloodGroup: bloodGroup,
          location: location,
          role: "donor",
          profileLocked: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        tasks.push(db.collection("users").doc(user.uid).set(userData));

        // 3. Execute tasks in parallel
        // We start the tasks but redirect immediately to improve perceived speed.
        // The next page has a retry mechanism to handle the profile loading.
        Promise.all(tasks).catch(err => console.error("[Auth] Background tasks error:", err));
        
        console.log("[Auth] Account created, tasks started in background. Redirecting...");
        window.location.href = "blood-requests.html";
      }
    } catch (err) {
      console.error("[Auth] Error:", err);
      isProcessing = false;
      errorEl.textContent = err.message || "Operation failed.";
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? "LOGIN" : "SIGN UP";
    }
  });

})();
