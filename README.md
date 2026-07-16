# Carol's Post Mastectomy Specialist — Website

A warm, modern, mobile-first website for **Carol's Post Mastectomy Specialist** in
St. George, Utah. It is a caring **product showcase + appointment request** experience —
**not** an online store. Visitors browse the products we carry, then send Jen a friendly
note or book a private, in-person fitting.

Built with [Astro](https://astro.build) + [Tailwind CSS](https://tailwindcss.com),
deployed as a fast static site to **GitHub Pages**.

---

## Run it locally

```bash
npm install      # first time only
npm run dev      # start the dev server at http://localhost:4321
npm run build    # build the production site into dist/
npm run preview  # preview the production build locally
```

Requires Node 20+ (developed on Node 25).

---

## Where to change things (no deep coding needed)

Almost everything you'll want to edit lives in two files:

### 1. `src/config.ts` — business info & connections
Phone, fax, email, address, hours, social links, and the two integration slots:

- **`booking.url`** — Jen's Microsoft Bookings page URL.
- **`forms.web3formsAccessKey`** — the key that lets the inquiry form email Jen.

Change a value here and the whole site updates.

### 2. `src/data/products.ts` — the catalog
Categories and products. To add a product, copy an existing entry in the `products`
array and edit it:

```ts
{
  id: 'unique-kebab-id',
  name: 'Product name',
  brand: 'amoena',              // amoena | abc | trulife | nearlyme | almostu | juzo
  category: 'breast-forms',     // must match a category slug
  blurb: 'One or two friendly sentences.',
  features: ['Highlight 1', 'Highlight 2'],
  image: '/products/my-photo.jpg', // optional — omit for a lettered tile
  supplierUrl: 'https://…',     // link to the product on the brand's site
  featured: true,               // optional — shows on the Products landing page
}
```

> The catalog is **curated on purpose** — a browsable selection, not a full mirror of every
> supplier SKU. Each product links out to the brand's site for full detail.

---

## Connect the inquiry form (emails Jen) — ~5 minutes

The "Ask Jen" / Contact form uses [Web3Forms](https://web3forms.com) (free, no server).

1. Go to <https://web3forms.com>, enter **Jen@carolsutah.com**, and get an **Access Key**.
2. Paste it into `forms.web3formsAccessKey` in `src/config.ts`.
3. Done — submissions now email Jen. (Until a key is added, the form politely asks
   visitors to call or email instead.)

---

## Connect online booking (Microsoft Bookings) — ~15 minutes

Jen's calendar is Microsoft 365 / Outlook, so booking uses **Microsoft Bookings**.

1. Go to <https://outlook.office.com/bookings> (or the Bookings app in Microsoft 365) and
   create a booking calendar.
2. Add a **service** — e.g. "Fitting Appointment" — with **Duration: 1 hour** (this makes the
   public page show clickable **hour-long** time slots).
3. Set **availability** to Mon–Thu, 10:00 AM–3:00 PM.
4. Under **Booking page**, publish it and copy the **public URL**
   (looks like `https://outlook.office365.com/owa/calendar/…/bookings/`).
5. Paste it into `booking.url` in `src/config.ts`.
6. The Book page then embeds the live calendar so visitors pick a slot and book right there.
   (Until set, it shows call/email booking.)

---

## Add photos

Drop image files into `public/` and reference them by path:

- Product photos → `public/products/…` then set `image: '/products/file.jpg'`.
- The homepage and Our Story page have clearly-marked **PHOTO SLOTS** (search the code for
  `PHOTO SLOT`) — replace the gradient placeholders with real photos of Jen, the fitting
  room, Carol, etc.

---

## Deploy to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds and deploys automatically on every push
to `main`.

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab). Your site deploys.

### Custom domain (carolsutah.com) — recommended
1. In **Settings → Pages → Custom domain**, enter `www.carolsutah.com` and save.
2. At your domain registrar, point DNS to GitHub Pages (a `CNAME` record for `www` →
   `<your-username>.github.io`, plus the four `A` records GitHub lists for the apex domain).
3. Keep `site: 'https://www.carolsutah.com'` and `base: '/'` in `astro.config.mjs` (already set).

### Deploying to a project URL instead (username.github.io/carols-website)
If you are **not** using a custom domain, set `base: '/carols-website'` in
`astro.config.mjs` so styles and links resolve correctly.

---

## Project structure

```
src/
  config.ts              ← business info + form/booking keys (edit me)
  data/products.ts       ← catalog: categories + products (edit me)
  layouts/BaseLayout.astro
  components/            ← Header, Footer, Button, ProductCard, InquiryForm
  pages/
    index.astro          ← Home
    our-story.astro      ← Carol & Jen's story
    products/
      index.astro        ← Catalog landing
      [category].astro   ← One page per category (generated)
    what-to-expect.astro
    faq.astro
    contact.astro        ← Contact details + inquiry form
    book.astro           ← Appointment booking
    404.astro
  styles/global.css      ← brand colors & typography (Tailwind theme)
public/
  favicon.svg
```

---

## Still to do (nice next steps)
- Add Jen's real access key + Microsoft Bookings link (above).
- Replace photo placeholders with real photography.
- Expand the catalog with more verified products from each supplier's current lineup.
- Add a logo image if desired (currently a clean text wordmark).
