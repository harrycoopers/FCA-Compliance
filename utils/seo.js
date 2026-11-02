'use strict';
const pages = require('../config/seo-pages.json');
const guides = require('../config/guide-content.json');
const guideTitles = Object.fromEntries(Object.entries(guides).map(([url, guide]) => [url, guide.title]));
const offer = require('../config/offer');
const campaign = require('../config/campaign');
const assets = require('../config/asset-manifest.json');
const origin = new URL(process.env.CANONICAL_BASE_URL || 'https://009compliance.com').origin;
const indexable = new Set(Object.keys(pages));
const serialize = value => JSON.stringify(value).replace(/</g, '\\u003c');
const assetPath = value => assets[value.split('?')[0]] || value;
const normalPath = value => value.toLowerCase().replace(/\/+$/, '') || '/';
const xml = value => value.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

function publicSeo(req, res, next) {
  const canonicalPath = normalPath(req.path);
  if (['GET', 'HEAD'].includes(req.method) && indexable.has(canonicalPath)) {
    // Restrict domain redirects to known production hosts; previews stay usable.
    // Preserve the query verbatim, including advertising IDs and referral state.
    const hostname = req.hostname.toLowerCase();
    const live = hostname === '009compliance.com' || hostname === 'www.009compliance.com';
    const wrongOrigin = live && (req.protocol !== new URL(origin).protocol.slice(0, -1) || hostname !== new URL(origin).hostname);
    if (req.path !== canonicalPath || wrongOrigin) {
      const queryAt = req.originalUrl.indexOf('?');
      const query = queryAt < 0 ? '' : req.originalUrl.slice(queryAt);
      return res.redirect(301, (live ? origin : '') + canonicalPath + query);
    }
  }
  if (!indexable.has(req.path) && !/^\/(?:build|css|js|fonts|images)\//.test(req.path) && !['/robots.txt', '/sitemap.xml', '/logo-dark.png', '/logo-light.png'].includes(req.path)) {
    res.set('X-Robots-Tag', 'noindex, follow');
  }
  // HTML is personalized when signed in: never publicly cache it.
  if (indexable.has(req.path) || /^\/(?:login|register|dashboard|reports|forgot-password|reset-password|verify-email|unsubscribe)(?:\/|$)/.test(req.path)) {
    res.set('Cache-Control', 'private, no-cache');
  }
  next();
}

function templateSeo(req, res, next) {
  res.locals.assetPath = assetPath;
  res.locals.jsonLd = serialize;
  const render = res.render;
  res.render = function(view, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    const data = { ...res.locals, ...options };
    const page = pages[req.path];
    const valid = Boolean(page) && res.statusCode === 200;
    const guide = valid ? guides[req.path] : null;
    if (valid) {
      data.pageTitle = page.title;
      data.pageDescription = page.description;
      if (req.path === '/fca-authorisation-motor-dealers') {
        data.pageTitle = `FCA Authorisation for Motor Dealers | ${campaign.state().showPrice ? `£${offer.startPayment} to Get Started | ` : ''}009 Compliance`;
        data.pageDescription = campaign.state().showPrice
          ? `FCA authorisation assistance for car, motorcycle, van and commercial vehicle dealers. £${offer.startPayment} to start, then £${offer.monthlyPayment}/month. ${offer.minimumTermTitle}-month minimum. FCA fee separate.`
          : 'FCA authorisation assistance for car, motorcycle, van and commercial vehicle dealers. Help with applications, documents and FCA information requests.';
      }
      if (guide) {
        data.guide = guide;
        data.guidePath = req.path;
        data.guideTitles = guideTitles;
        data.pageTitle = guide.seoTitle;
        data.pageDescription = guide.description;
        // Generate structured data from the same content rendered to visitors.
        // Do not retain the superseded route-level FAQ answers.
        data.pageSchema = [
          { '@context': 'https://schema.org', '@type': 'Article', '@id': origin + req.path + '#article',
            headline: guide.title, description: guide.description, dateModified: guide.reviewed,
            mainEntityOfPage: { '@id': origin + req.path + '#webpage' }, inLanguage: 'en-GB',
            publisher: { '@id': origin + '/#organization' },
            citation: guide.sources.map(source => source.href) },
          { '@context': 'https://schema.org', '@type': 'FAQPage', '@id': origin + req.path + '#faq',
            mainEntity: guide.faqs.map(faq => ({ '@type': 'Question', name: faq.question,
              acceptedAnswer: { '@type': 'Answer', text: faq.answer } })) }
        ];
      }
      data.canonicalUrl = origin + req.path;
      data.robots = 'index,follow,max-image-preview:large';
      const schemas = (Array.isArray(data.pageSchema) ? data.pageSchema : data.pageSchema ? [data.pageSchema] : []).slice();
      const websiteId = origin + '/#website';
      schemas.push({ '@context': 'https://schema.org', '@type': 'WebPage', '@id': data.canonicalUrl + '#webpage', url: data.canonicalUrl,
        name: data.pageTitle, description: data.pageDescription, inLanguage: 'en-GB', isPartOf: { '@id': websiteId }, publisher: { '@id': origin + '/#organization' } });
      if (req.path === '/') schemas.push({ '@context': 'https://schema.org', '@type': 'WebSite', '@id': websiteId, url: origin + '/', name: '009 Compliance', inLanguage: 'en-GB', publisher: { '@id': origin + '/#organization' } });
      if (req.path !== '/' && !schemas.some(s => s['@type'] === 'BreadcrumbList')) {
        schemas.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', '@id': data.canonicalUrl + '#breadcrumb', itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: origin + '/' },
          { '@type': 'ListItem', position: 2, name: page.title.split(' | ')[0], item: data.canonicalUrl }
        ] });
      }
      if (page.service && !schemas.some(s => s['@type'] === 'Service')) schemas.push({ '@context': 'https://schema.org', '@type': 'Service', '@id': data.canonicalUrl + '#service', name: page.service, url: data.canonicalUrl,
        description: data.pageDescription, provider: { '@id': origin + '/#organization' }, areaServed: { '@type': 'Country', name: 'United Kingdom' }, audience: { '@type': 'BusinessAudience', audienceType: 'Motor dealers' } });
      data.pageSchema = schemas;
    } else {
      const utility = { login: 'Client Login', register: 'Create Your Client Account', forgot_password: 'Forgotten Password', reset_password: 'Reset Your Password', '404': 'Page Not Found', verify_email_notice: 'Check Your Email' };
      data.pageTitle = `${utility[view] || 'Client Portal'} | 009 Compliance`;
      data.pageDescription = res.statusCode === 404 ? 'This page could not be found. Explore 009 Compliance services or contact our team.' : 'Access and manage your 009 Compliance client account.';
      data.robots = 'noindex,follow';
      data.canonicalUrl = '';
      data.pageSchema = [];
      res.set('X-Robots-Tag', 'noindex, follow');
      res.set('Cache-Control', 'private, no-store');
    }
    data.ogTitle = data.pageTitle;
    data.ogDescription = data.pageDescription;
    if (!data.ogType || page?.service) data.ogType = 'website';
    return render.call(this, guide ? 'seo_guide' : view, data, callback);
  };
  next();
}

function robots(req, res) {
  res.type('text/plain').send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
}
function sitemap(req, res) {
  // No manufactured lastmod dates: this list and metadata share one registry.
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...indexable].map(p => `  <url><loc>${xml(origin + p)}</loc></url>`).join('\n') + '\n</urlset>\n');
}
module.exports = { publicSeo, templateSeo, robots, sitemap, assetPath };
