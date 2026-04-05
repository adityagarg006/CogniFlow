
(function () {
  "use strict";

  // JARGON DICTIONARY (WILL BE LOADED FROM JSON LATER)
  // ~500 common jargon terms with plain definitions
  const JARGON = new Map([
    ["mitochondria", "parts of a cell that produce energy"],
    ["mitochondrion", "a single energy-producing part of a cell"],
    ["photosynthesis", "how plants turn sunlight into food"],
    ["adenosine triphosphate", "ATP — the cell's energy molecule"],
    ["deoxyribonucleic", "DNA — the molecule that carries genetic instructions"],
    ["ribonucleic", "RNA — a molecule that helps build proteins"],
    ["eukaryotes", "organisms whose cells have a nucleus (animals, plants, fungi)"],
    ["prokaryotes", "simple organisms without a cell nucleus (bacteria)"],
    ["organelle", "a specialized structure inside a cell"],
    ["genome", "the complete set of genes in an organism"],
    ["chromosome", "a thread-like structure carrying genetic information"],
    ["enzyme", "a protein that speeds up chemical reactions"],
    ["catalysis", "speeding up a chemical reaction"],
    ["metabolism", "all the chemical processes in a living organism"],
    ["osmosis", "movement of water through a membrane"],
    ["homeostasis", "the body maintaining a stable internal state"],
    ["pathogen", "a germ that causes disease"],
    ["antibody", "a protein that fights infections"],
    ["neurotransmitter", "a chemical that carries signals between brain cells"],
    ["hypothesis", "an educated guess to be tested"],
    ["empirical", "based on observation or experiment"],
    ["synthesis", "combining parts into a whole"],
    ["correlation", "a relationship between two things"],
    ["causation", "one thing directly causing another"],
    ["quantum", "relating to the smallest units of energy or matter"],
    ["decoherence", "when a quantum system loses its quantum properties"],
    ["thermodynamic", "relating to heat and energy"],
    ["electromagnetic", "relating to electricity and magnetism combined"],
    ["aerobic", "needing oxygen"],
    ["anaerobic", "not needing oxygen"],
    ["carnivorous", "meat-eating"],
    ["herbivorous", "plant-eating"],
    ["omnivorous", "eating both plants and meat"],
    ["domesticated", "bred to live with humans"],

    ["epistemology", "the study of knowledge — what we know and how we know it"],
    ["epistemological", "relating to the nature of knowledge"],
    ["ontology", "the study of what exists"],
    ["ontological", "relating to the nature of existence"],
    ["metaphysics", "the study of reality beyond physical science"],
    ["paradigm", "a standard way of thinking about something"],
    ["dialectic", "arriving at truth through debate"],
    ["phenomenology", "the study of conscious experience"],
    ["heuristic", "a practical shortcut for problem-solving"],
    ["cognitive", "relating to thinking and understanding"],
    ["pedagogy", "the method and practice of teaching"],
    ["socioeconomic", "relating to both social and economic factors"],
    ["demographic", "relating to population statistics"],

    ["notwithstanding", "in spite of; regardless of"],
    ["adjudication", "the process of making a legal decision"],
    ["promulgate", "to officially announce or put into effect"],
    ["statutory", "required or permitted by law"],
    ["jurisprudence", "the study or philosophy of law"],
    ["precedent", "a past legal decision used as a guide"],
    ["jurisdiction", "the area or authority where laws apply"],
    ["plaintiff", "the person who brings a case to court"],
    ["defendant", "the person accused in a court case"],
    ["litigation", "the process of taking legal action"],
    ["indemnify", "to protect against legal responsibility"],
    ["fiduciary", "a person trusted to manage another's money or property"],
    ["subpoena", "a legal order to appear in court or produce evidence"],
    ["affidavit", "a written statement confirmed by oath"],

    ["algorithm", "a step-by-step set of instructions"],
    ["encryption", "scrambling data so only authorized people can read it"],
    ["latency", "the delay before data transfer begins"],
    ["bandwidth", "how much data can be sent at once"],
    ["deprecated", "outdated and no longer recommended for use"],
    ["instantiate", "to create a specific instance of something"],
    ["interoperability", "the ability of different systems to work together"],
    ["scalability", "the ability to grow and handle more work"],
    ["middleware", "software that connects different applications"],
    ["containerization", "packaging software to run consistently anywhere"],

    ["pathology", "the study of diseases"],
    ["prognosis", "the likely outcome of a medical condition"],
    ["etiology", "the cause or origin of a disease"],
    ["comorbidity", "having two or more medical conditions at once"],
    ["contraindication", "a reason NOT to use a particular treatment"],
    ["asymptomatic", "showing no symptoms"],
    ["prophylaxis", "action taken to prevent disease"],
    ["bioavailability", "how much of a drug actually enters the bloodstream"],
    ["pharmacokinetics", "how the body processes a drug over time"],

    ["amortization", "spreading the cost of something over time"],
    ["liquidity", "how easily something can be converted to cash"],
    ["collateral", "something pledged as security for a loan"],
    ["arbitrage", "profiting from price differences in different markets"],
    ["depreciation", "decrease in value over time"],
    ["fiduciary", "a person trusted to manage another's assets"],
    ["derivative", "a financial contract based on an underlying asset"],
    ["equity", "ownership stake, or the value of something minus debts"],
    ["insolvency", "being unable to pay debts"],
    ["macroeconomic", "relating to the economy as a whole"],
  ]);

  const JARGON_SINGLE = new Map();
  for (const [term, def] of JARGON) {
    const words = term.toLowerCase().split(/\s+/);
    if (words.length === 1) {
      JARGON_SINGLE.set(words[0], def);
    }
  }

  // SENTENCE SPLITTING
  const SPLIT_POINTS = /,\s*(which|who|that|where|although|while|whereas|however|moreover|furthermore|thereby|thus|hence|nevertheless|consequently)\s/gi;

  function _splitLongSentences(text) {
    const sentences = CogniFlowFK.splitSentences(text);
    const result = [];

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/);

      if (words.length <= 25) {
        result.push(sentence);
        continue;
      }

      const parts = sentence.split(SPLIT_POINTS).filter(p => p.trim().length > 0);

      if (parts.length > 1) {
        let current = "";
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i].trim();
          if (part.length < 12 && /^(which|who|that|where|although|while|whereas|however|moreover|furthermore|thereby|thus|hence|nevertheless|consequently)$/i.test(part)) {
            continue;
          }
          if (current && (current + " " + part).split(/\s+/).length > 30) {
            result.push(current.trim());
            current = part;
          } else {
            current = current ? current + ". " + _capitalize(part) : part;
          }
        }
        if (current.trim()) result.push(current.trim());
      } else {
        result.push(sentence);
      }
    }

    return result;
  }

  function _capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }


  // JARGON TOOLTIPS
  function _annotateJargon(html) {
    let annotated = html;

    for (const [term, definition] of JARGON) {
      if (term.includes(" ")) {
        const regex = new RegExp(`\\b(${_escapeRegex(term)})\\b`, "gi");
        annotated = annotated.replace(regex, (match) => {
          return `<span class="cogniflow-jargon" data-cogniflow-injected="true" data-definition="${_escapeHtml(definition)}" tabindex="0" role="note" aria-label="${match}: ${definition}">${match}</span>`;
        });
      }
    }

    const words = annotated.split(/(\s+|<[^>]+>)/);
    const result = [];

    for (const token of words) {
      if (token.startsWith("<") || /^\s*$/.test(token)) {
        result.push(token);
        continue;
      }

      if (token.includes("cogniflow-jargon")) {
        result.push(token);
        continue;
      }

      const cleanWord = token.replace(/[^a-zA-Z]/g, "").toLowerCase();
      if (JARGON_SINGLE.has(cleanWord)) {
        const definition = JARGON_SINGLE.get(cleanWord);
        result.push(`<span class="cogniflow-jargon" data-cogniflow-injected="true" data-definition="${_escapeHtml(definition)}" tabindex="0" role="note" aria-label="${token}: ${definition}">${token}</span>`);
      } else {
        result.push(token);
      }
    }

    return result.join("");
  }

  function _escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function _escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

// VISUAL CHUNKING
  function _chunkSentences(sentences) {
    if (sentences.length <= 3) return [sentences.join(". ") + "."];

    const chunks = [];
    let current = [];

    for (let i = 0; i < sentences.length; i++) {
      current.push(sentences[i]);
      if (current.length >= 2 && (current.length >= 3 || i === sentences.length - 1)) {
        chunks.push(current.join(". ") + ".");
        current = [];
      }
    }
    if (current.length > 0) {
      chunks.push(current.join(". ") + ".");
    }

    return chunks;
  }

  // TRANSFORM PARAGRAPH
  function transformParagraph(el, profile, score) {
    if (el.dataset.cogniflowClientTransformed) return false;

    
    const text = typeof CogniFlowDOM !== "undefined" && CogniFlowDOM._cleanTextContent
      ? CogniFlowDOM._cleanTextContent(el)
      : (el.textContent || "").trim();

    if (text.length < 40) return false;

    const isADHD = profile === "adhd";
    const isDyslexia = profile === "dyslexia";

    const splitSentences = _splitLongSentences(text);

    const chunks = isADHD ? _chunkSentences(splitSentences) : [splitSentences.join(". ") + "."];

    const annotatedChunks = chunks.map(chunk => _annotateJargon(chunk));

    const wrapper = document.createElement("div");
    wrapper.className = "cogniflow-client-transform";
    wrapper.dataset.cogniflowInjected = "true";
    wrapper.dataset.cogniflowClientTransformed = "true";

    if (annotatedChunks.length === 1) {
      wrapper.innerHTML = annotatedChunks[0];
    } else {
      annotatedChunks.forEach((chunk, i) => {
        const p = document.createElement("p");
        p.className = "cogniflow-chunk";
        p.dataset.cogniflowInjected = "true";
        p.innerHTML = chunk;
        wrapper.appendChild(p);
      });
    }

    const btn = _createSimplifyButton(el, profile);
    wrapper.appendChild(btn);

    
    el.dataset.cogniflowClientTransformed = "true";

    const originalFragment = document.createDocumentFragment();
    while (el.firstChild) {
      originalFragment.appendChild(el.firstChild);
    }
    el._cogniflowOriginalNodes = originalFragment;

    el.appendChild(wrapper);

    return true;
  }

  

  // BUILDING THE REQUEST QUEUE TO REDUCE LOAD ON BACKEND SERVER

  let _queueState = "IDLE"; 
  let _pendingQueue = [];  
  let _isProcessingUserRequest = false;

  function _getAllSimplifyButtons() {
    return document.querySelectorAll(".cogniflow-simplify-btn");
  }

  
  function _lockAllButtons(reason, except) {
    _getAllSimplifyButtons().forEach(btn => {
      if (btn === except) return;
      btn.disabled = true;
      btn.dataset.cogniflowOriginalText = btn.dataset.cogniflowOriginalText || btn.textContent;
      btn.textContent = reason;
      btn.classList.add("cogniflow-simplify-queued");
    });
  }

  function _unlockAllButtons() {
    _getAllSimplifyButtons().forEach(btn => {
      if (btn.classList.contains("cogniflow-simplify-loading")) return; // Currently active
      btn.disabled = false;
      btn.textContent = btn.dataset.cogniflowOriginalText || "Simplify this";
      btn.classList.remove("cogniflow-simplify-queued");
    });
  }

  function notifyTierBStarted() {
    _queueState = "TIER_B_PROCESSING";
    _lockAllButtons("Waiting...", null);
  }

  function notifyTierBComplete() {
    _queueState = "IDLE";
    _unlockAllButtons();
    _flushQueue();
  }
  async function _flushQueue() {
    if (_isProcessingUserRequest || _queueState === "TIER_B_PROCESSING") return;
    if (_pendingQueue.length === 0) {
      _queueState = "IDLE";
      _unlockAllButtons();
      return;
    }

    _isProcessingUserRequest = true;
    _queueState = "USER_REQUEST";

    const { el, btn, profile } = _pendingQueue.shift();

    btn.disabled = true;
    btn.textContent = "Simplifying...";
    btn.classList.remove("cogniflow-simplify-queued");
    btn.classList.add("cogniflow-simplify-loading");

    _lockAllButtons("Queued...", btn);

    try {
      const originalText = el._cogniflowOriginalNodes
        ? _getTextFromFragment(el._cogniflowOriginalNodes)
        : (typeof CogniFlowDOM !== "undefined" && CogniFlowDOM._cleanTextContent
          ? CogniFlowDOM._cleanTextContent(el)
          : el.textContent);

      const backendUrl = COGNIFLOW_CONFIG.BACKEND_URL;
      const domPath = CogniFlowDOM.getDomPath(el);
      const fk = CogniFlowFK.computeFK(originalText);
      const sentenceData = CogniFlowFK.getComplexSentences(originalText, profile);

      const response = await fetch(`${backendUrl}/api/v1/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{
            domPath: domPath,
            fullText: originalText,
            complexSentences: sentenceData.complexSentences,
            allSentences: sentenceData.allSentences,
            totalSentences: sentenceData.totalSentences,
            wordCount: originalText.split(/\s+/).length,
            gradeLevel: fk.gradeLevel
          }],
          profiles: [profile],
          pageUrl: window.location.href,
          domain: window.location.hostname
        }),
        signal: AbortSignal.timeout(COGNIFLOW_CONFIG.API_TIMEOUT_MS)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.items && result.items[0]) {
          CogniFlowDisclosure.wrapWithAIResult(el, result.items[0], [profile]);
          btn.remove();
        }
      } else {
        throw new Error("Server error " + response.status);
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Simplify this";
      btn.classList.remove("cogniflow-simplify-loading");
      console.warn("[CogniFlow] Simplify request failed:", err);
    }

    _isProcessingUserRequest = false;
    _flushQueue();
  }

  function _getTextFromFragment(fragment) {
    const tmp = document.createElement("div");
    tmp.appendChild(fragment.cloneNode(true));
    tmp.querySelectorAll("style, script").forEach(s => s.remove());
    return (tmp.textContent || "").trim();
  }

 // "SIMPLIFY THIS" BUTTON 
  function _createSimplifyButton(el, profile) {
    const btn = document.createElement("button");
    btn.className = "cogniflow-simplify-btn";
    btn.dataset.cogniflowInjected = "true";
    btn.dataset.cogniflowOriginalText = "Simplify this";
    btn.textContent = "Simplify this";
    btn.setAttribute("aria-label", "Ask AI to simplify this paragraph");

    if (_queueState === "TIER_B_PROCESSING") {
      btn.disabled = true;
      btn.textContent = "Waiting...";
      btn.classList.add("cogniflow-simplify-queued");
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.disabled = true;
      btn.textContent = _isProcessingUserRequest ? "Queued..." : "Simplifying...";
      btn.classList.add(_isProcessingUserRequest ? "cogniflow-simplify-queued" : "cogniflow-simplify-loading");

      _pendingQueue.push({ el, btn, profile });

      if (!_isProcessingUserRequest && _queueState !== "TIER_B_PROCESSING") {
        _flushQueue();
      }
    });

    return btn;
  }

  function _stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || "";
  }

  
  function addSimplifyButton(el, profile) {
    if (el.querySelector(".cogniflow-simplify-btn")) return null;
    const btn = _createSimplifyButton(el, profile);
    el.style.position = "relative";
    el.appendChild(btn);
    return btn;
  }

  function batchTransform(scoredElements, profile) {
    let transformed = 0;
    let skipped = 0;
    let sentToServer = 0;

    for (const item of scoredElements) {
      const el = item.el;
      const composite = item.cas !== undefined
        ? (100 - item.cas) / 100
        : 0.5;

      const jargonScore = typeof CogniFlowScorer_v2 !== "undefined"
        ? CogniFlowScorer_v2._jargonDensity(item.text || el.textContent).score
        : 0;
      const words = (item.text || el.textContent || "").split(/\s+/).length;

      const isTierB = composite > 0.7 && jargonScore > 0.5 && words > 60;
      const isTierA = composite > 0.25 && !isTierB;

      if (isTierA) {
        const didTransform = transformParagraph(el, profile, composite);
        if (didTransform) transformed++;
        else skipped++;
      } else if (isTierB) {
        addSimplifyButton(el, profile);
        sentToServer++;
      } else {
        skipped++;
      }
    }

    return { transformed, skipped, sentToServer };
  }

// REVERT CHANGES
  function revertTransforms(el) {
    if (!el || !el.dataset.cogniflowClientTransformed) return;

    const wrapper = el.querySelector(".cogniflow-client-transform");
    if (wrapper) wrapper.remove();

    if (el._cogniflowOriginalNodes) {
      el.appendChild(el._cogniflowOriginalNodes);
      delete el._cogniflowOriginalNodes;
    }

    delete el.dataset.cogniflowClientTransformed;
  }

  function revertAll() {
    document.querySelectorAll("[data-cogniflow-client-transformed]").forEach(el => {
      revertTransforms(el);
    });
    document.querySelectorAll(".cogniflow-simplify-btn").forEach(btn => btn.remove());
  }

  window.CogniFlowClientTransforms = {
    transformParagraph,
    batchTransform,
    addSimplifyButton,
    revertTransforms,
    revertAll,
    notifyTierBStarted,
    notifyTierBComplete,
    _splitLongSentences,
    _annotateJargon,
    _chunkSentences,
    JARGON
  };

})();