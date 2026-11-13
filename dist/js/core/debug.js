// 调试：网址后面加 ?debug=1，画面左上角显示帧率 / 分辨率 / 当前场景，报错直接打印在页面底部。
// 微信里没有控制台，真机上“白屏”“点了没反应”时靠它看原因。
(function (G) {
  'use strict';

  const on = /[?&]debug=1(&|$)/.test(location.search);
  const lines = [];
  let box = null;
  let fps = 60;

  function log(msg) {
    if (!on) return;
    lines.push(String(msg));
    if (lines.length > 10) lines.shift();
    if (!box) {
      box = document.createElement('pre');
      box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40%;margin:0;padding:6px 8px;' +
        'overflow:hidden;background:rgba(0,0,0,0.8);color:#ff9;font:12px/1.4 monospace;white-space:pre-wrap;' +
        'pointer-events:none;z-index:99;';
      document.body.appendChild(box);
    }
    box.textContent = lines.join('\n');
  }

  if (on) {
    // 用捕获阶段监听，脚本 / 图片加载失败这类不冒泡的错误也能收到
    window.addEventListener('error', function (e) {
      if (e.target && e.target !== window) log('✖ 加载失败：' + (e.target.src || e.target.href));
      else log('✖ ' + e.message + '  (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')');
    }, true);
    window.addEventListener('unhandledrejection', function (e) {
      log('✖ ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
    });
  }

  function drawHud(ctx, E, dt) {
    if (dt > 0) fps += (1 / dt - fps) * 0.1;
    ctx.save();
    ctx.font = '22px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const info = Math.round(fps) + 'fps ' + Math.round(E.W) + 'x' + Math.round(E.H) +
      ' x' + E.scale.toFixed(2) + ' dpr' + E.dpr + ' ' + E.sceneName;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, ctx.measureText(info).width + 16, 34);
    ctx.fillStyle = '#9f9';
    ctx.fillText(info, 8, 6);
    ctx.restore();
  }

  G.debug = { on, log, drawHud };
})(window.G);
