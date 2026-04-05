
(function () {
  "use strict";

  const CFG = COGNIFLOW_CONFIG;
  const _fixLog = [];

  function _log(el, action, reason) {
    _fixLog.push({ el, action, reason, timestamp: Date.now() });
  }

  // TIER 1 FIXES
  function applyTier1Fixes(scanResult, profiles) {
    const fixed = { count: 0, types: new Set() };
    const isADHD = profiles.includes("adhd");
    const isAutism = profiles.includes("autism");
    const isDyslexia = profiles.includes("dyslexia");

    scanResult.tier1Hits.forEach(({ el, flags }) => {
      if (flags.has("modal")) {
        CogniFlowDOM.safeHide(el, "modal");
        _log(el, "hide", "modal overlay detected");
        fixed.types.add("modal");
        fixed.count++;

        if (document.body.style.overflow === "hidden") {
          document.body.dataset.cogniflowOriginalOverflow = document.body.style.overflow;
          document.body.style.overflow = "";
        }
      }

      if (flags.has("autoplay-video") || flags.has("autoplay-audio")) {
        CogniFlowDOM.safeMute(el);
        _log(el, "mute", "autoplay media");
        fixed.types.add("autoplay");
        fixed.count++;
        if (isAutism && !CogniFlowDOM.isInsideMain(el)) {
          CogniFlowDOM.safeHide(el, "autoplay-autism");
          _log(el, "hide", "decorative autoplay hidden for autism profile");
        }
      }

      if (flags.has("autoplay-iframe")) {
        if (isAutism) {
          CogniFlowDOM.safeHide(el, "autoplay-iframe");
          _log(el, "hide", "autoplay iframe hidden for autism");
          fixed.types.add("autoplay");
          fixed.count++;
        }
      }

      if (flags.has("infinite-animation") || flags.has("aggressive-animation")) {
        el.style.setProperty("animation", "none", "important");
        el.style.setProperty("transition", "none", "important");
        el.dataset.cogniflowDeanimated = "true";
        _log(el, "de-animate", "infinite/aggressive animation");
        fixed.types.add("animation");
        fixed.count++;
      }

      if (flags.has("ad-element")) {
        CogniFlowDOM.safeHide(el, "ad");
        _log(el, "hide", "ad element");
        fixed.types.add("ad");
        fixed.count++;
      }

      if (flags.has("urgency-pattern") && isADHD) {
        CogniFlowDOM.safeHide(el, "urgency");
        _log(el, "hide", "urgency/FOMO pattern (ADHD)");
        fixed.types.add("urgency");
        fixed.count++;
      }

      if (flags.has("cookie-banner")) {
        CogniFlowDOM.safeHide(el, "cookie");
        _log(el, "hide", "cookie/consent banner");
        fixed.types.add("cookie");
        fixed.count++;
      }

      if (flags.has("sticky-banner") || flags.has("sticky-overlay")) {
        el.style.setProperty("position", "relative", "important");
        el.dataset.cogniflowDestickied = "true";
        _log(el, "de-sticky", "sticky element normalized");
        fixed.types.add("sticky");
        fixed.count++;
      }

      if (flags.has("fixed-overlay")) {
        CogniFlowDOM.safeHide(el, "fixed-overlay");
        _log(el, "hide", "fixed overlay (z-index > threshold)");
        fixed.types.add("overlay");
        fixed.count++;
      }

      if (flags.has("bottom-popup")) {
        CogniFlowDOM.safeHide(el, "bottom-popup");
        _log(el, "hide", "bottom-fixed popup");
        fixed.types.add("popup");
        fixed.count++;

        if (document.body.style.overflow === "hidden") {
          document.body.dataset.cogniflowOriginalOverflow = document.body.style.overflow;
          document.body.style.overflow = "";
        }
      }

      if (flags.has("corner-widget")) {
        CogniFlowDOM.safeHide(el, "corner-widget");
        _log(el, "hide", "corner-positioned floating widget");
        fixed.types.add("widget");
        fixed.count++;
      }
    });

    const SIDEBAR_SELECTORS = [
      "#mw-panel", "#mw-panel-toc",
      "#vector-toc-pinned-container",
      ".vector-column-start",
      ".vector-menu-portal",
      "#mw-navigation",
      ".mw-table-of-contents-container",

      ".sidebar",
      "#sidebar",
      ".page-sidebar",
      ".site-sidebar",
      ".right-sidebar", ".left-sidebar",
      ".sidebar-container", ".sidebar_container",

      "aside",
      "[role='complementary']",

      "#secondary", ".widget-area",
      ".rail", ".right-rail", ".left-rail",  
    ].join(", ");

    const mainContent = CogniFlowDOM.getMainContent();

    document.querySelectorAll(SIDEBAR_SELECTORS).forEach(el => {
      if (el.dataset.cogniflowHidden) return;

      if (mainContent.contains(el)) {
        const rect = el.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const style = CogniFlowDOM.getComputedStyleCached(el);
        const isFloated = style.float === "right" || style.float === "left";
        const isAbsoluteOrFixed = style.position === "absolute" || style.position === "fixed";
        const isWide = rect.width > viewportWidth * 0.2; // Takes >20% of viewport width

        if (!isFloated && !isAbsoluteOrFixed && !isWide) return;
      }

      CogniFlowDOM.safeHide(el, "sidebar");
      _log(el, "hide", "sidebar hidden");
      fixed.types.add("sidebar");
      fixed.count++;
    });

    //ADHD-specific: also hide comments and related content
    if (isADHD) {
      document.querySelectorAll("#comments, .comments, #disqus_thread, .related-articles, .more-stories").forEach(el => {
        if (!el.dataset.cogniflowHidden) {
          CogniFlowDOM.safeHide(el, "comments-adhd");
          _log(el, "hide", "comments/related hidden for ADHD focus");
          fixed.types.add("comments");
          fixed.count++;
        }
      });
    }

    return { fixed: fixed.count, types: Array.from(fixed.types) };
  }

  // PROFILE CSS APPLICATION
  function applyProfileCSS(profiles) {
    const html = document.documentElement;
    html.classList.add("cogniflow-active");

    profiles.forEach(profile => {
      const profileConfig = CFG.PROFILES[profile];
      if (profileConfig) {
        html.classList.add(profileConfig.cssClass);
      }
    });
  }

  function removeProfileCSS() {
    const html = document.documentElement;
    html.classList.remove("cogniflow-active");
    Object.values(CFG.PROFILES).forEach(p => {
      html.classList.remove(p.cssClass);
    });
  }

  // REVERT ALL CHANGES
  function revertAll() {
    removeProfileCSS();
    CogniFlowDOM.revertAll();

    document.querySelectorAll("[data-cogniflow-deanimated]").forEach(el => {
      el.style.removeProperty("animation");
      el.style.removeProperty("transition");
      delete el.dataset.cogniflowDeanimated;
    });

    document.querySelectorAll("[data-cogniflow-destickied]").forEach(el => {
      el.style.removeProperty("position");
      delete el.dataset.cogniflowDestickied;
    });

    if (document.body.dataset.cogniflowOriginalOverflow !== undefined) {
      document.body.style.overflow = document.body.dataset.cogniflowOriginalOverflow;
      delete document.body.dataset.cogniflowOriginalOverflow;
    }

    _fixLog.length = 0;
  }

  function getFixLog() {
    return [..._fixLog];
  }

  window.CogniFlowTransformer = {
    applyTier1Fixes,
    applyProfileCSS,
    removeProfileCSS,
    revertAll,
    getFixLog
  };
})();