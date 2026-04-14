/**
 * CogniFlow Main Orchestrator
 * ============================
 * PURPOSE: Coordinates all layers in the correct sequence:
 *   1. Load user settings & learning data
 *   2. Start sensing layer (passive observation)
 *   3. Run Tier 1+2 scan (immediate DOM fixes)
 *   4. Apply profile CSS
 *   5. Extract text, filter by FK threshold, batch to backend
 *   6. Apply AI results via Progressive Disclosure
 *   7. Compute before/after CAS
 *   8. Periodically process learning interactions
 *
 * LIFECYCLE:
 *   Page Load → init() → scan → tier1 fixes → [delay] → backend batch → disclosure
 *   Page Unload → record acceptances → save learning data
 *
 * COMMUNICATION:
 *   - With popup: via chrome.runtime.onMessage
 *   - With backend: via fetch() REST calls
 *   - With service worker: for settings sync
 */

(function () {
  "use strict";

  const CFG = COGNIFLOW_CONFIG;

  // ─── State ──────────────────────────────────────────────────────
  let _isActive = false;
  let _activeProfiles = [];
  let _scanResult = null;
  let _backendAvailable = false;
  let _initialCAS = null; // Set ONCE on first scan, never overwritten
  let _stats = {
    tier1Fixed: 0,
    tier1Types: [],
    tier3Sent: 0,
    tier3Returned: 0,
    disclosuresCreated: 0,
    casBefore: 0,
    casAfter: 0,
    pageLoadTime: Date.now()
  };

  // ─── Settings Loader ────────────────────────────────────────────
  async function _loadSettings() {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["cogniflow_active", "cogniflow_profiles", "cogniflow_backend_url"], (result) => {
          resolve({
            active: result.cogniflow_active !== false, // Default: active
            profiles: result.cogniflow_profiles || [],
            backendUrl: result.cogniflow_backend_url || CFG.BACKEND_URL
          });
        });
      } else {
        // Fallback for testing outside extension context
        resolve({
          active: true,
          profiles: ["adhd"], // Default for testing
          backendUrl: CFG.BACKEND_URL
        });
      }
    });
  }

  // ─── Backend Communication ──────────────────────────────────────
  async function _checkBackendHealth(backendUrl) {
    try {
      const response = await fetch(`${backendUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async function _sendToBackend(backendUrl, payload) {
    try {
      const response = await fetch(`${backendUrl}/api/v1/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(CFG.API_TIMEOUT_MS)
      });

      if (!response.ok) {
        console.warn(`[CogniFlow] Backend returned ${response.status}`);
        return null;
      }

      return await response.json();
    } catch (e) {
      console.warn("[CogniFlow] Backend request failed:", e.message);
      return null;
    }
  }

  // ─── Tier 3: AI Text Processing Pipeline ───────────────────────
  async function _processTier3(backendUrl, tier3Queue, profiles) {
    if (tier3Queue.length === 0) return;

    // ── Step 1: Filter by FK threshold (client-side) ──
    // Only send sentences that are genuinely complex
    const batches = [];
    let currentBatch = [];

    for (const item of tier3Queue) {
      // Check learning layer: should we even simplify this domain/category?
      const domain = window.location.hostname;
      const category = CogniFlowLearning._detectCategory(item.text, window.location.href);

      if (!CogniFlowLearning.shouldSimplify(domain, category)) {
        continue; // Learning says skip this category
      }

      // Extract only complex sentences (key optimization)
      const profile = profiles[0] || "default";
      const sentenceData = CogniFlowFK.getComplexSentences(item.text, profile);

      if (sentenceData.complexSentences.length === 0) continue;

      currentBatch.push({
        domPath: item.domPath,
        fullText: item.text,
        complexSentences: sentenceData.complexSentences,
        allSentences: sentenceData.allSentences,
        totalSentences: sentenceData.totalSentences,
        wordCount: item.wordCount,
        gradeLevel: item.fk.gradeLevel,
        elementRef: item.el // Keep reference for DOM updates
      });

      if (currentBatch.length >= CFG.MAX_BATCH_SIZE) {
        batches.push([...currentBatch]);
        currentBatch = [];
      }
    }

    if (currentBatch.length > 0) batches.push(currentBatch);

    // ── Step 2: Send batches to backend ──
    for (const batch of batches) {
      _stats.tier3Sent += batch.length;

      // Prepare payload (strip DOM references)
      const payload = {
        items: batch.map(item => ({
          domPath: item.domPath,
          fullText: item.fullText,
          complexSentences: item.complexSentences,
          allSentences: item.allSentences,
          totalSentences: item.totalSentences,
          wordCount: item.wordCount,
          gradeLevel: item.gradeLevel
        })),
        profiles: profiles,
        pageUrl: window.location.href,
        domain: window.location.hostname
      };

      const result = await _sendToBackend(backendUrl, payload);

      if (result && result.items) {
        _stats.tier3Returned += result.items.length;

        // ── Step 3: Apply results via Progressive Disclosure ──
        result.items.forEach(aiResult => {
          // Find the corresponding DOM element
          const batchItem = batch.find(b => b.domPath === aiResult.domPath);
          if (batchItem && batchItem.elementRef) {
            const wrapper = CogniFlowDisclosure.wrapWithAIResult(
              batchItem.elementRef,
              aiResult,
              profiles
            );
            if (wrapper) _stats.disclosuresCreated++;
          }
        });
      }
    }
  }

  // ─── Client-Side Fallback (when backend is unavailable) ─────────
  function _applyClientSideFallbacks(tier3Queue, profiles) {
    const isADHD = profiles.includes("adhd");
    const isDyslexia = profiles.includes("dyslexia");

    tier3Queue.forEach(item => {
      const el = item.el;
      if (!el) return;

      // For ADHD: if it's a wall of text, add a visual break indicator
      if (isADHD && item.fk && item.fk.isWallOfText) {
        el.dataset.cogniflowWallOfText = "true";
        el.classList.add("cogniflow-wall-of-text");
      }

      // For Dyslexia: mark high-complexity paragraphs for CSS treatment
      if (isDyslexia && item.fk && item.fk.gradeLevel > 10) {
        el.dataset.cogniflowHighComplexity = "true";
        el.classList.add("cogniflow-high-complexity");
      }
    });
  }

  // ─── CAS Recalculation After Fixes ──────────────────────────────
  function _recalculateCAS() {
    // Re-scan to get "after" score
    const afterScan = CogniFlowScorer.scanPage(_activeProfiles);
    _stats.casAfter = afterScan.overallCAS;
    return afterScan.overallCAS;
  }

  // ─── Message Handler (popup communication) ──────────────────────
  function _setupMessageHandler() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case "GET_STATUS":
          sendResponse({
            active: _isActive,
            profiles: _activeProfiles,
            stats: _stats,
            sensing: CogniFlowSensing.isWarmedUp() ? CogniFlowSensing.getProfile() : null,
            cas: CogniFlowScorer.getPageCAS()
          });
          break;

        case "SET_PROFILES":
          _activeProfiles = message.profiles || [];
          if (_activeProfiles.length > 0) {
            _activate(message.backendUrl || CFG.BACKEND_URL);
          } else {
            _deactivate();
          }
          sendResponse({ ok: true });
          break;

        case "TOGGLE_ACTIVE":
          if (_isActive) {
            _deactivate();
          } else {
            _activate(message.backendUrl || CFG.BACKEND_URL);
          }
          sendResponse({ active: _isActive });
          break;

        case "REVERT_ALL":
          _deactivate();
          sendResponse({ ok: true });
          break;

        case "GET_LEARNING_DATA":
          sendResponse({ data: CogniFlowLearning.getPreferences() });
          break;

        case "RESET_LEARNING":
          CogniFlowLearning.resetAll();
          sendResponse({ ok: true });
          break;

        case "RESCAN":
          if (_isActive) {
            _runScanCycle(_activeProfiles, message.backendUrl || CFG.BACKEND_URL);
          }
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ error: "Unknown message type" });
      }
      return true; // Keep channel open for async responses
    });
  }

  // ─── Activation / Deactivation ──────────────────────────────────
  async function _activate(backendUrl) {
    if (_isActive && _activeProfiles.length > 0) {
      // Already active with different profiles — do a FULL cleanup before re-scanning.
      // Without this, disclosure wrappers and client transforms from the previous
      // profile remain in the DOM, causing double-wrapping and broken layouts.
      _fullCleanup();
    }

    _isActive = true;
    _stats.pageLoadTime = Date.now();

    // Start sensing
    CogniFlowSensing.start();

    // Run scan cycle
    await _runScanCycle(_activeProfiles, backendUrl);
  }

  /**
   * Full cleanup of ALL CogniFlow modifications.
   * Used on profile switch and deactivation.
   */
  function _fullCleanup() {
    // 1. Revert Tier 1 visual fixes (hidden elements, muted media)
    CogniFlowTransformer.revertAll();

    // 2. Revert Tier A client transforms (tooltips, sentence splits, buttons)
    if (typeof CogniFlowClientTransforms !== "undefined") {
      CogniFlowClientTransforms.revertAll();
    }

    // 3. Revert disclosure wrappers: restore hidden original elements
    //    Disclosure wraps by: inserting wrapper BEFORE el, hiding el with display:none.
    //    So we need to: remove wrapper, restore el's display.
    document.querySelectorAll(".cogniflow-disclosure-wrapper").forEach(wrapper => {
      wrapper.remove();
    });
    document.querySelectorAll("[data-cogniflow-disclosed]").forEach(el => {
      el.style.display = "";
      delete el.dataset.cogniflowDisclosed;
      delete el.dataset.cogniflowOriginalElement;
    });

    // 4. Remove any remaining CogniFlow-injected elements
    document.querySelectorAll("[data-cogniflow-injected]").forEach(el => {
      el.remove();
    });

    // 5. Clear client transform markers so elements can be re-processed
    document.querySelectorAll("[data-cogniflow-client-transformed]").forEach(el => {
      delete el.dataset.cogniflowClientTransformed;
    });
  }

  function _deactivate() {
    _isActive = false;
    CogniFlowSensing.stop();
    CogniFlowLearning.processDisclosureInteractions();
    CogniFlowLearning.recordPageLeaveAcceptances();
    _fullCleanup();
  }

  // ─── Main Scan Cycle (THREE-TIER INTERVENTION PYRAMID) ────────
  async function _runScanCycle(profiles, backendUrl) {
    const profile = profiles[0] || "default";

    // Phase 1: Tier 1+2 scan (instant, <200ms)
    _scanResult = CogniFlowScorer.scanPage(profiles);

    // Store the original CAS only ONCE — on the very first scan of the page.
    // On profile switch, _runScanCycle runs again on the ALREADY-MODIFIED page,
    // which would give a falsely improved "before" score. _initialCAS prevents that.
    if (_initialCAS === null) {
      _initialCAS = _scanResult.overallCAS;
    }
    _stats.casBefore = _initialCAS;

    // Phase 2: Apply immediate visual fixes (modals, autoplay, ads)
    const fixResult = CogniFlowTransformer.applyTier1Fixes(_scanResult, profiles);
    _stats.tier1Fixed = fixResult.fixed;
    _stats.tier1Types = fixResult.types;

    // Phase 3: Apply profile CSS
    CogniFlowTransformer.applyProfileCSS(profiles);

    // Phase 4: THREE-TIER TEXT INTERVENTION
    // ──────────────────────────────────────
    // Instead of sending everything to the server, we split:
    //   Tier A: Client-side transforms (tooltips, splitting) — 70% of paragraphs
    //   Tier B: Auto-sent to server (only the HARDEST paragraphs) — ~20%
    //   Tier C: User-initiated "Simplify this" button — on all Tier A paragraphs

    if (_scanResult.tier3Queue.length > 0 && typeof CogniFlowClientTransforms !== "undefined") {
      // ── Score every candidate and attach composite ──
      const scored = [];
      for (const item of _scanResult.tier3Queue) {
        const text = item.text || (item.el && item.el.textContent) || "";
        const words = text.split(/\s+/).length;

        let composite = 0;
        if (typeof CogniFlowScorer_v2 !== "undefined") {
          composite = CogniFlowScorer_v2.scoreComplexity(text).composite;
        } else {
          composite = item.fk ? Math.min(1, (item.fk.gradeLevel - 5) / 15) : 0.5;
        }

        scored.push({ ...item, _composite: composite, _words: words });
      }

      // ── Rank by composite score (hardest first) and apply hard cap ──
      // MAX_AUTO_SIMPLIFY: only the N most complex paragraphs get auto-sent.
      // Everything else gets client-side transforms + a "Simplify this" button.
      // This guarantees a bounded API cost per page load regardless of page size.
      const MAX_AUTO_SIMPLIFY = CFG.MAX_AUTO_SIMPLIFY || 5;

      scored.sort((a, b) => b._composite - a._composite);

      const tierB = scored.slice(0, MAX_AUTO_SIMPLIFY);  // Top N hardest → server
      const tierA = scored.slice(MAX_AUTO_SIMPLIFY);       // Rest → client transforms

      // Apply Tier A: client-side transforms (immediate, zero API calls)
      const clientResult = CogniFlowClientTransforms.batchTransform(
        tierA.map(item => ({ el: item.el, text: item.text, cas: item.cas })),
        profile
      );
      _stats.clientTransformed = clientResult.transformed;

      // Apply Tier B: auto-send ONLY the hardest paragraphs to server
      _stats.tier3Sent = tierB.length;
      _backendAvailable = await _checkBackendHealth(backendUrl);

      if (_backendAvailable && tierB.length > 0) {
        // Lock all "Simplify this" buttons while Tier B is processing
        CogniFlowClientTransforms.notifyTierBStarted();

        setTimeout(async () => {
          if (!_isActive) return;
          try {
            await _processTier3(backendUrl, tierB, profiles);
          } finally {
            // Unlock buttons regardless of success/failure
            CogniFlowClientTransforms.notifyTierBComplete();
          }
          _recalculateCAS();
          _notifyPopup();
        }, CFG.BATCH_DELAY_MS);
      } else if (!_backendAvailable) {
        // Backend offline — client transforms + buttons for everything
        tierB.forEach(item => {
          CogniFlowClientTransforms.transformParagraph(item.el, profile, item._composite);
        });
      }

      _stats.tier1Fixed += clientResult.transformed;
      console.log(`[CogniFlow] Tier A (client): ${tierA.length} | Tier B (server, top ${MAX_AUTO_SIMPLIFY}): ${tierB.length} | Total flagged: ${scored.length}`);

    } else if (_scanResult.tier3Queue.length > 0) {
      // CogniFlowClientTransforms not loaded — old fallback behavior
      _backendAvailable = await _checkBackendHealth(backendUrl);
      if (_backendAvailable) {
        setTimeout(async () => {
          if (!_isActive) return;
          await _processTier3(backendUrl, _scanResult.tier3Queue, profiles);
          _recalculateCAS();
          _notifyPopup();
        }, CFG.BATCH_DELAY_MS);
      } else {
        _applyClientSideFallbacks(_scanResult.tier3Queue, profiles);
      }
    }

    // Recalculate CAS after fixes
    _stats.casAfter = _recalculateCAS();
    _notifyPopup();
  }

  // ─── Notify Popup of State Changes ──────────────────────────────
  function _notifyPopup() {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: "STATUS_UPDATE",
          data: {
            active: _isActive,
            profiles: _activeProfiles,
            stats: _stats,
            backendAvailable: _backendAvailable
          }
        }).catch(() => {}); // Popup might not be open
      } catch (e) { /* ignore */ }
    }
  }

  // ─── Page Unload Handler ────────────────────────────────────────
  function _onPageUnload() {
    if (_isActive) {
      CogniFlowLearning.processDisclosureInteractions();
      CogniFlowLearning.recordPageLeaveAcceptances();
    }
  }

  // ─── Periodic Learning Processing ───────────────────────────────
  function _startLearningTimer() {
    setInterval(() => {
      if (_isActive) {
        CogniFlowLearning.processDisclosureInteractions();
      }
    }, 30000); // Every 30 seconds
  }

  // ─── MutationObserver for Dynamic Content ───────────────────────
  function _startMutationObserver(backendUrl) {
    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
      if (!_isActive) return;

      // Check if new content was added (not by us)
      let hasNewContent = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && !node.dataset.cogniflowInjected) {
            hasNewContent = true;
            break;
          }
        }
        if (hasNewContent) break;
      }

      if (hasNewContent) {
        // Debounce re-scan for dynamic content (SPAs, infinite scroll)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (_isActive) _runScanCycle(_activeProfiles, backendUrl);
        }, 1500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ─── INIT ───────────────────────────────────────────────────────
  async function init() {
    // Don't run on extension pages, empty pages, or PDFs
    if (window.location.protocol === "chrome-extension:" ||
        window.location.protocol === "chrome:" ||
        window.location.protocol === "about:" ||
        document.contentType === "application/pdf") {
      return;
    }

    // Load settings
    const settings = await _loadSettings();

    if (!settings.active || settings.profiles.length === 0) {
      // Extension is off or no profiles — just set up message handler
      _setupMessageHandler();
      return;
    }

    _activeProfiles = settings.profiles;

    // Initialize learning layer
    await CogniFlowLearning.init();

    // Set up communication
    _setupMessageHandler();

    // Page unload handler
    window.addEventListener("beforeunload", _onPageUnload);
    window.addEventListener("pagehide", _onPageUnload);

    // Activate
    await _activate(settings.backendUrl);

    // Start mutation observer for dynamic content
    _startMutationObserver(settings.backendUrl);

    // Start periodic learning processing
    _startLearningTimer();

    console.log(`[CogniFlow] Active with profiles: ${_activeProfiles.join(", ")} | CAS: ${_stats.casBefore} → ${_stats.casAfter}`);
  }

  // ─── Run ────────────────────────────────────────────────────────
  // Small delay to ensure DOM is fully ready
  if (document.readyState === "complete") {
    setTimeout(init, 100);
  } else {
    window.addEventListener("load", () => setTimeout(init, 100));
  }

})();