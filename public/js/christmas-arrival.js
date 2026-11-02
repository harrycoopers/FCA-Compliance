/* 009 Christmas arrival. Local vector artwork; no assets or libraries required. */
(() => {
'use strict';
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
document.querySelectorAll('[data-christmas-arrival]').forEach(root => {
 const card=root.querySelector('[data-offer-card]'), fallback=root.querySelector('[data-santa]');
 if(!card || !fallback || root.dataset.arrivalReady) return;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(!ctx) return;
 root.dataset.arrivalReady='true';
 canvas.className='christmas-arrival-canvas';canvas.setAttribute('aria-hidden','true');
 document.body.appendChild(canvas);fallback.hidden=true;
 let W=0,H=0,cx=0,cy=0,scale=1,time=0,last=0,raf=0,visible=false,reduced=motion.matches;
 function resize(){
  W=document.documentElement.clientWidth;H=window.innerHeight;
  const d=Math.min(window.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(W*d)||canvas.height!==Math.round(H*d)){
   canvas.width=Math.round(W*d);canvas.height=Math.round(H*d);
   canvas.style.width=W+'px';canvas.style.height=H+'px';
  }
  ctx.setTransform(d,0,0,d,0,0);
  const b=card.getBoundingClientRect();cx=b.left+b.width*.68;cy=b.top;
  scale=W<480?.78:.96;
 }
const clamp=(x)=>Math.max(0,Math.min(1,x)),ease=x=>1-Math.pow(1-clamp(x),3),mix=(a,b,t)=>a+(b-a)*t;
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()}
function path(d,fill,stroke,width=1){let p=new Path2D(d);if(fill){ctx.fillStyle=fill;ctx.fill(p)}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(p)}}
function line(x,y,x2,y2,color,width){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke()}
function grad(x,y,x2,y2,a,b){let g=ctx.createLinearGradient(x,y,x2,y2);g.addColorStop(0,a);g.addColorStop(1,b);return g}
function star(x,y,s,alpha){ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);path(`M0 ${-s} Q1 -1 ${s} 0 Q1 1 0 ${s} Q-1 1 ${-s} 0 Q-1 -1 0 ${-s}`,'#efcf7b');ctx.restore()}
function santa(x,y,s,state,t){ctx.save();ctx.translate(x,y);ctx.scale(s,s);
let walking=state==='walk',dancing=state==='dance',a=(dancing||walking)?Math.sin(t*Math.PI*2/1.4):0,sway=dancing?Math.sin(t*Math.PI*2/2.8)*3:0,bend=state==='land'?Math.sin(clamp(t/.45)*Math.PI)*8:0;
let torsoY=-43+bend+(dancing?Math.abs(a)*2:0);
// boots and independently articulated legs
for(let side of [-1,1]){let footX=side*11+(dancing?Math.max(0,a*side)*5:0),footY=(dancing||walking)?-Math.max(0,a*side)*(walking?7:3):0;if(state==='sit'){footX=side*18;footY=-10}line(side*10+sway,torsoY+4,side*13, -17+bend,'#9f1430',15);line(side*13,-17+bend,footX,footY-7,'#c8273e',13);line(footX-4,footY-9,footX+4,footY-9,'#fff4df',6);ellipse(footX+side*3,footY-4,11,4,'#142338');line(footX-7,footY-1,footX+7,footY-1,'#425266',2)}
ctx.save();ctx.translate(sway,torsoY);ctx.rotate(dancing?a*.025:0);
path('M-19 -31 Q-27 -20 -25 10 Q0 20 25 10 Q28 -22 18 -31 Z',grad(-26,-20,24,15,'#e84c56','#a50e2f'));
path('M-23 9 Q0 16 24 9',null,'#fff3df',7);path('M0 -24 L0 5',null,'#fff1dc',5);path('M-25 -1 Q0 6 25 -1',null,'#252b35',9);ctx.fillStyle='#e5b75d';ctx.fillRect(-6,-5,12,11);ctx.fillStyle='#303344';ctx.fillRect(-3,-2,6,5);
for(let side of [-1,1]){ctx.save();ctx.translate(side*20,-25);let ang=state==='jump'?side*2.3:state==='sit'?side*.6:dancing?side*(.38+Math.sin(t*4.49+side)*.65)+(Math.sin(t*1.12)>.65?side*1.25:0):side*.14;if(state==='wave'&&side===1)ang=2.3+Math.sin(t*13)*.3;ctx.rotate(-ang);line(0,0,side*4,13,'#c7233d',13);line(side*4,13,side*3,24,'#d53349',11);line(side*3-4,24,side*3+4,24,'#fff0dd',7);ellipse(side*3,31,6,7,'#17253b');ellipse(side*3-side*5,28,3,4,'#25364b');ctx.restore()}
// face, beard and softly trailing cap
ctx.save();ctx.translate(0,-41);ctx.rotate(dancing?-a*.055:0);ellipse(0,-2,19,21,'#fff0d7');ellipse(-17,-4,4,6,'#f4b291');ellipse(17,-4,4,6,'#e9a080');ellipse(0,-7,16,17,grad(-12,-16,13,10,'#ffe3ba','#edab8e'));ellipse(-10,0,5,3,'#ef9a8c');ellipse(10,0,5,3,'#ef9a8c');path('M-17 1 Q-22 18 -7 25 Q0 32 7 25 Q23 17 17 1 Q9 10 0 8 Q-9 10 -17 1','#fff8e9');path('M-14 15 Q0 28 13 15',null,'#e6ddcc',1.5);ellipse(-6,-7,1.6,2,'#253245');ellipse(6,-7,1.6,2,'#253245');path('M-10 -11 Q-6 -14 -3 -11 M3 -11 Q6 -14 10 -11',null,'#fff6e6',2.7);ellipse(0,5,4,3,'#973c42');ellipse(-5,3,7,4,'#fff9ed');ellipse(5,3,7,4,'#fff9ed');ellipse(0,0,4,3.5,'#f5b28f');
ctx.save();ctx.rotate(dancing?a*.035:0);path('M-17 -18 Q-10 -44 11 -33 Q23 -27 24 -13 Q16 -22 8 -23 L17 -18 Z',grad(-10,-36,17,-16,'#e74851','#b91433'));path('M-17 -17 Q0 -22 17 -17',null,'#fff4df',8);ellipse(24,-13,6,6,'#fff7e9');ctx.restore();ctx.restore();ctx.restore();ctx.restore()}
function deer(x,y,s,t,offset){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.translate(0,Math.sin(t*9+offset)*2);
for(let side of [-1,1])for(let k of [0,1]){let hip=k?22:-19,ang=Math.sin(t*10+offset+k*2+side)*.65;ctx.save();ctx.translate(hip,0);ctx.rotate(ang);line(0,0,-5,18,side===-1?'#765039':'#af7750',5);line(-5,18,-14,30,side===-1?'#765039':'#bd875e',4);line(-16,30,-11,31,'#332d2b',5);ctx.restore()}
ellipse(0,-9,31,16,grad(-25,-25,25,5,'#c99665','#8c5839'));path('M-27 -8 Q-45 -18 -43 -44 L-29 -43 Q-29 -28 -13 -18 Z','#b98256');ellipse(-39,-42,17,10,'#bf8c61');ellipse(-50,-39,9,7,'#d4ac7f');ellipse(-57,-40,3,3,'#392c2a');ellipse(-38,-46,2,2,'#1d2330');path('M-33 -50 Q-26 -66 -20 -57 Q-24 -47 -33 -50','#a36d47');path('M-37 -51 L-42 -68 L-39 -78 M-42 -68 L-51 -73 L-53 -81 M-42 -65 L-31 -71 L-30 -79',null,'#735440',3);path('M-28 -29 L-36 -23 M-13 -22 L-7 6',null,'#b8263c',5);ellipse(-31,-25,3,3,'#f3ca69');path('M27 -14 Q44 -25 36 -10 Z','#e6c299');ctx.restore()}
function sleighBack(x,y,s){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ellipse(25,-29,23,26,'#856445');path('M9 -44 Q20 -58 35 -46 L36 -31 L8 -31 Z','#a38252');path('M-42 -37 L-36 7 L40 7 L45 -32 Q32 -46 22 -29 L-20 -24 Z','#86152d');ctx.restore()}
function sleighFront(x,y,s){ctx.save();ctx.translate(x,y);ctx.scale(s,s);path('M-50 -17 Q-42 15 -22 18 L24 18 Q49 17 52 -8 L38 -6 Q36 5 24 4 L-21 4 Q-37 3 -38 -21 Z',grad(0,-20,0,20,'#d63b49','#99122c'),'#edc879',2);path('M-47 22 Q-42 31 -25 31 L36 31 Q55 30 58 18 M-25 17 L-23 30 M27 17 L28 30',null,'#e6c16f',3);path('M-27 10 Q0 23 28 10',null,'#efb866',1);ctx.restore()}
// Present sack sits over Santa's shoulder and follows his body movement.
function presentSack(x,y,s,t=0){
 ctx.save();ctx.translate(x-23*s,y-49*s);ctx.scale(s,s);ctx.rotate(Math.sin(t*4.49)*.035);
 ellipse(-7,12,21,27,grad(-24,-10,13,36,'#b68c43','#715125'));
 path('M-18 -8 L-22 -21 L-8 -17 L1 -22 L5 -7 Z','#c5a05a');
 path('M-18 -7 Q-7 -2 5 -7',null,'#f3cf7a',3);
 path('M-8 -5 Q-1 0 2 8 M-7 -5 Q-14 2 -12 8',null,'#e8bd62',2);
 // Visible wrapped presents and gold ribbons at the open top.
 ctx.fillStyle='#a91e36';ctx.fillRect(-17,-22,13,13);ctx.fillStyle='#f3cd72';ctx.fillRect(-12,-22,3,13);
 ctx.save();ctx.translate(-1,-18);ctx.rotate(.2);ctx.fillStyle='#2d796c';ctx.fillRect(-5,-9,12,15);ctx.fillStyle='#f4d68b';ctx.fillRect(0,-9,2,15);ctx.restore();
 path('M5 -7 Q25 -18 31 -1',null,'#d3ac60',3);ctx.restore();
}
// Artwork faces left natively. Reflect the entire team so reindeer lead to the right.
function teamBack(x,y,s,t,alpha,facing=-1){ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.scale(facing*s,s);
 deer(-177,-14,.76,t,0);deer(-96,-3,.76,t,1.9);
 path('M-156 -31 Q-70 15 -27 -21',null,'#b89251',1.5);
 path('M-88 -22 Q-54 -5 -27 -21',null,'#e2be73',1);
 sleighBack(0,0,1);ctx.restore();}
function teamFront(x,y,s,alpha,facing=-1){ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.scale(facing*s,s);sleighFront(0,0,1);ctx.restore();}
function draw(t){
 const s=scale,landX=cx,landY=cy;
 // Park the entire team to Santa's left, with room for his sack and arms.
 const fleetBase=Math.min(s,Math.max(.4,(landX-58)/285));
 const parkX=landX-285*fleetBase,parkY=landY-31*fleetBase;
 if(reduced){presentSack(landX,landY,s);santa(landX,landY,s,'stand',0);return;}
 const arrival=clamp((t-.4)/3.4),travel=arrival*arrival*(3-2*arrival);
 const climb=ease(clamp((arrival-.3)/.7));
 // Enter at mid-screen height, remain visible, then climb towards the berth.
 let sx=mix(-260*fleetBase,parkX,travel),sy=mix(H*.58,parkY,climb);
 let fleetScale=fleetBase,alpha=1,facing=t<3.8?-1:-Math.cos(clamp((t-3.8)/.65)*Math.PI);
 // A deliberate stationary parking beat while Santa stands and steps off.
 const departing=t>=7.6,departure=clamp((t-7.6)/3.4);
 if(departing){
  // Already turned in the berth: fly out LEFT without crossing Santa.
  facing=1;
  const distance=departure*departure*(3-2*departure);
  sx=mix(parkX,-300*fleetBase,distance);
  sy=parkY+Math.sin(departure*Math.PI)*22*fleetBase;
 }
 const fleetVisible=t<11;
 const stride=t<3.8?t:departing?3.8+(t-7.6):3.8;
 if(fleetVisible){
  for(let i=0;i<12;i++){const z=(t*.55+i*.083)%1;if(t<3.8||departing)star(sx-55*fleetScale-z*115*fleetScale,sy+Math.sin(i*3+t)*8,(1-z)*2.8,alpha*(1-z)*.6);}
  teamBack(sx,sy,fleetScale,stride,alpha,facing);
 }
 if(t<5.1){
  const rise=ease((t-4.15)/.75),footY=sy+13*fleetBase;
  if(t>4.15)presentSack(sx+5*fleetBase,footY,fleetBase*.87);
  santa(sx+5*fleetBase,footY,fleetBase*.87,rise>.8?'stand':'sit',t);
  if(fleetVisible)teamFront(sx,sy,fleetScale,alpha,facing);
 }else{
  // The empty sleigh stays parked while Santa steps over its side with his sack.
  if(fleetVisible)teamFront(sx,sy,fleetScale,alpha,facing);
  if(t<6.8){
   const step=clamp((t-5.1)/1.7),u=step*step*(3-2*step);
   const x=mix(parkX+5*fleetBase,landX,u),y=mix(parkY+13*fleetBase,landY,u)-Math.sin(u*Math.PI)*17*s;
   const size=mix(fleetBase*.87,s,u);
   presentSack(x,y,size,step);santa(x,y,size,'walk',step*2.8);
  }else{
   const dt=t-6.8;ellipse(landX,landY,23*s,2.3*s,'#00000030');
   const pose=dt<.45?'land':dt<1.2?'wave':'dance',danceTime=dt<1.2?dt:dt-1.2;
   presentSack(landX,landY,s,pose==='dance'?danceTime:0);santa(landX,landY,s,pose,danceTime);
   if(dt<.6)for(let i=0;i<7;i++){const a=i/7*Math.PI;star(landX+Math.cos(a)*dt*48,landY-Math.sin(a)*dt*30,2.5*(1-dt/.6),1-dt/.6);}
  }
 }
}

 function render(){resize();ctx.clearRect(0,0,W,H);if(!visible||document.hidden)return;
  // The arrival must remain visible below the card edge while climbing.
  ctx.save();draw(time);ctx.restore();
 }
 function tick(now){raf=0;if(!visible||document.hidden||reduced){last=0;render();return;}
  if(last)time+=Math.min((now-last)/1000,.05);last=now;render();raf=requestAnimationFrame(tick);
 }
 function wake(){cancelAnimationFrame(raf);raf=0;last=0;render();if(visible&&!document.hidden&&!reduced)raf=requestAnimationFrame(tick);}
 function check(){const b=card.getBoundingClientRect();const next=b.top<innerHeight && b.bottom>0;
  if(next!==visible){visible=next;wake();}else if(reduced)render();}
 window.addEventListener('scroll',check,{passive:true});window.addEventListener('resize',()=>{resize();check();if(reduced)render();},{passive:true});
 document.addEventListener('visibilitychange',wake);
 motion.addEventListener('change',e=>{reduced=e.matches;wake();});
 if('ResizeObserver' in window)new ResizeObserver(()=>{resize();check();}).observe(card);
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);raf=0;last=0;});
 window.addEventListener('pageshow',wake);
 resize();check();
});
})();
