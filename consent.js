/* ── Larum Property Experience™ — GDPR Consent Banner ─ */
/* Blocks analytics until visitor opts in. Remembers choice. */

const LarumConsent = (() => {
  'use strict';

  const CONSENT_KEY = 'larum_consent_v1';
  let _callback = null;
  let _banner = null;

  function init(callback) {
    _callback = callback || function() {};

    const saved = localStorage.getItem(CONSENT_KEY);

    if (saved === null) {
      showBanner();
      return 'pending';
    }

    if (saved === 'accepted') {
      _callback(true);
      return 'accepted';
    }

    return 'rejected';
  }

  function showBanner() {
    if (_banner) return;

    _banner = document.createElement('div');
    _banner.className = 'consent-banner';
    _banner.innerHTML = `
      <div class="consent-backdrop"></div>
      <div class="consent-box">
        <div class="consent-top">
          <div class="consent-title">Privacy & Experience</div>
          <button class="consent-more" onclick="LarumConsent.toggleDetails()">More details</button>
        </div>
        <p class="consent-text">
          This property experience uses minimal, privacy-first analytics to understand how visitors explore the residence. No personal data is shared with third parties. All data stays local until you submit an enquiry.
        </p>
        <div class="consent-details" id="consentDetails">
          <ul>
            <li><strong>What we collect:</strong> which sections you explore, scenes you open, time spent, questions you ask the Property Concierge.</li>
            <li><strong>What we don't collect:</strong> name, email, IP address, location, device fingerprint, cookies from third parties.</li>
            <li><strong>Why:</strong> to prepare a more relevant conversation with the property advisor when you choose to enquire.</li>
            <li><strong>How long:</strong> data is kept locally in your browser and erased when you clear browser data. If you submit an enquiry, the summary is sent only to the property advisor.</li>
          </ul>
        </div>
        <div class="consent-actions">
          <button class="consent-btn decline" onclick="LarumConsent.reject()">Experience only</button>
          <button class="consent-btn accept" onclick="LarumConsent.accept()">Accept & explore</button>
        </div>
        <div class="consent-subtle">
          By clicking "Experience only" you can still explore the full Property Experience. Analytics will remain off.
        </div>
      </div>
    `;

    document.body.appendChild(_banner);

    /* Small delay so CSS transition animates in.
       The banner can already be gone if the visitor answers within
       these two frames, so re-check before touching it. */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (_banner) _banner.classList.add('visible');
      });
    });
  }

  function hideBanner() {
    if (!_banner) return;
    _banner.classList.remove('visible');
    setTimeout(() => {
      if (_banner && _banner.parentNode) {
        _banner.parentNode.removeChild(_banner);
      }
      _banner = null;
    }, 400);
  }

  function accept() {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    hideBanner();
    _callback(true);
  }

  function reject() {
    localStorage.setItem(CONSENT_KEY, 'rejected');
    hideBanner();
    _callback(false);
  }

  function toggleDetails() {
    const d = document.getElementById('consentDetails');
    if (d) d.classList.toggle('open');
  }

  function getConsent() {
    return localStorage.getItem(CONSENT_KEY);
  }

  function reset() {
    localStorage.removeItem(CONSENT_KEY);
    location.reload();
  }

  return { init, accept, reject, toggleDetails, getConsent, reset };
})();

window.LarumConsent = LarumConsent;
