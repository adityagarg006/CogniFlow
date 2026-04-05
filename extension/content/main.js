
(function () {
  "use strict";

  const CFG = COGNIFLOW_CONFIG;

  let _isActive = false;
  let _activeProfiles = [];
  let _scanResult = null;
  let _backendAvailable = false;
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

  // SETTINGS LOADER
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
        resolve({
          active: true,
          profiles: ["adhd"], 
          backendUrl: CFG.BACKEND_URL
        });
      }
    });
  }

  // BACKEND HEALTH CHECK, IF THE SERVER IS ON
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

  // AI TEXT PROCESSING
  async function _processTier3(backendUrl, tier3Queue, profiles) {
    if (tier3Queue.length === 0) return;

    const batches = [];
    let currentBatch = [];

    for (const item of tier3Queue) {
      const domain = window.location.hostname;
      const category = CogniFlowLearning._detectCategory(item.text, window.location.href);

      if (!CogniFlowLearning.shouldSimplify(domain, category)) {
        continue; 
      }

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
        elementRef: item.el 
      });

      if (currentBatch.length >= CFG.MAX_BATCH_SIZE) {
        batches.push([...currentBatch]);
        currentBatch = [];
      }
    }

    if (currentBatch.length > 0) batches.push(currentBatch);

    for (const batch of batches) {
      _stats.tier3Sent += batch.length;

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
        result.items.forEach(aiResult => {
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

  // CLIENT-SIDE FALLBACK (when backend is unavailable)
  function _applyClientSideFallbacks(tier3Queue, profiles) {
    const isADHD = profiles.includes("adhd");
    const isDyslexia = profiles.includes("dyslexia");

    tier3Queue.forEach(item => {
      const el = item.el;
      if (!el) return;

      if (isADHD && item.fk && item.fk.isWallOfText) {
        el.dataset.cogniflowWallOfText = "true";
        el.classList.add("cogniflow-wall-of-text");
      }

      if (isDyslexia && item.fk && item.fk.gradeLevel > 10) {
        el.dataset.cogniflowHighComplexity = "true";
        el.classList.add("cogniflow-high-complexity");
      }
    });
  }

  // CAS RECALCULATION (AFTER FIXES)
  function _recalculateCAS() {
    const afterScan = CogniFlowScorer.scanPage(_activeProfiles);
    _stats.casAfter = afterScan.overallCAS;
    return afterScan.overallCAS;
  }

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
      return true; 
    });
  }

  // ACTIVATION/DEACTIVATION
  async function _activate(backendUrl) {
    if (_isActive && _activeProfiles.length > 0) {
      CogniFlowTransformer.revertAll();
    }

    _isActive = true;
    _stats.pageLoadTime = Date.now();

    CogniFlowSensing.start();

    await _runScanCycle(_activeProfiles, backendUrl);
  }

  function _deactivate() {
    _isActive = false;
    CogniFlowSensing.stop();
    CogniFlowLearning.processDisclosureInteractions();
    CogniFlowLearning.recordPageLeaveAcceptances();
    CogniFlowTransformer.revertAll();
    if (typeof CogniFlowClientTransforms !== "undefined") {
      CogniFlowClientTransforms.revertAll();
    }
  }

  async function _runScanCycle(profiles, backendUrl) {
    const profile = profiles[0] || "default";

    _scanResult = CogniFlowScorer.scanPage(profiles);
    _stats.casBefore = _scanResult.overallCAS;

    const fixResult = CogniFlowTransformer.applyTier1Fixes(_scanResult, profiles);
    _stats.tier1Fixed = fixResult.fixed;
    _stats.tier1Types = fixResult.types;

    CogniFlowTransformer.applyProfileCSS(profiles);

    if (_scanResult.tier3Queue.length > 0 && typeof CogniFlowClientTransforms !== "undefined") {
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

      const MAX_AUTO_SIMPLIFY = CFG.MAX_AUTO_SIMPLIFY || 5;

      scored.sort((a, b) => b._composite - a._composite);

      const tierB = scored.slice(0, MAX_AUTO_SIMPLIFY);  
      const tierA = scored.slice(MAX_AUTO_SIMPLIFY);      

      const clientResult = CogniFlowClientTransforms.batchTransform(
        tierA.map(item => ({ el: item.el, text: item.text, cas: item.cas })),
        profile
      );
      _stats.clientTransformed = clientResult.transformed;

      _stats.tier3Sent = tierB.length;
      _backendAvailable = await _checkBackendHealth(backendUrl);

      if (_backendAvailable && tierB.length > 0) {
        CogniFlowClientTransforms.notifyTierBStarted();

        setTimeout(async () => {
          if (!_isActive) return;
          try {
            await _processTier3(backendUrl, tierB, profiles);
          } finally {
            CogniFlowClientTransforms.notifyTierBComplete();
          }
          _recalculateCAS();
          _notifyPopup();
        }, CFG.BATCH_DELAY_MS);
      } else if (!_backendAvailable) {
        tierB.forEach(item => {
          CogniFlowClientTransforms.transformParagraph(item.el, profile, item._composite);
        });
      }

      _stats.tier1Fixed += clientResult.transformed;
      console.log(`[CogniFlow] Tier A (client): ${tierA.length} | Tier B (server, top ${MAX_AUTO_SIMPLIFY}): ${tierB.length} | Total flagged: ${scored.length}`);

    } else if (_scanResult.tier3Queue.length > 0) {
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

  // NOTIFY POPUP ABOUT THE CHANGES
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

  function _onPageUnload() {
    if (_isActive) {
      CogniFlowLearning.processDisclosureInteractions();
      CogniFlowLearning.recordPageLeaveAcceptances();
    }
  }

  // PERIODIC LEARNING PROCESSING
  function _startLearningTimer() {
    setInterval(() => {
      if (_isActive) {
        CogniFlowLearning.processDisclosureInteractions();
      }
    }, 30000); 
  }

  // MUTATION OBSERVER FOR DYNAMIC CONTENT
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

  async function init() {
    if (window.location.protocol === "chrome-extension:" ||
        window.location.protocol === "chrome:" ||
        window.location.protocol === "about:" ||
        document.contentType === "application/pdf") {
      return;
    }

    // Load settings
    const settings = await _loadSettings();

    if (!settings.active || settings.profiles.length === 0) {
      _setupMessageHandler();
      return;
    }

    _activeProfiles = settings.profiles;

    await CogniFlowLearning.init();

    _setupMessageHandler();

    window.addEventListener("beforeunload", _onPageUnload);
    window.addEventListener("pagehide", _onPageUnload);

    await _activate(settings.backendUrl);

    _startMutationObserver(settings.backendUrl);
    _startLearningTimer();

    console.log(`[CogniFlow] Active with profiles: ${_activeProfiles.join(", ")} | CAS: ${_stats.casBefore} → ${_stats.casAfter}`);
  }

  if (document.readyState === "complete") {
    setTimeout(init, 100);
  } else {
    window.addEventListener("load", () => setTimeout(init, 100));
  }

})();