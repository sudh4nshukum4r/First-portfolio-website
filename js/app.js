
/* LE4RNSP4CE — App Foundation */
(() => {
  "use strict";

  const $ = (selector, root = document) =>
    root.querySelector(selector);

  const $$ = (selector, root = document) =>
    [...root.querySelectorAll(selector)];

  // English and Hindi translations
  const translations = {
    en: {
      home: "Home",
      discover: "Discover",
      create: "Create",
      profile: "Profile",
      login: "Login",
      join: "Join free",
      search: "Search",
      courses: "Courses",
      library: "Learning Library",
      dashboard: "Dashboard",
      communityHeading: "Community Feed",
      createHeading: "Share with the Community",
      publishPost: "Publish Post",
      postTitleLabel: "Title",
      postDescriptionLabel: "Tell us more",
      searchPlaceholder: "Search posts, projects, topics...",
      postTitlePlaceholder: "Give your post a clear title",
      postDescriptionPlaceholder:
        "Share your idea, question or progress...",
      tagsLabel: "Tags",
      tagsPlaceholder: "Python, AI, Web Development"
    },

    hi: {
      home: "होम",
      discover: "खोजें",
      create: "बनाएँ",
      profile: "प्रोफ़ाइल",
      login: "लॉग इन",
      join: "मुफ़्त जुड़ें",
      search: "खोजें",
      courses: "कोर्स",
      library: "लर्निंग लाइब्रेरी",
      dashboard: "डैशबोर्ड",
      communityHeading: "कम्युनिटी फ़ीड",
      createHeading: "कम्युनिटी के साथ साझा करें",
      publishPost: "पोस्ट प्रकाशित करें",
      postTitleLabel: "शीर्षक",
      postDescriptionLabel: "थोड़ा और बताएँ",
      searchPlaceholder: "पोस्ट, प्रोजेक्ट और विषय खोजें...",
      postTitlePlaceholder: "पोस्ट का शीर्षक लिखें",
      postDescriptionPlaceholder:
        "अपना आइडिया, सवाल या प्रगति साझा करें...",
      tagsLabel: "टैग",
      tagsPlaceholder: "Python, AI, Web Development"
    }
  };

  function applyLanguage(language) {
    const lang = translations[language] ? language : "en";

    document.documentElement.lang = lang;

    $$("[data-i18n]").forEach(element => {
      const key = element.dataset.i18n;
      if (translations[lang][key]) {
        element.textContent = translations[lang][key];
      }
    });

    $$("[data-i18n-placeholder]").forEach(element => {
      const key = element.dataset.i18nPlaceholder;
      if (translations[lang][key]) {
        element.placeholder = translations[lang][key];
      }
    });

    const selector = $("#languageSelect");
    if (selector) selector.value = lang;

    try {
      localStorage.setItem("le4rnsp4ce-language", lang);
    } catch (error) {
      console.warn("Language preference could not be saved.");
    }
  }

  // Restore saved language
  let savedLanguage = "en";

  try {
    savedLanguage =
      localStorage.getItem("le4rnsp4ce-language") || "en";
  } catch (error) {
    console.warn("Using default language.");
  }

  applyLanguage(savedLanguage);

  $("#languageSelect")?.addEventListener("change", event => {
    applyLanguage(event.target.value);
  });

  // Search the visible community posts
  function filterPosts(searchText = "") {
    const query = searchText.trim().toLowerCase();
    const cards = $$(".post-card", $("#postsFeed") || document);
    let visibleCount = 0;

    cards.forEach(card => {
      const matches =
        !query || card.textContent.toLowerCase().includes(query);

      card.hidden = !matches;
      if (matches) visibleCount++;
    });

    const message = $("#feedMessage");

    if (message && query && visibleCount === 0) {
      message.hidden = false;
      message.textContent = "No matching posts found.";
    } else if (message && query) {
      message.hidden = true;
    }
  }

  $("#searchForm")?.addEventListener("submit", event => {
    event.preventDefault();

    filterPosts($("#siteSearch")?.value || "");

    $("#feedHeading")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  $("#siteSearch")?.addEventListener("input", event => {
    filterPosts(event.target.value);
  });

  // Filter posts by type
  $("#feedFilter")?.addEventListener("change", event => {
    const selectedType = event.target.value;

    $$(".post-card", $("#postsFeed") || document).forEach(card => {
      card.hidden =
        selectedType !== "All" &&
        card.dataset.type !== selectedType;
    });
  });

  // Highlight the selected navigation item
  $$(".mobile-nav-item, .side-nav .nav-link").forEach(link => {
    link.addEventListener("click", () => {
      $$(".mobile-nav-item, .side-nav .nav-link").forEach(item => {
        item.classList.remove("active");
      });

      link.classList.add("active");
    });
  });

  // Expose helpers to other scripts
  window.LE4RNSP4CE = Object.assign(
    window.LE4RNSP4CE || {},
    {
      applyLanguage,
      filterPosts
    }
  );
})();
