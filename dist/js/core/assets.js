// 资源加载：预加载 config.images 里的图片，带进度；失败自动重试，手机网络抖一下不至于卡死。
(function (G) {
  'use strict';

  const images = {};
  const RETRIES = 2;

  // 资源网址带上版本号，发新版后微信不会继续用缓存里的旧图
  function url(path) {
    return path + (path.indexOf('?') < 0 ? '?' : '&') + 'v=' + encodeURIComponent(G.config.version);
  }

  function loadImage(path) {
    return new Promise(function (resolve, reject) {
      let left = RETRIES;
      (function attempt() {
        const img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () {
          if (left-- > 0) setTimeout(attempt, 500);
          else reject(new Error('图片加载失败：' + path));
        };
        img.src = url(path);
      })();
    });
  }

  G.assets = {
    images,

    // 取已加载的图片，没有则返回 null
    img(name) {
      return images[name] || null;
    },

    // manifest: { 名字: 路径 }。onProgress(0~1) 每加载完一张调用一次
    loadAll(manifest, onProgress) {
      const names = Object.keys(manifest || {});
      const report = onProgress || function () {};
      let done = 0;
      if (!names.length) {
        report(1);
        return Promise.resolve();
      }
      return Promise.all(names.map(function (name) {
        return loadImage(manifest[name]).then(function (img) {
          images[name] = img;
          report(++done / names.length);
        });
      }));
    }
  };
})(window.G);
