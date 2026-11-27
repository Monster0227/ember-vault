'use strict';
const assert = require('node:assert/strict');

// Driven by check-ember.js --routes. Advance the actual physics in 60 Hz steps.
// Walk from spawn using normal movement, combat and healing, accompanying the ember to every lamp.
module.exports = function checkRoutes({ t, press, release, stageOf, finishTalk, storage }) {
  function traverse(theme, character, mode) {
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
    const ordinary = [...t.enemies], npc=room.wayfarer, chest=t.chests[0], lore={x:room.lore.x,y:480};
    const combat=mode==='combat';
    t.settings.subtitleAdvance=combat?'auto':'manual';
    let spoke=false, storyFrames=0, rewardFrames=0, interrupted=false;
    const roadFoes = ordinary.filter(e=>e.floor===480&&!['flyer','hanger'].includes(e.type)).sort((a,b)=>a.origin-b.origin);
    let frames = 0, deaths = 0, stalled = 0, lastX = p.x, lastLit = 0;
    press('KeyD');
    press('KeyJ');
    while (t.stage === index && frames < 165 * 60) {
      if(t.state==='talk'){
        if(!combat)finishTalk();
        else {t.step(1/60);storyFrames++;frames++;}
        interrupted=true;continue;
      }
      if(t.state==='upgrade'||t.state==='chest'){
        if(t.state==='upgrade'){press('Digit1');release('Digit1');}
        t.step(1/60);rewardFrames++;frames++;interrupted=true;continue;
      }
      if(interrupted){press('KeyJ');interrupted=false;}
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
      const nextStop=combat&&[spoke?null:npc,chest.open?null:chest,t.flags.lore?null:lore].filter(o=>o&&o.x<=(wick?.x||room.exit)).sort((a,b)=>a.x-b.x)[0];
      const groundFoe=combat&&roadFoes.find(e=>!e.dead&&e.origin<=Math.min(nextStop?.x??Infinity,(wick?.x||room.exit)+25));
      const stop=(!groundFoe&&!ward)&&nextStop;
      // A revealed secret entrance overlaps the western edge of the tower lore prompt.
      const stopRadius=stop===lore?5:38;
      if(stop&&Math.abs(p.x+p.w/2-stop.x)<stopRadius&&Math.abs(p.y+p.h-stop.y)<(stop===npc?34:68)){
        t.action('interact');
        if(t.state!=='play'){if(stop===npc)spoke=true;continue;}
      }
      const enemy=ward||groundFoe;
      const reach=character==='bow'?115:35;
      const bank=groundFoe&&t.platforms.find(a=>a.groundBlock&&groundFoe.x+groundFoe.w/2>=a.x&&groundFoe.x+groundFoe.w/2<a.x+a.w);
      const fightingX=groundFoe?groundFoe.x+(groundFoe.x>p.x?-reach:reach):0;
      let target=room.exit+55;
      if(wick)target=wick.door?wick.x-p.w/2:wick.x+15;
      if(groundFoe)target=bank?Math.max(bank.x+p.w+12,Math.min(bank.x+bank.w-p.w-12,fightingX)):fightingX;
      if(ward)target=Math.max(wick.x-65,Math.min(wick.x+36,ward.x-36));
      if(stop)target=stop.x-p.w/2;
      const moving=Math.abs(target-p.x)>(stop===lore?3:13);
      if(moving&&target>p.x){release('KeyA');press('KeyD');}
      else if(moving){release('KeyD');press('KeyA');}
      else if(enemy&&Math.sign(enemy.x-p.x)!==p.face&&Math.abs(enemy.x-p.x)>5){release(enemy.x>p.x?'KeyA':'KeyD');press(enemy.x>p.x?'KeyD':'KeyA');}
      else {release('KeyD');release('KeyA');}
      if (p.hp <= Math.max(40, p.max-60)) t.action('heal');

      const gap = room.gaps.some(([a,b]) => p.x+26 >= a-38 && p.x < b);
      const wall = t.platforms.some(a => a.solid && a.x > p.x && a.x < p.x+55 && p.y+p.h > a.y+4);
      const atWick=!stop&&(!enemy||ward)&&wick&&Math.abs(p.x+p.w/2-wick.x)<75;
      const atStop=stop&&Math.abs(p.x+p.w/2-stop.x)<72;
      const climb=(atWick&&p.y+p.h>wick.y+(wick.y<480?26:48))||(atStop&&p.y+p.h>stop.y+32);
      const descend=(atWick&&p.y+p.h<wick.y-(wick.y<480?26:48))||(atStop&&p.y+p.h<stop.y-32);
      const reachGroundFoe=groundFoe&&Math.abs(groundFoe.x-p.x)<140&&p.y+p.h<groundFoe.floor-12;
      if((descend||reachGroundFoe)&&p.ground)press('KeyS');else release('KeyS');
      if (p.ground && ((ward?.phaseName==='aim'&&ward.age>ward.span-.19) || climb || descend || reachGroundFoe || (moving && (gap || wall || (stalled>4&&Math.abs(target-p.x)>75))))) t.action('jump');
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
    assert.equal(deaths,0,theme+' / '+character+' / '+mode+' survived the full route');
    const kills=ordinary.filter(e=>e.dead).length;
    console.log(theme, character, mode, (frames/60).toFixed(1)+'s', ((frames-storyFrames-rewardFrames)/60).toFixed(1)+'s action', (storyFrames/60).toFixed(1)+'s dialogue', (rewardFrames/60).toFixed(1)+'s chest', kills+'/'+ordinary.length+' ordinary enemies', deaths+' deaths');
    if(combat){
      assert(spoke&&chest.open&&t.keepsakes[room.lore.id], 'normal route visits its contact, claims the first chest and reads the roadside relic');
      assert(frames/60>=65&&frames/60<=125,'ordinary combat route remains near the ninety second target');
    } else assert(frames/60<70,'all lamps can be lit quickly');
    t.settings.subtitleAdvance='auto';
    if(mode==='combat')assert(roadFoes.every(e=>e.dead),theme+' engaged the ground encounters');
    // Finish the door fade before starting the next journey.
    for (let i=0; i<60; i++) t.step(1/60);
  }

  const oldExits = {prison:6000, sewers:6380, ramparts:6590, ossuary:6290, tower:6360};
  // Published v8 starting fires, raised bridge lamps, easternmost fires and exits.
  const v8Wicks={
    prison:[900,1550,6855,7840,8470,8940],sewers:[1060,4730,5830,8440,9700],
    ramparts:[1130,4690,5620,8218,9710,10200],ossuary:[990,4940,5320,5700,8500,9790,10260,10520],
    tower:[980,4860,5600,6620,9196,10770]
  };
  for (const [theme, oldExit] of Object.entries(oldExits)) {
    const index = stageOf(theme), room = t.STAGES[index];
    assert(room.exit >= t.STAGES[0].exit, 'first map is the shortest');
    for (const mode of ['fast','combat']) for (const hero of theme === 'prison' ? ['lamp','bell','bow'] : ['lamp']) traverse(theme, hero, mode);

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
      const previousGuide=120+(save.run.guideX-120)/(oldExit-120)*(room.compactExit-120);
      assert(Math.abs(t.run.guideX-t.player.x)<55,'the companion starts beside the restored player');
      assert.equal(t.run.shortcut, theme === 'ramparts');
      assert(t.secrets[1].open);
      const fog = t.run.seen['s'+index];
      assert.equal(fog.length, Math.ceil(room.w/100));
      assert(fog[0] && fog[fog.length-1] && !fog[Math.floor(fog.length/2)]);
      const persisted = JSON.parse(storage[key]);
      assert.equal(persisted.v, 9);
      const oldWicks=room.compactChecks.concat(room.compactExit);
      const next=oldWicks.filter(x=>x<=previousGuide+.5).length;
      assert.equal(persisted.run.litWicks,next===oldWicks.length?room.wicks.length:room.wicks.findIndex(w=>w.oldIndex===next));
      t.showMenu();
      t.continueRun(selected);
      assert.equal(t.player.checkX, persisted.checkX);
      assert(Math.abs(t.run.guideX-t.player.x)<55);

      // v3 used the compact map coordinates but saved only the travelling ember.
      const legacyX=selected?room.compactExit:room.compactChecks[1]-1;
      const v3=JSON.parse(storage[key]);
      v3.v=3;
      v3.run.guideX=legacyX;
      delete v3.run.litWicks;
      storage[key]=JSON.stringify(v3);
      t.showMenu();
      t.continueRun(selected);
      assert.equal(t.run.litWicks,selected?room.wicks.length:room.wicks.findIndex(w=>w.oldIndex===1));
      assert.equal(t.run.doorLift,selected?1:0);

      // v6 still had the compact checkpoint and previous lamp indices, including multi-guard waves.
      for(let n=0;n<=room.compactChecks.length;n++){
        const old=JSON.parse(JSON.stringify(save));
        old.v=6;old.checkX=n?room.compactChecks[n-1]:null;
        old.run.litWicks=n;old.run.wardParty=[0,28,56];storage[key]=JSON.stringify(old);
        t.showMenu();t.continueRun(selected);
        assert.equal(t.run.litWicks,room.wicks.findIndex(w=>w.oldIndex===n));
        assert.equal(t.player.checkX,n?room.wicks.find(w=>w.oldIndex===n-1).x:null);
        assert.equal(t.run.doorLift,0);
        if(room.wicks[t.run.litWicks].sentry)assert.equal(t.run.wardParty[0],0);
      }

      const oldFires=v8Wicks[theme];
      for(let n=0;n<=oldFires.length;n++){
        const old=JSON.parse(JSON.stringify(save));
        old.v=8;
        const last=Math.min(n,oldFires.length-1)-1;
        old.checkX=last<0?null:oldFires[last];
        old.run.guideX=old.checkX||120;
        old.run.litWicks=n;
        old.run.wardParty=[0];
        for(const [other,fires] of Object.entries(v8Wicks)){
          const fog=Array(Math.ceil((fires[fires.length-1]+180)/100)).fill(0);
          fog[Math.floor(fires[1]/100)]=fog[fog.length-1]=1;
          old.run.seen['s'+stageOf(other)]=fog;
        }
        old.run.found['bridge'+index]=n>room.roadBridge.wickIndex;
        storage[key]=JSON.stringify(old);
        t.showMenu();t.continueRun(selected);
        assert.equal(t.run.litWicks,n);
        assert.equal(t.player.checkX,last<0?null:room.wicks[last].x);
        if(last===room.roadBridge.wickIndex)assert.equal(t.player.y+t.player.h,room.roadLamp.y);
        assert.equal(t.run.doorLift,n===oldFires.length?1:0);
        assert.equal(t.run.shortcut,theme==='ramparts');
        assert.equal(!!t.flags.roadBridge,n>room.roadBridge.wickIndex);
        for(const other of Object.keys(v8Wicks)){
          const otherIndex=stageOf(other),otherRoom=t.STAGES[otherIndex],fog=t.run.seen['s'+otherIndex];
          assert.equal(fog.length,Math.ceil(otherRoom.w/100));
          assert(fog[Math.floor(otherRoom.wicks[1].x/100)]&&fog[fog.length-1]&&!fog[0]);
        }
      }
    }
    console.log(theme, 'v2, v3, v6 and v8 journey and selected-route saves migrated');
  }
};

