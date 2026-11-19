/* ============================================================
   拉丝 · 视觉重构样片（纯 Canvas 2D）
   共享边界网格形变：相邻条带共用边界点，消除撕裂
   ============================================================ */
(function () {
  'use strict';

  const W = 900, H = 1200;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const hexA = (hex, a) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  };
  const lighten = (hex, a) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgb(' + Math.round(r + (255 - r) * a) + ',' + Math.round(g + (255 - g) * a) + ',' + Math.round(b + (255 - b) * a) + ')';
  };

  const C = {
    lime: '#C6F24E',
    green: '#ABE14D', greenD: '#5F9420',
    pink: '#FF9AD6', pinkD: '#C95E9E',
    blue: '#8ED6FF', yellow: '#FFD45C',
    ink: '#12042A'
  };

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

  /* ---------------- 图片处理 ---------------- */
  function loadImg(src) {
    return new Promise(function (res, rej) {
      const im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = src;
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
    function isBg(i) { return d[i * 4] > 232 && d[i * 4 + 1] > 232 && d[i * 4 + 2] > 232; }
    function push(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (seen[i]) return;
      seen[i] = 1;
      if (!isBg(i)) return;
      stack.push(i);
    }
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const i = stack.pop();
      d[i * 4 + 3] = 0;
      const x = i % w, y = (i / w) | 0;
      push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    // 边缘颜色外扩，避免缩放时出现白边
    for (let pass = 0; pass < 3; pass++) {
      const src = new Uint8ClampedArray(d);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          if (src[i + 3] !== 0) continue;
          const nb = [((y - 1) * w + x) * 4, ((y + 1) * w + x) * 4, (y * w + x - 1) * 4, (y * w + x + 1) * 4];
          for (let k = 0; k < 4; k++) {
            if (src[nb[k] + 3] > 40) {
              d[i] = src[nb[k]]; d[i + 1] = src[nb[k] + 1]; d[i + 2] = src[nb[k] + 2];
              break;
            }
          }
        }
      }
    }
    g.putImageData(id, 0, 0);

    let minX = w, minY = h, maxX = 0, maxY = 0;
    const d2 = g.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d2[(y * w + x) * 4 + 3] > 12) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
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

  /* ---------------- 角色 ---------------- */
  function makeSprite(canvas, color, dark, height, x, y) {
    const scale = height / canvas.height;
    return {
      canvas: canvas,
      cw: canvas.width, ch: canvas.height,
      w: canvas.width * scale, h: canvas.height * scale,
      x: x, y: y,
      sx: 1, sy: 1, rot: 0,
      color: color, dark: dark,
      phase: Math.random() * 6,
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
      const b = s.bones[i];
      const k = clamp((u - acc) / b.len, 0, 1);
      off += Math.sin(b.ang) * b.len * k;
      acc += b.len;
      if (u <= acc) break;
    }
    return off * s.h * s.sy;
  }

  /* 行剪切：不再让每条带单独旋转，改成整张刚性旋转 + 逐行水平错位。
     行与行上下相邻、只做平移，因此在几何上不可能出现缝隙。 */
  function drawSprite(g, s, t) {
    const N = 112;
    const w = s.w * s.sx;
    const hh = s.h * s.sy;
    const step = hh / N;
    const srcStep = s.ch / N;

    g.save();
    if (s.rot) {
      g.translate(s.x, s.y);
      g.rotate(s.rot);
      g.translate(-s.x, -s.y);
    }

    for (let i = 0; i < N; i++) {
      const v = (i + 0.5) / N;
      const off = offsetAt(s, v) + Math.sin(t * 2.2 + s.phase + v * 4.6) * 2.2 * v;
      const width = w * (1 - (1 - v) * 0.03);
      const srcY = Math.max(0, s.ch - (i + 1) * srcStep);
      const srcH = Math.min(srcStep * 1.06, s.ch - srcY);
      const dy = s.y - (i + 1) * step;
      g.drawImage(s.canvas,
        0, srcY, s.cw, srcH,
        s.x + off - width / 2, dy, width, step + 0.6);
    }
    g.restore();
  }

  /* ---------------- 场景状态 ---------------- */
  const FLOOR = 1010;
  const HOOK = { x: 716, y: 344 };
  const sprites = {};
  let ready = false;
  let mode = 'idle';
  let auto = true, autoT = 0;
  let softness = 0.55;
  let showBones = false;
  let perf = 0;

  function applyTargets(dt, t) {
    const g = sprites.green, p = sprites.pink;
    let gx = 292, gy = FLOOR, gsx = 1, gsy = 1, grot = 0;
    let px = 686, py = FLOOR, psx = 1, psy = 1, prot = 0;
    let gLean = 0, pLean = 0;
    let gArmR = null, gArmL = null, pArmR = null;

    if (mode === 'idle') {
      gsy = 1 + Math.sin(t * 1.6) * 0.012;
      psy = 1 + Math.sin(t * 1.6 + 1.2) * 0.012;
      gLean = Math.sin(t * 1.1) * 0.02;
      pLean = Math.sin(t * 1.0 + 1) * 0.024;
    } else if (mode === 'grab') {
      gx = 390; gy = 806; gsy = 1.13; gsx = 0.94; gLean = 0.15;
      gArmR = { x: HOOK.x, y: HOOK.y + 8 };
      pLean = 0.04;
    } else if (mode === 'pull') {
      gx = 350; gy = 830; gsy = 1.07; gsx = 0.95; gLean = -0.13;
      px = 600; py = 724; psy = 1.09; psx = 0.94; pLean = 0.12;
      pArmR = { x: 660, y: 560 };
    } else if (mode === 'fling') {
      gx = 292; gy = 868; gsy = 1.02; gsx = 1.02; gLean = 0.22;
      px = 680; py = 536; psy = 1.06; psx = 0.94; prot = 0.34; pLean = 0.36;
    } else if (mode === 'land') {
      gx = 292; gy = FLOOR; gsy = 0.79; gsx = 1.21;
      px = 686; py = FLOOR; psy = 0.81; psx = 1.19;
    } else if (mode === 'dizzy') {
      gLean = Math.sin(t * 8.5) * 0.14;
      pLean = Math.sin(t * 8.5 + 1.4) * 0.15;
      gy = FLOOR - 3 + Math.sin(t * 10) * 4;
      py = FLOOR - 3 + Math.cos(t * 10) * 4;
    }

    const sp = Math.min(1, dt * 7);
    g.x = lerp(g.x, gx, sp); g.y = lerp(g.y, gy, sp);
    p.x = lerp(p.x, px, sp); p.y = lerp(p.y, py, sp);
    g.sx = lerp(g.sx, gsx, Math.min(1, dt * 9));
    g.sy = lerp(g.sy, gsy, Math.min(1, dt * 9));
    p.sx = lerp(p.sx, psx, Math.min(1, dt * 9));
    p.sy = lerp(p.sy, psy, Math.min(1, dt * 9));
    g.rot = lerp(g.rot, grot, Math.min(1, dt * 6));
    p.rot = lerp(p.rot, prot, Math.min(1, dt * 6));

    g.bones[0].target = gLean * 0.42 + Math.sin(t * 1.3) * 0.01;
    g.bones[1].target = gLean * 0.74 + Math.sin(t * 1.3 + 0.6) * 0.014;
    g.bones[2].target = gLean * 1.0 + Math.sin(t * 1.3 + 1.2) * 0.018;
    p.bones[0].target = pLean * 0.48;
    p.bones[1].target = pLean * 0.78;
    p.bones[2].target = pLean * 1.04;

    if (mode === 'dizzy') {
      g.bones[1].target += Math.sin(t * 12) * 0.10;
      g.bones[2].target += Math.sin(t * 14) * 0.16;
      p.bones[1].target += Math.cos(t * 11) * 0.11;
      p.bones[2].target += Math.cos(t * 13) * 0.17;
    }

    g.armTargets[1] = gArmR;
    g.armTargets[0] = gArmL;
    p.armTargets[1] = pArmR;
    p.armTargets[0] = null;
  }

  function stepBones(s, dt) {
    const k = lerp(260, 60, softness);
    const c = lerp(17, 7.5, softness);
    for (let i = 0; i < s.bones.length; i++) {
      const b = s.bones[i];
      b.av += (-k * (1 - i * 0.10) * (b.ang - b.target) - c * b.av) * dt;
      b.ang += b.av * dt;
      b.ang = clamp(b.ang, -0.7, 0.7);
    }
  }

  function updateArms(s, dt, t) {
    const w = s.w * s.sx, h = s.h * s.sy;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const off = offsetAt(s, 0.56);
      const shx = s.x + off + side * w * 0.33;
      const shy = s.y - h * 0.56;
      let tx, ty;
      if (s.armTargets[i]) { tx = s.armTargets[i].x; ty = s.armTargets[i].y; }
      else {
        // 待机时收在身体里，只在抓/拉的时候伸出来
        tx = shx + side * w * 0.06;
        ty = shy + h * 0.02;
      }
      const a = s.arms[i];
      if (!a.init) { a.x = tx; a.y = ty; a.init = true; }
      const k = s.armTargets[i] ? 0.24 : 0.10;
      a.x += (tx - a.x) * Math.min(1, dt * 60 * k);
      a.y += (ty - a.y) * Math.min(1, dt * 60 * k);
      a.shx = shx; a.shy = shy;
    }
  }

  /* ---------------- 背景 ---------------- */
  const bgCache = document.createElement('canvas');
  bgCache.width = W; bgCache.height = H;
  let bgCacheDirty = true;

  function renderBgCache() {
    const b = bgCache.getContext('2d');
    b.clearRect(0, 0, W, H);

    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120528');
    g.addColorStop(0.30, '#22094A');
    g.addColorStop(0.58, '#3A1278');
    g.addColorStop(0.80, '#5B2AA0');
    g.addColorStop(1, '#7A4BC0');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);

    // 远景霓虹
    b.save();
    b.globalAlpha = 0.42;
    b.filter = 'blur(6px)';
    b.textAlign = 'center';
    b.font = '900 74px "PingFang SC","Noto Sans SC",sans-serif';
    b.fillStyle = 'rgba(198,242,78,.18)';
    b.fillText('LIMELAND', W / 2, 300);
    b.strokeStyle = 'rgba(198,242,78,.55)';
    b.lineWidth = 2;
    b.strokeText('LIMELAND', W / 2, 300);
    b.restore();

    const rg = b.createRadialGradient(W / 2, 430, 40, W / 2, 430, 620);
    rg.addColorStop(0, 'rgba(150,100,255,.20)');
    rg.addColorStop(0.5, 'rgba(90,50,190,.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = rg;
    b.fillRect(0, 0, W, H);

    // 两侧货架
    b.save();
    b.filter = 'blur(3px)';
    b.globalAlpha = 0.52;
    for (let side = 0; side < 2; side++) {
      const bx = side ? W - 18 : 18;
      const dir = side ? -1 : 1;
      for (let row = 0; row < 7; row++) {
        const y = 360 + row * 96;
        b.fillStyle = 'rgba(58,26,110,.9)';
        b.fillRect(bx, y, dir * 64, 10);
        for (let k = 0; k < 3; k++) {
          const jx = bx + dir * (6 + k * 20);
          b.fillStyle = 'rgba(255,255,255,.06)';
          b.fillRect(jx, y - 26, 14, 26);
          const cols = [C.green, C.pink, C.blue, C.yellow];
          b.fillStyle = hexA(cols[(row + k) % 4], 0.5);
          b.fillRect(jx + 3, y - 18, 8, 14);
        }
      }
    }
    b.restore();

    // 吊灯
    for (let i = 0; i < 2; i++) {
      const lx = i ? W - 150 : 150;
      const ly = 90;
      b.save();
      b.strokeStyle = 'rgba(255,255,255,.16)';
      b.lineWidth = 2;
      b.beginPath(); b.moveTo(lx, 0); b.lineTo(lx, ly - 30); b.stroke();
      const cg = b.createLinearGradient(lx, ly, lx, 700);
      cg.addColorStop(0, 'rgba(255,240,180,.10)');
      cg.addColorStop(1, 'rgba(255,240,180,0)');
      b.fillStyle = cg;
      b.beginPath();
      b.moveTo(lx - 18, ly - 20); b.lineTo(lx + 18, ly - 20);
      b.lineTo(lx + 150, 760); b.lineTo(lx - 150, 760);
      b.closePath(); b.fill();
      const sg = b.createLinearGradient(lx, ly - 50, lx, ly);
      sg.addColorStop(0, '#5C3BA8'); sg.addColorStop(1, '#2A1156');
      b.fillStyle = sg;
      b.beginPath(); b.ellipse(lx, ly - 22, 34, 22, 0, Math.PI, 0); b.closePath(); b.fill();
      b.shadowColor = '#FFE9A6'; b.shadowBlur = 26;
      const bl = b.createRadialGradient(lx, ly, 1, lx, ly, 15);
      bl.addColorStop(0, '#FFFBE6'); bl.addColorStop(1, '#FFC84A');
      b.fillStyle = bl;
      b.beginPath(); b.arc(lx, ly, 13, 0, TAU); b.fill();
      b.restore();
    }

    // 地面
    const fy = FLOOR + 2;
    const fg2 = b.createLinearGradient(0, fy, 0, H);
    fg2.addColorStop(0, 'rgba(210,250,110,.92)');
    fg2.addColorStop(0.06, 'rgba(160,215,70,.55)');
    fg2.addColorStop(0.20, 'rgba(78,46,140,.42)');
    fg2.addColorStop(0.55, 'rgba(44,20,86,.72)');
    fg2.addColorStop(1, 'rgba(16,5,36,.96)');
    b.fillStyle = fg2;
    b.fillRect(0, fy, W, H - fy);
    const sheen = b.createLinearGradient(0, fy, 0, fy + 90);
    sheen.addColorStop(0, 'rgba(255,255,255,.28)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = sheen;
    b.fillRect(0, fy, W, 90);

    b.save();
    b.globalAlpha = 0.10;
    b.filter = 'blur(8px)';
    b.fillStyle = C.lime;
    b.fillRect(0, fy + 6, W, 60);
    b.restore();

    // 顶部光束
    b.save();
    b.globalCompositeOperation = 'screen';
    const ls = b.createLinearGradient(120, 0, 520, 900);
    ls.addColorStop(0, 'rgba(198,242,78,.10)');
    ls.addColorStop(1, 'rgba(198,242,78,0)');
    b.fillStyle = ls;
    b.beginPath();
    b.moveTo(80, 0); b.lineTo(250, 0); b.lineTo(620, 900); b.lineTo(320, 900);
    b.closePath(); b.fill();
    b.restore();
  }

  const motes = [];
  for (let i = 0; i < 46; i++) {
    motes.push({
      x: Math.random() * W, y: Math.random() * H,
      r: 1 + Math.random() * 2.4, s: 6 + Math.random() * 18,
      a: 0.10 + Math.random() * 0.35, ph: Math.random() * 6
    });
  }

  function drawBG(t) {
    if (bgCacheDirty) { renderBgCache(); bgCacheDirty = false; }
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bgCache, 0, 0);

    const g = sprites.green, p = sprites.pink;
    if (g && p) {
      [g, p].forEach(function (s) {
        const near = clamp(1 - Math.abs(s.y - FLOOR) / 420, 0, 1);
        ctx.save();
        ctx.globalAlpha = 0.34 * near + 0.05;
        ctx.fillStyle = '#05010F';
        ctx.beginPath();
        ctx.ellipse(s.x, FLOOR + 10, s.w * 0.42 * s.sx, 15 + 4 * near, 0, 0, TAU);
        ctx.fill();
        const gg = ctx.createRadialGradient(s.x, FLOOR, 6, s.x, FLOOR, s.w * 0.7);
        gg.addColorStop(0, hexA(s.color, 0.15 * near + 0.04));
        gg.addColorStop(1, hexA(s.color, 0));
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.ellipse(s.x, FLOOR, s.w * 0.7, 62, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      });
    }

    // 浮尘
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const y = ((m.y - t * m.s) % (H + 60) + H + 60) % (H + 60) - 30;
      const x = m.x + Math.sin(t * 0.5 + m.ph) * 14;
      ctx.globalAlpha = m.a;
      ctx.fillStyle = '#FFF7D0';
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- 前景 ---------------- */
  const sparks = [];

  function drawArm(s, a, i, t) {
    if (!s.armTargets[i]) return;
    const x0 = a.shx, y0 = a.shy, x1 = a.x, y1 = a.y;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    if (len < s.w * 0.13) return;
    const nx = -dy / len, ny = dx / len;
    const sag = 16 + Math.sin(t * 3 + i * 2) * 5 + len * 0.05;
    const cx = (x0 + x1) / 2 + nx * sag;
    const cy = (y0 + y1) / 2 + ny * sag;
    const bodyW = s.w * s.sx;
    const w0 = Math.max(22, bodyW * 0.09);
    const w1 = Math.max(11, bodyW * 0.037);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = w0 * 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(x0 - w0 / 2, y0);
    ctx.quadraticCurveTo(cx - w1, cy, x1 - w1 * 0.22, y1);
    ctx.quadraticCurveTo(cx + w1, cy, x0 + w0 / 2, y0);
    ctx.closePath();
    const ag = ctx.createLinearGradient(x0, y0, x1, y1);
    ag.addColorStop(0, lighten(s.color, 0.42));
    ag.addColorStop(0.45, lighten(s.color, 0.16));
    ag.addColorStop(1, s.color);
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.strokeStyle = s.dark;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(x0 - w0 * 0.16, y0);
    ctx.quadraticCurveTo(cx - w1 * 0.45, cy, x1 - w1 * 0.16, y1);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(x1, y1, w1 * 0.92, 0, TAU); ctx.fill();
    ctx.strokeStyle = s.dark; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(x1 - w1 * 0.25, y1 - w1 * 0.25, w1 * 0.28, 0, TAU); ctx.fill();
  }

  function drawBones(s) {
    let x = s.x, y = s.y, ang = 0;
    const h = s.h * s.sy;
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < s.bones.length; i++) {
      const b = s.bones[i];
      ang += b.ang;
      const nx = x + Math.sin(ang) * b.len * h;
      const ny = y - Math.cos(ang) * b.len * h;
      ctx.strokeStyle = 'rgba(198,242,78,.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.lime;
      ctx.beginPath(); ctx.arc(nx, ny, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(nx, ny, 1.8, 0, TAU); ctx.fill();
      x = nx; y = ny;
    }
    ctx.restore();
  }

  function drawHook(t) {
    const x = HOOK.x, y = HOOK.y + Math.sin(t * 1.8) * 3;
    const gl2 = ctx.createRadialGradient(x, y, 4, x, y, 96);
    gl2.addColorStop(0, 'rgba(198,242,78,.22)');
    gl2.addColorStop(1, 'rgba(198,242,78,0)');
    ctx.fillStyle = gl2;
    ctx.beginPath(); ctx.arc(x, y, 96, 0, TAU); ctx.fill();

    const dome = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, 44);
    dome.addColorStop(0, 'rgba(255,255,255,.30)');
    dome.addColorStop(0.6, 'rgba(198,242,78,.10)');
    dome.addColorStop(1, 'rgba(198,242,78,.02)');
    ctx.fillStyle = dome;
    ctx.beginPath(); ctx.arc(x, y, 42, Math.PI, 0); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = C.lime; ctx.lineWidth = 4.5;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(x, y, 42, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 42, y); ctx.lineTo(x + 42, y); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 32, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
    ctx.fillStyle = 'rgba(42,17,86,.9)';
    ctx.fillRect(x - 24, y, 48, 8);
  }

  function drawRope(a, b, t, taut) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const sag = taut ? 8 : 52;
    const n = 20, pts = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = a.x + dx * u + (-dy / d) * Math.sin(t * 5 + u * 8) * (taut ? 2 : 6) * Math.sin(u * Math.PI);
      const y = a.y + dy * u + Math.sin(u * Math.PI) * sag + (dx / d) * Math.sin(t * 5 + u * 8) * (taut ? 2 : 6) * Math.sin(u * Math.PI);
      pts.push([x, y]);
    }
    function path() {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
    }
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    gr.addColorStop(0, C.green); gr.addColorStop(0.5, '#E9FFA8'); gr.addColorStop(1, C.pink);
    ctx.shadowColor = 'rgba(198,242,78,.55)';
    ctx.shadowBlur = taut ? 24 : 12;
    ctx.strokeStyle = gr;
    ctx.lineWidth = taut ? 10 : 13;
    path(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2.6;
    path(); ctx.stroke();
    ctx.restore();
  }

  function ropePoints(s, dir) {
    const w = s.w * s.sx, h = s.h * s.sy;
    return { x: s.x + offsetAt(s, 0.58) + dir * w * 0.30, y: s.y - h * 0.58 };
  }

  function drawReflections(t) {
    ['green', 'pink'].forEach(function (k) {
      const s = sprites[k];
      if (!s) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, FLOOR + 4, W, 130);
      ctx.clip();
      ctx.globalAlpha = 0.13;
      ctx.translate(0, FLOOR * 2);
      ctx.scale(1, -1);
      drawSprite(ctx, s, t);
      ctx.restore();
    });
    // 反射衰减
    const fade = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 120);
    fade.addColorStop(0, 'rgba(30,10,60,0)');
    fade.addColorStop(1, 'rgba(30,10,60,.72)');
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = fade;
    ctx.fillRect(0, FLOOR, W, 120);
    ctx.restore();
  }

  function render(t) {
    drawBG(t);

    if (ready) {
      drawReflections(t);
      drawHook(t);
      const ga = ropePoints(sprites.green, 1);
      const pa = ropePoints(sprites.pink, -1);
      drawRope(ga, pa, t, mode === 'pull');

      drawSprite(ctx, sprites.pink, t);
      drawSprite(ctx, sprites.green, t);

      drawArm(sprites.pink, sprites.pink.arms[0], 0, t);
      drawArm(sprites.pink, sprites.pink.arms[1], 1, t);
      drawArm(sprites.green, sprites.green.arms[0], 0, t);
      drawArm(sprites.green, sprites.green.arms[1], 1, t);

      if (showBones) { drawBones(sprites.green); drawBones(sprites.pink); }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= 1 / 60;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy += 800 / 60;
      s.x += s.vx / 60; s.y += s.vy / 60;
      ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const vg = ctx.createRadialGradient(W * 0.5, H * 0.42, H * 0.22, W * 0.5, H * 0.5, H * 0.82);
    vg.addColorStop(0, 'rgba(8,2,18,0)');
    vg.addColorStop(1, 'rgba(8,2,18,.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function spawnSparks(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 120 + Math.random() * 260;
      sparks.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        r: 2 + Math.random() * 4, life: 0.5 + Math.random() * 0.5,
        max: 1, color: color
      });
    }
  }

  /* ---------------- 循环 / UI ---------------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    perf += dt;

    if (auto) {
      autoT += dt;
      if (autoT > 2.8) {
        autoT = 0;
        const list = ['idle', 'grab', 'pull', 'fling', 'land', 'dizzy'];
        setMode(list[(list.indexOf(mode) + 1) % list.length]);
      }
    }

    if (ready) {
      applyTargets(dt, perf);
      stepBones(sprites.green, dt);
      stepBones(sprites.pink, dt);
      updateArms(sprites.green, dt, perf);
      updateArms(sprites.pink, dt, perf);

      if (mode === 'land' && Math.random() < 0.06) {
        spawnSparks(sprites.green.x, FLOOR, C.green, 2);
        spawnSparks(sprites.pink.x, FLOOR, C.pink, 2);
      }
    }

    render(perf);
    requestAnimationFrame(loop);
  }

  const modeNames = { idle: '待机', grab: '抓钩', pull: '拉人', fling: '甩出', land: '落地', dizzy: '撞晕' };
  function setMode(m) {
    mode = m;
    document.getElementById('modeTag').textContent = modeNames[m] || m;
    document.querySelectorAll('button[data-m]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-m') === m);
    });
    if (ready && (m === 'land' || m === 'fling')) {
      spawnSparks(sprites.green.x, sprites.green.y - sprites.green.h * 0.3, C.green, 10);
    }
  }
  document.querySelectorAll('button[data-m]').forEach(function (b) {
    b.addEventListener('click', function () {
      auto = false;
      document.getElementById('auto').checked = false;
      setMode(b.getAttribute('data-m'));
    });
  });
  document.getElementById('auto').addEventListener('change', function (e) { auto = e.target.checked; autoT = 0; });
  document.getElementById('showBones').addEventListener('change', function (e) { showBones = e.target.checked; });
  document.getElementById('soft').addEventListener('input', function (e) { softness = e.target.value / 100; });

  fit();
  Promise.all([loadImg('assets/green.png'), loadImg('assets/pink.png')]).then(function (imgs) {
    const gc = cutout(imgs[0]);
    const pc = cutout(imgs[1]);
    sprites.green = makeSprite(gc, C.green, C.greenD, 560, 292, FLOOR);
    sprites.pink = makeSprite(pc, C.pink, C.pinkD, 420, 686, FLOOR);
    ready = true;
  }).catch(function (e) {
    console.error(e);
    ctx.fillStyle = '#FF8FA8';
    ctx.textAlign = 'center';
    ctx.font = '600 20px "PingFang SC",sans-serif';
    ctx.fillText('角色图加载失败', W / 2, H / 2);
  });

  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });
})();
