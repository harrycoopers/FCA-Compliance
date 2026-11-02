/* 009 Compliance — site behaviour (v8).
   Replaces design-motion.js. Navigation, progressive reveal, motion pausing and
   the 15-minute call request journey. The enquiry form, submission toast and
   metrics counter remain in main.js; the testimonial carousel in testimonials.js. */
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const ready = () => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const body = document.body;
    const syncMotion = () => body.classList.toggle('motion-ready', !reduced.matches);
    syncMotion();
    reduced.addEventListener?.('change', syncMotion);

    /* ---------- Header ---------- */
    const header = document.querySelector('[data-site-header]');
    const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const menuButton = document.getElementById('mobileMenuBtn');
    const menu = document.getElementById('mobileMenu');
    if (menuButton && menu) {
      const setMenu = (open, restoreFocus = false) => {
        menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        menu.hidden = !open;
        body.classList.toggle('mobile-menu-open', open);
        document.querySelectorAll('.site-main,.gf').forEach(el => { el.inert = open; });
        document.dispatchEvent(new Event('mobilemenuchange'));
        if (open) menu.querySelector('a')?.focus({ preventScroll: true });
        if (restoreFocus) menuButton.focus();
      };
      menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') setMenu(false, true);
        if (event.key === 'Tab' && !menu.hidden) {
          const items = [menuButton, ...menu.querySelectorAll('a[href],button:not(:disabled)')];
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      });
      menu.addEventListener('click', (event) => { if (event.target.closest('a')) setMenu(false); });
      document.addEventListener('pointerdown', event => { if (!menu.hidden && !header.contains(event.target)) setMenu(false); });
      window.matchMedia('(min-width: 1180px)').addEventListener?.('change', (event) => { if (event.matches) setMenu(false); });
    }
    const measureHeader = () => {
      const barHeight = header?.querySelector('.gh__bar')?.getBoundingClientRect().height || 76;
      const topInset = header ? parseFloat(getComputedStyle(header).paddingTop) || 0 : 0;
      document.documentElement.style.setProperty('--header-height', `${barHeight + topInset}px`);
    };
    measureHeader();
    if (header && 'ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header.querySelector('.gh__bar'));
    window.addEventListener('resize', measureHeader, { passive: true });

    const serviceMenu = document.querySelector('.gh__menu');
    if (serviceMenu) {
      const trigger = serviceMenu.querySelector('a');
      const panel = serviceMenu.querySelector('.gh__dropdown');
      serviceMenu.addEventListener('pointerenter', () => serviceMenu.classList.remove('menu-dismissed'));
      serviceMenu.addEventListener('focusin', (event) => {
        if (!serviceMenu.contains(event.relatedTarget)) serviceMenu.classList.remove('menu-dismissed');
      });
      serviceMenu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { trigger.focus(); serviceMenu.classList.add('menu-dismissed'); }
        if (event.key === 'ArrowDown' && event.target === trigger) {
          event.preventDefault();
          serviceMenu.classList.remove('menu-dismissed');
          panel?.querySelector('a')?.focus();
        }
      });
    }

    /* ---------- Motion: reveal once, pause decoration offscreen ---------- */
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));

      const motionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('is-offscreen', !entry.isIntersecting));
      }, { threshold: 0 });
      document.querySelectorAll('[data-motion]').forEach((el) => motionObserver.observe(el));
    } else {
      document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'));
    }
    const syncVisibility = () => body.classList.toggle('page-backgrounded', document.hidden);
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();

    /* ---------- Mobile sticky call CTA ---------- */
    const bar = document.querySelector('[data-mobile-cta]');
    if (bar) {
      const blockers = [...document.querySelectorAll('.gf,#book-meeting,#send-message,main form')];
      const inView = new Set();
      const update = () => {
        const editing = document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
        const viewport = window.visualViewport;
        const keyboard = viewport && window.innerHeight - viewport.height > 150;
        const blocked = 'IntersectionObserver' in window ? inView.size > 0 : blockers.some(el => { const r=el.getBoundingClientRect(); return r.height>0 && r.top<window.innerHeight && r.bottom>0; });
        const visible = window.innerWidth <= 760 && window.scrollY > 520 && !blocked && !editing && !keyboard && !body.classList.contains('mobile-menu-open') && !document.querySelector('dialog[open]');
        bar.classList.toggle('is-visible', visible);
        bar.inert = !visible;
        bar.setAttribute('aria-hidden', String(!visible));
      };
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => { for (const entry of entries) entry.isIntersecting ? inView.add(entry.target) : inView.delete(entry.target); update(); });
        blockers.forEach(el => observer.observe(el));
      }
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update, { passive: true });
      window.visualViewport?.addEventListener('resize', update, { passive: true });
      document.addEventListener('focusin', update);
      document.addEventListener('focusout', () => requestAnimationFrame(update));
      document.addEventListener('mobilemenuchange', update);
      document.addEventListener('close', update, true);
      update();
    }

    initMeetingForm();
  };

  /* ==========================================================================
     15-minute call request
     Honest by design: nothing is shown as booked. Success is only displayed
     after the server confirms the request email was sent, and the status is
     always "requested — awaiting confirmation".
     ========================================================================== */
  const UK_TZ = 'Europe/London';

  function londonParts(date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: UK_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return { y: +get('year'), m: +get('month'), d: +get('day'), h: +get('hour'), mi: +get('minute'), wd: get('weekday') };
  }

  // Convert a UK wall-clock date/time to an absolute Date.
  function ukToDate(dateStr, timeStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    const p = londonParts(new Date(guess));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    return new Date(guess - (asUtc - guess));
  }

  function nextWorkingDays(count) {
    const days = [];
    const now = londonParts(new Date());
    let cursor = new Date(Date.UTC(now.y, now.m - 1, now.d, 12));
    while (days.length < count) {
      cursor = new Date(cursor.getTime() + 86400000);
      const dow = cursor.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      days.push(cursor);
    }
    return days;
  }

  function initMeetingForm() {
    const form = document.querySelector('[data-meeting-form]');
    if (!form) return;
    const strip = form.querySelector('[data-date-strip]');
    const nojs = form.querySelector('[data-date-fallback]');
    const tzField = form.querySelector('input[name="visitor_timezone"]');
    const tzNote = form.querySelector('[data-tz-note]');
    const status = form.querySelector('[data-meeting-status]');
    const submit = form.querySelector('[type="submit"]');
    const summary = {
      date: form.querySelector('[data-summary-date]'),
      time: form.querySelector('[data-summary-time]'),
      topic: form.querySelector('[data-summary-topic]')
    };
    const card = form.closest('[data-booking-card]');
    const done = card?.querySelector('[data-meeting-done]');
    const visitorTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
    if (tzField) tzField.value = visitorTz;

    // Build the date strip (next 10 working days). The native date input remains for no-JS.
    if (strip) {
      const fmt = (d, o) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...o }).format(d);
      strip.innerHTML = '';
      nextWorkingDays(10).forEach((d, i) => {
        const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="preferred_date" value="${value}"${i === 0 ? '' : ''}><span><small>${fmt(d, { weekday: 'short' })}</small><b>${fmt(d, { day: 'numeric' })}</b><em>${fmt(d, { month: 'short' })}</em></span>`;
        label.querySelector('input').setAttribute('aria-label', fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }));
        strip.appendChild(label);
      });
      strip.hidden = false;
      if (nojs) { nojs.hidden = true; nojs.querySelectorAll('input').forEach((el) => { el.disabled = true; }); }
    }

    const value = (name) => form.querySelector(`[name="${name}"]:checked`)?.value || form.querySelector(`[name="${name}"]:not([type=radio]):not(:disabled)`)?.value || '';

    const describeDate = (v) => v ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${v}T12:00:00Z`)) : 'Choose a date';

    const refresh = () => {
      const date = value('preferred_date');
      const time = value('preferred_time');
      const topic = form.querySelector('[name="topic"]:checked');
      if (summary.date) summary.date.textContent = describeDate(date);
      if (summary.time) summary.time.textContent = time ? `${time} UK time` : 'Choose a time';
      if (summary.topic) summary.topic.textContent = topic ? topic.closest('label').textContent.trim() : '—';
      if (tzNote) {
        if (date && time && visitorTz && visitorTz !== UK_TZ) {
          const local = new Intl.DateTimeFormat('en-GB', { timeZone: visitorTz, hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(ukToDate(date, time));
          const ukNow = londonParts(new Date());
          const visNow = new Intl.DateTimeFormat('en-GB', { timeZone: visitorTz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
          const same = `${String(ukNow.h).padStart(2, '0')}:${String(ukNow.mi).padStart(2, '0')}` === visNow;
          tzNote.textContent = same ? 'All times are UK time (Europe/London), which matches your current time zone.' : `All times are UK time. ${time} UK time is ${local} where you are (${visitorTz}).`;
        } else {
          tzNote.textContent = 'All times are UK time (Europe/London).';
        }
      }
    };
    form.addEventListener('change', refresh);
    refresh();

    const setError = (field, message) => {
      const el = form.querySelector(`[data-error-for="${field.id}"]`);
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (el) el.textContent = message || '';
    };
    form.querySelectorAll('input[required]').forEach((field) => field.addEventListener('input', () => setError(field, '')));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      status.classList.remove('is-error');
      let firstInvalid = null;
      const date = value('preferred_date');
      const time = value('preferred_time');
      const slotError = form.querySelector('[data-slot-error]');
      if (!date || !time) {
        slotError.textContent = !date && !time ? 'Please choose a date and a time.' : (!date ? 'Please choose a date.' : 'Please choose a time.');
        firstInvalid = form.querySelector(!date ? '[name="preferred_date"]' : '[name="preferred_time"]');
      } else {
        slotError.textContent = '';
      }
      form.querySelectorAll('input[required]').forEach((field) => {
        if (field.type === 'radio' || field.disabled) return;
        let msg = '';
        if (!field.value.trim()) msg = 'This field is required.';
        else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim())) msg = 'Please enter a valid email address.';
        else if (field.type === 'tel' && field.value.replace(/\D/g, '').length < 10) msg = 'Please enter a phone number we can call.';
        setError(field, msg);
        if (msg && !firstInvalid) firstInvalid = field;
      });
      if (firstInvalid) {
        status.textContent = 'Please check the highlighted details.';
        status.classList.add('is-error');
        firstInvalid.focus({ preventScroll: true });
        firstInvalid.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        return;
      }

      submit.disabled = true;
      const label = submit.innerHTML;
      submit.textContent = 'Sending your request…';
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new URLSearchParams(new FormData(form)),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.ok !== true) {
          status.textContent = result.message || 'We could not send your call request just now, so no call has been requested. Please call 03300432377 or email info@009compliance.com.';
          status.classList.add('is-error');
          return;
        }
        if (done) {
          done.querySelector('[data-done-date]').textContent = result.requested?.date || describeDate(date);
          done.querySelector('[data-done-time]').textContent = `${result.requested?.time || time} UK time`;
          form.hidden = true;
          card.querySelector('[data-booking-pill]')?.replaceChildren(document.createTextNode('Request sent'));
          done.hidden = false;
          done.querySelector('h3')?.focus();
        }
      } catch (error) {
        status.textContent = 'We could not send your call request just now, so no call has been requested. Please call 03300432377 or email info@009compliance.com.';
        status.classList.add('is-error');
      } finally {
        submit.disabled = false;
        submit.innerHTML = label;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
