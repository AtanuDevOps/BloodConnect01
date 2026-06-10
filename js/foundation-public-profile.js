(function(){
  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m && decodeURIComponent(m[1].replace(/\+/g, ' '));
  }
  
  function escapeHtml(text){ if(!text) return ""; return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  
  function tsToDate(ts) {
    if (!ts) return null;
    if (typeof ts.toMillis === "function") return new Date(ts.toMillis());
    if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000);
    return null;
  }

  var app = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  var auth = firebase.auth(app);
  var db = firebase.firestore(app);
  var fid = getParam('foundationId');

  var currentUser = null;
  var currentPostData = null;
  var currentPostId = null;
  var commentsUnsubscribe = null;
  var foundationData = null;
  var membershipStatus = 'not-member'; // 'not-member', 'pending', 'member'

  auth.onAuthStateChanged(async function(user){
    if(!user){ window.location.href = "index.html"; return; }
    currentUser = user;
    if(!fid){ alert("Invalid Foundation ID"); return; }

    try {
      const doc = await db.collection("foundation_requests").doc(fid).get();
      if(!doc.exists){
        document.getElementById('foundationName').textContent = "Not Found";
        return;
      }
      foundationData = doc.data();

      renderFoundationUI(foundationData);
      loadCampaigns();
      loadStats();
      checkMembershipStatus();
      
      // Listen for unread notifications
      db.collection("notifications")
        .where("recipientId", "==", user.uid)
        .where("isRead", "==", false)
        .onSnapshot(function(snap){
          var badge = document.getElementById("unreadCount");
          if(badge){
            if(snap.size > 0){
              badge.textContent = snap.size > 9 ? "9+" : snap.size;
              badge.style.display = "flex";
            } else {
              badge.style.display = "none";
            }
          }
        });
    } catch(e){
      console.error("Load error", e);
    }
  });

  function renderFoundationUI(data) {
    document.getElementById('foundationName').textContent = data.name || "Foundation";
    document.getElementById('foundationLocation').textContent = data.location || "Location not set";
    document.getElementById('foundationDescription').textContent = data.description || "No description available.";
    
    if(data.coverImage) document.getElementById('coverImg').src = data.coverImage;
    if(data.profileImage) document.getElementById('profileImg').src = data.profileImage;
  }

  async function checkMembershipStatus() {
    const joinBtn = document.getElementById('joinBtn');
    try {
      // Case 1: Check if user is owner
      if (foundationData && foundationData.ownerId === currentUser.uid) {
        membershipStatus = 'owner';
        joinBtn.textContent = 'Manage Foundation';
        joinBtn.classList.remove('disabled');
        joinBtn.disabled = false;
        joinBtn.onclick = function() {
          window.location.href = 'foundation-dashboard.html?foundationId=' + encodeURIComponent(fid);
        };
        return;
      }

      // Case 2: Check if user is admin
      if (foundationData && foundationData.admins && foundationData.admins.includes(currentUser.uid)) {
        membershipStatus = 'admin';
        joinBtn.textContent = 'Admin';
        joinBtn.classList.add('disabled');
        joinBtn.disabled = true;
        joinBtn.onclick = null;
        return;
      }

      // Case 3: Check if already a member
      const memberDoc = await db.collection('foundation_members')
        .where('foundationId', '==', fid)
        .where('memberId', '==', currentUser.uid)
        .get();
      
      if (!memberDoc.empty) {
        membershipStatus = 'member';
        joinBtn.textContent = 'Joined';
        joinBtn.classList.add('disabled');
        joinBtn.disabled = true;
        joinBtn.onclick = null;
        return;
      }

      // Case 4: Check if request is pending
      const requestDoc = await db.collection('foundation_join_requests')
        .where('foundationId', '==', fid)
        .where('userId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .get();
      
      if (!requestDoc.empty) {
        membershipStatus = 'pending';
        joinBtn.textContent = 'Request Sent';
        joinBtn.classList.add('disabled');
        joinBtn.disabled = true;
        joinBtn.onclick = null;
        return;
      }

      // Case 5: Otherwise, show Join button
      membershipStatus = 'not-member';
      joinBtn.textContent = 'Join Foundation';
      joinBtn.classList.remove('disabled');
      joinBtn.disabled = false;
      joinBtn.onclick = handleJoinClick;
      
    } catch (e) {
      console.error('Error checking membership status:', e);
    }
  }

  // Join button handler function
  async function handleJoinClick() {
    if (membershipStatus !== 'not-member') return;
    
    try {
      // Get current user data
      const userDoc = await db.collection('users').doc(currentUser.uid).get();
      const userName = userDoc.exists ? (userDoc.data().name || currentUser.displayName || 'Anonymous') : 'Anonymous';
      
      // Create join request
      await db.collection('foundation_join_requests').add({
        foundationId: fid,
        userId: currentUser.uid,
        userName: userName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'pending'
      });
      
      // Notify foundation owner and admins
      if (foundationData) {
        var recipientIds = new Set();
        if (foundationData.ownerId && foundationData.ownerId !== currentUser.uid) {
          recipientIds.add(foundationData.ownerId);
        }
        if (foundationData.admins) {
          foundationData.admins.forEach(function(adminId) {
            if (adminId && adminId !== currentUser.uid) {
              recipientIds.add(adminId);
            }
          });
        }
        
        recipientIds.forEach(function(recipientId) {
          db.collection("notifications").add({
            notificationType: "foundation_join_request",
            foundationId: fid,
            foundationName: foundationData.name,
            userId: currentUser.uid,
            userName: userName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isRead: false,
            recipientId: recipientId
          });
        });
      }
      
      // Update UI
      membershipStatus = 'pending';
      const joinBtn = document.getElementById('joinBtn');
      joinBtn.textContent = 'Request Sent';
      joinBtn.classList.add('disabled');
      joinBtn.disabled = true;
      
      alert('Join request sent!');
      
    } catch (e) {
      console.error('Error sending join request:', e);
      alert('Failed to send join request.');
    }
  }

  // DOMContentLoaded listener
  document.addEventListener('DOMContentLoaded', function() {
    // Back button
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        window.history.back();
      });
    }
  });

  async function loadStats() {
    try {
      // 1. Members count (unique user IDs)
      const membersSnap = await db.collection("foundation_members").where("foundationId","==",fid).get();
      const uniqueMemberIds = new Set();
      membersSnap.docs.forEach(doc => {
        if (doc.data().memberId) {
          uniqueMemberIds.add(doc.data().memberId);
        }
      });
      document.getElementById('membersCount').textContent = uniqueMemberIds.size;

      if(uniqueMemberIds.size === 0) return;

      // 2. Available donors & Life Saved
      const queryLimit = 10;
      const memberIdArray = Array.from(uniqueMemberIds);
      const chunks = [];
      for (let i = 0; i < memberIdArray.length; i += queryLimit) {
          chunks.push(memberIdArray.slice(i, i + queryLimit));
      }

      let availableCount = 0;
      let livesSavedSum = 0;

      for (const chunk of chunks) {
        const donorsSnap = await db.collection("users")
          .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        
        donorsSnap.forEach(doc => {
          const d = doc.data();
          if(d.available === true) availableCount++;
          livesSavedSum += (d.donationCount || 0);
        });
      }

      document.getElementById('availableDonorsCount').textContent = availableCount;
      document.getElementById('totalLivesSaved').textContent = livesSavedSum;

    } catch(e) {
      console.error("Stats error", e);
    }
  }

  // --- CAMPAIGN FEED ---
  function loadCampaigns() {
    db.collection("foundation_campaign_posts")
      .where("foundationId","==",fid)
      .orderBy("createdAt","desc")
      .onSnapshot(snap => {
        const feed = document.getElementById('campaignsFeed');
        if(snap.empty) {
          feed.innerHTML = '<div class="no-results">No campaigns yet.</div>';
          return;
        }
        feed.innerHTML = snap.docs.map(doc => renderCampaignCard(doc.id, doc.data())).join("");
      });
  }

  function renderCampaignCard(id, post) {
    const date = post.createdAt ? new Date(post.createdAt.seconds * 1000).toLocaleDateString() : "Just now";
    const likes = post.likes || [];
    const hasLiked = currentUser && likes.includes(currentUser.uid);
    
    return `
      <div class="campaign-card">
        <div class="campaign-header">
          <img src="${foundationData.profileImage || 'https://via.placeholder.com/150?text=F'}" class="campaign-avatar" style="width:40px; height:40px; object-fit:cover;">
          <div class="campaign-author-info">
            <div class="campaign-author-name">${post.foundationName || "Foundation"}</div>
            <div class="campaign-meta"><span>${date}</span></div>
          </div>
        </div>
        <div class="campaign-content">${escapeHtml(post.caption || "")}</div>
        ${post.imageURL ? `<img src="${post.imageURL}" class="campaign-image">` : ""}
        <div class="campaign-actions">
          <button class="campaign-action-btn" onclick="toggleLike('${id}', ${hasLiked})">
            <i class="${hasLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${likes.length}
          </button>
          <button class="campaign-action-btn" onclick="openCommentModal('${id}')"><i class="fa-regular fa-comment"></i> ${post.commentCount || 0}</button>
        </div>
      </div>
    `;
  }
  
  window.openCommentModal = async function(postId) {
    currentPostId = postId;
    try {
      var postDoc = await db.collection("foundation_campaign_posts").doc(postId).get();
      if(!postDoc.exists) return;
      currentPostData = postDoc.data();
      var modal = document.getElementById("commentModal");
      var previewName = document.getElementById("commentModalPreviewName");
      var previewCaption = document.getElementById("commentModalPreviewCaption");
      var previewImage = document.getElementById("commentModalPreviewImage");
      previewName.textContent = currentPostData.foundationName || "Foundation";
      previewCaption.textContent = currentPostData.caption || "";
      if(currentPostData.imageURL) {
        previewImage.src = currentPostData.imageURL;
        previewImage.classList.remove("hidden");
      } else {
        previewImage.classList.add("hidden");
      }
      modal.classList.add("active");
      loadCommentsForModal(postId);
    } catch(e) {
      console.error(e);
    }
  };
  
  window.closeCommentModal = function() {
    var modal = document.getElementById("commentModal");
    modal.classList.remove("active");
    if(commentsUnsubscribe) {
      commentsUnsubscribe();
      commentsUnsubscribe = null;
    }
    document.getElementById("commentModalInput").value = "";
  };
  
  function loadCommentsForModal(postId) {
    var listEl = document.getElementById("commentsList");
    if(commentsUnsubscribe) {
      commentsUnsubscribe();
    }
    commentsUnsubscribe = db.collection("foundation_post_comments")
      .where("postId","==",postId)
      .orderBy("createdAt","desc")
      .onSnapshot(function(snap){
        if(snap.empty){ 
          listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: #888;">No comments yet. Be the first!</div>'; 
          return; 
        }
        listEl.innerHTML = snap.docs.map(function(d){
          var c = d.data();
          var dt = tsToDate(c.createdAt);
          var dateStr = dt ? dt.toLocaleString() : "Just now";
          var initials = (c.userName || "U").charAt(0).toUpperCase();
          return '<div class="comment-item">'
            + '<div class="comment-avatar">'+ escapeHtml(initials) +'</div>'
            + '<div class="comment-content">'
            + '<div class="comment-author">'+ escapeHtml(c.userName||"User") +'</div>'
            + '<div class="comment-text">'+ escapeHtml(c.commentText||"") +'</div>'
            + '<div class="comment-time">'+ dateStr +'</div>'
            + '</div>'
            + '</div>';
        }).join("");
      });
  }
  
  window.submitComment = async function(){
    if(!currentUser || !currentPostId) return;
    try{
      var input = document.getElementById("commentModalInput");
      var text = (input.value||"").trim();
      if(!text) return;
      var name = currentUser.displayName || "";
      var pRef = db.collection("foundation_campaign_posts").doc(currentPostId);
      await db.collection("foundation_post_comments").add({
        postId: currentPostId,
        userId: currentUser.uid,
        userName: name,
        commentText: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await pRef.update({ commentCount: firebase.firestore.FieldValue.increment(1) });
      input.value = "";
      
      // Create notifications for foundation owner and admins
      if(foundationData) {
        var recipientIds = new Set();
        if(foundationData.ownerId && foundationData.ownerId !== currentUser.uid) recipientIds.add(foundationData.ownerId);
        if(foundationData.admins) {
          foundationData.admins.forEach(function(adminId) {
            if(adminId && adminId !== currentUser.uid) recipientIds.add(adminId);
          });
        }
        
        recipientIds.forEach(function(recipientId) {
          db.collection("notifications").add({
            notificationType: "foundation_comment",
            foundationId: fid,
            foundationName: foundationData.name,
            postId: currentPostId,
            commenterId: currentUser.uid,
            commenterName: name,
            commentText: text.substring(0, 100),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            isRead: false,
            recipientId: recipientId
          });
        });
      }
    }catch(e){
      console.error("Failed to comment:", e);
      alert("Failed to comment.");
    }
  };

  window.toggleLike = async (postId, liked) => {
    const ref = db.collection("foundation_campaign_posts").doc(postId);
    if(liked) await ref.update({ likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    else await ref.update({ likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
  };

})();