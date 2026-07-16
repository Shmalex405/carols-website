/**
 * Central site configuration for Carol's Post Mastectomy Specialist.
 *
 * Everything that Jen (or whoever maintains the site) is likely to change lives
 * here in ONE place: contact details, hours, booking link, the inquiry-form key,
 * and social links. Update these values and the whole site follows.
 */

export const site = {
  name: "Carol's Post Mastectomy Specialist",
  shortName: "Carol's",
  tagline: 'Compassionate mastectomy fitting, from one survivor to another.',
  description:
    "Carol's Post Mastectomy Specialist in St. George, Utah offers dignified, private, one-on-one fittings for breast forms, mastectomy bras, camisoles, swimwear, and lymphedema compression. A caring legacy since 1985.",
  // Public URL — keep in sync with astro.config.mjs `site`.
  url: 'https://www.carolsutah.com',
} as const;

export const contact = {
  phone: '435-688-0452',
  phoneHref: 'tel:+14356880452',
  fax: '435-688-0453',
  email: 'Jen@carolsutah.com',
  emailHref: 'mailto:Jen@carolsutah.com',
  address: {
    line1: '1490 E. Foremaster Dr.',
    line2: 'Suite 310 (Third Floor)',
    city: 'St. George',
    state: 'UT',
    zip: '84790',
  },
  // Google Maps directions link
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=1490+E+Foremaster+Dr+Suite+310+St+George+UT+84790',
  hours: [
    { days: 'Monday – Thursday', time: '10:00 AM – 3:00 PM' },
    { days: 'Friday – Sunday', time: 'Closed' },
  ],
  hoursNote: 'By appointment only — please book ahead so Jen can give you her full attention.',
} as const;

export const people = {
  fitterName: 'Jen Flowers',
  fitterTitle: 'Certified Mastectomy Fitter',
  founderName: 'Carol Stenquist',
} as const;

export const social = {
  instagram: 'https://www.instagram.com/carols.utah/',
  facebook: 'https://www.facebook.com/carolspostmastectomyspecialist/',
  pinterest: 'https://www.pinterest.com/', // TODO: confirm Carol's Pinterest URL
} as const;

/**
 * BOOKING — Microsoft Bookings (Jen's Outlook / Microsoft 365 calendar).
 * Create a Bookings page (or "Bookings with me" in Outlook on the web), then
 * paste its public booking-page URL here. Examples:
 *   Microsoft Bookings: https://outlook.office365.com/owa/calendar/…/bookings/
 *   Bookings with me:   https://outlook.office.com/bookwithme/user/…
 * Until set, the Book page falls back to phone/email.
 */
export const booking = {
  // Jen's Microsoft Bookings page (syncs to her Outlook / M365 calendar).
  url: 'https://bookings.cloud.microsoft/book/FittingAppointments@carolsutah.com/',
} as const;

/**
 * INQUIRY FORM — Web3Forms (free, no server needed, emails Jen directly).
 * 1. Go to https://web3forms.com, enter Jen@carolsutah.com, get an Access Key.
 * 2. Paste the key below. Submissions will be emailed to that address.
 * Until a key is present, the form shows Jen's phone/email instead of submitting.
 */
export const forms = {
  web3formsAccessKey: '', // TODO: paste Web3Forms access key
  endpoint: 'https://api.web3forms.com/submit',
} as const;

/** Primary navigation. `children` render as a dropdown / sub-list. */
export const nav: Array<{
  label: string;
  href: string;
  children?: Array<{ label: string; href: string }>;
}> = [
  { label: 'Home', href: '/' },
  { label: 'Our Story', href: '/our-story' },
  {
    label: 'Products',
    href: '/products',
    children: [
      { label: 'Breast Forms & Prostheses', href: '/products/breast-forms' },
      { label: 'Mastectomy Bras', href: '/products/mastectomy-bras' },
      { label: 'Camisoles & Recovery', href: '/products/camisoles' },
      { label: 'Compression & Lymphedema', href: '/products/compression' },
    ],
  },
  { label: 'What to Expect', href: '/what-to-expect' },
  { label: 'FAQ & Insurance', href: '/faq' },
  { label: 'Contact', href: '/contact' },
];
