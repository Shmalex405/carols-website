/**
 * Product catalog data — curated, not a full mirror.
 *
 * Carol's is a fitting specialist and reseller, so this is a browsable showcase,
 * NOT a store: no prices, no cart. Each product links out to the supplier's page
 * for full detail, and every card invites the visitor to "Ask Jen" or book.
 *
 * HOW TO EDIT
 *  - Add a product by appending to `products` below with a real supplier URL.
 *  - `image` is optional; if omitted, a tasteful lettered tile is shown.
 *    To add a photo, drop the file in /public/products/ and set
 *    image: '/products/your-file.jpg'.
 *  - `brand` must be one of the keys in `brands`.
 *  - `category` must be one of the category `slug`s below.
 */

export type CategorySlug =
  | 'breast-forms'
  | 'mastectomy-bras'
  | 'camisoles'
  | 'compression';

export interface Category {
  slug: CategorySlug;
  title: string;
  /** Short line for cards */
  short: string;
  /** Intro paragraph for the category page */
  description: string;
  /** Gradient tint [from, to] for the category card */
  tint: [string, string];
}

export interface Brand {
  name: string;
  url: string;
}

export interface Product {
  /** Stable unique id, kebab-case */
  id: string;
  name: string;
  /** Key into `brands` */
  brand: keyof typeof brands;
  category: CategorySlug;
  /** One or two friendly sentences — comfort/fit language, no invented specs */
  blurb: string;
  /** Short bullet highlights */
  features?: string[];
  /** Optional local image path, e.g. '/products/amoena-natura.jpg' */
  image?: string;
  /** Link to the product / line on the supplier site for full detail */
  supplierUrl: string;
  /** Free-form tags used for on-page filtering, e.g. 'lightweight' */
  tags?: string[];
  featured?: boolean;
}

export const brands = {
  amoena: { name: 'Amoena', url: 'https://www.amoena.com/' },
  abc: { name: 'American Breast Care', url: 'https://americanbreastcare.com/' },
  trulife: { name: 'Trulife', url: 'https://trulife.com/' },
  nearlyme: { name: 'Nearly Me', url: 'https://nearlymeonline.com/' },
  almostu: { name: 'Almost U', url: 'https://almostu.com/' },
  juzo: { name: 'Juzo', url: 'https://www.juzo.com/' },
} as const satisfies Record<string, Brand>;

export const categories: Category[] = [
  {
    slug: 'breast-forms',
    title: 'Breast Forms & Prostheses',
    short: 'Silicone, lightweight, weighted & partial shapers',
    description:
      'The heart of what we do. From full silicone forms to feather-light and weighted styles, symmetrical shapers, and partials for lumpectomy or reconstruction — fitted so they feel balanced, secure, and truly yours.',
    tint: ['#f6e9e3', '#e6c9cf'],
  },
  {
    slug: 'mastectomy-bras',
    title: 'Mastectomy Bras',
    short: 'Pocketed bras for everyday comfort & support',
    description:
      'Soft, beautiful pocketed bras that hold your form gently and securely — everyday, leisure, wireless, and post-surgery styles in a full range of sizes.',
    tint: ['#f1e6ec', '#dcc2d0'],
  },
  {
    slug: 'camisoles',
    title: 'Camisoles & Recovery',
    short: 'Gentle post-surgery camisoles with drain pockets',
    description:
      'Comfort for the earliest days. Post-surgical camisoles with soft, adjustable forms and built-in pockets to manage drains with dignity while you heal.',
    tint: ['#f4ece0', '#e7d3bd'],
  },
  {
    slug: 'compression',
    title: 'Compression & Lymphedema',
    short: 'Juzo sleeves, gauntlets & gloves — certified fitting',
    description:
      'Jen is certified in fitting lymphedema compression. Graduated-compression arm sleeves, gauntlets, and gloves from Juzo, measured and fitted for effective, comfortable, all-day support.',
    tint: ['#e4eae2', '#cadccd'],
  },
];

/**
 * Starter seed of real product lines. This is intentionally a curated subset;
 * it will be verified and expanded against each supplier's catalog. Blurbs use
 * general comfort/fit language rather than invented technical specifications.
 */
const seedProducts: Product[] = [
  // ── Breast Forms ─────────────────────────────────────────────
  {
    id: 'amoena-natura',
    name: 'Amoena Natura Collection',
    brand: 'amoena',
    category: 'breast-forms',
    blurb:
      'A beautifully natural silicone form that warms to your body and moves softly with you — a longtime favorite for everyday wear.',
    features: ['Natural look & feel', 'Softly weighted', 'Range of shapes'],
    supplierUrl: 'https://www.amoena.com/global/product-worlds/',
    tags: ['silicone', 'weighted', 'everyday'],
    featured: true,
  },
  {
    id: 'amoena-adapt-air',
    name: 'Amoena Adapt Air',
    brand: 'amoena',
    category: 'breast-forms',
    blurb:
      'An adjustable air-chamber form — Jen can fine-tune the fit and volume with a small hand pump for a personalized, comfortable match.',
    features: ['Adjustable fit', 'Lightweight feel', 'Great after reconstruction'],
    supplierUrl: 'https://www.amoena.com/global/product-worlds/',
    tags: ['lightweight', 'adjustable'],
    featured: true,
  },
  {
    id: 'abc-classic',
    name: 'American Breast Care Classic Forms',
    brand: 'abc',
    category: 'breast-forms',
    blurb:
      'Dependable, well-shaped silicone forms in symmetrical and asymmetrical styles to balance your natural silhouette.',
    features: ['Symmetrical & asymmetrical', 'Everyday wear'],
    supplierUrl: 'https://americanbreastcare.com/',
    tags: ['silicone', 'everyday'],
  },
  {
    id: 'trulife-153-cara',
    name: 'Trulife 153 Cara',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A customizable medical-grade silicone form with cooling comfort — it can be worn several ways to keep you comfortable and confident all day.',
    features: ['Customizable fit', 'Cooling comfort', 'Silicone'],
    image: '/products/trulife/153-cara.webp',
    supplierUrl: 'https://trulife.com/products/153-cara',
    tags: ['silicone', 'everyday'],
    featured: true,
  },
  {
    id: 'trulife-151-sublime-aris',
    name: 'Trulife 151 Sublime Arís',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A soft, refined silicone form from the Sublime line, shaped to sit close and feel wonderfully natural.',
    features: ['Natural feel', 'Soft backing', 'Silicone'],
    image: '/products/trulife/151-sublime-aris.webp',
    supplierUrl: 'https://trulife.com/products/151-sublime-aris',
    tags: ['silicone', 'everyday'],
  },
  {
    id: 'trulife-101-impressions-ii',
    name: 'Trulife 101 Impressions II',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A classic full silicone form with a beautifully natural shape and a balanced, comfortable drape.',
    features: ['Full silicone', 'Natural shape'],
    image: '/products/trulife/101-impressions-ii.webp',
    supplierUrl: 'https://trulife.com/products/101-impressions-ii',
    tags: ['silicone', 'everyday'],
  },
  {
    id: 'trulife-471-silk-triangle',
    name: 'Trulife 471 Silk Triangle',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A soft triangle form from the silky Silk collection — gentle against the skin and easy to wear every day.',
    features: ['Triangle shape', 'Silky-soft', 'Lighter feel'],
    image: '/products/trulife/471-silk-triangle.webp',
    supplierUrl: 'https://trulife.com/products/471-silk-triangle',
    tags: ['silicone', 'everyday'],
  },
  {
    id: 'trulife-485-silk-curve',
    name: 'Trulife 485 Silk Curve',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'Shaped to follow your natural curve for an even, comfortable silhouette with a soft silicone feel.',
    features: ['Follows your curve', 'Silky-soft'],
    image: '/products/trulife/485-silk-curve.webp',
    supplierUrl: 'https://trulife.com/products/485-silk-curve',
    tags: ['silicone', 'everyday'],
  },
  {
    id: 'trulife-473-silk-teardrop',
    name: 'Trulife 473 Silk Teardrop',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A gently tapered teardrop shape for a natural profile and a secure, symmetrical fit.',
    features: ['Teardrop shape', 'Symmetrical fit'],
    image: '/products/trulife/473-silk-teardrop.webp',
    supplierUrl: 'https://trulife.com/products/473-silk-teardrop',
    tags: ['silicone', 'everyday'],
  },
  {
    id: 'trulife-509-e-supreme',
    name: 'Trulife 509 E Supreme',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A fuller silicone form offering lovely shape and balance for a confident everyday look.',
    features: ['Fuller shape', 'Silicone'],
    image: '/products/trulife/509-e-supreme.webp',
    supplierUrl: 'https://trulife.com/products/509-e-supreme',
    tags: ['silicone', 'everyday'],
  },
  {
    id: 'trulife-616-tri-featherweight',
    name: 'Trulife 616 Tri-Featherweight',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'An ultra-light triangle form — beautifully comfortable for all-day wear, travel, or warmer days.',
    features: ['Ultra lightweight', 'Triangle shape'],
    image: '/products/trulife/616-tri-featherweight.webp',
    supplierUrl: 'https://trulife.com/products/616-tri-featherweight',
    tags: ['lightweight', 'leisure'],
    featured: true,
  },
  {
    id: 'trulife-531-teardrop-partial',
    name: 'Trulife 531 Teardrop Partial',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A partial shaper that layers gently to even out a lumpectomy or reconstruction.',
    features: ['Partial shaper', 'For lumpectomy'],
    image: '/products/trulife/531-teardrop-partial.webp',
    supplierUrl: 'https://trulife.com/products/531-teardrop-partial',
    tags: ['partial', 'lumpectomy'],
  },
  {
    id: 'trulife-607-firstfit',
    name: 'Trulife 607 FirstFit',
    brand: 'trulife',
    category: 'breast-forms',
    blurb:
      'A soft, lightweight first form for the tender early weeks right after surgery.',
    features: ['Lightweight', 'Post-surgery first form'],
    image: '/products/trulife/607-firstfit.webp',
    supplierUrl: 'https://trulife.com/products/607-firstfit',
    tags: ['lightweight', 'post-surgery'],
  },
  {
    id: 'nearlyme-casual',
    name: 'Nearly Me Casual / Leisure Forms',
    brand: 'nearlyme',
    category: 'breast-forms',
    blurb:
      'Lightweight, cozy forms perfect for around the house, sleep, travel, or the early weeks after surgery.',
    features: ['Very lightweight', 'Softly comfortable'],
    supplierUrl: 'https://nearlymeonline.com/silicone-breast-forms/',
    tags: ['lightweight', 'leisure'],
  },
  {
    id: 'almostu-partial',
    name: 'Almost U Partial & Shaper Forms',
    brand: 'almostu',
    category: 'breast-forms',
    blurb:
      'Partial shapers and enhancers to even out a lumpectomy or reconstruction, layering gently over your own tissue.',
    features: ['For lumpectomy / uneven shape', 'Layering shapers'],
    supplierUrl: 'https://almostu.com/',
    tags: ['partial', 'lumpectomy'],
  },

  // ── Mastectomy Bras ──────────────────────────────────────────
  {
    id: 'amoena-bra',
    name: 'Amoena Pocketed Bras',
    brand: 'amoena',
    category: 'mastectomy-bras',
    blurb:
      'Elegant, everyday pocketed bras with soft cups and secure support — from wireless comfort styles to pretty lace.',
    features: ['Bilateral pockets', 'Wireless & underwire', 'Full size range'],
    supplierUrl: 'https://www.amoena.com/global/product-worlds/',
    tags: ['everyday', 'pocketed'],
    featured: true,
  },
  {
    id: 'abc-bra',
    name: 'American Breast Care Bras',
    brand: 'abc',
    category: 'mastectomy-bras',
    blurb:
      'Comfortable pocketed bras designed to hold your form securely through everyday movement.',
    features: ['Soft pockets', 'Everyday support'],
    supplierUrl: 'https://americanbreastcare.com/',
    tags: ['everyday', 'pocketed'],
  },
  {
    id: 'trulife-naturalwear-bra',
    name: 'Trulife Naturalwear Bras',
    brand: 'trulife',
    category: 'mastectomy-bras',
    blurb:
      'Naturalwear pocketed bras with a soft, flattering fit — leisure, T-shirt, and everyday styles.',
    features: ['Leisure & everyday', 'Soft cups'],
    supplierUrl: 'https://trulife.com/',
    tags: ['everyday', 'leisure'],
  },

  // ── Camisoles ────────────────────────────────────────────────
  {
    id: 'amoena-camisole',
    name: 'Amoena Recovery Camisole',
    brand: 'amoena',
    category: 'camisoles',
    blurb:
      'A soft post-surgery camisole with a gentle built-in form and discreet pockets to hold surgical drains comfortably.',
    features: ['Drain-management pockets', 'Soft light form included', 'Front closure'],
    supplierUrl: 'https://www.amoena.com/global/product-worlds/',
    tags: ['post-surgery', 'drain-pockets'],
    featured: true,
  },
  {
    id: 'trulife-camisole',
    name: 'Trulife Naturalwear Recovery Camisole',
    brand: 'trulife',
    category: 'camisoles',
    blurb:
      'Gentle recovery camisole with adjustable drain pockets and a soft fiberfill form for the days right after surgery.',
    features: ['Adjustable drain pockets', 'Fiberfill puffs included'],
    supplierUrl: 'https://trulife.com/',
    tags: ['post-surgery', 'drain-pockets'],
  },

  // ── Swimwear ─────────────────────────────────────────────────

  // ── Turbans & Scarves ────────────────────────────────────────

  // ── Compression & Lymphedema ─────────────────────────────────
  {
    id: 'juzo-soft-sleeve',
    name: 'Juzo Soft Arm Sleeve',
    brand: 'juzo',
    category: 'compression',
    blurb:
      'A soft, comfortable graduated-compression arm sleeve for managing lymphedema — measured and fitted by Jen for effective all-day support.',
    features: ['Graduated compression', 'Many colors & trims', 'Professionally fitted'],
    supplierUrl: 'https://www.juzo.com/',
    tags: ['sleeve', 'lymphedema'],
    featured: true,
  },
  {
    id: 'juzo-gauntlet',
    name: 'Juzo Gauntlet & Glove',
    brand: 'juzo',
    category: 'compression',
    blurb:
      'Compression gauntlets and gloves to support the hand and wrist, fitted to work together with your sleeve.',
    features: ['Hand & wrist support', 'Pairs with sleeve'],
    supplierUrl: 'https://www.juzo.com/',
    tags: ['glove', 'gauntlet', 'lymphedema'],
  },
  {
    id: 'juzo-expert',
    name: 'Juzo Expert / Dynamic Sleeves',
    brand: 'juzo',
    category: 'compression',
    blurb:
      'Firmer, durable compression options for stronger support needs — Jen helps determine the right compression class for you.',
    features: ['Higher compression classes', 'Durable everyday wear'],
    supplierUrl: 'https://www.juzo.com/',
    tags: ['sleeve', 'lymphedema'],
  },
];

// ── Generated supplier data ──────────────────────────────────────
// Files in ./generated/*.json are produced by scripts/scrape.mjs (real
// products + optimized images pulled from each supplier). Generated data for a
// brand SUPERSEDES that brand's hand-seeded entries above, so as each brand is
// scraped its placeholder seeds drop out automatically.
const generatedModules = import.meta.glob<{ default: Product[] }>('./generated/*.json', {
  eager: true,
});
const generatedProducts: Product[] = Object.values(generatedModules)
  .flatMap((m) => m.default ?? [])
  // guard against malformed entries
  .filter((p) => p && p.id && p.name && p.brand && p.category);
const generatedBrands = new Set(generatedProducts.map((p) => p.brand));

export const products: Product[] = [
  ...seedProducts.filter((p) => !generatedBrands.has(p.brand)),
  ...generatedProducts,
];

/** Helpers */
export const getCategory = (slug: CategorySlug): Category | undefined =>
  categories.find((c) => c.slug === slug);

export const productsByCategory = (slug: CategorySlug): Product[] =>
  products.filter((p) => p.category === slug);

export const featuredProducts = (): Product[] => {
  const explicit = products.filter((p) => p.featured);
  if (explicit.length >= 3) return explicit.slice(0, 6);
  // Fallback: one photographed product from each category so the showcase stays full.
  const perCategory = categories
    .map((c) => products.find((p) => p.category === c.slug && p.image))
    .filter((p): p is Product => Boolean(p));
  const seen = new Set(explicit.map((p) => p.id));
  return [...explicit, ...perCategory.filter((p) => !seen.has(p.id))].slice(0, 6);
};
