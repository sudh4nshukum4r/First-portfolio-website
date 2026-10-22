
/* LE4RNSP4CE — Firebase Community Feed
   Features:
   - Real-time community feed
   - Like / Unlike and live like counts
   - Add, edit and delete your own comments
   - Edit and delete your own posts
   - Safe text rendering for user-generated content
*/
(async () => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const feed = $("#postsFeed");
  const form = $("#postForm");

  // Only run on pages containing the community feed and composer.
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
  let auth = null;
  let authSDK = null;

  // Stop old listeners when the feed is redrawn.
  const postListeners = new Map();
  const commentListeners = new Map();
  const commentPanels = new Map();
  const busyActions = new Set();

  function setStatus(message, type = "") {
    if (!status) return;

    status.textContent = message;
    status.className = "status-message";

    if (type) status.classList.add(type);
  }

  function setFeedMessage(message) {
    if (!feedMessage) return;

    feedMessage.textContent = message || "";
    feedMessage.hidden = !message;
  }

  function formatDate(timestamp) {
    const date = timestamp?.toDate?.();

    if (!date) return "Just now";

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  function makeButton(text, className, onClick) {
    const button = makeElement("button", className, text);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function stopListeners(map, key) {
    const unsubscribe = map.get(key);

    if (unsubscribe) unsubscribe();
    map.delete(key);
  }

  function stopAllListeners() {
    postListeners.forEach(unsubscribe => unsubscribe());
    commentListeners.forEach(unsubscribe => unsubscribe());

    postListeners.clear();
    commentListeners.clear();
    commentPanels.clear();
  }

  function isVerifiedUser() {
    if (!currentUser) return false;

    // Firebase email/password users must verify their email.
    // Google and other trusted providers may already be verified.
    return currentUser.emailVerified === true ||
      currentUser.providerData?.some(
        provider => provider.providerId !== "password"
      ) === true;
  }

  function requireVerifiedUser() {
    if (!currentUser) {
      setStatus("Please log in to use community features.", "error");
      return false;
    }

    if (!isVerifiedUser()) {
      setStatus("Please verify your email before continuing.", "error");
      return false;
    }

    return true;
  }

  function actionKey(action, id) {
    return `${action}:${id}`;
  }

  async function runAction(key, callback) {
    if (busyActions.has(key)) return;

    busyActions.add(key);

    try {
      await callback();
    } catch (error) {
      console.error("Community action failed:", error);

      if (error.code === "permission-denied") {
        setStatus(
          "Firebase Rules blocked this action. Check login and permissions.",
          "error"
        );
      } else {
        setStatus(
          error.message || "Action failed. Please try again.",
          "error"
        );
      }
    } finally {
      busyActions.delete(key);
    }
  }

  // Add lightweight styling without requiring a separate CSS edit.
  function installStyles() {
    if ($("#communityActionsStyles")) return;

    const style = document.createElement("style");
    style.id = "communityActionsStyles";
    style.textContent = `
      .community-actions-row {
        display:flex; flex-wrap:wrap; gap:8px;
        align-items:center; margin-top:12px;
      }
      .community-action-btn {
        border:1px solid #d5d9e2; border-radius:10px;
        padding:8px 12px; background:transparent;
        color:inherit; cursor:pointer; font:inherit;
      }
      .community-action-btn:disabled {
        opacity:.55; cursor:not-allowed;
      }
      .community-action-btn:hover { filter:brightness(.94); }
      .community-action-btn.is-liked {
        border-color:#7167e8; color:#7167e8;
        font-weight:700;
      }
      .community-comments {
        margin-top:12px; padding-top:12px;
        border-top:1px solid #ddd;
      }
      .community-comment {
        padding:10px 0; border-bottom:1px solid #e6e6e6;
        overflow-wrap:anywhere;
      }
      .community-comment-meta {
        display:flex; flex-wrap:wrap; gap:8px;
        align-items:center; margin-bottom:5px;
      }
      .community-comment-text { white-space:pre-wrap; }
      .community-comment-form {
        display:flex; flex-wrap:wrap; gap:8px;
        margin:10px 0;
      }
      .community-comment-input {
        flex:1 1 220px; min-width:0; padding:10px;
        border:1px solid #cfd3dc; border-radius:9px;
        font:inherit; color:inherit; background:transparent;
      }
      .community-inline-error {
        color:#b42318; margin:8px 0;
      }
      .community-inline-note { opacity:.75; margin:8px 0; }
    `;

    document.head.append(style);
  }

  async function getProfile() {
    const profileRef = firestore.doc(db, "users", currentUser.uid);
    const snapshot = await firestore.getDoc(profileRef);

    return snapshot.exists() ? snapshot.data() : {};
  }

  function getUsername(profile = {}) {
    return profile.username ||
      (currentUser?.email || "").split("@")[0] ||
      "learner";
  }

  function getDisplayName(profile = {}) {
    return profile.displayName ||
      currentUser?.displayName ||
      "Learner";
  }

  function createPostCard(data, postId) {
    const card = makeElement("article", "post-card");
    card.dataset.type = data.type || "Post";
    card.dataset.postId = postId;

    const header = makeElement("div", "post-topline");
    const avatar = makeElement(
      "div",
      "avatar",
      (data.authorName || data.username || "L")
        .charAt(0).toUpperCase()
    );

    const author = makeElement("div", "post-author");
    const name = makeElement(
      "strong",
      "",
      data.authorName || data.username || "Learner"
    );
    const date = makeElement("span", "", formatDate(data.createdAt));

    author.append(name, date);

    const type = makeElement(
      "span",
      "post-type-badge",
      data.type || "Post"
    );

    header.append(avatar, author, type);

    const title = makeElement("h3", "", data.title || "Untitled post");
    const description = makeElement("p", "", data.description || "");

    const tags = makeElement("div", "post-tags");

    (Array.isArray(data.tags) ? data.tags : [])
      .slice(0, 10)
      .forEach(value => {
        tags.append(
          makeElement(
            "span",
            "",
            "#" + String(value).replace(/^#/, "")
          )
        );
      });

    const footer = makeElement("div", "post-actions");
    const username = makeElement(
      "span",
      "helper-text",
      data.username ? "@" + data.username : "LE4RNSP4CE learner"
    );

    footer.append(username);

    card.append(header, title, description);

    if (tags.childElementCount) card.append(tags);

    card.append(footer);

    const actions = makeElement("div", "community-actions-row");
    const likeButton = makeButton("Like · 0", "community-action-btn", () => {});
    const commentsButton = makeButton(
      "Comments",
      "community-action-btn",
      () => toggleComments(postId, data, card, commentsButton)
    );

    likeButton.disabled = !currentUser;
    commentsButton.disabled = !currentUser;

    actions.append(likeButton, commentsButton);

    if (currentUser && data.uid === currentUser.uid) {
      const editButton = makeButton(
        "Edit post",
        "community-action-btn",
        () => editPost(postId, data)
      );

      const deleteButton = makeButton(
        "Delete post",
        "community-action-btn",
        () => deletePost(postId, data)
      );

      actions.append(editButton, deleteButton);
    }

    card.append(actions);

    const commentsContainer = makeElement("section", "community-comments");
    commentsContainer.hidden = true;
    commentsContainer.setAttribute("aria-label", "Comments");
    card.append(commentsContainer);

    // Remember where to render comments if the user opens them.
    commentPanels.set(postId, {
      container: commentsContainer,
      button: commentsButton,
      data
    });

    listenForLikes(postId, likeButton);

    return card;
  }

  function listenForLikes(postId, button) {
    stopListeners(postListeners, postId);

    const likesRef = firestore.collection(
      db, "posts", postId, "likes"
    );

    const unsubscribe = firestore.onSnapshot(
      likesRef,
      snapshot => {
        const count = snapshot.size;
        const liked = Boolean(
          currentUser &&
          snapshot.docs.some(doc => doc.id === currentUser.uid)
        );

        button.textContent = `${liked ? "Liked" : "Like"} · ${count}`;
        button.classList.toggle("is-liked", liked);
        button.setAttribute("aria-pressed", String(liked));
        button.disabled = !currentUser;

        button.onclick = () => toggleLike(postId, liked);
      },
      error => {
        console.error("Like listener error:", error);
        button.textContent = "Like unavailable";
        button.disabled = true;
      }
    );

    postListeners.set(postId, unsubscribe);
  }

  async function toggleLike(postId, currentlyLiked) {
    if (!requireVerifiedUser()) return;

    const key = actionKey("like", postId);

    await runAction(key, async () => {
      const likeRef = firestore.doc(
        db, "posts", postId, "likes", currentUser.uid
      );

      if (currentlyLiked) {
        await firestore.deleteDoc(likeRef);
      } else {
        await firestore.setDoc(likeRef, {
          uid: currentUser.uid,
          createdAt: firestore.serverTimestamp()
        });
      }
    });
  }

  async function editPost(postId, originalData) {
    if (!requireVerifiedUser()) return;
    if (originalData.uid !== currentUser.uid) return;

    const newTitle = window.prompt(
      "Edit post title:",
      originalData.title || ""
    );

    if (newTitle === null) return;

    const title = newTitle.trim();

    if (!title || title.length > 120) {
      setStatus("Title must be between 1 and 120 characters.", "error");
      return;
    }

    const newDescription = window.prompt(
      "Edit post description:",
      originalData.description || ""
    );

    if (newDescription === null) return;

    const description = newDescription.trim();

    if (!description || description.length > 2000) {
      setStatus(
        "Description must be between 1 and 2000 characters.",
        "error"
      );
      return;
    }

    const key = actionKey("edit-post", postId);

    await runAction(key, async () => {
      await firestore.updateDoc(
        firestore.doc(db, "posts", postId),
        {
          title,
          description,
          updatedAt: firestore.serverTimestamp()
        }
      );

      setStatus("Post updated successfully.", "success");
    });
  }

  async function deletePost(postId, data) {
    if (!requireVerifiedUser()) return;
    if (data.uid !== currentUser.uid) return;

    const confirmed = window.confirm(
      "Delete this post permanently? Its likes and comments may remain in Firestore."
    );

    if (!confirmed) return;

    const key = actionKey("delete-post", postId);

    await runAction(key, async () => {
      await firestore.deleteDoc(firestore.doc(db, "posts", postId));
      setStatus("Post deleted.", "success");
    });
  }

  function renderComments(container, snapshots, postId, data) {
    container.replaceChildren();

    const formElement = makeElement("form", "community-comment-form");
    const input = makeElement("textarea", "community-comment-input");
    input.rows = 2;
    input.maxLength = 1000;
    input.placeholder = "Write a comment...";
    input.setAttribute("aria-label", "Write a comment");

    const sendButton = makeElement("button", "community-action-btn", "Comment");
    sendButton.type = "submit";

    formElement.append(input, sendButton);

    if (currentUser) {
      container.append(formElement);
    } else {
      container.append(
        makeElement("p", "community-inline-note", "Log in to comment.")
      );
    }

    formElement.addEventListener("submit", async event => {
      event.preventDefault();

      if (!requireVerifiedUser()) return;

      const text = input.value.trim();

      if (!text || text.length > 1000) {
        setStatus("Comment must be between 1 and 1000 characters.", "error");
        return;
      }

      sendButton.disabled = true;

      await runAction(actionKey("add-comment", postId), async () => {
        const profile = await getProfile();

        await firestore.addDoc(
          firestore.collection(db, "posts", postId, "comments"),
          {
            uid: currentUser.uid,
            username: getUsername(profile),
            authorName: getDisplayName(profile),
            text,
            createdAt: firestore.serverTimestamp()
          }
        );

        input.value = "";
        setStatus("Comment added.", "success");
      });

      sendButton.disabled = false;
    });

    if (!snapshots.length) {
      container.append(
        makeElement("p", "community-inline-note", "No comments yet.")
      );
      return;
    }

    snapshots.forEach(snapshot => {
      const comment = snapshot.data();
      const commentId = snapshot.id;

      const item = makeElement("article", "community-comment");
      const meta = makeElement("div", "community-comment-meta");
      const author = makeElement(
        "strong",
        "",
        comment.authorName || comment.username || "Learner"
      );

      const date = makeElement(
        "span",
        "helper-text",
        formatDate(comment.createdAt)
      );

      meta.append(author, date);

      const body = makeElement(
        "p",
        "community-comment-text",
        comment.text || ""
      );

      item.append(meta, body);

      if (currentUser && comment.uid === currentUser.uid) {
        const controls = makeElement("div", "community-actions-row");

        controls.append(
          makeButton("Edit", "community-action-btn", async () => {
            if (!requireVerifiedUser()) return;

            const edited = window.prompt(
              "Edit your comment:",
              comment.text || ""
            );

            if (edited === null) return;

            const text = edited.trim();

            if (!text || text.length > 1000) {
              setStatus(
                "Comment must be between 1 and 1000 characters.",
                "error"
              );
              return;
            }

            await runAction(
              actionKey("edit-comment", commentId),
              async () => {
                await firestore.updateDoc(
                  firestore.doc(
                    db, "posts", postId, "comments", commentId
                  ),
                  {
                    text,
                    updatedAt: firestore.serverTimestamp()
                  }
                );

                setStatus("Comment updated.", "success");
              }
            );
          }),

          makeButton("Delete", "community-action-btn", async () => {
            if (!requireVerifiedUser()) return;

            if (!window.confirm("Delete your comment?")) return;

            await runAction(
              actionKey("delete-comment", commentId),
              async () => {
                await firestore.deleteDoc(
                  firestore.doc(
                    db, "posts", postId, "comments", commentId
                  )
                );

                setStatus("Comment deleted.", "success");
              }
            );
          })
        );

        item.append(controls);
      }

      container.append(item);
    });
  }

  function toggleComments(postId, postData, card, button) {
    const panel = commentPanels.get(postId);
    if (!panel) return;

    panel.container.hidden = !panel.container.hidden;

    if (panel.container.hidden) {
      stopListeners(commentListeners, postId);
      button.textContent = "Comments";
      return;
    }

    button.textContent = "Hide comments";

    if (commentListeners.has(postId)) return;

    panel.container.replaceChildren(
      makeElement("p", "community-inline-note", "Loading comments...")
    );

    const commentsQuery = firestore.query(
      firestore.collection(db, "posts", postId, "comments"),
      firestore.orderBy("createdAt", "asc"),
      firestore.limit(100)
    );

    const unsubscribe = firestore.onSnapshot(
      commentsQuery,
      snapshot => {
        renderComments(
          panel.container,
          snapshot.docs,
          postId,
          postData
        );
      },
      error => {
        console.error("Comments listener error:", error);

        panel.container.replaceChildren(
          makeElement(
            "p",
            "community-inline-error",
            "Could not load comments. Check Firestore Rules."
          )
        );
      }
    );

    commentListeners.set(postId, unsubscribe);
  }

  function renderPosts(documents) {
    stopAllListeners();
    feed.replaceChildren();

    if (!documents.length) {
      setFeedMessage(
        "No community posts yet. Be the first to share something."
      );
      return;
    }

    setFeedMessage("");

    const fragment = document.createDocumentFragment();

    documents.forEach(snapshot => {
      fragment.append(createPostCard(snapshot.data(), snapshot.id));
    });

    feed.append(fragment);

    window.LE4RNSP4CE?.filterPosts?.(
      $("#siteSearch")?.value || ""
    );
  }

  try {
    const appSDK = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"
    );

    authSDK = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js"
    );

    firestore = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js"
    );

    const app = appSDK.getApps().length
      ? appSDK.getApp()
      : appSDK.initializeApp(firebaseConfig);

    auth = authSDK.getAuth(app);
    db = firestore.getFirestore(app);

    installStyles();

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
            ? "Firestore Rules currently block reading posts."
            : "Unable to load posts. Check your connection and Firebase setup."
        );
      }
    );

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

      setStatus(
        user
          ? ""
          : "Log in to publish, like posts and comment."
      );

      // Refresh ownership controls and current like states.
      if (feed.children.length) {
        const currentCards = Array.from(feed.children).map(card => ({
          id: card.dataset.postId
        }));

        // Re-render from the current feed query.
        // The next Firestore snapshot will also render the feed.
        currentCards.forEach(item => {
          stopListeners(postListeners, item.id);
        });
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();

      if (!requireVerifiedUser()) return;

      const title = $("#postTitle")?.value.trim() || "";
      const description = $("#postDescription")?.value.trim() || "";

      if (!title || !description) {
        setStatus("Please enter a title and description.", "error");
        return;
      }

      if (title.length > 120 || description.length > 2000) {
        setStatus("Title or description is too long.", "error");
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
        const profile = await getProfile();

        await firestore.addDoc(
          firestore.collection(db, "posts"),
          {
            uid: currentUser.uid,
            username: getUsername(profile),
            authorName: getDisplayName(profile),
            authorPhotoURL:
              profile.photoURL || currentUser.photoURL || "",
            type: $("#postType")?.value || "Post",
            title,
            description,
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
            ? "Firestore Rules blocked publishing. Check your rules and verification."
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
