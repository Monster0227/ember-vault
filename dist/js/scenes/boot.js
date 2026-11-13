// 启动：预加载图片并显示进度条，完成后进菜单。加载失败时提示点击重试。
(function (G) {
  'use strict';

  const E = G.engine, ui = G.ui, C = G.config.colors;

  class Boot extends G.Scene {
    enter() {
      this.load();
    }

    load() {
      this.progress = 0;
      this.failed = false;
      G.assets.loadAll(G.config.images, p => { this.progress = p; }).then(
        () => E.go('menu'),
        err => {
          this.failed = true;
          console.warn(err);
          G.debug.log(err.message);
        }
      );
    }

    onPointerDown() {
      if (this.failed) this.load();
    }

    render(ctx) {
      const W = E.W, H = E.H;
      ui.backdrop(ctx, E.time);
      ui.text(ctx, G.config.title, W / 2, H * 0.4, { size: 64 });
      if (this.failed) {
        ui.text(ctx, '资源加载失败', W / 2, H * 0.52, { size: 36, color: C.danger });
        ui.text(ctx, '点击屏幕重试', W / 2, H * 0.52 + 60, { size: 30, color: C.dim });
        return;
      }
      const bw = 420, bh = 16, x = (W - bw) / 2, y = H * 0.52;
      ctx.fillStyle = C.panel;
      ui.roundRect(ctx, x, y, bw, bh, bh / 2);
      ctx.fill();
      ctx.fillStyle = C.accent;
      ui.roundRect(ctx, x, y, Math.max(bh, bw * this.progress), bh, bh / 2);
      ctx.fill();
    }
  }

  E.register('boot', Boot);
})(window.G);
