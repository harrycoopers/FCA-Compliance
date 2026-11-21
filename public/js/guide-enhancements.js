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
    const targets=root.querySelectorAll('[data-guide-full-slot]');
    if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();loadMotion();}},{rootMargin:'300px'});targets.forEach(target=>observer.observe(target));}
    else loadMotion();
  }
  const full=root.querySelector('[data-guide-full-slot]');
  // Anchor the remaining campaign lifetime to the server's clock. A visitor
  // whose clock is ahead must not reload the same active panel repeatedly.
  const deadline = Date.now() + Number(full?.dataset.guideActiveMs);
  let expiryTimer, expired = false;
  function expiry(){
    if(!Number.isFinite(deadline)||expired)return;
    const remaining=deadline-Date.now();
    if(remaining>0){expiryTimer=setTimeout(expiry,Math.min(remaining,3600000));return;}
    expired=true;
    // Load the server-rendered post-campaign terms and matching FAQ schema together.
    full.hidden = true;
    const banner = root.querySelector('[data-compact-offer]'); if (banner) banner.hidden = true;
    window.location.reload();
  }
  expiry();window.addEventListener('pagehide',()=>clearTimeout(expiryTimer));
  window.addEventListener('pageshow',()=>{clearTimeout(expiryTimer);expiry();});
})();
