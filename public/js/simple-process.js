(() => {
 document.querySelectorAll('[data-simple-process]').forEach(process => {
  if(process.dataset.ready)return;
  process.dataset.ready='true';
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const cards=[...process.children];
  if(!('IntersectionObserver' in window)){cards.forEach(card=>card.classList.add('is-playing'));return;}
  const observer=new IntersectionObserver(entries=>{
   entries.forEach(entry=>{if(entry.isIntersecting && entry.intersectionRect.height >= Math.min(entry.boundingClientRect.height*.75, Math.max(100,innerHeight-100)*.8)){entry.target.classList.add('is-playing');observer.unobserve(entry.target);}});
  },{threshold:[0,.1,.25,.5,.75]});
  cards.forEach(card=>observer.observe(card));
 });
})();
