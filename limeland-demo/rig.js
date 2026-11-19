/* ============================================================
   骨骼动画样例 · LIMELAND
   用现有角色画稿做软体骨骼：3 段骨骼链 + 条带形变 + 触手
   ============================================================ */
(function () {
  'use strict';

  const cvs = document.getElementById('rig');
  const ctx = cvs.getContext('2d');
  const W = 800, H = 980;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;

  const C = {
    lime: '#C6F24E',
    green: '#ABE14D', greenD: '#5F9420',
    pink: '#FF9AD6', pinkD: '#C95E9E',
    purple: '#3A1478', ink: '#1B0A3C'
  };

  /* ---------- 自适应 ---------- */
  function fit() {
    const s = Math.min(window.innerWidth / W, (window.innerHeight - 86) / H);
    cvs.style.width = (W * s) + 'px';
    cvs.style.height = (H * s) + 'px';
    const d = Math.min(2, window.devicePixelRatio || 1);
    cvs.width = Math.round(W * d);
    cvs.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  window.addEventListener('resize', fit);

  /* ---------- 图片载入 + 去白底 + 裁边 ---------- */
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
    const d = id.data;
    const w = c.width, h = c.height;
    const seen = new Uint8Array(w * h);
    const stack = [];

    function isBg(i) {
      return d[i * 4] > 232 && d[i * 4 + 1] > 232 && d[i * 4 + 2] > 232;
    }
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
    g.putImageData(id, 0, 0);

    // 裁到不透明边界
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
    const pad = 4;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const tw = maxX - minX + 1, th = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    out.getContext('2d').drawImage(c, minX, minY, tw, th, 0, 0, tw, th);
    return out;
  }

  /* ---------- 软体 sprite ---------- */
  function makeSprite(canvas, color, dark, scale) {
    return {
      canvas: canvas, cw: canvas.width, ch: canvas.height,
      x: 0, y: 0, tx: 0, ty: 0,
      scale: scale, tscale: scale,
      sx: 1, sy: 1, tsx: 1, tsy: 1,
      rot: 0, trot: 0,
      color: color, dark: dark,
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
      const t = clamp((u - acc) / b.len, 0, 1);
      off += Math.sin(b.ang) * b.len * t;
      acc += b.len;
      if (u <= acc) break;
    }
    return off * s.ch * s.scale * s.sy;
  }
  function angleAt(s, u) {
    let acc = 0, a = 0;
    for (let i = 0; i < s.bones.length; i++) {
      const b = s.bones[i];
      a += b.ang;
      acc += b.len;
      if (u <= acc) break;
    }
    return a;
  }
  function topOf(s) {
    return { x: s.x + offsetAt(s, 0.92), y: s.y - s.ch * s.scale * s.sy * 0.92 };
  }

  function sidePoint(s, dir) {
    const w = s.cw * s.scale * s.sx;
    const h = s.ch * s.scale * s.sy;
    return {
      x: s.x + offsetAt(s, 0.58) + dir * w * 0.30,
      y: s.y - h * 0.58
    };
  }

  function drawSprite(s, t) {
    const w = s.cw * s.scale * s.sx;
    const h = s.ch * s.scale * s.sy;
    const bottom = s.y;
    const N = 64;
    const strip = h / N;
    const sliceH = s.ch / N;

    ctx.save();
    ctx.translate(s.x, bottom);
    ctx.rotate(s.rot);
    ctx.translate(-s.x, -bottom);

    // 地面软影
    if (s.rot === 0) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#0A0220';
      ctx.beginPath();
      ctx.ellipse(s.x, bottom + 6, w * 0.40, 14, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < N; i++) {
      const u = 1 - (i + 0.5) / N;
      const off = offsetAt(s, u);
      const ang = angleAt(s, u);
      const yTop = bottom - h + i * strip;
      const srcY = i * sliceH;
      const srcH = Math.min(sliceH * 1.24, s.ch - srcY);
      ctx.save();
      ctx.translate(s.x + off, yTop + strip / 2);
      ctx.rotate(ang * 0.55);
      ctx.drawImage(s.canvas, 0, srcY, s.cw, srcH,
        -w / 2, -strip / 2 - strip * 0.12, w, strip * 1.24);
      ctx.restore();
    }
    ctx.restore();
  }

  function updateArms(s, dt, t) {
    const w = s.cw * s.scale * s.sx;
    const h = s.ch * s.scale * s.sy;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const off = offsetAt(s, 0.56);
      const shx = s.x + off + side * w * 0.33;
      const shy = s.y - h * 0.56;
      let tx, ty;
      if (s.armTargets[i]) {
        tx = s.armTargets[i].x; ty = s.armTargets[i].y;
      } else {
        tx = shx + side * w * 0.24 + Math.sin(t * 1.7 + i) * 10;
        ty = shy + h * 0.26 + Math.cos(t * 1.4 + i) * 8;
      }
      const a = s.arms[i];
      if (!a.init) { a.x = tx; a.y = ty; a.init = true; }
      const k = s.armTargets[i] ? 0.22 : 0.10;
      a.x += (tx - a.x) * Math.min(1, dt * 60 * k);
      a.y += (ty - a.y) * Math.min(1, dt * 60 * k);
      a.shx = shx; a.shy = shy;
    }
  }

  function drawArm(s, a, i, t) {
    const x0 = a.shx, y0 = a.shy, x1 = a.x, y1 = a.y;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const sag = 14 + Math.sin(t * 3 + i * 2) * 5 + len * 0.05;
    const cx = (x0 + x1) / 2 + nx * sag;
    const cy = (y0 + y1) / 2 + ny * sag;
    const bodyW = s.cw * s.scale * s.sx;
    const w0 = Math.max(14, bodyW * 0.062);
    const w1 = Math.max(7, bodyW * 0.027);

    ctx.beginPath();
    ctx.moveTo(x0 - w0 / 2, y0);
    ctx.quadraticCurveTo(cx - w1, cy, x1 - w1 * 0.25, y1);
    ctx.quadraticCurveTo(cx + w1, cy, x0 + w0 / 2, y0);
    ctx.closePath();
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, s.color);
    g.addColorStop(0.6, s.color);
    g.addColorStop(1, s.color);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = s.dark;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 高光
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 - w0 * 0.18, y0);
    ctx.quadraticCurveTo(cx - w1 * 0.5, cy, x1 - w1 * 0.18, y1);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 手端
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(x1, y1, w1 * 0.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = s.dark; ctx.lineWidth = 3; ctx.stroke();
  }

  function drawBones(s) {
    let x = s.x, y = s.y, ang = 0;
    const h = s.ch * s.scale * s.sy;
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
      ctx.beginPath(); ctx.arc(nx, ny, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(nx, ny, 1.6, 0, TAU); ctx.fill();
      x = nx; y = ny;
    }
    ctx.restore();
  }

  /* ---------- 场景 ---------- */
  const sprites = {};
  let mode = 'idle';
  let auto = true;
  let autoT = 0;
  let softness = 0.55;
  let showBones = false;
  let perf = 0;
  let ready = false;

  const HOOK = { x: 606, y: 318 };
  const FLOOR = 906;

  function applyTargets(dt, t) {
    const g = sprites.green, p = sprites.pink;
    let gx = 258, gy = FLOOR, gsx = 1, gsy = 1, grot = 0;
    let px = 588, py = FLOOR, psx = 1, psy = 1, prot = 0;
    let gLean = 0, pLean = 0;
    let gArmR = null, gArmL = null;
    let pArmR = null;

    if (mode === 'idle') {
      gsy = 1 + Math.sin(t * 1.7) * 0.012;
      psy = 1 + Math.sin(t * 1.7 + 1.2) * 0.012;
      gLean = Math.sin(t * 1.2) * 0.02;
      pLean = Math.sin(t * 1.05 + 1) * 0.025;
    } else if (mode === 'grab') {
      gx = 330; gy = 716; gsy = 1.14; gsx = 0.93;
      gLean = 0.16;
      gArmR = { x: HOOK.x, y: HOOK.y + 10 };
      pLean = 0.05;
    } else if (mode === 'pull') {
      gx = 300; gy = 740; gsy = 1.08; gsx = 0.95;
      gLean = -0.14;
      px = 540; py = 646; psy = 1.10; psx = 0.93;
      pLean = 0.12;
      gArmL = { x: 500, y: 620 };
      pArmR = { x: 610, y: 470 };
    } else if (mode === 'fling') {
      gx = 260; gy = 786; gsy = 1.02; gsx = 1.02;
      gLean = 0.22;
      px = 692; py = 452; psy = 1.18; psx = 0.86;
      prot = 0.5; pLean = 0.42;
      gArmL = { x: 580, y: 400 };
    } else if (mode === 'land') {
      gx = 258; gy = FLOOR; gsy = 0.78; gsx = 1.22;
      px = 588; py = FLOOR; psy = 0.80; psx = 1.20;
      gLean = 0; pLean = 0;
    } else if (mode === 'dizzy') {
      gLean = Math.sin(t * 9) * 0.14;
      pLean = Math.sin(t * 9 + 1.4) * 0.16;
      gy = FLOOR - 4 + Math.sin(t * 11) * 4;
      py = FLOOR - 4 + Math.cos(t * 11) * 4;
    }

    // 位置 / 缩放缓动
    g.tx = gx; g.ty = gy; g.tscale = g.scale;
    p.tx = px; p.ty = py;

    const sp = Math.min(1, dt * 7);
    g.x = lerp(g.x, gx, sp); g.y = lerp(g.y, gy, sp);
    p.x = lerp(p.x, px, sp); p.y = lerp(p.y, py, sp);

    g.tsx = gsx; g.tsy = gsy; p.tsx = psx; p.tsy = psy;
    g.sx = lerp(g.sx, gsx, Math.min(1, dt * 9));
    g.sy = lerp(g.sy, gsy, Math.min(1, dt * 9));
    p.sx = lerp(p.sx, psx, Math.min(1, dt * 9));
    p.sy = lerp(p.sy, psy, Math.min(1, dt * 9));

    g.rot = lerp(g.rot, grot, Math.min(1, dt * 6));
    p.rot = lerp(p.rot, prot, Math.min(1, dt * 6));

    // 骨骼目标
    g.bones[0].target = gLean * 0.45 + Math.sin(t * 1.4) * 0.01;
    g.bones[1].target = gLean * 0.75 + Math.sin(t * 1.4 + 0.6) * 0.015;
    g.bones[2].target = gLean * 1.0 + Math.sin(t * 1.4 + 1.2) * 0.02;
    p.bones[0].target = pLean * 0.5;
    p.bones[1].target = pLean * 0.8;
    p.bones[2].target = pLean * 1.05;

    if (mode === 'dizzy') {
      g.bones[1].target += Math.sin(t * 13) * 0.10;
      g.bones[2].target += Math.sin(t * 15) * 0.16;
      p.bones[1].target += Math.cos(t * 12) * 0.11;
      p.bones[2].target += Math.cos(t * 14) * 0.17;
    }

    g.armTargets[1] = gArmR;
    g.armTargets[0] = gArmL;
    p.armTargets[1] = pArmR;
  }

  function stepBones(s, dt, t) {
    const k = lerp(240, 55, softness);
    const c = lerp(16, 7, softness);
    for (let i = 0; i < s.bones.length; i++) {
      const b = s.bones[i];
      const kk = k * (1 - i * 0.10);
      b.av += (-kk * (b.ang - b.target) - c * b.av) * dt;
      b.ang += b.av * dt;
      b.ang = clamp(b.ang, -0.7, 0.7);
    }
  }

  /* ---------- 背景与钩子 ---------- */
  function drawBackground(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#160731');
    g.addColorStop(0.55, '#2A1058');
    g.addColorStop(0.86, '#4A1E92');
    g.addColorStop(1, '#7EC23A');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 聚光
    const rg = ctx.createRadialGradient(W * 0.5, 120, 40, W * 0.5, 120, 620);
    rg.addColorStop(0, 'rgba(198,242,78,.16)');
    rg.addColorStop(1, 'rgba(198,242,78,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H * 0.8);

    // 背景光斑
    for (let i = 0; i < 6; i++) {
      const bx = 90 + i * 130 + Math.sin(t * 0.2 + i) * 20;
      const by = 220 + (i % 3) * 190;
      const R = 90 + (i % 3) * 40;
      const bg = ctx.createRadialGradient(bx, by, 4, bx, by, R);
      const col = i % 2 ? C.pink : C.lime;
      bg.addColorStop(0, hexA(col, 0.10));
      bg.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, R, 0, TAU); ctx.fill();
    }

    // 地面
    const fy = FLOOR + 4;
    const fg = ctx.createLinearGradient(0, fy, 0, H);
    fg.addColorStop(0, '#C6F24E');
    fg.addColorStop(1, '#6FA82A');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-20, fy);
    for (let x = -20; x <= W + 20; x += 20) {
      ctx.lineTo(x, fy + Math.sin(x * 0.03 + t * 2) * 5);
    }
    ctx.lineTo(W + 20, H + 20); ctx.lineTo(-20, H + 20);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = -20; x <= W + 20; x += 20) {
      const yy = fy + Math.sin(x * 0.03 + t * 2) * 5;
      if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function drawHook(t) {
    const x = HOOK.x, y = HOOK.y + Math.sin(t * 2) * 3;
    const gl = ctx.createRadialGradient(x, y, 4, x, y, 78);
    gl.addColorStop(0, 'rgba(198,242,78,.25)');
    gl.addColorStop(1, 'rgba(198,242,78,0)');
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(x, y, 78, 0, TAU); ctx.fill();

    const dome = ctx.createRadialGradient(x - 8, y - 10, 4, x, y, 38);
    dome.addColorStop(0, 'rgba(255,255,255,.30)');
    dome.addColorStop(1, 'rgba(198,242,78,.03)');
    ctx.fillStyle = dome;
    ctx.beginPath(); ctx.arc(x, y, 36, Math.PI, 0); ctx.closePath(); ctx.fill();

    ctx.strokeStyle = C.lime; ctx.lineWidth = 4;
    ctx.shadowColor = C.lime; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(x, y, 36, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 36, y); ctx.lineTo(x + 36, y); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 28, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
  }

  function drawRope(a, b, t, taut) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const sag = taut ? 6 : 46;
    const pts = [];
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = a.x + dx * u;
      const y = a.y + dy * u + Math.sin(u * Math.PI) * sag;
      const wob = Math.sin(t * 6 + u * 9) * (taut ? 1.5 : 5) * Math.sin(u * Math.PI);
      pts.push([x + (-dy / d) * wob, y + (dx / d) * wob]);
    }
    function path() {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
        else ctx.lineTo(pts[i][0], pts[i][1]);
      }
    }
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, C.green); g.addColorStop(0.5, '#E9FFA8'); g.addColorStop(1, C.pink);
    ctx.shadowColor = 'rgba(198,242,78,.6)';
    ctx.shadowBlur = taut ? 22 : 12;
    ctx.strokeStyle = g;
    ctx.lineWidth = taut ? 9 : 12;
    path(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2.4;
    path(); ctx.stroke();
    ctx.restore();
  }

  /* ---------- 主循环 ---------- */
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    drawBackground(t);
    drawHook(t);

    if (!ready) {
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.textAlign = 'center';
      ctx.font = '600 18px "PingFang SC",system-ui,sans-serif';
      ctx.fillText('正在拆解角色图层…', W / 2, H / 2);
      return;
    }

    const g = sprites.green, p = sprites.pink;

    // 先画粉，再画绿，避免遮挡
    drawSprite(p, t);
    drawSprite(g, t);

    const ga = sidePoint(g, 1);
    const pa = sidePoint(p, -1);
    drawRope(ga, pa, t, mode === 'pull');

    drawArm(g, g.arms[0], 0, t);
    drawArm(g, g.arms[1], 1, t);
    drawArm(p, p.arms[0], 0, t);
    drawArm(p, p.arms[1], 1, t);

    if (showBones) {
      drawBones(g);
      drawBones(p);
    }

    // 标题
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = '800 22px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('骨骼动画样例', 40, 56);
    ctx.fillStyle = 'rgba(198,242,78,.85)';
    ctx.font = '600 13px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('现有画稿 · 3 段骨骼链 · 软体条带形变 · 触手', 40, 80);

    // 当前动作
    const label = { idle: '待机', grab: '抓钩', pull: '拉人', fling: '甩出', land: '落地', dizzy: '撞晕' }[mode];
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.font = '600 14px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('当前：' + label, W - 40, 56);
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    perf += dt;

    if (auto) {
      autoT += dt;
      if (autoT > 2.6) {
        autoT = 0;
        const list = ['idle', 'grab', 'pull', 'fling', 'land', 'dizzy'];
        const i = list.indexOf(mode);
        setMode(list[(i + 1) % list.length]);
      }
    }

    if (ready) {
      applyTargets(dt, perf);
      stepBones(sprites.green, dt, perf);
      stepBones(sprites.pink, dt, perf);
      updateArms(sprites.green, dt, perf);
      updateArms(sprites.pink, dt, perf);
    }

    draw(perf);
    requestAnimationFrame(loop);
  }

  /* ---------- UI ---------- */
  function setMode(m) {
    mode = m;
    document.querySelectorAll('button[data-m]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-m') === m);
    });
  }
  document.querySelectorAll('button[data-m]').forEach(function (b) {
    b.addEventListener('click', function () {
      auto = false;
      document.getElementById('auto').checked = false;
      setMode(b.getAttribute('data-m'));
    });
  });
  document.getElementById('auto').addEventListener('change', function (e) {
    auto = e.target.checked;
    autoT = 0;
  });
  document.getElementById('showBones').addEventListener('change', function (e) {
    showBones = e.target.checked;
  });
  document.getElementById('soft').addEventListener('input', function (e) {
    softness = e.target.value / 100;
  });

  /* ---------- 启动 ---------- */
  fit();
  Promise.all([
    loadImg('assets/green.png'),
    loadImg('assets/pink.png')
  ]).then(function (imgs) {
    const gc = cutout(imgs[0]);
    const pc = cutout(imgs[1]);
    const GH = 470, PH = 350;
    const g = makeSprite(gc, C.green, C.greenD, GH / gc.height);
    const p = makeSprite(pc, C.pink, C.pinkD, PH / pc.height);
    g.x = g.tx = 258; g.y = g.ty = FLOOR;
    p.x = p.tx = 588; p.y = p.ty = FLOOR;
    sprites.green = g;
    sprites.pink = p;
    ready = true;
  }).catch(function (err) {
    console.error(err);
    ctx.fillStyle = '#FF8FA8';
    ctx.textAlign = 'center';
    ctx.font = '600 18px "PingFang SC",system-ui,sans-serif';
    ctx.fillText('角色图加载失败，请通过本地服务器打开', W / 2, H / 2);
  });

  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });
})();
