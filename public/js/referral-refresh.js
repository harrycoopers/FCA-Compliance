(() => {
 const page = document.querySelector('.referral-refresh');
 if (!page || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const milestones = page.querySelector('[data-rr-intro]');
 let visible = false;
 const sync = () => milestones.classList.toggle('rr-paused', !visible || document.hidden);
 if ('IntersectionObserver' in window) new IntersectionObserver(entries => entries.forEach(entry => {
   visible = entry.isIntersecting;
   if (entry.intersectionRatio >= .5) milestones.classList.add('rr-visible');
   sync();
 }), {threshold:[0,.5]}).observe(milestones);
 document.addEventListener('visibilitychange',sync);
 const range = page.querySelector('[data-calc-range]');
 const result = page.querySelector('[data-calc-result]');
 let last = range.value;
 range.addEventListener('input', () => {
   if (last === range.value) return;
   const previous = Number(last);
   const next = Number(range.value);
   if (next > previous) page.querySelectorAll('[data-gift]').forEach(card => {
     const tier = Number(card.dataset.gift);
     if (tier <= previous || tier > next) return;
     if (typeof card.animate === 'function') card.animate([{transform:'translateY(-4px) scale(1)'},{transform:'translateY(-8px) scale(1.04)'},{transform:'translateY(-4px) scale(1)'}],{duration:420,easing:'ease-out'});
     if (typeof Element.prototype.animate !== 'function') return;
     for (let i=0;i<8;i++) {
       const spark = document.createElement('i');
       spark.className = 'rr-spark';
       spark.setAttribute('aria-hidden','true');
       card.appendChild(spark);
       const angle = Math.PI * 2 * i / 8;
       const animation = spark.animate([
         {transform:'translate(-50%,-50%) scale(0)',opacity:0},
         {transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.15},
         {transform:`translate(calc(-50% + ${Math.cos(angle)*42}px),calc(-50% + ${Math.sin(angle)*34}px)) scale(0)`,opacity:0}
       ],{duration:650,easing:'cubic-bezier(.15,.6,.3,1)'});
       animation.onfinish = () => spark.remove();
       animation.oncancel = () => spark.remove();
     }
   });
   last = range.value;
   result.classList.remove('rr-price-pulse');
   void result.offsetWidth;
   result.classList.add('rr-price-pulse');
 });
})();
