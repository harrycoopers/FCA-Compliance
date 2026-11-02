(() => {
 const items = [...document.querySelectorAll('[data-mf-motion]')];
 if (!items.length || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const visible = new Map();
 const sync = item => item.classList.toggle('mf-paused', !visible.get(item) || document.hidden);
 const observer = new IntersectionObserver(entries => entries.forEach(entry => {
   visible.set(entry.target, entry.isIntersecting);
   if (entry.intersectionRatio >= .6) entry.target.classList.add('mf-running');
   sync(entry.target);
 }),{threshold:[0,.6]});
 items.forEach(item => observer.observe(item));
 document.addEventListener('visibilitychange',()=>items.forEach(sync));
})();
