(() => {
 const art=document.querySelector('[data-ccr-workflow]');
 if(!art || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const play=()=>{art.classList.add('is-playing');};
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){play();observer.disconnect();}},{threshold:.25});observer.observe(art);}else play();
})();
