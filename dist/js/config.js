// 全局配置：换游戏时先改这里。
(function (G) {
  'use strict';

  G.config = {
    title: '我的小游戏',          // 游戏里显示的标题。index.html 的 <title> 要同步改（微信分享卡片读的是那个）
    version: '0.1.0',             // 用 tools/bump-version.js 更新。菜单底部会显示，用来确认微信里加载的是不是最新版
    storageKey: 'h5game',         // 存档前缀。同一个域名下放多个游戏时，每个游戏用不同的值，否则会串档

    // 画面：逻辑宽度固定，逻辑高度按屏幕比例在 [minHeight, maxHeight] 之间变化（见 core/engine.js）
    designWidth: 720,
    minHeight: 960,               // 3:4。比这更“方”的屏幕（平板、电脑）左右留边
    maxHeight: 1560,              // 约 9:19.5。比这更“长”的手机上下留边
    maxDpr: 2,                    // 画布像素密度上限：3 倍屏也按 2 倍画，省电，看起来照样清楚

    bgColor: '#101426',           // 与 css/style.css 里的 background 保持一致
    fontFamily: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif',
    colors: {
      text: '#ffffff',
      dim: 'rgba(255,255,255,0.6)',
      primary: '#4cc9f0',
      accent: '#ffd166',
      danger: '#ef476f',
      good: '#06d6a0',
      panel: 'rgba(255,255,255,0.12)'
    },

    // 启动时预加载的图片：名字 → 路径。路径相对 index.html，文件名一律小写（GitHub Pages 区分大小写）
    images: {
      logo: 'assets/images/logo.svg'
    }
  };
})(window.G = window.G || {});
