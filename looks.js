// looks.js — every makeup item and costume, drawn in code onto the tracked face.
// Rule: this app only ADDS to a face. No smoothing, lightening, slimming or reshaping.
// Colors are bold on purpose so they read on deep brown skin, not just light skin.
import { LIPS_OUT, LIPS_IN, R_LID, L_LID, R_BROW, L_BROW } from './face.js';

export const MAKEUP = [
  { id: 'lips', name: 'Lipstick', icon: '💄', colorsLabel: 'Pick a lipstick color', colors: [
    { name: 'Bubblegum', hex: '#FF4FA3' }, { name: 'Ruby', hex: '#D80032' }, { name: 'Grape', hex: '#8E2DE2' },
    { name: 'Tangerine', hex: '#FF7A1A' }, { name: 'Ocean', hex: '#1F8BFF' }, { name: 'Gold', hex: '#F2B705' },
  ] },
  { id: 'shadow', name: 'Eyeshadow', icon: '🎨', colorsLabel: 'Pick an eyeshadow color', colors: [
    { name: 'Pink', hex: '#FF4FA3' }, { name: 'Purple', hex: '#A34BFF' }, { name: 'Sky', hex: '#25B5FF' },
    { name: 'Mint', hex: '#2EE59D' }, { name: 'Gold', hex: '#FFC933' }, { name: 'Sunset', hex: '#FF7A1A' },
  ] },
  { id: 'glitter', name: 'Glitter', icon: '✨', colorsLabel: 'Pick a glitter', colors: [
    { name: 'Gold', hex: '#FFC933', set: ['#FFE680', '#FFC933', '#FFFFFF'] },
    { name: 'Pink', hex: '#FF4FA3', set: ['#FF8AC4', '#FF4FA3', '#FFFFFF'] },
    { name: 'Silver', hex: '#DDE7FF', set: ['#FFFFFF', '#DDE7FF', '#B8C6FF'] },
    { name: 'Rainbow', hex: 'conic-gradient(#FF5A5A, #FFC933, #2EE59D, #25B5FF, #A34BFF, #FF5A5A)', set: ['#FF5A5A', '#FFC933', '#2EE59D', '#25B5FF', '#A34BFF'] },
  ] },
];

export const COSTUMES = [
  { id: 'crown', name: 'Crown', icon: '👑' },
  { id: 'puppy', name: 'Puppy', icon: '🐶' },
  { id: 'shades', name: 'Star Shades', icon: '⭐' },
  { id: 'stache', name: 'Mustache', icon: '🥸' },
];

export const ALL = [...MAKEUP, ...COSTUMES];

// ───────────────────────────────────────────── helpers
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const mid = (a, b) => lerp(a, b, 0.5);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function trace(ctx, P, idx) {
  ctx.moveTo(P[idx[0]].x, P[idx[0]].y);
  for (let i = 1; i < idx.length; i++) ctx.lineTo(P[idx[i]].x, P[idx[i]].y);
  ctx.closePath();
}
// Draw in face-local units: origin at `anchor`, rotated with the head, 1 unit = face width, -y is up.
function local(ctx, f, anchor, fn) {
  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(f.ang);
  ctx.scale(f.fw, f.fw);
  fn();
  ctx.restore();
}
// Springy pop-in when an item goes on: 0 → overshoot → 1.
export function popIn(at, t) {
  const d = (t - at) / 0.5;
  if (d >= 1) return 1;
  if (d <= 0) return 0;
  return 1 - Math.pow(2, -10 * d) * Math.cos(d * Math.PI * 2.5);
}
function star4(ctx, x, y, r) {
  const k = r * 0.22;
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
}
function starPath(ctx, cx, cy, R, r, pts = 5) {
  for (let i = 0; i < pts * 2; i++) {
    const rad = i % 2 ? r : R, a = -Math.PI / 2 + (i * Math.PI) / pts;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
// Sticker look: fat white outline under a dark keyline.
function sticker(ctx, fill, key, keyW) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = keyW * 3; ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = key; ctx.lineWidth = keyW; ctx.stroke();
}

// ───────────────────────────────────────────── makeup
function lips(ctx, f, hex, k) {
  const P = f.P;
  ctx.save();
  ctx.beginPath(); trace(ctx, P, LIPS_OUT); trace(ctx, P, LIPS_IN);
  ctx.filter = `blur(${Math.max(1, f.fw * 0.005)}px)`;
  ctx.globalAlpha = 0.84 * k;
  ctx.fillStyle = hex;
  ctx.fill('evenodd');                          // even-odd leaves the open mouth unpainted
  ctx.clip('evenodd');
  // gloss on the lower lip
  const g = lerp(P[14], P[17], 0.4);
  ctx.filter = `blur(${Math.max(1, f.fw * 0.01)}px)`;
  ctx.globalAlpha = 0.45 * k;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.ellipse(g.x, g.y, f.fw * 0.045, f.fw * 0.011, f.ang, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function eyeshadow(ctx, f, hex, k) {
  const P = f.P;
  ctx.save();
  ctx.filter = `blur(${Math.max(1, f.fw * 0.012)}px)`;
  for (const [lid, brow] of [[R_LID, R_BROW], [L_LID, L_BROW]]) {
    // brow point j pairs with lid point 2j; stop 62% of the way up so the brow stays visible
    const top = brow.map((bi, j) => lerp(P[lid[j * 2]], P[bi], 0.62));
    ctx.beginPath();
    ctx.moveTo(P[lid[0]].x, P[lid[0]].y);
    for (const i of lid) ctx.lineTo(P[i].x, P[i].y);
    for (let j = top.length - 1; j >= 0; j--) ctx.lineTo(top[j].x, top[j].y);
    ctx.closePath();
    const a = P[lid[4]], b = top[2];
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, rgba(hex, 0.9 * k));
    grad.addColorStop(0.55, rgba(hex, 0.6 * k));
    grad.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = grad;
    ctx.fill();
  }
  ctx.restore();
  // a little shimmer along each lid
  ctx.save();
  ctx.globalAlpha = 0.8 * k;
  ctx.fillStyle = '#FFFFFF';
  const t = performance.now() / 1000;
  for (const [lid, brow] of [[R_LID, R_BROW], [L_LID, L_BROW]]) {
    for (let j = 2; j <= 6; j += 2) {
      const p = lerp(P[lid[j]], P[brow[j / 2]], 0.2);
      const s = f.fw * 0.006 * (0.5 + 0.5 * Math.abs(Math.sin(t * 3 + j)));
      ctx.beginPath(); star4(ctx, p.x, p.y, s * 2.2); ctx.fill();
    }
  }
  ctx.restore();
}

const GLITTER_AT = [117, 118, 101, 50, 205, 123, 36, 346, 347, 330, 280, 425, 352, 266, 6, 197, 195, 5];
function glitter(ctx, f, set, k, t) {
  const P = f.P;
  ctx.save();
  ctx.shadowBlur = f.fw * 0.02;
  GLITTER_AT.forEach((i, n) => {
    for (let m = 0; m < 2; m++) {
      const seed = Math.sin((n * 7 + m * 13) * 12.9898) * 43758.5453;
      const r1 = seed - Math.floor(seed), r2 = (seed * 1.7) - Math.floor(seed * 1.7);
      const x = P[i].x + (r1 - 0.5) * f.fw * 0.06, y = P[i].y + (r2 - 0.5) * f.fw * 0.05;
      const col = set[(n + m) % set.length];
      ctx.fillStyle = col; ctx.shadowColor = col;
      if (m === 0) {
        const s = f.fw * 0.024 * k * (0.4 + 0.6 * Math.abs(Math.sin(t * 2.6 + n * 1.7)));
        ctx.beginPath(); star4(ctx, x, y, s); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(x, y, f.fw * 0.006 * k, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  ctx.restore();
}

// ───────────────────────────────────────────── costumes
function crown(ctx, f, k, t) {
  local(ctx, f, f.P[10], () => {
    ctx.translate(0, -0.2);                        // sit on top of the head, not the forehead
    ctx.scale(k * 0.88, k * 0.88);
    const w = 0.02;
    ctx.beginPath();
    ctx.moveTo(-0.42, 0);
    ctx.lineTo(-0.46, -0.36); ctx.lineTo(-0.32, -0.17);
    ctx.lineTo(-0.23, -0.45); ctx.lineTo(-0.11, -0.21);
    ctx.lineTo(0, -0.57); ctx.lineTo(0.11, -0.21);
    ctx.lineTo(0.23, -0.45); ctx.lineTo(0.32, -0.17);
    ctx.lineTo(0.46, -0.36); ctx.lineTo(0.42, 0);
    ctx.quadraticCurveTo(0, 0.05, -0.42, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -0.57, 0, 0);
    g.addColorStop(0, '#FFF3A8'); g.addColorStop(0.45, '#FFD23F'); g.addColorStop(1, '#F2A900');
    sticker(ctx, g, '#8A5300', w);
    // band
    ctx.beginPath();
    ctx.moveTo(-0.425, -0.1); ctx.lineTo(0.425, -0.1); ctx.lineTo(0.42, 0);
    ctx.quadraticCurveTo(0, 0.05, -0.42, 0); ctx.closePath();
    ctx.fillStyle = '#E89B00'; ctx.fill();
    ctx.strokeStyle = '#8A5300'; ctx.lineWidth = w; ctx.stroke();
    // jewels
    for (const [x, r, c] of [[-0.25, 0.034, '#2EC4FF'], [0, 0.046, '#FF4FA3'], [0.25, 0.034, '#2EC4FF']]) {
      ctx.beginPath(); ctx.arc(x, -0.05, r, 0, Math.PI * 2);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = '#8A5300'; ctx.lineWidth = w * 0.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(x - r * 0.3, -0.05 - r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
    }
    // pearls on the tips
    const tips = [[-0.46, -0.36], [-0.23, -0.45], [0, -0.57], [0.23, -0.45], [0.46, -0.36]];
    for (const [x, y] of tips) {
      ctx.beginPath(); ctx.arc(x, y, 0.03, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = '#8A5300'; ctx.lineWidth = w * 0.6; ctx.stroke();
    }
    // a glint that hops from tip to tip
    const [gx, gy] = tips[Math.floor(t * 1.5) % tips.length];
    const gs = 0.07 * Math.sin(((t * 1.5) % 1) * Math.PI);
    ctx.beginPath(); star4(ctx, gx, gy, gs); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  });
}

function earPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.13, 0);
  ctx.bezierCurveTo(-0.18, -0.25, -0.08, -0.46, 0, -0.52);
  ctx.bezierCurveTo(0.07, -0.46, 0.17, -0.25, 0.13, 0);
  ctx.quadraticCurveTo(0, 0.04, -0.13, 0);
  ctx.closePath();
}
function puppyEars(ctx, f, k, t) {
  // Brows up → ears perk up. Idle wiggle keeps them alive.
  const perk = clamp01((f.bs.browInnerUp ?? 0) * 1.2 + ((f.bs.browOuterUpLeft ?? 0) + (f.bs.browOuterUpRight ?? 0)) * 0.6);
  local(ctx, f, f.P[10], () => {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 0.38, -0.1);
      ctx.rotate(s * (0.42 - perk * 0.3 + Math.sin(t * 2.4 + s) * 0.04));
      ctx.scale(k, k * (1 + perk * 0.12));
      earPath(ctx);
      sticker(ctx, '#1C1B22', '#000000', 0.018);
      ctx.save();
      ctx.translate(0, -0.03); ctx.scale(0.6, 0.72);
      earPath(ctx);
      ctx.fillStyle = '#FFA9C8'; ctx.fill();
      ctx.restore();
      ctx.restore();
    }
  });
}
function puppyFace(ctx, f, k, t) {
  const P = f.P;
  // tongue — comes out when the mouth opens
  const jaw = clamp01(((f.bs.jawOpen ?? 0) - 0.15) / 0.35);
  if (jaw > 0.02) {
    local(ctx, f, P[14], () => {
      ctx.rotate(Math.sin(t * 7) * 0.06 * jaw);
      const L = (0.06 + 0.26 * jaw) * k, w = 0.085;
      ctx.beginPath();
      ctx.moveTo(-w, -0.01);
      ctx.lineTo(-w, L - w);
      ctx.quadraticCurveTo(-w, L, 0, L);
      ctx.quadraticCurveTo(w, L, w, L - w);
      ctx.lineTo(w, -0.01);
      ctx.closePath();
      sticker(ctx, '#FF6B9A', '#B8325F', 0.012);
      ctx.beginPath(); ctx.moveTo(0, 0.02); ctx.lineTo(0, L * 0.6);
      ctx.strokeStyle = '#D24477'; ctx.lineWidth = 0.012; ctx.stroke();
    });
  }
  // nose + whisker dots
  local(ctx, f, P[4], () => {
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(-0.1, -0.03);
    ctx.bezierCurveTo(-0.1, -0.09, 0.1, -0.09, 0.1, -0.03);
    ctx.bezierCurveTo(0.1, 0.03, 0.03, 0.07, 0, 0.07);
    ctx.bezierCurveTo(-0.03, 0.07, -0.1, 0.03, -0.1, -0.03);
    ctx.closePath();
    const g = ctx.createRadialGradient(-0.03, -0.04, 0.01, 0, 0, 0.12);
    g.addColorStop(0, '#4A4A57'); g.addColorStop(1, '#0D0D12');
    sticker(ctx, g, '#000000', 0.012);
    ctx.beginPath(); ctx.ellipse(-0.035, -0.045, 0.028, 0.014, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
    ctx.fillStyle = '#1C1B22';
    for (const s of [-1, 1]) for (const [x, y] of [[0.15, 0.1], [0.2, 0.08], [0.18, 0.14]]) {
      ctx.beginPath(); ctx.arc(s * x, y, 0.012, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function shades(ctx, f, k) {
  const P = f.P;
  const r = mid(P[33], P[133]), l = mid(P[263], P[362]);
  const c = mid(r, l);
  const half = Math.hypot(l.x - r.x, l.y - r.y) / 2 / f.fw;
  local(ctx, f, c, () => {
    ctx.scale(k, k);
    const R = 0.19, w = 0.028;
    // arms + bridge
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-half - R * 0.9, -0.02); ctx.lineTo(-0.52, -0.04);
    ctx.moveTo(half + R * 0.9, -0.02); ctx.lineTo(0.52, -0.04);
    ctx.moveTo(-half + R * 0.55, -0.02); ctx.quadraticCurveTo(0, -0.09, half - R * 0.55, -0.02);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = w * 2.4; ctx.stroke();
    ctx.strokeStyle = '#FF4FA3'; ctx.lineWidth = w; ctx.stroke();
    for (const s of [-1, 1]) {
      const cx = s * half;
      ctx.beginPath(); starPath(ctx, cx, 0, R, R * 0.52);
      const g = ctx.createLinearGradient(cx - R, -R, cx + R, R);
      g.addColorStop(0, 'rgba(255, 110, 190, .6)'); g.addColorStop(1, 'rgba(70, 10, 120, .78)');
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = w * 2.4; ctx.stroke();
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#FF4FA3'; ctx.lineWidth = w; ctx.stroke();
      // shine
      ctx.save(); ctx.clip();
      ctx.beginPath(); ctx.moveTo(cx - R, -R * 0.1); ctx.lineTo(cx - R * 0.1, -R);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.03; ctx.stroke();
      ctx.restore();
    }
  });
}

function mustache(ctx, f, k, t) {
  const P = f.P;
  const lift = clamp01(((f.bs.mouthSmileLeft ?? 0) + (f.bs.mouthSmileRight ?? 0)) / 2) * 0.07;
  local(ctx, f, lerp(P[2], P[0], 0.45), () => {
    ctx.scale(k, k);
    ctx.rotate(Math.sin(t * 5) * 0.015);
    ctx.beginPath();
    for (const s of [1, -1]) {
      ctx.moveTo(0, -0.03);
      ctx.bezierCurveTo(s * 0.08, -0.08, s * 0.2, -0.07, s * 0.26, -0.005);
      ctx.bezierCurveTo(s * 0.3, 0.03, s * 0.35, -0.02 - lift, s * 0.31, -0.07 - lift);
      ctx.bezierCurveTo(s * 0.37, -0.03 - lift, s * 0.35, 0.07, s * 0.24, 0.065);
      ctx.bezierCurveTo(s * 0.16, 0.065, s * 0.07, 0.05, 0, 0.03);
      ctx.closePath();
    }
    sticker(ctx, '#2B1A10', '#120904', 0.012);
    ctx.beginPath();
    ctx.moveTo(-0.2, -0.03); ctx.quadraticCurveTo(-0.1, -0.06, -0.03, -0.02);
    ctx.moveTo(0.2, -0.03); ctx.quadraticCurveTo(0.1, -0.06, 0.03, -0.02);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 0.012; ctx.stroke();
  });
}

// ───────────────────────────────────────────── compose
export function drawFace(ctx, f, sel, t) {
  const k = (id) => popIn(sel[id].at ?? 0, t);
  const color = (id) => MAKEUP.find((m) => m.id === id).colors[sel[id].c];
  if (sel.shadow.on) eyeshadow(ctx, f, color('shadow').hex, clamp01(k('shadow')));
  if (sel.lips.on) lips(ctx, f, color('lips').hex, clamp01(k('lips')));
  if (sel.glitter.on) glitter(ctx, f, color('glitter').set, k('glitter'), t);
  if (sel.stache.on) mustache(ctx, f, k('stache'), t);
  if (sel.puppy.on) puppyFace(ctx, f, k('puppy'), t);
  if (sel.shades.on) shades(ctx, f, k('shades'));
  if (sel.puppy.on) puppyEars(ctx, f, k('puppy'), t);
  if (sel.crown.on) crown(ctx, f, k('crown'), t);
}
