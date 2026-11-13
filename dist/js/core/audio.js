// 音效：用 WebAudio 现场合成，不需要音频文件。
// 浏览器（包括微信）规定用户点过屏幕之后才允许出声，所以等第一次手势才创建并解锁 AudioContext。
(function (G) {
  'use strict';

  let ac = null;       // AudioContext
  let master = null;   // 总音量，静音时为 0
  let muted = !!G.save.get('muted', false);

  function swallow(p) {
    if (p && p.catch) p.catch(function () {});
  }

  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ac.destination);
    }
    if (ac.state === 'running') return;
    swallow(ac.resume());
    // 老版本 iOS 要在手势里真的播点东西才算解锁：播一个 1 个采样长的静音
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22050);
    src.connect(ac.destination);
    src.start(0);
  }
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (name) {
    document.addEventListener(name, unlock, true);
  });

  // 切到后台就停声，回来再继续
  document.addEventListener('visibilitychange', function () {
    if (ac) swallow(document.hidden ? ac.suspend() : ac.resume());
  });

  // 一个音：freq 起始频率（Hz），dur 时长（秒）
  // o: { type: 'sine'|'square'|'triangle'|'sawtooth', vol: 0~1, slide: 结束频率, delay: 延迟秒数 }
  function tone(freq, dur, o) {
    o = o || {};
    if (muted || !ac || ac.state !== 'running') return;
    const t0 = ac.currentTime + (o.delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.vol == null ? 0.15 : o.vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // 预设音效，按名字播放：G.audio.play('good')。想加新的就往这里加
  const sfx = {
    tap: () => tone(520, 0.07, { type: 'triangle', vol: 0.2 }),
    good: () => {
      tone(660, 0.08, { type: 'triangle' });
      tone(990, 0.12, { type: 'triangle', delay: 0.07 });
    },
    bad: () => tone(220, 0.25, { type: 'sawtooth', slide: 80, vol: 0.12 }),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, { type: 'triangle', delay: i * 0.1 })),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, { type: 'sawtooth', vol: 0.1, delay: i * 0.15 }))
  };

  G.audio = {
    tone,
    play(name) {
      if (sfx[name]) sfx[name]();
    },
    get muted() { return muted; },
    setMuted(value) {
      muted = !!value;
      G.save.set('muted', muted);
      if (master) master.gain.value = muted ? 0 : 1;
    },
    toggle() {
      this.setMuted(!muted);
      return muted;
    }
  };
})(window.G);
