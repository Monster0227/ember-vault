/* ES2017 core. Embedded into ember.js by tools/integrate-engine.cjs. */
(function(root){'use strict';
class ObjectPool {
  constructor(capacity,factory,reset){this.items=new Array(capacity);this.free=new Int32Array(capacity);this.count=capacity;this.reset=reset;this.dropped=0;for(let i=0;i<capacity;i++){this.items[i]=factory();this.items[i]._slot=i;this.items[i]._used=false;this.free[i]=capacity-1-i;}}
  acquire(){if(!this.count){this.dropped++;return null;}const o=this.items[this.free[--this.count]];this.reset(o);o._used=true;return o;}
  release(o){if(!o||!o._used)return;o._used=false;this.free[this.count++]=o._slot;}
  clear(){this.count=0;for(let i=0;i<this.items.length;i++){this.items[i]._used=false;this.free[this.count++]=i;}}
}
class InputQueue {
  constructor(capacity=8){this.codes=new Int8Array(capacity);this.expires=new Float64Array(capacity);this.count=0;this.clock=0;}
  push(code){for(let i=0;i<this.count;i++)if(this.codes[i]===code){this.expires[i]=this.clock+.2;return;}if(this.count===this.codes.length)this.remove(0);this.codes[this.count]=code;this.expires[this.count++]=this.clock+.2;}
  remove(i){for(let j=i+1;j<this.count;j++){this.codes[j-1]=this.codes[j];this.expires[j-1]=this.expires[j];}this.count--;}
  take(code){for(let i=0;i<this.count;i++)if(this.codes[i]===code){this.remove(i);return true;}return false;}
  tick(dt){this.clock+=dt;for(let i=this.count-1;i>=0;i--)if(this.expires[i]<this.clock)this.remove(i);}
  clear(){this.count=0;}
}
class HierarchicalFSM {
  constructor(nodes,initial){this.nodes=nodes;this.state=initial;this.path=new Array(16);}
  isIn(id){let s=this.state;while(s){if(s===id)return true;s=this.nodes[s].parent;}return false;}
  transition(id){if(!this.nodes[id])throw Error('Unknown state '+id);if(id===this.state)return;let common=id,n=0;while(common&&!this.isIn(common)){this.path[n++]=common;common=this.nodes[common].parent;}let old=this.state;while(old&&old!==common){const node=this.nodes[old];if(node.exit)node.exit(this);old=node.parent;}this.state=id;while(n){const node=this.nodes[this.path[--n]];if(node.enter)node.enter(this);}}
  dispatch(event){let s=this.state;while(s){const node=this.nodes[s];if(node.handle&&node.handle(this,event))return true;s=node.parent;}return false;}
}
const HERO_NODES={root:{parent:null},ground:{parent:'root'},air:{parent:'root'},combat:{parent:'root'},control:{parent:'root'},idle:{parent:'ground'},run:{parent:'ground'},rise:{parent:'air'},fall:{parent:'air'},attack:{parent:'combat'},hurt:{parent:'control'},dash:{parent:'control'},roll:{parent:'control'}};
// State -> animation frame -> event / hitbox. Ancestor lookup and transition paths reuse storage.
class HeroFSM extends HierarchicalFSM {
  constructor(event){super(HERO_NODES,'idle');this.parent='ground';this.frame=0;this.elapsed=0;this.duration=0;this.hitbox=false;this.fired=false;this.event=event;}
  enter(state,parent,duration=0){if(this.state===state&&state!=='attack')return;this.transition(state);this.parent=parent;this.elapsed=0;this.duration=duration;this.frame=0;this.hitbox=false;this.fired=false;}
  tick(dt,p){if(p.hurtT>0){this.enter('hurt','control');return;}if(p.dash>0){this.enter('dash','control');return;}if(p.roll>0){this.enter('roll','control');return;}
    if(this.state==='attack'&&p.attack>0){this.elapsed=Math.max(this.elapsed+dt,this.duration-p.attack);this.frame=Math.floor(this.elapsed*60);if(!this.fired&&this.frame>=4){this.fired=true;this.event();}this.hitbox=this.frame>=4&&this.frame<7;return;}
    this.enter(p.ground?(Math.abs(p.vx)>10?'run':'idle'):(p.vy<0?'rise':'fall'),p.ground?'ground':'air');this.elapsed+=dt;this.frame=Math.floor(this.elapsed*12)%8;
  }
  canCancel(){return this.state!=='attack'||this.elapsed>=this.duration*.65;}
}
// Slab ray against Minkowski-expanded box. Writes caller-owned output.
function sweepAABB(b,dx,dy,t,out){out.time=1;out.nx=0;out.ny=0;if((dx<=0&&b.x+b.w<=t.x)||(dx>=0&&b.x>=t.x+t.w))return false;
  if((dy<=0&&b.y+b.h<=t.y)||(dy>=0&&b.y>=t.y+t.h))return false;
  const xe=dx>0?(t.x-b.x-b.w)/dx:dx<0?(t.x+t.w-b.x)/dx:-Infinity,xx=dx>0?(t.x+t.w-b.x)/dx:dx<0?(t.x-b.x-b.w)/dx:Infinity;
  const ye=dy>0?(t.y-b.y-b.h)/dy:dy<0?(t.y+t.h-b.y)/dy:-Infinity,yx=dy>0?(t.y+t.h-b.y)/dy:dy<0?(t.y-b.y-b.h)/dy:Infinity;
  const enter=Math.max(xe,ye),exit=Math.min(xx,yx);if(enter<0||enter>1||enter>exit)return false;out.time=enter;if(xe>ye)out.nx=dx>0?-1:1;else out.ny=dy>0?-1:1;return true;
}
class Physics {
  constructor(){this.hit={time:1,nx:0,ny:0};this.box={x:0,y:0,w:0,h:0};this.landed=null;}
  limitGroundRoll(p,dx,platforms){
    // Follow shallow steps, but keep the centre of a grounded roll over a reachable surface.
    const centre=p.x+p.w/2,feet=p.y+p.h;
    let edge=centre;
    for(const a of platforms){
      if(a.off||a===p.drop||a.y<feet-16||a.y>feet+32)continue;
      if(dx>0&&a.x<=p.x+p.w&&a.x+a.w>centre)edge=Math.max(edge,a.x+a.w-2);
      if(dx<0&&a.x+a.w>=p.x&&a.x<centre)edge=Math.min(edge,a.x+2);
    }
    return dx>0?Math.min(dx,edge-centre):Math.max(dx,edge-centre);
  }
  // Descending a rope passes through ledges above its foot, while the bottom landing stays solid.
  move(p,dx,dy,platforms,floor,ropeBottom=-Infinity){this.landed=null;p.ground=false;
    for(let iteration=0;iteration<4&&(dx!==0||dy!==0);iteration++){let best=1,nx=0,ny=0,target=null;
      for(let i=0;i<platforms.length;i++){const a=platforms[i];if(a.off||a===p.drop)continue;
        if(!a.solid&&!a.groundBlock){if(a.y<ropeBottom||dy<=0||p.y+p.h>a.y+3)continue;const t=(a.y-p.y-p.h)/dy,x=p.x+dx*Math.max(0,t);if(t>=-.01&&t<=best&&x+p.w>a.x&&x<a.x+a.w){best=Math.max(0,t);nx=0;ny=-1;target=a;}}
        else{this.box.x=a.x;this.box.y=a.y;this.box.w=a.w;this.box.h=a.h||floor-a.y;if(sweepAABB(p,dx,dy,this.box,this.hit)&&this.hit.time<=best){best=this.hit.time;nx=this.hit.nx;ny=this.hit.ny;target=a;}}
      }
      p.x+=dx*best;p.y+=dy*best;if(!target)break;dx*=1-best;dy*=1-best;
      if(nx){const rise=p.y+p.h-target.y;if(rise>-1&&rise<=16){p.y-=rise;p.vy=0;p.ground=true;if(p.jumps!=null)p.jumps=0;this.landed=target;}else{dx=0;p.vx=0;}}
      if(ny){dy=0;p.vy=0;if(ny===-1){p.ground=true;if(p.jumps!=null)p.jumps=0;this.landed=target;}}if(best===1)break;
    }
  }
}
class AudioPool {
  constructor(ac,bus,count=12){this.ac=ac;this.voices=new Array(count);for(let i=0;i<count;i++){const osc=ac.createOscillator(),gain=ac.createGain();gain.gain.value=0;osc.connect(gain);gain.connect(bus);osc.start();this.voices[i]={osc,gain,until:0};}}
  play(freq,duration,type,volume){const t=this.ac.currentTime;let voice=null;for(let i=0;i<this.voices.length;i++)if(this.voices[i].until<=t){voice=this.voices[i];break;}if(!voice)return;voice.until=t+duration+.03;voice.osc.type=type||'triangle';voice.osc.frequency.cancelScheduledValues(t);voice.osc.frequency.setValueAtTime(freq,t);voice.osc.frequency.exponentialRampToValueAtTime(Math.max(1,freq*.45),t+duration);voice.gain.gain.cancelScheduledValues(t);voice.gain.gain.setValueAtTime(volume||.035,t);voice.gain.gain.exponentialRampToValueAtTime(.0001,t+duration);voice.gain.gain.setValueAtTime(0,voice.until);}
}
root.EmberCore={ObjectPool,InputQueue,HierarchicalFSM,HeroFSM,Physics,sweepAABB,AudioPool};
})(typeof window==='undefined'?globalThis:window);
