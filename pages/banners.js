// Affiliate banners — injected into every page automatically
const BANNERS = [
  {
    icon: '🎮',
    label: 'Amazon Picks',
    title: 'Best Gaming Gear — Handpicked',
    sub: 'Controllers, headsets, keyboards — all the W gear',
    btn: 'Shop Now',
    url: 'https://www.amazon.com/s?k=gaming+gear&tag=momoney0ad-20',
    cls: ''
  },
  {
    icon: '💰',
    label: 'Make Money Gaming',
    title: 'Turn Your Gaming Into Income',
    sub: 'The tools legendary.mind actually uses — no cap',
    btn: 'Check It Out',
    url: 'https://2ec71d0h2irs2d7fv4hisbcdcg.hop.clickbank.net',
    cls: ''
  },
  {
    icon: '🌱',
    label: 'Limited Deal',
    title: 'Medicinal Seed Kit — Grow Your Own',
    sub: 'Easy starter kit, ships fast, fr fr worth it',
    btn: 'Get The Kit',
    url: 'https://medicinalseedkit.com/kit/#aff=yoursearch2008650d',
    cls: 'red'
  },
  {
    icon: '💪',
    label: 'Health & Energy',
    title: 'Nitric Oxide — Superhuman Energy at Any Age',
    sub: 'Gamer stamina boost, no cap this hits different',
    btn: 'Try It Now',
    url: 'https://www.advancedbionutritionals.com/DS24/Nitric-Oxide-Supplements/Superhuman-At-70/HD.htm#aff=yoursearch2008650d',
    cls: 'red'
  },
  {
    icon: '💅',
    label: 'Self Care',
    title: 'Pro Nail Complex — Actually Works fr fr',
    sub: 'Stronger nails, fast results, cooked in a good way',
    btn: 'See It Here',
    url: 'https://pronailcomplex24.com/text.php#aff=yoursearch2008650d',
    cls: ''
  }
];

function renderBanners(count = 2) {
  // Pick banners based on day so they rotate daily
  const day = new Date().getDay();
  const picked = [];
  for (let i = 0; i < count; i++) {
    picked.push(BANNERS[(day + i) % BANNERS.length]);
  }

  return picked.map(b => `
    <a class="ad-strip ${b.cls}" href="${b.url}" target="_blank" rel="noopener">
      <div class="ad-strip-left">
        <div class="ad-icon">${b.icon}</div>
        <div>
          <div class="ad-label">${b.label} #ad</div>
          <div class="ad-title">${b.title}</div>
          <div class="ad-sub">${b.sub}</div>
        </div>
      </div>
      <div class="ad-btn">${b.btn} →</div>
    </a>
    <p class="ad-disclosure">*affiliate link — we earn a commission at no cost to you</p>
  `).join('');
}

// Auto-inject banners before footer on every page
document.addEventListener('DOMContentLoaded', () => {
  const footer = document.querySelector('footer');
  if (!footer) return;
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'max-width:860px;margin:0 auto;padding:0 24px 40px';
  wrapper.innerHTML = renderBanners(2);
  footer.parentNode.insertBefore(wrapper, footer);
});
