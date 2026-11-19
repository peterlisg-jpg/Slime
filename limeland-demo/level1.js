/* ============================================================
   拉丝 · 第一关「披萨拼盘」
   核心机制：滑轮配重 —— 一人上升，另一人必然下降。
   ============================================================ */
(function () {
  'use strict';

  const W = 900, H = 1200;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const hexA = (hex, a) => {
    const h = hex.replace('#', '');
    return 'rgba(' + parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16) + ',' + a + ')';
  };
  const lighten = (hex, a) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgb(' + Math.round(r + (255 - r) * a) + ',' + Math.round(g + (255 - g) * a) + ',' + Math.round(b + (255 - b) * a) + ')';
  };
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

  const C = {
    lime: '#C6F24E',
    green: '#ABE14D', greenD: '#5F9420',
    pink: '#FF9AD6', pinkD: '#C95E9E',
    blue: '#8ED6FF', yellow: '#FFD45C',
    purple: '#3A1478', ink: '#12042A',
    cheese: '#FFC94A', crust: '#D9903F'
  };

  /* ---------------- 画布 ---------------- */
  const frame = document.getElementById('frame');
  const cvs = document.getElementById('scene');
  const ctx = cvs.getContext('2d');
  let dpr = 1;
  function fit() {
    const s = Math.min((window.innerWidth * 0.96) / W, (window.innerHeight - 96) / H);
    frame.style.width = Math.round(W * s) + 'px';
    frame.style.height = Math.round(H * s) + 'px';
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cvs.width = Math.round(W * dpr);
    cvs.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
  }
  window.addEventListener('resize', fit);

  /* ---------------- 音频 ---------------- */
  let AC = null;
  function audio() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function tone(f, d, type, g, slide) {
    if (!AC) return;
    const t = AC.currentTime, o = AC.createOscillator(), gg = AC.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(g || 0.05, t + 0.012);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(gg); gg.connect(AC.destination); o.start(t); o.stop(t + d + 0.03);
  }
  const sfx = {
    grab: () => tone(300, 0.1, 'triangle', 0.04, 120),
    step: () => tone(520, 0.09, 'sine', 0.04, 90),
    hit: () => tone(140, 0.24, 'sawtooth', 0.055, -60),
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.05), i * 120))
  };

  /* ---------------- 关卡 ---------------- */
  const HAND = 380;               // 绳子挂点距角色底部
  const CLIMB = 220;              // 拉绳速度 px/s
  const PIT = 3500;
  const STAGES = [
    { py: 2050, ledge: 2650, start: 2870, hazard: 3160 },
    { py: 1830, ledge: 2430, start: 2650, hazard: 2900 },
    { py: 1610, ledge: 2210, start: 2430, hazard: 2680 }
  ];
  const HAZARD_LEN = 500;

  const sprites = {};
  let ready = false;
  let state = 'playing';
  let mode = 2;
  let stage = 0;
  let time = 0, perf = 0;
  let camY = 2000;
  let shake = 0;
  let clearT = 0;
  let bothHoldT = 0;
  let winT = 0;
  let msg = '', msgT = 0;
  let aiHold = false;
  let anchors = 0;

  const keys = Object.create(null);

  /* ---------------- 图片 ---------------- */
  function loadImg(src) {
    return new Promise(function (res, rej) {
      const im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src;
    });
  }
  function cutout(img) {
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
    const d2 = g.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d2[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const pad = 6;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const tw = maxX - minX + 1, th = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    out.getContext('2d').drawImage(c, minX, minY, tw, th, 0, 0, tw, th);
    return out;
  }

  /* ---------------- 软体 sprite ---------------- */
  function makeSprite(canvas, color, dark, height) {
    const scale = height / canvas.height;
    return {
      canvas, cw: canvas.width, ch: canvas.height,
      w: canvas.width * scale, h: canvas.height * scale,
      x: 0, y: 0, sx: 1, sy: 1, rot: 0,
      color, dark, phase: Math.random() * 6,
      bones: [
        { len: 0.40, ang: 0, av: 0, target: 0 },
        { len: 0.34, ang: 0, av: 0, target: 0 },
        { len: 0.26, ang: 0, av: 0, target: 0 }
      ],
      arms: [{ x: 0, y: 0, init: false }, { x: 0, y: 0, init: false }],
      armTargets: [null, null]
    };
  }
  function offsetAt(s, u) {
    let acc = 0, off = 0;
    for (let i = 0; i < s.bones.length; i++) {
      const b = s.bones[i], k = clamp((u - acc) / b.len, 0, 1);
      off += Math.sin(b.ang) * b.len * k; acc += b.len;
      if (u <= acc) break;
    }
    return off * s.h * s.sy;
  }
  function drawSprite(g, s, t) {
    const N = 96, w = s.w * s.sx, hh = s.h * s.sy;
    const step = hh / N, srcStep = s.ch / N;
    g.save();
    if (s.rot) { g.translate(s.x, s.y); g.rotate(s.rot); g.translate(-s.x, -s.y); }
    for (let i = 0; i < N; i++) {
      const v = (i + 0.5) / N;
      const off = offsetAt(s, v) + Math.sin(t * 2.2 + s.phase + v * 4.6) * 2 * v;
      const width = w * (1 - (1 - v) * 0.03);
      const srcY = Math.max(0, s.ch - (i + 1) * srcStep);
      g.drawImage(s.canvas, 0, srcY, s.cw, Math.min(srcStep * 1.06, s.ch - srcY),
        s.x + off - width / 2, s.y - (i + 1) * step, width, step + 0.6);
    }
    g.restore();
  }
  function drawArm(s, a, i, t) {
    if (!s.armTargets[i]) return;
    const x0 = a.shx, y0 = a.shy, x1 = a.x, y1 = a.y;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    if (len < 20) return;
    const nx = -dy / len, ny = dx / len;
    const sag = 14 + Math.sin(t * 3 + i) * 4 + len * 0.04;
    const cx = (x0 + x1) / 2 + nx * sag, cy = (y0 + y1) / 2 + ny * sag;
    const bw = s.w * s.sx;
    const w0 = Math.max(22, bw * 0.09), w1 = Math.max(11, bw * 0.037);
    ctx.beginPath();
    ctx.moveTo(x0 - w0 / 2, y0);
    ctx.quadraticCurveTo(cx - w1, cy, x1 - w1 * 0.22, y1);
    ctx.quadraticCurveTo(cx + w1, cy, x0 + w0 / 2, y0);
    ctx.closePath();
    const ag = ctx.createLinearGradient(x0, y0, x1, y1);
    ag.addColorStop(0, lighten(s.color, 0.42));
    ag.addColorStop(0.5, lighten(s.color, 0.14));
    ag.addColorStop(1, s.color);
    ctx.fillStyle = ag; ctx.fill();
    ctx.strokeStyle = s.dark; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(x1, y1, w1 * 0.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = s.dark; ctx.lineWidth = 4; ctx.stroke();
  }

  /* ---------------- 玩家 ---------------- */
  const p1 = { x: 250, y: 2900, color: C.green, dark: C.greenD, anchored: false, stun: 0, sway: 0, expr: 0 };
  const p2 = { x: 650, y: 2900, color: C.pink, dark: C.pinkD, anchored: false, stun: 0, sway: 0, expr: 0 };
  let P1, P2;

  function handY(p) { return p.y - HAND; }

  function resetLevel(m) {
    mode = m || mode;
    state = 'playing';
    stage = 0; time = 0; clearT = 0; winT = 0; bothHoldT = 0;
    msg = ''; msgT = 0; anchors = 0;
    p1.y = STAGES[0].start; p2.y = STAGES[0].start;
    p1.anchored = p2.anchored = false;
    p1.stun = p2.stun = 0;
    camY = STAGES[0].py - 90;
    state = 'playing';
    say('按住 F 或 J，往上爬', 2.6);
    document.getElementById('stageNum').textContent = '1';
  }

  function say(t, d) { msg = t; msgT = d || 2.2; }

  function newStage() {
    stage++;
    document.getElementById('stageNum').textContent = String(stage + 1);
    const st = STAGES[stage];
    p1.y = st.start; p2.y = st.start;
    p1.anchored = p2.anchored = false;
    p1.stun = p2.stun = 0;
    anchors = 0;
    say('第 ' + (stage + 1) + ' 层', 1.6);
    sfx.step();
  }

  /* ---------------- 输入 ---------------- */
  window.addEventListener('keydown', function (e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    keys[k] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    audio();
    if (k === 'r') resetLevel(mode);
    if (k === '1') { mode = 1; updateModeBtn(); resetLevel(1); }
    if (k === '2') { mode = 2; updateModeBtn(); resetLevel(2); }
  });
  window.addEventListener('keyup', function (e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    keys[k] = false;
  });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });

  /* ---------------- 更新 ---------------- */
  function aiUpdate() {
    if (p2.anchored) { aiHold = false; return; }
    const st = STAGES[stage];
    if (p2.y <= st.ledge + 4) { aiHold = false; return; }
    // 玩家拉的时候就停，让出控制权
    aiHold = !keys['f'] || p1.anchored;
  }

  function tryAnchor(p) {
    const st = STAGES[stage];
    if (p.anchored || p.y > st.ledge + 2) return false;
    p.anchored = true;
    p.y = st.ledge;
    anchors++;
    p.sy = 0.82; p.sx = 1.12;
    sfx.step();
    burst(p.x, p.y, p.color, 10);
    if (anchors === 1) say('挂住了！换另一个人爬', 2.4);
    return true;
  }

  const particles = [];
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(40, 180);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.3, 0.7), max: 0.7, color, r: rand(2, 6) });
    }
  }

  function update(dt) {
    perf += dt;
    if (msgT > 0) msgT -= dt;
    if (state === 'win') { winT += dt; updateFx(dt); return; }
    if (state !== 'playing') { updateFx(dt); return; }

    time += dt;
    const st = STAGES[stage];

    if (mode === 1) aiUpdate();
    const h1 = !!keys['f'] && p1.stun <= 0 && !p1.anchored;
    const h2 = (mode === 2 ? !!keys['j'] : aiHold) && p2.stun <= 0 && !p2.anchored;

    if (!p1.anchored && !p2.anchored) {
      if (h1 && h2) {
        bothHoldT += dt;
        if (bothHoldT > 0.7) { say('两个人一起拉，绳子不会动', 1.2); bothHoldT = 0; }
      } else {
        bothHoldT = 0;
        const dy = ((h1 ? 1 : 0) - (h2 ? 1 : 0)) * CLIMB * dt;
        p1.y -= dy; p2.y += dy;
      }
      // 绳子长度守恒：两人高度和固定
      const sum = st.start * 2;
      if (Math.abs((p1.y + p2.y) - sum) > 0.01) {
        const avg = (p1.y + p2.y) / 2;
        p1.y += (sum / 2 - avg);
        p2.y += (sum / 2 - avg);
      }
    } else if (p1.anchored && !p2.anchored) {
      if (h2) p2.y -= CLIMB * dt;
    } else if (p2.anchored && !p1.anchored) {
      if (h1) p1.y -= CLIMB * dt;
    }

    // 边界
    [p1, p2].forEach(function (p) {
      if (!p.anchored) p.y = Math.max(p.y, st.ledge);
      if (p.stun > 0) p.stun -= dt;
    });

    // 到达站台自动踩住
    if (!p1.anchored) tryAnchor(p1);
    if (!p2.anchored) tryAnchor(p2);

    // 掉进池子
    if (p1.y > PIT || p2.y > PIT) {
      say('掉下去了，重来这一层', 1.6);
      shake = 18; sfx.hit();
      p1.y = st.start; p2.y = st.start;
      p1.anchored = p2.anchored = false; anchors = 0;
    }

    // 障碍（第一关教学：暂不启用，保证滑轮闭环可完成）
    // hazardHit(dt);

    // 过关
    if (p1.anchored && p2.anchored && clearT <= 0) {
      clearT = 1.4;
      say('这一层过了', 1.2);
      sfx.step();
    }
    if (clearT > 0) {
      clearT -= dt;
      if (clearT <= 0) {
        if (stage < STAGES.length - 1) newStage();
        else { state = 'win'; winT = 0; sfx.win(); }
      }
    }

    updateCamera(dt);
    updateFx(dt);
    updateSprites(dt);
  }

  const hazards = STAGES.map(function (s, i) { return { y: s.hazard, ang: i * 1.3, spd: 1.15 + i * 0.15 }; });

  function hazardHit(dt) {
    const hz = hazards[stage];
    hz.ang += hz.spd * dt;
    const ex = Math.cos(hz.ang) * HAZARD_LEN / 2;
    const ey = Math.sin(hz.ang) * HAZARD_LEN / 2;
    [[p1, 1], [p2, 2]].forEach(function (pair) {
      const p = pair[0];
      if (p.stun > 0) return;
      const cy = p.y - 205;
      if (distToSeg(p.x, cy, 450 - ex, hz.y - ey, 450 + ex, hz.y + ey) < 150) {
        p.stun = 0.85;
        shake = 20; sfx.hit();
        burst(p.x, cy, C.yellow, 16);
        const other = p === p1 ? p2 : p1;
        p.y += 90;
        if (!other.anchored && !p.anchored) other.y -= 90;
        say('小心披萨刀！', 1.2);
      }
    });
  }
  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function updateSprites(dt) {
    [[p1, P1], [p2, P2]].forEach(function (pair) {
      const p = pair[0], s = pair[1];
      if (!s) return;
      const target = p.anchored ? 1 : (p.stun > 0 ? 1.06 : 1 + Math.sin(perf * 3 + s.phase) * 0.015);
      s.sy = lerp(s.sy, target, Math.min(1, dt * 8));
      s.sx = lerp(s.sx, p.anchored ? 1.06 : 1, Math.min(1, dt * 8));
      s.x = p.x;
      s.y = p.y;
      s.rot = lerp(s.rot, p.anchored ? 0 : Math.sin(perf * 1.7 + s.phase) * 0.05, Math.min(1, dt * 5));
      const lean = p.anchored ? 0 : Math.sin(perf * 1.4 + s.phase) * 0.03;
      s.bones[0].target = lean;
      s.bones[1].target = lean * 1.4;
      s.bones[2].target = lean * 1.8;
      s.bones.forEach(function (b) {
        b.av += (-90 * (b.ang - b.target) - 9 * b.av) * dt;
        b.ang += b.av * dt;
      });
      // 手臂
      if (p.anchored) { s.armTargets = [null, null]; }
      else {
        const hy = handY(p);
        const off = offsetAt(s, 0.56);
        s.arms[0].shx = s.x + off - s.w * 0.3;
        s.arms[0].shy = s.y - s.h * 0.56;
        s.arms[1].shx = s.x + off + s.w * 0.3;
        s.arms[1].shy = s.y - s.h * 0.56;
        const tx = p.x, ty = hy + 26;
        [0, 1].forEach(function (i) {
          const a = s.arms[i];
          if (!a.init) { a.x = tx; a.y = ty; a.init = true; }
          a.x += (tx - a.x) * Math.min(1, dt * 10);
          a.y += (ty - a.y) * Math.min(1, dt * 10);
        });
        s.armTargets = [{ x: tx, y: ty }, { x: tx, y: ty }];
      }
    });
  }

  function updateFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += 700 * dt; p.vx *= (1 - 1.5 * dt);
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    shake *= 0.86;
  }

  function updateCamera(dt) {
    const st = STAGES[stage];
    camY = lerp(camY, clamp(st.py - 90, 0, 3700 - H), Math.min(1, dt * 3));
  }

  /* ---------------- 背景 ---------------- */
  const bgCache = document.createElement('canvas');
  bgCache.width = W; bgCache.height = 3700;
  let bgDirty = true;

  function renderBg() {
    const b = bgCache.getContext('2d');
    const g = b.createLinearGradient(0, 0, 0, 3700);
    g.addColorStop(0, '#150732');
    g.addColorStop(0.35, '#2A0D5E');
    g.addColorStop(0.65, '#461E8E');
    g.addColorStop(0.9, '#6A33B0');
    g.addColorStop(1, '#8A5AC8');
    b.fillStyle = g; b.fillRect(0, 0, W, 3700);

    // 大披萨（背景）
    b.save();
    b.translate(450, 2560);
    b.globalAlpha = 0.13;
    b.rotate(-0.12);
    b.fillStyle = '#F2B44E';
    b.beginPath(); b.arc(0, 0, 620, 0, TAU); b.fill();
    b.fillStyle = '#C97C1E';
    b.beginPath(); b.arc(0, 0, 620, 0, TAU); b.lineWidth = 46; b.strokeStyle = '#C97C1E'; b.stroke();
    b.fillStyle = '#D8473C';
    [[-240, -180], [120, -280], [320, 40], [-120, 200], [200, 300], [-360, 120], [40, 120]].forEach(function (p) {
      b.beginPath(); b.arc(p[0], p[1], 56, 0, TAU); b.fill();
    });
    b.restore();

    // 格纹桌布
    b.save();
    b.globalAlpha = 0.06;
    for (let y = 0; y < 3700; y += 120) {
      b.fillStyle = (y / 120) % 2 ? '#C6F24E' : '#FF8FA8';
      b.fillRect(0, y, W, 60);
    }
    b.restore();

    // 侧边导轨
    [70, W - 70].forEach(function (x) {
      const rg = b.createLinearGradient(x - 22, 0, x + 22, 0);
      rg.addColorStop(0, '#2A1256'); rg.addColorStop(0.5, '#4B2A8E'); rg.addColorStop(1, '#2A1256');
      b.fillStyle = rg; b.fillRect(x - 22, 0, 44, 3700);
      b.globalAlpha = 0.5;
      for (let y = 100; y < 3700; y += 210) {
        b.fillStyle = C.lime;
        b.beginPath(); b.arc(x, y, 7, 0, TAU); b.fill();
      }
      b.globalAlpha = 1;
    });

    // 吊灯
    [150, W - 150].forEach(function (lx, i) {
      for (let y = 320; y < 3600; y += 760) {
        const ly = y + (i ? 200 : 0);
        b.strokeStyle = 'rgba(255,255,255,.14)'; b.lineWidth = 2;
        b.beginPath(); b.moveTo(lx, ly - 150); b.lineTo(lx, ly - 26); b.stroke();
        const cg = b.createLinearGradient(lx, ly, lx, ly + 300);
        cg.addColorStop(0, 'rgba(255,226,150,.10)'); cg.addColorStop(1, 'rgba(255,226,150,0)');
        b.fillStyle = cg;
        b.beginPath(); b.moveTo(lx - 18, ly - 18); b.lineTo(lx + 18, ly - 18); b.lineTo(lx + 92, ly + 300); b.lineTo(lx - 92, ly + 300); b.closePath(); b.fill();
        const sg = b.createLinearGradient(lx, ly - 44, lx, ly);
        sg.addColorStop(0, '#5C3BA8'); sg.addColorStop(1, '#2A1156');
        b.fillStyle = sg;
        b.beginPath(); b.ellipse(lx, ly - 20, 30, 19, 0, Math.PI, 0); b.closePath(); b.fill();
        b.shadowColor = '#FFE9A6'; b.shadowBlur = 24;
        const bl = b.createRadialGradient(lx, ly, 1, lx, ly, 13);
        bl.addColorStop(0, '#FFFBE6'); bl.addColorStop(1, '#FFC84A');
        b.fillStyle = bl; b.beginPath(); b.arc(lx, ly, 11, 0, TAU); b.fill();
        b.shadowBlur = 0;
      }
    });

    // 霓虹字
    b.save();
    b.globalAlpha = 0.3;
    b.textAlign = 'center';
    b.font = '900 76px "PingFang SC","Noto Sans SC",sans-serif';
    b.shadowColor = C.lime; b.shadowBlur = 28;
    b.fillStyle = 'rgba(198,242,78,.35)';
    b.fillText('披萨拼盘', 450, 1560);
    b.restore();

    // 底部汤池
    const pg = b.createLinearGradient(0, 3520, 0, 3700);
    pg.addColorStop(0, 'rgba(198,242,78,.85)');
    pg.addColorStop(1, 'rgba(90,140,30,.95)');
    b.fillStyle = pg; b.fillRect(0, 3520, W, 180);
  }
  bgDirty = true;

  const motes = [];
  for (let i = 0; i < 54; i++) motes.push({ x: rand(0, W), y: rand(0, 3700), r: rand(1, 2.6), s: rand(6, 20), a: rand(.08, .3), ph: rand(0, 6) });

  function drawBG(t) {
    if (bgDirty) { renderBg(); bgDirty = false; }
    ctx.drawImage(bgCache, 0, 0);
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const y = m.y - t * m.s;
      if (y < camY - 40 || y > camY + H + 40) continue;
      ctx.globalAlpha = m.a;
      ctx.fillStyle = '#FFF7D0';
      ctx.beginPath(); ctx.arc(m.x + Math.sin(t * 0.5 + m.ph) * 12, y, m.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 场景元素 ---------------- */
  function drawWheel(st, active, t) {
    const x = 450, y = st.py;
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.22;
    // 支架
    ctx.strokeStyle = '#2A1156'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(x, y - 170); ctx.lineTo(x, y - 240); ctx.stroke();
    ctx.fillStyle = '#3A1478';
    rr(ctx, x - 70, y - 250, 140, 18, 9); ctx.fill();
    // 轮
    const g = ctx.createRadialGradient(x - 34, y - 34, 8, x, y, 170);
    g.addColorStop(0, '#7B5AD0'); g.addColorStop(0.7, '#3A1478'); g.addColorStop(1, '#241056');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 170, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.lime; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, 162, 0, TAU); ctx.stroke();
    // 辐条
    ctx.strokeStyle = 'rgba(198,242,78,.55)'; ctx.lineWidth = 5;
    for (let i = 0; i < 6; i++) {
      const a = t * 0.5 + i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 146, y + Math.sin(a) * 146); ctx.stroke();
    }
    // 轮毂
    ctx.fillStyle = C.lime;
    ctx.beginPath(); ctx.arc(x, y, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2A1156';
    ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawRopeStrand(x, y0, y1, t, taut) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#E8D9B0';
    ctx.lineWidth = 9;
    ctx.shadowColor = 'rgba(255,240,190,.35)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    if (Math.abs(y1 - y0) < 2) { ctx.moveTo(x, y0); ctx.lineTo(x, y1 + 2); }
    else {
      for (let i = 0; i <= 14; i++) {
        const u = i / 14;
        const yy = y0 + (y1 - y0) * u;
        const wob = Math.sin(t * 4 + u * 6) * (taut ? 0.8 : 4) * Math.sin(u * Math.PI);
        i ? ctx.lineTo(x + wob, yy) : ctx.moveTo(x + wob, yy);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // 绳结
    ctx.fillStyle = '#E8D9B0';
    ctx.beginPath(); ctx.arc(x, y1, 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8A6A3A'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }

  function drawLedge(x, y, side, t) {
    ctx.save();
    const w = 300, h = 34;
    const x0 = side < 0 ? x - w + 30 : x - 30;
    // 披萨形状的站台
    ctx.fillStyle = C.crust;
    rr(ctx, x0, y, w, h, 16); ctx.fill();
    ctx.fillStyle = C.cheese;
    rr(ctx, x0 + 6, y + 4, w - 12, h - 12, 12); ctx.fill();
    ctx.fillStyle = '#D8473C';
    for (let i = 0; i < 3; i++) ctx.beginPath(), ctx.arc(x0 + 40 + i * 66, y + 12, 6, 0, TAU), ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    rr(ctx, x0 + 6, y + 4, w - 12, 8, 6); ctx.stroke();
    ctx.restore();
  }

  function drawClamp(x, y, on, t) {
    ctx.save();
    ctx.globalAlpha = on ? 1 : 0.4;
    ctx.strokeStyle = on ? C.lime : 'rgba(198,242,78,.5)';
    ctx.lineWidth = 5;
    ctx.shadowColor = C.lime; ctx.shadowBlur = on ? 22 : 8;
    ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = on ? C.lime : 'rgba(198,242,78,.3)';
    rr(ctx, x - 22, y - 6, 44, 12, 6); ctx.fill();
    const dx = x < 450 ? -1 : 1;
    ctx.strokeStyle = 'rgba(58,20,120,.9)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x + dx * 26, y); ctx.lineTo(x + dx * 74, y); ctx.stroke();
    if (on) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 5) * 0.3;
      ctx.strokeStyle = C.lime; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 36, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawGrip(p, t) {
    if (p.anchored) return;
    const hy = handY(p);
    ctx.save();
    ctx.fillStyle = '#E8D9B0';
    ctx.beginPath(); ctx.arc(p.x, hy + 26, 15, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8A6A3A'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, hy + 40, 9, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* ---------------- 渲染 ---------------- */
  function render(t) {
    ctx.clearRect(0, 0, W, H);
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;

    ctx.save();
    ctx.translate(shakeX, shakeY - camY);

    drawBG(t);

    // 只画当前层的轮子，避免层间距近时互相重叠
    const st = STAGES[stage];
    // 上层绳索
    const h1 = handY(p1), h2 = handY(p2);
    drawRopeStrand(250, st.py, p1.anchored ? st.ledge - HAND : h1, t, !p1.anchored);
    drawRopeStrand(650, st.py, p2.anchored ? st.ledge - HAND : h2, t, !p2.anchored);
    drawWheel(st, true, t);

    if (P1 && P2) {
      drawSprite(ctx, P2, t);
      drawSprite(ctx, P1, t);
      drawArm(P1, P1.arms[0], 0, t);
      drawArm(P1, P1.arms[1], 1, t);
      drawArm(P2, P2.arms[0], 0, t);
      drawArm(P2, P2.arms[1], 1, t);
      drawGrip(p1, t);
      drawGrip(p2, t);
      drawClamp(250, st.ledge - HAND, p1.anchored, t);
      drawClamp(650, st.ledge - HAND, p2.anchored, t);
    }

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 暗角
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.45, H * 0.24, W * 0.5, H * 0.5, H * 0.82);
    vg.addColorStop(0, 'rgba(8,2,18,0)');
    vg.addColorStop(1, 'rgba(8,2,18,.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    drawHUD();
    if (state === 'win') drawWin();
  }

  function drawHUD() {
    // 提示
    if (msgT > 0 && msg) {
      ctx.save();
      const a = clamp(msgT / 0.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '700 25px "PingFang SC",system-ui,sans-serif';
      const tw = ctx.measureText(msg).width;
      ctx.fillStyle = 'rgba(12,4,30,.62)';
      rr(ctx, W / 2 - tw / 2 - 22, 150, tw + 44, 52, 26); ctx.fill();
      ctx.fillStyle = '#F2FFD0';
      ctx.fillText(msg, W / 2, 185);
      ctx.restore();
    }

    // 底部操作条
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 15px "PingFang SC",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillText('F 左边拉　·　J 右边拉　·　同拉会卡住　·　R 重来', W / 2, H - 42);
    ctx.restore();

    // 进度
    ctx.save();
    const bx = W - 46, by = 150, bh = 300;
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    rr(ctx, bx - 6, by, 12, bh, 6); ctx.fill();
    const prog = clamp((STAGES[0].start - Math.min(p1.y, p2.y)) / (STAGES[0].start - STAGES[2].ledge), 0, 1);
    ctx.fillStyle = C.lime;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 12;
    rr(ctx, bx - 6, by + bh * (1 - prog), 12, bh * prog, 6); ctx.fill();
    ctx.restore();
  }

  function drawWin() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,2,26,.66)';
    ctx.fillRect(0, 0, W, H);
    const cw = 330, chh = 330, cx = W / 2 - cw / 2, cy = 300;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
    const g = ctx.createLinearGradient(0, cy, 0, cy + chh);
    g.addColorStop(0, '#F7FFDA'); g.addColorStop(1, '#D9F58A');
    ctx.fillStyle = g;
    rr(ctx, cx, cy, cw, chh, 18); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#2A1A6E'; ctx.lineWidth = 3;
    rr(ctx, cx, cy, cw, chh, 18); ctx.stroke();
    ctx.fillStyle = C.purple;
    rr(ctx, cx, cy, cw, 36, 18); ctx.fill(); ctx.fillRect(cx, cy + 18, cw, 18);
    ctx.fillStyle = '#FFF'; ctx.textAlign = 'center';
    ctx.font = '800 15px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('LIMELAND · 第一关', cx + cw / 2, cy + 24);
    ctx.fillStyle = '#2A1A6E';
    ctx.font = '900 30px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('披萨拼盘', cx + cw / 2, cy + 120);
    ctx.font = '700 20px "PingFang SC",system-ui,sans-serif';
    ctx.fillStyle = '#4B3FE3';
    ctx.fillText('通 关', cx + cw / 2, cy + 170);
    ctx.font = '600 15px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('用时 ' + time.toFixed(1) + ' 秒', cx + cw / 2, cy + 224);
    ctx.fillText('三层滑轮 · 全部踩住', cx + cw / 2, cy + 250);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = C.lime;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 22;
    ctx.font = '900 44px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('两个人都上来了', W / 2, 740);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.font = '600 18px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('按 R 再来一局', W / 2, 800);
    ctx.restore();
  }

  /* ---------------- 循环 ---------------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render(perf);
    requestAnimationFrame(loop);
  }

  /* ---------------- UI ---------------- */
  function updateModeBtn() {
    document.getElementById('btn2').classList.toggle('on', mode === 2);
    document.getElementById('btn1').classList.toggle('on', mode === 1);
  }
  document.getElementById('btn2').addEventListener('click', function () { mode = 2; updateModeBtn(); resetLevel(2); });
  document.getElementById('btn1').addEventListener('click', function () { mode = 1; updateModeBtn(); resetLevel(1); });
  document.getElementById('btnRestart').addEventListener('click', function () { resetLevel(mode); });

  /* ---------------- 启动 ---------------- */
  fit();
  Promise.all([loadImg('assets/green.png'), loadImg('assets/pink.png')]).then(function (imgs) {
    const gc = cutout(imgs[0]);
    const pc = cutout(imgs[1]);
    P1 = makeSprite(gc, C.green, C.greenD, 410);
    P2 = makeSprite(pc, C.pink, C.pinkD, 410);
    P1.x = p1.x; P1.y = p1.y;
    P2.x = p2.x; P2.y = p2.y;
    ready = true;
    resetLevel(2);
  }).catch(function (e) {
    console.error(e);
    ctx.fillStyle = '#FF8FA8'; ctx.textAlign = 'center';
    ctx.font = '600 20px "PingFang SC",sans-serif';
    ctx.fillText('角色图加载失败', W / 2, H / 2);
  });

  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });
})();
