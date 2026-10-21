
/* LE4RNSP4CE — Firebase Community Feed */
(async () => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const feed = $("#postsFeed");
  const form = $("#postForm");

  // Run only on pages that contain the community feed and composer
  if (!feed || !form) return;

  const status = $("#postStatus");
  const feedMessage = $("#feedMessage");
  const submitButton = form.querySelector('button[type="submit"]');

  const firebaseConfig = {
    apiKey: "AIzaSyAq2dZSTyMha1TyifA37ZkUGNB69Bb__mY",
    authDomain: "le4rnsp4ce.firebaseapp.com",
    projectId: "le4rnsp4ce",
    storageBucket: "le4rnsp4ce.firebasestorage.app",
    messagingSenderId: "679714213034",
    appId: "1:679714213034:web:2768833e0c6ce25398d4d3"
  };

  let currentUser = null;
  let db = null;
  let firestore = null;

  function setStatus(text, type = "") {
    if (!status) return;

    status.textContent = text;
    status.className = "status-message";

    if (type) status.classList.add(type);
  }

  function setFeedMessage(text) {
    if (!feedMessage) return;

    feedMessage.textContent = text || "";
    feedMessage.hidden = !text;
  }

  function formatDate(timestamp) {
    const date = timestamp?.toDate?.();

    if (!date) return "Just now";

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  // Use textContent, not innerHTML, for user-generated content
  function createPostCard(data, id) {
    const card = document.createElement("article");
    card.className = "post-card";
    card.dataset.type = data.type || "Post";
    card.dataset.postId = id;

    const header = document.createElement("div");
    header.className = "post-topline";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = (
      data.authorName || data.username || "L"
    ).charAt(0).toUpperCase();

    const author = document.createElement("div");
    author.className = "post-author";

    const name = document.createElement("strong");
    name.textContent = data.authorName || data.username || "Learner";

    const date = document.createElement("span");
    date.textContent = formatDate(data.createdAt);

    author.append(name, date);

    const type = document.createElement("span");
    type.className = "post-type-badge";
    type.textContent = data.type || "Post";

    header.append(avatar, author, type);

    const title = document.createElement("h3");
    title.textContent = data.title || "Untitled post";

    const description = document.createElement("p");
    description.textContent = data.description || "";

    const tags = document.createElement("div");
    tags.className = "post-tags";

    (Array.isArray(data.tags) ? data.tags : [])
      .slice(0, 10)
      .forEach(value => {
        const tag = document.createElement("span");
        tag.textContent = "#" + String(value).replace(/^#/, "");
        tags.append(tag);
      });

    const footer = document.createElement("div");
    footer.className = "post-actions";

    const username = document.createElement("span");
    username.className = "helper-text";
    username.textContent = data.username
      ? "@" + data.username
      : "LE4RNSP4CE learner";

    footer.append(username);
    card.append(header, title, description);

    if (tags.childElementCount) card.append(tags);

    card.append(footer);
    return card;
  }

  function renderPosts(documents) {
    feed.replaceChildren();

    if (!documents.length) {
      setFeedMessage(
        "No community posts yet. Be the first to share something."
      );
      return;
    }

    setFeedMessage("");

    const fragment = document.createDocumentFragment();

    documents.forEach(documentSnapshot => {
      fragment.append(
        createPostCard(
          documentSnapshot.data(),
          documentSnapshot.id
        )
      );
    });

    feed.append(fragment);

    window.LE4RNSP4CE?.filterPosts?.(
      $("#siteSearch")?.value || ""
    );
  }

  try {
    // Firebase SDK is imported dynamically; no module script tag needed
    const appSDK = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"
    );

    const authSDK = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js"
    );

    firestore = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js"
    );

    const app = appSDK.getApps().length
      ? appSDK.getApp()
      : appSDK.initializeApp(firebaseConfig);

    const auth = authSDK.getAuth(app);
    db = firestore.getFirestore(app);

    // Listen for new posts in real time
    setFeedMessage("Loading community posts...");

    const postsQuery = firestore.query(
      firestore.collection(db, "posts"),
      firestore.orderBy("createdAt", "desc"),
      firestore.limit(50)
    );

    firestore.onSnapshot(
      postsQuery,
      snapshot => renderPosts(snapshot.docs),
      error => {
        console.error("Firestore feed error:", error);

        setFeedMessage(
          error.code === "permission-denied"
            ? "Firestore Security Rules currently block reading posts."
            : "Unable to load posts. Check your connection and Firebase setup."
        );
      }
    );

    // Respect existing Firebase authentication
    authSDK.onAuthStateChanged(auth, user => {
      currentUser = user;

      const loginLink = $("#loginLink");

      if (loginLink && user) {
        loginLink.textContent = "My account";
        loginLink.href = "dashboard.html";
      }

      if (submitButton) {
        submitButton.disabled = !user;
      }

      if (!user) {
        setStatus("Log in to publish a community post.");
      } else {
        setStatus("");
      }
    });

    // Publish a post to Firestore
    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!currentUser) {
        setStatus("Please log in before publishing.", "error");
        return;
      }

      if (
        !currentUser.emailVerified &&
        currentUser.providerData?.some(
          provider => provider.providerId === "password"
        )
      ) {
        setStatus("Please verify your email before publishing.", "error");
        return;
      }

      const title = $("#postTitle")?.value.trim() || "";
      const description =
        $("#postDescription")?.value.trim() || "";

      if (!title || !description) {
        setStatus("Please enter a title and description.", "error");
        return;
      }

      const tags = ($("#postTags")?.value || "")
        .split(",")
        .map(tag => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 10);

      const mentions = ($("#postMentions")?.value || "")
        .match(/@([a-zA-Z0-9_]{3,24})/g) || [];

      if (submitButton) submitButton.disabled = true;
      setStatus("Publishing your post...");

      try {
        const profileSnapshot = await firestore.getDoc(
          firestore.doc(db, "users", currentUser.uid)
        );

        const profile = profileSnapshot.exists()
          ? profileSnapshot.data()
          : {};

        await firestore.addDoc(
          firestore.collection(db, "posts"),
          {
            uid: currentUser.uid,
            username:
              profile.username ||
              (currentUser.email || "").split("@")[0],
            authorName:
              profile.displayName ||
              currentUser.displayName ||
              "Learner",
            authorPhotoURL:
              profile.photoURL || currentUser.photoURL || "",
            type: $("#postType")?.value || "Post",
            title: title.slice(0, 120),
            description: description.slice(0, 2000),
            tags,
            mentions,
            visibility: "public",
            createdAt: firestore.serverTimestamp(),
            updatedAt: firestore.serverTimestamp()
          }
        );

        form.reset();
        setStatus("Post published successfully.", "success");
      } catch (error) {
        console.error("Firestore publishing error:", error);

        setStatus(
          error.code === "permission-denied"
            ? "Firestore rules blocked publishing. Check your database rules."
            : "Could not publish the post. Please try again.",
          "error"
        );
      } finally {
        if (submitButton) {
          submitButton.disabled = !currentUser;
        }
      }
    });
  } catch (error) {
    console.error("Firebase initialization error:", error);

    setFeedMessage(
      "Firebase could not initialize. Check your connection and configuration."
    );

    if (submitButton) submitButton.disabled = true;

    setStatus("Community features are currently unavailable.", "error");
  }
})();
