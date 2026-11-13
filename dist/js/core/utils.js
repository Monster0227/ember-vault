// 常用小函数。
(function (G) {
  'use strict';

  G.utils = {
    clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),                      // [a, b) 的随机小数
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),   // [a, b] 的随机整数（含两端）
    pick: arr => arr[Math.floor(Math.random() * arr.length)],
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),

    // 缓动：t 从 0 到 1，返回 0 到 1。outBack 会略微冲过头再回来，适合“弹出来”的效果
    ease: {
      outCubic: t => 1 - Math.pow(1 - t, 3),
      inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
      outBack: t => {
        const c = 1.70158;
        return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
      }
    }
  };
})(window.G);
