'use strict';
/*
 * Release date for this release's new and changed pages.
 *
 * Set RELEASE_DATE to the deploy day (YYYY-MM-DD) before deploying. Every
 * registry date written as the token "RELEASE_DATE" (guide `published` and
 * `modified`, page `lastmod`) resolves to this value: Article datePublished
 * and dateModified, the visible "Guide updated" date, sitemap.xml lastmod.
 *
 * While it is the placeholder, schema dates are omitted, visible labels show
 * the placeholder and scripts/release-final-check.cjs fails the release.
 * RELEASE_DATE_PREVIEW is for local tests and previews only.
 */
const RELEASE_DATE = '2026-11-21';

const TOKEN = 'RELEASE_DATE';
const current = () => process.env.RELEASE_DATE_PREVIEW || RELEASE_DATE;
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
const resolve = value => value === TOKEN ? current() : value;

module.exports = { RELEASE_DATE, TOKEN, current, isDate, resolve };
