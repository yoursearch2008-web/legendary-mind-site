/**
 * Cookie Consent — EU GDPR / AFM compliance
 * Must load BEFORE ads.js. Sets window.ST_ADS_OK flag.
 * ads.js checks this flag before injecting A-ADS.
 */

(function () {
  const STORE_KEY = 'st-cookie-consent';
  const consent = localStorage.getItem(STORE_KEY);

  if (consent === 'accepted') {
    window.ST_ADS_OK = true;
    return;
  }
  if (consent === 'declined') {
    window.ST_ADS_OK = false;
    return;
  }

  // No choice yet — show banner after DOM ready
  window.ST_ADS_OK = false;

  function showBanner() {
    if (document.getElementById('st-consent')) return;

    const style = document.createElement('style');
    style.textContent = `
      #st-consent{
        position:fixed;bottom:0;left:0;right:0;z-index:9999;
        background:#0f1520;border-top:1px solid rgba(20,241,149,.25);
        padding:14px 20px;display:flex;align-items:center;
        gap:14px;flex-wrap:wrap;
        font-family:-apple-system,Segoe UI,Roboto,sans-serif;
        font-size:.8rem;color:#8b98a9;
        animation:st-consent-slide .3s ease;
      }
      @keyframes st-consent-slide{from{transform:translateY(100%)}to{transform:none}}
      #st-consent p{flex:1;margin:0;min-width:220px;line-height:1.5}
      #st-consent a{color:#14f195;text-decoration:none}
      #st-consent a:hover{text-decoration:underline}
      .st-consent-btns{display:flex;gap:8px;flex-shrink:0}
      .st-consent-btns button{
        padding:8px 18px;border-radius:8px;font-size:.8rem;
        font-weight:700;cursor:pointer;border:none;transition:.15s;
      }
      #st-accept{background:linear-gradient(135deg,#14f195,#9945ff);color:#000}
      #st-accept:hover{opacity:.85}
      #st-decline{background:#1c2535;color:#8b98a9;border:1px solid #2a3548}
      #st-decline:hover{color:#eef0f6}
    `;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = 'st-consent';
    bar.innerHTML = `
      <p>
        We use cookies from advertising partners (A-ADS) and embed affiliate links (Bitvavo, Koinly, OKX, Ledger).
        See our <a href="/privacy/">Privacy Policy</a> for details.
        Required for EU/GDPR compliance.
      </p>
      <div class="st-consent-btns">
        <button id="st-accept">Accept</button>
        <button id="st-decline">Decline</button>
      </div>
    `;
    document.body.appendChild(bar);

    document.getElementById('st-accept').addEventListener('click', function () {
      localStorage.setItem(STORE_KEY, 'accepted');
      window.ST_ADS_OK = true;
      bar.remove();
      // Dynamically load A-ADS now that user accepted
      if (window.ADS_CONFIG && window.ADS_CONFIG.a_ads_unit) {
        const s = document.createElement('script');
        s.src = '//a-ads.com/' + window.ADS_CONFIG.a_ads_unit + '/invoke.js';
        s.async = true;
        const slot = document.querySelector('.st-ad-slot');
        if (slot) slot.appendChild(s);
      }
    });

    document.getElementById('st-decline').addEventListener('click', function () {
      localStorage.setItem(STORE_KEY, 'declined');
      window.ST_ADS_OK = false;
      bar.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
