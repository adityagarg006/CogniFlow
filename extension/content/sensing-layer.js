
(function () {
  "use strict";

  let _active = false;
  let _startTime = 0;

  // SCROLL TRACKING
  let _lastScrollY = 0;
  let _lastScrollTime = 0;
  let _scrollVelocities = [];
  let _scrollReversals = 0;
  let _totalScrollEvents = 0;
  let _scrollTimer = null;

  let _dwellObserver = null;
  const _dwellData = new Map(); // Element → { totalMs, visits, lastEnterTime }
  const _dwellTimers = new Map();

  // MOUSE ENTROPY
  let _mousePositions = [];
  let _mouseTimer = null;

  // TAB SWITCHING
  let _tabSwitchCount = 0;
  let _lastVisibilityChange = 0;

  // CLICK HESITATION
  let _hoverStartTime = 0;
  let _hoverTarget = null;
  let _clickHesitations = [];

  // SCROLL HANDLER
  function _onScroll() {
    const now = Date.now();
    const currentY = window.scrollY;
    _totalScrollEvents++;

    if (_lastScrollTime > 0) {
      const dt = now - _lastScrollTime;
      if (dt > 0) {
        const dy = currentY - _lastScrollY;
        const velocity = Math.abs(dy) / dt; 

        _scrollVelocities.push(velocity);
        if (_scrollVelocities.length > 50) _scrollVelocities.shift();

        if (dy < -20) { 
          _scrollReversals++;
        }
      }
    }

    _lastScrollY = currentY;
    _lastScrollTime = now;
  }

  // DWELL TIME TRACKING
  function _initDwellObserver() {
    _dwellObserver = new IntersectionObserver((entries) => {
      const now = Date.now();
      entries.forEach(entry => {
        const el = entry.target;

        if (entry.isIntersecting) {
          if (!_dwellData.has(el)) {
            _dwellData.set(el, { totalMs: 0, visits: 0, lastEnterTime: now });
          }
          const data = _dwellData.get(el);
          data.lastEnterTime = now;
          data.visits++;
        } else {
          if (_dwellData.has(el)) {
            const data = _dwellData.get(el);
            if (data.lastEnterTime > 0) {
              data.totalMs += now - data.lastEnterTime;
              data.lastEnterTime = 0;
            }
          }
        }
      });
    }, {
      threshold: [0.3], 
      rootMargin: "0px"
    });

    const main = CogniFlowDOM.getMainContent();
    const paragraphs = main.querySelectorAll("p, li, blockquote, h1, h2, h3, h4, h5, h6");
    paragraphs.forEach(p => _dwellObserver.observe(p));
  }

  // MOUSE ENTROPY
  function _onMouseMove(e) {
    _mousePositions.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (_mousePositions.length > 20) _mousePositions.shift();
  }

  function _computeMouseEntropy() {
    if (_mousePositions.length < 5) return 0;

    let directionChanges = 0;
    for (let i = 2; i < _mousePositions.length; i++) {
      const dx1 = _mousePositions[i - 1].x - _mousePositions[i - 2].x;
      const dy1 = _mousePositions[i - 1].y - _mousePositions[i - 2].y;
      const dx2 = _mousePositions[i].x - _mousePositions[i - 1].x;
      const dy2 = _mousePositions[i].y - _mousePositions[i - 1].y;

      const dot = dx1 * dx2 + dy1 * dy2;
      if (dot < 0) directionChanges++;
    }

    return directionChanges / (_mousePositions.length - 2);
  }

  // TAB SWITCH TRACKING
  function _onVisibilityChange() {
    if (document.hidden) {
      _tabSwitchCount++;
      _lastVisibilityChange = Date.now();
    }
  }

  // CLICK HESITATION
  function _onMouseOver(e) {
    const target = e.target.closest("a, button, [role='button'], input[type='submit']");
    if (target) {
      _hoverTarget = target;
      _hoverStartTime = Date.now();
    }
  }

  function _onClick(e) {
    if (_hoverTarget && _hoverStartTime > 0) {
      const hesitation = Date.now() - _hoverStartTime;
      if (hesitation > 100 && hesitation < 10000) { // Between 100ms and 10s
        _clickHesitations.push(hesitation);
        if (_clickHesitations.length > 30) _clickHesitations.shift();
      }
    }
    _hoverTarget = null;
    _hoverStartTime = 0;
  }

  // PROFILE COMPUTATION
  function getProfile() {
    const elapsed = (Date.now() - _startTime) / 1000; // seconds

    const avgScrollVelocity = _scrollVelocities.length > 0
      ? _scrollVelocities.reduce((a, b) => a + b, 0) / _scrollVelocities.length
      : 0;
    const scrollReversalRate = _totalScrollEvents > 0
      ? _scrollReversals / _totalScrollEvents
      : 0;
    const mouseEntropy = _computeMouseEntropy();
    const tabSwitchRate = elapsed > 0 ? _tabSwitchCount / (elapsed / 60) : 0; // per minute
    const avgHesitation = _clickHesitations.length > 0
      ? _clickHesitations.reduce((a, b) => a + b, 0) / _clickHesitations.length
      : 0;

    const adhdSignal = Math.min(1, (
      (avgScrollVelocity > 1.5 ? 0.3 : avgScrollVelocity * 0.2) +
      (tabSwitchRate > 3 ? 0.3 : tabSwitchRate * 0.1) +
      (mouseEntropy > 0.5 ? 0.2 : mouseEntropy * 0.4) +
      (scrollReversalRate < 0.05 ? 0.2 : 0) 
    ));

    const autismSignal = Math.min(1, (
      (avgHesitation > 2000 ? 0.3 : avgHesitation / 6000) +
      (avgScrollVelocity < 0.3 ? 0.2 : 0) +
      (tabSwitchRate > 5 ? 0.3 : 0) + 
      (mouseEntropy < 0.2 ? 0.2 : 0)  
    ));

    const dyslexiaSignal = Math.min(1, (
      (scrollReversalRate > 0.15 ? 0.35 : scrollReversalRate * 2.3) +
      (avgScrollVelocity < 0.5 ? 0.25 : 0) +
      (avgHesitation > 1500 ? 0.2 : avgHesitation / 7500) +
      (mouseEntropy > 0.3 ? 0.2 : 0) 
    ));

    return {
      adhd: Math.round(adhdSignal * 100) / 100,
      autism: Math.round(autismSignal * 100) / 100,
      dyslexia: Math.round(dyslexiaSignal * 100) / 100,
      raw: {
        avgScrollVelocity: Math.round(avgScrollVelocity * 1000) / 1000,
        scrollReversalRate: Math.round(scrollReversalRate * 1000) / 1000,
        mouseEntropy: Math.round(mouseEntropy * 1000) / 1000,
        tabSwitchRate: Math.round(tabSwitchRate * 100) / 100,
        avgHesitation: Math.round(avgHesitation),
        elapsedSeconds: Math.round(elapsed),
        totalScrollEvents: _totalScrollEvents,
        scrollReversals: _scrollReversals
      }
    };
  }

  function getDwellData() {
    return _dwellData;
  }

  function isWarmedUp() {
    return _active && (Date.now() - _startTime) > COGNIFLOW_CONFIG.SENSING_WARMUP_MS;
  }

  // START / STOP
  function start() {
    if (_active) return;
    _active = true;
    _startTime = Date.now();
    _lastScrollY = window.scrollY;

    let scrollRAF = null;
    window.addEventListener("scroll", function () {
      if (scrollRAF) return;
      scrollRAF = requestAnimationFrame(() => {
        _onScroll();
        scrollRAF = null;
      });
    }, { passive: true });

    let mouseRAF = null;
    document.addEventListener("mousemove", function (e) {
      if (mouseRAF) return;
      mouseRAF = requestAnimationFrame(() => {
        _onMouseMove(e);
        mouseRAF = null;
      });
    }, { passive: true });

    // Tab switching
    document.addEventListener("visibilitychange", _onVisibilityChange);

    // Click hesitation
    document.addEventListener("mouseover", _onMouseOver, { passive: true });
    document.addEventListener("click", _onClick, { passive: true });

    // Dwell observer (after short delay to let page settle)
    setTimeout(() => {
      if (_active) _initDwellObserver();
    }, 1000);
  }

  function stop() {
    _active = false;
    if (_dwellObserver) {
      _dwellObserver.disconnect();
      _dwellObserver = null;
    }
    document.removeEventListener("visibilitychange", _onVisibilityChange);
  }

  window.CogniFlowSensing = {
    start,
    stop,
    getProfile,
    getDwellData,
    isWarmedUp
  };
})();
