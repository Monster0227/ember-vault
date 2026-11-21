// Exercise the actual renderer at extreme jump heights in every stage.
const fs=require('fs'),path=require('path'),vm=require('vm');
let harness=fs.readFileSync(path.join(__dirname,'check-ember.js'),'utf8');harness=harness.slice(0,harness.indexOf('const t=sandbox.test;'));
harness=harness.replace('window.test={step','window.test={draw,resize,frame,get elapsed(){return time},step');
harness=harness.replace("const context = new Proxy({}, { get: (_, key) => key === 'measureText' ? () => ({width:0}) : noop, set: () => true });",`const context = new Proxy({}, {get:(_,key)=>key==='measureText'?()=>({width:0}):key==='createLinearGradient'||key==='createRadialGradient'?()=>({addColorStop:noop}):key==='arc'?(x,y,r)=>{if(r<0||!Number.isFinite(r))throw Error('invalid arc radius '+r);}:key==='ellipse'?(x,y,rx,ry)=>{if(rx<0||ry<0||!Number.isFinite(rx+ry))throw Error('invalid ellipse radius');}:noop,set:()=>true});`);
harness=harness.replace('document:{getElementById:node,','document:{createElement:()=>({width:1,height:1,getContext:()=>context,toDataURL:()=>\'\'}),getElementById:node,');
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
console.log('PASS fixed-step accumulation at 60 / 90 / 120 / 144 Hz');`;
vm.runInNewContext(harness,{require,__dirname,console});
