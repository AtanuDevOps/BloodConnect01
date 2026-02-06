(function () {
  const app = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);

  const donorsGrid = document.getElementById("donorsGrid");
  const searchInput = document.getElementById("searchInput");
  const locationInput = document.getElementById("locationInput");
  const bloodFilter = document.getElementById("bloodFilter");
  const backBtn = document.getElementById("backBtn");

  let allDonors = [];
  let currentUser = null;
  let currentUserName = "Anonymous";

  // 1. Auth Guard
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
    } else {
      currentUser = user;
      // Fetch user name for requests
      try {
        const userDoc = await db.collection("users").doc(user.uid).get();
        if (userDoc.exists) {
          currentUserName = userDoc.data().name || user.displayName || "Anonymous";
        }
      } catch (e) {
        console.error("Error fetching user profile", e);
      }
      loadDonors();
    }
  });

  // 2. Navigation
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }

  // 3. Fetch Donors
  async function loadDonors() {
    try {
      donorsGrid.innerHTML = '<div class="no-results">Loading donors...</div>';
      
      const snapshot = await db.collection("users")
        .where("role", "==", "donor")
        .get();

      allDonors = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        // Check availability (treat undefined as true for now per requirements)
        const isActive = data.isActive !== false; 
        
        if (isActive) {
          allDonors.push({
            id: doc.id,
            name: data.name || "Anonymous Donor",
            bloodGroup: data.bloodGroup || "?",
            location: data.location || data.city || "Location not set",
            ...data
          });
        }
      });

      renderDonors();
    } catch (err) {
      console.error("Error loading donors:", err);
      donorsGrid.innerHTML = '<div class="no-results">Failed to load donors. Please try again.</div>';
    }
  }

  // 4. Render & Filter
  function renderDonors() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const locationTerm = locationInput ? locationInput.value.trim().toLowerCase() : "";
    const selectedGroup = bloodFilter.value;

    const filtered = allDonors.filter(donor => {
      const matchesName = donor.name.toLowerCase().includes(searchTerm);
      const matchesLocation = donor.location.toLowerCase().includes(locationTerm);
      const matchesGroup = selectedGroup === "All" || donor.bloodGroup === selectedGroup;
      return matchesName && matchesLocation && matchesGroup;
    });

    if (filtered.length === 0) {
      donorsGrid.innerHTML = '<div class="no-results">No donors found matching your criteria.</div>';
      return;
    }

    donorsGrid.innerHTML = filtered.map(donor => {
      let phoneHtml = "";
      const isLocked = donor.profileLocked === true;
      
      if (!isLocked) {
        phoneHtml = `
          <div class="donor-location">
            <i class="fa-solid fa-phone"></i>
            <span>${escapeHtml(donor.phone || "No phone")}</span>
          </div>
        `;
      } else {
        const requests = donor.accessRequests || [];
        const myRequest = requests.find(r => r.requesterId === currentUser.uid);
        
        if (myRequest && myRequest.status === 'approved') {
          phoneHtml = `
            <div class="donor-location">
              <i class="fa-solid fa-phone"></i>
              <span>${escapeHtml(donor.phone || "No phone")}</span>
            </div>
            <div style="font-size:10px; color:green; margin-top:4px;">
              <i class="fa-solid fa-check-circle"></i> Access Approved
            </div>
          `;
        } else if (myRequest && myRequest.status === 'pending') {
          phoneHtml = `
            <button class="action-btn secondary" disabled style="width:100%; margin-top:8px; font-size:12px; padding:6px; opacity:0.7;">
              <i class="fa-solid fa-clock"></i> Request Pending
            </button>
          `;
        } else {
          phoneHtml = `
            <button onclick="requestAccess('${donor.id}')" class="action-btn" style="width:100%; margin-top:8px; font-size:12px; padding:6px;">
              <i class="fa-solid fa-lock"></i> Request Contact
            </button>
          `;
        }
      }

      const profileColor = donor.profileColor || "#CE1126";
      const firstLetter = (donor.name || "?").charAt(0).toUpperCase();

      return `
      <div class="donor-card">
        <div class="avatar-circle" style="background-color: ${profileColor}; width: 56px; height: 56px; font-size: 22px;">
          ${firstLetter}
        </div>
        <div class="donor-info">
          <h3 style="display:flex; align-items:center; gap:8px;">
            ${escapeHtml(donor.name)}
            <span style="font-size:13px; background:#fff0f2; color:#CE1126; padding:2px 8px; border-radius:12px; border:1px solid #ffd4da;">${donor.bloodGroup}</span>
          </h3>
          <div class="donor-location">
            <i class="fa-solid fa-location-dot"></i>
            <span>${escapeHtml(donor.location)}</span>
          </div>
          ${phoneHtml}
        </div>
      </div>
    `}).join("");
  }

  // 5. Event Listeners
  searchInput.addEventListener("input", renderDonors);
  if (locationInput) locationInput.addEventListener("input", renderDonors);
  bloodFilter.addEventListener("change", renderDonors);

  // 6. Request Access Handler
  window.requestAccess = async function(donorId) {
    if (!currentUser) return;
    
    const btn = document.activeElement;
    if(btn) {
      btn.textContent = "Sending...";
      btn.disabled = true;
    }

    try {
      const requestData = {
        requesterId: currentUser.uid,
        requesterName: currentUserName,
        status: 'pending'
      };

      // Get current donor doc to check if array exists (for safety, though arrayUnion creates it)
      // Actually arrayUnion is best here
      await db.collection("users").doc(donorId).update({
        accessRequests: firebase.firestore.FieldValue.arrayUnion(requestData)
      });

      // Update local state to reflect change immediately without reload
      const donorIndex = allDonors.findIndex(d => d.id === donorId);
      if (donorIndex !== -1) {
        if (!allDonors[donorIndex].accessRequests) allDonors[donorIndex].accessRequests = [];
        allDonors[donorIndex].accessRequests.push(requestData);
        renderDonors(); // Re-render to show "Request Pending"
      }

      alert("Request sent successfully!");

    } catch (err) {
      console.error("Error sending request:", err);
      alert("Failed to send request.");
      if(btn) {
        btn.textContent = "Request Contact";
        btn.disabled = false;
      }
    }
  };

  // Helper
  function escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

})();
