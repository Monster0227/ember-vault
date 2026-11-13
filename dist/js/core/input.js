// 输入：把触摸 / 鼠标统一成逻辑坐标交给当前场景，并顺手挡掉页面自带的缩放、回弹和长按菜单。
(function (G) {
  'use strict';

  const I = G.input = {
    keys: {},       // 当前按住的键：I.keys.ArrowLeft === true（用 KeyboardEvent.code 命名）
    pointers: {},   // 当前按住的手指 / 鼠标：id → { x, y }（逻辑坐标），多指玩法用

    // handlers: { down, move, up, cancel, key }，由引擎传入
    init(canvas, handlers) {
      const E = G.engine;

      // 屏幕坐标 → 逻辑坐标。每次现取画布位置，页面被微信顶栏 / 工具栏挤动后也不会偏
      function toLogical(ev) {
        const r = canvas.getBoundingClientRect();
        return { x: (ev.clientX - r.left) * E.W / r.width, y: (ev.clientY - r.top) * E.H / r.height };
      }

      canvas.addEventListener('pointerdown', ev => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;   // 只认鼠标左键
        ev.preventDefault();
        const p = toLogical(ev);
        I.pointers[ev.pointerId] = p;
        try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}  // 手指滑出画布也继续收事件
        handlers.down(p.x, p.y, ev.pointerId);
      });

      canvas.addEventListener('pointermove', ev => {
        if (!I.pointers[ev.pointerId]) return;                       // 鼠标悬停不算
        const p = toLogical(ev);
        I.pointers[ev.pointerId] = p;
        handlers.move(p.x, p.y, ev.pointerId);
      });

      const end = (ev, cancelled) => {
        if (!I.pointers[ev.pointerId]) return;
        delete I.pointers[ev.pointerId];
        if (cancelled) {
          handlers.cancel(ev.pointerId);
        } else {
          const p = toLogical(ev);
          handlers.up(p.x, p.y, ev.pointerId);
        }
      };
      canvas.addEventListener('pointerup', ev => end(ev, false));
      canvas.addEventListener('pointercancel', ev => end(ev, true));

      // CSS 的 touch-action 之外再兜一层底：不许双指缩放、不许整页拖动 / 回弹、不弹长按菜单
      document.addEventListener('gesturestart', ev => ev.preventDefault());
      document.addEventListener('touchmove', ev => ev.preventDefault(), { passive: false });
      document.addEventListener('contextmenu', ev => ev.preventDefault());

      window.addEventListener('keydown', ev => {
        if (ev.repeat) return;
        I.keys[ev.code] = true;
        handlers.key(ev.code, true);
      });
      window.addEventListener('keyup', ev => {
        delete I.keys[ev.code];
        handlers.key(ev.code, false);
      });
      window.addEventListener('blur', () => { I.keys = {}; });   // 窗口失焦时当作所有键都松开
    }
  };
})(window.G);
