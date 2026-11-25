'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

// Share the same live actors, equipment and canvas mock as the movement suite.
const harness=fs.readFileSync(path.join(__dirname,'check-ember.js'),'utf8').split('const t=sandbox.test;')[0];
const bootstrap=harness.replace('window.test={','window.test={armPose,drawHero,drawEnemy,');
const hooks=`
const t=sandbox.test;
const pen=nodes.world.getContext('2d');
let matrix=[1,0,0,1], stack=[], bodies=0, bowAngle=null;
pen.save=()=>stack.push(matrix.slice());
pen.restore=()=>{matrix=stack.pop();};
pen.rotate=a=>{
  const [xx,yx,xy,yy]=matrix,c=Math.cos(a),s=Math.sin(a);
  matrix=[xx*c+xy*s,yx*c+yy*s,xy*c-xx*s,yy*c-yx*s];
};
pen.scale=(x,y)=>{matrix=[matrix[0]*x,matrix[1]*x,matrix[2]*y,matrix[3]*y];};
const equal=(a,b,label)=>assert(Math.abs(a-b)<1e-7,label+': '+a+' vs '+b);
sandbox.readPose=(kind,angle)=>{
  if(kind==='bow'){
    const c=Math.cos(angle),s=Math.sin(angle);
    bowAngle=Math.atan2(matrix[1]*c+matrix[3]*s,matrix[0]*c+matrix[2]*s);
    return;
  }
  equal(Math.hypot(matrix[0],matrix[1]),Math.hypot(matrix[2],matrix[3]),kind+' keeps rigid proportions');
  equal(matrix[0]*matrix[2]+matrix[1]*matrix[3],0,kind+' axes stay perpendicular');bodies++;
};
for(const [upper,lower] of [[11.5,11],[13,12.5],[36,32]]){
  for(const side of [-1,1])for(const [x,y] of [[0,0],[1,1],[-12,3],[41,-27],[0,100],[-80,-90]]){
    const q=t.armPose(0,0,x,y,side,upper,lower);
    equal(Math.hypot(q.ex,q.ey),upper,'upper arm length');equal(Math.hypot(q.hx-q.ex,q.hy-q.ey),lower,'forearm length');
    if(Math.hypot(x,y)>Math.abs(upper-lower)+.08&&Math.hypot(x,y)<upper+lower-.08){
      equal(q.hx,x,'reachable grip x');equal(q.hy,y,'reachable grip y');
    }
  }
}
for(const ch of ['lamp','bell','bow']){
  t.reset(true,ch);
  const p=t.player;
  for(const facing of [-1,1]){
    const normal={face:facing,atkFace:facing,attack:0,ground:true,vy:0,vx:0,roll:0,dash:0,hurtT:0,landT:0,charge:0};
    for(const pose of [{vx:252},{ground:false,vy:-510},{ground:false,vy:565},{landT:.12},{roll:.55*.36},{attack:.08},{hurtT:.18},{dash:.11}]){
      Object.assign(p,normal,pose);const count=bodies;t.drawHero();assert(bodies>count);
    }
    if(ch==='bow'){
      const aim=facing>0?-.48:-Math.PI+.48;
      Object.assign(p,normal,{charge:.42,chargeMax:.45,bowAngle:aim});bowAngle=null;t.drawHero();
      equal(bowAngle,aim,'visible arrow follows its launch angle');
    }
  }
}
t.loadStage(0);const guard=t.enemies.find(e=>e.type==='guard');
for(const dir of [-1,0,1]){Object.assign(guard,{hitT:.18,hitDir:dir});const count=bodies;t.drawEnemy(guard);assert(bodies>count);}
assert.equal(stack.length,0);console.log('PASS fixed limb lengths, rigid hero and guard poses, and charged bow alignment');
`;

// Observe the transforms before model-local art, including reflections facing left.
const audit=bootstrap.replace('vm.runInNewContext(code,sandbox);',`
  for(const [name,probe] of [['drawGhost','ghost'],['ghostBall','roll'],['drawStoryGuard','guard'],['bowW','bow']]){
    const header=new RegExp('function '+name+'\\\\([^)]*\\\\)\\\\{');
    assert(header.test(code),'missing model '+name);
    code=code.replace(header,match=>match+'window.readPose?.("'+probe+'"'+(probe==='bow'?',a':'')+');');
  }
  vm.runInNewContext(code,sandbox);
`);
vm.runInNewContext(audit+hooks,{require,__dirname,console});
