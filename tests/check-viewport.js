'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../dist/js/ember.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.vtest={get W(){return W},get H(){return H},get blocked(){return rotationBlocked},get stick(){return stick},stickMove,scheduler(){draw=()=>{};drawCharIdles=()=>{};startTutorial(false);let ticks=0;const realStep=step;step=dt=>{ticks++;realStep(dt);};return ()=>ticks;}};})();');
function boot(width,height){const nodes={},events={},frames=[],context={};const noop=()=>{};
  function node(id){return nodes[id]||(nodes[id]={hidden:false,style:{},classList:{add:noop,remove:noop},getContext:()=>context,querySelectorAll:()=>[],addEventListener:noop,getBoundingClientRect:()=>({left:30,top:40,width:400,height:200}),clientWidth:100,clientHeight:100});}
  const s={document:{getElementById:node,querySelectorAll:()=>[],addEventListener:noop},innerWidth:width,innerHeight:height,devicePixelRatio:3,performance:{now:()=>0},localStorage:{getItem:()=>null,setItem:noop},addEventListener:(k,f)=>events[k]=f,requestAnimationFrame:f=>frames.push(f),setTimeout:f=>f(),matchMedia:()=>({matches:true}),console,Math,Set};s.window=s;
  vm.runInNewContext(source,s);return{s,nodes,events,frames,context};}
const a=boot(390,844);assert(a.s.vtest.blocked);assert(!a.nodes['rotate-screen'].hidden);assert(a.s.EmberGame,'portrait startup completes');
a.s.innerWidth=844;a.s.innerHeight=390;a.events.resize();assert(!a.s.vtest.blocked);assert(a.nodes['rotate-screen'].hidden);assert.equal(a.nodes.world.width,1688);assert.equal(a.context.imageSmoothingEnabled,false);
const mapped=a.s.mapTouchToCanvas(230,140);assert(Math.abs(mapped.x-a.s.vtest.W/2)<1e-8);assert.equal(mapped.y,a.s.vtest.H/2);
a.s.vtest.stickMove({clientX:430,clientY:140});assert.equal(a.s.vtest.stick.x,1);assert.equal(a.s.vtest.stick.y,0);
a.s.innerWidth=390;a.s.innerHeight=844;a.events.resize();assert.equal(a.s.vtest.stick.x,0);
const b=boot(0,0);assert(b.s.EmberGame);const retry=b.frames.shift();b.s.innerWidth=844;b.s.innerHeight=390;retry();assert(b.nodes.world.width>0);assert(!b.s.vtest.blocked);
const previous=b.nodes.world.width;b.s.innerWidth=0;b.s.innerHeight=0;b.events.resize();assert.equal(b.nodes.world.width,previous,'keep last valid buffer during rotation');
b.s.visualViewport={width:740,height:360};b.events.resize();assert.equal(b.nodes.world.width,1480);assert.equal(b.nodes.world.height,456);
console.log('PASS portrait cold start, landscape recovery, capped DPR, smoothing, zero-size recovery, visual viewport and scaled joystick coordinates');


// Drive the queued browser callback, not step() directly. Painting is disabled
// so the counts and the actual player movement depend only on simulation time.
function simulateFrames(hz,jitter){
  const {s,events,frames}=boot(1100,620),count=s.vtest.scheduler(),startX=s.EmberGame.player.x;
  events.keydown({code:'ArrowRight',repeat:false,preventDefault:()=>{}});
  const sequence=[0,.6,-.4,.2,-.7,.3];
  for(let i=0;i<=hz;i++){
    assert.strictEqual(frames.length,1,'one callback is scheduled per frame');
    const offset=jitter&&i>0&&i<hz?sequence[i%sequence.length]:0;
    frames.shift()(1000+i*1000/hz+offset);
  }
  const dx=s.EmberGame.player.x-startX,ticks=count();
  frames.shift()(3000); // one second with no animation callback
  assert.equal(count()-ticks,3,'long gaps still catch up by at most three steps');
  return {dx,ticks};
}
const normal=simulateFrames(60,false);
for(const hz of [120,144,165,75,60,30]){
  for(const jitter of [false,true]){
    const {dx,ticks}=simulateFrames(hz,jitter);
    assert(ticks>=59&&ticks<=61,hz+' Hz (jitter='+jitter+') ran '+ticks+' simulation steps in one second');
    assert(dx>200&&Math.abs(dx-normal.dx)<10,hz+' Hz must move the player about as far as at 60 Hz');
  }
}
console.log('PASS movement at 30–165 Hz with and without frame jitter, plus bounded catch-up after a long gap');
