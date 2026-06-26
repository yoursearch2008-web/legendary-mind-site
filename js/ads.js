/**
 * SolTools Monetization Layer
 * - Exchange affiliate banners (CPA + revenue share)
 * - A-ADS / Coinzilla crypto ad slot
 * - AFM-compliant crypto risk disclaimer (required for EU/NL targeting)
 *
 * EXCHANGES: Bitvavo (DNB-registered NL), OKX (DNB-registered), Ledger, Koinly
 * Removed: Bybit (unregistered NL), Binance (DNB ban since 2022)
 */

// ── CONFIG — fill your referral codes here ────────────────────────────────
const ADS_CONFIG = {
  bitvavo_ref:    '2CD7BFA42C',   // bitvavo.com/invite?a=2CD7BFA42C (10% fee share)
  okx_ref:        '',   // okx.com/join → get code (optional)
  ledger_ref:     '',   // ledger.com/affiliate → get code (optional)
  koinly_ref:     '85756FAD',   // koinly.io/?via=85756FAD (30% recurring)
  a_ads_unit:     '511975',   // a-ads.com unit ID
  coinzilla_zone: '',   // coinzilla.io → zone ID after approval
  hypelab_slug:   '',   // hypelab.com → property slug after approval
};

const EXCHANGES = [
  {
    name: 'Bitvavo',
    logo: '🇳🇱',
    color: '#1a6fff',
    text: 'Buy SOL on Bitvavo',
    sub: 'DNB-registered · #1 crypto exchange in the Netherlands',
    url: () => ADS_CONFIG.bitvavo_ref
      ? `https://bitvavo.com/?a=${ADS_CONFIG.bitvavo_ref}`
      : 'https://bitvavo.com/',
    cta: 'Start Trading →',
  },
  {
    name: 'OKX',
    logo: '⚫',
    color: '#ffffff',
    text: 'Trade SOL on OKX',
    sub: 'Zero-fee spot trading available',
    url: () => ADS_CONFIG.okx_ref ? `https://www.okx.com/join/${ADS_CONFIG.okx_ref}` : 'https://www.okx.com/',
    cta: 'Trade Free →',
  },
  {
    name: 'Ledger',
    logo: '🔒',
    color: '#14f195',
    text: 'Secure your SOL with Ledger',
    sub: 'Hardware wallet — your keys, your crypto',
    url: () => ADS_CONFIG.ledger_ref ? `https://shop.ledger.com/pages/referral-program?referral=${ADS_CONFIG.ledger_ref}` : 'https://shop.ledger.com/',
    cta: 'Shop Ledger →',
  },
  {
    name: 'Koinly',
    logo: '📊',
    color: '#7b3fe4',
    text: 'File your Solana taxes with Koinly',
    sub: 'Auto-import · Netherlands, Belgium, 20+ countries',
    url: () => ADS_CONFIG.koinly_ref
      ? `https://koinly.io/?via=${ADS_CONFIG.koinly_ref}`
      : 'https://koinly.io/',
    cta: 'Calculate Taxes →',
  },
];

let _exchIdx = Math.floor(Math.random() * EXCHANGES.length);

function injectStyles() {
  if (document.getElementById('soltools-ad-styles')) return;
  const s = document.createElement('style');
  s.id = 'soltools-ad-styles';
  s.textContent = `
    /* ── AFM risk disclaimer ── */
    #st-afm{
      background:rgba(255,200,0,.06);border:1px solid rgba(255,200,0,.18);
      border-radius:10px;padding:10px 16px;margin:0 0 16px;
      font-family:-apple-system,Segoe UI,Roboto,sans-serif;
      font-size:.72rem;color:#c8a900;line-height:1.5;
    }
    #st-afm strong{font-weight:700}

    /* ── Sticky bottom bar ── */
    #st-sticky{
      position:fixed;bottom:0;left:0;right:0;z-index:9000;
      background:rgba(11,14,20,.95);backdrop-filter:blur(12px);
      border-top:1px solid rgba(255,255,255,.08);
      display:flex;align-items:center;gap:12px;padding:10px 20px;
      font-family:-apple-system,Segoe UI,Roboto,sans-serif;
      animation:st-slide-up .3s ease;
    }
    @keyframes st-slide-up{from{transform:translateY(100%)}to{transform:none}}
    #st-sticky .st-logo{font-size:1.4rem;flex-shrink:0}
    #st-sticky .st-text{flex:1;min-width:0}
    #st-sticky .st-main{font-size:.9rem;font-weight:700;color:#eef0f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #st-sticky .st-sub{font-size:.75rem;color:#6b7280}
    #st-sticky .st-cta{
      padding:9px 18px;border-radius:8px;font-size:.85rem;font-weight:700;
      background:linear-gradient(135deg,#14f195,#9945ff);color:#000;
      text-decoration:none;white-space:nowrap;flex-shrink:0;transition:opacity .2s;
    }
    #st-sticky .st-cta:hover{opacity:.85}
    #st-sticky .st-close{
      background:none;border:none;color:#4a5568;cursor:pointer;font-size:1.1rem;
      padding:4px;flex-shrink:0;line-height:1;
    }
    #st-sticky .st-close:hover{color:#eef0f6}
    @media(max-width:480px){
      #st-sticky{flex-wrap:wrap;gap:8px}
      #st-sticky .st-sub{display:none}
      #st-sticky .st-cta{font-size:.8rem;padding:8px 14px}
    }

    /* ── In-page native banner ── */
    .st-native-banner{
      background:linear-gradient(135deg,rgba(20,241,149,.04),rgba(153,69,255,.04));
      border:1px solid rgba(20,241,149,.12);border-radius:12px;padding:14px 18px;
      display:flex;align-items:center;gap:14px;margin:16px 0;
      text-decoration:none;transition:.2s;
      font-family:-apple-system,Segoe UI,Roboto,sans-serif;
    }
    .st-native-banner:hover{border-color:rgba(20,241,149,.3);transform:translateY(-1px)}
    .st-native-banner .snb-icon{font-size:1.8rem;flex-shrink:0}
    .st-native-banner .snb-body{flex:1}
    .st-native-banner .snb-title{font-size:.9rem;font-weight:700;color:#eef0f6;margin-bottom:2px}
    .st-native-banner .snb-desc{font-size:.78rem;color:#6b7280}
    .st-native-banner .snb-badge{
      padding:5px 12px;border-radius:6px;font-size:.78rem;font-weight:700;
      background:linear-gradient(135deg,#14f195,#9945ff);color:#000;flex-shrink:0;
    }
    @media(max-width:480px){.st-native-banner .snb-badge{display:none}}

    /* ── Ad network slot ── */
    .st-ad-slot{text-align:center;margin:16px 0;min-height:90px;display:flex;align-items:center;justify-content:center}
    .st-ad-placeholder{
      width:100%;max-width:468px;height:60px;
      border:1px dashed rgba(255,255,255,.08);border-radius:8px;
      display:flex;align-items:center;justify-content:center;
      font-size:.72rem;color:rgba(255,255,255,.2);
    }
  `;
  document.head.appendChild(s);
}

// ── AFM / EU crypto risk disclaimer ──────────────────────────────────────
// Required for advertising targeting Dutch / EU users (AFM rules, Jan 2024)

function injectAfmDisclaimer() {
  if (document.getElementById('st-afm')) return;
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  const box = document.createElement('div');
  box.id = 'st-afm';
  const isFr = location.pathname.startsWith('/fr/');
  const isAr = location.pathname.startsWith('/ar/');
  if (isFr) {
    box.innerHTML = `<strong>⚠️ Avertissement :</strong> Les crypto-actifs sont volatils et non réglementés. Vous pouvez perdre tout ou partie de votre investissement. Ce site perçoit des commissions d'affiliation.`;
  } else if (isAr) {
    box.innerHTML = `<strong>⚠️ تحذير:</strong> العملات المشفرة متقلبة وغير منظمة. قد تخسر جزءاً أو كل استثمارك. هذا الموقع يتلقى عمولة إحالة.`;
    box.style.direction = 'rtl';
  } else {
    box.innerHTML = `<strong>⚠️ Risk warning:</strong> Crypto assets are highly volatile and unregulated. You may lose part or all of your investment. This site receives affiliate commissions. <em>— AFM/DNB disclosure, Netherlands.</em>`;
  }
  const firstCard = wrap.querySelector('.card, .stats-row, h3, #connectCard');
  if (firstCard) wrap.insertBefore(box, firstCard);
  else wrap.prepend(box);
}

// ── Sticky affiliate bar ──────────────────────────────────────────────────

function injectStickyBar() {
  if (document.getElementById('st-sticky') || sessionStorage.getItem('st-closed')) return;
  const ex = EXCHANGES[_exchIdx];
  const bar = document.createElement('div');
  bar.id = 'st-sticky';
  bar.innerHTML = `
    <div class="st-logo">${ex.logo}</div>
    <div class="st-text">
      <div class="st-main">${ex.text}</div>
      <div class="st-sub">${ex.sub}</div>
    </div>
    <a class="st-cta" href="${ex.url()}" target="_blank" rel="noopener sponsored" onclick="stTrack('sticky','${ex.name}')">${ex.cta}</a>
    <button class="st-close" onclick="stClose()" title="Close">✕</button>
  `;
  document.body.appendChild(bar);
  // Add bottom padding so content isn't hidden behind bar
  document.body.style.paddingBottom = '60px';
}

function stClose() {
  document.getElementById('st-sticky')?.remove();
  document.body.style.paddingBottom = '';
  sessionStorage.setItem('st-closed', '1');
}

// ── Native in-page banners ────────────────────────────────────────────────

function createNativeBanner(exIdx) {
  const ex = EXCHANGES[exIdx % EXCHANGES.length];
  const a = document.createElement('a');
  a.className = 'st-native-banner';
  a.href = ex.url();
  a.target = '_blank';
  a.rel = 'noopener sponsored';
  a.setAttribute('onclick', `stTrack('native','${ex.name}')`);
  a.innerHTML = `
    <div class="snb-icon">${ex.logo}</div>
    <div class="snb-body">
      <div class="snb-title">${ex.text}</div>
      <div class="snb-desc">${ex.sub}</div>
    </div>
    <div class="snb-badge">${ex.cta}</div>
  `;
  return a;
}

// Insert native banner after first .card on the page
function injectNativeBanner() {
  const cards = document.querySelectorAll('.card');
  if (!cards.length) return;
  const target = cards[Math.min(1, cards.length - 1)];
  const nextEx = (_exchIdx + 1) % EXCHANGES.length;
  target.insertAdjacentElement('afterend', createNativeBanner(nextEx));
}

// ── Crypto ad network slot ────────────────────────────────────────────────

function injectAdNetworkSlot() {
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;

  const slot = document.createElement('div');
  slot.className = 'st-ad-slot';

  if (ADS_CONFIG.a_ads_unit && window.ST_ADS_OK) {
    // A-ADS — only after cookie consent (GDPR)
    const script = document.createElement('script');
    script.src = `//a-ads.com/${ADS_CONFIG.a_ads_unit}/invoke.js`;
    script.async = true;
    slot.appendChild(script);
  } else if (ADS_CONFIG.coinzilla_zone && window.ST_ADS_OK) {
    const script = document.createElement('script');
    script.src = 'https://coinzilla.io/scripts/banner.js';
    script.async = true;
    script.setAttribute('data-zone', ADS_CONFIG.coinzilla_zone);
    slot.appendChild(script);
  }

  // Inject before last card
  const cards = document.querySelectorAll('.card');
  const lastCard = cards[cards.length - 1];
  if (lastCard) lastCard.insertAdjacentElement('beforebegin', slot);
}

// ── Analytics (simple pixel-free counter) ────────────────────────────────

function stTrack(pos, name) {
  try {
    fetch(`https://soltools.fyi/api/track?event=ad_click&pos=${pos}&name=${encodeURIComponent(name)}&page=${encodeURIComponent(location.pathname)}`, { method: 'POST', keepalive: true }).catch(()=>{});
  } catch {}
}

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  injectAfmDisclaimer();
  injectStickyBar();
  injectNativeBanner();
  injectAdNetworkSlot();
  _exchIdx = (_exchIdx + 1) % EXCHANGES.length;
});
