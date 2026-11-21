'use strict';
const assert = require('node:assert/strict');

// Driven by check-ember.js --routes. Advance the actual physics in 60 Hz steps.
// This pilot stays with the optional ember and enters the door after delivery.
module.exports = function checkRoutes({ t, press, release, stageOf, finishTalk }) {
  for (const theme of ['prison', 'sewers', 'ramparts', 'ossuary', 'tower']) {
    for (const character of theme === 'prison' ? ['lamp', 'bell', 'bow'] : ['lamp']) {
      t.reset(true, character);
      const index = stageOf(theme);
      if (theme !== 'prison') {
        t.unlocked = 4;
        t.startChapter(t.STAGES[index].chapter);
        finishTalk();
      }
      t.loadStage(index);
      const room = t.L, p = t.player;
      let frames = 0, deaths = 0, stalled = 0, lastX = p.x, delivered = false;
      press('KeyD');
      press('KeyJ');
      while (t.stage === index && frames < 300 * 60) {
        if (t.state === 'dead') {
          deaths++;
          if (t.checkpoint) t.respawn();
          else t.retryStage();
          press('KeyD');
          press('KeyJ');
        }
        const lead = p.x - t.run.guideX;
        const danger = room.spikes.some(([x,n]) => p.x > x-40 && p.x < x+n*20+30)
          || room.acid.some(([x,w]) => p.x > x-40 && p.x < x+w+30)
          || t.traps.some(trap => Math.abs(p.x-trap.x) < 100)
          || room.gaps.some(([a,b]) => p.x > a-60 && p.x < b+45);
        if (t.run.guideX >= room.exit) delivered = true;
        if (!delivered && p.x >= room.exit-55) { release('KeyD'); release('KeyA'); }
        else if (lead > 385) { release('KeyD'); press('KeyA'); }
        else if (lead < (danger ? 325 : 95) || p.x >= room.exit-15) { release('KeyA'); press('KeyD'); }
        else { release('KeyD'); release('KeyA'); }
        if (p.hp <= Math.max(40, p.max-60)) t.action('heal');

        const gap = room.gaps.some(([a,b]) => p.x+26 >= a-38 && p.x < b);
        const wall = t.platforms.some(a => a.solid && a.x > p.x && a.x < p.x+55 && p.y+p.h > a.y+4);
        if (p.ground && (gap || wall || (stalled > 4 && (lead < 95 || lead > 385)))) t.action('jump');
        if (character === 'lamp' && !p.ground && p.vy > 0 &&
            (gap || t.platforms.some(a => a.solid && Math.abs(a.x-p.x) < 60))) t.action('jump');

        const foe = t.enemies.find(e => !e.dead && Math.abs(e.x-p.x) < 130 && Math.abs(p.y-e.y) < 80);
        // A dash or roll near the open doorway would end the escort early.
        if (foe && (delivered || p.x < room.exit-350)) {
          if (p.soul >= 2) t.action('skill2');
          else if (p.soul && character !== 'lamp') t.action('skill1');
          if (character === 'bow' && t.bag.knife && Math.abs(p.x-foe.x) < 80) t.action('use');
          if (foe.wind > 0 && foe.wind < .15 && p.rollCd <= 0) t.action('roll');
        }
        stalled = Math.abs(p.x-lastX) < .1 ? stalled+1 : 0;
        lastX = p.x;
        t.step(1/60);
        frames++;
      }
      assert.equal(t.stage, index+1, theme+' / '+character+' must reach the next room');
      assert(delivered, theme+' escort route must deliver the ember before leaving');
      assert(frames >= 180*60, theme+' full escort should take at least three minutes');
      console.log(theme, character, (frames/60).toFixed(1)+'s', deaths+' deaths');
    }
  }
};

