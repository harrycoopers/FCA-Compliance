(() => {
  'use strict';
  const root = document.querySelector('[data-guide-id]');
  if (!root || root.dataset.enhanced) return;
  root.dataset.enhanced = 'true';
  // Below-the-fold artwork must not compete with the guide answer and fonts.
  // Its original CSS/static artwork and all links already render server-side.
  const motionSource=root.dataset.guideMotionSrc;
  if(motionSource){
    let loaded=false;
    const loadMotion=()=>{if(loaded)return;loaded=true;const script=document.createElement('script');script.src=motionSource;script.async=true;document.body.append(script);};
    const targets=root.querySelectorAll('[data-guide-gift-slot],[data-guide-full-slot]');
    if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();loadMotion();}},{rootMargin:'300px'});targets.forEach(target=>observer.observe(target));}
    else loadMotion();
  }
  const full=root.querySelector('[data-guide-full-slot]');
  const deadline=Date.parse(full?.dataset.guideDeadline);let expiryTimer,expired=false;
  function expiry(){
    if(!Number.isFinite(deadline)||expired)return;
    const remaining=deadline-Date.now();
    if(remaining>0){expiryTimer=setTimeout(expiry,Math.min(remaining,3600000));return;}
    expired=true;
    const gift=root.querySelector('[data-guide-gift-slot]'),giftPost=root.querySelector('[data-guide-gift-post]'),fullPost=root.querySelector('[data-guide-full-post]');
    if(gift&&giftPost)gift.replaceWith(giftPost.content.cloneNode(true));
    if(fullPost){full.replaceChildren(fullPost.content.cloneNode(true));full.dataset.guideDeadline='';}
    root.querySelectorAll('[data-guide-price-only]').forEach(element=>{
      if(element.dataset.guidePostPriceConfirmed!=='true')element.remove();
    });
    giftPost?.remove();fullPost?.remove();document.dispatchEvent(new Event('guideoffersupdated'));
  }
  expiry();window.addEventListener('pagehide',()=>clearTimeout(expiryTimer));
  window.addEventListener('pageshow',()=>{clearTimeout(expiryTimer);expiry();});
})();
