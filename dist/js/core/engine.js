// 引擎：画布自适应缩放、主循环、场景管理。
//
// 坐标系：游戏逻辑和绘制一律用“逻辑坐标”——宽固定为 config.designWidth（720），
// 高随屏幕比例在 [minHeight, maxHeight] 之间变化。引擎负责缩放到真实屏幕，写游戏时不用管像素和 dpr。
// 排版请用 G.engine.W / G.engine.H，不要写死高度。
(function (G) {
  'use strict';

  const cfg = G.config;
  const clamp = G.utils.clamp;

  // 手机横过来时盖一层“请竖屏游玩”（样式见 css/style.css，两处的媒体查询要一致）
  const LANDSCAPE = '(orientation: landscape) and (max-height: 520px) and (pointer: coarse)';
  const FADE = 0.16;   // 切场景时淡出、淡入各用的秒数

  // 场景基类：子类只覆盖用得到的方法
  class Scene {
    enter(params) {}                  // 进入场景，params 是 G.engine.go 的第二个参数
    exit() {}
    update(dt) {}                     // dt：距上一帧的秒数（最大 0.05）
    render(ctx) {}
    onPointerDown(x, y, id) {}        // 触摸 / 鼠标按下。x、y 是逻辑坐标，id 区分多根手指
    onPointerMove(x, y, id) {}        // 只在按住时触发
    onPointerUp(x, y, id) {}
    // 触摸被系统打断（比如被微信的手势抢走）：默认当作在屏幕外松手，按钮就不会误触发
    onPointerCancel(id) { this.onPointerUp(-9999, -9999, id); }
    onKey(code, down) {}              // 键盘（电脑上调试用），code 如 'Space'、'ArrowLeft'
    onResize(W, H) {}                 // 逻辑尺寸变了（旋转屏幕、缩放窗口），在这里重新排版
    onHide() {}                       // 切到后台 / 被横屏提示盖住：在这里暂停游戏
    onShow() {}
  }
  G.Scene = Scene;

  const scenes = {};
  const landscapeMq = window.matchMedia ? window.matchMedia(LANDSCAPE) : { matches: false };
  let canvas = null, ctx = null;
  let scene = null, sceneName = '';
  let trans = null;                   // 正在进行的场景切换 { t, name, params, switched }
  let queued = null;                  // 淡入期间又要求切换时，排在这里等淡入结束
  let last = 0;
  let suspended = false;
  let sized = false;                  // 是否量到过有效的窗口尺寸

  const E = G.engine = {
    W: cfg.designWidth,               // 当前逻辑宽高
    H: cfg.minHeight,
    scale: 1,                         // 1 个逻辑单位 = 多少 CSS 像素
    dpr: 1,
    time: 0,                          // 累计运行秒数（暂停时不走）

    get scene() { return scene; },
    get sceneName() { return sceneName; },

    register(name, SceneClass) {
      scenes[name] = SceneClass;
    },

    // 切换场景（带淡入淡出），切换过程中不响应输入。
    // 淡出阶段再调 go() 会被忽略（防连点、防每帧重复调用）；新场景在淡入阶段调的 go() 等淡入结束后执行
    go(name, params) {
      if (!scenes[name]) throw new Error('没有这个场景：' + name);
      if (!scene) { enterScene(name, params); return; }
      if (trans && !trans.switched) return;
      const next = { t: 0, name: name, params: params, switched: false };
      if (trans) queued = next; else trans = next;
    },

    start(first) {
      canvas = document.getElementById('game');
      ctx = canvas.getContext('2d');
      document.body.style.background = cfg.bgColor;
      const live = () => scene && !trans;
      G.input.init(canvas, {
        down: (x, y, id) => { if (live()) scene.onPointerDown(x, y, id); },
        move: (x, y, id) => { if (live()) scene.onPointerMove(x, y, id); },
        up: (x, y, id) => { if (live()) scene.onPointerUp(x, y, id); },
        cancel: id => { if (live()) scene.onPointerCancel(id); },
        key: (code, down) => { if (live()) scene.onKey(code, down); }
      });
      window.addEventListener('resize', scheduleResize);
      window.addEventListener('orientationchange', scheduleResize);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);
      document.addEventListener('visibilitychange', updateSuspend);
      scheduleResize();
      enterScene(first);
      last = performance.now();
      requestAnimationFrame(frame);
    }
  };

  function enterScene(name, params) {
    if (scene) scene.exit();
    scene = new scenes[name]();
    sceneName = name;
    scene.enter(params || {});
  }

  function frame(now) {
    requestAnimationFrame(frame);
    // 有的 WebView 刚启动时量到的窗口是 0×0，之后也不一定发 resize 事件，所以没量到之前每帧补量
    if (!sized) resize();
    // 切回前台或卡顿后的第一帧间隔可能很大，截断一下，免得东西“瞬移”
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (suspended) return;
    E.time += dt;
    step(dt);
    render(dt);
    if (!G.booted) booted();
  }

  function step(dt) {
    if (trans) {
      trans.t += dt;
      if (!trans.switched && trans.t >= FADE) {
        trans.switched = true;
        enterScene(trans.name, trans.params);
      }
      if (trans.t >= FADE * 2) {
        trans = queued;
        queued = null;
      }
    }
    if (scene) scene.update(dt);
  }

  function render(dt) {
    const W = E.W, H = E.H;
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(0, 0, W, H);
    if (scene) {
      ctx.save();
      scene.render(ctx);
      ctx.restore();
    }
    if (trans) {
      const a = trans.t < FADE ? trans.t / FADE : 1 - (trans.t - FADE) / FADE;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = cfg.bgColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (G.debug.on) G.debug.drawHud(ctx, E, dt);
  }

  // 第一帧画出来以后撤掉 HTML 里的“加载中”
  function booted() {
    G.booted = true;
    const splash = document.getElementById('splash');
    if (splash) splash.parentNode.removeChild(splash);
  }

  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!vw || !vh) return;
    sized = true;
    const W = cfg.designWidth;
    const H = clamp(vh / vw * W, cfg.minHeight, cfg.maxHeight);
    const scale = Math.min(vw / W, vh / H);
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr);
    const cssW = Math.round(W * scale), cssH = Math.round(H * scale);
    const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    if (canvas.width !== pw || canvas.height !== ph) {   // 改 width/height 会清空画布，没变就别动
      canvas.width = pw;
      canvas.height = ph;
    }
    const changed = W !== E.W || H !== E.H;
    E.W = W;
    E.H = H;
    E.scale = scale;
    E.dpr = dpr;
    updateSuspend();
    if (scene && changed) scene.onResize(W, H);
  }

  // iOS / 微信旋转屏幕后，innerWidth / innerHeight 要过一会儿才更新，所以稍后再量两次
  function scheduleResize() {
    resize();
    setTimeout(resize, 120);
    setTimeout(resize, 400);
  }

  function updateSuspend() {
    const s = document.hidden || landscapeMq.matches;
    if (s === suspended) return;
    suspended = s;
    last = performance.now();
    if (!scene) return;
    if (s) scene.onHide(); else scene.onShow();
  }
})(window.G);
