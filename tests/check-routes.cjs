'use strict';
const assert = require('node:assert/strict');

// Driven by check-ember.js --routes. Advance the actual physics in 60 Hz steps.
// Walk from spawn using normal movement, combat and healing, both with and without the ember.
module.exports = function checkRoutes({ t, press, release, stageOf, finishTalk, storage }) {
  function traverse(theme, mode, character) {
    const index = stageOf(theme);
    if (theme === 'prison') {
      t.startJourney(character, 0);
      finishTalk();
      for (let i=0; i<60; i++) t.step(1/60);
      assert(t.run.guided, 'journey uses progressive combat skills');
    } else {
      t.startChapter(t.STAGES[index].chapter, t.STAGES[index], character);
      finishTalk();
    }
    assert.equal(t.stage, index);
    const room = t.L, p = t.player;
    let frames = 0, deaths = 0, stalled = 0, lastX = p.x, delivered = false;
    press('KeyD');
    press('KeyJ');
    while (t.stage === index && frames < 160 * 60) {
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
      if (mode === 'direct') { release('KeyA'); press('KeyD'); }
      else if (!delivered && p.x >= room.exit-55) { release('KeyD'); release('KeyA'); }
      else if (lead > 385) { release('KeyD'); press('KeyA'); }
      else if (lead < (danger ? 325 : 95) || delivered) { release('KeyA'); press('KeyD'); }
      else { release('KeyD'); release('KeyA'); }
      if (p.hp <= Math.max(40, p.max-60)) t.action('heal');

      const gap = room.gaps.some(([a,b]) => p.x+26 >= a-38 && p.x < b);
      const wall = t.platforms.some(a => a.solid && a.x > p.x && a.x < p.x+55 && p.y+p.h > a.y+4);
      if (p.ground && (gap || wall || (stalled > 4 && (mode === 'direct' || lead < 95 || lead > 385)))) t.action('jump');
      if (character === 'lamp' && !p.ground && p.vy > 0 &&
          (gap || t.platforms.some(a => a.solid && Math.abs(a.x-p.x) < 60))) t.action('jump');

      const foe = t.enemies.find(e => !e.dead && Math.abs(e.x-p.x) < 130 && Math.abs(p.y-e.y) < 80);
      // A dash or roll near the open doorway would end the escort early.
      if (foe && (mode === 'direct' || delivered || p.x < room.exit-350)) {
        if (p.soul >= 2 && (!t.run.guided || t.run.awakened >= 2)) t.action('skill2');
        else if (p.soul && character !== 'lamp' && (!t.run.guided || t.run.awakened >= 1)) t.action('skill1');
        if (character === 'bow' && t.bag.knife && Math.abs(p.x-foe.x) < 80) t.action('use');
        if (foe.wind > 0 && foe.wind < .15 && p.rollCd <= 0) t.action('roll');
      }
      stalled = Math.abs(p.x-lastX) < .1 ? stalled+1 : 0;
      lastX = p.x;
      t.step(1/60);
      frames++;
    }
    assert.equal(t.stage, index+1, theme+' / '+character+' '+mode+' must enter next room; stopped at '+p.x+' ember '+t.run.guideX+' deaths '+deaths);
    assert.equal(delivered, mode === 'escort', theme+' '+mode+' ember delivery');
    if (mode === 'escort') assert(frames > 78*60, theme+' escort has a distinct slower pace');
    assert(frames < (mode === 'direct' ? 35 : 140)*60, theme+' '+mode+' route stays short');
    console.log(theme, character, mode, (frames/60).toFixed(1)+'s', deaths+' deaths');
    // Finish the door fade before starting the next journey.
    for (let i=0; i<60; i++) t.step(1/60);
  }

  const oldExits = {prison:6000, sewers:6380, ramparts:6590, ossuary:6290, tower:6360};
  for (const [theme, oldExit] of Object.entries(oldExits)) {
    const index = stageOf(theme), room = t.STAGES[index];
    assert(room.exit-120 <= (oldExit-120)*2/3, theme+' is at least one third shorter');
    assert(room.exit >= t.STAGES[0].exit, 'first map is the shortest');
    for (const mode of ['direct','escort']) {
      for (const hero of theme === 'prison' ? ['lamp','bell','bow'] : ['lamp']) traverse(theme, mode, hero);
    }

    // Both save slots used absolute coordinates and a 100-pixel fog grid in v2.
    for (const selected of [false,true]) {
      t.showMenu();
      t.reset(true, 'bell');
      t.loadStage(index);
      const key = selected ? 'ember:selected-save' : 'ember:save';
      const save = JSON.parse(storage['ember:save']);
      save.v = 2;
      save.checkX = Math.round(oldExit*.87);
      save.run.guideX = selected ? oldExit : Math.round(oldExit*.81);
      save.run.shortcut = theme === 'ramparts';
      save.run.found['s'+index+':1'] = true;
      const oldFog = Array(Math.ceil((oldExit+180)/100)).fill(0);
      oldFog[0] = 1;
      oldFog[oldFog.length-1] = 1;
      save.run.seen['s'+index] = oldFog;
      storage[key] = JSON.stringify(save);
      t.showMenu();
      t.continueRun(selected);
      assert.equal(t.stage, index);
      assert(room.checks.includes(t.player.checkX));
      assert.equal(t.player.x, t.player.checkX+20);
      assert(t.platforms.some(a => a.groundBlock && a.x <= t.player.x && t.player.x+t.player.w <= a.x+a.w));
      const progress = (t.run.guideX-120)/(room.exit-120);
      assert(Math.abs(progress-(save.run.guideX-120)/(oldExit-120)) < .001);
      assert.equal(t.run.shortcut, theme === 'ramparts');
      assert(t.secrets[1].open);
      const fog = t.run.seen['s'+index];
      assert.equal(fog.length, Math.ceil(room.w/100));
      assert(fog[0] && fog[fog.length-1] && !fog[Math.floor(fog.length/2)]);
      const persisted = JSON.parse(storage[key]);
      assert.equal(persisted.v, 3);
      t.showMenu();
      t.continueRun(selected);
      assert.equal(t.player.checkX, persisted.checkX);
      assert.equal(t.run.guideX, persisted.run.guideX);
    }
    console.log(theme, 'v2 journey and selected-route save migration passed');
  }
};

