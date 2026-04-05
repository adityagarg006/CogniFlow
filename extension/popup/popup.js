
(function () {
  "use strict";

  const powerBtn = document.getElementById("power-btn");
  const casBefore = document.getElementById("cas-before");
  const casAfter = document.getElementById("cas-after");
  const statFixed = document.getElementById("stat-fixed");
  const statSimplified = document.getElementById("stat-simplified");
  const statBackend = document.getElementById("stat-backend");
  const sensingData = document.getElementById("sensing-data");
  const backendUrlInput = document.getElementById("backend-url");
  const resetLearningBtn = document.getElementById("reset-learning-btn");
  const revertLink = document.getElementById("revert-link");
  const profileCheckboxes = document.querySelectorAll('input[name="profile"]');

  let isActive = false;
  let currentProfiles = [];

  async function init() {
    // Load saved settings
    const settings = await new Promise(resolve => {
      chrome.storage.local.get(
        ["cogniflow_active", "cogniflow_profiles", "cogniflow_backend_url"],
        resolve
      );
    });

    isActive = settings.cogniflow_active !== false;
    currentProfiles = settings.cogniflow_profiles || [];
    const backendUrl = settings.cogniflow_backend_url || "http://localhost:8000";

    // Update UI
    powerBtn.classList.toggle("active", isActive);
    document.body.classList.toggle("inactive", !isActive);
    backendUrlInput.value = backendUrl;

    // Set profile checkboxes
    profileCheckboxes.forEach(cb => {
      cb.checked = currentProfiles.includes(cb.value);
      const card = cb.closest(".profile-card");
      if (cb.value === "adhd") card.style.setProperty("--accent", "#7F77DD");
      if (cb.value === "autism") card.style.setProperty("--accent", "#1D9E75");
      if (cb.value === "dyslexia") card.style.setProperty("--accent", "#D85A30");
    });

    // Get current tab status
    requestStatus();

    setInterval(requestStatus, 2000);
  }

  // ─── Request Status from Content Script ─────────────────────────
  function requestStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: "GET_STATUS" }, (response) => {
        if (chrome.runtime.lastError || !response) return;
        updateUI(response);
      });
    });
  }

  // ─── Update UI with Status Data ─────────────────────────────────
  function updateUI(data) {
    // CAS scores
    if (data.stats) {
      const before = data.stats.casBefore;
      const after = data.stats.casAfter;

      casBefore.textContent = before > 0 ? before : "--";
      casAfter.textContent = after > 0 ? after : "--";

      casBefore.className = "cas-value" + (before === 0 ? " neutral" : "");
      casAfter.className = "cas-value" + (after === 0 ? " neutral" : "");

      // Stats
      statFixed.textContent = data.stats.tier1Fixed || 0;
      statSimplified.textContent = data.stats.disclosuresCreated || 0;

      // Backend status
      if (data.backendAvailable !== undefined) {
        const dot = data.backendAvailable ? "online" : "offline";
        const text = data.backendAvailable ? "Connected" : "Offline (client-only)";
        statBackend.innerHTML = `<span class="status-dot ${dot}"></span> ${text}`;
      }
    }

    // Sensing data
    if (data.sensing) {
      const s = data.sensing;
      sensingData.innerHTML = `
        <div class="sensing-grid">
          <div class="sensing-item">
            <span class="sensing-item-label">ADHD signal</span>
            <span class="sensing-item-value">${(s.adhd * 100).toFixed(0)}%</span>
          </div>
          <div class="sensing-item">
            <span class="sensing-item-label">Autism signal</span>
            <span class="sensing-item-value">${(s.autism * 100).toFixed(0)}%</span>
          </div>
          <div class="sensing-item">
            <span class="sensing-item-label">Dyslexia signal</span>
            <span class="sensing-item-value">${(s.dyslexia * 100).toFixed(0)}%</span>
          </div>
          <div class="sensing-item">
            <span class="sensing-item-label">Scroll speed</span>
            <span class="sensing-item-value">${s.raw.avgScrollVelocity.toFixed(2)}</span>
          </div>
          <div class="sensing-item">
            <span class="sensing-item-label">Re-reads</span>
            <span class="sensing-item-value">${s.raw.scrollReversals}</span>
          </div>
          <div class="sensing-item">
            <span class="sensing-item-label">Tab switches</span>
            <span class="sensing-item-value">${s.raw.tabSwitchRate.toFixed(1)}/min</span>
          </div>
        </div>
      `;
    }
  }

  // ─── Save Profiles and Notify ───────────────────────────────────
  function saveAndApply() {
    currentProfiles = Array.from(profileCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    chrome.storage.local.set({
      cogniflow_active: isActive,
      cogniflow_profiles: currentProfiles,
      cogniflow_backend_url: backendUrlInput.value
    });

    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) return;
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "SET_PROFILES",
        profiles: currentProfiles,
        backendUrl: backendUrlInput.value
      }).catch(() => {});
    });
  }

  // ─── Event Listeners ───────────────────────────────────────────
  powerBtn.addEventListener("click", () => {
    isActive = !isActive;
    powerBtn.classList.toggle("active", isActive);
    document.body.classList.toggle("inactive", !isActive);

    if (!isActive) {
      // Revert all changes
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "REVERT_ALL" }).catch(() => {});
        }
      });
    }

    saveAndApply();
  });

  profileCheckboxes.forEach(cb => {
    cb.addEventListener("change", saveAndApply);
  });

  backendUrlInput.addEventListener("change", saveAndApply);

  resetLearningBtn.addEventListener("click", () => {
    if (confirm("Reset all learning data? The extension will start fresh.")) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { type: "RESET_LEARNING" }).catch(() => {});
        }
      });
    }
  });

  revertLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "REVERT_ALL" }).catch(() => {});
      }
    });
    casBefore.textContent = "--";
    casAfter.textContent = "--";
    statFixed.textContent = "0";
    statSimplified.textContent = "0";
  });

  init();
})();
