// 结算：分数滚动显示、最高分 / 新纪录，再来一局或回菜单。
(function (G) {
  'use strict';

  const E = G.engine, ui = G.ui, C = G.config.colors;

  class GameOver extends G.Scene {
    // params 来自 play.js：{ score, best, isNewBest }
    enter(p) {
      this.score = p.score || 0;
      this.best = p.best || 0;
      this.isNewBest = !!p.isNewBest;
      this.shown = 0;
      this.btns = new ui.ButtonGroup();
      this.againBtn = this.btns.add(new ui.Button({ text: '再来一局', onClick: () => E.go('play') }));
      this.homeBtn = this.btns.add(new ui.Button({
        text: '返回菜单', h: 96, size: 36, fill: C.panel, color: C.text,
        onClick: () => E.go('menu')
      }));
      this.layout();
      if (this.isNewBest) G.audio.play('win');
    }

    layout() {
      const W = E.W, H = E.H;
      this.againBtn.x = this.homeBtn.x = W / 2;
      this.againBtn.y = H * 0.64;
      this.homeBtn.y = H * 0.64 + 140;
    }

    onResize() { this.layout(); }

    update(dt) {
      this.shown += (this.score - this.shown) * Math.min(1, dt * 6);   // 分数滚上去
      if (this.score - this.shown < 0.5) this.shown = this.score;
      this.btns.update(dt);
    }

    render(ctx) {
      const W = E.W, H = E.H;
      ui.backdrop(ctx, E.time);
      ui.text(ctx, '游戏结束', W / 2, H * 0.2, { size: 68 });
      ui.text(ctx, String(Math.round(this.shown)), W / 2, H * 0.36, { size: 168, color: C.accent });
      ui.text(ctx, this.isNewBest ? '新纪录！' : '最高分 ' + this.best, W / 2, H * 0.36 + 130,
        { size: 40, color: this.isNewBest ? C.good : C.dim });
      this.btns.draw(ctx);
    }

    onPointerDown(x, y) { this.btns.down(x, y); }
    onPointerMove(x, y) { this.btns.move(x, y); }
    onPointerUp(x, y) { this.btns.up(x, y); }
  }

  E.register('gameover', GameOver);
})(window.G);
