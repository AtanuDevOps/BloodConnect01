(function () {
  const app = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);

  const donorsGrid = document.getElementById("donorsGrid");
  const searchInput = document.getElementById("searchInput");
  const locationInput = document.getElementById("locationInput");
  const bloodFilter = document.getElementById("bloodFilter");
  const searchBtn = document.getElementById("searchBtn");
  const backBtn = document.getElementById("backBtn");

  // Contact Modal Elements
  const contactModal = document.getElementById("contactModal");
  const modalClose = document.querySelector(".modal-close");
  const modalAvatar = document.getElementById("modalAvatar");
  const modalName = document.getElementById("modalName");
  const modalPhone = document.getElementById("modalPhone");
  const modalBlood = document.getElementById("modalBlood");
  const modalAge = document.getElementById("modalAge");
  const modalLocation = document.getElementById("modalLocation");
  const callBtn = document.getElementById("callBtn");

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
      // Donors grid already has skeletons from HTML
      const snapshot = await db.collection("users")
        .where("role", "==", "donor")
        .where("available", "==", true) // Filter for available donors
        .get();

      allDonors = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        allDonors.push({
          id: doc.id,
          name: data.name || "Anonymous Donor",
          bloodGroup: data.bloodGroup || "?",
          location: data.location || data.city || "Location not set",
          age: data.age || "N/A",
          ...data
        });
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
      const lastMs = tsMillis(donor.lastDonationDate);
      const endMs = tsMillis(donor.donationCooldownEnd);
      const now = Date.now();
      const cooldownActive = !!(endMs && now <= endMs);
      
      let statusHtml = "";
      if (cooldownActive) {
        const lastDate = new Date(lastMs);
        const dateStr = lastDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
        statusHtml = `<div class="donor-status status-cooldown">Last Donation: ${dateStr}</div>`;
      } else {
        statusHtml = `<div class="donor-status status-active">Active Donor</div>`;
      }

      const profileColor = donor.profileColor || "#CE1126";
      const firstLetter = (donor.name || "?").charAt(0).toUpperCase();

      return `
      <div class="donor-card">
        <div class="card-top-left">${donor.bloodGroup}</div>
        <div class="card-top-right"><i class="fa-solid fa-ellipsis-vertical"></i></div>
        
        <div class="avatar-circle" style="background-color: ${profileColor}; width: 64px; height: 64px; font-size: 24px; margin-top: 10px;">
          ${firstLetter}
        </div>
        
        <div class="donor-info">
          <h3>${escapeHtml(donor.name)}</h3>
          ${statusHtml}
          <div class="donor-location">
            <i class="fa-solid fa-location-dot"></i>
            <span>${escapeHtml(donor.location)}</span>
          </div>
        </div>
        
        <button onclick="openContactModal('${donor.id}')" class="view-contact-btn">View Contact</button>
      </div>
    `}).join("");
  }

  // 5. Contact Modal Logic
  window.openContactModal = function(donorId) {
    const donor = allDonors.find(d => d.id === donorId);
    if (!donor) return;

    modalName.textContent = donor.name;
    modalBlood.textContent = donor.bloodGroup;
    modalAge.textContent = donor.age;
    modalLocation.textContent = donor.location;
    modalAvatar.textContent = (donor.name || "?").charAt(0).toUpperCase();
    modalAvatar.style.backgroundColor = donor.profileColor || "#CE1126";
    
    // Logic for contact access
    const isLocked = donor.profileLocked === true;
    const requests = donor.accessRequests || [];
    const myRequest = currentUser ? requests.find(r => r.requesterId === currentUser.uid) : null;
    
    if (!isLocked || (myRequest && myRequest.status === 'approved')) {
      modalPhone.textContent = donor.phone || "No phone";
      callBtn.style.display = "flex";
      callBtn.onclick = () => window.location.href = `tel:${donor.phone}`;
    } else if (myRequest && myRequest.status === 'pending') {
      modalPhone.textContent = "Request Pending";
      callBtn.style.display = "none";
    } else {
      modalPhone.textContent = "Contact Hidden";
      callBtn.style.display = "flex";
      callBtn.querySelector('span').textContent = "REQUEST CONTACT";
      callBtn.onclick = () => requestAccess(donor.id);
    }

    contactModal.style.display = "flex";
  };

  if (modalClose) {
    modalClose.onclick = () => contactModal.style.display = "none";
  }
  window.onclick = (event) => {
    if (event.target == contactModal) contactModal.style.display = "none";
  };

  // 6. Event Listeners
  if (searchBtn) searchBtn.addEventListener("click", renderDonors);
  searchInput.addEventListener("input", renderDonors);
  locationInput.addEventListener("input", renderDonors);
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
  function tsMillis(ts) {
    if (!ts) return null;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.seconds === "number") return ts.seconds * 1000;
    if (typeof ts === "number") return ts;
    return null;
  }

})();
