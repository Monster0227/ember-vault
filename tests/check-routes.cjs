'use strict';
const assert = require('node:assert/strict');

// Driven by check-ember.js --routes. Advance the actual physics in 60 Hz steps.
// Walk from spawn using normal movement, combat and healing, accompanying the ember to every lamp.
module.exports = function checkRoutes({ t, press, release, stageOf, finishTalk, storage }) {
  function traverse(theme, character) {
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
    let frames = 0, deaths = 0, stalled = 0, lastX = p.x, lastLit = 0;
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
      const wick=room.wicks[t.run.litWicks];
      if(t.run.litWicks!==lastLit){assert.equal(t.run.litWicks,lastLit+1);lastLit++;}
      const ward=t.enemies.find(e=>e.ward&&!e.dead);
      const target=ward ? Math.max(wick.x-65,Math.min(wick.x+36,ward.x-40)) : wick?wick.x-p.w/2:room.exit+55;
      const moving=Math.abs(target-p.x)>13;
      if(moving&&target>p.x){release('KeyA');press('KeyD');}
      else if(moving){release('KeyD');press('KeyA');}
      else if(ward&&Math.sign(ward.x-p.x)!==p.face&&Math.abs(ward.x-p.x)>5){release(ward.x>p.x?'KeyA':'KeyD');press(ward.x>p.x?'KeyD':'KeyA');}
      else {release('KeyD');release('KeyA');}
      if (p.hp <= Math.max(40, p.max-60)) t.action('heal');

      const gap = room.gaps.some(([a,b]) => p.x+26 >= a-38 && p.x < b);
      const wall = t.platforms.some(a => a.solid && a.x > p.x && a.x < p.x+55 && p.y+p.h > a.y+4);
      const atWick=wick&&Math.abs(p.x+p.w/2-wick.x)<75;
      const climb=atWick&&p.y+p.h>wick.y+(wick.y<480?26:48);
      const descend=atWick&&p.y+p.h<wick.y-(wick.y<480?26:48);
      if(descend)press('KeyS');else release('KeyS');
      if (p.ground && ((ward?.phaseName==='aim'&&ward.age>ward.span-.19) || climb || descend || (moving && (gap || wall || stalled>4)))) t.action('jump');
      if (character === 'lamp' && !p.ground && p.vy > 0 &&
          (gap || t.platforms.some(a => a.solid && Math.abs(a.x-p.x) < 60))) t.action('jump');

      const foe = t.enemies.find(e => !e.dead && Math.abs(e.x-p.x) < 130 && Math.abs(p.y-e.y) < 80);
      if (foe) {
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
    release('KeyA');release('KeyD');release('KeyS');release('KeyJ');
    assert.equal(t.stage,index+1,theme+' / '+character+' stopped at '+p.x+' feet '+(p.y+p.h)+' fire '+t.run.guideX+' lamps '+lastLit+' deaths '+deaths);
    assert.equal(lastLit,room.wicks.length);
    console.log(theme, character, (frames/60).toFixed(1)+'s', deaths+' deaths');
    assert(frames>=78*60&&frames<=105*60,theme+' main route time '+frames/60);
    // Finish the door fade before starting the next journey.
    for (let i=0; i<60; i++) t.step(1/60);
  }

  const oldExits = {prison:6000, sewers:6380, ramparts:6590, ossuary:6290, tower:6360};
  for (const [theme, oldExit] of Object.entries(oldExits)) {
    const index = stageOf(theme), room = t.STAGES[index];
    assert(room.exit-120 <= (oldExit-120)*2/3, theme+' is at least one third shorter');
    assert(room.exit >= t.STAGES[0].exit, 'first map is the shortest');
    for (const hero of theme === 'prison' ? ['lamp','bell','bow'] : ['lamp']) traverse(theme, hero);

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
      const previousGuide = 120+(save.run.guideX-120)/(oldExit-120)*(room.exit-120);
      assert(Math.abs(t.run.guideX-t.player.x)<55,'the companion starts beside the restored player');
      assert.equal(t.run.shortcut, theme === 'ramparts');
      assert(t.secrets[1].open);
      const fog = t.run.seen['s'+index];
      assert.equal(fog.length, Math.ceil(room.w/100));
      assert(fog[0] && fog[fog.length-1] && !fog[Math.floor(fog.length/2)]);
      const persisted = JSON.parse(storage[key]);
      assert.equal(persisted.v, 5);
      assert.equal(persisted.run.litWicks,room.wicks.filter(w=>w.x<=previousGuide+.5).length);
      t.showMenu();
      t.continueRun(selected);
      assert.equal(t.player.checkX, persisted.checkX);
      assert(Math.abs(t.run.guideX-t.player.x)<55);

      // v3 used the compact map coordinates but saved only the travelling ember.
      const legacyX=selected?room.exit:room.wicks[1].x-1;
      const v3=JSON.parse(storage[key]);
      v3.v=3;
      v3.run.guideX=legacyX;
      delete v3.run.litWicks;
      storage[key]=JSON.stringify(v3);
      t.showMenu();
      t.continueRun(selected);
      assert.equal(t.run.litWicks,room.wicks.filter(w=>w.x<=legacyX).length);
      assert.equal(t.run.doorLift,selected?1:0);
    }
    console.log(theme, 'v2 and v3 journey and selected-route saves migrated');
  }
};

