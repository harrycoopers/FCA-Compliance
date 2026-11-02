(() => {
  document.querySelectorAll('[data-booking-studio]').forEach(root => {
    const app = root.querySelector('.bs-app');
    if (!app || root.dataset.ready) return;
    root.dataset.ready = 'true'; app.hidden = false;
    const $ = s => root.querySelector(s);
    const topic = $('[data-bs-topic]');
    const requestedTopic = new URLSearchParams(window.location.search).get('topic');
    if (topic && [...topic.options].some(option => option.value === requestedTopic)) {
      [...topic.options].forEach(option => option.defaultSelected = option.value === requestedTopic);
      topic.value = requestedTopic;
    }
    const dayFormat = new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'});
    const longFormat = new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
    const ukClock = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    function ukNow(){const parts=Object.fromEntries(ukClock.formatToParts(new Date()).map(p=>[p.type,p.value]));return {date:parts.year+'-'+parts.month+'-'+parts.day,time:parts.hour+':'+parts.minute};}
    let londonToday = ukNow().date;
    const monthBase = () => new Date(londonToday.slice(0,7)+'-01T12:00:00Z');
    const monthPicker = document.createElement('select');
    monthPicker.setAttribute('aria-label','Choose call month');
    monthPicker.style.cssText='max-width:100%;font:inherit;color:inherit;background:transparent;border:1px solid #d4e2f0;border-radius:8px;padding:6px;';
    $('[data-bs-month]').replaceChildren(monthPicker);
    $('[data-bs-prev]').setAttribute('aria-label','Previous dates');
    $('[data-bs-next]').setAttribute('aria-label','Next dates');
    const slots=['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];
    let page=0, dayPage=0, date='', time='', availableDate='', availableTimes=[], submitting=false, requestNumber=0;
    const notice=document.createElement('p');notice.setAttribute('role','status');notice.style.cssText='font-size:13px;line-height:1.5;color:#14243a';app.prepend(notice);
    const storedKey='009-active-meeting-request';
    const storage={get(){try{return sessionStorage.getItem(storedKey)}catch{return null}},set(v){try{sessionStorage.setItem(storedKey,v)}catch{}},clear(){try{sessionStorage.removeItem(storedKey)}catch{}}};
    async function fetchAvailability(){
      if(!date)return;const selectedDate=date,n=++requestNumber;availableDate='';availableTimes=[];updateSelection();notice.textContent='Checking availability…';
      try{const response=await fetch('/api/bookings/availability?date='+encodeURIComponent(selectedDate),{cache:'no-store'});const result=await response.json();if(n!==requestNumber)return;if(!response.ok)throw Error(result.error||'Availability could not be checked');availableDate=selectedDate;availableTimes=result.times;notice.textContent='';}
      catch(error){if(n===requestNumber)notice.textContent=error.message;}
      if(n===requestNumber)updateSelection();
    }
    function resultScreen(result){
      showStep(0);$('.bs-progress').hidden=true;$('[data-bs-done]').hidden=false;
      const confirmed=result.status==='confirmed'&&result.kind==='phone';$('[data-bs-done] h4').textContent=confirmed?'Your phone call is booked.':result.kind==='legacy'?'Your existing appointment needs a check.':'Your booking is being processed.';
      $('[data-bs-confirmed]').textContent=result.date+' at '+result.time+' (UK time) · 15 minutes';
      const detail=$('.bs-confirmation-note');detail.replaceChildren();
      if(confirmed){detail.textContent='We’ll call you on the phone number you provided at your booked time. No video link is needed. If you need to change your number or appointment, contact 03300432377 or info@009compliance.com.';notice.textContent='';storage.clear();}
      else{detail.textContent=result.kind==='legacy'?'This appointment was made before phone bookings were introduced. Please contact 03300432377 to confirm the arrangements. Do not make a duplicate booking.':result.status==='needs_attention'?'Your time is held, but the call needs our attention. Please contact us and quote '+result.id+'. Do not submit another booking.':'Your booking is still being checked. Please do not submit another booking.';}
      $('[data-bs-reset]').hidden=!confirmed;$('[data-bs-done] h4').focus();
    }
    async function pollBooking(key){
      for(let attempt=0;attempt<20;attempt++){
        try{const response=await fetch('/api/bookings/status/'+encodeURIComponent(key),{cache:'no-store'});if(response.status===404){storage.clear();return false;}if(!response.ok)throw Error();const result=await response.json();resultScreen(result);if(result.status!=='pending')return true;}catch{notice.textContent='Connection interrupted. Your request may still be processing. Refresh to check its status; please do not book again.';}
        await new Promise(resolve=>setTimeout(resolve,3000));
      }
      notice.textContent='Still processing. You can refresh this page to check again. Please contact us if this continues.';return true;
    }
    function monthDays(){
      const start=monthBase();start.setUTCMonth(start.getUTCMonth()+page);
      const cursor=new Date(start);if(page===0)cursor.setUTCDate(Number(londonToday.slice(-2)));
      const days=[];while(cursor.getUTCMonth()===start.getUTCMonth()){days.push(new Date(cursor));cursor.setUTCDate(cursor.getUTCDate()+1);}
      return days;
    }
    const availability = window.bookingAvailability || {};
    const isBlocked = value => {
      if (!date) return false;
      const weekday = String(new Date(date+'T12:00:00Z').getUTCDay());
      return [availability.dates?.[date], availability.weekly?.[weekday], availability.reservedSlots?.(date, londonToday, slots)].some(times => Array.isArray(times) && times.includes(value));
    };
    const dateLabel=()=>longFormat.format(new Date(date+'T12:00:00Z'));
    const selection=()=>dateLabel()+' at '+time+' (UK time)';
    function updateSelection(){
      const now=ukNow();
      root.querySelectorAll('[name=demo_time]').forEach(input=>{const blocked=isBlocked(input.value)||(availableDate===date&&!availableTimes.includes(input.value));input.disabled=submitting || availableDate!==date || !date || date<now.date || (date===now.date && input.value<=now.time) || blocked;input.parentElement.classList.toggle('is-unavailable',blocked);input.parentElement.title=blocked?'Unavailable':'';input.setAttribute('aria-label',input.value+(input.disabled?' — unavailable':''));input.nextElementSibling.textContent=input.value;if((blocked || date<now.date || (date===now.date && input.value<=now.time)) && input.value===time){time='';input.checked=false;}});
      $('[data-bs-continue]').disabled=submitting||!(date&&time&&availableDate===date); $('[data-bs-selection]').textContent=date&&time?selection():'Choose a date and time to continue.'; }
    function renderDays(){
      const days=monthDays();
      const group=days.slice(dayPage*5,dayPage*5+5);
      $('[data-bs-prev]').disabled=page===0 && dayPage===0;
      $('[data-bs-next]').disabled=page===5 && (dayPage+1)*5>=days.length;
      monthPicker.replaceChildren();
      for(let i=0;i<6;i++){const month=monthBase();month.setUTCMonth(month.getUTCMonth()+i);const option=document.createElement('option');option.value=String(i);option.textContent=month.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});option.selected=i===page;monthPicker.append(option);}
      const host=$('[data-bs-dates]'); host.replaceChildren();
      group.forEach(d=>{const value=d.toISOString().slice(0,10);const label=document.createElement('label');const input=document.createElement('input');input.type='radio';input.name='demo_date';input.value=value;input.checked=value===date;input.disabled=value<londonToday||[0,6].includes(d.getUTCDay());if(input.disabled){label.style.opacity='.38';label.style.cursor='not-allowed';}input.setAttribute('aria-label',longFormat.format(d));const tile=document.createElement('span');const weekday=document.createElement('small');weekday.textContent=value===londonToday?'Today':dayFormat.format(d);const number=document.createElement('b');number.textContent=d.getUTCDate();tile.append(weekday,number);label.append(input,tile);host.append(label);input.addEventListener('change',()=>{if(input.disabled)return;date=value;time='';root.querySelectorAll('[name=demo_time]').forEach(el=>el.checked=false);fetchAvailability();});});
    }
    slots.forEach(value=>{const label=document.createElement('label');const input=document.createElement('input');input.type='radio';input.name='demo_time';input.value=value;const tile=document.createElement('span');tile.textContent=value;label.append(input,tile);$('[data-bs-times]').append(label);input.addEventListener('change',()=>{time=value;updateSelection();});});
    function showStep(n){root.querySelectorAll('[data-bs-step]').forEach(el=>el.hidden=el.dataset.bsStep!==String(n));root.querySelectorAll('[data-bs-progress]').forEach(el=>el.classList.toggle('is-current',Number(el.dataset.bsProgress)<=n));}
    monthPicker.onchange=()=>{page=Number(monthPicker.value);dayPage=0;renderDays();};
    $('[data-bs-prev]').onclick=()=>{if(dayPage>0){dayPage--;}else if(page>0){page--;dayPage=Math.floor((monthDays().length-1)/5);}renderDays();};
    $('[data-bs-next]').onclick=()=>{if((dayPage+1)*5<monthDays().length){dayPage++;}else if(page<5){page++;dayPage=0;}renderDays();};
    $('[data-bs-continue]').onclick=()=>{updateSelection();if(!date||!time)return;$('[data-bs-chosen]').textContent=selection();showStep(2);$('[name=name]').focus();};
    $('[data-bs-back]').onclick=()=>{showStep(1);$('[data-bs-continue]').focus();};
    const form=$('[data-bs-form]');
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(submitting)return;
      for(const input of form.querySelectorAll('input')){input.value=input.value.trim();input.setCustomValidity(input.value?'':'Please complete this field.');}
      updateSelection();if(!date||!time||!form.reportValidity())return;
      if(storage.get()){notice.textContent='Checking your previous booking request…';await pollBooking(storage.get());return;}
      const key=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');storage.set(key);
      const body={date,time,name:form.elements.name.value,email:form.elements.email.value,company:form.elements.company.value,phone:form.elements.phone.value,topic:topic?topic.value:'unsure'};
      submitting=true;form.querySelector('[type=submit]').disabled=true;notice.textContent='Reserving your phone call…';
      try{
        const response=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-CSRF-Token':document.querySelector('meta[name="csrf-token"]')?.content||''},body:JSON.stringify(body)});
        const result=await response.json();
        if(!response.ok){if(response.status>=400&&response.status<500){storage.clear();notice.textContent=result.error||'Please check your details.';if(response.status===409){showStep(1);await fetchAvailability();notice.textContent=result.error;}}else{await pollBooking(key);notice.textContent='We could not finish processing. Please refresh to check your request before trying again.';}return;}
        resultScreen(result);if(result.status==='pending')await pollBooking(key);
      }catch{await pollBooking(key);notice.textContent='Connection interrupted. Please refresh to check your booking before trying again.';}
      finally{submitting=false;form.querySelector('[type=submit]').disabled=false;}
    });
    form.addEventListener('input',e=>{if(e.target.setCustomValidity)e.target.setCustomValidity('');});
    $('[data-bs-reset]').onclick=()=>{storage.clear();availableDate='';notice.textContent='';form.reset();page=0;dayPage=0;date='';time='';root.querySelectorAll('[name=demo_time]').forEach(el=>el.checked=false);renderDays();updateSelection();$('[data-bs-done]').hidden=true;$('.bs-progress').hidden=false;showStep(1);$('[data-bs-dates] input').focus();};
    function refreshClock(){const today=ukNow().date;if(today!==londonToday){londonToday=today;page=0;dayPage=0;if(date<today){date='';time='';}renderDays();}if(date&&!submitting)fetchAvailability();else updateSelection();}
    renderDays(); updateSelection();
    if(storage.get())pollBooking(storage.get());
    setInterval(refreshClock,30000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshClock();});
  });
})();
