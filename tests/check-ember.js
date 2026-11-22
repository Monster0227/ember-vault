'use strict';
// Headless deterministic checks for combat and traversal. Browser QA is separate.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const listeners = {}, nodes = {}, storage = {'ember:intro-v3':'1','ember:tutorial':'1'};   // 开场旁白只在“第一次玩”时出现，测试里默认已看过
const noop = () => {};
const context = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({width:0}) : noop, set: () => true });
function node(id) {
  return nodes[id] || (nodes[id] = {
    hidden:false, style:{}, classList:{add:noop, remove:noop}, textContent:'', innerHTML:'',
    getContext:() => context, querySelectorAll:() => [], addEventListener:noop
  });
}
const sandbox = {
  document:{getElementById:node, querySelectorAll:() => [], addEventListener:noop},
  innerWidth:1100, innerHeight:620, devicePixelRatio:1,
  localStorage:{getItem:k => storage[k], setItem:(k,v) => storage[k]=v},
  addEventListener:(event,fn) => listeners[event]=fn,
  requestAnimationFrame:noop, console, Math, Set
};
const routeCheck = typeof process !== 'undefined' && process.argv.includes('--routes');
if (routeCheck) {
  let seed = 3571;
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296);
}
sandbox.window=sandbox;
sandbox.matchMedia=() => ({matches:false});
let code=fs.readFileSync(require('path').join(__dirname,'../dist/js/ember.js'),'utf8');
// Instrument only this VM instance; no test controls are shipped in the browser.
code=code.replace(/\}\)\(\);\s*$/, 'window.test={step,action,selectLevel,renderChapters,showWinPanel,hurt,strike,hitEnemy,killEnemy,startChapter,finish,reset,respawn,loadStage,retryStage,STAGES,TALK,get bag(){return bag},get relics(){return relics},get keepsakes(){return keepsakes},get sel(){return sel},set sel(v){sel=v},get offers(){return offers},get flags(){return flags},get run(){return run},get codex(){return codex},get thrown(){return thrown},get breakables(){return breakables},get hazards(){return hazards},get loot(){return loot},get floats(){return floats},get gateK(){return gateK},get talk(){return talk},set introSeen(v){introSeen=v},get player(){return p},get enemies(){return enemies},get shots(){return shots},get waves(){return waves},get orbs(){return orbs},get fx(){return fx},get chunks(){return chunks},get platforms(){return platforms},get chests(){return chests},get state(){return state},get score(){return score},get stage(){return stage},get unlocked(){return unlocked},set unlocked(v){unlocked=v},get L(){return L},get embers(){return embers},set embers(v){embers=v},get checkpoint(){return checkpoint},get credits(){return credits},get sceneArt(){return sceneA},get cine(){return cine},get traps(){return traps},get clears(){return clears},set clears(v){clears=v},get cycle(){return cycle},set cycle(v){cycle=v},useSkill,get secrets(){return secrets},hasMap,parseLine,relicPool,gainShard,gainBlueprint,startTutorial,finishTutorial,TUTORIAL,CHARS,SKILLS,showMenu,startJourney,continueRun,finishRebind,SONGS,get settings(){return settings},get BIND(){return BIND},set rebinding(v){rebinding=v},get cam(){return cam},set cam(v){cam=v}};})();');
vm.runInNewContext(code,sandbox);
const t=sandbox.test;
function advance(seconds) { for(let i=0;i<Math.ceil(seconds*120);i++)t.step(1/120); }
function press(code) { listeners.keydown({code,repeat:false,preventDefault:noop}); }
function release(code) { listeners.keyup({code}); }
function finishTalk() { for(let i=0;i<60&&t.state==='talk';i++)press('KeyE'); }
function finishCine() { for(let i=0;i<600&&t.state==='cine';i++)t.step(1/60); }
const FINAL=t.STAGES.length-1, stageOf=theme=>t.STAGES.findIndex(s=>s.theme===theme&&!s.arena&&!s.rest),firstRest=()=>t.STAGES.findIndex(s=>s.rest&&s.restNo===0);
if (routeCheck) {
  require('./check-routes.cjs')({t,press,release,stageOf,finishTalk,storage});
  return;
}
let passed=0;
function test(name,fn) { t.reset();fn();passed++;console.log('PASS '+name); }
test('movement, landing, double jump and no third jump',()=>{
  press('KeyD');advance(.4);release('KeyD');assert(t.player.x>190);
  t.action('jump');advance(.08);assert(t.player.y<428);assert.equal(t.player.jumps,1);
  t.action('jump');advance(.08);assert.equal(t.player.jumps,2);
  const vy=t.player.vy;t.action('jump');advance(.02);assert(t.player.vy>vy);
  advance(1.3);assert(t.player.ground);assert.equal(t.player.jumps,0);
});
test('the ember follows both shoulders, jumps and ground rolls',()=>{
  const p=t.player;
  const attached=()=>{assert(Math.abs(t.run.guideX-(p.x+p.w/2))<=35.01);assert(Math.abs(t.run.guideY-(p.y+5))<=23.01);};
  press('KeyD');advance(.6);attached();assert(t.run.guideX<p.x);
  t.action('jump');advance(.2);attached();assert(t.run.guideY<385);
  release('KeyD');press('KeyA');advance(.6);attached();assert(t.run.guideX>p.x+p.w);
  advance(.3);t.action('roll');advance(.11);attached();release('KeyA');
});
test('a quick jump tap between ticks makes a short hop and a held jump clears a lamp shelf',()=>{
  advance(.05);const p=t.player, floor=p.y;
  press('Space');release('Space');advance(.15);const tap=floor-p.y;assert(tap>5&&tap<30);
  advance(.6);press('Space');advance(.28);release('Space');assert(floor-p.y>80);
  t.reset(true,'bell');Object.assign(t.player,{y:200,ground:false,coyote:0,jumps:0,vy:60});
  t.action('jump');advance(.02);assert(t.player.vy>0,'the bell cannot jump in midair after grace expires');t.reset(true,'lamp');
});
test('platform collision and landing above ground',()=>{
  t.player.x=520;t.player.y=280;t.player.vy=0;advance(.5);
  assert.equal(t.player.y,370-t.player.h);assert(t.player.ground);
});
test('one hit per enemy per swing, combo and kill reward',()=>{
  const e=t.enemies.find(e=>e.type==='guard'&&e.max===72);assert(e);e.cd=99;t.player.y=e.floor-t.player.h;t.player.inv=100;t.player.face=1;const dmg=t.player.damage;
  t.player.x=e.x-40;t.action('attack');advance(.15);assert.equal(e.hp,72-dmg);
  t.player.x=e.x-40;advance(.15);t.action('attack');advance(.2);assert.equal(e.hp,72-dmg*2);
  let n=2;while(!e.dead&&n<8){t.player.x=e.x-40;t.player.face=1;advance(.2);t.action('attack');advance(.2);n++;}
  assert(e.dead);assert(n>3,'the agile knife does not fell a guard in three hits');assert.equal(t.score,25);
});
test('attack recovery delays the next input without extending the swing or the bow charge',()=>{
  for(const hero of ['lamp','bell']){
    t.reset(true,hero);t.action('attack');
    assert.equal(t.player.attack,14/60);assert.equal(t.player.atkCd,16/60);
    advance(.245);assert.equal(t.player.attack,0);assert(t.player.atkCd>0);
    assert(!t.fx.some(f=>f.k==='contact'),'a missed swing draws no contact');
    t.action('attack');advance(.055);assert(t.player.attack>0,'buffered follow-up fires after recovery');
  }
  t.reset(true,'bow');press('KeyJ');assert.equal(t.player.chargeMax,.45);release('KeyJ');t.step(1/120);
  assert.equal(t.player.atkCd,8/60);t.reset(true,'lamp');
});
test('roll immunity, cooldown and damage recovery',()=>{
  t.action('roll');t.hurt(20,200);assert.equal(t.player.hp,100);
  advance(.4);t.hurt(20,200);assert.equal(t.player.hp,80);
  t.hurt(20,200);assert.equal(t.player.hp,80);
  const cd=t.player.rollCd;t.action('roll');assert.equal(t.player.rollCd,cd);
});
test('healing consumes one flask only when injured',()=>{
  t.action('heal');assert.equal(t.player.potions,1);
  t.player.hp=40;t.action('heal');assert.equal(t.player.hp,100);assert.equal(t.player.potions,0);
  t.action('heal');assert.equal(t.player.hp,100);
});
test('chest pops open with a short animation, then offers rewards and stops combat',()=>{
  t.player.x=600;t.player.y=318;t.action('interact');assert.equal(t.state,'chest');assert(t.chests[0].open);
  const x=t.player.x,ex=t.enemies[0].x;advance(.4);assert.equal(t.state,'chest');assert(t.chests[0].openT>.3&&t.chests[0].openT<1);assert.equal(t.enemies[0].x,ex,'the world waits');
  advance(.6);assert.equal(t.state,'upgrade');assert.equal(t.offers.length,3);advance(2);assert.equal(t.player.x,x);
});
test('pause freezes actors and resume returns to play',()=>{
  press('Escape');assert(sandbox.EmberGame.paused);const x=t.enemies[0].x;advance(1);assert.equal(t.enemies[0].x,x);
  press('Escape');assert(!sandbox.EmberGame.paused);
});
test('platform enemy stays on its platform',()=>{
  const e=t.enemies[3];t.player.x=1550;t.player.y=318;t.player.inv=100;
  advance(5);assert(e.x>=1650&&e.x+e.w<=1830);
});
test('archer fires projectiles and boss locks exit',()=>{
  t.player.x=800;t.player.y=243;t.player.inv=100;advance(1.65);assert(t.shots.length>0);
  t.loadStage(FINAL);t.flags.boss=true;t.player.x=t.L.seal+30;t.player.y=428;t.player.inv=100;advance(.1);assert.equal(t.state,'play');assert.equal(t.stage,FINAL);assert(t.player.x<=t.L.seal);
});
test('death, restart, victory and best-score storage',()=>{
  t.player.hp=20;t.hurt(200,200);assert.equal(t.state,'dead');t.reset();assert.equal(t.player.hp,100);assert.equal(t.stage,0);
  t.loadStage(FINAL);t.enemies.find(e=>e.type==='boss').dead=true;t.player.x=t.L.seal+30;advance(.1);
  assert.equal(t.state,'cine','the bell rings first');assert.equal(t.score,200);assert.equal(storage['ember:best'],'200');
  advance(4.2);assert.equal(t.state,'win');assert(t.talk&&t.talk.auto,'the ending narration plays by itself');
});
test('archers hold fire while off-screen and shoot once visible',()=>{
  t.player.x=1400;t.player.y=303;t.player.vy=0;t.player.inv=100;t.player.face=1;t.cam=1015;
  advance(1.2);assert.equal(t.shots.length,0);
  t.player.face=-1;advance(1.2);assert(t.shots.length>0);
});
test('boss enrages at half health, roars, then slams out shockwaves that can be jumped or rolled',()=>{
  t.loadStage(FINAL);t.flags.boss=true;const b=t.enemies.find(e=>e.type==='boss');b.hp=b.max/2;b.cd=0;t.player.x=b.x-80;t.player.inv=100;
  advance(.05);assert(b.rage);assert(b.roar,'it roars before phase two');advance(4);assert.equal(t.waves.length,2,'the phase-two slam sends a wave each way');
  t.waves.length=0;b.frozen=99;t.enemies.forEach(e=>{if(e.type!=='boss')e.dead=true;});   // 冻住首领，单独检查冲击波
  const ground=()=>{t.player.x=900;t.player.y=428;t.player.vx=0;t.player.vy=0;t.player.inv=0;t.player.roll=0;t.player.rollCd=0;t.player.hp=100;t.player.face=1;advance(.05);};
  ground();t.waves.push({x:t.player.x+13+90,dir:-1,life:1});advance(.5);assert.equal(t.player.hp,80);
  ground();t.waves.push({x:t.player.x+13+90,dir:-1,life:1});t.action('jump');advance(.5);assert.equal(t.player.hp,100);
  ground();t.waves.push({x:t.player.x+13+60,dir:-1,life:1});t.action('roll');advance(.4);assert.equal(t.player.hp,100);
});
test('checkpoint lights, heals and respawn restarts only the boss fight',()=>{
  t.loadStage(FINAL);t.player.hp=40;t.player.potions=0;t.player.x=t.L.checkpoint+20;t.player.y=428;advance(.05);
  assert(t.checkpoint);assert.equal(t.player.hp,100);assert.equal(t.player.potions,1);
  const b=t.enemies.find(e=>e.type==='boss');b.hp=60;b.rage=true;
  t.player.hp=20;t.player.inv=0;t.hurt(500,0);assert.equal(t.state,'dead');
  t.respawn();assert.equal(t.state,'play');assert.equal(t.player.hp,100);assert(t.player.x>t.L.checkpoint);assert.equal(b.hp,60);assert(b.rage,'the depleted phase stays');
});
test('slain enemies fade out before disappearing',()=>{
  const e=t.enemies[0];e.hp=1;e.cd=99;t.player.x=e.x-40;t.player.face=1;t.player.inv=100;
  t.action('attack');advance(.12);
  assert(e.dead);assert(e.dieT>.3);advance(.55);assert.equal(e.dieT,0);
});
test('the interaction button offers an unopened chest and hides on an empty stretch',()=>{
  t.player.x=600;t.player.y=318;t.player.vy=0;advance(.02);assert.equal(nodes['chest-btn'].hidden,false);
  assert.equal(nodes['chest-btn'].textContent,'开箱');
  t.player.x=190;t.player.y=428;advance(.02);assert.equal(nodes['chest-btn'].hidden,true);
});
test('hud text follows health and potions',()=>{
  t.player.inv=0;t.hurt(10,0);advance(.02);assert.equal(nodes.stats.textContent,'4 / 5');assert.equal((nodes.health.innerHTML.match(/life-ghost/g)||[]).length,5);assert.equal((nodes.health.innerHTML.match(/lost/g)||[]).length,1);assert.equal(nodes['potion-count'].textContent,1);
});
test('roll follows the held direction and covers a short dash',()=>{
  for(const hero of ['bow','bell','lamp']){
    t.reset(true,hero);t.player.x=1800;t.player.face=1;press('KeyA');t.action('roll');release('KeyA');assert.equal(t.player.face,-1);
    const x0=t.player.x;advance(.3);const d=x0-t.player.x;assert(d>110&&d<200,'roll distance '+d);
    t.player.face=1;advance(1);const x1=t.player.x;t.action('roll');advance(.3);assert(t.player.x-x1>110,'without input it rolls the way it faces');
  }
});
test('a buffered roll remembers a briefly tapped direction during an attack',()=>{
  t.player.face=1;t.action('attack');press('KeyA');t.action('roll');release('KeyA');
  advance(.17);assert(t.player.roll>0);assert.equal(t.player.rollDir,-1);
});
test('arrows fly over a rolling player but hit a standing one',()=>{
  t.enemies.forEach(e=>e.dead=true);
  t.player.x=1800;t.player.face=-1;advance(.05);
  t.shots.push({x:t.player.x+13-60,y:t.player.y+20,vx:320,life:2});t.action('roll');advance(.2);
  assert.equal(t.player.hp,100);assert.equal(t.shots.length,1);
  advance(1);t.shots.length=0;t.player.inv=0;t.shots.push({x:t.player.x+13-60,y:t.player.y+20,vx:320,life:2});advance(.3);
  assert.equal(t.player.hp,80);assert.equal(t.shots.length,0);
});
test('slain enemies scatter embers that fly into the player',()=>{
  const e=t.enemies[0];e.hp=1;e.cd=99;t.player.x=e.x-40;t.player.face=1;t.player.inv=100;
  t.action('attack');advance(.12);
  assert(e.dead);assert(t.orbs.length>=5);advance(2);assert.equal(t.orbs.length,0);
});
test('chest rewards mix an upgrade, an item and usually a relic, picked with 1 / 2 / 3',()=>{
  const keys=['Digit1','Digit2','Digit3'],open=(x,y)=>{t.player.x=x;t.player.y=y;t.player.vy=0;t.action('interact');advance(1);assert.equal(t.state,'upgrade');};
  open(600,318);assert.deepEqual(t.offers.slice(0,2).map(o=>o.kind),['up','use']);
  const u=t.offers[1],before=t.bag[u.id];press(keys[1]);assert.equal(t.state,'play');assert.equal(t.bag[u.id],before+u.n);assert.equal(t.sel,u.id);
  open(2050,228);const up=t.offers[0],stat={blade:'damage',heart:'max',flask:'potions'}[up.id],v=stat?t.player[stat]:t.player.skills[up.id];press('Numpad1');assert((stat?t.player[stat]:t.player.skills[up.id])>v,'upgrade applied');
  open(3000,228);const third=t.offers[2];press('Digit3');assert.equal(t.state,'play');if(third.kind==='relic')assert(t.relics[third.id]);
});
test('holding up turns the swing into an up slash that reaches a guard above',()=>{
  const e=t.enemies[3];t.player.x=e.x+1;t.player.y=428;t.player.vy=0;t.player.face=1;t.player.inv=100;advance(.02);
  press('KeyW');t.action('attack');advance(.12);release('KeyW');assert.equal(e.hp,e.max-t.player.damage);
  advance(.4);t.action('attack');advance(.12);assert.equal(e.hp,e.max-t.player.damage,'a side slash cannot reach the platform above');
});
test('down slash in the air hits a guard below and bounces off it',()=>{
  const e=t.enemies[2];e.cd=99;t.player.x=e.x+1;t.player.y=340;t.player.vy=0;t.player.ground=false;t.player.inv=100;
  press('KeyS');t.action('attack');advance(.12);release('KeyS');assert.equal(e.hp,e.max-t.player.damage);assert(t.player.vy<-300,'bounced, vy='+t.player.vy);
});
test('down slash bounces off spikes instead of landing on them',()=>{
  t.player.x=t.L.spikes[0][0]+30;t.player.y=390;t.player.vy=200;t.player.ground=false;t.player.inv=0;
  press('KeyS');t.action('attack');advance(.12);release('KeyS');assert(t.player.vy<0,'bounced');advance(.2);assert.equal(t.player.hp,100);
});
test('side slash only reaches as far as the drawn arc',()=>{
  const e=t.enemies[0];e.cd=99;t.player.face=1;t.player.inv=100;t.player.y=428;t.player.x=e.x-100-13;t.action('attack');advance(.12);assert.equal(e.hp,e.max,'100 away is out of reach');
  advance(.4);t.player.x=e.x-80-13;t.action('attack');advance(.12);assert(e.hp<e.max,'80 away is inside the arc');
});
test('a slash cuts arrows out of the air',()=>{
  t.enemies.forEach(e=>e.dead=true);
  t.player.x=1800;t.player.y=428;t.player.face=-1;t.player.inv=0;advance(.05);
  t.shots.push({x:t.player.x+13-50,y:t.player.y+20,vx:320,life:2});t.action('attack');advance(.12);
  assert.equal(t.shots.length,0);assert.equal(t.player.hp,100);
});
test('heal is on L now, H does nothing',()=>{
  t.player.hp=40;press('KeyH');release('KeyH');assert.equal(t.player.hp,40);assert.equal(t.player.potions,1);
  press('KeyL');release('KeyL');assert.equal(t.player.hp,100);assert.equal(t.player.potions,0);
});
test('four chapters contain five maps, four dedicated boss arenas and four waystations',()=>{
  const maps=t.STAGES.filter(s=>!s.rest&&!s.arena),rests=t.STAGES.filter(s=>s.rest),arenas=t.STAGES.filter(s=>s.arena);
  assert.equal(maps.length,5);assert.equal(rests.length,4);assert.equal(arenas.length,4);assert.equal(new Set(arenas.map(s=>s.chapter)).size,4);
  for(const map of maps)map.bands.forEach(([start],i)=>{
    const end=map.bands[i+1]?.[0]??map.exit;
    assert(map.ens.filter(([x])=>x>=start&&x<end).length>=3,map.name+' patrol density');
  });
  t.STAGES.forEach((s,i)=>{t.loadStage(i);assert.equal(t.state,'play');assert.equal(t.player.x,120);
    if(s.rest)assert.equal(t.enemies.length,0);else if(s.arena)assert.equal(t.enemies.filter(e=>e.type==='boss').length,1);else assert(t.enemies.length>=8,s.name+' has enemies');
    assert(s.arena?s.seal<s.w-100:s.exit<s.w-100,s.name+' has a way out');
    const floor=t.platforms.filter(a=>a.h>100&&!a.solid).reduce((n,a)=>n+a.w,0),gaps=s.gaps.reduce((n,g)=>n+g[1]-g[0],0);assert.equal(floor+gaps,s.w);});
});
test('each main-map door stays shut until every wick catches in order',()=>{
  for(const room of t.STAGES.filter(s=>s.lesson)){
    const index=t.STAGES.indexOf(room);t.loadStage(index);
    t.player.inv=100;
    for(const [i,wick] of room.wicks.entries()){
      Object.assign(t.player,{x:room.exit-38,y:480-t.player.h,vy:0});
      press('KeyD');advance(.5);release('KeyD');
      assert.equal(t.stage,index);assert.equal(t.run.litWicks,i);
      assert(t.player.x+t.player.w<=room.exit-10);
      Object.assign(t.player,{x:wick.x-98,y:480-t.player.h,vy:0});advance(.05);
      for(let wave=0;wave<8&&t.run.wardParty?.some(hp=>hp>0);wave++){
        for(const ward of t.enemies.filter(e=>e.ward&&!e.dead)){
          const hit=()=>t.hitEnemy(ward,10,1,false,ward.x,ward.y,0);
          const hp=ward.hp;hit();assert.equal(ward.hp,hp-10,'an arriving sentry is vulnerable');
          assert.equal(ward.hpBeforeHit,hp);assert(ward.hitT>0&&ward.hitDir===1);
          assert(t.fx.some(f=>f.k==='contact'&&f.target===ward&&!f.open));
          ward.phaseName='open';hit();assert.equal(ward.hp,hp-30,'bright core takes double damage');
          assert(t.fx.some(f=>f.k==='contact'&&f.target===ward&&f.open));
          t.hitEnemy(ward,ward.max,1,false,ward.x,ward.y,0);
          assert(ward.dead);
        }
        Object.assign(t.player,{x:wick.x-98,y:480-t.player.h,vy:0});advance(.25);
      }
      assert(!t.run.wardParty?.some(hp=>hp>0),'each patrol is finite');
      if(wick.y<480-48){
        Object.assign(t.player,{x:wick.x-13,y:480-t.player.h,vy:0});advance(.04);
        assert.equal(t.run.litWicks,i,'a raised lamp needs a jump');
      }
      Object.assign(t.player,{x:wick.x-13,y:wick.y-t.player.h,vy:0});advance(.17);
      assert.equal(t.run.litWicks,i+1,room.name+' wick '+i);
    }
    advance(.5);assert.equal(t.run.doorLift,1);
    press('KeyD');advance(1.4);release('KeyD');assert.equal(t.stage,index+1);
  }
});
test('the exit leads to a boss arena, then a waystation and the next chapter with stats kept',()=>{
  t.run.litWicks=t.L.wicks.length;t.run.doorLift=1;t.player.damage=40;t.player.potions=2;t.embers=55;t.player.x=t.L.exit+20;t.player.y=428;advance(1);
  assert(t.L.arena);assert.equal(t.player.damage,40);assert.equal(t.embers,55);
  t.enemies.find(e=>e.type==='boss').dead=true;t.player.x=t.L.seal+20;advance(1);assert(t.L.rest);
  t.player.x=t.L.exit+20;t.player.y=428;advance(1);finishTalk();assert.equal(t.L.name,'腐水下水道');assert.equal(t.player.potions,2);assert.equal(t.embers,55);
});
test('the merchant sells healing for embers and you can walk away',()=>{
  t.loadStage(firstRest());t.embers=100;t.player.hp=40;t.player.x=t.L.shop-13;t.player.y=428;advance(.02);
  assert.equal(nodes['chest-btn'].hidden,false);assert.equal(nodes['chest-btn'].textContent,'商店');
  t.action('interact');assert.equal(t.state,'talk','he says hello first');finishTalk();assert.equal(t.state,'shop');assert(t.codex.lore.merchant);
  press('Digit1');assert.equal(t.player.hp,t.player.max);assert.equal(t.embers,60);
  press('Digit1');assert.equal(t.embers,60,'no charge when already at full health');
  press('Digit2');assert.equal(t.player.potions,2);assert.equal(t.embers,0);
  press('Digit3');assert.equal(t.bag.bomb,0,'cannot afford it');
  const x=t.player.x;advance(.5);assert.equal(t.player.x,x,'the world waits while shopping');
  press('Escape');assert.equal(t.state,'play');assert(!sandbox.EmberGame.paused);
  t.action('interact');assert.equal(t.state,'shop','only one hello per visit');
});
test('kills pay embers, and later maps hit harder with tougher enemies',()=>{
  const e=t.enemies[0];e.hp=1;e.cd=99;t.player.x=e.x-40;t.player.face=1;t.player.inv=100;
  t.action('attack');advance(.12);assert(e.dead);assert.equal(t.embers,25);
  t.loadStage(stageOf('sewers'));assert.equal(t.enemies[0].max,Math.round(72*1.35));
  t.loadStage(stageOf('ramparts'));const el=t.enemies.find(q=>q.elite);assert(el);assert.equal(el.max,Math.round(260*1.7));assert(el.w>30);
  t.player.inv=0;t.player.x=1400;t.shots.push({x:t.player.x+13-60,y:t.player.y+20,vx:320,life:2,d:Math.round(12*t.L.dmgK)});advance(.3);assert.equal(t.player.hp,80);
});
test('falling into a rampart gap hurts and puts you back on solid ground',()=>{
  t.loadStage(stageOf('ramparts'));t.player.x=780;t.player.y=428;advance(.05);
  t.player.x=950;t.player.y=430;t.player.vy=0;t.player.ground=false;advance(.8);
  assert.equal(t.player.hp,80);assert(t.player.x<900-26,'back before the gap');assert.equal(t.player.y,428);
});
test('sewer acid burns and cannot be pogoed off',()=>{
  t.loadStage(stageOf('sewers'));const a=t.L.acid[0];t.player.x=a[0]+40;t.player.y=428;advance(.2);assert.equal(t.player.hp,100,'acid warns before it bites');advance(.4);assert(t.player.hp<100);
  t.player.inv=100;t.player.x=a[0]+40;t.player.y=388;t.player.vy=200;t.player.ground=false;press('KeyS');t.action('attack');advance(.12);release('KeyS');assert(t.player.vy>0,'no bounce off acid');
});
test('dying on a later map retries it with the stats you came in with',()=>{
  t.player.damage=50;t.player.potions=3;t.embers=120;t.loadStage(stageOf('sewers'));
  t.embers=300;t.player.potions=0;t.player.hp=20;t.player.inv=0;t.hurt(999,0);assert.equal(t.state,'dead');
  t.retryStage();assert.equal(t.state,'play');assert.equal(t.stage,stageOf('sewers'));assert.equal(t.embers,120);assert.equal(t.player.potions,3);assert.equal(t.player.damage,50);assert(t.player.hp>=50);
});
test('hits knock enemies back but never off their ledge, with slash marks; kills shatter',()=>{
  const e=t.enemies[3];e.cd=99;e.x=1830-e.w-6;e.hp=e.max=400;t.player.x=e.x-45;t.player.y=318;t.player.vy=0;t.player.face=1;t.player.inv=100;advance(.02);
  t.action('attack');advance(.12);assert(t.fx.some(f=>f.kind==='blade'&&f.target===e),'directional cut on the struck enemy');assert(e.kb>0,'knocked back');
  for(let i=0;i<4;i++){advance(.4);assert(e.x+e.w<=1830&&e.x>=1650,'stays on its ledge');t.player.x=e.x-45;t.player.y=318;t.player.face=1;t.action('attack');advance(.12);}
  e.hp=1;advance(.4);t.player.x=e.x-45;t.player.y=318;t.action('attack');advance(.12);assert(e.dead);assert(t.chunks.length>=8,'shattered');
});
test('the prologue plays on the very first run only',()=>{
  t.introSeen=false;delete storage['ember:intro-v3'];t.reset();assert.equal(t.state,'talk');assert.equal(t.talk.lines,t.TALK.prologue);
  const x=t.enemies[0].x;advance(1);assert.equal(t.enemies[0].x,x,'nothing moves while talking');
  finishTalk();assert.equal(t.state,'play');assert.equal(storage['ember:intro-v3'],'1');assert(t.codex.lore.prologue);
  t.reset();assert.equal(t.state,'play');
});
test('the bellkeeper tells the story and hands over a fire flask',()=>{
  t.player.x=t.L.npc-13;t.player.y=428;advance(.02);assert.equal(nodes['chest-btn'].textContent,'交谈');
  t.action('interact');assert.equal(t.state,'talk');assert.equal(t.talk.lines,t.TALK.keeper);
  press('KeyE');assert.equal(t.talk.i,0,'first press shows the whole line');press('KeyE');assert.equal(t.talk.i,1,'second press turns the page');
  finishTalk();assert.equal(t.state,'play');assert.equal(t.bag.bomb,1);assert(t.codex.lore.keeper);
  t.action('interact');assert.equal(t.talk.lines,t.TALK.keeper2,'afterwards he only says one line');finishTalk();
});
test('each floor hides a keepsake that unlocks a page of lore',()=>{
  const s=t.L.lore;t.player.x=s.x-13;t.player.y=428;advance(.02);assert.equal(nodes['chest-btn'].textContent,'查看');
  t.action('interact');finishTalk();assert(t.keepsakes[s.id]);assert(t.codex.lore[s.id]);assert(t.codex.items[s.id]);assert.equal(t.embers,25,'story discovery rewards exploration');
  advance(.02);assert.equal(nodes['chest-btn'].hidden,true,'nothing left to read here');
});
test('fire flasks burst on enemies, knives fly straight, the frost bell freezes',()=>{
  const e=t.enemies[0];e.cd=99;t.player.inv=100;t.player.face=1;t.player.x=e.x-240;e.max=e.hp=72;t.bag.bomb=1;t.sel='bomb';press('KeyU');release('KeyU');assert.equal(t.thrown.length,1);assert.equal(t.bag.bomb,0);
  advance(.9);assert.equal(t.thrown.length,0);assert.equal(e.hp,72-55);
  t.reset();const g=t.enemies[0];g.cd=99;t.player.inv=100;t.player.face=1;t.player.x=g.x-200;g.max=g.hp=72;t.bag.knife=2;t.sel='knife';press('KeyU');release('KeyU');advance(.4);assert.equal(g.hp,72-30);assert.equal(t.bag.knife,1);
  t.reset();const f=t.enemies[0];t.player.face=1;t.player.x=f.x-60;t.player.inv=0;t.bag.frost=1;t.sel='frost';press('KeyU');release('KeyU');assert(f.frozen>2.5);
  const fx0=f.x;advance(1.5);assert.equal(f.x,fx0,'frozen enemies stand still');assert.equal(t.player.hp,100,'and cannot attack');advance(2);assert.equal(f.frozen,0);
});
test('relics: the plate blocks every third hit, second wind saves a ghost, and the pendant heals after four kills',()=>{
  t.relics.plate=true;t.hurt(20,0);assert.equal(t.player.hp,80);t.player.inv=0;t.hurt(20,0);assert.equal(t.player.hp,60);t.player.inv=0;t.hurt(20,0);assert.equal(t.player.hp,60);
  t.reset();t.relics.wind=true;t.player.hp=20;t.hurt(50,0);assert.equal(t.player.hp,20);assert.equal(t.state,'play');t.player.inv=0;t.hurt(50,0);assert.equal(t.state,'dead');
  t.reset(false,'bell');t.relics.leech=true;t.player.hp=60;for(const e of t.enemies.slice(0,4))t.killEnemy(e);assert.equal(t.player.hp,80);t.reset(false,'lamp');
});
test('the bag opens with B, and the codex keeps sightings, kills and items across runs',()=>{
  press('KeyB');release('KeyB');assert.equal(t.state,'bag');const x=t.enemies[0].x;advance(1);assert.equal(t.enemies[0].x,x);press('Escape');assert.equal(t.state,'play');
  t.cam=0;advance(.02);assert(t.codex.seen.guard);const k=t.codex.kills.guard||0,e=t.enemies[0];e.hp=1;t.player.x=e.x-45;t.player.face=1;t.player.inv=100;t.action('attack');advance(.12);
  assert.equal(t.codex.kills.guard,k+1);assert(JSON.parse(storage['ember:codex']).kills.guard>=1,'saved to the device');
  t.reset();assert.equal(t.codex.kills.guard,k+1,'a new run keeps the codex');assert.equal(t.bag.bomb,0,'but starts with an empty bag');
});
test('the warden speaks when you enter his hall; after a retry only one line',()=>{
  t.loadStage(FINAL);t.enemies.forEach(e=>{if(e.type!=='boss')e.dead=true;});t.player.x=t.L.trigger+20;t.player.y=428;t.player.inv=0;advance(.02);
  assert.equal(t.state,'talk');assert.equal(t.talk.lines,t.TALK.boss);advance(2);assert.equal(t.player.hp,100,'he waits while talking');finishTalk();assert.equal(t.state,'play');
  t.player.hp=20;t.hurt(999,0);t.retryStage();t.enemies.forEach(e=>{if(e.type!=='boss')e.dead=true;});t.player.x=t.L.trigger+20;t.player.y=428;advance(.02);assert.equal(t.talk.lines,t.TALK.boss2);finishTalk();
  const b=t.enemies.find(e=>e.type==='boss');b.hp=1;t.player.x=b.x-60;t.player.face=1;t.player.inv=100;t.action('attack');advance(.12);assert(b.dead);assert.equal(t.state,'cine','the defeat plays out first');finishCine();assert.equal(t.talk.lines,t.TALK.bossDown);assert(t.talk.auto,'and the lines run by themselves');finishTalk();assert(t.codex.lore.warden);
});
test('the waystation sells items and one relic per visit',()=>{
  t.loadStage(firstRest());t.embers=1000;t.player.x=t.L.shop-13;t.player.y=428;advance(.02);t.action('interact');finishTalk();assert.equal(t.state,'shop');
  press('Digit3');press('Digit4');press('Digit5');assert.deepEqual([t.bag.bomb,t.bag.knife,t.bag.frost],[2,4,1]);
  const before=t.embers;press('Digit6');assert.equal(Object.keys(t.relics).length,1);const after=t.embers;assert(after<before);press('Digit6');assert.equal(t.embers,after,'sold out');
});
test('soul charges only from melee and casts a damaging projectile at three charges',()=>{
  const e=t.enemies[0];e.hp=e.max=200;e.cd=99;t.player.inv=100;t.player.x=e.x-45;t.player.face=1;
  for(let i=0;i<3;i++){t.player.x=e.x-45;t.action('attack');advance(.4);}
  assert.equal(t.player.soul,3);const hp=e.hp;t.player.x=e.x-190;t.action('cast');assert.equal(t.player.soul,0);assert(t.thrown.some(o=>o.k==='soul'));advance(.4);assert(e.hp<hp);assert.equal(t.player.soul,0,'soul projectile does not recharge itself');
  const inFlight=t.thrown.length;t.action('cast');assert.equal(t.thrown.length,inFlight,'cannot cast without charge');
});
test('campfire restores once per station, and retry restores skills and soul from the entry snapshot',()=>{
  t.player.skills.flame=2;t.player.soul=2;t.loadStage(stageOf('sewers'));t.player.skills.flame=3;t.player.soul=0;t.retryStage();assert.equal(t.player.skills.flame,2);assert.equal(t.player.soul,2);
  t.loadStage(firstRest());t.player.x=t.L.fire-13;t.player.y=428;t.player.hp=12;t.player.potions=0;t.player.soul=0;t.action('interact');assert.equal(t.player.hp,t.player.max);assert.equal(t.player.potions,1);assert.equal(t.player.soul,3);t.player.hp=50;t.action('interact');assert.equal(t.player.hp,50,'campfire is single use');
});
test('soul upgrade increases damage and can pierce multiple enemies',()=>{
  const a=t.enemies[0],b=t.enemies[2];a.cd=b.cd=99;a.hp=a.max=200;b.hp=b.max=200;a.x=a.origin=500;b.x=b.origin=550;a.y=b.y=434;a.floor=b.floor=480;t.player.x=300;t.player.y=428;t.player.face=1;t.player.inv=100;t.player.skills.flame=1;t.player.soul=3;t.action('cast');advance(.5);assert.equal(a.hp,142);assert.equal(b.hp,142);
});
test('breakable urns pay once and are restored on a stage retry',()=>{
  const b=t.breakables[0];assert.equal(b.kind,0);t.player.x=b.x-40;t.player.face=1;t.player.inv=100;t.action('attack');advance(.12);assert(b.broken);assert.equal(t.embers,20);advance(.4);t.action('attack');advance(.12);assert.equal(t.embers,20);t.retryStage();assert(!t.breakables[0].broken);assert.equal(t.embers,0);
});
test('the boss telegraphs and fires an aimed flame at a distant player',()=>{
  t.loadStage(FINAL);t.flags.boss=true;t.enemies.forEach(e=>{if(e.type!=='boss')e.dead=true;});const b=t.enemies.find(e=>e.type==='boss');t.player.x=b.x-300;t.player.y=428;t.player.inv=100;b.spellCd=0;advance(.05);assert(b.spell);assert(b.wind>0);assert.equal(t.shots.length,0);advance(1);assert(t.shots.some(s=>s.flame),'after the warning a flame travels toward the player');
});
test('the merchant sells one attack upgrade per station',()=>{
  t.loadStage(firstRest());t.embers=1000;t.player.x=t.L.shop-13;t.action('interact');finishTalk();const damage=t.player.damage;press('Digit7');assert.equal(t.player.damage,damage+8);const cash=t.embers;press('Digit7');assert.equal(t.player.damage,damage+8);assert.equal(t.embers,cash);
});
test('freezing the warden cancels a queued ranged attack',()=>{
  t.loadStage(FINAL);t.flags.boss=true;t.enemies.forEach(e=>{if(e.type!=='boss')e.dead=true;});const b=t.enemies.find(e=>e.type==='boss');t.player.x=b.x-100;t.player.y=428;t.player.inv=100;b.spell=true;b.wind=.3;b.spellCd=99;t.bag.frost=1;t.sel='frost';t.action('use');assert(!b.spell);assert.equal(b.wind,0);advance(.5);assert.equal(t.shots.length,0);
});
test('new relics reward soul casting, healthy swordplay and repeated kills',()=>{
  t.relics.wick=true;t.player.hp=60;t.player.soul=3;t.action('cast');assert.equal(t.player.hp,80);
  t.reset();t.relics.hunter=true;const e=t.enemies[0];e.hp=100;e.cd=99;t.player.x=e.x-45;t.player.inv=100;t.action('attack');advance(.12);assert.equal(e.hp,100-Math.round(t.player.damage*1.3));
  t.reset();t.relics.salvager=true;for(const foe of t.enemies.slice(0,4))t.killEnemy(foe);assert.equal(t.bag.bomb,1);
});
test('down plus jump drops through only the current suspended platform',()=>{
  t.player.x=520;t.player.y=318;t.player.vy=0;t.player.ground=true;t.player.jumps=0;t.platforms.push({x:460,y:420,w:170,h:22});press('KeyS');press('Space');advance(.3);release('Space');release('KeyS');assert.equal(t.player.y,420-t.player.h);assert(t.player.ground,'landed on the lower platform');
});
test('down plus jump on solid ground or a raised block still jumps',()=>{
  press('KeyS');press('Space');advance(.05);release('Space');release('KeyS');assert(t.player.y<428&&t.player.vy<0,'solid floor does not drop');
  t.reset();const a=t.platforms.find(p=>p.solid);t.player.x=a.x+15;t.player.y=a.y-t.player.h;t.player.ground=true;press('KeyS');press('Space');advance(.05);release('Space');release('KeyS');assert(t.player.y<a.y-t.player.h&&t.player.vy<0,'raised stone is solid');
});
test('raised terrain blocks walking through its side and can be jumped onto',()=>{
  const a=t.platforms.find(p=>p.solid);t.player.inv=100;t.player.x=a.x-t.player.w-5;press('KeyD');advance(.2);release('KeyD');assert(t.player.x+t.player.w<=a.x+.01,'side blocks the player');t.action('jump');press('KeyD');advance(.45);release('KeyD');assert(t.player.x>a.x-t.player.w,'jump passes the ledge');advance(.6);assert(t.player.ground);
});
test('enemies and caches start outside the new solid terrain',()=>{
  for(const i of ['prison','sewers','ramparts','ossuary','tower'].map(stageOf)){t.loadStage(i);for(const e of t.enemies)for(const a of t.platforms.filter(q=>q.solid))assert(!(e.floor>a.y&&e.origin+e.w>a.x&&e.origin<a.x+a.w),t.L.name+' enemy starts inside a solid');for(const b of t.breakables)for(const a of t.platforms.filter(q=>q.solid))assert(!(b.x>a.x-13&&b.x<a.x+a.w+13),t.L.name+' urn starts inside a solid');}
});
test('ground rolls stop at exposed banks and platform ends in both directions; a jump can leave them',()=>{
  for(const hero of ['lamp','bell','bow'])for(const direction of [-1,1]){
    for(const raised of [false,true]){
      t.reset(true,hero);t.enemies.forEach(e=>e.dead=true);
      const p=t.player,top=raised?370:480;
      const deck={x:1900,y:top,w:240,h:raised?22:160,groundBlock:!raised};
      t.platforms.splice(0,t.platforms.length,deck);
      p.x=direction>0?deck.x+deck.w-p.w-20:deck.x+20;
      p.y=top-p.h;p.ground=true;p.face=direction;
      const start=p.x;t.action('roll');advance(.65);
      assert((p.x-start)*direction>10,'roll advanced');
      assert(p.ground&&Math.abs(p.y+p.h-top)<.01,'still supported');
      assert(p.x+p.w/2>deck.x&&p.x+p.w/2<deck.x+deck.w,'stops over the edge');
      const code=direction>0?'KeyD':'KeyA';press(code);t.action('jump');advance(.65);release(code);
      assert(direction>0?p.x>deck.x+deck.w:p.x+p.w<deck.x,'deliberate jump clears the edge');
    }
  }
});
test('real prison trench has solid banks and can be rolled through from either side',()=>{
  for(const [hero,x,face,direction] of [['lamp',2118,1,1],['bow',2118,1,1],['bell',2242,-1,-1]]){
    t.reset(true,hero);t.enemies.forEach(e=>e.dead=true);
    const p=t.player;Object.assign(p,{x,y:480-p.h,face,ground:true,inv:3});
    t.action('roll');
    for(let i=0;i<72;i++){
      t.step(1/60);
      assert(p.y+p.h<=506.01,'feet never sink below trench floor');
    }
    assert((p.x-x)*direction>90,'crossed the bank');assert(p.ground);
  }
  t.reset(true,'lamp');
});
test('a ground enemy cannot walk into an elevated stone ledge',()=>{
  const e=t.enemies[0],a=t.platforms.find(q=>q.solid);t.player.x=a.x+80;t.player.inv=100;advance(5);assert(e.x+e.w<=a.x+.01);
});
test('a defeated chapter boss unlocks a replay with a balanced fresh loadout',()=>{
  t.reset();const idx=t.STAGES.findIndex(s=>s.bossKind==='lock');t.loadStage(idx);t.killEnemy(t.enemies[0]);assert.equal(storage['ember:unlocked'],'2');assert.equal(nodes['chapter-2'].disabled,false);assert.equal(nodes['chapter-3'].disabled,true);t.startChapter(2);assert.equal(t.L.chapter,2);assert(t.L.chapterStart);assert.equal(t.state,'talk');assert.equal(t.player.damage,23);assert.equal(t.player.hp,120);assert.equal(t.player.potions,2);assert.equal(t.bag.bomb,2);
});
test('all four boss arenas have an intro, a sealed exit and the correct continuation',()=>{
  for(const arena of t.STAGES.filter(s=>s.arena)){t.reset();const index=t.STAGES.indexOf(arena);t.loadStage(index);t.player.x=arena.trigger+20;t.player.y=428;t.player.inv=100;advance(.03);assert.equal(t.state,'talk',arena.name+' has an introduction');assert(t.talk.arena);assert(!t.sceneArt);finishTalk();const b=t.enemies.find(e=>e.type==='boss');t.player.x=arena.seal+20;advance(.03);assert.equal(t.state,'play');assert.equal(t.stage,index);assert(t.player.x<=arena.seal);t.killEnemy(b);assert.equal(t.state,'cine',arena.name+' has a defeat scene');finishCine();assert.equal(t.state,'talk',arena.name+' has a conclusion');assert(t.talk.arena);assert(!t.sceneArt);finishTalk();t.player.x=arena.seal+20;advance(1.8);if(arena.bossKind==='warden'){finishCine();assert.equal(t.state,'win');}else{assert.equal(t.stage,index+1);assert(t.L.rest);}}
});
test('later chapters introduce their own story when entered from the waystation',()=>{
  for(const chapter of [2,3,4]){t.reset();const idx=t.STAGES.findIndex(s=>s.chapterStart&&s.chapter===chapter);t.loadStage(idx-1);assert(t.L.rest);t.player.x=t.L.exit+25;t.player.y=428;advance(1);assert.equal(t.stage,idx);assert.equal(t.state,'talk');assert(t.talk.lines.length>=3);finishTalk();assert.equal(t.state,'play');}
});
test('the lock beast charges across its hall, hits the wall, shakes rocks loose and is left dazed',()=>{
  t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='lock'));t.flags.boss=true;const b=t.enemies[0];b.cd=0;t.player.x=b.x-420;t.player.y=428;t.player.inv=100;
  advance(.05);assert.equal(b.move,'charge');assert(b.wind>0,'it scrapes and vents steam before charging');assert.equal(t.shots.length,0,'no projectiles');
  for(let i=0;i<400&&!b.stun;i++)t.step(1/120);
  assert(b.stun,'it crashed');assert(b.x<=t.L.gate+15,'it ran the whole hall');assert.equal(t.hazards.filter(h=>h.k==='rock').length,3,'rocks start to fall');
  advance(.1);const hp=b.hp;t.player.x=b.x+b.w+10;t.player.face=-1;t.action('attack');advance(.12);assert(b.stun&&b.hp<hp,'a dazed beast can be punished');
});
test('the drowned lantern spits arcing globs that leave acid pools, and dives where blades cannot reach',()=>{
  t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='brood'));t.flags.boss=true;const b=t.enemies[0];b.cd=0;b.spellCd=99;t.player.x=b.x-300;t.player.y=428;t.player.inv=100;
  advance(.05);assert.equal(b.move,'spit');advance(.8);const globs=t.shots.filter(s=>s.k==='glob');assert.equal(globs.length,3);assert(globs.every(s=>s.g>0),'they fly in arcs');
  advance(1.2);assert(t.hazards.some(h=>h.k==='pool'),'globs leave pools of acid');
  t.shots.length=0;t.hazards.length=0;Object.assign(b,{move:'',wind:0,act:0,rec:0,cd:0,spellCd:0});advance(.7);assert(b.under>.5,'it sinks');
  const hp=b.hp;t.player.x=b.x;t.player.face=1;t.action('attack');advance(.12);assert.equal(b.hp,hp,'a submerged lantern cannot be cut');
});
test('the standard-bearer plants its banner and spectral spears burst up one after another',()=>{
  t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='standard'));t.flags.boss=true;const b=t.enemies[0];b.spellCd=0;t.player.x=b.x-300;t.player.y=428;t.player.inv=100;
  advance(.05);assert.equal(b.move,'plant');advance(.8);const sp=t.hazards.filter(h=>h.k==='spear');assert(sp.length>=4,'a line of spears');
  assert(sp.every((h,i)=>i===0||h.delay>sp[i-1].delay),'each spear rises a moment after the last');assert(sp.every(h=>h.x<b.x),'they march toward the player');
});
test('the warden tolls his bell in phase two; the ring is too tall to jump but can be rolled through',()=>{
  t.loadStage(FINAL);t.flags.boss=true;t.enemies.forEach(e=>{if(e.type!=='boss')e.dead=true;});const b=t.enemies.find(e=>e.type==='boss');b.rage=true;b.tollCd=0;b.spellCd=99;b.cd=99;t.player.x=b.x-400;t.player.y=428;t.player.inv=100;
  advance(.05);assert.equal(b.move,'toll');advance(.7);assert.equal(t.waves.filter(w=>w.k==='toll').length,2);
  b.frozen=99;t.waves.length=0;const ground=()=>{t.player.x=900;t.player.y=428;t.player.vx=0;t.player.vy=0;t.player.inv=0;t.player.roll=0;t.player.rollCd=0;t.player.hp=100;t.player.face=1;advance(.05);};
  ground();t.waves.push({x:t.player.x+13+90,dir:-1,life:1,k:'toll',h:150,v:330,d:20});t.action('jump');advance(.5);assert(t.player.hp<100,'jumping does not clear the toll');
  ground();t.waves.push({x:t.player.x+13+60,dir:-1,life:1,k:'toll',h:150,v:330,d:20});t.action('roll');advance(.4);assert.equal(t.player.hp,100,'rolling through it does');
});
test('cutting one of the warden\'s soul-flames frees it and gives back a soul charge',()=>{
  t.loadStage(FINAL);t.player.x=t.L.trigger-100;t.player.y=428;t.player.face=1;t.player.inv=100;advance(.02);t.player.soul=0;t.shots.push({k:'flame',flame:true,x:t.player.x+13+50,y:t.player.y+20,vx:-200,vy:0,life:2,d:10});
  t.action('attack');advance(.12);assert.equal(t.shots.length,0);assert.equal(t.player.soul,1);
});
test('an iron gate drops behind you when a boss fight starts and lifts once the boss falls',()=>{
  t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='lock'));t.player.x=t.L.trigger+20;t.player.y=428;t.player.inv=100;advance(.03);finishTalk();advance(.4);assert(t.gateK>.9,'the gate is down');
  t.player.x=t.L.gate-80;advance(.03);assert(t.player.x>=t.L.gate,'cannot leave mid-fight');
  t.killEnemy(t.enemies[0]);finishCine();finishTalk();assert(t.keepsakes.key,'the beast leaves the old key');assert(t.loot.some(o=>o.id==='key'),'it is drawn flying to you');t.player.x=t.L.gate-80;advance(.03);assert(t.player.x<t.L.gate,'free to go back after the fight');
});
test('ringing the bell plays the illustrated ending before the victory panel',()=>{
  t.loadStage(FINAL);t.enemies.find(e=>e.type==='boss').dead=true;t.player.x=t.L.seal+30;advance(.1);
  finishCine();assert.equal(t.state,'win');assert(t.talk&&t.talk.lines===t.TALK.ending,'the ending is narrated');assert(t.TALK.ending.every(l=>l[2]),'every ending line has an illustration');assert(t.TALK.prologue.every(l=>l[2]),'so does the prologue');
  for(let i=0;i<40&&t.talk;i++)press('KeyE');assert(!t.talk);assert(t.credits,'then the credits roll');press('KeyE');assert(!t.credits);assert.equal(nodes.panel.hidden,false,'then the victory panel');assert.equal(storage['ember:clears'],'1','a clear is counted');assert(t.keepsakes.chain,'and you keep the broken lock');
});
test('pickups show up as drawn items with a count, never as written names',()=>{
  const u=t.breakables.find(q=>q.kind===2);t.player.x=u.x-40;t.player.face=1;t.player.inv=100;t.action('attack');advance(.12);
  assert(t.floats.some(f=>f.art==='knife'&&f.t==='×2'),'a drawn knife bundle pops out');assert(!t.floats.some(f=>/飞刀/.test(f.t)),'no written name');assert(t.loot.some(o=>o.id==='knife'),'and flies to you');
  t.reset();t.player.x=t.L.npc-13;t.player.y=428;advance(.02);t.action('interact');finishTalk();assert(t.loot.some(o=>o.id==='bomb'),'the bellkeeper\'s fire flask flies over as a picture');
});
test('exploration and boss music differ, and the girl signals once with two chimes',()=>{
  const notes=[];function FakeAudio(){this.state='running';this.currentTime=10;this.destination={};this.resume=()=>Promise.resolve();this.createBuffer=()=>({});this.createBufferSource=()=>({connect:noop,start:noop});this.createGain=()=>({gain:{setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop,disconnect:noop});this.createOscillator=()=>({frequency:{setValueAtTime:v=>notes.push(v),exponentialRampToValueAtTime:noop},connect:noop,start:noop,stop:noop});}
  sandbox.AudioContext=FakeAudio;t.reset();press('KeyD');release('KeyD');advance(.6);assert(notes.length>0,'exploration music starts after gesture');notes.length=0;t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='brood'));t.flags.boss=true;advance(.3);assert(notes.length>=2,'boss theme has multiple layers');assert(notes.some(n=>Math.abs(n-55)<.01),'boss rhythm uses its own bass');
  t.startJourney('lamp',0);notes.length=0;
  press('KeyE');release('KeyE');press('KeyE');release('KeyE');
  assert.equal(t.talk.lines[t.talk.i][0],'青带女孩');
  assert.deepEqual(notes,[587.33,880]);
  press('KeyE');release('KeyE');
  assert.deepEqual(notes,[587.33,880],'revealing the subtitle does not retrigger the chimes');
});
test('boss unlock persists even after gameplay panels replaced the menu',()=>{
  t.reset();t.unlocked=1;t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='lock'));const original=sandbox.document.getElementById;sandbox.document.getElementById=id=>id.indexOf('chapter-')===0?null:original(id);try{t.killEnemy(t.enemies[0]);assert.equal(storage['ember:unlocked'],'2');assert.equal(t.unlocked,2);assert.equal(t.state,'cine');}finally{sandbox.document.getElementById=original;}
});
test('arena bosses remain idle and invulnerable before their introduction',()=>{
  t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='lock'));const b=t.enemies[0],x=b.x,hp=b.hp;t.player.x=t.L.trigger-40;t.player.y=428;t.player.inv=100;advance(2);assert.equal(b.x,x);assert.equal(b.hp,hp);assert.equal(t.shots.length,0);t.player.soul=3;t.action('cast');advance(.8);assert.equal(b.hp,hp);assert.equal(t.state,'play');t.player.x=t.L.trigger+5;advance(.05);assert.equal(t.state,'talk');
});
test('five ordinary hits remove five whole ghosts and a heavy boss strike removes two',()=>{
  for(let i=4;i>=0;i--){t.player.inv=0;t.hurt(12,0);assert.equal(t.player.hp,i*20);}assert.equal(t.state,'dead');
  t.reset();const e={struck:false,x:200,w:40};assert(t.strike(e,100,400,180,480,28));assert.equal(t.player.hp,60,'heavy boss strike costs two ghosts');t.player.inv=0;e.struck=false;t.strike(e,100,400,180,480,22);assert.equal(t.player.hp,40,'ordinary boss strike costs one ghost');
});
test('health upgrades and healing remain whole ghosts and retry restores shield progress',()=>{
  t.player.hp=40;t.player.skills.vigor=1;t.action('heal');assert.equal(t.player.hp,100);
  t.reset();t.player.x=600;t.player.y=318;t.action('interact');advance(1);t.offers[0]={kind:'up',id:'heart'};press('Digit1');assert.equal(t.player.max,120);assert.equal(t.player.hp,120);
  t.reset();t.relics.plate=true;t.player.plateHits=2;t.loadStage(stageOf('sewers'));t.player.plateHits=0;t.retryStage();assert.equal(t.player.plateHits,2);t.player.inv=0;t.hurt(10,0);assert.equal(t.player.hp,100);
});
test('held keyboard attack repeats and a delayed strike starts a fresh combo',()=>{
  press('KeyJ');assert.equal(t.player.combo,1);advance(.4);assert.equal(t.player.combo,2,'holding J chains attacks');release('KeyJ');advance(1.4);t.action('attack');assert.equal(t.player.combo,1,'combo expires when the player waits');
});
test('consumable base damage does not silently scale with enemy health by chapter',()=>{
  t.loadStage(stageOf('sewers'));const e=t.enemies[0];e.cd=99;t.player.inv=100;t.player.face=1;t.player.x=e.x-200;t.bag.knife=1;t.sel='knife';const before=e.hp;t.action('use');advance(.45);assert.equal(before-e.hp,30);
});
test('heavy swing damage is rounded consistently and tassel boosts it by forty percent',()=>{
  const e=t.enemies[0];e.hp=e.max=300;e.cd=99;t.player.inv=100;t.player.x=e.x-45;t.player.face=1;t.action('attack');advance(.4);t.player.x=e.x-45;t.action('attack');advance(.4);const before=e.hp;t.player.x=e.x-45;t.action('attack');advance(.12);assert.equal(before-e.hp,Math.round(t.player.damage*1.35));
  t.reset();t.relics.tassel=true;const q=t.enemies[0];q.hp=q.max=300;q.cd=99;t.player.inv=100;t.player.x=q.x-45;t.player.face=1;t.action('attack');advance(.4);t.player.x=q.x-45;t.action('attack');advance(.4);const before2=q.hp;t.player.x=q.x-45;t.action('attack');advance(.12);assert.equal(before2-q.hp,Math.round(t.player.damage*1.89));
});
test('inventory and shop display ghost counts rather than internal life units',()=>{
  t.player.hp=20;t.action('bag');assert(nodes.panel.innerHTML.includes('>1 / 5</b>'));press('Escape');t.loadStage(firstRest());t.player.hp=40;t.player.x=t.L.shop-13;t.action('interact');finishTalk();assert.equal(t.state,'shop');assert(nodes.panel.innerHTML.includes('>2 / 5</b>'));
});
test('first-map skills unlock after the basic actions',()=>{
  t.startJourney('lamp',0);assert.equal(t.talk.lines,t.TALK.prologue);finishTalk();advance(1);finishTalk();assert.equal(t.stage,0);assert(t.run.guided);assert.equal(t.run.awakened,0);
  t.player.soul=3;t.useSkill(1);assert.equal(t.player.soul,3);t.player.x=660;advance(.05);assert.equal(t.run.awakened,0);t.player.x=1460;advance(.05);assert.equal(t.run.awakened,1);
  t.loadStage(stageOf('sewers'));advance(.05);assert.equal(t.run.awakened,2);
  t.loadStage(stageOf('ramparts'));advance(.05);assert.equal(t.run.awakened,3);
});
test('a new skill teaches a real cast, survives a reload, and can be set aside',()=>{
  t.startJourney('lamp',0);finishTalk();advance(1);t.player.x=1460;advance(.05);
  assert.equal(t.run.practiceSlot,1);assert(nodes['practice-name'].textContent.includes('影步斩'));
  assert(nodes['practice-key'].textContent.includes('按 1'));assert(t.player.soul>=1);
  t.showMenu();t.continueRun();advance(.05);assert.equal(t.run.practiceSlot,1);
  t.player.soul=0;press('Digit1');release('Digit1');assert.equal(t.run.practiceSlot,1);
  t.player.soul=1;press('Digit1');release('Digit1');assert(t.player.dash>0);assert.equal(t.run.practiceSlot,0);
  assert.equal(JSON.parse(storage['ember:save']).run.practiceSlot,0);
  t.loadStage(stageOf('sewers'));advance(.05);assert.equal(t.run.practiceSlot,2);
  const soul=t.player.soul;nodes['practice-later'].onclick();assert.equal(t.run.practiceSlot,0);assert.equal(t.player.soul,soul);
});
test('using a consumable reports its count, replacement, and empty inventory',()=>{
  t.bag.knife=2;t.bag.frost=1;t.sel='knife';
  t.action('use');assert.equal(t.bag.knife,1);assert(nodes.notice.textContent.includes('掷出飞刀 · 剩 1 件'));
  t.action('use');assert.equal(t.sel,'frost');assert(nodes.notice.textContent.includes('已换为寒霜铃'));
  t.action('use');assert.equal(t.bag.frost,0);assert(nodes.notice.textContent.includes('最后一件已用完'));
  t.action('use');assert(nodes.notice.textContent.includes('补给'));
});
test('the tutorial cannot kill you and, opened without a saved journey, flows into the first level',()=>{
  delete storage['ember:save'];
  t.startTutorial(true);assert(t.L.tutorial);
  for (const id of ['knife','bomb','frost']) {
    t.sel=id;const before=t.bag[id];assert(before>0);
    t.action('use');t.action('use');assert.equal(t.bag[id],before);
  }
  t.useSkill(1);assert(t.player.dash>0);advance(.25);
  t.useSkill(2);assert(t.player.ringT>0);
  t.useSkill(3);t.useSkill(3);assert.equal(t.thrown.filter(o=>o.k==='soul').length,2);assert.equal(t.player.soul,3);
  t.player.hp=20;t.player.inv=0;t.hurt(10,0);assert.equal(t.player.hp,20,'never below one ghost');assert.equal(t.state,'play');
  t.player.x=t.L.exit+25;t.player.y=428;t.player.vy=0;advance(1);assert.equal(t.stage,0);finishTalk();assert.equal(t.state,'play');
});
test('skills sit on 1 / 2 / 3 and cost one, two or three soul',()=>{
  t.enemies.forEach((e,i)=>{if(i)e.dead=true;});const e=t.enemies[0];e.cd=99;e.hp=e.max=500;t.player.inv=100;t.player.x=e.x-120;t.player.y=428;t.player.face=1;t.player.soul=3;
  press('Digit1');release('Digit1');assert.equal(t.player.soul,2);assert(t.player.dash>0,'a shadow dash');advance(.25);assert(e.hp<500,'the dash cuts through');
  advance(.4);t.player.soul=3;press('Digit2');release('Digit2');assert.equal(t.player.soul,1);assert(t.player.ringT>4,'soul flames circle you');
  advance(.4);t.player.soul=2;press('Digit3');release('Digit3');assert.equal(t.player.soul,2,'not enough for the bolt');
  t.player.soul=3;press('Digit3');release('Digit3');assert.equal(t.player.soul,0);assert(t.thrown.some(o=>o.k==='soul'));
});
test('the bell apprentice hits slow and heavy; the archer shoots arrows that also charge soul',()=>{
  t.reset(false,'bell');assert.equal(t.player.char,'bell');assert.equal(t.player.max,120);const e=t.enemies[0];e.cd=99;e.hp=e.max=500;t.player.inv=100;t.player.x=e.x-50;t.player.face=1;
  t.action('attack');advance(.1);assert.equal(500-e.hp,36);t.player.soul=1;advance(.5);press('Digit1');release('Digit1');assert.equal(t.player.soul,0);assert.equal(t.thrown.filter(o=>o.k==='pwave').length,2,'a quake runs both ways');
  t.reset(false,'bow');assert.equal(t.player.max,80);const a=t.enemies[0];a.cd=99;a.hp=a.max=500;t.player.inv=100;t.player.x=a.x-200;t.player.face=1;t.player.soul=0;
  t.action('attack');advance(.12);assert(t.thrown.some(o=>o.k==='arrow'),'an arrow flies');advance(.5);assert(a.hp<500,'and lands');assert.equal(t.player.soul,1,'arrows charge soul too');
  advance(.4);press('Digit1');release('Digit1');assert.equal(t.thrown.filter(o=>o.k==='arrow').length,5,'a fan of five');
  t.reset(false,'bow');press('KeyJ');advance(.14);assert(t.player.charge>0);release('KeyJ');advance(.02);
  assert(t.thrown.some(o=>o.k==='arrow'&&!o.heavy),'release early for a light arrow');
  advance(.2);press('KeyJ');advance(.47);
  assert(t.thrown.some(o=>o.k==='arrow'&&o.heavy),'a full draw fires a piercing arrow while held');release('KeyJ');t.reset(false,'lamp');
});
test('keys can be rebound in the settings and work at once',()=>{
  t.rebinding={a:'attack',i:0};t.finishRebind('KeyX');assert.equal(t.BIND.attack[0],'KeyX');assert(JSON.parse(storage['ember:settings']).keys.attack.includes('KeyX'),'saved');
  const e=t.enemies[0];e.cd=99;t.player.inv=100;t.player.x=e.x-45;t.player.face=1;press('KeyX');advance(.12);release('KeyX');assert(e.hp<e.max,'X attacks now');
  t.rebinding={a:'attack',i:0};t.finishRebind('KeyJ');assert.equal(t.BIND.attack[0],'KeyJ');nodes.panel.hidden=true;
});
test('a shield jailer blocks frontal swings until a heavy third swing breaks its guard; its back is open',()=>{
  const s=t.enemies.find(e=>e.type==='shield');t.enemies.forEach(e=>{if(e!==s)e.dead=true;});t.player.x=s.origin-45;t.player.y=428;advance(.02);s.cd=99;s.x=s.origin;s.face=-1;t.player.inv=100;t.player.x=s.x-45;t.player.face=1;
  const hp=s.hp;t.action('attack');advance(.12);assert.equal(s.hp,hp,'blocked');
  assert(t.fx.some(f=>f.kind==='block')&&!t.fx.some(f=>f.target===s),'shield ricochet only');advance(.4);t.action('attack');advance(.45);assert.equal(s.hp,hp,'still blocked');
  t.action('attack');advance(.12);assert(s.brk>0,'guard broken');assert(s.hp<hp);
  advance(.4);s.brk=0;s.face=1;s.turnT=0;const hp2=s.hp;t.player.x=s.x-45;t.action('attack');advance(.12);assert(s.hp<hp2,'hit in the back');
});
test('bats swoop, bone casters blink away and cast, bombers lob flasks that leave pools',()=>{
  const f=t.enemies.filter(e=>e.type==='flyer')[1];t.enemies.forEach(e=>{if(e!==f)e.dead=true;});t.player.x=f.origin-150;t.player.y=428;t.player.inv=0;t.cam=f.origin-500;advance(.05);f.cd=0;advance(.05);assert(f.wind>0,'it rears back first');advance(1.4);assert(t.player.hp<100,'then dives into you');
  t.loadStage(stageOf('ossuary'));const c=t.enemies.find(e=>e.type==='caster');t.cam=c.x-500;t.player.x=c.x-100;t.player.y=428;t.player.inv=100;advance(.05);assert(c.blink>0,'it blinks away when you get close');advance(.6);assert(Math.abs(c.x-t.player.x)>150);
  c.blinkCd=99;c.cd=0;t.player.x=c.x-300;advance(.05);assert(c.wind>0,'it raises its staff');advance(1);assert(t.shots.some(s=>s.k==='wisp')||t.hazards.some(h=>h.k==='spear'),'and casts');
  t.loadStage(stageOf('sewers'));const b=t.enemies.find(e=>e.type==='bomber');t.cam=b.x-500;t.player.x=b.x-200;t.player.y=428;t.player.inv=100;b.cd=0;advance(.05);assert(b.wind>0,'it swings its arm back');advance(.7);assert(t.shots.some(s=>s.k==='glob'&&s.g>0),'and lobs');t.player.x-=170;advance(1.6);assert(t.hazards.some(h=>h.k==='pool'),'leaving a pool');
});
test('lifts carry you, crumbling bridges drop away and grow back, vents lift you and spike traps keep time',()=>{
  const lift=t.platforms.find(a=>a.mv);t.player.inv=100;t.player.x=lift.x;advance(.02);t.player.x=lift.x+20;t.player.y=lift.y-t.player.h-1;t.player.vy=0;t.player.inv=100;advance(.1);assert(t.player.ground);const x0=t.player.x,lx=lift.x;advance(.5);assert(Math.abs((t.player.x-x0)-(lift.x-lx))<2,'you ride with the lift');
  t.loadStage(stageOf('ramparts'));const c=t.platforms.find(a=>a.cr);t.player.x=c.x+20;t.player.y=c.y-t.player.h-1;t.player.vy=0;t.player.inv=100;advance(.1);assert.equal(c.cr.st,1,'it cracks under you');advance(.6);assert(c.off,'and falls');advance(3.2);assert(!c.off,'then grows back');
  t.loadStage(stageOf('sewers'));const v=t.traps.find(q=>q.k==='vent');v.t=v.per*.5;t.player.x=v.x-13;t.player.y=428;t.player.vy=0;advance(.4);assert(t.player.y<380,'the steam carries you up');
  t.loadStage(stageOf('prison'));t.enemies.forEach(e=>e.dead=true);const s=t.traps.find(q=>q.k==='tspike'&&!q.teach);t.player.x=s.x+20;t.player.y=428;t.player.inv=0;t.player.hp=t.player.max;s.t=s.per*.2;advance(.1);assert.equal(t.player.hp,100,'spikes down');s.t=s.per*.6;advance(.05);assert(t.player.hp<100,'spikes up');
});
test('five main routes keep their signature obstacles and an accessible exit',()=>{
  const kinds={prison:['tspike','pendulum'],sewers:['spout','vent'],ramparts:['wind','ballista'],ossuary:['jet'],tower:['piston','pendulum','vent']};
  for(const th of Object.keys(kinds)){const s=t.STAGES[stageOf(th)];assert(s.exit>=3200&&s.exit<=4100,th+' main route');assert(s.ens.every(e=>e[0]<s.exit),th+' encounter before exit');const have=new Set(s.traps.map(q=>q.k));kinds[th].forEach(k=>assert(have.has(k),th+' has '+k));}
  assert(t.STAGES[stageOf('prison')].movers.length&&t.STAGES[stageOf('ramparts')].crumbles.length&&t.STAGES[stageOf('ossuary')].dark,'lifts, crumbling bridges and darkness');
  const foes=new Set();t.STAGES.forEach(s=>s.ens.forEach(e=>foes.add(e[2])));['flyer','shield','caster','bomber'].forEach(k=>assert(foes.has(k),k+' appears'));
  ['lock','brood','standard','warden'].forEach(k=>assert(t.SONGS[k]&&t.SONGS[k+'2']&&t.SONGS[k].bpm<t.SONGS[k+'2'].bpm,k+' has a faster second phase theme'));
});
test('a new cycle makes enemies tougher and can start with an unlocked character',()=>{
  t.clears=2;t.startJourney('bow',2);finishTalk();advance(1);assert.equal(t.player.char,'bow');assert.equal(t.cycle,2);assert(!t.L.tutorial);finishTalk();assert.equal(t.enemies[0].max,Math.round(72*(1+.35*2)));assert(t.enemies.some(q=>q.elite),'some jailers are elites now');
  t.cycle=0;t.clears=0;t.reset(false,'lamp');
});
test('the journey is saved at every door and can be continued from the title screen',()=>{
  t.loadStage(stageOf('sewers'));const s=JSON.parse(storage['ember:save']);assert.equal(s.stage,stageOf('sewers'));assert.equal(s.char,'lamp');
  t.showMenu();assert.equal(t.state,'menu');t.continueRun();assert.equal(t.state,'play');assert.equal(t.stage,stageOf('sewers'));
});
test('dialogue types with pauses at punctuation, and auto mode turns the pages itself',()=>{
  t.player.x=t.L.npc-13;t.player.y=428;advance(.02);t.action('interact');assert.equal(t.state,'talk');const line=t.talk.lines[0][1],comma=line.indexOf('，');
  for(let i=0;i<2000&&t.talk.shown<=comma;i++)t.step(1/120);const at=t.talk.shown;assert.equal(at,comma+1);t.step(.05);assert.equal(t.talk.shown,at,'it pauses after a comma');
  press('KeyE');assert.equal(t.talk.shown,line.length,'a press shows the whole line');
  t.settings.autoTalk=true;const i0=t.talk.i;advance(5);assert(!t.talk||t.talk.i>i0,'auto mode turns the page');t.settings.autoTalk=false;finishTalk();
});test('chapter one challenge does not force the first-run tutorial',()=>{t.startChapter(1);assert.equal(JSON.parse(storage['ember:save']).stage,0);assert.equal(t.stage,0);assert(!t.L.tutorial);assert.equal(t.state,'talk');finishTalk();assert.equal(t.state,'play');});
test('portrait starts playing immediately and rotation preserves the run',()=>{
  const x=t.player.x;t.settings.touch='show';sandbox.innerWidth=375;sandbox.innerHeight=812;listeners.resize();
  press('KeyD');advance(.5);release('KeyD');t.action('attack');assert(t.player.attack>0);assert(t.player.x>x);
  const portraitX=t.player.x;sandbox.innerWidth=812;sandbox.innerHeight=375;listeners.resize();assert.equal(t.player.x,portraitX);
  press('KeyD');advance(.2);release('KeyD');assert(t.player.x>portraitX);
  t.settings.touch='auto';sandbox.innerWidth=1100;sandbox.innerHeight=620;listeners.resize();
});
test('the prologue leads straight into a playable prison with the chosen bearer',()=>{delete storage['ember:tutorial'];t.clears=0;t.startJourney('bow',2);assert.equal(t.player.char,'bow');assert.equal(t.cycle,0);assert.equal(t.talk.lines,t.TALK.prologue);finishTalk();advance(1);assert.equal(t.stage,0);assert(t.run.guided);assert.equal(t.state,'play');assert(!t.L.tutorial);const x=t.player.x;press('KeyD');advance(.25);release('KeyD');assert(t.player.x>x);});
test('existing players keep their prologue and go straight to play too',()=>{storage['ember:tutorial']='1';t.startJourney('lamp',0);assert.equal(t.talk.lines,t.TALK.prologue);finishTalk();advance(1);assert.equal(t.stage,0);assert(!t.L.tutorial);assert.equal(t.state,'play');});
test('exploration fills the map and the unattended map stand charges once per floor',()=>{
  advance(.1);assert(t.run.seen&&t.run.seen.s0,'exploration is recorded');const seen0=t.run.seen.s0.reduce((a,b)=>a+b,0);t.player.inv=100;
  t.player.x=1500;t.player.y=428;advance(.8);assert(t.run.seen.s0.reduce((a,b)=>a+b,0)>seen0,'walking reveals more');
  press('KeyM');release('KeyM');assert.equal(t.state,'map');press('Escape');release('Escape');assert.equal(t.state,'play');
  assert(!t.hasMap());t.enemies.forEach(e=>e.dead=true);t.embers=5;t.player.x=t.L.mapStand-13;t.player.y=428;advance(.05);
  assert.equal(nodes['chest-btn'].textContent,'购图');t.action('interact');assert(!t.hasMap());assert.equal(t.embers,5);
  assert(nodes.notice.textContent.includes('还差 15'));assert.equal(t.state,'play');
  t.embers=100;t.action('interact');assert(t.hasMap());assert.equal(t.embers,80);advance(.05);
  assert.equal(nodes['chest-btn'].textContent,'看图');t.action('interact');assert.equal(t.state,'map');assert.equal(t.embers,80);
  press('Escape');release('Escape');t.retryStage();assert(t.hasMap(),'bought map survives a floor retry');
  t.showMenu();t.continueRun();assert(t.hasMap(),'existing map flags survive reload');
});
test('every main floor offers its own full route at the original price',()=>{
  for(const [theme,price] of [['prison',20],['sewers',25],['ramparts',35],['ossuary',40],['tower',50]]){
    t.loadStage(stageOf(theme));t.enemies.forEach(e=>e.dead=true);
    t.embers=100;t.player.x=t.L.mapStand-t.player.w/2;t.player.y=480-t.player.h;advance(.1);
    assert.equal(nodes['chest-btn'].textContent,'购图',theme);t.action('interact');
    assert(t.hasMap(),theme);assert.equal(t.embers,100-price,theme);
  }
});
function talkToWayfarer(){
  const npc=t.L.wayfarer;
  t.player.x=npc.x-t.player.w/2;t.player.y=npc.y-t.player.h;
  t.action('interact');
  assert.equal(t.state,'talk');assert.equal(t.talk.lines[0][0],npc.name);
  return t.talk.lines[0][1];
}
test('roadside gifts arrive only when the first conversation finishes and persist exactly once',()=>{
  for(const [theme,item,count] of [['prison','knife',2],['sewers','frost',1],['tower','bomb',1]]){
    t.loadStage(stageOf(theme));
    const npc=t.L.wayfarer,start=t.bag[item];
    assert.equal(talkToWayfarer(),npc.lines[0]);press('KeyE');press('KeyE');
    assert.equal(t.talk.i,1);assert.equal(t.bag[item],start,'the last line is still on screen');
    t.showMenu();t.continueRun();
    assert.equal(t.bag[item],start);assert.equal(talkToWayfarer(),npc.lines[0],'interrupted meeting starts over');
    finishTalk();assert.equal(t.bag[item],start+count);
    function checkRepeatVisit(){
      assert.equal(t.bag[item],start+count);
      assert.equal(talkToWayfarer(),npc.again);finishTalk();assert.equal(t.bag[item],start+count);
    }
    checkRepeatVisit();t.retryStage();checkRepeatVisit();
    t.showMenu();t.continueRun();checkRepeatVisit();
  }
});
test('the flag courier and crypt keeper tell their stories without changing the inventory',()=>{
  const inventory=()=>JSON.stringify([t.bag,t.keepsakes,t.relics,t.player.potions,t.embers]);
  for(const theme of ['ramparts','ossuary']){
    t.loadStage(stageOf(theme));const npc=t.L.wayfarer,before=inventory();
    assert.equal(talkToWayfarer(),npc.lines[0]);finishTalk();assert.equal(inventory(),before);
    assert.equal(talkToWayfarer(),npc.again);finishTalk();assert.equal(inventory(),before);
  }
});
test('a cracked wall opens a walk-in side room that preserves the outside route and pays once',()=>{
  const s=t.secrets[0];t.enemies.forEach(e=>e.dead=true);t.player.inv=100;t.player.y=428;t.player.face=1;
  for(let i=0;i<3;i++){t.player.x=s.x-60;t.action('attack');advance(.4);}
  assert(s.open);assert.equal(t.player.shards||0,0,'treasure remains inside');
  const pos=t.player.x,lit=t.run.litWicks;
  press('KeyE');release('KeyE');advance(1);assert.equal(nodes['chest-btn'].textContent,'出暗门');
  press('KeyD');advance(1.2);release('KeyD');assert.equal(nodes['chest-btn'].textContent,'取藏品');
  press('KeyE');release('KeyE');t.action('interact');assert.equal(t.player.shards,1);
  press('KeyA');advance(1.7);release('KeyA');t.action('interact');advance(.92);
  assert(Math.abs(t.player.x-pos)<2);assert.equal(t.run.litWicks,lit);
  t.action('interact');advance(1);press('KeyD');advance(1.2);release('KeyD');
  assert(nodes['chest-btn'].hidden,'spent pedestal has no second interaction');
  t.action('interact');assert.equal(t.player.shards,1);
  t.retryStage();assert(t.secrets[0].open&&t.secrets[0].claimed);assert.equal(t.player.shards,1);
  t.continueRun();assert(t.secrets[0].open&&t.secrets[0].claimed);assert.equal(t.player.shards,1);
});
test('three lantern shards raise the life cap by one ghost',()=>{
  const max=t.player.max;t.gainShard(100,300);t.gainShard(100,300);assert.equal(t.player.max,max);t.gainShard(100,300);assert.equal(t.player.max,max+20);assert.equal(t.player.hp,t.player.max);
});
test('elites drop blueprints that add new relics to the shops and chests for good',()=>{
  t.codex.blue={};const e=t.enemies.find(q=>q.type==='guard');e.elite=true;t.killEnemy(e);const ids=Object.keys(t.codex.blue);assert.equal(ids.length,1,'the first elite always drops one');assert(t.relicPool().includes(ids[0]));assert(JSON.parse(storage['ember:codex']).blue[ids[0]],'saved on the device');
  t.codex.blue={};
});
test('blueprint relics: the guard bell blocks a hit, the hunting blade feeds soul, the echo stone refunds every third skill',()=>{
  t.relics.veil=true;t.player.inv=0;t.hurt(10,0);assert.equal(t.player.hp,100,'the bell rings instead');t.player.inv=0;t.hurt(10,0);assert.equal(t.player.hp,80,'only once per floor');
  t.reset();t.relics.hunt=true;t.player.soul=0;t.killEnemy(t.enemies[0]);assert.equal(t.player.soul,1);
  t.reset();t.relics.echo=true;t.enemies.forEach(e=>e.dead=true);t.player.inv=100;for(let i=0;i<3;i++){t.player.soul=3;press('Digit2');release('Digit2');advance(.4);}assert.equal(t.player.soul,3,'the third cast was free');
});
test('tapping jump makes a short hop and holding it makes a full jump',()=>{
  const peak=()=>{let top=t.player.y;for(let i=0;i<90;i++){t.step(1/60);top=Math.min(top,t.player.y);}return 428-top;};
  t.player.inv=100;press('Space');advance(.06);release('Space');const hop=peak();
  t.reset();t.player.inv=100;press('Space');let top=428;for(let i=0;i<60;i++){t.step(1/60);top=Math.min(top,t.player.y);}release('Space');
  assert(428-top>hop+25,'holding goes higher ('+Math.round(428-top)+' vs '+Math.round(hop)+')');
});
test('script lines mark words to glow, wave, shake or stand out without changing what is said',()=>{
  const P=t.parseLine('站住。{b:旗还在}，{w:水}');assert.equal(P.text,'站住。旗还在，水');assert.equal(P.fx.join(''),'bbbw');
  t.player.x=t.L.npc-13;t.player.y=428;advance(.02);t.action('interact');assert.equal(t.talk.text,t.talk.lines[0][1].replace(/\{[gwsb]:|\}/g,''));finishTalk();
});
test('every boss leaves a lantern shard behind',()=>{
  t.loadStage(t.STAGES.findIndex(s=>s.bossKind==='lock'));const before=t.player.shards||0;t.killEnemy(t.enemies[0]);finishCine();finishTalk();assert.equal(t.player.shards,before+1);
});test('rolling through an attack at the last instant slows time and charges soul',()=>{
  const e=t.enemies[0];e.cd=99;t.player.x=e.x-60;t.player.y=428;t.player.soul=0;t.action('roll');assert.equal(t.strike({struck:false,x:e.x,w:30},0,0,9999,9999,14),false);assert.equal(t.player.soul,1,'a perfect dodge feeds soul');assert.equal(t.player.hp,100);
  t.strike({struck:false,x:e.x,w:30},0,0,9999,9999,14);assert.equal(t.player.soul,1,'once per roll');
});
test('a fatal moth dive names the attack in the result panel',()=>{
  const f=t.enemies.filter(e=>e.type==='flyer')[1];
  t.enemies.forEach(e=>{if(e!==f)e.dead=true;});
  t.player.x=f.origin-150;t.player.hp=20;t.cam=f.origin-500;
  advance(.05);f.cd=0;advance(1.5);
  assert.equal(t.state,'dead');assert(nodes.panel.innerHTML.includes('被囚灯蛾俯冲击中'));
});
test('the ramparts shortcut carries a relit ember and a continued run remembers it',()=>{
  t.loadStage(stageOf('ramparts'));const wall=t.L.shortcut;
  t.player.x=wall.open+20;advance(.1);assert(!t.run.shortcut);
  t.run.guideX=wall.dest;advance(.1);assert(!t.run.shortcut);
  t.run.litWicks=t.L.wicks.filter(w=>w.x<=wall.dest).length;t.run.guideX=wall.dest;advance(.1);assert(t.run.shortcut);
  t.retryStage();const kept=t.run.litWicks;assert.equal(kept,wall.wicks);t.player.x=wall.door-13;advance(.05);assert.equal(t.run.litWicks,kept);
  const attached=()=>assert(Math.abs(t.run.guideX-t.player.x-t.player.w/2)<=35);
  assert(t.player.x>=wall.dest-10);attached();
  const wick=t.L.wicks[kept];t.player.x=wick.x-13;t.player.y=wick.y-t.player.h;advance(.05);
  const ward=t.enemies.find(e=>e.ward&&!e.dead);ward.phaseName='open';
  t.hitEnemy(ward,10,1,false,ward.x,ward.y,0);
  const saved=JSON.parse(storage['ember:save']);assert.equal(saved.run.wardParty[ward.slot],ward.max-20);
  t.showMenu();t.continueRun();attached();assert.deepEqual(Array.from(t.run.wardParty),saved.run.wardParty);
  saved.v=5;delete saved.run.wardParty;saved.run.wardLeft=1;storage['ember:save']=JSON.stringify(saved);
  t.showMenu();t.continueRun();assert.equal(t.run.wardParty.filter(x=>x>0).length,1);assert.equal(t.run.wardParty.at(-1),ward.max);
  saved.v=4;delete saved.run.wardLeft;delete saved.run.guideX;storage['ember:save']=JSON.stringify(saved);
  t.showMenu();t.continueRun();assert.equal(t.run.litWicks,kept);attached();
  assert(t.run.guideX<t.L.exit);
  t.player.x=t.L.exit-40;press('KeyD');advance(1.4);release('KeyD');
  assert.equal(t.stage,saved.stage,'the remaining fires still secure the east door');
});
test('the prison starts on an open path and the first guard waits for a hit',()=>{
  const first=t.enemies[0],start=t.run.guideX;
  assert(!t.L.lesson.door);assert(t.L.lesson.practiceX>first.origin);
  assert(t.traps.every(q=>q.x==null||q.x>=t.L.lesson.practiceX));
  press('KeyD');advance(1.3);release('KeyD');
  assert(t.player.x>400);assert(t.run.guideX>start);assert.equal(t.player.hp,t.player.max);
  t.player.x=first.x-28;t.player.y=428;advance(1.7);
  assert(first.waitingForHit);assert.equal(first.wind,0);assert.equal(t.player.hp,t.player.max);
  t.player.face=1;t.action('attack');advance(.13);assert(!first.waitingForHit);
});
test('prison coaching gives one contextual prompt and survives a first-floor restart',()=>{
  delete storage['ember:road-lessons'];
  t.startJourney('bow',0);finishTalk();advance(1);
  assert(nodes.notice.textContent.includes('东门'));
  t.player.x=260;advance(.05);
  assert(nodes.notice.textContent.includes('跳上矮台'));assert.equal(t.run.lessonMask,2);
  t.player.x=500;advance(.05);
  assert(nodes.notice.textContent.includes('蓄满自动射，松手可提前出箭'));assert.equal(t.run.lessonMask,6);
  t.reset(false);assert(t.run.guided);assert.equal(t.run.lessonMask,6);
  t.player.x=1140;advance(.05);
  assert(nodes.notice.textContent.includes('翻滚'));assert.equal(t.run.lessonMask,14);
});
test('fresh journeys have safe training spikes and a gradual first patrol',()=>{
  const practice=t.traps.find(q=>q.teach);
  t.player.x=practice.x;t.player.hp=20;advance(2);assert.equal(t.player.hp,20);
  assert.equal(t.enemies[0].max,28,'the sparring guard falls to two light knife hits');
  assert.equal(t.enemies.find(e=>e.origin===1280).max,54,'the second ground guard ramps up');
  assert.equal(t.enemies[0].trainingPace,1.9);
  assert.equal(t.enemies.find(e=>e.origin>=1000&&e.origin<1800).trainingPace,1.4);
  assert.equal(t.enemies.find(e=>e.origin>=1800).trainingPace,1);
  t.loadStage(stageOf('sewers'));assert(t.enemies.every(e=>e.trainingPace===1));
});
test('free selection can enter every map with a new profile and keeps the journey save',()=>{
  t.unlocked=1;t.loadStage(0);
  const journey=storage['ember:save'],beforeClears=t.clears;
  t.showMenu();t.renderChapters();
  assert.equal((nodes.panel.innerHTML.match(/data-level=/g)||[]).length,5);
  assert(!nodes.panel.innerHTML.includes('disabled'));
  for(const theme of ['prison','sewers','ramparts','ossuary','tower']){
    const stage=stageOf(theme);
    t.selectLevel(t.STAGES[stage]);assert.equal(t.stage,stage);
    assert.equal(JSON.parse(storage['ember:selected-save']).stage,stage);
    assert.equal(storage['ember:save'],journey);
  }
  t.showMenu();t.continueRun(true);assert.equal(t.L.theme,'tower');
  t.showWinPanel();assert.equal(t.clears,beforeClears);
  t.showMenu();t.continueRun();assert.equal(t.stage,0);
});
test('optional full practice is available from the title screen and protects the active journey',()=>{
  t.loadStage(stageOf('sewers'));const journey=storage['ember:save'];
  t.startTutorial(true);assert.equal(t.L,t.TUTORIAL);
  assert(t.traps.length>0 && t.L.signs.length>4);
  t.finishTutorial();advance(1);assert.equal(t.state,'menu');assert.equal(storage['ember:save'],journey);
});
test('opening or leaving the title cannot manufacture a journey',()=>{
  delete storage['ember:save'];
  t.showMenu();listeners.pagehide();
  assert.equal(storage['ember:save'],undefined);
  assert(!nodes.panel.innerHTML.includes('data-menu="continue"'));
  storage['ember:save']='{"stage":0}';
  t.showMenu();assert(!nodes.panel.innerHTML.includes('data-menu="continue"'));
  t.startJourney('bell',0);finishTalk();advance(1);
  t.run.guideX=250;listeners.pagehide();
  const own=JSON.parse(storage['ember:save']);
  assert.equal(own.char,'bell');assert.equal(own.run.guideX,250);
  const newer=JSON.stringify({...own,char:'bow'});
  storage['ember:save']=newer;listeners.pagehide();
  assert.equal(storage['ember:save'],newer,'a stale background tab preserves the newer save');
  t.showMenu();assert(nodes.panel.innerHTML.includes('data-menu="continue"'));
});
console.log('All '+passed+' gameplay checks passed.');



