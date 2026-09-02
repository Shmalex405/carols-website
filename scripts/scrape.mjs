/**
 * Supplier catalog scraper for Carol's website.
 *
 * Pulls real products (name, link, image) from each supplier, optimizes images
 * to WebP, and writes src/data/generated/<brand>.json which auto-merges into the
 * catalog (see src/data/products.ts).
 *
 * Usage:
 *   node scripts/scrape.mjs trulife            # one brand
 *   node scripts/scrape.mjs trulife abc        # several
 *   node scripts/scrape.mjs all                # every configured brand
 *
 * Must be run with network access (outside the Bash sandbox).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_PRODUCTS = path.join(ROOT, 'public', 'products');
const GENERATED = path.join(ROOT, 'src', 'data', 'generated');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// ────────────────────────────────────────────────────────── helpers ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...(opts.headers || {}) },
        ...opts,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(400 * (i + 1));
    }
  }
}

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const SITE_NAMES = new Set(['almostu', 'amoena', 'nearly me', 'nearlyme', 'juzo', 'trulife', 'american breast care', 'anita']);

// Carol's carries mastectomy/fitting products only — never regular underwear.
// Applied to product titles/slugs in every scrape path.
const UNDERWEAR = /\b(pant(y|ies)|briefs?|thongs?|boy\s?shorts?)\b/i;

/** Human title from a URL slug, e.g. "asymetrical-regular-weight-forms" → "Asymetrical Regular Weight Forms". */
function titleize(slug) {
  return String(slug)
    .replace(/-\d+$/, '')
    .split('-')
    .filter(Boolean)
    .map((w) => (/^(and|the|for|of|in|to|with)$/i.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/** Clean a product name: strip HTML tags, decode entities, collapse whitespace. */
function cleanName(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+([®™,.])/g, '$1')
    .trim();
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&[a-z]+;/gi, ' ');
}

function cleanBlurb(html, fallback) {
  if (!html) return fallback;
  let t = decodeEntities(String(html).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return fallback;
  // first sentence-ish, capped
  const firstStop = t.search(/[.!?]\s/);
  if (firstStop > 40 && firstStop < 180) t = t.slice(0, firstStop + 1);
  else if (t.length > 180) t = t.slice(0, 177).replace(/\s\S*$/, '') + '…';
  return t;
}

const COLORS = new Set([
  'black', 'white', 'sand', 'nude', 'ivory', 'beige', 'bronze', 'blue', 'navy', 'pink',
  'red', 'rose', 'berry', 'mocha', 'champagne', 'skin', 'taupe', 'grey', 'gray', 'green',
  'teal', 'purple', 'lavender', 'coral', 'plum', 'wine', 'aqua', 'turquoise', 'peach',
  'silver', 'gold', 'cream', 'chai', 'espresso', 'smoke', 'blush', 'orchid', 'multi', 'print',
  'lightblue', 'darkblue', 'patriot', 'floral',
]);

/** Group key for color/size variants: last URL segment minus trailing id + color. */
function variantBaseKey(url) {
  let seg = url.replace(/\/$/, '').split('/').pop() || url;
  seg = seg.replace(/-\d+$/, ''); // trailing product id
  const parts = seg.split('-');
  while (parts.length > 2 && COLORS.has(parts[parts.length - 1])) parts.pop();
  return parts.join('-');
}

/** Depth-first pull the first usable image URL out of a JSON-LD image value. */
function firstImage(image) {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    for (const x of image) {
      const r = firstImage(x);
      if (r) return r;
    }
    return null;
  }
  if (typeof image === 'object') return image.url || image.contentUrl || null;
  return null;
}

/** Real product image from JSON-LD Product schema (better than og:image on some sites). */
function extractLdImage(html) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    let j;
    try {
      j = JSON.parse(b);
    } catch {
      continue;
    }
    const nodes = Array.isArray(j) ? j : [j];
    for (const node of nodes) {
      if (node && /product/i.test(node['@type'] || '')) {
        const img = firstImage(node.image);
        if (img) return img;
      }
    }
  }
  return null;
}

/** Fetch a product page and read title/image/description (JSON-LD + Open Graph). */
async function fetchProductMeta(url, imageFrom) {
  const html = await (await fetchWithRetry(url)).text();
  const og = (prop) => {
    const m =
      html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
    return m ? decodeEntities(m[1]) : null;
  };
  const rawTitle = og('title') || (html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '');
  let title = cleanName(rawTitle).replace(/^buy\s+/i, '');
  // strip trailing site-name suffix e.g. " | Amoena USA", " - Trulife"
  title = title.replace(/\s*[|–-]\s*(amoena(\s+usa)?|nearly\s?me|almost\s?u|juzo|trulife|american breast care|anita(\s+care)?)\s*$/i, '').trim();
  const cs = title.match(/\s[-–]\s([A-Za-z]+)$/); // trailing " - ivory" color suffix
  if (cs && COLORS.has(cs[1].toLowerCase())) title = title.slice(0, cs.index).trim();

  const ldImg = extractLdImage(html);
  const ogImg = og('image');
  const image = imageFrom === 'ld' ? ldImg || ogImg : ogImg || ldImg;
  return { title, image, blurb: cleanBlurb(og('description')) };
}

/** Simple concurrency-limited map */
async function pMap(items, limit, fn) {
  const out = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function downloadImage(url, brand, slug, referer) {
  if (!url) return null;
  try {
    const abs = url.startsWith('//') ? 'https:' + url : url;
    const res = await fetchWithRetry(abs, { headers: { Referer: referer } });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 900) return null; // skip tiny/placeholder
    const dir = path.join(PUBLIC_PRODUCTS, brand);
    fs.mkdirSync(dir, { recursive: true });
    const file = slug + '.webp';
    await sharp(buf)
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(dir, file));
    return `/products/${brand}/${file}`;
  } catch (e) {
    return null;
  }
}

// ─────────────────────────────────────────────────── source methods ──

/** Shopify: /collections/<handle>/products.json (paginated) */
async function shopifyCollection(base, handle) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetchWithRetry(`${base}/collections/${handle}/products.json?limit=250&page=${page}`);
    const json = await res.json();
    const items = json.products || [];
    all.push(...items);
    if (items.length < 250) break;
  }
  return all.map((p) => ({
    title: cleanName(p.title),
    url: `${base}/products/${p.handle}`,
    image: (p.images && p.images[0] && p.images[0].src) || null,
    blurb: cleanBlurb(p.body_html),
    slug: slugify(p.handle || p.title),
  }));
}

/** WooCommerce Store API: /wp-json/wc/store/v1/products (paginated) */
async function wooProducts(base, categoryId) {
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const q = new URLSearchParams({ per_page: '100', page: String(page) });
    if (categoryId) q.set('category', String(categoryId));
    const res = await fetchWithRetry(`${base}/wp-json/wc/store/v1/products?${q}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if (items.length < 100) break;
  }
  return all.map((p) => ({
    title: cleanName(p.name),
    url: p.permalink,
    image: (p.images && p.images[0] && (p.images[0].src || p.images[0].thumbnail)) || null,
    blurb: cleanBlurb(p.short_description || p.description),
    slug: slugify(p.slug || p.name),
  }));
}

/** Generic scrape: fetch listing page(s), collect product links, read og tags. */
async function scrapeCategory(base, listUrls, linkPattern) {
  const productUrls = new Set();
  for (const listUrl of listUrls) {
    for (let page = 1; page <= 15; page++) {
      const url = page === 1 ? listUrl : listUrl + (listUrl.includes('?') ? '&' : '?') + 'p=' + page;
      let html;
      try {
        html = await (await fetchWithRetry(url)).text();
      } catch {
        break;
      }
      const before = productUrls.size;
      const re = new RegExp(`href="([^"]*${linkPattern}[^"]*)"`, 'gi');
      let m;
      while ((m = re.exec(html))) {
        let href = m[1].split('?')[0].split('#')[0];
        if (href.startsWith('/')) href = base + href;
        if (href.startsWith('http') && !href.match(/\.(jpg|png|css|js)$/i)) productUrls.add(href);
      }
      if (productUrls.size === before) break; // no new products → stop paginating
    }
  }
  const urls = [...productUrls];
  const products = await pMap(urls, 6, async (url) => {
    try {
      const html = await (await fetchWithRetry(url)).text();
      const og = (prop) => {
        const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
        return m ? decodeEntities(m[1]) : null;
      };
      const rawTitle = og('title') || (html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '');
      const image = og('image');
      const desc = og('description');
      if (!image) return null;
      const slugSeg = url.replace(/\/$/, '').split('/').filter(Boolean).pop();
      let title = rawTitle.replace(/\s*[|–-]\s*[^|–-]*$/, '').trim();
      if (!title || title.length < 4 || SITE_NAMES.has(title.toLowerCase())) title = titleize(slugSeg);
      if (!title) return null;
      await sleep(100);
      return { title, url, image, blurb: cleanBlurb(desc), slug: slugify(slugSeg) };
    } catch {
      return null;
    }
  });
  return products.filter(Boolean);
}

/** Magento (Hyvä) listing: product tiles are anchors with data-product-id; pages use ?p=N. */
async function magentoListing(listUrl, titleStyle) {
  const bases = new Set();
  for (let page = 1; page <= 15; page++) {
    const url = page === 1 ? listUrl : `${listUrl}?p=${page}`;
    let html;
    try {
      html = await (await fetchWithRetry(url)).text();
    } catch {
      break;
    }
    const before = bases.size;
    const re = /<a href="(https?:\/\/[^"]+)"[^>]*data-product-id="\d+"/gi;
    let m;
    while ((m = re.exec(html))) bases.add(m[1].split('#')[0].split('?')[0]);
    if (bases.size === before) break; // no new products → stop paginating
  }
  const products = await pMap([...bases], 6, async (url) => {
    try {
      const meta = await fetchProductMeta(url);
      if (!meta.title || !meta.image) return null;
      await sleep(80);
      const slugSeg = url.replace(/\/$/, '').split('/').pop().replace(/\.html$/, '');
      return {
        title: titleStyle === 'dashCaps' ? dashCapsTitle(meta.title) : meta.title,
        url,
        image: meta.image,
        blurb: meta.blurb,
        slug: slugify(slugSeg),
      };
    } catch {
      return null;
    }
  });
  return products.filter(Boolean);
}

/** "LOTTA - Mastectomy bra" → "Lotta Mastectomy Bra" */
function dashCapsTitle(t) {
  const tc = (s) => s.toLowerCase().replace(/(^|[\s\-/])[a-z]/g, (c) => c.toUpperCase());
  return String(t)
    .split(/\s+[-–]\s+/)
    .map(tc)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────────────────── config ──
// Filled in per brand as we validate each site. See scrape order in README-ish
// comments. `method` picks the source strategy above.
const CONFIG = {
  trulife: {
    base: 'https://trulife.com',
    method: 'shopify',
    categories: [
      { slug: 'breast-forms', sources: ['breast-forms', 'partials', 'lightweight-silicone'], tags: ['silicone'] },
      { slug: 'mastectomy-bras', sources: ['bras'], tags: ['pocketed'] },
      { slug: 'camisoles', sources: ['post-surgery-active', 'post-surgery'], tags: ['post-surgery'] },
      { slug: 'compression', sources: ['lymphoedema-garments'], tags: ['lymphedema'] },
    ],
  },

  abc: {
    base: 'https://americanbreastcare.com',
    method: 'woo',
    categories: [
      // Woo category IDs (from /wp-json/wc/store/v1/products/categories)
      { slug: 'breast-forms', sources: [37, 113, 376, 375, 369, 374, 373, 377, 366, 367, 365, 364], tags: ['form'] },
      { slug: 'mastectomy-bras', sources: [36, 354, 356, 363, 357, 362, 355, 358, 359, 360], tags: ['pocketed'] },
      { slug: 'camisoles', sources: [352, 120, 361], tags: ['post-surgery'] },
    ],
  },

  amoena: {
    base: 'https://www.amoena.com',
    method: 'sitemap',
    imageFrom: 'ld', // real product photo is in JSON-LD, not og:image
    sitemapUrl: 'https://www.amoena.com/sitemap_www_amoena_com_us-en_products.xml',
    excludes: ['/outlet/', '/sale/', '/new-in/', '/bra-accessories/', '/breast-form-accessories/', '-panty-', '-brief-'],
    pathMap: [
      { match: '/post-surgery-recovery-wear/', slug: 'camisoles' },
      { match: '/lymph-care/', slug: 'compression' },
      { match: '/breast-forms/', slug: 'breast-forms' },
      { match: '/pocketed-lingerie/', slug: 'mastectomy-bras' },
    ],
    categories: [
      { slug: 'breast-forms', tags: ['form'] },
      { slug: 'mastectomy-bras', tags: ['pocketed'] },
      { slug: 'camisoles', tags: ['post-surgery'] },
      { slug: 'compression', tags: ['lymphedema'] },
    ],
    cap: 150,
  },

  nearlyme: {
    base: 'https://nearlymeonline.com',
    method: 'sitemap',
    sitemapPaged: 'https://nearlymeonline.com/xmlsitemap.php?type=products&page={page}',
    dedupeVariants: false, // trailing number is a product id, not a color
    excludes: ['xmlsitemap', '/categories', '/brands', '/blog', '/pages/', 'gift-cert',
      'juzo', 'armsleeve', 'arm-sleeve', 'gauntlet', 'lymphedema', 'compression-sleeve'],
    rules: [
      { slug: 'mastectomy-bras', include: ['-bra-', 'mastectomy-bra', 'camisole'], exclude: ['breast-form', 'prosthesis', 'shaper', 'insert', 'enhancer', 'equalizer', 'balancer'] },
      { slug: 'breast-forms', include: ['breast-form', 'prosthesis', 'enhancer', 'shaper', 'insert', 'equalizer', 'balancer', 'breast-fill', 'breast-shap'] },
    ],
    categories: [
      { slug: 'breast-forms', tags: ['form'] },
      { slug: 'mastectomy-bras', tags: ['pocketed'] },
    ],
    cap: 200,
  },

  // Juzo compression sourced via Nearly Me (an authorized Juzo reseller) for
  // reliable product images; branded and categorized as Juzo compression.
  juzo: {
    base: 'https://nearlymeonline.com',
    method: 'sitemap',
    sitemapPaged: 'https://nearlymeonline.com/xmlsitemap.php?type=products&page={page}',
    dedupeVariants: false,
    excludes: ['xmlsitemap', '/categories', '/brands', '/blog', '/pages/'],
    rules: [
      { slug: 'compression', include: ['juzo', 'armsleeve', 'arm-sleeve', 'gauntlet'], exclude: [] },
    ],
    categories: [{ slug: 'compression', tags: ['lymphedema'] }],
    cap: 80,
  },

  // Anita (Magento/Hyvä): mastectomy bras are shoppable list pages. Breast
  // prostheses and the compression / Lymph O Fit lines are NOT sold in Anita's
  // web shop (fitter-channel product), so they're hand-curated below from the
  // anita-care editorial pages — real line names, SKUs, images, and page links,
  // no shoppable product URLs exist. (The "…-bra" short links on those pages go
  // to Anita's B2B trade portal, so every entry points at the public page.)
  anita: {
    base: 'https://www.anita.com',
    method: 'magento',
    titleStyle: 'dashCaps', // og titles look like "LOTTA - Mastectomy bra"
    categories: [
      {
        slug: 'mastectomy-bras',
        sources: ['https://www.anita.com/en/bras/mastectomy-bras.html'],
        tags: ['pocketed'],
      },
    ],
    manual: (() => {
      const CMS = 'https://cdn-01.anita.com/cms//fileadmin/user_upload/Content_Elements/Home/Care/Brustprothesen';
      const FULL = 'https://www.anita.com/en/anita-care/full-prosthetics.html';
      const PARTIAL = 'https://www.anita.com/en/anita-care/partial-prosthetics.html';
      const PRIMARY = 'https://www.anita.com/en/anita-care/primary-care.html';
      const VELVETY = 'https://www.anita.com/en/anita-care/velvety-breast-prostheses.html';
      const form = (name, url, image, blurb, tags) => ({
        name, url, image, blurb, tags, category: 'breast-forms',
      });
      // Compression bras, bandages & Lymph O Fit — all one editorial page.
      const KOMP = 'https://cdn-01.anita.com/cms//fileadmin/user_upload/Content_Elements/Home/Care/Kompressions-BHs___Bandagen';
      const COMPRESSION = 'https://www.anita.com/en/anita-care/compression-bras-bandages.html';
      const comp = (name, image, blurb, tags) => ({
        name, url: COMPRESSION, image: `${KOMP}/${image}`, blurb, tags, category: 'compression',
      });
      return [
        // ── Full silicone forms ─────────────────────────────────
        form('Velvety 1066X', VELVETY, `${CMS}/Velvety/1066X_007_500.jpg`,
          'The Velvety full breast form — a silky-smooth surface that feels like a second skin, made to go with you through every situation.', ['silicone', 'everyday']),
        form('Velvety SoftLite 1068X', VELVETY, `${CMS}/Velvety/1068X_777_VAR.jpg`,
          'Velvety softness in lightweight SoftLite silicone — noticeably lighter for easy all-day comfort.', ['silicone', 'lightweight']),
        form('TriNature SoftLite 1051X', FULL, `${CMS}/Vollversorung/1051X_TriNature_SoftLite.jpg`,
          'A soft, natural form in SoftLite silicone — up to 42% lighter than full-weight forms, lovely for active days.', ['silicone', 'lightweight']),
        form('TriNature 1058X', FULL, `${CMS}/Vollversorung/1058X_TriNature_01.jpg`,
          'The classic TriNature silicone form with complete weight balance and a beautifully natural shape.', ['silicone', 'weighted']),
        form('TriNature Asymmetric SoftLite 1081L/R', FULL, `${CMS}/Vollversorung/1081L_TriNature_Asymmetric.jpg`,
          'Left/right asymmetric TriNature shapes in lighter SoftLite silicone for a precise, natural fit.', ['silicone', 'asymmetric', 'lightweight']),
        form('Softtouch 1052X2', FULL, `${CMS}/Vollversorung/1052X2_Softtouch.jpg`,
          'A wonderfully soft full silicone form with complete weight balance for a secure, even silhouette.', ['silicone', 'weighted']),
        form('Amica Supersoft 1151X', FULL, `${CMS}/Vollversorung/1151X_Amica_SuperSoft.jpg`,
          'An extra-soft silicone form that settles gently and naturally against the body.', ['silicone', 'everyday']),
        form('Valance Vario 1052XV', FULL, `${CMS}/Vollversorung/1052XV_Valance_Vario.jpg`,
          'A soft, skin-friendly full form from the Valance line, made for a comfortable, secure everyday fit.', ['silicone', 'everyday']),
        form('Authentic 1020X', FULL, `${CMS}/Vollversorung/1020X_007_Authentic.jpg`,
          'Soft, thin tapering edges let this full form blend smoothly for a discreet, natural look.', ['silicone', 'everyday']),
        form('Softback 1050X', FULL, `${CMS}/Vollversorung/1050X_Softback.jpg`,
          'Two-layer technology with a soft back layer that rests gently against sensitive skin.', ['silicone', 'everyday']),
        form('Softback Asymmetric 1080L/R', FULL, `${CMS}/Vollversorung/1080L_007_Softback_Asymmetric.jpg`,
          'The two-layer Softback comfort in left/right asymmetric shapes for a tailored fit.', ['silicone', 'asymmetric']),
        form('TriTex 1055X', FULL, `${CMS}/Vollversorung/1055X_TriTex.jpg`,
          'A silicone form with a breathable textile microfibre backing — up to 25% lighter, with a comfortable skin climate.', ['lightweight', 'breathable']),
        form('TriTex Asymmetric 1085L/R', FULL, `${CMS}/Vollversorung/Anita-care-prostheses-TriTex-Asymmetric-1085R.jpg`,
          'TriTex breathable-back comfort in asymmetric left/right shapes.', ['asymmetric', 'breathable']),
        form('Pure Fresh 1086X', FULL, `${CMS}/Vollversorung/1086X_300_Pure_Fresh.jpg`,
          'A light, fresh silicone form designed for comfortable wear on warm, active days.', ['lightweight', 'breathable']),
        form('Active 1054X', FULL, `${CMS}/Vollversorung/1054X_Active.jpg`,
          'A ribbed, breathable sports form with air chambers that help keep you cool while you move.', ['sport', 'lightweight']),
        form('Active Asymmetric 1084L/R', FULL, `${CMS}/Vollversorung/1084L_400x300.png`,
          'The Active sports form in asymmetric left/right shapes for a secure fit during exercise.', ['sport', 'asymmetric']),
        form('TriWing 1053X', FULL, `${CMS}/Vollversorung/1053X_TriWing.jpg`,
          'A full silicone breast form with complete weight balance from the Standard & Soft line.', ['silicone', 'weighted']),
        form('TriVaria 1043X', FULL, `${CMS}/Vollversorung/1043X_TriVaria.jpg`,
          'A versatile full form with complete weight balance and a naturally soft shape.', ['silicone', 'weighted']),
        form('TriCup 1089X', FULL, `${CMS}/Vollversorung/1089X_TriCup.jpg`,
          'A softly shaped full silicone form for a natural profile in the bra cup.', ['silicone', 'everyday']),
        // ── Partial forms & shapers ─────────────────────────────
        form('Velvety LiteShell 1067X', PARTIAL, `${CMS}/Teilversorgung/1067X_Velvety_LiteShell.jpg`,
          'A silky Velvety partial shell that balances the breast after breast-conserving surgery.', ['partial', 'lumpectomy']),
        form('SequiNature 1028X2', PARTIAL, `${CMS}/Teilversorgung/1028X2_SequiNature..jpg`,
          'A soft partial form that layers gently over your own tissue to even out shape.', ['partial', 'lumpectomy']),
        form('Equitex 1057X', PARTIAL, `${CMS}/Teilversorgung/1057X_Equitex.jpg`,
          'A breathable, textile-backed partial form for comfortable everyday balance.', ['partial', 'breathable']),
        form('Equitex Volume 1157X', PARTIAL, `${CMS}/Teilversorgung/1157X_Equitex_Volume.jpg`,
          'The Equitex partial with added volume for fuller balance where you need it.', ['partial', 'breathable']),
        form('Sequitex 1046X', PARTIAL, `${CMS}/Teilversorgung/1046X_Sequitex_01.jpg`,
          'A triangular partial form that can be worn on either side.', ['partial', 'lumpectomy']),
        form('Sequitex Trapez 1045X', PARTIAL, `${CMS}/Teilversorgung/1045X_Sequitex_Trapez.jpg`,
          'A trapeze-shaped partial form for flexible placement wherever balance is needed.', ['partial', 'lumpectomy']),
        form('Volume 1046X2', PARTIAL, `${CMS}/Teilversorgung/1046X2_Volume800x600.jpg`,
          'A partial form that adds gentle volume for an even, natural silhouette.', ['partial', 'lumpectomy']),
        // ── Primary care / first forms ──────────────────────────
        form('TriFirst 1014X', PRIMARY, `${CMS}/Erstversorgung/1014X_TriFirst.jpg`,
          'A gentle textile first form for the tender weeks right after surgery.', ['post-surgery', 'lightweight']),
        form('EquiLight 1018X', PRIMARY, `${CMS}/Erstversorgung/1018X_722_EquiLight.jpg`,
          'A featherlight textile form for primary care — also a comfy silicone-form substitute at home.', ['post-surgery', 'lightweight']),
        form('TriFirst 1019X', PRIMARY, `${CMS}/Erstversorgung/1019X_TriFirst.jpg`,
          'A soft textile first form offering light, gentle balance while you heal.', ['post-surgery', 'lightweight']),
        // ── Post-surgical compression bras & bandages ───────────
        comp('Almeria Compression Bra', '4008X_127_1343_596_038_01.jpg',
          'A front-zip compression bra with a pull handle that makes it easy to fasten on tender days, and soft inner pockets on both sides for a first form or the foam cups it comes with. Sizes XS–XXL.',
          ['compression', 'post-surgery']),
        comp('Leeds Compression Bra', '4111_001_2114_001_031_600x600_01.jpg',
          'Seamless pre-formed cups hold and steady the breast through the healing phase after surgery, easing pressure marks and supporting scar healing. Cups A–F.',
          ['compression', 'post-surgery']),
        comp('Marbella Compression Bra', '1094_001_1343_001_01_035.jpg',
          'Cups of soft, stretchy cotton make this one especially kind to the skin — steadying the breast after plastic or reconstructive surgery while relieving the lymph pathways. Cups A, B/C, D/E.',
          ['compression', 'post-surgery']),
        comp('Marbella Compression Bra with Sevilla Post-Op Belt', '1095_001_1343_001_01_047.jpg',
          'The Marbella bra paired with the “Sevilla” post-op belt for gentle abdominal compression as well — flexibly adjustable as you move through the healing process. Cups A, B/C, D/E.',
          ['compression', 'post-surgery']),
        comp('Munich Compression Bra', '1064_006_1342_006_066.jpg',
          'Steady, comfortable support after breast-conserving therapy or a reduction, lift, or reconstruction — shaped to avoid pressure points and tissue irritation. Cups AA/A–D/E.',
          ['compression', 'post-surgery']),
        comp('Valencia Compression Bra', '1194_047_131_dot.jpg',
          'A cotton-rich compression bra made for care after breast-conserving surgery, with controlled compression over the scar area and a soft, steadying fit. Cups A–E.',
          ['compression', 'post-surgery']),
        comp('Osaka Compression Bra', '1195_006_160_dot.jpg',
          'Designed for scars that run along the lower breast fold — there are no fabric seams there at all — with a breathable, soft terry lining against the skin. Cups A–E.',
          ['compression', 'post-surgery']),
        comp('Sydney Post-Mastectomy Compression Bra', '1091L_734_1091R_734_2114_007_016_dot.jpg',
          'Made for after a mastectomy: an inner panel wraps the thorax to compress the scar area while leaving an opening for the unaffected breast, helping settle swelling. Cups A–D.',
          ['compression', 'post-surgery']),
        comp('Florence ReBelt Compression Panty', '1885_006_5787X_006_020_dot.jpg',
          'Post-operative compression for the abdomen after abdominoplasty or a DIEP flap reconstruction — adjustable as you heal, and kind to your posture. Sizes 60–110 / 34–54.',
          ['compression', 'post-surgery']),
        comp('Ontario Compression Bandage', '2088_006_5726X_006_1426_006_107_dot.jpg',
          'A versatile bandage for the thorax and abdomen after surgery, with even pressure distribution and a breathable fabric that stays comfortable all day. Sizes 0–7.',
          ['compression', 'post-surgery']),
        // ── Lymph O Fit — lymphedema relief garments ────────────
        comp('London Lymph O Fit Bandage', 'Lymph-o-fit-bandage-1100-Anita-care-color.jpg',
          'Lymph O Fit support for the chest and thoracic region, cut high in the back for 360° compression, with a dotted inner structure that gently massages and encourages drainage. Cups A–F.',
          ['lymphedema', 'compression']),
        comp('Helsinki Lymph O Fit Glove', '1113_001_104.jpg',
          'A soft glove for mild lymphedema in the hand, with clean-cut finger edges that will not pinch and a shaped thumb root for even pressure across the back of the hand. Sizes 1–5.',
          ['lymphedema', 'glove']),
        comp('Halifax Lymph O Fit Arm Sleeve', '115_001_1100_001_1343_001_045__1_.jpg',
          'An arm sleeve that continues over the hand, with a clean-cut finger edge, a gap at the thumb root, and flat seams that will not press. Sizes 0–5.',
          ['lymphedema', 'sleeve']),
        comp('Houston Lymph O Fit Arm Sleeve', '2140_001_1100_001_1343_001_041_crop_dot.jpg',
          'A freely adjustable arm sleeve that fastens at the front, with gentle all-over compression and flat seams — also worn after a lymph node transplant. Sizes 1–5.',
          ['lymphedema', 'sleeve']),
        comp('Hamburg Lymph O Fit Arm Sleeve', '1114_001_1100_001_1343_001_061.jpg',
          'A soft everyday sleeve for mild lymphedema in the arm — a non-slip cuff, flat seams, and a clean-cut wrist edge keep it easy to wear. Sizes 1–5.',
          ['lymphedema', 'sleeve']),
        comp('Dubai Lymph O Fit Compression Tights', '1100_007_2114_007_01_040_dot.jpg',
          'Mild compression tights for the legs and groin, with the dotted massage structure and good moisture-wicking to keep the skin comfortable. Sizes 70–100.',
          ['lymphedema', 'compression']),
      ];
    })(),
  },

  almostu: {
    base: 'https://almostu.com',
    method: 'scrape',
    linkPattern: 'collection-details',
    categories: [
      {
        slug: 'breast-forms',
        sources: [
          'https://almostu.com/collection/silicone-breast-prostheses',
          'https://almostu.com/collection/light-weight-forms',
          'https://almostu.com/collection/regular-weight-forms',
        ],
        tags: ['form'],
      },
      {
        slug: 'mastectomy-bras',
        sources: ['https://almostu.com/collection/post-mastectomy-bra-collection'],
        tags: ['pocketed'],
      },
    ],
  },
};

const CATEGORY_WORD = {
  'breast-forms': 'breast form',
  'mastectomy-bras': 'mastectomy bra',
  camisoles: 'recovery camisole',
  swimwear: 'mastectomy swimsuit',
  'turbans-scarves': 'head covering',
  compression: 'compression garment',
};

const BRAND_NAME = {
  amoena: 'Amoena', abc: 'American Breast Care', trulife: 'Trulife',
  nearlyme: 'Nearly Me', almostu: 'Almost U', juzo: 'Juzo', anita: 'Anita Care',
};

/**
 * For JS-rendered sites: pull product URLs from the sitemap and classify them.
 * Supports single or paginated sitemaps, and classification by URL path
 * (cfg.pathMap) or by keywords in the URL (cfg.rules).
 */
async function scrapeBrandSitemap(brand, cfg) {
  console.log(`\n=== ${brand} (sitemap) ===`);
  let urls = [];
  if (cfg.sitemapPaged) {
    for (let p = 1; p <= (cfg.maxPages || 20); p++) {
      let t;
      try {
        t = await (await fetchWithRetry(cfg.sitemapPaged.replace('{page}', p))).text();
      } catch {
        break;
      }
      const locs = [...t.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decodeEntities(m[1]));
      if (!locs.length) break;
      urls.push(...locs);
    }
  } else {
    const xml = await (await fetchWithRetry(cfg.sitemapUrl)).text();
    urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  }
  urls = [...new Set(urls)];

  const classify = cfg.pathMap
    ? (url) => (cfg.pathMap.find((pm) => url.includes(pm.match)) || {}).slug
    : (url) => {
        const s = url.toLowerCase();
        const r = (cfg.rules || []).find(
          (rule) => rule.include.some((k) => s.includes(k)) && !(rule.exclude || []).some((k) => s.includes(k)),
        );
        return r && r.slug;
      };

  const excludes = cfg.excludes || [];
  const buckets = {}; // slug -> Map(variantBaseKey -> url)
  for (const url of urls) {
    if (excludes.some((e) => url.toLowerCase().includes(e))) continue;
    const slug = classify(url);
    if (!slug) continue;
    buckets[slug] = buckets[slug] || new Map();
    // Some sites (Amoena) use color-variant URLs → collapse them. Others use a
    // trailing id to distinguish real products → keep each (dedupeVariants:false).
    const key = cfg.dedupeVariants === false ? url : variantBaseKey(url);
    if (!buckets[slug].has(key)) buckets[slug].set(key, url);
  }

  const out = [];
  for (const cat of cfg.categories) {
    let chosen = [...(buckets[cat.slug]?.values() || [])];
    const CAP = cfg.cap || 140;
    let capped = false;
    if (chosen.length > CAP) {
      capped = true;
      chosen = chosen.slice(0, CAP);
    }
    const built = await pMap(chosen, 6, async (url) => {
      try {
        const meta = await fetchProductMeta(url, cfg.imageFrom);
        if (!meta.title || !meta.image) return null;
        const slug = slugify(url.replace(/\/$/, '').split('/').pop());
        if (UNDERWEAR.test(meta.title) || UNDERWEAR.test(slug)) return null;
        const image = await downloadImage(meta.image, brand, slug, cfg.base);
        if (!image) return null;
        await sleep(60);
        return {
          id: `${brand}-${slug}`,
          name: meta.title,
          brand,
          category: cat.slug,
          blurb: meta.blurb || `A ${CATEGORY_WORD[cat.slug]} from ${BRAND_NAME[brand]}.`,
          image,
          supplierUrl: url,
          tags: cat.tags || [],
        };
      } catch {
        return null;
      }
    });
    const good = built.filter(Boolean);
    console.log(`  ${cat.slug}: ${good.length} products${capped ? ` (capped from ${buckets[cat.slug].size})` : ''}`);
    out.push(...good);
  }

  const byId = new Map();
  for (const p of out) if (!byId.has(p.id)) byId.set(p.id, p);
  const final = [...byId.values()];
  fs.mkdirSync(GENERATED, { recursive: true });
  fs.writeFileSync(path.join(GENERATED, `${brand}.json`), JSON.stringify(final, null, 2));
  console.log(`  → wrote ${final.length} products to src/data/generated/${brand}.json`);
}

// ───────────────────────────────────────────────────────────── main ──
async function scrapeBrand(brand) {
  const cfg = CONFIG[brand];
  if (!cfg) {
    console.log(`(no config for ${brand} yet)`);
    return;
  }
  if (cfg.method === 'sitemap') return scrapeBrandSitemap(brand, cfg);
  console.log(`\n=== ${brand} (${cfg.method}) ===`);
  const seen = new Set();
  const out = [];

  for (const cat of cfg.categories) {
    let raw = [];
    for (const src of cat.sources) {
      try {
        if (cfg.method === 'shopify') raw.push(...(await shopifyCollection(cfg.base, src)));
        else if (cfg.method === 'woo') raw.push(...(await wooProducts(cfg.base, src)));
        else if (cfg.method === 'magento') raw.push(...(await magentoListing(src, cfg.titleStyle)));
        else if (cfg.method === 'scrape') raw.push(...(await scrapeCategory(cfg.base, [src], cat.linkPattern || cfg.linkPattern)));
      } catch (e) {
        console.log(`  ! ${cat.slug} <- ${src}: ${e.message}`);
      }
    }
    // dedupe within brand by url/slug
    const items = [];
    for (const r of raw) {
      const key = r.url || r.slug;
      if (!r.title || !r.image || seen.has(key)) continue;
      if (UNDERWEAR.test(r.title) || UNDERWEAR.test(r.slug || '')) continue;
      seen.add(key);
      items.push(r);
    }
    console.log(`  ${cat.slug}: ${items.length} products`);

    // download images + build entries (limited concurrency)
    const built = await pMap(items, 6, async (r) => {
      const slug = r.slug || slugify(r.title);
      const image = await downloadImage(r.image, brand, slug, cfg.base);
      if (!image) return null;
      return {
        id: `${brand}-${slug}`,
        name: r.title,
        brand,
        category: cat.slug,
        blurb: r.blurb || `A ${CATEGORY_WORD[cat.slug]} from ${BRAND_NAME[brand]}.`,
        image,
        supplierUrl: r.url,
        tags: cat.tags || [],
      };
    });
    out.push(...built.filter(Boolean));
  }

  // hand-curated entries (supplier lines with no shoppable product pages)
  for (const mp of cfg.manual || []) {
    const slug = slugify(mp.name);
    const image = await downloadImage(mp.image, brand, slug, cfg.base);
    out.push({
      id: `${brand}-${slug}`,
      name: mp.name,
      brand,
      category: mp.category,
      blurb: mp.blurb || `A ${CATEGORY_WORD[mp.category]} from ${BRAND_NAME[brand]}.`,
      ...(image ? { image } : {}),
      supplierUrl: mp.url,
      tags: mp.tags || [],
    });
  }
  if (cfg.manual) console.log(`  manual: ${cfg.manual.length} curated entries`);

  // de-dupe by id (keep first)
  const byId = new Map();
  for (const p of out) if (!byId.has(p.id)) byId.set(p.id, p);
  const final = [...byId.values()];

  fs.mkdirSync(GENERATED, { recursive: true });
  fs.writeFileSync(path.join(GENERATED, `${brand}.json`), JSON.stringify(final, null, 2));
  console.log(`  → wrote ${final.length} products to src/data/generated/${brand}.json`);
}

const args = process.argv.slice(2);
const brands = args.includes('all') || args.length === 0 ? Object.keys(CONFIG) : args;
for (const b of brands) await scrapeBrand(b);
console.log('\nDone.');
