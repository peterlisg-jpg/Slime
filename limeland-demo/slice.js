/* 拉丝 · 前厅美术样片（Phaser 3）
   目标：验证"分层插画 + 角色 + 光效"的画面方向，不做完整玩法。 */
(function () {
  'use strict';

  const W = 1280, H = 720;
  const LIME = 0xC6F24E;

  function cropBottom(img, frac) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = Math.floor(img.height * frac);
    c.getContext('2d').drawImage(img, 0, 0, img.width, c.height, 0, 0, c.width, c.height);
    return c;
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
    const tw = maxX - minX + 1, th = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    out.getContext('2d').drawImage(c, minX, minY, tw, th, 0, 0, tw, th);
    return out;
  }

  class MainScene extends Phaser.Scene {
    constructor() { super('main'); }

    preload() {
      this.load.image('bgRaw', 'assets/bg_front_hall.jpg');
      this.load.image('green', 'assets/green.png');
      this.load.image('pink', 'assets/pink.png');
    }

    create() {
      const isGL = this.game.renderer.type === Phaser.WEBGL;

      // 背景：去掉右下角水印区域
      const raw = this.textures.get('bgRaw').getSourceImage();
      const bgCvs = cropBottom(raw, 0.93);
      this.textures.addCanvas('bg', bgCvs);
      const bg = this.add.image(W / 2, H / 2, 'bg');
      const sc = Math.max(W / bgCvs.width, H / bgCvs.height);
      bg.setScale(sc);

      // 顶部压一层夜色，统一光感
      const shade = this.add.rectangle(0, 0, W, H, 0x12042a, 0.16).setOrigin(0);

      // 角色（去白底）
      const gc = cutout(this.textures.get('green').getSourceImage());
      const pc = cutout(this.textures.get('pink').getSourceImage());
      this.textures.addCanvas('greenCut', gc);
      this.textures.addCanvas('pinkCut', pc);
      this.g = this.add.image(500, 560, 'greenCut').setOrigin(0.5, 1);
      this.p = this.add.image(800, 560, 'pinkCut').setOrigin(0.5, 1);
      const gh = 250 / this.g.height, ph = 220 / this.p.height;
      this.g.setScale(gh); this.p.setScale(ph);
      this.gBase = gh; this.pBase = ph;

      // 接触阴影，让角色踩在地上
      this.shadowG = this.add.ellipse(this.g.x, this.g.y + 2, 190, 26, 0x05010f, 0.34);
      this.shadowP = this.add.ellipse(this.p.x, this.p.y + 2, 165, 22, 0x05010f, 0.30);
      if (isGL) {
        this.shadowG.postFX.addBlur(2);
        this.shadowP.postFX.addBlur(2);
      }

      if (isGL) {
        this.g.postFX.addGlow(0xABE14D, 1.6, 0, false, 0.12, 26);
        this.p.postFX.addGlow(0xFF9AD6, 1.6, 0, false, 0.12, 26);
      }

      // 绳子
      this.rope = this.add.graphics();
      this.g.setDepth(1);
      this.p.setDepth(1);
      this.rope.setDepth(2);
      if (isGL) this.rope.postFX.addGlow(LIME, 1.3, 0, false, 0.1, 20);

      // 浮尘
      const dot = document.createElement('canvas');
      dot.width = dot.height = 8;
      const dc = dot.getContext('2d');
      dc.fillStyle = '#fff7d0';
      dc.beginPath(); dc.arc(4, 4, 3.4, 0, Math.PI * 2); dc.fill();
      this.textures.addCanvas('dot', dot);
      this.add.particles(0, 0, 'dot', {
        speedY: { min: -16, max: -5 },
        speedX: { min: -5, max: 5 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.32, end: 0 },
        lifespan: 7000,
        frequency: 110,
        blendMode: 'ADD',
        emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(0, 60, W, H - 160) }
      });

      // 文案
      this.add.text(34, 24, '拉丝', {
        fontFamily: '"PingFang SC","Noto Sans SC",sans-serif',
        fontSize: '30px', fontStyle: 'bold', color: '#E9FFB0'
      }).setShadow(0, 0, '#C6F24E', 16);
      this.add.text(96, 38, '前厅 · 美术样片', {
        fontFamily: '"PingFang SC","Noto Sans SC",sans-serif',
        fontSize: '13px', color: 'rgba(255,255,255,.55)', letterSpacing: 2
      });
      this.add.text(W / 2, H - 30, 'A / D 与 ← / → 移动　·　F 甩出', {
        fontFamily: '"PingFang SC","Noto Sans SC",sans-serif',
        fontSize: '14px', color: 'rgba(255,255,255,.45)'
      }).setOrigin(0.5);

      if (isGL) this.cameras.main.postFX.addVignette(0.5, 0.5, 0.92, 0.34);

      this.keys = this.input.keyboard.addKeys('A,D,F,J,LEFT,RIGHT');
      this.flingT = -1;
      this.flingFrom = null;
      this.t = 0;
    }

    drawRope(t) {
      const a = { x: this.g.x, y: this.g.y - this.g.displayHeight * 0.9 };
      const b = { x: this.p.x, y: this.p.y - this.p.displayHeight * 0.9 };
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const sag = Phaser.Math.Clamp(220 - dist * 0.25, 0, 90);
      const g = this.rope;
      g.clear();
      for (let pass = 0; pass < 2; pass++) {
        g.lineStyle(pass ? 2.5 : 10, pass ? 0xffffff : LIME, pass ? 0.55 : 0.95);
        g.beginPath();
        for (let i = 0; i <= 26; i++) {
          const u = i / 26;
          const x = a.x + dx * u;
          const y = a.y + dy * u + Math.sin(u * Math.PI) * sag + Math.sin(t * 5 + u * 8) * 2 * Math.sin(u * Math.PI);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokePath();
      }
    }

    fling() {
      if (this.flingT >= 0) return;
      this.flingT = 0;
      this.flingFrom = { x: this.p.x, y: this.p.y };
    }

    update(time, delta) {
      const dt = delta / 1000;
      this.t += dt;
      const t = this.t;

      // 移动
      const spd = 260 * dt;
      if (this.keys.A.isDown) this.g.x -= spd;
      if (this.keys.D.isDown) this.g.x += spd;
      if (this.keys.LEFT.isDown) this.p.x -= spd;
      if (this.keys.RIGHT.isDown) this.p.x += spd;
      this.g.x = Phaser.Math.Clamp(this.g.x, 140, W - 140);
      this.p.x = Phaser.Math.Clamp(this.p.x, 140, W - 140);
      if (Phaser.Input.Keyboard.JustDown(this.keys.F)) this.fling();

      // 甩出
      if (this.flingT >= 0) {
        this.flingT += dt;
        const u = Phaser.Math.Clamp(this.flingT / 1.05, 0, 1);
        const from = this.flingFrom;
        const tx = Phaser.Math.Clamp(from.x + 240, 140, W - 140);
        if (u < 0.5) {
          const k = u / 0.5;
          this.p.x = Phaser.Math.Linear(from.x, tx, k);
          this.p.y = Phaser.Math.Linear(from.y, from.y - 230, Math.sin(k * Math.PI * 0.85));
        } else {
          const k = (u - 0.5) / 0.5;
          this.p.x = Phaser.Math.Linear(tx, from.x, k);
          this.p.y = Phaser.Math.Linear(from.y - 230, from.y, Math.sin(k * Math.PI * 0.85));
        }
        this.p.rotation = Math.sin(u * Math.PI) * 0.6;
        if (u >= 1) { this.flingT = -1; this.p.rotation = 0; this.p.y = from.y; }
      }

      // 呼吸与摆动
      this.g.scaleY = this.gBase * (1 + Math.sin(t * 2.1) * 0.022);
      this.p.scaleY = this.pBase * (1 + Math.sin(t * 2.1 + 1) * 0.022);
      this.g.scaleX = this.gBase;
      this.p.scaleX = this.pBase;
      this.g.rotation = Math.sin(t * 1.4) * 0.035;
      if (this.flingT < 0) this.p.rotation = Math.sin(t * 1.4 + 1) * 0.035;

      this.drawRope(t);

      this.shadowG.x = this.g.x;
      this.shadowP.x = this.p.x;
      this.shadowG.y = this.g.y + 2;
      this.shadowP.y = this.p.y + 2;
      const liftG = Phaser.Math.Clamp(1 - Math.abs(this.g.y - 560) / 260, 0.15, 1);
      const liftP = Phaser.Math.Clamp(1 - Math.abs(this.p.y - 560) / 260, 0.15, 1);
      this.shadowG.alpha = 0.34 * liftG;
      this.shadowP.alpha = 0.30 * liftP;
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    width: W, height: H,
    parent: 'game',
    backgroundColor: '#0b0616',
    scene: [MainScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' }
  });
})();
