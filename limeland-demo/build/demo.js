/* ============================================================
   拉丝 · 夜光画室 60 秒试玩（Three.js 2.5D）
   透视相机 + 分层视差 + Bloom/ACES + 弹性绳物理
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1280, H = 720;
const stageEl = document.getElementById('stage');
const timerEl = document.getElementById('timer');
const pizzaEl = document.getElementById('pizza');
const endStarsEl = document.getElementById('endStars');
const startEl = document.getElementById('start');
const endEl = document.getElementById('end');
const toastEl = document.getElementById('toast');
const tensionEl = document.getElementById('tension');
const heartsEl = document.getElementById('hearts');
const progFill = document.getElementById('progFill');
const progPct = document.getElementById('progPct');
const ringFg = document.getElementById('ringFg');
const segsEl = document.getElementById('segs');
const tensionHint = document.getElementById('tensionHint');
const pizzaIcons = document.querySelectorAll('#pizzas .pz');
const debugEl = document.getElementById('debug');
const fpsEl = document.getElementById('fps');
const levelCardEl = document.getElementById('levelCard');
const countdownEl = document.getElementById('countdown');
const cdNumEl = document.getElementById('cdNum');
const pauseEl = document.getElementById('pause');
const hitFlashEl = document.getElementById('hitflash');
const rankEl = document.getElementById('rank');
const bestLineEl = document.getElementById('bestLine');

let screen = 'attract';        // attract | card | count | play | pause | result
let cardT = 0, countT = 0, countLabel = '';
let hitFlashT = 0;
const tut = { move: false, pull: false, fling: false };
const parts = [];
const ghosts = [];
const BEST_KEY = 'limeland_best_time';
const rnd = (a, b) => a + Math.random() * (b - a);

/* 可调参数（G1：全部外置，调试面板实时改） */
const TUNE = {
  gravity: 1950, jump: 880, moveAccel: 3400, maxSpeed: 450,
  ropeRest: 330, ropePull: 110, ropeMax: 640, ropeK: 10,
  pullSpeed: 680, releaseSpeed: 480,
  flingThreshold: 350, flingPush: 320, flingLift: 1.14
};

/* 本局日志（G1：先本地记录，后续接上报） */
const TELE = { startedAt: Date.now(), events: [], summary: null };
function log(name, data) {
  TELE.events.push(Object.assign({ t: +perf.toFixed(2), name: name }, data || {}));
}

/* ---------------- 渲染器 ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  startEl.classList.add('hidden');
  stageEl.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#FF8FA8;font-size:16px;text-align:center;padding:40px;background:#05010c">这个浏览器没有可用的 WebGL2。<br>请用 Chrome / Edge 打开，并确认硬件加速已开启。</div>';
  throw e;
}
renderer.setSize(W, H);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05010c);
scene.fog = new THREE.FogExp2(0x05010c, 0.00026);

const camera = new THREE.PerspectiveCamera(30, W / H, 1, 8000);
camera.position.set(0, 320, 1500);
camera.lookAt(0, 320, 0);
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.5, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------------- 素材 ---------------- */
function loadImage(src) {
  return new Promise(function (res, rej) {
    const im = new Image();
    im.onload = function () { res(im); };
    im.onerror = rej;
    im.src = src;
  });
}

function cropCanvas(img, frac) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = Math.floor(img.height * frac);
  c.getContext('2d').drawImage(img, 0, 0, img.width, c.height, 0, 0, c.width, c.height);
  return c;
}

function cutoutCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const d = id.data, w = c.width, h = c.height;
  const seen = new Uint8Array(w * h), stack = [];
  const isBg = i => d[i * 4] > 232 && d[i * 4 + 1] > 232 && d[i * 4 + 2] > 232;
  function push(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (seen[i]) return; seen[i] = 1;
    if (!isBg(i)) return; stack.push(i);
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(); d[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  for (let pass = 0; pass < 3; pass++) {
    const src = new Uint8ClampedArray(d);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] !== 0) continue;
        const nb = [((y - 1) * w + x) * 4, ((y + 1) * w + x) * 4, (y * w + x - 1) * 4, (y * w + x + 1) * 4];
        for (let k = 0; k < 4; k++) if (src[nb[k] + 3] > 40) {
          d[i] = src[nb[k]]; d[i + 1] = src[nb[k] + 1]; d[i + 2] = src[nb[k] + 2]; break;
        }
      }
    }
  }
  g.putImageData(id, 0, 0);
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 12) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function radialCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}

function shadowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,.8)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}

/* ---------------- 关卡 ---------------- */
const PLATFORMS = [
  { x0: -800, x1: 200, y: 0 },
  { x0: 480, x1: 880, y: 60 },
  { x0: 1160, x1: 1560, y: 140 },
  { x0: 1840, x1: 2240, y: 60 },
  { x0: 2520, x1: 2920, y: 180 },
  { x0: 3360, x1: 4200, y: 260 }
];
const EXIT_X = 3940;

const state = {
  started: false, over: false, win: false,
  time: 60, camX: -200, camY: 320, falls: 0, pizza: 0, shake: 0, lives: 3
};
const checkpoint = { x: -180, y: 0 };
const p1 = { x: -380, y: 0, vx: 0, vy: 0, grounded: false, squash: 0, jumpQueued: false, hit: 0 };
const p2 = { x: 20, y: 0, vx: 0, vy: 0, grounded: false, squash: 0, jumpQueued: false, hit: 0 };
const chars = {};
const PIZZA_POS = [{ x: 680, y: 210 }, { x: 1450, y: 300 }, { x: 2680, y: 330 }];
const pizzas = [];
const fx = [];
const hazard = { cx: 1360, cy: 270, len: 320, ang: 0, spd: 1.15, mesh: null, glow: null };
let ropeMesh = null, ropePos = null;
const ROPE_N = 22;
const HAND = 120;
let ropePts = [], ropeWobble = 0, ropeTaut = false;
let ropeRest = 330;
let ready = false;
let perf = 0;
let toastT = 0;
let flingTutorial = false;
const keys = Object.create(null);

/* ---------------- 场景搭建 ---------------- */
function buildBackground(bgImage) {
  const canvas = cropCanvas(bgImage, 0.93);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(2800, 1575);
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false, color: 0xb9b0d6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, 0, -2700);
  mesh.renderOrder = -10;
  camera.add(mesh);
}

function buildPlatforms() {
  const colors = [0xC6F24E, 0x57E0FF, 0xFF8FA8];
  const glowTex = new THREE.CanvasTexture(radialCanvas());
  PLATFORMS.forEach(function (p, i) {
    const w = p.x1 - p.x0, cx = (p.x0 + p.x1) / 2;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, 28, 56),
      new THREE.MeshBasicMaterial({ color: 0x2a1550 })
    );
    body.position.set(cx, p.y - 14, 0);
    scene.add(body);

    const edgeColor = colors[i % 3];
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(w, 6, 60),
      new THREE.MeshBasicMaterial({ color: edgeColor, toneMapped: false })
    );
    edge.position.set(cx, p.y + 3, 0);
    scene.add(edge);

    const spec = new THREE.Mesh(
      new THREE.BoxGeometry(w, 2, 62),
      new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.35, toneMapped: false })
    );
    spec.position.set(cx, p.y + 6.5, 0);
    scene.add(spec);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.25, 150),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: edgeColor, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      })
    );
    glow.position.set(cx, p.y - 52, -3);
    scene.add(glow);
  });

  // 霓虹画框交给背景插画本身，不再叠一层，避免画面过密
  const frameColors = [0xC6F24E, 0xFF8FA8, 0x57E0FF];

  // 中景光斑
  const dotTex = new THREE.CanvasTexture(radialCanvas());
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, color: frameColors[i % 3], transparent: true, opacity: 0.08,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    s.position.set(-600 + Math.random() * 5000, 120 + Math.random() * 560, -460);
    s.scale.set(70 + Math.random() * 120, 70 + Math.random() * 120, 1);
    scene.add(s);
  }

  // 终点拱门
  const goalMat = new THREE.MeshBasicMaterial({ color: 0xC6F24E, toneMapped: false });
  [-1, 1].forEach(function (s) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(12, 360, 12), goalMat);
    pillar.position.set(EXIT_X + s * 70, 440, 0);
    scene.add(pillar);
  });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(152, 12, 12), goalMat);
  bar.position.set(EXIT_X, 620, 0);
  scene.add(bar);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTex, color: 0xC6F24E, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  halo.position.set(EXIT_X, 450, -20);
  halo.scale.set(360, 520, 1);
  scene.add(halo);
}

function buildCharacter(canvas, tint, x, y) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const aspect = canvas.width / canvas.height;
  const h = 170, w = h * aspect;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide })
  );
  mesh.position.set(x, y + 85, 20);
  scene.add(mesh);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(radialCanvas()), color: tint,
    transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  }));
  glow.scale.set(280, 280, 1);
  glow.position.set(x, y + 85, 12);
  scene.add(glow);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(140, 48),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas()), transparent: true,
      opacity: 0.55, depthWrite: false, toneMapped: false
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, y + 1, 18);
  scene.add(shadow);

  return { mesh: mesh, glow: glow, shadow: shadow, baseW: w, baseH: h };
}

function buildRope() {
  const N = ROPE_N;
  ropePos = new Float32Array(N * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(ropePos, 3));
  const idx = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  ropeMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xC6F24E, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    toneMapped: false, depthWrite: false
  }));
  ropeMesh.frustumCulled = false;
  scene.add(ropeMesh);
  ropeMesh.userData.N = N;
  initRope();
}

function initRope() {
  const a = { x: p1.x, y: p1.y + HAND };
  const b = { x: p2.x, y: p2.y + HAND };
  ropePts = [];
  for (let i = 0; i < ROPE_N; i++) {
    const u = i / (ROPE_N - 1);
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    ropePts.push({ x: x, y: y, px: x, py: y });
  }
  ropeWobble = 0;
  ropeTaut = false;
}

function buildLamps() {
  const tex = new THREE.CanvasTexture(radialCanvas());
  [-260, 820, 1900, 3000].forEach(function (x) {
    const y = 540;
    const cord = new THREE.Mesh(
      new THREE.BoxGeometry(3, 190, 3),
      new THREE.MeshBasicMaterial({ color: 0x2a1a4a })
    );
    cord.position.set(x, y + 130, -200);
    scene.add(cord);

    const shade = new THREE.Mesh(
      new THREE.CylinderGeometry(14, 46, 34, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3a1f6e, side: THREE.DoubleSide })
    );
    shade.position.set(x, y + 20, -200);
    scene.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(14, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xFFF0C0, toneMapped: false })
    );
    bulb.position.set(x, y, -200);
    scene.add(bulb);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xFFD27A, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    glow.position.set(x, y, -200);
    glow.scale.set(300, 300, 1);
    scene.add(glow);
  });
}

function pizzaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.fillStyle = '#F2B44E';
  g.beginPath(); g.arc(0, 0, 52, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#C97C1E'; g.lineWidth = 12;
  g.beginPath(); g.arc(0, 0, 47, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#FFE39A';
  g.beginPath(); g.arc(-3, 2, 36, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#D8473C';
  [[-18, -12], [16, -16], [10, 18], [-22, 16], [0, 0]].forEach(function (p) {
    g.beginPath(); g.arc(p[0], p[1], 9, 0, Math.PI * 2); g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPizzas() {
  const tex = pizzaTexture();
  const glowTex = new THREE.CanvasTexture(radialCanvas());
  PIZZA_POS.forEach(function (p, i) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, toneMapped: false
    }));
    spr.scale.set(56, 56, 1);
    spr.position.set(p.x, p.y, 42);
    scene.add(spr);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xFFC94A, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    glow.scale.set(120, 120, 1);
    glow.position.set(p.x, p.y, 40);
    scene.add(glow);

    pizzas.push({ x: p.x, baseY: p.y, y: p.y, taken: false, sprite: spr, glow: glow, phase: i * 2.1 });
  });
}

function buildHazard() {
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(hazard.len, 13, 13),
    new THREE.MeshBasicMaterial({ color: 0xFF4D8D, toneMapped: false })
  );
  bar.position.set(hazard.cx, hazard.cy, 25);
  scene.add(bar);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(radialCanvas()), color: 0xFF4D8D,
    transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  }));
  glow.position.set(hazard.cx, hazard.cy, 20);
  glow.scale.set(300, 300, 1);
  scene.add(glow);

  hazard.mesh = bar;
  hazard.glow = glow;
}

function updatePizzaHUD() {
  pizzaEl.textContent = state.pizza + ' / 3';
  for (let i = 0; i < pizzaIcons.length; i++) {
    pizzaIcons[i].classList.toggle('off', i >= state.pizza);
  }
}
function updateHearts() {
  const hs = heartsEl.querySelectorAll('svg');
  for (let i = 0; i < hs.length; i++) hs[i].classList.toggle('off', i >= state.lives);
}
function toast(text, d) {
  toastEl.textContent = text;
  toastEl.style.opacity = 1;
  toastT = d || 2;
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function ring(x, y, color) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(radialCanvas()), color: color,
    transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  }));
  spr.position.set(x, y, 46);
  spr.scale.set(40, 40, 1);
  scene.add(spr);
  fx.push({ sprite: spr, life: 0.45, max: 0.45 });
}

function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) { scene.remove(f.sprite); fx.splice(i, 1); continue; }
    const k = 1 - f.life / f.max;
    f.sprite.scale.set(40 + k * 160, 40 + k * 160, 1);
    f.sprite.material.opacity = 0.8 * (1 - k);
  }
}

function spawnPart(x, y, color, vx, vy, size, life) {
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(radialCanvas()), color: color,
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  }));
  spr.position.set(x, y, 44);
  spr.scale.set(size, size, 1);
  scene.add(spr);
  parts.push({ sprite: spr, vx: vx, vy: vy, life: life, max: life, size: size });
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.sprite); parts.splice(i, 1); continue; }
    p.vy += 620 * dt;
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.y += p.vy * dt;
    const k = p.life / p.max;
    p.sprite.material.opacity = 0.9 * k;
    const s = p.size * (0.5 + k * 0.5);
    p.sprite.scale.set(s, s, 1);
  }
}
function spawnGhost(p, c) {
  if (!c || !c.mesh) return;
  const g = c.mesh.geometry.parameters;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: c.mesh.material.map, transparent: true, opacity: 0.28,
    depthWrite: false
  }));
  spr.scale.set(g.width, g.height, 1);
  spr.position.set(p.x, p.y + 85, 18);
  scene.add(spr);
  ghosts.push({ sprite: spr, life: 0.3, max: 0.3 });
}
function updateGhosts(dt) {
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const g = ghosts[i];
    g.life -= dt;
    if (g.life <= 0) { scene.remove(g.sprite); ghosts.splice(i, 1); continue; }
    const k = g.life / g.max;
    g.sprite.material.opacity = 0.28 * k;
  }
}

function buildMotes() {
  const n = 120;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = -900 + Math.random() * 5400;
    arr[i * 3 + 1] = -80 + Math.random() * 820;
    arr[i * 3 + 2] = Math.random() * 320;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.2, color: 0xfff2c0, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  scene.add(new THREE.Points(geo, mat));
}

/* ---------------- 音效 ---------------- */
let AC = null, master = null, muted = false, ambientStarted = false;
function ensureAudio() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
  }
  if (AC.state === 'suspended') AC.resume();
  if (!master) {
    master = AC.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(AC.destination);
  }
  return true;
}
function beep(freq, dur, type, gain) {
  if (!ensureAudio()) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain || 0.04, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
function startAmbient() {
  if (!ensureAudio() || ambientStarted) return;
  ambientStarted = true;
  const bus = AC.createGain();
  bus.gain.value = 0;
  bus.connect(master);
  [98, 147, 196].forEach(function (f, i) {
    const o = AC.createOscillator();
    o.type = i ? 'sine' : 'triangle';
    o.frequency.value = f;
    const g = AC.createGain();
    g.gain.value = i ? 0.010 : 0.016;
    o.connect(g); g.connect(bus); o.start();
  });
  bus.gain.linearRampToValueAtTime(0.055, AC.currentTime + 2.5);
}
function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.9;
  const b = document.getElementById('muteBtn');
  if (b) b.textContent = muted ? '取消静音' : '静音';
  const b2 = document.getElementById('muteBtn2');
  if (b2) b2.textContent = muted ? '取消静音' : '静音';
}

/* 程序化配乐：84 BPM，低音 + 铺底 + 琶音，低血量时加紧张层 */
let musicStarted = false, musicTimer = null, musicStep = 0, musicNext = 0, musicBus = null, musicTense = false;
function musicNote(freq, t, dur, type, gain) {
  if (!AC || !musicBus) return;
  const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  o.type = type; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.value = 1400;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + dur + 0.05);
}
function scheduleMusic() {
  if (!AC || !musicBus) return;
  const stepDur = (60 / 84) / 2;
  while (musicNext < AC.currentTime + 0.25) {
    const s = musicStep % 16;
    const bar = Math.floor(musicStep / 16) % 4;
    const t = musicNext;
    const bass = [110, 87.3, 130.8, 98];
    if (s % 4 === 0) musicNote(bass[bar], t, 0.55, 'triangle', 0.05);
    if (s === 0) {
      const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
      chords[bar].forEach(function (f) { musicNote(f, t, 1.4, 'sine', 0.016); });
    }
    if (s % 2 === 1) {
      const arp = [[440, 523, 659], [349, 440, 523], [523, 659, 784], [392, 494, 587]];
      musicNote(arp[bar][(s >> 1) % 3], t, 0.18, 'triangle', musicTense ? 0.03 : 0.016);
    }
    if (musicTense && s % 2 === 0) musicNote(1318.5, t, 0.08, 'square', 0.008);
    musicNext += stepDur;
    musicStep++;
  }
}
function startMusic() {
  if (!ensureAudio() || musicStarted) return;
  musicStarted = true;
  musicBus = AC.createGain();
  musicBus.gain.value = 0.22;
  musicBus.connect(master);
  musicNext = AC.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 60);
}
function stopMusic() {
  musicStarted = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (musicBus) { try { musicBus.disconnect(); } catch (e) { } musicBus = null; }
}

/* ---------------- 输入 ---------------- */
window.addEventListener('keydown', function (e) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  const first = !keys[e.code];
  keys[e.code] = true;
  if (!first) return;
  if (e.code === 'Space') {
    if (screen === 'attract' || screen === 'result') beginSequence();
  }
  if (e.code === 'Escape') {
    if (screen === 'play') pauseGame();
    else if (screen === 'pause') resumeGame();
  }
  if (e.code === 'KeyR') {
    if (screen === 'play' || screen === 'pause' || screen === 'result') beginSequence();
  }
  if (e.code === 'KeyW' && screen === 'play') p1.jumpQueued = true;
  if (e.code === 'ArrowUp' && screen === 'play') p2.jumpQueued = true;
  if ((e.code === 'KeyF' || e.code === 'KeyJ') && screen === 'play') beep(180, 0.12, 'triangle', 0.03);
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });

/* ---------------- 游戏逻辑 ---------------- */
function resetGame() {
  p1.x = -380; p1.y = 0; p1.vx = 0; p1.vy = 0; p1.grounded = false; p1.squash = 0; p1.hit = 0;
  p2.x = 20; p2.y = 0; p2.vx = 0; p2.vy = 0; p2.grounded = false; p2.squash = 0; p2.hit = 0;
  checkpoint.x = -180; checkpoint.y = 0;
  ropeRest = 330;
  initRope();
  state.time = 60; state.over = false; state.win = false; state.falls = 0;
  state.pizza = 0; state.shake = 0; state.lives = 3;
  flingTutorial = false;
  toastT = 0;
  toastEl.style.opacity = 0;
  pizzas.forEach(function (pz) {
    pz.taken = false; pz.sprite.visible = true; pz.glow.visible = true;
  });
  hazard.ang = 0;
  updatePizzaHUD();
  updateHearts();
  timerEl.textContent = '60.0';
  timerEl.classList.remove('warn');
  ringFg.style.strokeDashoffset = '0';
  progFill.style.width = '0%';
  progPct.textContent = '0%';
  for (let i = 0; i < segsEl.children.length; i++) segsEl.children[i].className = '';
  tensionHint.textContent = '保持松绳';
  state.camX = -200; state.camY = 320;
  endEl.classList.add('hidden');
}
function showEl(el) { el.classList.remove('hidden'); }
function hideEl(el) { el.classList.add('hidden'); }

function beginSequence() {
  ensureAudio();
  if (AC && AC.state === 'suspended') AC.resume();
  startMusic();
  hideEl(startEl); hideEl(endEl); hideEl(pauseEl); hideEl(countdownEl);
  resetGame();
  showEl(levelCardEl);
  cardT = 1.25;
  screen = 'card';
  log('begin');
}
function startPlay() {
  hideEl(levelCardEl);
  hideEl(countdownEl);
  resetGame();
  screen = 'play';
  state.started = true;
  state.over = false;
  tut.move = true;
  tut.pull = false;
  flingTutorial = false;
  log('play');
  toast('A / D 移动 · W 跳', 2.2);
}
function pauseGame() {
  if (screen !== 'play') return;
  screen = 'pause';
  showEl(pauseEl);
  if (AC && AC.state === 'running') AC.suspend();
}
function resumeGame() {
  if (screen !== 'pause') return;
  hideEl(pauseEl);
  screen = 'play';
  if (AC) AC.resume();
}
function toTitle() {
  screen = 'attract';
  state.started = false;
  state.over = false;
  hideEl(endEl); hideEl(pauseEl); hideEl(countdownEl); hideEl(levelCardEl);
  showEl(startEl);
  resetGame();
  stopMusic();
  if (AC && AC.state === 'suspended') AC.resume();
}
function endGame(win, reason) {
  screen = 'result';
  state.over = true;
  state.win = win;
  document.getElementById('endTitle').textContent =
    win ? '逃出来了' : reason === 'lives' ? '心用完了' : '时间到';
  let stars = 0;
  if (win) {
    stars = 1;
    if (state.pizza >= 2 || state.time > 20) stars = 2;
    if (state.pizza === 3 && state.time > 15) stars = 3;
  }
  const elapsed = +(60 - state.time).toFixed(1);
  let rank = 'C';
  if (win) rank = stars === 3 ? (elapsed < 35 ? 'S' : 'A') : stars === 2 ? 'A' : 'B';
  rankEl.textContent = rank;
  rankEl.style.color = rank === 'S' ? '#FFD45C' : rank === 'A' ? '#C6F24E' : rank === 'B' ? '#57E0FF' : '#9a8fb8';

  const best = parseFloat((function(){try{return localStorage.getItem(BEST_KEY)}catch(e){return null}})() || '0');
  let newBest = false;
  if (win && (!best || elapsed < best)) {
    try{localStorage.setItem(BEST_KEY,String(elapsed))}catch(e){}
    newBest = true;
  }
  bestLineEl.textContent = win
    ? (newBest ? 'NEW BEST · ' + elapsed.toFixed(1) + 's' : '最好成绩 ' + (best || elapsed).toFixed(1) + 's')
    : '';

  const starEls = endStarsEl.querySelectorAll('svg');
  for (let i = 0; i < starEls.length; i++) starEls[i].classList.toggle('off', i >= stars);

  document.getElementById('endStat').innerHTML =
    '<div><small>用时</small><b>' + elapsed.toFixed(1) + 's</b></div>' +
    '<div><small>披萨</small><b>' + state.pizza + ' / 3</b></div>' +
    '<div><small>掉坑</small><b>' + state.falls + '</b></div>';
  endEl.classList.remove('hidden');
  if (win) {
    beep(660, 0.2, 'triangle', 0.05);
    for (let i = 0; i < 26; i++) {
      spawnPart(EXIT_X, 430, [0xC6F24E, 0xFF9AD6, 0xFFC94A][i % 3],
        rnd(-260, 260), rnd(-320, 180), rnd(12, 26), rnd(0.6, 1.2));
    }
  }
  log(win ? 'win' : 'lose', { time: +state.time.toFixed(1), pizza: state.pizza, falls: state.falls });
  TELE.summary = {
    win: win, elapsed: elapsed,
    pizza: state.pizza, falls: state.falls, stars: stars, rank: rank
  };
}
function respawn(p) {
  p.x = checkpoint.x; p.y = checkpoint.y + 4;
  p.vx = 0; p.vy = 0;
  state.falls++;
  log('fall', { x: Math.round(p.x) });
  beep(140, 0.2, 'sawtooth', 0.04);
  state.lives--;
  updateHearts();
  hitFlashT = 0.35;
  if (state.lives > 0) toast('掉下去了 · 还剩 ' + state.lives + ' 颗心', 1.6);
  if (state.lives <= 0) endGame(false, 'lives');
}

function step(dt) {
  const ps = [p1, p2];
  for (let i = 0; i < 2; i++) {
    const p = ps[i];
    if (p.hit > 0) p.hit -= dt;
    const canMove = p.hit <= 0;
    const left = canMove && (i === 0 ? keys['KeyA'] : keys['ArrowLeft']);
    const right = canMove && (i === 0 ? keys['KeyD'] : keys['ArrowRight']);
    if (left) p.vx -= TUNE.moveAccel * dt;
    if (right) p.vx += TUNE.moveAccel * dt;
    if (!left && !right) p.vx *= Math.pow(0.0006, dt);
    p.vx = Math.max(-TUNE.maxSpeed, Math.min(TUNE.maxSpeed, p.vx));

    if (p.jumpQueued) {
      if (p.grounded && canMove) {
        const other = i === 0 ? p2 : p1;
        const ropeDist = Math.hypot(p.x - other.x, p.y - other.y);
        const boosted = ropeDist > TUNE.flingThreshold;
        p.vy = TUNE.jump * (boosted ? TUNE.flingLift : 1);
        if (boosted) {
          p.vx += (p.x < other.x ? -1 : 1) * TUNE.flingPush;
          ropeWobble = 1;
          state.shake = 6;
          beep(760, 0.16, 'triangle', 0.05);
          toast('甩出去了！', 0.9);
          spawnGhost(p, i === 0 ? chars.green : chars.pink);
          log('fling', { x: Math.round(p.x) });
        } else {
          beep(440, 0.1, 'sine', 0.035);
        }
        p.grounded = false;
      }
      p.jumpQueued = false;
    }
    p.vy -= TUNE.gravity * dt;
    const prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const was = p.grounded;
    p.grounded = false;
    for (let k = 0; k < PLATFORMS.length; k++) {
      const plat = PLATFORMS[k];
      if (p.vy <= 0 && prevY >= plat.y - 2 && p.y <= plat.y && p.x > plat.x0 - 24 && p.x < plat.x1 + 24) {
        p.y = plat.y; p.vy = 0; p.grounded = true;
        if (plat.x1 > checkpoint.x) { checkpoint.x = plat.x1 - 130; checkpoint.y = plat.y; }
      }
    }
    if (!was && p.grounded) {
      p.squash = 0.2;
      for (let k = 0; k < 6; k++) {
        spawnPart(p.x + rnd(-22, 22), p.y + 3, i === 0 ? 0xABE14D : 0xFF9AD6,
          rnd(-140, 140), rnd(-90, 30), rnd(10, 20), rnd(0.25, 0.5));
      }
    }
    if (p.y < -520) respawn(p);

    // 收集披萨
    for (let k = 0; k < pizzas.length; k++) {
      const pz = pizzas[k];
      if (pz.taken) continue;
      if (Math.hypot(p.x - pz.x, (p.y + 85) - pz.y) < 58) {
        pz.taken = true;
        pz.sprite.visible = false;
        pz.glow.visible = false;
        state.pizza++;
        updatePizzaHUD();
        if (state.lives < 3) { state.lives++; updateHearts(); }
        log('pizza', { n: state.pizza });
        beep(900, 0.16, 'triangle', 0.05);
        ring(pz.x, pz.y, 0xFFC94A);
        for (let q = 0; q < 8; q++) {
          spawnPart(pz.x, pz.y, 0xFFC94A, rnd(-200, 200), rnd(-200, 120), rnd(8, 16), rnd(0.3, 0.6));
        }
      }
    }
  }

  // 旋转机关
  if (hazard.mesh) {
    hazard.ang += dt * hazard.spd;
    const ex = Math.cos(hazard.ang) * hazard.len / 2;
    const ey = Math.sin(hazard.ang) * hazard.len / 2;
    [p1, p2].forEach(function (p) {
      if (p.hit > 0) return;
      if (distToSeg(p.x, p.y + 85, hazard.cx - ex, hazard.cy - ey, hazard.cx + ex, hazard.cy + ey) < 54) {
        p.hit = 0.55;
        p.vx += (p.x < hazard.cx ? -1 : 1) * 430;
        p.vy = 470;
        state.shake = 14;
        beep(120, 0.22, 'sawtooth', 0.05);
        hitFlashT = 0.35;
        log('hit', { x: Math.round(p.x) });
      }
    });
  }
  state.shake *= Math.pow(0.02, dt * 2.5);

  ropeStep(dt);
  state.camX += (Math.max(-260, Math.min(3600, (p1.x + p2.x) / 2 + 60)) - state.camX) * Math.min(1, dt * 4);
  state.camY += (Math.max(200, Math.min(560, (p1.y + p2.y) / 2 + 140)) - state.camY) * Math.min(1, dt * 3);
}

function ropeStep(dt) {
  const a = { x: p1.x, y: p1.y + HAND };
  const b = { x: p2.x, y: p2.y + HAND };
  let dx = b.x - a.x, dy = b.y - a.y;
  let dist = Math.hypot(dx, dy) || 0.001;
  const pulling = !!keys['KeyF'] || !!keys['KeyJ'];
  const target = pulling ? TUNE.ropePull : TUNE.ropeRest;
  ropeRest += Math.max(-TUNE.pullSpeed * dt, Math.min(TUNE.releaseSpeed * dt, target - ropeRest));

  if (dist > ropeRest) {
    const nx = dx / dist, ny = dy / dist;
    const stretch = dist - ropeRest;
    let w1 = 0.5, w2 = 0.5;
    if (p1.grounded && !p2.grounded) { w1 = 0.15; w2 = 0.85; }
    else if (p2.grounded && !p1.grounded) { w1 = 0.85; w2 = 0.15; }
    const acc = Math.min(1800, stretch * TUNE.ropeK);
    p1.vx += nx * acc * w1 * dt; p1.vy += ny * acc * w1 * dt;
    p2.vx -= nx * acc * w2 * dt; p2.vy -= ny * acc * w2 * dt;
    const rel = (p2.vx - p1.vx) * nx + (p2.vy - p1.vy) * ny;
    p1.vx += nx * rel * 0.18 * w1; p1.vy += ny * rel * 0.18 * w1;
    p2.vx -= nx * rel * 0.18 * w2; p2.vy -= ny * rel * 0.18 * w2;
  }
  if (dist > TUNE.ropeMax) {
    const nx = dx / dist, ny = dy / dist, ex = dist - TUNE.ropeMax;
    p1.x += nx * ex * 0.5; p1.y += ny * ex * 0.5;
    p2.x -= nx * ex * 0.5; p2.y -= ny * ex * 0.5;
  }
  [p1, p2].forEach(function (p) {
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 1100) { p.vx *= 1100 / sp; p.vy *= 1100 / sp; }
  });
}

/* ---------------- 画面更新 ---------------- */
function updateVisuals(dt) {
  [p1, p2].forEach(function (p, i) {
    const c = i === 0 ? chars.green : chars.pink;
    if (!c) return;
    p.squash *= Math.pow(0.0005, dt * 2.2);
    c.mesh.position.set(p.x, p.y + 85, 20);
    c.mesh.rotation.z = Math.max(-0.14, Math.min(0.14, p.vx / 2800));
    c.mesh.scale.set(1 + p.squash, 1 - p.squash, 1);
    c.glow.position.set(p.x, p.y + 85, 12);
    c.glow.material.opacity = 0.28 + Math.sin(perf * 3 + i * 2) * 0.05;

    let gy = null;
    for (let k = 0; k < PLATFORMS.length; k++) {
      const plat = PLATFORMS[k];
      if (p.x > plat.x0 && p.x < plat.x1 && plat.y <= p.y + 24) {
        if (gy === null || plat.y > gy) gy = plat.y;
      }
    }
    if (gy === null) { c.shadow.visible = false; }
    else {
      c.shadow.visible = true;
      const lift = Math.max(0.18, 1 - (p.y - gy) / 300);
      c.shadow.position.set(p.x, gy + 1, 18);
      c.shadow.scale.set(lift, lift, 1);
      c.shadow.material.opacity = 0.55 * lift;
    }
  });

  // 披萨漂浮
  for (let i = 0; i < pizzas.length; i++) {
    const pz = pizzas[i];
    if (pz.taken) continue;
    const y = pz.baseY + Math.sin(perf * 2 + pz.phase) * 9;
    pz.sprite.position.y = y;
    pz.glow.position.y = y;
    const s = 1 + Math.sin(perf * 3 + pz.phase) * 0.06;
    pz.glow.scale.set(120 * s, 120 * s, 1);
    pz.sprite.material.rotation = Math.sin(perf * 1.5 + pz.phase) * 0.08;
  }

  if (hazard.mesh) hazard.mesh.rotation.z = hazard.ang;
  updateFx(dt);

  updateRopeVisual(dt);
}

/* ---------------- 绳子视觉（Verlet 链） ---------------- */
function updateRopeVisual(dt) {
  if (!ropeMesh || ropePts.length !== ROPE_N) return;
  const a = { x: p1.x, y: p1.y + HAND };
  const b = { x: p2.x, y: p2.y + HAND };
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const SEG = 340 / (ROPE_N - 1);
  const step = Math.min(dt, 0.033);

  ropePts[0].x = a.x; ropePts[0].y = a.y;
  ropePts[ROPE_N - 1].x = b.x; ropePts[ROPE_N - 1].y = b.y;

  // 积分：轻重力 + 阻尼，让绳子自然下垂
  for (let i = 1; i < ROPE_N - 1; i++) {
    const p = ropePts[i];
    const vx = (p.x - p.px) * 0.985;
    const vy = (p.y - p.py) * 0.985;
    p.px = p.x; p.py = p.y;
    p.x += vx;
    p.y += vy - 1500 * step * step;
  }

  // 距离约束：固定自然长度，近则下垂，远则绷直
  for (let it = 0; it < 10; it++) {
    for (let i = 0; i < ROPE_N - 1; i++) {
      const p = ropePts[i], q = ropePts[i + 1];
      const ddx = q.x - p.x, ddy = q.y - p.y;
      const d = Math.hypot(ddx, ddy) || 0.001;
      const diff = (d - SEG) / d * 0.5;
      const ox = ddx * diff, oy = ddy * diff;
      if (i !== 0) { p.x += ox; p.y += oy; }
      if (i + 1 !== ROPE_N - 1) { q.x -= ox; q.y -= oy; }
    }
    ropePts[0].x = a.x; ropePts[0].y = a.y;
    ropePts[ROPE_N - 1].x = b.x; ropePts[ROPE_N - 1].y = b.y;
  }

  const taut = dist > 340;
  if (taut && !ropeTaut) ropeWobble = 1;
  ropeTaut = taut;
  ropeWobble *= Math.pow(0.015, step * 2);

  const pulling = !!keys['KeyF'] || !!keys['KeyJ'];
  const stretch = Math.max(0, dist - 340);
  const baseW = (pulling ? 14.5 : 11) * (1 - Math.min(0.35, stretch / 900));

  for (let i = 0; i < ROPE_N; i++) {
    const p0 = ropePts[Math.max(0, i - 1)];
    const p2p = ropePts[Math.min(ROPE_N - 1, i + 1)];
    let tx = p2p.x - p0.x, ty = p2p.y - p0.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const u = i / (ROPE_N - 1);

    // 绷紧时的颤动（只影响视觉，不影响物理）
    const amp = taut
      ? (1.2 + Math.min(6, stretch * 0.05)) * Math.sin(Math.PI * u) * (0.35 + ropeWobble)
      : 0;
    const wob = Math.sin(perf * 27 + i * 1.35) * amp;
    const w = baseW * (0.72 + 0.28 * Math.sin(Math.PI * u));
    const x = ropePts[i].x + nx * wob;
    const y = ropePts[i].y + ny * wob;

    const o = i * 6;
    ropePos[o] = x + nx * w / 2;
    ropePos[o + 1] = y + ny * w / 2;
    ropePos[o + 2] = 30;
    ropePos[o + 3] = x - nx * w / 2;
    ropePos[o + 4] = y - ny * w / 2;
    ropePos[o + 5] = 30;
  }
  ropeMesh.geometry.attributes.position.needsUpdate = true;
  ropeMesh.material.color.setHex(pulling ? 0xF2FFC8 : 0xC6F24E);
  ropeMesh.material.opacity = 0.95;
}

/* ---------------- 主循环 ---------------- */
let last = performance.now(), acc = 0;
let fpsAcc = 0, frames = 0;
const FIXED = 1 / 120;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  perf += dt;

  if (screen === 'card') {
    cardT -= dt;
    if (cardT <= 0) {
      hideEl(levelCardEl);
      showEl(countdownEl);
      countT = 2.4;
      countLabel = '';
      screen = 'count';
    }
  } else if (screen === 'count') {
    countT -= dt;
    const label = countT > 1.6 ? '3' : countT > 0.8 ? '2' : countT > 0 ? '1' : 'GO';
    if (label !== countLabel) {
      countLabel = label;
      cdNumEl.textContent = label;
      cdNumEl.style.animation = 'none';
      void cdNumEl.offsetWidth;
      cdNumEl.style.animation = '';
      beep(label === 'GO' ? 880 : 440, 0.12, 'sine', 0.045);
    }
    if (countT <= -0.5) startPlay();
  } else if (screen === 'play' && ready) {
    state.time -= dt;
    if (state.time <= 0) { state.time = 0; endGame(false); }
    else if (p1.x > EXIT_X - 40 && p2.x > EXIT_X - 40) endGame(true);

    acc += dt;
    let guard = 0;
    while (acc >= FIXED && guard < 10) {
      step(FIXED);
      acc -= FIXED; guard++;
    }
    if (guard >= 10) acc = 0;

    timerEl.textContent = state.time.toFixed(1);
    timerEl.classList.toggle('warn', state.time < 10);
    ringFg.style.strokeDashoffset = String(220 * (1 - state.time / 60));

    const rd = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const tension = Math.max(0, Math.min(1, (rd - TUNE.ropeRest) / (TUNE.ropeMax - TUNE.ropeRest)));
    const segN = Math.round(tension * 10);
    for (let i = 0; i < segsEl.children.length; i++) {
      const s = segsEl.children[i];
      s.classList.toggle('on', i < segN);
      s.classList.toggle('hot', i >= 7 && i < segN && tension > 0.78);
    }
    tensionHint.textContent = tension > 0.78 ? '满格可甩出' : tension > 0.3 ? '正在拉紧' : '保持松绳';

    const prog = Math.max(0, Math.min(1, (Math.min(p1.x, p2.x) + 380) / (EXIT_X + 380)));
    progFill.style.width = (prog * 100).toFixed(0) + '%';
    progPct.textContent = Math.round(prog * 100) + '%';

    if (!tut.pull && p1.x > 150 && p2.x > 150) {
      tut.pull = true;
      toast('按住 F / J 拉绳，把队友拽过来', 3);
    }
    if (!flingTutorial && p1.x > 2700 && p2.x > 2700) {
      flingTutorial = true;
      toast('绳子绷紧时起跳，会被甩过去', 3.2);
    }
  }

  if (ready) {
    updateVisuals(dt);
    updateParts(dt);
    updateGhosts(dt);
    hitFlashT = Math.max(0, hitFlashT - dt);
    hitFlashEl.style.opacity = (hitFlashT / 0.35 * 0.55).toFixed(2);
    musicTense = screen === 'play' && state.time < 10;
  }

  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) toastEl.style.opacity = 0;
  }
  fpsAcc += dt; frames++;
  if (fpsAcc >= 0.5) {
    fpsEl.textContent = Math.round(frames / fpsAcc);
    fpsAcc = 0; frames = 0;
  }

  const sx = (Math.random() - 0.5) * state.shake;
  const sy = (Math.random() - 0.5) * state.shake;
  camera.position.set(state.camX + sx, state.camY + sy, 1500);
  camera.lookAt(state.camX, state.camY, 0);
  if (ready) composer.render();
  else renderer.clear();

  requestAnimationFrame(loop);
}

/* ---------------- 启动 ---------------- */
document.getElementById('go').addEventListener('click', beginSequence);
document.getElementById('again').addEventListener('click', beginSequence);
document.getElementById('toTitle').addEventListener('click', toTitle);
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('restartBtn').addEventListener('click', beginSequence);
document.getElementById('muteBtn2').addEventListener('click', toggleMute);
document.getElementById('titleBtn').addEventListener('click', toTitle);

/* G1 调试面板 */
document.getElementById('sGrav').addEventListener('input', function (e) { TUNE.gravity = +e.target.value; });
document.getElementById('sJump').addEventListener('input', function (e) { TUNE.jump = +e.target.value; });
document.getElementById('sK').addEventListener('input', function (e) { TUNE.ropeK = +e.target.value; });
document.getElementById('sExp').addEventListener('input', function (e) { renderer.toneMappingExposure = +e.target.value / 100; });
document.getElementById('sBloom').addEventListener('input', function (e) { bloom.strength = +e.target.value / 100; });
document.getElementById('muteBtn').addEventListener('click', toggleMute);
document.getElementById('copyTune').addEventListener('click', function () {
  const txt = JSON.stringify(TUNE, null, 2);
  if (navigator.clipboard) navigator.clipboard.writeText(txt);
  toast('参数已复制', 1.2);
});
document.getElementById('dlLog').addEventListener('click', function () {
  const payload = { summary: TELE.summary, events: TELE.events };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'limeland-g1-log.json';
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
});
window.addEventListener('keydown', function (e) {
  if (e.code === 'Backquote') debugEl.classList.toggle('on');
  if (e.code === 'KeyM') toggleMute();
});
document.getElementById('start').addEventListener('click', function (e) {
  if (e.target.id === 'start') beginSequence();
});

(async function init() {
  try {
    const bgImg = await loadImage(window.__A.bg);
    const gImg = await loadImage(window.__A.green);
    const pImg = await loadImage(window.__A.pink);

    buildBackground(bgImg);
    buildPlatforms();
    buildLamps();
    buildPizzas();
    buildHazard();
    chars.green = buildCharacter(cutoutCanvas(gImg), 0xABE14D, p1.x, p1.y);
    chars.pink = buildCharacter(cutoutCanvas(pImg), 0xFF9AD6, p2.x, p2.y);
    buildRope();
    buildMotes();
    ready = true;
    timerEl.textContent = '60.0';
  } catch (e) {
    console.error(e);
    stageEl.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#FF8FA8">素材加载失败</div>';
  }
})();

requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });
