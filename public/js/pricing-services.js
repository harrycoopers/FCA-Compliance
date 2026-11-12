(() => {if(matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window))return;const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting && entry.intersectionRatio>=.9){entry.target.closest('[data-pricing-card]').classList.add('is-playing');observer.unobserve(entry.target);}});},{threshold:.9});document.querySelectorAll('[data-pricing-card] .ps-art').forEach(art=>observer.observe(art));})();
// Honour the same campaign state when a visitor leaves Pricing open at expiry.
(() => {
  const root = document.querySelector('[data-pricing-deadline]');
  const deadline = Date.parse(root?.dataset.pricingDeadline);
  if (!Number.isFinite(deadline)) return;
  let timer, expired = false;
  function update() {
    if (expired) return;
    const remaining = deadline - Date.now();
    if (remaining > 0) { timer = setTimeout(update, Math.min(remaining, 3600000)); return; }
    expired = true;
    root.querySelectorAll('.ps-festive-ticket').forEach(element => element.remove());
    if (root.dataset.pricingPostConfirmed === 'true') return;
    root.querySelector('[data-pricing-authorisation-price]')?.replaceChildren(document.querySelector('[data-pricing-neutral]')?.content.cloneNode(true));
    root.querySelectorAll('[data-pricing-price-only]').forEach(element => element.remove());
    root.querySelectorAll('.faq details').forEach(element => { if (/£\s*\d/.test(element.textContent)) element.remove(); });
    document.querySelectorAll('script[type="application/ld+json"]').forEach(element => {
      try {
        const schema = JSON.parse(element.textContent);
        if (schema['@type'] === 'FAQPage') {
          schema.mainEntity = schema.mainEntity.filter(item => !/£\s*\d/.test(item.name + item.acceptedAnswer?.text));
          element.textContent = JSON.stringify(schema);
        }
      } catch (_) { /* Leave unrelated structured data untouched. */ }
    });
  }
  update();
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', () => { clearTimeout(timer); update(); });
})();
