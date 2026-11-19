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
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07030f);
scene.fog = new THREE.Fog(0x07030f, 9, 22);

const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 100);
camera.position.set(3.5, 2.5, 5.9);
camera.lookAt(0.1, 1.5, 0);

/* ---------- 背景（预先虚化的壁画） ---------- */
function wallTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0518';
  g.fillRect(0, 0, 1024, 576);
  let rad = g.createRadialGradient(710, 240, 20, 710, 240, 430);
  rad.addColorStop(0, 'rgba(255,190,110,.26)');
  rad.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 1024, 576);
  [[220, 190, 170, 'rgba(198,242,78,.11)'],
   [410, 430, 210, 'rgba(123,63,160,.16)'],
   [860, 420, 190, 'rgba(87,224,255,.09)']].forEach(function (b) {
    const rr = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
    rr.addColorStop(0, b[3]);
    rr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rr;
    g.beginPath(); g.arc(b[0], b[1], b[2], 0, 7); g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const wall = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 10),
  new THREE.MeshBasicMaterial({ map: wallTexture() })
);
wall.position.set(0, 3, -2.6);
scene.add(wall);

/* ---------- 地面 ---------- */
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.MeshStandardMaterial({ color: 0x0a0514, roughness: 0.36, metalness: 0.28 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

/* ---------- 展台（圆角挤出） ---------- */
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const shelfGeo = new THREE.ExtrudeGeometry(roundedShape(4.6, 0.36, 0.14), {
  depth: 1.8, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, steps: 1
});
shelfGeo.center();
const shelf = new THREE.Mesh(shelfGeo, new THREE.MeshStandardMaterial({
  color: 0x22113f, roughness: 0.45, metalness: 0.18
}));
shelf.position.set(0, 0.9, 0);
shelf.castShadow = true;
shelf.receiveShadow = true;
scene.add(shelf);

const lip = new THREE.Mesh(
  new THREE.BoxGeometry(4.5, 0.05, 0.06),
  new THREE.MeshBasicMaterial({ color: 0xC6F24E, toneMapped: false })
);
lip.position.set(0, 1.09, 0.93);
scene.add(lip);

[-1.55, 1.55].forEach(function (x) {
  const br = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x120a24, roughness: 0.6, metalness: 0.4 })
  );
  br.position.set(x, 0.45, -0.55);
  br.rotation.x = 0.28;
  br.castShadow = true;
  scene.add(br);
});

/* ---------- 史莱姆 ---------- */
const SHELF_TOP = 1.09;
const R = 0.62;
const bodyGeo = new THREE.SphereGeometry(R, 96, 64);
{
  const pos = bodyGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + 0.032 * Math.sin(v.x * 7.0 + v.y * 5.0) * Math.cos(v.z * 6.0)
      + 0.018 * Math.sin(v.y * 9.0 + v.x * 3.0);
    v.multiplyScalar(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  bodyGeo.computeVertexNormals();
}
const slimeMat = new THREE.MeshPhysicalMaterial({
  color: 0x9CDB3A,
  roughness: 0.16,
  metalness: 0.0,
  clearcoat: 1,
  clearcoatRoughness: 0.08,
  sheen: 0.7,
  sheenColor: new THREE.Color(0xC6F24E),
  emissive: new THREE.Color(0x1b3a00),
  emissiveIntensity: 0.4
});
const body = new THREE.Mesh(bodyGeo, slimeMat);
body.position.set(0, SHELF_TOP + R, 0);
body.castShadow = true;
scene.add(body);

const rimMat = new THREE.ShaderMaterial({
  uniforms: {
    cA: { value: new THREE.Color(0xE9FFB0) },
    cB: { value: new THREE.Color(0xFF9AD6) }
  },
  vertexShader: [
    'varying vec3 vN; varying vec3 vV; varying vec3 vW;',
    'void main(){',
    '  vN = normalize(normalMatrix * normal);',
    '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
    '  vV = -mv.xyz;',
    '  vW = (modelMatrix * vec4(position,1.0)).xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n'),
  fragmentShader: [
    'uniform vec3 cA; uniform vec3 cB;',
    'varying vec3 vN; varying vec3 vV; varying vec3 vW;',
    'void main(){',
    '  float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.2);',
    '  vec3 col = mix(cA, cB, smoothstep(-1.0, 1.0, normalize(vW).x));',
    '  gl_FragColor = vec4(col * f * 0.9, f * 0.9);',
    '}'
  ].join('\n'),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});
const rimShell = new THREE.Mesh(bodyGeo, rimMat);
rimShell.position.copy(body.position);
rimShell.scale.setScalar(1.02);
scene.add(rimShell);

/* 眼睛 / 嘴 */
const face = new THREE.Group();
body.add(face);
const eyeMat = new THREE.MeshPhysicalMaterial({
  color: 0x0b0612, roughness: 0.08, metalness: 0.1, clearcoat: 1
});
const eyeGeo = new THREE.SphereGeometry(0.15, 32, 24);
const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
const hlGeo = new THREE.SphereGeometry(0.036, 16, 12);
[-1, 1].forEach(function (s) {
  const e = new THREE.Mesh(eyeGeo, eyeMat);
  e.position.set(0.22 * s, 0.15, 0.53);
  e.scale.set(1, 1.2, 0.55);
  face.add(e);
  const h = new THREE.Mesh(hlGeo, hlMat);
  h.position.set(0.18 * s, 0.21, 0.6);
  face.add(h);
});
const mouth = new THREE.Mesh(
  new THREE.SphereGeometry(1, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x14060f })
);
mouth.scale.set(0.2, 0.05, 0.04);
mouth.position.set(0, -0.2, 0.6);
face.add(mouth);

/* 接触阴影 */
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  rad.addColorStop(0, 'rgba(0,0,0,.75)');
  rad.addColorStop(0.55, 'rgba(0,0,0,.35)');
  rad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(1.7, 1.2),
  new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.65, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
blob.position.set(0, SHELF_TOP + 0.005, 0.05);
scene.add(blob);

/* ---------- 灯光 ---------- */
scene.add(new THREE.HemisphereLight(0x6d4fa8, 0x0a0614, 0.85));

const key = new THREE.SpotLight(0xffdfae, 70, 16, 0.62, 0.45, 1.6);
key.position.set(-3.0, 5.0, 3.6);
key.target.position.set(0.2, 1.4, 0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.radius = 3;
scene.add(key);
scene.add(key.target);

const rim = new THREE.SpotLight(0x57E0FF, 30, 13, 0.7, 0.6, 1.6);
rim.position.set(3.4, 2.4, -1.8);
rim.target.position.set(0, 1.6, 0);
scene.add(rim);
scene.add(rim.target);

const fill = new THREE.PointLight(0xFF8FA8, 8, 7, 1.8);
fill.position.set(2.4, 1.2, 2.4);
scene.add(fill);

/* ---------- 尘埃 ---------- */
{
  const n = 160;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 11;
    pos[i * 3 + 1] = Math.random() * 5.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 7;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffe6b8, size: 0.022, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  scene.add(motes);
}

/* ---------- 后期 ---------- */
const composer = new EffectComposer(renderer);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- 交互 / 动画 ---------- */
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

  const breathe = Math.sin(t * 2.1) * 0.022;
  const sq = breathe;
  body.scale.set(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55);
  body.position.y = SHELF_TOP + R * body.scale.y;
  rimShell.position.copy(body.position);
  rimShell.scale.set(body.scale.x * 1.02, body.scale.y * 1.02, body.scale.z * 1.02);
  body.rotation.y = Math.sin(t * 0.5) * 0.12;

  blinkT += dt;
  if (blinkT > blinkNext) {
    blinkT = 0;
    blinkNext = 2.6 + Math.random() * 2.4;
  }
  const blink = blinkT < 0.12 ? 0.12 : 1;
  face.scale.y += (blink - face.scale.y) * Math.min(1, dt * 28);

  camera.position.x = 3.5 + Math.sin(t * 0.14) * 0.22 + mx * 0.55;
  camera.position.y = 2.5 - my * 0.35 + Math.sin(t * 0.3) * 0.04;
  camera.position.z = 5.9 - mx * 0.25;
  camera.lookAt(0.1, 1.5, 0);

  composer.render();
  requestAnimationFrame(tick);
}
tick();
