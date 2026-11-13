// 菜单：标题、最高分、开始按钮、音效开关、版本号。
(function (G) {
  'use strict';

  const E = G.engine, ui = G.ui, C = G.config.colors;

  class Menu extends G.Scene {
    enter() {
      this.t = 0;
      this.best = G.save.get('best', 0);
      this.btns = new ui.ButtonGroup();
      this.startBtn = this.btns.add(new ui.Button({ text: '开始游戏', onClick: () => E.go('play') }));
      this.soundBtn = this.btns.add(new ui.Button({
        w: 280, h: 92, size: 32, fill: C.panel, color: C.text,
        onClick: () => { G.audio.toggle(); this.refresh(); }
      }));
      this.refresh();
      this.layout();
    }

    refresh() {
      this.soundBtn.text = G.audio.muted ? '音效：关' : '音效：开';
    }

    layout() {
      const W = E.W, H = E.H;
      this.startBtn.x = this.soundBtn.x = W / 2;
      this.startBtn.y = H * 0.62;
      this.soundBtn.y = H * 0.62 + 150;
    }

    onResize() { this.layout(); }

    update(dt) {
      this.t += dt;
      this.btns.update(dt);
    }

    render(ctx) {
      const W = E.W, H = E.H;
      ui.backdrop(ctx, E.time);
      const logo = G.assets.img('logo');
      if (logo) {
        const s = 200 + Math.sin(this.t * 2.2) * 8;   // 轻轻“呼吸”
        ctx.drawImage(logo, W / 2 - s / 2, H * 0.2 - s / 2, s, s);
      }
      ui.text(ctx, G.config.title, W / 2, H * 0.37, { size: 76 });
      ui.text(ctx, '最高分  ' + this.best, W / 2, H * 0.37 + 90, { size: 36, color: C.dim });
      this.btns.draw(ctx);
      ui.text(ctx, 'v' + G.config.version, W / 2, H - 36, { size: 24, weight: 'normal', color: 'rgba(255,255,255,0.3)' });
    }

    onPointerDown(x, y) { this.btns.down(x, y); }
    onPointerMove(x, y) { this.btns.move(x, y); }
    onPointerUp(x, y) { this.btns.up(x, y); }
  }

  E.register('menu', Menu);
})(window.G);
