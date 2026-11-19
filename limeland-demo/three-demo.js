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
const startEl = document.getElementById('start');
const endEl = document.getElementById('end');

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
renderer.toneMappingExposure = 1.05;
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
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.95, 0.65, 0.55);
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
  { x0: 3200, x1: 4080, y: 260 }
];
const EXIT_X = 3820;

const state = {
  started: false, over: false, win: false,
  time: 60, camX: -200, camY: 320, falls: 0
};
const checkpoint = { x: -180, y: 0 };
const p1 = { x: -380, y: 0, vx: 0, vy: 0, grounded: false, squash: 0, jumpQueued: false };
const p2 = { x: 20, y: 0, vx: 0, vy: 0, grounded: false, squash: 0, jumpQueued: false };
const chars = {};
let ropeMesh = null, ropePos = null, ropeWidth = 7;
let ropeRest = 330;
let ready = false;
let perf = 0;
const keys = Object.create(null);

/* ---------------- 场景搭建 ---------------- */
function buildBackground(bgImage) {
  const canvas = cropCanvas(bgImage, 0.93);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(2800, 1575);
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false });
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
      new THREE.MeshBasicMaterial({ color: 0x130a27 })
    );
    body.position.set(cx, p.y - 14, 0);
    scene.add(body);

    const edgeColor = colors[i % 3];
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(w, 5, 60),
      new THREE.MeshBasicMaterial({ color: edgeColor, toneMapped: false })
    );
    edge.position.set(cx, p.y + 2.5, 0);
    scene.add(edge);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.25, 150),
      new THREE.MeshBasicMaterial({
        map: glowTex, color: edgeColor, transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      })
    );
    glow.position.set(cx, p.y - 52, -3);
    scene.add(glow);
  });

  // 霓虹画框（中景，产生视差）
  const frameColors = [0xC6F24E, 0xFF8FA8, 0x57E0FF];
  for (let i = 0; i < 14; i++) {
    const x = -500 + i * 360;
    const y = 330 + (i % 3) * 110;
    const w = 118 + (i % 2) * 46, h = 86 + (i % 2) * 40;
    const pts = [
      new THREE.Vector3(-w / 2, -h / 2, 0), new THREE.Vector3(w / 2, -h / 2, 0),
      new THREE.Vector3(w / 2, h / 2, 0), new THREE.Vector3(-w / 2, h / 2, 0)
    ];
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: frameColors[i % 3], transparent: true, opacity: 0.5, toneMapped: false })
    );
    line.position.set(x, y, -500);
    line.rotation.z = (i % 2 ? 1 : -1) * 0.06;
    scene.add(line);
  }

  // 中景光斑
  const dotTex = new THREE.CanvasTexture(radialCanvas());
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, color: frameColors[i % 3], transparent: true, opacity: 0.16,
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
  const h = 150, w = h * aspect;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide })
  );
  mesh.position.set(x, y + 75, 20);
  scene.add(mesh);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(radialCanvas()), color: tint,
    transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false
  }));
  glow.scale.set(300, 300, 1);
  glow.position.set(x, y + 80, 12);
  scene.add(glow);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 54),
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
  const N = 26;
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
}

function buildMotes() {
  const n = 240;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = -900 + Math.random() * 5400;
    arr[i * 3 + 1] = -80 + Math.random() * 820;
    arr[i * 3 + 2] = Math.random() * 320;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    size: 3.2, color: 0xfff2c0, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  scene.add(new THREE.Points(geo, mat));
}

/* ---------------- 音效 ---------------- */
let AC = null;
function beep(freq, dur, type, gain) {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
  if (AC.state === 'suspended') AC.resume();
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain || 0.04, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

/* ---------------- 输入 ---------------- */
window.addEventListener('keydown', function (e) {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
  const first = !keys[e.code];
  keys[e.code] = true;
  if (!first) return;
  if (e.code === 'Space') {
    if (!state.started) startGame();
    else if (state.over) restart();
  }
  if (e.code === 'KeyR') restart();
  if (e.code === 'KeyW') p1.jumpQueued = true;
  if (e.code === 'ArrowUp') p2.jumpQueued = true;
  if (e.code === 'KeyF' || e.code === 'KeyJ') beep(180, 0.12, 'triangle', 0.03);
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });

/* ---------------- 游戏逻辑 ---------------- */
function resetGame() {
  p1.x = -380; p1.y = 0; p1.vx = 0; p1.vy = 0; p1.grounded = false; p1.squash = 0;
  p2.x = 20; p2.y = 0; p2.vx = 0; p2.vy = 0; p2.grounded = false; p2.squash = 0;
  checkpoint.x = -180; checkpoint.y = 0;
  ropeRest = 330;
  state.time = 60; state.over = false; state.win = false; state.falls = 0;
  state.camX = -200; state.camY = 320;
  endEl.classList.add('hidden');
}
function startGame() {
  if (!ready) return;
  resetGame();
  state.started = true;
  startEl.classList.add('hidden');
  beep(520, 0.18, 'sine', 0.05);
}
function restart() {
  resetGame();
  state.started = true;
  startEl.classList.add('hidden');
  endEl.classList.add('hidden');
}
function endGame(win) {
  state.over = true;
  state.win = win;
  document.getElementById('endTitle').textContent = win ? '逃出来了' : '时间到';
  document.getElementById('endStat').textContent = win
    ? '剩余 ' + state.time.toFixed(1) + ' 秒 · 掉下去 ' + state.falls + ' 次'
    : '差一点 · 掉下去 ' + state.falls + ' 次';
  endEl.classList.remove('hidden');
  if (win) beep(660, 0.2, 'triangle', 0.05);
}
function respawn(p) {
  p.x = checkpoint.x; p.y = checkpoint.y + 4;
  p.vx = 0; p.vy = 0;
  state.falls++;
  beep(140, 0.2, 'sawtooth', 0.04);
}

function step(dt) {
  const ps = [p1, p2];
  for (let i = 0; i < 2; i++) {
    const p = ps[i];
    const left = i === 0 ? keys['KeyA'] : keys['ArrowLeft'];
    const right = i === 0 ? keys['KeyD'] : keys['ArrowRight'];
    if (left) p.vx -= 3400 * dt;
    if (right) p.vx += 3400 * dt;
    if (!left && !right) p.vx *= Math.pow(0.0006, dt);
    p.vx = Math.max(-450, Math.min(450, p.vx));

    if (p.jumpQueued) {
      if (p.grounded) { p.vy = 880; p.grounded = false; beep(440, 0.1, 'sine', 0.035); }
      p.jumpQueued = false;
    }
    p.vy -= 1950 * dt;
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
    if (!was && p.grounded) p.squash = 0.2;
    if (p.y < -520) respawn(p);
  }
  ropeStep(dt);
  state.camX += (Math.max(-260, Math.min(3320, (p1.x + p2.x) / 2 + 70)) - state.camX) * Math.min(1, dt * 4);
  state.camY += (Math.max(300, Math.min(560, (p1.y + p2.y) / 2 + 170)) - state.camY) * Math.min(1, dt * 3);
}

function ropeStep(dt) {
  const a = { x: p1.x, y: p1.y + 115 };
  const b = { x: p2.x, y: p2.y + 115 };
  let dx = b.x - a.x, dy = b.y - a.y;
  let dist = Math.hypot(dx, dy) || 0.001;
  const pulling = !!keys['KeyF'] || !!keys['KeyJ'];
  const target = pulling ? 110 : 330;
  ropeRest += Math.max(-820 * dt, Math.min(700 * dt, target - ropeRest));

  if (dist > ropeRest) {
    const nx = dx / dist, ny = dy / dist;
    const stretch = dist - ropeRest;
    let w1 = 0.5, w2 = 0.5;
    if (p1.grounded && !p2.grounded) { w1 = 0.12; w2 = 0.88; }
    else if (p2.grounded && !p1.grounded) { w1 = 0.88; w2 = 0.12; }
    let acc = Math.min(2600, stretch * 16);
    p1.vx += nx * acc * w1 * dt; p1.vy += ny * acc * w1 * dt;
    p2.vx -= nx * acc * w2 * dt; p2.vy -= ny * acc * w2 * dt;
    const rel = (p2.vx - p1.vx) * nx + (p2.vy - p1.vy) * ny;
    p1.vx += nx * rel * 0.25 * w1; p1.vy += ny * rel * 0.25 * w1;
    p2.vx -= nx * rel * 0.25 * w2; p2.vy -= ny * rel * 0.25 * w2;
  }
  if (dist > 640) {
    const nx = dx / dist, ny = dy / dist, ex = dist - 640;
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
    c.mesh.position.set(p.x, p.y + 75, 20);
    c.mesh.rotation.z = Math.max(-0.14, Math.min(0.14, p.vx / 2800));
    c.mesh.scale.set(1 + p.squash, 1 - p.squash, 1);
    c.glow.position.set(p.x, p.y + 80, 12);
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

  // 绳子
  if (ropeMesh) {
    const N = ropeMesh.userData.N;
    const a = { x: p1.x, y: p1.y + 115 };
    const b = { x: p2.x, y: p2.y + 115 };
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const slack = Math.max(0, 330 - dist);
    const pulling = !!keys['KeyF'] || !!keys['KeyJ'];
    ropeWidth += ((pulling ? 12 : 7.5) - ropeWidth) * Math.min(1, dt * 8);
    ropeMesh.material.color.setHex(pulling ? 0xF2FFC8 : 0xC6F24E);
    ropeMesh.material.opacity = 0.95;

    const pts = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      pts.push({
        x: a.x + dx * u,
        y: a.y + dy * u - Math.sin(u * Math.PI) * Math.min(110, slack * 0.55)
          + Math.sin(perf * 4 + u * 7) * 1.4 * Math.sin(u * Math.PI)
      });
    }
    for (let i = 0; i < N; i++) {
      const p0 = pts[Math.max(0, i - 1)], p2p = pts[Math.min(N - 1, i + 1)];
      let tx = p2p.x - p0.x, ty = p2p.y - p0.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const o = i * 6;
      ropePos[o] = pts[i].x + nx * ropeWidth / 2;
      ropePos[o + 1] = pts[i].y + ny * ropeWidth / 2;
      ropePos[o + 2] = 30;
      ropePos[o + 3] = pts[i].x - nx * ropeWidth / 2;
      ropePos[o + 4] = pts[i].y - ny * ropeWidth / 2;
      ropePos[o + 5] = 30;
    }
    ropeMesh.geometry.attributes.position.needsUpdate = true;
  }
}

/* ---------------- 主循环 ---------------- */
let last = performance.now(), acc = 0;
const FIXED = 1 / 120;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  perf += dt;

  if (state.started && !state.over && ready) {
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
    updateVisuals(dt);

    timerEl.textContent = state.time.toFixed(1);
    timerEl.classList.toggle('warn', state.time < 10);
  } else if (ready) {
    updateVisuals(dt);
    timerEl.textContent = state.time.toFixed(1);
  }

  camera.position.set(state.camX, state.camY, 1500);
  camera.lookAt(state.camX, state.camY, 0);
  if (ready) composer.render();
  else renderer.clear();

  requestAnimationFrame(loop);
}

/* ---------------- 启动 ---------------- */
document.getElementById('go').addEventListener('click', startGame);
document.getElementById('again').addEventListener('click', restart);
document.getElementById('start').addEventListener('click', function (e) {
  if (e.target.id === 'start') startGame();
});

(async function init() {
  try {
    const bgImg = await loadImage('assets/glow_room.jpg');
    const gImg = await loadImage('assets/green.png');
    const pImg = await loadImage('assets/pink.png');

    buildBackground(bgImg);
    buildPlatforms();
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
