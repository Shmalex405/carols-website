/**
 * Prefix an internal path with the site's base path (import.meta.env.BASE_URL).
 *
 * Lets the site work whether it's served at the root ('/') — a custom domain
 * like carolsutah.com — or under a subpath ('/carols-website/') — a GitHub
 * Pages project site. External URLs, mailto:/tel:, anchors, and protocol-
 * relative URLs are returned unchanged.
 *
 *   withBase('/products')  // '/products'  at root, '/carols-website/products' on Pages
 */
export function withBase(path: string): string {
  if (!path) return path;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(path)) return path; // scheme:, //host, #anchor
  const base = import.meta.env.BASE_URL || '/';
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  return b + (path.startsWith('/') ? path : '/' + path);
}
