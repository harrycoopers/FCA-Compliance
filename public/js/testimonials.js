/* Testimonial carousel (homepage and FCA authorisation page). Presentation only: no requests, account logic or form handlers. */
(() => {
  'use strict';
  // One full cycle through all reviews. Adjust only this value to change speed.
  const TESTIMONIAL_CYCLE_MS = 60000;
  const boot = () => {
    const root = document.querySelector('[data-testimonials]');
    if (!root) return;
    const home = root;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stage = root.querySelector('[data-carousel-stage]');
    const cards = Array.from(root.querySelectorAll('[data-review-index]'));
    const controls = root.querySelector('[data-carousel-controls]');
    const previous = root.querySelector('[data-carousel-prev]');
    const next = root.querySelector('[data-carousel-next]');
    const announcement = root.querySelector('[data-carousel-announcement]');
    const dialog = root.querySelector('[data-review-dialog]');
    const close = root.querySelector('[data-review-close]');
    const quote = root.querySelector('[data-dialog-quote]');
    const attribution = root.querySelector('[data-dialog-attribution]');
    // Native details remain fully usable when JS or dialog support is unavailable.
    if (!stage || cards.length < 2 || !dialog || typeof dialog.showModal !== 'function') return;
    const total = cards.length;
    const summaries = cards.map(card => card.querySelector('summary'));
    const fullTexts = cards.map(card => card.querySelector('[data-full-text]'));
    let phase = 0;
    let hovering = false;
    let focusWithinCarousel = false;
    let inView = !('IntersectionObserver' in window);
    let frame = 0;
    let lastTime = null;
    let spacing = 330;
    let returnFocus = null;
    let pointer = null;
    let lastDragTime = -Infinity;
    const mod = (value, divisor = total) => ((value % divisor) + divisor) % divisor;
    const centredIndex = () => mod(Math.round(phase));
    const canRotate = () => !reduced.matches && !pointer && !hovering &&
      !focusWithinCarousel && !dialog.open && inView && !document.hidden;
    const render = () => {
      const centred = centredIndex();
      cards.forEach((card, index) => {
        const relative = mod(index - phase + total / 2) - total / 2;
        const distance = Math.abs(relative);
        const visible = distance < 2.15;
        const x = Math.sin(relative * .42) / .42 * spacing;
        const y = relative * relative * 13;
        const scale = 1 - Math.min(distance, 3) * .085;
        card.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotateY(${(-relative * 8).toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        card.style.opacity = visible ? String(Math.min(1, (2.15 - distance) / .55)) : '0';
        card.style.visibility = visible ? 'visible' : 'hidden';
        card.style.zIndex = String(20 - Math.round(distance * 2));
        card.inert = !visible;
        card.setAttribute('aria-hidden', String(!visible));
        summaries[index].tabIndex = visible ? 0 : -1;
        card.dataset.centre = String(index === centred);
      });

    };
    const tick = timestamp => {
      frame = 0;
      if (!canRotate()) { lastTime = null; return; }
      if (lastTime !== null) phase = mod(phase + Math.min(64, timestamp - lastTime) * total / TESTIMONIAL_CYCLE_MS);
      lastTime = timestamp;
      render();
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      home.classList.toggle('page-backgrounded', document.hidden);
      if (canRotate()) {
        if (!frame) { lastTime = null; frame = requestAnimationFrame(tick); }
      } else {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        lastTime = null;
      }
    };
    const announce = () => {
      announcement.textContent = `Testimonial ${centredIndex() + 1} of ${total}: ${cards[centredIndex()].querySelector('[data-attribution]').textContent}`;
    };
    const move = direction => {
      phase = mod(Math.round(phase) + direction);
      render(); sync(); announce();
    };
    const measure = () => {
      spacing = Math.max(180, cards[0].offsetWidth * .94 + 18);
      const tallest = Math.max(...cards.map(card => card.offsetHeight));
      stage.style.height = `${Math.max(405, tallest + 85)}px`;
      render();
    };
    const openReview = (index, trigger) => {
      phase = index;
      returnFocus = trigger;
      render();
      // Source HTML contains only server-escaped paragraphs from the supplied DOCX.
      quote.replaceChildren(...Array.from(fullTexts[index].children).map(p => p.cloneNode(true)));
      attribution.textContent = cards[index].querySelector('[data-attribution]').textContent;
      dialog.showModal();
      sync();
      close.focus();
    };
    const closeReview = () => { if (dialog.open) dialog.close(); };
    cards.forEach((card, index) => {
      card.querySelector('[data-full-review]').open = false;
      summaries[index].addEventListener('click', event => {
        event.preventDefault();
        if (Date.now() - lastDragTime < 400) return;
        openReview(index, summaries[index]);
      });
    });
    close.addEventListener('click', closeReview);
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeReview(); });
    dialog.addEventListener('close', () => {
      // Keep rotation paused while focus returns to the review trigger.
      focusWithinCarousel = true;
      returnFocus?.focus({ preventScroll: true });
      sync();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeReview();
    });
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    root.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      hovering = true; sync();
    });
    root.addEventListener('pointerleave', event => {
      if (event.pointerType === 'touch') return;
      hovering = false; sync();
    });
    root.addEventListener('focusin', () => { focusWithinCarousel = true; sync(); });
    root.addEventListener('focusout', event => {
      focusWithinCarousel = root.contains(event.relatedTarget);
      sync();
    });
    stage.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
      summaries[centredIndex()].focus({ preventScroll: true });
    });
    // Native vertical scrolling stays available. A horizontal swipe pauses rotation.
    stage.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, phase, dragging: false };
      sync();
    });
    stage.addEventListener('pointermove', event => {
      if (!pointer || event.pointerId !== pointer.id) return;
      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      if (!pointer.dragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { pointer = null; sync(); return; }
      if (!pointer.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        pointer.dragging = true;
        stage.setPointerCapture?.(event.pointerId);
        sync();
      }
      if (!pointer.dragging) return;
      if (event.cancelable) event.preventDefault();
      phase = mod(pointer.phase - dx / spacing);
      render();
    }, { passive: false });
    const finishPointer = event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      if (pointer.dragging) {
        lastDragTime = Date.now();
        phase = mod(Math.round(phase));
        render(); announce();
      }
      if (stage.hasPointerCapture?.(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      pointer = null; sync();
    };
    stage.addEventListener('pointerup', finishPointer);
    stage.addEventListener('pointercancel', finishPointer);
    reduced.addEventListener?.('change', () => {
      if (reduced.matches) phase = centredIndex();
      render(); sync();
    });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', measure, { passive: true });
    if ('ResizeObserver' in window) {
      const resize = new ResizeObserver(measure);
      resize.observe(stage);
      cards.forEach(card => resize.observe(card));
    }
    if ('IntersectionObserver' in window) {
      const visibility = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.target === root) { inView = entry.isIntersecting; sync(); }
        });
      }, { threshold: 0 });
      visibility.observe(root);
    }
    root.classList.add('testimonials-enhanced');
    controls.hidden = false;
    const hint = root.querySelector('[data-carousel-hint]');
    if (hint) hint.hidden = false;
    measure(); sync();

    // Page entrance animations are handled once, site-wide, by site.js.
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
