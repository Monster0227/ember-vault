// UI 小工具：文字、圆角矩形、按钮、通用背景。全部画在 canvas 上，不用 DOM，各平台表现一致。
(function (G) {
  'use strict';

  const cfg = G.config;
  const C = cfg.colors;

  // 圆角矩形路径（不依赖 ctx.roundRect，老内核没有）。画完自己 fill() / stroke()
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 一行文字。o: { size, color, align, baseline, weight, stroke（描边颜色）, strokeWidth }
  function text(ctx, str, x, y, o) {
    o = o || {};
    ctx.font = (o.weight || 'bold') + ' ' + (o.size || 36) + 'px ' + cfg.fontFamily;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.strokeWidth || 8;
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || C.text;
    ctx.fillText(str, x, y);
  }

  // 通用背景：竖向渐变 + 几个缓慢漂浮的光斑。t 传累计秒数
  function backdrop(ctx, t) {
    const W = G.engine.W, H = G.engine.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a2150');
    g.addColorStop(1, cfg.bgColor);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(76,201,240,0.06)';
    for (let i = 0; i < 6; i++) {
      const x = W * (0.15 + 0.7 * ((i * 0.37) % 1)) + Math.sin(t * 0.3 + i) * 40;
      const y = H * (0.1 + 0.8 * ((i * 0.61) % 1)) + Math.cos(t * 0.25 + i * 2) * 40;
      ctx.beginPath();
      ctx.arc(x, y, 60 + (i % 3) * 40, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 按钮。x、y 是中心点（逻辑坐标）。需要放进 ButtonGroup 才能响应点击
  class Button {
    constructor(o) {
      Object.assign(this, {
        x: 0, y: 0, w: 380, h: 112, radius: 30,
        text: '', size: 44,
        fill: C.primary, color: cfg.bgColor,
        visible: true,
        onClick: null
      }, o);
      this.pressed = false;
      this.anim = 0;   // 按下动画进度 0 → 1
    }

    contains(px, py) {
      return Math.abs(px - this.x) <= this.w / 2 && Math.abs(py - this.y) <= this.h / 2;
    }

    update(dt) {
      this.anim += ((this.pressed ? 1 : 0) - this.anim) * Math.min(1, dt * 24);
    }

    draw(ctx) {
      if (!this.visible) return;
      const s = 1 - 0.06 * this.anim;
      const w = this.w, h = this.h;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, -w / 2, -h / 2 + 6, w, h, this.radius);
      ctx.fill();
      ctx.fillStyle = this.fill;
      roundRect(ctx, -w / 2, -h / 2, w, h, this.radius);
      ctx.fill();
      text(ctx, this.text, 0, 2, { size: this.size, color: this.color });
      ctx.restore();
    }
  }

  // 一组按钮：场景把触摸事件转给它，它负责按下 / 松开 / 点击判定。
  // 按下和松开都落在同一个按钮上才算点击，手指滑出去再松开不会误点。
  class ButtonGroup {
    constructor() {
      this.list = [];
      this.active = null;   // 正被按住的按钮
    }

    add(button) {
      this.list.push(button);
      return button;
    }

    // 返回 true 表示这次按下落在了按钮上（场景就别再当成游戏操作处理）
    down(x, y) {
      this.cancel();
      for (let i = this.list.length - 1; i >= 0; i--) {   // 后加的盖在上面，先判断
        const b = this.list[i];
        if (b.visible && b.contains(x, y)) {
          b.pressed = true;
          this.active = b;
          return true;
        }
      }
      return false;
    }

    move(x, y) {
      if (this.active) this.active.pressed = this.active.contains(x, y);
    }

    up(x, y) {
      const b = this.active;
      if (!b) return false;
      this.cancel();
      if (!b.contains(x, y)) return false;
      G.audio.play('tap');
      if (b.onClick) b.onClick(b);
      return true;
    }

    cancel() {
      if (this.active) this.active.pressed = false;
      this.active = null;
    }

    update(dt) {
      this.list.forEach(b => b.update(dt));
    }

    draw(ctx) {
      this.list.forEach(b => b.draw(ctx));
    }
  }

  G.ui = { roundRect, text, backdrop, Button, ButtonGroup };
})(window.G);
