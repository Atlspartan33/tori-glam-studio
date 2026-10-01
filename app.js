// app.js — Tori's Glam Studio. Camera → MediaPipe face landmarks (on-device) → makeup drawn on canvas.
// ?demo uses test/face.jpg instead of the camera (&jaw=0.6 fakes an open mouth, &mirror mirrors it).
import { Tracker } from './face.js';
import { MAKEUP, COSTUMES, ALL, drawFace } from './looks.js';
import * as sfx from './sfx.js';
import * as gallery from './gallery.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const DEMO = Q.has('demo');
const DEMO_JAW = parseFloat(Q.get('jaw') || '0');

const S = {
  facing: 'user', stream: null, landmarker: null, gen: 0, raf: 0,
  lastVideoTime: -1, lastTs: 0, tab: 'makeup', colorFor: null, busy: false,
  noFaceSince: 0, lumaAt: 0, dark: false, wake: null, cameras: 0,
  sel: Object.fromEntries(ALL.map((it) => [it.id, { on: false, c: 0, at: 0 }])),
  bursts: [],
};
const tracker = new Tracker();
const video = $('video'), canvas = $('canvas'), ctx = canvas.getContext('2d');
let demoImg = null;

// ───────────────────────────────────────────── model
let modelPromise = null;
function loadModel() {
  return (modelPromise ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('./vendor/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('vendor/wasm', location.href).href);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('vendor/face_landmarker.task', location.href).href, delegate },
      runningMode: 'VIDEO', numFaces: 4, outputFaceBlendshapes: true,
    });
    try { S.landmarker = await FaceLandmarker.createFromOptions(files, opts('GPU')); }
    catch { S.landmarker = await FaceLandmarker.createFromOptions(files, opts('CPU')); }
    return S.landmarker;
  })().catch((e) => { modelPromise = null; e.stage = 'model'; throw e; }));
}

// ───────────────────────────────────────────── camera
async function startSource(my) {
  stopSource();
  if (DEMO) {
    demoImg = new Image();
    await new Promise((res, rej) => { demoImg.onload = res; demoImg.onerror = rej; demoImg.src = 'test/face.jpg'; });
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no camera api'), { name: 'InsecureError' });
  const s = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: S.facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
  if (my !== S.gen) { s.getTracks().forEach((t) => t.stop()); return; }
  S.stream = s;
  video.srcObject = s;
  await video.play();
  try { S.wake = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    S.cameras = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length;
    $('flipBtn').hidden = S.cameras < 2;
  } catch {}
}
function stopSource() {
  cancelAnimationFrame(S.raf); S.raf = 0;
  S.stream?.getTracks().forEach((t) => t.stop()); S.stream = null; video.srcObject = null;
  S.wake?.release?.().catch(() => {}); S.wake = null;
  tracker.reset(); S.lastVideoTime = -1; S.noFaceSince = 0;
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && S.stream && (!S.wake || S.wake.released)) {
    try { S.wake = await navigator.wakeLock?.request('screen'); } catch {}
  }
});
const isMirror = () => (DEMO ? Q.has('mirror') : S.facing === 'user');

// ───────────────────────────────────────────── screens
function showScreen(name) { document.body.dataset.screen = name; }
function syncOverlay() { document.body.classList.toggle('overlay-up', !$('loading').hidden || !$('error').hidden); }
function loading(on, text) { $('loading').hidden = !on; if (text) $('loadingText').textContent = text; syncOverlay(); }
const STANDALONE = matchMedia('(display-mode: standalone)').matches;
function showError(e) {
  loading(false);
  const n = e?.name;
  let title = 'Uh-oh!', text;
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    title = 'The camera is turned off';
    text = STANDALONE
      ? 'Ask a grown-up: open Settings → Apps → Chrome → Permissions → Camera → Allow, then tap Try again.'
      : 'Ask a grown-up: tap the 🔒 next to the web address, turn Camera on, then tap Try again.';
  } else if (n === 'NotFoundError' || n === 'OverconstrainedError') {
    text = "This device doesn't have that camera. Tap Home and pick the other one.";
  } else if (n === 'NotReadableError' || n === 'AbortError') {
    text = 'Another app is using the camera. Close it, then tap Try again.';
  } else if (n === 'InsecureError') {
    text = 'The camera only works from the real studio link (https). Ask a grown-up to open it from the home-screen icon.';
  } else if (e?.stage === 'model') {
    text = "The studio couldn't finish loading. Check the Wi-Fi, then tap Try again.";
  } else {
    text = 'Something went wrong starting the camera. Tap Try again.';
  }
  $('errTitle').textContent = title;
  $('errText').textContent = text;
  $('error').hidden = false;
  syncOverlay();
  sfx.off();
  console.error(e);
}

async function openStudio(facing, push = false) {
  sfx.unlock(); sfx.pop();
  S.facing = facing;
  if (push && document.body.dataset.screen !== 'studio') openLayer('studio');
  showScreen('studio');
  $('error').hidden = true;
  loading(true, 'Opening the studio…');
  const my = ++S.gen;
  try {
    await Promise.all([loadModel(), startSource(my)]);
    if (my !== S.gen) return;
    loading(false);
    S.noFaceSince = performance.now();
    loop();
  } catch (e) {
    if (my === S.gen) showError(e);
  }
}
function goHome() {
  S.gen++;
  stopSource();
  $('error').hidden = true; loading(false); setHint('');
  showScreen('start');
  sfx.pop();
}

// ───────────────────────────────────────────── render loop
function loop() {
  cancelAnimationFrame(S.raf);
  const tick = () => { S.raf = requestAnimationFrame(tick); frame(); };
  S.raf = requestAnimationFrame(tick);
}
function frame() {
  const src = DEMO ? demoImg : video;
  if (!src) return;
  const W = DEMO ? src.naturalWidth : src.videoWidth, H = DEMO ? src.naturalHeight : src.videoHeight;
  if (!W || !H) return;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const now = performance.now(), t = now / 1000;

  if (S.landmarker && (DEMO || video.currentTime !== S.lastVideoTime)) {
    S.lastVideoTime = video.currentTime;
    const ts = Math.max(now, S.lastTs + 1); S.lastTs = ts;   // timestamps must strictly increase
    let res = null;
    try { res = S.landmarker.detectForVideo(src, ts); } catch (e) { console.warn(e); }
    if (res) tracker.update(res, W, H, DEMO_JAW);
  }

  const m = isMirror();
  ctx.setTransform(m ? -1 : 1, 0, 0, 1, m ? W : 0, 0);
  ctx.drawImage(src, 0, 0, W, H);
  for (const f of tracker.faces) drawFace(ctx, f, S.sel, t);
  drawBursts(now);
  hints(now, src);
}

// sparkle burst around each face when something goes on
function burst() {
  const now = performance.now();
  for (const f of tracker.faces) {
    const c = f.P[168];
    S.bursts.push({
      x: c.x, y: c.y, fw: f.fw, t0: now,
      parts: Array.from({ length: 16 }, (_, i) => ({
        a: (i / 16) * Math.PI * 2 + Math.random() * 0.3, v: 0.5 + Math.random() * 0.35,
        c: ['#FF4FA3', '#FFC933', '#FFFFFF', '#25B5FF'][i % 4],
      })),
    });
  }
}
function drawBursts(now) {
  S.bursts = S.bursts.filter((b) => now - b.t0 < 700);
  for (const b of S.bursts) {
    const p = (now - b.t0) / 700, ease = 1 - Math.pow(1 - p, 3);
    ctx.save();
    ctx.globalAlpha = 1 - p;
    for (const q of b.parts) {
      const r = b.fw * q.v * ease, x = b.x + Math.cos(q.a) * r, y = b.y + Math.sin(q.a) * r;
      const s = b.fw * 0.035 * (1 - p * 0.6);
      ctx.fillStyle = q.c;
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
      ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ───────────────────────────────────────────── hints: no face / too dark
const lumaCanvas = document.createElement('canvas'); lumaCanvas.width = lumaCanvas.height = 24;
const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });
function luma(src) {
  lumaCtx.drawImage(src, 0, 0, 24, 24);
  const d = lumaCtx.getImageData(0, 0, 24, 24).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}
let hintText = '';
function setHint(text) {
  if (text === hintText) return;
  hintText = text;
  $('hint').textContent = text;
  $('hint').hidden = !text;
}
function hints(now, src) {
  if (!S.landmarker) return;
  if (tracker.faces.length) { S.noFaceSince = 0; setHint(''); return; }
  if (!S.noFaceSince) S.noFaceSince = now;
  if (now - S.noFaceSince < 1200) return;
  if (now - S.lumaAt > 1000) { S.lumaAt = now; S.dark = luma(src) < 55; }
  setHint(S.dark
    ? '💡 More light, please! Turn on a lamp or face a window.'
    : '👀 Find a face! Fit a whole face on the screen.');
}

// ───────────────────────────────────────────── drawers
function renderTabs() {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)));
}
function renderTray(popId) {
  const items = S.tab === 'makeup' ? MAKEUP : COSTUMES;
  $('tray').innerHTML = items.map((it) => {
    const s = S.sel[it.id];
    const dot = it.colors ? `<span class="tile-dot" style="background:${it.colors[s.c].hex}"></span>` : '';
    const cls = ['tile', s.on && 'on', it.id === S.colorFor && s.on && 'focus', it.id === popId && 'pop'].filter(Boolean).join(' ');
    return `<button class="${cls}" type="button" data-id="${it.id}" aria-pressed="${s.on}">
      ${dot}<span class="tile-ico" aria-hidden="true">${it.icon}</span><span class="tile-name">${it.name}</span>
      <span class="tile-check" aria-hidden="true">✓</span></button>`;
  }).join('');
  renderColors();
}
// The color slot never collapses (that would resize the camera view mid-tap); with nothing to pick it shows a tip.
function renderColors() {
  const it = MAKEUP.find((m) => m.id === S.colorFor);
  const show = S.tab === 'makeup' && it && S.sel[it.id].on;
  if (!show) {
    const anyOn = (S.tab === 'makeup' ? MAKEUP : COSTUMES).some((m) => S.sel[m.id].on);
    $('colorsLabel').textContent = '';
    $('swatches').innerHTML = `<p class="tip">${anyOn ? 'Tap it again to take it off.' : S.tab === 'makeup' ? 'Tap a makeup to put it on! 💅🏾' : 'Tap a costume to try it on! 🎭'}</p>`;
    return;
  }
  $('colorsLabel').textContent = it.colorsLabel;
  $('swatches').innerHTML = it.colors.map((c, i) => {
    const on = S.sel[it.id].c === i;
    return `<button class="swatch" type="button" data-i="${i}" aria-label="${c.name}" aria-pressed="${on}" style="background:${c.hex}">${on ? '✓' : ''}</button>`;
  }).join('');
}

function toggle(id) {
  const s = S.sel[id], isMakeup = MAKEUP.some((m) => m.id === id);
  if (s.on && isMakeup && S.colorFor !== id) {
    S.colorFor = id; sfx.pop();                    // first tap on an item that's already on → show its colors
  } else if (s.on) {
    s.on = false; sfx.off();
    if (S.colorFor === id) S.colorFor = null;
  } else {
    s.on = true; s.at = performance.now() / 1000;
    if (isMakeup) { S.colorFor = id; sfx.sparkle(); } else sfx.boing();
    burst();
  }
  renderTray(id);
}
function pickColor(i) {
  const s = S.sel[S.colorFor];
  if (!s) return;
  s.c = i; s.at = performance.now() / 1000;
  sfx.sparkle(); burst();
  renderTray();
}
function clearAll() {
  const any = ALL.some((it) => S.sel[it.id].on);
  for (const it of ALL) S.sel[it.id].on = false;
  S.colorFor = null;
  renderTray();
  if (any) { sfx.swoosh(); toast('All clean! 🧽'); } else { sfx.pop(); toast('Nothing to wipe off yet!'); }
}

// ───────────────────────────────────────────── camera button
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function shoot() {
  if (S.busy || document.body.dataset.screen !== 'studio') return;
  if (!$('loading').hidden) { sfx.off(); toast('Wait for the camera! ⏳'); return; }
  if (!$('error').hidden) { sfx.off(); toast('Fix the camera first! 👆🏾'); return; }
  S.busy = true; $('shutter').disabled = true;
  try {
    if (isMirror()) {                              // selfie: 3-2-1 so she can pose
      for (const n of [3, 2, 1]) {
        const c = $('count');
        c.textContent = n; c.hidden = false;
        c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
        sfx.tick(n);
        await wait(750);
      }
      $('count').hidden = true;
    }
    const pending = snapshot();                    // grabs the canvas now; JPEG encoding finishes in the background
    sfx.shutter();
    const fl = $('flash'); fl.hidden = false; fl.style.animation = 'none'; void fl.offsetWidth; fl.style.animation = '';
    setTimeout(() => { fl.hidden = true; }, 450);
    const blob = await pending;
    await gallery.add(blob);
    flyToGallery(blob);
    setTimeout(() => { sfx.tada(); toast('Saved! ⭐'); }, 450);
  } catch (e) {
    console.error(e);
    toast("Oops — that picture didn't save. Try again!");
  } finally {
    $('count').hidden = true;
    S.busy = false; $('shutter').disabled = false;
  }
}
// Save exactly what's on screen: the canvas is object-fit: cover, so crop to the visible part.
function snapshot() {
  const r = canvas.getBoundingClientRect(), cw = canvas.width, ch = canvas.height;
  const scale = Math.max(r.width / cw, r.height / ch);
  const vw = r.width / scale, vh = r.height / scale;
  const out = document.createElement('canvas');
  out.width = Math.round(vw); out.height = Math.round(vh);
  const o = out.getContext('2d');
  o.drawImage(canvas, (cw - vw) / 2, (ch - vh) / 2, vw, vh, 0, 0, out.width, out.height);
  // little studio stamp
  const fs = Math.round(out.width * 0.035);
  o.font = `700 ${fs}px Fredoka, sans-serif`;
  o.textAlign = 'right'; o.textBaseline = 'bottom';
  o.lineWidth = fs * 0.25; o.strokeStyle = 'rgba(23,18,29,.8)'; o.lineJoin = 'round';
  const txt = "Tori's Glam Studio ✨";
  o.strokeText(txt, out.width - fs * 0.6, out.height - fs * 0.5);
  o.fillStyle = '#FFFFFF'; o.fillText(txt, out.width - fs * 0.6, out.height - fs * 0.5);
  return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/jpeg', 0.92));
}
function flyToGallery(blob) {
  const url = URL.createObjectURL(blob);
  const from = $('stage').getBoundingClientRect(), to = $('thumb').getBoundingClientRect();
  const img = document.createElement('img');
  img.className = 'fly'; img.src = url; img.alt = '';
  Object.assign(img.style, { left: `${from.left + from.width * 0.2}px`, top: `${from.top + from.height * 0.15}px`, width: `${from.width * 0.6}px`, height: `${from.height * 0.6}px` });
  document.body.appendChild(img);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    Object.assign(img.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, opacity: '0.9' });
  }));
  setTimeout(() => { img.remove(); setThumb(blob); }, 600);
}
let thumbUrl = null;
function setThumb(blob) {
  if (thumbUrl) URL.revokeObjectURL(thumbUrl);
  const t = $('thumb');
  if (!blob) { thumbUrl = null; t.innerHTML = '<span aria-hidden="true">🖼️</span>'; return; }
  thumbUrl = URL.createObjectURL(blob);
  t.innerHTML = `<img src="${thumbUrl}" alt="">`;
  t.classList.remove('bump'); void t.offsetWidth; t.classList.add('bump');
}

// ───────────────────────────────────────────── gallery
let gridUrls = [], viewing = null;
async function openGallery() {
  sfx.pop();
  openLayer('gallery');
  await renderGallery();
  $('gallery').hidden = false;
}
async function renderGallery() {
  let rows = [];
  try { rows = await gallery.all(); } catch (e) { console.error(e); }
  gridUrls.forEach(URL.revokeObjectURL);
  gridUrls = rows.map((r) => URL.createObjectURL(r.blob));
  $('grid').innerHTML = rows.map((r, i) => `<button type="button" data-i="${i}" aria-label="Picture ${i + 1}"><img src="${gridUrls[i]}" alt=""></button>`).join('');
  $('grid').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const i = +b.dataset.i; viewing = { row: rows[i], url: gridUrls[i] };
    $('viewerImg').src = viewing.url; $('viewer').hidden = false; sfx.pop();
    openLayer('viewer');
  };
  $('empty').hidden = rows.length > 0;
}
async function share() {
  if (!viewing) return;
  const file = new File([viewing.row.blob], `tori-glam-${viewing.row.id}.jpg`, { type: 'image/jpeg' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Tori's Glam Studio" });
    } else {
      const a = document.createElement('a'); a.href = viewing.url; a.download = file.name; a.click();
      toast('Saved to Downloads! 📥');
    }
  } catch (e) {
    if (e.name !== 'AbortError') toast("Couldn't share that one. Try again!");
  }
}
async function trash() {
  if (!viewing) return;
  await gallery.remove(viewing.row.id);
  viewing = null;
  closeLayers(['confirm', 'viewer'], true);
  sfx.swoosh(); toast('Thrown away! 🗑️');
  const last = await gallery.latest().catch(() => null);
  setThumb(last?.blob || null);
  renderGallery();
}

// ───────────────────────────────────────────── layers + Android Back
// Every screen that opens on top pushes a history entry, so the Back gesture closes it instead of leaving the app.
const layers = [];
function openLayer(name) { layers.push(name); history.pushState({ d: layers.length }, ''); }
function hideLayer(name, quiet) {
  if (name === 'studio') { goHome(); return; }
  if (name === 'gallery') $('gallery').hidden = true;
  if (name === 'viewer') $('viewer').hidden = true;
  if (name === 'confirm') $('confirm').hidden = true;
  if (!quiet) sfx.pop();
}
function closeTop() { if (layers.length) history.back(); }
// Close named top layers now (no waiting on popstate), then rewind history to match.
function closeLayers(names, quiet) {
  let n = 0;
  for (const name of names) if (layers[layers.length - 1] === name) { hideLayer(layers.pop(), quiet); n++; }
  if (n) { skipPops += 1; history.go(-n); }
}
let skipPops = 0;
addEventListener('popstate', (e) => {
  if (skipPops) { skipPops--; return; }
  const target = e.state?.d ?? 0;
  while (layers.length > target) hideLayer(layers.pop());
});

// ───────────────────────────────────────────── toast
let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// ───────────────────────────────────────────── wire up
$('meBtn').onclick = () => openStudio('user', true);
$('themBtn').onclick = () => openStudio('environment', true);
$('startGallery').onclick = () => { sfx.unlock(); openGallery(); };
$('homeBtn').onclick = () => (layers.includes('studio') ? closeTop() : goHome());
$('flipBtn').onclick = () => openStudio(S.facing === 'user' ? 'environment' : 'user');
$('retryBtn').onclick = () => openStudio(S.facing);
$('shutter').onclick = shoot;
$('clearBtn').onclick = clearAll;
$('galleryBtn').onclick = openGallery;
$('galleryClose').onclick = closeTop;
$('viewerBack').onclick = closeTop;
$('shareBtn').onclick = share;
$('trashBtn').onclick = () => { $('confirm').hidden = false; sfx.pop(); openLayer('confirm'); };
$('keepBtn').onclick = closeTop;
$('tossBtn').onclick = trash;
$('tray').onclick = (e) => { const b = e.target.closest('.tile'); if (b) toggle(b.dataset.id); };
$('swatches').onclick = (e) => { const b = e.target.closest('.swatch'); if (b) pickColor(+b.dataset.i); };
document.querySelectorAll('.tab').forEach((b) => {
  b.onclick = () => { S.tab = b.dataset.tab; sfx.pop(); renderTabs(); renderTray(); };
});

renderTabs();
renderTray();
gallery.latest().then((r) => r && setThumb(r.blob)).catch(() => {});
if (Q.has('go')) openStudio('user', true);            // dev shortcut: ?demo&go skips the start screen

// Offline support once hosted (not on localhost, where it would cache stale dev files).
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// test hook
window.__glam = { S, tracker, toggle, pickColor, frame, canvas };
