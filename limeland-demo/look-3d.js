import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1280, H = 720;
const canvas = document.getElementById('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
} catch (e) {
  document.getElementById('err').style.display = 'block';
  throw e;
}
renderer.setSize(W, H, false);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07030f);
scene.fog = new THREE.Fog(0x07030f, 9, 22);

const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
camera.position.set(2.5, 2.0, 4.7);
camera.lookAt(0.05, 1.5, 0);

/* ---------- 程序贴图 ---------- */
function wallTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0516';
  g.fillRect(0, 0, 1024, 576);
  const rad = g.createRadialGradient(735, 210, 20, 735, 210, 420);
  rad.addColorStop(0, 'rgba(255,196,120,.30)');
  rad.addColorStop(1, 'rgba(255,196,120,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 1024, 576);
  g.filter = 'blur(14px)';
  g.fillStyle = 'rgba(40,22,64,.85)';
  g.fillRect(120, 330, 300, 16);
  g.fillRect(560, 380, 330, 16);
  g.fillStyle = 'rgba(60,34,90,.8)';
  [160, 210, 258].forEach(function (x) { g.fillRect(x, 258, 34, 72); });
  g.fillStyle = 'rgba(90,52,120,.55)';
  [600, 648, 700, 748].forEach(function (x) { g.fillRect(x, 300, 36, 80); });
  g.filter = 'blur(0px)';
  const vig = g.createRadialGradient(512, 288, 200, 512, 288, 640);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.65)');
  g.fillStyle = vig;
  g.fillRect(0, 0, 1024, 576);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodFrontTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#4a2f1f');
  grd.addColorStop(0.45, '#3a2417');
  grd.addColorStop(1, '#24150d');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(20,10,6,' + (0.05 + Math.random() * 0.1) + ')';
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    g.stroke();
  }
  g.fillStyle = '#86B23C';
  g.fillRect(0, 0, 1024, 46);
  g.fillStyle = 'rgba(255,255,255,.16)';
  g.fillRect(0, 2, 1024, 3);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 1024, y = Math.random() * 46;
    const r = 2 + Math.random() * 12;
    g.fillStyle = 'rgba(58,36,23,' + (0.35 + Math.random() * 0.5) + ')';
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = 'rgba(255,255,255,' + (0.03 + Math.random() * 0.05) + ')';
    g.lineWidth = 1;
    const x = Math.random() * 1024, y = 60 + Math.random() * 180;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + Math.random() * 50, y + 2); g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * 1024, y = 80 + Math.random() * 150, r = 10 + Math.random() * 40;
    const s = g.createRadialGradient(x, y, 0, x, y, r);
    s.addColorStop(0, 'rgba(12,6,3,.25)');
    s.addColorStop(1, 'rgba(12,6,3,0)');
    g.fillStyle = s;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(0, 244, 1024, 12);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTopTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#33200f';
  g.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 4; p++) {
    g.fillStyle = p % 2 ? 'rgba(255,220,170,.03)' : 'rgba(0,0,0,.10)';
    g.fillRect(p * 128, 0, 128, 512);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(p * 128, 0, 2, 512);
  }
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = 'rgba(18,9,4,' + (0.04 + Math.random() * 0.1) + ')';
    g.lineWidth = 1;
    const y = Math.random() * 512;
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y + (Math.random() - 0.5) * 10); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cardTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#EFE6D2';
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = '#D8CCB2';
  g.fillRect(0, 0, 256, 6);
  g.fillStyle = '#2a1b12';
  g.font = '700 22px "PingFang SC", sans-serif';
  g.fillText('莱姆尼社', 18, 42);
  g.font = '700 13px "PingFang SC", sans-serif';
  g.fillStyle = '#6b5740';
  g.fillText('夜光画室 · 拉丝', 18, 66);
  g.fillStyle = '#86B23C';
  g.fillRect(18, 82, 60, 4);
  g.fillStyle = '#2a1b12';
  g.font = '900 46px "PingFang SC", sans-serif';
  g.fillText('12', 18, 140);
  g.font = '700 14px "PingFang SC", sans-serif';
  g.fillText('元 / 份', 82, 140);
  g.strokeStyle = '#C9BDA3';
  g.lineWidth = 2;
  g.strokeRect(8, 12, 240, 156);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function fgTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(8,4,15,0)');
  grd.addColorStop(0.35, 'rgba(8,4,15,.55)');
  grd.addColorStop(1, 'rgba(8,4,15,.97)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 128);
  return new THREE.CanvasTexture(c);
}

/* ---------- 场景 ---------- */
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 10),
  new THREE.MeshBasicMaterial({ map: wallTexture() })
);
wall.position.set(0, 3, -2.5);
scene.add(wall);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x0b0614, roughness: 0.85, metalness: 0.05 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const fg = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 1.4),
  new THREE.MeshBasicMaterial({ map: fgTexture(), transparent: true, depthWrite: false })
);
fg.position.set(0, -0.55, 2.6);
scene.add(fg);

const SHELF_TOP = 1.07;
const darkSide = new THREE.MeshStandardMaterial({ color: 0x1d1009, roughness: 0.9 });
const frontMat = new THREE.MeshStandardMaterial({ map: woodFrontTexture(), roughness: 0.82, metalness: 0 });
const topMat = new THREE.MeshStandardMaterial({ map: woodTopTexture(), roughness: 0.78, metalness: 0 });
const shelf = new THREE.Mesh(
  new THREE.BoxGeometry(4.8, 0.34, 1.9),
  [darkSide, darkSide, topMat, darkSide, frontMat, darkSide]
);
shelf.position.set(0, SHELF_TOP - 0.17, 0);
shelf.castShadow = true;
shelf.receiveShadow = true;
scene.add(shelf);

[-1.75, 1.75].forEach(function (x) {
  const br = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.82, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x120a06, roughness: 0.8, metalness: 0.3 })
  );
  br.position.set(x, 0.42, -0.62);
  br.rotation.x = 0.3;
  br.castShadow = true;
  scene.add(br);
});

const card = new THREE.Mesh(
  new THREE.PlaneGeometry(0.44, 0.31),
  new THREE.MeshStandardMaterial({ map: cardTexture(), roughness: 0.92, metalness: 0 })
);
card.position.set(1.05, SHELF_TOP + 0.16, 0.62);
card.rotation.set(-0.18, -0.42, 0.04);
card.castShadow = true;
scene.add(card);

/* ---------- 灯光 ---------- */
scene.add(new THREE.HemisphereLight(0x4b3a72, 0x0a0614, 0.6));
const key = new THREE.SpotLight(0xffd9a0, 62, 16, 0.66, 0.55, 1.6);
key.position.set(-2.6, 4.6, 3.2);
key.target.position.set(0.1, 1.4, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.radius = 4;
scene.add(key);
scene.add(key.target);

const fill = new THREE.DirectionalLight(0x8FA8FF, 0.5);
fill.position.set(4, 2.2, 2.5);
scene.add(fill);

const warm = new THREE.PointLight(0xFFB870, 4, 6, 2);
warm.position.set(1.6, 1.5, 1.6);
scene.add(warm);

/* ---------- 尘埃 ---------- */
{
  const n = 150;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 10;
    pos[i * 3 + 1] = Math.random() * 5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffe6b8, size: 0.02, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  })));
}

/* ---------- 后期 ---------- */
const composer = new EffectComposer(renderer);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.4, 0.5, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- 真实角色 → 挤出公仔 ---------- */
const SRC = window.__LOOK_CHAR || 'assets/green.png';
function loadImage(src) {
  return new Promise(function (res, rej) {
    const im = new Image();
    im.onload = function () { res(im); };
    im.onerror = rej;
    im.src = src;
  });
}

function maskCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gg = p[i + 1], b = p[i + 2], a = p[i + 3];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const colored = (mx - mn) > 16 || mx < 130;
    if (a < 30 || !colored) p[i + 3] = 0;
  }
  g.putImageData(d, 0, 0);
  return c;
}

function traceSilhouette(mask) {
  const w = mask.width, h = mask.height;
  const data = mask.getContext('2d').getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const N = 160;
  const radii = new Float32Array(N);
  const rMax = Math.hypot(maxX - minX, maxY - minY) / 2 + 2;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    let last = 0;
    for (let r = 2; r <= rMax; r += 1) {
      const x = Math.round(cx + ca * r), y = Math.round(cy + sa * r);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (data[(y * w + x) * 4 + 3] > 40) last = r;
    }
    radii[i] = Math.max(4, last);
  }
  // 平滑
  const sm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += radii[(i + k + N) % N];
    sm[i] = s / 5;
  }
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, cx: cx, cy: cy, radii: sm, w: w, h: h };
}

function radiusAt(theta, tr) {
  const N = tr.radii.length;
  let a = theta;
  while (a < 0) a += Math.PI * 2;
  const f = (a / (Math.PI * 2)) * N;
  const i0 = Math.floor(f) % N, i1 = (i0 + 1) % N;
  const t = f - Math.floor(f);
  return tr.radii[i0] * (1 - t) + tr.radii[i1] * t;
}

function buildCharacter(img, tr, mask) {
  const bw = tr.maxX - tr.minX, bh = tr.maxY - tr.minY;
  const localY = function (py) { return tr.maxY - py; };

  // 轮廓（局部像素坐标，y 向上）
  const pts = [];
  for (let i = 0; i < tr.radii.length; i++) {
    const a = (i / tr.radii.length) * Math.PI * 2;
    const r = tr.radii[i];
    pts.push(new THREE.Vector2(
      (tr.cx - tr.minX) + Math.cos(a) * r,
      (tr.maxY - tr.cy) + Math.sin(a) * r
    ));
  }
  // 保证逆时针（挤出法线正确）
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    area += p.x * q.y - q.x * p.y;
  }
  if (area < 0) pts.reverse();
  const shape = new THREE.Shape(pts);
  const depth = bh * 0.42;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: bh * 0.028,
    bevelSize: bh * 0.028,
    bevelSegments: 4,
    curveSegments: 1,
    steps: 1
  });
  geo.center();

  // 正反面微微鼓起
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const dome = bh * 0.13;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    const R = Math.max(4, radiusAt(-a, tr));
    const f = Math.min(1, r / R);
    pos.setZ(i, z + Math.sign(z) * dome * Math.sqrt(Math.max(0, 1 - f * f)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // 正脸贴原图（裁到包围盒）
  const crop = document.createElement('canvas');
  crop.width = bw; crop.height = bh;
  crop.getContext('2d').drawImage(mask, tr.minX, tr.minY, bw, bh, 0, 0, bw, bh);
  const capTex = new THREE.CanvasTexture(crop);
  capTex.colorSpace = THREE.SRGBColorSpace;
  capTex.wrapS = capTex.wrapT = THREE.ClampToEdgeWrapping;
  capTex.repeat.set(1 / bw, 1 / bh);

  const capMat = new THREE.MeshPhysicalMaterial({
    map: capTex,
    transparent: true,
    alphaTest: 0.35,
    roughness: 0.44,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.32
  });
  const sideMat = new THREE.MeshPhysicalMaterial({
    color: 0x83C22F, roughness: 0.48, metalness: 0, clearcoat: 0.3
  });

  const mesh = new THREE.Mesh(geo, [capMat, sideMat]);
  mesh.castShadow = true;
  const s = 1.12 / (bh + bh * 0.056);
  mesh.scale.setScalar(s);

  const group = new THREE.Group();
  group.position.set(0, SHELF_TOP, 0.02);
  mesh.position.y = -bb.min.y * s;
  group.add(mesh);

  // 边缘光
  const rimMat = new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(0xFFE2AE) } },
    vertexShader: [
      'varying vec3 vN; varying vec3 vV;',
      'void main(){',
      '  vN = normalize(normalMatrix * normal);',
      '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
      '  vV = -mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 c;',
      'varying vec3 vN; varying vec3 vV;',
      'void main(){',
      '  float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.0);',
      '  gl_FragColor = vec4(c * f * 0.45, f * 0.45);',
      '}'
    ].join('\n'),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const rim = new THREE.Mesh(geo, rimMat);
  rim.scale.setScalar(s * 1.012);
  rim.position.copy(mesh.position);
  group.add(rim);

  scene.add(group);

  // 接触阴影
  const bc = document.createElement('canvas');
  bc.width = bc.height = 128;
  const bg = bc.getContext('2d');
  const grd = bg.createRadialGradient(64, 64, 2, 64, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,.82)');
  grd.addColorStop(0.5, 'rgba(0,0,0,.38)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  bg.fillStyle = grd;
  bg.fillRect(0, 0, 128, 128);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.8),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0.75, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0, SHELF_TOP + 0.006, 0.02);
  scene.add(blob);

  return group;
}

/* ---------- 动画 ---------- */
let mx = 0, my = 0;
window.addEventListener('pointermove', function (e) {
  mx = (e.clientX / window.innerWidth - 0.5) * 2;
  my = (e.clientY / window.innerHeight - 0.5) * 2;
});

const clock = new THREE.Clock();
let charGroup = null;

function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (charGroup) {
    const sq = Math.sin(t * 1.9) * 0.02;
    charGroup.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
    charGroup.rotation.y = Math.sin(t * 0.45) * 0.09;
  }

  camera.position.x = 2.5 + Math.sin(t * 0.12) * 0.16 + mx * 0.38;
  camera.position.y = 2.0 - my * 0.26 + Math.sin(t * 0.26) * 0.03;
  camera.position.z = 4.7 - mx * 0.16;
  camera.lookAt(0.05, 1.5, 0);

  composer.render();
  requestAnimationFrame(tick);
}

loadImage(SRC).then(function (img) {
  const mask = maskCanvas(img);
  const tr = traceSilhouette(mask);
  charGroup = buildCharacter(img, tr, mask);
  tick();
}).catch(function (e) {
  document.getElementById('err').style.display = 'block';
  document.getElementById('err').textContent = '角色图加载失败：' + (e && e.message ? e.message : e);
  console.error(e);
});
