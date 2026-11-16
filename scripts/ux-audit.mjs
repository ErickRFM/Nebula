import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const ROOT = resolve(import.meta.dirname, '..', 'apps', 'web', 'out');
const PORT = 4608;
const OUT_DIR = resolve(import.meta.dirname, '..', '.ux-audit');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
};

const SCREENS = ['inicio', 'buscar', 'biblioteca', 'playlists', 'salas', 'explorar', 'cuenta', 'ajustes'];
const VIEWPORTS = [
  { name: '320', width: 320, height: 740, isMobile: true, hasTouch: true },
  { name: '390', width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: '768', width: 768, height: 1024, isMobile: true, hasTouch: true },
  { name: '1024', width: 1024, height: 800, isMobile: false, hasTouch: false },
  { name: '1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
];

function server() {
  return new Promise((start) => {
    const http = createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/.])+/, '') || 'index.html';
      if (!extname(path)) path = path === '' ? 'index.html' : path.replace(/\/$/, '') + '/index.html';
      try {
        const body = await readFile(join(ROOT, path));
        res.writeHead(200, { 'content-type': MIME[extname(path).toLowerCase()] ?? 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('missing');
      }
    });
    http.listen(PORT, () => start(http));
  });
}

const PROBES = () => {
  const sel = (el) => el.tagName.toLowerCase()
    + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')
    + (el.id ? '#' + el.id : '');
  const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; };
  const shown = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.width > 1 && r.height > 1;
  };
  const vw = window.innerWidth, vh = window.innerHeight;

  const targets = [...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="switch"],[role="button"],[role="link"],[tabindex="0"]')]
    .filter(shown)
    .map((el) => ({ sel: sel(el), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40), ...box(el), pos: getComputedStyle(el).position }));
  const under44 = targets.filter((t) => (t.w < 44 || t.h < 44) && t.pos !== 'fixed');
  const under24 = targets.filter((t) => t.w < 24 || t.h < 24);

  const tiny = [];
  const sizes = {};
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!text) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    sizes[fs] = (sizes[fs] || 0) + 1;
    if (fs < 11) tiny.push({ sel: sel(el), fs, text: text.slice(0, 34) });
  }

  const overflowing = [...document.querySelectorAll('body *')].filter(shown)
    .map((el) => { const r = el.getBoundingClientRect(); return { el, r, sel: sel(el), pos: getComputedStyle(el).position }; })
    .filter((t) => t.r.right > vw + 1 || t.r.left < -1)
    .map(({ sel: s, r, pos }) => ({ sel: s, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), pos }))
    .slice(0, 10);

  const labeled = [...document.querySelectorAll('input,select,textarea')].filter(shown).filter((el) => {
    if (el.getAttribute('aria-label') || el.closest('label') || el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
    return true;
  }).map((el) => ({ sel: sel(el), ph: el.placeholder || '' }));

  return {
    doc: { scrollWidth: document.documentElement.scrollWidth, innerWidth: vw, overflow: document.documentElement.scrollWidth - vw, title: document.title, lang: document.documentElement.lang },
    counts: { targets: targets.length, under44: under44.length, under24: under24.length, tiny: tiny.length },
    under44, under24, tiny: tiny.slice(0, 14), fontSizes: sizes, overflowing, unlabeledInputs: labeled,
    skipLink: Boolean(document.querySelector('.skip-link')),
    liveRegions: document.querySelectorAll('[role="status"],[aria-live],h1').length,
    headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 30)),
  };
};

const http = await server();
await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: 2 });
  await context.route('**/v1/**', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"audit-offline"}' }).catch(() => {}));
  for (const screen of SCREENS) {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
    await page.goto(`http://127.0.0.1:${PORT}/?vista=${screen}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const metrics = await page.evaluate(PROBES);
    let axe = null;
    try {
      axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa', 'best-practice']).analyze();
    } catch (e) { axe = { error: String(e).slice(0, 100) }; }
    await page.screenshot({ path: join(OUT_DIR, `${vp.name}-${screen}.png`) });
    report.push({ screen, viewport: vp.name, ...metrics, axe: (axe?.violations ?? []).map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, samples: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) })), axeIncomplete: (axe?.incomplete ?? []).map((v) => ({ id: v.id, n: v.nodes.length })), pageErrors: errors });
    console.log(`${vp.name}/${screen}: overflow=${metrics.doc.overflow} <44=${metrics.counts.under44} <24=${metrics.counts.under24} tiny<11px=${metrics.counts.tiny} axe=${(axe?.violations ?? []).length} err=${errors.length}`);
    await page.close();
  }
  await context.close();
}

await browser.close();
http.close();
await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

const roll = {};
for (const row of report) {
  for (const v of row.axe) { roll[v.id] = roll[v.id] || { impact: v.impact, hits: 0, sample: v.samples[0] }; roll[v.id].hits += 1; }
}
console.log('\n=== axe agregado ===');
for (const [id, r] of Object.entries(roll).sort((a, b) => b[1].hits - a[1].hits)) console.log(`${id} [${r.impact}] en ${r.hits} vistas :: ${r.sample}`);
console.log('\n=== overflow !== 0 ===');
for (const row of report.filter((r) => r.doc.overflow !== 0)) console.log(`${row.viewport}/${row.screen}: ${row.doc.overflow}px :: ${JSON.stringify(row.overflowing.slice(0, 3))}`);
console.log('\n=== objetivos <24px ===');
for (const row of report.filter((r) => r.counts.under24)) console.log(`${row.viewport}/${row.screen}: ${JSON.stringify(row.under24.slice(0, 4))}`);
console.log('\n=== texto <11px (únicos) ===');
const tinyMap = new Map();
for (const row of report) for (const t of row.tiny) tinyMap.set(t.sel + '@' + t.fs, `${t.text} [${row.viewport}/${row.screen}]`);
for (const [k, v] of tinyMap) console.log(`${k} :: ${v}`);
console.log('\n=== tamaños de fuente presentes (px) ===');
const allSizes = new Set();
for (const row of report) for (const s of Object.keys(row.fontSizes)) allSizes.add(+s);
console.log([...allSizes].sort((a, b) => a - b).join(', '));
console.log('\n=== errores de página ===');
for (const row of report.filter((r) => r.pageErrors.length)) console.log(`${row.viewport}/${row.screen}: ${row.pageErrors.join(' | ')}`);
console.log('\n=== inputs sin etiqueta ===');
for (const row of report.filter((r) => r.unlabeledInputs.length)) console.log(`${row.viewport}/${row.screen}: ${JSON.stringify(row.unlabeledInputs)}`);
console.log('\nreporte ->', join(OUT_DIR, 'report.json'));
