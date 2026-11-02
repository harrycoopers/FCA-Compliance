(() => {
 const panel = document.querySelector('.ref-clean');
 const savings = panel?.querySelector('.rc-savings');
 if (!savings || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 let visible = false;
 const sync = () => panel.classList.toggle('rc-paused', !visible || document.hidden);
 new IntersectionObserver(entries => entries.forEach(entry => {
   visible = entry.isIntersecting;
   if (entry.intersectionRatio >= .95) panel.classList.add('rc-active');
   sync();
 }), {threshold:[0,.95]}).observe(savings);
 document.addEventListener('visibilitychange', sync);
})();
