// Animate details of the painted cover in the illustration's own coordinates.
(() => {
  'use strict';
  const art = new Image();
  art.src = new URL('../assets/images/bellwatch.jpg?v=pr4-24', document.currentScript.src).href;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const portrait = matchMedia('(orientation: portrait)');
  let surface, ctx, scarf, bell, fog;
  let lastFrame = -Infinity;

  // Fade the edges back into the original brushwork, even when a strip moves.
  function patch(x, y, width, height) {
    const tile = document.createElement('canvas');
    tile.width = width;
    tile.height = height;
    const g = tile.getContext('2d');
    g.drawImage(art, x, y, width, height, 0, 0, width, height);
    g.globalCompositeOperation = 'destination-in';
    for (const [dx, dy] of [[width, 0], [0, height]]) {
      const edge = g.createLinearGradient(0, 0, dx, dy);
      edge.addColorStop(0, 'transparent');
      edge.addColorStop(.08, '#fff');
      edge.addColorStop(.92, '#fff');
      edge.addColorStop(1, 'transparent');
      g.fillStyle = edge;
      g.fillRect(0, 0, width, height);
    }
    const buffer = document.createElement('canvas');
    buffer.width = width + 24;
    buffer.height = height + 24;
    return {tile, buffer, brush: buffer.getContext('2d')};
  }

  function fogBrush() {
    const tile = document.createElement('canvas');
    tile.width = 256;
    tile.height = 64;
    const g = tile.getContext('2d');
    g.scale(4, 1);
    const fade = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    fade.addColorStop(0, 'rgba(200,216,236,.34)');
    fade.addColorStop(.6, 'rgba(194,212,235,.15)');
    fade.addColorStop(1, 'rgba(194,212,235,0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 64);
    return tile;
  }

  function glow(x, y, radius, strength) {
    const light = ctx.createRadialGradient(x, y, 0, x, y, radius);
    light.addColorStop(0, 'rgba(255,238,165,' + strength + ')');
    light.addColorStop(.26, 'rgba(255,177,70,' + strength * .6 + ')');
    light.addColorStop(1, 'rgba(255,146,52,0)');
    ctx.fillStyle = light;
    ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  }

  function paintDetails(t) {
    const wind = .75 + .25 * Math.sin(t * .68);
    // Warp on the source pixel grid, then scale once to avoid seams on phones.
    scarf.brush.clearRect(0, 0, scarf.buffer.width, scarf.buffer.height);
    const ribbon = scarf.tile;
    for (let x = 0; x < ribbon.width; x += 3) {
      const u = x / ribbon.width, width = Math.min(3, ribbon.width - x);
      const dy = Math.sin(u * 8 - t * 2.6) * Math.min(1, u * 1.8) * 9 * wind;
      scarf.brush.drawImage(ribbon, x, 0, width, ribbon.height, 12 + x, 12 + Math.round(dy), width, ribbon.height);
    }
    ctx.drawImage(scarf.buffer, 1370 - 12, 500 - 12);
    // The bell swings from its crown. Its lip and clapper travel farthest.
    bell.brush.clearRect(0, 0, bell.buffer.width, bell.buffer.height);
    for (let y = 0; y < bell.tile.height; y += 2) {
      const swing = Math.min(1, y / 76) * Math.sin(t * 1.15) * 4.6;
      bell.brush.drawImage(bell.tile, 0, y, bell.tile.width, 2, 12 + Math.round(swing), 12 + y, bell.tile.width, 2);
    }
    ctx.drawImage(bell.buffer, 1305 - 12, 126 - 12);
    for (let i = 0; i < 4; i++) {
      const drift = Math.sin(t * .19 + i * 1.7);
      ctx.drawImage(fog, 480 + i * 174 + 64 * drift, 511 + i % 2 * 63 + 9 * drift, 415, 74);
    }
    ctx.globalCompositeOperation = 'screen';
    const flame = .45 + .18 * Math.sin(t * 3.1) + .06 * Math.sin(t * 7.2);
    glow(1186, 582, 77, flame);
    glow(1349, 179, 43, .25 + .12 * Math.sin(t * 1.15));
    for (let i = 0; i < 16; i++) {
      const age = (t * (.11 + i % 3 * .018) + i * .618) % 1;
      const x = 1186 + age * (53 + i % 5 * 24) + 8 * Math.sin(age * 7 + i);
      const y = 577 - age * (63 + i % 4 * 32);
      const intensity = Math.sin(Math.PI * age);
      ctx.globalAlpha = intensity * .88;
      ctx.fillStyle = i % 3 ? '#ffe5aa' : '#ffbe71';
      ctx.beginPath();
      ctx.ellipse(x, y, 1 + i % 2 * .55, 1.3 + i % 3 * .47, .48, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  window.EmberTitle = {
    mount(canvas) {
      surface = canvas;
      ctx = surface.getContext('2d');
      lastFrame = -Infinity;
    },
    unmount() {
      if (!surface) return;
      surface.width = 0;
      surface = ctx = null;
    },
    paint(now) {
      if (!ctx || !art.complete || !art.naturalWidth || document.hidden) return;
      if (motion.matches) {
        if (surface.width) surface.width = 0;
        lastFrame = -Infinity;
        return;
      }
      if (now - lastFrame < 1000 / 25) return;
      lastFrame = now;
      const width = surface.clientWidth, height = surface.clientHeight;
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.round(width * dpr), h = Math.round(height * dpr);
      if (surface.width !== w || surface.height !== h) {
        surface.width = w;
        surface.height = h;
      }
      if (!scarf) {
        scarf = patch(1370, 500, 302, 170);
        bell = patch(1305, 126, 87, 96);
        fog = fogBrush();
      }
      ctx.clearRect(0, 0, w, h);
      const scale = Math.max(width / art.naturalWidth, height / art.naturalHeight);
      const dx = (width - art.naturalWidth * scale) * (portrait.matches ? .84 : .5);
      const dy = (height - art.naturalHeight * scale) * (portrait.matches ? 0 : .5);
      ctx.save();
      ctx.setTransform(w / width * scale, 0, 0, h / height * scale, w / width * dx, h / height * dy);
      paintDetails(now / 1000);
      ctx.restore();
    }
  };
})();
