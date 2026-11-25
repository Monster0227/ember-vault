// Exercise the actual renderer at extreme jump heights in every stage.
const fs=require('fs'),path=require('path'),vm=require('vm');
let harness=fs.readFileSync(path.join(__dirname,'check-ember.js'),'utf8');harness=harness.slice(0,harness.indexOf('const t=sandbox.test;'));
harness=harness.replace('window.test={','window.test={draw,resize,frame,get elapsed(){return time},get cameraY(){return viewY},get width(){return W},');
harness+=`\nconst t=sandbox.test;for(let st=0;st<t.STAGES.length;st++){t.loadStage(st);t.player.inv=999;for(const y of [428,200,0,-200,-800]){t.player.y=y;t.player.vy=-510;t.player.ground=false;t.draw();for(let i=0;i<12;i++){t.step(1/60);t.draw();}}}console.log('PASS 845 high-jump simulation/render samples across 13 stages');`;
harness+=`
sandbox.performance={now:()=>0};
t.loadStage(0);
let stamp=100;
for(const hz of [60,90,120,144]){
  const before=t.elapsed;
  for(let i=0;i<hz*2;i++){stamp+=1000/hz;t.frame(stamp);}
  if(Math.abs(t.elapsed-before-2)>.04)throw Error('Simulation stalled at '+hz+' Hz');
}
console.log('PASS fixed-step accumulation at 60 / 90 / 120 / 144 Hz');
t.loadStage(0);t.enemies.splice(0);t.player.inv=100;
const cameraSample=(x,y)=>{Object.assign(t.player,{x,y,vx:0,vy:0});t.step(1/60);};
const anchor=1620;
t.cam=anchor-t.width*.46;
for(let i=0;i<80;i++){t.player.face=i%2?1:-1;cameraSample(anchor+i%2*45,310);}
assert.equal(t.cam,anchor-t.width*.46,'short steps and turns stay in the same frame');
const initialY=t.cameraY;
for(let i=0;i<25;i++)cameraSample(anchor,280+i);
assert.equal(t.cameraY,initialY,'an ordinary hop does not bob the horizon');
for(let i=0;i<90;i++)cameraSample(anchor+620,-70);
assert(t.cam>anchor-t.width*.46+300&&t.cameraY<initialY-100,'a long walk and a high climb remain visible');
const fraction=(t.player.x+t.player.w/2-t.cam)/t.width;
sandbox.innerWidth=390;sandbox.innerHeight=844;t.resize();
assert(Math.abs((t.player.x+t.player.w/2-t.cam)/t.width-fraction)<.001,'rotating mid-walk preserves the player framing');
const highView=t.cameraY;t.loadStage(0);
assert(t.cameraY>highView+100,'a new map resets the climb offset');
console.log('PASS stable turn, short hop, sustained travel, high climb and portrait rotation');`;
vm.runInNewContext(harness,{require,__dirname,console});
