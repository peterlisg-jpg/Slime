/* ============================================================
   拉丝 · LIMELAND  —  2.5D 双人攀爬 demo
   玩法：两个史莱姆被一根"拉丝"连在一起，靠钩子（透明罩）往上爬。
   ============================================================ */
(function () {
  'use strict';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = 720, H = 1080;

  /* ---------------- 品牌色 ---------------- */
  const C = {
    green: '#ABE14D', greenD: '#5F9420', greenL: '#E2FF9E',
    pink:  '#FF9AD6', pinkD:  '#C95E9E', pinkL:  '#FFD9EF',
    blue:  '#8ED6FF', blueD:  '#3E8FC4', blueL:  '#D6F2FF',
    yellow:'#FFD45C', yellowD:'#C99317', yellowL:'#FFF0B8',
    purple:'#4B3FE3', purpleD:'#241687', purpleL:'#8B7BFF',
    lime:  '#C6F24E', ink: '#231634'
  };

  /* ---------------- 工具 ---------------- */
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgba(h, a) {
    const c = hex2rgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mixHex(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' + Math.round(lerp(A[1], B[1], t)) + ',' + Math.round(lerp(A[2], B[2], t)) + ')';
  }

  /* ---------------- 自适应 ---------------- */
  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H) * 0.98;
    cvs.style.width = (W * s) + 'px';
    cvs.style.height = (H * s) + 'px';
    const d = Math.min(2, window.devicePixelRatio || 1);
    cvs.width = Math.round(W * d);
    cvs.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  window.addEventListener('resize', fit);

  /* ---------------- 音频 ---------------- */
  let AC = null;
  function audioInit() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function tone(freq, dur, type, gain, slide) {
    if (!AC) return;
    const t = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const sfx = {
    grab:  () => tone(380, 0.11, 'triangle', 0.05, 300),
    fly:   () => tone(720, 0.16, 'sine', 0.045, 260),
    hit:   () => tone(150, 0.22, 'sawtooth', 0.05, -70),
    land:  () => tone(220, 0.12, 'sine', 0.04, -100),
    chime: () => { tone(660, 0.12, 'triangle', 0.04, 120); },
    win:   () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.24, 'triangle', 0.05), i * 110))
  };

  /* ---------------- 关卡 ---------------- */
  const WORLD_TOP = -200, WORLD_BOT = 2720;
  const HOOKS = [
    [430, 2270], [200, 2030], [520, 1790], [190, 1540], [520, 1290],
    [205, 1040], [510, 790], [225, 555], [360, 300]
  ].map(function (h) { return { x: h[0], y: h[1], pulse: 0 }; });

  const HAZARDS = [
    { x: 360, y: 1920, len: 270, w: 16, spd: 1.15, ang: 0 },
    { x: 360, y: 1170, len: 360, w: 16, spd: -0.95, ang: 0.6 },
    { x: 360, y: 675,  len: 290, w: 16, spd: 1.35, ang: 1.2 }
  ];

  const ZONES = [
    { y: 2530, name: '门口 · 出发' },
    { y: 2050, name: '披萨拼盘' },
    { y: 1550, name: '冰淇淋球' },
    { y: 1100, name: '夜光画室' },
    { y: 660,  name: '千泥百态 · 罩子' },
    { y: 320,  name: '终章 · 店长' }
  ];

  const CHECKPOINTS = [{ y: 2420 }, { y: 1800 }, { y: 1180 }, { y: 600 }];
  const GOAL_Y = 300;

  /* ---------------- 物理常量 ---------------- */
  const GRAV = 1500;
  const AIR_ACC = 1250;
  const AIR_MAX = 380;
  const ROPE_MAX = 330;
  const GRAPPLE_RANGE = 480;
  const PLAYER_R = 38;
  const WALL_L = 54, WALL_R = W - 54;
  const FLOOR_Y = 2486;

  /* ---------------- 状态 ---------------- */
  let state = 'title';          // title | playing | won
  let mode = 2;
  let time = 0;
  let camY = 1520;
  let shake = 0;
  let globalT = 0;
  let particles = [];
  let floats = [];
  let perfectReleases = 0;
  let togetherGrabs = 0;
  let falls = 0;
  let lastGrabAt = -9;
  let zoneIndex = 0;
  let zoneAlpha = 0;
  let zoneName = '';
  let hintAlpha = 1;
  let winT = 0;
  let aiCooldown = 0;

  const keys = Object.create(null);

  function makePlayer(x, y, pal, isPink) {
    return {
      x: x, y: y, vx: 0, vy: 0, r: PLAYER_R,
      color: pal.c, light: pal.l, dark: pal.d,
      isPink: !!isPink,
      attached: -1, hookLen: 0,
      hit: 0, blink: 0, expr: 'idle',
      squash: 0, faceDir: 0
    };
  }

  let p1, p2;

  function resetGame(m) {
    mode = m || 2;
    state = 'playing';
    time = 0; camY = 1520; shake = 0; winT = 0;
    particles = []; floats = [];
    perfectReleases = 0; togetherGrabs = 0; lastGrabAt = -9; falls = 0;
    zoneIndex = 0; zoneAlpha = 0; hintAlpha = 1; aiCooldown = 1.2;
    p1 = makePlayer(300, 2420, { c: C.green, l: C.greenL, d: C.greenD }, false);
    p2 = makePlayer(390, 2420, { c: C.pink, l: C.pinkL, d: C.pinkD }, true);
    HAZARDS.forEach(function (h) { h.ang = rand(0, TAU); });
    HOOKS.forEach(function (h) { h.pulse = 0; });
  }

  /* ---------------- 输入 ---------------- */
  window.addEventListener('keydown', function (e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    keys[k] = true;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].indexOf(k) >= 0) e.preventDefault();
    audioInit();

    if (state === 'title') {
      if (k === ' ') { resetGame(2); }
      else if (k === '1') { resetGame(1); }
      else if (k === '2') { resetGame(2); }
    } else if (state === 'won') {
      if (k === 'r' || k === ' ') { resetGame(mode); }
    } else if (state === 'playing') {
      if (k === 'r') resetGame(mode);
      if (k === 'f') {
        if (p1.attached < 0) { tryAttach(p1); }
        else { detach(p1, true); }
      }
      if (k === 'j' && mode === 2) {
        if (p2.attached < 0) { tryAttach(p2); }
        else { detach(p2, true); }
      }
    }
  });
  window.addEventListener('keyup', function (e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    keys[k] = false;
  });
  window.addEventListener('blur', function () {
    for (const k in keys) keys[k] = false;
  });

  /* ---------------- 抓钩 ---------------- */
  function bestHook(p, range) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < HOOKS.length; i++) {
      const h = HOOKS[i];
      const dx = h.x - p.x, dy = h.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      if (dy > 40) continue;              // 只抓上方的钩子
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function attach(p, idx) {
    const h = HOOKS[idx];
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d > GRAPPLE_RANGE) return;
    p.attached = idx;
    p.hookLen = Math.max(90, d);
    p.vy -= 190;
    p.vx *= 0.6;
    h.pulse = 1;
    sfx.grab();
    burst(p.x, p.y, p.color, 8, 120);
  }

  function tryAttach(p) {
    const idx = bestHook(p, GRAPPLE_RANGE);
    if (idx < 0) {
      floatText(p.x, p.y - 64, '够不着', 'rgba(255,255,255,.7)');
      return;
    }
    attach(p, idx);
    if (Math.abs(time - lastGrabAt) < 0.45) togetherGrabs++;
    lastGrabAt = time;
  }

  function detach(p, boosted) {
    if (p.attached < 0) return;
    p.attached = -1;
    if (boosted) {
      p.vx *= 1.14; p.vy *= 1.14;
      p.vy -= 70;
      p.expr = 'happy';
      p.squash = 0.22;
      if (p.vy < -240) {
        perfectReleases++;
        floatText(p.x, p.y - 60, '漂亮！', C.lime);
        sfx.fly();
        burst(p.x, p.y, C.lime, 6, 150);
      }
    }
  }

  /* ---------------- 粒子 / 飘字 ---------------- */
  function burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(spd * 0.3, spd);
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: rand(0.35, 0.8), max: 0.8, color: color, size: rand(3, 8)
      });
    }
  }
  function floatText(x, y, txt, color) {
    floats.push({ x: x, y: y, txt: txt, color: color, life: 1.1, max: 1.1 });
  }

  /* ---------------- 物理步进 ---------------- */
  function stepPlayer(p, inp, dt) {
    // 横向控制
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) {
      p.vx += dir * AIR_ACC * dt;
    } else {
      p.vx *= (1 - 1.2 * dt);
    }
    p.vx = clamp(p.vx, -AIR_MAX * 1.6, AIR_MAX * 1.6);

    p.vy += GRAV * dt;
    p.vy = clamp(p.vy, -1400, 1700);

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // 撞墙
    if (p.x < WALL_L + p.r) { p.x = WALL_L + p.r; p.vx = Math.abs(p.vx) * 0.4; }
    if (p.x > WALL_R - p.r) { p.x = WALL_R - p.r; p.vx = -Math.abs(p.vx) * 0.4; }

    // 钩子约束
    if (p.attached >= 0) {
      const h = HOOKS[p.attached];
      if (p.hookLen > 100) p.hookLen = Math.max(100, p.hookLen - 120 * dt);
      let dx = p.x - h.x, dy = p.y - h.y;
      let d = Math.hypot(dx, dy) || 0.001;
      if (d > p.hookLen) {
        const nx = dx / d, ny = dy / d;
        p.x = h.x + nx * p.hookLen;
        p.y = h.y + ny * p.hookLen;
        const vr = p.vx * nx + p.vy * ny;
        if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; }
      }
      h.pulse = Math.max(h.pulse, 0.55);
    }

    // 地面（史莱姆池表面）
    if (p.y + p.r > FLOOR_Y) {
      if (p.vy > 620) {
        p.squash = 0.28;
        burst(p.x, p.y + p.r, p.light, 7, 140);
        sfx.land();
      }
      p.y = FLOOR_Y - p.r;
      if (p.vy > 0) p.vy = -p.vy * 0.16;
      p.vx *= 0.84;
    }

    if (p.hit > 0) p.hit -= dt;
    p.x = clamp(p.x, WALL_L + p.r, WALL_R - p.r);
  }

  function ropePair(a, b) {
    if (a.attached >= 0 && b.attached >= 0) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.hypot(dx, dy) || 0.001;
    if (d <= ROPE_MAX) return;
    const nx = dx / d, ny = dy / d;
    const excess = d - ROPE_MAX;
    const wa = a.attached >= 0 ? 0 : (b.attached >= 0 ? 1 : 0.5);
    const wb = b.attached >= 0 ? 0 : (a.attached >= 0 ? 1 : 0.5);
    a.x += nx * excess * wa; a.y += ny * excess * wa;
    b.x -= nx * excess * wb; b.y -= ny * excess * wb;
    const va = a.vx * nx + a.vy * ny;
    const vb = b.vx * nx + b.vy * ny;
    const rel = vb - va;
    if (rel > 0) {
      if (wa > 0) { a.vx += nx * rel * (wa / (wa + wb)); a.vy += ny * rel * (wa / (wa + wb)); }
      if (wb > 0) { b.vx -= nx * rel * (wb / (wa + wb)); b.vy -= ny * rel * (wb / (wa + wb)); }
    }
  }

  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function updateHazards(dt) {
    for (let i = 0; i < HAZARDS.length; i++) {
      const hz = HAZARDS[i];
      hz.ang += hz.spd * dt;
      const ex = Math.cos(hz.ang) * hz.len / 2;
      const ey = Math.sin(hz.ang) * hz.len / 2;
      [p1, p2].forEach(function (p) {
        if (p.hit > 0) return;
        if (segDist(p.x, p.y, hz.x - ex, hz.y - ey, hz.x + ex, hz.y + ey) < p.r + hz.w) {
          p.hit = 0.45;
          p.expr = 'dizzy';
          const dx = p.x - hz.x, dy = p.y - hz.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 620 + rand(-90, 90);
          p.vy += (dy / d) * 380 - 420;
          shake = Math.min(22, shake + 12);
          burst(p.x, p.y, C.yellow, 14, 300);
          sfx.hit();
        }
      });
    }
  }

  function aiUpdate(dt) {
    aiCooldown -= dt;
    if (p2.attached >= 0) {
      const h = HOOKS[p2.attached];
      const d = Math.hypot(p2.x - h.x, p2.y - h.y);
      if (aiCooldown <= 0 && (p2.vy < -250 || d < 115 || Math.random() < 0.008)) {
        if (Math.random() < 0.12) { detach(p2, false); }
        else { detach(p2, true); }
        aiCooldown = 0.45;
      }
    } else if (aiCooldown <= 0) {
      const idx = bestHook(p2, GRAPPLE_RANGE * 0.92);
      if (idx >= 0 && Math.random() < 0.9) {
        attach(p2, idx);
        aiCooldown = 0.5;
      }
    }
  }

  function respawnPlayers() {
    const cp = CHECKPOINTS[checkpointIndex()];
    p1.x = 300; p1.y = cp.y; p1.vx = 0; p1.vy = 0; p1.attached = -1;
    p2.x = 390; p2.y = cp.y; p2.vx = 0; p2.vy = 0; p2.attached = -1;
    shake = Math.min(20, shake + 10);
    burst((p1.x + p2.x) / 2, cp.y + 20, C.lime, 18, 260);
  }

  let cpReached = 0;
  function checkpointIndex() {
    let idx = 0;
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      if (Math.min(p1.y, p2.y) < CHECKPOINTS[i].y) idx = i;
    }
    return idx;
  }

  function update(dt) {
    globalT += dt;
    if (state === 'won') {
      winT += dt;
      shake *= 0.9;
      updateParticles(dt);
      return;
    }
    if (state !== 'playing') {
      updateParticles(dt);
      return;
    }
    time += dt;
    hintAlpha = Math.max(0, hintAlpha - dt * 0.25);

    // 输入
    const i1 = { left: !!keys['a'], right: !!keys['d'], hold: !!keys['f'] };
    if (mode === 2) {
      var i2 = { left: !!keys['arrowleft'], right: !!keys['arrowright'], hold: !!keys['j'] };
    } else {
      aiUpdate(dt);
      var i2 = { left: false, right: false, hold: false };
    }

    // 抓 / 放由 keydown 触发（按一下抓住，再按一下松开）

    stepPlayer(p1, i1, dt);
    stepPlayer(p2, i2, dt);
    ropePair(p1, p2);
    updateHazards(dt);
    updateCamera(dt);
    updateParticles(dt);

    // 掉下去
    if (p1.y > WORLD_BOT || p2.y > WORLD_BOT) {
      falls++;
      respawnPlayers();
      floatText(W / 2, camY + H * 0.5, '重来一次！', C.lime);
      sfx.hit();
    }

    // 区域提示
    const midY = (p1.y + p2.y) / 2;
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (midY < ZONES[i].y) {
        if (zoneIndex !== i) { zoneIndex = i; zoneName = ZONES[i].name; zoneAlpha = 1; }
        break;
      }
    }
    zoneAlpha = Math.max(0, zoneAlpha - dt * 0.35);

    // 胜利
    if (p1.y < GOAL_Y + 40 && p2.y < GOAL_Y + 40) {
      state = 'won';
      winT = 0;
      sfx.win();
      for (let i = 0; i < 40; i++) {
        burst(rand(120, 600), GOAL_Y - 40, i % 2 ? C.green : C.pink, 1, 380);
      }
    }
  }

  function updateCamera(dt) {
    const midY = (p1.y + p2.y) / 2;
    const target = clamp(midY - H * 0.60, WORLD_TOP + 120, WORLD_BOT - H);
    camY = lerp(camY, target, Math.min(1, dt * 3.4));
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 900 * dt;
      p.vx *= (1 - 1.6 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      f.y -= 46 * dt;
      if (f.life <= 0) floats.splice(i, 1);
    }
    shake *= 0.88;
    HOOKS.forEach(function (h) { h.pulse *= 0.93; });
  }

  /* ---------------- 绘制：背景 ---------------- */
  const bgBlobs = [];
  for (let i = 0; i < 14; i++) {
    bgBlobs.push({
      x: rand(-100, W + 100),
      y: rand(WORLD_TOP, WORLD_BOT),
      r: rand(90, 260),
      a: rand(0.07, 0.15),
      c: [C.lime, C.pink, C.blue, C.purpleL][i % 4],
      f: rand(0.12, 0.40)
    });
  }
  const bubbles = [];
  for (let i = 0; i < 30; i++) {
    bubbles.push({ x: rand(0, W), y: rand(0, H), r: rand(2, 8), s: rand(8, 26), a: rand(0.10, 0.30) });
  }

  const PROPS = (function () {
    const a = [];
    for (let y = 120; y < 2700; y += 520) {
      a.push({ t: 'lamp', x: 126, y: y, s: 1 });
      a.push({ t: 'lamp', x: 594, y: y + 260, s: 0.85 });
    }
    for (let y = 240; y < 2650; y += 390) {
      a.push({ t: 'shelf', x: 26, y: y, s: 0.9 });
      a.push({ t: 'shelf', x: 694, y: y + 190, s: 0.9 });
    }
    a.push({ t: 'pizza', x: 556, y: 1960, s: 1 });
    a.push({ t: 'icecream', x: 168, y: 1450, s: 0.95 });
    a.push({ t: 'frame', x: 360, y: 1080, s: 1 });
    a.push({ t: 'domes', x: 360, y: 690, s: 1 });
    return a;
  })();

  function drawLamp(sy, x, s) {
    ctx.save();
    ctx.translate(x, sy);
    ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -190); ctx.lineTo(0, -36); ctx.stroke();
    const cg = ctx.createLinearGradient(0, -20, 0, 260);
    cg.addColorStop(0, 'rgba(255,240,180,.13)');
    cg.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(-16, -18); ctx.lineTo(16, -18); ctx.lineTo(88, 260); ctx.lineTo(-88, 260); ctx.closePath(); ctx.fill();
    const sg = ctx.createLinearGradient(0, -40, 0, 0);
    sg.addColorStop(0, '#5A3AA8'); sg.addColorStop(1, '#2C1360');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(0, -18, 30, 20, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.shadowColor = '#FFE9A6'; ctx.shadowBlur = 22;
    const bg = ctx.createRadialGradient(0, 2, 1, 0, 2, 13);
    bg.addColorStop(0, '#FFF8D8'); bg.addColorStop(1, '#FFC84A');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(0, 2, 11, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawShelf(sy, x) {
    ctx.save();
    ctx.translate(x, sy);
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#3A1E78';
    rr(ctx, -1, 0, 58, 12, 6); ctx.fill();
    rr(ctx, -1, 62, 58, 12, 6); ctx.fill();
    const cols = [C.green, C.pink, C.blue];
    for (let i = 0; i < 3; i++) {
      const jx = 3 + i * 18;
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      rr(ctx, jx, 16, 14, 24, 5); ctx.fill();
      ctx.fillStyle = cols[i];
      ctx.globalAlpha = 0.5;
      rr(ctx, jx + 3, 24, 8, 13, 4); ctx.fill();
      ctx.globalAlpha = 0.55;
    }
    ctx.restore();
  }

  function drawPizza(sy, x) {
    ctx.save();
    ctx.translate(x, sy);
    ctx.scale(0.62, 0.62);
    ctx.globalAlpha = 0.24;
    ctx.rotate(-0.18);
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 120);
    g.addColorStop(0, '#FFD98A'); g.addColorStop(.7, '#F2B44E'); g.addColorStop(1, '#C97C1E');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 116, 0, TAU); ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#B96A16';
    ctx.beginPath(); ctx.arc(0, 0, 110, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#D8473C';
    [[-46, -30], [10, -52], [54, 4], [-20, 44], [40, 52], [-64, 28]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 15, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#4E7A26';
    [[-8, -6], [28, 26], [-36, 6]].forEach(function (p) {
      ctx.beginPath(); ctx.ellipse(p[0], p[1], 12, 7, 0.6, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }

  function drawIcecream(sy, x) {
    ctx.save();
    ctx.translate(x, sy);
    ctx.scale(0.78, 0.78);
    ctx.globalAlpha = 0.26;
    ctx.rotate(0.12);
    ctx.fillStyle = '#D9A05B';
    ctx.beginPath(); ctx.moveTo(-40, 30); ctx.lineTo(40, 30); ctx.lineTo(0, 150); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,20,.5)'; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(-34 + i * 17, 40); ctx.lineTo(-8 + i * 10, 130); ctx.stroke();
    }
    const scoops = [['#FF9AD6', 0, -18, 46], ['#ABE14D', -34, 10, 40], ['#8ED6FF', 30, 12, 40]];
    scoops.forEach(function (s) {
      const g = ctx.createRadialGradient(s[1] - 12, s[2] - 14, 4, s[1], s[2], s[3]);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(.35, s[0]); g.addColorStop(1, 'rgba(0,0,0,.25)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s[1], s[2], s[3], 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#E23B52';
    ctx.beginPath(); ctx.arc(0, -58, 11, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4E7A26'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -58); ctx.quadraticCurveTo(12, -76, 20, -82); ctx.stroke();
    ctx.restore();
  }

  function drawFrame(sy, x) {
    ctx.save();
    ctx.translate(x, sy);
    ctx.globalAlpha = 0.30;
    for (let i = 0; i < 3; i++) {
      const fx = -170 + i * 130;
      ctx.shadowColor = C.lime; ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(198,242,78,.75)';
      ctx.lineWidth = 4;
      rr(ctx, fx, -50, 96, 96, 10); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(198,242,78,.10)';
      rr(ctx, fx + 4, -46, 88, 88, 8); ctx.fill();
    }
    ctx.restore();
  }

  function drawDomes(sy, x) {
    ctx.save();
    ctx.translate(x, sy);
    ctx.globalAlpha = 0.24;
    for (let i = 0; i < 5; i++) {
      const dx = -180 + i * 90 + (i % 2 ? 20 : 0);
      const dy = i % 2 ? 20 : 0;
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(dx, dy, 34, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      ctx.beginPath(); ctx.arc(dx, dy, 34, Math.PI, 0); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawProp(pr, sy) {
    if (sy < -280 || sy > H + 280) return;
    if (pr.t === 'lamp') drawLamp(sy, pr.x, pr.s);
    else if (pr.t === 'shelf') drawShelf(sy, pr.x);
    else if (pr.t === 'pizza') drawPizza(sy, pr.x);
    else if (pr.t === 'icecream') drawIcecream(sy, pr.x);
    else if (pr.t === 'frame') drawFrame(sy, pr.x);
    else if (pr.t === 'domes') drawDomes(sy, pr.x);
  }

  function drawBackground() {
    const t = clamp((camY - (WORLD_TOP + 120)) / ((WORLD_BOT - H) - (WORLD_TOP + 120)), 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#12052E');
    g.addColorStop(0.32, mixHex('#2A0C5E', '#3A1478', t));
    g.addColorStop(0.64, '#4B1E96');
    g.addColorStop(0.86, '#7A3FC0');
    g.addColorStop(1, '#BBDC55');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const rg = ctx.createRadialGradient(W * 0.5, H * 0.05, 30, W * 0.5, H * 0.05, 580);
    rg.addColorStop(0, 'rgba(198,242,78,.16)');
    rg.addColorStop(.5, 'rgba(120,80,255,.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // 远处拱门
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = '#C9B6FF';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ax = 90 + i * 180;
      const ay = H * 0.56 - camY * 0.04;
      ctx.beginPath(); ctx.arc(ax, ay, 80, Math.PI, 0); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax - 80, ay); ctx.lineTo(ax - 80, H);
      ctx.moveTo(ax + 80, ay); ctx.lineTo(ax + 80, H);
      ctx.stroke();
    }
    ctx.restore();

    // 视差光斑
    for (let i = 0; i < bgBlobs.length; i++) {
      const b = bgBlobs[i];
      const sy = b.y - camY * b.f;
      if (sy < -340 || sy > H + 340) continue;
      const bg2 = ctx.createRadialGradient(b.x, sy, b.r * 0.08, b.x, sy, b.r);
      bg2.addColorStop(0, rgba(b.c, b.a * 1.5));
      bg2.addColorStop(1, rgba(b.c, 0));
      ctx.fillStyle = bg2;
      ctx.beginPath(); ctx.arc(b.x, sy, b.r, 0, TAU); ctx.fill();
    }

    // 道具层
    for (let i = 0; i < PROPS.length; i++) {
      drawProp(PROPS[i], PROPS[i].y - camY * 0.72);
    }

    // 空气雾：把背景推远，让玩法层跳出来
    const haze = ctx.createLinearGradient(0, 0, 0, H);
    haze.addColorStop(0, 'rgba(20,6,48,.34)');
    haze.addColorStop(1, 'rgba(20,6,48,.46)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, W, H);

    // 上升气泡
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      const sy = ((b.y - globalT * b.s) % (H + 80) + H + 80) % (H + 80) - 40;
      ctx.globalAlpha = b.a;
      ctx.strokeStyle = '#F2FFCF';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(b.x, sy, b.r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 绘制：角色 ---------------- */
  function blobPath(c, r, t) {
    const s = 1 + Math.sin((t || 0) * 2.2) * 0.008;
    const R = r * s;
    c.beginPath();
    c.moveTo(0, -R * 1.02);
    c.bezierCurveTo(R * 0.56, -R * 1.02, R * 0.98, -R * 0.60, R * 0.95, -R * 0.04);
    c.bezierCurveTo(R * 0.93, R * 0.38, R * 0.84, R * 0.62, R * 0.63, R * 0.72);
    c.bezierCurveTo(R * 0.53, R * 0.99, R * 0.18, R * 1.03, 0, R * 0.93);
    c.bezierCurveTo(-R * 0.18, R * 1.03, -R * 0.53, R * 0.99, -R * 0.63, R * 0.72);
    c.bezierCurveTo(-R * 0.84, R * 0.62, -R * 0.93, R * 0.38, -R * 0.95, -R * 0.04);
    c.bezierCurveTo(-R * 0.98, -R * 0.60, -R * 0.56, -R * 1.02, 0, -R * 1.02);
    c.closePath();
  }

  function heartPath(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.32);
    c.bezierCurveTo(x, y, x - s * 0.52, y - s * 0.18, x - s * 0.52, y + s * 0.16);
    c.bezierCurveTo(x - s * 0.52, y + s * 0.54, x, y + s * 0.78, x, y + s * 1.0);
    c.bezierCurveTo(x, y + s * 0.78, x + s * 0.52, y + s * 0.54, x + s * 0.52, y + s * 0.16);
    c.bezierCurveTo(x + s * 0.52, y - s * 0.18, x, y, x, y + s * 0.32);
    c.closePath();
  }

  function drawEye(c, p, x, y, rx, ry, look, expr, blink) {
    const b = ry * blink;
    c.save();
    c.beginPath(); c.ellipse(x, y, rx, b, 0, 0, TAU);
    c.fillStyle = '#FFFFFF'; c.fill();
    c.save();
    c.beginPath(); c.ellipse(x, y, rx, b, 0, 0, TAU); c.clip();
    const ix = x + look, iy = y + ry * 0.10;
    const ig = c.createRadialGradient(ix - ry * 0.2, iy - ry * 0.28, ry * 0.04, ix, iy, ry * 0.80);
    ig.addColorStop(0, '#5B3C82');
    ig.addColorStop(0.45, '#2C1750');
    ig.addColorStop(1, '#150A26');
    c.fillStyle = ig;
    c.beginPath(); c.arc(ix, iy, ry * (expr === 'scared' ? 0.58 : 0.72), 0, TAU); c.fill();
    c.globalAlpha = 0.28;
    c.fillStyle = p.light;
    c.beginPath(); c.ellipse(ix, iy + ry * 0.52, ry * 0.46, ry * 0.20, 0, 0, TAU); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = '#FFFFFF';
    c.beginPath(); c.arc(ix - ry * 0.26, iy - ry * 0.30, ry * 0.23, 0, TAU); c.fill();
    c.beginPath(); c.arc(ix + ry * 0.24, iy + ry * 0.22, ry * 0.10, 0, TAU); c.fill();
    const lid = c.createLinearGradient(0, y - ry, 0, y - ry * 0.15);
    lid.addColorStop(0, 'rgba(0,0,0,.26)'); lid.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = lid; c.fillRect(x - rx, y - ry, rx * 2, ry * 0.85);
    c.restore();
    c.strokeStyle = p.dark; c.lineWidth = Math.max(1.6, ry * 0.085);
    c.beginPath(); c.ellipse(x, y, rx, b, 0, 0, TAU); c.stroke();
    c.restore();
  }

  function drawHeartEye(c, x, y, s) {
    const g = c.createRadialGradient(x - s * 0.2, y - s * 0.1, s * 0.05, x, y + s * 0.4, s * 0.85);
    g.addColorStop(0, '#FF8FB4');
    g.addColorStop(0.5, '#FF3D6E');
    g.addColorStop(1, '#C71E4E');
    c.fillStyle = g;
    heartPath(c, x, y, s); c.fill();
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath(); c.ellipse(x - s * 0.22, y + s * 0.20, s * 0.09, s * 0.13, -0.4, 0, TAU); c.fill();
  }

  function drawFace(c, p, expr, t) {
    const r = p.r;
    const eyeY = -r * 0.09;
    const ex = r * 0.335;
    const look = clamp(p.faceDir * r * 0.065, -r * 0.065, r * 0.065);
    const blink = Math.sin(t * 1.15 + (p.isPink ? 2.0 : 0)) > 0.97 ? 0.14 : 1;

    // 腮红
    [-1, 1].forEach(function (side) {
      const bx = side * r * 0.55;
      const bg = c.createRadialGradient(bx, r * 0.21, 1, bx, r * 0.21, r * 0.26);
      bg.addColorStop(0, p.isPink ? 'rgba(255,80,140,.55)' : 'rgba(255,140,160,.50)');
      bg.addColorStop(1, 'rgba(255,120,150,0)');
      c.fillStyle = bg;
      c.beginPath(); c.ellipse(bx, r * 0.21, r * 0.26, r * 0.18, 0, 0, TAU); c.fill();
    });

    if (expr === 'dizzy') {
      c.strokeStyle = '#231634'; c.lineWidth = r * 0.075; c.lineCap = 'round';
      [-ex, ex].forEach(function (x) {
        c.beginPath();
        c.moveTo(x - r * 0.15, eyeY - r * 0.14); c.lineTo(x + r * 0.15, eyeY + r * 0.14);
        c.moveTo(x + r * 0.15, eyeY - r * 0.14); c.lineTo(x - r * 0.15, eyeY + r * 0.14);
        c.stroke();
      });
      c.fillStyle = '#231634';
      c.beginPath(); c.ellipse(0, r * 0.34, r * 0.11, r * 0.15, 0, 0, TAU); c.fill();
      c.fillStyle = '#FF7FA8';
      c.beginPath(); c.ellipse(0, r * 0.40, r * 0.07, r * 0.05, 0, 0, TAU); c.fill();
      return;
    }

    if (expr === 'happy') {
      c.strokeStyle = '#231634'; c.lineWidth = r * 0.08; c.lineCap = 'round';
      [-ex, ex].forEach(function (x) {
        c.beginPath();
        c.arc(x, eyeY + r * 0.04, r * 0.16, Math.PI * 1.12, Math.PI * 1.88);
        c.stroke();
      });
    } else if (p.isPink && (expr === 'idle' || expr === 'effort')) {
      drawHeartEye(c, -ex, eyeY - r * 0.16, r * 0.36);
      drawHeartEye(c, ex, eyeY - r * 0.16, r * 0.36);
    } else {
      const wide = expr === 'scared' ? 1.12 : 1;
      drawEye(c, p, -ex, eyeY, r * 0.25 * wide, r * 0.30 * wide, look, expr, blink);
      drawEye(c, p, ex, eyeY, r * 0.25 * wide, r * 0.30 * wide, look, expr, blink);
      if (expr === 'effort') {
        c.strokeStyle = p.dark; c.lineWidth = r * 0.055; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-ex - r * 0.16, eyeY - r * 0.42); c.lineTo(-ex + r * 0.14, eyeY - r * 0.30); c.stroke();
        c.beginPath(); c.moveTo(ex + r * 0.16, eyeY - r * 0.42); c.lineTo(ex - r * 0.14, eyeY - r * 0.30); c.stroke();
      }
    }

    // 嘴
    c.lineCap = 'round';
    if (expr === 'scared') {
      c.lineWidth = r * 0.06; c.strokeStyle = '#231634';
      c.beginPath();
      c.moveTo(-r * 0.16, r * 0.34);
      c.quadraticCurveTo(-r * 0.06, r * 0.25, 0, r * 0.35);
      c.quadraticCurveTo(r * 0.07, r * 0.44, r * 0.17, r * 0.33);
      c.stroke();
    } else if (expr === 'effort') {
      c.fillStyle = '#2A1035';
      c.beginPath(); c.ellipse(0, r * 0.34, r * 0.11, r * 0.15, 0, 0, TAU); c.fill();
      c.fillStyle = '#FF7FA8';
      c.beginPath(); c.ellipse(0, r * 0.40, r * 0.07, r * 0.05, 0, 0, TAU); c.fill();
    } else {
      c.fillStyle = '#2A1035';
      c.beginPath();
      c.moveTo(-r * 0.17, r * 0.28);
      c.quadraticCurveTo(0, r * 0.20, r * 0.17, r * 0.28);
      c.quadraticCurveTo(r * 0.12, r * 0.50, 0, r * 0.50);
      c.quadraticCurveTo(-r * 0.12, r * 0.50, -r * 0.17, r * 0.28);
      c.closePath();
      c.fill();
      c.fillStyle = '#FF6E9E';
      c.beginPath(); c.ellipse(0, r * 0.44, r * 0.10, r * 0.055, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = r * 0.025;
      c.beginPath(); c.moveTo(-r * 0.13, r * 0.30); c.quadraticCurveTo(0, r * 0.25, r * 0.13, r * 0.30); c.stroke();
    }
  }

  function drawPlayer(p, t) {
    const expr = p.hit > 0 ? 'dizzy'
      : (p.attached >= 0 ? 'effort'
        : (p.vy > 760 ? 'scared'
          : (state === 'won' ? 'happy' : 'idle')));

    const sp = Math.hypot(p.vx, p.vy);
    const st = clamp(sp / 2600, 0, 0.20);
    const lean = clamp(p.vx / 900, -0.25, 0.25);
    p.faceDir = lerp(p.faceDir, clamp(p.vx / 500, -1, 1), 0.12);

    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(t * 4 + (p.isPink ? 2 : 0)) * 1.2);
    ctx.rotate(lean * 0.5);
    ctx.scale(1 + st - p.squash * 0.5, 1 - st + p.squash * 0.5);

    // 地面软影
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#12052E';
    ctx.beginPath(); ctx.ellipse(0, p.r * 1.26, p.r * 0.78, p.r * 0.15, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    // 背光
    const glow = ctx.createRadialGradient(0, 0, p.r * 0.55, 0, 0, p.r * 1.85);
    glow.addColorStop(0, rgba(p.color, 0.30));
    glow.addColorStop(1, rgba(p.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, p.r * 1.85, 0, TAU); ctx.fill();

    // 头顶泥滴（身体后，只露上半）
    const dg = ctx.createLinearGradient(0, -p.r * 1.32, 0, -p.r * 0.8);
    dg.addColorStop(0, p.light); dg.addColorStop(1, p.color);
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(p.r * 0.22, -p.r * 1.00, p.r * 0.27, 0, TAU); ctx.fill();
    ctx.strokeStyle = p.dark; ctx.lineWidth = 4; ctx.stroke();

    // 身体
    const g = ctx.createLinearGradient(0, -p.r * 1.05, 0, p.r * 1.05);
    g.addColorStop(0, p.light);
    g.addColorStop(0.32, p.color);
    g.addColorStop(0.78, mixHex(p.color, p.dark, 0.30));
    g.addColorStop(1, mixHex(p.color, p.dark, 0.55));
    ctx.fillStyle = g;
    ctx.shadowColor = rgba(p.dark, 0.55);
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 7;
    blobPath(ctx, p.r, t);
    ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // 内部光影
    ctx.save();
    blobPath(ctx, p.r, t); ctx.clip();
    const ao = ctx.createRadialGradient(0, p.r * 0.95, p.r * 0.1, 0, p.r * 0.75, p.r * 1.1);
    ao.addColorStop(0, 'rgba(0,0,0,.26)');
    ao.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ao;
    ctx.fillRect(-p.r * 1.2, -p.r * 1.2, p.r * 2.4, p.r * 2.4);
    const rim = ctx.createLinearGradient(-p.r, -p.r, p.r * 0.35, p.r * 0.55);
    rim.addColorStop(0, 'rgba(255,255,255,.42)');
    rim.addColorStop(0.42, 'rgba(255,255,255,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(-p.r * 1.2, -p.r * 1.2, p.r * 2.4, p.r * 2.4);
    const gl = ctx.createRadialGradient(-p.r * 0.42, -p.r * 0.52, 1, -p.r * 0.42, -p.r * 0.52, p.r * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,.55)');
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.ellipse(-p.r * 0.42, -p.r * 0.52, p.r * 0.30, p.r * 0.42, -0.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = '#FFFFFF';
    [[0.30, 0.18, 0.055], [-0.18, 0.42, 0.04], [0.42, 0.44, 0.035]].forEach(function (b) {
      ctx.beginPath(); ctx.arc(p.r * b[0], p.r * b[1], p.r * b[2], 0, TAU); ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // 描边
    ctx.strokeStyle = p.dark; ctx.lineWidth = 4.5; ctx.lineJoin = 'round';
    blobPath(ctx, p.r, t);
    ctx.stroke();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.6;
    ctx.save(); ctx.translate(0, 1); ctx.scale(0.975, 0.975);
    blobPath(ctx, p.r, t); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;

    drawFace(ctx, p, expr, t);

    // 头顶气泡
    const bob = Math.sin(t * 2.4 + (p.isPink ? 1.6 : 0)) * 3;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(p.r * 0.55, -p.r * 1.75 + bob, p.r * 0.20, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(p.r * 0.49, -p.r * 1.82 + bob, p.r * 0.055, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();

    // 抓钩提示
    if (p.attached < 0 && state === 'playing') {
      const idx = bestHook(p, GRAPPLE_RANGE);
      if (idx >= 0) {
        const h = HOOKS[idx];
        ctx.save();
        ctx.globalAlpha = 0.16 + Math.sin(t * 5) * 0.06;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 10]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawAttachedStrand(p) {
    if (p.attached < 0) return;
    const h = HOOKS[p.attached];
    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = p.color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(h.x, h.y); ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 绘制：绳子 ---------------- */
  function drawRope(a, b, t) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const slack = clamp((ROPE_MAX - dist) / ROPE_MAX, 0, 1);
    const taut = 1 - slack;
    const n = 24;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = a.x + dx * u;
      const y = a.y + dy * u;
      const perpX = -dy / dist, perpY = dx / dist;
      const wob = Math.sin(t * 7 + u * 9) * 4.5 * slack;
      const sagY = Math.sin(u * Math.PI) * (slack * 78);
      pts.push([x + perpX * wob, y + perpY * wob + sagY]);
    }
    function path() {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
        else ctx.lineTo(pts[i][0], pts[i][1]);
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // 外层柔光
    ctx.globalAlpha = 0.16 + taut * 0.20;
    ctx.strokeStyle = mixHex(a.color, b.color, 0.5);
    ctx.lineWidth = 26 + slack * 10;
    path(); ctx.stroke();
    // 主丝
    ctx.globalAlpha = 1;
    ctx.shadowColor = rgba(C.lime, 0.30 + taut * 0.45);
    ctx.shadowBlur = 18 + taut * 16;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, a.light);
    g.addColorStop(0.3, a.color);
    g.addColorStop(0.7, b.color);
    g.addColorStop(1, b.light);
    ctx.strokeStyle = g;
    ctx.lineWidth = 12 + slack * 7;
    path(); ctx.stroke();
    ctx.shadowBlur = 0;
    // 高光内芯
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.42 + taut * 0.30) + ')';
    ctx.lineWidth = 3.2;
    path(); ctx.stroke();
    // 流动气泡
    ctx.fillStyle = '#FFFFFF';
    for (let k = 0; k < 5; k++) {
      const u = (t * 0.16 + k / 5) % 1;
      const p = pts[Math.min(n, Math.floor(u * n))];
      ctx.globalAlpha = 0.45 + taut * 0.35;
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.2 + taut * 1.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------------- 绘制：关卡元素 ---------------- */
  function drawPool() {
    const y = 2510;
    ctx.save();
    const g = ctx.createLinearGradient(0, y - 30, 0, y + 160);
    g.addColorStop(0, 'rgba(198,242,78,.95)');
    g.addColorStop(1, 'rgba(120,180,40,.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-40, y);
    for (let x = -40; x <= W + 40; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.03 + globalT * 2.2) * 7 + Math.sin(x * 0.011 - globalT * 1.3) * 5);
    }
    ctx.lineTo(W + 40, y + 220);
    ctx.lineTo(-40, y + 220);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -40; x <= W + 40; x += 16) {
      const yy = y + Math.sin(x * 0.03 + globalT * 2.2) * 7 + Math.sin(x * 0.011 - globalT * 1.3) * 5;
      if (x === -40) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawGoal() {
    const y = GOAL_Y;
    ctx.save();
    // 光柱
    const g = ctx.createLinearGradient(0, y - 160, 0, y + 60);
    g.addColorStop(0, 'rgba(198,242,78,0)');
    g.addColorStop(1, 'rgba(198,242,78,.25)');
    ctx.fillStyle = g;
    ctx.fillRect(W / 2 - 150, y - 160, 300, 220);
    // 平台
    ctx.fillStyle = C.purple;
    rr(ctx, W / 2 - 150, y + 20, 300, 34, 17); ctx.fill();
    ctx.fillStyle = C.lime;
    rr(ctx, W / 2 - 150, y + 20, 300, 12, 6); ctx.fill();
    // 文字
    ctx.textAlign = 'center';
    ctx.fillStyle = C.lime;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 18;
    ctx.font = '700 26px "PingFang SC","Noto Sans SC",system-ui,sans-serif';
    ctx.fillText('终 点', W / 2, y - 26);
    ctx.restore();
  }

  function drawHook(h, t) {
    const pulse = h.pulse;
    const bob = Math.sin(t * 2 + h.x * 0.01) * 2;
    ctx.save();
    ctx.translate(h.x, h.y + bob);
    // 光晕
    const gl = ctx.createRadialGradient(0, 0, 6, 0, 0, 74 + pulse * 24);
    gl.addColorStop(0, 'rgba(198,242,78,' + (0.22 + pulse * 0.35) + ')');
    gl.addColorStop(1, 'rgba(198,242,78,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(0, 0, 74 + pulse * 24, 0, TAU); ctx.fill();
    // 玻璃罩
    const dome = ctx.createRadialGradient(-8, -10, 4, 0, 0, 36);
    dome.addColorStop(0, 'rgba(255,255,255,.32)');
    dome.addColorStop(0.6, 'rgba(198,242,78,.10)');
    dome.addColorStop(1, 'rgba(198,242,78,.02)');
    ctx.fillStyle = dome;
    ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI, 0); ctx.closePath(); ctx.fill();
    // 外圈
    ctx.strokeStyle = C.lime; ctx.lineWidth = 4;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(34, 0); ctx.stroke();
    ctx.shadowBlur = 0;
    // 高光弧
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 27, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
    // 底座
    ctx.fillStyle = '#2A1A6E';
    rr(ctx, -20, 0, 40, 9, 4); ctx.fill();
    // 中心
    ctx.fillStyle = C.lime;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
    // 待机提示环
    if (pulse < 0.1) {
      ctx.globalAlpha = 0.45 + Math.sin(t * 3 + h.y) * 0.25;
      ctx.strokeStyle = 'rgba(198,242,78,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 45 + Math.sin(t * 3 + h.y) * 3, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawHazard(hz) {
    const ex = Math.cos(hz.ang) * hz.len / 2;
    const ey = Math.sin(hz.ang) * hz.len / 2;
    ctx.save();
    ctx.lineCap = 'round';
    // 拖影
    for (let k = 1; k <= 2; k++) {
      const a2 = hz.ang - hz.spd * 0.06 * k;
      const ex2 = Math.cos(a2) * hz.len / 2, ey2 = Math.sin(a2) * hz.len / 2;
      ctx.globalAlpha = 0.10 / k;
      ctx.strokeStyle = C.purpleL;
      ctx.lineWidth = hz.w;
      ctx.beginPath(); ctx.moveTo(hz.x - ex2, hz.y - ey2); ctx.lineTo(hz.x + ex2, hz.y + ey2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 外光
    ctx.strokeStyle = 'rgba(255,212,92,.10)';
    ctx.lineWidth = hz.w + 22;
    ctx.beginPath(); ctx.moveTo(hz.x - ex, hz.y - ey); ctx.lineTo(hz.x + ex, hz.y + ey); ctx.stroke();
    // 主杆
    const lg = ctx.createLinearGradient(hz.x - ex, hz.y - ey, hz.x + ex, hz.y + ey);
    lg.addColorStop(0, '#8B7BFF'); lg.addColorStop(.5, '#3B2AB0'); lg.addColorStop(1, '#8B7BFF');
    ctx.strokeStyle = lg;
    ctx.lineWidth = hz.w;
    ctx.beginPath(); ctx.moveTo(hz.x - ex, hz.y - ey); ctx.lineTo(hz.x + ex, hz.y + ey); ctx.stroke();
    // 中缝
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hz.x - ex * .8, hz.y - ey * .8); ctx.lineTo(hz.x + ex * .8, hz.y + ey * .8); ctx.stroke();
    // 两端
    [1, -1].forEach(function (s) {
      ctx.fillStyle = C.yellow;
      ctx.shadowColor = C.yellow; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(hz.x + ex * s, hz.y + ey * s, hz.w * 0.9, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFF3C4';
      ctx.beginPath(); ctx.arc(hz.x + ex * s - 2, hz.y + ey * s - 2, hz.w * 0.32, 0, TAU); ctx.fill();
    });
    // 轴
    ctx.fillStyle = '#2A1A6E';
    ctx.beginPath(); ctx.arc(hz.x, hz.y, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = C.yellow;
    ctx.beginPath(); ctx.arc(hz.x, hz.y, 6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------------- 绘制：HUD ---------------- */
  function drawLogo(x, y, scale, centered) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    // 主字
    ctx.font = '900 58px "PingFang SC","Noto Sans SC",system-ui,sans-serif';
    ctx.strokeStyle = '#2A1A6E';
    ctx.lineWidth = 16;
    ctx.strokeText('拉丝', 0, -10);
    const lg = ctx.createLinearGradient(0, -44, 0, 24);
    lg.addColorStop(0, '#EBFFAE');
    lg.addColorStop(0.5, C.lime);
    lg.addColorStop(1, '#9ED32E');
    ctx.fillStyle = lg;
    ctx.fillText('拉丝', 0, -10);
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('拉丝', 0, -16);
    ctx.globalAlpha = 1;
    // 下划线与滴落
    ctx.fillStyle = C.lime;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 14;
    rr(ctx, -72, 26, 144, 7, 4); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(62, 36, 6.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(62, 48, 3.4, 5.5, 0, 0, TAU); ctx.fill();
    // 英文
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 18px "PingFang SC","Noto Sans SC",system-ui,sans-serif';
    ctx.fillText('L I M E L A N D', 0, 66);
    ctx.restore();
  }

  function drawHUD() {
    // 进度条
    const total = 2500;
    const prog = clamp((2420 - Math.min(p1.y, p2.y)) / total, 0, 1);
    const bx = W - 46, by = 150, bh = 420;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    rr(ctx, bx - 6, by, 12, bh, 6); ctx.fill();
    ctx.fillStyle = C.lime;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 12;
    rr(ctx, bx - 6, by + bh * (1 - prog), 12, bh * prog, 6); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.font = '600 13px "PingFang SC",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('高度', bx, by - 18);
    ctx.restore();

    // 时间
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '700 16px "PingFang SC",system-ui,sans-serif';
    ctx.fillText(time.toFixed(1) + 's', W - 40, 96);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.font = '600 12px "PingFang SC",system-ui,sans-serif';
    ctx.fillText(mode === 2 ? '双人' : '单人 + AI', W - 40, 118);
    ctx.restore();

    // 开局提示
    if (hintAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = hintAlpha;
      ctx.fillStyle = 'rgba(14,4,34,.62)';
      rr(ctx, W / 2 - 288, H - 128, 576, 84, 24); ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '600 20px "PingFang SC",system-ui,sans-serif';
      ctx.fillText('按 F / J 抓住钩子，再按一次松开就飞出去', W / 2, H - 92);
      ctx.fillStyle = 'rgba(198,242,78,.9)';
      ctx.font = '600 16px "PingFang SC",system-ui,sans-serif';
      ctx.fillText('A / D　·　← / →　空中也能调整方向', W / 2, H - 62);
      ctx.restore();
    }

    // 区域名
    if (zoneAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = zoneAlpha;
      ctx.textAlign = 'center';
      ctx.fillStyle = C.lime;
      ctx.font = '800 30px "PingFang SC",system-ui,sans-serif';
      ctx.shadowColor = C.lime; ctx.shadowBlur = 20;
      ctx.fillText(zoneName, W / 2, 220);
      ctx.restore();
    }

    // 飘字
    for (let i = 0; i < floats.length; i++) {
      const f = floats[i];
      ctx.save();
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.font = '800 22px "PingFang SC",system-ui,sans-serif';
      ctx.fillText(f.txt, f.x, f.y - camY);
      ctx.restore();
    }
  }

  function drawTitle() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,2,26,.55)';
    ctx.fillRect(0, 0, W, H);
    drawLogo(W / 2, 360, 1.55, true);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.font = '700 22px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('两个史莱姆，一根拉丝，谁也上不去一个人', W / 2, 520);

    // 两个角色
    const bob = Math.sin(globalT * 2) * 6;
    const a = { x: W / 2 - 110, y: 650 + bob, r: 46, color: C.green, light: C.greenL, dark: C.greenD, isPink: false, vx: 0, vy: 0, faceDir: 0, squash: 0, attached: -1, hit: 0 };
    const b = { x: W / 2 + 110, y: 650 - bob, r: 46, color: C.pink, light: C.pinkL, dark: C.pinkD, isPink: true, vx: 0, vy: 0, faceDir: 0, squash: 0, attached: -1, hit: 0 };
    drawRope(a, b, globalT);
    drawPlayer(a, globalT);
    drawPlayer(b, globalT);

    // 控制说明
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    rr(ctx, W / 2 - 230, 790, 460, 128, 18); ctx.fill();
    ctx.textAlign = 'left';
    ctx.font = '700 18px "PingFang SC",system-ui,sans-serif';
    ctx.fillStyle = C.green; ctx.fillText('玩家 1', W / 2 - 200, 826);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = '500 17px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('A / D 移动　·　F 抓钩 / 松开', W / 2 - 200, 852);

    ctx.fillStyle = C.pink;
    ctx.font = '700 18px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('玩家 2', W / 2 - 200, 884);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = '500 17px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('←  /  → 移动　·　J 抓钩 / 松开', W / 2 - 200, 908);

    // 开始
    ctx.fillStyle = 'rgba(14,4,34,.58)';
    rr(ctx, W / 2 - 178, 940, 356, 92, 26); ctx.fill();
    const pulse = 0.6 + Math.sin(globalT * 4) * 0.4;
    ctx.textAlign = 'center';
    ctx.globalAlpha = pulse;
    ctx.fillStyle = C.lime;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 18;
    ctx.font = '800 26px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('按 空格 开始双人', W / 2, 975);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = '500 15px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('想一个人玩？按 1（队友由 AI 扮演）', W / 2, 1012);
    ctx.restore();
  }

  function drawCard(x, y, w, h, key) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.03);
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#F6FFD8');
    g.addColorStop(1, '#D9F58A');
    ctx.fillStyle = g;
    rr(ctx, 0, 0, w, h, 16); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#2A1A6E'; ctx.lineWidth = 3;
    rr(ctx, 0, 0, w, h, 16); ctx.stroke();
    // 顶部色条
    ctx.fillStyle = C.purple;
    rr(ctx, 0, 0, w, 34, 16); ctx.fill();
    ctx.fillRect(0, 18, w, 16);
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.font = '800 16px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('LIMELAND · 登顶卡', w / 2, 23);
    const bob = Math.sin(globalT * 3) * 3;
    const a = { x: w * 0.32, y: 120 + bob, r: 34, color: C.green, light: C.greenL, dark: C.greenD, isPink: false, vx: 0, vy: 0, faceDir: 0, squash: 0, attached: -1, hit: 0 };
    const b = { x: w * 0.68, y: 120 - bob, r: 34, color: C.pink, light: C.pinkL, dark: C.pinkD, isPink: true, vx: 0, vy: 0, faceDir: 0, squash: 0, attached: -1, hit: 0 };
    drawRope(a, b, globalT);
    drawPlayer(a, globalT);
    drawPlayer(b, globalT);
    ctx.fillStyle = '#2A1A6E';
    ctx.textAlign = 'center';
    ctx.font = '800 22px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('到 顶 了', w / 2, 196);
    ctx.font = '600 14px "PingFang SC",system-ui,sans-serif';
    ctx.fillStyle = '#4B3FE3';
    ctx.fillText('用时 ' + time.toFixed(1) + ' 秒', w / 2, 226);
    ctx.fillText('漂亮飞出去 ' + perfectReleases + ' 次', w / 2, 248);
    ctx.restore();
  }

  function drawWin() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,2,26,.62)';
    ctx.fillRect(0, 0, W, H);
    const cardW = 300, cardH = 300;
    drawCard(W / 2 - cardW / 2, 250, cardW, cardH);
    ctx.textAlign = 'center';
    ctx.fillStyle = C.lime;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 24;
    ctx.font = '900 46px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('你们上去了', W / 2, 640);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = '600 18px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('默契 ' + clamp(Math.round(perfectReleases * 7 + togetherGrabs * 9), 20, 100) + '%　·　一起掉下来 ' + falls + ' 次', W / 2, 690);
    const pulse = 0.6 + Math.sin(globalT * 4) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#FFF';
    ctx.font = '700 20px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('按 R 再来一局', W / 2, 760);
    ctx.restore();
  }

  /* ---------------- 主绘制 ---------------- */
  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    ctx.save();
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    ctx.translate(sx, sy - camY);

    drawPool();
    drawGoal();

    for (let i = 0; i < HOOKS.length; i++) drawHook(HOOKS[i], globalT);
    for (let i = 0; i < HAZARDS.length; i++) drawHazard(HAZARDS[i]);

    if (p1 && p2 && state !== 'title') {
      drawAttachedStrand(p1);
      drawAttachedStrand(p2);
      drawRope(p1, p2, globalT);
      drawPlayer(p1, globalT);
      drawPlayer(p2, globalT);
    }

    // 粒子
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // 暗角，把注意力收回画面中央
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.26, W * 0.5, H * 0.5, H * 0.80);
    vg.addColorStop(0, 'rgba(10,2,26,0)');
    vg.addColorStop(1, 'rgba(10,2,26,.58)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    if (p1 && p2 && state !== 'title') drawHUD();
    if (state === 'title') drawTitle();
    if (state === 'won') drawWin();
  }

  /* ---------------- 循环 ---------------- */
  let last = performance.now(), acc = 0;
  const STEP = 1 / 120;

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 8) {
      update(STEP);
      acc -= STEP;
      guard++;
    }
    if (guard >= 8) acc = 0;
    draw();
    requestAnimationFrame(loop);
  }

  /* ---------------- 启动 ---------------- */
  fit();
  resetGame(2);
  state = 'title';
  p1 = makePlayer(300, 2420, { c: C.green, l: C.greenL, d: C.greenD }, false);
  p2 = makePlayer(390, 2420, { c: C.pink, l: C.pinkL, d: C.pinkD }, true);
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });
})();
