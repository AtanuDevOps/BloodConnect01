(function(){
  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m && decodeURIComponent(m[1].replace(/\+/g, ' '));
  }

  var app = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(window.firebaseConfig);
  var auth = firebase.auth(app);
  var db = firebase.firestore(app);
  var fid = getParam('foundationId');

  var currentUser = null;
  var isAdmin = false;

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
      isAdmin = (user.uid === data.ownerId);

      renderFoundationUI(data);
      loadCampaigns();
      loadStats();

      if(isAdmin){
        document.getElementById('editCoverBtn').style.display = 'flex';
        document.getElementById('editProfileImgBtn').style.display = 'flex';
        document.getElementById('adminPostSection').style.display = 'flex';
      }
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
          <img src="${profileImg}" class="campaign-avatar" style="width:40px; height:40px; object-fit:cover;">
          <div class="campaign-author-info">
            <div class="campaign-author-name">${post.foundationName || "Foundation"}</div>
            <div class="campaign-meta"><span>${date}</span></div>
          </div>
        </div>
        <div class="campaign-content">${post.caption || ""}</div>
        ${post.imageURL ? `<img src="${post.imageURL}" class="campaign-image">` : ""}
        <div class="campaign-actions">
          <button class="campaign-action-btn" onclick="toggleLike('${id}', ${hasLiked})">
            <i class="${hasLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${likes.length}
          </button>
          <button class="campaign-action-btn"><i class="fa-regular fa-comment"></i> ${post.commentCount || 0}</button>
        </div>
      </div>
    `;
  }

  // --- POST MODAL ---
  const modal = document.getElementById('campaignModal');
  document.getElementById('postTrigger').addEventListener('click', () => modal.style.display = 'flex');
  document.getElementById('closeModal').addEventListener('click', () => modal.style.display = 'none');

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

})();
