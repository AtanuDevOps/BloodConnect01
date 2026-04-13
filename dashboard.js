// Dashboard guard + profile loader using Firebase compat SDK
(function () {
  var app = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  var auth = firebase.auth(app);
  var db = firebase.firestore(app);

  window.currentUserProfile = null;

  function startDashboardGuard() {
    console.log("[Dashboard] Starting auth state listener");
    auth.onAuthStateChanged(async function (user) {
      if (!user) {
        console.warn("[Dashboard] No user logged in, redirecting to index.html");
        window.location.href = "index.html";
        return;
      }
      
      // OPTIMIZATION: Render basic UI immediately while fetching data
      console.log("[Dashboard] User logged in:", user.uid);
      
      // Initialize counters and donation UI with default loading states
      loadTotalDonors();
      loadActiveRequests();
      updateDonationStatusUI();

      try {
        var uid = user.uid;
        
        // Single Firestore query to load profile
        var snap = await db.collection("users").doc(uid).get();
        if (snap.exists) {
          window.currentUserProfile = snap.data();
          console.log("[Dashboard] Loaded profile:", window.currentUserProfile);
          
          // Dynamically update UI fields once data arrives
          var nameEl = document.getElementById("userName") || document.getElementById("userName_welcome");
          var roleEl = document.getElementById("userRole");
          if (nameEl) nameEl.textContent = window.currentUserProfile.name || user.displayName || "User";
          if (roleEl) roleEl.textContent = window.currentUserProfile.role || "donor";

          // Update extra donor info
          var displayBloodGroup = document.getElementById("displayBloodGroup");
          var displayLocation = document.getElementById("displayLocation");
          var displayPhone = document.getElementById("displayPhone");

          if (displayBloodGroup) displayBloodGroup.textContent = window.currentUserProfile.bloodGroup || "Not set";
          if (displayLocation) displayLocation.textContent = window.currentUserProfile.location || "Not set";
          if (displayPhone) displayPhone.textContent = window.currentUserProfile.phone || "Not set";
          
          // Stats & Toggles
          var lifeSavedEl = document.getElementById("lifeSavedCount");
          if (lifeSavedEl) lifeSavedEl.textContent = window.currentUserProfile.donationCount || 0;

          var availableToggle = document.getElementById("availableToggle");
          var lockProfileToggle = document.getElementById("lockProfileToggle");
          if (availableToggle) availableToggle.checked = window.currentUserProfile.available !== false;
          if (lockProfileToggle) lockProfileToggle.checked = !!window.currentUserProfile.profileLocked;

          // Render Avatar
          var avatarEl = document.getElementById("dashboardAvatar");
          var avatarTextEl = document.getElementById("dashboardAvatarText");
          if (avatarEl && avatarTextEl) {
            var pColor = window.currentUserProfile.profileColor || "#CE1126";
            var pName = window.currentUserProfile.name || "User";
            var pImg = window.currentUserProfile.profileImage;
            
            avatarEl.style.backgroundColor = pColor;
            
            if (pImg) {
              avatarEl.innerHTML = `<img src="${pImg}" class="profile-avatar-img">`;
            } else {
              avatarEl.innerHTML = `<span id="dashboardAvatarText">${pName.charAt(0).toUpperCase()}</span>`;
            }
          }

          // Render Profile Icon (top-left) in common navigation bars if present
          var navProfile = document.getElementById("navProfile");
          if(navProfile) {
            var pColor = window.currentUserProfile.profileColor || "#CE1126";
            var pName = window.currentUserProfile.name || "User";
            var pImg = window.currentUserProfile.profileImage;
            
            navProfile.style.backgroundColor = pColor;
            if (pImg) {
              navProfile.innerHTML = `<img src="${pImg}" class="profile-avatar-img">`;
            } else {
              navProfile.textContent = pName.charAt(0).toUpperCase();
            }
          }

          // Refresh donation status UI with actual profile data
          updateDonationStatusUI();
          
          // Load access requests if donor (Only on dashboards that need it)
          if (window.currentUserProfile.role === "donor" && typeof loadAccessRequests === "function") {
            loadAccessRequests();
          }
        } else {
          window.currentUserProfile = null;
          console.warn("[Dashboard] Profile document not found for uid:", uid);
        }
      } catch (err) {
        console.error("[Dashboard] Failed to load profile:", err);
      }
    });
  }

  window.startDashboardGuard = startDashboardGuard;
  startDashboardGuard();

  // Task 1: Fix "Total Donors" Count
  async function loadTotalDonors() {
    var countEl = document.getElementById("totalDonorsCount");
    if (!countEl) return;

    try {
      // Query Firestore collection: users where role === "donor"
      var snapshot = await db.collection("users").where("role", "==", "donor").get();
      countEl.textContent = snapshot.size;
    } catch (err) {
      console.error("[Dashboard] Failed to load total donors:", err);
      countEl.textContent = "0";
    }
  }

  // Task 1.5: Fix "Active Blood Requests" Count
  async function loadActiveRequests() {
    var countEl = document.getElementById("activeRequestsCount");
    if (!countEl) return;

    try {
      // "Treat ALL documents in bloodRequests as active"
      var snapshot = await db.collection("bloodRequests").get();
      countEl.textContent = snapshot.size;
    } catch (err) {
      console.error("[Dashboard] Failed to load active requests:", err);
      countEl.textContent = "0";
    }
  }

  // Task 2: Fix Logout Button
  var logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      console.log("[Dashboard] Logging out...");
      auth.signOut()
        .then(function () {
          console.log("[Dashboard] Logout successful");
          window.location.href = "index.html";
        })
        .catch(function (error) {
          console.error("[Dashboard] Logout failed:", error);
        });
    });
  }

  // Task 3: Edit Profile Logic (Donor Only)
  var editProfileBtn = document.getElementById("editProfileBtn");
  var editProfileModal = document.getElementById("editProfileModal");
  var cancelEditBtn = document.getElementById("cancelEditBtn");
  var editProfileForm = document.getElementById("editProfileForm");

  if (editProfileBtn && editProfileModal) {
    console.log("[Dashboard] Edit Profile elements found, attaching listeners");
    // Color preset selection
    var colorOptions = document.querySelectorAll(".color-option");
    var colorInput = document.getElementById("editProfileColor");
    
    colorOptions.forEach(function(opt) {
      opt.addEventListener("click", function() {
        colorOptions.forEach(function(o) { o.classList.remove("selected"); });
        opt.classList.add("selected");
        if (colorInput) colorInput.value = opt.dataset.color;
      });
    });

    // Open Modal
    editProfileBtn.addEventListener("click", function () {
      console.log("[Dashboard] Edit Profile button clicked");
      if (window.currentUserProfile) {
        document.getElementById("fullName").value = window.currentUserProfile.name || "";
        document.getElementById("bloodGroup").value = window.currentUserProfile.bloodGroup || "";
        document.getElementById("location").value = window.currentUserProfile.location || "";
        document.getElementById("phoneNumber").value = window.currentUserProfile.phone || "";
        
        var currentPColor = window.currentUserProfile.profileColor || window.currentUserProfile.avatarColor || "#CE1126";
        if (colorInput) colorInput.value = currentPColor;
        colorOptions.forEach(function(opt) {
          if(opt.dataset.color === currentPColor) opt.classList.add("selected");
          else opt.classList.remove("selected");
        });

        var lockToggle = document.getElementById("editProfileLocked");
        if (lockToggle) lockToggle.checked = !!window.currentUserProfile.profileLocked;
      }
      editProfileModal.style.display = "flex";
    });

    // Close Modal
    cancelEditBtn.addEventListener("click", function () {
      editProfileModal.style.display = "none";
    });

    // --- NEW SAVE PROFILE LOGIC ---
    function handleProfileUpdate(e) {
      e.preventDefault();
      console.log("Save button clicked");

      try {
        const user = firebase.auth().currentUser;
        if (!user) {
          alert("User not logged in");
          return;
        }

        const name = document.getElementById("fullName").value;
        const phone = document.getElementById("phoneNumber").value;
        const blood = document.getElementById("bloodGroup").value;
        const location = document.getElementById("location").value;
        const file = document.getElementById("profileImageInput").files[0];
        const avatarColor = document.getElementById("editProfileColor").value;

        console.log("Form data:", name, phone, blood, location);

        let photoURL = null;

        const saveBtn = document.getElementById("saveProfileBtn");
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = "Saving...";
        }

        // IMAGE UPLOAD (OPTIONAL) 
        if (file) {
          console.log("Uploading image...");

          const formData = new FormData();
          formData.append("file", file);
          formData.append("upload_preset", cloudinaryConfig.uploadPreset);

          fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
            method: "POST",
            body: formData
          })
          .then(res => res.json())
          .then(data => {
            photoURL = data.secure_url;
            console.log("Image uploaded:", photoURL);
            updateFirestore(user.uid, name, phone, blood, location, avatarColor, photoURL);
          })
          .catch(err => {
            console.error("Image upload failed", err);
            alert("Image upload failed");
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.textContent = "Save Changes";
            }
          });

        } else {
          updateFirestore(user.uid, name, phone, blood, location, avatarColor, null);
        }

      } catch (error) {
        console.error("Error:", error);
        alert("Something went wrong");
      }
    }

    function updateFirestore(uid, name, phone, blood, location, avatarColor, photoURL) {
      console.log("Updating Firestore...");
      const updateData = {
        name: name,
        phone: phone,
        bloodGroup: blood,
        location: location,
        avatarColor: avatarColor,
        profileColor: avatarColor // Backward compatibility
      };

      if (photoURL) {
        updateData.photoURL = photoURL;
        updateData.profileImage = photoURL; // Backward compatibility
      }

      firebase.firestore().collection("users").doc(uid)
        .update(updateData)
        .then(() => {
          console.log("Profile updated");
          alert("Profile updated successfully");

          // CLOSE MODAL 
          document.getElementById("editProfileModal").style.display = "none";

          // OPTIONAL: reload UI 
          location.reload();
        })
        .catch(err => {
          console.error("Firestore error:", err);
          alert("Failed to save data");
          const saveBtn = document.getElementById("saveProfileBtn");
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Changes";
          }
        });
    }

    // Attach click listener to the new button ID
    const saveBtn = document.getElementById("saveProfileBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", handleProfileUpdate);
    }
  }

  // Task 4: Access Requests Management (Donor Only)
  function loadAccessRequests() {
    var requestsList = document.getElementById("requestsList");
    var section = document.getElementById("accessRequestsSection");
    if (!requestsList || !section) return;

    var requests = window.currentUserProfile.accessRequests || [];
    var pending = requests.filter(function(r) { return r.status === "pending"; });

    if (pending.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";
    requestsList.innerHTML = pending.map(function(req) {
      return `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:12px; background: #fff;">
          <div>
            <strong>${escapeHtml(req.requesterName)}</strong>
            <div class="muted" style="font-size:12px">Requested access to contact info</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="handleRequest('${req.requesterId}', 'approved')" class="action-btn" style="padding:6px 12px; font-size:12px;">Approve</button>
            <button onclick="handleRequest('${req.requesterId}', 'ignored')" class="action-btn secondary" style="padding:6px 12px; font-size:12px;">Ignore</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // Handle Request Action (Global function for onclick)
  window.handleRequest = async function(requesterId, action) {
    var user = auth.currentUser;
    if (!user) return;

    try {
      var requests = window.currentUserProfile.accessRequests || [];
      // Create new array with updated status
      var updatedRequests = requests.map(function(req) {
        if (req.requesterId === requesterId) {
          return Object.assign({}, req, { status: action }); // Avoid spread for compat
        }
        return req;
      });

      // Filter out ignored requests from saving? Or keep them? 
      // User said "Update request status to approved". 
      // "Ignore" usually means hide or set to rejected. I'll set to "ignored".
      
      // But if we want to keep history, we save "ignored". 
      // If we want to clean up, we might filter. I'll save status.

      await db.collection("users").doc(user.uid).update({
        accessRequests: updatedRequests
      });

      // Update local
      window.currentUserProfile.accessRequests = updatedRequests;
      
      // Reload UI
      loadAccessRequests();
      alert("Request " + action);

    } catch (err) {
      console.error("Error updating request:", err);
      alert("Action failed");
    }
  };

  function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function tsMillis(ts) {
    if (!ts) return null;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    if (typeof ts === "number") return ts;
    return null;
  }

  function updateDonationStatusUI() {
    var labelEl = document.getElementById("nextDonationLabel");
    var dateEl = document.getElementById("nextDonationDate");
    var cardEl = document.getElementById("donationStatusCard");
    
    if (!labelEl || !dateEl) return;
    
    var lastMs = tsMillis(window.currentUserProfile && window.currentUserProfile.lastDonationDate);
    var endMs = tsMillis(window.currentUserProfile && window.currentUserProfile.donationCooldownEnd);
    var now = Date.now();
    
    var cooldownActive = !!(endMs && now <= endMs);
    
    if (cooldownActive) {
      var nextDate = new Date(endMs);
      var day = nextDate.getDate();
      var month = nextDate.toLocaleString('default', { month: 'short' });
      labelEl.textContent = "Next Donation";
      dateEl.textContent = day + " " + month;
      cardEl.classList.add("cooldown");
    } else {
      labelEl.textContent = "Update";
      dateEl.textContent = "Donation Status";
      cardEl.classList.remove("cooldown");
    }
  }

  // Handle Donation Update via Card Click
  var donationCard = document.getElementById("donationStatusCard");
  if (donationCard) {
    donationCard.addEventListener("click", async function () {
      var user = auth.currentUser;
      if (!user) return;
      
      var endMs = tsMillis(window.currentUserProfile && window.currentUserProfile.donationCooldownEnd);
      if (endMs && Date.now() <= endMs) {
        alert("You are on cooldown. You can donate again after the specified date.");
        return;
      }

      if (!confirm("Did you donate blood today? This will start your 3-month cooldown.")) return;

      try {
        var nowMs = Date.now();
        var endTs = firebase.firestore.Timestamp.fromMillis(nowMs + 90 * 86400000);
        var newCount = (window.currentUserProfile.donationCount || 0) + 1;
        
        await db.collection("users").doc(user.uid).update({
          lastDonationDate: firebase.firestore.FieldValue.serverTimestamp(),
          donationCooldownEnd: endTs,
          donationCount: newCount
        });
        
        // Refresh local data
        window.currentUserProfile.lastDonationDate = firebase.firestore.Timestamp.now();
        window.currentUserProfile.donationCooldownEnd = endTs;
        window.currentUserProfile.donationCount = newCount;
        
        var lifeSavedEl = document.getElementById("lifeSavedCount");
        if (lifeSavedEl) lifeSavedEl.textContent = newCount;
        
        updateDonationStatusUI();
        alert("Donation recorded! Thank you for saving a life.");
      } catch (e) {
        console.error(e);
        alert("Failed to record donation.");
      }
    });
  }

  // Handle Switches
  var availableToggle = document.getElementById("availableToggle");
  if (availableToggle) {
    availableToggle.addEventListener("change", async function() {
      var user = auth.currentUser;
      if(!user) return;
      try {
        await db.collection("users").doc(user.uid).update({ available: this.checked });
        window.currentUserProfile.available = this.checked;
      } catch(e) { console.error(e); }
    });
  }

  var lockProfileToggle = document.getElementById("lockProfileToggle");
  if (lockProfileToggle) {
    lockProfileToggle.addEventListener("change", async function() {
      var user = auth.currentUser;
      if(!user) return;
      try {
        await db.collection("users").doc(user.uid).update({ profileLocked: this.checked });
        window.currentUserProfile.profileLocked = this.checked;
      } catch(e) { console.error(e); }
    });
  }

  // Handle Contact Details Toggle
  var contactDetailsBtn = document.getElementById("contactDetailsBtn");
  var contactDetailsSection = document.getElementById("contactDetailsSection");
  if (contactDetailsBtn && contactDetailsSection) {
    contactDetailsBtn.addEventListener("click", function() {
      var isHidden = contactDetailsSection.style.display === "none";
      contactDetailsSection.style.display = isHidden ? "block" : "none";
      this.querySelector("i").className = isHidden ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-right";
    });
  }

})(); 
