// Arnés de medición sobre el WebView real de Android (adb + CDP en crudo, sin Playwright).
//
// Sirve para lo que el navegador de escritorio no puede dar: el dedo de nivel de sistema
// operativo, el contraste compuesto bajo `backdrop-filter` y la geometría que el motor
// realmente pinta. Requisitos: emulador o teléfono con `com.nebula.music` en primer plano
// y USB debugging. El servidor CDP solo escucha en el dispositivo, de ahí el `adb forward`.
//
//   import { conectar, dedo, medir } from './webview-harness.mjs';
//   const c = await conectar();
//   console.log(await dedo(c, 'document.querySelector(".toggle")'));
//   console.log(await medir(c, '.eq-profile-hint', 'hint del perfil EQ'));
//   c.close();
//
// Trampas ya medidas en este WebView (Chrome 83 / Android 11, 393x751 CSS a dpr 2.75):
// - `adb shell input touchscreen tap` llega, pero ANTES hay que descartar un diálogo de ANR:
//   si la app está congelada, las entradas se las traga el sistema y dan falsos negativos.
// - El toque entra con `pointerType === ''`: los escuchas que filtran por 'touch' no se activan.
// - `:active` no llega a activarse nunca y `:hover` queda pegado al soltar.
// - Chrome hace *touch adjustment* y recluta el objetivo vecino más cercano, así que un A/B
//   de áreas de toque con desplazamientos de pocos píxeles no es concluyente en este motor.
// - `getBoundingClientRect()` de un nodo SVG ignora el trazo: los objetivos dibujados con
//   `stroke-width` aparecen más pequeños de lo que se puede pulsar.
import { execFileSync } from 'node:child_process';

export const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CSS -> píxeles físicos del dispositivo. El `TOP` compensa la barra de estado de Android,
// que no forma parte del viewport del WebView.
export const SCALE = 2.75, TOP = 83;

const APP = 'com.nebula.music';

const canal = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminancia = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

// Contraste WCAG 2.x entre un color de texto y un fondo ya compuesto.
export const ratio = (fg, bg) => (Math.max(luminancia(fg), luminancia(bg)) + 0.05) / (Math.min(luminancia(fg), luminancia(bg)) + 0.05);
export const parse = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);

export async function conectar(paquete = APP) {
  const pid = adb('shell', 'pidof', '-s', paquete);
  if (!pid) throw new Error(`NO_APP: ${paquete} no está en primer plano`);
  adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
  const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('NO_TARGET: sin página depurable');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const h = pending.get(m.id);
    if (h) { pending.delete(m.id); h(m.error ? { err: m.error } : { ok: m.result }); }
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const val = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.err) throw new Error('EXC ' + JSON.stringify(r.err).slice(0, 220));
    if (r.ok?.exceptionDetails) throw new Error('JS ' + JSON.stringify(r.ok.exceptionDetails).slice(0, 220));
    return r.ok?.result?.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.bringToFront');
  return { ws, send, val, close: () => ws.close() };
}

// El WebView en segundo plano no compone superficie: `Page.captureScreenshot` cuelga para
// siempre y un `input touchscreen` golpearía la app que sí esté visible. Medir sin estar
// visible no es medir, así que ambas primitivas se niegan antes de tocar nada.
const EN_SEGUNDO_PLANO = 'visibilityState=hidden: trae la app al primer plano antes de medir';

export const visible = async ({ val }) => (await val('document.visibilityState')) === 'visible';

// Dedo de nivel de SO sobre el centro del elemento. Devuelve las coordenadas CSS y las
// físicas, o un error si el elemento no está en el viewport (tocar fuera no es un test).
export async function dedo({ val }, expresion, { esperar = 900 } = {}) {
  if (!(await visible({ val }))) return { error: EN_SEGUNDO_PLANO };
  const hay = await val(`(() => { const el = (${expresion}); if (!el) return 'no'; el.scrollIntoView({ block: 'center' }); return 'si'; })()`);
  if (hay !== 'si') return { error: 'sin elemento' };
  await sleep(esperar);
  const centro = JSON.parse(await val(`(() => {
    const el = (${expresion});
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) return JSON.stringify({ error: 'fuera del viewport (' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' de ' + innerHeight + ')' });
    return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, alto: Math.round(r.height * 10) / 10, txt: (el.textContent || el.value || el.placeholder || '').trim().slice(0, 26) });
  })()`));
  if (centro.error) return centro;
  const disp = [Math.round(centro.x * SCALE), Math.round(TOP + centro.y * SCALE)];
  execFileSync('adb', ['shell', 'input', 'touchscreen', 'tap', String(disp[0]), String(disp[1])], { encoding: 'utf8' });
  return { ...centro, disp };
}

// Contraste real: el texto se vuelve transparente (no `visibility:hidden`, que también borra
// el relleno del propio elemento y da ratios de ~1:1) y la muestra se recorta centrada, fuera
// del `border-radius`. La captura vuelve a la página para leer los píxeles por canvas.
export async function medir({ val, send }, sel, etiqueta) {
  if (!(await visible({ val }))) return { sel, etiqueta, error: EN_SEGUNDO_PLANO };
  const prep = JSON.parse(await val(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return JSON.stringify({ error: 'sin instancia' });
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) return JSON.stringify({ error: 'fuera del viewport' });
    const color = getComputedStyle(el).color;
    const fs = Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100;
    window.__prev = Array.from(el.querySelectorAll('*')).concat([el]).map((n) => [n, n.getAttribute('style')]);
    el.style.color = 'transparent';
    for (const h of el.querySelectorAll('*')) h.style.color = 'transparent';
    return JSON.stringify({ color, fs, alto: Math.round(r.height * 10) / 10, clip: { x: Math.round(r.x + r.width / 2 - 5), y: Math.round(r.y + r.height / 2 - 5), width: 10, height: 10 }, txt: el.textContent.trim().slice(0, 34) });
  })()`));
  if (prep.error) return { sel, etiqueta, error: prep.error };
  await sleep(160);
  const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...prep.clip, scale: 1 } });
  const b64 = shot.ok?.data;
  if (!b64) return { sel, etiqueta, error: 'sin captura' };
  const leido = JSON.parse(await val(`(async () => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,${b64}'; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const rs = [], gs = [], bs = [];
    for (let i = 0; i < px.length; i += 4) { if (px[i + 3] < 200) continue; rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]); }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const fondo = rs.length ? [med(rs), med(gs), med(bs)] : null;
    for (const [node, anterior] of window.__prev) { if (anterior === null) node.removeAttribute('style'); else node.setAttribute('style', anterior || ''); }
    return JSON.stringify({ fondo });
  })()`));
  const r = ratio(parse(prep.color), leido.fondo);
  return { sel, etiqueta, ratio: Math.round(r * 100) / 100, ok: r >= 4.5, txt: prep.txt, fs: prep.fs, alto: prep.alto, color: prep.color, fondo: leido.fondo.map(Math.round) };
}
