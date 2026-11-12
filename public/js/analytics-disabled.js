(() => {
  'use strict';
  // Retain the existing property ID as dormant configuration. There is deliberately
  // no Google tag loader, config command, event dispatch or consent interface.
  const measurementId = 'G-BMQFTHWWKP';
  window['ga-disable-' + measurementId] = true;
  window.gtag = function () {}; // Stale callers cannot queue or transmit measurement.
  const guideEvents = new Set(['guide_offer_click', 'guide_booking_cta_click']);
  const queue = window.dataLayer;
  if (Array.isArray(queue)) {
    for (let index = queue.length - 1; index >= 0; index--) {
      const item = queue[index];
      if (guideEvents.has(item?.event) || (item?.[0] === 'event' && guideEvents.has(item[1]))) queue.splice(index, 1);
    }
  }
  // One-way cleanup of the retired preference, not a consent/activation mechanism.
  // Leave essential cookies and all unrelated browser storage alone.
  try { localStorage.removeItem('009.analytics-consent.v1'); } catch (_) {}
})();
