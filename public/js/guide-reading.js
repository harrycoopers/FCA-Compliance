/* Guide-only progressive presentation. No text replacement or navigation cloning. */
(() => {
  'use strict';
  const root=document.querySelector('.guide-studio');
  if(!root||root.dataset.readingReady)return;
  root.dataset.readingReady='true';
  const reduced=matchMedia('(prefers-reduced-motion:reduce)'),mobile=matchMedia('(max-width:1000px)');
  const nav=root.querySelector('#guide-navigation'),toc=nav.querySelector('.guide-toc'),links=[...nav.querySelectorAll('a[href^="#"]')];
  const sections=links.map(link=>document.getElementById(link.hash.slice(1))),progress=root.querySelector('.guide-reading-progress');
  const hero=root.querySelector('.ccr009-hero');
  let frame=0,needsMeasure=true,offsets=[],start=0,end=1,header=76,current=-1,lastPercent=-1;
  function render(){
    frame=0;
    if(needsMeasure){
      header=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'))||76;
      offsets=sections.map(section=>section.getBoundingClientRect().top+scrollY);
      const bounds=root.getBoundingClientRect();start=bounds.top+scrollY;end=Math.max(start+1,bounds.bottom+scrollY-innerHeight);needsMeasure=false;
    }
    const fraction=Math.min(1,Math.max(0,(scrollY-start)/(end-start))),percent=Math.round(fraction*100);
    progress.firstElementChild.style.transform=`scaleX(${fraction})`;
    if(percent!==lastPercent){progress.setAttribute('aria-valuenow',String(percent));lastPercent=percent;}
    const readingLine=scrollY+header+(mobile.matches?100:36)+2;
    let active=0;offsets.forEach((top,index)=>{if(top<=readingLine)active=index;});
    if(active!==current){links.forEach((link,index)=>index===active?link.setAttribute('aria-current','location'):link.removeAttribute('aria-current'));current=active;}
  }
  function schedule(measure=false){needsMeasure=needsMeasure||measure;if(!frame)frame=requestAnimationFrame(render);}
  function resize(){toc.open=!mobile.matches;schedule(true);}
  resize();progress.hidden=false;
  addEventListener('scroll',()=>schedule(),{passive:true});addEventListener('resize',()=>schedule(true),{passive:true});
  mobile.addEventListener('change',resize);
  if('ResizeObserver' in window){const observer=new ResizeObserver(()=>schedule(true));observer.observe(root);observer.observe(nav);}
  document.fonts?.ready.then(()=>schedule(true));
  root.addEventListener('toggle',()=>schedule(true),true);
  document.addEventListener('guideoffersupdated',()=>schedule(true));
  root.addEventListener('click',event=>{
    const link=event.target.closest('a[href^="#"]');if(!link)return;
    const target=document.getElementById(link.hash.slice(1));if(!target||!root.contains(target))return;
    if(target===nav)toc.open=true;
    if(target!==nav&&mobile.matches){toc.open=false;if(nav.contains(link)){target.tabIndex=-1;target.focus({preventScroll:true});}schedule(true);}
    for(let parent=target.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  });
  toc.addEventListener('keydown',event=>{if(event.key==='Escape'&&mobile.matches&&toc.open){event.preventDefault();toc.open=false;toc.querySelector('summary').focus();}});
  function revealTarget(){const id=decodeURIComponent(location.hash.slice(1));if(!id)return;const target=document.getElementById(id);if(!target||!root.contains(target))return;if(target===nav)toc.open=true;for(let parent=target.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;schedule(true);}
  addEventListener('hashchange',revealTarget);revealTarget();
  if(!reduced.matches)root.classList.add('guide-hero-on');
  if('IntersectionObserver' in window){
    const accents=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('guide-section-seen');accents.unobserve(entry.target);}});},{threshold:.08});root.querySelectorAll('.ccr009-section').forEach(section=>accents.observe(section));
    let heroVisible=true;
    const syncHero=()=>root.classList.toggle('guide-hero-paused',!heroVisible||document.hidden);
    const visibility=new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;syncHero();});visibility.observe(hero);document.addEventListener('visibilitychange',syncHero);
  }
  addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});addEventListener('pageshow',()=>schedule(true));
})();
