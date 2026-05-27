document.addEventListener("DOMContentLoaded", () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  if (window.gsap && !prefersReducedMotion) {
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
  const revealElements = Array.from(
    document.querySelectorAll(
      ".sa-reveal, .services-clean-hero, .services-clean-hero__img, .services-clean-section, .services-clean-aside, .services-important-note"
    )
  );

  if (!prefersReducedMotion && revealElements.length) {
    document.body.classList.add("sa-animations");
  }

  revealElements.forEach((el, index) => {
    el.classList.add("sa-reveal");

    // Gentle, limited stagger for repeated cards/sections only.
    const delay = index % 4;
    if (delay === 1) el.classList.add("sa-delay-1");
    if (delay === 2) el.classList.add("sa-delay-2");
  });

  if (prefersReducedMotion) {
    revealElements.forEach((el) => el.classList.add("sa-visible"));
    return;
  }

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
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );

  revealElements.forEach((el) => observer.observe(el));
});

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-contact-enquiry-form]");
  if (!form) return;

  const status = form.querySelector("[data-contact-form-status]");
  const toast = document.querySelector("[data-contact-enquiry-toast]");
  const submitButton = form.querySelector(".contact-submit-button");
  const fields = Array.from(form.querySelectorAll("input[required], textarea[required]"));
  let toastTimer;

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message || "";
    status.classList.remove("is-error", "is-success");
    if (message && type) status.classList.add(type);
  }

  function getFieldWrapper(field) {
    return field.closest(".contact-field");
  }

  function getErrorElement(field) {
    return form.querySelector(`[data-error-for="${field.id}"]`);
  }

  function clearFieldError(field) {
    const wrapper = getFieldWrapper(field);
    const error = getErrorElement(field);

    field.removeAttribute("aria-invalid");
    if (wrapper) wrapper.classList.remove("has-error");
    if (error) error.textContent = "";

    if (!fields.some((item) => !item.value.trim())) {
      setStatus("", "");
    }
  }

  function showFieldError(field, message) {
    const wrapper = getFieldWrapper(field);
    const error = getErrorElement(field);

    field.setAttribute("aria-invalid", "true");
    if (wrapper) {
      wrapper.classList.remove("has-error");
      void wrapper.offsetWidth;
      wrapper.classList.add("has-error");
    }
    if (error) error.textContent = message;
  }

  function showEnquiryToast() {
    if (!toast) return;

    window.clearTimeout(toastTimer);
    toast.classList.add("is-visible");

    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 5200);
  }

  fields.forEach((field) => {
    field.addEventListener("input", () => clearFieldError(field));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    let firstInvalidField = null;

    fields.forEach((field) => {
      if (!field.value.trim()) {
        showFieldError(field, "This field is required.");
        if (!firstInvalidField) firstInvalidField = field;
      } else {
        clearFieldError(field);
      }
    });

    if (firstInvalidField) {
      setStatus("Please complete the highlighted fields before submitting your enquiry.", "is-error");
      firstInvalidField.focus({ preventScroll: true });
      firstInvalidField.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setStatus("", "");

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new URLSearchParams(new FormData(form)),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest"
        }
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || result.ok === false) {
        setStatus(
          result.message || "Unable to send your enquiry at the moment. Please try again.",
          "is-error"
        );
        return;
      }

      form.reset();
      showEnquiryToast();
    } catch (error) {
      setStatus(
        "Unable to send your enquiry at the moment. Please email info@009compliance.com directly.",
        "is-error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Submit enquiry";
      }
    }
  });
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
