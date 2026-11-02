(() => {
  document.querySelectorAll('[data-reasons-motion]').forEach(card => {
    if (card.dataset.reasonsReady) return;
    card.dataset.reasonsReady = 'true';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Observe the illustration, not the tall surrounding text panel.
    const artwork = card.querySelector('.reasons-motor');
    if (!artwork) return;
    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      card.classList.add('is-playing');
    };
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 1)) {
          play();
          observer.disconnect();
        }
      }, { threshold: 1 });
      observer.observe(artwork);
    } else {
      const check = () => {
        const rect = artwork.getBoundingClientRect();
        if (rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth) {
          play();
          removeEventListener('scroll', check);
          removeEventListener('resize', check);
        }
      };
      addEventListener('scroll', check, { passive: true });
      addEventListener('resize', check);
      check();
    }
  });
})();
