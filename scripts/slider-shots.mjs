// Screenshot the core slider next to the gate 2 approved prototype, at the same size, on dark and light
// glass, and measure both (pill size, radius, fill colour, track colour, focus ring).
//
//   node scripts/slider-shots.mjs --proto <path to lh-proto/index.html> --out <dir>
//
// The prototype lives in the Liquid Home design archive, outside this repo, so its path is an argument.
// Writes <glass>-pill-{proto,core,pair}.png, <glass>-focus-{proto,core,pair}.png,
// <glass>-narrow-{proto,core,pair}.png, <glass>-states-core.png and compare.json into --out.
// Pairs are the prototype on the left and core on the right. The prototype's background orbs are hidden
// so both pills sit on the same glass over the same flat ground (CHO-14 grounds).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const PROTO = arg('proto');
const OUT = resolve(arg('out') ?? resolve(ROOT, '.local', 'slider-shots'));
if (!PROTO) {
  console.error('usage: node scripts/slider-shots.mjs --proto <lh-proto/index.html> [--out <dir>]');
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const SCALE = 2;
const PAD = 10; // room around the pill for the focus ring (3px offset + 2px ring)
const WIDE = { width: 1380, height: 1100 };
const NARROW = { width: 352, height: 1100 }; // 16px gutters: the prototype card is then 320px wide

const server = await createServer({ root: ROOT, logLevel: 'error', clearScreen: false, server: { host: '127.0.0.1', port: 5391, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'] });

const targets = {
  proto: { url: pathToFileURL(resolve(PROTO)).href, pill: '#pill', fill: '#fill', row: '#lcard .bodyrow' },
  core: { url: null, pill: '#bare-slider .lc-slider', fill: '#bare-slider .lc-slider-fill', row: '#narrow-card .bodyrow' },
};

async function open(ctx, which, glass) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(which === 'proto' ? targets.proto.url : `${base}/dev/slider.html?glass=${glass}`, { waitUntil: 'networkidle' });
  if (which === 'proto') await page.addStyleTag({ content: '.orbs{display:none!important}' });
  await page.waitForSelector(targets[which].pill);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { page, errors };
}

const clipOf = async (page, sel, pad) => {
  const b = await page.locator(sel).first().boundingBox();
  return { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad };
};

async function measure(page, which) {
  return page.evaluate((w) => {
    const root = w === 'proto' ? document : document.getElementById('bare-slider').shadowRoot;
    const pill = root.querySelector(w === 'proto' ? '#pill' : '.lc-slider');
    const fill = root.querySelector(w === 'proto' ? '#fill' : '.lc-slider-fill');
    const p = getComputedStyle(pill);
    const f = getComputedStyle(fill);
    const r = pill.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      radius: p.borderTopLeftRadius,
      track: p.backgroundColor,
      edge: `${p.borderTopWidth} ${p.borderTopStyle} ${p.borderTopColor}`,
      opacity: p.opacity,
      fillColour: f.backgroundColor,
      fillHeight: fill.getBoundingClientRect().height,
      fillTransition: `${f.transitionProperty} ${f.transitionDuration}`,
      role: pill.getAttribute('role'),
      aria: ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-label'].map((a) => pill.getAttribute(a)),
    };
  }, which);
}

async function focusRingOf(page, which) {
  const loc = page.locator(targets[which].pill).first();
  await loc.focus();
  await page.keyboard.press('Shift'); // a key press: Chrome then shows :focus-visible for the focused element
  return loc.evaluate((el) => {
    const s = getComputedStyle(el);
    return { focusVisible: el.matches(':focus-visible'), outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`, offset: s.outlineOffset };
  });
}

// Pixel samples and side-by-side pairs, drawn in a blank page's canvas (no image library needed).
async function canvasWork(ctx, fn, arg) {
  const page = await ctx.newPage();
  const out = await page.evaluate(fn, arg);
  await page.close();
  return out;
}
const sample = (ctx, png, points) =>
  canvasWork(
    ctx,
    async ([b64, pts]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      return pts.map(([fx, fy]) => {
        const d = g.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), 1, 1).data;
        return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      });
    },
    [png.toString('base64'), points],
  );
const pair = async (ctx, left, right, ground) =>
  Buffer.from(
    await canvasWork(
      ctx,
      async ([a, b, bg]) => {
        const load = async (s) => {
          const i = new Image();
          i.src = `data:image/png;base64,${s}`;
          await i.decode();
          return i;
        };
        const [l, r] = [await load(a), await load(b)];
        const gap = 48;
        const c = document.createElement('canvas');
        c.width = l.width + r.width + gap * 3;
        c.height = Math.max(l.height, r.height) + gap * 2;
        const g = c.getContext('2d');
        g.fillStyle = bg;
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(l, gap, gap);
        g.drawImage(r, l.width + gap * 2, gap);
        return c.toDataURL('image/png').split(',')[1];
      },
      [left.toString('base64'), right.toString('base64'), ground],
    ),
    'base64',
  );

const report = { scale: SCALE, note: 'pairs: prototype left, core right; prototype orbs hidden', glass: {} };
for (const glass of ['dark', 'light']) {
  const ground = glass === 'dark' ? '#0b0e14' : '#e7e9ee';
  const ctx = await browser.newContext({ viewport: WIDE, deviceScaleFactor: SCALE, colorScheme: glass, reducedMotion: 'reduce' });
  const shots = {};
  const r = (report.glass[glass] = {});
  for (const which of ['proto', 'core']) {
    const { page, errors } = await open(ctx, which, glass);
    const pill = await page.screenshot({ clip: await clipOf(page, targets[which].pill, PAD) });
    const m = await measure(page, which);
    // Fill sample 10 % up from the pill bottom, track sample 10 % down from the top, both centred.
    const [fillPx, trackPx] = await sample(ctx, pill, [
      [0.5, 1 - (PAD + 0.1 * m.height) / (m.height + 2 * PAD)],
      [0.5, (PAD + 0.1 * m.height) / (m.height + 2 * PAD)],
    ]);
    const ring = await focusRingOf(page, which);
    const focus = await page.screenshot({ clip: await clipOf(page, targets[which].pill, PAD) });
    await page.setViewportSize(NARROW);
    await page.waitForTimeout(200);
    await page.locator('body').click({ position: { x: 1, y: 1 } }); // drop focus so the narrow shot has no ring
    const rowBox = await page.locator(targets[which].row).first().boundingBox();
    const cardWidth = await page.evaluate((sel) => {
      const pick = sel === 'proto' ? document.querySelector('#lcard') : document.getElementById('narrow-card').shadowRoot.querySelector('.card');
      return pick.getBoundingClientRect().width;
    }, which);
    const narrow = await page.screenshot({ clip: { x: rowBox.x - 22, y: rowBox.y - 22, width: rowBox.width + 44, height: rowBox.height + 44 } });
    if (which === 'core') {
      await page.setViewportSize(WIDE);
      shots.states = await page.locator('#states').screenshot();
    }
    shots[which] = { pill, focus, narrow };
    r[which] = { ...m, pixel: { fill: fillPx, track: trackPx }, focusRing: ring, narrowCardWidth: cardWidth, consoleErrors: errors };
    await page.close();
  }
  for (const kind of ['pill', 'focus', 'narrow']) {
    writeFileSync(resolve(OUT, `${glass}-${kind}-proto.png`), shots.proto[kind]);
    writeFileSync(resolve(OUT, `${glass}-${kind}-core.png`), shots.core[kind]);
    writeFileSync(resolve(OUT, `${glass}-${kind}-pair.png`), await pair(ctx, shots.proto[kind], shots.core[kind], ground));
  }
  writeFileSync(resolve(OUT, `${glass}-states-core.png`), shots.states);
  await ctx.close();
}
// The fill transition with motion allowed (the shots above run under reduced motion, where both are none).
{
  const ctx = await browser.newContext({ viewport: WIDE, colorScheme: 'dark', reducedMotion: 'no-preference' });
  report.motionAllowed = {};
  for (const which of ['proto', 'core']) {
    const { page } = await open(ctx, which, 'dark');
    report.motionAllowed[which] = (await measure(page, which)).fillTransition;
    await page.close();
  }
  await ctx.close();
}
writeFileSync(resolve(OUT, 'compare.json'), JSON.stringify(report, null, 2) + '\n');
await browser.close();
await server.close();

const keys = ['width', 'height', 'radius', 'track', 'edge', 'fillColour', 'fillHeight', 'fillTransition', 'opacity'];
for (const [glass, r] of Object.entries(report.glass)) {
  console.log(`\n${glass} glass`);
  for (const k of keys) console.log(`  ${k.padEnd(15)} proto ${String(r.proto[k]).padEnd(34)} core ${r.core[k]}${String(r.proto[k]) === String(r.core[k]) ? '' : '   <- differs'}`);
  for (const k of ['fill', 'track']) console.log(`  pixel ${k.padEnd(9)} proto ${r.proto.pixel[k].padEnd(34)} core ${r.core.pixel[k]}`);
  console.log(`  focus ring      proto ${JSON.stringify(r.proto.focusRing)}\n                  core  ${JSON.stringify(r.core.focusRing)}`);
  console.log(`  narrow card     proto ${r.proto.narrowCardWidth}px, core ${r.core.narrowCardWidth}px`);
  console.log(`  aria            proto ${JSON.stringify(r.proto.aria)}\n                  core  ${JSON.stringify(r.core.aria)}`);
  console.log(`  console errors  proto ${r.proto.consoleErrors.length}, core ${r.core.consoleErrors.length}`);
}
console.log(`\nfill transition, motion allowed: proto ${report.motionAllowed.proto}, core ${report.motionAllowed.core}`);
console.log(`\nwritten to ${OUT}`);
