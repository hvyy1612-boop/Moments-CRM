# Landing hero photo

The public landing page (`/`) renders a full-bleed photograph in its lower band.

Drop the studio's own wedding photo here as:

    public/landing/hero.jpg

- Use the original photo (do not upscale/regenerate).
- Landscape orientation works best (it is shown with `object-fit: cover`, centred).
- Recommended: a wide JPG around 2000px on the long edge, optimised for web.

Until this file exists, the band shows a warm neutral fallback colour (never a broken image).
The filename/path is referenced in `src/app/(site)/page.tsx`.
