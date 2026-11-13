// 存档：localStorage 的薄封装，存取任意可 JSON 化的值，键名自动加 config.storageKey 前缀。
// localStorage 不可用（隐私模式、被禁用、容量满）时退回内存：本次还能玩，只是关掉页面就没了。
(function (G) {
  'use strict';

  const prefix = G.config.storageKey + ':';
  const memory = {};
  let usable = true;
  try {
    localStorage.setItem(prefix + '_probe', '1');
    localStorage.removeItem(prefix + '_probe');
  } catch (e) {
    usable = false;
  }

  G.save = {
    get(key, fallback) {
      try {
        let raw = memory[key];
        if (raw === undefined && usable) raw = localStorage.getItem(prefix + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },

    set(key, value) {
      const raw = JSON.stringify(value);
      memory[key] = raw;
      if (!usable) return;
      try {
        localStorage.setItem(prefix + key, raw);
      } catch (e) {
        // 写不进去就只留在内存里
      }
    }
  };
})(window.G);
