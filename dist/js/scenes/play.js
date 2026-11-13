// 示例玩法「点圈圈」：圈圈随机冒出来，外环慢慢收拢，收拢之前点中得 1 分；漏掉一个扣一条命，3 条命用完结束。
//
// ★ 做自己的游戏时主要换掉这个文件。下面这些套路建议保留：
//   enter() 初始化 → update(dt) 逻辑 → render(ctx) 画面 → onPointer*() 输入 → onHide() 自动暂停
//   结束时：G.save 存最高分 → G.engine.go('gameover', { score, best, isNewBest })，见 finish()
(function (G) {
  'use strict';

  const E = G.engine, ui = G.ui, U = G.utils, C = G.config.colors;
  const R = 64;          // 圈圈半径
  const TOP = 170;       // 顶部留给 HUD 的高度
  const BOTTOM = 90;     // 底部边距
  const LIVES = 3;

  class Play extends G.Scene {
    enter() {
      this.score = 0;
      this.lives = LIVES;
      this.targets = [];     // 场上的圈圈 { x, y, age, life }
      this.fx = [];          // 特效：dot 粒子 / text 飘字 / ripple 点空的波纹
      this.spawnIn = 0.5;    // 再过几秒出下一个圈圈
      this.elapsed = 0;
      this.paused = false;
      this.dying = false;    // 最后一条命刚丢：停一下再进结算
      this.dyingT = 0;
      this.finished = false;

      this.hud = new ui.ButtonGroup();
      this.pauseBtn = this.hud.add(new ui.Button({
        w: 104, h: 84, radius: 22, text: '暂停', size: 30, fill: C.panel, color: C.text,
        onClick: () => this.pause()
      }));
      this.menu = new ui.ButtonGroup();   // 暂停菜单
      this.resumeBtn = this.menu.add(new ui.Button({ text: '继续', onClick: () => this.resume() }));
      this.quitBtn = this.menu.add(new ui.Button({
        text: '退出到菜单', h: 96, size: 36, fill: C.panel, color: C.text,
        onClick: () => E.go('menu')
      }));
      this.layout();
    }

    layout() {
      const W = E.W, H = E.H;
      this.pauseBtn.x = W - 76;
      this.pauseBtn.y = 80;
      this.resumeBtn.x = this.quitBtn.x = W / 2;
      this.resumeBtn.y = H * 0.5;
      this.quitBtn.y = H * 0.5 + 140;
    }

    // 圈圈中心可以出现的范围
    area() {
      return { x0: R + 30, x1: E.W - R - 30, y0: TOP + R, y1: E.H - BOTTOM - R };
    }

    onResize() {
      this.layout();
      const a = this.area();   // 屏幕比例变了：把已有的圈圈拉回可见范围
      this.targets.forEach(t => {
        t.x = U.clamp(t.x, a.x0, a.x1);
        t.y = U.clamp(t.y, a.y0, a.y1);
      });
    }

    pause() {
      if (this.dying) return;
      this.paused = true;
      this.hud.cancel();
    }

    resume() {
      this.paused = false;
      this.menu.cancel();
    }

    onHide() { this.pause(); }

    onKey(code, down) {
      if (!down || (code !== 'Escape' && code !== 'KeyP')) return;
      if (this.paused) this.resume(); else this.pause();
    }

    update(dt) {
      this.hud.update(dt);
      this.menu.update(dt);
      if (this.paused) return;
      this.elapsed += dt;
      this.updateFx(dt);

      if (this.dying) {
        this.dyingT -= dt;
        if (this.dyingT <= 0) this.finish();
        return;
      }

      this.spawnIn -= dt;
      if (this.spawnIn <= 0) {
        this.spawn();
        this.spawnIn = Math.max(0.35, 1 - this.score * 0.015);   // 分越高出得越快
      }

      for (let i = this.targets.length - 1; i >= 0; i--) {
        const t = this.targets[i];
        t.age += dt;
        if (t.age >= t.life) {
          this.targets.splice(i, 1);
          this.miss(t);
        }
      }
    }

    spawn() {
      const a = this.area();
      let x = 0, y = 0;
      for (let tries = 0; tries < 10; tries++) {   // 随机找个位置，尽量别和已有的圈圈重叠
        x = U.rand(a.x0, a.x1);
        y = U.rand(a.y0, a.y1);
        if (!this.targets.some(t => U.dist(t.x, t.y, x, y) < R * 2.6)) break;
      }
      this.targets.push({ x: x, y: y, age: 0, life: Math.max(0.9, 2.1 - this.score * 0.03) });
    }

    hit(i) {
      const t = this.targets.splice(i, 1)[0];
      this.score++;
      G.audio.play('good');
      for (let k = 0; k < 12; k++) {
        const a = Math.PI * 2 * k / 12 + U.rand(-0.2, 0.2);
        const v = U.rand(240, 440);
        this.fx.push({
          type: 'dot', x: t.x, y: t.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: U.rand(6, 12), color: k % 2 ? C.accent : C.primary, age: 0, life: U.rand(0.35, 0.6)
        });
      }
      this.fx.push({ type: 'text', x: t.x, y: t.y - R, text: '+1', color: C.accent, age: 0, life: 0.7 });
    }

    miss(t) {
      if (this.dying) return;
      this.lives--;
      this.fx.push({ type: 'text', x: t.x, y: t.y, text: '漏了', color: C.danger, age: 0, life: 0.8 });
      if (this.lives > 0) {
        G.audio.play('bad');
      } else {
        G.audio.play('lose');
        this.dying = true;
        this.dyingT = 0.9;
      }
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      const prev = G.save.get('best', 0);
      const isNewBest = this.score > prev;
      if (isNewBest) G.save.set('best', this.score);
      E.go('gameover', { score: this.score, best: Math.max(prev, this.score), isNewBest: isNewBest });
    }

    updateFx(dt) {
      const damp = Math.pow(0.02, dt);   // 粒子逐渐减速（写成指数，和帧率无关）
      for (let i = this.fx.length - 1; i >= 0; i--) {
        const f = this.fx[i];
        f.age += dt;
        if (f.age >= f.life) {
          this.fx.splice(i, 1);
        } else if (f.type === 'dot') {
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.vx *= damp;
          f.vy *= damp;
        }
      }
    }

    onPointerDown(x, y) {
      if (this.paused) { this.menu.down(x, y); return; }
      if (this.hud.down(x, y) || this.dying) return;
      // 命中判定：先查最早出现的（它最先消失），半径外再放宽一点照顾手指
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (U.dist(t.x, t.y, x, y) <= R + 16) { this.hit(i); return; }
      }
      this.fx.push({ type: 'ripple', x: x, y: y, age: 0, life: 0.35 });
    }

    onPointerMove(x, y) {
      if (this.paused) this.menu.move(x, y); else this.hud.move(x, y);
    }

    onPointerUp(x, y) {
      if (this.paused) this.menu.up(x, y); else this.hud.up(x, y);
    }

    render(ctx) {
      const W = E.W, H = E.H;
      ui.backdrop(ctx, E.time);

      // 圈圈：外环从 2.4 倍半径收拢到 1 倍，最后 30% 的时间变红
      this.targets.forEach(t => {
        const k = U.clamp(t.age / t.life, 0, 1);
        ctx.lineWidth = 8;
        ctx.strokeStyle = k > 0.7 ? C.danger : C.accent;
        ctx.beginPath();
        ctx.arc(t.x, t.y, R * (1 + 1.4 * (1 - k)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = C.primary;
        ctx.beginPath();
        ctx.arc(t.x, t.y, R * U.ease.outBack(Math.min(1, t.age / 0.2)), 0, Math.PI * 2);   // 出现时弹一下
        ctx.fill();
      });

      this.fx.forEach(f => {
        const k = f.age / f.life;
        ctx.globalAlpha = 1 - k;
        if (f.type === 'dot') {
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * (1 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
        } else if (f.type === 'text') {
          ui.text(ctx, f.text, f.x, f.y - 90 * f.age, { size: 44, color: f.color });
        } else if (f.type === 'ripple') {
          ctx.lineWidth = 4;
          ctx.strokeStyle = C.text;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 20 + 50 * k, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;

      // HUD：分数、命（实心 = 还在，空心 = 丢了）、暂停按钮
      ui.text(ctx, '得分 ' + this.score, 40, 80, { size: 48, align: 'left' });
      for (let i = 0; i < LIVES; i++) {
        ctx.beginPath();
        ctx.arc(W / 2 + (i - 1) * 56, 80, 18, 0, Math.PI * 2);
        if (i < this.lives) {
          ctx.fillStyle = C.danger;
          ctx.fill();
        } else {
          ctx.lineWidth = 4;
          ctx.strokeStyle = C.dim;
          ctx.stroke();
        }
      }
      this.hud.draw(ctx);

      if (this.elapsed < 3) {     // 开局提示，3 秒后淡出
        ctx.globalAlpha = U.clamp(3 - this.elapsed, 0, 1);
        ui.text(ctx, '在外环收拢之前点中圈圈！', W / 2, H - 50, { size: 30, color: C.dim });
        ctx.globalAlpha = 1;
      }

      if (this.dying) {           // 最后一条命丢了：屏幕泛红
        ctx.fillStyle = 'rgba(239,71,111,' + (0.3 * Math.max(0, this.dyingT) / 0.9).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      if (this.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, W, H);
        ui.text(ctx, '已暂停', W / 2, H * 0.34, { size: 72 });
        this.menu.draw(ctx);
      }
    }
  }

  E.register('play', Play);
})(window.G);
