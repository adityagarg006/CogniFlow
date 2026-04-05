(function () {
  "use strict";

  const CFG = COGNIFLOW_CONFIG.LEARNING;
  let _data = {};
  let _initialized = false;

  // STORAGE ABSTRACTION
  async function _loadData() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get(CFG.STORAGE_KEY, (result) => {
            resolve(result[CFG.STORAGE_KEY] || {});
          });
        });
      } else {
        const stored = localStorage.getItem(CFG.STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
      }
    } catch (e) {
      console.warn("[CogniFlow] Learning data load failed:", e);
      return {};
    }
  }

  async function _saveData() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.set({ [CFG.STORAGE_KEY]: _data }, resolve);
        });
      } else {
        localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify(_data));
      }
    } catch (e) {
      console.warn("[CogniFlow] Learning data save failed:", e);
    }
  }

  async function init() {
    _data = await _loadData();
    _initialized = true;

    _applyDecay();
    await _saveData();
  }

  // DECAY OLDER DATA
  function _applyDecay() {
    const now = Date.now();
    const ONE_DAY = 86400000;

    for (const domain in _data) {
      for (const category in _data[domain]) {
        const entry = _data[domain][category];
        const daysSinceUpdate = (now - (entry.lastUpdated || now)) / ONE_DAY;
        if (daysSinceUpdate > 1) {
          const decayMultiplier = Math.pow(CFG.DECAY_FACTOR, daysSinceUpdate);
          entry.accepted = Math.round(entry.accepted * decayMultiplier);
          entry.reverted = Math.round(entry.reverted * decayMultiplier);
        }
      }
    }
  }

  // ENSURE DOMAIN/CATEGORY EXISTS
  function _ensureEntry(domain, category) {
    if (!_data[domain]) _data[domain] = {};
    if (!_data[domain][category]) {
      _data[domain][category] = { accepted: 0, reverted: 0, lastUpdated: Date.now() };
    }

    const domains = Object.keys(_data);
    if (domains.length > CFG.MAX_DOMAIN_ENTRIES) {
      let oldest = domains[0];
      let oldestTime = Infinity;
      domains.forEach(d => {
        const cats = Object.values(_data[d]);
        const maxTime = Math.max(...cats.map(c => c.lastUpdated || 0));
        if (maxTime < oldestTime) {
          oldestTime = maxTime;
          oldest = d;
        }
      });
      delete _data[oldest];
    }
  }

  // CATEGORY DETECTION (Hardcoded for now, will be scaled)
  function _detectCategory(text, url) {
    const combined = (text + " " + url).toLowerCase();

    if (/\b(science|research|study|journal|biology|physics|chemistry|hypothesis)\b/.test(combined)) return "science";
    if (/\b(tech|software|programming|code|developer|api|framework)\b/.test(combined)) return "technology";
    if (/\b(finance|stock|market|invest|economy|revenue|profit)\b/.test(combined)) return "finance";
    if (/\b(news|breaking|headline|report|politics|election)\b/.test(combined)) return "news";
    if (/\b(health|medical|doctor|symptom|treatment|disease)\b/.test(combined)) return "health";
    if (/\b(education|school|university|course|learn|student)\b/.test(combined)) return "education";
    if (/\b(legal|law|court|attorney|regulation|statute)\b/.test(combined)) return "legal";

    return "general";
  }

  function shouldSimplify(domain, category) {
    if (!_initialized) return true; 

    const domainData = _data[domain];
    if (!domainData || !domainData[category]) return true;

    const entry = domainData[category];
    const total = entry.accepted + entry.reverted;

    if (total < CFG.MIN_SAMPLES_FOR_LEARNING) return true;

    const revertRate = entry.reverted / total;
    return revertRate < CFG.EXPANSION_THRESHOLD;
  }

  function recordAcceptance(domain, category) {
    _ensureEntry(domain, category);
    _data[domain][category].accepted++;
    _data[domain][category].lastUpdated = Date.now();
    _saveData();
  }

  function recordRevert(domain, category) {
    _ensureEntry(domain, category);
    _data[domain][category].reverted++;
    _data[domain][category].lastUpdated = Date.now();
    _saveData();
  }

  // PROCESS DISCLOSURE INTERACTIONS
  function processDisclosureInteractions() {
    const interactions = CogniFlowDisclosure.getInteractions();
    if (interactions.length === 0) return;

    const domain = window.location.hostname;

    interactions.forEach(interaction => {
      const category = _detectCategory(document.title + " " + document.body.innerText.slice(0, 500), window.location.href);

      if (interaction.action === "expand-original") {
        recordRevert(domain, category);
      }
    });

    CogniFlowDisclosure.clearInteractions();
  }

  function recordPageLeaveAcceptances() {
    const domain = window.location.hostname;
    const category = _detectCategory(document.title, window.location.href);
    const wrappers = document.querySelectorAll(".cogniflow-disclosure-wrapper");

    wrappers.forEach(wrapper => {
      const details = wrapper.querySelector(".cogniflow-original");
      if (details && !details.open) {
        recordAcceptance(domain, category);
      }
    });
  }

  function getPreferences() {
    return JSON.parse(JSON.stringify(_data));
  }

  function resetDomain(domain) {
    delete _data[domain];
    _saveData();
  }

  function resetAll() {
    _data = {};
    _saveData();
  }

  window.CogniFlowLearning = {
    init,
    shouldSimplify,
    recordAcceptance,
    recordRevert,
    processDisclosureInteractions,
    recordPageLeaveAcceptances,
    getPreferences,
    resetDomain,
    resetAll,
    _detectCategory 
  };
})();
