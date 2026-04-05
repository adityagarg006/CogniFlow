
(function () {
  "use strict";

  const CFG = COGNIFLOW_CONFIG;
  const _interactions = [];

  // CREATE DISCLOSURE WRAPPER
  function wrapElement(el, simplifiedText, tldrText, originalText) {
    if (el.closest(".cogniflow-disclosure-wrapper")) return null;
    if (el.dataset.cogniflowDisclosed) return null;

    const wrapper = document.createElement("div");
    wrapper.className = "cogniflow-disclosure-wrapper";
    wrapper.dataset.cogniflowInjected = "true";
    wrapper.dataset.cogniflowDompath = CogniFlowDOM.getDomPath(el);

    if (tldrText) {
      const tldr = document.createElement("div");
      tldr.className = "cogniflow-tldr";
      tldr.dataset.cogniflowInjected = "true";

      const tldrLabel = document.createElement("span");
      tldrLabel.className = "cogniflow-tldr-label";
      tldrLabel.textContent = CFG.DISCLOSURE.TLDR_LABEL;

      const tldrContent = document.createElement("span");
      tldrContent.className = "cogniflow-tldr-content";
      tldrContent.textContent = tldrText;

      tldr.appendChild(tldrLabel);
      tldr.appendChild(tldrContent);
      wrapper.appendChild(tldr);
    }

    const simplified = document.createElement("div");
    simplified.className = "cogniflow-simplified";
    simplified.dataset.cogniflowInjected = "true";

    const badge = document.createElement("span");
    badge.className = "cogniflow-badge";
    badge.textContent = CFG.DISCLOSURE.SHOW_SIMPLIFIED_LABEL;
    badge.dataset.cogniflowInjected = "true";

    const simplifiedContent = document.createElement("div");
    simplifiedContent.className = "cogniflow-simplified-content";
    simplifiedContent.innerHTML = simplifiedText; // AI may return structured HTML

    simplified.appendChild(badge);
    simplified.appendChild(simplifiedContent);
    wrapper.appendChild(simplified);

    const details = document.createElement("details");
    details.className = "cogniflow-original";
    details.dataset.cogniflowInjected = "true";

    const summary = document.createElement("summary");
    summary.className = "cogniflow-original-toggle";
    summary.textContent = CFG.DISCLOSURE.SHOW_ORIGINAL_LABEL;

    const originalContent = document.createElement("div");
    originalContent.className = "cogniflow-original-content";
    originalContent.textContent = originalText || el.textContent;

    details.appendChild(summary);
    details.appendChild(originalContent);
    wrapper.appendChild(details);

    details.addEventListener("toggle", () => {
      _interactions.push({
        domPath: wrapper.dataset.cogniflowDompath,
        action: details.open ? "expand-original" : "collapse-original",
        timestamp: Date.now(),
        domain: window.location.hostname
      });
    });

    el.dataset.cogniflowDisclosed = "true";
    el.parentNode.insertBefore(wrapper, el);
    el.style.display = "none";
    el.dataset.cogniflowOriginalElement = "true";

    return wrapper;
  }

  // WRAP WITH AI RESULT
  function wrapWithAIResult(el, aiResult, profiles) {
    const isADHD = profiles.includes("adhd");

    const simplifiedText = aiResult.simplified || aiResult.text || el.textContent;
    const tldrText = isADHD ? (aiResult.tldr || null) : null;
    const originalText = el.textContent;

    return wrapElement(el, simplifiedText, tldrText, originalText);
  }

  function batchWrap(results, profiles) {
    let wrapped = 0;
    results.forEach(result => {
      if (!result.el || !result.aiResult) return;
      const wrapper = wrapWithAIResult(result.el, result.aiResult, profiles);
      if (wrapper) wrapped++;
    });
    return wrapped;
  }

  // GET INTERACTIONS (for Learning Layer)
  function getInteractions() {
    return [..._interactions];
  }

  function clearInteractions() {
    _interactions.length = 0;
  }

  // Export
  window.CogniFlowDisclosure = {
    wrapElement,
    wrapWithAIResult,
    batchWrap,
    getInteractions,
    clearInteractions
  };
})();
