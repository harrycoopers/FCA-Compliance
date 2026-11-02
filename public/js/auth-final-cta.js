(() => {
 const panel = document.querySelector('.afc-panel');
 const art = panel?.querySelector('.afc-art');
 if (!art || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 let visible = false;
 const sync = () => panel.classList.toggle('afc-paused', !visible || document.hidden);
 new IntersectionObserver(entries => entries.forEach(entry => {
   visible = entry.isIntersecting;
   if (entry.intersectionRatio >= .8) panel.classList.add('afc-on');
   sync();
 }), {threshold:[0,.8]}).observe(art);
 document.addEventListener('visibilitychange', sync);
})();
