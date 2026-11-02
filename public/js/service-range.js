(() => {
 const items = [...document.querySelectorAll('[data-range-motion]')];
 if (!items.length || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const states = new Map();
 const sync = item => item.classList.toggle('range-paused', !states.get(item) || document.hidden);
 const observer = new IntersectionObserver(entries => entries.forEach(entry => {
   const card = entry.target.closest('[data-range-motion]');
   states.set(card,entry.isIntersecting);
   if(entry.intersectionRatio >= .8) card.classList.add('range-running');
   sync(card);
 }),{threshold:[0,.8]});
 items.forEach(item=>observer.observe(item.querySelector('.svc__art')));
 document.addEventListener('visibilitychange',()=>items.forEach(sync));
})();
