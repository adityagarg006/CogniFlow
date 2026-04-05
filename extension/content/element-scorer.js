(function () {
  "use strict";

  const CFG = COGNIFLOW_CONFIG;

  let _lastScanResult = null;

  // TIER 1 : Deterministic Detection
  function _detectTier1(el, style) {
    const flags = new Set();

    
    const position = style.position;
    const zIndex = parseInt(style.zIndex) || 0;

    if (position === "fixed" || position === "sticky") {
      const coverage = CogniFlowDOM.getElementCoverageRatio(el);
      const rect = el.getBoundingClientRect();
      const isNav = el.tagName === "NAV" || el.getAttribute("role") === "navigation";
      const isInsideMain = CogniFlowDOM.isInsideMain(el);

      if (coverage > CFG.TIER1.VIEWPORT_COVER_THRESHOLD && zIndex > CFG.TIER1.ZINDEX_THRESHOLD) {
        flags.add("modal");
      }
     else if (position === "fixed" && zIndex > CFG.TIER1.ZINDEX_THRESHOLD && !isNav) {
        const isTopBar = rect.top <= 5 && rect.width > window.innerWidth * 0.8 && rect.height < 80;
        if (!isTopBar) {
          flags.add("fixed-overlay");
        }
      }
      else if (position === "fixed") {
        const bottomValue = parseInt(style.bottom);
        const isAtBottom = (bottomValue >= 0 && bottomValue <= 20)
          || (rect.bottom >= window.innerHeight - 20);
        const isAtCorner = (rect.right <= 200 || rect.left >= window.innerWidth - 200)
          && rect.height < 400;

        if (isAtBottom && !isNav) {
          flags.add("bottom-popup");
        }
        if (isAtCorner && zIndex > 50 && !isNav) {
          flags.add("corner-widget");
        }
      }
      else if (position === "sticky" && !isInsideMain) {
        flags.add("sticky-banner");
      }
      else if (position === "sticky" && zIndex > CFG.TIER1.ZINDEX_THRESHOLD) {
        flags.add("sticky-overlay");
      }
    }

    if (el.tagName === "VIDEO" && (el.autoplay || el.hasAttribute("autoplay"))) {
      flags.add("autoplay-video");
    }
    if (el.tagName === "AUDIO" && (el.autoplay || el.hasAttribute("autoplay"))) {
      flags.add("autoplay-audio");
    }
    if (el.tagName === "IFRAME") {
      const src = el.src || "";
      if (src.includes("autoplay=1") || src.includes("autoplay=true") || src.includes("auto_play=1")) {
        flags.add("autoplay-iframe");
      }
    }

    if (style.animationIterationCount === "infinite" || style.animationIterationCount === "1e+308") {
      const duration = parseFloat(style.animationDuration) || 1;
      if (duration * 1000 < CFG.TIER2.ANIMATION_SPEED_THRESHOLD) {
        flags.add("aggressive-animation");
      } else {
        flags.add("infinite-animation");
      }
    }

    const elStr = (el.className || "") + " " + (el.id || "");
    for (const selector of CFG.TIER1.AD_SELECTORS) {
      try {
        if (el.matches(selector)) {
          flags.add("ad-element");
          break;
        }
      } catch (e) { }
    }

    const text = (el.textContent || "").trim();
    if (text.length < 200) { 
      for (const pattern of CFG.TIER1.URGENCY_PATTERNS) {
        if (pattern.test(text)) {
          flags.add("urgency-pattern");
          break;
        }
      }
    }

    for (const selector of CFG.TIER1.COOKIE_SELECTORS) {
      try {
        if (el.matches(selector)) {
          flags.add("cookie-banner");
          break;
        }
      } catch (e) { }
    }

    return flags;
  }

  // TIER 2: Heuristic Scoring
  function _computeTextComplexity(el) {
    const text = (el.textContent || "").trim();
    if (text.length < CFG.TIER2.MIN_PARAGRAPH_LENGTH) return 100; 

    const fk = CogniFlowFK.computeFK(text);
    const score = Math.max(0, Math.min(100, 100 - (fk.gradeLevel - 5) * (100 / 11)));
    return score;
  }

  function _computeVisualDensity(el) {
    if (!CogniFlowDOM.isVisible(el)) return 100;

    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area === 0) return 100;

    const text = (el.textContent || "").trim();
    const charDensity = text.length / area;

    const style = CogniFlowDOM.getComputedStyleCached(el);
    const hasBgImage = style.backgroundImage !== "none";
    const hasTransform = style.transform !== "none";

    let score = 100;
    if (charDensity > CFG.TIER2.DENSITY_THRESHOLD) score -= 30;
    if (hasBgImage) score -= 15;
    if (hasTransform) score -= 10;

    const childCount = el.children.length;
    if (childCount > 15) score -= 20;
    else if (childCount > 8) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  function _computeContextualNoise(el) {
    const parent = el.parentElement;
    if (!parent) return 100;

    let score = 100;
    const siblings = parent.children.length;
    if (siblings > 10) score -= 25;
    else if (siblings > 5) score -= 10;

    const rect = el.getBoundingClientRect();
    const nearbyAnimated = document.querySelectorAll("[style*='animation']");
    let nearbyCount = 0;
    nearbyAnimated.forEach(anim => {
      const animRect = anim.getBoundingClientRect();
      const distance = Math.sqrt(
        Math.pow(rect.x - animRect.x, 2) + Math.pow(rect.y - animRect.y, 2)
      );
      if (distance < 300) nearbyCount++;
    });
    if (nearbyCount > 0) score -= nearbyCount * 10;

    if (!CogniFlowDOM.isInsideMain(el)) score -= 20;

    return Math.max(0, Math.min(100, score));
  }

  function _computeInteractionCost(el) {
    let score = 100;
    const style = CogniFlowDOM.getComputedStyleCached(el);
    if (style.overflow === "hidden" || style.overflow === "scroll") score -= 15;

    let depth = 0;
    let current = el;
    while (current && current !== document.body && depth < 20) {
      depth++;
      current = current.parentElement;
    }
    if (depth > 12) score -= 20;
    else if (depth > 8) score -= 10;

    if (el.scrollHeight > el.clientHeight * 1.5) score -= 15;

    return Math.max(0, Math.min(100, score));
  }

  function scoreElement(el, activeProfiles) {
    const style = CogniFlowDOM.getComputedStyleCached(el);
    const tier1Flags = _detectTier1(el, style);

    if (tier1Flags.size > 0) {
      return {
        cas: Math.max(0, 30 - tier1Flags.size * 15),
        dimensions: { textComplexity: 0, visualDensity: 0, contextualNoise: 0, interactionCost: 0 },
        flags: tier1Flags,
        needsAI: false
      };
    }

    const dimensions = {
      textComplexity: _computeTextComplexity(el),
      visualDensity: _computeVisualDensity(el),
      contextualNoise: _computeContextualNoise(el),
      interactionCost: _computeInteractionCost(el)
    };

    let weights = CFG.SCORE_WEIGHTS.default;
    if (activeProfiles && activeProfiles.length > 0) {
      weights = CFG.SCORE_WEIGHTS[activeProfiles[0]] || weights;
    }

    const cas = Math.round(
      dimensions.textComplexity * weights.textComplexity +
      dimensions.visualDensity * weights.visualDensity +
      dimensions.contextualNoise * weights.contextualNoise +
      dimensions.interactionCost * weights.interactionCost
    );

    const text = (el.textContent || "").trim();
    const hasEnoughText = text.length > CFG.TIER2.MIN_PARAGRAPH_LENGTH;
    const profile = (activeProfiles && activeProfiles[0]) || "default";

    let textIsComplex = false;
    if (hasEnoughText && typeof CogniFlowScorer_v2 !== "undefined") {
      textIsComplex = CogniFlowScorer_v2.isComplexForProfile(text, profile);
    } else if (hasEnoughText) {
      textIsComplex = dimensions.textComplexity < 50;
    }

    const needsAI = hasEnoughText && (
      textIsComplex ||                                    // Text IS complex for this profile
      (cas < CFG.CAS_INTERVENTION_THRESHOLD && dimensions.textComplexity < 60)  // OR overall CAS is bad
    );

    return {
      cas: Math.max(0, Math.min(100, cas)),
      dimensions,
      flags: tier1Flags,
      needsAI
    };
  }

  // SCANNING FULL PAGE
  function scanPage(activeProfiles) {
    const result = {
      tier1Hits: [],
      tier2Scores: [],
      tier3Queue: [],
      pageScore: {
        visual: { modals: 0, autoplay: 0, animations: 0, stickyElements: 0, ads: 0, urgency: 0, cookies: 0 },
        text: { avgGradeLevel: 0, wallsOfText: 0, totalParagraphs: 0 },
        navigation: { linkDensity: 0, contentRatio: 0 }
      },
      timestamp: Date.now()
    };

    // PHASE 1: Detect Tier 1 elements
    CogniFlowDOM.walkElements((el, style) => {
      const flags = _detectTier1(el, style);

      if (flags.has("modal")) result.pageScore.visual.modals++;
      if (flags.has("autoplay-video") || flags.has("autoplay-audio") || flags.has("autoplay-iframe")) result.pageScore.visual.autoplay++;
      if (flags.has("infinite-animation") || flags.has("aggressive-animation")) result.pageScore.visual.animations++;
      if (flags.has("sticky-banner") || flags.has("sticky-element")) result.pageScore.visual.stickyElements++;
      if (flags.has("ad-element")) result.pageScore.visual.ads++;
      if (flags.has("urgency-pattern")) result.pageScore.visual.urgency++;
      if (flags.has("cookie-banner")) result.pageScore.visual.cookies++;

      if (flags.size > 0) {
        result.tier1Hits.push({ el, flags, priority: flags.size });
      }
    });

    // PHASE 2: Score text elements in main content
    const textNodes = CogniFlowDOM.extractTextNodes();
    let totalGradeLevel = 0;
    let gradeLevelCount = 0;

    textNodes.forEach(node => {
      const score = scoreElement(node.el, activeProfiles);
      result.tier2Scores.push({ ...node, ...score });

      // FK analysis for text nodes
      const fk = CogniFlowFK.analyzeParagraph(node.text);
      if (fk.words > 10) {
        totalGradeLevel += fk.gradeLevel;
        gradeLevelCount++;
      }
      if (fk.isWallOfText) result.pageScore.text.wallsOfText++;
      result.pageScore.text.totalParagraphs++;

      if (score.needsAI) {
        result.tier3Queue.push({
          el: node.el,
          text: node.text,
          domPath: node.domPath,
          wordCount: node.wordCount,
          cas: score.cas,
          fk: fk
        });
      }
    });

    result.pageScore.text.avgGradeLevel = gradeLevelCount > 0
      ? Math.round(totalGradeLevel / gradeLevelCount * 10) / 10
      : 0;

    // PHASE 3: Navigation complexity
    const navLinks = document.querySelectorAll("nav a, [role='navigation'] a, header a");
    result.pageScore.navigation.linkDensity = navLinks.length;

    const main = CogniFlowDOM.getMainContent();
    const viewport = CogniFlowDOM.getViewportMetrics();
    const mainArea = CogniFlowDOM.getElementArea(main);
    result.pageScore.navigation.contentRatio = viewport.area > 0
      ? Math.round(mainArea / viewport.area * 100) / 100
      : 0;

    result.overallCAS = _computeOverallCAS(result.pageScore);

    result.tier1Hits.sort((a, b) => b.priority - a.priority);

    _lastScanResult = result;
    return result;
  }

  // OVERALL CAS COMPUTATION
  function _computeOverallCAS(pageScore) {
    const v = pageScore.visual;
    const t = pageScore.text;
    const n = pageScore.navigation;

    // Visual Clutter
    let visual = 40;
    visual -= Math.min(10, v.modals * 5);
    visual -= v.autoplay > 0 ? 10 : 0;
    visual -= Math.min(10, v.animations * 3);
    visual -= Math.min(10, (v.stickyElements > 1 ? 5 : 0) + (v.ads * 2) + (v.urgency * 3));

    // Text Complexity
    let text = 35;
    const gradeLevel = t.avgGradeLevel;
    text -= Math.min(15, Math.max(0, (gradeLevel - 8) * 1.5));
    text -= Math.min(10, t.wallsOfText * 3);
    text -= t.totalParagraphs > 30 ? 5 : 0;

    // Navigability
    let nav = 25;
    if (n.linkDensity > 40) nav -= 8;
    else if (n.linkDensity > 25) nav -= 4;
    nav -= Math.max(0, 10 - Math.round(n.contentRatio * 10));

    return Math.max(0, Math.min(100, Math.round(visual + text + nav)));
  }

  function getPageCAS() {
    if (!_lastScanResult) return { before: 0, after: 0, breakdown: {} };
    return {
      before: _lastScanResult.overallCAS,
      after: 0, 
      breakdown: _lastScanResult.pageScore
    };
  }

  function getLastScan() {
    return _lastScanResult;
  }

  window.CogniFlowScorer = {
    scanPage,
    scoreElement,
    getPageCAS,
    getLastScan
  };
})();