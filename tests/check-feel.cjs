// Regression checks against the actual game, without shipping debug controls.
const fs=require('fs'),path=require('path'),vm=require('vm');
let harness=fs.readFileSync(path.join(__dirname,'check-ember.js'),'utf8').split('const t=sandbox.test;')[0];
harness=harness.replace('window.test={step','window.test={BOSS_AI,get viewY(){return viewY},get H(){return H},step');
harness+=`
const t=sandbox.test;
function tick(n){for(let i=0;i<n;i++)t.step(1/120);}
function clearWorld(){t.enemies.forEach(e=>e.dead=true);t.traps.length=0;t.player.inv=999;}
for(let stage=0;stage<t.STAGES.length;stage++){
  const room=t.STAGES[stage];if(!room.highRoute)continue;
  t.loadStage(stage);clearWorld();const route=room.highRoute;
  assert(route.length>=9);assert(Math.min(...route.map(a=>a[1]))<=100);
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],p=t.player;
    p.x=a[0]+35;p.y=a[1]-p.h;p.vx=p.vy=0;p.ground=true;p.jumps=0;p.coyote=.1;p.drop=null;
    t.action('jump');listeners.keydown({code:'Space',repeat:false,preventDefault:noop});
    listeners.keydown({code:'KeyD',repeat:false,preventDefault:noop});
    let reached=false;
    for(let j=0;j<160;j++){
      const offset=b[0]+b[2]/2-(p.x+p.w/2);
      listeners.keyup({code:'KeyA'});listeners.keyup({code:'KeyD'});
      if(Math.abs(offset)>6)listeners.keydown({code:offset>0?'KeyD':'KeyA',repeat:false,preventDefault:noop});
      t.step(1/120);
      if(p.ground&&p.x>=b[0]&&p.x+p.w<=b[0]+b[2]+2&&p.y+p.h<=b[1]+2){reached=true;break;}
    }
    listeners.keyup({code:'Space'});listeners.keyup({code:'KeyD'});listeners.keyup({code:'KeyA'});
    assert(reached,room.theme+' unreachable gallery '+i+' -> '+(i+1)+' at '+p.x+','+p.y);
  }
  const peak=route.reduce((a,b)=>a[1]<b[1]?a:b),p=t.player;
  p.x=peak[0]+35;p.y=peak[1]-p.h;p.vx=p.vy=0;p.ground=true;tick(180);
  const screenY=p.y-t.viewY;assert(screenY>60&&screenY+p.h<t.H-70,'hero visible at summit '+room.theme);
  const camera=t.cam;p.face=-p.face;tick(30);assert(Math.abs(t.cam-camera)<30,'turning in place should not swing camera');
}
console.log('PASS all five elevated routes are traversable and the camera keeps the hero in view');
t.loadStage(t.STAGES.findIndex(s=>s.theme==='sewers'&&!s.arena&&!s.rest));
const enemy=t.enemies.find(e=>e.type==='guard'&&e.floor===480);t.enemies.forEach(e=>{if(e!==enemy)e.dead=true;});t.traps.length=0;
const p=t.player;p.x=enemy.x+95;p.y=480-p.h;p.inv=999;enemy.face=1;enemy.wind=.01;enemy.wt=.36;enemy.cd=1;
let previous=enemy.x,hitStarted=false;
for(let i=0;i<30;i++){t.step(1/120);assert(Math.abs(enemy.x-previous)<7,'no instant lunge teleport');previous=enemy.x;if(enemy.struck)hitStarted=true;}
assert(hitStarted,'melee active frame fires');
console.log('PASS melee advances continuously and commits damage on its active frame');
for(let i=0;i<t.STAGES.length;i++)if(t.STAGES[i].arena){t.loadStage(i);assert(t.platforms.some(a=>a.mv||a.cr),'boss arena has traversal mechanic');}
console.log('PASS four boss arenas contain their distinct traversal platforms');
for(const kind of ['lock','brood','standard','warden']){
  t.loadStage(t.STAGES.findIndex(s=>s.arena&&s.bossKind===kind));
  const b=t.enemies.find(e=>e.type==='boss'),ai=t.BOSS_AI[kind];
  if(kind==='lock'){b.lastMove='slam';ai.choose(b,100);assert.equal(b.move,'lash');}
  if(kind==='brood'){b.lastMove='spit';ai.choose(b,300);assert.equal(b.move,'dive');}
  if(kind==='standard'||kind==='warden'){t.player.y=200;ai.choose(b,230);assert.equal(b.move,kind==='standard'?'leap':'lantern');assert(b.wind>=.5,'elevated counterattack is telegraphed');}
}
console.log('PASS bosses vary repeated attacks and answer elevated positions with readable tells');
`;
vm.runInNewContext(harness,{require,__dirname,console});
