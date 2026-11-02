/*
 * Booking link for the 15-minute call — ONE setting.
 *
 * Paste your scheduler link (Calendly, Cal.com, Microsoft Bookings, Google
 * appointment page…) into BOOKING_URL below, or set BOOKING_URL in .env
 * (the .env value wins). Only https:// links are accepted.
 *
 * While empty, the site shows an explicitly labelled booking demo.
 * Demo details stay in the browser and do not reach POST /contact.
 */
const BOOKING_URL = '';

const candidate = process.env.BOOKING_URL || BOOKING_URL;
module.exports = /^https:\/\//i.test(candidate) ? candidate : '';
