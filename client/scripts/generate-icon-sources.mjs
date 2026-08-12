import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const BRAND_400 = '#c084fc';
const BRAND_600 = '#9333ea';
const BRAND_700 = '#7e22ce';
const BG = '#f7f3ea';

function glyphSvg({ withBackground }) {
  const bg = withBackground
    ? `<rect x="3" y="4.5" width="18" height="16" rx="4" fill="url(#g)" />
       <rect x="3" y="4.5" width="18" height="5" rx="4" fill="${BRAND_700}" opacity="0.35" />`
    : '';
  return `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${BRAND_400}" />
          <stop offset="100%" stop-color="${BRAND_600}" />
        </linearGradient>
      </defs>
      ${bg}
      <rect x="7" y="2" width="2" height="4" rx="1" fill="${BRAND_700}" />
      <rect x="15" y="2" width="2" height="4" rx="1" fill="${BRAND_700}" />
      <rect x="6.5" y="12" width="3" height="3" rx="1" fill="white" opacity="0.9" />
      <rect x="10.5" y="12" width="3" height="3" rx="1" fill="white" opacity="0.55" />
      <rect x="14.5" y="12" width="3" height="3" rx="1" fill="white" opacity="0.55" />
    </svg>`;
}

function wrap(inner, size, contentSize) {
  const offset = (size - contentSize) / 2;
  const scale = contentSize / 24;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${offset}, ${offset}) scale(${scale})">
        ${inner.replace(/<svg[^>]*>|<\/svg>/g, '')}
      </g>
    </svg>`;
}

mkdirSync('assets', { recursive: true });

// Full icon (legacy launcher icon), near-edge-to-edge like the existing favicon
await sharp(Buffer.from(wrap(glyphSvg({ withBackground: true }), 1024, 1024)))
  .png()
  .toFile('assets/icon.png');

// Adaptive icon foreground: glyph only, no background, centered in the ~66% safe zone
await sharp(Buffer.from(wrap(glyphSvg({ withBackground: false }), 1024, 660)))
  .png()
  .toFile('assets/icon-foreground.png');

// Adaptive icon background: solid brand gradient fill, full bleed
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: BRAND_600 },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="1024" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${BRAND_400}"/><stop offset="100%" stop-color="${BRAND_600}"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/></svg>`
      ),
    },
  ])
  .png()
  .toFile('assets/icon-background.png');

// Splash: warm paper background with the full icon centered at moderate size
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG },
})
  .composite([
    {
      input: Buffer.from(wrap(glyphSvg({ withBackground: true }), 2732, 900)),
      top: 0,
      left: 0,
    },
  ])
  .png()
  .toFile('assets/splash.png');

console.log('Generated icon.png, icon-foreground.png, icon-background.png, splash.png in assets/');
