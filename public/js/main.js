document.addEventListener("DOMContentLoaded", () => {
  // Animate user count metric
  const counterEl = document.getElementById("user-count");
  if (counterEl) {
    fetch("/api/metrics")
      .then((res) => res.json())
      .then((data) => {
        const target = Number(data.count || 0);
        const duration = 900;
        const start = performance.now();

        function step(now) {
          const progress = Math.min((now - start) / duration, 1);
          const value = Math.floor(progress * target);
          counterEl.textContent = value.toString();
          if (progress < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
      })
      .catch(() => {});
  }

  // GSAP intro animation for hero section if available
  if (window.gsap) {
    const tl = gsap.timeline();
    tl.from("header", { y: -20, opacity: 0, duration: 0.4 });
    tl.from("h1", { y: 20, opacity: 0, duration: 0.5 }, "-=0.1");
    tl.from(
      ".hero-card, .hero-text, .hero-metric",
      { y: 12, opacity: 0, duration: 0.4, stagger: 0.07 },
      "-=0.2"
    );
  }

  // ===============================
  // Scroll Animations (IntersectionObserver)
  // ===============================
  const revealElements = document.querySelectorAll(
    ".services-clean-hero, .services-clean-hero__img, .services-clean-section, .services-clean-aside, .services-important-note"
  );

  revealElements.forEach((el, index) => {
    el.classList.add("sa-reveal");

    // Optional stagger
    const delay = index % 3;
    if (delay === 1) el.classList.add("sa-delay-1");
    if (delay === 2) el.classList.add("sa-delay-2");
  });

  // Fallback: if IntersectionObserver isn't supported, just show everything
  if (!("IntersectionObserver" in window)) {
    revealElements.forEach((el) => el.classList.add("sa-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("sa-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealElements.forEach((el) => observer.observe(el));
});

function showSuccessToast(message) {
  const toast = document.getElementById("success-toast");
  const msgEl = document.getElementById("success-toast-message");
  if (!toast || !msgEl) return;

  msgEl.textContent = message || "You have successfully completed a Monthly Submission Form!";

  toast.classList.remove("hidden", "animate-slide-out");
  toast.classList.add("animate-slide-in");

  setTimeout(() => {
    toast.classList.remove("animate-slide-in");
    toast.classList.add("animate-slide-out");

    setTimeout(() => {
      toast.classList.add("hidden");
    }, 350);
  }, 5000);
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.__TOAST_SUCCESS__) {
    showSuccessToast(window.__TOAST_SUCCESS__);
  }
});
