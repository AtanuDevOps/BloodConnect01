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
  var isAdmin = false;
  var currentPostData = null;
  var currentPostId = null;
  var commentsUnsubscribe = null;

  var foundationData = null;
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
      const data = doc.data();
      foundationData = data;
      isAdmin = (user.uid === data.ownerId) || (data.admins && data.admins.includes(user.uid));

      renderFoundationUI(data);
      loadCampaigns();
      loadStats();

      if(isAdmin){
        document.getElementById('editCoverBtn').style.display = 'flex';
        document.getElementById('editProfileImgBtn').style.display = 'flex';
        document.getElementById('adminPostSection').style.display = 'flex';
        loadFoundationJoinRequests();
      }
      
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
    
    if(data.coverImage) document.getElementById('coverImg').src = data.coverImage;
    if(data.profileImage) document.getElementById('profileImg').src = data.profileImage;
    
    const initial = (data.name || "F").charAt(0).toUpperCase();
    document.getElementById('adminAvatar').textContent = initial;
  }

  async function loadStats() {
    try {
      // 1. Members count
      const membersSnap = await db.collection("foundation_members").where("foundationId","==",fid).get();
      document.getElementById('membersCount').textContent = membersSnap.size;

      const memberIds = membersSnap.docs.map(d => d.data().memberId);
      if(memberIds.length === 0) return;

      // 2. Available donors & Life Saved
      // Note: Firestore IN query limited to 10. For production, consider a cloud function or different structure.
      // Here we chunk it for demo safety if members < 10.
      const queryLimit = 10;
      const chunks = [];
      for (let i = 0; i < memberIds.length; i += queryLimit) {
          chunks.push(memberIds.slice(i, i + queryLimit));
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

  // --- IMAGE UPLOADS ---
  const coverUpload = document.getElementById('coverUpload');
  const profileUpload = document.getElementById('profileUpload');

  document.getElementById('editCoverBtn').addEventListener('click', () => coverUpload.click());
  document.getElementById('editProfileImgBtn').addEventListener('click', () => profileUpload.click());

  coverUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    try {
      const url = await window.uploadImage(file);
      if(url) {
        await db.collection("foundation_requests").doc(fid).update({ coverImage: url });
        document.getElementById('coverImg').src = url;
      }
    } catch(e){ alert("Upload failed"); }
  });

  profileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    try {
      const url = await window.uploadImage(file);
      if(url) {
        await db.collection("foundation_requests").doc(fid).update({ profileImage: url });
        document.getElementById('profileImg').src = url;
      }
    } catch(e){ alert("Upload failed"); }
  });

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
    const profileImg = document.getElementById('profileImg').src;

    return `
      <div class="campaign-card">
        <div class="campaign-header">
          <img src="${profileImg}" class="campaign-avatar" style="width:40px; height:40px; object-fit:cover; cursor:pointer;" onclick="window.location.href='foundation-public-profile.html?foundationId=${fid}'">
          <div class="campaign-author-info">
            <div class="campaign-author-name" style="cursor:pointer;" onclick="window.location.href='foundation-public-profile.html?foundationId=${fid}'">${post.foundationName || "Foundation"}</div>
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
          var canDelete = (currentUser && (c.userId === currentUser.uid || isAdmin));
          return '<div class="comment-item">'
            + '<div class="comment-avatar">'+ escapeHtml(initials) +'</div>'
            + '<div class="comment-content" style="flex:1;">'
            + '<div style="display:flex; justify-content:space-between; align-items:center;">'
            + '<div class="comment-author">'+ escapeHtml(c.userName||"User") +'</div>'
            + (canDelete ? '<button class="comment-menu-btn" onclick="toggleCommentMenu(\''+d.id+'\')" style="background:none; border:none; cursor:pointer; color:#888; padding:4px;"><i class="fa-solid fa-ellipsis-vertical"></i></button>' : '')
            + '</div>'
            + '<div class="comment-text">'+ escapeHtml(c.commentText||"") +'</div>'
            + '<div class="comment-time">'+ dateStr +'</div>'
            + (canDelete ? '<div id="menu-'+d.id+'" class="comment-menu" style="display:none; margin-top:8px;">'
            + '<button onclick="deleteComment(\''+d.id+'\',\''+postId+'\')" style="background:none; border:none; color:#CE1126; cursor:pointer; padding:4px 0; font-size:12px; display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-trash"></i> Delete</button>'
            + '</div>' : '')
            + '</div>'
            + '</div>';
        }).join("");
      });
  }
  
  window.toggleCommentMenu = function(commentId) {
    var menu = document.getElementById('menu-'+commentId);
    if(menu) {
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
  };
  
  window.deleteComment = async function(commentId, postId) {
    if(!confirm('Delete this comment?')) return;
    if(!currentUser) return;
    
    try {
      var commentRef = db.collection('foundation_post_comments').doc(commentId);
      var postRef = db.collection('foundation_campaign_posts').doc(postId);
      
      await db.runTransaction(async function(tx) {
        var commentSnap = await tx.get(commentRef);
        if(!commentSnap.exists) return;
        
        tx.delete(commentRef);
        tx.update(postRef, { commentCount: firebase.firestore.FieldValue.increment(-1) });
      });
      
    } catch(e) {
      console.error('Failed to delete comment:', e);
      alert('Failed to delete comment.');
    }
  };
  
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

  // --- POST MODAL ---
  const modal = document.getElementById('campaignModal');
  const commentModal = document.getElementById('commentModal');
  document.getElementById('postTrigger').addEventListener('click', () => modal.style.display = 'flex');
  document.getElementById('closeModal').addEventListener('click', () => modal.style.display = 'none');
  window.onclick = function(e) {
    if (e.target === modal) modal.style.display = 'none';
    if (e.target === commentModal) closeCommentModal();
  };

  document.getElementById('campaignForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('postBtn');
    btn.disabled = true; btn.textContent = "Posting...";

    const type = document.getElementById('campaignType').value;
    const caption = document.getElementById('campaignCaption').value;
    const file = document.getElementById('campaignImage').files[0];

    try {
      let imageUrl = "";
      if(file) imageUrl = await window.uploadImage(file);

      await db.collection("foundation_campaign_posts").add({
        foundationId: fid,
        foundationName: document.getElementById('foundationName').textContent,
        campaignType: type,
        caption: caption,
        imageURL: imageUrl,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        likes: [],
        likeCount: 0,
        loveCount: 0,
        wowCount: 0,
        angryCount: 0,
        commentCount: 0
      });

      modal.style.display = 'none';
      e.target.reset();
    } catch(e){ alert("Post failed"); }
    finally { btn.disabled = false; btn.textContent = "Post"; }
  });

  window.toggleLike = async (postId, liked) => {
        const ref = db.collection("foundation_campaign_posts").doc(postId);
        if(liked) await ref.update({ likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
        else await ref.update({ likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
      };
      
      function loadFoundationJoinRequests() {
        db.collection("foundation_join_requests")
          .where("foundationId", "==", fid)
          .where("status", "==", "pending")
          .orderBy("createdAt", "desc")
          .onSnapshot(function(snap) {
            const section = document.getElementById("foundationJoinRequestsSection");
            const list = document.getElementById("foundationJoinRequestsList");
            
            if(snap.empty) {
              section.style.display = "none";
              return;
            }
            
            section.style.display = "block";
            list.innerHTML = snap.docs.map(doc => {
              const req = doc.data();
              return `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:#fff; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                  <div>
                    <strong>${escapeHtml(req.userName)}</strong>
                    <div class="muted" style="font-size:12px">Requested to join the foundation</div>
                  </div>
                  <div style="display:flex; gap:8px;">
                    <button onclick="approveJoinRequest('${doc.id}', '${req.userId}')" class="action-btn" style="padding:6px 12px; font-size:12px; border-radius:8px;">Approve</button>
                    <button onclick="rejectJoinRequest('${doc.id}')" class="action-btn secondary" style="padding:6px 12px; font-size:12px; border-radius:8px;">Reject</button>
                  </div>
                </div>
              `;
            }).join("");
          });
      }
      
      window.approveJoinRequest = async function(requestDocId, userId) {
        try {
          await db.runTransaction(async (tx) => {
            const reqDoc = await tx.get(db.collection("foundation_join_requests").doc(requestDocId));
            if(!reqDoc.exists) return;
            
            // Update request status
            tx.update(db.collection("foundation_join_requests").doc(requestDocId), { status: "approved" });
            
            // Add to foundation members
            tx.set(db.collection("foundation_members").doc(), {
              foundationId: fid,
              memberId: userId,
              joinedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          });
          
          alert("Join request approved!");
        } catch(e) {
          console.error("Error approving join request:", e);
          alert("Failed to approve join request!");
        }
      }
      
      window.rejectJoinRequest = async function(requestDocId) {
        if(!confirm("Reject this join request?")) return;
        
        try {
          await db.collection("foundation_join_requests").doc(requestDocId).update({ status: "rejected" });
          alert("Join request rejected!");
        } catch(e) {
          console.error("Error rejecting join request:", e);
          alert("Failed to reject join request!");
        }
      }

    })();
