(function () {
  const app = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  const auth = firebase.auth(app);
  const db = firebase.firestore(app);

  let currentUser = null;
  let currentUserProfile = null;

  const feedContainer = document.getElementById("requestsFeed");
  const makeRequestBtn = document.getElementById("makeRequestBtn");
  const requestModal = document.getElementById("requestModal");
  const requestForm = document.getElementById("requestForm");
  const responseModal = document.getElementById("responseModal");
  const responseForm = document.getElementById("responseForm");
  const profileLink = document.getElementById("profileLink");
  const navProfile = document.getElementById("navProfile");
  const foundationBtn = document.getElementById("foundationBtn");

  // 1. Auth Guard
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    currentUser = user;
    try {
      const doc = await db.collection("users").doc(user.uid).get();
      if (doc.exists) {
        currentUserProfile = doc.data();
        setupUI();
        loadRequests();
        
        // Render Profile Icon (top-left)
        if(navProfile) {
          navProfile.style.backgroundColor = currentUserProfile.profileColor || "#CE1126";
          navProfile.textContent = (currentUserProfile.name || "U").charAt(0).toUpperCase();
        }
      }
    } catch (e) {
      console.error("Profile load error", e);
    }
  });

  // 2. UI Setup
  function setupUI() {
    if (profileLink) {
      profileLink.addEventListener("click", () => {
        if (!currentUserProfile) return;
        if (currentUserProfile.role === "donor") window.location.href = "donor-dashboard.html";
        else window.location.href = "user-dashboard.html";
      });
    }
    if (foundationBtn) {
      foundationBtn.addEventListener("click", () => {
        window.location.href = "foundation.html";
      });
    }

    // Modal Toggles
    makeRequestBtn.addEventListener("click", () => requestModal.style.display = "flex");
    document.getElementById("closeRequestModal").addEventListener("click", () => requestModal.style.display = "none");
    document.getElementById("closeResponseModal").addEventListener("click", () => responseModal.style.display = "none");

    // Close on outside click
    window.onclick = (e) => {
      if (e.target === requestModal) requestModal.style.display = "none";
      if (e.target === responseModal) responseModal.style.display = "none";
    };
  }

  // 3. Load Requests
  async function loadRequests() {
    try {
      feedContainer.innerHTML = '<div class="no-results">Loading...</div>';
      const snapshot = await db.collection("bloodRequests")
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();

      if (snapshot.empty) {
        feedContainer.innerHTML = '<div class="no-results">No blood requests yet. Be the first!</div>';
        return;
      }

      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderRequests(requests);
      
      // Check for responses to MY requests
      checkNotifications(requests);

    } catch (err) {
      console.error("Error loading requests:", err);
      feedContainer.innerHTML = '<div class="no-results">Failed to load requests.</div>';
    }
  }

  // 4. Render Requests
  function renderRequests(requests) {
    feedContainer.innerHTML = requests.map(req => {
      const isMyRequest = req.createdBy === currentUser.uid;
      const isDonor = currentUserProfile.role === "donor";
      const responses = req.responses || [];
      const responseCount = responses.length;
      
      let actionBtn = "";
      if (isDonor && !isMyRequest) {
        const alreadyResponded = responses.some(r => r.donorId === currentUser.uid);
        if (alreadyResponded) {
          actionBtn = `<button class="action-btn secondary" disabled style="opacity:0.7"><i class="fa-solid fa-check"></i> Responded</button>`;
        } else {
          actionBtn = `<button onclick="openResponseModal('${req.id}')" class="action-btn"><i class="fa-solid fa-hand-holding-heart"></i> Respond</button>`;
        }
      } else if (isMyRequest) {
         actionBtn = `<span class="my-req-badge">My Request</span>`;
      }

      // Format Date
      const date = req.createdAt ? new Date(req.createdAt.seconds * 1000).toLocaleDateString() : "Just now";

      // Responses Section (Visible to Creator or if user has responded?) 
      // User requirement: "For the user/donor who created the request... Show list of donor responses"
      let responsesHtml = "";
      if (isMyRequest && responseCount > 0) {
        responsesHtml = `
          <div class="responses-section">
            <div class="response-header"><i class="fa-solid fa-bell"></i> ${responseCount} Donor Response${responseCount > 1 ? 's' : ''}</div>
            ${responses.map(r => `
              <div class="response-item">
                <div class="response-avatar" style="background:${r.donorColor || '#CE1126'}">${r.donorName.charAt(0)}</div>
                <div>
                  <strong>${escapeHtml(r.donorName)}</strong> <span class="blood-tag-sm">${r.donorBloodGroup}</span>
                  <div class="response-msg">${escapeHtml(r.message)}</div>
                  <div class="response-time">${new Date(r.respondedAt.seconds * 1000).toLocaleDateString()}</div>
                </div>
              </div>
            `).join("")}
          </div>
        `;
      }

      return `
        <div class="request-card">
          <div class="req-header">
            <div>
              <h3 class="req-patient">${escapeHtml(req.patientName)} <span class="age-badge">${req.patientAge} yrs</span></h3>
              <div class="req-meta">
                <span><i class="fa-solid fa-hospital"></i> ${escapeHtml(req.hospitalName)}</span>
                <span>• ${date}</span>
              </div>
            </div>
            <div class="blood-badge-lg">${req.bloodGroup}</div>
          </div>
          
          <p class="req-desc">${escapeHtml(req.description)}</p>
          
          <div class="req-footer">
            <div class="req-status">
              ${responseCount > 0 ? `<span class="status-active">${responseCount} Responses</span>` : '<span class="status-waiting">Waiting for donors</span>'}
            </div>
            ${actionBtn}
          </div>
          ${responsesHtml}
        </div>
      `;
    }).join("");
  }

  // 5. Create Request
  requestForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = requestForm.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Posting...";

    try {
      const newReq = {
        createdBy: currentUser.uid,
        creatorRole: currentUserProfile.role,
        patientName: document.getElementById("reqPatientName").value.trim(),
        patientAge: parseInt(document.getElementById("reqPatientAge").value),
        bloodGroup: document.getElementById("reqBloodGroup").value,
        hospitalName: document.getElementById("reqHospital").value.trim(),
        description: document.getElementById("reqDescription").value.trim(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        responses: []
      };

      await db.collection("bloodRequests").add(newReq);
      
      requestModal.style.display = "none";
      requestForm.reset();
      loadRequests();
      alert("Request posted successfully!");

    } catch (err) {
      console.error("Error posting request:", err);
      alert("Failed to post request.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Post Request";
    }
  });

  // 6. Handle Response Modal
  window.openResponseModal = function(reqId) {
    document.getElementById("respRequestId").value = reqId;
    responseModal.style.display = "flex";
  };

  // 7. Submit Response
  responseForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = responseForm.querySelector("button[type=submit]");
    const reqId = document.getElementById("respRequestId").value;
    const message = document.getElementById("respMessage").value.trim();

    if (!reqId) return;

    btn.disabled = true;
    btn.textContent = "Sending...";

    try {
      const responseData = {
        donorId: currentUser.uid,
        donorName: currentUserProfile.name,
        donorBloodGroup: currentUserProfile.bloodGroup,
        donorColor: currentUserProfile.profileColor || "#CE1126",
        message: message,
        respondedAt: new Date() // Use client date for immediate UI, server date for consistent
      };
      
      // Use arrayUnion to add response
      await db.collection("bloodRequests").doc(reqId).update({
        responses: firebase.firestore.FieldValue.arrayUnion(responseData)
      });

      responseModal.style.display = "none";
      responseForm.reset();
      loadRequests();
      alert("Response sent! The requester has been notified.");

    } catch (err) {
      console.error("Error sending response:", err);
      alert("Failed to send response.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Send Response";
    }
  });

  // 8. Notifications
  function checkNotifications(requests) {
    // Logic: If I have requests with NEW responses...
    // For now, just a simple alert if my requests have responses is enough per requirement?
    // "Show notification-like popup: You have new donor responses"
    
    const myRequestsWithResponses = requests.filter(r => 
      r.createdBy === currentUser.uid && r.responses && r.responses.length > 0
    );

    if (myRequestsWithResponses.length > 0) {
      // We could add a visual indicator or toast.
      // For simplicity, let's just log or maybe show a small toast if we had a toast system.
      // The requirement says "popup".
      // I'll assume rendering the responses in the card (which I did) satisfies "Show list of donor responses"
      // But for the "You have new donor responses" popup, I can add a small banner at top.
      
      // Only show if not already dismissed? Storage? 
      // Let's just show a banner in the feed container top.
      const banner = document.createElement("div");
      banner.className = "notification-banner";
      banner.innerHTML = `<i class="fa-solid fa-bell"></i> You have responses on your blood requests! Check below.`;
      
      // Insert before feed
      const feed = document.getElementById("requestsFeed");
      if(feed) feed.parentNode.insertBefore(banner, feed);
    }
  }

  function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

})();
