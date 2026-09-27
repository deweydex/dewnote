// dewnote's mark, drawn inline wherever the application shows it: the
// opening screen and the top of the margin.

/** The mark, inline rather than an `<img>`, so its three parts take the
 * theme from `brand.css` — the field and the mark swap colour in the
 * dark theme, and a file with fixed fills could not. The name beside it
 * is ordinary text, so it is set in whatever face the reader chose in
 * Appearance. `assets/branding/downloads/` holds the self-contained
 * files, wordmark baked in, for anywhere outside the app. */
export const BRAND_MARK = `
  <svg viewBox="0 0 512 512" aria-hidden="true">
    <rect class="dn-brand-field" width="512" height="512" rx="104"/>
    <path class="dn-brand-mark" d="M256 76c-67 68-111 132-111 210 0 65 41 111 88 132l23 31 23-31c47-21 88-67 88-132 0-78-44-142-111-210Z"/>
    <circle class="dn-brand-cut-fill" cx="256" cy="256" r="22"/>
    <path class="dn-brand-cut-stroke" d="M256 278v126"/>
  </svg>`;
