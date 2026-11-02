(() => {
 const items = [...document.querySelectorAll('[data-oc-motion]')];
 if (!items.length || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const visible = new Map();
 const sync = item => item.classList.toggle('oc-paused', !visible.get(item) || document.hidden);
 const observer = new IntersectionObserver(entries => entries.forEach(entry => {
   visible.set(entry.target, entry.isIntersecting);
   if (entry.intersectionRatio >= .4) entry.target.classList.add('oc-running');
   sync(entry.target);
 }),{threshold:[0,.4]});
 items.forEach(item => observer.observe(item));
 document.addEventListener('visibilitychange', () => items.forEach(sync));
})();
