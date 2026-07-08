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

const SITE_NAMES = new Set(['almostu', 'amoena', 'nearly me', 'nearlyme', 'juzo', 'trulife', 'american breast care']);

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
  title = title.replace(/\s*[|–-]\s*(amoena(\s+usa)?|nearly\s?me|almost\s?u|juzo|trulife|american breast care)\s*$/i, '').trim();
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
      { slug: 'swimwear', sources: ['swim-activity'], tags: ['pocketed'] },
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
    excludes: ['/outlet/', '/sale/', '/new-in/', '/bra-accessories/', '/breast-form-accessories/'],
    pathMap: [
      { match: '/post-surgery-recovery-wear/', slug: 'camisoles' },
      { match: '/lymph-care/', slug: 'compression' },
      { match: '/breast-forms/', slug: 'breast-forms' },
      { match: '/pocketed-lingerie/', slug: 'mastectomy-bras' },
      { match: '/pocketed-swimwear/', slug: 'swimwear' },
    ],
    categories: [
      { slug: 'breast-forms', tags: ['form'] },
      { slug: 'mastectomy-bras', tags: ['pocketed'] },
      { slug: 'camisoles', tags: ['post-surgery'] },
      { slug: 'swimwear', tags: ['pocketed'] },
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
  nearlyme: 'Nearly Me', almostu: 'Almost U', juzo: 'Juzo',
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
