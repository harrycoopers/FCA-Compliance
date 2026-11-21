'use strict';
const { people, organization, identity } = require('./site-identity');
const navigation = require('./guide-navigation');
const { toSchema } = require('../data/faqs');
const pages = require('../config/seo-pages.json');
const guides = require('../config/guide-content.json');
const { paragraphParts } = require('./guide-links');
const { guideText } = require('./guide-editorial');
const guideTitles = Object.fromEntries(Object.entries(guides).map(([url, guide]) => [url, guide.title]));
const offer = require('../config/offer');
const campaign = require('../config/campaign');
const assets = require('../config/asset-manifest.json');
const release = require('../config/release');
const offerLinks = require('../config/guide-offer-links.json');
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
  if (!indexable.has(req.path) && !/^\/(?:build|css|js|fonts|images)\//.test(req.path) && !['/robots.txt', '/sitemap.xml', '/llms.txt', '/logo-dark.png', '/logo-light.png'].includes(req.path)) {
    res.set('X-Robots-Tag', 'noindex, follow');
  }
  // HTML is personalized when signed in: never publicly cache it.
  if (indexable.has(req.path) || /^\/(?:login|register|dashboard|reports|forgot-password|reset-password|verify-email|unsubscribe)(?:\/|$)/.test(req.path)) {
    res.set('Cache-Control', 'private, no-cache');
  }
  next();
}

function templateSeo(req, res, next) {
  res.locals.guideNavigation = navigation;
  res.locals.organization = organization(origin);
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
        const { showPrice } = campaign.state();
        data.pageTitle = showPrice
          ? `FCA Authorisation for Motor Dealers | Get Started for £${offer.startPayment}`
          : 'FCA Authorisation for Motor Dealers | 009 Compliance';
        data.pageDescription = showPrice
          ? `Get help with your motor dealership’s FCA authorisation application. Start for £${offer.startPayment}, then £${offer.monthlyPayment}/month. ${offer.minimumTermTitle}-month minimum. FCA application fee paid separately.`
          : 'FCA authorisation assistance for car, motorcycle, van and commercial vehicle dealers. Help with applications, documents and FCA information requests.';
      }
      if (req.path === '/about') {
        data.team = people(origin);
        data.pageSchema = data.team.map(person => ({ '@context': 'https://schema.org', ...person }));
      }
      if (req.path === navigation.hub) {
        const items = navigation.groups.flatMap(group => group.links);
        data.pageSchema = [{ '@context': 'https://schema.org', '@type': 'ItemList',
          '@id': origin + navigation.hub + '#list', numberOfItems: items.length,
          itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.title, url: origin + item.href })) }];
      }
      if (guide) {
        data.guide = guide;
        data.guideText = guideText;
        data.guidePath = req.path;
        data.guideParagraphParts = (sectionId, index, text) => paragraphParts(req.path, sectionId, index, text);
        data.guideTitles = guideTitles;
        data.pageTitle = guide.seoTitle;
        data.pageDescription = guide.description;
        const dateLabel = value => release.isDate(value) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z')) : value;
        const published = release.resolve(guide.published), modified = release.resolve(guide.modified);
        data.guideModified = modified;
        data.guideReviewedLabel = dateLabel(guide.reviewed);
        data.guideModifiedLabel = modified ? dateLabel(modified) : '';
        data.guideDateLabel = dateLabel;
        // Offer links use a descriptive anchor rotated by the guide's position in the registry.
        data.guideOfferAnchor = offerLinks.anchors[Object.keys(guides).indexOf(req.path) % offerLinks.anchors.length];
        data.guideOfferBanner = guide.group === 'fca' && !offerLinks.bannerExcluded.includes(req.path);
        const authorAnchor = Object.hasOwn(identity.guideAuthors, req.path) ? identity.guideAuthors[req.path] : identity.defaultGuideAuthor;
        data.author = people(origin).find(person => person.url === origin + '/about#' + authorAnchor);
        data.guideFaqs = guide.faqs.map(faq => ({ question: guideText(faq.question), answer: guideText(faq.answer), feeNote: Boolean(faq.feeNote) }));
        data.pageSchema = [
          { '@context': 'https://schema.org', '@type': 'Article', '@id': origin + req.path + '#article',
            headline: guide.title, description: guide.description,
            author: data.author || { '@type': 'Organization', '@id': origin + '/#organization', name: data.organization.name },
            image: data.organization.logo, ...(release.isDate(published) ? { datePublished: published } : {}),
            ...(release.isDate(modified) ? { dateModified: modified } : {}),
            mainEntityOfPage: { '@id': origin + req.path + '#webpage' }, inLanguage: 'en-GB',
            publisher: { '@id': origin + '/#organization' },
            citation: guide.sources.map(source => source.href) }
        ];
        data.pageSchema.push(toSchema(data.guideFaqs.map(({ question, answer }) => ({ question, answer }))));
        data.guideBreadcrumbs = [
          { name: 'Home', path: '/' },
          { name: 'Motor dealer guides', path: navigation.hub },
          { name: guide.title, path: req.path }
        ];
        data.pageSchema.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
          '@id': origin + req.path + '#breadcrumb', itemListElement: data.guideBreadcrumbs.map((item, index) => ({
            '@type': 'ListItem', position: index + 1, name: item.name, item: origin + item.path
          })) });
        data.guideBookingTopic = guide.group === 'ccr' ? 'ccr009' : guide.group === 'fca' ? 'authorisation' : 'ongoing';
        data.guideBookingHref = '/contact?topic=' + data.guideBookingTopic + '#book-meeting';
        data.guideBookingLabel = guide.group === 'ccr' ? 'Book a 15-minute meeting about your CCR009 return' : guide.group === 'fca' ? 'Book a 15-minute meeting about your application' : 'Book a 15-minute meeting about ongoing support';
        data.guideBookingLabel = guideText(data.guideBookingLabel);
        data.ogType = 'article';
      }
      data.canonicalUrl = origin + req.path;
      data.robots = 'index,follow,max-image-preview:large';
      const schemas = (Array.isArray(data.pageSchema) ? data.pageSchema : data.pageSchema ? [data.pageSchema] : []).slice();
      const websiteId = origin + '/#website';
      schemas.push({ '@context': 'https://schema.org', '@type': req.path === navigation.hub ? 'CollectionPage' : 'WebPage',
        ...(req.path === navigation.hub ? { mainEntity: { '@id': origin + navigation.hub + '#list' } } : {}), '@id': data.canonicalUrl + '#webpage', url: data.canonicalUrl,
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
    // HTML description only: retain this page's existing schema and social copy.
    if (valid && req.path === '/ccr009-return-assistance-motor-dealers') {
      data.pageDescription = 'Get help preparing your dealership’s CCR009 return. Organise records and understand the information needed for FCA reporting. Book a 15-minute call.';
    }
    if (!data.ogType || page?.service) data.ogType = 'website';
    return render.call(this, guide ? 'seo_guide' : view, data, callback);
  };
  next();
}

function robots(req, res) {
  res.type('text/plain').send(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
}
function sitemapXml(base = origin) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + [...indexable].map(p => `  <url><loc>${xml(base + p)}</loc><lastmod>${xml(release.resolve(guides[p]?.modified || pages[p].lastmod))}</lastmod></url>`).join('\n') + '\n</urlset>\n';
}
function sitemap(req, res) {
  res.type('application/xml').send(sitemapXml());
}
function llms(req, res) {
  const link = path => '- [' + (guides[path]?.title || pages[path].title.split(' | ')[0]) + '](' + origin + path + ')';
  const services = Object.keys(pages).filter(path => pages[path].service);
  res.type('text/plain').send(['# 009 Compliance', '', '> ' + organization(origin).description,
    '', '## Services', ...[...new Set(['/services', ...services, '/pricing'])].map(link),
    '', '## Guides', link(navigation.hub), link(navigation.overview),
    ...navigation.groups.flatMap(group => ['', '### ' + group.title, ...group.links.map(item => link(item.href))]), ''].join('\n'));
}
module.exports = { publicSeo, templateSeo, robots, sitemap, sitemapXml, llms, assetPath };
