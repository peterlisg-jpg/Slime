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
camera.position.set(2.7, 2.05, 4.9);
camera.lookAt(0.05, 1.45, 0);

/* ---------- 程序贴图 ---------- */
function noiseCanvas(size, dark, light) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const r = 2 + Math.random() * 14;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, Math.random() < 0.5 ? dark : light);
    grd.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return c;
}

function wallTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0516';
  g.fillRect(0, 0, 1024, 576);
  // 暖光窗
  const rad = g.createRadialGradient(735, 210, 20, 735, 210, 420);
  rad.addColorStop(0, 'rgba(255,196,120,.30)');
  rad.addColorStop(1, 'rgba(255,196,120,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 1024, 576);
  // 模糊的货架与罐子
  g.filter = 'blur(14px)';
  g.fillStyle = 'rgba(40,22,64,.85)';
  g.fillRect(120, 330, 300, 16);
  g.fillRect(560, 380, 330, 16);
  g.fillStyle = 'rgba(60,34,90,.8)';
  [160, 210, 258].forEach(function (x) { g.fillRect(x, 258, 34, 72); });
  g.fillStyle = 'rgba(90,52,120,.55)';
  [600, 648, 700, 748].forEach(function (x) { g.fillRect(x, 300, 36, 80); });
  g.filter = 'blur(0px)';
  // 暗角
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
  // 木纹
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = 'rgba(20,10,6,' + (0.05 + Math.random() * 0.1) + ')';
    g.lineWidth = 1 + Math.random() * 2;
    g.beginPath();
    const y = Math.random() * 256;
    g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) {
      g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4);
    }
    g.stroke();
  }
  // 顶部旧漆条（莱姆绿，做脏做掉漆）
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
  // 划痕与污渍
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
  // 底部阴影
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

function slimeMap() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9CDB3A';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 30;
    const dark = Math.random() < 0.55;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, dark ? 'rgba(92,146,32,.20)' : 'rgba(212,255,140,.18)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
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

/* ---------- 背景 ---------- */
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

/* 前景虚化的货架边（制造景深） */
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
const fg = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 1.4),
  new THREE.MeshBasicMaterial({ map: fgTexture(), transparent: true, depthWrite: false })
);
fg.position.set(0, -0.55, 2.6);
scene.add(fg);

/* ---------- 木架 ---------- */
const SHELF_TOP = 1.07;
const darkSide = new THREE.MeshStandardMaterial({ color: 0x1d1009, roughness: 0.9 });
const frontMat = new THREE.MeshStandardMaterial({
  map: woodFrontTexture(), roughness: 0.82, metalness: 0
});
const topMat = new THREE.MeshStandardMaterial({
  map: woodTopTexture(), roughness: 0.78, metalness: 0
});
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

/* ---------- 史莱姆（品牌泥团） ---------- */
const slime = new THREE.Group();
slime.position.set(0, SHELF_TOP, 0);
scene.add(slime);

const profile = [
  [0.00, 0.00], [0.24, 0.00], [0.38, 0.03], [0.47, 0.12], [0.50, 0.30],
  [0.48, 0.52], [0.41, 0.72], [0.30, 0.90], [0.16, 1.02], [0.00, 1.09]
].map(function (p) { return new THREE.Vector2(p[0], p[1]); });

const bodyGeo = new THREE.LatheGeometry(profile, 72);
{
  const pos = bodyGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + 0.035 * Math.sin(v.x * 9.0 + v.y * 6.0) * Math.cos(v.z * 8.0)
      + 0.02 * Math.sin(v.y * 11.0 + v.x * 4.0);
    v.multiplyScalar(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  bodyGeo.computeVertexNormals();
}

const bumpTex = new THREE.CanvasTexture(noiseCanvas(256, 'rgba(60,60,60,.5)', 'rgba(200,200,200,.4)'));
bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;

const slimeMat = new THREE.MeshPhysicalMaterial({
  map: slimeMap(),
  bumpMap: bumpTex,
  bumpScale: 0.02,
  roughness: 0.52,
  metalness: 0,
  clearcoat: 0.35,
  clearcoatRoughness: 0.38,
  sheen: 0.5,
  sheenColor: new THREE.Color(0xE9FFB0),
  emissive: new THREE.Color(0x162b00),
  emissiveIntensity: 0.22
});
const body = new THREE.Mesh(bodyGeo, slimeMat);
body.castShadow = true;
slime.add(body);

/* 底部裙边 + 滴落 */
const dripMat = slimeMat.clone();
dripMat.color = new THREE.Color(0x8CCB31);
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + 0.3;
  const r = 0.40 + Math.random() * 0.05;
  const long = i % 3 === 0;
  const d = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 20, 14),
    dripMat
  );
  d.position.set(Math.cos(a) * r, long ? 0.12 : 0.06, Math.sin(a) * r * 0.85);
  d.scale.set(0.62, long ? 2.4 : 1.1, 0.62);
  d.castShadow = true;
  slime.add(d);
}
const puddle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.52, 0.58, 0.035, 40),
  new THREE.MeshPhysicalMaterial({ color: 0x7FBB2C, roughness: 0.25, clearcoat: 0.6, metalness: 0 })
);
puddle.position.y = 0.012;
puddle.scale.z = 0.82;
slime.add(puddle);

/* 脸 */
const face = new THREE.Group();
face.position.set(0, 0.70, 0.36);
slime.add(face);
const eyeMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b0612, roughness: 0.06, metalness: 0.05, clearcoat: 1
});
const eyeGeo = new THREE.SphereGeometry(0.105, 32, 24);
const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const hlGeo = new THREE.SphereGeometry(0.026, 14, 10);
[-1, 1].forEach(function (s) {
  const e = new THREE.Mesh(eyeGeo, eyeMat);
  e.position.set(0.15 * s, 0.02, 0.10);
  e.scale.set(1, 1.35, 0.55);
  e.rotation.z = -0.12 * s;
  face.add(e);
  const h = new THREE.Mesh(hlGeo, hlMat);
  h.position.set(0.125 * s, 0.06, 0.155);
  face.add(h);
  const h2 = new THREE.Mesh(hlGeo, hlMat);
  h2.scale.setScalar(0.55);
  h2.position.set(0.18 * s, 0.0, 0.15);
  face.add(h2);
});
const mouth = new THREE.Mesh(
  new THREE.TorusGeometry(0.075, 0.018, 8, 20, Math.PI),
  new THREE.MeshBasicMaterial({ color: 0x1a0812 })
);
mouth.rotation.z = Math.PI;
mouth.position.set(0, -0.12, 0.10);
face.add(mouth);

/* 暖色边缘光壳（克制） */
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
    '  gl_FragColor = vec4(c * f * 0.5, f * 0.5);',
    '}'
  ].join('\n'),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const rimShell = new THREE.Mesh(bodyGeo, rimMat);
rimShell.scale.setScalar(1.015);
slime.add(rimShell);

/* 接触阴影 */
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  rad.addColorStop(0, 'rgba(0,0,0,.8)');
  rad.addColorStop(0.5, 'rgba(0,0,0,.38)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, 1.1),
  new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.7, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
blob.position.set(0, SHELF_TOP + 0.006, 0.02);
scene.add(blob);

/* 价签 */
const card = new THREE.Mesh(
  new THREE.PlaneGeometry(0.44, 0.31),
  new THREE.MeshStandardMaterial({ map: cardTexture(), roughness: 0.92, metalness: 0 })
);
card.position.set(1.05, SHELF_TOP + 0.16, 0.62);
card.rotation.set(-0.18, -0.42, 0.04);
card.castShadow = true;
scene.add(card);

/* ---------- 灯光（一盏暖主光 + 弱补光，不要霓虹） ---------- */
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

/* ---------- 动画 ---------- */
let mx = 0, my = 0;
window.addEventListener('pointermove', function (e) {
  mx = (e.clientX / window.innerWidth - 0.5) * 2;
  my = (e.clientY / window.innerHeight - 0.5) * 2;
});

const clock = new THREE.Clock();
let blinkT = 0, blinkNext = 2.5;

function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  const sq = Math.sin(t * 1.9) * 0.02;
  slime.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
  slime.rotation.y = Math.sin(t * 0.45) * 0.1;

  blinkT += dt;
  if (blinkT > blinkNext) { blinkT = 0; blinkNext = 2.6 + Math.random() * 2.6; }
  const blink = blinkT < 0.12 ? 0.12 : 1;
  face.scale.y += (blink - face.scale.y) * Math.min(1, dt * 26);

  camera.position.x = 2.7 + Math.sin(t * 0.12) * 0.18 + mx * 0.4;
  camera.position.y = 2.05 - my * 0.28 + Math.sin(t * 0.26) * 0.03;
  camera.position.z = 4.9 - mx * 0.18;
  camera.lookAt(0.05, 1.45, 0);

  composer.render();
  requestAnimationFrame(tick);
}
tick();
