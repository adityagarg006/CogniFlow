(function () {
  "use strict";

  
  const _styleCache = new WeakMap();
  let _mainContentCache = null;
  let _mainContentCacheTime = 0;
  const MAIN_CACHE_TTL = 5000; // 5 seconds

  function getComputedStyleCached(el) {
    if (_styleCache.has(el)) return _styleCache.get(el);
    const style = window.getComputedStyle(el);
    _styleCache.set(el, style);
    return style;
  }

  function clearStyleCache() {
    _mainContentCache = null;
    _mainContentCacheTime = 0;
  }

  // DEFINING SELECTORS FOR ARTICLE BODY
  const ARTICLE_BODY_SELECTORS = [
    ".mw-parser-output",
    "#mw-content-text .mw-parser-output",
    
    "article .post-content",
    "article .entry-content",
    ".article-body",
    ".post-body",
    
    ".story-body", ".article__body", ".article-text",
    "[data-testid='article-body']",
    ".caas-body",                  
    ".article__content",           
    
    ".markdown-body",                
    ".documentation-content",
    ".prose",                      
    
    ".entry-content", ".post-content", ".page-content",
    "#article-body", "#story-body",
    "[itemprop='articleBody']",
    
    "article",
    "main article",
    "main",
    "[role='main'] article",
  ];

  function getMainContent() {
    const now = Date.now();
    if (_mainContentCache && (now - _mainContentCacheTime) < MAIN_CACHE_TTL) {
      return _mainContentCache;
    }

    let main = null;

    for (const selector of ARTICLE_BODY_SELECTORS) {
      try {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim().length > 200) {
          main = el;
          break;
        }
      } catch (e) { }
    }

    if (!main) {
      main = document.querySelector('[role="main"]')
        || document.querySelector("#content, #main-content, .main-content");
    }

    if (!main) {
      let maxText = 0;
      const candidates = document.querySelectorAll("div, section");
      candidates.forEach(el => {
        const text = el.textContent || "";
        if (text.length > maxText && el.children.length > 1) {
          maxText = text.length;
          main = el;
        }
      });
    }

    _mainContentCache = main || document.body;
    _mainContentCacheTime = now;
    return _mainContentCache;
  }

  // VISIBILITY CHECK
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const style = getComputedStyleCached(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // CONTAINMENT CHECK
  function isInsideMain(el) {
    const main = getMainContent();
    return main.contains(el);
  }

  // VIEWPORT METRICS
  function getViewportMetrics() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return { width: w, height: h, area: w * h };
  }

  function getElementArea(el) {
    const rect = el.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function getElementCoverageRatio(el) {
    const viewport = getViewportMetrics();
    const elArea = getElementArea(el);
    return viewport.area > 0 ? elArea / viewport.area : 0;
  }

  // DOM Path Generator
  function getDomPath(el) {
    const parts = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        parts.unshift(selector);
        break; 
      }
      if (current.className && typeof current.className === "string") {
        const classes = current.className.trim().split(/\s+/).filter(c => !c.startsWith("cogniflow"));
        if (classes.length > 0) {
          selector += `.${classes.slice(0, 2).join(".")}`;
        }
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  // HIDING ELEMENTS (SAFELY WITHOUT REMOVAL)
  function safeHide(el, reason) {
    if (el.dataset.cogniflowHidden) return;
    el.dataset.cogniflowHidden = "true";
    el.dataset.cogniflowReason = reason || "clutter";
    el.dataset.cogniflowOriginalDisplay = getComputedStyleCached(el).display;
    el.style.setProperty("display", "none", "important");
  }

  function safeShow(el) {
    if (!el.dataset.cogniflowHidden) return;
    const original = el.dataset.cogniflowOriginalDisplay || "";
    el.style.display = original;
    delete el.dataset.cogniflowHidden;
    delete el.dataset.cogniflowReason;
    delete el.dataset.cogniflowOriginalDisplay;
  }

  function safeMute(el) {
    if (el.tagName === "VIDEO" || el.tagName === "AUDIO") {
      el.dataset.cogniflowMuted = "true";
      el.dataset.cogniflowOriginalAutoplay = el.autoplay;
      el.dataset.cogniflowOriginalMuted = el.muted;
      el.autoplay = false;
      el.muted = true;
      el.pause();
    }
  }

  function safeUnmute(el) {
    if (el.dataset.cogniflowMuted) {
      el.autoplay = el.dataset.cogniflowOriginalAutoplay === "true";
      el.muted = el.dataset.cogniflowOriginalMuted === "true";
      delete el.dataset.cogniflowMuted;
      delete el.dataset.cogniflowOriginalAutoplay;
      delete el.dataset.cogniflowOriginalMuted;
    }
  }

  // OPTIMIZED TREEWALKER TRAVERSAL
  function walkElements(callback) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: function (node) {
          if (node.dataset && node.dataset.cogniflowInjected) return NodeFilter.FILTER_REJECT;
          if (node.tagName === "SCRIPT" || node.tagName === "STYLE" || node.tagName === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const result = callback(node, getComputedStyleCached(node));
      if (result === false) break;
    }
  }

  const NON_CONTENT_SELECTORS = [
    ".infobox", ".infobox-above", ".infobox-data",
    ".navbox", ".navbox-inner", ".navbox-title", ".navbox-group",
    ".sidebar",                 
    ".shortcutbox", ".module-shortcutboxplain", ".module-shortcutlist",
    ".reflist", ".references", ".refbegin",
    ".mw-editsection",
    ".hatnote", ".dablink",
    ".metadata", ".ambox", ".tmbox", ".cmbox", ".ombox", ".fmbox",
    ".portal", ".sistersitebox",
    ".authority-control", ".catlinks",
    ".mw-jump-link", "#toc", ".toc",
    ".mw-indicators",
    ".noprint",
    ".mw-empty-elt",
    ".mbox-small",
    ".vertical-navbox",
    ".nowraplinks",

    "[role='navigation']",
    "[role='complementary']",
    "[role='banner']",
    "nav",

    ".table-of-contents",
    ".breadcrumb", ".breadcrumbs",
    ".social-share", ".share-buttons",
    ".comments", "#comments",
    ".cookie-banner", ".consent-banner",
    ".newsletter-signup",
    ".popup-overlay",

  ].join(", ");

  
  function _isNonContent(el) {
    try {
      if (el.closest(NON_CONTENT_SELECTORS) !== null) return true;

      const mainContent = getMainContent();
      const asideOrFooter = el.closest("aside, footer, header");
      if (asideOrFooter && !mainContent.contains(asideOrFooter)) {
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  function _containsInlineStyles(el) {
    return el.querySelector("style") !== null;
  }

// FETCHING NODES WITH TEXT CONTENT
  function extractTextNodes(container) {
    const nodes = [];
    const target = container || getMainContent();
    const candidates = target.querySelectorAll(
      "p, li, blockquote, h1, h2, h3, h4, h5, h6"
    );

    candidates.forEach(el => {
      if (el.dataset.cogniflowInjected || el.dataset.cogniflowClientTransformed) return;

      if (_isNonContent(el)) return;

      if (el.classList.contains("noprint") || el.classList.contains("mw-editsection")) return;
      if (_containsInlineStyles(el)) return;
      if (el.tagName === "LI") {
        const parentList = el.closest("ul, ol");
        if (parentList && _isNonContent(parentList)) return;
        if (parentList && parentList.classList.contains("references")) return;
      }

      const text = _cleanTextContent(el);
      if (text.length < COGNIFLOW_CONFIG.TIER2.MIN_PARAGRAPH_LENGTH) return;

      const words = text.split(/\s+/).length;
      if (words < 8) return;

      nodes.push({
        el: el,
        text: text,
        wordCount: words,
        domPath: getDomPath(el),
        tagName: el.tagName.toLowerCase(),
        isHeading: /^h[1-6]$/i.test(el.tagName)
      });
    });

    return nodes;
  }

  function _cleanTextContent(el) {
    if (!el.querySelector("style, script, noscript, [aria-hidden='true']")) {
      return (el.textContent || "").trim();
    }

    let text = "";
    const walker = document.createTreeWalker(
      el,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: function (node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (tag === "STYLE" || tag === "SCRIPT" || tag === "NOSCRIPT") {
              return NodeFilter.FILTER_REJECT; 
            }
            if (node.getAttribute("aria-hidden") === "true") {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_SKIP; 
          }
          return NodeFilter.FILTER_ACCEPT; 
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent.trim();
        if (t) text += (text ? " " : "") + t;
      }
    }

    return text.trim();
  }

  // REVERT CHANGES BUTTON
  function revertAll() {
    document.querySelectorAll("[data-cogniflow-hidden]").forEach(safeShow);
    document.querySelectorAll("[data-cogniflow-muted]").forEach(safeUnmute);
    document.querySelectorAll(".cogniflow-disclosure-wrapper").forEach(wrapper => {
      const original = wrapper.querySelector(".cogniflow-original-content");
      if (original) {
        wrapper.replaceWith(...original.childNodes);
      }
    });
    document.documentElement.classList.remove("cogniflow-adhd", "cogniflow-autism", "cogniflow-dyslexia", "cogniflow-active");
  }

  window.CogniFlowDOM = {
    getMainContent,
    getComputedStyleCached,
    clearStyleCache,
    isVisible,
    isInsideMain,
    getViewportMetrics,
    getElementArea,
    getElementCoverageRatio,
    getDomPath,
    safeHide,
    safeShow,
    safeMute,
    safeUnmute,
    walkElements,
    extractTextNodes,
    revertAll,
    _cleanTextContent,
    _isNonContent
  };
})();