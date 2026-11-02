(() => {
 const section = document.querySelector('.auth-support-refresh');
 if (!section || !('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 section.classList.add('as-motion-ready');
 const scenes = [...section.querySelectorAll('.as-scene')];
 const visibility = new Map();
 const update = scene => {
   const ratio = visibility.get(scene)?.ratio || 0;
   if (visibility.get(scene)?.ready && !document.hidden) scene.classList.add('as-playing');
   scene.classList.toggle('as-paused', document.hidden || ratio === 0);
 };
 const observer = new IntersectionObserver(entries => {
   entries.forEach(entry => {
     visibility.set(entry.target, {ratio:entry.isIntersecting?entry.intersectionRatio:0,ready:entry.isIntersecting&&entry.intersectionRect.height>=Math.min(entry.boundingClientRect.height*.95,Math.max(100,innerHeight-100)*.8)});
     update(entry.target);
   });
 }, {threshold: [0,.1,.25,.5,.75,.95]});
 scenes.forEach(scene => observer.observe(scene));
 document.addEventListener('visibilitychange', () => scenes.forEach(update));
})();
