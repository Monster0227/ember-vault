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
  move(p,dx,dy,platforms,floor){this.landed=null;p.ground=false;
    for(let iteration=0;iteration<4&&(dx!==0||dy!==0);iteration++){let best=1,nx=0,ny=0,target=null;
      for(let i=0;i<platforms.length;i++){const a=platforms[i];if(a.off||a===p.drop)continue;
        if(!a.solid&&!a.groundBlock){if(dy<=0||p.y+p.h>a.y+3)continue;const t=(a.y-p.y-p.h)/dy,x=p.x+dx*Math.max(0,t);if(t>=-.01&&t<=best&&x+p.w>a.x&&x<a.x+a.w){best=Math.max(0,t);nx=0;ny=-1;target=a;}}
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


(function () {
  'use strict';
  const preview=window.location && window.location.search==='?preview=all';
  function gameStorage(){
    if(!preview){
      try{if(window.localStorage)return window.localStorage;}catch(e){}
    }
    const values=new Map();
    return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  }
  const localStorage=gameStorage();
  const VERSION='5.9';
  const canvas=document.getElementById('world');let ctx=canvas.getContext('2d');   // 图鉴画敌人头像时会临时换成离屏画布
  const panel=document.getElementById('panel'),hud=document.getElementById('hud'),touch=document.getElementById('touch'),notice=document.getElementById('notice'),hint=document.getElementById('hint');
  const pad=document.getElementById('pad'),chestBtn=document.getElementById('chest-btn'),healBtn=document.getElementById('heal-btn'),muteBtn=document.getElementById('mute');
  const talkBox=document.getElementById('talk'),talkWho=document.getElementById('talk-who'),talkText=document.getElementById('talk-text'),talkFace=document.getElementById('talk-face'),itemBtn=document.getElementById('item-btn');
  const gainBox=document.getElementById('gain'),gainArt=document.getElementById('gain-art'),gainName=document.getElementById('gain-name'),gainInfo=document.getElementById('gain-info');
  const LIFE=20,FLOOR=480,CHECKPOINT=3560,ROLL=.22,TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // 手感起步值，实机可调。攻击 4 帧前摇 / 3 帧判定 / 7 帧后摇，按 60fps。
  const FEEL={coyote:.14,buffer:.16,jumpSpeed:536,grav:1320,fall:1.48,accel:.08,brake:.06,hitStop:3/60,hurtStop:6/60,shakeHit:2,shakeHurt:4,shakeDur:.1,kb:200,kbTime:.15,kbBoss:.35,hurtInv:1,dodge:.2,dodgeCd:.8,dead:.1,swing:14/60};
  let WORLD=4400,stage=0,L=null,T=null,PAL=null,decor=null,embers=0,entry=null,titleT=0,nearKind='';
  let W=1100,H=620,scale=1,viewY=0,tall=false,cam=0,time=0,last=0,state='menu',paused=false,lowFx=false,slowT=0;
  let p,enemies=[],shots=[],waves=[],breakables=[],particles=[],floats=[],orbs=[],fx=[],chunks=[],platforms=[],chests=[],kills=0,shake=0,hitstop=0,checkpoint=false,nearChest=false,bellRing=0;
  let hazards=[],loot=[],gateK=0,sealK=0,bossCardT=0,gainT=0,revealC=null,sceneA='',sceneB='',sceneT=0,traps=[],signs={},panelView='menu',lastWrittenSave=null,secrets=[],arm={};   // 首领的落石 / 腐水 / 灵枪；飞向主角的道具图；铁闸；首领名号卡；获得提示；开箱时浮起的奖励；插画；静止机关的预警计时
  let keys={},held={},score=0,messageT=0,ac=null,best=0,muted=false,hudKey='',unlocked=1,deathWhy='受到了攻击',shakeT=0,coachDone=false;
  try{coachDone=localStorage.getItem('ember:coach')==='1';}catch(e){}
  let bag={bomb:0,knife:0,frost:0},relics={},keepsakes={},sel='bomb',thrown=[],offers=[],chestC=null,talk=null,flags={},run={},runSeed=1,shopRelic='',bagTab='bag',introSeen=false;
  let codex={seen:{},kills:{},items:{},lore:{},blue:{}};   // 图鉴跨局保存
  const stick={x:0,y:0};   // 触屏摇杆，-1~1
  // ---- 设置（存在 ember:settings）：音乐 / 音效音量、特效、震屏、伤害数字、文字速度、自动播放对话、按键 ----
  const DEFAULT_KEYS={left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],up:['KeyW','ArrowUp'],down:['KeyS','ArrowDown'],jump:['Space'],attack:['KeyJ'],roll:['KeyK','ShiftLeft'],skill1:['Digit1','Numpad1'],skill2:['Digit2','Numpad2'],skill3:['Digit3','Numpad3'],heal:['KeyL'],use:['KeyU'],cycle:['KeyQ'],interact:['KeyE'],bag:['KeyB'],map:['KeyM','Tab']};
  const KEY_ORDER=['left','right','up','down','jump','attack','roll','skill1','skill2','skill3','heal','use','cycle','interact','bag','map'];
  const KEY_LABEL={left:'向左走',right:'向右走',up:'向上（上挑）',down:'向下（下劈 / 下落）',jump:'跳跃',attack:'攻击',roll:'翻滚',skill1:'技能一',skill2:'技能二',skill3:'技能三',heal:'治疗',use:'使用道具',cycle:'切换道具',interact:'交谈 / 开箱 / 查看',bag:'行囊',map:'地图'};
  let settings={vol:1,music:.7,sfx:.8,fx:'auto',shake:true,nums:true,textSpeed:1,autoTalk:false,touch:'auto',minimap:true,buzz:true,touchA:1,touchX:0,touchY:0},BIND=JSON.parse(JSON.stringify(DEFAULT_KEYS)),codeAct={},rebinding=null;
  function rebuildKeys(){codeAct={};KEY_ORDER.forEach(a=>(BIND[a]||[]).forEach(c=>{if(c&&!codeAct[c])codeAct[c]=a;}));}
  try{const s=JSON.parse(localStorage.getItem('ember:settings')||'null');if(s){Object.keys(settings).forEach(k=>{if(s[k]!=null)settings[k]=s[k];});if(s.keys)KEY_ORDER.forEach(a=>{if(Array.isArray(s.keys[a])&&s.keys[a].length)BIND[a]=s.keys[a].slice(0,2);});}}catch(e){}
  rebuildKeys();
  function saveSettings(){try{localStorage.setItem('ember:settings',JSON.stringify(Object.assign({},settings,{keys:BIND})));}catch(e){}}
  function isKey(a){const b=BIND[a];return !!(b&&(keys[b[0]]||(b[1]&&keys[b[1]])));}
  function keyName(c){if(!c)return '—';if(/^Key/.test(c))return c.slice(3);if(/^Digit/.test(c))return c.slice(5);if(/^Numpad\d/.test(c))return '小键盘'+c.slice(6);return {Space:'空格',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',ShiftLeft:'Shift',ShiftRight:'右 Shift',ControlLeft:'Ctrl',ControlRight:'右 Ctrl',AltLeft:'Alt',AltRight:'右 Alt',Enter:'回车',Tab:'Tab',Backspace:'退格',Comma:',',Period:'.',Slash:'/',Semicolon:';',Quote:"'",BracketLeft:'[',BracketRight:']',Minus:'-',Equal:'=',Backquote:'`',Backslash:'\\'}[c]||c;}
  const K=a=>keyName((BIND[a]||[])[0]);   // 提示文字里显示玩家现在用的按键
  // 角色和周目：通关一次解锁钟锤学徒，通关两次解锁拾灯弓手；周目越高敌人越硬
  let clears=0,cycle=0,credits=null,cine=null,flashT=0,menuFrom='',signAt=-1;
  try{clears=Number(localStorage.getItem('ember:clears'))||0;}catch(e){}
  const UPS=[{id:'blade',name:'磨砺刀锋',info:'攻击伤害 +12'},{id:'heart',name:'重铸心火',info:'生命上限 +1 个小幽灵，并回满'},{id:'flask',name:'温热药瓶',info:'获得 2 次治疗'},{id:'swift',name:'迅捷剑术',info:'挥刀间隔缩短，最多 3 级'},{id:'reach',name:'延展刀锋',info:'挥刀范围扩大，最多 3 级'},{id:'dash',name:'影步',info:'翻滚冷却缩短，最多 3 级'},{id:'vigor',name:'余火疗愈',info:'每级多恢复 1 个小幽灵，最多 3 级'},{id:'spring',name:'轻盈跃动',info:'跳跃更高，最多 3 级'},{id:'flame',name:'魂火共鸣',info:'魂火弹伤害提升，并可穿透更多敌人，最多 3 级'}];
  // 道具：消耗品按 U 使用选中的那种（Q 切换）；护符拿到就一直生效；珍藏是剧情遗物，记在图鉴的传说里。每样东西都有一张手绘图（ART），界面和场景里都画图，不写字
  const ITEMS={
    bomb:{name:'火油罐',kind:'use',info:'往前抛出，落地炸开，烧伤周围的敌人。'},
    knife:{name:'飞刀',kind:'use',info:'笔直飞出，扎中第一个敌人。专治躲在高处的弓手。'},
    frost:{name:'寒霜铃',kind:'use',info:'摇响后，身边的敌人被冻住 3 秒；首领只冻得住一会儿。'},
    leech:{name:'噬魂坠',kind:'relic',info:'每击倒 4 个敌人，恢复 1 个小幽灵。'},
    plate:{name:'铁壳甲片',kind:'relic',info:'每承受 3 次攻击，抵挡其中 1 格伤害。'},
    feather:{name:'疾风羽',kind:'relic',info:'翻滚冷却缩短 40%。'},
    magnet:{name:'余烬磁石',kind:'relic',info:'击倒敌人时多得 30% 余烬。'},
    tassel:{name:'回响刀穗',kind:'relic',info:'第三刀重劈的伤害再提高 40%。'},
    wind:{name:'第二口气',kind:'relic',info:'每层一次：受到致命伤害时留下 1 个小幽灵。'},
    wick:{name:'长明灯芯',kind:'relic',info:'释放魂火弹时恢复 1 个小幽灵。'},
    hunter:{name:'寻火者徽记',kind:'relic',info:'生命高于七成时，挥刀伤害提高 30%。'},
    salvager:{name:'拾荒者工具包',kind:'relic',info:'每击倒 4 个敌人，获得一罐火油。'},
    carving:{name:'囚徒的刻刀',kind:'memento',info:'刀柄被磨得发亮。墙上三百一十二道刻痕，都是它划的。'},
    shade:{name:'刻着名字的灯罩',kind:'memento',info:'灯罩内侧刻着“阿苓”。里面的火，被倒进了污水。'},
    flag:{name:'褪色的旗角',kind:'memento',info:'绣着沉钟纹样的旗角。那时候，钟声还是这座城的骄傲。'},
    beads:{name:'骨制念珠',kind:'memento',info:'每颗珠子上刻着一个名字，都是等钟声的人。'},
    journal:{name:'典狱长的手记',kind:'memento',info:'字迹越往后越潦草：“没有钟声，就没有尽头。”'},
    key:{name:'守钟人的旧钥匙',kind:'memento',info:'守锁兽颈间挂了许多年的钥匙，柄上刻着守钟人的名字。'},
    glass:{name:'溺灯的碎玻璃',kind:'memento',info:'还留着一点温热的绿光，不刺眼，像有人在水底眨眼。'},
    ribbon:{name:'旗手的布条',kind:'memento',info:'从残旗上撕下的一条。风往哪儿吹，它都指着钟楼。'},
    chain:{name:'钟舌的断锁',kind:'memento',info:'锁住钟舌许多年的铜锁。是你亲手把它打开的。'},
    // v5.0：靠图纸解锁的护符（图纸由精英和新敌人掉落、也藏在暗格里，解锁后永久出现在烛叟的货摊和宝箱里）
    veil:{name:'护身铃',kind:'relic',info:'每进一层，挡下第一次受到的伤害。'},
    hunt:{name:'猎魂刃',kind:'relic',info:'每击倒一个敌人，补回 1 格魂火。'},
    echo:{name:'回音石',kind:'relic',info:'每放三次技能，第三次不花魂火。'},
    guide:{name:'引路灯',kind:'relic',info:'暗格的墙会微微发光；地图上标出宝箱和暗格。'},
    // 新的收集品：魂灯碎片（三片 +1 生命上限）、墨翁的地图、图纸
    shard:{name:'魂灯碎片',kind:'shard',info:'藏在暗格里，首领倒下时也会留下一片。集齐三片，生命上限 +1 个小幽灵。'},
    map:{name:'墨翁的地图',kind:'map',info:'从制图人墨翁那里买下。这一层的地形、宝箱、暗格的线索和出口都会画在地图上。'},
    blueprint:{name:'图纸',kind:'blue',info:'精英和新敌人有时会掉落，暗格里也有。每张图纸让一件新护符永久出现在烛叟的货摊和宝箱里。'}};
  const USES=['bomb','knife','frost'],RELICS=['leech','plate','feather','magnet','tassel','wind','wick','hunter','salvager'],BLUEPRINTS=['veil','hunt','echo','guide'],ALL_RELICS=RELICS.concat(BLUEPRINTS);
  const relicPool=()=>RELICS.concat(BLUEPRINTS.filter(id=>codex.blue&&codex.blue[id]));   // 能在货摊和宝箱里出现的护符
  const SHOP=[{id:'soup',name:'篝火热汤',info:'回满生命',price:40},{id:'flask',name:'备用药瓶',info:'药瓶 +1',price:60},{id:'bomb',name:'火油罐 ×2',info:'落地炸开',price:50},{id:'knife',name:'飞刀 ×4',info:'笔直飞出',price:45},{id:'frost',name:'寒霜铃',info:'冻住身边的敌人',price:70},{id:'relic',name:'护符',info:'',price:140},{id:'whetstone',name:'余烬磨石',info:'攻击伤害 +8（每站限一次）',price:90}];
  // 剧情：开场旁白、守钟人、烛叟（每个驿站一段）、每层一处遗物、典狱长；读过的都记进图鉴的“传说”
  const LORE=[
    {id:'prologue',title:'最后的引灯人',text:'你曾是钟楼下为亡魂引路的小引灯人。钟声停后，你为护住一团将熄的魂火，被典狱长连人带灯扔进焚炉；许多年后，那团火把你从灰烬里唤醒。'},
    {id:'keeper',title:'守钟人',text:'守了沉钟一辈子的老人，如今被锁在监牢最深处。他托你一路向上，把钟敲响。'},
    {id:'carving',title:'墙上的刻痕',text:'一个囚徒数了三百一十二天。守钟人告诉过他：只要火还亮着，就不算死。'},
    {id:'lock',title:'守锁兽',text:'守钟人亲手养大的看门兽。典狱长在它胸口挂上巨锁，从此它只记得一件事：门不能开。'},
    {id:'merchant',title:'烛叟',text:'帽檐插满蜡烛的行脚商人，只认余烬不认人。年轻时，他也守过那口钟。'},
    {id:'shade',title:'空灯罩',text:'典狱长的人把收不走的火倒进污水，只留下空灯。有一只灯罩上刻着“阿苓”。'},
    {id:'brood',title:'溺灯',text:'被倒进污水的灯和火，在蓄水池底缠成一团。它不想害谁，只想让所有东西都沉下来，再也不被忘记。'},
    {id:'flag',title:'旗手',text:'城墙上的旗手到死都没放下旗。那时，生者听钟声报时，死者随钟声安息。'},
    {id:'aling',title:'阿苓',text:'烛叟的女儿，怕黑，总提着一盏刻着自己名字的小灯。她的火，被收进了典狱长的灯里。'},
    {id:'beads',title:'祷文',text:'“钟啊，请带走我们的火，别让它们在黑暗里发冷。”'},
    {id:'standard',title:'无名旗手',text:'城卫最后的旗手。城早就没了，他还守着那面旗，守到忘了自己的名字，也忘了自己在守谁。'},
    {id:'journal',title:'典狱长的手记',text:'他害怕钟声，因为每次钟响，就有人走到尽头。他让钟沉默，用别人的火续自己的命。'},
    {id:'warden',title:'沉钟典狱长',text:'他锁住钟舌，想让一切停在告别之前。倒下前他说：钟声原来这么安静。'},
    {id:'ending',title:'钟声',text:'钟声再次响彻地牢。魂火顺着钟声向上，回到它们该去的地方。驿站里，烛叟等到了他的女儿。'}];
  // 台词：[说话人, 内容, 插画场景]；说话人为空是旁白。有场景的句子会在画面上铺一张手绘插画（见 SCENES）
  const TALK={
    prologue:[
      ['','傍晚的钟一响，灯坊就收工。今天是你头一回引路，师父嘱咐你，走几步就回头数数灯。','bell'],
      ['青带女孩','等我一下！过了桥我就认得路了。我把灯晃两下，爹就来接我。','procession'],
      ['','你刚数到她那一盏，钟声断了。典狱长锁住钟舌，女孩的绿火被吸进了他的巨灯。','warden'],
      ['','还剩一点火星。你用双手拢住它。典狱长掰不开你的手，连人带火推下了焚炉。','furnace'],
      ['','灰凉透了。掌心轻轻晃了两下。你睁开眼，望见铁窗外的钟楼。得上去，{g:让她爹听见钟声}。','awaken']
    ],
    keeper:[['守钟人','……这条青围巾。你是当年跟在我身后，提灯提得最认真的那个孩子。','cells'],['守钟人','他们说你和灯一起烧成了灰。原来，是你护住的那团火，把你带了回来。'],['守钟人','我守了那口钟一辈子。钟声一停，魂火就找不到家，只能在黑暗里一点点变冷。','well'],['守钟人','往上走吧。穿过牢狱、污水和城墙，到钟楼顶上去，{g:把钟敲响}。','spire'],['守钟人','拿着这罐火油。你的刀砍中那些空壳时，会唤醒困在里面的魂火，攒满了就把它射出去。','cells'],['守钟人','牢门后面是守锁兽。它曾替我看门……典狱长在它胸口挂了一把锁。','beast'],['守钟人','{w:别恨它。}它早就忘了自己在守什么。'],['守钟人','路上若遇见帽檐插满蜡烛的烛叟，就说是我让你来的。那老头嘴硬，心是热的。','chapel']],
    keeper2:[['守钟人','钟楼还远。别回头，往上走——火在前面等你。']],
    merchant:[[['烛叟','哟，一盏会走路的灯。守钟那老头还没熄透？'],['烛叟','叫我烛叟。我收余烬，卖些能让你多走几步的小玩意儿。'],['烛叟','火边能歇一回。先把手烤暖，再谈价钱。']],
      [['烛叟','闻得出来，你刚从水底下爬上来。'],['烛叟','他们把收不走的火倒进污水，灯就那么漂着，一盏挨一盏，像没人认领的船。'],['烛叟','……我年轻时也提过灯。坐吧，火还旺。']],
      [['烛叟','城墙上风大，把围巾系紧些，别让火苗着了凉。'],['烛叟','那时候我嫌钟声吵。我闺女阿苓却说，听见钟响，就知道家里有人在等她。'],['烛叟','钟停了以后，我捡了很多年的火。没有一盏是她的。']],
      [['烛叟','再往上，就是钟楼了。'],['烛叟','阿苓的火，在典狱长的灯里。我早就知道，只是……一直没敢上去。'],['烛叟','替我把钟敲响吧。她若听见了，就{g:认得回家的路}。'],['烛叟','我在这儿等。你也得回来，听见没有？']]],
    boss:[['沉钟典狱长','又一盏逃出来的火。','spire'],['沉钟典狱长','我听过太多告别。所以我锁住钟舌，让一切都停在最后一刻之前。'],['小幽灵','（他灯里的火在发抖。其中一团，像极了当年你拼命护住的那一团。）','warden'],['沉钟典狱长','钟声一响，它们都会离开。{s:你忍心吗？}'],['小幽灵','（你握紧刀。{g:回家，不该被当成惩罚。}）'],['沉钟典狱长','那就来吧，小引灯人。{b:看看你能护住几盏。}','beast']],
    boss2:[['沉钟典狱长','还没熄？那就再来。']],
    bossDown:[['沉钟典狱长','{w:钟声……原来……这么安静……}'],['','巨灯碎裂。被囚禁的魂火一齐飞起，绕着你转了一圈，像在道谢。'],['','钟舌上的锁，在你手里断开了。']],
    ending:[
      ['','你松开钟绳。回声越过城墙，又从很远的地方传回来。掌心那点火星终于离开了你的手。','ring'],
      ['','火星追上碎灯里升起的绿火，合成一簇。别的火往天上去，只有它认得下山的路。','rise'],
      ['','驿站门口，烛叟正收拾碗筷。灯芯自己亮了，朝他晃了两下。那只碗被他轻轻放了回去。','merchant'],
      ['烛叟','{g:阿苓}。来，挨着爹坐。汤还热着。','merchant'],
      ['','天亮时，你在钟楼上又数了一遍灯。山脚的驿站亮着最后一盏。人都到齐了。','dawn']
    ]};
  const SPOT={carving:[['墙上的刻痕','第三百一十二天。钟没有再响过。'],['墙上的刻痕','守钟人说，只要火还亮着，就不算死。我数着日子，等他们来带走我的火。'],['','刻痕旁边插着一把磨亮的刻刀。你把它收了起来。']],
    shade:[['','污水冲上岸的一只灯罩，里面空空的。'],['','内侧刻着两个字：阿苓。'],['','典狱长的人把火倒进了污水，只留下空灯。你把灯罩收了起来。']],
    flag:[['旗手的遗骸','他到死都没放下这面旗。'],['','旗上绣着沉钟的纹样。那时候，生者听钟声报时，死者随钟声安息。'],['','你撕下一角褪色的旗，收了起来。']],
    beads:[['','骨龛前摆着一串念珠，每颗珠子上都刻着名字。'],['祷文','“钟啊，请带走我们的火，别让它们在黑暗里发冷。”'],['','你把念珠收了起来。']],
    journal:[['典狱长的手记','“每次钟响，就有人走到尽头。我听见钟声，就会想起自己的尽头。”'],['典狱长的手记','“所以我让它沉默。我收集那些将熄的火，一盏一盏点进我的灯里。”'],['典狱长的手记','“没有钟声，就没有尽头。我会一直、一直活下去。”']]};
  const WHO={'守钟人':'#8be1ce','烛叟':'#ffcf86','沉钟典狱长':'#ffb16f','小幽灵':'#dfeaff','守锁兽':'#e2ad6b','溺灯':'#a8ec88','无名旗手':'#d8b3ff','墙上的刻痕':'#b8c4ca','旗手的遗骸':'#d8b3ff','典狱长的手记':'#e6c078','祷文':'#d8cfb8','墨翁':'#a9cfe8'};
  // 五张地图参考死亡细胞的“生态区”：每张有自己的配色、远景、墙饰、机关和敌人涂装；两张之间是篝火驿站，商人用余烬换补给
  const THEMES={
    prison:{sky:[[0,'#070c12'],[.45,'#0e1b27'],[.72,'#13283a'],[1,'#0b141c']],farKind:'town',far:'#10202d',win:'224,161,98',mist:'19,37,50',mid:'arches',arch:'#132230',shaft:['150,210,224','255,200,140'],
      wall:['#1c2a37','#21303e','#192734','#101a22'],stone:['#2e3f4b','#2a3a46','#34464f','#18232c'],floor:['#2b3b47','#26343f','#304250','#16212a'],top:['#6d8274','#3e504b'],ledge:['#7f957f','#4a5c57'],pil:'#273540',moss:['#2f5a3c','#3f7048'],fog:'140,180,190',light:'#ffab5a',
      props:['torch','torch','cage','banner','banner','door','crack'],floorProps:['stone','stone','grass','grass','grass','bone','skull','pot'],fore:['chain','chain','roots'],bell:true,lantern:true},
    rest:{banner:['#5b2427','#6b4a2f'],sky:[[0,'#0b0a0c'],[.5,'#17130f'],[.8,'#221a12'],[1,'#100c09']],farKind:'town',far:'#1a1510',win:'255,180,100',mist:'34,26,18',mid:'arches',arch:'#1f1813',shaft:['255,210,160','255,190,120'],
      wall:['#2a221c','#2f2620','#261e19','#15100c'],stone:['#43372d','#3e3229','#4a3d32','#1f1812'],floor:['#3a2f26','#342a22','#40342a','#1a140f'],top:['#8a7356','#4d3f30'],ledge:['#a08a68','#5a4a38'],pil:'#3a2e25',moss:['#4a5a2c','#5a6a34'],fog:'220,170,120',light:'#ffb35a',
      props:['torch','torch','banner','crack'],floorProps:['stone','grass','pot','pot'],fore:['chain','roots'],lantern:true},
    sewers:{banner:['#2f4a2a','#4a3a22'],sky:[[0,'#050b08'],[.5,'#0b1812'],[.8,'#0f2219'],[1,'#07100c']],farKind:'tunnel',far:'#0b1a13',win:'150,230,120',mist:'12,30,20',mid:'pipes',arch:'#10221a',shaft:['150,230,160','190,240,140'],
      wall:['#192a20','#1e3025','#16261c','#0c1610'],stone:['#2b3c31','#27372d','#314336','#151f18'],floor:['#27372d','#223228','#2d3f33','#121c16'],top:['#5f8a4f','#344f36'],ledge:['#79a165','#43603c'],pil:'#22342a',moss:['#3f6f2f','#5a8f3a'],fog:'110,200,100',light:'#a8f070',
      props:['pipe','pipe','moss','torch','crack','pipe'],floorProps:['stone','grass','puddle','puddle','bone'],fore:['chain','roots','roots'],lantern:true,flame:['#3f9a3a','#9be36a','#eaffc8'],
      guard:{tabard:'#3f5f2f',tabardDark:'#26391c',armor:'#5f6b5a',armorHi:'#8d9a86',helm:'#6b7866'},archer:{cloak:'#3d4a2a',cloakDark:'#29331c',hood:'#4a5a33',eye:'#a6ff6a'}},
    ramparts:{sky:[[0,'#24183a'],[.2,'#4e2a52'],[.34,'#a8505a'],[.44,'#ea9462'],[.56,'#ffc985'],[1,'#ffd99a']],banner:['#8a2f3a','#2f4f7b'],outdoor:true,farKind:'ridge',far:'#2b1f36',win:'255,196,128',mist:'150,84,92',mid:'battle',arch:'#2a1f33',shaft:false,wallTop:318,
      wall:['#3a3446','#413a4d','#352f40','#221d2b'],stone:['#4c4558','#463f52','#524b5e','#26212e'],floor:['#3f3949','#393343','#453f4f','#1f1b27'],top:['#b39276','#5f5062'],ledge:['#c9a98a','#6f5f6b'],pil:'#3a3346',moss:['#4a6a3c','#5d8048'],fog:'255,170,130',light:'#ffb35a',
      props:['banner','slit','torch','slit','flag'],floorProps:['stone','grass','grass','grass','pot'],fore:['roots'],lantern:false,
      guard:{tabard:'#2f4f7b',tabardDark:'#1d3150',armor:'#7a8088',armorHi:'#aab3ba'},archer:{cloak:'#5a3d3a',cloakDark:'#3d2826',hood:'#6a4844'}},
    ossuary:{banner:['#3b2a4f','#5b2440'],sky:[[0,'#0a0710'],[.5,'#150f20'],[.78,'#1e152c'],[1,'#0d0914']],farKind:'town',roofs:['spire','spire','spire','dome'],far:'#161022',win:'205,160,255',mist:'26,18,40',mid:'arches',arch:'#1a1427',skulls:true,shaft:['200,170,255','255,210,170'],
      wall:['#28222f','#2d2635','#241e2b','#14101a'],stone:['#3c3446','#383041','#423a4c','#1c1723'],floor:['#342f3f','#2e2939','#393345','#17131d'],top:['#9a8f7c','#4d4556'],ledge:['#b5a991','#5c5266'],pil:'#2d2738',moss:['#4a3f5a','#5c4f70'],fog:'170,140,215',light:'#ffcf86',spike:'#d8cfb8',
      props:['niche','niche','candle','cage','banner','crack'],floorProps:['bone','bone','skull','skull','candle','stone'],fore:['chain','chain','roots'],lantern:true,
      guard:{tabard:'#4b2f5f',tabardDark:'#2e1c3b',armor:'#6f6878',armorHi:'#a39cae',eye:'#c58bff'},archer:{cloak:'#3c3446',cloakDark:'#28222f',hood:'#4a4056',eye:'#d48bff'}},
    tower:{banner:['#6b2a22','#7b5a2a'],sky:[[0,'#0d0909'],[.45,'#1d1211'],[.72,'#2c1915'],[1,'#140c0a']],farKind:'clock',far:'#1e1411',win:'255,170,90',mist:'44,24,18',mid:'gears',arch:'#1d1310',shaft:['255,190,140','255,160,100'],
      wall:['#2e2420','#342924','#2a201c','#170f0d'],stone:['#46382f','#41342c','#4c3e34','#21170f'],floor:['#3d3029','#372b24','#43352d','#1b120e'],top:['#a7803f','#5a4632'],ledge:['#c79a55','#6a5236'],pil:'#3a2d25',moss:['#5a4a2c','#6a5a34'],fog:'205,125,85',light:'#ffa04a',
      props:['torch','banner','gear','gear','door','crack'],floorProps:['stone','stone','bone','pot','skull'],fore:['chain','chain'],lantern:true,bell:true,
      guard:{tabard:'#7b4a2f',tabardDark:'#4f2c1d'},archer:{cloak:'#4b3a2c',cloakDark:'#33271d',hood:'#5b4634'}}};
  // 关卡数据：平台 [x, y, 宽]，敌人 [x, 脚下高度, 类型, 选项]，宝箱 [x, y]，尖刺 [x, 根数]，毒水 [x, 宽]，断崖 [起, 止]
  const REST={theme:'rest',n:'歇脚',name:'篝火驿站',en:'Campfire Waystation',w:1020,seed:777,rest:true,hpK:1,dmgK:1,exit:720,fire:250,shop:470,plats:[],ens:[],chests:[],spikes:[],acid:[],gaps:[]};
  // Each route has three landmarks. Keep the entrance, one signature obstacle and a short exit approach.
  const mainLevels=[
    {theme:'prison',chapter:1,chapterStart:true,name:'沉钟监牢',en:'Bellward Prison',w:3560,exit:3380,seed:20261101,hpK:1,dmgK:1,
      npc:60,ink:1690,lore:{x:3210,id:'carving'},bands:[[0,'监房','cells'],[1250,'钟井','well'],[2480,'祷堂','chapel']],
      plats:[[320,450,85],[415,420,85],[440,370,230],[800,295,205],[850,446,94],[930,412,120],[1010,405,150],[1050,494,70],
        [1180,355,270],[1480,260,115],[1650,370,180],[1900,280,260],[2030,195,105],[2250,300,130],
        [2480,450,94],[2608,421,112],[2748,444,104],[2900,280,240],[3070,197,95]],
      terrain:[[690,80,424],[1340,100,432]],steps:[[1900,466,44],[1948,452,44],[1996,438,48],[2048,424,56]],
      trenches:[[2140,90,26]],slopes:[[1900,210,480,424]],broken:[[2124,70]],gaps:[[1050,1120],[2530,2760]],
      movers:[[2540,365,112,118,0,4.6,0]],climbs:[[3000,195,465]],springs:[[2950,280,42]],
      ens:[[590,480,'guard',{sparring:true}],[900,295,'archer'],[1280,480,'guard'],[1740,370,'guard'],[2310,480,'shield'],
        [2550,405,'flyer'],[2840,480,'crawler'],[3160,480,'flyer'],
        [810,295,'crawler'],[1385,355,'guard'],[1610,480,'crawler'],[2430,480,'guard'],[2975,280,'archer']],
      traps:[{k:'tspike',x:1810,n:3,per:3,ph:.3},{k:'pendulum',x:2380,top:42,len:346,amp:.36,per:3.8,ph:0}],
      chests:[[600,370],[2050,280],[3000,280]],caches:[360,1460,2470],secrets:[[1630,FLOOR,'shard'],[3115,197,'embers']],
      spikes:[[2320,3]],acid:[],checks:[900,1550,2280,2910]},
    {theme:'sewers',chapter:2,chapterStart:true,name:'腐水下水道',en:'Rotwater Sewers',w:3730,exit:3550,seed:4242,hpK:1.35,dmgK:1.15,
      intro:'污水漫过旧路 · 看准喷口间歇，借浮台过水',ink:980,lore:{x:2100,id:'shade'},bands:[[0,'暗渠','drain'],[1240,'蓄水池','cistern'],[2490,'灯坟','nest']],
      plats:[[380,360,200],[700,290,180],[860,173,100],[1000,360,220],[1250,385,150],[1450,305,185],[1720,395,135],
        [1950,310,210],[2220,370,160],[2450,448,100],[2610,417,106],[2780,435,110],[2920,454,110],[3060,355,195],[3170,245,135]],
      terrain:[[710,90,426],[1820,95,430]],steps:[[2240,465,52],[2292,449,54],[2346,436,66]],slopes:[[2240,172,480,436]],
      trenches:[[2110,88,22]],broken:[[2100,108]],gaps:[[2460,2950,'acid']],spikes:[],acid:[[1280,90],[1980,90]],
      movers:[[2510,380,104,120,0,4.8,0],[2720,370,112,122,0,4.8,.5]],climbs:[[3210,244,454]],springs:[[3100,355,42]],
      ens:[[520,480,'guard'],[820,290,'archer'],[1130,360,'guard'],[1510,305,'archer'],[1690,480,'lurker'],[2030,310,'bomber'],
        [2430,480,'flyer'],[3040,480,'spear'],[3130,355,'guard'],
        [670,480,'crawler'],[1210,480,'guard'],[1590,480,'flyer'],[2305,370,'archer'],[3390,480,'crawler']],
      traps:[{k:'spout',x:1415,per:3.4,ph:.2,h:170},{k:'vent',x:2990,w:65,per:3,ph:0,h:210},{k:'spout',x:3290,per:3.2,ph:.5,h:180}],
      chests:[[470,360],[2010,310],[3240,245]],caches:[585,1425,1640,3090],secrets:[[1560,FLOOR,'blue'],[3280,245,'shard']],checks:[1060,1930,3030]},
    {theme:'ramparts',chapter:3,chapterStart:true,name:'落日城墙',en:'Sunset Ramparts',w:3930,exit:3750,seed:9090,hpK:1.7,dmgK:1.3,
      intro:'风从城垛间灌进来 · 小心断崖与弩箭',ink:1370,lore:{x:3060,id:'flag'},bands:[[0,'城门','gate'],[1390,'城垛','wall'],[2700,'残塔','tower']],
      plats:[[420,360,200],[760,290,200],[920,212,105],[1150,355,215],[1490,285,170],[1760,360,165],[1920,285,115],
        [2240,335,120],[2680,355,160],[2780,239,105],[3090,330,190],[3310,265,165]],
      terrain:[[700,90,426],[1510,95,432]],steps:[[1940,465,52],[1992,448,56],[2048,432,68]],slopes:[[1940,176,480,432]],
      trenches:[[2140,72,24]],broken:[[2128,94]],gaps:[[940,1040],[2260,2630]],spikes:[],acid:[],
      crumbles:[[2250,448,98],[2392,418,108],[2540,438,110]],climbs:[[2805,238,448]],springs:[[2710,355,42]],
      ens:[[600,480,'guard'],[850,290,'archer'],[1200,355,'guard'],[1640,480,'spear'],[1800,360,'archer'],[2310,480,'flyer'],
        [2740,355,'shield'],[2980,480,'guard',{elite:true}],[3360,265,'archer'],[3480,480,'hanger'],[820,480,'crawler'],[1260,480,'spear'],[2030,285,'archer'],[2615,480,'flyer'],[3150,330,'guard']],
      traps:[{k:'wind',x0:2360,x1:2540,dir:-1,per:6,ph:0},{k:'ballista',x:3150,y:330,dir:-1,per:3.6,ph:.5}],
      chests:[[500,360],[3420,265]],caches:[675,1410,2880,3440],secrets:[[1620,FLOOR,'relic'],[3550,FLOOR,'shard']],
      shortcut:{open:2850,door:520,dest:2660},checks:[1130,1740,2670,3260]},
    {theme:'ossuary',chapter:3,name:'骸骨墓窟',en:'Bone Crypt',w:4000,exit:3820,seed:6161,hpK:2.05,dmgK:1.45,
      intro:'骨龛里的蜡烛仍在燃烧 · 沿灯穿过暗室',ink:1620,lore:{x:1310,id:'beads'},bands:[[0,'骨廊','oss'],[1440,'龛室','niche'],[2600,'夜殿','nave']],
      plats:[[400,355,220],[780,280,200],[900,155,108],[1080,360,160],[1400,300,220],[1780,360,200],[1970,255,110],
        [2320,335,170],[2680,350,170],[2910,275,140],[3280,332,175],[3380,217,118]],
      terrain:[[650,95,426],[1740,85,434]],steps:[[2110,466,44],[2154,450,53],[2207,436,65]],slopes:[[2110,162,480,436]],
      trenches:[[2300,85,22]],broken:[[2288,106]],gaps:[[2410,2550]],spikes:[[1110,3],[2810,3]],acid:[],dark:[2150,4000],
      crumbles:[[2400,445,80],[2508,418,95],[2770,425,110],[2902,399,100]],climbs:[[3408,216,450]],springs:[[3310,332,42]],
      ens:[[560,480,'guard'],[860,280,'archer'],[1440,300,'guard'],[1870,480,'lurker'],[2050,480,'spear'],
        [2350,335,'archer'],[2680,480,'caster'],[3000,480,'crawler'],[3330,332,'caster'],[3520,480,'guard',{elite:true}],[780,480,'crawler'],[1230,480,'hanger'],[1890,360,'guard'],[2610,480,'flyer'],[3180,480,'guard']],
      traps:[{k:'jet',x:1510,y:FLOOR-24,dir:1,len:105,per:3,ph:0},{k:'jet',x:2700,y:FLOOR-24,dir:1,len:150,per:3,ph:.5},
        {k:'jet',x:3430,y:FLOOR-24,dir:-1,len:150,per:3,ph:0}],
      chests:[[470,355],[3430,217]],caches:[600,1380,2040,3230],secrets:[[1430,FLOOR,'shard'],[3170,FLOOR,'blue']],checks:[990,1840,2220,2600,3090,3560]},
    {theme:'tower',chapter:4,chapterStart:true,name:'沉钟之巅',en:'Bell Spire',w:4100,exit:3920,seed:3131,hpK:2.4,dmgK:1.6,
      intro:'齿轮在头顶转动 · 找准落锤的节拍',ink:1630,lore:{x:3420,id:'journal'},bands:[[0,'齿轮廊','gears'],[1460,'钟腹','belly'],[2800,'钟舌','tongue']],
      plats:[[380,350,200],[700,280,180],[860,162,102],[980,350,200],[1300,290,220],[1650,360,200],[1880,232,110],
        [2010,305,190],[2270,370,152],[2460,450,96],[2598,431,105],[2754,407,104],[2890,439,100],[3100,350,175],[3260,235,130]],
      terrain:[[650,100,428],[1510,95,430]],steps:[[2060,464,50],[2110,448,56],[2166,435,62]],slopes:[[2060,168,480,435]],
      trenches:[[2280,86,24]],broken:[[2270,110]],gaps:[[2470,2920]],spikes:[[1130,4],[1940,4]],acid:[],
      movers:[[2510,406,110,0,-70,4.2,0],[2650,348,108,95,0,4.8,0],[2840,369,106,0,-65,4.2,.5]],
      climbs:[[3290,234,455]],springs:[[3130,350,42]],
      ens:[[555,480,'guard'],[765,280,'archer'],[1040,350,'guard'],[1340,290,'archer'],[1760,480,'lurker'],[1910,480,'spear'],
        [2070,305,'archer'],[2330,370,'guard'],[3030,480,'hanger'],[3300,235,'archer'],[3470,480,'shield'],[780,480,'crawler'],[1380,480,'spear'],[1800,360,'guard'],[2410,480,'flyer'],[3200,350,'bomber'],[3750,480,'guard']],
      traps:[{k:'piston',x:1420,w:72,per:3.4,ph:0},{k:'piston',x:3020,w:75,per:3.2,ph:.25},
        {k:'vent',x:3220,w:64,per:3,ph:0,h:200},{k:'pendulum',x:3610,top:40,len:360,amp:.42,per:3,ph:0}],
      chests:[[470,350],[2150,305],[3350,235]],caches:[605,1370,2400,3500],secrets:[[1680,FLOOR,'shard'],[3360,FLOOR,'relic']],checks:[980,1660,2400,3420]}
  ];
  const CHAPTERS=[
    {name:'第一章 · 灰烬囚牢',story:[['守钟人','牢门后面是守锁兽，它守着离开牢狱的路。','cells'],['守钟人','它曾替我看门。别恨它，它早就忘了自己在守什么。']]},
    {name:'第二章 · 沉入腐水',story:[['','旧钥匙系在了围巾上。牢门外，污水漫过旧路，水面漂着一盏盏空灯。','cistern'],['小幽灵','（每一盏空灯，原本都有一团火。有人把它们倒进了水里。）'],['','水声深处，有什么东西在吞灯。']]},
    {name:'第三章 · 遗忘之城',story:[['','溺灯沉下去的地方，露出通往城墙的阶梯。晚风穿过城垛，残旗仍朝着钟楼。','wall'],['小幽灵','（你记得这座城。那时钟声报时，旗手在城头挥旗。）'],['','城墙之后是墓窟。最后一位旗手，还守在那里。','crypt']]},
    {name:'第四章 · 最后的钟声',story:[['','旗手的布条系在围巾上，像一面小小的旗。钟楼的齿轮还在转，却没有钟声。','spire'],['小幽灵','（顶层亮着一盏巨大的灯。阿苓的火在里面，无数没能回家的火也在里面。）'],['','这一次你不是一个人：一路唤醒的魂火，在围巾下轻轻发烫。']]}
  ];
  // 首领：名字、登场 / 倒下对白、名号卡（title 大字、sub 小字）、二阶段提示、场地氛围色 tint、击败后留下的珍藏 drop
  const BOSSES={
    lock:{name:'守锁兽 · 铜壳',title:'守 锁 兽',sub:'铜壳 · 牢门最后的看守',color:'#e2ad6b',tint:'40,62,86',drop:'key',rage:'胸口的巨锁崩开了——守锁兽发狂了',
      intro:[['','铁门后传来沉重的呼吸。锁链拖过石板，一步，一步。','beast'],['守锁兽','{s:……门……不能开……}'],['小幽灵','（它胸口挂着一把巨锁。锁下，守钟人的旧钥匙还在晃。）'],['守锁兽','{s:火……}{b:留下！}']],
      again:[['守锁兽','……门……不开……']],
      down:[['守锁兽','……锁……松了……'],['','它伏在地上，像一只终于能睡觉的老狗。旧钥匙从它颈间滑落。'],['','你拾起钥匙。牢门深处，传来久违的水声。']]},
    brood:{name:'腐潮母巢 · 溺灯',title:'溺 灯',sub:'腐潮母巢 · 吞下千盏灯的水底之物',color:'#a8ec88',tint:'34,74,40',drop:'glass',rage:'灯罩碎裂——溺灯的火烧得更旺了',
      intro:[['','水面鼓起一个巨大的泡。一盏比房子还大的灯，从污水里浮了上来。','nest'],['溺灯','{w:留下来……水会替你记住……所有名字……}'],['小幽灵','（灯身上缠满被丢弃的灯罩。每一只，都曾有人提着回家。）'],['溺灯','{w:你的火……也沉下来吧……}']],
      again:[['溺灯','……又……浮上来了……']],
      down:[['溺灯','水……之外……还有路吗……'],['','灯罩一只只松开，漂向远处。水退了，露出通往城墙的阶梯。'],['','灯底留下一片碎玻璃，还带着一点温热的绿光。']]},
    standard:{name:'无名旗手 · 归骨',title:'无 名 旗 手',sub:'归骨 · 城卫最后的旗',color:'#d8b3ff',tint:'60,34,92',drop:'ribbon',rage:'残旗燃起了灵火——旗手不再后退',
      intro:[['无名旗手','站住。{b:旗还在，城就没有失守。}','banner'],['小幽灵','（他的盔甲碎了，旗也破了，可握旗的手一点也没松。）'],['无名旗手','我记不得自己守的是谁……但这面旗，不能倒。'],['无名旗手','后退。不然，就倒下。']],
      again:[['无名旗手','你又回来了。很好。']],
      down:[['无名旗手','我想起来了……我守的，是{g:他们回家的路}。'],['无名旗手','钟楼……还在等。替我……把旗带过去。'],['','旗手松开旗杆。你撕下一条布系在围巾上，它朝着钟楼的方向飘。']]},
    warden:{name:'沉钟典狱长',title:'沉钟典狱长',sub:'锁住钟声的人',color:'#ffb16f',tint:'96,48,14',drop:'chain',rage:'典狱长敲响了头顶的钟',intro:TALK.boss,again:TALK.boss2,down:TALK.bossDown}
  };
  // 首领房：钟火在 245，走过 500 触发登场；开打后身后 gate 处落下铁闸、东侧 seal 封住，打倒首领才都打开
  function bossRoom(kind,chapter,theme,hpK,dmgK,seed,name,en){return{theme:theme,n:'第'+['一','二','三','四'][chapter-1]+'章 · 首领',chapter:chapter,arena:true,bossKind:kind,name:name,en:en,w:1500,seed:seed,hpK:hpK,dmgK:dmgK,checkpoint:245,trigger:500,gate:300,seal:1350,bell:kind==='warden'?880:null,plats:[[360,362,130],[1000,362,140]],ens:[[800,480,'boss']],chests:[],spikes:[],acid:[],gaps:[]};}
  let visitedCrypt=false;try{visitedCrypt=localStorage.getItem('ember:visited-crypt')==='1';}catch(e){}
  const way=i=>Object.assign({},REST,{restNo:i,chapter:Math.min(4,i+1)});
  const [prison,sewers,ramparts,ossuary,tower]=mainLevels;
  const STAGES=[
    prison,bossRoom('lock',1,'prison',1,1,8101,'锁门兽庭','The Gatekeeper'),way(0),
    sewers,bossRoom('brood',2,'sewers',1.35,1.15,8102,'溺灯蓄水池','The Drowned Nest'),way(1),
    ramparts,way(2),ossuary,bossRoom('standard',3,'ossuary',2.05,1.45,8103,'无名者祭场','The Last Standard'),way(3),
    tower,bossRoom('warden',4,'tower',2.4,1.6,8104,'沉钟之心','The Silent Bell')
  ];
  // The raised lamps have broad ledges. A single unupgraded jump reaches every landing.
  const lampLevels={prison:[480,404,480,420],sewers:[480,410,480],ramparts:[480,408,480,422],ossuary:[480,410,436,480,480,415],tower:[480,418,480,408]};
  for(const room of mainLevels){
    room.wicks=room.checks.map((x,i)=>({x,y:lampLevels[room.theme][i]}));
    for(const wick of room.wicks)if(wick.y<FLOOR)room.plats.push([wick.x-64,wick.y,136]);
    room.wicks.push({x:room.exit,y:FLOOR,door:true});
    if(room.shortcut)room.shortcut.wicks=room.wicks.filter(w=>w.x<=room.shortcut.dest).length;
  }
  let currentLevel=0;
  for(const room of STAGES){
    if(mainLevels.includes(room)){currentLevel++;room.n='第'+'一二三四五'[currentLevel-1]+'关';}
    room.levelNo=currentLevel;
  }

  // 第一关从安全步道出发；后续关卡在入口先展示这层的新机关。
  const routePace={
    prison:{oldExit:6000,trapPeriod:1.25,brief:'入门 · 在矮台练跳跃，向守卫试第一击'},
    sewers:{oldExit:6380,trapPeriod:1.16,brief:'起步 · 看准喷口间歇，借浮台过水'},
    ramparts:{oldExit:6590,trapPeriod:1.08,brief:'进阶 · 顶风躲箭，越过会塌的城垛'},
    ossuary:{oldExit:6290,trapPeriod:1,brief:'深入 · 沿灯穿过暗室，留心骨巫的灵枪'},
    tower:{oldExit:6360,trapPeriod:.94,brief:'终关 · 找准落锤节拍，穿过摆刃'}
  };
  {const S=th=>STAGES.find(s=>s.theme===th&&!s.arena&&!s.rest);
    const room=(th,trap,hint)=>{const s=S(th);if(!s)return;s.traps=(s.traps||[]).filter(t=>!t.teach);s.traps.unshift(Object.assign({teach:1},trap));s.lesson={door:400,hint:hint};};
    const prison=S('prison');
    prison.lesson={practiceX:964,hint:'木桥下的练习地刺会先发亮，再弹起。你可以从桥上走过去。'};
    prison.traps.unshift({k:'tspike',x:964,n:3,per:3,ph:0,teach:1,harmless:true});
    room('sewers',{k:'spout',x:268,per:2.6,ph:0,h:150},'这间屋子只有喷口。先冒泡变色，再喷出来。看完一轮，石门打开。');
    room('ramparts',{k:'ballista',x:280,y:210,dir:1,per:2.8,ph:.15},'这间屋子只有弩炮。它朝东射。站在左边看它拉满、射出。石门随后打开。');
    room('ossuary',{k:'jet',x:250,y:FLOOR-24,dir:1,len:90,per:2.6,ph:0},'这间屋子只有喷火骷髅。眼里先聚紫火，再吐火舌。看完一轮，石门打开。');
    room('tower',{k:'piston',x:236,w:64,per:2.8,ph:0},'这间屋子只有落锤。它先在顶上发抖，再砸下来。看完一轮，石门打开。');
  }
  // ---- 教程：焚炉底层。石碑上画着按键（跟着设置里的改键变），走近时下方也会说明 ----
  THEMES.furnace={sky:[[0,'#0d0705'],[.5,'#1d0f09'],[.8,'#2a150b'],[1,'#120905']],farKind:'tunnel',far:'#1f120b',win:'255,150,70',mist:'50,22,10',mid:'arches',arch:'#22140d',shaft:['255,170,100','255,130,60'],banner:['#5b2a1c','#6b4a2f'],
    wall:['#2a1d17','#30211a','#261a14','#140d09'],stone:['#43322a','#3d2d25','#4a382e','#1f150f'],floor:['#3a2a22','#33251e','#3f2f26','#1a110c'],top:['#8a6a4a','#4d3a2a'],ledge:['#a07a54','#5a4232'],pil:'#3a2a20',moss:['#5a3a1c','#6a4a24'],fog:'230,140,80',light:'#ff9a4a',
    props:['torch','torch','crack','door','pipe'],floorProps:['stone','stone','bone','skull','pot'],fore:['chain','chain'],lantern:true};
  function controlLabel(action){
    if(!coarse())return K(action);
    return {left:'摇杆向左',right:'摇杆向右',up:'摇杆向上',down:'摇杆向下',use:'道具'}[action]||KEY_LABEL[action];
  }
  function practiceSign(x, slot){
    const key='skill'+slot;
    return {x,keys:[key],t:()=>{
      const skill=SKILLS[CHARS[p.char].skills[slot-1]];
      const tips=['面朝木偶，冲过它的身体。','贴近木偶，让绕身的灯火扫中它。','对准前方一排木偶，从远处出手。'];
      return (coarse()?'轻点技能 '+slot:'按 '+K(key))+' · '+skill.name+'\n'+(p.char==='lamp'?tips[slot-1]:skill.info);
    }};
  }
  const TUTORIAL={theme:'furnace',tutorial:true,n:'教程',name:'焚炉底层',en:'The Furnace Below',w:4680,seed:1207,hpK:1,dmgK:1,exit:4520,chapter:1,secrets:[[4410,FLOOR,'embers']],
    plats:[[870,345,150],[1080,262,140],[1250,365,210],[1890,350,130]],terrain:[[690,90,420]],
    ens:[[1660,480,'dummy'],[1780,480,'dummy'],[1950,350,'dummy'],[2980,480,'dummy'],[3100,480,'dummy'],[3370,480,'dummy'],[3850,480,'dummy'],[3940,480,'dummy']],
    chests:[],spikes:[[2140,9]],acid:[],gaps:[],caches:[2880],traps:[{k:'spout',x:2600,per:2.6,ph:0,h:170,fire:true}],
    signs:[{x:250,keys:['left','right'],t:()=>(coarse()?'左右推摇杆移动':K('left')+' / '+K('right')+' 左右移动')+'。这里的药瓶、道具和魂火用不完。'},
      {x:560,keys:['jump'],t:()=>(coarse()?'点「跳跃」':'按 '+K('jump')+' 起跳')+'。'+(p.char==='lamp'?'空中再按一次可以二段跳。':'按得越久，跳得越高。')},
      {x:1330,keys:['down','jump'],t:()=>(coarse()?'摇杆向下推住，同时点「跳跃」':'按住 '+K('down')+' 再按 '+K('jump'))+'，就能穿过脚下的悬空平台。'},
      {x:1530,keys:['attack'],t:()=>(coarse()?'点「攻击」挥刀。摇杆上推时上挑，空中下推时下劈。':K('attack')+' 攻击，按住 '+K('up')+' 上挑，空中按住 '+K('down')+' 下劈。')+'\n连砍三下，第三下是重劈。'},
      {x:2040,keys:['down','attack'],t:()=>(coarse()?'空中向下推住摇杆，再点「攻击」。':'空中按住 '+K('down')+' 再按 '+K('attack')+'。')+'\n下劈击中尖刺或敌人就会弹起。'},
      {x:2440,keys:['roll'],t:()=>(coarse()?'点「翻滚」':K('roll')+' 翻滚')+'可以避开伤害，穿过前面的炉火。'},
      practiceSign(2800,1),
      practiceSign(3260,2),
      practiceSign(3670,3),
      {x:4040,keys:['heal','use','bag'],t:()=>coarse()?'点药瓶治疗，点旁边的道具使用。\n右上角的行囊可以换道具。':K('heal')+' 喝药治疗 · '+K('use')+' 使用道具 · '+K('bag')+' 打开行囊',gift:true},
      {x:4340,keys:['attack','map'],t:()=>'有裂纹的墙可以打破。\n'+(coarse()?'点右上角的地图查看出口。':'按 '+K('map')+' 打开地图。前面就是出口。')}]};
  try{unlocked=clamp(Number(localStorage.getItem('ember:unlocked'))||1,1,4);best=Number(localStorage.getItem('ember:best'))||0;muted=localStorage.getItem('ember:muted')==='1';introSeen=localStorage.getItem('ember:intro-v3')==='1';const c=JSON.parse(localStorage.getItem('ember:codex')||'null');if(c)['seen','kills','items','lore','blue'].forEach(k=>{if(c[k])codex[k]=c[k];});if(codex.seen.boss)codex.seen.warden=1;if(codex.kills.boss&&!codex.kills.warden)codex.kills.warden=codex.kills.boss;}catch(e){}
  function saveCodex(){try{localStorage.setItem('ember:codex',JSON.stringify(codex));}catch(e){}}
  // 图鉴记录：第一次见到 / 得到 / 读到时提示一下；击倒数只累加
  function note(kind,id){const m=codex[kind];if(kind==='kills')m[id]=(m[id]||0)+1;else{if(m[id])return;m[id]=1;if(kind==='lore'){const l=LORE.find(q=>q.id===id);say('图鉴 · 传说「'+(l?l.title:id)+'」已记录',2.2);}}saveCodex();}
  function gain(id,n,quiet){const it=ITEMS[id];if(it.kind==='use'){if(!bag[sel])sel=id;bag[id]+=n||1;}else if(it.kind==='relic')relics[id]=true;else keepsakes[id]=true;note('items',id);hudKey='';if(!quiet)showGain(id,n);}
  // 获得提示：画面中间偏上浮出那样东西的画，下面一行名字和用处
  function showGain(id,n){const it=ITEMS[id]||UPS.find(u=>u.id===id);if(!it)return;toast(id,it.name+(n>1?' ×'+n:''),it.info||'');}
  function artImg(id,dark){const u=artURL(id,dark);return u?'<img alt="" src="'+u+'">':icon(id);}
  function chip(id,v){return'<span class="chip">'+artImg(id)+'<b>'+v+'</b></span>';}
  // 场景里冒出来的道具：画 + 数量（不写名字）
  function popArt(id,label,x,y){floats.push({x:x,y:y,art:id,t:label||'',c:'#f6e6c4',life:1.2,big:false});}
  const coarse=()=>settings.touch==='show'||(settings.touch!=='hide'&&window.matchMedia('(pointer:coarse)').matches);
  // 场景装饰用固定种子生成：每局都一样，不占存档
  function rng(s){return()=>(s=s*16807%2147483647)/2147483647;}
  const inGap=x=>L.gaps.some(g=>x>g[0]-12&&x<g[1]+12);
  function makeDecor(){const r=rng(L.seed),pick=a=>a[Math.floor(r()*a.length)],d={far:[],arches:[],walls:[],props:[],pillars:[],floor:[],fore:[]},ww=L.w;
    const bad=x=>L.spikes.some(s=>x>s[0]-20&&x<s[0]+s[1]*20+15)||L.acid.some(s=>x>s[0]-15&&x<s[0]+s[1]+15)||inGap(x);
    for(let x=0;x<1600;){const w=46+r()*104;d.far.push({x:x,w:w,h:120+r()*190,roof:pick(T.roofs||['spire','spire','flat','dome']),win:1+Math.floor(r()*3)});x+=w+8+r()*46;}
    for(let x=0;x<1300;x+=260)d.arches.push({x:x,warm:r()<.3,chain:r()<.55});
    for(let x=-150;x<ww*.55+2400;){const w=230+r()*270;d.walls.push({x:x,w:w});for(let q=x+70;q<x+w-60;q+=120+r()*150)d.props.push({x:q,k:pick(T.props),s:r()});x+=w+260+r()*280;}
    for(let x=80;x<ww;x+=440){const q={x:x,broken:r()<.3,moss:r()};if(!inGap(x)&&!inGap(x+24)&&Math.abs(x-(L.exit||L.seal))>150&&!(L.rest&&Math.abs(x-L.shop)<140))d.pillars.push(q);}
    for(let x=30;x<ww;x+=36+r()*80){if(bad(x))continue;d.floor.push({x:x,k:pick(T.floorProps),s:r()});}
    for(let x=500;x<ww*1.35+400;x+=600+r()*700)d.fore.push({x:x,k:pick(T.fore),s:r()});
    return d;}
  // 由主色推出明暗层次（拱窗、石柱），每个主题只算一次
  function tint(h,k){const n=parseInt(h.slice(1),16);let s='#';[16,8,0].forEach(b=>{const c=Math.max(0,Math.min(255,Math.round((n>>b&255)*k)));s+=(c<16?'0':'')+c.toString(16);});return s;}
  function prep(t){if(t.ready)return;t.ready=true;const a=t.arch,q=t.pil;t.archC=[tint(a,1.2),tint(a,1.45),tint(a,1.32),tint(a,.58)];t.pilC=[tint(q,1.1),tint(q,1.5),tint(q,.72),tint(q,1.42),tint(q,.62),tint(q,1.27),tint(q,1.8)];
    t.farEdge=tint(t.far,1.45);t.towerC=tint(t.far,.82);t.towerIn=tint(t.far,.45);t.winA=['rgba('+t.win+',.22)','rgba('+t.win+',.55)'];t.spikeC=t.spike?[t.spike,tint(t.spike,.7)]:['#9ea4a6','#6b7276'];}
  // 竖屏：视野至少 560 宽，地面放在 60% 高度，下方留给触屏按键；横屏触屏：画面上移，按键只压住地面以下
  let resizePending=false;
  function queueResize(){if(resizePending)return;resizePending=true;requestAnimationFrame(()=>{resizePending=false;resize();});}
  function resize(){const viewport=window.visualViewport,vw=viewport?viewport.width:innerWidth,vh=viewport?viewport.height:innerHeight;if(!Number.isFinite(vw)||!Number.isFinite(vh)||vw<1||vh<1){queueResize();return;}const d=Math.max(1,Math.min(devicePixelRatio||1,2)),playH=vh>vw||!coarse()?vh:Math.max(120,vh-(vw>=740?92:104)),cw=Math.max(1,Math.round(vw*d)),ch=Math.max(1,Math.round(playH*d));if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;keys={};clearHeld();}canvas.style.width=vw+'px';canvas.style.height=playH+'px';document.getElementById('stage').style.width=vw+'px';document.getElementById('stage').style.height=vh+'px';ctx.imageSmoothingEnabled=false;tall=vh>vw;document.getElementById('stage').classList[coarse()?'add':'remove']('touch-layout');
    if(tall){W=clamp(vw*1.5,560,900);scale=canvas.width/W;H=canvas.height/scale;viewY=FLOOR-H*.6;}else{H=coarse()?420:620;W=H*vw/playH;scale=canvas.height/H;viewY=coarse()?FLOOR-H*.8:0;}verticalBase=viewY;if(state==='map')paintMap();}
  addEventListener('resize',resize);addEventListener('orientationchange',()=>{queueResize();setTimeout(queueResize,150);setTimeout(queueResize,450);});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',queueResize);
  document.addEventListener('fullscreenchange',queueResize);addEventListener('pageshow',queueResize);
  // 返回渲染逻辑坐标；世界坐标还需加 cam / viewY。每次读取边界，避免旋转后的旧缓存。
  window.mapTouchToCanvas=function(clientX,clientY){const r=canvas.getBoundingClientRect();if(r.width<=0||r.height<=0)return null;return{x:(clientX-r.left)*W/r.width,y:(clientY-r.top)*H/r.height};};

  const particlesPool=new EmberCore.ObjectPool(512,()=>({x:undefined,y:undefined,vx:undefined,vy:undefined,life:undefined,max:undefined,color:undefined,size:undefined,g:undefined,glow:undefined,streak:undefined,drag:undefined,soft:undefined}),o=>{});
  const floatsPool=new EmberCore.ObjectPool(128,()=>({x:0,y:0,t:'',c:'#efe2c8',life:0,big:false,art:undefined}),o=>{o.art=undefined;o.t='';o.big=false;});
  function emit_particles(x,y,vx,vy,life,max,color,size,g,glow,streak,drag,soft){const o=particlesPool.acquire();if(!o)return;o.x=x;o.y=y;o.vx=vx;o.vy=vy;o.life=life;o.max=max;o.color=color;o.size=size;o.g=g;o.glow=glow;o.streak=streak;o.drag=drag;o.soft=soft;particles.push(o);}

  const shotsPool=new EmberCore.ObjectPool(256,()=>({k:undefined,x:undefined,y:undefined,vx:undefined,vy:undefined,g:undefined,life:undefined,d:undefined,pool:undefined,home:undefined,sp:undefined,flame:undefined,color:undefined,t:undefined,fire:undefined}),o=>{});
  function emit_shots(k,x,y,vx,vy,g,life,d,pool,home,sp,flame,color,t,fire){const o=shotsPool.acquire();if(!o)return;o.k=k;o.x=x;o.y=y;o.vx=vx;o.vy=vy;o.g=g;o.life=life;o.d=d;o.pool=pool;o.home=home;o.sp=sp;o.flame=flame;o.color=color;o.t=t;o.fire=fire;shots.push(o);}
  const inputQueue=new EmberCore.InputQueue(),physics=new EmberCore.Physics(),heroFSM=new EmberCore.HeroFSM(attackEvent);
  let audioPool=null,verticalBase=0,hitNoise=null,bandId='';
  // 声音分两路：音乐和音效各有自己的音量（设置里调）
  let musicBus=null,sfxBus=null;
  function buses(){if(!ac)return;try{if(!sfxBus){sfxBus=ac.createGain();sfxBus.connect(ac.destination);musicBus=ac.createGain();musicBus.connect(ac.destination);synthBus=ac.createGain();synthBus.connect(musicBus);synthBus.gain.setValueAtTime(1,ac.currentTime);}const master=settings.vol==null?1:settings.vol;sfxBus.gain.value=settings.sfx*master;musicBus.gain.value=settings.music*master;}catch(e){}}
  function audio(){if(muted)return null;try{if(!ac){ac=new(window.AudioContext||window.webkitAudioContext)();buses();}if(ac.state!=='running'){const r=ac.resume();if(r&&r.catch)r.catch(()=>{});}}catch(e){return null;}return ac;}
  function unlockAudio(){if(ac&&ac.state==='running')return;const a=audio();if(!a)return;try{const s=a.createBufferSource();s.buffer=a.createBuffer(1,1,22050);s.connect(a.destination);s.start(0);}catch(e){}}
  function beep(freq,duration,type,vol){const a=audio();if(!a||settings.sfx<=0)return;try{if(!audioPool)audioPool=new EmberCore.AudioPool(a,sfxBus||a.destination,16);audioPool.play(freq,duration,type,vol);}catch(e){}}
  // 刀和命中不再走单音“哔”：一层沉下去的弦乐身体、一层布料破风、一层灯罩似的金属余响。
  function weighted(parts){const a=audio();if(!a||settings.sfx<=0)return;const t0=a.currentTime,bus=sfxBus||a.destination;
    parts.forEach(part=>{try{const at=t0+(part.at||0),dur=part.dur||.12;
      if(part.noise){if(!hitNoise||hitNoise.sampleRate!==a.sampleRate){hitNoise=a.createBuffer(1,Math.floor(a.sampleRate*.22),a.sampleRate);const ch=hitNoise.getChannelData(0);for(let i=0;i<ch.length;i++){const u=i/ch.length;ch[i]=(Math.random()*2-1)*(1-u)*(1-u);}}
        const s=a.createBufferSource(),fl=a.createBiquadFilter(),g=a.createGain();s.buffer=hitNoise;fl.type=part.filter||'lowpass';fl.frequency.value=part.freq||280;fl.Q.value=part.q||.8;g.gain.setValueAtTime(part.vol||.06,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);s.connect(fl);fl.connect(g);g.connect(bus);s.start(at);s.stop(at+dur+.02);}
      else{const o=a.createOscillator(),g=a.createGain();o.type=part.wave||'sine';o.frequency.setValueAtTime(Math.max(30,part.f),at);if(part.to)o.frequency.exponentialRampToValueAtTime(Math.max(28,part.to),at+dur);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(part.vol||.04,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+dur);o.connect(g);g.connect(bus);o.start(at);o.stop(at+dur+.03);}
    }catch(e){}});}
  function swingSound(){const heavy=p.slash==='side'&&p.combo===0,down=p.slash==='down';weighted([{noise:true,filter:heavy?'lowpass':'bandpass',freq:heavy?150:down?110:460,q:.65,vol:heavy?.11:.05,dur:heavy?.16:.09},{f:heavy?112:down?78:164,to:heavy?42:down?36:54,wave:'sine',vol:heavy?.08:.04,dur:heavy?.18:.11},{f:heavy?520:down?380:860,to:150,wave:'triangle',vol:.016,dur:.05,at:.006}]);}
  function impactSound(heavy){weighted([{noise:true,filter:'lowpass',freq:heavy?170:320,q:1.1,vol:heavy?.14:.07,dur:heavy?.15:.08},{f:heavy?78:108,to:34,wave:'sine',vol:heavy?.12:.055,dur:heavy?.22:.12},{f:heavy?220:340,to:80,wave:'triangle',vol:.03,dur:.07},{f:heavy?680:1120,to:heavy?260:420,wave:'sine',vol:.015,dur:.1,at:.01}]);}
  // 原创配乐：探索和战斗使用各自的十六小节循环，首领变招时换一段编曲。
  const MUSIC_TRACKS={
    menu:.31,furnace:.29,prison:.32,sewers:.32,ramparts:.32,ossuary:.30,tower:.32,rest:.29,
    arena:.25,lock:.38,lock2:.38,brood:.37,brood2:.37,standard:.38,standard2:.38,
    warden:.40,warden2:.40,ending:.34
  };
  const MUSIC_FADE=1.05,musicCache={};
  const fileMusic=window.location&&window.location.protocol==='file:'&&typeof Audio==='function';
  let localLayers=[],localLast=0;
  const unavailableMusic=new Set();
  function streamLocal(src,vol){
    const now=performance.now(),step=localLast?clamp((now-localLast)/(1000*MUSIC_FADE),0,.2):0;localLast=now;
    if(src&&!unavailableMusic.has(src)&&!localLayers.some(l=>l.src===src)){
      const media=new Audio(src);media.loop=true;media.volume=0;
      const layer={src,media,level:0,vol};localLayers.push(layer);
      const fail=()=>{if(!localLayers.includes(layer))return;unavailableMusic.add(src);media.pause();localLayers=localLayers.filter(l=>l!==layer);};
      media.onerror=fail;const started=media.play();if(started&&started.catch)started.catch(fail);
    }
    for(const l of localLayers){
      const active=l.src===src;l.level=clamp(l.level+(active?step:-step),0,1);
      l.media.volume=muted?0:l.level*l.vol*settings.music*(settings.vol==null?1:settings.vol);
      if(!active&&!l.level){l.media.pause();l.media.onerror=null;localLayers=localLayers.filter(other=>other!==l);}
    }
    return !!src&&!unavailableMusic.has(src);
  }
  function silenceLocal(){
    for(const l of localLayers){l.media.pause();l.media.onerror=null;}
    localLayers=[];localLast=0;
  }
  let synthBus=null,musicDest=null,musicLayers=[],musicTrackId='',musicFadingOut=false;
  function cueOut(){return musicBus||(ac&&ac.destination);}
  function bedOut(){return synthBus||cueOut();}
  function rampGain(node,value,fade){
    if(!node||!ac)return;
    const p=node.gain,now=ac.currentTime,target=Math.max(.0001,value);
    try{if(p.cancelScheduledValues)p.cancelScheduledValues(now);}catch(e){}
    let from=target;
    try{from=typeof p.value==='number'&&isFinite(p.value)?Math.max(.0001,p.value):target;}catch(e){}
    try{
      if(fade>0&&p.linearRampToValueAtTime){p.setValueAtTime(from,now);p.linearRampToValueAtTime(target,now+fade);}
      else if(fade>0&&p.setTargetAtTime){p.setValueAtTime(from,now);p.setTargetAtTime(target,now,Math.max(.04,fade/3));}
      else if(p.setValueAtTime)p.setValueAtTime(target,now);
      else p.value=target;
    }catch(e){try{p.value=target;}catch(e2){}}
  }
  function fadeLayer(layer,fade){
    if(!layer||!ac)return;
    rampGain(layer.gain,.0001,fade);
    try{layer.source.stop(ac.currentTime+Math.max(.08,fade)+.12);}catch(e){}
    layer.source.onended=()=>{try{layer.source.disconnect();layer.gain.disconnect();}catch(e){}};
  }
  function stopBattleMusic(fade){
    if(fileMusic&&localLayers.length)streamLocal('',0);
    const f=fade==null?MUSIC_FADE:fade,layers=musicLayers;
    musicLayers=[];musicTrackId='';musicFadingOut=false;
    layers.forEach(layer=>fadeLayer(layer,f));
  }
  function setSynthAudible(on,fade){
    if(!ac||!synthBus)return;
    rampGain(synthBus,on?1:.0001,fade==null?MUSIC_FADE:fade);
  }
  function decodeBuffer(data){
    return new Promise((resolve,reject)=>{
      if(!ac||typeof ac.decodeAudioData!=='function'){reject(new Error('decode'));return;}
      const ret=ac.decodeAudioData(data,resolve,reject);
      if(ret&&typeof ret.then==='function')ret.then(resolve,reject);
    });
  }
  function loadTrack(src){
    let slot=musicCache[src];
    if(!slot)slot=musicCache[src]={status:'idle',buffer:null};
    if(slot.status==='ready'||slot.status==='failed'||slot.status==='loading')return slot;
    if(typeof fetch!=='function'||!ac||typeof ac.decodeAudioData!=='function'){slot.status='failed';return slot;}
    slot.status='loading';
    fetch(src).then(r=>{if(!r.ok)throw Error('music');return r.arrayBuffer();}).then(decodeBuffer).then(buf=>{
      slot.buffer=buf;slot.status='ready';
      const old=Object.keys(musicCache).filter(k=>k!==src&&k!==musicTrackId&&musicCache[k].status==='ready');
      while(old.length>1)delete musicCache[old.shift()];
    }).catch(()=>{slot.buffer=null;slot.status='failed';});
    return slot;
  }
  function startRecorded(src,vol,fade){
    const slot=musicCache[src];
    if(!slot||!slot.buffer||!musicBus||!ac)return false;
    try{
      const s=ac.createBufferSource(),g=ac.createGain();
      s.buffer=slot.buffer;s.loop=true;s.connect(g);g.connect(musicBus);
      g.gain.setValueAtTime(.0001,ac.currentTime);
      if(fade>0&&g.gain.linearRampToValueAtTime)g.gain.linearRampToValueAtTime(vol,ac.currentTime+fade);
      else g.gain.setValueAtTime(vol,ac.currentTime);
      s.start();
      musicLayers.push({source:s,gain:g,src:src,vol:vol});
      musicTrackId=src;musicFadingOut=false;
      return true;
    }catch(e){return false;}
  }
  function externalMusic(mode){
    const volume=MUSIC_TRACKS[mode];
    const src=volume?'assets/music/'+(mode==='warden'?'epic-boss':mode)+'.mp3?v=lantern1':'';
    if(fileMusic){const active=streamLocal(src,volume);setSynthAudible(!active,MUSIC_FADE);return active;}
    if(!volume){
      if(musicTrackId||musicLayers.length)stopBattleMusic(MUSIC_FADE);
      setSynthAudible(true,MUSIC_FADE);
      return false;
    }
    const slot=loadTrack(src);
    if(slot.status==='failed'){
      if(musicTrackId||musicLayers.length)stopBattleMusic(MUSIC_FADE);
      setSynthAudible(true,MUSIC_FADE);
      return false;
    }
    if(slot.status!=='ready'){
      if(musicTrackId===src&&musicLayers.length){setSynthAudible(false,.2);return true;}
      return false;
    }
    if(musicTrackId===src&&musicLayers.length){setSynthAudible(false,MUSIC_FADE);return true;}
    const prev=musicLayers.slice();musicLayers=[];
    prev.forEach(layer=>fadeLayer(layer,MUSIC_FADE));
    if(!startRecorded(src,volume,MUSIC_FADE)){
      slot.status='failed';setSynthAudible(true,MUSIC_FADE);return false;
    }
    setSynthAudible(false,MUSIC_FADE);
    return true;
  }
  // 曲谱用音阶级数写：0 是主音，7 是高八度，-1 是休止；一步是八分音符。drum 里 k 底鼓、s 军鼓、h 镲、a 铁砧
  const SONGS={
    menu:{bpm:64,root:220,scale:[0,2,3,5,7,8,10],lead:[4,-1,-1,3,2,-1,0,-1,1,-1,2,-1,-1,-1,-1,-1,4,-1,-1,5,4,-1,2,-1,3,-1,1,-1,0,-1,-1,-1],bass:[0,-1,-1,-1,-1,-1,-1,-1,5,-1,-1,-1,-1,-1,-1,-1,3,-1,-1,-1,-1,-1,-1,-1,4,-1,-1,-1,-1,-1,-1,-1],lw:'triangle',lv:.011,ll:2.4,pad:true,bell:32},
    furnace:{bpm:88,root:196,scale:[0,2,3,5,7,8,10],lead:[0,-1,3,-1,4,-1,3,2,0,-1,-1,-1,2,-1,3,-1,4,-1,7,-1,6,-1,4,-1,3,-1,2,-1,0,-1,-1,-1],bass:[0,-1,0,-1,3,-1,4,-1],drum:'k...a...k.k.a...',lw:'triangle',lv:.01},
    prison:{bpm:82,root:196,scale:[0,2,3,5,7,8,10],lead:[0,-1,2,-1,3,-1,4,-1,3,-1,2,-1,0,-1,-1,-1,4,-1,5,-1,4,-1,2,-1,3,-1,1,-1,2,-1,-1,-1],bass:[0,-1,-1,-1,-1,-1,-1,-1,3,-1,-1,-1,-1,-1,-1,-1,5,-1,-1,-1,-1,-1,-1,-1,4,-1,-1,-1,-1,-1,-1,-1],lw:'triangle',lv:.011,ll:1.2,arp:true,av:.004,bell:32},
    sewers:{bpm:74,root:174,scale:[0,2,3,5,7,9,10],lead:[0,-1,-1,2,-1,-1,3,-1,-1,-1,2,-1,-1,-1,-1,-1,4,-1,-1,3,-1,-1,2,-1,-1,-1,0,-1,-1,-1,-1,-1],bass:[0,-1,-1,-1,-1,-1,-1,-1],bl:14,lw:'sine',lv:.013,ll:2.2,fx:'drip'},
    ramparts:{bpm:96,root:233,scale:[0,2,4,5,7,9,10],lead:[4,-1,5,4,2,-1,0,-1,1,-1,2,-1,4,-1,-1,-1,4,-1,5,7,6,-1,4,-1,5,-1,4,2,4,-1,-1,-1],bass:[0,-1,4,-1,0,-1,4,-1,3,-1,0,-1,4,-1,4,-1],drum:'k.......k...h...',lw:'sine',lv:.012,fx:'wind'},
    ossuary:{bpm:62,root:206,scale:[0,1,3,5,6,8,10],lead:[0,-1,-1,-1,1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,3,-1,-1,-1,2,-1,-1,-1,1,-1,-1,-1,-1,-1,-1,-1],bass:[0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],bl:14,lw:'triangle',lv:.01,ll:3.6,lc:900,pad:true,pv:.005,bell:32,bellLow:true},
    tower:{bpm:108,root:165,scale:[0,2,3,5,7,8,11],lead:[0,2,4,7,4,2,0,2,1,3,5,8,5,3,1,3,0,2,4,7,4,2,0,2,6,4,2,1,2,4,6,-1],bass:[0,-1,0,-1,0,-1,0,-1,1,-1,1,-1,1,-1,1,-1,0,-1,0,-1,0,-1,0,-1,4,-1,4,-1,6,-1,6,-1],lw:'triangle',lv:.008,ll:.9,fx:'tick',bell:32},
    rest:{bpm:70,root:220,scale:[0,2,4,5,7,9,11],lead:[0,2,4,2,5,4,2,-1,0,2,4,7,4,2,1,-1,3,4,5,4,3,2,1,-1,2,1,0,-1,-1,-1,-1,-1],bass:[0,-1,-1,-1,3,-1,-1,-1,4,-1,-1,-1,0,-1,-1,-1],lw:'triangle',lv:.01,ll:1.1},
    arena:{bpm:60,root:110,scale:[0,1,3,5,7,8,10],lead:[-1],bass:[0,-1,-1,-1,-1,-1,-1,-1],bl:8,drum:'k.k.............',kv:.07},
    ending:{bpm:72,root:262,scale:[0,2,4,5,7,9,11],lead:[4,-1,2,-1,0,-1,2,-1,4,-1,5,-1,4,-1,-1,-1,2,-1,4,-1,5,-1,7,-1,5,-1,4,-1,2,-1,-1,-1],bass:[0,-1,-1,-1,-1,-1,-1,-1,5,-1,-1,-1,-1,-1,-1,-1,3,-1,-1,-1,-1,-1,-1,-1,4,-1,-1,-1,-1,-1,-1,-1],lw:'triangle',lv:.012,ll:2,pad:true,bell:16},
    // 守锁兽：沉重的机械感，弗里几亚调式，锯齿低音一直在推，铁砧敲在反拍
    lock:{bpm:116,root:220,scale:[0,1,3,5,7,8,10],lead:[7,-1,-1,8,-1,-1,7,-1,5,-1,-1,-1,3,-1,1,-1,7,-1,-1,8,-1,-1,10,-1,8,-1,7,-1,5,-1,-1,-1],bass:[0,0,0,1,0,0,3,1,0,0,0,1,5,3,1,0],bw:'sawtooth',bc:420,bv:.028,bl:.9,lw:'square',lv:.009,lc:1400,drum:'k..as.k.k..as.ha',kv:.1},
    lock2:{bpm:132,key:2,root:220,scale:[0,1,3,5,7,8,10],lead:[7,8,7,-1,5,-1,3,-1,7,8,10,-1,8,7,5,-1,12,-1,10,-1,8,-1,7,-1,8,7,5,3,1,-1,0,-1],bass:[0,0,0,1,0,0,3,1,0,0,0,1,5,3,1,0],bw:'sawtooth',bc:520,bv:.03,bl:.8,lw:'square',lv:.01,lc:1600,drum:'k.has.hkk.has.ha',kv:.11},
    // 溺灯：水底的诡异，异域音阶，低音慢慢沉、高处冒泡的琶音
    brood:{bpm:96,root:110,bd:2,scale:[0,1,4,5,7,8,11],lead:[7,-1,-1,-1,8,-1,7,-1,4,-1,-1,-1,5,-1,4,-1,1,-1,-1,-1,4,-1,5,-1,7,-1,-1,-1,-1,-1,-1,-1],bass:[0,-1,-1,-1,-1,-1,0,-1,5,-1,-1,-1,-1,-1,4,-1],bl:3,lw:'sine',lv:.013,ll:2.6,arp:true,arpHi:true,av:.005,drum:'k.......k...s...',kv:.08,fx:'drip'},
    brood2:{bpm:112,key:1,root:110,bd:2,scale:[0,1,4,5,7,8,11],lead:[7,8,7,4,5,4,1,-1,7,8,11,-1,8,7,5,-1,4,5,7,8,7,5,4,-1,1,-1,0,-1,-1,-1,-1,-1],bass:[0,-1,0,-1,-1,-1,0,-1,5,-1,5,-1,-1,-1,4,-1],bl:1.6,lw:'sine',lv:.013,arp:true,arpHi:true,av:.007,drum:'k...s.k.k...s..h',kv:.09,fx:'drip'},
    // 无名旗手：行军鼓，和声小调的号角旋律
    standard:{bpm:128,root:233,scale:[0,2,3,5,7,8,11],lead:[0,-1,0,2,3,-1,4,-1,5,-1,4,3,4,-1,-1,-1,3,-1,3,4,5,-1,7,-1,6,-1,5,4,5,-1,-1,-1],bass:[0,-1,4,-1,0,-1,4,-1,5,-1,2,-1,4,-1,4,-1],bw:'triangle',bv:.032,lw:'sawtooth',lv:.008,lc:1800,drum:'k.s.s.ssk.s.s.hs',sv:.04,kv:.09},
    standard2:{bpm:142,key:2,root:233,scale:[0,2,3,5,7,8,11],lead:[7,-1,7,8,9,-1,10,-1,9,-1,8,7,8,-1,-1,-1,7,-1,7,8,9,-1,11,-1,10,-1,9,8,7,-1,-1,-1],bass:[0,0,4,4,0,0,4,4,5,5,2,2,4,4,4,4],bw:'triangle',bv:.032,bl:.9,lw:'sawtooth',lv:.009,lc:2000,drum:'kss.ssksk.sssshs',sv:.045,kv:.1},
    // 沉钟典狱长：庄严又悲伤，管风琴般的长和弦，每一小节都有钟声；第二段钟声每半小节一响
    warden:{bpm:136,root:165,scale:[0,2,3,5,7,8,10],lead:[7,-1,6,-1,5,-1,4,-1,3,-1,4,-1,5,-1,-1,-1,7,-1,8,-1,9,-1,7,-1,6,-1,5,-1,4,-1,-1,-1],bass:[0,0,0,0,5,5,5,5,3,3,3,3,4,4,4,4],bw:'sawtooth',bc:500,bv:.026,bl:.9,lw:'triangle',lv:.013,ll:1.8,pad:true,pv:.006,drum:'k.h.s.h.k.k.s.h.',kv:.1,bell:16},
    warden2:{bpm:150,key:1,root:165,scale:[0,2,3,5,7,8,10],lead:[7,6,5,4,3,4,5,-1,7,8,9,10,9,7,6,-1,10,-1,9,-1,8,-1,7,-1,6,5,4,3,4,-1,-1,-1],bass:[0,0,0,0,5,5,5,5,3,3,3,3,4,4,4,4],bw:'sawtooth',bc:640,bv:.03,bl:.8,lw:'triangle',lv:.014,ll:1.4,pad:true,pv:.007,drum:'kkh.s.hkk.hks.hs',kv:.11,bell:8}};
  let musicMode='',musicNext=0,musicStep=0,noiseBuf=null;
  // 乐器：普通音符（可加低通、慢起音）、噪声（镲 / 军鼓 / 风声）、底鼓、钟（几个不成整数倍的泛音）
  function mnote(f,d,vol,wave,at,cut,att){if(!ac)return;try{const o=ac.createOscillator(),g=ac.createGain();o.type=wave||'sine';o.frequency.setValueAtTime(Math.max(20,f),at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(vol,at+(att||Math.min(.03,d*.3)));g.gain.exponentialRampToValueAtTime(.0001,at+d);let src=o;if(cut&&ac.createBiquadFilter){const fl=ac.createBiquadFilter();fl.type='lowpass';fl.frequency.value=cut;o.connect(fl);src=fl;}src.connect(g);g.connect(musicDest||cueOut());o.start(at);o.stop(at+d+.05);}catch(e){}}
  function mnoise(d,vol,at,type,freq,swell){if(!ac)return;try{if(!noiseBuf){noiseBuf=ac.createBuffer(1,Math.floor(ac.sampleRate*.5),ac.sampleRate);const ch=noiseBuf.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;}const s=ac.createBufferSource(),fl=ac.createBiquadFilter(),g=ac.createGain();s.buffer=noiseBuf;s.loop=d>.45;fl.type=type||'highpass';fl.frequency.value=freq||6000;
      if(swell){g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(vol,at+d*.45);}else g.gain.setValueAtTime(vol,at);g.gain.exponentialRampToValueAtTime(.0001,at+d);s.connect(fl);fl.connect(g);g.connect(musicDest||cueOut());s.start(at);s.stop(at+d+.02);}catch(e){}}
  function kick(at,vol){if(!ac)return;try{const o=ac.createOscillator(),g=ac.createGain();o.frequency.setValueAtTime(130,at);o.frequency.exponentialRampToValueAtTime(42,at+.14);g.gain.setValueAtTime(vol,at);g.gain.exponentialRampToValueAtTime(.0001,at+.24);o.connect(g);g.connect(musicDest||cueOut());o.start(at);o.stop(at+.26);}catch(e){}}
  function bellTone(f,at,vol,d){[1,2.76,5.4,8.93].forEach((m,i)=>mnote(f*m,d*(1-i*.18),vol/(1+i*1.7),'sine',at,0,.004));}
  function playStep(S,i,at,sd){const prevDest=musicDest;musicDest=bedOut();try{const n=S.scale.length,deg=d=>{const o=Math.floor(d/n),k=((d%n)+n)%n;return S.root*Math.pow(2,(S.scale[k]+12*o+(S.key||0))/12);};
    const b=S.bass[i%S.bass.length];if(b!==-1)mnote(deg(b)/(S.bd||4),sd*(S.bl||1.8),S.bv||.03,S.bw||'triangle',at,S.bc||800);
    const l=S.lead[i%S.lead.length];if(l>=0)mnote(deg(l),sd*(S.ll||1.6),S.lv||.012,S.lw||'triangle',at,S.lc);
    if(S.arp){const c=[0,2,4,7][i%4]+(S.arpHi?7:0);mnote(deg(c),sd*.9,S.av||.005,'sine',at);}
    if(S.pad&&i%16===0){const r=S.bass[i%S.bass.length]>0?S.bass[i%S.bass.length]:0;[0,2,4].forEach(d=>mnote(deg(d+r)/2,sd*16,S.pv||.006,'sawtooth',at,900,sd*3));}
    const dr=S.drum?S.drum[i%S.drum.length]:'.';if(dr==='k')kick(at,S.kv||.09);else if(dr==='s')mnoise(.12,S.sv||.045,at,'bandpass',1800);else if(dr==='h')mnoise(.04,S.hv||.022,at,'highpass',7000);else if(dr==='a'){mnote(1760,.09,.011,'square',at);mnote(2637,.14,.007,'square',at);}
    if(S.bell&&i%S.bell===0)bellTone(deg(0)*(S.bellLow?.5:1),at,S.bellV||.02,2.8);
    if(S.fx==='drip'&&Math.random()<.18)mnote(1200+Math.random()*1400,.09,.006,'sine',at+Math.random()*sd);
    else if(S.fx==='tick')mnoise(.02,i%2?.008:.014,at,'highpass',9000);
    else if(S.fx==='wind'&&i%32===0)mnoise(sd*28,.018,at,'bandpass',480,true);}finally{musicDest=prevDest;}}
  // 换曲：开始界面 / 教程 / 各区域 / 驿站 / 首领房（开打前只有心跳一样的鼓）/ 首领战（半血换第二段）/ 结局
  function musicTick(){if(!ac)return;if(paused||muted||settings.music<=0||state==='dead'){stopBattleMusic(.8);setSynthAudible(false,.5);return;}if(ac.state!=='running')return;let mode,heat=0;
    if(state==='menu'||(talk&&talk.lines===TALK.prologue))mode='menu';else if(!L)return;else if(credits||state==='win')mode='ending';else if(state==='cine')mode=cine&&cine.k==='boss'?'':'ending';else if(L.tutorial)mode='furnace';
    else if(L.arena){const b=enemies.find(e=>e.type==='boss'&&!e.dead);heat=b?1-b.hp/Math.max(1,b.max):0;mode=!b?L.theme:flags.boss&&state==='play'?L.bossKind+(b.rage?'2':''):'arena';}else mode=L.rest?'rest':L.theme;
    const recorded=externalMusic(mode);if(mode!==musicMode){const phase=/2$/.test(mode)&&musicMode===mode.slice(0,-1);musicMode=mode;musicStep=0;musicNext=ac.currentTime+(phase?.78:.06);}const S=SONGS[mode];if(!S)return;const sd=60/S.bpm/2;if(musicNext<ac.currentTime-.25)musicNext=ac.currentTime+.05;
    let guard=0;while(musicNext<ac.currentTime+.15&&guard++<8){if(!recorded){playStep(S,musicStep,musicNext,sd);if(heat>.2&&musicStep%4===2)kick(musicNext,.03+heat*.055);if(heat>.45&&musicStep%8===5)mnoise(.1,.012+heat*.02,musicNext,'bandpass',1500);}musicStep++;musicNext+=sd;}}
  function musicTone(f,d,vol,wave,when){if(!ac||muted||ac.state!=='running')return;mnote(f,d,vol,wave,ac.currentTime+(when||0));}
  function bossCue(which){if(!ac||muted||ac.state!=='running')return;const k=L&&L.bossKind||'warden',base={lock:92,brood:123,standard:146,warden:110}[k]||110;if(which==='enter'){musicTone(base,.7,.04,'sawtooth');musicTone(base*1.5,.8,.018,'triangle',.12);}else if(which==='rage'){musicTone(base*.8,.6,.045,'sawtooth');musicTone(base*2,.5,.025,'square',.12);musicTone(base*2.5,.6,.02,'triangle',.25);}else if(which==='attack')musicTone(base*3,.2,.025,'triangle');
    else if(which==='toll')bellTone(98,ac.currentTime,.07,4.5);else{[0,4,7,12].forEach((s,i)=>musicTone(base*2*Math.pow(2,s/12),1.2-i*.15,.03,'triangle',i*.12));bellTone(base*2,ac.currentTime+.5,.04,3);}}
  function setMuted(m){muted=m;if(m&&fileMusic)silenceLocal();try{localStorage.setItem('ember:muted',m?'1':'0');}catch(e){}muteBtn.textContent=m?'静音':'声音';if(m)muteBtn.classList.add('off');else muteBtn.classList.remove('off');if(ac){try{const r=m?ac.suspend():ac.resume();if(r&&r.catch)r.catch(()=>{});}catch(e){}}if(!m){unlockAudio();beep(520,.12);}}
  function say(t,s){notice.textContent=t;messageT=s||3;notice.style.opacity=1;}
  function clearHeld(){inputQueue.clear();held={};document.querySelectorAll('[data-action]').forEach(b=>b.classList.remove('held'));stickEnd();}
  // 新的一局：从第一层开始
  // ch：角色（不给就沿用当前角色，默认小引灯人）。第一次玩：开场旁白 → 监牢中的安全练习路段
  function reset(boot,ch){const guideRestart=boot===false&&run&&run.guided;if(passage&&!passage.changed){passage=null;document.getElementById('scene-fade').hidden=true;}const C=CHARS[ch||(p&&p.char)||'lamp']||CHARS.lamp;
    p={x:120,y:FLOOR-52,w:26,h:52,vx:0,vy:0,face:1,hp:C.hp*LIFE,max:C.hp*LIFE,char:C.id,jumps:0,ground:true,coyote:.1,buffer:0,cutQueued:false,jumpRising:false,roll:0,rollFromGround:false,rollCd:0,attack:0,atkCd:0,combo:0,comboT:0,plateHits:0,leechKills:0,slash:'side',atkFace:1,pogo:false,inv:0,damage:C.dmg,hit:new Set(),potions:C.id==='lamp'?1:2,soul:0,castCd:0,drop:null,skills:{swift:0,reach:0,dash:0,vigor:0,spring:0,flame:0},walk:0,hurtT:0,landT:0,trail:[],trailT:0,cape:null,safeX:120,safeY:FLOOR-52,dash:0,dashHit:null,ringT:0,domeT:0,on:null};
    kills=0;score=0;embers=0;bag={bomb:0,knife:C.id==='bow'?3:0,frost:0};relics=C.id==='bow'?{veil:true}:{};keepsakes={};sel=C.id==='bow'?'knife':'bomb';run={time:0,deaths:0};runSeed=1+Math.floor(Math.random()*1e6);loadStage(0,boot===true);applyBoons();
    if(boot===true)return;try{localStorage.setItem('ember:char',C.id);}catch(e){}
    if(!introSeen){introSeen=true;try{localStorage.setItem('ember:intro-v3','1');}catch(e){}startTalk(TALK.prologue,()=>{note('lore','prologue');beginPrisonJourney();});}
    else if(guideRestart)beginPrisonJourney();else say(startTip(),3);
  }
  // The title-screen practice room is optional; new journeys learn on the prison path.
  function startTutorial(){reset(true,lastChar());for(const id of USES)bag[id]=1;run.guided=false;p.soul=3;loadStage(-1);say(L.signs[0].t(),4);}
  function completeTutorial(){
    if(loadSave()){showMenu();return;}
    reset(true,p.char);beep(440,.3);beginPrisonJourney();
  }
  function beginPrisonJourney(){
    run.awakened=0;run.guided=!window.emberExhibit;hudKey='';run.chapter1=true;try{run.lessonMask=Number(localStorage.getItem('ember:road-lessons'))||0;}catch(e){}saveRun();
    say(startTip(),3);
  }
  const prisonLessons=[
    {x:250,bit:2,action:'jump',tip:'跳上矮台，或沿平地走'},
    {x:480,bit:4,action:'attack',tip:'向守卫出招，它会在挨打后还手'},
    {x:1130,bit:8,action:'roll',tip:'下一名守卫会主动出招，看到刀光时翻滚'}
  ];
  function teachOnRoad(){
    if(!run.guided||L.tutorial)return;
    const chapter=L.chapter||1;
    const unlocked=Math.min(3,chapter>1?chapter:(stage!==0||p.x>=1430?1:0));
    if(unlocked>run.awakened){
      run.awakened=unlocked;p.soul=Math.max(p.soul,unlocked);hudKey='';saveRun();
      const skill=SKILLS[CHARS[p.char].skills[unlocked-1]];
      say('余火苏醒 · '+skill.name+'　'+controlLabel('skill'+unlocked)+' 施放',4);return;
    }
    if(stage!==0||coachDone||run.coachSkip)return;
    const mask=run.lessonMask||0;
    for(const lesson of prisonLessons){
      if((mask&lesson.bit)||p.x<lesson.x||p.x>lesson.x+145)continue;
      run.lessonMask=mask|lesson.bit;try{localStorage.setItem('ember:road-lessons',String(run.lessonMask));}catch(e){}saveRun();
      const tip=lesson.action==='attack'&&p.char==='bow'?'对准守卫，蓄满自动射，松手可提前出箭':lesson.tip;
      say(controlLabel(lesson.action)+'　'+tip,3);break;
    }
  }
  // 教学房：石门关着，直到这间屋里唯一的机关预警并触发过一次。人已经在门东边（存档、传送）则门算开过。
  function lessonTick(){if(!L||!L.lesson||L.arena||L.rest)return;
    if(L.lesson.practiceX){
      if(run.lessonSaid!==stage&&Math.abs(p.x-L.lesson.practiceX)<110){run.lessonSaid=stage;say(L.lesson.hint,3);}
      return;
    }
    const door=L.lesson.door,trap=traps.find(t=>t.teach);if(p.x>door+48)run['les'+stage]=1;if(run['les'+stage])return;
    if(trap){const u=trap.t/(trap.per||3);if(trap.warn||(trap.k==='ballista'&&u>.45)||(trap.k==='piston'&&u>.7))trap.sawWarn=true;const hot=!!(trap.up||trap.on||(trap.k==='ballista'&&trap.kick>0)||(trap.k==='piston'&&u>=.86&&u<.94));if(trap.sawWarn&&hot){run['les'+stage]=1;say('石门开了 · 带上火种向东，靠近灯台续火',4);beep(520,.12,'sine');return;}}
    if(p.x+p.w>door-6&&p.x<door+40){p.x=door-p.w-8;if(p.vx>0)p.vx=0;}if(run.lessonSaid!==stage&&p.x<door){run.lessonSaid=stage;say(L.lesson.hint,4.2);}}
  // v5 stored the remaining seal count. Each remaining seal now becomes a patrol member.
  const patrolHP=56;
  const patrolSizes={prison:[0,3,5,6,6],sewers:[4,5,6,6],ramparts:[3,4,5,5,3],ossuary:[3,3,0,4,4,5,5],tower:[3,4,5,5,5]};
  let ward=null;
  const wickArt={
    prison:['#ed7947','#ffd488'],sewers:['#37ad9d','#bcffbf'],ramparts:['#f28355','#ffe3a0'],
    ossuary:['#ac78eb','#f3d3ff'],tower:['#5daedd','#d0f5ff']
  };
  const wickReachY=wick=>wick.y<FLOOR?26:48;
  function followEmber(dt,snap=false){
    const cx=p.x+p.w/2,cy=p.y+5,side=p.face||1;
    const targetX=cx-side*(19+Math.min(5,Math.abs(p.vx)*.018));
    const targetY=cy-8+(p.roll>0?14:0);
    const blend=snap?1:1-Math.exp(-dt*24);
    run.guideX=clamp((run.guideX??targetX)+(targetX-(run.guideX??targetX))*blend,cx-35,cx+35);
    run.guideY=clamp((run.guideY??targetY)+(targetY-(run.guideY??targetY))*blend,cy-23,cy+18);
  }
  function wardCycle(e,phase,duration){
    e.phaseName=phase;e.age=0;e.span=duration;e.fromX=e.x;e.fromY=e.y;
  }
  function raiseWard(wick,index){
    const total=run.wardParty.length,scout=index%2===1;
    const side=wick.x+260>L.exit?-1:(scout?1:-1);
    const from=clamp(wick.x+side*(220+index%3*32),18,L.exit-32);
    const e=enemy(from,wick.y-110-index%3*8,'guard');
    Object.assign(e,{ward:true,wick,slot:index,scout,hp:run.wardParty[index],
      max:patrolHP,side:-side,trainingPace:1});
    wardCycle(e,'approach',6);
    enemies.push(e);
    if(!ward)ward=e;
    if(!index)say('巡灯队 ×'+total+' · 迎击来敌，击中亮芯伤害翻倍',2.4);
  }
  function moveWard(e,dt){
    const w=e.wick,cx=p.x+p.w/2;
    if(Math.abs(cx-w.x)>430)return;
    e.age+=dt;
    const k=clamp(e.age/e.span,0,1),ease=k*k*(3-2*k);
    if(e.phaseName==='approach'||e.phaseName==='circle'){
      const offset=e.phaseName==='approach'?(e.scout?42:-18):e.side*(w.door?56:70);
      const tx=clamp(w.x+offset-e.w/2,16,L.exit-42);
      e.x=e.fromX+(tx-e.fromX)*ease;
      e.y=e.fromY+(w.y-e.h-8-e.fromY)*ease-Math.sin(k*Math.PI)*24;
      e.face=cx>e.x+e.w/2?1:-1;
      if(k===1){wardCycle(e,'aim',.83);e.aimX=clamp(cx-e.w/2,w.x-90,Math.min(w.x+90,L.exit-42));e.aimY=p.y+p.h/2;}
    }else if(e.phaseName==='aim'){
      e.y=e.fromY-Math.sin(k*Math.PI)*3;
      if(k===1){
        if(e.scout){
          const x=e.x+e.w/2,y=e.y+e.h/2,dx=e.aimX+e.w/2-x,dy=e.aimY-y,len=Math.hypot(dx,dy)||1;
          emit_shots('wisp',x,y,dx/len*200,dy/len*200,0,1.3,12,0,0,0,false,wickArt[L.theme][1],0);
          wardCycle(e,'open',2.5);
        }else wardCycle(e,'strike',.34);
      }
    }else if(e.phaseName==='strike'){
      e.x=e.fromX+(e.aimX-e.fromX)*ease;e.y=e.fromY+Math.sin(k*Math.PI)*6;
      if(!e.struck&&Math.abs(cx-e.x-e.w/2)<24&&Math.abs(p.y+p.h/2-e.y-e.h/2)<34){
        e.struck=true;if(!dodging()&&p.dash<=0&&p.domeT<=0)hurt(12,e.x,false,'被守灯卫冲锋击中');
      }
      if(k===1){wardCycle(e,'open',2.5);e.struck=false;}
    }else if(k===1){e.side=-e.side;wardCycle(e,'circle',1.85);}
    e.floor=e.y+e.h;
  }
  function hitWard(e,dmg,hx,hy){
    if(e.dead)return;
    const open=e.phaseName==='open',damage=Math.max(1,Math.round(dmg*(open?2:1)));
    const dealt=Math.min(e.hp,damage);e.hp-=dealt;run.wardParty[e.slot]=e.hp;e.flash=.13;
    const color=open?wickArt[L.theme][1]:'#e6ded4';
    burst(hx,hy,color,open?12:5);
    if(settings.nums)pop(hx,hy-8,(open?'破绽 ':'')+'−'+dealt,color,open);
    if(e.hp===0){killEnemy(e);ward=enemies.find(other=>other.ward&&!other.dead)||null;}
    else if(open){e.side=-e.side;wardCycle(e,'circle',1.85);}
    saveRun();
  }
  function guideTick(dt){
    followEmber(dt);
    if(!L.wicks)return;
    const wick=L.wicks[run.litWicks];
    if(!wick){run.doorLift=Math.min(1,run.doorLift+dt*2.4);return;}
    if(L.lesson.door&&!run['les'+stage])return;
    const dx=Math.abs(p.x+p.w/2-wick.x);
    if(!run.wardParty)run.wardParty=Array(patrolSizes[L.theme][run.litWicks]).fill(patrolHP);
    const first=run.wardParty.findIndex(hp=>hp>0);
    if(first>=0){
      if(!ward&&dx<(run.wardParty[first]===patrolHP&&first===0?185:430)){
        raiseWard(wick,first);
        // The last two patrol a lamp together. A checkpoint remembers each member.
        const partner=first+1;
        if(partner===run.wardParty.length-1&&run.wardParty[partner]>0)raiseWard(wick,partner);
      }
      return;
    }
    if(dx>68||Math.abs(p.y+p.h-wick.y)>wickReachY(wick))return;
    run.litWicks++;run.wardParty=null;
    if(!wick.door){
      p.checkX=wick.x;L.checkpoint=wick.x;checkpoint=true;
      p.hp=p.max;p.potions=Math.max(p.potions,1);p.soul=3;
    }
    const colors=wickArt[L.theme];
    fx.push({k:'kindle',x:run.guideX,y:run.guideY,toX:wick.x-(wick.door?36:0),toY:wick.y-38,c:colors[1],life:.36,max:.36});
    burst(wick.x,wick.y-44,colors[1],20);beep(wick.door?880:560+45*run.litWicks,.22);
    say(wick.door?'门灯已续 · 东门开启':'续火 '+run.litWicks+' / '+L.wicks.length+' · 已记录钟火',2.6);saveRun();
  }
  function guideGoal(){
    const wick=L.wicks[run.litWicks];
    if(!wick)return '东门已开 →';
    const dx=wick.x-p.x-p.w/2,count=run.litWicks+'/'+L.wicks.length+' · ';
    if(Math.abs(dx)>185)return count+(dx<0?'← 返回上一盏灯':'带火种前往灯台 →');
    if(ward)return count+'巡灯队余 '+run.wardParty.filter(hp=>hp>0).length+(ward.scout?' · 巡灯哨 ':' · 守灯卫 ')+ward.hp+'/'+ward.max+(ward.phaseName==='open'?' · 亮芯双倍伤害':ward.phaseName==='aim'?(ward.scout?' · 避开灵火':' · 避开冲锋'):' · 攻击削甲');
    return count+(Math.abs(dx)>68?(dx<0?'← 靠近灯盏':'靠近灯盏 →'):p.y+p.h>wick.y+wickReachY(wick)?'跳上灯台续火':'靠近灯芯续火');
  }
  // Draw the moving seed and the stationary wicks with the same wind-bent flame.
  function livingFlame(x,y,size,palette,phase){
    const t=time*4+phase,lean=Math.sin(t)*2.7;
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    bloom(0,-8,24,palette[0],.36);
    shape(()=>{ctx.moveTo(0,2);ctx.bezierCurveTo(-11,0,-9,-9,-5,-17);ctx.quadraticCurveTo(-5,-9,-2,-11);
      ctx.quadraticCurveTo(lean+4,-19,lean-1,-27);ctx.bezierCurveTo(12,-20,12,-5,4,0);ctx.closePath();},lg(0,-26,0,2,palette[1],palette[0],palette[0]));
    shape(()=>{ctx.moveTo(0,0);ctx.bezierCurveTo(-5,-2,-4,-9,lean+1,-16);ctx.quadraticCurveTo(9,-4,1,0);ctx.closePath();},palette[1]);
    circle(1,-3,2.6,'#fff6d6');
    for(let i=0;i<3;i++){const k=(time*.62+i/3+phase)%1;circle(lean+Math.sin(k*5+i)*5,-14-k*20,1.4-k,palette[1]);}
    ctx.restore();
  }
  function drawWick(wick,index){
    const x=wick.x+(wick.door?-36:0),y=wick.y;
    if(x<cam-70||x>cam+W+70)return;
    const lit=index<run.litWicks,ready=index===run.litWicks,colors=wickArt[L.theme];
    ctx.save();ctx.translate(x,y);
    poly([-18,0,-14,-6,-6,-8,-4,-27,4,-27,6,-8,14,-6,18,0],'#303c43','#1a242d',2);
    poly([-17,-1,-12,-6,12,-6,17,-1],lg(-17,0,17,0,'#6e594d','#d1a771','#72563a'));
    poly([-3,-8,-2,-25,2,-25,3,-8],lg(-3,0,3,0,'#4d3d32','#c3ab7d','#69513b'));
    poly([0,-15,2.5,-12,0,-9,-2.5,-12],lit?colors[1]:'#787884');
    poly([-13,-31,-10,-38,10,-38,13,-31,7,-25,-7,-25],lg(-13,0,13,0,'#74503b','#c49b65','#604e46'),'#211f21',2);
    for(const side of [-1,1]){
      const d=side;line([d*6,-25,d*14,-34,d*16,-50,d*11,-57],2.5,lit?'#e8c082':'#998269');
      poly([d*13,-41,d*21,-47,d*17,-39,d*12,-35],lit?'#d19a58':'#746958');
    }
    poly([-12,-33,0,-29,12,-33,0,-36],lit?'#ffdf9a':'#b19873');
    if(L.theme==='ossuary'){circle(0,-19,5.5,'#d9cbb9');circle(-2,-20,1.3,'#3c3041');circle(2,-20,1.3,'#3c3041');}
    if(lit){livingFlame(0,-34,.83,colors,index);addLight(x-cam,y-43,87,colors[0],.53);}
    else{
      line([-2,-34,0,-40,2,-37],2,'#333238');
      if(ready){const pulse=.5+.5*Math.sin(time*3);ctx.globalAlpha=.4+.4*pulse;
        ctx.beginPath();ctx.ellipse(0,-44,20+pulse*2,6,0,0,TAU);ctx.strokeStyle=colors[1];ctx.lineWidth=1.5;ctx.stroke();ctx.globalAlpha=1;
        poly([0,-63,3,-60,0,-56,-3,-60],colors[1]);}
    }
    ctx.restore();
  }
  function drawGuide(){
    const colors=wickArt[L.theme]||wickArt.prison;
    const x=run.guideX,y=run.guideY+Math.sin(time*3.3)*3;
    if(!Number.isFinite(y)||x<cam-50||x>cam+W+50)return;
    addLight(x-cam,y-6,92,colors[0],.59);
    ctx.save();ctx.translate(x,y);
    for(let i=3;i>=1;i--){ctx.globalAlpha=(4-i)*.16;circle(-p.face*i*7,Math.sin(time*3-i*.6)*3-4,3-i*.45,colors[1]);}
    ctx.globalAlpha=1;livingFlame(0,0,.82,colors,0);
    line([-13,-9,-9,0,0,5,9,0,14,-12],1.7,'#d2b786');
    for(const side of [-1,1])poly([side*9,-1,side*16,-5,side*17,-13,side*13,-9],colors[1],'#8c6946',.8);
    poly([0,2,3,5,0,9,-3,5],colors[1],'#977246',.8);ctx.restore();
  }
  function startTip(){return coarse()?'向右推摇杆，带上身边的火种，续亮每一盏灯，东门就会打开。':'按 '+K('right')+' 向东走，带火种续亮每一盏灯，东门就会打开。';}
  // 进入第 n 段（地图或驿站）：带着现在的属性进门，进门时的属性记下来，倒下后可以从这一层重来
  // n = -1 是教程（焚炉底层）。地图里还有：会动的平台（movers）、会塌的平台（crumbles）、各区域的机关（traps）
  function layGround(){
    for(const t of L.trenches||[]){
      for(let i=platforms.length-1;i>=0;i--){
        const a=platforms[i];if(a.solid||a.mv||a.cr||a.h<100)continue;
        const x0=Math.max(a.x,t[0]),x1=Math.min(a.x+a.w,t[0]+t[1]);if(x1-x0<4)continue;
        const left=x0-a.x,right=a.x+a.w-x1,y=a.y,h=a.h;platforms.splice(i,1);
        if(left>2)platforms.push({x:a.x,y:y,w:left,h:h,groundBlock:true});
        platforms.push({x:x0,y:y+t[2],w:x1-x0,h:h,trench:true,groundBlock:true});
        // Small solid lips let single-jump bearers climb out instead of slipping beneath the one-way ground.
        const lip=Math.min(20,(x1-x0)/3),rise=t[2]/2;
        platforms.push({x:x0,y:y+rise,w:lip,h:rise,solid:true},{x:x1-lip,y:y+rise,w:lip,h:rise,solid:true});
        if(right>2)platforms.push({x:x1,y:y,w:right,h:h,groundBlock:true});
      }
    }
    for(const s of L.steps||[])platforms.push({x:s[0],y:s[1],w:s[2],h:Math.max(8,FLOOR-s[1]),solid:true,step:true});
  }
  function loadStage(n,quiet){stage=n;L=n<0?TUTORIAL:STAGES[n];ward=null;run.wardParty=null;run.litWicks=0;run.doorLift=0;if(L.theme==='ossuary'&&!L.arena&&!visitedCrypt){visitedCrypt=true;try{localStorage.setItem('ember:visited-crypt','1');}catch(e){}}T=THEMES[L.theme];prep(T);WORLD=L.w;decor=makeDecor();PAL={guard:Object.assign({},GUARD,T.guard),archer:Object.assign({},ARCHER,T.archer)};PAL.elite=Object.assign({},PAL.guard,ELITE_TINT);{const F=FOE_THEME[L.theme]||{};PAL.flyer=Object.assign({},FLYER,F.flyer);PAL.shield=Object.assign({},PAL.guard,SHIELDP,F.shield);PAL.caster=Object.assign({},CASTER,F.caster);PAL.bomber=Object.assign({},BOMBER,F.bomber);PAL.crawler=Object.assign({},CRAWLER,F.crawler);PAL.hanger=Object.assign({},HANGER,F.hanger);PAL.lurker=LURKER;PAL.spear=SPEAR;}
    platforms=[];let x0=0;L.gaps.concat([[L.w,L.w]]).forEach(g=>{platforms.push({x:x0,y:FLOOR,w:g[0]-x0,h:160,groundBlock:true});x0=g[1];});
    L.plats.forEach(a=>platforms.push({x:a[0],y:a[1],w:a[2],h:22}));(L.terrain||[]).forEach(a=>platforms.push({x:a[0],y:a[2],w:a[1],h:FLOOR-a[2],solid:true}));layGround();
    (L.movers||[]).forEach(m=>platforms.push({x:m[0],y:m[1],w:m[2],h:16,ddx:0,ddy:0,mv:{x0:m[0],y0:m[1],dx:m[3],dy:m[4],per:m[5],ph:m[6]||0}}));(L.crumbles||[]).forEach(c=>platforms.push({x:c[0],y:c[1],w:c[2],h:18,cr:{st:0,t:0,y0:c[1]}}));
    const caches={prison:[360,1560,3330],sewers:[560,1750,3520],ramparts:[680,2240,3850],ossuary:[610,1720,3860],tower:[620,1820,3370]};breakables=(L.arena?[]:(L.caches||caches[L.theme]||[]).concat(L.moreCaches||[])).map((x,i)=>({x:x,y:FLOOR,kind:((i+stage)%3+3)%3,broken:false}));
    // 二周目起，每三个狱卒里有一个换成精英
    let guardIndex=0;enemies=L.ens.map(a=>enemy(a[0],a[1],a[2],cycle&&a[2]==='guard'&&guardIndex++%3===1?Object.assign({},a[3],{elite:true}):a[3]));chests=L.chests.map(c=>({x:c[0],y:c[1],open:false}));traps=(L.traps||[]).map(t=>{const o=Object.assign({},t,{t:((t.ph||0)+(cycle?cycle*.17%1:0))*(t.per||3)});if(!cycle&&L.lesson&&!t.teach&&o.per){const pace=routePace[L.theme].trapPeriod;o.per*=pace;o.t*=pace;}if(cycle>0&&!L.arena){const shift=Math.min(140,22*cycle);if(o.per)o.per=Math.max(1.35,o.per*(1-.05*Math.min(cycle,8)));if(o.x!=null&&!o.teach)o.x+=shift;if(o.x0!=null){o.x0+=shift;o.x1+=shift;}}return o;});signAt=-1;secrets=(L.secrets||[]).map((a,i)=>({x:a[0],y:a[1]||FLOOR,reward:a[2],hp:3,open:!!(run.found&&run.found['s'+n+':'+i]),t:1,shake:0}));
    Object.assign(p,{x:120,y:FLOOR-p.h,vx:0,vy:0,face:1,jumps:0,ground:true,coyote:FEEL.coyote,buffer:0,cutQueued:false,jumpRising:false,roll:0,rollFromGround:false,rollCd:0,attack:0,atkCd:0,combo:0,comboT:0,castCd:0,drop:null,inv:0,hit:new Set(),hurtT:0,landT:0,trail:[],cape:null,safeX:120,safeY:FLOOR-p.h,dash:0,ringT:0,domeT:0,on:null,checkX:null,charge:0,bowRecoil:0,kbT:0});
    shots=[];shotsPool.clear();waves=[];particles=[];particlesPool.clear();floats=[];floatsPool.clear();orbs=[];fx=[];chunks=[];hazards=[];loot=[];gateK=0;sealK=L.arena?1:0;bossCardT=0;revealC=null;keys={};clearHeld();cam=0;shake=0;hitstop=0;paused=false;checkpoint=false;nearChest=false;nearKind='';hudKey='';bellRing=0;
    flags={};p.windUsed=false;thrown=[];offers=[];chestC=null;talk=null;talkBox.hidden=true;cine=null;credits=null;flashT=0;bandId='';arm={};delete run['les'+stage];run.lessonSaid=-1;
    if(L.rest){const free=relicPool().filter(id=>!relics[id]),r=rng(runSeed+n*131);shopRelic=free.length?free[Math.floor(r()*free.length)]:'';}
    entry={hp:p.hp,max:p.max,damage:p.damage,potions:p.potions,embers:embers,score:score,kills:kills,bag:Object.assign({},bag),relics:Object.assign({},relics),keep:Object.assign({},keepsakes),skills:Object.assign({},p.skills),soul:p.soul,plateHits:p.plateHits,leechKills:p.leechKills,shards:p.shards||0,found:Object.assign({},run.found||{}),maps:Object.assign({},run.maps||{})};
    followEmber(0,true);state='play';panel.hidden=true;panel.classList.remove('late');panelView='';hud.hidden=false;touch.hidden=!coarse();hint.hidden=true;chestBtn.hidden=true;titleT=2.6;if(!quiet)saveRun();syncHud();}
  function updateChapterButtons(){for(let i=1;i<=4;i++){const b=document.getElementById('chapter-'+i);if(b)b.disabled=i>unlocked;}}
  function unlockChapter(n){if(selectedRoute||n<=unlocked)return;unlocked=Math.min(4,n);try{localStorage.setItem('ember:unlocked',String(unlocked));}catch(e){}updateChapterButtons();}
  function startChapter(n,room,ch=lastChar()){if(!room&&n>unlocked)return;const C=CHARS[ch];if(n===1){reset(true,ch);run.chapter1=true;saveRun();startTalk(CHAPTERS[0].story);return;}reset(true,ch);p.damage=C.dmg+(n-1)*9;p.max=(C.hp+n-1)*LIFE;p.hp=p.max;p.potions=2;p.soul=3;gain('bomb',2,true);gain('knife',2,true);['key','glass','ribbon'].slice(0,n-1).forEach(id=>gain(id,1,true));sel='bomb';const idx=room?STAGES.indexOf(room):STAGES.findIndex(q=>q.chapterStart&&q.chapter===n);loadStage(idx);run['chapter'+n]=true;if(L.chapterStart)startTalk(CHAPTERS[n-1].story);}
  let passage=null;
  function scenePass(fn){if(passage)return;keys={};clearHeld();passage={t:0,changed:false,fn:fn};document.getElementById('scene-fade').hidden=false;}
  function nextStage(){scenePass(enterNextStage);}
  function finishTutorial(){scenePass(completeTutorial);}
  function passageTick(dt){const q=passage;q.t+=dt;const a=q.t<.32?q.t/.32:q.t<.46?1:Math.max(0,1-(q.t-.46)/.42);document.getElementById('scene-fade').style.opacity=a;if(!q.changed&&q.t>=.32){q.changed=true;q.fn();keys={};clearHeld();}if(q.t>=.88){passage=null;document.getElementById('scene-fade').hidden=true;}}
  function enterNextStage(){if(L.tutorial){completeTutorial();return;}if(stage>=STAGES.length-1)return;loadStage(stage+1);beep(440,.3);if(L.chapterStart&&L.chapter>1&&!run['chapter'+L.chapter]){run['chapter'+L.chapter]=true;startTalk(CHAPTERS[L.chapter-1].story);return;}
    say(L.rest?'篝火补给，烛叟卖货。穿过右侧的门继续。':L.intro||L.name,3);}
  function retryStage(){
    const keptWicks=L.shortcut&&run.shortcut?Math.min(run.litWicks,L.shortcut.wicks):0;
    const s=entry;p.shards=s.shards||0;run.found=Object.assign({},s.found||{});run.maps=Object.assign({},s.maps||{});p.max=s.max;p.hp=Math.max(s.hp,Math.ceil(s.max/(2*LIFE))*LIFE);p.plateHits=s.plateHits;p.leechKills=s.leechKills;p.damage=s.damage;p.potions=s.potions;p.skills=Object.assign({},s.skills);p.soul=s.soul;embers=s.embers;score=s.score;kills=s.kills;bag=Object.assign({},s.bag);relics=Object.assign({},s.relics);keepsakes=Object.assign({},s.keep);loadStage(stage,true);
    if(keptWicks)run.litWicks=keptWicks;
    saveRun();say(L.name+' · 再来一次',2.5);}
  // ---- 对话：底部对话框，逐字显示；E / 空格 / J / 回车 / 点一下：先显示整句，再翻到下一句；Esc 跳过 ----
  // keep：不切到 talk 状态（结局旁白在 win 状态下播放）。说话人有头像就显示在对话框左边；句子带场景时铺插画
  // 打字像真人说话：每个字淡入，逗号顿一下、句号停得更久；每个角色有自己的“嗓音”（短促的音高）；opts.auto 自动翻页（首领倒下、结局），设置里也能全局打开
  const PAUSE={'，':.13,'、':.11,'。':.32,'！':.32,'？':.32,'…':.2,'：':.16,'；':.18,'—':.06,'）':.12},
    VOICE={'守钟人':[190,'triangle'],'烛叟':[240,'square'],'沉钟典狱长':[118,'sawtooth'],'小幽灵':[560,'sine'],'守锁兽':[82,'sawtooth'],'溺灯':[150,'sine'],'无名旗手':[170,'triangle'],'墙上的刻痕':[300,'sine'],'旗手的遗骸':[170,'triangle'],'典狱长的手记':[130,'triangle'],'祷文':[330,'sine'],'墨翁':[300,'triangle']};
  // 台词里可以给词加效果：{g:发光} {w:飘动} {s:颤抖} {b:加重}；显示前先拆成纯文字 + 每个字的效果
  function parseLine(s){const out=[],fx=[];let i=0;while(i<s.length){if(s.charAt(i)==='{'&&s.charAt(i+2)===':'&&'gwsb'.indexOf(s.charAt(i+1))>=0){const end=s.indexOf('}',i+3);if(end>0){for(let j=i+3;j<end;j++){out.push(s.charAt(j));fx.push(s.charAt(i+1));}i=end+1;continue;}}out.push(s.charAt(i));fx.push('');i++;}return{text:out.join(''),fx:fx};}
  const talkBar=document.getElementById('talk-bar');
  function startTalk(lines,done,keep,opts){opts=opts||{};talk={lines:lines,i:0,n:0,shown:0,wait:opts.delay||0,hold:0,arena:!!opts.arena,auto:!!opts.auto,done:done||null,keep:!!keep,text:'',fx:[],swapT:0};if(lines===TALK.prologue||keep)hud.hidden=true;if(talk.arena){talkBox.classList.add('arena-dialog');touch.hidden=true;hud.hidden=true;}else talkBox.classList.remove('arena-dialog');if(!keep)state='talk';keys={};clearHeld();talkBox.hidden=false;if(talk.auto)talkBox.classList.add('auto');else talkBox.classList.remove('auto');sceneA='';sceneB='';showLine();}
  function showLine(){const l=talk.lines[talk.i],face=FACES[l[0]]||FACE_ART[l[0]],P=parseLine(l[1]);talk.text=P.text;talk.fx=P.fx;talkWho.textContent=l[0];talkWho.style.color=WHO[l[0]]||'#c9b28a';talkText.textContent='';talk.n=0;talk.shown=0;talk.hold=0;talkBox.classList.add('typing');if(talkBar)talkBar.style.transform='scaleX(0)';if(l[0])talkBox.classList.remove('narrate');else talkBox.classList.add('narrate');
    talk.faceAge=0;talk.facePaint=-1;talkFace.hidden=!face;if(face){talkBox.classList.add('has-face');}else talkBox.classList.remove('has-face');
    // 换了说话人：名牌从左边滑进来，头像弹一下
    if(talk.i===0||talk.lines[talk.i-1][0]!==l[0]){talkBox.classList.remove('swap');try{void talkBox.offsetWidth;}catch(e){}talkBox.classList.add('swap');talk.swapT=.5;}
    if(talk.arena)sceneT=0;
    const sc=talk.arena?'':l[2]!=null?l[2]:(talk.i?sceneA:'');if(sc!==sceneA){sceneB=sceneA;sceneA=sc;sceneT=0;}if(sceneA){talkBox.classList.add('over-art');messageT=0;notice.style.opacity=0;}else talkBox.classList.remove('over-art');}
  const esc=c=>c==='<'?'&lt;':c==='&'?'&amp;':c==='>'?'&gt;':c;
  // 每个字是一个 span：从上方落下来、由虚变实；带效果的字之后一直飘 / 抖 / 发光（delay 错开，像一条波浪）
  function chSpan(i,done){const k=talk.fx[i]||'';return'<span class="ch'+(k?' f'+k:'')+(done?' done':'')+'"'+(k==='w'||k==='s'?' style="animation-delay:0s,'+(-i*.11).toFixed(2)+'s"':'')+'>'+esc(talk.text.charAt(i))+'</span>';}
  function addChar(i){if(talkText.insertAdjacentHTML)talkText.insertAdjacentHTML('beforeend',chSpan(i,false));else talkText.textContent+=talk.text.charAt(i);}
  function voice(who,c){if(/[（）\s…—]/.test(c))return;const v=VOICE[who];if(who&&!v)return;const inner=talk.text.charAt(0)==='（';if(!who){beep(420+Math.random()*60,.03,'sine',.006);return;}beep((inner?v[0]*1.25:v[0])*(.9+Math.random()*.2),.05,inner?'sine':v[1],inner?.008:.013);}
  function typeTalk(dt){const l=talk.lines[talk.i],s=talk.text,len=s.length,sp=settings.textSpeed||1;if(talk.swapT>0){talk.swapT-=dt;if(talk.swapT<=0)talkBox.classList.remove('swap');}
    if(talk.shown<len){if(talk.wait>0){talk.wait-=dt;return;}talk.n=Math.min(len,talk.n+dt*24*sp);
      while(talk.shown<Math.floor(talk.n)){const c=s.charAt(talk.shown);addChar(talk.shown++);if(talk.shown%2===1)voice(l[0],c);if(PAUSE[c]&&talk.shown<len){talk.wait=PAUSE[c]/sp;talk.n=talk.shown;break;}}
      if(talk.shown>=len)talkBox.classList.remove('typing');return;}
    // 自动翻页：对话框底边一道细线慢慢走满，走满就翻页
    if(talk.auto||settings.autoTalk){talk.hold+=dt;const need=(1+len*.045+(l[2]?1.4:0))/sp;if(talkBar)talkBar.style.transform='scaleX('+Math.min(1,talk.hold/need).toFixed(3)+')';if(talk.hold>need)talkNext();}}
  function talkNext(){if(!talk)return;if(talk.shown<talk.text.length){talk.n=talk.shown=talk.text.length;talk.wait=0;let h='';for(let i=0;i<talk.text.length;i++)h+=chSpan(i,true);talkText.innerHTML=h;if(!talkText.insertAdjacentHTML)talkText.textContent=talk.text;talkBox.classList.remove('typing');return;}talk.i++;if(talk.i<talk.lines.length){showLine();beep(520,.04,'sine',.02);return;}
    const done=talk.done,keep=talk.keep;talk=null;talkBox.hidden=true;talkBox.classList.remove('auto');talkBox.classList.remove('swap');sceneA=sceneB='';if(!keep){hud.hidden=false;touch.hidden=!coarse();state='play';}hudKey='';keys={};clearHeld();if(done)done();}
  function skipTalk(){if(!talk)return;talk.i=talk.lines.length-1;talk.n=talk.shown=1e9;talkNext();}
  // 敌人血量随层数变厚；精英是放大一圈的守卫，带光环
  // 首领各有体型：守锁兽又宽又矮、溺灯高高浮着、旗手瘦长、典狱长最高
  const BOSS_SIZE={lock:[104,76],brood:[92,118],standard:[46,104],warden:[56,120]};
  // 新的小怪：游魂蝠（飞着俯冲）、持盾狱卒（正面挡刀，重击破防）、骨巫（远处施法、靠近就闪走）、投弹手（抛罐子）；教程里的稻草人打不坏
  const FOE_SIZE={flyer:[30,24],shield:[32,48],caster:[28,52],bomber:[30,44],dummy:[28,50],crawler:[36,22],hanger:[26,34],lurker:[32,34],spear:[26,54]},FOE_HP={flyer:.55,shield:1.35,caster:.8,bomber:.9,dummy:50,crawler:.72,hanger:.66,lurker:.7,spear:.95};
  function enemy(x,floor,type,o){const b=type==='boss',el=!!(o&&o.elite),kind=b?(L.bossKind||'warden'):'',S=b?BOSS_SIZE[kind]:el?[38,62]:FOE_SIZE[type]||[28,46],baseHp=!cycle&&stage===0&&type==='guard'&&x<1500?(o?.sparring?28:54):72, hp=Math.round((b?330:el?260:baseHp*(FOE_HP[type]||1))*L.hpK*(type==='dummy'?1:1+.35*cycle));
    const trainingPace=stage===0&&cycle===0&&x<1800?(x<1000?1.9:1.4):1;
    const e={trainingPace,waitingForHit:!cycle&&!!o?.sparring,x:x,y:floor-S[1],w:S[0],h:S[1],floor:floor,type:type,kind:kind,elite:el,hp:hp,max:hp,face:-1,cd:.6,wind:0,flash:0,dead:false,dieT:0,rage:false,spell:false,spellCd:3.5,origin:x,walk:0,swing:0,kb:0,hitT:0,seed:Math.random()*TAU};
    if(type==='flyer')Object.assign(e,{y:floor-150-S[1]/2,fly:'hover',hx:x,dvx:0,dvy:0,ft:0,cd:1});
    if(type==='hanger')Object.assign(e,{y:Math.max(90,floor-206),homeY:Math.max(90,floor-206),hang:'wait',vy:0,wait:0});
    if(type==='crawler')e.cd=.35;
    if(b)Object.assign(e,{move:'',act:0,at:0,rec:0,rt:0,vx:0,lift:0,under:0,combo:0,tollCd:3,mothCd:2,struck:false,stun:false,roar:false,surfacing:false});return e;}
  function down(a){return Object.keys(held).some(k=>held[k]===a);}
  function action(a){if(state!=='play'||paused||passage)return;if(a==='jump'){p.buffer=FEEL.buffer;p.cutQueued=false;}if(a==='attack'){inputQueue.push(1);if(p.atkCd<=0&&p.roll<=0&&p.dash<=0){inputQueue.take(1);attack();}}if(a==='roll'){const d=dirs();p.nextRollDir=d.l===d.r?p.face:(d.r?1:-1);inputQueue.push(2);if(p.rollCd<=0&&(p.attack<=0||heroFSM.canCancel())){inputQueue.take(2);roll();}}if(a==='interact')interact();if(a==='use')useItem();if(a==='cast')castSoul();if(a==='skill1')useSkill(1);if(a==='skill2')useSkill(2);if(a==='skill3')useSkill(3);if(a==='cycle')cycleItem();if(a==='map')openMap();if(a==='bag')openBag();if(a==='heal'&&p.potions&&p.hp<p.max){const h=Math.min(p.max-p.hp,(3+p.skills.vigor)*LIFE);if(!L.tutorial)p.potions--;p.hp+=h;burst(p.x,p.y,'#91d6bd',22);pop(p.x+13,p.y-6,'+'+(h/LIFE),'#9be3c8');say('余火回温 · 恢复 '+(h/LIFE)+' 个小幽灵');beep(550,.25);syncHud();}}
  function dirs(){return{l:!!(isKey('left')||stick.x<-FEEL.dead||down('left')),r:!!(isKey('right')||stick.x>FEEL.dead||down('right')),u:!!(isKey('up')||stick.y<-FEEL.dead),d:!!(isKey('down')||stick.y>FEEL.dead)};}
  // 挥刀（参考空洞骑士）：按住上 = 上挑；空中按住下 = 下劈，打中会弹起来；否则朝面向或按住的左右侧劈，侧劈第三下是重劈
  // 钟锤学徒出手慢、判定大，第三锤震出一道地波；拾灯弓手横着 / 向上是射箭，空中向下是下踢（和下劈一样能弹起来）
  function attack(){if(p.atkCd>0||p.roll>0||p.dash>0||p.charge>0)return;const C=CHARS[p.char],d=dirs();if(d.l!==d.r)p.face=d.r?1:-1;p.atkFace=p.face;p.slash=d.u?'up':d.d&&!p.ground?'down':'side';if(p.char==='bow'&&p.slash!=='down'){p.charge=.001;p.chargeMax=.45;return;}if(p.slash==='side'){if(p.comboT<=0)p.combo=0;p.combo=(p.combo+1)%3;p.comboT=1.2;}p.attack=FEEL.swing;p.atkCd=FEEL.swing;p.hit.clear();p.pogo=false;heroFSM.enter('attack','combat',FEEL.swing);}
  function fireCharge(full){if(!(p.charge>0))return;const f=p.atkFace||p.face,powered=!!full||p.charge>=(p.chargeMax||.45)-.02,up=p.slash==='up',dmg=Math.round(p.damage*(powered?2.4:1)*(relics.hunter&&p.hp/p.max>.7?1.3:1));
    thrown.push({k:'arrow',x:p.x+p.w/2+(up?f*4:f*14),y:up?p.y+2:p.y+22,vx:up?0:f*(powered?1040:900),vy:up?(powered?-1040:-900):0,t:0,r:0,dmg:dmg,soul:true,heavy:powered,pierce:powered?6:0,hits:powered?new Set():null});
    p.bowRecoil=.17;p.charge=0;p.atkCd=7/60;beep(powered?480:720,.07,'triangle');}
  function attackEvent(){
    if(p.char==='bow'&&p.slash!=='down'){shootArrow();return;}
    if(p.char==='bell'&&p.slash==='side'&&p.combo===0&&p.ground)thrown.push({k:'pwave',x:p.x+p.w/2+p.face*34,y:p.y+p.h,vx:0,vy:0,dir:p.face,t:0,r:0,life:.5,hits:new Set(),dmg:p.damage*.5});
    swingSound();}
  // 挥刀判定区是一个椭圆，画面上的刀光正好画在它的外缘里：侧劈在身前，上挑在头顶，下劈在脚下，重劈大一圈
  function slashArea(){const cx=p.x+p.w/2,cy=p.y+p.h/2,f=p.atkFace,k=(1+p.skills.reach*.12)*(p.char==='bell'?1.25:p.char==='bow'?.8:1);if(p.slash==='up')return{x:cx+f*4,y:cy-46,rx:32*k,ry:40*k};if(p.slash==='down')return{x:cx,y:cy+46,rx:30*k,ry:38*k};const big=p.combo===0?1.15:1;return{x:cx+f*(42+(big-1)*30),y:cy-6,rx:44*big*k,ry:30*big*k};}
  function inArea(A,x0,y0,x1,y1){const dx=(clamp(A.x,x0,x1)-A.x)/A.rx,dy=(clamp(A.y,y0,y1)-A.y)/A.ry;return dx*dx+dy*dy<=1;}
  // 翻滚：朝按住的方向滚（没按就朝面向），先快后慢，全程无敌；画面上缩成一团正好转一圈
  function roll(){if(p.rollCd>0)return;p.perfect=false;p.face=p.nextRollDir;p.rollFromGround=p.ground;p.roll=ROLL;p.rollDir=p.face;p.rollCd=(relics.feather?.48:FEEL.dodgeCd)*(1-p.skills.dash*.13);p.inv=Math.max(p.inv,FEEL.dodge);p.attack=0;p.trail=[];p.trailT=0;dust(p.x+13,p.y+p.h,6,-(p.rollDir||p.face));beep(190,.1);}
  const picks={Digit1:0,Digit2:1,Digit3:2,Numpad1:0,Numpad2:1,Numpad3:2},buys=Object.assign({Digit4:3,Numpad4:3,Digit5:4,Numpad5:4,Digit6:5,Numpad6:5,Digit7:6,Numpad7:6},picks);
  // 按键都查 BIND（设置里可以改）；改键时下一个按下的键直接记下来
  addEventListener('keydown',e=>{unlockAudio();const act=codeAct[e.code];
    if(rebinding){e.preventDefault();if(!e.repeat)finishRebind(e.code);return;}
    if(act||e.code==='Escape'||e.code==='Space')e.preventDefault();
    if(credits){if(!e.repeat)endCredits();return;}
    if(talk){if(!e.repeat){if(e.code==='Escape')skipTalk();else if(e.code==='Space'||e.code==='Enter'||act==='interact'||act==='attack'||act==='jump')talkNext();}return;}
    if(state==='cine'){if(!e.repeat&&cine&&(e.code==='Escape'||e.code==='Enter'))cine.skip=true;return;}
    if(state==='win'||state==='dead'){if(!e.repeat)menuKey(e);return;}
    if(state==='menu'||(paused&&panelView!=='pause')){if(!e.repeat)menuKey(e);return;}
    if(state==='map'){if(!e.repeat){if(e.code==='Escape'||act==='map')closeMap();else if(e.code==='ArrowRight'||e.code==='ArrowLeft'||act==='right'||act==='left'){mapTab=mapTab==='area'?'world':'area';renderMap();}}return;}
    if(state==='bag'){if(!e.repeat){const tabs=['bag','dex','lore'],i=tabs.indexOf(bagTab);if(e.code==='Escape'||act==='bag')closeBag();else if(e.code==='ArrowRight'||act==='right'){bagTab=tabs[(i+1)%3];renderBag();}else if(e.code==='ArrowLeft'||act==='left'){bagTab=tabs[(i+2)%3];renderBag();}}return;}
    if(state==='chest')return;
    if(state==='shop'){if(!e.repeat){if(buys[e.code]!=null)buy(SHOP[buys[e.code]].id);else if(e.code==='Escape'||act==='interact')closeShop();}return;}
    if(state==='upgrade'&&picks[e.code]!=null){if(!e.repeat)pickOffer(picks[e.code]);return;}
    if(e.code==='Escape'&&!e.repeat){togglePause();return;}if(paused){if(!e.repeat)menuKey(e);return;}if(e.repeat)return;keys[e.code]=true;if(act)action(act);});
  // 松开跳跃键时还在上升，就把上升速度砍掉一半：轻点是小跳，按住是大跳
  function jumpRelease(){if(!p||state!=='play')return;if(p.buffer>0)p.cutQueued=true;else if(p.jumpRising&&p.vy<-230)p.vy=-230;p.jumpRising=false;}
  addEventListener('keyup',e=>{delete keys[e.code];if(codeAct[e.code]==='jump')jumpRelease();});
  addEventListener('blur',()=>{keys={};clearHeld();if(state==='play'&&!paused)togglePause();});
  addEventListener('pagehide',saveActiveJourney);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveActiveJourney();keys={};clearHeld();if(fileMusic)silenceLocal();if(state==='play'&&!paused)togglePause();if(ac){const r=ac.suspend();if(r&&r.catch)r.catch(()=>{});}}else if(ac&&!muted){const r=ac.resume();if(r&&r.catch)r.catch(()=>{});}});
  ['pointerdown','touchend','click'].forEach(n=>document.addEventListener(n,unlockAudio,true));
  // 微信 / iOS：不许整页拖动回弹、双指缩放、长按弹菜单（面板本身可以滚动）
  document.addEventListener('touchmove',e=>{if(!(e.target&&e.target.closest&&e.target.closest('.veil')))e.preventDefault();},{passive:false});
  document.addEventListener('gesturestart',e=>e.preventDefault());document.addEventListener('contextmenu',e=>e.preventDefault());
  document.querySelectorAll('[data-action]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();try{b.setPointerCapture(e.pointerId);}catch(err){}held[e.pointerId]=b.dataset.action;b.classList.add('held');action(b.dataset.action);});const release=e=>{if(held[e.pointerId]==='jump')jumpRelease();delete held[e.pointerId];b.classList.remove('held');};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);});
  // 摇杆：左右移动；往上 / 往下推着挥刀 = 上挑 / 下劈。手指滑出摇杆也继续跟手
  const knob=document.getElementById('knob');let stickId=null;
  function stickMove(e){const r=pad.getBoundingClientRect();if(r.width<=0||r.height<=0){stickEnd();return;}const rx=r.width/2,ry=r.height/2;let x=(e.clientX-r.left-rx)/rx,y=(e.clientY-r.top-ry)/ry;const d=Math.hypot(x,y);if(d>1){x/=d;y/=d;}if(d<FEEL.dead){x=0;y=0;}stick.x=x;stick.y=y;knob.style.transform='translate('+(x*(pad.clientWidth||r.width)*.25).toFixed(1)+'px,'+(y*(pad.clientHeight||r.height)*.25).toFixed(1)+'px)';}
  function stickEnd(){stickId=null;stick.x=0;stick.y=0;knob.style.transform='';}
  pad.addEventListener('pointerdown',e=>{e.preventDefault();if(stickId!==null)return;try{pad.setPointerCapture(e.pointerId);}catch(err){}stickId=e.pointerId;stickMove(e);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===stickId)stickMove(e);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(n=>pad.addEventListener(n,e=>{if(e.pointerId===stickId)stickEnd();}));
  document.getElementById('talk-skip').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();skipTalk();});talkBox.addEventListener('pointerdown',e=>{e.preventDefault();talkNext();});canvas.addEventListener('pointerdown',()=>{if(credits)endCredits();else if(talk)talkNext();});
  document.getElementById('quick-item').onclick=()=>openBag('bag');
  document.getElementById('bag-btn').onclick=()=>{if(state==='bag')closeBag();else openBag();};
  {const mb=document.getElementById('map-btn');if(mb)mb.onclick=()=>{if(state==='map')closeMap();else openMap();};}
  document.getElementById('pause').onclick=togglePause;muteBtn.onclick=()=>setMuted(!muted);
  function togglePause(){if(state!=='play')return;paused=!paused;keys={};clearHeld();if(paused)showPause();else{panel.hidden=true;panelView='';rebinding=null;}}
  function showPause(){panel.classList.remove('late');panelView='pause';const alts=[{label:'自由选关',fn:renderChapters},{label:'设置',fn:()=>renderSettings('pause')},{label:'回到开始界面',fn:()=>{saveRun();showMenu();}}];if(run.guided&&stage===0&&!coachDone&&!run.coachSkip)alts.push({label:'关闭沿途操作提示',fn:()=>{coachDone=true;run.coachSkip=true;try{localStorage.setItem('ember:coach','1');}catch(e){}showPause();}});if(L.tutorial)alts.unshift({label:loadSave()?'结束练习':'进入第一关',fn:()=>{paused=false;finishTutorial();}});
    if(coarse()){
      alts.push({label:muted?'开启声音':'静音',fn:()=>{setMuted(!muted);showPause();}});
      if(tall&&window.screen&&screen.orientation&&screen.orientation.lock)alts.push({label:'切换到横屏',fn:enterLandscape});
    }
    showPanel('余火未熄',L.tutorial?'这里是焚炉底层的教程，随时可以跳过。':'歇一会儿，再继续前行。','继续探索',()=>{paused=false;panel.hidden=true;panelView='';},alts);focusFirst();}
  // ---- 开始界面：继续旅程 / 新的旅程（选角色和周目）/ 教程 / 章节挑战 / 图鉴与传说 / 设置 ----
  const EMBLEM='<svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="43"/><path d="M31 59h34l-5-8V37a12 12 0 0 0-24 0v14zM43 64a5 5 0 0 0 10 0M48 19v6M21 48h-7m68 0h-7"/><path class="ember" d="M48 37c-7 8-5 16 0 19 6-3 7-11 0-19z"/></svg>';
  let selectedRoute=false;
  const saveSlot=selected=>selected?'ember:selected-save':'ember:save';
  function loadSave(selected=false){
    try{
      const save=JSON.parse(localStorage.getItem(saveSlot(selected)));
      if(save&&Number.isInteger(save.stage)&&STAGES[save.stage]&&Number.isFinite(save.e?.hp)&&Number.isFinite(save.e.max))return save;
    }catch(e){}
    return null;
  }
  function bossSnap(){const b=enemies.find(e=>e.type==='boss'&&!e.dead);return b?{hp:b.hp,max:b.max,phase:b.phase||0,rage:!!b.rage,phase3:!!b.phase3}:null;}
  function saveRun(){if(!L||!p||L.tutorial||state==='menu'||!entry)return;try{const record=JSON.stringify({v:6,stage:stage,char:p.char,cycle:cycle,checkX:p.checkX,boss:bossSnap(),e:entry,run:{guideX:Math.floor(run.guideX),litWicks:run.litWicks,wardParty:run.wardParty,guided:!!run.guided,awakened:run.awakened||0,lessonMask:run.lessonMask||0,keeper:!!run.keeper,c2:!!run.chapter2,c3:!!run.chapter3,c4:!!run.chapter4,seen:run.seen||{},maps:run.maps||{},found:run.found||{},visited:run.visited||{},inkMet:!!run.inkMet,firstElite:!!run.firstElite,time:run.time||0,deaths:run.deaths||0,shortcut:!!run.shortcut,coach:!!run.coachSkip}});localStorage.setItem(saveSlot(selectedRoute),record);lastWrittenSave=record;}catch(e){}}
  // A title screen, practice room or stale background tab must never create a journey.
  function saveActiveJourney(){
    if(state!=='play'||passage||L.tutorial||!lastWrittenSave)return;
    try{if(localStorage.getItem(saveSlot(selectedRoute))===lastWrittenSave)saveRun();}catch(e){}
  }
  function clearSave(){lastWrittenSave=null;try{localStorage.removeItem(saveSlot(selectedRoute));}catch(e){}}
  function showMenu(){selectedRoute=false;panel.classList.remove('late');state='menu';paused=false;talk=null;talkBox.hidden=true;credits=null;cine=null;rebinding=null;hud.hidden=true;touch.hidden=true;hint.hidden=true;gainBox.hidden=true;notice.style.opacity=0;messageT=0;titleT=0;sceneA=sceneB='';keys={};clearHeld();renderMenu();}
  function focusFirst(){try{const b=panel.querySelector('button:not([disabled])');if(b&&!coarse())b.focus();}catch(e){}}
  function bindBack(){panel.querySelectorAll('[data-back]').forEach(b=>b.onclick=menuBack);}
  function menuBack(){rebinding=null;if(panelView==='chapters'&&paused){showPause();return;}beep(420,.05,'sine');if(panelView==='settings'&&menuFrom==='pause'&&state==='play'){showPause();return;}if(state==='menu')renderMenu();}
  function renderMenu(){panelView='menu';const s=loadSave(),sv=s?STAGES[s.stage]:null,items=[];
    if(sv)items.push(['continue','继续旅程',(sv.rest?sv.name:sv.n+' · '+sv.name)+' · '+(CHARS[s.char]||CHARS.lamp).name+(s.cycle?' · 第 '+(s.cycle+1)+' 周目':'')]);
    items.push(['new','新的旅程','选择引灯人'],['chapters','自由选关','五张地图任你挑选']);
    const journeys=items.map(([id,label,detail])=>
      '<button class="journey-link" data-menu="'+id+'"><b>'+label+'</b><small>'+detail+'</small></button>'
    ).join('');
    const library=[['tutorial','操作练习'],['codex','图鉴与传说'],['settings','设置']];
    const tools=library.map(([id,label])=>'<button data-menu="'+id+'">'+label+'</button>').join('');
    panel.innerHTML='<div class="home-scene" aria-hidden="true"><canvas></canvas></div><div class="home-menu"><div class="home-wordmark"><span class="home-seal" aria-hidden="true">'+EMBLEM+'</span><span lang="en">Ember Vault</span></div>'
      +'<h1>余烬地牢</h1><nav class="home-journeys" aria-label="开始游玩">'+journeys+'</nav>'
      +'<nav class="home-tools" aria-label="其他选项">'+tools+'</nav>'
      +(best||clears?'<p class="home-record">'+(clears?'通关 '+clears+' 次　':'')+'最高 '+best+' 分</p>':'')+'</div>';
    panel.hidden=false;window.EmberTitle?.mount(panel.querySelector('.home-scene canvas'));panel.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>menuPick(b.dataset.menu));focusFirst();}
  function menuPick(id){unlockAudio();beep(620,.05,'sine');if(id==='continue')continueRun();else if(id==='new')renderChars();else if(id==='tutorial')startTutorial();else if(id==='chapters')renderChapters();else if(id==='codex'){panelView='codex';bagTab='dex';renderBag(true);}else if(id==='settings')renderSettings('menu');}
  // Version 2 stored absolute world coordinates. Restore the nearest actual fire on the new route.
  function migrateRouteSave(s){
    if(s.v>=3)return;
    const room=STAGES[s.stage],journey=s.run||(s.run={});
    if(room.lesson){
      const oldExit=routePace[room.theme].oldExit;
      const project=x=>Math.round(120+clamp((x-120)/(oldExit-120),0,1)*(room.exit-120));
      journey.guideX=project(Number.isFinite(journey.guideX)?journey.guideX:(s.checkX||120));
      if(Number.isFinite(s.checkX)){
        const at=project(s.checkX);
        s.checkX=room.checks.reduce((best,x)=>Math.abs(x-at)<Math.abs(best-at)?x:best);
      }
    }
    if(journey.seen)STAGES.forEach((stage,index)=>{
      const key='s'+index,old=journey.seen[key],count=Math.ceil(stage.w/100);
      if(!Array.isArray(old)||old.length===count||!old.length)return;
      // Several old map cells can represent one new cell. Keep the player's explored areas.
      const cells=Array(count).fill(0);
      old.forEach((seen,i)=>{if(seen)cells[Math.min(count-1,Math.floor((i+.5)*count/old.length))]=1;});
      journey.seen[key]=cells;
    });
  }
  function continueRun(selected=false){const s=loadSave(selected);if(!s)return;migrateRouteSave(s);selectedRoute=selected;cycle=s.cycle||0;reset(true,s.char);const e=s.e;Object.assign(p,{max:e.max,hp:e.hp,damage:e.damage,potions:e.potions,soul:e.soul||0,shards:e.shards||0,plateHits:e.plateHits||0,leechKills:e.leechKills||0,skills:Object.assign({},p.skills,e.skills)});embers=e.embers;score=e.score;kills=e.kills;bag=Object.assign({bomb:0,knife:0,frost:0},e.bag);relics=Object.assign({},e.relics);keepsakes=Object.assign({},e.keep);
    if(s.run){run.guided=!!s.run.guided;run.awakened=s.run.awakened||0;run.lessonMask=s.run.lessonMask||0;['seen','maps','found','visited'].forEach(k=>{if(s.run[k])run[k]=s.run[k];});run.inkMet=!!s.run.inkMet;run.firstElite=!!s.run.firstElite;run.keeper=s.run.keeper;run.time=s.run.time||0;run.deaths=s.run.deaths||0;run.shortcut=!!s.run.shortcut;run.coachSkip=!!s.run.coach;['2','3','4'].forEach(n=>{if(s.run['c'+n])run['chapter'+n]=true;});}introSeen=true;loadStage(s.stage,true);
    if(L.wicks){
      const savedX=Number.isFinite(s.run?.guideX)?s.run.guideX:(s.checkX||120);
      const previous=s.v>=4?Math.trunc(s.run?.litWicks||0):L.wicks.filter(w=>w.x<=savedX).length;
      run.litWicks=clamp(previous,0,L.wicks.length);
      const count=patrolSizes[L.theme][run.litWicks];
      const party=s.run?.wardParty;
      if(s.v>=6&&Array.isArray(party)&&party.length===count&&party.every(Number.isInteger))
        run.wardParty=party.map(hp=>clamp(hp,0,patrolHP));
      else if(s.v===5&&count!=null&&Number.isInteger(s.run?.wardLeft)){
        const cleared=count-clamp(s.run.wardLeft,0,count);
        run.wardParty=Array.from({length:count},(_,i)=>i<cleared?0:patrolHP);
      }
      run.doorLift=run.litWicks===L.wicks.length?1:0;
    }
    if(s.checkX!=null){p.checkX=s.checkX;checkpoint=true;L.checkpoint=s.checkX;p.x=s.checkX+20;p.y=FLOOR-p.h;p.safeX=p.x;cam=clamp(p.x-W*.35,0,Math.max(0,WORLD-W));}
    if(s.boss){const b=enemies.find(e=>e.type==='boss'&&!e.dead);if(b){b.hp=Math.min(b.max,s.boss.hp);b.phase=s.boss.phase||0;b.rage=!!s.boss.rage;b.phase3=!!s.boss.phase3;}}
    followEmber(0,true);saveRun();say('继续上次的旅程 · '+(checkpoint?'从钟火':'')+(L.rest?L.name:L.n+' · '+L.name),3);}
  function startJourney(ch,cyc){selectedRoute=false;if(!clears)cyc=0;if(!CHARS[ch])ch='lamp';cycle=cyc||0;clearSave();reset(true,ch);try{localStorage.setItem('ember:char',p.char);}catch(e){}introSeen=true;startTalk(TALK.prologue,()=>{note('lore','prologue');scenePass(beginPrisonJourney);});}
  function selectLevel(room){
    // Bank the active journey before changing slots. Keep the chosen bearer and use the new chapter's supplies.
    const ch=paused?p.char:lastChar();
    if(paused)saveRun();
    selectedRoute=true;cycle=0;unlockAudio();
    startChapter(room.chapter,room,ch);
  }
  function renderChapters(){
    panelView='chapters';
    const saved=loadSave(true);
    const resume=saved&&!paused?'<button class="secondary" data-resume-level>继续选关 · '+STAGES[saved.stage].name+'</button>':'';
    const choices=mainLevels.map((room,i)=>'<button class="menu-item" data-level="'+i+'"><b>'+room.n+' · '+room.name+'</b><small>'+routePace[room.theme].brief+'</small></button>').join('');
    panel.innerHTML='<div class="sheet menu-sub"><h1>自由选关</h1><p class="intro">任选一张地图，领取本章补给。选关进度单独保存。</p>'+resume+'<div class="menu-list">'+choices+'</div><button class="secondary" data-back>返回</button></div>';
    panel.hidden=false;
    panel.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>selectLevel(mainLevels[Number(button.dataset.level)]));
    panel.querySelectorAll('[data-resume-level]').forEach(button=>button.onclick=()=>continueRun(true));
    bindBack();focusFirst();
  }
  // 选角色：没解锁的画成剪影，写着解锁条件；通关过就能挑周目
  let pickChar='lamp',pickCycle=0;
  function renderChars(focusPicked=false){panelView='chars';if(!charOpen(pickChar))pickChar=lastChar();pickCycle=Math.min(pickCycle,Math.min(clears,4));const bar=(t,v)=>'<span class="bar"><em>'+t+'</em><i><u style="width:'+Math.round(v*100)+'%"></u></i></span>';
    const card=id=>{const c=CHARS[id],open=charOpen(id);return'<button class="char-card'+(id===pickChar?' on':'')+(open?'':' locked')+'" data-char="'+id+'" aria-pressed="'+(id===pickChar)+'"'+(open?'':' disabled')+'><span class="portrait">'+(open?'<canvas width="240" height="240" data-idle="'+id+'" aria-label="'+c.name+'动态待机" style="width:100%;height:100%;display:block"></canvas>':'<img alt="" src="'+charPortrait(id,true)+'">')+'</span><b>'+(open?c.name:'？？？')+'</b><small class="role">'+(open?c.title:c.unlockText)+'</small>'+(open?'<span class="bars">'+bar('生命',c.hp/7)+bar('攻击',c.power)+bar('速度',c.speedK)+'</span>':'')+'</button>';};
    const C=CHARS[pickChar],cyc=clears?'<div class="cycle-pick"><span>周目</span>'+Array.from({length:Math.min(clears,4)+1},(_,i)=>'<button data-cycle="'+i+'"'+(i===pickCycle?' class="on"':'')+'>'+(i?'第 '+(i+1)+' 周目':'一周目')+'</button>').join('')+'<small>'+(pickCycle?'敌人更硬、出手更快，余烬也更多':'第一次的旅程')+'</small></div>':'';
    const skillRows=C.skills.map((id,i)=>'<div class="sk-row">'+artImg('sk_'+id)+'<b>'+(i+1)+' · '+SKILLS[id].name+'</b><i>'+'●'.repeat(SKILLS[id].cost)+'</i><small>'+SKILLS[id].info+'</small></div>').join('');
    panel.innerHTML='<div class="sheet wide chars"><h1>谁来引灯</h1><div class="char-cards">'+Object.keys(CHARS).filter(charOpen).map(card).join('')+'</div>'
      +cyc+'<div class="journey-actions"><button class="primary" id="go">出发 <span>↗</span></button><button class="secondary" data-back>返回</button></div>'
      +'<details class="journey-details"><summary>'+C.name+'的招式</summary><div class="char-info"><p>'+C.info+'</p><div class="skill-list">'+skillRows+'</div></div></details></div>';
    panel.hidden=false;panel.querySelectorAll('[data-char]').forEach(b=>b.onclick=()=>{pickChar=b.dataset.char;beep(560,.05,'sine');renderChars(true);});panel.querySelectorAll('[data-cycle]').forEach(b=>b.onclick=()=>{pickCycle=+b.dataset.cycle;renderChars();});
    document.getElementById('go').onclick=()=>{unlockAudio();startJourney(pickChar,pickCycle);};bindBack();
    if(focusPicked&&!coarse())panel.querySelector('.char-card.on').focus();else focusFirst();}
  // 设置：音量滑条、画面 / 对话选项、按键（每个动作两个键位，点一下再按新键）
  function renderSettings(from){const keymapOpen=!from&&panel.querySelector?.('.keyboard-options')?.open;panelView='settings';if(from)menuFrom=from;const opt=(k,label,vals)=>'<div class="opt"><span>'+label+'</span>'+vals.map(v=>'<button data-opt="'+k+'" data-v="'+v[0]+'"'+(String(settings[k])===String(v[0])?' class="on"':'')+'>'+v[1]+'</button>').join('')+'</div>',sl=(k,label)=>'<label class="slider"><span>'+label+'</span><input type="range" min="0" max="100" step="5" value="'+Math.round(settings[k]*100)+'" data-slider="'+k+'"><b>'+Math.round(settings[k]*100)+'</b></label>';
    const rows=KEY_ORDER.map(a=>'<div class="keyrow"><span>'+KEY_LABEL[a]+'</span>'+[0,1].map(i=>{const w=rebinding&&rebinding.a===a&&rebinding.i===i;return'<button data-bind="'+a+'" data-slot="'+i+'"'+(w?' class="wait"':'')+'>'+(w?'按下新按键…':keyName(BIND[a][i]))+'</button>';}).join('')+'</div>').join('');
    panel.innerHTML='<div class="sheet wide settings"><span class="chapter">设置</span><h1>设置</h1><h3>声音</h3>'+sl('vol','总音量')+sl('music','音乐')+sl('sfx','音效')+'<h3>画面</h3>'+opt('fx','特效',[['auto','自动'],['high','全开'],['low','省电']])+opt('shake','屏幕震动',[[true,'开'],[false,'关']])+opt('buzz','震动',[[true,'开'],[false,'关']])+opt('nums','伤害数字',[[true,'显示'],[false,'隐藏']])+opt('minimap','小地图',[[true,'显示'],[false,'隐藏']])+'<h3>对话</h3>'+opt('textSpeed','文字速度',[[.6,'慢'],[1,'中'],[1.7,'快']])+opt('autoTalk','自动翻页',[[false,'关'],[true,'开']])+'<h3>操作</h3>'+opt('touch','屏幕按键',[['auto','自动'],['show','显示'],['hide','隐藏']])+sl('touchA','按键透明度')+'<label class="slider"><span>按键左右</span><input type="range" min="-80" max="80" step="4" value="'+(settings.touchX||0)+'" data-px="touchX"><b>'+(settings.touchX||0)+'</b></label><label class="slider"><span>按键上下</span><input type="range" min="-60" max="40" step="4" value="'+(settings.touchY||0)+'" data-px="touchY"><b>'+(settings.touchY||0)+'</b></label><details class="keyboard-options"'+(keymapOpen||rebinding||(!coarse()&&from)?' open':'')+'><summary>键盘按键</summary><p>选中一个动作，再按要使用的键。Esc 取消。</p><div class="keymap">'+rows+'</div><button class="secondary" id="keys-reset">恢复默认按键</button></details><button class="primary" data-back>返回 <span>↩</span></button></div>';
    panel.hidden=false;
    panel.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{const k=b.dataset.opt,v=b.dataset.v;settings[k]=v==='true'?true:v==='false'?false:isNaN(+v)?v:+v;applySettings();saveSettings();beep(600,.04,'sine');renderSettings();});
    panel.querySelectorAll('[data-slider]').forEach(r=>{r.oninput=()=>{settings[r.dataset.slider]=r.value/100;r.nextElementSibling.textContent=r.value;applySettings();saveSettings();};r.onchange=()=>beep(660,.06,'sine');});
    panel.querySelectorAll('[data-px]').forEach(r=>{r.oninput=()=>{settings[r.dataset.px]=+r.value;r.nextElementSibling.textContent=r.value;applySettings();saveSettings();};});
    panel.querySelectorAll('[data-bind]').forEach(b=>b.onclick=()=>{rebinding={a:b.dataset.bind,i:+b.dataset.slot};renderSettings();});
    document.getElementById('keys-reset').onclick=()=>{BIND=JSON.parse(JSON.stringify(DEFAULT_KEYS));rebuildKeys();saveSettings();renderSettings();};bindBack();if(!rebinding)focusFirst();}
  function applySettings(){buses();resize();touch.hidden=!coarse()||state!=='play';if(settings.fx==='low')lowFx=true;else if(settings.fx==='high')lowFx=false;const root=document.documentElement;if(root&&root.style){root.style.setProperty('--touch-a',String(settings.touchA==null?1:settings.touchA));root.style.setProperty('--touch-x',(settings.touchX||0)+'px');root.style.setProperty('--touch-y',(settings.touchY||0)+'px');}}
  // 改键：同一个键原来属于别的动作就互换，免得两个动作抢一个键
  function finishRebind(code){const r=rebinding;rebinding=null;if(r&&code!=='Escape'){const old=BIND[r.a][r.i];KEY_ORDER.forEach(a=>{if(a===r.a)return;const j=BIND[a].indexOf(code);if(j>=0){if(old)BIND[a][j]=old;else BIND[a].splice(j,1);}});const j2=BIND[r.a].indexOf(code);if(j2>=0&&j2!==r.i)BIND[r.a].splice(j2,1);BIND[r.a][r.i]=code;BIND[r.a]=BIND[r.a].filter(Boolean);rebuildKeys();saveSettings();beep(700,.06,'sine');}renderSettings();}
  // 菜单里用方向键 / Tab 选，空格或回车确定，Esc 返回
  function menuKey(e){const act=codeAct[e.code],btns=Array.prototype.slice.call(panel.querySelectorAll('button:not([disabled]),input,summary')).filter(b=>b.getClientRects().length);if(!btns.length)return;const i=btns.indexOf(document.activeElement);
    if(e.code==='ArrowDown'||act==='down'||(e.code==='Tab'&&!e.shiftKey)){e.preventDefault();btns[(i+1+btns.length)%btns.length].focus();}
    else if(e.code==='ArrowUp'||act==='up'||(e.code==='Tab'&&e.shiftKey)){e.preventDefault();btns[(i-1+btns.length*2)%btns.length].focus();}
    else if(e.code==='Escape'){if(state==='menu'&&panelView==='menu')return;if(panelView==='codex'){renderMenu();return;}menuBack();}
    else if(e.code==='Space'&&document.activeElement&&document.activeElement.tagName==='BUTTON'){e.preventDefault();document.activeElement.click();}}
  function showPanel(title,t,label,fn,alts){alts=alts||[];panel.innerHTML='<div class="sheet"><span class="chapter">余烬地牢 · '+(L.rest?L.name:L.n+' · '+L.name)+'</span><h1>'+title+'</h1><p class="intro">'+t+'</p><button class="primary" id="main-action">'+label+' <span>↗</span></button>'+alts.map((a,i)=>'<button class="secondary" id="alt-'+i+'">'+a.label+'</button>').join('')+'<p class="keys">击败 '+kills+'　·　得分 '+score+'　·　最高 '+best+'</p></div>';panel.hidden=false;document.getElementById('main-action').onclick=fn;alts.forEach((a,i)=>{document.getElementById('alt-'+i).onclick=a.fn;});}
  // 篝火驿站的烛叟：1~6 购买；第 6 格是这一站的护符（买过就售罄，护符都有了就换成磨刀石）。余烬不够或生命已满时按钮变暗
  // 价格跟着刚走出来的那一层涨（后面几层掉的余烬也更多）
  const relicSlot=()=>shopRelic?{name:ITEMS[shopRelic].name,info:ITEMS[shopRelic].info.replace(/。$/,'')}:{name:'磨刀石',info:'攻击伤害 +8'};
  const cost=s=>Math.round(s.price*STAGES[Math.max(0,stage-1)].hpK/5)*5,canBuy=s=>embers>=cost(s)&&!(s.id==='soup'&&p.hp>=p.max)&&!(s.id==='relic'&&flags.sold)&&!(s.id==='whetstone'&&flags.sharpened);
  const nearFire=()=>!!(L.rest&&Math.abs(p.x+p.w/2-L.fire)<65&&p.y+p.h>FLOOR-60&&!flags.rested);
  const nearShop=()=>!!(L.rest&&Math.abs(p.x+p.w/2-L.shop)<95&&p.y+p.h>FLOOR-60);
  const nearNpc=()=>!!(L.npc!=null&&Math.abs(p.x+p.w/2-L.npc)<80&&p.y+p.h>FLOOR-60);
  const nearLore=()=>!!(L.lore&&!flags.lore&&Math.abs(p.x+p.w/2-L.lore.x)<70&&p.y+p.h>FLOOR-60);
  function openShop(){state='shop';keys={};clearHeld();nearChest=false;nearKind='';chestBtn.hidden=true;renderShop('');beep(500,.15);}
  // 货摊：每样货都画出来，价格旁边是余烬的图
  const goodArt=s=>s.id==='relic'?(shopRelic||'whetstone'):s.id,goodQty={bomb:'×2',knife:'×4'};
  function renderShop(msg){const items=SHOP.map((s,i)=>{const r=s.id==='relic'?relicSlot():s,sold=(s.id==='relic'&&flags.sold)||(s.id==='whetstone'&&flags.sharpened);return'<button data-buy="'+s.id+'" class="good'+(canBuy(s)?'':' off')+(sold?' sold':'')+'"><b class="num">'+(i+1)+'</b><span class="art">'+artImg(goodArt(s))+(goodQty[s.id]?'<i class="qty">'+goodQty[s.id]+'</i>':'')+'</span><strong>'+r.name.replace(/ ×\d+$/,'')+'</strong><small>'+(sold?'已售出':r.info)+'</small><span class="price">'+(sold?'—':artImg('ember')+cost(s))+'</span></button>';}).join('');
    panel.innerHTML='<div class="sheet shop"><span class="chapter">篝火驿站 · 烛叟的货摊</span><h1>歇歇脚</h1><p class="intro">“余烬换补给，童叟无欺。”</p><div class="purse">'+chip('ember',embers)+chip('heart',(p.hp/LIFE)+' / '+(p.max/LIFE))+chip('flask',L.tutorial?'∞':p.potions)+'</div><div class="goods">'+items+'</div><p class="keys" id="shop-msg">'+(msg||(coarse()?'点选购买':'按 1 – 7 购买　·　Esc 或 E 离开'))+'</p><button class="secondary" id="leave">离开商店</button></div>';panel.hidden=false;panel.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>buy(b.dataset.buy));document.getElementById('leave').onclick=closeShop;}
  function buy(id){if(state!=='shop')return;const s=SHOP.find(q=>q.id===id);if(!s)return;
    if(!canBuy(s)){renderShop(s.id==='relic'&&flags.sold?'这一站的护符已经卖完了':s.id==='whetstone'&&flags.sharpened?'这一站的磨石已经用过了':embers<cost(s)?'余烬不够，还差 '+(cost(s)-embers):'生命已经是满的');beep(140,.12,'square');return;}
    embers-=cost(s);const name=s.id==='relic'?relicSlot().name:s.name;
    if(id==='soup')p.hp=p.max;if(id==='flask')p.potions++;if(id==='bomb')gain('bomb',2,true);if(id==='knife')gain('knife',4,true);if(id==='frost')gain('frost',1,true);
    if(id==='relic'){if(shopRelic)gain(shopRelic,1,true);else p.damage+=8;flags.sold=true;}if(id==='whetstone'){p.damage+=8;flags.sharpened=true;}
    beep(760,.1);beep(1020,.16);syncHud();renderShop('买下了「'+name+'」');}
  function closeShop(){if(state!=='shop')return;state='play';panel.hidden=true;keys={};clearHeld();say('一路顺风 · 门在右边',1.8);}
  // 互动的优先级：烛叟 > 守钟人 > 遗物 > 宝箱。第一次见面先聊几句
  function interact(){
    if(nearFire()){flags.rested=true;p.hp=p.max;p.potions=Math.max(p.potions,1);p.soul=3;burst(L.fire,FLOOR-30,'#ffd08a',25);say('篝火温暖了你 · 生命、药瓶与魂火已恢复',3);beep(620,.25);hudKey='';return;}
    if(nearShop()){if(flags.met)openShop();else{flags.met=true;const v=L.restNo||0;if(v===0)note('lore','merchant');startTalk(TALK.merchant[v],()=>{if(v===3)note('lore','aling');openShop();});}return;}
    if(nearNpc()){if(run.keeper)startTalk(TALK.keeper2);else{run.keeper=true;startTalk(TALK.keeper,()=>{gain('bomb',1);sel='bomb';note('lore','keeper');loot.push({id:'bomb',x:L.npc+6,y:FLOOR-50,vx:60,vy:-240,t:0});say(coarse()?'点「道具」把它扔出去':'按 U 把它扔出去',3.5);});}return;}
    if(nearLore()){flags.lore=true;const id=L.lore.id;startTalk(SPOT[id],()=>{gain(id);note('lore',id);const reward=Math.round(25*L.hpK);embers+=reward;loot.push({id:id,x:L.lore.x,y:FLOOR-40,vx:0,vy:-260,t:0});popArt('ember','+'+reward,p.x+13,p.y-24);for(let i=0;i<6;i++)orbs.push({x:L.lore.x,y:FLOOR-30,vx:(Math.random()-.5)*200,vy:-80-Math.random()*160,t:0});hudKey='';});return;}
    if(nearInk()){talkInk();return;}
    const c=chests.find(c=>!c.open&&Math.abs(c.x-p.x)<85&&Math.abs(c.y-p.y-p.h)<75);if(!c){if(!L.arena)say(L.rest?'走到烛叟身边再交易':'靠近平台上的铜色宝箱再开启',2);return;}
    // 开箱：先播 0.85 秒开盖动画（世界停住），再弹出三选一
    c.open=true;c.openT=0;chestC=c;nearChest=false;nearKind='';chestBtn.hidden=true;state='chest';keys={};clearHeld();offers=makeOffers(c);beep(180,.3,'square');}
  // 宝箱三选一：一项强化、一样道具，第三项多半是还没拿到的护符
  function makeOffers(c){const r=rng(runSeed+stage*97+Math.round(c.x)),pick=a=>a[Math.floor(r()*a.length)],free=relicPool().filter(id=>!relics[id]),ups=['blade','heart','flask'].concat(Object.keys(p.skills).filter(id=>p.skills[id]<3)),skills=ups.filter(id=>p.skills[id]!=null),a=pick(stage===0&&c.x===600&&skills.length?skills:ups);
    const o=[{kind:'up',id:a},Object.assign({kind:'use'},pick([{id:'bomb',n:2},{id:'knife',n:4},{id:'frost',n:1}]))];
    o.push(free.length&&r()<.8?{kind:'relic',id:pick(free)}:{kind:'up',id:pick(ups.filter(u=>u!==a))});return o;}
  function offerText(o){if(o.kind==='up'){const u=UPS.find(q=>q.id===o.id);return{name:u.name+(p.skills[o.id]!=null?' · '+(p.skills[o.id]+1)+'级':''),info:u.info,tag:p.skills[o.id]!=null?'技能':'强化'};}const it=ITEMS[o.id];return{name:it.name+(o.n>1?' ×'+o.n:''),info:it.info,tag:o.kind==='use'?'道具':'护符'};}
  // 三张卡片：画在前，名字和说明在下；宝箱上方也浮着这三样东西
  function showOffers(){state='upgrade';revealC=chestC;chestC=null;panel.innerHTML='<div class="sheet reward"><span class="chapter">余火的馈赠 · 三选一</span><h1>拾起余烬</h1><div class="cards">'+offers.map((o,i)=>{const t=offerText(o);return'<button data-pick="'+i+'" class="card k-'+o.kind+'"><b class="num">'+(i+1)+'</b><span class="art">'+artImg(o.id)+(o.n>1?'<i class="qty">×'+o.n+'</i>':'')+'</span><span class="txt"><em class="tag">'+t.tag+'</em><strong>'+t.name.replace(/ ×\d+$/,'')+'</strong><small>'+t.info+'</small></span></button>';}).join('')+'</div><p class="keys">'+(coarse()?'点选一项':'按 1 / 2 / 3 快速选择')+'</p></div>';panel.hidden=false;panel.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>pickOffer(+b.dataset.pick));beep(660,.2);}
  // ---- 道具：U 用选中的，Q 换下一种；用完了自动换成还有的那种 ----
  // 近战命中积攒魂火；魂火弹与普通消耗品分开计数。
  function castSoul(){if(run.guided&&run.awakened<3)return;if(p.soul<3||p.castCd>0||p.roll>0){if(p.soul<3)say('挥刀命中敌人，积满三格魂火',1.5);return;}if(!L.tutorial)p.soul-=3;p.castCd=L.tutorial?0:.5;if(relics.wick&&p.hp<p.max){const h=Math.min(LIFE,p.max-p.hp);p.hp+=h;pop(p.x+13,p.y-15,'+'+(h/LIFE),'#9be3c8');}const x=p.x+p.w/2+p.face*20,y=p.y+23;thrown.push({k:'soul',x:x,y:y,vx:p.face*630,vy:0,t:0,r:0,hits:new Set(),pierce:2+p.skills.flame});fx.push({k:'ring',x:x,y:y,life:.25,max:.25,r:38});burst(x,y,'#8fead7',10);beep(480,.14,'sine');beep(720,.2,'sine');hudKey='';}
  function cycleItem(){const i=USES.indexOf(sel);for(let k=1;k<=3;k++){const id=USES[(i+k)%3];if(bag[id]||k===3){sel=id;break;}}hudKey='';popArt(sel,L.tutorial?'∞':'×'+bag[sel],p.x+13,p.y-30);beep(600,.05,'sine');}
  function useItem(){if(!bag[sel]){const alt=USES.find(id=>bag[id]);if(!alt){say('没有可以用的道具',1.2);beep(140,.1,'square');return;}sel=alt;}
    const used=sel;if(!L.tutorial)bag[used]--;hudKey='';if(!bag[used]){const alt=USES.find(id=>bag[id]);if(alt)sel=alt;}const f=p.face,cx=p.x+p.w/2,cy=p.y+18;
    if(used==='bomb'){thrown.push({k:'bomb',x:cx+f*10,y:cy,vx:f*330+p.vx*.3,vy:-300,t:0,r:0});beep(300,.1);}
    else if(used==='knife'){thrown.push({k:'knife',x:cx+f*12,y:cy+4,vx:f*700,vy:0,t:0,r:0});beep(900,.06,'triangle');}
    else frostRing(cx,cy);}
  function explode(o){o.dead=true;const R=78,dmg=55;blastSecrets(o.x,o.y,R);enemies.forEach(e=>{if(!e.dead&&inArea({x:o.x,y:o.y,rx:R,ry:R},e.x,e.y,e.x+e.w,e.y+e.h))hitEnemy(e,dmg,e.x+e.w/2<o.x?-1:1,true,clamp(o.x,e.x,e.x+e.w),clamp(o.y,e.y,e.y+e.h),e.x+e.w/2<o.x?Math.PI:0);});
    fx.push({k:'ring',x:o.x,y:o.y,life:.35,max:.35,r:R*1.3});fx.push({k:'star',x:o.x,y:o.y,a:0,life:.16,max:.16,r:46});for(let i=0;i<24;i++){const a=Math.random()*TAU,v=120+Math.random()*260;emit_particles(o.x,o.y,Math.cos(a)*v,Math.sin(a)*v-80,.3+Math.random()*.4,.7,i%2?'#ffb347':'#e2612c',2+Math.random()*3,.5,true,undefined,undefined,undefined);}
    dust(o.x,o.y,6,0);shake=Math.max(shake,7);hitstop=Math.max(hitstop,.05);beep(70,.35,'sawtooth');}
  function frostRing(x,y){enemies.forEach(e=>{if(!e.dead&&!(e.under>.5)&&Math.hypot(e.x+e.w/2-x,e.y+e.h/2-y)<190){e.frozen=e.type==='boss'?1.5:3;e.wind=0;e.spell=false;e.kb=0;if(e.type==='boss'){e.move='';e.act=0;e.vx=0;e.stun=false;if(e.lift){e.lift=0;e.y=e.floor-e.h;}}}});fx.push({k:'frost',x:x,y:y,life:.5,max:.5,r:190},{k:'icon',id:'frost',x:x,y:y-34,life:.8,max:.8});
    for(let i=0;i<26;i++){const a=Math.random()*TAU,v=60+Math.random()*170;emit_particles(x,y,Math.cos(a)*v,Math.sin(a)*v,.5+Math.random()*.5,1,'#d8f2ff',1.5+Math.random()*2,-.05,true,undefined,undefined,undefined);}beep(1320,.25,'sine');beep(1760,.35,'sine');}
  // ---- 角色：小引灯人（短刀）/ 钟锤学徒（钟锤，通关一次解锁）/ 拾灯弓手（弓，通关两次解锁）。每个角色三个技能，按 1 / 2 / 3，花 1 / 2 / 3 格魂火 ----
  const CHARS={
    lamp:{id:'lamp',name:'小引灯人',title:'敏捷 · 二段跳，攻击最弱，每三杀回一口火',info:'只有她能二段跳，刀是三人里最轻的。每打倒三个敌人，余火自己回来一口。',hp:5,dmg:14,atkCd:14/60,swing:14/60,power:.28,speedK:.9,skills:['shade','ring','bolt']},
    bell:{id:'bell',name:'钟锤学徒',title:'近战 · 三连，第三击击退，血厚步慢',info:'连砍三下，第三锤把敌人推开，并震出一道地波。生命多，开局多一瓶药，走得慢，没有二段跳。',hp:6,dmg:36,atkCd:14/60,swing:14/60,power:.86,speedK:.42,skills:['quake','dome','toll']},
    bow:{id:'bow',name:'拾灯弓手',title:'远程 · 蓄力穿透，血薄，护身铃护体',info:'按住攻击蓄力，蓄满自动射出穿透箭，松手可提前出箭。生命少，开局多一瓶药和三把飞刀，护身铃每层挡一次伤害。',hp:4,dmg:17,atkCd:14/60,swing:14/60,power:.46,speedK:.78,skills:['fan','trap','pierce']}};
  const SKILLS={
    shade:{name:'影步斩',cost:1,info:'化作影子向前冲斩一段，冲刺中不会受伤。'},
    ring:{name:'魂灯环',cost:2,info:'三团魂火绕身旋转 5 秒：烧伤碰到的敌人，挡下飞来的东西。'},
    bolt:{name:'魂火弹',cost:3,info:'射出一发穿透的魂火弹（魂火共鸣可以强化它）。'},
    quake:{name:'钟震',cost:1,info:'钟锤砸地，向左右各震出一道地波。'},
    dome:{name:'钟罩',cost:2,info:'铜钟罩住全身 2.5 秒：不会受伤，飞来的东西撞上就碎。'},
    toll:{name:'洪钟',cost:3,info:'敲响铜钟：钟声伤害并震晕身边所有敌人。'},
    fan:{name:'散射',cost:1,info:'一次射出五支扇形的箭。'},
    trap:{name:'灯雷',cost:2,info:'在脚下放一盏灯雷，敌人靠近就炸开。'},
    pierce:{name:'穿云箭',cost:3,info:'射出一支贯穿整个画面的巨箭。'}};
  const charOpen=id=>!!CHARS[id];
  function lastChar(){let c='lamp';try{c=localStorage.getItem('ember:char')||'lamp';}catch(e){}return charOpen(c)?c:'lamp';}
  function useSkill(i){if(state!=='play'||paused||!p)return;if(run.guided&&i>run.awakened)return;const id=CHARS[p.char].skills[i-1],S=SKILLS[id];if(id==='bolt'){castSoul();return;}if(p.castCd>0||p.roll>0||p.dash>0)return;if(p.soul<S.cost){say('魂火不够（还差 '+(S.cost-p.soul)+' 格）· 攻击命中敌人来积攒',1.4);beep(140,.08,'square');return;}
    if(!L.tutorial)p.soul-=S.cost;p.castCd=L.tutorial?0:.35;hudKey='';if(relics.echo){p.echoN=(p.echoN||0)+1;if(p.echoN%3===0){p.soul=Math.min(3,p.soul+S.cost);pop(p.x+13,p.y-14,'回音','#9ff3e0');beep(990,.2,'sine');}}const f=p.face,cx=p.x+p.w/2,cy=p.y+p.h/2,gy=p.y+p.h;
    if(id==='shade'){p.dash=.2;p.dashHit=new Set();p.inv=Math.max(p.inv,.3);p.attack=0;beep(300,.12,'sawtooth');beep(620,.1,'sine');}
    else if(id==='ring'){p.ringT=5;beep(520,.2,'sine');beep(780,.25,'sine');}
    else if(id==='quake'){[-1,1].forEach(d=>thrown.push({k:'pwave',x:cx+d*12,y:gy,vx:0,vy:0,dir:d,t:0,r:0,life:.95,hits:new Set(),dmg:20+p.damage*.7}));dust(cx,gy,14,0);shake=Math.max(shake,7);beep(70,.3,'square');}
    else if(id==='dome'){p.domeT=2.5;p.inv=Math.max(p.inv,2.5);beep(330,.5,'triangle');beep(495,.6,'sine');}
    else if(id==='toll'){fx.push({k:'ring',x:cx,y:cy,life:.6,max:.6,r:440},{k:'ring',x:cx,y:cy,life:.45,max:.45,r:300});bellRing=Math.max(bellRing,1.2);shake=Math.max(shake,9);beep(110,.9,'triangle');beep(220,.7,'sine');
      enemies.forEach(e=>{if(e.dead||Math.hypot(e.x+e.w/2-cx,e.y+e.h/2-cy)>420)return;hitEnemy(e,30+p.damage*.9,e.x+e.w/2<cx?-1:1,true,e.x+e.w/2,e.y+e.h/2,Math.atan2(e.y+e.h/2-cy,e.x+e.w/2-cx));if(!e.dead&&!(e.type==='boss'&&L.arena&&!flags.boss))e.daze=e.type==='boss'?.8:1.6;});}
    else if(id==='fan'){[-.32,-.16,0,.16,.32].forEach(a=>thrown.push({k:'arrow',x:cx+f*12,y:p.y+22,vx:Math.cos(a)*f*860,vy:Math.sin(a)*860,t:0,r:0,dmg:p.damage*.9}));beep(760,.08,'triangle');beep(900,.08,'triangle');}
    else if(id==='trap'){thrown.push({k:'mine',x:cx,y:gy-6,vx:0,vy:0,t:0,r:0,life:9});beep(420,.1,'square');}
    else if(id==='pierce'){thrown.push({k:'bigarrow',x:cx+f*16,y:p.y+22,vx:f*1150,vy:0,t:0,r:0,hits:new Set(),dmg:55+p.damage*1.6});shake=Math.max(shake,5);beep(180,.3,'sawtooth');beep(1200,.1,'triangle');}
    fx.push({k:'ring',x:cx,y:cy,life:.25,max:.25,r:34});}
  // 弓手的普通攻击是射箭（按着上就往上射），第三支是重箭
  function shootArrow(){const f=p.atkFace,cx=p.x+p.w/2,up=p.slash==='up',heavy=p.combo===0&&!up;thrown.push({k:'arrow',x:cx+(up?f*4:f*14),y:up?p.y+2:p.y+22,vx:up?0:f*900,vy:up?-900:0,t:0,r:0,dmg:Math.round(p.damage*(heavy?(relics.tassel?1.89:1.35):1)*(relics.hunter&&p.hp/p.max>.7?1.3:1)),soul:true,heavy:heavy});beep(heavy?520:720,.07,'triangle');}
  // 盾卫正面挡下横斩和飞来的东西
  function blocks(e,dir,vy){return e.type==='shield'&&!e.dead&&e.wind<=0&&e.swing<=0&&!(e.brk>0)&&!(e.frozen>0||e.daze>0)&&e.face===-dir&&Math.abs(vy||0)<300;}
  function clang(x,y){for(let i=0;i<8;i++){const a=Math.random()*TAU,v=120+Math.random()*200;emit_particles(x,y,Math.cos(a)*v,Math.sin(a)*v-60,.2+Math.random()*.2,.4,'#fff1c2',1.4,.6,undefined,true,undefined,undefined);}fx.push({k:'star',x:x,y:y,a:Math.random()*TAU,life:.12,max:.12,r:20});beep(1500,.06,'square',.025);beep(900,.08,'triangle',.02);}
  function mineBoom(o){o.dead=true;const R=92;blastSecrets(o.x,o.y-10,R);enemies.forEach(e=>{if(!e.dead&&inArea({x:o.x,y:o.y-10,rx:R,ry:R*.8},e.x,e.y,e.x+e.w,e.y+e.h))hitEnemy(e,40+p.damage*.8,e.x+e.w/2<o.x?-1:1,true,clamp(o.x,e.x,e.x+e.w),clamp(o.y,e.y,e.y+e.h));});fx.push({k:'ring',x:o.x,y:o.y-10,life:.4,max:.4,r:R*1.2});for(let i=0;i<22;i++){const a=Math.random()*TAU,v=100+Math.random()*240;emit_particles(o.x,o.y-8,Math.cos(a)*v,Math.sin(a)*v-90,.3+Math.random()*.4,.7,i%2?'#ffd27a':'#8be1ce',2+Math.random()*2.5,.5,true,undefined,undefined,undefined);}shake=Math.max(shake,6);beep(90,.3,'sawtooth');}
  // 主角的新飞行物：箭（扎中第一个敌人，射中也积攒魂火）、巨箭（穿透）、地波（沿地面走）、灯雷（敌人靠近就炸）
  function updatePlayerShot(o,dt){
    if(o.k==='mine'){o.life-=dt;if(o.t>.45&&(o.life<=0||enemies.some(e=>!e.dead&&Math.abs(e.x+e.w/2-o.x)<52&&Math.abs(e.y+e.h-o.y)<70)))mineBoom(o);return true;}
    if(o.k==='pwave'){o.x+=o.dir*430*dt;o.life-=dt;if(Math.random()<dt*30)dust(o.x,o.y,1,o.dir);enemies.forEach(e=>{if(e.dead||o.hits.has(e))return;if(o.x>e.x-14&&o.x<e.x+e.w+14&&e.y+e.h>o.y-50&&e.y<o.y+4){o.hits.add(e);hitEnemy(e,o.dmg,o.dir,true,clamp(o.x,e.x,e.x+e.w),e.y+e.h-10,o.dir>0?0:Math.PI);}});if(o.life<=0||o.x<0||o.x>WORLD)o.dead=true;return true;}
    if(o.k==='bigarrow'){enemies.forEach(e=>{if(e.dead||o.hits.has(e))return;if(o.x>e.x-20&&o.x<e.x+e.w+20&&o.y>e.y-14&&o.y<e.y+e.h+14){o.hits.add(e);hitEnemy(e,o.dmg,o.vx>0?1:-1,true,clamp(o.x,e.x,e.x+e.w),o.y,o.vx>0?0:Math.PI);}});if(o.t>1.2||o.x<0||o.x>WORLD)o.dead=true;return true;}
    if(o.k==='arrow'){const e=enemies.find(q=>!q.dead&&(!o.hits||!o.hits.has(q))&&o.x>q.x-8&&o.x<q.x+q.w+8&&o.y>q.y-8&&o.y<q.y+q.h+8);if(e){if(blocks(e,o.vx>0?1:-1,o.vy)){if(!o.pierce)o.dead=true;clang(o.x,o.y);return true;}const off=e.type==='boss'&&((L.arena&&!flags.boss)||e.under>.5||e.phaseInv>0);hitEnemy(e,o.dmg,o.vx?(o.vx>0?1:-1):0,!!o.heavy,clamp(o.x,e.x,e.x+e.w),o.y,Math.atan2(o.vy,o.vx));if(o.soul&&!off){p.soul=Math.min(3,p.soul+1);hudKey='';}if(o.pierce){(o.hits=o.hits||new Set()).add(e);if(o.hits.size>=o.pierce)o.dead=true;}else o.dead=true;return true;}
      breakables.forEach(b=>{if(!o.dead&&!b.broken&&o.x>b.x-13&&o.x<b.x+13&&o.y>b.y-31&&o.y<b.y){o.dead=true;breakCache(b);}});secrets.forEach((sc,i)=>{if(!o.dead&&!sc.open&&o.x>sc.x-30&&o.x<sc.x+30&&o.y>sc.y-84&&o.y<sc.y){o.dead=true;hitSecret(sc,i);}});if(o.t>.75||o.x<0||o.x>WORLD||o.y<0)o.dead=true;return true;}
    return false;}
  // 火油罐：抛物线，碰到敌人或落地就炸；飞刀：直线，扎中第一个敌人
  function updateThrown(dt){thrown.forEach(o=>{o.t+=dt;const py=o.y;o.x+=o.vx*dt;o.y+=o.vy*dt;o.r+=dt*(o.k==='bomb'?9:0);if(updatePlayerShot(o,dt))return;
      if(o.k==='bomb'){o.vy+=900*dt;const hit=enemies.some(e=>!e.dead&&o.x>e.x-4&&o.x<e.x+e.w+4&&o.y>e.y&&o.y<e.y+e.h),land=platforms.some(a=>o.x>a.x&&o.x<a.x+a.w&&py<=a.y&&o.y>=a.y);if(land)o.y=Math.min(o.y,platforms.find(a=>o.x>a.x&&o.x<a.x+a.w&&py<=a.y&&o.y>=a.y).y);if(hit||land||o.t>1.8)explode(o);}
      else{const e=enemies.find(q=>!q.dead&&(!o.hits||!o.hits.has(q))&&o.x>q.x-12&&o.x<q.x+q.w+12&&o.y>q.y-8&&o.y<q.y+q.h+8);if(e){if(o.k==='soul'){fx.push({k:'star',x:o.x,y:o.y,a:0,r:27,life:.16,max:.16});o.hits.add(e);o.pierce--;if(o.pierce<=0)o.dead=true;hitEnemy(e,40+p.skills.flame*18,o.vx>0?1:-1,true,clamp(o.x,e.x,e.x+e.w),o.y,o.vx>0?0:Math.PI);}else if(blocks(e,o.vx>0?1:-1,0)){o.dead=true;clang(o.x,o.y);}else{o.dead=true;hitEnemy(e,30,o.vx>0?1:-1,false,clamp(o.x,e.x,e.x+e.w),o.y,o.vx>0?0:Math.PI);}}if(o.t>(o.k==='soul'?1.1:.9)||o.x<0||o.x>WORLD)o.dead=true;}});thrown=thrown.filter(o=>!o.dead);}
  // ---- v5.0 收集与获取：获得提示排队、魂灯碎片（三片 +1 生命上限）、图纸（永久解锁新护符）、暗格、制图人墨翁 ----
  const toastQ=[];
  function toastNow(q){gainArt.src=artURL(q.art);gainName.textContent=q.name;gainInfo.textContent=q.info||'';gainBox.hidden=false;gainT=2.8;gainBox.classList.remove('pop');try{void gainBox.offsetWidth;}catch(e){}gainBox.classList.add('pop');}
  function toast(art,name,info){const q={art:art,name:name,info:info};if(gainT>.6)toastQ.push(q);else toastNow(q);}
  function gainShard(x,y){p.shards=(p.shards||0)+1;note('items','shard');loot.push({id:'shard',x:x,y:y,vx:0,vy:-260,t:0});
    if(p.shards%3===0){p.max+=LIFE;p.hp=p.max;fx.push({k:'ring',x:p.x+13,y:p.y+26,life:.6,max:.6,r:90});beep(660,.3,'sine');beep(990,.5,'sine');toast('shard','魂灯碎片 · 3 / 3','三片拼成一盏小灯：生命上限 +1 个小幽灵，并回满');}
    else{beep(880,.2,'sine');toast('shard','魂灯碎片 · '+(p.shards%3)+' / 3','集齐三片，生命上限 +1 个小幽灵');}hudKey='';}
  function gainBlueprint(x,y){const id=BLUEPRINTS.find(b=>!codex.blue[b]);if(!id){const n=Math.round(30*L.hpK);embers+=n;popArt('ember','+'+n,x,y-10);hudKey='';return;}
    codex.blue[id]=1;note('items','blueprint');saveCodex();loot.push({id:'blueprint',x:x,y:y,vx:0,vy:-260,t:0});beep(740,.2,'triangle');beep(1110,.3,'sine');toast('blueprint','图纸 · '+ITEMS[id].name,ITEMS[id].info+' 以后会出现在烛叟的货摊和宝箱里。');}
  // 精英第一次必掉一张图纸，之后精英 35%、持盾狱卒 / 骨巫 / 投弹手 12%
  function maybeBlueprint(e){if(!BLUEPRINTS.some(b=>!codex.blue[b]))return;const ch=e.elite?(run.firstElite?.35:1):.12;if(e.elite)run.firstElite=true;if(Math.random()<ch)gainBlueprint(e.x+e.w/2,e.y);}
  // 暗格：墙上有一道细细的裂纹，附近会往下掉灰。砍三下（或者用火油罐、灯雷炸）就塌，里面的东西飞进怀里；这一局里不会再长回来
  function hitSecret(s,i){if(s.open)return;s.hp--;s.shake=.25;dust(s.x,s.y,4,0);for(let k=0;k<5;k++)emit_particles(s.x+(Math.random()-.5)*40,s.y-20-Math.random()*50,(Math.random()-.5)*90,-40-Math.random()*60,.5,.5,'#8a8070',2+Math.random()*2,1,undefined,undefined,undefined,undefined);beep(150+s.hp*40,.12,'square',.03);if(s.hp<=0)openSecret(s,i);}
  function openSecret(s,i){if(s.open)return;s.open=true;s.t=0;run.found=run.found||{};run.found['s'+stage+':'+i]=true;shake=Math.max(shake,6);burst(s.x,s.y-40,'#d8c8a8',20);
    for(let k=0;k<10;k++)chunks.push({x:s.x+(Math.random()-.5)*50,y:s.y-20-Math.random()*60,vx:(Math.random()-.5)*220,vy:-80-Math.random()*200,r:Math.random()*TAU,vr:(Math.random()-.5)*12,s:4+Math.random()*6,c:k%2?T.wall[0]:T.stone[2],life:1.4,floor:s.y,x0:s.x-300,x1:s.x+300});
    beep(90,.4,'sawtooth',.04);beep(880,.3,'sine',.03);beep(1320,.4,'sine',.025);say('墙后面是空的——暗格！',1.8);giveSecret(s);}
  function giveSecret(s){const r=s.reward,x=s.x,y=s.y-40;
    if(r==='shard')gainShard(x,y);else if(r==='blue')gainBlueprint(x,y);
    else if(r==='relic'){const free=relicPool().filter(id=>!relics[id]);if(free.length){const id=free[Math.floor(Math.random()*free.length)];gain(id);loot.push({id:id,x:x,y:y,vx:0,vy:-260,t:0});}else{gain('bomb',2);loot.push({id:'bomb',x:x,y:y,vx:0,vy:-260,t:0});}}
    else{const n=Math.round(40*L.hpK);embers+=n;popArt('ember','+'+n,x,y-10);for(let k=0;k<10;k++)orbs.push({x:x,y:y,vx:(Math.random()-.5)*260,vy:-80-Math.random()*200,t:0});}hudKey='';}
  function blastSecrets(x,y,R){secrets.forEach((s,i)=>{if(!s.open&&Math.abs(s.x-x)<R+30&&y>s.y-84-R&&y<s.y+R)openSecret(s,i);});}
  // 制图人墨翁：坐在一摞纸卷上哼着曲子，听见哼声就知道他在附近。买下这一层的地图（价格跟着层数涨）
  const INK_TALK={intro:[['墨翁','嗯——哼——嗯……哦？一盏会走路的灯。'],['墨翁','老朽墨翁，替迷路的魂画地图。地牢里的路会骗人，{g:画在纸上的就不会}。']],
    sold:{prison:[['墨翁','监牢的地图。暗处的墙多敲两下——{g:有些墙后面是空的}。']],sewers:[['墨翁','水下的路画不出来，可木筏往哪儿漂，我都替你画上了。']],ramparts:[['墨翁','城墙上风大，纸差点被吹跑……{w:会塌的桥}，我用虚线画着。']],ossuary:[['墨翁','黑暗里我看不清，只好摸着骨头一点点画。{g:灵灯}的位置都标好了。']],tower:[['墨翁','钟楼的齿轮一直在转，这是我画过最难的一张。替我听听那口钟，好吗？']]}};
  const nearInk=()=>!!(L.ink!=null&&Math.abs(p.x+p.w/2-L.ink)<80&&p.y+p.h>FLOOR-60);
  const inkPrice=()=>Math.max(20,Math.round(20*L.hpK/5)*5);
  const hasMap=()=>!!(L.rest||L.arena||L.tutorial||(run.maps&&run.maps['s'+stage]));
  function talkInk(){const price=inkPrice(),th=L.theme;if(hasMap()){startTalk([['墨翁','地图已经在你手上了。'+(coarse()?'点右上角的地图':'按 '+K('map'))+' 看看，走过的地方会画得更清楚。']]);return;}
    const lines=run.inkMet?[]:INK_TALK.intro.slice();run.inkMet=true;
    if(embers<price){lines.push(['墨翁','这一卷要 {g:'+price+' 余烬}。你还差 '+(price-embers)+'。'],['墨翁','不急。我在这儿哼着曲子等你。']);startTalk(lines);return;}
    lines.push(['墨翁','这一卷，{g:'+price+' 余烬}。拿好——别走冤枉路。']);
    startTalk(lines,()=>{if(hasMap()||embers<price)return;embers-=price;run.maps=run.maps||{};run.maps['s'+stage]=true;note('items','map');loot.push({id:'map',x:L.ink,y:FLOOR-50,vx:40,vy:-240,t:0});beep(620,.15,'sine');beep(930,.25,'sine');hudKey='';
      toast('map','墨翁的地图 · '+L.name,(coarse()?'点右上「地图」':'按 '+K('map'))+' 打开：整层的地形、宝箱和出口都画好了');startTalk(INK_TALK.sold[th]||[['墨翁','拿好。']]);});}
  // ---- 地图（参考空洞骑士）：走过的地方自己会画上；有了墨翁的地图，整层都画出来（没走过的地方颜色淡一些）----
  let mapTab='world',mmCanvas=null,inkHum=0,inkStep=0,frameN=0,deathT=9,deathX=0,deathY=0;
  function markSeen(){if(L.tutorial)return;const key='s'+stage,n=Math.ceil(L.w/100);if(!run.seen)run.seen={};let m=run.seen[key];if(!m||m.length!==n){m=run.seen[key]=[];for(let i=0;i<n;i++)m.push(0);}const a=Math.max(0,Math.floor((cam-80)/100)),b=Math.min(n-1,Math.floor((cam+W+80)/100));for(let i=a;i<=b;i++)m[i]=1;if(!run.visited)run.visited={};run.visited[stage]=1;}
  // 0 = 没见过也没地图，1 = 地图上有但没走过，2 = 走过
  function mapLevel(x){if(L.rest||L.arena||L.tutorial)return 2;const m=run.seen&&run.seen['s'+stage];if(m&&m[clamp(Math.floor(x/100),0,m.length-1)])return 2;return hasMap()?1:0;}
  function exploredPct(){const m=run.seen&&run.seen['s'+stage];return m&&m.length?Math.round(m.reduce((a,b)=>a+b,0)/m.length*100):0;}
  function openMap(tab){if(state!=='play'||paused)return;mapTab=tab||'area';state='map';keys={};clearHeld();renderMap();beep(380,.08,'sine');}
  function closeMap(){if(state!=='map')return;state='play';panel.hidden=true;keys={};clearHeld();hudKey='';}
  function renderMap(){const has=hasMap(),ch=chests.length,chOpen=chests.filter(c=>c.open).length,sec=secrets.length,secOpen=secrets.filter(s=>s.open).length,mapped=!L.rest&&!L.arena&&!L.tutorial;
    const info=mapTab==='area'?(mapped?'已探索 '+exploredPct()+'%'+' · ':'')+'宝箱 '+chOpen+' / '+ch+(sec?' · 暗格 '+secOpen+' / '+sec:'')+' · 魂灯碎片 '+((p.shards||0)%3)+' / 3'+(L.ink!=null?(has?' · 墨翁的地图 ✓':' · 还没有这一层的地图：听着哼曲声去找墨翁'):''):'墨迹标出已探索的路段，白色灯标是你的位置';
    panel.innerHTML='<div class="sheet wide mapview"><div class="tabs"><button data-mtab="area"'+(mapTab==='area'?' class="on"':'')+'>这一层</button><button data-mtab="world"'+(mapTab==='world'?' class="on"':'')+'>沉钟地宫</button></div><div class="map-head"><b>'+(mapTab==='area'?(L.rest?L.name:L.n+' · '+L.name):'沉钟地宫')+'</b><small>'+info+'</small></div><canvas id="map-canvas"></canvas><button class="secondary" id="map-close">合上地图</button><p class="footnote">'+(coarse()?'':K('map')+' / Esc 合上 · ← → 切换')+'</p></div>';
    panel.hidden=false;panel.querySelectorAll('[data-mtab]').forEach(b=>b.onclick=()=>{mapTab=b.dataset.mtab;renderMap();});document.getElementById('map-close').onclick=closeMap;paintMap();}
  function paintMap(){const cv=document.getElementById('map-canvas');if(!cv||!cv.getContext)return;const cw=Math.max(1,cv.clientWidth||860),chh=Math.round(clamp(cw*.41,218,Math.max(218,Math.min(410,(innerHeight||620)*.52)))),d=Math.min(devicePixelRatio||1,2);cv.width=Math.round(cw*d);cv.height=Math.round(chh*d);if(cv.style)cv.style.height=chh+'px';
    const keep=ctx;try{ctx=cv.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.lineCap='round';ctx.lineJoin='round';if(mapTab==='area')drawAreaMap(cw,chh);else drawWorldMap(cw,chh);}catch(e){}ctx=keep;}
  // 羊皮纸：渐变底色、墨点、四角发暗、双线边框
  function parchment(cw,ch){const g=ctx.createLinearGradient(0,0,0,ch);g.addColorStop(0,'#eadbb4');g.addColorStop(1,'#cbb282');ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch);const r=rng(97);ctx.fillStyle='rgba(90,64,30,.09)';for(let i=0;i<260;i++)ctx.fillRect(r()*cw,r()*ch,1+r()*2,1+r()*2);
    const v=ctx.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*.3,cw/2,ch/2,Math.max(cw,ch)*.72);v.addColorStop(0,'rgba(60,40,20,0)');v.addColorStop(1,'rgba(80,59,33,.17)');ctx.fillStyle=v;ctx.fillRect(0,0,cw,ch);ctx.strokeStyle='rgba(60,42,22,.65)';ctx.lineWidth=1.5;ctx.strokeRect(6.5,6.5,cw-13,ch-13);ctx.strokeStyle='rgba(60,42,22,.3)';ctx.strokeRect(10.5,10.5,cw-21,ch-21);}
  const INK='#2c2116';
  // 地图上的小图标（墨线画）
  function glyph(k,x,y,a){ctx.save();ctx.globalAlpha*=a==null?1:a;ctx.translate(x,y);ctx.strokeStyle=INK;ctx.fillStyle=INK;ctx.lineWidth=1.4;ctx.lineCap='round';ctx.lineJoin='round';
    if(k==='exit'){ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(-5,-8);ctx.arc(0,-8,5,Math.PI,0);ctx.lineTo(5,0);ctx.stroke();ctx.beginPath();ctx.moveTo(-1,-5);ctx.lineTo(2,-3);ctx.lineTo(-1,-1);ctx.stroke();}
    else if(k==='chest'||k==='chestOpen'){if(k==='chest'){ctx.fillStyle='#a86a2c';ctx.fillRect(-5,-7,10,7);}ctx.strokeRect(-5,-7,10,7);ctx.beginPath();ctx.moveTo(-5,-4.5);ctx.lineTo(5,-4.5);ctx.stroke();}
    else if(k==='lore'){ctx.beginPath();ctx.moveTo(-5,1);ctx.quadraticCurveTo(0,-4,5,-10);ctx.quadraticCurveTo(1,-3,-5,1);ctx.fill();}
    else if(k==='npc'){ctx.beginPath();ctx.moveTo(-4,0);ctx.lineTo(-4,-6);ctx.arc(0,-6,4,Math.PI,0);ctx.lineTo(4,0);ctx.closePath();ctx.stroke();ctx.fillRect(-2,-7,1.2,1.6);ctx.fillRect(1,-7,1.2,1.6);}
    else if(k==='ink'){ctx.strokeRect(-6,-6,9,6);ctx.beginPath();ctx.moveTo(1,-1);ctx.lineTo(7,-11);ctx.stroke();}
    else if(k==='fire'){ctx.fillStyle='#b8501c';ctx.beginPath();ctx.moveTo(0,-10);ctx.quadraticCurveTo(5,-4,3,0);ctx.lineTo(-3,0);ctx.quadraticCurveTo(-5,-4,0,-10);ctx.fill();}
    else if(k==='shop'){ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(-4,-7);ctx.lineTo(4,-7);ctx.lineTo(5,0);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.arc(0,-7,2.5,Math.PI,0);ctx.stroke();}
    else if(k==='boss'){ctx.beginPath();ctx.moveTo(-6,0);ctx.lineTo(-6,-6);ctx.lineTo(-3,-3);ctx.lineTo(0,-9);ctx.lineTo(3,-3);ctx.lineTo(6,-6);ctx.lineTo(6,0);ctx.closePath();ctx.fillStyle='#7a2f2f';ctx.fill();ctx.stroke();}
    else if(k==='lamp'||k==='lampOff'){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-6);ctx.stroke();ctx.beginPath();ctx.arc(0,-8,2.6,0,TAU);if(k==='lamp'){ctx.fillStyle='#7a4ab0';ctx.fill();}ctx.stroke();}
    else if(k==='secret'){ctx.font='bold 11px serif';ctx.textAlign='center';ctx.fillText('?',0,0);}
    else if(k==='found'){ctx.beginPath();for(let i=0;i<8;i++){const r=i%2?2:5.5,t=i*Math.PI/4-Math.PI/2;ctx.lineTo(Math.cos(t)*r,Math.sin(t)*r-5);}ctx.closePath();ctx.fillStyle='#c08a2a';ctx.fill();ctx.stroke();}
    else if(k==='you'){const k2=.5+.5*Math.sin(time*5);ctx.strokeStyle='rgba(40,110,120,'+(.8-k2*.6)+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-6,6+k2*6,0,TAU);ctx.stroke();ctx.fillStyle='#f6fbff';ctx.strokeStyle=INK;ctx.beginPath();ctx.moveTo(-4.5,0);ctx.lineTo(-4.5,-7);ctx.arc(0,-7,4.5,Math.PI,0);ctx.lineTo(4.5,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#2fa39b';ctx.fillRect(-4.5,-4.5,9,1.6);}
    ctx.restore();}
  // 地图的标题框和罗盘：像一张真正的手绘地图
  function mapCartouche(cw,title,sub){ctx.save();ctx.font='bold 18px "Songti SC","STSong","Noto Serif SC","SimSun",serif';const w=ctx.measureText(title).width+56;ctx.fillStyle='rgba(236,222,186,.9)';ctx.strokeStyle='rgba(60,42,22,.7)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(22,16);ctx.lineTo(22+w,16);ctx.quadraticCurveTo(30+w,30,22+w,44);ctx.lineTo(22,44);ctx.quadraticCurveTo(30,30,22,16);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=INK;ctx.textAlign='left';ctx.fillText(title,48,37);if(sub&&cw>480){ctx.font='12px "Kaiti SC","STKaiti","KaiTi","Songti SC",serif';ctx.fillStyle='rgba(44,33,22,.7)';ctx.fillText(sub,w+40,36);}
    const cx=cw-46,cy=34;ctx.strokeStyle='rgba(44,33,22,.7)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,16,0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,11,0,TAU);ctx.stroke();ctx.fillStyle=INK;[[0,-1],[1,0],[0,1],[-1,0]].forEach((d,i)=>{ctx.beginPath();ctx.moveTo(cx+d[0]*20,cy+d[1]*20);ctx.lineTo(cx+d[1]*4,cy-d[0]*4);ctx.lineTo(cx-d[1]*4,cy+d[0]*4);ctx.closePath();ctx.globalAlpha=i===1?1:.55;ctx.fill();});ctx.globalAlpha=1;ctx.font='bold 10px serif';ctx.textAlign='center';ctx.fillText('东',cx+28,cy+4);ctx.restore();}
  function drawAreaMap(cw,ch){
    parchment(cw,ch);
    const pad=24,head=56,legH=cw<520?58:36;
    const cells=(run.seen&&run.seen['s'+stage])||[];
    let left=0,right=L.w;
    if(!hasMap()&&L.ink!=null&&!relics.guide){
      // Keep previously explored ground on the sheet while making the first stretch legible.
      let first=p.x,last=p.x;
      cells.forEach((seen,i)=>{if(seen){first=Math.min(first,i*100);last=Math.max(last,(i+1)*100);}});
      const span=Math.min(L.w,Math.max(1500,last-first+550));
      left=clamp(first-220,0,L.w-span);right=left+span;
    }
    const sx=(cw-pad*2)/(right-left),avail=ch-head-legH,sy=Math.min(avail/(FLOOR+30-150),sx*3.4);
    const strip=(FLOOR+30-150)*sy,top=head+(avail-strip)/2,bot=top+strip;
    const X=x=>pad+(x-left)*sx,Y=y=>top+(Math.max(150,y)-150)*sy,lv=x=>mapLevel(x),al=v=>v===2?1:.42,guide=!!relics.guide;
    mapCartouche(cw,left>0||right<L.w?'已探索路段':'全层路线',hasMap()?(L.ink!=null?'墨翁 绘':''):'沿途手记');
    ctx.save();ctx.beginPath();ctx.rect(pad-10,head-8,cw-2*pad+20,ch-head-legH+16);ctx.clip();
    // 地面：每 100 一列，走过的列墨色深，地图上有但没走过的淡
    const segs=platforms.filter(a=>a.h>100&&!a.solid);for(let i=0;i*100<L.w;i++){const v=lv(i*100+50);if(!v)continue;const x0=i*100,x1=Math.min(L.w,x0+100);ctx.globalAlpha=al(v);
      segs.forEach(a=>{const s0=Math.max(a.x,x0),s1=Math.min(a.x+a.w,x1);if(s1>s0){ctx.fillStyle='rgba(60,42,22,.13)';ctx.fillRect(X(s0),Y(FLOOR),(s1-s0)*sx,bot-Y(FLOOR)+10);line([X(s0),Y(FLOOR),X(s1),Y(FLOOR)],2.6,INK);}});
      L.gaps.forEach(g=>{const s0=Math.max(g[0],x0),s1=Math.min(g[1],x1);if(s1>s0&&g[2]==='acid'){ctx.strokeStyle='rgba(50,110,40,.85)';ctx.lineWidth=1.4;ctx.beginPath();for(let x=s0;x<=s1;x+=6)ctx.lineTo(X(x),Y(FLOOR)+5+Math.sin(x*.08)*1.5);ctx.stroke();}});
      L.acid.forEach(q=>{const s0=Math.max(q[0],x0),s1=Math.min(q[0]+q[1],x1);if(s1>s0){ctx.strokeStyle='rgba(50,110,40,.9)';ctx.lineWidth=2;ctx.beginPath();for(let x=s0;x<=s1;x+=5)ctx.lineTo(X(x),Y(FLOOR)-2+Math.sin(x*.1)*1.2);ctx.stroke();}});
      L.spikes.forEach(q=>{const s0=Math.max(q[0],x0),s1=Math.min(q[0]+q[1]*20,x1);if(s1>s0){ctx.strokeStyle=INK;ctx.lineWidth=1;ctx.beginPath();for(let x=s0;x<s1;x+=8){ctx.lineTo(X(x),Y(FLOOR));ctx.lineTo(X(x+4),Y(FLOOR)-4);}ctx.stroke();}});}
    ctx.globalAlpha=1;
    for(const a of platforms){if(a.h>100&&!a.solid)continue;const v=lv(a.x+a.w/2);if(!v)continue;ctx.globalAlpha=al(v);
      if(a.solid){ctx.fillStyle='rgba(44,33,22,.78)';ctx.fillRect(X(a.x),Y(a.y),a.w*sx,Y(FLOOR)-Y(a.y));}
      else if(a.mv){const m=a.mv;ctx.setLineDash([3,3]);ctx.strokeStyle='rgba(44,33,22,.7)';ctx.lineWidth=1;ctx.strokeRect(X(Math.min(m.x0,m.x0+m.dx)),Y(Math.min(m.y0,m.y0+m.dy))-1,(Math.abs(m.dx)+a.w)*sx,Math.abs(m.dy)*sy+2);ctx.setLineDash([]);line([X(a.x),Y(a.y),X(a.x+a.w),Y(a.y)],2.2,INK);}
      else if(a.cr){ctx.setLineDash([2,3]);line([X(a.x),Y(a.cr.y0),X(a.x+a.w),Y(a.cr.y0)],2,INK);ctx.setLineDash([]);}
      else line([X(a.x),Y(a.y),X(a.x+a.w),Y(a.y)],1.8,INK);}
    ctx.globalAlpha=1;
    // 机关画成小记号
    for(const t of traps){const x=t.x0!=null?(t.x0+t.x1)/2:t.x,v=lv(x);if(!v)continue;ctx.globalAlpha=al(v)*.85;ctx.strokeStyle=INK;ctx.lineWidth=1.1;
      if(t.k==='pendulum'){const by=Y(t.top+t.len);ctx.beginPath();ctx.moveTo(X(t.x),by-14);ctx.lineTo(X(t.x),by-5);ctx.stroke();ctx.beginPath();ctx.arc(X(t.x),by-14,6,.35*Math.PI,.65*Math.PI);ctx.stroke();ctx.beginPath();ctx.arc(X(t.x),by-3,4,0,Math.PI);ctx.stroke();}
      else if(t.k==='spout'||t.k==='vent'){ctx.strokeStyle=t.k==='spout'?(t.fire?'#a0441c':'#3f7a2a'):INK;ctx.beginPath();ctx.moveTo(X(t.x),Y(FLOOR)-1);ctx.lineTo(X(t.x),Y(FLOOR)-14);ctx.moveTo(X(t.x)-3,Y(FLOOR)-10);ctx.lineTo(X(t.x),Y(FLOOR)-14);ctx.lineTo(X(t.x)+3,Y(FLOOR)-10);ctx.stroke();}
      else if(t.k==='wind'){for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(X(t.x0+(t.x1-t.x0)*(.2+i*.25)),Y(300+i*30));ctx.quadraticCurveTo(X(t.x0+(t.x1-t.x0)*(.3+i*.25)),Y(290+i*30),X(t.x0+(t.x1-t.x0)*(.38+i*.25)),Y(300+i*30));ctx.stroke();}}
      else if(t.k==='tspike'){ctx.beginPath();for(let x2=t.x;x2<t.x+t.n*20;x2+=10){ctx.lineTo(X(x2),Y(FLOOR));ctx.lineTo(X(x2+5),Y(FLOOR)-5);}ctx.stroke();}
      else if(t.k==='piston'){ctx.strokeRect(X(t.x),Y(250),(t.w||80)*sx,8);}
      else if(t.k==='ballista'||t.k==='jet'){ctx.beginPath();ctx.moveTo(X(t.x),Y(t.y)-6);ctx.lineTo(X(t.x)+t.dir*10,Y(t.y)-6);ctx.stroke();}}
    ctx.globalAlpha=1;
    // 要紧的地方：出口、宝箱、遗物、守钟人、墨翁、篝火和烛叟、首领、灵灯、暗格
    const pin=(k,x,y,force)=>{const v=force?Math.max(lv(x),1):lv(x);if(v)glyph(k,X(x),Y(y),al(v));};
    if(L.exit)pin('exit',L.exit,FLOOR);if(L.seal)pin('exit',L.seal+44,FLOOR);
    chests.forEach(c=>pin(c.open?'chestOpen':'chest',c.x,c.y,guide));
    if(L.lore&&!flags.lore)pin('lore',L.lore.x,FLOOR);if(L.npc!=null)pin('npc',L.npc,FLOOR);if(L.ink!=null)pin('ink',L.ink,FLOOR);
    if(L.rest){pin('fire',L.fire,FLOOR);pin('shop',L.shop,FLOOR);}if(L.wicks){L.wicks.forEach((wick,i)=>{if(!wick.door)pin(i<run.litWicks?'fire':'lampOff',wick.x,wick.y);});}else if(L.checkpoint!=null)pin('fire',L.checkpoint,FLOOR);
    enemies.forEach(e=>{if(e.type==='boss'&&!e.dead)pin('boss',e.origin+e.w/2,FLOOR);});
    secrets.forEach(s=>{if(s.open)pin('found',s.x,s.y);else if(guide)glyph('secret',X(s.x),Y(s.y)-4,.7);});
    glyph('you',X(p.x+p.w/2),Y(p.y+p.h));
    ctx.restore();
    const legend=[['you','你'],['exit','出口'],['chest','宝箱'],['lore','遗物'],['found','暗格'],['ink','制图人'],['fire','钟火']];
    ctx.font='12px "Microsoft YaHei",sans-serif';ctx.textAlign='left';ctx.fillStyle=INK;
    let lx=pad,ly=ch-legH+17;
    for(const [kind,label] of legend){
      const width=26+ctx.measureText(label).width;
      if(lx+width>cw-pad){lx=pad;ly+=18;}
      glyph(kind,lx+6,ly);ctx.fillText(label,lx+16,ly);lx+=width;
    }
  }
  // 五关分行绘制，淡线标路线，深色墨迹保留已经走过的路段。
  function drawWorldMap(cw,ch){
    parchment(cw,ch);
    const left=cw<480?96:132,right=cw-26,row=(ch-64)/mainLevels.length;
    for(const [index,level] of mainLevels.entries()){
      const rooms=STAGES.filter(s=>s.levelNo===level.levelNo),width=right-left;
      const total=rooms.reduce((sum,s)=>sum+s.w,0),y=20+(index+.5)*row;
      const current=L.levelNo===level.levelNo&&!L.tutorial;
      if(current){ctx.fillStyle='rgba(64,115,108,.12)';ctx.fillRect(15,y-row*.43,cw-30,row*.86);}
      ctx.fillStyle=current?'#235952':INK;ctx.textAlign='left';ctx.font=(current?'bold ':'')+'13px "Microsoft YaHei",sans-serif';
      ctx.fillText(level.name,24,y+4,left-36);
      ctx.strokeStyle='rgba(71,54,35,.25)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
      let x=left;
      for(const room of rooms){
        const i=STAGES.indexOf(room),w=width*room.w/total,visited=i===stage||!!(run.visited&&run.visited[i]);
        const cells=(run.seen&&run.seen['s'+i])||[],count=Math.ceil(room.w/100);
        ctx.fillStyle=room.arena?'#a46b53':room.rest?'#74855b':'#527e79';
        if(visited){
          for(let j=0;j<count;j++)if(cells[j]||(i===stage&&Math.abs(j*100-p.x)<120))ctx.fillRect(x+w*j/count,y-2,w/count+.5,4);
        }
        if(room.rest||room.arena)glyph(room.rest?'fire':'boss',x+w/2,y-2,visited?1:.4);
        if(i===stage)glyph('you',x+w*clamp((p.x+p.w/2)/room.w,0,1),y+7);
        x+=w;
      }
    }
    ctx.font='12px "Microsoft YaHei",sans-serif';ctx.textAlign='left';ctx.fillStyle=INK;
    for(const [i,kind,label] of [[0,'you','你'],[1,'boss','首领房'],[2,'fire','驿站']]){
      const x=30+i*75;glyph(kind,x,ch-19);ctx.fillText(label,x+12,ch-18);
    }
  }
  // 小地图（参考死亡细胞）：右上角一条，显示身边 ±800 的地形、出口、宝箱和敌人
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
  function drawMinimap(){const cv=mmCanvas||(mmCanvas=document.getElementById('minimap'));if(!cv||!cv.getContext)return;const on=settings.minimap!==false&&state==='play'&&!L.tutorial;if(cv.hidden!==!on)cv.hidden=!on;if(!on)return;
    const d=Math.min(devicePixelRatio||1,2),cw=cv.clientWidth||200,chh=cv.clientHeight||66;if(cv.width!==Math.round(cw*d)||cv.height!==Math.round(chh*d)){cv.width=Math.round(cw*d);cv.height=Math.round(chh*d);}
    const keep=ctx;try{ctx=cv.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,cw,chh);rr(.5,.5,cw-1,chh-1,8);ctx.fillStyle='rgba(10,12,18,.66)';ctx.fill();ctx.strokeStyle='rgba(219,188,135,.5)';ctx.lineWidth=1;ctx.stroke();ctx.save();rr(1,1,cw-2,chh-2,7);ctx.clip();
      const span=1700,x0=p.x+13-span/2,sx=cw/span,X=x=>(x-x0)*sx,sy=(chh-14)/(FLOOR+24-150),Y=y=>7+(Math.max(150,y)-150)*sy,ok=x=>mapLevel(x)>0,inView=a=>a.x+a.w>x0&&a.x<x0+span;
      for(const a of platforms){if(!inView(a)||a.off)continue;const cx=clamp(a.x+a.w/2,x0,x0+span);if(!ok(cx))continue;ctx.globalAlpha=mapLevel(cx)===2?1:.45;if(a.h>100&&!a.solid){ctx.fillStyle='rgba(217,196,154,.28)';ctx.fillRect(X(a.x),Y(FLOOR),a.w*sx,chh);ctx.fillStyle='#d9c49a';ctx.fillRect(X(a.x),Y(FLOOR)-1,a.w*sx,2);}else if(a.solid){ctx.fillStyle='rgba(217,196,154,.55)';ctx.fillRect(X(a.x),Y(a.y),a.w*sx,Y(FLOOR)-Y(a.y));}else{ctx.fillStyle='#d9c49a';ctx.fillRect(X(a.x),Y(a.y)-.5,a.w*sx,1.6);}}
      ctx.globalAlpha=1;const dot=(x,y,c,r)=>{if(x<x0||x>x0+span||!ok(x))return;ctx.fillStyle=c;ctx.beginPath();ctx.arc(X(x),Y(y),r,0,TAU);ctx.fill();};
      if(L.exit)dot(L.exit,FLOOR-10,'#8be1ce',3.2);chests.forEach(c=>{if(!c.open)dot(c.x,c.y-6,'#ffcf6a',2.6);});if(L.ink!=null)dot(L.ink,FLOOR-8,'#a9cfe8',2.6);if(L.npc!=null)dot(L.npc,FLOOR-8,'#8be1ce',2.4);if(L.wicks)L.wicks.forEach((w,i)=>{if(!w.door)dot(w.x,w.y-28,i<run.litWicks?wickArt[L.theme][1]:i===run.litWicks?'#f2c580':'#9b9290',i===run.litWicks?3.2:2.2);});secrets.forEach(s=>{if(s.open||relics.guide)dot(s.x,s.y-30,s.open?'#e0b860':'rgba(255,214,120,.5)',2.2);});
      enemies.forEach(e=>{if(!e.dead)dot(e.x+e.w/2,e.y+e.h/2,e.type==='boss'?'#ffb070':'rgba(255,176,112,.85)',e.type==='boss'?3.6:1.8);});
      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(X(p.x+13),Y(p.y+p.h/2),3,0,TAU);ctx.fill();ctx.strokeStyle='#2fa39b';ctx.lineWidth=1.4;ctx.stroke();ctx.restore();}catch(e){}ctx=keep;}
  // ---- 行囊：背包 / 图鉴 / 传说三页；打开时世界停住 ----
  // 图鉴里的敌人：出手前的动作就是提示，读一读就知道怎么躲
  const FOES=[{id:'guard',name:'狱卒',info:'被抽走魂火的看守，只剩执行命令的躯壳。出刀前会把兵器往后一收，刃口闪一下光。'},{id:'archer',name:'骸骨弓手',info:'站在高处放箭，拉满弓时箭头会亮。翻滚能从箭下钻过去，挥刀能把箭砍断，飞刀专治它。'},{id:'elite',name:'精英狱卒',info:'被典狱长多分了一盏火的狱卒：头盔长角、披着金边斗篷，个头更大，出手更重。'},
    {id:'flyer',name:'囚灯蛾',info:'被锁进小灯笼的残魂，借破布蛾翼追逐活火。翅膀扬起、身子后仰时就要俯冲——翻滚避开，或等它扑空后上挑。'},
    {id:'shield',name:'持盾狱卒',info:'塔盾挡住正面的横斩和飞刀。它转身很慢：翻滚绕到背后，或者从头顶下劈；连砍的第三下重劈、钟锤都能把盾砸开。盾往后一收，就要连人带盾撞过来。'},
    {id:'caster',name:'守龛引灯者',info:'曾替死者点灯的人，如今把名字缝在胸前、将亡魂锁进杖灯。举灯施法会放出追魂火或灵枪；你靠近时它会化烟闪走。'},
    {id:'bomber',name:'运灰灯仆',info:'焚炉的运灰工，背上的笼灯囚着自己的余火。如今仍在搬运火油与腐水，抡臂后抛出罐子，落地留下危险区域；贴近会让它后退。'},
    {id:'crawler',name:'灯壳爬虫',info:'贴地的空灯壳，里面还蜷着一团不肯熄的火。身子压低时就要扑过来——跳起来就能从它背上过去。碰到任何敌人的身体都会受伤，受伤后有短暂的闪避。'},
    {id:'hanger',name:'吊灯残魂',info:'倒挂在梁上的破灯。你走到正下方，它会先摇两下，再落下来。落地后会自己爬回去。'},
    {id:'lurker',name:'伏灯',info:'贴着墙根的残火。身子压低、眼睛发亮，就要短扑。扑得不远，等它扑空再砍。'},
    {id:'spear',name:'矛卒',info:'瘦高的持矛卒。矛往后一收再刺出，比刀稍远，走得很慢。看它收矛就翻滚。'},
    {id:'lock',name:'守锁兽 · 铜壳',info:'刨地、背上喷出蒸汽，就要冲撞了——撞上墙会晕一会儿，头顶落石。贴身时它人立而起砸地；稍远会甩出锁链。半血后胸口巨锁崩开，会连撞两次。'},
    {id:'brood',name:'溺灯 · 腐潮母巢',info:'灯门一开就要喷腐潮弹，落地留下一滩腐水。沉进水里时，盯着冒出的气泡——它会从你脚下钻出来。触须蜷起是要横扫。半血后放出灯蛾，挥刀能打散。'},
    {id:'standard',name:'无名旗手 · 归骨',info:'收枪后突刺；高举旗帜后插进地里，灵枪会一根接一根从地下冒出；挥旗卷起的风贴地而来，跳过去。半血后会跃起，从你头顶坠下。'},
    {id:'warden',name:'沉钟典狱长',info:'举锤过顶就要砸地，半血后砸地带出冲击波；高举魂灯时魂火会飞出来，砍中魂火能放走它、补回魂火。半血后敲响头上的钟，钟声跳不过，只能翻滚穿过。'}];
  const portraits={},PORTRAIT_FIT={lock:[.38,26,52],brood:[.33,28,54],standard:[.3,24,54],warden:[.3,26,54]};
  function fakeFoe(kind){return{walk:0,seed:0,face:1,rage:false,elite:kind==='elite',kind:kind,move:'',wind:0,wt:1,act:0,at:1,rec:0,rt:1,lift:0,under:0,stun:false,roar:false,dead:false,hp:1,max:1};}
  function portrait(id){if(portraits[id]!=null)return portraits[id];let url='';const keep=ctx;try{const c=document.createElement('canvas');c.width=c.height=112;ctx=c.getContext('2d');ctx.scale(2,2);const e=fakeFoe(id);
      if(BOSS_SIZE[id]){const f=PORTRAIT_FIT[id];ctx.translate(f[1],f[2]);ctx.scale(f[0],f[0]);drawBossModel(e,BOSS_PAL[id]);}
      else{ctx.translate(28,id==='flyer'?40:52);const s=id==='elite'?.95:id==='flyer'?1.2:1.05;ctx.scale(s,s);if(id==='archer')drawArcher(e,ARCHER,0,-1);else if(id==='flyer')drawFlyer(e,FLYER,0);else if(id==='shield')drawShieldFoe(e,Object.assign({},GUARD,SHIELDP),0,-1);else if(id==='caster')drawCaster(e,CASTER,0,-1);else if(id==='bomber')drawBomber(e,BOMBER,0,-1);else if(id==='crawler')drawCrawler(e,CRAWLER,0,-1);else if(id==='hanger')drawHanger(e,HANGER,0);else if(id==='lurker')drawLurker(e,LURKER,0,-1);else if(id==='spear')drawSpear(e,SPEAR,0,-1);else drawGuard(e,id==='elite'?ELITE:GUARD,0,-1);}url=c.toDataURL();}catch(err){url='';}ctx=keep;portraits[id]=url;return url;}
  const ICONS={bomb:'<path d="M22 14h4l2 5c6 3 9 9 7 15-2 8-19 8-22 0-2-6 1-12 7-15z" fill="#d65b30"/><path d="M22 14v-4h5v4M26 10q1-5 5-5"/><path d="M20 27q4-4 7-5-1 5 3 7-2 5-6 5-5-1-4-7z" fill="#ffd477"/>',knife:'<path d="M8 36 29 12 39 7 35 18 14 39z" fill="#c5dce4"/><path d="m10 31 7 7M12 34l-4 5"/>',frost:'<path d="M14 31q5-5 5-13a5 5 0 0 1 10 0q0 8 5 13z" fill="#85d5ee"/><path d="M21 34q3 5 6 0M24 20v9m-4-7 8 5m0-5-8 5"/>',leech:'<path d="M24 7q-14 8-8 20l8 11 8-11Q38 15 24 7z" fill="#bf668e"/><circle cx="24" cy="22" r="5" fill="#ffe4f3"/>',plate:'<path d="M9 11 24 6 39 11v12q-1 10-15 17Q10 34 9 23z" fill="#91a8b6"/><path d="M24 9v27M13 17l11 4 11-4"/>',feather:'<path d="M10 38Q10 13 38 7 35 34 10 38z" fill="#89d4ba"/><path d="M10 38 31 15M19 28l-1-7m7 1 7 1"/>',magnet:'<path d="M12 10v15a12 12 0 0 0 24 0V10h-8v15a4 4 0 0 1-8 0V10z" fill="#e78a58"/><path d="M12 16h8m8 0h8"/>',tassel:'<path d="M24 6v13m-5-8h10m-9 8h8l4 18-8-5-8 5z" fill="#e4c56b"/><path d="M24 21v10"/>',wind:'<path d="M7 19q18-18 30-4 4 6-4 8m-24 5q12-8 24-3 8 4 1 10M10 35h12" stroke="#b8e4f5" fill="none" stroke-width="3"/>',carving:'<path d="M13 37 31 10l7-3-2 8-18 26z" fill="#c5b695"/>',shade:'<path d="M12 19 24 8l12 11-4 18H16z" fill="#a7dc79"/><path d="M18 26q6-8 12 0-1 7-6 7t-6-7z" fill="#f0ffc1"/>',flag:'<path d="M13 40V7m1 3q10-5 21 1l-4 8 4 8q-12-5-21 1" fill="#bc5262"/>',beads:'<circle cx="24" cy="24" r="14" fill="none" stroke="#d8cfb8" stroke-width="6" stroke-dasharray="2 4"/><path d="M24 38v5m-3-2h6"/>',journal:'<path d="M11 9q7-4 13 1 6-5 13-1v28q-7-4-13 1-6-5-13-1z" fill="#b99059"/><path d="M24 10v28M15 17h5m8 0h5m-18 5h5m8 0h5"/>',blade:'<path d="M11 38 32 9l7-3-3 8-21 28z" fill="#dce7e8"/>',heart:'<path d="M24 38 11 25Q4 14 14 11q6-2 10 5 4-7 10-5 10 3 3 14z" fill="#e88776"/>',flask:'<path d="M20 8h8v7l6 6v16H14V21l6-6z" fill="#92d6ba"/><path d="M19 27h10m-5-5v10"/>',swift:'<path d="M7 16h15M5 23h13M8 30h12M23 36l9-27 7 1-10 28z" fill="#ddd9a2"/>',reach:'<path d="M7 37 32 9l7-3-3 8-25 27z" fill="#c6e9ed"/><path d="M5 14q12-10 25-8" fill="none"/>',dash:'<path d="M9 32q6-19 15-12l10 8-2 7H12z" fill="#99cdd5"/><path d="M6 21h11M4 27h9M9 15h11"/>',vigor:'<path d="M24 6q-5 9-9 14-8 13 9 20 17-7 9-20-4-5-9-14z" fill="#95d6b5"/><path d="M24 19v12m-6-6h12"/>',wick:'<path d="M14 19h20l-3 19H17z" fill="#83cbbb"/><path d="M24 6q-7 7 0 14 7-7 0-14z" fill="#e9ffdc"/>',hunter:'<path d="M24 5 39 13 35 31 24 40 13 31 9 13z" fill="#c4a25f"/><path d="M24 13v19M16 24h16"/>',salvager:'<path d="M13 17h22v22H13z" fill="#bd8f67"/><path d="M18 17v-4q6-7 12 0v4M13 24h22M22 22h4v6h-4z"/>',flame:'<path d="M24 5q-3 10-10 17-8 14 10 19 18-5 10-19-4-7-10-17z" fill="#78d9c8"/><path d="M24 24q-5 5 0 10 6-4 0-10z" fill="#eaffee"/>',spring:'<path d="M9 32q10-2 17-17l8 3-6 11 9 4v5H10z" fill="#a9d8d0"/><path d="m13 18 6-7 6 7M19 11v12" fill="none"/>'};
  function icon(id){return '<svg viewBox="0 0 48 48" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g stroke="#302d35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+(ICONS[id]||ICONS.blade)+'</g></svg>';}
  function mark(id,off){const u=artURL(id,off);return '<i class="mark'+(off?' q':'')+'">'+(u?'<img alt="" src="'+u+'">':off?'?':icon(id))+'</i>';}
  function openBag(tab){if(state!=='play'||paused)return;if(tab)bagTab=tab;state='bag';keys={};clearHeld();renderBag();beep(420,.08);}
  function closeBag(){if(state!=='bag')return;state='play';panel.hidden=true;keys={};clearHeld();hudKey='';}
  function cell(id){return'<div class="cell">'+mark(id)+'<b>'+ITEMS[id].name+'</b><small>'+ITEMS[id].info+'</small></div>';}
  function pips(n){let s='';for(let i=0;i<3;i++)s+='<i class="pip'+(i<n?' on':'')+'"></i>';return s;}
  const LORE_ART={prologue:'fire',keeper:'bell',carving:'carving',lock:'key',merchant:'soup',shade:'shade',brood:'glass',flag:'flag',aling:'wick',beads:'beads',standard:'ribbon',journal:'journal',warden:'chain',ending:'bell'};
  // 行囊：背包是一格格画出来的道具；图鉴里道具是一面画墙（没得到的只剩剪影），点一下看说明
  function renderBag(fromMenu){let body='';const menuView=state==='menu';if(menuView&&bagTab==='bag')bagTab='dex';
    if(bagTab==='bag'){const own=ALL_RELICS.filter(id=>relics[id]),keep=Object.keys(ITEMS).filter(id=>ITEMS[id].kind==='memento'&&keepsakes[id]),C=CHARS[p.char];
      body='<div class="purse">'+chip('heart',(p.hp/LIFE)+' / '+(p.max/LIFE))+chip('blade',p.damage)+chip('flask',p.potions)+chip('ember',embers)+chip('flame',p.soul+' / 3')+chip('shard',((p.shards||0)%3)+' / 3')+chip('blueprint',BLUEPRINTS.filter(b=>codex.blue[b]).length+' / '+BLUEPRINTS.length)+(L.ink!=null?chip('map',hasMap()?'✓':'—'):'')+'</div>'
        +'<h3>道具 <small>'+(coarse()?'点一下，设为「道具」键要用的那种':'点一下选中 · '+K('use')+' 使用 · '+K('cycle')+' 切换')+'</small></h3><div class="slots">'+USES.map(id=>'<button data-sel="'+id+'" class="slot'+(sel===id?' on':'')+(bag[id]?'':' off')+'"><span class="art">'+artImg(id)+'<i class="qty">'+(L.tutorial?'∞':bag[id])+'</i></span><b>'+ITEMS[id].name+'</b></button>').join('')+'</div><p class="detail">'+ITEMS[sel].info+'</p>'
        +'<h3>'+C.name+'的技能 <small>攻击命中积攒魂火，'+(coarse()?'点右边的技能键':'按 '+K('skill1')+' / '+K('skill2')+' / '+K('skill3'))+'花魂火释放</small></h3><div class="slots skills">'+C.skills.slice(0,run.guided?run.awakened:3).map((s,i)=>'<div class="slot'+(p.soul>=SKILLS[s].cost?'':' off')+'"><span class="art">'+artImg('sk_'+s)+'<i class="qty">'+(coarse()?i+1:K('skill'+(i+1)))+'</i></span><b>'+SKILLS[s].name+'</b><span class="pips">'+pips(SKILLS[s].cost)+'</span><small>'+SKILLS[s].info+'</small></div>').join('')+'</div>'
        +'<h3>修炼 <small>宝箱里的强化</small></h3><div class="slots skills">'+Object.keys(p.skills).map(id=>{const u=UPS.find(q=>q.id===id);return'<div class="slot'+(p.skills[id]?'':' off')+'"><span class="art">'+artImg(id)+'</span><b>'+u.name+'</b><span class="pips">'+pips(p.skills[id])+'</span><small>'+u.info.replace(/，最多 3 级$/,'')+'</small></div>';}).join('')+'</div>'
        +'<h3>护符</h3>'+(own.length?'<div class="grid">'+own.map(cell).join('')+'</div>':'<p class="empty">还没有护符。宝箱和烛叟那里都能得到。</p>')
        +'<h3>珍藏</h3>'+(keep.length?'<div class="grid">'+keep.map(cell).join('')+'</div>':'<p class="empty">每一层都藏着一件遗物：看到发光的地方，靠近按 E 查看。</p>');}
    else if(bagTab==='dex'){body='<h3>敌人</h3><div class="grid">'+FOES.map(d=>{const s=codex.seen[d.id],img=s&&portrait(d.id);return'<div class="cell foe">'+(img?'<img alt="" src="'+img+'">':'<i class="mark q">?</i>')+'<b>'+(s?d.name:'？？？')+'</b><small>'+(s?d.info+'<br>已击倒 '+(codex.kills[d.id]||0):'还没遇见过。')+'</small></div>';}).join('')+'</div>'
        +'<h3>道具 <small>'+Object.keys(ITEMS).filter(id=>codex.items[id]).length+' / '+Object.keys(ITEMS).length+' · 点一下看说明</small></h3><p class="detail" id="dex-detail">得到过的东西会画在这面墙上。</p><div class="gallery">'+Object.keys(ITEMS).map(id=>{const f=codex.items[id];return'<button class="pic'+(f?'':' off')+'" data-dex="'+id+'"><span class="art">'+artImg(id,!f)+'</span><b>'+(f?ITEMS[id].name:'？？？')+'</b></button>';}).join('')+'</div>';}
    else body='<div class="lore">'+LORE.map(l=>codex.lore[l.id]?'<p>'+mark(LORE_ART[l.id]||'bell')+'<b>'+l.title+'</b>'+l.text+'</p>':'<p class="off">'+mark(LORE_ART[l.id]||'bell',true)+'<b>？？？</b>还没读到这段往事。</p>').join('')+'</div>';
    panel.innerHTML='<div class="sheet wide"><div class="tabs">'+(menuView?[['dex','图鉴'],['lore','传说']]:[['bag','背包'],['dex','图鉴'],['lore','传说']]).map(t=>'<button data-tab="'+t[0]+'"'+(bagTab===t[0]?' class="on"':'')+'>'+t[1]+'</button>').join('')+'</div>'+body+'<button class="secondary" id="bag-close">'+(menuView?'返回':'合上行囊')+'</button><p class="footnote">'+(coarse()?'':menuView?'Esc 返回':K('bag')+' / Esc 合上 · ← → 切换页签')+'</p></div>';
    panel.hidden=false;panel.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{bagTab=b.dataset.tab;renderBag();});panel.querySelectorAll('[data-sel]').forEach(b=>b.onclick=()=>{sel=b.dataset.sel;hudKey='';renderBag();});
    panel.querySelectorAll('[data-dex]').forEach(b=>b.onclick=()=>{const id=b.dataset.dex,f=codex.items[id],d=document.getElementById('dex-detail');d.innerHTML=f?'<b>'+ITEMS[id].name+'</b>　'+ITEMS[id].info:'还没得到过这样东西。';});document.getElementById('bag-close').onclick=menuView?renderMenu:closeBag;}
  function pickOffer(i){if(state!=='upgrade'||!offers[i])return;const o=offers[i];if(o.kind==='up'){if(o.id==='blade')p.damage+=12;if(o.id==='heart'){p.max+=LIFE;p.hp=p.max;}if(o.id==='flask')p.potions+=2;if(p.skills[o.id]!=null)p.skills[o.id]=Math.min(3,p.skills[o.id]+1);showGain(o.id,1);}else gain(o.id,o.n);if(o.kind==='use')sel=o.id;
    if(revealC)loot.push({id:o.id,x:revealC.x+(i-1)*46,y:revealC.y-92,vx:0,vy:-120,t:.3});revealC=null;state='play';panel.hidden=true;offers=[];hudKey='';beep(660,.2);}
  function burst(x,y,c,n){for(let i=0;i<n;i++)emit_particles(x,y,(Math.random()-.5)*330,(Math.random()-.7)*230,.3+Math.random()*.35,.65,c,2+Math.random()*4,1,undefined,undefined,undefined,undefined);}
  function ember(x,y,n,c){for(let i=0;i<n;i++)emit_particles(x+(Math.random()-.5)*10,y+(Math.random()-.5)*10,(Math.random()-.5)*50,-30-Math.random()*60,.6+Math.random()*.8,1.4,c||'#ffa04a',1+Math.random()*1.6,-.15,true,undefined,undefined,undefined);}
  function dust(x,y,n,dir){for(let i=0;i<n;i++){const d=dir||(Math.random()<.5?-1:1);emit_particles(x+(Math.random()-.5)*14,y-2,d*(30+Math.random()*90),-10-Math.random()*40,.35+Math.random()*.3,.65,'#8a9196',2+Math.random()*3,.2,undefined,undefined,.06,true);}}
  function pop(x,y,t,c,big){const o=floatsPool.acquire();if(!o)return;o.x=x+(Math.random()-.5)*10;o.y=y;o.t=String(t);o.c=c||'#efe2c8';o.life=.75;o.big=!!big;floats.push(o);}
  function punchShake(px){if(settings.shake===false)return;shake=Math.max(shake,px);shakeT=Math.max(shakeT||0,FEEL.shakeDur||.1);}
  // 生命以整格结算：每格对应一个小幽灵，普通命中 1 格，明确的首领重击 2 格。
  function hurt(d,from,heavy,why){if(p.inv>0||state!=='play')return;let lost=heavy?2:1;if(cycle>0)lost=Math.min(4,Math.max(lost,Math.ceil(lost*Math.min(2,1+.2*cycle))));
    if(relics.veil&&!flags.veil){flags.veil=true;p.inv=.8;fx.push({k:'ring',x:p.x+13,y:p.y+26,life:.4,max:.4,r:60});pop(p.x+13,p.y-8,'铃声挡下了','#ffe2a8');beep(1320,.3,'sine');beep(1760,.45,'sine');return;}   // 护身铃：每层挡一次
    if(relics.plate){p.plateHits++;if(p.plateHits%3===0){lost--;fx.push({k:'ring',x:p.x+13,y:p.y+26,life:.3,max:.3,r:45});if(!lost){p.inv=.6;pop(p.x+13,p.y-8,'挡住了','#bce3db');beep(500,.15,'triangle');return;}}}
    let points=lost*LIFE;if(points>=p.hp&&relics.wind&&!p.windUsed){p.windUsed=true;points=Math.max(0,p.hp-LIFE);fx.push({k:'ring',x:p.x+13,y:p.y+26,life:.4,max:.4,r:70});say('第二口气！',2);}
    if(L.tutorial)points=Math.min(points,Math.max(0,p.hp-LIFE));   // 教程里不会倒下
    p.hp=Math.max(0,p.hp-points);p.inv=FEEL.hurtInv;p.hurtT=.3;p.kbX=(p.x<from?-1:1)*FEEL.kb;p.kbT=FEEL.kbTime;p.vx=p.kbX;p.vy=-170;punchShake(FEEL.shakeHurt);burst(p.x+13,p.y+22,'#cf706a',15);if(points)pop(p.x+13,p.y-6,'−'+(points/LIFE),'#ff9a8a');beep(85,.2,'sawtooth');if(settings.buzz&&typeof navigator!=='undefined'&&navigator.vibrate)navigator.vibrate(16);hudKey='';if(points&&p.hp){hitstop=Math.max(hitstop,FEEL.hurtStop);flashT=Math.max(flashT,.08);}if(!p.hp){deathWhy=why||'受到了攻击';finish(false);}}
  function finish(win){if(!win){run.deaths=(run.deaths||0)+1;deathT=0;deathX=p.x+p.w/2;deathY=p.y+p.h/2;for(let i=0;i<(lowFx?12:34);i++){const a=Math.random()*TAU,v=60+Math.random()*260;emit_particles(deathX,deathY,Math.cos(a)*v,Math.sin(a)*v-90,.8+Math.random()*1.2,2,i%3?'#eef6fa':'#9ff3e0',2+Math.random()*3,i%3?.6:-.3,i%3===0,undefined,undefined,undefined);}punchShake(FEEL.shakeHurt);flashT=.3;beep(220,.5,'sine',.04);beep(110,.9,'triangle',.04);panel.classList.add('late');saveRun();}state=win?'win':'dead';paused=false;touch.hidden=true;chestBtn.hidden=true;score+=win?200:0;best=Math.max(best,score);try{localStorage.setItem('ember:best',String(best));}catch(e){}
    // 通关：三声钟响、满城魂火升起 → 插画上自动播完结局旁白 → 片尾字幕 → 结算（解锁角色、开启下一周目）
    if(win){note('lore','ending');gain('chain',1,true);hud.hidden=true;keys={};clearHeld();cine={k:'bell',t:0,n:0,dur:3.8,dawn:0,after:()=>startTalk(TALK.ending,startCredits,true,{auto:true,delay:.4})};state='cine';}
    else{const menu={label:'回到开始界面',fn:showMenu},first={label:'从第一层重新开始',fn:()=>reset(false)},why=deathWhy||'受到了攻击';
      if(checkpoint)showPanel('余火将息',why+'。<br>'+(L.arena?'钟火还亮着。已打下的阶段还在，回到篝火再战 '+(BOSSES[L.bossKind]?BOSSES[L.bossKind].name:'首领')+'。':'钟火还亮着。回到上一处钟火。'),'从钟火再战',respawn,[{label:'从本层开头再来',fn:retryStage},first,menu]);
      else if(stage>0)showPanel('余火将息',why+'。<br>倒在了'+L.name+'。带着进门时的状态，从这一层重新来过？','从本层再来',retryStage,[first,menu]);
      else showPanel('余火将息',why+'。<br>这次旅途暂时结束。翻滚能穿过攻击，宝箱能让下一场战斗轻松一些。','重新出发',()=>reset(false),[menu]);focusFirst();}
    beep(win?650:110,.5);}
  // 片尾字幕：黎明的插画上，名字一行行往上走；按任意键 / 点一下跳过
  const CREDITS=[['余烬地牢','title'],['EMBER VAULT','en'],['',''],['— 引灯的人 —','h'],['小引灯人　钟锤学徒　拾灯弓手',''],['',''],['— 路上遇见的 —','h'],['守钟人　烛叟　阿苓',''],['',''],['— 守着门的 —','h'],['守锁兽 · 铜壳',''],['溺灯 · 腐潮母巢',''],['无名旗手 · 归骨',''],['沉钟典狱长',''],['',''],['— 走过的路 —','h'],['焚炉底层　沉钟监牢　腐水下水道',''],['落日城墙　骸骨墓窟　沉钟之巅',''],['',''],['画面、关卡与对白','h'],['原创绘制与编写',''],['— 音乐 —','h'],['《两下灯影》 · 原创配乐',''],['灯坊、五座地牢与四位守钟者',''],['',''],['',''],['谢谢你，把每一盏火都送回了家。','end']];
  function startCredits(){credits={t:0,dur:26};talkBox.hidden=true;hud.hidden=true;touch.hidden=true;sceneA=sceneB='';}
  function endCredits(){if(!credits)return;credits=null;showWinPanel();}
  // 结算：通关次数 +1，解锁新角色；可以带着同一个角色开启下一周目
  const BOONS=[{id:'flask',name:'起始药瓶',info:'下一周目开局多一瓶药'},{id:'skin',name:'余烬刀穗',info:'下一周目刀光换成暖色'},{id:'hunter',name:'寻火词条',info:'下一周目开局带着寻火者徽记'}];
  function ownedBoons(){try{return JSON.parse(localStorage.getItem('ember:boons')||'[]')||[];}catch(e){return [];}}
  function grantBoon(){const gift=BOONS[Math.min(BOONS.length,clears)-1];if(!gift)return null;const have=ownedBoons();if(have.indexOf(gift.id)<0){have.push(gift.id);try{localStorage.setItem('ember:boons',JSON.stringify(have));}catch(e){}}return gift;}
  function applyBoons(){if(!cycle||!p)return;const have=ownedBoons();if(have.indexOf('flask')>=0)p.potions+=1;if(have.indexOf('hunter')>=0)relics.hunter=true;if(have.indexOf('skin')>=0)p.skin=true;}
  function clockText(t){t=Math.floor(t||0);return Math.floor(t/60)+' 分 '+(t%60)+' 秒';}
  function showWinPanel(){state='win';if(selectedRoute){clearSave();hud.hidden=true;showPanel('钟声已归','你带着火种走到了旅程尽头。','再选一关',()=>{showMenu();renderChapters();},[{label:'回到开始界面',fn:showMenu}]);focusFirst();return;}clears++;try{localStorage.setItem('ember:clears',String(clears));}catch(e){}clearSave();hud.hidden=true;
    const gift=grantBoon(),next=Math.min(cycle+1,4);
    panel.innerHTML='<div class="sheet win"><span class="chapter">第 '+(cycle+1)+' 周目 · 通关</span><h1>钟声</h1><p class="intro">你把每一盏火都送回了家。<br>沉钟又一次响彻地牢；驿站里，烛叟的灯上停着一点绿色的火。</p>'
      +(gift?'<div class="unlock"><div class="unlock-card"><span><em>带入下一周目</em><b>'+gift.name+'</b><small>'+gift.info+'</small></span></div></div>':'')
      +'<p class="keys">用时 '+clockText(run.time)+'　·　死亡 '+(run.deaths||0)+' 次<br>击败 '+kills+'　·　得分 '+score+'　·　最高 '+best+'　·　已通关 '+clears+' 次</p><button class="primary" id="ng">开启第 '+(next+1)+' 周目 <span>↗</span></button><button class="secondary" id="ng-pick">换个角色再出发</button><button class="secondary" id="to-menu">回到开始界面</button><p class="footnote">周目越高，敌人血更厚、伤害更高（伤害最多到两倍），机关和招式也会变。</p></div>';
    panel.hidden=false;const ch=p.char;document.getElementById('ng').onclick=()=>{unlockAudio();startJourney(ch,next);};document.getElementById('ng-pick').onclick=()=>{showMenu();pickChar=ch;pickCycle=next;renderChars();};document.getElementById('to-menu').onclick=showMenu;focusFirst();beep(660,.3,'sine');beep(990,.5,'sine');}
  function respawn(){panel.classList.remove('late');const spot=(p.checkX!=null?p.checkX:(L.checkpoint!=null?L.checkpoint:120))+20,kept=enemies.filter(e=>e.type==='boss'&&!e.dead).map(e=>({hp:e.hp,phase:e.phase||0,rage:!!e.rage,phase3:!!e.phase3}));
    Object.assign(p,{x:spot,y:FLOOR-p.h,vx:0,vy:0,face:1,hp:p.max,jumps:0,ground:true,coyote:FEEL.coyote,buffer:0,cutQueued:false,jumpRising:false,roll:0,rollFromGround:false,rollCd:0,attack:0,atkCd:0,inv:1.2,hit:new Set(),hurtT:0,trail:[],cape:null,dash:0,charge:0,bowRecoil:0,kbT:0,ringT:0,domeT:0,on:null});p.potions=Math.max(p.potions,1);p.soul=3;p.castCd=0;
    enemies.forEach(e=>{if(e.type!=='boss'||e.dead)return;const k=kept[0];Object.assign(e,{x:e.origin,y:e.floor-e.h,hp:k?k.hp:e.max,phase:k?k.phase:0,rage:k?k.rage:false,phase3:k?k.phase3:false,face:-1,cd:1.2,wind:0,wt:0,flash:0,spell:false,spellCd:3.5,swing:0,kb:0,kbT:0,hitT:0,frozen:0,daze:0,move:'',act:0,at:0,rec:0,rt:0,vx:0,lift:0,under:0,combo:0,tollCd:3,mothCd:2,struck:false,stun:false,roar:false,surfacing:false,phaseInv:0});});
    shots=[];shotsPool.clear();waves=[];floats=[];floatsPool.clear();orbs=[];fx=[];chunks=[];thrown=[];hazards=[];loot=[];gateK=0;bossCardT=0;flags.boss=false;keys={};clearHeld();hitstop=0;shake=0;shakeT=0;paused=false;hudKey='';state='play';panel.hidden=true;hud.hidden=false;touch.hidden=!coarse();checkpoint=p.checkX!=null||!!L.checkpoint;
    followEmber(0,true);cam=clamp(p.x-W*.35,0,Math.max(0,WORLD-W));say(L.arena?'余火重燃 · 已打下的阶段还在':'余火重燃 · 从钟火继续',2.2);syncHud();saveRun();
  }
  // 每帧都会调用：只有数值变了才写 DOM
  // HUD：生命只写数字，药瓶、余烬、道具都用画 + 数量
  function syncHud(){let goal;if(L.rest)goal=nearShop()?'用余烬换补给':'往右走，进入'+STAGES[stage+1].name;else if(L.seal){const boss=enemies.find(e=>e.type==='boss');goal=boss&&boss.dead?'东侧的铁闸已经升起':p.x>(L.trigger||3620)?'击败 '+BOSSES[L.bossKind].name:'向首领场地前进';}else if(L.lesson)goal=guideGoal();else goal=p.x>L.exit-700?(L.tutorial?'走出焚炉':'走进右侧的大门'):'向东深入';
    const prog=clamp((p.x-120)/((L.exit||L.seal||L.w)-120),0,1),C=CHARS[p.char],skKeys=K('skill1')+K('skill2')+K('skill3');
    const zone=(cycle?'第 '+(cycle+1)+' 周目 · ':'')+(L.rest?L.name:L.n+' · '+L.name)+' · '+goal,key=Math.ceil(p.hp)+'|'+p.max+'|'+embers+'|'+p.potions+'|'+zone+'|'+sel+bag[sel]+'|'+p.soul+'|'+p.char+'|'+skKeys+'|'+Math.round(prog*60);if(key===hudKey)return;hudKey=key;
    document.getElementById('item-name').innerHTML=artImg(sel);document.getElementById('quick-item').innerHTML=artImg(sel)+'<b>'+(L.tutorial?'∞':bag[sel])+'</b>';document.getElementById('quick-item').title=ITEMS[sel].name+' · '+K('use')+' 使用 / '+K('cycle')+' 切换';document.getElementById('item-count').textContent=L.tutorial?'∞':bag[sel];if(bag[sel])itemBtn.classList.remove('empty');else itemBtn.classList.add('empty');
    const meter=document.getElementById('soul-meter');if(meter.setAttribute)meter.setAttribute('aria-label','魂火 '+p.soul+' / 3，攻击命中积攒，技能花掉');meter.innerHTML=[0,1,2].map(i=>'<i class="'+(p.soul>i?'filled':'')+(p.soul>=3?' full':'')+'"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/><path d="M10 3.6c-1 3-4.1 4.6-4.1 8a4.1 4.1 0 0 0 8.2 0c0-3-2.7-5.2-4.1-8z"/></svg></i>').join('');
    // 技能栏：三格技能的画、按键、要花几格魂火；魂火够了就亮起来。HUD 一份（键盘），触屏按键一份
    for(let i=1;i<=3;i++){
      const s=C.skills[i-1],S=SKILLS[s],art=artImg('sk_'+s),cost=L.tutorial?'∞':'<u></u>'.repeat(S.cost);
      ['sk'+i,'tsk'+i].forEach(id=>{
        const b=document.getElementById(id);if(!b)return;
        const touchSkill=id==='tsk'+i;
        b.hidden=!!run.guided&&i>run.awakened;
        b.innerHTML=art+'<i>'+(touchSkill?i:K('skill'+i))+'</i><em>'+cost+'</em>';
        b.className='sk'+(touchSkill?' t'+i:'')+(p.soul>=S.cost?' ready':'');
        b.title=S.name+'（'+S.cost+' 格魂火）：'+S.info;
        if(b.setAttribute)b.setAttribute('aria-label',S.name);
      });
    }
    const life=document.getElementById('health'),count=p.max/LIFE,alive=p.hp/LIFE;life.innerHTML=Array.from({length:count},(_,i)=>'<svg class="life-ghost '+(i<alive?'alive':'lost')+'" viewBox="0 0 24 27" aria-hidden="true"><path d="M3 23V11C3 5 6.7 2 12 2s9 3 9 9v12l-3-2-3 3-3-3-3 3-3-3z"/><ellipse cx="9" cy="11" rx="1.3" ry="1.8"/><ellipse cx="15" cy="11" rx="1.3" ry="1.8"/></svg>').join('');if(life.setAttribute)life.setAttribute('aria-label','生命 '+alive+' / '+count+' 个小幽灵');document.getElementById('stats').textContent=alive+' / '+count;document.getElementById('chips').innerHTML=chip('flask',p.potions)+chip('ember',embers);document.getElementById('zone').textContent=zone;
    const bar=document.getElementById('progress-fill');if(bar&&bar.style)bar.style.width=(L.rest||L.arena?0:Math.round(prog*100))+'%';const pb=document.getElementById('progress');if(pb)pb.hidden=!!(L.rest||L.arena);
    document.getElementById('potion-count').textContent=p.potions;if(p.potions)healBtn.classList.remove('empty');else healBtn.classList.add('empty');}
  // 斗篷：7 个点的绳子（Verlet），挂在后颈
  function updateCape(dt){const ax=p.x+p.w/2-p.face*11,ay=p.y+p.h-(p.roll>0?16:25);let c=p.cape;
    if(!c||Math.abs(c[0].x-ax)>90||Math.abs(c[0].y-ay)>90){c=p.cape=[];for(let i=0;i<7;i++)c.push({x:ax-p.face*i*4,y:ay+i*3,px:ax-p.face*i*4,py:ay+i*3});}
    c[0].x=ax;c[0].y=ay;const g=520*dt*dt,drift=-p.face*70*dt*dt;
    for(let i=1;i<c.length;i++){const q=c[i],vx=(q.x-q.px)*.9,vy=(q.y-q.py)*.9;q.px=q.x;q.py=q.y;q.x+=vx+drift;q.y+=vy+g;}
    for(let it=0;it<3;it++)for(let i=1;i<c.length;i++){const a=c[i-1],b=c[i],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,k=(d-4)/d;if(i===1){b.x-=dx*k;b.y-=dy*k;}else{a.x+=dx*k*.5;a.y+=dy*k*.5;b.x-=dx*k*.5;b.y-=dy*k*.5;}}
    for(let i=1;i<c.length;i++)if(c[i].y>FLOOR-1&&!inGap(c[i].x))c[i].y=FLOOR-1;}
  // 敌人只在自己的平台（或断崖之间那段地面）上活动，被击退也出不去
  function bounds(e){if(e.type==='boss'&&L.arena)return[L.gate+14,L.seal-e.w-14];if(e.type==='flyer')return[e.origin-440,e.origin+440];const home=platforms.find(a=>a.y===e.floor&&!a.mv&&!a.cr&&e.origin>=a.x&&e.origin<a.x+a.w);let lo=Math.max(e.origin-240,home?home.x:0),hi=Math.min(e.origin+240,home?home.x+home.w-e.w:WORLD);platforms.forEach(a=>{if(!a.solid||e.floor<=a.y)return;if(e.origin+e.w<=a.x)hi=Math.min(hi,a.x-e.w);else if(e.origin>=a.x+a.w)lo=Math.max(lo,a.x+a.w);});return[lo,hi];}
  // 打击感：命中点一道斩痕 + 白色星芒 + 顺着刀势飞出去的火花，重劈多一圈冲击波；顿帧和震屏按轻重区分
  // 刀、火油罐、飞刀都走这里：扣血、击退、打击特效；打死了交给 killEnemy
  // soft：魂灯环这类持续伤害，不顿帧不震屏
  function hitEnemy(e,dmg,dir,heavy,hx,hy,ang,soft){if(e.ward){hitWard(e,dmg,hx,hy);return;}const boss=e.type==='boss';if(boss&&((L.arena&&!flags.boss)||e.under>.5||e.phaseInv>0))return;let num='#efe2c8';if(e.weak>0&&hy<e.y+e.h*.45){dmg=Math.round(dmg*2.2);num='#7ec8ff';}else if(heavy)num='#ffd08a';dmg=Math.max(1,Math.round(dmg));e.waitingForHit=false;e.hp=Math.max(0,e.hp-dmg);e.flash=.1;e.hitT=.2;e.hitDir=dir;if(dir){e.kb=dir*(boss?FEEL.kb*FEEL.kbBoss:FEEL.kb);e.kbT=FEEL.kbTime;}
    if(e.type==='flyer'){if(e.fly==='dive'){e.fly='rise';e.cd=1.2;}e.wind=0;}if(e.type==='caster'&&e.wind>0&&heavy)e.wind=0;if(e.type==='dummy')e.hp=Math.max(1,e.hp);
    hitFx(hx,hy,e,heavy,ang,soft);if(settings.nums)pop(e.x+e.w/2,e.y-8,String(Math.round(dmg)),num,heavy||num!=='#efe2c8');if(e.hp<=0&&!e.dead)killEnemy(e);}
  function killEnemy(e){const boss=e.type==='boss',el=e.elite,g=boss?120:el?80:e.type==='shield'||e.type==='caster'?35:25;e.dead=true;e.dieT=.45;e.frozen=0;e.daze=0;kills++;score+=g;embers+=Math.round(g*L.hpK*(relics.magnet?1.3:1)*(1+.25*cycle));note('kills',boss?(L.bossKind||'warden'):el?'elite':e.type);
    if(relics.salvager&&kills%4===0){gain('bomb',1,true);popArt('bomb','+1',p.x+13,p.y-34);}
    if(!boss&&relics.hunt){p.soul=Math.min(3,p.soul+1);hudKey='';}if(!boss&&(el||e.type==='shield'||e.type==='caster'||e.type==='bomber'))maybeBlueprint(e);
    if(relics.leech){p.leechKills++;if(p.leechKills%4===0&&p.hp<p.max){p.hp=Math.min(p.max,p.hp+LIFE);pop(p.x+13,p.y-12,'+1','#9be3c8');hudKey='';}}
    if(!boss)killFx(e);if(p.char==='lamp'&&kills%3===0&&p.hp<p.max){p.hp=Math.min(p.max,p.hp+LIFE);pop(p.x+13,p.y-12,'+1','#9be3c8');hudKey='';}burst(e.x,e.y,'#7ec8be',boss?8:20);ember(e.x+e.w/2,e.y+e.h/2,boss?12:10,'#ffb35c');for(let i=0;i<(boss?16:el?12:6);i++)orbs.push({x:e.x+e.w/2,y:e.y+e.h/2,vx:(Math.random()-.5)*280,vy:-60-Math.random()*220,t:0});
    // 首领：先放 3 秒的倒下过场（慢动作、裂光、魂火飞散、炸开），再自动讲完倒下的对白
    if(boss){e.dieT=9;waves=[];shots=[];shotsPool.clear();hazards=[];e.under=0;e.lift=0;e.surfacing=false;if(L.chapter<4)unlockChapter(L.chapter+1);const k=L.bossKind||'warden',story=BOSSES[k];bossCue('victory');bossCardT=0;hitstop=0;flashT=.25;keys={};clearHeld();hud.hidden=true;touch.hidden=true;messageT=0;notice.style.opacity=0;
      cine={k:'boss',e:e,kind:k,t:0,dur:3.1,slow:.8,boom:false,after:()=>{note('lore',k);startTalk(story.down,()=>{if(k!=='warden'){gain(story.drop);loot.push({id:story.drop,x:e.x+e.w/2,y:e.y+e.h/2,vx:0,vy:-260,t:0});}gainShard(e.x+e.w/2,e.y+e.h/2);say(k==='warden'?'钟舌已经松开 · 往右走，去敲响沉钟':'铁闸升起了 · 继续向右',4);},false,{arena:true,auto:true,delay:.25});}};state='cine';}}
  function hitFx(x,y,e,heavy,ang,soft){const a=ang!=null?ang:p.slash==='up'?-Math.PI/2:p.slash==='down'?Math.PI/2:p.atkFace>0?0:Math.PI,tilt=ang!=null?(Math.random()-.5)*.6:p.slash==='side'?(p.combo===2?.45:-.45)*p.atkFace:(Math.random()-.5)*.5,bone=e.type==='archer'||e.type==='caster';
    if(soft){fx.push({k:'star',x:x,y:y,a:Math.random()*TAU,life:.1,max:.1,r:16});burst(x,y,'#9ff3e0',4);beep(700,.04,'triangle',.02);return;}
    fx.push({k:'cut',x:x,y:y,a:a+tilt,life:.17,max:.17,len:heavy?130:92});fx.push({k:'star',x:x,y:y,a:Math.random()*TAU,life:.11,max:.11,r:heavy?34:22});if(heavy)fx.push({k:'ring',x:x,y:y,life:.22,max:.22,r:44});
    for(let i=0;i<(heavy?16:10);i++){const s=a+(Math.random()-.5)*1.1,v=220+Math.random()*(heavy?420:300);emit_particles(x,y,Math.cos(s)*v,Math.sin(s)*v-40,.16+Math.random()*.22,.38,bone?'#e6dcc4':i%3?'#fff1d0':'#ffc46a',1.2+Math.random()*1.4,.7,undefined,true,.03,undefined);}
    burst(x,y,bone?'#cfc5ad':'#f4c98a',heavy?10:6);if(!soft){hitstop=Math.max(hitstop,FEEL.hitStop);punchShake(FEEL.shakeHit);}impactSound(heavy);}
  // 击杀：身体碎成几块（颜色取自它的盔甲 / 斗篷），在地上弹两下再淡出
  function killFx(e){const boss=e.type==='boss',arch=e.type==='archer',P=PAL[e.type]||PAL.guard,home=platforms.find(a=>a.y===e.floor&&e.x+e.w/2>=a.x&&e.x+e.w/2<a.x+a.w);
    const cols=e.type==='crawler'?[P.shell,P.body,P.claw,P.soul]:e.type==='hanger'?[P.cloth,P.chain,P.cage,P.soul]:arch?[P.cloak,P.cloakDark,P.skull,P.bow]:boss?BOSS_CHUNKS[e.kind]:e.type==='flyer'?[P.wing,P.body,P.bone]:e.type==='caster'?[P.robe,P.hood,P.skull,P.staff]:e.type==='bomber'?[P.cloak,P.pack,P.flask]:e.type==='shield'?[P.shield,P.armor,P.helm,P.shieldDark]:e.type==='dummy'?['#c8a860','#6a4a2f']:[P.armor,P.tabard,P.helm,P.armorDark,P.blade];
    for(let i=0;i<(boss?16:e.elite?12:8);i++)chunks.push({x:e.x+e.w*Math.random(),y:e.y+e.h*Math.random(),vx:(Math.random()-.5)*260+p.atkFace*90,vy:-120-Math.random()*260,r:Math.random()*TAU,vr:(Math.random()-.5)*16,s:3+Math.random()*(boss?9:6),c:cols[i%cols.length],life:1.2+Math.random()*.6,floor:e.floor,x0:home?home.x:0,x1:home?home.x+home.w:WORLD});
    fx.push({k:'ring',x:e.x+e.w/2,y:e.y+e.h/2,life:.35,max:.35,r:boss?120:60});if(!boss){hitstop=Math.max(hitstop,FEEL.hitStop);punchShake(FEEL.shakeHit);}}
  // 打碎发光陶罐：金色是余烬、绿色回一个小幽灵、蓝色是两把飞刀
  function breakCache(b){b.broken=true;burst(b.x,b.y-15,b.kind===0?'#ffd18a':b.kind===1?'#9be3c8':'#a8dce8',12);dust(b.x,b.y,5,0);beep(540,.1);if(b.kind===0){embers+=20;popArt('ember','+20',b.x,b.y-38);for(let i=0;i<5;i++)orbs.push({x:b.x,y:b.y-15,vx:(Math.random()-.5)*220,vy:-80-Math.random()*180,t:0});}else if(b.kind===1){const amount=Math.min(LIFE,p.max-p.hp);p.hp+=amount;popArt('heart',amount?'+'+(amount/LIFE):'',b.x,b.y-38);}else{gain('knife',2,true);popArt('knife','×2',b.x,b.y-38);loot.push({id:'knife',x:b.x,y:b.y-20,vx:(Math.random()-.5)*80,vy:-260,t:0});}hudKey='';}
  // ---- 首领招式：每位首领一张招式表。出手前只靠动作预兆（刨地喷汽、灯门打开、高举旗帜、举锤过顶……），不画警示框 ----
  // e.move 当前招式；e.wind 蓄力剩余，归零时 release 出手；e.act / e.at 出手持续；e.rec 收招硬直（趁机砍）；e.cd 下一招前的间隔
  function begin(e,m,wind){e.move=m;e.wind=e.wt=clamp(wind,.5,.8);e.act=e.at=0;e.rec=0;e.struck=false;e.slapped=false;e.spell=m==='lantern';bossCue('attack');}
  function startAct(e,t){e.act=e.at=t;e.struck=false;}
  function recover(e,r,cd){e.rec=e.rt=r;e.cd=Math.max(1.2,cd==null?1.2:cd);}
  function overlapP(x0,y0,x1,y1){return p.x+p.w>Math.min(x0,x1)&&p.x<Math.max(x0,x1)&&p.y+p.h>y0&&p.y<y1;}
  // 极限闪避（参考死亡细胞）：翻滚刚开始的 0.15 秒里被攻击擦过——时间放慢、白圈一闪、补一格魂火（每次翻滚一次）
  let slowMo=0;
  function dodging(){return p.roll>0&&p.roll>=ROLL-FEEL.dodge;}
  function perfectDodge(x){if(p.perfect||p.roll<ROLL-.15||state!=='play')return;p.perfect=true;slowMo=.45;p.soul=Math.min(3,p.soul+1);hudKey='';fx.push({k:'ring',x:p.x+13,y:p.y+26,life:.45,max:.45,r:70},{k:'star',x:p.x+13,y:p.y+20,a:0,life:.16,max:.16,r:30});pop(p.x+13,p.y-14,'闪避','#cfefff',true);beep(1180,.18,'sine',.03);beep(1770,.25,'sine',.02);if(!run.dodgeTip){run.dodgeTip=true;say('极限闪避 · 翻滚擦过攻击的一瞬间，时间会慢下来',2.6);}}  function strike(e,x0,y0,x1,y1,d){if(e.struck||state!=='play'||!overlapP(x0,y0,x1,y1))return false;if(p.inv>0||dodging()){perfectDodge(e.x+e.w/2);return false;}e.struck=true;hurt(Math.round(d*L.dmgK),e.x+e.w/2,d>=28,'被'+((e.kind&&BOSSES[e.kind]&&BOSSES[e.kind].name)||'首领')+'击中');return true;}
  function bossWalk(e,dir,sp,dt){const B=bounds(e);e.x=clamp(e.x+dir*sp*dt,B[0],B[1]);}
  function rocks(n){for(let i=0;i<n;i++)hazards.push({k:'rock',x:L.gate+70+Math.random()*(L.seal-L.gate-140),y:36,vy:0,delay:.5+Math.random()*.7,life:3,r:Math.random()*TAU,s:.8+Math.random()*.5,d:Math.round(14*L.dmgK)});}
  function spear(x,delay){if(x>L.gate+16&&x<L.seal-16)hazards.push({k:'spear',x:x,delay:delay,life:.55,max:.55,d:Math.round(18*L.dmgK)});}
  // 守锁兽甩锁链：锁头从身后高处抡过头顶，砸到身前地面
  function lashHead(e){const f=e.face,ax=e.x+e.w/2+f*80,ay=FLOOR-30,k=e.wind>0?0:e.act>0&&e.at?1-e.act/e.at:1,th=-2.5+2.7*(1-Math.pow(1-k,2));return[ax+f*Math.cos(th)*190,Math.min(FLOOR-14,ay+Math.sin(th)*190)];}
  function splash(x,y){for(let i=0;i<12;i++){const a=-Math.PI*Math.random(),v=80+Math.random()*160;emit_particles(x,y,Math.cos(a)*v,Math.sin(a)*v,.35+Math.random()*.3,.6,i%2?'#b8f08a':'#6fb84a',2+Math.random()*2.5,1,undefined,undefined,undefined,undefined);}beep(200,.08,'sine');}
  // 刀光砍中飞来的东西：箭被砍断；典狱长的魂火被放走，还你一格魂火
  function cutShot(s){if(s.k==='flame'){p.soul=Math.min(3,p.soul+1);hudKey='';burst(s.x,s.y,'#bff5ea',14);ember(s.x,s.y,8,'#8be1ce');fx.push({k:'ring',x:s.x,y:s.y,life:.3,max:.3,r:30});beep(980,.12,'sine');beep(1470,.18,'sine');}
    else if(s.k==='moth'){burst(s.x,s.y,'#cfffb0',10);beep(760,.06,'triangle');}else if(s.k==='glob')splash(s.x,s.y);else{burst(s.x,s.y,'#ffe6b0',6);beep(700,.05);}}
  const BOSS_AI={
    // 守锁兽：冲撞（撞墙会晕、震落碎石）、人立砸地、甩锁链；二阶段连撞两次，砸地带冲击波
    lock:{roar:1.1,
      idle(e,dt,dist){if(dist>190)bossWalk(e,e.face,e.rage?112:84,dt);},
      choose(e,dist){if((e.phase>=1||cycle>=3)&&(e.summonCd||0)<=0){begin(e,'summon',.65);e.summonCd=7;return;}if(dist<160)begin(e,'slam',e.rage?.42:.55);else if(dist<340&&Math.random()<.62)begin(e,'lash',e.rage?.48:.62);else{begin(e,'charge',e.rage?.5:.72);e.combo=e.rage?2:1;}},
      tick(e,dt){const ec=e.x+e.w/2;if(e.move==='charge'&&Math.random()<dt*22){emit_particles(ec-e.face*(18+Math.random()*16),e.y-4,(Math.random()-.5)*30,-70-Math.random()*50,.7,.7,'#e4ebee',3+Math.random()*4,-.12,undefined,undefined,undefined,true);if(Math.random()<.35)dust(ec+e.face*44,FLOOR,2,-e.face);}},
      release(e){const f=e.face,ec=e.x+e.w/2;
        if(e.move==='summon'){for(let i=0;i<2;i++)enemies.push(enemy(clamp(ec+(i?100:-120),L.gate+20,L.seal-70),FLOOR,'crawler'));say('守锁兽召来了爬虫',1.4);recover(e,.55,1.4);return;}
        if(e.move==='slam'){strike(e,ec,FLOOR-110,ec+f*156,FLOOR,28);dust(ec+f*70,FLOOR,14,0);burst(ec+f*80,FLOOR-6,'#c9a865',10);punchShake(4);beep(66,.32,'sawtooth');if(e.rage){waves.push({x:ec-20,dir:-1,life:1.8},{x:ec+20,dir:1,life:1.8});bellRing=Math.max(bellRing,.6);}recover(e,.62,e.rage?.65:.95);}
        else if(e.move==='lash'){startAct(e,.38);beep(240,.18,'sawtooth');}
        else{startAct(e,1.9);e.vx=f*(e.rage?650:560);beep(90,.4,'sawtooth');}},
      active(e,dt){const f=e.face;
        if(e.move==='lash'){const h=lashHead(e);strike(e,h[0]-20,h[1]-20,h[0]+20,h[1]+20,24);if(e.act<=.07&&!e.slapped){e.slapped=true;dust(h[0],FLOOR,9,0);burst(h[0],FLOOR-8,'#c9a865',8);shake=Math.max(shake,5);beep(80,.2,'square');if(e.rage)waves.push({x:h[0],dir:f,life:1.2});}return;}
        const B=bounds(e);e.x+=e.vx*dt;if(Math.random()<dt*30)dust(e.x+e.w/2-f*44,FLOOR,1,-f);strike(e,e.x+4,e.y+8,e.x+e.w-4,FLOOR,22);
        if(e.x<=B[0]||e.x>=B[1]){e.x=clamp(e.x,B[0],B[1]);e.act=0;e.vx=0;const wx=f>0?e.x+e.w+10:e.x-10;shake=Math.max(shake,13);hitstop=Math.max(hitstop,.06);burst(wx,FLOOR-40,'#ffd08a',18);dust(wx,FLOOR,12,-f);beep(55,.45,'square');rocks(e.rage?5:3);
          if(--e.combo>0){e.face=-f;begin(e,'charge',.42);}else{e.stun=true;recover(e,e.rage?.95:1.35,.5);}}},
      finish(e){if(e.move==='lash')recover(e,.5,e.rage?.7:1);else recover(e,.45,.8);}},
    // 溺灯：浮在水面保持距离；灯门一开喷出抛物线腐潮弹（落地留腐水）；触须横扫；沉进水里追到你脚下再冒出；二阶段放灯蛾
    brood:{roar:1,
      idle(e,dt,dist){const pc=p.x+p.w/2,ec=e.x+e.w/2,want=pc+(ec>pc?1:-1)*230;if(Math.abs(want-ec)>24)bossWalk(e,want>ec?1:-1,e.rage?96:70,dt);
        if(e.spellCd<=0){begin(e,'dive',.5);e.spellCd=e.rage?3.8:5.4;}else if(e.rage&&(e.mothCd-=dt)<=0){begin(e,'moths',.5);e.mothCd=6.2;}},
      choose(e,dist){if((e.phase>=1||cycle>=3)&&(e.zoneCd||0)<=0){begin(e,'zones',.7);e.zoneCd=7.5;return;}if(dist<180)begin(e,'sweep',e.rage?.42:.52);else begin(e,'spit',e.rage?.52:.7);},
      tick(e,dt){if(e.move==='dive')e.under=Math.min(1,e.under+dt/e.wt);else if(e.move==='spit'&&Math.random()<dt*20)emit_particles(e.x+e.w/2+e.face*20+(Math.random()-.5)*20,e.y+40,(Math.random()-.5)*30,-30-Math.random()*40,.5,.5,'#cfffb0',1.5+Math.random()*2,-.2,true,undefined,undefined,undefined);},
      release(e){const f=e.face,ec=e.x+e.w/2,pc=p.x+p.w/2;
        if(e.move==='zones'){hazards.push({k:'pool',x:L.gate+180,w:240,life:3.4,max:3.4,d:Math.round(10*L.dmgK)},{k:'pool',x:L.seal-180,w:240,life:3.4,max:3.4,d:Math.round(10*L.dmgK)});say('左右是腐水，站到中间',1.6);recover(e,.6,1.5);return;}
        if(e.move==='spit'){const n=e.rage?5:3;for(let i=0;i<n;i++){const o=i-(n-1)/2,sx=ec+f*24,sy=e.y+44,tx=clamp(pc+o*74,L.gate+20,L.seal-20),T=.8+Math.abs(o)*.07,g=780;emit_shots('glob',sx,sy,(tx-sx)/T,(FLOOR-8-sy)/T-.5*g*T,g,3,Math.round(13*L.dmgK),e.rage?3:2.2,undefined,undefined,undefined,undefined,undefined,undefined);}burst(ec+f*24,e.y+44,'#b8f08a',12);beep(170,.3,'sawtooth');recover(e,.55,e.rage?.85:1.2);}
        else if(e.move==='sweep'){startAct(e,.32);beep(130,.2,'sawtooth');}
        else if(e.move==='moths'){for(let i=0;i<3;i++)emit_shots('moth',ec+(i-1)*30,e.y+30,(i-1)*70,-90,undefined,7,Math.round(10*L.dmgK),undefined,1,100,undefined,undefined,undefined,undefined);beep(900,.2,'sine');recover(e,.45,.6);}
        else{startAct(e,1.3);e.under=1;}},
      active(e,dt){const f=e.face,ec=e.x+e.w/2,pc=p.x+p.w/2;
        if(e.move==='sweep'){strike(e,ec,FLOOR-64,ec+f*215,FLOOR,22);return;}
        if(e.act>.42)bossWalk(e,pc>ec?1:-1,Math.min(300,Math.abs(pc-ec)*4),dt);   // 在水下追到你脚下：跟着气泡走；气泡停下的那一下就是该躲的时候
        if(Math.random()<dt*28)emit_particles(ec+(Math.random()-.5)*46,FLOOR-2,(Math.random()-.5)*20,-40-Math.random()*60,.5,.5,'#cfffb0',1.5+Math.random()*2.5,-.2,true,undefined,undefined,undefined);},
      finish(e){const ec=e.x+e.w/2;
        if(e.move==='dive'){e.surfacing=true;e.struck=false;strike(e,ec-58,FLOOR-180,ec+58,FLOOR,24);for(let i=0;i<34;i++){const a=-Math.PI/2+(Math.random()-.5)*1.4,v=160+Math.random()*320;emit_particles(ec+(Math.random()-.5)*50,FLOOR-4,Math.cos(a)*v,Math.sin(a)*v,.5+Math.random()*.4,.9,i%3?'#7fbf5a':'#d8ffb0',2+Math.random()*3,1,undefined,undefined,undefined,undefined);}shake=Math.max(shake,8);beep(90,.4,'sawtooth');recover(e,.85,.7);}
        else recover(e,.55,.9);}},
    // 无名旗手：收枪突刺、立旗召出一路灵枪、挥旗卷起贴地的风、近身横扫；二阶段跃起从头顶坠下
    standard:{roar:1,
      idle(e,dt,dist){if(dist>190)bossWalk(e,e.face,e.rage?124:96,dt);else if(dist<70)bossWalk(e,-e.face,80,dt);
        if(e.spellCd<=0&&dist<580){begin(e,'plant',e.rage?.5:.68);e.spellCd=e.rage?4.4:5.8;}},
      choose(e,dist){if((e.phase>=1||cycle>=3)&&(e.weakCd||0)<=0){begin(e,'expose',.6);e.weakCd=6.5;return;}if(e.rage&&dist>120&&Math.random()<.5)begin(e,'leap',.36);else if(dist<140)begin(e,'sweep',e.rage?.32:.4);else if(dist<460&&Math.random()<.7)begin(e,'thrust',e.rage?.38:.48);else begin(e,'gust',e.rage?.42:.55);},
      tick(e,dt){if(e.move==='plant'&&Math.random()<dt*24)emit_particles(e.x+e.w/2+(Math.random()-.5)*30,e.y-40+Math.random()*30,(Math.random()-.5)*20,-40-Math.random()*30,.6,.6,'#d8b3ff',1.5+Math.random()*2,-.15,true,undefined,undefined,undefined);},
      release(e){const f=e.face,ec=e.x+e.w/2;
        if(e.move==='expose'){e.weak=1.5;say('旗帜露出破绽，打高处那一点',1.6);fx.push({k:'ring',x:ec,y:e.y+16,life:.4,max:.4,r:40});recover(e,.4,1.3);return;}
        if(e.move==='sweep'){startAct(e,.24);beep(260,.12,'sawtooth');}
        else if(e.move==='thrust'){startAct(e,.34);e.vx=f*860;beep(300,.18,'sawtooth');}
        else if(e.move==='gust'){waves.push({x:ec+f*40,dir:f,life:1.8,k:'gust',h:46,v:300,d:16,push:300});beep(180,.35,'triangle');recover(e,.5,e.rage?.7:1);}
        else if(e.move==='plant'){for(let i=1;i<=6;i++){spear(ec+f*(48+i*92),.22+i*.17);if(e.rage&&i<=4)spear(ec-f*(48+i*92),.22+i*.17);}dust(ec+f*34,FLOOR,10,0);shake=Math.max(shake,6);beep(100,.4,'square');recover(e,1.25,.8);}
        else{startAct(e,1.1);beep(200,.2,'triangle');}},
      active(e,dt){const f=e.face,ec=e.x+e.w/2,B=bounds(e);
        if(e.move==='sweep'){strike(e,ec,FLOOR-96,ec+f*145,FLOOR-10,24);return;}
        if(e.move==='thrust'){e.x=clamp(e.x+e.vx*dt,B[0],B[1]);e.vx*=Math.pow(.05,dt);if(!strike(e,ec+f*(e.w/2+30),FLOOR-84,ec+f*(e.w/2+120),FLOOR-30,24))strike(e,e.x,e.y,e.x+e.w,FLOOR,18);return;}
        // 跃击：跳起 → 悬在你头顶 → 连人带枪坠下，落地震出冲击波
        const el=e.at-e.act,pc=p.x+p.w/2;
        if(el<.34){e.lift=260*Math.sin(el/.34*Math.PI/2);e.x=clamp(e.x+(pc-ec)*Math.min(1,dt*4),B[0],B[1]);}
        else if(el<.6){e.lift=260;e.x=clamp(e.x+(pc-ec)*Math.min(1,dt*2.5),B[0],B[1]);}
        else if(e.lift>0){e.lift=Math.max(0,e.lift-dt*1500);if(!e.lift){strike(e,ec-72,FLOOR-130,ec+72,FLOOR,26);dust(ec,FLOOR,16,0);shake=Math.max(shake,11);beep(60,.45,'square');waves.push({x:ec-24,dir:-1,life:1.4},{x:ec+24,dir:1,life:1.4});}}
        e.y=e.floor-e.h-e.lift;},
      finish(e){e.lift=0;e.y=e.floor-e.h;if(e.move==='leap')recover(e,.7,.8);else if(e.move==='thrust')recover(e,.55,e.rage?.7:.95);else recover(e,.45,.85);}},
    // 沉钟典狱长：举锤砸地（二阶段带两道冲击波）、高举魂灯放出魂火、魂灯横扫；二阶段敲响头顶的钟，钟声只能翻滚穿过
    warden:{roar:.9,
      idle(e,dt,dist){if(dist>150)bossWalk(e,e.face,e.rage?110:82,dt);
        if(e.spellCd<=0&&dist>130&&dist<600){begin(e,'lantern',.72);e.spellCd=e.rage?2.8:4;}
        else if(e.rage&&(e.tollCd-=dt)<=0&&dist<680){begin(e,'toll',.5);e.tollCd=5.2;}},
      choose(e,dist){if((e.phase>=2||cycle>=3)&&(e.chaseCd||0)<=0){begin(e,'chase',.62);e.chaseCd=6;return;}if(dist<155)begin(e,'slam',e.rage?.42:.55);else if(dist<280)begin(e,'sweep',.48);else begin(e,'slam',.78);},
      tick(e,dt){if(e.move==='lantern'&&Math.random()<dt*26)emit_particles(e.x+e.w/2-e.face*14+(Math.random()-.5)*26,e.y+4+Math.random()*20,(Math.random()-.5)*30,-30-Math.random()*40,.5,.5,'#bff5ea',1.4+Math.random()*2,-.2,true,undefined,undefined,undefined);},
      release(e){const f=e.face,ec=e.x+e.w/2,pc=p.x+p.w/2;
        if(e.move==='chase'){startAct(e,1.15);say('他贴上来了，往旁边走',1.2);beep(90,.2,'sawtooth');return;}
        if(e.move==='slam'){strike(e,ec,FLOOR-120,ec+f*152,FLOOR,28);dust(ec+f*80,FLOOR,12,0);burst(ec+f*90,FLOOR-8,'#e6a575',12);punchShake(4);beep(120,.35,'square');if(e.rage){waves.push({x:ec-12,dir:-1,life:1.8},{x:ec+12,dir:1,life:1.8});bellRing=Math.max(bellRing,.8);}recover(e,.5,e.rage?.8:.95);}
        else if(e.move==='sweep'){startAct(e,.3);beep(220,.15,'sawtooth');}
        else if(e.move==='lantern'){e.spell=false;const bx=ec+f*10,by=e.y+40,ang=Math.atan2(p.y+22-by,pc-bx);(e.rage?[-.2,0,.2]:[0]).forEach(v=>emit_shots('flame',bx,by,Math.cos(ang+v)*260,Math.sin(ang+v)*260,undefined,3,Math.round(13*L.dmgK),undefined,e.rage?.5:0,260,true,'#8be1ce',undefined,undefined));burst(bx,by,'#bff5ea',12);beep(180,.25,'sawtooth');recover(e,.45,1.1);}
        else{waves.push({x:ec-24,dir:-1,life:2,k:'toll',h:150,v:330,d:20},{x:ec+24,dir:1,life:2,k:'toll',h:150,v:330,d:20});bellRing=1.6;shake=Math.max(shake,9);beep(98,.9,'triangle');beep(196,.7,'sine');recover(e,.7,.8);}},
      active(e,dt){if(e.move==='chase'){const pc=p.x+p.w/2,ec=e.x+e.w/2;e.face=pc<ec?-1:1;bossWalk(e,e.face,280,dt);strike(e,e.x-6,e.y,e.x+e.w+6,e.y+e.h,20);return;}const f=e.face,ec=e.x+e.w/2;strike(e,ec+f*20,FLOOR-112,ec+f*175,FLOOR-36,22);},
      finish(e){recover(e,.5,.9);}}};
  // 二阶段的身上特效：守锁兽冒蒸汽和火星、溺灯漏出绿火、旗手的旗燃起灵火、典狱长的魂灯漏光
  function rageFx(e){const ec=e.x+e.w/2,f=e.face,k=e.kind;
    if(k==='lock'){if(Math.random()<.5)emit_particles(ec-f*(18+Math.random()*16),e.y-4,(Math.random()-.5)*20,-50-Math.random()*40,.7,.7,'#e4ebee',3+Math.random()*3,-.12,undefined,undefined,undefined,true);else ember(ec+f*36,e.y+46,1,'#ff9a3a');}
    else if(k==='brood')ember(ec+(Math.random()-.5)*60,e.y+30+Math.random()*40,1,'#b8f08a');
    else if(k==='standard')ember(ec-f*(20+Math.random()*40),e.y-30-Math.random()*50,1,'#d8b3ff');
    else ember(ec-f*20+(Math.random()-.5)*20,e.y+60+Math.random()*20,1,Math.random()<.5?'#8be1ce':'#ff9a50');}
  const PHASE_LINE={lock:['','锁链崩开 · 它会召来爬虫','铜壳裂开，碎石不停往下落'],brood:['','水面分成左右两区，站到中间','灯蛾成群扑出来'],standard:['','旗帜露出破绽，打高处那一点','他跃起来，从头顶砸下'],warden:['','魂灯烧得更旺','他贴上来追，逼你走位']};
  function bossAI(e,dt){const A=BOSS_AI[e.kind],pc=p.x+p.w/2,ec=e.x+e.w/2,dist=Math.abs(pc-ec);
    if(e.surfacing){e.under=Math.max(0,e.under-dt/.3);if(!e.under)e.surfacing=false;}
    if(e.phaseInv>0)e.phaseInv=Math.max(0,e.phaseInv-dt);
    if(e.weak>0)e.weak=Math.max(0,e.weak-dt);
    if(e.summonCd>0)e.summonCd-=dt;if(e.zoneCd>0)e.zoneCd-=dt;if(e.weakCd>0)e.weakCd-=dt;if(e.chaseCd>0)e.chaseCd-=dt;
    if(e.rage&&Math.random()<dt*(lowFx?6:14))rageFx(e);
    const ph=e.hp<=e.max*.33?2:e.hp<=e.max*.66?1:0;
    if((e.phase||0)<ph){if(p.attack>0||p.charge>0)return;e.phase=ph;e.rage=ph>=1;e.phase3=ph>=2;e.phaseInv=1.5;e.move='';e.wind=e.act=0;e.vx=0;e.spell=false;e.stun=false;if(e.lift){e.lift=0;e.y=e.floor-e.h;}if(e.under)e.surfacing=true;e.roar=true;recover(e,1.5,1.2);punchShake(6);flashT=Math.max(flashT,.22);bellRing=Math.max(bellRing,1.4);burst(ec,e.y+30,BOSSES[e.kind].color,26);bossCue('rage');say((PHASE_LINE[e.kind]||[])[ph]||BOSSES[e.kind].rage,2.6);saveRun();return;}
    e.spellCd-=dt;
    if(e.wind>0){e.wind-=dt;if(A.tick)A.tick(e,dt);if(e.wind<=0){e.wind=0;A.release(e);}return;}
    if(e.act>0){e.act-=dt;A.active(e,dt);if(e.act<=0&&e.wind<=0&&e.rec<=0){e.act=0;A.finish(e);}return;}
    if(e.rec>0){e.rec-=dt;if(e.rec<=0){e.stun=false;e.roar=false;}return;}
    e.move='';e.face=pc<ec?-1:1;A.idle(e,dt,dist);if(e.move)return;if(e.cd<=0)A.choose(e,dist);}
  // ---- 新敌人的行动：飞蝠俯冲、骨巫施法和闪现、投弹手抛罐。出手前只有动作预兆（扬翅后仰、举杖聚光、手臂后摆），不画警示 ----
  const bossShielded=e=>e.type==='boss'&&((L.arena&&!flags.boss)||e.under>.5||e.phaseInv>0);
  const onScreen=e=>e.x+e.w>cam&&e.x<cam+W;
  function castFoe(e){const ex=e.x+e.w/2+e.face*14,ey=e.y+2;
    if(e.cast===1){for(let i=0;i<3;i++)emit_shots('wisp',ex,ey,e.face*(60+i*40),-150+i*75,undefined,3.4,12,undefined,.9,150,undefined,undefined,0,undefined);beep(660,.15,'sine');beep(990,.2,'sine');}
    else{const px=p.x+p.w/2;[-1,0,1].forEach((o,i)=>hazards.push({k:'spear',x:px+o*50,delay:.6+i*.12,life:.5,max:.5,d:14,warm:L.theme==='tower'}));beep(300,.2,'triangle');}}
  function lob(e){const ex=e.x+e.w/2+e.face*10,ey=e.y+4,tx=p.x+p.w/2+p.vx*.3,T1=.95,g=900,acidy=L.theme==='sewers';emit_shots('glob',ex,ey,(tx-ex)/T1,(FLOOR-6-ey-.5*g*T1*T1)/T1,g,3,12,acidy?2.2:1.6,undefined,undefined,undefined,undefined,0,!acidy);beep(240,.12,'square');}
  const FOE_AI={
    flyer(e,dt,dx){const pc=p.x+p.w/2,ec=e.x+e.w/2,hy=e.floor-150-e.h/2+Math.sin(time*2.2+e.seed)*14,spd=1-.1*Math.min(3,cycle);
      if(e.fly==='dive'){e.x+=e.dvx*dt;e.y+=e.dvy*dt;e.ft-=dt;if(!e.struck&&p.inv<=0&&overlapP(e.x+4,e.y+4,e.x+e.w-4,e.y+e.h-2)){e.struck=true;hurt(12,ec,false,'被囚灯蛾俯冲击中');}if(e.ft<=0||e.y+e.h>=e.floor-4){e.y=Math.min(e.y,e.floor-e.h-4);e.fly='rise';e.cd=1.15*spd;}}
      else if(e.fly==='rise'){e.y+=(hy-e.y)*Math.min(1,dt*2.6);e.x+=(e.hx-e.x)*Math.min(1,dt*.8);if(Math.abs(e.y-hy)<8)e.fly='hover';}
      else if(e.wind>0){e.wind-=dt;e.y-=20*dt;e.x-=e.face*26*dt;if(e.wind<=0){const tx=pc-e.w/2,ty=p.y+p.h*.55-e.h/2,d=Math.hypot(tx-e.x,ty-e.y)||1,sp=560;e.dvx=(tx-e.x)/d*sp;e.dvy=(ty-e.y)/d*sp;e.ft=Math.min(.9,d/sp+.16);e.fly='dive';e.struck=false;beep(520,.1,'triangle');}}
      else{const want=clamp(pc-e.w/2-e.face*110,e.origin-420,e.origin+420);e.hx=want;e.x+=clamp(want-e.x,-140*dt,140*dt);e.y+=(hy-e.y)*Math.min(1,dt*2);
        if(e.cd<=0&&Math.abs(dx)<290&&p.y+p.h>e.y+e.h&&onScreen(e))e.wind=e.wt=.42*spd;}
      e.x=clamp(e.x,e.origin-440,e.origin+440);},
    caster(e,dt,dx){const spd=1-.1*Math.min(3,cycle),B=bounds(e);
      if(e.blink>0){e.blink-=dt;if(e.blink<.25&&!e.moved){e.moved=true;const opts=[e.x+260,e.x-260,e.origin].map(x=>clamp(x,B[0],B[1])).sort((a,b)=>Math.abs(b-p.x)-Math.abs(a-p.x));e.x=opts[0];burst(e.x+e.w/2,e.y+e.h/2,'#c8a8ff',10);}if(e.blink<=0)e.blink=0;return;}
      if(e.wind>0){e.wind-=dt;if(Math.random()<dt*22)ember(e.x+e.w/2+e.face*12,e.y-8,1,e.cast===1?'#9ff3e0':'#d8b3ff');if(e.wind<=0){e.swing=.3;castFoe(e);e.cd=3.2*spd;}return;}
      e.blinkCd=(e.blinkCd||0)-dt;
      if(Math.abs(dx)<128&&e.blinkCd<=0&&Math.abs(p.y+p.h-e.floor)<120){e.blink=.5;e.moved=false;e.blinkCd=4;beep(880,.08,'sine');return;}
      if(e.cd<=0&&Math.abs(dx)<440&&onScreen(e)){e.cast=(e.cast||0)%2+1;e.wind=e.wt=.8*spd;return;}
      const go=Math.abs(dx)<260?-Math.sign(dx):Math.abs(dx)>420?Math.sign(dx):0;if(go&&e.hitT<=0)e.x=clamp(e.x+go*40*dt,B[0],B[1]);},
    bomber(e,dt,dx){const spd=1-.1*Math.min(3,cycle),B=bounds(e);
      if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.swing=.25;lob(e);e.cd=2.6*spd;}return;}
      if(Math.abs(dx)<112&&e.hitT<=0)e.x=clamp(e.x-Math.sign(dx)*72*dt,B[0],B[1]);
      else if(e.cd<=0&&Math.abs(dx)<410&&onScreen(e))e.wind=e.wt=.65*spd;
      else if(Math.abs(dx)>430&&e.hitT<=0)e.x=clamp(e.x+Math.sign(dx)*50*dt,B[0],B[1]);},
    dummy(e,dt){e.idle=e.hitT>0?0:(e.idle||0)+dt;if(e.idle>1.6)e.hp=e.max;},
    crawler(e,dt,dx,dy){const spd=1-.08*Math.min(3,cycle),B=bounds(e);
      if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.swing=.16;e.lunge=.2;e.cd=.8*spd;}return;}
      if(e.lunge>0){e.lunge-=dt;e.x=clamp(e.x+e.face*280*dt,B[0],B[1]);return;}
      if(e.cd<=0&&Math.abs(dx)<132&&dy<70){e.wind=e.wt=.28*spd;return;}
      if(e.hitT<=0)e.x=clamp(e.x+e.face*(Math.abs(dx)<460?100:52)*dt,B[0],B[1]);},
    hanger(e,dt,dx){const spd=1-.08*Math.min(3,cycle);
      if(e.hang==='warn'){e.wind-=dt;e.y+=Math.sin(time*46)*dt*22;if(e.wind<=0){e.hang='drop';e.vy=20;}return;}
      if(e.hang==='drop'){e.vy=(e.vy||0)+1700*dt;e.y+=e.vy*dt;if(e.y+e.h>=e.floor-1){e.y=e.floor-e.h;e.hang='land';e.wait=.45;e.vy=0;dust(e.x+e.w/2,e.floor,5,0);}return;}
      if(e.hang==='land'){e.wait-=dt;if(e.wait<=0)e.hang='rise';return;}
      if(e.hang==='rise'){e.y+=(e.homeY-e.y)*Math.min(1,dt*2.4);if(Math.abs(e.y-e.homeY)<5){e.hang='wait';e.cd=1.05*spd;e.y=e.homeY;}return;}
      e.y=e.homeY+Math.sin(time*2.2+e.seed)*4;
      if((e.cd||0)<=0&&Math.abs(dx)<70&&p.y>e.y+10&&onScreen(e)){e.hang='warn';e.wind=e.wt=.32;}},
    lurker(e,dt,dx,dy){const spd=1-.08*Math.min(3,cycle),B=bounds(e);
      if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.lunge=.16;e.cd=.9*spd;}return;}
      if(e.lunge>0){e.lunge-=dt;e.x=clamp(e.x+e.face*220*dt,B[0],B[1]);if(Math.abs(dx)<46&&dy<48&&dx*e.face>-8){if(p.roll>0)perfectDodge(e.x+e.w/2);else hurt(Math.round(12*L.dmgK),e.x,false,'被伏灯扑中');e.lunge=0;}return;}
      if(e.cd<=0&&Math.abs(dx)<96&&dy<64){e.wind=e.wt=.3*spd;return;}
      if(e.hitT<=0&&Math.abs(dx)<240&&Math.abs(dx)>64)e.x=clamp(e.x+e.face*32*dt,B[0],B[1]);},
    spear(e,dt,dx,dy){const spd=1-.08*Math.min(3,cycle),B=bounds(e);
      if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.swing=.26;if(Math.abs(dx)<88&&dy<56&&dx*e.face>-16){if(p.roll>0)perfectDodge(e.x+e.w/2);else hurt(Math.round(14*L.dmgK),e.x,false,'被长矛刺中');}e.cd=1.2*spd;}return;}
      if(e.cd<=0&&Math.abs(dx)<128&&dy<72){e.wind=e.wt=.4*spd;return;}
      if(e.hitT<=0&&Math.abs(dx)<360&&Math.abs(dx)>72)e.x=clamp(e.x+e.face*42*dt,B[0],B[1]);}};
  // 会动的平台跟着正弦来回；站在上面的主角一起被带走。会塌的平台：踩上去抖 0.5 秒后掉下去，过一会儿再长回来
  function updatePlatforms(dt){for(const a of platforms){if(a.mv){const m=a.mv,s=(1-Math.cos(TAU*(time/m.per+m.ph)))/2,nx=m.x0+m.dx*s,ny=m.y0+m.dy*s+(L.theme==='sewers'?Math.sin(time*2.3+m.x0)*2.5:0);a.ddx=nx-a.x;a.ddy=ny-a.y;a.x=nx;a.y=ny;if(p.on===a){p.x+=a.ddx;p.y+=a.ddy;}}
      else if(a.cr){const c=a.cr;if(c.st===1){c.t-=dt;if(c.t<=0){c.st=2;c.t=2.8;c.vy=0;c.fy=0;a.off=true;dust(a.x+a.w/2,a.y+12,8,0);for(let i=0;i<6;i++)chunks.push({x:a.x+Math.random()*a.w,y:a.y+6,vx:(Math.random()-.5)*80,vy:-40-Math.random()*60,r:Math.random()*TAU,vr:(Math.random()-.5)*10,s:4+Math.random()*5,c:T.ledge[1],life:1.2,floor:9999,x0:0,x1:0});beep(120,.16,'square');}}
        else if(c.st===2){c.t-=dt;c.vy+=1300*dt;c.fy+=c.vy*dt;if(c.t<=0){c.st=0;a.off=false;c.fy=0;c.back=.5;}}if(c.back>0)c.back=Math.max(0,c.back-dt);}}}
  // 机关：都有自己的节拍（per 秒一轮），出事前先有动静——地刺先咔哒冒灰、喷泉先冒泡、骷髅眼里先聚火、落锤先停在顶上发抖
  const nearP=(x,y,r)=>{const dx=clamp(x,p.x,p.x+p.w)-x,dy=clamp(y,p.y,p.y+p.h)-y;return dx*dx+dy*dy<r*r;};
  function pistonY(t){const u=t.t/(t.per||3),top=230;if(u<.12)return FLOOR;if(u<.7){const k=(u-.12)/.58;return FLOOR-(FLOOR-top)*(1-Math.pow(1-k,2));}if(u<.86)return top;if(u<.9){const k=(u-.86)/.04;return top+(FLOOR-top)*k*k;}return FLOOR;}
  function updateTraps(dt){const pc=p.x+p.w/2,feet=p.y+p.h,vis=t=>(t.x0!=null?t.x1>cam-100&&t.x0<cam+W+100:t.x>cam-160&&t.x<cam+W+160);
    for(const t of traps){const per=t.per||3,prev=t.t;t.t=(t.t+dt)%per;const u=t.t/per;
      if(t.k==='tspike'){const up=u>=.55&&u<.9,lead=.5/per;t.warn=u>=.55-lead&&u<.55;if(t.warn&&!t.warned){t.warned=true;if(vis(t))beep(640,.08,'square',.04);}if(!t.warn)t.warned=false;if(up&&!t.up&&vis(t)){beep(300,.05,'square',.02);dust(t.x+t.n*10,FLOOR,3,0);}t.up=up;if(up&&!t.harmless&&pc>t.x-2&&pc<t.x+t.n*20+2&&feet>FLOOR-16)hurt(14,t.x+t.n*10,false,'踩中了地刺');}
      else if(t.k==='pendulum'){t.a=t.amp*Math.sin(TAU*u);t.bx=t.x+Math.sin(t.a)*t.len;t.by=t.top+Math.cos(t.a)*t.len;const u2=((t.t+.5)%per)/per,a2=t.amp*Math.sin(TAU*u2),fx=t.x+Math.sin(a2)*t.len,fy=t.top+Math.cos(a2)*t.len,soon=nearP(fx,fy,42)||nearP(t.bx,t.by,36);if(soon)t.arm=(t.arm||0)+dt;else t.arm=0;t.warn=t.arm>0&&t.arm<.5;if(t.warn&&!t.warned){t.warned=true;if(vis(t))beep(520,.06,'square',.03);}if(!t.warn)t.warned=false;if(nearP(t.bx,t.by,24)&&t.arm>=.5)hurt(14,t.bx,false,'被摆刃击中');if(Math.abs(t.a)<.05&&!t.swoosh){t.swoosh=true;if(vis(t))beep(130,.2,'sine',.02);}if(Math.abs(t.a)>.2)t.swoosh=false;}
      else if(t.k==='spout'){const h=t.h||200,on=u>=.62&&u<.9,lead=.5/per;t.warn=u>=.62-lead&&u<.62;if(t.warn&&!t.warned&&vis(t)){t.warned=true;beep(520,.1,'square',.035);}if(!t.warn)t.warned=false;if(on&&!t.on&&vis(t)){if(t.fire)ember(t.x,FLOOR-10,10,'#ffb347');else splash(t.x,FLOOR-6);beep(t.fire?120:180,.25,'sawtooth',.025);}t.on=on;
        if(t.warn&&Math.random()<dt*20)emit_particles(t.x+(Math.random()-.5)*20,FLOOR-3,(Math.random()-.5)*14,-40-Math.random()*50,.45,.45,t.fire?'#ffb347':'#b8f08a',1.6+Math.random()*2,-.1,!!t.fire,undefined,undefined,!t.fire);
        if(on&&Math.abs(pc-t.x)<22&&feet>FLOOR-h&&p.y<FLOOR)hurt(14,t.x,false,t.fire?'被炉火喷到':'被腐水喷到');}
      else if(t.k==='vent'){const h=t.h||200,base=t.y||FLOOR;t.on=u>=.45;if(t.on&&Math.abs(pc-t.x)<(t.w||64)/2&&feet>base-h&&p.y<base&&p.dash<=0){p.vy=Math.max(-470,p.vy-3300*dt);if(p.vy<0){p.ground=false;p.jumps=Math.min(p.jumps,1);p.drop=null;}}}
      else if(t.k==='wind'){const on=u>=.5&&u<.95;t.warn=u>=.38&&u<.5;if(on&&!t.on&&vis(t))beep(160,.6,'sine',.02);t.on=on;if(on&&pc>t.x0&&pc<t.x1&&p.roll<=0&&p.dash<=0)p.x=clamp(p.x+t.dir*(p.ground?115:165)*dt,12,WORLD-45);}
      else if(t.k==='ballista'){if(t.broken)continue;if(t.t<prev&&vis(t)){emit_shots('bolt',t.x+t.dir*30,t.y-24,t.dir*560,0,undefined,t.teach?.42:3.2,14,undefined,undefined,undefined,undefined,undefined,0,undefined);beep(150,.12,'square');beep(900,.05,'triangle');t.kick=.2;}if(t.kick>0)t.kick-=dt;}
      else if(t.k==='jet'){const on=u>=.62&&u<.9,x0=Math.min(t.x,t.x+t.dir*t.len),x1=Math.max(t.x,t.x+t.dir*t.len),lead=.5/per;t.warn=u>=.62-lead&&u<.62;if(t.warn&&!t.warned&&vis(t)){t.warned=true;beep(700,.08,'triangle',.03);}if(!t.warn)t.warned=false;if(on&&!t.on&&vis(t))beep(110,.4,'sawtooth',.02);t.on=on;if(on&&p.x+p.w>x0+4&&p.x<x1&&p.y<t.y+12&&feet>t.y-12)hurt(14,t.x,false,'被喷火击中');if(t.warn&&Math.random()<dt*14)ember(t.x+t.dir*8,t.y,1,'#c58bff');}
      else if(t.k==='piston'){const w=t.w||80,hb=pistonY(t),slam=u>=.86&&u<.92;t.hb=hb;if(u>=.9&&!t.hit0){t.hit0=true;if(vis(t)){shake=Math.max(shake,5);dust(t.x+w/2,FLOOR,10,0);beep(70,.25,'square');}}if(u<.86)t.hit0=false;
        if(p.x+p.w>t.x+2&&p.x<t.x+w-2&&hb>p.y+4){if(slam)hurt(14,t.x+w/2,false,'被落锤砸中');if(pc<t.x+w/2)p.x=t.x-p.w;else p.x=t.x+w;p.vx=0;}}}}
  // 教程石碑：走近就在下方说明（按键跟着设置走），每块石碑把生命补满
  function updateSigns(){if(!L.signs)return;const pc=p.x+p.w/2;let i=-1;L.signs.forEach((s,j)=>{if(Math.abs(pc-s.x)<150)i=j;});if(i<0)return;const s=L.signs[i];
    if(i!==signAt){signAt=i;say(s.t(),5);beep(700,.06,'sine');if(s.soul){p.soul=3;hudKey='';}if(s.gift&&!flags.gift){flags.gift=true;gain('bomb',2);p.potions=Math.max(p.potions,1);}if(p.hp<p.max){p.hp=p.max;hudKey='';}}else if(messageT<.3)say(s.t(),1);}
  // 技能的持续效果：影步斩冲过去砍、魂灯环绕身烧敌并挡下飞来的东西、钟罩把飞来的东西撞碎
  function dashHits(){enemies.forEach(e=>{if(e.dead||p.dashHit.has(e)||bossShielded(e))return;if(p.x+p.w>e.x-8&&p.x<e.x+e.w+8&&p.y+p.h>e.y&&p.y<e.y+e.h){p.dashHit.add(e);hitEnemy(e,p.damage*1.3,p.face,true,e.x+e.w/2,p.y+p.h/2,p.face>0?0:Math.PI);}});
    breakables.forEach(b=>{if(!b.broken&&Math.abs(b.x-p.x-p.w/2)<20&&p.y+p.h>b.y-30)breakCache(b);});}
  function ringHits(dt){p.ringT=Math.max(0,p.ringT-dt);for(let i=0;i<3;i++){const a=time*5+i*TAU/3,ox=p.x+p.w/2+Math.cos(a)*48,oy=p.y+p.h/2-4+Math.sin(a)*38;
      enemies.forEach(e=>{if(e.dead||e.ringCd>time||bossShielded(e))return;if(ox>e.x-10&&ox<e.x+e.w+10&&oy>e.y-10&&oy<e.y+e.h+10){e.ringCd=time+.4;hitEnemy(e,8+p.damage*.4,ox<e.x+e.w/2?1:-1,false,ox,oy,null,true);}});
      shots.forEach(s=>{if(s.life>0&&Math.abs(s.x-ox)<18&&Math.abs(s.y-oy)<18){s.life=0;cutShot(s);}});}}
  function domeBlock(dt){p.domeT=Math.max(0,p.domeT-dt);const cx=p.x+p.w/2,cy=p.y+p.h/2;shots.forEach(s=>{if(s.life>0&&Math.hypot(s.x-cx,s.y-cy)<46){s.life=0;clang(s.x,s.y);}});}
  // 过场：打倒首领后先放慢、首领身上裂出光、魂火往外冒，2 秒后炸开，再自动讲完倒下的对白；最终的钟声是三声钟响 + 满城魂火升起
  function updateCine(dt){const c=cine;c.t+=dt;if(c.skip&&c.t<c.dur-.4)c.t=c.dur-.4;
    if(c.k==='boss'){const e=c.e,ec=e.x+e.w/2,ey=e.y+e.h/2,B=BOSSES[c.kind];
      cam+=(clamp(ec-W/2,Math.min(L.gate-40,WORLD-W),Math.max(0,Math.min(WORLD-W,L.seal+130-W)))-cam)*Math.min(1,dt*3);
      if(!c.boom){if(Math.random()<dt*(lowFx?20:45)){const a=Math.random()*TAU,r=Math.random();emit_particles(ec+Math.cos(a)*e.w*.45*r,ey+Math.sin(a)*e.h*.45*r,Math.cos(a)*40,-60-Math.random()*140,.9,.9,Math.random()<.5?B.color:'#fff1c2',1.4+Math.random()*2,-.25,true,undefined,undefined,undefined);}
        if(Math.random()<dt*6){fx.push({k:'star',x:ec+(Math.random()-.5)*e.w,y:ey+(Math.random()-.5)*e.h,a:Math.random()*TAU,life:.14,max:.14,r:26});beep(300+Math.random()*500,.06,'triangle',.02);}
        shake=Math.max(shake,2+4*Math.min(1,c.t/2));
        if(c.t>=2.1){c.boom=true;e.dieT=0;killFx(e);flashT=.45;shake=16;fx.push({k:'ring',x:ec,y:ey,life:.6,max:.6,r:260},{k:'ring',x:ec,y:ey,life:.4,max:.4,r:150});
          for(let i=0;i<40;i++){const a=Math.random()*TAU,v=120+Math.random()*380;emit_particles(ec,ey,Math.cos(a)*v,Math.sin(a)*v-120,.6+Math.random()*.8,1.4,i%3?B.color:'#ffffff',2+Math.random()*3,.3,true,undefined,undefined,undefined);}
          for(let i=0;i<26;i++)emit_particles(ec+(Math.random()-.5)*e.w,ey+(Math.random()-.5)*e.h,(Math.random()-.5)*60,-60-Math.random()*120,2+Math.random()*1.5,3.5,'#9ff3e0',2+Math.random()*2,-.35,true,undefined,undefined,undefined);
          beep(55,1.1,'sawtooth',.05);beep(110,.9,'square',.03);}}
      if(c.t>=c.dur){cine=null;state='play';hudKey='';c.after();}}
    else if(c.k==='bell'){const bx=L.bell||1180;cam+=(clamp(bx-W/2,0,Math.max(0,WORLD-W))-cam)*Math.min(1,dt*2);
      [.25,1.35,2.45].forEach((at,i)=>{if(c.t>=at&&c.n===i){c.n++;bellRing=2.2;shake=Math.max(shake,9-i*2);fx.push({k:'ring',x:bx,y:300,life:1.4,max:1.4,r:520+i*120},{k:'ring',x:bx,y:300,life:1,max:1,r:300});bossCue('toll');
        for(let j=0;j<(lowFx?16:36);j++)emit_particles(cam+Math.random()*W,FLOOR-Math.random()*60,(Math.random()-.5)*30,-90-Math.random()*160,2.4+Math.random()*1.4,3.8,j%4?'#9ff3e0':'#ffe2a8',1.6+Math.random()*2.4,-.25,true,undefined,undefined,undefined);}});
      c.dawn=Math.min(1,c.t/3.4);if(c.t>=c.dur){cine=null;state='win';c.after();}}}
  function touchEnemies(){if(p.inv>0||dodging()||p.dash>0||p.domeT>0)return;
    for(const e of enemies){if(e.dead||e.ward||e.type==='dummy'||bossShielded(e)||(e.trainingPace>1&&e.type==='guard'))continue;
      if(p.x+p.w-5>e.x+5&&p.x+5<e.x+e.w-5&&p.y+p.h-4>e.y+6&&p.y+8<e.y+e.h-2){hurt(Math.round(12*(L.dmgK||1)),e.x+e.w/2,false,'撞上了'+(e.type==='boss'?(BOSSES[e.kind]&&BOSSES[e.kind].name)||'首领':'敌人'));return;}}}
  function springPad(){if(!L.springs)return;const feet=p.y+p.h;
    for(const s of L.springs){if(feet>s[1]-8&&feet<s[1]+12&&p.x+p.w>s[0]&&p.x<s[0]+s[2]){p.jumpRising=false;p.vy=-780-p.skills.spring*24;p.ground=false;p.jumps=1;p.on=null;dust(p.x+13,feet,6,0);burst(p.x+13,feet-6,'#ffe2a8',8);beep(196,.1,'sine');beep(392,.16,'triangle');break;}}}
  function climbRope(dt){if(!L.climbs||p.dash>0||p.roll>0)return;const D=dirs();if(!D.u&&!D.d)return;
    for(const c of L.climbs){const x=c[0],top=c[1],bot=c[2]||FLOOR;
      if(p.x+p.w>x-12&&p.x<x+18&&p.y<bot&&p.y+p.h>top+8){p.vy=D.u?-220:150;p.ground=false;p.jumps=1;p.on=null;p.x+=(x-8-p.x)*Math.min(1,dt*10);if(Math.random()<dt*8)ember(x,p.y+20,1,'#ffd7a4');break;}}}
  function currentBand(){if(!L||!L.bands)return null;const x=(p&&p.x)||cam;let b=L.bands[0];for(const q of L.bands)if(x>=q[0])b=q;return b;}
  function noteBand(){const b=currentBand();if(!b||state!=='play')return;if(!bandId){bandId=b[2];return;}if(b[2]!==bandId){bandId=b[2];say(b[1],2.2);}}
  function step(dt){if(passage){passageTick(dt);musicTick();return;}const rdt=dt;if(cine&&cine.slow&&cine.t<cine.slow)dt*=.3;if(slowMo>0){slowMo-=rdt;dt*=.35;}time+=dt;if(messageT>0){messageT-=rdt;notice.style.opacity=messageT>0?1:0;}if(gainT>0){gainT-=rdt;if(gainT<=0){gainBox.hidden=true;if(toastQ.length)toastNow(toastQ.shift());}}if(flashT>0)flashT=Math.max(0,flashT-rdt);if(state==='dead'&&deathT<9)deathT+=rdt;
    musicTick(rdt);
    if(credits){credits.t+=rdt;if(credits.t>credits.dur)endCredits();return;}
    if(paused||state==='upgrade'||state==='shop'||state==='bag'||state==='map')return;
    if(talk){sceneT+=rdt;talk.faceAge+=rdt;if(talk.arena){const boss=enemies.find(e=>e.type==='boss');if(boss){const focus=(p.x+p.w/2+boss.x+boss.w/2)/2;cam+=(clamp(focus-W*.5,0,Math.max(0,WORLD-W))-cam)*Math.min(1,rdt*3.6);if(!boss.dead){boss.face=boss.x>p.x?-1:1;p.face=-boss.face;}}}typeTalk(rdt);if(state==='talk')return;}else if(state==='talk')return;
    if(state==='play')titleT=Math.max(0,titleT-dt);
    particles.forEach(f=>{f.life-=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=250*dt*f.g;if(f.drag){const k=Math.pow(f.drag,dt);f.vx*=k;f.vy*=k;}});{let n=0;for(let i=0;i<particles.length;i++){const o=particles[i];if(o.life>0)particles[n++]=o;else particlesPool.release(o);}particles.length=n;}
    fx.forEach(f=>f.life-=dt);fx=fx.filter(f=>f.life>0);
    chunks.forEach(c=>{c.life-=dt;c.vy+=900*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;c.r+=c.vr*dt;const fl=c.x>c.x0&&c.x<c.x1?c.floor:inGap(c.x)?9999:FLOOR;if(c.y>fl-c.s*.5&&c.vy>0&&c.y<fl+20){c.y=fl-c.s*.5;c.vy*=-.35;c.vx*=.6;c.vr*=.6;}});chunks=chunks.filter(c=>c.life>0&&c.y<900);
    {let n=0;for(let i=0;i<floats.length;i++){const o=floats[i];o.life-=dt;o.y-=38*dt;if(o.life>0)floats[n++]=o;else if(o._used)floatsPool.release(o);}floats.length=n;}if(shakeT>0){shakeT-=dt;if(shakeT<=0){shakeT=0;shake=0;}}else shake=Math.max(0,shake-35*dt);bellRing=Math.max(0,bellRing-dt*.6);
    // 开箱动画：盖子慢慢掀开，开到一半时金光和火星冒出来，开完弹出三选一
    if(state==='chest'){if(chestC){chestC.openT=Math.min(1,chestC.openT+dt/.85);if(chestC.openT>.42&&!chestC.burst){chestC.burst=true;burst(chestC.x,chestC.y-26,'#ffe2a0',18);ember(chestC.x,chestC.y-22,14,'#ffd38a');shake=3;beep(880,.25,'sine');beep(1320,.3,'sine');}if(chestC.openT>=1)showOffers();}else showOffers();return;}
    if(state==='cine'){updateCine(rdt);return;}
    // 开始界面：镜头沿着第一层慢慢来回，余烬往上飘
    if(state==='menu'){cam=200+Math.max(0,WORLD-W-400)*(1-Math.cos(time*.03))/2;if(Math.random()<rdt*5)ember(cam+Math.random()*W,FLOOR-10-Math.random()*60,1,'#ffb35c');return;}
    if(state!=='play')return;if(hitstop>0){hitstop-=dt;syncHud();return;}
    inputQueue.tick(dt);p.bowRecoil=Math.max(0,(p.bowRecoil||0)-dt);p.inv=Math.max(0,p.inv-dt);p.rollCd=Math.max(0,p.rollCd-dt);p.atkCd=Math.max(0,p.atkCd-dt);p.attack=Math.max(0,p.attack-dt);p.comboT=Math.max(0,p.comboT-dt);p.buffer=Math.max(0,p.buffer-dt);p.coyote=p.ground?FEEL.coyote:Math.max(0,p.coyote-dt);p.hurtT=Math.max(0,p.hurtT-dt);p.landT=Math.max(0,p.landT-dt);
    heroFSM.tick(dt,p);if(p.rollCd<=0&&(p.attack<=0||heroFSM.canCancel())&&inputQueue.take(2))roll();if(p.atkCd<=0&&p.roll<=0&&p.dash<=0&&!p.charge&&inputQueue.take(1))attack();
    updatePlatforms(dt);
    const D=dirs(),l=D.l,r=D.r,wasRolling=p.roll>0;
    if(p.dash>0){p.dash-=dt;p.vx=p.face*960;if((p.trailT-=dt)<=0){p.trailT=.028;(p.dtrail=p.dtrail||[]).push({x:p.x+p.w/2,y:p.y+p.h,f:p.face,life:.24});}dashHits();if(p.dash<=0){p.vx=p.face*245;dust(p.x+13,p.y+p.h,5,p.face);}}
    else if(p.roll>0){p.roll-=dt;const k=Math.max(0,p.roll)/ROLL;p.vx=(p.rollDir||p.face)*(400+520*k);if((p.trailT-=dt)<=0){p.trailT=.035;p.trail.push({x:p.x+p.w/2,y:p.y+p.h-13,a:(1-k)*TAU,f:p.rollDir||p.face,life:.2});}if(p.roll<=0&&p.ground)dust(p.x+13,p.y+p.h,4,p.rollDir||p.face);}
    else{const m=(r?1:0)-(l?1:0),mul=p.char==='bell'?.74:p.char==='lamp'?1.08:1,vmax=245*mul;
      if(p.kbT>0){p.kbT-=dt;p.vx=p.kbX;}
      else if(m){p.vx+=m*(vmax/FEEL.accel)*dt;p.vx=clamp(p.vx,-vmax,vmax);}else{const s=Math.sign(p.vx);p.vx=s*Math.max(0,Math.abs(p.vx)-(vmax/FEEL.brake)*dt);}
      if(m&&!(p.attack>.1)&&!(p.kbT>0))p.face=m;}
    p.trail.forEach(t=>t.life-=dt);p.trail=p.trail.filter(t=>t.life>0);if(p.dtrail){p.dtrail.forEach(t=>t.life-=dt);p.dtrail=p.dtrail.filter(t=>t.life>0);}
    if(p.charge>0){if(isKey('attack')||down('attack')){p.charge=Math.min(p.chargeMax||.45,p.charge+dt);if(p.charge>=(p.chargeMax||.45)-.001)fireCharge(true);}else fireCharge(false);}
    else if(down('attack')||isKey('attack'))attack();
    p.castCd=Math.max(0,p.castCd-dt);const stand=p.ground&&D.d&&platforms.find(a=>!a.solid&&!a.off&&a.h<100&&Math.abs(p.y+p.h-a.y)<3&&p.x+p.w>a.x+2&&p.x<a.x+a.w-2);
    if(p.buffer>0&&stand){p.drop=stand;p.y+=3;p.vy=65;p.jumpRising=false;p.ground=false;p.coyote=0;p.jumps=1;p.buffer=0;p.on=null;dust(p.x+13,p.y+p.h,4,0);}
    else if(p.buffer>0&&(p.coyote>0||(p.char==='lamp'&&p.jumps<2))){p.vy=p.cutQueued?-230:-FEEL.jumpSpeed-p.skills.spring*30;p.jumps=p.coyote>0?1:2;p.jumpRising=!p.cutQueued;p.cutQueued=false;p.ground=false;p.coyote=0;p.buffer=0;p.on=null;if(p.jumps>1)burst(p.x+13,p.y+44,'#9fe0d4',8);else dust(p.x+13,p.y+p.h,5,0);beep(340,.07);}
    const was=p.ground,fall=p.vy;
    if(p.drop&&p.y>=p.drop.y)p.drop=null;if(p.dash>0)p.vy=0;else p.vy+=(p.vy>40?FEEL.grav*FEEL.fall:FEEL.grav)*dt;
    let travel=(p.vx+(p.kickX||0))*dt;
    if(p.rollFromGround){
      if(p.vy<0||p.drop||p.dash>0||(!wasRolling&&(l||r||!travel)))p.rollFromGround=false;
      else {
        const safe=physics.limitGroundRoll(p,travel,platforms);
        if(safe!==travel){travel=safe;p.vx=0;p.kickX=0;}
      }
    }
    physics.move(p,travel,p.vy*dt,platforms,FLOOR);p.x=clamp(p.x,12,WORLD-45);lessonTick();guideTick(dt);p.on=null;
    if(p.kickX){p.kickX*=Math.pow(.0001,dt);if(Math.abs(p.kickX)<4)p.kickX=0;}
    const landed=physics.landed;if(landed){p.jumpRising=false;const a=landed;if(a.mv||a.cr)p.on=a;if(a.cr&&!a.cr.st){a.cr.st=1;a.cr.t=.5;beep(220,.05,'square',.02);}if(a.w>=120&&!a.mv&&!a.cr){p.safeX=clamp(p.x,a.x+40,a.x+a.w-p.w-40);p.safeY=a.y-p.h;}springPad();}
    climbRope(dt);
    const cameraTarget=Math.min(verticalBase,p.y-120);viewY+=(cameraTarget-viewY)*Math.min(1,dt*8);
    if(!was&&p.ground){p.landT=.12;beep(160,.05,'sine',.03);if(fall>360)dust(p.x+13,p.y+p.h,7,0);}
    if(p.ground)p.walk+=Math.abs(p.vx)*dt*.085;
    updateCape(dt);
    if(p.ground&&Math.abs(p.vx)>150&&Math.random()<dt*(lowFx?3:8))ember(p.x+13-p.face*8,p.y+30,1,'#ffb066');
    if(checkpoint&&Math.random()<dt*(lowFx?4:9))ember((L.checkpoint||CHECKPOINT)+(Math.random()-.5)*16,FLOOR-48,1,'#ffb35c');
    if(L.rest&&Math.random()<dt*(lowFx?5:12))ember(L.fire+(Math.random()-.5)*22,FLOOR-26,1,'#ffb35c');
    // 掉下断崖：扣血，回到最后站稳的地方；掉进腐水深潭也一样，只是溅起一片绿水
    const pit=L.gaps.find(g=>p.x+p.w/2>g[0]&&p.x+p.w/2<g[1]),acidPit=!!(pit&&pit[2]==='acid');
    if(p.y>(acidPit?FLOOR+24:700)){if(acidPit){splash(p.x+p.w/2,FLOOR+2);burst(p.x+13,FLOOR,'#9be36a',14);}const d=Math.round(20*L.dmgK);p.inv=0;hurt(d,p.x+10,false,acidPit?'跌进了腐水':'跌下了断崖');Object.assign(p,{x:p.safeX,y:p.safeY,vx:0,vy:0,roll:0,rollFromGround:false,dash:0,cape:null,on:null});followEmber(0,true);if(state==='play')say(acidPit?'跌进了腐水':'跌下了断崖',1.5);}
    // 刀的有效判定只在出刀前 0.15 秒；空中下劈碰到尖刺也会弹起来（可以踩着尖刺过去），毒水不行
    const SA=heroFSM.hitbox&&p.attack>0&&(p.char!=='bow'||p.slash==='down')?slashArea():null;
    if(SA&&p.slash==='down'&&!p.pogo&&!p.ground&&(L.spikes.some(s=>inArea(SA,s[0],FLOOR-18,s[0]+s[1]*20-4,FLOOR))||traps.some(t=>t.k==='tspike'&&t.up&&inArea(SA,t.x,FLOOR-18,t.x+t.n*20-4,FLOOR)))){p.pogo=true;p.vy=-470;p.jumps=1;burst(SA.x,FLOOR-16,'#dfe6ea',8);fx.push({k:'star',x:SA.x,y:FLOOR-16,a:0,life:.1,max:.1,r:18});beep(420,.08);}
    if(!run.cacheTip&&breakables.some(b=>!b.broken&&Math.abs(b.x-p.x)<140)){run.cacheTip=true;say('攻击击碎发光的陶罐，可以找到补给',2.5);}
    if(SA)breakables.forEach(b=>{if(!b.broken&&inArea(SA,b.x-13,b.y-31,b.x+13,b.y))breakCache(b);});
    // 暗格的假墙：每刀算一下；墙缝里不时掉灰，提示这面墙不一样
    if(secrets.length){secrets.forEach((s,i)=>{if(s.shake>0)s.shake-=dt;if(s.open){if(s.t<1)s.t+=dt;return;}if(SA&&!p.hit.has(s)&&inArea(SA,s.x-30,s.y-84,s.x+30,s.y)){p.hit.add(s);hitSecret(s,i);}if(Math.random()<dt*(relics.guide?3:1.1)&&Math.abs(s.x-p.x)<W)emit_particles(s.x+(Math.random()-.5)*44,s.y-84+Math.random()*10,(Math.random()-.5)*6,14+Math.random()*12,1.4,1.4,relics.guide?'#ffd27a':'#a49a88',1.2+Math.random(),.06,!!relics.guide,undefined,undefined,true);});}
    // 城墙的弩炮：砍三下就散架
    if(SA)traps.forEach(t=>{if(t.k!=='ballista'||t.broken||p.hit.has(t)||!inArea(SA,t.x-28,t.y-46,t.x+28,t.y))return;p.hit.add(t);t.hp=(t.hp==null?3:t.hp)-1;clang(SA.x,SA.y);t.kick=.15;if(t.hp<=0){t.broken=true;burst(t.x,t.y-20,'#b08a5a',18);dust(t.x,t.y,8,0);for(let i=0;i<8;i++)chunks.push({x:t.x+(Math.random()-.5)*40,y:t.y-20-Math.random()*20,vx:(Math.random()-.5)*240,vy:-120-Math.random()*200,r:Math.random()*TAU,vr:(Math.random()-.5)*14,s:4+Math.random()*6,c:i%2?'#6a4a2f':'#8a6a44',life:1.4,floor:t.y,x0:t.x-400,x1:t.x+400});beep(160,.3,'square');score+=10;}});
    L.spikes.forEach((s,i)=>{const on=p.x>s[0]&&p.x<s[0]+s[1]*20&&p.y+p.h>FLOOR-13,id='sp'+i;if(on){arm[id]=(arm[id]||0)+dt;s.warn=arm[id]<.5;if(arm[id]>=.5)hurt(Math.round(16*L.dmgK),p.x+20,false,'踩中了尖刺');}else{arm[id]=0;s.warn=false;}});
    L.acid.forEach((s,i)=>{const on=p.x+p.w/2>s[0]+4&&p.x+p.w/2<s[0]+s[1]-4&&p.y+p.h>FLOOR-8,id='ac'+i;if(on){arm[id]=(arm[id]||0)+dt;s.warn=arm[id]<.5;if(arm[id]>=.5){if(p.inv<=0)burst(p.x+13,FLOOR-4,'#d6ff6a',12);hurt(Math.round(14*L.dmgK),s[0]+s[1]/2,false,'踩进了腐水');}}else{arm[id]=0;s.warn=false;}});
    updateTraps(dt);updateSigns();teachOnRoad();if(p.ringT>0)ringHits(dt);if(p.domeT>0)domeBlock(dt);if(state!=='play')return;
    const fires=!L.wicks&&L.checkpoint!=null?[L.checkpoint]:[];
    for(const fx of fires){if(p.checkX!=null&&fx<=p.checkX+1)continue;if((Math.abs(p.x+p.w/2-fx)<48&&p.y+p.h>FLOOR-80)){p.checkX=fx;checkpoint=true;L.checkpoint=fx;p.hp=p.max;p.potions=Math.max(p.potions,1);p.soul=3;burst(fx,FLOOR-40,'#f4c27f',26);say('钟火已点燃 · 倒下后从这里回来',2.6);beep(520,.3);saveRun();break;}}
    if(L.hints){const h=L.hints.find(q=>Math.abs(p.x+p.w/2-q.x)<120);if(h&&run.hintAt!==h.x){run.hintAt=h.x;say(h.t,3.2);}}
    if(L.shortcut&&!run.shortcut&&p.x>L.shortcut.open&&run.litWicks>=L.shortcut.wicks){run.shortcut=true;say('城墙捷径开了 · 回到入口的门可以抄近路',2.6);saveRun();}
    if(L.shortcut&&run.shortcut&&Math.abs(p.x+p.w/2-L.shortcut.door)<40&&p.ground&&p.y+p.h>FLOOR-70){p.x=L.shortcut.dest;followEmber(0,true);p.vx=0;say('抄近路',1.2);}
    // 走进首领房：第一次是一段登场对白，倒下再来时只说一句；对白结束亮出名号卡，身后的铁闸落下
    if(L.arena&&!flags.boss&&p.x>L.trigger&&enemies.some(e=>e.type==='boss'&&!e.dead)){flags.boss=true;titleT=0;messageT=0;notice.style.opacity=0;bossCue('enter');const key='bossMet_'+L.bossKind,story=BOSSES[L.bossKind];startTalk(run[key]?story.again:story.intro,()=>{titleT=0;messageT=0;notice.style.opacity=0;bossCardT=2;},false,{arena:true});run[key]=true;return;}
    const bossAlive=enemies.some(e=>e.type==='boss'&&!e.dead),bossOn=!!(L.arena&&flags.boss&&bossAlive);gateK=clamp(gateK+(bossOn?dt:-dt)*3,0,1);if(L.arena)sealK=clamp(sealK+(bossAlive?dt:-dt)*1.6,0,1);if(bossOn&&p.x<L.gate+6){p.x=L.gate+6;if(p.vx<0)p.vx=0;}
    enemies.forEach(e=>{if(e.dead){e.dieT=Math.max(0,e.dieT-dt);e.flash=Math.max(0,e.flash-dt);if(e.type==='boss'&&e.dieT>0&&Math.random()<dt*30)ember(e.x+Math.random()*e.w,e.y+Math.random()*e.h,1,BOSSES[e.kind].color);if(e.type==='flyer')e.y=Math.min(e.floor-e.h,e.y+300*dt);return;}
      e.flash=Math.max(0,e.flash-dt);e.swing=Math.max(0,e.swing-dt);e.hitT=Math.max(0,e.hitT-dt);const boss=e.type==='boss';if(!(boss&&(e.wind>0||e.act>0||e.rec>0)))e.cd-=dt;if(e.blockT>0)e.blockT-=dt;const el=e.elite,dx=p.x-e.x,dy=Math.abs(p.y+p.h-e.floor),ox=e.x,kind=boss?e.kind:el?'elite':e.type,frozen=e.frozen>0,dazed=e.daze>0;
      if(e.type!=='dummy'&&!codex.seen[kind]&&onScreen(e))note('seen',kind);if(frozen)e.frozen=Math.max(0,e.frozen-dt);if(dazed)e.daze=Math.max(0,e.daze-dt);if(e.brk>0)e.brk=Math.max(0,e.brk-dt);
      // 持盾狱卒转身慢：绕到背后半秒内它还转不过来
      if(!frozen&&!dazed&&e.wind<=0&&!boss&&!e.ward){const want=dx<0?-1:1;if(e.type==='shield'&&want!==e.face){if(!(e.brk>0)){e.turnT=(e.turnT||0)+dt;if(e.turnT>.5){e.face=want;e.turnT=0;}}}else{e.face=want;e.turnT=0;}}
      if(e.kbT>0){e.kbT-=dt;const B=bounds(e);e.x=clamp(e.x+e.kb*dt,B[0],B[1]);if(e.kbT<=0)e.kb=0;}
      if(el&&Math.random()<dt*(lowFx?4:10))ember(e.x+e.w/2+(Math.random()-.5)*34,e.y+10+Math.random()*44,1,'#ffc46a');
      if(e.ward){if(!frozen&&!dazed)moveWard(e,dt);}
      else if(boss){if(!frozen&&!dazed&&(!L.arena||flags.boss))bossAI(e,dt);}   // 首领在登场对白前不动；冰冻、震晕期间停止行动
      else if(!frozen&&!dazed&&!e.waitingForHit&&!(e.brk>0)){
      if(FOE_AI[e.type])FOE_AI[e.type](e,dt,dx,dy);
      else{const sh=e.type==='shield',spd=(1-.1*Math.min(3,cycle))*e.trainingPace;
      // 小怪：蓄力（动作预兆 + 刃口一闪）→ 出手；不画攻击范围
      if(e.wind>0){e.wind-=dt;if(e.wind<=0){e.swing=.22;if(e.leap){const B=bounds(e);e.x=clamp(e.x+e.face*(130+16*Math.max(0,cycle-2)),B[0],B[1]);e.leap=0;}else if(sh||(!el&&e.type==='guard'&&L.theme==='sewers')){const B=bounds(e);e.x=clamp(e.x+e.face*(sh?60:75),B[0],B[1]);}
          if(e.type==='archer'){const pattern=L.theme==='ramparts'?[-85,0,85]:L.theme==='tower'||cycle>=4?[-55,55]:[0];pattern.forEach(v=>emit_shots(undefined,e.x+14,e.y+17,e.face*(L.theme==='sewers'?250:320),v,undefined,4,Math.round(12*L.dmgK),undefined,undefined,undefined,undefined,L.theme==='sewers'?'#a5e66c':L.theme==='ossuary'?'#d8aaff':'#dfe3e0',undefined,undefined));beep(290,.08);}
          else if(Math.abs(p.x-e.x)<(el?102:sh?82:74)&&(p.x-e.x)*e.face>-15&&dy<66)if(p.roll>0)perfectDodge(e.x+e.w/2);else hurt(Math.round((el?22:14)*L.dmgK),e.x,el&&cycle>=2,sh?'被持盾狱卒盾撞击中':el?'被精英狱卒挥砍击中':'被狱卒挥砍击中');
          if(!el&&e.type==='guard'&&L.theme==='ossuary'&&e.floor===FLOOR)waves.push({x:e.x+e.w/2,dir:e.face,life:1.1});if(el){dust(e.x+e.w/2+e.face*40,e.floor,6,0);shake=Math.max(shake,4);}if(sh){dust(e.x+e.w/2+e.face*30,e.floor,5,e.face);beep(180,.08,'square');}e.cd=(el?1.02:sh?1.35:1.12)*e.trainingPace;}}
      else if(Math.abs(dx)<(e.type==='archer'?520:el?130:sh?114:L.theme==='sewers'?164:110)&&dy<90&&e.cd<=0&&(e.type!=='archer'||onScreen(e))){const leap=cycle>=2&&e.type==='guard'&&!sh&&!el;e.wind=e.wt=(leap?.62:(e.type==='archer'?.48:el?.46:sh?.5:.36))*spd;e.leap=leap?1:0;}
      else if(e.type!=='archer'&&e.hitT<=0&&Math.abs(dx)<650/e.trainingPace/e.trainingPace&&Math.abs(dx)>55){const B=bounds(e);e.x=clamp(e.x+e.face*(el?84:sh?50:66)*dt,B[0],B[1]);}}}
      // 刀砍中：积一格魂火。持盾狱卒正面挡下横斩和上挑——重劈（连砍第三下）或钟锤能破防，下劈从头顶砍不挡
      if(SA&&!p.hit.has(e)&&!bossShielded(e)&&inArea(SA,e.x,e.y,e.x+e.w,e.y+e.h)){p.hit.add(e);const heavy=p.slash==='side'&&p.combo===0,side=p.x+p.w/2<e.x+e.w/2?1:-1,dmg=p.damage*(heavy?(relics.tassel?1.89:1.35):1)*(relics.hunter&&p.hp/p.max>.7?1.3:1),hx=clamp(SA.x,e.x+4,e.x+e.w-4),hy=clamp(SA.y,e.y+6,e.y+e.h-6);
        if(p.slash!=='down'&&blocks(e,side,0)){if(heavy||p.char==='bell'){e.brk=1.4;e.wind=0;e.swing=0;clang(hx,hy);fx.push({k:'ring',x:hx,y:hy,life:.3,max:.3,r:46});pop(e.x+e.w/2,e.y-24,'破防','#ffe2a8',true);hitEnemy(e,dmg*.6,side,true,hx,hy);}else{clang(hx,hy);e.blockT=.25;p.vx=-side*230;hitstop=.04;if(!run.shieldTip){run.shieldTip=true;say('盾挡住了 · 绕到背后、从上面下劈，或者用重击破防',2.8);}}}
        else{p.soul=Math.min(3,p.soul+1);hudKey='';if(p.soul===3&&!run.soulTip){run.soulTip=true;say('魂火已满 · '+(coarse()?'点右边的技能键':'按 '+K('skill1')+' / '+K('skill2')+' / '+K('skill3')+' 放技能'),2.5);}if(p.slash==='down'&&!p.pogo){p.pogo=true;p.vy=-470;p.jumps=1;}if(p.slash==='side')p.kickX=-p.atkFace*(p.char==='bell'?40:70);   // 砍中时自己被往后推一点（空洞骑士的刀反冲）
          hitEnemy(e,dmg,p.slash==='side'?p.atkFace:0,heavy,hx,hy);}}
      e.walk+=Math.abs(e.x-ox)*.12;
    });
    touchEnemies();
    // 飞行物：箭、典狱长的魂火（会追人）、溺灯的腐潮弹（抛物线，落地留一滩腐水）、灯蛾（慢慢飘过来）；刀光都能砍掉
    shots.forEach(s=>{if(s.home){const tx=p.x+p.w/2-s.x,ty=p.y+p.h/2-s.y,d=Math.hypot(tx,ty)||1,k=Math.min(1,dt*1.8*s.home),sp=s.sp||200;s.vx+=(tx/d*sp-s.vx)*k;s.vy+=(ty/d*sp-s.vy)*k;}if(s.g)s.vy+=s.g*dt;s.x+=s.vx*dt;s.y+=(s.vy||0)*dt;s.life-=dt;s.t=(s.t||0)+dt;
      if(SA&&inArea(SA,s.x-10,s.y-(s.k?9:2),s.x+10,s.y+(s.k?9:2))){s.life=0;cutShot(s);return;}
      if(dodging()&&Math.abs(s.x-p.x-13)<23&&s.y>p.y-5&&s.y<p.y+p.h)perfectDodge(s.x);if(!dodging()&&Math.abs(s.x-p.x-13)<(s.k==='moth'?19:23)&&s.y>p.y-5&&s.y<p.y+p.h){hurt(s.d||12,s.x,false,s.k==='bolt'?'被弩箭射中':s.k==='flame'?'被魂火击中':s.k==='glob'?'被腐潮弹击中':s.k==='wisp'?'被灵火击中':s.k==='moth'?'被灯蛾扑中':'被箭射中');s.life=0;if(s.k==='glob')splash(s.x,s.y);return;}
      if(s.g&&s.vy>0&&s.y>=FLOOR-6){s.life=0;if(s.fire)ember(s.x,FLOOR-6,8,'#ffb347');else splash(s.x,FLOOR-4);if(!inGap(s.x))hazards.push({k:'pool',x:s.x,w:56,life:s.pool||2.2,max:s.pool||2.2,d:Math.round(10*L.dmgK),fire:!!s.fire});}});
    {let n=0;for(let i=0;i<shots.length;i++){const o=shots[i];if(o.life>0&&o.x>0&&o.x<WORLD&&o.y<FLOOR+200)shots[n++]=o;else shotsPool.release(o);}shots.length=n;}updateThrown(dt);
    // 地面冲击波（默认）、旗手的风（矮，跳过去）、典狱长的钟声（高，只能翻滚穿过）
    waves.forEach(w=>{w.x+=w.dir*(w.v||380)*dt;w.life-=dt;w.t=(w.t||0)+dt;if(!w.k&&Math.random()<dt*14)burst(w.x,FLOOR-4,'#cdb58e',1);if(p.inv<=0&&Math.abs(w.x-p.x-p.w/2)<(w.k?26:20)&&p.y+p.h>FLOOR-(w.h||30)){hurt(Math.round((w.d||18)*L.dmgK),w.x,false,w.k==='gust'?'被风卷到':w.k==='toll'?'被钟声击中':'被冲击波击中');if(w.push)p.vx=w.dir*w.push;w.life=0;}});waves=waves.filter(w=>w.life>0&&w.x>0&&w.x<WORLD);
    // 首领留下的机关：落石先往下掉灰、灵枪先冒紫烟——这些就是提示
    hazards.forEach(h=>{const pc=p.x+p.w/2;if(h.delay>0){h.delay-=dt;if(h.k==='rock'&&Math.random()<dt*24)emit_particles(h.x+(Math.random()-.5)*18,38,(Math.random()-.5)*10,40+Math.random()*80,.7,.7,'#a39c8e',1.4+Math.random()*2,1,undefined,undefined,undefined,undefined);else if(h.k==='spear'&&Math.random()<dt*30)emit_particles(h.x+(Math.random()-.5)*20,FLOOR-2,(Math.random()-.5)*16,-30-Math.random()*50,.5,.5,h.warm?'#ffc890':'#cfa8ff',1.5+Math.random()*2,-.1,true,undefined,undefined,undefined);return;}
      h.life-=dt;h.t=(h.t||0)+dt;
      if(h.k==='rock'){h.vy+=1500*dt;h.y+=h.vy*dt;h.r+=dt*6;if(!h.hit&&p.inv<=0&&Math.abs(h.x-pc)<20&&h.y+12>p.y&&h.y-12<p.y+p.h){h.hit=true;hurt(h.d,h.x,false,'被落石砸中');}if(h.y>=FLOOR-12){h.life=0;burst(h.x,FLOOR-8,'#8f887b',10);dust(h.x,FLOOR,5,0);beep(150,.06,'square');}}
      else if(h.k==='pool'){if(p.inv<=0&&Math.abs(pc-h.x)<h.w/2-4&&p.y+p.h>FLOOR-6){burst(pc,FLOOR-4,h.fire?'#ffb347':'#9be36a',8);hurt(h.d,h.x,false,h.fire?'被炉火烫到':'踩进了腐水');}}
      else if(h.k==='spear'){if(!h.up){h.up=true;burst(h.x,FLOOR-10,h.warm?'#ffd0a0':'#d8b3ff',8);beep(520,.06,'triangle');}if(!h.hit&&h.t<.3&&p.inv<=0&&Math.abs(pc-h.x)<p.w/2+14&&p.y+p.h>FLOOR-100){h.hit=true;hurt(h.d,h.x,false,'被灵枪刺中');}}});
    hazards=hazards.filter(h=>h.life>0);
    // 得到的东西画成图飞进主角怀里
    loot.forEach(o=>{o.t+=dt;if(o.t<.45){o.vy+=700*dt;o.vx*=Math.pow(.2,dt);}else{const tx=p.x+p.w/2-o.x,ty=p.y+18-o.y,d=Math.hypot(tx,ty)||1,sp=380+o.t*700;o.vx+=(tx/d*sp-o.vx)*Math.min(1,dt*8);o.vy+=(ty/d*sp-o.vy)*Math.min(1,dt*8);if(d<16){o.t=-1;burst(p.x+p.w/2,p.y+20,'#fff1c2',8);beep(1180,.06,'sine');}}o.x+=o.vx*dt;o.y+=o.vy*dt;});loot=loot.filter(o=>o.t>=0&&o.t<4);
    // 敌人散出的余烬：先四散，再飞向主角
    let got=false;orbs.forEach(o=>{o.t+=dt;if(o.t<.35){o.vx*=Math.pow(.03,dt);o.vy+=420*dt;}else{const dx=p.x+13-o.x,dy=p.y+22-o.y,d=Math.hypot(dx,dy)||1,sp=500+o.t*900;o.vx+=(dx/d*sp-o.vx)*Math.min(1,dt*7);o.vy+=(dy/d*sp-o.vy)*Math.min(1,dt*7);if(d<14){o.t=-1;got=true;}}o.x+=o.vx*dt;o.y+=o.vy*dt;});orbs=orbs.filter(o=>o.t>=0&&o.t<5);if(got)beep(920,.04,'sine');
    const kind=nearFire()?'fire':nearShop()?'shop':nearNpc()?'npc':nearInk()?'ink':nearLore()?'lore':chests.some(c=>!c.open&&Math.abs(c.x-p.x)<85&&Math.abs(c.y-p.y-p.h)<75)?'chest':'';
    if(kind!==nearKind){nearKind=kind;nearChest=!!kind;chestBtn.hidden=!kind;chestBtn.textContent={fire:'休息',shop:'商店',npc:'交谈',ink:'地图',lore:'查看'}[kind]||'开箱';}
    if(kind&&messageT<.2){const t=coarse(),E=K('interact');say({fire:t?'篝火 · 点「休息」恢复状态':'篝火 · 按 '+E+' 休息（每站一次）',shop:t?'烛叟 · 点「商店」':'烛叟 · 按 '+E+' 交谈、交易',npc:t?'守钟人 · 点「交谈」':'守钟人 · 按 '+E+' 交谈',ink:hasMap()?'制图人墨翁 · 地图已经在你手上了':'制图人墨翁 · '+(t?'点「地图」':'按 '+E)+' 买这一层的地图（'+inkPrice()+' 余烬）',lore:t?'有什么东西在发光 · 点「查看」':'有什么东西在发光 · 按 '+E+' 查看',chest:t?'铜色宝箱 · 点「开箱」':'铜色宝箱 · 按 '+E+' 打开'}[kind],.3);}
    if(L.seal){if(p.x>L.seal+10){if(enemies.some(e=>e.type==='boss'&&!e.dead)){p.x=L.seal;say('铁闸紧闭 · 先击败首领',2);}else if(L.bossKind==='warden')finish(true);else{nextStage();return;}}}
    else if(L.wicks&&run.doorLift<1){if(p.x+p.w>L.exit-10){p.x=L.exit-10-p.w;p.vx=Math.min(0,p.vx);}}
    else if(p.x+p.w/2>L.exit+20&&p.ground){nextStage();return;}
    // 镜头：首领战时框住铁闸与封印之间的场地
    const lead=p.face>0?.35:.62,lo=bossOn?Math.min(L.gate-40,WORLD-W):0,hi=bossOn?Math.max(lo,Math.min(WORLD-W,L.seal+130-W)):Math.max(0,WORLD-W);cam+=(clamp(p.x-W*lead,lo,hi)-cam)*Math.min(1,dt*5);if(bossCardT>0){bossCardT=Math.max(0,bossCardT-dt);notice.style.opacity=0;}markSeen();
    // 墨翁的哼曲：越近越清楚
    if(L.ink!=null&&!hasMap()){const dd=Math.abs(p.x-L.ink);if(dd<620){inkHum-=dt;if(inkHum<=0){inkHum=.36;const mel=[0,2,4,2,0,-1,7,4,2,-1,0,-1],nn=mel[inkStep++%mel.length];if(nn>=0)musicTone(330*Math.pow(2,nn/12),.32,.014*(1-dd/620)+.002,'sine');}}}
    if(state==='play')run.time=(run.time||0)+dt;noteBand();syncHud();
  }

  // ================= 画面 =================
  const OL='#0a0e14';
  const GH={body:'#eef3f8',shade:'#c4d1de',eye:'#0b0d12',scarf:'#2fa39b',scarfDark:'#1d6b68',nail:'#d6dee4',nailHi:'#ffffff',hilt:'#7a5634'};
  const GH_CHAPTER=[GH,Object.assign({},GH,{scarf:'#56aa9b',scarfDark:'#276f68'}),Object.assign({},GH,{scarf:'#6c92aa',scarfDark:'#385c76'}),Object.assign({},GH,{scarf:'#947eae',scarfDark:'#59496f'})];
  const GH_HURT=Object.assign({},GH,{body:'#ffc4c4',shade:'#eb9595'}),GH_TRAIL={body:'#c4ecff',shade:'#a9dcf3',eye:'#5f93ab',scarf:'#93dad3',scarfDark:'#93dad3',nail:'#c4ecff',nailHi:'#c4ecff',hilt:'#c4ecff'};
  // 另外两个角色：钟锤学徒（琥珀色围巾、挂一枚小铜铃）、拾灯弓手（青绿兜帽、背箭袋）；影步斩时化成紫黑的影子
  const GH_BELL=Object.assign({},GH,{body:'#f4f0e6',shade:'#d8ccb8',scarf:'#c98a3a',scarfDark:'#8a5520'}),GH_BOW=Object.assign({},GH,{body:'#eef6f1',shade:'#c2d8cc',scarf:'#5b8f4a',scarfDark:'#355a2a'}),GH_SHADE={body:'#5a4a7a',shade:'#3d3158',eye:'#efe6ff',scarf:'#2a2140',scarfDark:'#1a1428',nail:'#8a7aaa',nailHi:'#c8b8ff',hilt:'#2a2140'};
  const GUARD={armor:'#68727c',armorHi:'#9ba7af',armorDark:'#434b54',tabard:'#7b2f2f',tabardDark:'#4f1c1d',belt:'#3b2c24',helm:'#7d8892',visor:'#090c10',eye:'#ffa04a',pants:'#2d2e36',pantsDark:'#202128',boot:'#2b221f',glove:'#3a2e27',haft:'#5b4231',blade:'#aab3b8',bladeHi:'#e9eff1'};
  const ARCHER={cloak:'#3e4b40',cloakDark:'#29332b',hood:'#4b5b4d',skull:'#d9d1b9',socket:'#150d0d',eye:'#ff6a58',bow:'#8c6b3f',string:'#ddd6c4',arrow:'#c9b48a',legs:'#2f2b2b'};
  // 精英狱卒：金边、角盔、琥珀色的眼（不用红色）
  const ELITE_TINT={eye:'#ffd27a',tabard:'#4a3a1a',tabardDark:'#2a200e',armorHi:'#e0c070',cape:'#3a2c14',trim:'#e0bd73'},ELITE=Object.assign({},GUARD,ELITE_TINT);
  // 新小怪的配色：默认一套，各生态区换颜色（城墙的蝠像乌鸦、钟楼的是黄铜发条做的……）
  const FLYER={wing:'#4a3f55',wingDark:'#2f2838',body:'#d9d1b9',bone:'#a89c84',eye:'#ffb04a'},
    SHIELDP={shield:'#6a737b',shieldHi:'#9aa6ae',shieldDark:'#3d454c',trim:'#c49a52'},
    CASTER={robe:'#3a2f4a',robeDark:'#241c30',hood:'#4a3d5c',skull:'#d8cfb8',socket:'#120c14',eye:'#d8a8ff',staff:'#8a7a60',glow:'#c58bff'},
    BOMBER={cloak:'#4a3a2a',pack:'#5a4a2f',flask:'#ffb347',glow:'#ffcf6a',mask:'#8a8070',lens:'#2a2a1a',eye:'#ffd27a',legs:'#2a2620'},
    CRAWLER={shell:'#6a6248',shellHi:'#cbb98a',body:'#2c261c',claw:'#d9d1b4',eye:'#ffb04a',soul:'#8be1ce'},
    HANGER={cloth:'#3a3048',clothHi:'#6a5878',chain:'#8a9298',cage:'#c4b48a',eye:'#d8b3ff',soul:'#f4eaff'},
    LURKER={cloth:'#243038',clothHi:'#5a7078',hood:'#141c20',eye:'#ffb35c',claw:'#d5e2e6',soul:'#7ec8c0'},
    SPEAR={robe:'#4a3428',robeHi:'#8a6248',helm:'#6a6258',eye:'#ffd27a',haft:'#6a4a2a',tip:'#e7eef2',pants:'#241c18',wrap:'#c4a46a'},
    FOE_THEME={sewers:{flyer:{wing:'#5a7a4a',wingDark:'#3a5232',body:'#c8d0a8',eye:'#b8ff6a'},shield:{shield:'#5a6a4a',shieldHi:'#8a9a76',shieldDark:'#34402a'},bomber:{cloak:'#3f4a2a',pack:'#5a4a2f',flask:'#a5e66c',glow:'#b8f08a',eye:'#d8ff9a'}},
      ramparts:{flyer:{wing:'#3a3040',wingDark:'#221c28',body:'#2e262c',bone:'#5a4a50',eye:'#ffd27a'},shield:{shield:'#2f4f7b',shieldHi:'#5a7aa8',shieldDark:'#1d3150',trim:'#e0bd73'}},
      ossuary:{flyer:{wing:'#5a4a6a',wingDark:'#3a3048',eye:'#d8a8ff'},shield:{shield:'#5a4a6a',shieldHi:'#8a7a9a',shieldDark:'#342a40',trim:'#d8cfb8'}},
      tower:{flyer:{wing:'#7a5a3a',wingDark:'#4a3522',body:'#c4a26a',bone:'#8a6a3a',eye:'#ffcf6a'},shield:{shield:'#7b4a2f',shieldHi:'#a8784f',shieldDark:'#4f2c1d'},caster:{robe:'#4a2f22',robeDark:'#2f1d15',hood:'#5a3a2a',eye:'#ffcf6a',glow:'#ffb04a'}}};
  const FLASH={};[GUARD,ARCHER,ELITE,FLYER,SHIELDP,CASTER,BOMBER,CRAWLER,HANGER,LURKER,SPEAR].forEach(o=>Object.keys(o).forEach(k=>{FLASH[k]='#fff2df';}));   // 首领的配色在下面定义后也加进来
  const cache={};let lights=[],shafts=[],motes=[],motesT=0,motesCam=0,vig=null,vigKey='';
  function rgba(h,a){const n=parseInt(h.slice(1),16);return'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')';}
  function box(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(x,y,w,h);}
  function poly(a,fill,stroke,lw){ctx.beginPath();ctx.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)ctx.lineTo(a[i],a[i+1]);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1.5;ctx.stroke();}}
  function circle(x,y,r,fill,stroke,lw){ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1.5;ctx.stroke();}}
  function line(a,w,c,o){ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)ctx.lineTo(a[i],a[i+1]);if(o){ctx.strokeStyle=o;ctx.lineWidth=w+3;ctx.stroke();}ctx.strokeStyle=c;ctx.lineWidth=w;ctx.stroke();}
  // 两节肢体：a1 是第一节相对竖直向下的角度，a2 是关节弯折，返回 [关节 x, y, 末端 x, y]
  function joint(x,y,a1,a2,l1,l2){const kx=x+Math.sin(a1)*l1,ky=y+Math.cos(a1)*l1;return[kx,ky,kx+Math.sin(a1+a2)*l2,ky+Math.cos(a1+a2)*l2];}
  function text(t,x,y,size,c,align,stroke){ctx.font=(stroke&&size>=16?'bold ':'')+size+'px "PingFang SC","Microsoft YaHei",sans-serif';ctx.textAlign=align||'left';if(stroke){ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='rgba(5,8,12,.85)';ctx.strokeText(t,x,y);}ctx.fillStyle=c||'#e4d9c2';ctx.fillText(t,x,y);}
  function vgrad(k,y0,y1,stops){if(!cache[k]){const g=ctx.createLinearGradient(0,y0,0,y1);stops.forEach(s=>g.addColorStop(s[0],s[1]));cache[k]=g;}return cache[k];}
  function glowGrad(c){const k='glow'+c;if(!cache[k]){const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,rgba(c,1));g.addColorStop(.32,rgba(c,.45));g.addColorStop(1,rgba(c,0));cache[k]=g;}return cache[k];}
  function addLight(x,y,r,c,a){if(x>-r&&x<W+r&&a>.01)lights.push({x:x,y:y,r:r,c:c,a:a});}
  function glow(L){ctx.save();ctx.globalAlpha=Math.min(1,L.a);ctx.translate(L.x,L.y);ctx.scale(L.r,L.r);ctx.fillStyle=glowGrad(L.c);ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();}
  // ---- 道具手绘：每样东西在 ±48 的方框里画一遍，进离屏画布缓存；界面用 dataURL，场景里直接 drawImage ----
  const AO='#1e1519';
  function lg(x0,y0,x1,y1,a,b,c){const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,a);if(c){g.addColorStop(.5,b);g.addColorStop(1,c);}else g.addColorStop(1,b);return g;}
  function rg(x,y,r,a,b,c){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,a);if(c){g.addColorStop(.5,b);g.addColorStop(1,c);}else g.addColorStop(1,b);return g;}
  function shape(f,fill,stroke,lw){ctx.beginPath();f();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=stroke;ctx.lineWidth=lw||2.5;ctx.stroke();}}
  function fl(x,y,s,c){c=c||FIRE;[[1,0],[.66,1],[.36,2]].forEach(q=>{const k=s*q[0];shape(()=>{ctx.moveTo(x,y-20*k);ctx.bezierCurveTo(x+9*k,y-9*k,x+8*k,y,x,y+k);ctx.bezierCurveTo(x-8*k,y,x-9*k,y-9*k,x,y-20*k);},c[q[1]]);});}
  function sparkle2(x,y,s,c){ctx.fillStyle=c||'rgba(255,255,255,.9)';ctx.beginPath();ctx.moveTo(x,y-s);ctx.quadraticCurveTo(x,y,x+s,y);ctx.quadraticCurveTo(x,y,x,y+s);ctx.quadraticCurveTo(x,y,x-s,y);ctx.quadraticCurveTo(x,y,x,y-s);ctx.fill();}
  function shadow(rx){oval(0,42,rx||24,5,'rgba(0,0,0,.28)');}
  function bladeArt(len,g){shape(()=>{ctx.moveTo(-4,12);ctx.lineTo(-4.5,12-len*.8);ctx.lineTo(0,12-len);ctx.lineTo(4.5,12-len*.8);ctx.lineTo(4,12);ctx.closePath();},g||lg(-5,0,5,0,'#ffffff','#c8d8de','#7f929c'),AO,2.2);line([0,10,0,14-len*.92],1.1,'rgba(255,255,255,.9)');shape(()=>ctx.rect(-11,12,22,5),'#8a96a0',AO,1.8);shape(()=>ctx.rect(-3.5,17,7,18),'#7a5634',AO,1.8);line([-3.5,22,3.5,25],1.2,'#3a2a1a');line([-3.5,28,3.5,31],1.2,'#3a2a1a');circle(0,38,3.6,'#c49a52',AO,1.4);}
  function bellArt(c0,c1,c2){shape(()=>{ctx.moveTo(0,-28);ctx.bezierCurveTo(-18,-28,-20,-6,-22,14);ctx.quadraticCurveTo(-30,22,-31,27);ctx.lineTo(31,27);ctx.quadraticCurveTo(30,22,22,14);ctx.bezierCurveTo(20,-6,18,-28,0,-28);},lg(-24,0,24,0,c0,c1,c2),AO,2.6);}
  const ART={
    bomb(){shadow();shape(()=>{ctx.moveTo(-8,-14);ctx.lineTo(-8,-6);ctx.bezierCurveTo(-30,0,-30,36,0,38);ctx.bezierCurveTo(30,36,30,0,8,-6);ctx.lineTo(8,-14);ctx.closePath();},rg(-8,10,34,'#ffd27a','#e2612c','#6a2410'),AO,2.6);
      shape(()=>{ctx.moveTo(-21,16);ctx.quadraticCurveTo(0,22,21,16);ctx.quadraticCurveTo(20,31,0,35);ctx.quadraticCurveTo(-20,31,-21,16);},'rgba(110,30,10,.35)');shape(()=>ctx.ellipse(-11,6,4,9,.5,0,TAU),'rgba(255,255,255,.55)');
      shape(()=>ctx.rect(-10,-16,20,6),'#b8875a',AO,2);shape(()=>{ctx.moveTo(-7,-16);ctx.lineTo(-6,-26);ctx.quadraticCurveTo(0,-29,6,-26);ctx.lineTo(7,-16);ctx.closePath();},'#8a5a34',AO,2.2);
      line([-9,-12,9,-12],1.6,'#6a4a2a');shape(()=>{ctx.moveTo(-2,-26);ctx.quadraticCurveTo(6,-35,15,-32);ctx.lineTo(17,-27);ctx.quadraticCurveTo(8,-28,3,-22);ctx.closePath();},'#eadcc0',AO,1.8);fl(16,-30,1.25);circle(24,-40,1.4,'#ffcf6a');circle(10,-44,1.1,'#ffcf6a');},
    knife(){shadow();[-.55,0,.55].forEach(a=>{ctx.save();ctx.translate(0,34);ctx.rotate(a);shape(()=>ctx.rect(-3.5,-8,7,16),'#5a3d27',AO,2);line([-3.5,-4,3.5,-1],1.2,'#2c1d12');line([-3.5,2,3.5,5],1.2,'#2c1d12');circle(0,12,4,null,'#9aa8b0',2.2);shape(()=>ctx.rect(-7,-11,14,4),'#8a96a0',AO,1.8);
      shape(()=>{ctx.moveTo(-5,-11);ctx.lineTo(-4.5,-42);ctx.lineTo(0,-58);ctx.lineTo(4.5,-42);ctx.lineTo(5,-11);ctx.closePath();},lg(-5,0,5,0,'#f4f8fa','#b8c8d0','#7f929c'),AO,2.2);line([0,-13,0,-52],1,'rgba(255,255,255,.85)');ctx.restore();});line([-10,28,10,28],3.4,'#b8463a',AO);},
    frost(){shadow(22);circle(0,-34,7,null,'#5a8ac8',3);shape(()=>{ctx.moveTo(-6,-30);ctx.lineTo(-15,-21);ctx.lineTo(-6,-24);ctx.moveTo(6,-30);ctx.lineTo(15,-21);ctx.lineTo(6,-24);},null,'#5a8ac8',3);bellArt('#e8f8ff','#8fd0f2','#3d7fae');
      shape(()=>ctx.ellipse(0,27,31,5,0,0,TAU),'#bfe6f8',AO,2.2);circle(4,34,5,'#d8f2ff',AO,2);ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=1.4;for(let i=0;i<3;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.moveTo(Math.cos(a)*7,2+Math.sin(a)*7);ctx.lineTo(-Math.cos(a)*7,2-Math.sin(a)*7);ctx.stroke();}
      [-20,-8,12,22].forEach((x,i)=>poly([x-2.5,29,x+2.5,29,x,37+i%2*4],'#e6f8ff',AO,1.2));shape(()=>{ctx.moveTo(-10,-20);ctx.quadraticCurveTo(-15,-4,-15,12);},null,'rgba(255,255,255,.7)',2.4);sparkle2(-28,-14,4);sparkle2(27,-4,3);sparkle2(20,-30,2.5);},
    leech(){for(let i=0;i<6;i++){const t=i/5;circle(-18+t*18,-42+t*24,2.4,null,'#9a96a6',1.6);circle(18-t*18,-42+t*24,2.4,null,'#9a96a6',1.6);}shape(()=>{ctx.moveTo(-9,-16);ctx.lineTo(9,-16);ctx.lineTo(13,-6);ctx.lineTo(-13,-6);ctx.closePath();},'#5c5866',AO,2);
      shape(()=>{ctx.moveTo(0,-10);ctx.bezierCurveTo(16,0,20,20,0,38);ctx.bezierCurveTo(-20,20,-16,0,0,-10);},rg(-4,8,30,'#ffd6ec','#c25a8a','#4a1030'),AO,2.6);shape(()=>{ctx.moveTo(-2,26);ctx.bezierCurveTo(-11,15,6,6,6,15);ctx.bezierCurveTo(6,21,-2,21,0,15);},null,'rgba(255,220,240,.7)',1.8);
      line([0,-8,-7,14,0,36],1,'rgba(255,255,255,.35)');poly([-13,-6,-15,3,-10,-4],'#7a7686',AO,1.4);poly([13,-6,15,3,10,-4],'#7a7686',AO,1.4);shape(()=>ctx.ellipse(-6,6,3,6,.4,0,TAU),'rgba(255,255,255,.6)');},
    plate(){shadow(26);shape(()=>{ctx.moveTo(-32,-8);ctx.lineTo(32,-16);ctx.lineTo(32,-8);ctx.lineTo(-32,0);ctx.closePath();},'#6a4a2a',AO,2);shape(()=>ctx.rect(22,-18,9,11),'#c49a52',AO,1.6);
      const lame=(y,w,h,c)=>{shape(()=>{ctx.moveTo(-w,y);ctx.quadraticCurveTo(0,y-h*1.6,w,y);ctx.lineTo(w-3,y+h);ctx.quadraticCurveTo(0,y+h-h*1.6,-w+3,y+h);ctx.closePath();},lg(0,y-h,0,y+h,'#dbe3e8',c,'#56636c'),AO,2.4);circle(-w+7,y+h*.45,2,'#e8eef1',AO,1);circle(w-7,y+h*.45,2,'#e8eef1',AO,1);};
      lame(24,24,12,'#7d8a94');lame(9,31,14,'#8c99a3');lame(-10,36,18,'#9ba8b1');line([-14,-14,-6,-10],1.2,'rgba(30,35,40,.6)');line([8,-18,16,-12],1,'rgba(30,35,40,.5)');circle(12,8,3,'rgba(40,45,50,.25)');shape(()=>{ctx.moveTo(-26,-14);ctx.quadraticCurveTo(-4,-34,24,-18);},null,'rgba(255,255,255,.6)',2);},
    feather(){ctx.strokeStyle='rgba(220,255,240,.6)';ctx.lineWidth=2;[[-44,-12],[-46,4],[-40,20]].forEach(q=>{ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.quadraticCurveTo(q[0]+14,q[1]-6,q[0]+26,q[1]-2);ctx.stroke();});ctx.save();ctx.rotate(.62);
      shape(()=>{ctx.moveTo(0,40);ctx.bezierCurveTo(-19,20,-20,-20,0,-46);ctx.bezierCurveTo(16,-20,18,20,0,40);},lg(-18,0,18,0,'#3f9a7a','#7fd6b4','#c8f6e2'),AO,2.4);ctx.strokeStyle='rgba(20,60,45,.5)';ctx.lineWidth=1.2;for(let i=0;i<7;i++){const y=-34+i*10;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(-12+Math.abs(y)*.1,y+6);ctx.moveTo(0,y+3);ctx.lineTo(11-Math.abs(y)*.1,y+9);ctx.stroke();}
      line([0,48,0,-42],2,'#f0faf4');ctx.restore();},
    magnet(){shadow();circle(-18,30,14,'rgba(255,150,60,.28)');circle(18,30,14,'rgba(255,150,60,.28)');shape(()=>{ctx.moveTo(-28,28);ctx.lineTo(-28,-4);ctx.arc(0,-4,28,Math.PI,0);ctx.lineTo(28,28);ctx.lineTo(8,28);ctx.lineTo(8,-4);ctx.arc(0,-4,8,0,Math.PI,true);ctx.lineTo(-8,28);ctx.closePath();},lg(-28,-30,28,30,'#6a5a54','#3a302c','#221a18'),AO,2.6);
      const tip=x=>shape(()=>ctx.rect(x,18,20,12),lg(0,18,0,30,'#ffe08a','#ff8a3a','#c44a14'),AO,2);tip(-28);tip(8);line([-20,-10,-14,-18,-18,-26],1.4,'#ff9a50');line([16,-22,20,-12],1.2,'#ff9a50');
      [[-30,-34],[34,-28],[-38,6],[38,10],[0,-44]].forEach((q,i)=>{circle(q[0],q[1],5,'rgba(255,180,90,.25)');circle(q[0],q[1],2+i%2,'#ffcf6a');});shape(()=>ctx.arc(0,-4,23,Math.PI*1.1,Math.PI*1.5),null,'rgba(255,255,255,.35)',2);},
    tassel(){shape(()=>ctx.ellipse(0,-42,6,8,0,0,TAU),null,'#d8b45a',2.4);line([0,-35,0,-28],2.4,'#d8b45a');shape(()=>ctx.rect(-5,-30,10,3),'#e0bd73');circle(0,-20,8,rg(-3,-23,10,'#c8f0d0','#4fa86a','#1f5a34'),AO,2.2);
      shape(()=>{ctx.moveTo(0,-12);ctx.lineTo(12,0);ctx.lineTo(0,12);ctx.lineTo(-12,0);ctx.closePath();},'#c84a3a',AO,2.2);line([-6,-6,6,6],1.6,'#f0c060');line([6,-6,-6,6],1.6,'#f0c060');shape(()=>ctx.rect(-6,11,12,5),'#e0bd73',AO,1.6);
      for(let i=0;i<9;i++){const x=-5+i*1.25,sw=Math.sin(i*1.3)*3;ctx.strokeStyle=i%2?'#e4c56b':'#c84a3a';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x,16);ctx.quadraticCurveTo(x+sw,30,x+sw*1.6-(4-i)*1.2,44);ctx.stroke();}},
    wind(){shadow(20);const body=()=>{ctx.moveTo(-7,-8);ctx.bezierCurveTo(-26,-2,-28,34,0,36);ctx.bezierCurveTo(28,34,26,-2,7,-8);ctx.closePath();};shape(body,'rgba(200,236,255,.3)');ctx.save();ctx.beginPath();body();ctx.clip();circle(0,14,22,'rgba(160,220,255,.4)');
      ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=2.2;ctx.beginPath();for(let i=0;i<40;i++){const a=i*.32,r=2+i*.45;ctx.lineTo(Math.cos(a)*r,14+Math.sin(a)*r*.7);}ctx.stroke();ctx.restore();shape(body,null,AO,2.4);
      shape(()=>ctx.rect(-6,-14,12,8),'rgba(200,236,255,.4)',AO,2);shape(()=>ctx.rect(-8,-24,16,10),'#a07850',AO,2);line([-8,-14,8,-14],2,'#d8c8a8');shape(()=>ctx.ellipse(-12,10,3,8,.3,0,TAU),'rgba(255,255,255,.65)');
      ctx.strokeStyle='rgba(200,236,255,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(20,-24);ctx.quadraticCurveTo(36,-30,34,-18);ctx.quadraticCurveTo(32,-10,26,-14);ctx.stroke();ctx.beginPath();ctx.moveTo(-22,-30);ctx.quadraticCurveTo(-38,-34,-36,-22);ctx.stroke();},
    wick(){shadow(26);circle(0,-14,28,'rgba(120,230,210,.18)');shape(()=>ctx.arc(30,28,6,-1.6,1.6),null,'#a7803f',3);shape(()=>ctx.ellipse(0,30,27,8,0,0,TAU),lg(0,22,0,38,'#f0cf8a','#a7803f'),AO,2.4);
      shape(()=>{ctx.moveTo(-9,28);ctx.lineTo(-9,2);ctx.quadraticCurveTo(0,-2,9,2);ctx.lineTo(9,28);ctx.closePath();},lg(-9,0,9,0,'#fffaf0','#efe6d0','#c9bc9c'),AO,2.2);shape(()=>{ctx.moveTo(-9,4);ctx.quadraticCurveTo(-12,10,-8,15);ctx.quadraticCurveTo(-6,10,-5,4);},'#fffaf0');line([0,2,0,-4],1.6,'#3a2a1a');fl(0,-3,1.5,['#2fa39b','#7fe0d0','#eafff8']);},
    hunter(){poly([-10,18,-18,44,-10,38,-4,44,-2,20],'#2f4f7b',AO,2);poly([10,18,18,44,10,38,4,44,2,20],'#2f4f7b',AO,2);shape(()=>{ctx.moveTo(0,-38);ctx.lineTo(28,-26);ctx.lineTo(24,8);ctx.lineTo(0,30);ctx.lineTo(-24,8);ctx.lineTo(-28,-26);ctx.closePath();},lg(-28,-38,28,30,'#ffe6a8','#c99a4e','#7a5422'),AO,2.6);
      shape(()=>{ctx.moveTo(0,-30);ctx.lineTo(21,-21);ctx.lineTo(18,5);ctx.lineTo(0,22);ctx.lineTo(-18,5);ctx.lineTo(-21,-21);ctx.closePath();},null,'rgba(90,60,20,.6)',1.6);fl(0,12,1.25,['#c84a2a','#ff9a3a','#ffe6a0']);
      ctx.strokeStyle='rgba(255,240,200,.7)';ctx.lineWidth=1.2;for(let i=0;i<7;i++){const a=-Math.PI/2+(i-3)*.32;ctx.beginPath();ctx.moveTo(Math.cos(a)*17,-4+Math.sin(a)*17);ctx.lineTo(Math.cos(a)*23,-4+Math.sin(a)*23);ctx.stroke();}shape(()=>{ctx.moveTo(-22,-22);ctx.lineTo(-2,-32);},null,'rgba(255,255,255,.7)',2);},
    salvager(){shadow(28);line([-12,-6,-22,-40],4,'#a07850',AO);shape(()=>ctx.rect(-31,-47,17,9),'#6a7680',AO,2);line([10,-4,20,-36],3,'#8a96a0',AO);line([15,-4,27,-34],3,'#8a96a0',AO);circle(24,-37,4,null,'#8a96a0',2.4);shape(()=>{ctx.moveTo(-4,-8);ctx.lineTo(4,-30);ctx.lineTo(10,-28);ctx.lineTo(4,-8);ctx.closePath();},'#d8c8a8',AO,1.8);
      shape(()=>{ctx.moveTo(-30,-6);ctx.lineTo(30,-6);ctx.lineTo(32,36);ctx.quadraticCurveTo(0,42,-32,36);ctx.closePath();},lg(0,-6,0,40,'#b07a4a','#8a5a34','#5a3a20'),AO,2.6);shape(()=>{ctx.moveTo(-30,-6);ctx.lineTo(30,-6);ctx.lineTo(26,14);ctx.quadraticCurveTo(0,20,-26,14);ctx.closePath();},lg(0,-6,0,18,'#c48a56','#8a5a34'),AO,2.2);
      shape(()=>ctx.rect(-5,8,10,10),'#c49a52',AO,1.6);shape(()=>ctx.rect(-2,11,4,4),'#5a3a20');ctx.setLineDash([2,3]);ctx.strokeStyle='rgba(240,210,160,.6)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-26,30);ctx.quadraticCurveTo(0,35,26,30);ctx.stroke();ctx.setLineDash([]);},
    carving(){shadow(28);shape(()=>{ctx.moveTo(-34,-30);ctx.lineTo(10,-38);ctx.lineTo(24,-10);ctx.lineTo(16,22);ctx.lineTo(-30,26);ctx.lineTo(-38,0);ctx.closePath();},lg(-30,-30,20,20,'#7a8590','#5a6470','#3a424c'),AO,2.4);
      ctx.strokeStyle='#d8e0e4';ctx.lineWidth=1.6;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-26+i*6,-22);ctx.lineTo(-25+i*6,-2);ctx.stroke();}ctx.beginPath();ctx.moveTo(-30,-8);ctx.lineTo(2,-16);ctx.stroke();for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-24+i*6,6);ctx.lineTo(-23+i*6,18);ctx.stroke();}
      ctx.save();ctx.translate(14,8);ctx.rotate(.7);shape(()=>ctx.rect(-4,-2,8,30),lg(-4,0,4,0,'#c8a070','#8a6a3e'),AO,2.2);shape(()=>ctx.ellipse(-1,8,1.6,5,0,0,TAU),'rgba(255,240,200,.6)');shape(()=>ctx.rect(-5,-5,10,4),'#8a96a0',AO,1.4);shape(()=>{ctx.moveTo(-2.5,-5);ctx.lineTo(0,-24);ctx.lineTo(2.5,-5);ctx.closePath();},lg(-3,0,3,0,'#f4f8fa','#9fb0b8'),AO,1.8);ctx.restore();},
    shade(){shadow();const cage=()=>{ctx.moveTo(-22,-20);ctx.lineTo(22,-20);ctx.lineTo(18,32);ctx.lineTo(-18,32);ctx.closePath();};shape(cage,lg(-22,0,22,0,'rgba(60,120,50,.75)','rgba(170,240,130,.55)','rgba(40,90,40,.8)'),AO,2.4);
      [-22,-7,7,22].forEach(x=>line([x,-20,x*.82,32],2.6,'#3d4a3a',AO));shape(()=>{ctx.moveTo(-26,-20);ctx.lineTo(26,-20);ctx.lineTo(14,-34);ctx.lineTo(-14,-34);ctx.closePath();},lg(0,-34,0,-20,'#7e9a74','#3d4a3a'),AO,2.4);circle(0,-40,5,null,'#7e9a74',2.4);shape(()=>ctx.rect(-20,30,40,5),'#3d4a3a',AO,2);
      ctx.fillStyle='rgba(230,255,200,.8)';ctx.font='bold 13px "PingFang SC","Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.fillText('苓',0,13);shape(()=>ctx.ellipse(10,41,2,3,0,0,TAU),'rgba(140,220,110,.7)');shape(()=>{ctx.moveTo(-16,-16);ctx.lineTo(-13,26);},null,'rgba(255,255,255,.45)',2);},
    flag(){shape(()=>{ctx.moveTo(-34,-30);ctx.lineTo(30,-34);ctx.lineTo(34,-8);ctx.lineTo(28,4);ctx.lineTo(32,18);ctx.lineTo(20,26);ctx.lineTo(14,20);ctx.lineTo(4,34);ctx.lineTo(-6,24);ctx.lineTo(-18,36);ctx.lineTo(-24,22);ctx.lineTo(-36,26);ctx.closePath();},lg(-30,-30,30,30,'#d06070','#a03a4a','#6a2433'),AO,2.4);
      poly([-34,-30,30,-34,30,-28,-34,-24],'#e0bd73',AO,1.4);shape(()=>{ctx.moveTo(0,-18);ctx.bezierCurveTo(-9,-18,-10,-4,-11,6);ctx.lineTo(11,6);ctx.bezierCurveTo(10,-4,9,-18,0,-18);},null,'#f0d48a',2);line([-13,6,13,6],2,'#f0d48a');circle(0,10,2.2,'#f0d48a');
      line([20,26,22,34],1,'#a03a4a');line([-18,36,-19,44],1,'#a03a4a');line([4,34,6,42],1,'#a03a4a');circle(-18,8,8,'rgba(255,230,200,.12)');circle(14,-12,10,'rgba(0,0,0,.12)');},
    beads(){ctx.strokeStyle='#6a5a40';ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(0,-8,26,22,0,0,TAU);ctx.stroke();for(let i=0;i<16;i++){const a=i/16*TAU,x=Math.cos(a)*26,y=-8+Math.sin(a)*22;if(Math.abs(a-Math.PI/2)<.3)continue;circle(x,y,5,rg(x-1.5,y-1.5,6,'#fffaf0','#e0d6bc','#a89c80'),AO,1.6);line([x-1.5,y,x+1.5,y],.8,'rgba(90,70,50,.6)');}
      line([0,14,0,24],1.6,'#6a5a40');shape(()=>{ctx.moveTo(0,22);ctx.bezierCurveTo(-7,22,-8,32,-9,38);ctx.lineTo(9,38);ctx.bezierCurveTo(8,32,7,22,0,22);},lg(-9,0,9,0,'#fffaf0','#d8cfb8','#a89c80'),AO,1.8);circle(0,41,2,'#d8cfb8',AO,1);},
    journal(){shadow(30);ctx.save();ctx.rotate(-.12);shape(()=>ctx.rect(-24,-32,48,62),'#e8dcc0',AO,2.4);ctx.strokeStyle='rgba(120,100,70,.5)';ctx.lineWidth=1;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(24,-28+i*10);ctx.lineTo(28,-28+i*10);ctx.stroke();}
      shape(()=>ctx.rect(-28,-34,48,64),lg(-28,-34,20,30,'#8a6440','#6a4a2e','#3e2a18'),AO,2.6);shape(()=>ctx.rect(-22,-28,36,52),null,'rgba(220,180,110,.45)',1.4);shape(()=>{ctx.moveTo(-4,-14);ctx.bezierCurveTo(-11,-14,-12,-2,-13,6);ctx.lineTo(5,6);ctx.bezierCurveTo(4,-2,3,-14,-4,-14);},'#c49a52',AO,1.6);
      shape(()=>ctx.rect(16,-6,10,12),'#3e2a18',AO,1.6);circle(24,0,4,'#e0bd73',AO,1.4);poly([-8,30,-4,30,-4,44,-6,40,-8,44],'#7b2f2f',AO,1.2);poly([-28,-34,-18,-34,-28,-24],'#c49a52',AO,1.2);poly([-28,30,-18,30,-28,20],'#c49a52',AO,1.2);ctx.restore();},
    key(){ctx.save();ctx.rotate(-.5);circle(0,-24,13,null,AO,10);circle(0,-24,13,null,'#6a737b',6.5);shape(()=>{ctx.moveTo(0,-31);ctx.bezierCurveTo(-5,-31,-6,-23,-7,-18);ctx.lineTo(7,-18);ctx.bezierCurveTo(6,-23,5,-31,0,-31);},'#7a838b',AO,1.6);
      shape(()=>ctx.rect(-3.5,-11,7,46),lg(-4,0,4,0,'#9aa4ac','#5a636b'),AO,2.2);shape(()=>{ctx.moveTo(3.5,22);ctx.lineTo(14,22);ctx.lineTo(14,27);ctx.lineTo(9,27);ctx.lineTo(9,31);ctx.lineTo(14,31);ctx.lineTo(14,36);ctx.lineTo(3.5,36);ctx.closePath();},'#6a737b',AO,2);
      circle(-1,4,2,'rgba(160,90,40,.6)');circle(1,16,1.6,'rgba(160,90,40,.5)');circle(-6,-30,1.6,'rgba(160,90,40,.5)');ctx.strokeStyle='#2fa39b';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(-8,-34);ctx.quadraticCurveTo(-20,-46,-10,-50);ctx.stroke();ctx.restore();},
    glass(){circle(0,4,30,'rgba(160,240,140,.2)');shape(()=>{ctx.moveTo(-20,-30);ctx.quadraticCurveTo(10,-36,24,-18);ctx.lineTo(16,-4);ctx.lineTo(26,12);ctx.lineTo(8,34);ctx.lineTo(-6,20);ctx.lineTo(-22,26);ctx.lineTo(-14,4);ctx.closePath();},lg(-20,-30,24,30,'rgba(200,255,190,.9)','rgba(90,170,90,.8)','rgba(30,80,40,.9)'),AO,2.2);
      circle(2,4,9,'rgba(220,255,170,.6)');circle(2,4,4,'#f4ffd8');line([-14,-24,14,-26],1.4,'rgba(255,255,255,.75)');line([-10,-16,-12,10],1,'rgba(255,255,255,.45)');line([-20,-30,24,-18],3,'#3d4a3a');},
    ribbon(){shape(()=>{ctx.moveTo(-34,-30);ctx.bezierCurveTo(-10,-40,0,-10,14,-20);ctx.bezierCurveTo(28,-30,30,0,22,12);ctx.bezierCurveTo(14,26,26,34,34,40);ctx.lineTo(26,44);ctx.bezierCurveTo(14,36,2,28,12,10);ctx.bezierCurveTo(20,-6,16,-14,8,-8);ctx.bezierCurveTo(-4,0,-14,-26,-34,-20);ctx.closePath();},lg(-34,-30,34,40,'#b8608a','#7d3150','#4c1a30'),AO,2.2);
      ctx.setLineDash([2.5,3]);ctx.strokeStyle='#f0d48a';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-30,-26);ctx.bezierCurveTo(-8,-34,2,-6,14,-14);ctx.stroke();ctx.setLineDash([]);line([34,40,38,46],1,'#7d3150');line([26,44,28,50],1,'#7d3150');},
    chain(){shadow(26);for(let i=0;i<5;i++){const x=-34+i*9,y=-32+i*7;ctx.strokeStyle=AO;ctx.lineWidth=4.4;ctx.beginPath();ctx.ellipse(x,y,5.5,3.4,.6+(i%2)*1.2,0,TAU);ctx.stroke();ctx.strokeStyle='#c49a52';ctx.lineWidth=2.4;ctx.stroke();}
      const sh=()=>{ctx.moveTo(-8,2);ctx.lineTo(-8,-12);ctx.arc(2,-12,10,Math.PI,-.4);};shape(sh,null,AO,8);shape(sh,null,'#d8b064',4.4);ctx.save();ctx.translate(4,16);ctx.rotate(.18);shape(()=>{ctx.moveTo(-16,-14);ctx.lineTo(16,-14);ctx.lineTo(18,16);ctx.quadraticCurveTo(0,22,-18,16);ctx.closePath();},lg(-16,-14,16,18,'#f0cf8a','#c49a52','#7a5422'),AO,2.6);
      circle(0,-2,3.6,'#3a2a14');poly([-2,0,2,0,3,9,-3,9],'#3a2a14');line([-14,-8,14,-8],1.2,'rgba(255,240,200,.5)');ctx.restore();sparkle2(24,-22,4);},
    blade(){ctx.save();ctx.rotate(.75);bladeArt(52);ctx.restore();sparkle2(18,-28,7);sparkle2(-6,-16,3);sparkle2(28,-6,3);},
    heart(){circle(0,0,35,'rgba(130,230,203,.18)');ctx.save();ctx.translate(0,29);ctx.scale(1.3,1.3);drawGhost(GH,0,0);ctx.restore();sparkle2(-25,-25,4);sparkle2(24,-12,3);},
    flask(){shadow(22);circle(0,14,30,'rgba(110,230,190,.16)');const body=()=>{ctx.moveTo(-6,-22);ctx.lineTo(-6,-8);ctx.bezierCurveTo(-28,-2,-28,38,0,38);ctx.bezierCurveTo(28,38,28,-2,6,-8);ctx.lineTo(6,-22);ctx.closePath();};shape(body,'rgba(220,250,240,.3)');
      ctx.save();ctx.beginPath();body();ctx.clip();shape(()=>ctx.rect(-30,6,60,40),lg(0,6,0,40,'#9ff0d0','#3fbf98','#1f7a64'));shape(()=>ctx.ellipse(0,6,22,4,0,0,TAU),'#c8fff0');circle(-6,22,2.4,'rgba(255,255,255,.7)');circle(5,28,1.6,'rgba(255,255,255,.6)');circle(8,16,1.2,'rgba(255,255,255,.6)');ctx.restore();shape(body,null,AO,2.4);
      shape(()=>ctx.rect(-8,-30,16,9),'#a07850',AO,2);line([-7,-18,7,-18],2,'#d8c8a8');shape(()=>{ctx.moveTo(8,-18);ctx.quadraticCurveTo(22,-26,26,-14);ctx.quadraticCurveTo(16,-10,8,-18);},'#6fbf6a',AO,1.6);shape(()=>ctx.ellipse(-12,10,3,8,.3,0,TAU),'rgba(255,255,255,.6)');},
    swift(){[[-18,.22],[-9,.45],[0,1]].forEach(q=>{ctx.save();ctx.globalAlpha=q[1];ctx.translate(q[0]+6,4);ctx.rotate(.75);bladeArt(46);ctx.restore();});ctx.strokeStyle='rgba(255,250,210,.85)';ctx.lineWidth=2.4;[[-44,-18,-26],[-46,-2,-28],[-42,14,-24]].forEach(q=>{ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(q[2],q[1]);ctx.stroke();});},
    reach(){shape(()=>{ctx.arc(-4,12,42,-1.95,.15,false);ctx.arc(-12,18,31,.15,-1.95,true);ctx.closePath();},'rgba(220,240,255,.75)');shape(()=>ctx.arc(-4,12,42,-1.95,.15),null,'#ffffff',2);ctx.save();ctx.translate(-12,18);ctx.rotate(.8);bladeArt(56);ctx.restore();},
    dash(){[[-26,.22],[-13,.45],[0,1]].forEach(q=>{ctx.save();ctx.globalAlpha=q[1];ctx.translate(q[0]+8,34);ctx.scale(1.2,1.2);drawGhost(q[1]<1?GH_TRAIL:GH,1.2,0);ctx.restore();});ctx.strokeStyle='rgba(200,240,255,.85)';ctx.lineWidth=2;[[-46,-8],[-48,6],[-44,20]].forEach(q=>{ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(q[0]+16,q[1]);ctx.stroke();});},
    vigor(){circle(0,0,32,'rgba(255,190,110,.18)');shape(()=>{ctx.moveTo(0,30);ctx.bezierCurveTo(-30,26,-38,0,-30,-8);ctx.bezierCurveTo(-18,4,-8,14,0,30);},lg(-30,0,0,30,'#8fd68a','#3f8a4a'),AO,2.2);shape(()=>{ctx.moveTo(0,30);ctx.bezierCurveTo(30,26,38,0,30,-8);ctx.bezierCurveTo(18,4,8,14,0,30);},lg(30,0,0,30,'#8fd68a','#3f8a4a'),AO,2.2);
      line([-24,-2,-4,24],1,'rgba(20,60,30,.5)');line([24,-2,4,24],1,'rgba(20,60,30,.5)');fl(0,18,2);sparkle2(-20,-26,3.5);sparkle2(22,-20,3);},
    spring(){shadow();shape(()=>{ctx.moveTo(-12,-6);ctx.bezierCurveTo(-30,-30,-44,-20,-40,-10);ctx.bezierCurveTo(-36,-12,-30,-4,-26,-6);ctx.bezierCurveTo(-30,0,-26,6,-14,4);ctx.closePath();},lg(-40,-20,-12,0,'#ffffff','#b8e8e0'),AO,2);line([-36,-14,-18,-4],1,'rgba(60,110,110,.5)');line([-30,-6,-16,0],1,'rgba(60,110,110,.5)');
      shape(()=>{ctx.moveTo(-14,-24);ctx.lineTo(6,-24);ctx.lineTo(8,10);ctx.quadraticCurveTo(30,12,32,24);ctx.lineTo(32,30);ctx.lineTo(-16,30);ctx.lineTo(-16,8);ctx.closePath();},lg(0,-24,0,30,'#7ac0b4','#3f8a80','#24564f'),AO,2.4);shape(()=>ctx.rect(-16,26,48,5),'#2a3a38');shape(()=>ctx.rect(-15,-26,22,6),'#a9d8d0',AO,1.8);
      line([-6,-14,4,-14],1.4,'#d8f0ea');line([-6,-6,4,-6],1.4,'#d8f0ea');ctx.strokeStyle='rgba(200,255,240,.75)';ctx.lineWidth=2;[[12,-36],[20,-30],[28,-38]].forEach(q=>{ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(q[0],q[1]-10);ctx.stroke();});},
    flame(){circle(0,4,34,'rgba(120,230,210,.18)');ctx.strokeStyle='rgba(160,250,230,.65)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,12,34,10,-.2,0,TAU);ctx.stroke();ctx.beginPath();ctx.ellipse(0,12,26,7,.3,0,TAU);ctx.stroke();fl(0,24,2.4,['#2fa39b','#78d9c8','#eaffee']);circle(-30,6,2.4,'#eaffee');circle(28,20,2,'#eaffee');circle(14,-30,1.8,'#eaffee');},
    soup(){shadow(30);ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2.4;[-10,2,14].forEach((x,i)=>{ctx.beginPath();ctx.moveTo(x,-10);ctx.bezierCurveTo(x-8,-20,x+8,-28,x,-40-i*2);ctx.stroke();});
      shape(()=>{ctx.moveTo(-34,0);ctx.quadraticCurveTo(-32,34,0,36);ctx.quadraticCurveTo(32,34,34,0);ctx.closePath();},lg(0,0,0,36,'#b07a4a','#7a4a2a','#4a2a18'),AO,2.6);shape(()=>ctx.ellipse(0,0,34,9,0,0,TAU),'#5a3a20',AO,2.4);shape(()=>ctx.ellipse(0,1,29,6.5,0,0,TAU),lg(0,-6,0,8,'#ffc070','#d87a2a'));
      circle(-10,0,3,'#7ab060');circle(8,2,2.5,'#f0e0b0');circle(16,-1,2,'#7ab060');line([12,-2,30,-26],3.4,'#c8a070',AO);shape(()=>ctx.ellipse(10,0,5,3,-.9,0,TAU),'#c8a070',AO,1.4);line([-30,14,30,14],1.4,'rgba(255,220,170,.35)');},
    whetstone(){shadow(32);shape(()=>{ctx.moveTo(-34,8);ctx.lineTo(18,-16);ctx.lineTo(36,-6);ctx.lineTo(-16,20);ctx.closePath();},lg(0,-16,0,20,'#9aa4aa','#6a747a'),AO,2.4);shape(()=>{ctx.moveTo(-34,8);ctx.lineTo(-16,20);ctx.lineTo(-16,32);ctx.lineTo(-34,20);ctx.closePath();},'#4a5258',AO,2.2);shape(()=>{ctx.moveTo(-16,20);ctx.lineTo(36,-6);ctx.lineTo(36,6);ctx.lineTo(-16,32);ctx.closePath();},'#5a636a',AO,2.2);
      const cr=()=>{ctx.moveTo(-20,8);ctx.lineTo(-6,2);ctx.lineTo(2,6);ctx.lineTo(16,-4);ctx.moveTo(-6,2);ctx.lineTo(-2,-6);};shape(cr,null,'#ff9a3a',2.2);shape(cr,null,'#ffe6a0',.9);[[22,-26],[30,-20],[14,-32]].forEach(q=>line([q[0],q[1],q[0]+5,q[1]-4],1.6,'#ffcf6a'));},
    ember(){circle(0,0,30,'rgba(255,160,70,.22)');shape(()=>{ctx.moveTo(0,-34);ctx.lineTo(18,-6);ctx.lineTo(10,30);ctx.lineTo(-12,28);ctx.lineTo(-18,-4);ctx.closePath();},lg(-18,-34,18,30,'#fff1c2','#ffb347','#c4501c'),AO,2.4);
      line([0,-34,-2,4,-12,28],1.2,'rgba(255,255,255,.5)');line([-2,4,18,-6],1.2,'rgba(150,50,10,.4)');line([-2,4,10,30],1.2,'rgba(150,50,10,.3)');shape(()=>{ctx.moveTo(-4,-24);ctx.lineTo(4,-12);ctx.lineTo(-8,-6);ctx.closePath();},'rgba(255,255,255,.55)');sparkle2(20,-24,4);sparkle2(-22,16,3);},
    bell(){shadow();circle(0,-34,6,null,'#a7803f',3.4);bellArt('#f0cf8a','#c49a52','#6a4a22');shape(()=>ctx.ellipse(0,27,31,5,0,0,TAU),'#d8b064',AO,2.2);line([-21,6,21,6],2,'rgba(90,60,20,.6)');line([-24,14,24,14],1.4,'rgba(255,240,200,.4)');circle(4,35,5,'#8a6a3a',AO,1.8);shape(()=>{ctx.moveTo(-10,-20);ctx.quadraticCurveTo(-15,-4,-15,12);},null,'rgba(255,255,255,.6)',2.4);},
    fire(){shadow(30);circle(0,10,30,'rgba(255,160,70,.22)');line([-26,34,22,20],7,'#6a4a2f',AO);line([26,34,-22,20],7,'#5a3d27',AO);[-20,-10,0,10,20].forEach(x=>circle(x,36,5,'#5a5f66',AO,1.4));fl(0,26,2.6);fl(-11,28,1.4);fl(11,28,1.5);},
    // ---- v5.0 收集品：魂灯碎片、墨翁的地图、图纸，以及靠图纸解锁的四件护符 ----
    shard(){circle(0,4,34,'rgba(120,236,214,.18)');circle(0,4,22,'rgba(160,250,230,.18)');shape(()=>{ctx.moveTo(-6,-34);ctx.lineTo(16,-22);ctx.lineTo(22,6);ctx.lineTo(6,32);ctx.lineTo(-14,24);ctx.lineTo(-20,-4);ctx.closePath();},lg(-20,-30,22,30,'rgba(220,255,248,.95)','rgba(110,210,196,.85)','rgba(30,96,96,.95)'),AO,2.4);
      shape(()=>{ctx.moveTo(-6,-34);ctx.lineTo(16,-22);ctx.lineTo(2,-8);ctx.closePath();},'rgba(255,255,255,.45)');line([2,-8,22,6],1.2,'rgba(255,255,255,.55)');line([2,-8,-14,24],1.2,'rgba(20,70,70,.5)');fl(1,16,1.05,['#2fa39b','#7fe6d4','#effff9']);sparkle2(-24,-26,5);sparkle2(26,-12,3.5);sparkle2(18,30,3);},
    map(){shadow(30);ctx.save();ctx.rotate(-.08);shape(()=>{ctx.moveTo(-34,-24);ctx.quadraticCurveTo(-10,-30,10,-24);ctx.quadraticCurveTo(26,-28,36,-22);ctx.lineTo(36,26);ctx.quadraticCurveTo(26,20,10,26);ctx.quadraticCurveTo(-10,20,-34,26);ctx.closePath();},lg(-34,-24,36,26,'#f2e4c0','#dcc596','#b99a64'),AO,2.4);
      ctx.strokeStyle='#3a2a1a';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(-26,12);ctx.lineTo(-14,12);ctx.lineTo(-14,2);ctx.lineTo(0,2);ctx.lineTo(0,10);ctx.lineTo(14,10);ctx.lineTo(14,-4);ctx.lineTo(28,-4);ctx.stroke();ctx.setLineDash([2.5,3]);ctx.beginPath();ctx.moveTo(-26,-12);ctx.quadraticCurveTo(-6,-20,12,-12);ctx.stroke();ctx.setLineDash([]);
      shape(()=>{ctx.moveTo(-4,-4);ctx.lineTo(-4,-9);ctx.arc(0,-9,4,Math.PI,0);ctx.lineTo(4,-4);ctx.closePath();},'#ffffff','#3a2a1a',1.2);circle(28,-4,3.4,'#c08a2a','#3a2a1a',1.2);shape(()=>ctx.ellipse(-34,1,5,25,0,0,TAU),'#c9ad78',AO,2);shape(()=>ctx.ellipse(36,2,5,24,0,0,TAU),'#c9ad78',AO,2);ctx.restore();
      ctx.save();ctx.translate(20,-30);ctx.rotate(.7);shape(()=>{ctx.moveTo(0,0);ctx.quadraticCurveTo(6,-14,2,-30);ctx.quadraticCurveTo(-4,-15,0,0);ctx.closePath();},'#f4f6f8',AO,1.6);line([0,0,1,-26],.8,'#9aa8b0');ctx.restore();},
    blueprint(){shadow(30);ctx.save();ctx.rotate(.1);shape(()=>ctx.rect(-32,-24,64,48),lg(-32,-24,32,24,'#5a86b8','#3c6a9c','#2a4c74'),AO,2.4);ctx.strokeStyle='rgba(230,244,255,.85)';ctx.lineWidth=1.3;for(let i=-24;i<=24;i+=8){ctx.beginPath();ctx.moveTo(i,-22);ctx.lineTo(i,22);ctx.stroke();}ctx.globalAlpha=.35;for(let i=-16;i<=16;i+=8){ctx.beginPath();ctx.moveTo(-30,i);ctx.lineTo(30,i);ctx.stroke();}ctx.globalAlpha=1;
      ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-16);ctx.bezierCurveTo(-11,-16,-12,-2,-13,8);ctx.lineTo(13,8);ctx.bezierCurveTo(12,-2,11,-16,0,-16);ctx.stroke();ctx.beginPath();ctx.arc(0,12,3,0,TAU);ctx.stroke();ctx.restore();line([-30,30,30,30],4,'#c49a52',AO);circle(0,30,5,'#e6c078',AO,1.6);sparkle2(30,-28,5);},
    veil(){shadow(24);circle(0,0,34,'rgba(255,226,160,.14)');[0,1].forEach(i=>{ctx.strokeStyle='rgba(255,236,190,'+(.55-i*.2)+')';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,26+i*8,-2.5,-.6);ctx.stroke();});line([0,-34,0,-24],2.4,'#a7803f',AO);
      shape(()=>{ctx.moveTo(0,-26);ctx.bezierCurveTo(-14,-26,-15,-6,-17,8);ctx.quadraticCurveTo(-22,14,-23,18);ctx.lineTo(23,18);ctx.quadraticCurveTo(22,14,17,8);ctx.bezierCurveTo(15,-6,14,-26,0,-26);},lg(-20,0,20,0,'#f4f6f8','#c8d4dc','#8a98a4'),AO,2.4);circle(0,22,4.5,'#8a6a3a',AO,1.6);
      shape(()=>{ctx.moveTo(-6,-30);ctx.quadraticCurveTo(-26,-36,-30,-20);ctx.quadraticCurveTo(-18,-26,-6,-26);ctx.closePath();},'#d06070',AO,1.6);shape(()=>{ctx.moveTo(6,-30);ctx.quadraticCurveTo(26,-36,30,-20);ctx.quadraticCurveTo(18,-26,6,-26);ctx.closePath();},'#b04a5a',AO,1.6);sparkle2(-10,-12,3);},
    hunt(){shadow(26);ctx.save();ctx.rotate(.7);shape(()=>{ctx.moveTo(-4,14);ctx.quadraticCurveTo(-10,-14,0,-44);ctx.quadraticCurveTo(8,-14,4,14);ctx.closePath();},lg(-6,0,6,0,'#f4f8fa','#a8c8d0','#5a7a84'),AO,2.2);line([0,10,1,-38],1,'rgba(255,255,255,.85)');shape(()=>ctx.rect(-12,13,24,5),'#5a4a6a',AO,1.8);shape(()=>ctx.rect(-3.5,18,7,18),'#3a2f4a',AO,1.8);circle(0,39,3.6,'#9ff3e0',AO,1.4);ctx.restore();
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.6;fl(-8,-6,1.15,['#2fa39b','#7fe6d4','#effff9']);ctx.restore();sparkle2(22,-30,4);},
    echo(){shadow(30);[0,1,2].forEach(i=>{ctx.strokeStyle='rgba(160,250,230,'+(.7-i*.2)+')';ctx.lineWidth=2.2-i*.4;ctx.beginPath();ctx.ellipse(0,6,24+i*9,10+i*4,0,0,TAU);ctx.stroke();});shape(()=>ctx.ellipse(0,4,22,16,-.15,0,TAU),rg(-6,-4,26,'#d8f0ea','#7aa8a0','#3a5a58'),AO,2.4);
      ctx.strokeStyle='rgba(40,80,76,.6)';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(0,4,7,0,TAU);ctx.stroke();ctx.beginPath();ctx.arc(0,4,13,-.6,1.6);ctx.stroke();shape(()=>ctx.ellipse(-8,-4,5,3,-.4,0,TAU),'rgba(255,255,255,.5)');sparkle2(26,-22,4);},
    guide(){shadow(24);circle(0,-6,34,'rgba(255,214,140,.16)');ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.35;shape(()=>{ctx.moveTo(4,-4);ctx.lineTo(46,-26);ctx.lineTo(46,18);ctx.closePath();},'#ffe2a8');ctx.restore();line([-6,-38,-6,-28],2.4,'#7a5634',AO);shape(()=>ctx.arc(-6,-40,5,Math.PI,0),null,'#a7803f',2.4);
      shape(()=>{ctx.moveTo(-18,-26);ctx.lineTo(6,-26);ctx.lineTo(8,16);ctx.lineTo(-20,16);ctx.closePath();},lg(-20,0,8,0,'#6a5236','#a07a4a','#5a4228'),AO,2.2);shape(()=>ctx.rect(-14,-20,16,30),rg(-6,-5,16,'#fff6dc','#ffd27a','#d8902a'),AO,1.6);fl(-6,6,1,['#ff9a3a','#ffd27a','#fff6dc']);shape(()=>ctx.rect(-22,16,32,6),'#5a4228',AO,1.8);sparkle2(30,-8,4);},
    // ---- 技能图：每个角色三张 ----
    sk_shade(){[[-30,.22],[-16,.48]].forEach(q=>{ctx.save();ctx.globalAlpha=q[1];ctx.translate(q[0],32);ctx.scale(1.1,1.1);drawGhost(GH_SHADE,1,0);ctx.restore();});ctx.save();ctx.translate(6,32);ctx.scale(1.15,1.15);drawGhost(GH,1.2,0);ctx.restore();
      shape(()=>{ctx.arc(8,-2,42,-1.25,.95);ctx.arc(0,5,31,.95,-1.25,true);ctx.closePath();},'rgba(214,196,255,.8)');shape(()=>ctx.arc(8,-2,42,-1.25,.95),null,'#ffffff',2.4);sparkle2(34,-32,6);sparkle2(-36,-20,3);},
    sk_ring(){circle(0,4,36,'rgba(120,230,210,.16)');ctx.strokeStyle='rgba(160,250,230,.75)';ctx.lineWidth=2.4;ctx.beginPath();ctx.ellipse(0,8,36,15,0,0,TAU);ctx.stroke();ctx.save();ctx.translate(0,32);ctx.scale(.95,.95);drawGhost(GH,1,0);ctx.restore();[[-36,10],[24,-2],[18,22]].forEach(q=>fl(q[0],q[1]+8,1.05,['#2fa39b','#78d9c8','#eaffee']));},
    sk_bolt(){circle(8,-6,32,'rgba(110,240,210,.16)');ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.6;shape(()=>{ctx.moveTo(16,-16);ctx.quadraticCurveTo(-6,-2,-46,32);ctx.quadraticCurveTo(0,6,26,0);ctx.closePath();},'#62e9d2');ctx.restore();fl(20,10,2.15,['#2fa39b','#7fe6d4','#effff9']);circle(16,-13,1.7,'#0b2a28');circle(24,-13,1.7,'#0b2a28');sparkle2(-30,12,4);sparkle2(36,-34,5);},
    sk_quake(){shape(()=>ctx.rect(-46,28,92,8),'#5a4a3a',AO,2);[-1,1].forEach(d=>{ctx.strokeStyle='rgba(255,226,170,.85)';for(let i=0;i<3;i++){ctx.lineWidth=3.2-i*.7;ctx.beginPath();if(d>0)ctx.arc(10+i*10,28,10+i*8,-1.45,-.15);else ctx.arc(-10-i*10,28,10+i*8,Math.PI+.15,Math.PI+1.45);ctx.stroke();}});poly([-34,28,-28,15,-22,28],'#8a7a66',AO,1.5);poly([24,28,31,12,38,28],'#8a7a66',AO,1.5);ctx.save();ctx.translate(-2,-2);ctx.rotate(.18);hammerArt();ctx.restore();},
    sk_dome(){shadow(32);ctx.save();ctx.translate(0,36);ctx.scale(.95,.95);drawGhost(GH,1,0);ctx.restore();ctx.save();ctx.globalAlpha=.5;bellArt('#ffe6a8','#d8a858','#8a5a22');ctx.restore();shape(()=>{ctx.moveTo(0,-28);ctx.bezierCurveTo(-18,-28,-20,-6,-22,14);ctx.quadraticCurveTo(-30,22,-31,27);ctx.lineTo(31,27);ctx.quadraticCurveTo(30,22,22,14);ctx.bezierCurveTo(20,-6,18,-28,0,-28);},null,'#fff1c2',2.4);circle(0,-34,6,null,'#a7803f',3.4);sparkle2(-26,-18,5);sparkle2(27,2,4);},
    sk_toll(){[0,1,2].forEach(i=>{ctx.strokeStyle='rgba(255,226,160,'+(.85-i*.24).toFixed(2)+')';ctx.lineWidth=3.2-i*.7;ctx.beginPath();ctx.arc(0,-2,32+i*8,-2.7,-.45);ctx.stroke();ctx.beginPath();ctx.arc(0,-2,32+i*8,.45,2.7);ctx.stroke();});ctx.save();ctx.scale(.72,.72);ART.bell();ctx.restore();},
    sk_fan(){[-.5,-.25,0,.25,.5].forEach(a=>{ctx.save();ctx.translate(-30,22);ctx.rotate(a-.62);arrowArt(64);ctx.restore();});circle(-30,22,8,'#8c6b3f',AO,2);sparkle2(34,-24,4);},
    sk_trap(){shadow(26);circle(0,8,32,'rgba(140,230,210,.18)');for(let i=0;i<8;i++){const a=i/8*TAU;poly([Math.cos(a)*16,12+Math.sin(a)*12,Math.cos(a+.2)*30,12+Math.sin(a+.2)*24,Math.cos(a+.4)*16,12+Math.sin(a+.4)*12],'#8a96a0',AO,1.4);}
      shape(()=>{ctx.moveTo(-14,-6);ctx.lineTo(14,-6);ctx.lineTo(18,26);ctx.lineTo(-18,26);ctx.closePath();},lg(-18,0,18,0,'#5a4a3a','#8a6a44','#4a3a2a'),AO,2.2);shape(()=>ctx.rect(-9,0,18,19),rg(0,9,14,'#effff9','#8be1ce','#2fa39b'),AO,1.4);shape(()=>{ctx.moveTo(-11,-6);ctx.lineTo(0,-19);ctx.lineTo(11,-6);ctx.closePath();},'#6a5a4a',AO,2);circle(0,-23,4,null,'#a7803f',2.4);},
    sk_pierce(){ctx.save();ctx.rotate(-.35);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.5;shape(()=>{ctx.moveTo(44,0);ctx.lineTo(-46,-13);ctx.lineTo(-46,13);ctx.closePath();},'#ffe6a8');ctx.restore();ctx.save();ctx.rotate(-.35);ctx.translate(-42,0);ctx.scale(1.38,1.38);arrowArt(62);ctx.restore();ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2;[[-44,-22],[-40,24],[-18,-36]].forEach(q=>{ctx.beginPath();ctx.moveTo(q[0],q[1]);ctx.lineTo(q[0]+18,q[1]-6);ctx.stroke();});sparkle2(36,-18,7);}};
  // 技能图用到的小零件：钟锤、箭
  function hammerArt(){shape(()=>ctx.rect(-3.5,-44,7,42),lg(-4,0,4,0,'#8a6a44','#5a3d27'),AO,2);line([-3.5,-36,3.5,-33],1.2,'#3a2a1a');line([-3.5,-28,3.5,-25],1.2,'#3a2a1a');ctx.save();ctx.translate(0,6);ctx.scale(.62,.62);bellArt('#f0cf8a','#c49a52','#6a4a22');shape(()=>ctx.ellipse(0,27,31,5,0,0,TAU),'#d8b064',AO,2.2);ctx.restore();}
  function arrowArt(len){line([0,0,len-10,0],2.6,'#c9b48a',AO);poly([len-12,-5,len,0,len-12,5],lg(len-12,-5,len,5,'#ffffff','#9aa8b0'),AO,1.6);poly([2,0,-6,-6,-2,0,-6,6],'#e8e0cc',AO,1.2);}
  const ARTC={},ARTU={};
  function artCanvas(id,dark){const k=id+(dark?'#':'');if(ARTC[k]!==undefined)return ARTC[k];let c=null;const keep=ctx;
    try{c=document.createElement('canvas');c.width=c.height=192;ctx=c.getContext('2d');ctx.translate(96,96);ctx.scale(1.86,1.86);ctx.lineCap='round';ctx.lineJoin='round';(ART[id]||ART.ember)();
      if(dark){ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle='#2a323c';ctx.fillRect(0,0,192,192);ctx.globalCompositeOperation='source-over';}}catch(e){c=null;}ctx=keep;ARTC[k]=c;return c;}
  function artURL(id,dark){const k=id+(dark?'#':'');if(ARTU[k]!=null)return ARTU[k];let u='';try{const c=artCanvas(id,dark);u=c?c.toDataURL():'';}catch(e){u='';}ARTU[k]=u;return u;}
  function drawArt(id,x,y,size,a){const c=artCanvas(id);if(!c)return;const k=ctx.globalAlpha;if(a!=null)ctx.globalAlpha=k*a;ctx.drawImage(c,x-size/2,y-size/2,size,size);ctx.globalAlpha=k;}
  // 砖石纹理：画一次进离屏画布（2 倍分辨率），之后当 pattern 平铺
  function weatherTile(g,w,h,key){const r=rng(191+key.split('').reduce((a,c)=>a+c.charCodeAt(0),0)),wet=L.theme==='sewers',bone=L.theme==='ossuary',metal=L.theme==='tower';
    g.save();for(let i=0;i<w*h/14;i++){const x=r()*w,y=r()*h;g.fillStyle=i%3?'rgba(0,0,0,.12)':'rgba(240,228,194,.09)';g.fillRect(x,y,.3+r()*.8,.3+r()*.7);}
    for(let i=0;i<5;i++){const x=r()*w,y=r()*h;g.strokeStyle='rgba(2,6,9,.28)';g.lineWidth=.6;g.beginPath();g.moveTo(x,y);g.lineTo(x+3,y+3);g.lineTo(x+1,y+6);g.lineTo(x+5,y+9);g.stroke();}
    if(wet||bone){for(let i=0;i<12;i++){g.fillStyle=wet?'rgba(95,145,75,.16)':'rgba(195,182,158,.08)';g.beginPath();g.ellipse(r()*w,r()*h,2+r()*5,.6+r()*2,0,0,Math.PI*2);g.fill();}}
    if(metal){g.strokeStyle='rgba(204,157,80,.17)';g.lineWidth=.5;g.beginPath();g.moveTo(0,h-3);g.lineTo(w,h-3);g.stroke();for(let x=8;x<w;x+=24){g.fillStyle='#17191a';g.fillRect(x,3,2,2);g.fillStyle='rgba(229,190,118,.3)';g.fillRect(x,3,1,.6);}}
    g.restore();}
  function tile(k,w,h,paint){if(!cache[k]){const c=document.createElement('canvas');c.width=w*2;c.height=h*2;const g=c.getContext('2d');g.scale(2,2);paint(g,w,h);weatherTile(g,w,h,k);cache[k]=ctx.createPattern(c,'repeat');}return cache[k];}
  function bricks(cols,mortar,bw,bh,seed){return(g,w,h)=>{const r=rng(seed);g.fillStyle=mortar;g.fillRect(0,0,w,h);for(let y=0,row=0;y<h;y+=bh,row++)for(let x=row%2?-bw/2:0;x<w;x+=bw){const v=r(),c=cols[Math.floor(v*cols.length)],put=xx=>{g.fillStyle=c;g.fillRect(xx+1,y+1,bw-2,bh-2);g.fillStyle='rgba(255,255,255,.05)';g.fillRect(xx+1,y+1,bw-2,1.5);g.fillStyle='rgba(0,0,0,.2)';g.fillRect(xx+1,y+bh-2.5,bw-2,1.5);if(v>.88){g.fillStyle='rgba(0,0,0,.32)';g.fillRect(xx+bw*.35,y+3,1.4,bh-6);}};put(x);if(x<0)put(x+w);}};}
  function patRect(pat,x,y,w,h,ax){ctx.save();ctx.translate(ax,0);ctx.scale(.5,.5);ctx.fillStyle=pat;ctx.fillRect((x-ax)*2,y*2,w*2,h*2);ctx.restore();}
  const wallPat=()=>tile('wall'+L.theme,192,80,bricks(T.wall.slice(0,3),tint(T.wall[0],.84),48,20,5));
  const stonePat=()=>tile('stone'+L.theme,96,24,bricks(T.stone.slice(0,3),T.stone[3],24,12,9));
  const floorPat=()=>tile('floor'+L.theme,96,48,bricks(T.floor.slice(0,3),T.floor[3],48,24,13));

  // ---- 远景：天色、钟楼、城堡剪影 / 下水道隧洞 / 落日山脊 / 巨钟表盘、拱窗长廊、光柱 ----
  let skyLayer=null,skyTheme='',skyWidth=0,skyHeight=0;
  function drawSky(){if(!skyLayer||skyTheme!==L.theme||skyWidth!==Math.ceil(W)||skyHeight!==Math.ceil(H)){skyWidth=Math.ceil(W);skyHeight=Math.ceil(H);skyTheme=L.theme;skyLayer=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(skyWidth,skyHeight):document.createElement('canvas');skyLayer.width=skyWidth;skyLayer.height=skyHeight;const g=skyLayer.getContext('2d'),gradient=g.createLinearGradient(0,0,0,skyHeight);for(let i=0;i<T.sky.length;i++)gradient.addColorStop(T.sky[i][0],T.sky[i][1]);g.fillStyle=gradient;g.fillRect(0,0,skyWidth,skyHeight);}ctx.drawImage(skyLayer,0,viewY,W,H);if(T.outdoor)drawSun();}
  function drawSun(){const x=W*.7-cam*.02,y=212;ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.5;ctx.translate(x,y);ctx.scale(300,300);ctx.fillStyle=glowGrad('#ff9a5a');ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();circle(x,y,36,'#ffcf94');circle(x,y,31,'#ffe6c0');
    ctx.fillStyle='rgba(110,52,84,.5)';for(let i=0;i<7;i++){const span=W+500,cx=((i*347-cam*.04-time*3)%span+span)%span-250,cy=80+(i*53)%150;ctx.beginPath();ctx.ellipse(cx,cy,110+(i*29)%90,6+(i%3)*3,0,0,TAU);ctx.fill();}}
  function drawRidges(){[[.04,'#3b2a45',305,70],[.08,'#2f2139',352,48]].forEach((q,j)=>{const off=cam*q[0];ctx.fillStyle=q[1];ctx.beginPath();ctx.moveTo(-10,480);for(let x=-10;x<=W+26;x+=18){const u=x+off;ctx.lineTo(x,q[2]-q[3]*(.55*Math.sin(u*.004+j)+.3*Math.sin(u*.011+j*2)+.15*Math.sin(u*.031)));}ctx.lineTo(W+26,480);ctx.closePath();ctx.fill();});}
  function drawClock(){const x=W*.5+300-cam*.08,y=232;if(x<-260||x>W+260)return;circle(x,y,152,'#160e0b');circle(x,y,136,'#2a1c16');circle(x,y,128,'#35261d');ctx.strokeStyle='#7a5a36';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,128,0,TAU);ctx.stroke();
    for(let i=0;i<12;i++){const a=i*TAU/12;line([x+Math.cos(a)*110,y+Math.sin(a)*110,x+Math.cos(a)*122,y+Math.sin(a)*122],i%3?3:6,'#9a7a4a');}
    const h=time*.01-1.2,m=time*.12-1.5;line([x,y,x+Math.cos(h)*68,y+Math.sin(h)*68],6,'#120a08');line([x,y,x+Math.cos(m)*102,y+Math.sin(m)*102],3.5,'#120a08');circle(x,y,8,'#9a7a4a');addLight(x,y,210,'#ff9a50',.1);}
  function drawTunnels(){const off=cam*.12,r0=Math.floor((off-320)/520),r1=Math.floor((off+W)/520);ctx.fillStyle=T.far;ctx.fillRect(-10,viewY-20,W+20,500-viewY);
    for(let i=r0;i<=r1;i++){const x=i*520-off+60;ctx.fillStyle='#040a07';ctx.beginPath();ctx.moveTo(x,480);ctx.lineTo(x,300);ctx.arc(x+150,300,150,Math.PI,0);ctx.lineTo(x+300,480);ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(150,230,120,.06)';ctx.beginPath();ctx.moveTo(x+70,480);ctx.lineTo(x+70,340);ctx.arc(x+150,340,80,Math.PI,0);ctx.lineTo(x+230,480);ctx.closePath();ctx.fill();
      ctx.strokeStyle=T.farEdge;ctx.lineWidth=7;ctx.beginPath();ctx.arc(x+150,300,150,Math.PI,0);ctx.stroke();for(let k=0;k<=6;k++){const a=Math.PI+k*Math.PI/6;box(x+150+Math.cos(a)*150-5,300+Math.sin(a)*150-5,10,10,T.farEdge);}}}
  function drawBellTower(z){if(!T.bell)return;const x=W*.72+420-cam*.12;if(x<-160||x>W+160)return;ctx.fillStyle=T.towerC;
    ctx.beginPath();ctx.moveTo(x-58,480);ctx.lineTo(x-46,172);ctx.lineTo(x-56,172);ctx.lineTo(x-56,160);ctx.lineTo(x,62);ctx.lineTo(x+56,160);ctx.lineTo(x+56,172);ctx.lineTo(x+46,172);ctx.lineTo(x+58,480);ctx.closePath();ctx.fill();
    ctx.fillStyle=T.towerIn;ctx.beginPath();ctx.moveTo(x-27,268);ctx.lineTo(x-27,214);ctx.quadraticCurveTo(x,180,x+27,214);ctx.lineTo(x+27,268);ctx.closePath();ctx.fill();
    const sw=Math.sin(time*.7)*.07;ctx.save();ctx.translate(x,208);ctx.rotate(sw);poly([-4,0,4,0,9,9,15,42,-15,42,-9,9],'#5a3e24');box(-16,40,32,4,'#7c5832');ctx.restore();
    ctx.fillStyle='rgba(224,161,98,.25)';for(let i=0;i<4;i++)ctx.fillRect(x-24+i*15,312+(i*29)%52,3,6);
    addLight(x+sw*40,244,100,'#ff9a50',.1+z*.28);}
  function drawFar(){const off=cam*.12,r0=Math.floor((off-160)/1600),r1=Math.floor((off+W)/1600);
    if(T.farKind==='tunnel')drawTunnels();else{if(T.farKind==='ridge')drawRidges();if(T.farKind==='clock')drawClock();
    for(let rep=r0;rep<=r1;rep++){const base=rep*1600-off;for(const b of decor.far){const x=base+b.x;if(x>W||x+b.w<0)continue;const top=440-b.h;ctx.fillStyle=T.far;
      ctx.beginPath();ctx.moveTo(x,480);ctx.lineTo(x,top);
      if(b.roof==='spire'){ctx.lineTo(x+b.w*.18,top);ctx.lineTo(x+b.w*.5,top-b.w*.95);ctx.lineTo(x+b.w*.82,top);}
      else if(b.roof==='dome')ctx.quadraticCurveTo(x+b.w*.5,top-b.w*.8,x+b.w,top);
      ctx.lineTo(x+b.w,top);ctx.lineTo(x+b.w,480);ctx.closePath();ctx.fill();
      if(b.roof==='flat')for(let k=0;k<4;k++)ctx.fillRect(x+k*b.w/4+2,top-7,b.w/8,8);
      ctx.fillStyle=T.farEdge;ctx.fillRect(x+b.w-3,top,3,480-top);
      for(let k=0;k<b.win;k++){ctx.fillStyle=T.winA[(k+rep+b.win)%3?0:1];ctx.fillRect(x+b.w*(.25+.5*((k*.61+b.x*.013)%1)),top+20+k*30,3.5,6);}}}}
    ctx.fillStyle=vgrad('farmist'+L.theme,280,480,[[0,'rgba('+T.mist+',0)'],[1,'rgba('+T.mist+',.92)']]);ctx.fillRect(-10,280,W+20,200);}
  function chain(x,y,len,c){ctx.strokeStyle=c||'#3a434b';ctx.lineWidth=1.6;for(let k=0,i=0;k<len;k+=7,i++){ctx.beginPath();if(i%2)ctx.ellipse(x,y+k+3.5,2.1,3.6,0,0,TAU);else{ctx.moveTo(x,y+k);ctx.lineTo(x,y+k+7);}ctx.stroke();}}
  function drawMid(){if(T.mid==='battle'){drawBattlements();return;}if(T.mid==='gears'){drawGears();return;}const off=cam*.3,r0=Math.floor((off-300)/1300),r1=Math.floor((off+W)/1300),C=T.archC;
    for(let rep=r0;rep<=r1;rep++){const base=rep*1300-off;for(const a of decor.arches){const x=base+a.x;if(x>W+10||x+260<-10)continue;
      ctx.fillStyle=T.arch;ctx.beginPath();ctx.rect(x,104,260,400);ctx.moveTo(x+70,345);ctx.lineTo(x+70,232);ctx.arc(x+130,232,60,Math.PI,0,false);ctx.lineTo(x+190,345);ctx.closePath();ctx.fill('evenodd');
      box(x+8,104,18,400,C[0]);box(x+234,104,18,400,C[0]);box(x+4,104,26,10,C[1]);box(x+230,104,26,10,C[1]);box(x+64,345,132,8,C[2]);
      ctx.fillStyle=C[3];for(let bx=x+82;bx<x+186;bx+=17){const dx=bx+1.5-(x+130),top=232-Math.sqrt(Math.max(0,3600-dx*dx));ctx.fillRect(bx,top,3,345-top);}ctx.fillRect(x+70,282,120,3);
      if(a.chain)chain(x+48,104,120,C[2]);
      if(T.skulls)for(let k=0;k<6;k++){const sx=x+75+k*22;circle(sx,340,5,'#4f4656');circle(sx-1.7,339.4,1.2,'#110d15');circle(sx+1.7,339.4,1.2,'#110d15');}
      if(T.mid==='pipes'){box(x-10,150,280,18,C[1]);box(x-10,150,280,4,C[0]);for(let k=0;k<3;k++)box(x+22+k*100,145,12,28,C[2]);box(x+214,168,16,180,C[1]);}
      shafts.push({x:x+76,y:205,warm:a.warm});}}}
  // 落日城墙的中景：远处的城垛、塔楼和旗子
  function drawBattlements(){const off=cam*.3,C=T.archC,top=250;ctx.fillStyle=T.arch;ctx.fillRect(-10,top,W+20,260);for(let x=-(off%40)-40;x<W+40;x+=40)ctx.fillRect(x,top-16,22,17);
    const r0=Math.floor((off-200)/700),r1=Math.floor((off+W)/700);
    for(let i=r0;i<=r1;i++){const x=i*700-off+250;ctx.fillStyle=T.arch;ctx.fillRect(x,top-150,90,160);for(let k=0;k<4;k++)ctx.fillRect(x-6+k*28,top-170,18,22);box(x+38,top-118,14,30,C[3]);box(x+41,top-112,8,18,'rgba(255,190,120,.55)');
      const sw=Math.sin(time*3+i)*4;line([x+45,top-170,x+45,top-218],2,C[3]);poly([x+45,top-218,x+76+sw,top-209,x+45,top-200],'#7b2f3a');}
    box(-10,top+2,W+20,3,C[1]);}
  // 钟楼的中景：慢慢转动的大齿轮
  function gear(x,y,r,teeth,a,c){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=c;ctx.beginPath();for(let i=0;i<teeth*2;i++){const rr=i%2?r:r*1.14,t0=i*Math.PI/teeth,t1=t0+Math.PI/teeth;ctx.lineTo(Math.cos(t0)*rr,Math.sin(t0)*rr);ctx.lineTo(Math.cos(t1)*rr,Math.sin(t1)*rr);}ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.arc(0,0,r*.58,0,TAU);ctx.fill();ctx.fillStyle=c;for(let i=0;i<4;i++){ctx.rotate(Math.PI/2);ctx.fillRect(-r*.08,0,r*.16,r*.62);}ctx.beginPath();ctx.arc(0,0,r*.2,0,TAU);ctx.fill();ctx.restore();}
  function drawGears(){const off=cam*.3,C=T.archC,r0=Math.floor((off-300)/900),r1=Math.floor((off+W)/900);
    for(let i=r0;i<=r1;i++){const x=i*900-off;box(x+194,0,12,200,C[3]);box(x+634,0,12,150,C[3]);gear(x+200,200,110,14,time*.15,T.arch);gear(x+372,302,64,10,-time*.26,C[0]);gear(x+640,150,80,12,time*.2,T.arch);
      shafts.push({x:x+420,y:205,warm:true});}}
  function drawShafts(){if(lowFx||!shafts.length||!T.shaft)return;const cool=vgrad('shaftC'+L.theme,0,300,[[0,'rgba('+T.shaft[0]+',.9)'],[1,'rgba('+T.shaft[0]+',0)']]),warm=vgrad('shaftW'+L.theme,0,300,[[0,'rgba('+T.shaft[1]+',.9)'],[1,'rgba('+T.shaft[1]+',0)']]);
    ctx.save();ctx.globalCompositeOperation='lighter';for(const s of shafts){ctx.save();ctx.translate(s.x,s.y);ctx.globalAlpha=s.warm?.09:.13;ctx.fillStyle=s.warm?warm:cool;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(108,0);ctx.lineTo(250,300);ctx.lineTo(142,300);ctx.closePath();ctx.fill();ctx.restore();}ctx.restore();}
  // ---- 近景砖墙和墙上的东西 ----
  const FIRE=['#e2612c','#ffb347','#fff1c2'];
  function flame(x,y,s,seed){const t=time*10+seed*31,a=Math.sin(t)*1.6*s,b=Math.cos(t*1.3)*1.2*s,F=T.flame||FIRE;
    poly([x-5*s,y,x+5*s,y,x+3*s+b,y-9*s,x+a,y-17*s,x-3*s+b,y-9*s],F[0]);
    poly([x-3.2*s,y,x+3.2*s,y,x+2*s+a*.5,y-6*s,x+b*.6,y-12*s,x-2*s,y-6*s],F[1]);
    poly([x-1.5*s,y,x+1.5*s,y,x+a*.3,y-6*s],F[2]);}
  // 各层特有的墙饰：下水道的排污管和苔藓、城墙的箭窗和旗杆、墓窟的骷髅龛和烛台、钟楼的墙上齿轮
  function pipe(x,y,s){const r=14+s*8;circle(x,y,r+5,T.stone[1],OL,2);circle(x,y,r,'#07100b');box(x-r-7,y-4,7,8,T.stone[2]);box(x+r,y-4,7,8,T.stone[2]);
    if(s>.35){const len=FLOOR+40-y-r*.4;ctx.fillStyle='rgba(120,200,80,.5)';ctx.fillRect(x-4,y+r*.4,8,len);ctx.fillStyle='rgba(200,255,150,.65)';for(let k=0;k<4;k++)ctx.fillRect(x-2,y+r*.4+(time*90+k*len/4)%len,4,9);addLight(x,y+24,80,'#9be36a',.2);}}
  function moss(x,s){ctx.strokeStyle=T.moss[0];ctx.lineWidth=2;for(let i=0;i<5;i++){const len=30+(i*17+s*40)%50,sw=Math.sin(time*1.2+i+s*5)*3;ctx.beginPath();ctx.moveTo(x+i*7,56);ctx.quadraticCurveTo(x+i*7+sw*.5,56+len*.6,x+i*7+sw,56+len);ctx.stroke();circle(x+i*7+sw,56+len,1.8,T.moss[1]);}}
  function slit(x,y){const g=vgrad('slit'+y,y,y+50,[[0,'#6a3a52'],[1,'#e8a06c']]);box(x-9,y-5,18,60,T.wall[3]);ctx.fillStyle=g;ctx.fillRect(x-4,y,8,50);box(x-14,y+19,28,8,T.wall[3]);ctx.fillStyle=g;ctx.fillRect(x-10,y+21,20,4);addLight(x,y+25,42,'#ffb070',.22);}
  function flag(x,y,s){line([x,y,x,y-96],2.4,'#2a2030');const sw=Math.sin(time*3+s*9);ctx.fillStyle=s<.5?'#8a2f3a':'#2f4f7b';ctx.beginPath();ctx.moveTo(x,y-96);ctx.quadraticCurveTo(x+22,y-100+sw*4,x+46,y-90+sw*6);ctx.quadraticCurveTo(x+24,y-82+sw*3,x,y-74);ctx.closePath();ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.stroke();}
  function candleStick(x,y,h){box(x-1.6,y-h,3.2,h,'#e6dcc4');flame(x,y-h,.42,x);}
  function niche(x,y){ctx.fillStyle=T.wall[3];ctx.beginPath();ctx.moveTo(x-22,y+60);ctx.lineTo(x-22,y+18);ctx.arc(x,y+18,22,Math.PI,0);ctx.lineTo(x+22,y+60);ctx.closePath();ctx.fill();
    for(let r=0;r<3;r++)for(let c=0;c<3-r%2;c++){const sx=x-12+c*12+(r%2)*6,sy=y+52-r*11;circle(sx,sy,5,'#cfc5ad',OL,1);circle(sx-1.7,sy-.6,1.2,'#1a1414');circle(sx+1.8,sy-.6,1.2,'#1a1414');}
    box(x-25,y+60,50,5,T.stone[2]);candleStick(x+17,y+60,9);addLight(x+17,y+44,52,'#ffcf86',.32);}
  function candles(x,y){box(x-15,y,30,4,T.stone[2]);candleStick(x-9,y,12);candleStick(x,y,18);candleStick(x+9,y,9);addLight(x,y-20,72,'#ffcf86',.42);}
  function wallGear(x,y,s){gear(x,y,24+s*14,10,time*(s<.5?.6:-.5),T.stone[1]);circle(x,y,4,T.ledge[0],OL,1.2);}
  function cage(x,y,s){box(x-17,y,34,5,'#3b434b');ctx.strokeStyle='#454e57';ctx.lineWidth=1.6;for(let b=-14;b<=14;b+=7){ctx.beginPath();ctx.moveTo(x+b,y+5);ctx.lineTo(x+b,y+46);ctx.stroke();}box(x-18,y+45,36,5,'#3b434b');
    if(s>.4){circle(x+4,y+30,4,'#b9b09a');box(x+1,y+34,7,9,'#a1987f');line([x+1,y+42,x-5,y+45],1.5,'#a1987f');circle(x+5.4,y+29.4,1,'#1a1414');}}
  function banner(x,y,s){const B=T.banner||['#245459','#5b2427'],c=s<.5?B[0]:B[1],sw=Math.sin(time*1.4+s*10)*2.5,h=120+s*50;box(x-22,y-3,44,4,'#6b5a3a');
    ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(x-18,y);ctx.lineTo(x+18,y);ctx.lineTo(x+18+sw,y+h);ctx.lineTo(x+8+sw,y+h-12);ctx.lineTo(x+sw*.5,y+h+2);ctx.lineTo(x-8+sw,y+h-14);ctx.lineTo(x-18+sw,y+h);ctx.closePath();ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=1.5;ctx.stroke();
    const e=sw*.3;poly([x-6+e,y+52,x+6+e,y+52,x+4+e,y+38,x+e,y+33,x-4+e,y+38],'#c9a35a');box(x-7+e,y+51,14,2,'#e0bd73');}
  function door(x,y){box(x-27,y-6,54,128,'#283540');box(x-21,y,42,122,'#0a1117');ctx.fillStyle='#434d57';for(let b=-17;b<=17;b+=8.5)ctx.fillRect(x+b-1.2,y,2.4,122);ctx.fillRect(x-21,y+40,42,3);ctx.fillRect(x-21,y+86,42,3);}
  function crack(x,y){ctx.strokeStyle='#0b1218';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8,y+14);ctx.lineTo(x+2,y+27);ctx.lineTo(x+12,y+44);ctx.stroke();circle(x+3,y+47,4,'#284c35');circle(x+9,y+49,3,'#386542');}
  function drawNear(){const off=cam*.55,pat=wallPat(),wy=T.wallTop||56,top=vgrad('nearTop'+wy,wy,wy+184,[[0,'rgba(5,9,13,.45)'],[1,'rgba(5,9,13,0)']]),bot=vgrad('nearBot',360,FLOOR+40,[[0,'rgba(5,9,13,0)'],[1,'rgba(5,9,13,.44)']]);
    for(const s of decor.walls){const x=s.x-off;if(x>W+20||x+s.w<-20)continue;patRect(pat,x,wy,s.w,FLOOR+40-wy,-off);
      if(T.outdoor){for(let k=0;k<s.w-12;k+=40)patRect(pat,x+k,wy-18,22,18,-off);box(x,wy,s.w,3,T.top[1]);}
      else{ctx.fillStyle=T.wall[3];for(let k=0;k<s.w;k+=16){const hh=((k*7+Math.floor(s.x))%5)*3+2;ctx.fillRect(x+k,wy-hh,15,hh);}}
      ctx.fillStyle=top;ctx.fillRect(x,wy,s.w,184);ctx.fillStyle=bot;ctx.fillRect(x,360,s.w,FLOOR+40-360);box(x,wy-6,6,FLOOR+46-wy,'rgba(6,10,14,.55)');box(x+s.w-6,wy-6,6,FLOOR+46-wy,'rgba(6,10,14,.55)');}
    for(const o of decor.props){const x=o.x-off;if(x<-90||x>W+90)continue;const s=o.s;
      if(o.k==='torch'){const y=Math.max(246,wy+40);box(x-2,y,4,24,'#3b2a20');poly([x-7,y+3,x+7,y+3,x+5,y+9,x-5,y+9],'#565c63',OL,1);flame(x,y+2,1,s);addLight(x,y-8,125,T.light,.5+Math.sin(time*9+s*20)*.06);}
      else if(o.k==='cage'){const len=100+s*80;ctx.save();ctx.translate(x,56);ctx.rotate(Math.sin(time*.9+s*9)*.06);chain(0,0,len,'#353e46');cage(0,len,s);ctx.restore();}
      else if(o.k==='banner')banner(x,Math.max(96,wy+12),s);
      else if(o.k==='door')door(x,FLOOR+40-122);
      else if(o.k==='pipe')pipe(x,300+s*70,s);
      else if(o.k==='moss')moss(x,s);
      else if(o.k==='slit')slit(x,wy+34);
      else if(o.k==='flag')flag(x,wy-18,s);
      else if(o.k==='niche')niche(x,250+s*90);
      else if(o.k==='candle')candles(x,300+s*80);
      else if(o.k==='gear')wallGear(x,250+s*110,s);
      else crack(x,Math.max(210,wy+20)+s*(T.outdoor?60:150));}}
  function drawCeiling(){if(T.outdoor)return;const y1=34;patRect(wallPat(),-10,viewY-20,W+20,y1-viewY+20,-cam*.55);box(-10,viewY-20,W+20,y1-viewY+20,'rgba(4,7,10,.72)');box(-10,y1,W+20,4,'#1d2a35');box(-10,y1+4,W+20,3,'#0b1117');}
  // ---- 主场景（跟着镜头走）：石柱、吊灯、地面、平台、机关 ----
  const pillarSprites=new Map();
  function pillar(pl){
    const variant=(pl.broken?2:0)+(pl.moss>.45?1:0);
    const key=L.theme+variant;
    let image=pillarSprites.get(key);
    if(!image){
      image=typeof OffscreenCanvas==='function'?new OffscreenCanvas(64,320):document.createElement('canvas');
      image.width=64;image.height=320;
      const worldContext=ctx;
      try{
        ctx=image.getContext('2d');ctx.translate(8,-164);
        paintPillar({x:0,broken:pl.broken,moss:pl.moss});
      }finally{ctx=worldContext;}
      pillarSprites.set(key,image);
    }
    ctx.drawImage(image,pl.x-8,164);
  }
  function paintPillar(pl){const x=pl.x,top=pl.broken?262:186,w=24,b=FLOOR-18,C=T.pilC,M=T.moss;
    box(x-4,b,w+8,18,C[0]);box(x-4,b,w+8,2,C[1]);box(x,top,w,b-top,T.pil);box(x,top,5,b-top,C[2]);box(x+w-4,top,3,b-top,C[3]);
    for(let y=top+30;y<b-4;y+=34)box(x,y,w,2,C[4]);
    if(pl.broken){ctx.fillStyle=T.pil;ctx.beginPath();ctx.moveTo(x,top+1);ctx.lineTo(x+6,top-10);ctx.lineTo(x+11,top-3);ctx.lineTo(x+17,top-14);ctx.lineTo(x+w,top-4);ctx.lineTo(x+w,top+1);ctx.closePath();ctx.fill();box(x+30,b-7,9,7,C[0]);box(x+42,b-4,6,4,T.pil);}
    else{box(x-5,top-10,w+10,10,C[5]);box(x-5,top-10,w+10,2,C[6]);}
    if(pl.moss>.45){circle(x+3,b-2,5,M[0]);circle(x+9,b-5,4,M[1]);circle(x+16,b-1,4,M[0]);}}
  function lantern(x){const sw=Math.sin(time*1.1+x*.01)*.05,top=Math.min(0,viewY),len=150-top;ctx.save();ctx.translate(x,top);ctx.rotate(sw);chain(0,0,len,'#3c444c');ctx.translate(0,len);
    box(-9,0,18,4,'#4a4f55');box(-7,4,14,20,'#2a2622');flame(0,22,.75,x*.01);ctx.strokeStyle='#4a4f55';ctx.lineWidth=1.5;for(let b=-7;b<=7;b+=7){ctx.beginPath();ctx.moveTo(b,4);ctx.lineTo(b,24);ctx.stroke();}box(-9,24,18,3,'#4a4f55');ctx.restore();
    addLight(x-cam-sw*len,top+len+14,115,T.flame?T.light:'#ffcf86',.48+Math.sin(time*7+x)*.04);}
  function floorProp(d){const x=d.x,y=FLOOR,s=d.s;
    if(d.k==='grass'){ctx.strokeStyle=s<.5?'#4b7a4c':'#5f8f55';ctx.lineWidth=1.4;for(let i=0;i<4;i++){const sw=Math.sin(time*2+x*.07+i)*1.5,h=5+(i*7+s*10)%6;ctx.beginPath();ctx.moveTo(x+i*2.5,y);ctx.quadraticCurveTo(x+i*2.5+sw*.5,y-h*.6,x+i*2.5+sw,y-h);ctx.stroke();}}
    else if(d.k==='stone'){ctx.fillStyle='#3a4a50';ctx.beginPath();ctx.ellipse(x,y,4+s*4,3+s*2,0,Math.PI,0);ctx.fill();box(x-2,y-2-s*2,3,1.5,'#56676d');}
    else if(d.k==='bone'){line([x-6,y-1.5,x+6,y-2.5],1.6,'#cfc5ad');circle(x-6,y-1.5,1.5,'#cfc5ad');circle(x+6,y-2.5,1.5,'#cfc5ad');}
    else if(d.k==='skull'){circle(x,y-4,4,'#d6ccb3',OL,1);box(x-2.5,y-1.5,5,2,'#d6ccb3');circle(x+1.4,y-4.4,1.1,'#1a1414');circle(x-1.2,y-4.4,1,'#1a1414');}
    else if(d.k==='puddle'){ctx.fillStyle='rgba(110,190,70,.55)';ctx.beginPath();ctx.ellipse(x,y+1,9+s*8,2.6,0,0,TAU);ctx.fill();box(x-3+s*4,y,3,1,'rgba(220,255,180,.7)');}
    else if(d.k==='candle'){candleStick(x,y,6+s*8);addLight(x-cam,y-12,34,'#ffcf86',.3);}
    else poly([x-6,y,x+6,y,x+7,y-7,x+3,y-11,x+1,y-8,x-4,y-10,x-7,y-6],'#7a4f35',OL,1);}
  // 地面按段画：城墙的断崖处露出下面的深渊
  // Recognisable large landmarks sit behind the traversable geometry in each biome.
  function drawWorldLandmark(){if(L.rest||L.arena)return;const x=1850,k=L.theme;if(x<cam-340||x>cam+W+340)return;ctx.save();
    if(k==='prison'){box(x-125,130,250,320,'#111b24');ctx.strokeStyle='#53636c';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(x-102,450);ctx.lineTo(x-102,245);ctx.arc(x,245,102,Math.PI,0);ctx.lineTo(x+102,450);ctx.stroke();for(let i=-2;i<=2;i++)box(x+i*36-3,210,6,240,'#394d57');chain(x-40,20,150,'#5b666a');poly([x-58,180,x+45,166,x+58,184,x-45,198],'#5a4b42',OL,2);addLight(x-cam,285,170,'#85bcb3',.12);}
    else if(k==='sewers'){box(x-180,145,360,300,'#112a20');for(let i=-1;i<=1;i++){const bx=x+i*105;box(bx-28,100,56,125,'#425e48');circle(bx,220,32,'#273e30','#72946a',6);ctx.fillStyle='rgba(125,213,108,.23)';ctx.fillRect(bx-18,225,36,220);for(let j=0;j<4;j++)circle(bx+Math.sin(time*2+j)*12,250+((time*38+j*48)%180),2,'rgba(205,255,168,.65)');}addLight(x-cam,350,180,'#82d466',.16);}
    else if(k==='ramparts'){poly([x-200,480,x-200,285,x-150,285,x-150,235,x-115,235,x-115,285,x-55,285,x-55,480],'#3e3041');poly([x+60,480,x+60,250,x+95,250,x+95,220,x+130,220,x+130,250,x+190,250,x+190,480],'#433042');line([x+115,180,x+115,290],4,'#bd9c87');poly([x+115,184,x+165+Math.sin(time*2)*7,192,x+152,207,x+175,220,x+115,212],'#a64550','#5e303c',2);}
    else if(k==='ossuary'){for(let i=-3;i<=3;i++){const xx=x+i*42;poly([xx-18,480,xx-12,280,xx,240,xx+12,280,xx+18,480],'#30293b','#706277',2);circle(xx,306,8,'#b6aa9a','#392b3c',2);}for(let i=0;i<4;i++){const span=150-i*28;ctx.strokeStyle='rgba(210,192,175,.32)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-span,350+i*15);ctx.quadraticCurveTo(x,170+i*20,x+span,350+i*15);ctx.stroke();}addLight(x-cam,320,170,'#bd9df0',.13);}
    else if(k==='tower'){ctx.translate(x,285);circle(0,0,160,'#211814','#80613e',10);circle(0,0,125,'#39281e','#bd8a4b',5);ctx.rotate(time*.12);for(let i=0;i<10;i++){ctx.rotate(TAU/10);line([0,0,112,0],5,'#a77c47');box(140,-12,30,24,'#70502f');}circle(0,0,18,'#d2a35c','#36291e',4);addLight(x-cam,285,190,'#eea04f',.15);}
    ctx.restore();}
  // 首领房的背景：每位首领一座自己的场地
  function bellShape(x,y,s,fill,stroke,lw){shape(()=>{ctx.moveTo(x,y-10*s);ctx.bezierCurveTo(x-7*s,y-10*s,x-8*s,y,x-9*s,y+6*s);ctx.lineTo(x+9*s,y+6*s);ctx.bezierCurveTo(x+8*s,y,x+7*s,y-10*s,x,y-10*s);},fill,stroke,lw);}
  function drawBossArena(){const k=L.bossKind,cx=1125;if(cx<cam-480||cx>cam+W+480)return;ctx.save();
    if(k==='lock'){   // 锁门兽庭：一扇被锁链交叉封死的巨大铁门，门上挂着更大的一把锁；高窗透进冷光
      box(cx-262,92,524,388,'#121a22');for(const s of [-1,1]){const x0=cx+(s<0?-232:6);shape(()=>ctx.rect(x0,124,226,356),lg(x0,124,x0+226,480,'#2c3a46','#1b2530'),'#0a0e14',3);for(let j=0;j<4;j++)box(x0,168+j*84,226,6,'#3b4a56');for(let i=0;i<4;i++)for(let j=0;j<7;j++)circle(x0+28+i*57,146+j*48,3,'#5d6c78','#0a0e14',1);}
      ctx.strokeStyle='#4a5a66';ctx.lineWidth=22;ctx.beginPath();ctx.moveTo(cx-246,480);ctx.lineTo(cx-246,186);ctx.quadraticCurveTo(cx,30,cx+246,186);ctx.lineTo(cx+246,480);ctx.stroke();ctx.strokeStyle='#2c3a44';ctx.lineWidth=6;ctx.stroke();
      for(const s of [-1,1])for(let i=0;i<=46;i++){const u=i/46;link(cx-s*222+s*444*u,150+u*240+Math.sin(u*Math.PI)*34,(i%2?.48:2.05)*s,'#6a7680',5.6);}
      ctx.save();ctx.translate(cx,156);padlock(LOCK,false,.48);ctx.restore();
      for(const s of [-1,1]){const wx=cx+s*352;box(wx-18,118,36,76,'#0a1016');ctx.fillStyle='rgba(150,200,230,.32)';ctx.fillRect(wx-13,123,26,66);for(let i=-1;i<=1;i++)box(wx+i*9-1,123,2,66,'#2c3a44');addLight(wx-cam,160,100,'#9ac8e0',.25);}
      addLight(cx-cam,270,250,'#8fb0c0',.1);}
    else if(k==='brood'){   // 溺灯蓄水池：圆形池壁、三根往下淌绿水的出水管、远处漂着熄灭的灯
      circle(cx,300,334,'#0c2018');circle(cx,300,302,'#11301f');ctx.strokeStyle='#2c4a36';ctx.lineWidth=10;ctx.beginPath();ctx.arc(cx,300,302,Math.PI,0);ctx.stroke();for(let i=0;i<11;i++){const a=Math.PI+i*Math.PI/10;box(cx+Math.cos(a)*302-7,300+Math.sin(a)*302-7,14,14,'#2c4a36');}
      [-200,0,200].forEach((o,i)=>{const x=cx+o;circle(x,170,30,'#1c3628','#4f7a58',6);circle(x,170,20,'#071009');ctx.fillStyle='rgba(120,210,90,.3)';ctx.fillRect(x-12,176,24,304);ctx.fillStyle='rgba(210,255,170,.5)';for(let j=0;j<5;j++){const yy=180+((time*90+j*60+i*30)%290);ctx.fillRect(x-6+Math.sin(j)*4,yy,3,14);}addLight(x-cam,300,80,'#82d466',.15);});
      ctx.fillStyle='rgba(40,90,50,.5)';ctx.fillRect(cx-332,436,664,44);for(let i=0;i<7;i++){const x=cx-280+i*92+Math.sin(time*.6+i)*6,y=440+Math.sin(time*1.4+i)*2;ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(time+i)*.15);shape(()=>ctx.rect(-6,-14,12,14),i%3===0?'#4a6a40':'#2f3f2c',OL,1.4);shape(()=>{ctx.moveTo(-8,-14);ctx.lineTo(8,-14);ctx.lineTo(3,-19);ctx.lineTo(-3,-19);ctx.closePath();},'#6a5a3a',OL,1.2);ctx.restore();}
      for(let i=0;i<9;i++){const x=cx-320+i*80,len=60+(i*37)%70;ctx.strokeStyle='#2f5a2a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,36);ctx.quadraticCurveTo(x+Math.sin(time+i)*8,36+len*.6,x+Math.sin(time*1.3+i)*12,36+len);ctx.stroke();}
      addLight(cx-cam,330,280,'#8fd76a',.14);}
    else if(k==='standard'){   // 无名者祭场：骨墙、梁上垂下的残旗、绘着沉钟的彩窗、断剑祭坛；二阶段墙边浮现昔日城卫的影子
      box(cx-332,78,664,402,'#191322');for(let r=0;r<4;r++)for(let i=0;i<12;i++){const x=cx-300+i*54+(r%2)*27,y=300+r*40;circle(x,y,7,'#4a4054','#120d18',1.4);circle(x-2.4,y-1,1.6,'#0c0810');circle(x+2.4,y-1,1.6,'#0c0810');}
      ctx.save();ctx.translate(cx,190);shape(()=>{ctx.moveTo(-72,92);ctx.lineTo(-72,-20);ctx.quadraticCurveTo(0,-114,72,-20);ctx.lineTo(72,92);ctx.closePath();},lg(0,-92,0,92,'#6a4a9a','#3a2a5a','#20162e'),'#0c0810',5);ctx.globalAlpha=.85;bellShape(0,10,2.2,'#e8c87a','#0c0810',2);ctx.globalAlpha=1;for(let i=-1;i<=1;i++)line([i*36,-62,i*36,92],3,'#0c0810');line([-72,24,72,24],3,'#0c0810');ctx.restore();addLight(cx-cam,190,170,'#b48aff',.2);
      box(cx-342,66,684,12,'#2a2034');for(let i=0;i<6;i++){const x=cx-290+i*116,sw=Math.sin(time*1.1+i)*5,h=150+(i%2)*40;shape(()=>{ctx.moveTo(x-22,78);ctx.lineTo(x+22,78);ctx.lineTo(x+22+sw,78+h);ctx.lineTo(x+10+sw,78+h-14);ctx.lineTo(x+sw*.5,78+h+4);ctx.lineTo(x-10+sw,78+h-18);ctx.lineTo(x-22+sw,78+h);ctx.closePath();},i%2?'#4c1a30':'#3b2a4f','#0c0810',2);bellShape(x+sw*.3,128,1,null,'#a88a50',1.6);}
      shape(()=>ctx.rect(cx-72,420,144,60),lg(0,420,0,480,'#4a4058','#2a2234'),'#0c0810',2);candleStick(cx-56,420,14);candleStick(cx+56,420,18);candleStick(cx-40,420,10);line([cx+2,420,cx+8,356],4,'#9aa4aa','#0c0810');line([cx-8,392,cx+14,396],3,'#a88a50','#0c0810');
      const b=enemies.find(e=>e.type==='boss');if(b&&b.rage&&!b.dead){ctx.globalAlpha=.16+.06*Math.sin(time*2);for(let i=0;i<8;i++){const x=cx-320+i*92,y=FLOOR;ctx.fillStyle='#c9a8ff';ctx.fillRect(x-7,y-58,14,44);circle(x,y-66,7,'#c9a8ff');line([x+10,y-10,x+10,y-110],2,'#c9a8ff');poly([x+6,y-110,x+14,y-110,x+10,y-124],'#c9a8ff');}ctx.globalAlpha=1;}}
    else{   // 沉钟之心：大表盘、齿轮、一排吊笼里关着魂火（典狱长倒下后笼门打开）
      circle(cx,236,204,'#1c120c');circle(cx,236,184,'#22160f','#6a5030',10);for(let i=0;i<12;i++){const a=i*TAU/12;line([cx+Math.cos(a)*152,236+Math.sin(a)*152,cx+Math.cos(a)*170,236+Math.sin(a)*170],5,'#8a6c44');}
      line([cx,236,cx+Math.cos(time*.05-1.2)*100,236+Math.sin(time*.05-1.2)*100],6,'#7a5e3a');line([cx,236,cx+Math.cos(time*.6-1.5)*140,236+Math.sin(time*.6-1.5)*140],3.5,'#7a5e3a');circle(cx,236,10,'#7a5e3a');
      gear(cx-300,150,90,14,time*.2,'#2a1d14');gear(cx+312,320,70,12,-time*.26,'#2a1d14');gear(cx+262,108,50,10,time*.3,'#3a271a');
      const freed=enemies.some(e=>e.type==='boss'&&e.dead);for(let i=0;i<5;i++){const x=cx-264+i*132,len=60+(i%2)*40,sw=Math.sin(time*.8+i)*.05;ctx.save();ctx.translate(x,20);ctx.rotate(sw);chain(0,0,len,'#5a4a3a');ctx.translate(0,len);shape(()=>ctx.rect(-14,0,28,34),'rgba(20,40,40,.7)','#0a0706',2);
        if(!freed){fl(-4,27,.45,['#2fa39b','#8be1ce','#effff9']);fl(5,29,.38,['#2fa39b','#8be1ce','#effff9']);}for(let j=-1;j<=1;j++)line([j*8,0,j*8,34],2,'#8a6a3e');shape(()=>{ctx.moveTo(-17,0);ctx.lineTo(17,0);ctx.lineTo(8,-8);ctx.lineTo(-8,-8);ctx.closePath();},'#8a6a3e','#0a0706',1.6);if(freed)shape(()=>ctx.rect(8,6,12,26),'#8a6a3e','#0a0706',1.2);ctx.restore();if(!freed)addLight(x-cam,20+len+22,40,'#8be1ce',.35);}}
    ctx.restore();}
  // 铁闸：首领战开始时从门楣落下，打倒首领后升起（左边是来路，右边通往下一段）
  function portcullis(x,k){const top=226,y1=top+(FLOOR-top)*k,C=T.pilC;box(x-36,top-28,72,28,C[0]);box(x-36,top-28,72,5,C[1]);box(x-40,top-32,80,6,C[5]);box(x-36,top,9,FLOOR-top,C[2]);box(x+27,top,9,FLOOR-top,C[2]);
    if(y1>top+3){ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(x-27,top,54,y1-top);for(let j=top+20;j<y1-4;j+=34)box(x-27,j,54,3,'#3a434c');for(let i=0;i<5;i++){const bx=x-22+i*11;box(bx-1.6,top,3.2,y1-top,'#3a434c');poly([bx-3,y1,bx+3,y1,bx,y1+8],'#5a646c',OL,1);}}
    else for(let i=0;i<5;i++){const bx=x-22+i*11;poly([bx-3,top,bx+3,top,bx,top+8],'#5a646c',OL,1);}}
  function drawFloor(){const v0=cam-20,v1=cam+W+20,fade=vgrad('floorFade',FLOOR+8,FLOOR+160,[[0,'rgba(10,16,21,0)'],[1,'rgba(10,16,21,.95)']]);
    for(const a of platforms){if(a.h<100||a.solid)continue;const x0=Math.max(a.x,v0),x1=Math.min(a.x+a.w,v1);if(x1<=x0)continue;const top=a.y;
      if(a.trench){ctx.fillStyle='rgba(6,8,12,.9)';ctx.fillRect(x0,FLOOR,x1-x0,top-FLOOR+16);box(a.x,FLOOR,4,top-FLOOR,T.top[1]);box(a.x+a.w-4,FLOOR,4,top-FLOOR,T.top[1]);}
      patRect(floorPat(),x0,top+8,x1-x0,152,0);box(x0,top,x1-x0,4,T.top[0]);box(x0,top+4,x1-x0,4,T.top[1]);ctx.fillStyle=fade;ctx.fillRect(x0,top+8,x1-x0,152);
      if(viewY+H>FLOOR+158)box(x0,FLOOR+158,x1-x0,viewY+H-FLOOR-156,'#0a1015');
      if(a.x>0){box(a.x,FLOOR,5,150,T.top[1]);poly([a.x,FLOOR+150,a.x+5,FLOOR+150,a.x-4,FLOOR+176],T.top[1]);}if(a.x+a.w<WORLD){box(a.x+a.w-5,FLOOR,5,150,T.top[1]);poly([a.x+a.w,FLOOR+150,a.x+a.w-5,FLOOR+150,a.x+a.w+4,FLOOR+176],T.top[1]);}}
    for(const g of L.gaps)if(g[1]>v0&&g[0]<v1){ctx.fillStyle=vgrad('pit',FLOOR-10,FLOOR+120,[[0,'rgba(8,5,12,.55)'],[.35,'rgba(8,5,12,.93)'],[1,'rgba(8,5,12,.98)']]);ctx.fillRect(g[0],FLOOR-10,g[1]-g[0],viewY+H-FLOOR+30);if(g[2]==='acid')acidLake(g[0],g[1]-g[0]);}
    for(const s of L.acid)if(s[0]+s[1]>v0&&s[0]<v1)acid(s[0],s[1],s.warn);
    for(const d of decor.floor)if(d.x>v0&&d.x<v1)floorProp(d);
    for(const s of L.slopes||[]){if(s[0]+s[1]<v0||s[0]>v1)continue;ctx.beginPath();ctx.moveTo(s[0],FLOOR+6);ctx.lineTo(s[0],s[2]);ctx.lineTo(s[0]+s[1],s[3]);ctx.lineTo(s[0]+s[1],FLOOR+6);ctx.closePath();ctx.fillStyle=T.floor?T.floor[0]:T.top[1];ctx.fill();ctx.strokeStyle=T.top[0];ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(s[0],s[2]);ctx.lineTo(s[0]+s[1],s[3]);ctx.stroke();ctx.strokeStyle=T.top[1];ctx.lineWidth=2;ctx.stroke();}
    for(const b of L.broken||[]){if(b[0]+b[1]<v0||b[0]>v1)continue;for(let x=b[0];x<b[0]+b[1];x+=18){const h=4+(x*7)%9;poly([x,FLOOR,x+10,FLOOR,x+6,FLOOR-h],T.top[0],OL,.8);if((x/18)%3===0)poly([x+4,FLOOR,x+14,FLOOR,x+12,FLOOR+7,x+2,FLOOR+6],'#1a1410');}}}
  function drawTerrain(){for(const a of platforms){if(!a.solid||a.x+a.w<cam-20||a.x>cam+W+20)continue;patRect(floorPat(),a.x,a.y,a.w,FLOOR-a.y,0);box(a.x,a.y,a.w,5,T.top[0]);box(a.x,a.y+5,a.w,4,T.top[1]);box(a.x,a.y,3,FLOOR-a.y,'rgba(8,12,16,.45)');box(a.x+a.w-3,a.y,3,FLOOR-a.y,'rgba(8,12,16,.45)');for(let i=14;i<a.w;i+=31)line([a.x+i,a.y+12,a.x+i-3,a.y+19,a.x+i+2,a.y+24],1,'rgba(6,12,15,.4)');}}
  // 下水道的毒水池：冒泡，发绿光
  function acid(x,w,warn){const y=FLOOR,j=warn?Math.sin(time*40)*2:0;box(x-4+j,y-2,w+8,4,warn?'#6a5a18':T.top[1]);box(x+j,y,w,16,'#163016');ctx.fillStyle=warn?'rgba(230,220,60,.95)':'rgba(120,220,70,.85)';ctx.fillRect(x+j,y+1,w,10);ctx.fillStyle=warn?'rgba(255,236,120,.9)':'rgba(205,255,160,.8)';for(let i=0;i<w-6;i+=14)ctx.fillRect(x+j+i,y+1.5+Math.sin(time*3+i*.4)*1.2,8,1.4);
    for(let i=0;i<4;i++){const t=(time*.8+i*.29)%1,n=Math.floor(time*.8+i*.29),bx=x+4+((i*53+n*37)%Math.max(1,w-8));circle(bx,y+7-t*12,1.4+t*2.2,'rgba(205,255,160,'+(.85-t*.85).toFixed(2)+')');}
    addLight(x+w/2-cam,y,w*.9,'#9be36a',.32);}
  // 每张地图尽头的出口拱门；驿站里那扇通往下一层
  function exitDoor(x){const y=FLOOR,C=T.pilC,glow=L.rest?'#ffcf86':'#8be1ce';box(x-62,y-172,124,172,C[0]);box(x-62,y-172,124,6,C[1]);box(x-62,y-172,8,172,C[2]);
    ctx.fillStyle='#05080b';ctx.beginPath();ctx.moveTo(x-38,y);ctx.lineTo(x-38,y-100);ctx.arc(x,y-100,38,Math.PI,0);ctx.lineTo(x+38,y);ctx.closePath();ctx.fill();ctx.save();ctx.globalAlpha=.22+.1*Math.sin(time*3);ctx.fillStyle=glow;ctx.fill();ctx.restore();
    for(let i=0;i<=6;i++){const a=Math.PI+i*Math.PI/6;box(x+Math.cos(a)*46-5,y-100+Math.sin(a)*46-5,10,10,C[5]);}
    for(let i=0;i<3;i++){const t=(time*.5+i/3)%1;circle(x-20+i*20,y-10-t*120,1.6,'rgba(230,250,255,'+(.6*(1-t)).toFixed(2)+')');}
    if(L.wicks){
      const shut=1-run.doorLift;
      if(shut>0){ctx.save();ctx.beginPath();ctx.rect(x-36,y-100,72,100);ctx.clip();ctx.translate(0,-108*(1-shut));
        for(let dx=-28;dx<=28;dx+=14){box(x+dx-2,y-110,4,104,'#716b60');box(x+dx-2,y-110,1,103,'#b1a28a');}
        box(x-36,y-65,72,5,'#82745f');ctx.restore();}
      L.wicks.forEach((w,i)=>{const dx=(i-(L.wicks.length-1)/2)*13;
        poly([x+dx,y-161,x+dx+4,y-156,x+dx,y-151,x+dx-4,y-156],i<run.litWicks?wickArt[L.theme][1]:'#514c48','#a9916a',1);});
    }
    const label=L.wicks&&run.litWicks<L.wicks.length?'东门待续火 · '+run.litWicks+'/'+L.wicks.length:(L.tutorial?'走出焚炉 · ':'')+'通往 '+STAGES[stage+1].name;
    text(label,x,y-184,14,'#e6dcc4','center',true);addLight(x-cam,y-60,140,glow,.38);}
  // 守钟人：被铁链锁在牢门口的老幽灵，佝偻着，长须垂到胸前，拄着挂小钟的拐杖；身后一口裂开的小钟
  const KEEP={robe:'#5a6670',robeDark:'#3a444c',robeHi:'#7d8a94',face:'#c4d0d6',beard:'#eef3f5',eye:'#8be1ce',staff:'#6a4a2a',bell:'#a7803f',bellHi:'#e6c078'};
  function keeperModel(t,voice=0){const b=Math.sin(t*1.5),K=KEEP;
    ctx.save();ctx.translate(-34,0);ctx.rotate(-.12);shape(()=>{ctx.moveTo(0,-30);ctx.bezierCurveTo(-11,-30,-12,-12,-14,-4);ctx.lineTo(14,-4);ctx.bezierCurveTo(12,-12,11,-30,0,-30);},lg(-14,0,14,0,'#5a4020',K.bell,K.bellHi),OL,1.8);shape(()=>ctx.ellipse(0,-4,14,3,0,0,TAU),K.bellHi,OL,1.4);shape(()=>{ctx.moveTo(-3,-24);ctx.lineTo(1,-16);ctx.lineTo(-2,-8);},null,'#2a1a0a',1.4);ctx.restore();
    circle(-30,-74,4.4,null,'#4a4f55',2.4);for(let i=1;i<=8;i++){const u=i/9;link(-30+24*u,-70+66*u+Math.sin(u*Math.PI)*14,i%2?.4:2,'#4a4f55',2.6);}
    shape(()=>{ctx.moveTo(-17,0);ctx.quadraticCurveTo(-20,-24,-12,-38+b);ctx.quadraticCurveTo(0,-48+b,12,-40+b);ctx.quadraticCurveTo(20,-22,16,0);ctx.quadraticCurveTo(8,-4,4,0);ctx.quadraticCurveTo(-4,-5,-9,0);ctx.quadraticCurveTo(-13,-4,-17,0);ctx.closePath();},lg(-18,0,18,0,K.robeDark,K.robe,K.robeHi),OL,1.8);
    box(-15,-10,30,3,K.robeDark);
    ctx.save();ctx.translate(4,-46+b+voice*.8);ctx.rotate(.06*Math.sin(t*1.7)+voice*.10);shape(()=>{ctx.moveTo(-14,8);ctx.quadraticCurveTo(-16,-12,-2,-15);ctx.quadraticCurveTo(13,-15,14,2);ctx.quadraticCurveTo(10,10,2,10);ctx.closePath();},lg(0,-15,0,10,K.robeHi,K.robe),OL,1.8);
    oval(3,1,8.5,8,K.face);shape(()=>{ctx.moveTo(-3,4);ctx.quadraticCurveTo(3,8,9,4);ctx.quadraticCurveTo(10,16,4,30+Math.sin(t*2)*2+voice*2);ctx.quadraticCurveTo(-1,16,-3,4);},K.beard,OL,1.2);
    const blink=clamp(Math.abs(t%4.2-3.8)*9,.15,1);oval(1,-1,1.6,1.6*blink,K.eye);oval(7,-1,1.6,1.6*blink,K.eye);oval(4,6,1.4,.35+voice,K.face);line([-1,-4.5,3,-4],1,'#eef3f5');line([5,-4,9,-4.5],1,'#eef3f5');ctx.restore();
    line([16,0,20,-66],2.6,K.staff,OL);line([20,-66,27,-64],2,K.staff);ctx.save();ctx.translate(27,-58);ctx.rotate(Math.sin(t*1.7)*.15);shape(()=>{ctx.moveTo(0,-6);ctx.bezierCurveTo(-4,-6,-5,0,-6,4);ctx.lineTo(6,4);ctx.bezierCurveTo(5,0,4,-6,0,-6);},K.bell,OL,1.2);circle(0,6,1.4,K.bellHi);ctx.restore();
    line([6,-31+b,10,-22+b,17,-26+b+voice*2],4,K.robeHi,OL);circle(17,-26+b+voice*2,2.5,K.face,OL,1);}
  function keeper(x){ctx.save();ctx.translate(x,FLOOR);keeperModel(time);ctx.restore();addLight(x-cam+4,FLOOR-46,62,'#8be1ce',.24);
    if(!run.keeper){const y=FLOOR-80+Math.sin(time*3)*2;shape(()=>{ctx.moveTo(x-12,y-9);ctx.quadraticCurveTo(x-12,y-18,x,y-18);ctx.quadraticCurveTo(x+12,y-18,x+12,y-9);ctx.quadraticCurveTo(x+12,y,x+2,y);ctx.lineTo(x-4,y+6);ctx.lineTo(x-4,y);ctx.quadraticCurveTo(x-12,y,x-12,y-9);},'rgba(230,236,240,.92)',OL,1.4);for(let i=-1;i<=1;i++)circle(x+i*5,y-9,1.5,'#3a444c');}}
  // 每层的遗物点：墙上的刻痕、冲上岸的灯罩、旗手遗骸、骨龛、典狱长的手记；没看过时上方有一颗闪烁的星
  function sparkle(x,y,s){poly([x,y-s,x+s*.28,y-s*.28,x+s,y,x+s*.28,y+s*.28,x,y+s,x-s*.28,y+s*.28,x-s,y,x-s*.28,y-s*.28],'#eaf6ff');}
  function loreSpot(s){const x=s.x,y=FLOOR,id=s.id,read=flags.lore;
    if(id==='carving'){box(x-28,y-122,56,74,'rgba(0,0,0,.22)');ctx.strokeStyle='#8a9aa4';ctx.lineWidth=1.3;for(let i=0;i<15;i++){const cx=x-22+(i%5)*9,cy=y-114+Math.floor(i/5)*22;ctx.beginPath();if(i%5===4){ctx.moveTo(cx-38,cy+4);ctx.lineTo(cx+2,cy+14);}else{ctx.moveTo(cx,cy);ctx.lineTo(cx+1,cy+18);}ctx.stroke();}if(!read)line([x+20,y-58,x+28,y-72],2,'#c9d2d6',OL);}
    else if(id==='shade'){ctx.save();ctx.translate(x,y-7);ctx.rotate(-.5);box(-8,-10,16,16,'#34463a');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(-8,-10,16,16);line([-8,-10,8,6],1,'#1a241c');box(-10,-12,20,3,'#5a6a5e');ctx.restore();}
    else if(id==='flag'){line([x+8,y,x+14,y-110],2.4,'#4a3a2a');poly([x+14,y-110,x+50,y-104,x+44,y-92,x+52,y-80,x+14,y-84],'#8a2f3a',OL,1.2);
      circle(x-4,y-31,6,'#d8cfb8',OL,1.2);line([x-4,y-25,x-2,y-8],2.4,'#d8cfb8');line([x-2,y-8,x+11,y-2],2,'#d8cfb8');line([x-3,y-18,x+10,y-26],1.8,'#d8cfb8');circle(x-6,y-32,1.2,'#1a1414');circle(x-2,y-32,1.2,'#1a1414');}
    else if(id==='beads'){box(x-20,y-34,40,34,T.stone[1]);box(x-24,y-38,48,5,T.stone[2]);ctx.fillStyle='#08060c';ctx.beginPath();ctx.arc(x,y-14,10,Math.PI,0);ctx.lineTo(x+10,y-2);ctx.lineTo(x-10,y-2);ctx.closePath();ctx.fill();
      if(!read)for(let i=0;i<7;i++){const a=Math.PI*.15+i*Math.PI*.7/6;circle(x+Math.cos(a)*7,y-13+Math.sin(a)*7,1.8,'#d8cfb8');}candleStick(x-16,y-38,8);candleStick(x+16,y-38,11);addLight(x-cam,y-48,60,'#ffcf86',.35);}
    else{line([x,y,x,y-36],4,'#4a3322',OL);poly([x-18,y-40,x+18,y-40,x+14,y-34,x-14,y-34],'#5a3d27',OL,1.2);if(!read){poly([x-16,y-43,x,y-40,x,y-36,x-15,y-38],'#e6dcc4',OL,1);poly([x+16,y-43,x,y-40,x,y-36,x+15,y-38],'#d8cfb8',OL,1);}}
    if(!read){const g=.5+.5*Math.sin(time*3);addLight(x-cam,y-40,80,'#cfefff',.12+.2*g);ctx.globalAlpha=.4+.6*g;sparkle(x,y-(id==='carving'?134:id==='flag'?124:62)+Math.sin(time*2)*3,4+2*g);ctx.globalAlpha=1;}}
  // 篝火驿站：营火 + 吊锅（商人卖的热汤就在这锅里）
  function campfire(x){const y=FLOOR;box(x-86,y-12,42,12,'#4a3322');box(x+44,y-12,42,12,'#4a3322');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x-86,y-12,42,12);ctx.strokeRect(x+44,y-12,42,12);
    line([x-22,y,x,y-50],2,'#3a3a3a');line([x+22,y,x,y-50],2,'#3a3a3a');line([x,y-50,x,y-36],1,'#222');circle(x,y-29,8,'#2a2a2a',OL,1.2);box(x-8,y-34,16,3,'#3a3a3a');
    line([x-17,y-3,x+15,y-13],5,'#5a3d27',OL);line([x+17,y-3,x-15,y-13],5,'#6a4a2f',OL);for(let i=-3;i<=3;i++)circle(x+i*8,y-3,4.4,'#565c63',OL,1);
    flame(x,y-8,1.9,1);flame(x-8,y-6,1.2,2);flame(x+8,y-6,1.3,3);
    for(let i=0;i<4;i++){const t=(time*.35+i/4)%1;ctx.globalAlpha=.18*(1-t);circle(x+Math.sin(time+i*2)*8,y-50-t*110,5+t*14,'#9a9a9a');}ctx.globalAlpha=1;
    addLight(x-cam,y-30,230,'#ffa040',.62+Math.sin(time*11)*.05);}
  // 烛叟：帽檐上插着一圈小蜡烛的行脚商人，背着堆成小山的货，拐杖上挂着灯；货摊上摆的就是他卖的东西（都画出来）
  const MER={coat:'#3b3346',coatDark:'#28222f',coatHi:'#5a4e66',hat:'#4a3a2a',hatHi:'#6a5440',face:'#120e14',eye:'#ffd27a',beard:'#e8e0d0',pack:'#6a4a2f',packHi:'#8a6a44',cloth:'#7b2f2f',staff:'#5a3d27'};
  function merchantModel(t,homeLight,voice=0){const M=MER,bob=Math.sin(t*2)*.8;
    ctx.save();ctx.translate(-14,-34+bob);line([-28,-40,-30,10],2.4,'#4a3322',OL);shape(()=>ctx.rect(-26,-30,30,44),lg(-26,0,4,0,M.pack,M.packHi),OL,1.8);line([-26,-16,4,-16],1.4,'#4a3322');shape(()=>ctx.ellipse(-12,-34,16,7,0,0,TAU),lg(0,-41,0,-27,'#9a8a6a','#6a5a40'),OL,1.6);
    circle(-31,0,6,'#8a5a3a',OL,1.4);circle(-31,-2,2,'#b07a4a');shape(()=>ctx.rect(-6,-46,9,12),'#2a2622',OL,1.2);fl(-1.5,-36,.4);shape(()=>{ctx.moveTo(-26,6);ctx.lineTo(4,6);ctx.lineTo(4,14);ctx.lineTo(-26,14);ctx.closePath();},M.cloth,OL,1.4);shape(()=>ctx.rect(-24,-26,10,12),'#c8b890',OL,1);ctx.restore();
    shape(()=>{ctx.moveTo(-14,0);ctx.lineTo(-11,-50+bob);ctx.quadraticCurveTo(0,-58+bob,11,-50+bob);ctx.lineTo(15,0);ctx.quadraticCurveTo(8,-3,2,0);ctx.quadraticCurveTo(-6,-3,-14,0);ctx.closePath();},lg(-14,0,15,0,M.coatDark,M.coat,M.coatHi),OL,1.8);
    box(-12,-24+bob,25,4,'#5a3d27');circle(8,-19+bob,3.4,'#8a6a3e',OL,1);line([6,-44+bob,14,-30+bob,19,-37+bob],4,M.coat,OL);circle(19,-37+bob,2.6,'#c8a888',OL,1);
    line([20,0,22,-90],2.6,M.staff,OL);line([22,-90,30,-86],2,M.staff);ctx.save();ctx.translate(30,-84);
    const home=homeLight>=1.35;ctx.rotate(home?lanternSignal(homeLight-1.35)*.45:Math.sin(t*1.3)*.08);line([0,0,0,4],1.2,'#2a2622');
    shape(()=>ctx.rect(-5,4,10,13),'#2a2622',OL,1.2);fl(0,15,.5,home?['#3f9a3a','#9be36a','#eaffc8']:undefined);ctx.restore();
    ctx.save();ctx.translate(2,-62+bob);ctx.rotate(.075*Math.sin(t*1.6)-voice*.11);oval(0,0,9,9,M.face);shape(()=>{ctx.moveTo(-7,3);ctx.quadraticCurveTo(0,8,7,3);ctx.quadraticCurveTo(6,14,0,20+Math.sin(t*2)*1.5);ctx.quadraticCurveTo(-6,14,-7,3);},M.beard,OL,1.2);const blink=clamp(Math.abs(t%3.8-3.3)*9,.15,1);oval(-2.5,-1,1.4,1.4*blink,M.eye);oval(3.5,-1,1.4,1.4*blink,M.eye);oval(1,6,1.7,.4+voice,M.face);
    shape(()=>ctx.ellipse(0,-6,19,4.4,0,0,TAU),lg(0,-10,0,-2,M.hatHi,M.hat),OL,1.6);shape(()=>{ctx.moveTo(-9,-7);ctx.quadraticCurveTo(-9,-19,0,-20);ctx.quadraticCurveTo(9,-19,9,-7);ctx.closePath();},lg(0,-20,0,-7,M.hatHi,M.hat),OL,1.6);
    [-15,-6,7,15].forEach((cx,i)=>{const h=4+(i%2)*2;box(cx-1.2,-8-h,2.4,h,'#efe6d0');fl(cx,-8-h,.22);});ctx.restore();}
  function merchant(x){const y=FLOOR;box(x+14,y-36,104,7,'#6a4a2f');box(x+18,y-29,6,29,'#4a3322');box(x+108,y-29,6,29,'#4a3322');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x+14,y-36,104,7);
    ['soup','flask','bomb','knife','frost',shopRelic||'whetstone','whetstone'].forEach((id,i)=>{if((i===5&&flags.sold)||(i===6&&flags.sharpened))return;drawArt(id,x+24+i*14.5,y-47,22);});
    const sw=Math.sin(time*1.3)*1.5;line([x+10,y-100,x+10,y],3,'#4a3322',OL);line([x+122,y-100,x+122,y],3,'#4a3322',OL);poly([x+4,y-102,x+128,y-102,x+132+sw,y-84,x+sw,y-84],'#7b2f2f',OL,1.4);for(let i=0;i<7;i++)poly([x+2+i*19+sw,y-84,x+21+i*19+sw,y-84,x+11.5+i*19+sw,y-75],i%2?'#7b2f2f':'#d9cfb5',OL,1);
    ctx.save();ctx.translate(x-20,y);ctx.scale(-1,1);merchantModel(time);ctx.restore();addLight(x-50-cam,y-82,90,'#ffcf86',.5);addLight(x-22-cam,y-80,50,'#ffd890',.35);}
  // ---- v5.0 画面：制图人墨翁、暗格的假墙、各区域的天气粒子 ----
  // 墨翁：戴斗笠、架圆眼镜的老幽灵，坐在一摞纸卷上拿羽毛笔写写画画；身边一盏小灯，头顶飘着哼曲的音符
  const INKP={robe:'#4c5b6b',robeDark:'#323d4a',robeHi:'#6d7d8e',face:'#d4dce2',hat:'#b99a5c',hatDark:'#7e6436',scroll:'#ece0c4',ink:'#1e1a16'};
  function inkModel(t,voice=0){const K=INKP,b=Math.sin(t*1.6)*1.1;
    [[-17,-4,24],[5,-4,26],[-7,-11,24]].forEach(q=>{shape(()=>ctx.ellipse(q[0],q[1],q[2]/2,4.6,0,0,TAU),K.scroll,OL,1.3);circle(q[0]+q[2]/2-2,q[1],3,'#d8c8a0',OL,1);line([q[0]-q[2]/2+4,q[1]-1,q[0]+q[2]/2-6,q[1]-1],.7,'rgba(60,44,24,.5)');});
    shape(()=>{ctx.moveTo(-15,-13);ctx.quadraticCurveTo(-19,-34,-8,-44+b);ctx.quadraticCurveTo(2,-50+b,10,-44+b);ctx.quadraticCurveTo(19,-32,15,-13);ctx.quadraticCurveTo(7,-16,3,-13);ctx.quadraticCurveTo(-5,-17,-9,-13);ctx.closePath();},lg(-16,0,16,0,K.robeDark,K.robe,K.robeHi),OL,1.6);
    ctx.save();ctx.translate(1,-41+b);ctx.rotate(.09*Math.sin(t*1.5)+voice*.11);ctx.translate(-1,41-b);shape(()=>ctx.ellipse(1,-40+b,8,7,0,0,TAU),K.face,OL,1.3);circle(-2,-41+b,1.5,'#1a1e24');circle(4,-41+b,1.5,'#1a1e24');ctx.strokeStyle='#5a6470';ctx.lineWidth=1;ctx.beginPath();ctx.arc(-2,-41+b,2.7,0,TAU);ctx.moveTo(6.7,-41+b);ctx.arc(4,-41+b,2.7,0,TAU);ctx.stroke();
    shape(()=>{ctx.moveTo(-5,-36+b);ctx.quadraticCurveTo(1,-22+b,7,-36+b);ctx.quadraticCurveTo(1,-33+b,-5,-36+b);ctx.closePath();},'#eef2f4',OL,1);
    shape(()=>{ctx.moveTo(-19,-45+b);ctx.lineTo(1,-59+b);ctx.lineTo(21,-45+b);ctx.quadraticCurveTo(1,-40+b,-19,-45+b);ctx.closePath();},lg(-19,0,21,0,K.hatDark,K.hat,K.hatDark),OL,1.4);line([-12,-46+b,1,-56+b,14,-46+b],.7,'rgba(60,44,20,.55)');
    oval(2,-36+b,1.3,.4+voice,'#554238');ctx.restore();shape(()=>ctx.rect(-11,-23,21,9),K.scroll,OL,1.2);line([-8,-20,5,-20],.8,'rgba(40,30,20,.6)');line([-8,-17,2,-17],.8,'rgba(40,30,20,.6)');
    const qa=-.85+Math.sin(t*9)*.18-voice*.36;ctx.save();ctx.translate(8,-20);ctx.rotate(qa);shape(()=>{ctx.moveTo(0,0);ctx.quadraticCurveTo(5,-11,2,-24);ctx.quadraticCurveTo(-3,-12,0,0);ctx.closePath();},'#f4f6f8',OL,1);line([0,0,1,-20],.6,'rgba(120,130,140,.8)');ctx.restore();circle(8,-19,2.6,K.face,OL,1);}
  function inkNPC(x){const y=FLOOR;ctx.save();ctx.translate(x,y);inkModel(time);ctx.restore();box(x+22,y-15,9,15,'#4a3a2a');circle(x+26.5,y-19,4.2,'#ffd27a',OL,1);addLight(x+26-cam,y-19,64,'#ffcf86',.36);
    if(!hasMap()){for(let i=0;i<3;i++){const q=(time*.42+i/3)%1;ctx.globalAlpha=Math.sin(q*Math.PI)*.85;text(i%2?'♪':'♫',x-4+Math.sin(q*6+i*2)*9,y-66-q*42,13,'#f2e3c4','center',true);}ctx.globalAlpha=1;if(Math.abs(p.x-x)<320)text('墨翁 · 这一层的地图 '+inkPrice()+' 余烬',x,y-100,12,'#e6dcc4','center',true);}}
  // 暗格的假墙：比旁边的砖略新的一块墙，一道细裂纹；挨刀以后裂纹变多，塌了以后是一个黑黢黢的拱龛
  function drawSecrets(){for(const s of secrets){if(s.x<cam-90||s.x>cam+W+90)continue;const x=s.x,y=s.y,j=s.shake>0?Math.sin(time*80)*2.2*s.shake/.25:0;
      if(s.open){ctx.fillStyle='#07080b';ctx.beginPath();ctx.moveTo(x-26,y);ctx.lineTo(x-26,y-56);ctx.arc(x,y-56,26,Math.PI,0);ctx.lineTo(x+26,y);ctx.closePath();ctx.fill();ctx.strokeStyle=T.pilC[1];ctx.lineWidth=3;ctx.stroke();if(s.t<1){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=(1-s.t)*.6;ctx.fillStyle='#ffe2a8';ctx.fill();ctx.restore();}
        [[-18,7],[14,6],[-3,5]].forEach(q=>poly([x+q[0]-q[1],y,x+q[0],y-q[1]*1.3,x+q[0]+q[1],y],T.stone[0],OL,1));continue;}
      ctx.save();ctx.translate(j,0);for(let r=0;r<6;r++)for(let c=0;c<4;c++){const bx=x-30+c*20-(r%2?10:0),by=y-84+r*14;const x0=Math.max(bx,x-30),x1=Math.min(bx+19,x+30);if(x1-x0<3)continue;box(x0+1,by+1,x1-x0-1,12,(r+c)%3===0?T.wall[2]:T.wall[1]);}
      ctx.strokeStyle='rgba(8,6,4,.6)';ctx.lineWidth=1.1;ctx.beginPath();ctx.moveTo(x-5,y-82);ctx.lineTo(x-1,y-62);ctx.lineTo(x-9,y-45);ctx.lineTo(x-1,y-27);ctx.lineTo(x-5,y-5);ctx.moveTo(x-1,y-62);ctx.lineTo(x+9,y-54);ctx.stroke();
      if(s.hp<3){ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(x+12,y-74);ctx.lineTo(x+3,y-52);ctx.lineTo(x+15,y-31);ctx.lineTo(x+6,y-12);ctx.stroke();}
      if(s.hp<2){ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(x-22,y-70);ctx.lineTo(x-11,y-49);ctx.lineTo(x-24,y-24);ctx.moveTo(x-11,y-49);ctx.lineTo(x+3,y-52);ctx.stroke();}
      ctx.restore();if(relics.guide){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.16+.09*Math.sin(time*3);ctx.fillStyle='#ffd27a';ctx.fillRect(x-30,y-84,60,84);ctx.restore();addLight(x-cam,y-42,60,'#ffd27a',.18);}}}
  // 天气：每个区域自己的空气——监牢落灰和水滴、下水道孢子和水滴、城墙落叶、墓窟游魂、钟楼火星、焚炉余烬、驿站萤火
  let wx=[],wxTheme='',wxT=0,wxCam=0;
  function drawWeather(){const th=L.rest?'rest':L.theme;if(th!==wxTheme||wx.length===0){wxTheme=th;wx=[];const n=lowFx?16:40;for(let i=0;i<n;i++)wx.push({x:Math.random()*W,y:viewY+Math.random()*H,s:Math.random(),ph:Math.random()*TAU,k:Math.random()});}
    const dt=clamp(time-wxT,0,.05),dc=cam-wxCam;wxT=time;wxCam=cam;const top=viewY-10,bot=Math.min(viewY+H,FLOOR+40);
    for(const q of wx){let vx=0,vy=0,col='',size=1.4,glowy=false;
      if(th==='prison'){if(q.k<.15){vy=520;col='rgba(170,210,230,.55)';}else{vy=12+q.s*14;vx=Math.sin(time*.7+q.ph)*6;col='rgba(200,212,220,.32)';}}
      else if(th==='sewers'){if(q.k<.18){vy=480;col='rgba(160,230,140,.5)';}else{vy=-8-q.s*10;vx=Math.sin(time+q.ph)*8;col='rgba(170,240,140,.4)';size=1.8;glowy=true;}}
      else if(th==='ramparts'){vx=-40-q.s*60;vy=16+Math.sin(time*2+q.ph)*18;col=q.k<.5?'#d88a4a':'#b8604a';size=2.6;}
      else if(th==='ossuary'){vx=Math.sin(time*.6+q.ph)*14;vy=-6-q.s*8;col=q.k<.3?'rgba(214,170,255,.75)':'rgba(190,180,200,.3)';size=q.k<.3?2:1.3;glowy=q.k<.3;}
      else if(th==='tower'||th==='furnace'){vx=Math.sin(time*1.3+q.ph)*10;vy=-30-q.s*40;col=q.k<.5?'rgba(255,170,80,.8)':'rgba(255,214,140,.6)';size=1.5;glowy=true;}
      else{vx=Math.sin(time*.9+q.ph)*10;vy=Math.cos(time*.7+q.ph)*8;col='rgba(220,255,140,'+(.3+.5*Math.max(0,Math.sin(time*3+q.ph))).toFixed(2)+')';size=2;glowy=true;}
      q.x+=vx*dt-dc*(.5+q.s*.7);q.y+=vy*dt;if(q.x<-20)q.x+=W+40;if(q.x>W+20)q.x-=W+40;if(q.y>bot){q.y=top;q.x=Math.random()*W;}if(q.y<top){q.y=bot;q.x=Math.random()*W;}
      ctx.globalAlpha=1;if(glowy){ctx.globalCompositeOperation='lighter';ctx.fillStyle=col;ctx.beginPath();ctx.arc(q.x,q.y,size*2.4,0,TAU);ctx.globalAlpha=.25;ctx.fill();ctx.globalAlpha=1;ctx.beginPath();ctx.arc(q.x,q.y,size,0,TAU);ctx.fill();ctx.globalCompositeOperation='source-over';}
      else if(vy>300){ctx.strokeStyle=col;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x,q.y-10);ctx.stroke();}
      else if(th==='ramparts'){ctx.save();ctx.translate(q.x,q.y);ctx.rotate(time*4+q.ph);ctx.fillStyle=col;ctx.fillRect(-size,-size*.45,size*2,size*.9);ctx.restore();}
      else{ctx.fillStyle=col;ctx.fillRect(q.x,q.y,size,size);}}ctx.globalAlpha=1;}
  // 调色：每个区域盖一层柔光（监牢偏冷蓝、下水道偏绿、城墙偏暖橙、墓窟偏紫、钟楼偏琥珀）
  const GRADE={prison:'#4f6f95',sewers:'#4f8a52',ramparts:'#ff9a5a',ossuary:'#7a54a8',tower:'#c4783a',furnace:'#c8602a',rest:'#c88a4a'};
  function drawGrade(){if(lowFx)return;const c=GRADE[L.rest?'rest':L.theme];if(!c)return;ctx.save();ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=.2;ctx.fillStyle=c;ctx.fillRect(0,0,W,H);ctx.restore();}
  const FACES={
    '青带女孩':(t,voice)=>{storySpirit('child',74,184,3.5,1,t,null,true,lanternSignal(t),voice);},
    '守钟人':(t,voice)=>{ctx.translate(80,80+46*2.5);ctx.scale(2.5,2.5);ctx.translate(-5,0);keeperModel(t,voice);},
    '烛叟':(t,voice)=>{ctx.translate(80,82+62*2.3);ctx.scale(2.3,2.3);ctx.translate(-2,0);merchantModel(t,undefined,voice);},
    '小幽灵':(t,voice)=>{ctx.translate(80,84+30*3);ctx.scale(3,3);ctx.translate(-4,0);storySpirit('hero',0,voice*.8,1,1,t,heroPal(),true);},
    '守锁兽':()=>{ctx.translate(80,80+44*1.7);ctx.scale(1.7,1.7);ctx.translate(-66,0);drawLock(fakeFoe('lock'),LOCK);},
    '溺灯':()=>{ctx.translate(80,80+86*1.05);ctx.scale(1.05,1.05);drawBrood(fakeFoe('brood'),BROOD);},
    '无名旗手':()=>{ctx.translate(80,80+104*2.1);ctx.scale(2.1,2.1);ctx.translate(-2,0);drawStandard(fakeFoe('standard'),STD);},
    '沉钟典狱长':()=>{ctx.translate(80,80+112*1.9);ctx.scale(1.9,1.9);drawWarden(fakeFoe('warden'),WARDEN);},
    '墨翁':(t,voice)=>{ctx.translate(80,84+44*2.4);ctx.scale(2.4,2.4);inkModel(t,voice);}};
  const FACE_ART={'墙上的刻痕':'carving','旗手的遗骸':'flag','典狱长的手记':'journal','祷文':'beads'};
  function paintTalkFace(){
    if(!talk||talkFace.hidden)return;
    const name=talk.lines[talk.i][0],f=FACES[name],age=talk.faceAge;
    if(talk.facePaint>=0&&(!f||age-talk.facePaint<1/24))return;
    talk.facePaint=age;
    const keep=ctx,faceCtx=talkFace.getContext('2d');
    if(!faceCtx)return;
    const col=WHO[name]||'#c9b28a',speaking=talk.wait<=0&&talk.shown<talk.text.length;
    const voice=speaking?Math.abs(Math.sin(age*13))*(.5+.5*Math.sin(age*4)):0;
    ctx=faceCtx;ctx.save();
    try{
      ctx.clearRect(0,0,160,160);ctx.beginPath();ctx.arc(80,80,76,0,TAU);ctx.clip();
      ctx.fillStyle=rg(80,64,112,tint(col,.42),'#0d1117');ctx.fillRect(0,0,160,160);
      if(f)f(time,voice);else{const art=artCanvas(FACE_ART[name]);if(art)ctx.drawImage(art,20,20,120,120);}
    }finally{faceCtx.restore();ctx=keep;}
    faceCtx.beginPath();faceCtx.arc(80,80,76,0,TAU);faceCtx.strokeStyle=col;faceCtx.lineWidth=3;faceCtx.stroke();
  }
  // ---- 剧情插画：开场与结局的旁白画面，全部现场绘制（舞台坐标 ±550 × ±310，居中缩放） ----
  function stageIn(){const s=tall?Math.min(W/700,H/620):Math.min(W/1100,H/620),z=1+Math.min(.05,Math.max(0,sceneT)*.012);ctx.translate(W/2+Math.sin(time*.22)*16,H/2+Math.cos(time*.16)*8);ctx.scale(s*z,s*z);}   // 竖屏时放大一些；旁白镜头会慢慢推近、轻轻摇
  function staged(t,o){stageIn();stageFill(o.sky);ctx.fillStyle=o.wall;ctx.fillRect(-980,-80,1960,460);
    for(let i=0;i<8;i++){ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(-700+i*200+Math.sin(t*.4+i)*6,-380,16,560);}
    const lx=-150+Math.sin(t*.65)*46;bloom(lx,-10,260,o.glow,.42+.1*Math.sin(time*2.4));fl(lx,-4,.7,o.flame||['#c4501c','#ffb347','#fff1c2']);
    ctx.fillStyle=o.floor;ctx.beginPath();ctx.moveTo(-980,128);ctx.quadraticCurveTo(0,o.dip||86,980,128);ctx.lineTo(980,420);ctx.lineTo(-980,420);ctx.fill();
    if(o.water){ctx.strokeStyle=o.water;ctx.globalAlpha=.6;ctx.beginPath();for(let x=-760;x<=760;x+=14)ctx.lineTo(x,168+Math.sin(x*.03+time*1.8)*4);ctx.stroke();ctx.globalAlpha=1;}
    ghostAt(-24+Math.sin(t*.9)*10,136,2.05,o.face||1,GH,true);
    if(o.keeper){ctx.save();ctx.translate(168,158);ctx.scale(1.65,1.65);keeperModel(t);ctx.restore();}
    if(o.child)storySpirit('child',-230+Math.min(70,t*14),142,1.25,1,t+1);
    if(o.warden)storySpirit('warden',250,150,2.2,-1,t);
    ctx.fillStyle='#04060a';ctx.fillRect(-980,-520,86,1040);ctx.fillRect(894,-520,86,1040);
    for(let i=0;i<16;i++){const u=(time*.16+i*.061)%1;ctx.globalAlpha=(1-u)*.75;circle(-280+(i*83)%560,240-u*340,1.3,o.mote||'#ffe0b0');}ctx.globalAlpha=1;}
  function stageFill(stops){const g=ctx.createLinearGradient(0,-360,0,360);stops.forEach(q=>g.addColorStop(q[0],q[1]));ctx.fillStyle=g;ctx.fillRect(-3000,-2000,6000,4000);}
  function stageStars(n,seed,a){const r=rng(seed);ctx.fillStyle='#e8f0ff';for(let i=0;i<n;i++){const x=-760+r()*1520,y=-340+r()*300,s=.6+r()*1.6;ctx.globalAlpha=a*(.35+.65*Math.abs(Math.sin(time*1.3+i*1.7)));ctx.fillRect(x,y,s,s);}ctx.globalAlpha=1;}
  function bloom(x,y,r,c,a){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.min(1,Math.max(0,a));ctx.translate(x,y);ctx.scale(r,r);ctx.fillStyle=glowGrad(c);ctx.beginPath();ctx.arc(0,0,1,0,TAU);ctx.fill();ctx.restore();}
  function soulAt(x,y,s,a){if(a<=0)return;bloom(x,y,22*s,'#8be1ce',.35*a);ctx.globalAlpha=Math.min(1,a);fl(x,y+7*s,.45*s,['#2fa39b','#8be1ce','#effff9']);ctx.globalAlpha=1;}
  function ghostAt(x,y,size,facing,P,lamp){
    storySpirit('hero',x,y,size,facing,time+x*.013,P===GH?heroPal():P,lamp);
  }
  function towerSil(x,y,s,c,bell){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(-58,420);ctx.lineTo(-46,110);ctx.lineTo(-56,110);ctx.lineTo(-56,98);ctx.lineTo(0,0);ctx.lineTo(56,98);ctx.lineTo(56,110);ctx.lineTo(46,110);ctx.lineTo(58,420);ctx.closePath();ctx.fill();ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.moveTo(-27,206);ctx.lineTo(-27,152);ctx.quadraticCurveTo(0,118,27,152);ctx.lineTo(27,206);ctx.closePath();ctx.fill();
    if(bell){ctx.save();ctx.translate(0,150);ctx.rotate(Math.sin(time*1.6)*.12*bell);shape(()=>{ctx.moveTo(0,0);ctx.bezierCurveTo(-11,0,-12,26,-16,40);ctx.lineTo(16,40);ctx.bezierCurveTo(12,26,11,0,0,0);},'#e6c078',OL,1.4);ctx.restore();}ctx.restore();if(bell)bloom(x,y+172*s,90*s,'#ffcf80',.45*bell);}
  function rings(x,y,s,a,c){for(let i=0;i<3;i++){const r=(time*.35+i/3)%1;ctx.globalAlpha=a*(1-r)*.8;ctx.strokeStyle=c||'#ffe2a8';ctx.lineWidth=3*(1-r)+1;ctx.beginPath();ctx.arc(x,y,(30+r*260)*s,0,TAU);ctx.stroke();}ctx.globalAlpha=1;}
  function bigBell(c0,c1){shape(()=>{ctx.moveTo(-30,0);ctx.quadraticCurveTo(-52,8,-58,70);ctx.quadraticCurveTo(-64,160,-104,230);ctx.lineTo(104,230);ctx.quadraticCurveTo(64,160,58,70);ctx.quadraticCurveTo(52,8,30,0);ctx.closePath();},lg(-104,0,104,0,c0,c1,c0),OL,3);}
  // 剪影配色：把典狱长画成黑影，只留眼缝和灯里的魂火亮着
  let SIL_W=null;function silWarden(){if(!SIL_W){SIL_W={};Object.keys(WARDEN).forEach(k=>SIL_W[k]=/Hi$/.test(k)?'#3a2a20':/Dark$/.test(k)?'#0a0706':'#1a120e');SIL_W.soul='#8be1ce';SIL_W.soulHi='#effff9';SIL_W.glow='#ffb04a';SIL_W.glass='#1a2a2a';}return SIL_W;}
  // Cast members share the hero's scalloped spirit body. Props stay attached
  // in local coordinates so the long shot and close-up use the same design.
  const STORY_SPIRITS={
    smith:{body:'#acd1ce',shade:'#618589',scarf:'#b97b47',scarfDark:'#67432d',eye:'#253238',w:1.24,h:.91},
    bearer:{body:'#dcd4ec',shade:'#978baa',scarf:'#aa5261',scarfDark:'#623b50',eye:'#332d43',w:.90,h:1.19},
    child:{body:'#fff1cb',shade:'#dbbc91',scarf:'#65cabe',scarfDark:'#388e93',eye:'#443c49',w:.95,h:.83},
    warden:{body:'#637082',shade:'#33394b',scarf:'#796579',scarfDark:'#473d51',eye:'#ffca87',w:1.38,h:1.12}
  };
  function storySpirit(role,x,y,size,facing,t,palette,lantern,signal=0,voice=0){
    const P=palette||STORY_SPIRITS[role]||GH;
    const breath=Math.sin(t*2.1),sway=Math.sin(t*1.5+.3);
    const smith=role==='smith',bearer=role==='bearer',child=role==='child',warden=role==='warden';
    const blow=smith?Math.pow((1+Math.sin(t*3.3))*.5,3):0;
    const lift=child?signal*.65+.25+.18*sway:warden?.5+.45*sway:.42+.33*sway;
    ctx.save();ctx.translate(x,y);ctx.scale(size*facing*(P.w||1),size*(P.h||1));
    const lean=smith?-.16+.36*blow:child?.08+.065*lift:warden?-.07+.04*sway:.06*sway;
    ctx.translate(0,-9+breath);ctx.rotate(lean);ctx.translate(0,9);
    const scarfTip=-30+4*Math.sin(t*2.6);
    ribbon(-8,-22,-16,-25+sway*4,scarfTip,-20+Math.sin(t*2.6-.7)*5,6,1,P.scarf,OL,8);
    // Weighted folds stay close to the feet while the shoulders and head turn.
    shape(()=>{ctx.moveTo(-8,-30);ctx.quadraticCurveTo(-14,-26,-16,-8);
      ctx.quadraticCurveTo(-11,-10,-10,-4);ctx.quadraticCurveTo(-5,-3,-3,-8);
      ctx.quadraticCurveTo(2,1,6,-6);ctx.quadraticCurveTo(12,-2,15,-8);
      ctx.quadraticCurveTo(13,-25,7,-29);ctx.closePath();},lg(-16,0,14,0,P.shade,P.body,P.shade),OL,1.6);
    line([-9,-21,-11,-11,-10,-8],1.3,P.shade);line([5,-19,8,-12,8,-8],1,P.shade);
    if(smith){poly([-8,-24,9,-23,11,-7,-8,-8], '#83604a',OL,1);line([-6,-19,8,-18],1,'#d5ad78');}
    if(warden){for(let i=0;i<5;i++)link(-9+i*4,-23+Math.sin(i*.75)*3,i%2?.4:2,'#b29980',1.4);}
    const hx=2+sway*1.3,hy=-33+breath*.65+voice*.75+(smith?blow*2:0);
    ctx.save();ctx.translate(hx,hy);ctx.rotate((child?-.13*lift:smith?.17*blow:warden?.085:.06)*sway);
    shape(()=>{ctx.moveTo(-13,4);ctx.bezierCurveTo(-16,-3,-12,-15,-1,-16);
      ctx.bezierCurveTo(10,-17,15,-9,14,0);ctx.quadraticCurveTo(16,8,5,10);
      ctx.quadraticCurveTo(-8,13,-13,4);ctx.closePath();},lg(-12,-12,13,7,P.shade,P.body,P.body),OL,1.7);
    // The far cheek is in shadow; the lantern warms the lower edge of the near cheek.
    shape(()=>{ctx.moveTo(-12,-7);ctx.quadraticCurveTo(-14,4,-7,8);ctx.quadraticCurveTo(-1,11,6,8);
      ctx.quadraticCurveTo(-7,8,-12,-7);},P.shade);
    line([8,7,11,5,12,2],.85,child?'#ffdf9d':'#ffeac1');
    if(child){
      shape(()=>{ctx.moveTo(-13,-3);ctx.quadraticCurveTo(-15,-15,-3,-16);
        ctx.quadraticCurveTo(6,-18,11,-11);ctx.quadraticCurveTo(6,-13,4,-8);
        ctx.quadraticCurveTo(3,-12,1,-10);ctx.quadraticCurveTo(-4,-10,-8,-3);
        ctx.quadraticCurveTo(-11,2,-13,1);ctx.closePath();},'#ac855c','#68553f',.9);
      poly([-10,-8,-15,-15,-19,-14,-17,-9,-12,-7,-17,-4,-15,-2,-9,-6],P.scarf,OL,.85);
      circle(-11,-7,1.8,'#afe4cc');oval(8,2.5,2.3,1.2,'#edc19a');
    }
    if(smith){poly([-14,-7,-11,-14,-2,-17,9,-14,14,-9,12,-7,-3,-11],'#947650',OL,1.3);
      line([-9,-13,5,-14],1,'#d5b17e');}
    if(warden){poly([-14,-8,-17,-20,-8,-14,0,-23,8,-14,16,-20,13,-7],'#363948','#b99a73',1.3);}
    const blink=clamp(Math.abs((t%4.1+4.1)%4.1-3.8)*9,.12,1),gaze=sway*1.3;
    oval(2+gaze,-2,2.2,3.5*blink,P.eye);oval(9+gaze,-2.5,1.9,3.1*blink,P.eye);
    if(child&&!voice&&talk?.lines[talk.i][0]==='青带女孩'&&talk.shown<talk.text.length&&talk.wait<=0)voice=.6*Math.abs(Math.sin(t*13));
    if(child||voice>0)oval(7,4,1.8,.4+voice*1.5,P.scarfDark);
    if(blink>.5&&!warden){circle(2.6+gaze,-3,.7,'#fff');circle(9.4+gaze,-3.5,.6,'#fff');}
    ctx.restore();
    ribbon(-12,-24,-1,-18,10,-23,4,3,P.scarf,OL,8);
    let handX=16+lift*3,handY=-17-lift*8;
    if(lantern&&!child&&!warden){handX=20+lift*3;handY=-35-lift*9;}
    if(smith){handX=9+14*blow;handY=-35+24*blow;}
    if(bearer){handX=6+sway*1.5;handY=-29;}
    sleeve(-7,-23,-10+sway*2,-12-breath*1.3,-3,P,true);
    if(bearer){ctx.save();ctx.translate(handX,handY);ctx.rotate(-.12+sway*.06);
      line([0,27,0,-40],2.3,'#cfaf81',OL);ribbon(0,-36,-14,-42+sway*4,-32,-33+breath*4,12,7,'#a75667',OL,8);ctx.restore();}
    if(smith)hammer(handX,handY,-2.3+2.85*blow,17);
    if(child||warden||lantern){
      ctx.save();ctx.translate(handX,handY);ctx.rotate(.13*sway-(child?signal*.25:0));
      line([0,0,-4,6,5,6,0,0],1.2,'#c5a67c');
      poly([-4,6,5,6,6,15,1,18,-5,15],'#293432','#bb9970',1);
      fl(0,15,.36,child?['#438754','#98db85','#f3ffe6']:warden?['#458f89','#98e8d1','#f2ffe5']:undefined);
      bloom(0,13,18,child?'#a4e78c':warden?'#8be1ce':'#ffcd85',.35);ctx.restore();
    }
    sleeve(6,-23,handX,handY,3.2,P,false);
    line([handX-1.1,handY+1.8,handX+1.3,handY+1],.7,P.shade);
    circle((6+handX)*.5+2,(-23+handY)*.5+4,.8,'#c3ab7d');
    ctx.restore();
  }
  // 阿苓叫门的暗号：两次短摆，中间有一个清楚的停顿。
  function lanternSignal(t){
    const beat=(Math.max(0,t)%4.2)-.35;
    if(beat<0||beat>1.7)return 0;
    const swing=beat<.9?beat:beat-.9;
    return swing<.8?Math.sin(swing/.8*TAU)*Math.sin(swing/.8*Math.PI):0;
  }
  const SCENES={
    // 很久以前：夜空下的钟楼，钟声一圈圈荡开；小引灯人提着灯，领着魂火沿山路往钟下走
    bell(t){
      const s=(tall?Math.min(W/560,H/480):Math.min(W/760,H/480))*(1+Math.min(.02,t*.004));
      ctx.translate(W*.5,H*.62);ctx.scale(s,s);
      stageFill([[0,'#070c18'],[.3,'#14243c'],[.55,'#35506a'],[.74,'#c48958'],[1,'#24180f']]);stageStars(70,11,.8);
      bloom(-250,-200,70,'#e7f0ff',.28);circle(-250,-200,9,'#f8fbff');
      ctx.fillStyle='#10192a';ctx.beginPath();ctx.moveTo(-640,-30);for(let x=-640;x<=640;x+=22)ctx.lineTo(x,-55-22*Math.sin(x*.012));ctx.lineTo(640,30);ctx.lineTo(-640,30);ctx.fill();
      towerSil(250,-230,.95,'#0c121a',1);rings(250,-90,.42,.4);bloom(250,-80,120,'#ffcf86',.4);
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.2;ctx.fillStyle='#ffd7a8';ctx.beginPath();ctx.moveTo(220,-80);ctx.lineTo(280,-64);ctx.lineTo(40,20);ctx.lineTo(-80,28);ctx.closePath();ctx.fill();ctx.restore();
      [[-430,168,150],[-250,150,190],[-90,176,210],[-70,140,160],[90,190,230],[250,150,140]].forEach((h,i)=>{const x=h[0],w=h[1],ht=h[2];ctx.fillStyle=i%2?'#1c2838':'#28384c';ctx.fillRect(x,-ht+8,w,ht);ctx.fillStyle='#121820';ctx.beginPath();ctx.moveTo(x-6,-ht+8);ctx.lineTo(x+w/2,-ht-22);ctx.lineTo(x+w+6,-ht+8);ctx.fill();
        for(let r=0;r<3;r++)for(let c=0;c<2;c++){const wx=x+16+c*(w*.38),wy=-ht+28+r*36,lit=(i+r+c)%2;ctx.fillStyle=lit?'#ffd09a':'#121820';ctx.fillRect(wx,wy,14,18);if(lit)bloom(wx+7,wy+9,16,'#ffb060',.22);}
        ctx.fillStyle='#0c1016';ctx.fillRect(x+w*.42,-28,18,36);if(i%2===0){ctx.fillStyle=i%4?'#7a2c38':'#2c5a62';ctx.beginPath();ctx.moveTo(x+w-4,-ht+16);ctx.quadraticCurveTo(x+w+16,-ht+34+Math.sin(time*1.6+i)*5,x+w,-ht+52);ctx.lineTo(x+w-4,-ht+16);ctx.fill();}
        if(i===2){ctx.fillStyle='#3a2a1c';ctx.fillRect(x+w*.55,-ht-8,8,16);for(let k=0;k<3;k++){const u=(time*.25+k*.3)%1;circle(x+w*.55+4,-ht-8-u*28,2,'rgba(220,220,220,'+(1-u)*.5+')');}}});
      ghostAt(-4,-150,.42,1,GH,false);ghostAt(150,-168,.36,-1,{body:'#efe6d4',shade:'#c2ae90',scarf:'#a36b32',scarfDark:'#6a4420',eye:'#2a2018'},false);
      ctx.fillStyle='#2a241c';ctx.beginPath();ctx.moveTo(-620,8);ctx.lineTo(-180,8);ctx.lineTo(-150,-16);ctx.lineTo(40,-16);ctx.lineTo(78,10);ctx.lineTo(620,22);ctx.lineTo(620,150);ctx.lineTo(-620,150);ctx.closePath();ctx.fill();
      ctx.fillStyle='#3a342c';[[-180,8,30,16],[-150,-16,30,16],[40,-16,38,26]].forEach(q=>ctx.fillRect(q[0],q[1],q[2],q[3]));
      ctx.strokeStyle='rgba(210,196,170,.18)';ctx.lineWidth=1;for(let i=0;i<14;i++){ctx.beginPath();ctx.moveTo(-560+i*80,24+(i%3)*5);ctx.lineTo(-520+i*80,36);ctx.stroke();}
      [[-340,8],[-120,-16],[70,10],[210,16]].forEach((p,i)=>{line([p[0],p[1],p[0],p[1]-78],3,'#4a3424',OL);fl(p[0],p[1]-80,.5,['#c4501c','#ffb060','#fff1c8']);bloom(p[0],p[1]-80,34,'#ffb060',.4);});
      ctx.save();ctx.translate(-250,4);ctx.scale(1.15,1.15);keeperModel(t);ctx.restore();
      const folk=[{body:'#d7e0ea',shade:'#8ea0b4',scarf:'#8d3d49',scarfDark:'#5c2834',eye:'#1a2430'},{body:'#e7efe6',shade:'#9bb5a4',scarf:'#3d6d86',scarfDark:'#24485c',eye:'#142028'},{body:'#efe6d4',shade:'#c2ae90',scarf:'#a36b32',scarfDark:'#6a4420',eye:'#2a2018'}];
      [[-40,-14,.55,0],[30,-12,.5,1],[120,12,.48,2],[200,14,.42,0],[-160,6,.46,1]].forEach(q=>ghostAt(q[0],q[1],q[2],q[0]>80?-1:1,folk[q[3]],false));
      storySpirit('child',-70,18,.85,1,t+1.4);storySpirit('bearer',10,28,1.05,1,t+.6);storySpirit('smith',100,36,1.15,1,t+.2);
      ghostAt(-210,70,1.7,1,GH,true);bloom(-180,28,90,'#ffcf86',.55);
      ghostAt(250,78,1.45,-1,folk[0],false);
      for(let i=0;i<16;i++){const u=(time*.22+i*.06)%1;circle(-160+((i*70)%380),70-u*160,1.4,'rgba(255,210,150,'+(1-u)+')');}
      ctx.fillStyle='#0c1016';ctx.beginPath();ctx.moveTo(-640,90);ctx.quadraticCurveTo(-300,130,40,170);ctx.lineTo(-640,220);ctx.fill();
      ctx.beginPath();ctx.moveTo(640,70);ctx.quadraticCurveTo(300,130,120,180);ctx.lineTo(640,220);ctx.fill();},
    // 典狱长锁住钟舌：巨钟的钟舌被铁链和锁缠死；典狱长的黑影提着灯，魂火一盏盏被吸进灯里
    procession(t){
      stageIn();const zoom=tall?1.68:2.10;ctx.scale(zoom,zoom);ctx.translate(tall?137:179,22);stageFill([[0,'#0c1723'],[.62,'#243c47'],[1,'#100f19']]);
      const drift=Math.min(t,8)*5, sway=Math.sin(t*2);
      for(let i=0;i<8;i++){
        const x=-700+i*200-drift;
        box(x,-340,24,680,'#182a35');
        line([x+12,-250,x+104,-166,x+204,-250],5,'#31454d');
        bloom(x+100,-135,36,'#ffc16f',.22);fl(x+100,-130,.48,['#bd7237','#ffc680','#fff3cf']);
      }
      box(-800,94,1600,260,'#101c25');
      for(let i=0;i<18;i++)line([-720+i*86-drift,97,-800+i*96-drift,260],2,'#24343c');
      const childX=(tall?-220:-263)+Math.min(1,t/4)*38;
      oval(-95,94,25,3,'rgba(4,10,16,.65)');oval(childX,94,19,2.5,'rgba(4,10,16,.58)');
      ghostAt(-96,96+sway*2,2,-1,GH,true);
      const lampY=39+sway*3;
      storySpirit('child',childX,94,1.65,1,t+2.4,null,true,lanternSignal(t));
      for(let i=0;i<14;i++){const u=(t*.12+i/14)%1;circle(-157+Math.sin(i*2+t)*28,lampY-u*75,1.4,'rgba(255,217,147,'+(1-u)*.7+')');}
    },
    warden(t){stageIn();stageFill([[0,'#120a07'],[.6,'#24140d'],[1,'#120a07']]);ctx.fillStyle='#1c120c';for(let i=0;i<6;i++)ctx.fillRect(-560+i*200,-340,26,700);
      ctx.save();ctx.translate(-150,-290);chain(-60,0,110,'#3a2c20');chain(60,0,110,'#3a2c20');ctx.translate(0,110);bigBell('#3a2614','#8a6234');for(let i=0;i<9;i++)link(-34+i*8.5,232+Math.sin(i)*4,i%2?.4:2,'#7c828a',4);ctx.save();ctx.translate(0,244);padlock(LOCK,false,1.4);ctx.restore();ctx.restore();
      storySpirit('warden',270,192,3.6,-1,t);const lx=270-27*3.6,ly=192-15*3.6;bloom(lx,ly,110,'#8be1ce',.55);
      for(let i=0;i<7;i++){const u=(t*.18+i/7)%1,x=-480+u*(lx+480),y=-40+u*(ly+40)-Math.sin(u*Math.PI)*110+Math.sin(time*3+i)*10;soulAt(x,y,1-u*.4,Math.min(1,u*4)*(1-u*.6));}},
    // 被扔进焚炉：小引灯人护着怀里那团小火，被扔向通红的炉口
    furnace(t){stageIn();stageFill([[0,'#0c0606'],[1,'#1a0c08']]);const fx=180,fy=40;
      shape(()=>{ctx.moveTo(fx-230,330);ctx.lineTo(fx-230,fy-60);ctx.quadraticCurveTo(fx,fy-330,fx+230,fy-60);ctx.lineTo(fx+230,330);ctx.closePath();},'#2a1a14',OL,4);
      shape(()=>{ctx.moveTo(fx-160,330);ctx.lineTo(fx-160,fy-20);ctx.quadraticCurveTo(fx,fy-230,fx+160,fy-20);ctx.lineTo(fx+160,330);ctx.closePath();},lg(0,fy-230,0,330,'#fff2c0','#ff9a3a','#a8300c'));
      ctx.globalAlpha=.85;for(let i=0;i<9;i++){const x=fx-140+i*35,h=90+Math.sin(time*6+i*1.7)*40;fl(x,330,h/20,['#c8401a','#ff8a2a','#ffe08a']);}ctx.globalAlpha=1;bloom(fx,fy+60,380,'#ff8a3a',.6);
      for(let i=0;i<24;i++){const u=(time*.3+i*.137)%1;circle(fx-200+(i*97)%400,330-u*620,1.4+(i*7)%3,'rgba(255,200,120,'+(.9*(1-u)).toFixed(2)+')');}
      const k=Math.min(1,t/4),gx=-120+k*120,gy=-60+k*90;ctx.save();ctx.translate(gx,gy);ctx.rotate(-.5+k*.6);ghostAt(0,0,2.2,1,GH,false);ctx.restore();soulAt(gx+16,gy-40,1.2,1);
      ctx.fillStyle='#050303';ctx.beginPath();ctx.moveTo(-700,-400);ctx.quadraticCurveTo(-420,-260,-300,-220);ctx.quadraticCurveTo(-260,-200,-250,-170);ctx.lineTo(-300,-150);ctx.quadraticCurveTo(-440,-200,-700,-120);ctx.fill();},
    // 灰烬里，那团火又跳动起来
    ember(t){stageIn();stageFill([[0,'#030305'],[1,'#0b0a0c']]);const g=Math.min(1,t/5),pulse=.6+.4*Math.sin(time*3);
      shape(()=>{ctx.moveTo(-460,330);ctx.quadraticCurveTo(-220,130,0,118);ctx.quadraticCurveTo(240,130,460,330);ctx.closePath();},lg(0,118,0,330,'#3a3634','#1a1818'));{const r=rng(911);for(let i=0;i<90;i++){const x=-360+r()*720,y=130+r()*180,s=1+r()*2.4;if(y>128+Math.abs(x)*.5)circle(x,y,s,'rgba(120,112,104,.6)');}}
      bloom(0,110,90+160*g,'#ff9a3a',(.35+.4*g)*pulse);fl(0,122,.6+.9*g*pulse,['#c8401a','#ffb347','#fff1c2']);
      for(let i=0;i<14;i++){const u=(time*.22+i*.071)%1;circle(Math.sin(i*2.3+time)*30*u,110-u*320,1.2+u*1.4,'rgba(255,190,110,'+(g*(1-u)).toFixed(2)+')');}},
    // 醒来：小幽灵站在灰堆上，青围巾飘着；高窗外远远能看见钟楼
    awaken(t){stageIn();stageFill([[0,'#0a1018'],[1,'#141c26']]);
      shape(()=>ctx.rect(150,-300,150,190),'#0e1622',OL,3);ctx.fillStyle='#1f3048';ctx.fillRect(160,-290,130,170);towerSil(225,-280,.45,'#0c1420',.5);for(let i=0;i<4;i++)box(168+i*36,-290,5,170,'#0a0e14');box(160,-210,130,5,'#0a0e14');
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.16;ctx.fillStyle='#bcd6ff';ctx.beginPath();ctx.moveTo(160,-120);ctx.lineTo(290,-120);ctx.lineTo(80,330);ctx.lineTo(-90,330);ctx.closePath();ctx.fill();ctx.restore();
      shape(()=>{ctx.moveTo(-380,330);ctx.quadraticCurveTo(-130,166,40,160);ctx.quadraticCurveTo(230,166,400,330);ctx.closePath();},lg(0,160,0,330,'#3a3634','#141212'));
      const sw=Math.sin(time*2.2);ribbon(-18,104,-58,90+sw*12,-104,106+sw*18,13,4,'#2fa39b',OL,12);
      const pal=heroPal();ghostAt(0,162,2.6,1,pal,false);
      ctx.save();ctx.translate(0,162);ctx.scale(2.6,2.6);heroGear(p.char);
      if(p.char==='bow')bowW(11,-17,-.15,0);else if(p.char==='bell')hammer(11,-17,.7,25);else nail(11,-17,.7,pal,28);
      ctx.restore();bloom(4+lanternSignal(t)*5,96,80,'#9be36a',.42);
      for(let i=0;i<10;i++){const u=(time*.12+i*.1)%1;circle(-40+(i*53)%120,150-u*260,1.2,'rgba(255,220,170,'+(.7*(1-u)).toFixed(2)+')');}},
    // 结局一：钟响了。巨钟摆起来，金色的钟声一圈圈荡开；地上是典狱长碎掉的灯
    ring(t){stageIn();stageFill([[0,'#1a1008'],[.6,'#3a2412'],[1,'#1a1008']]);rings(0,-60,1.4,1);
      ctx.save();ctx.translate(0,-330);ctx.rotate(Math.sin(time*1.8)*.22);chain(-60,0,120,'#4a3a2a');chain(60,0,120,'#4a3a2a');ctx.translate(0,120);bigBell('#6a4420','#e6b060');shape(()=>ctx.ellipse(0,230,104,12,0,0,TAU),'#f0cf8a',OL,2);circle(Math.sin(time*1.8+1)*30,248,14,'#8a6230',OL,2);ctx.restore();bloom(0,-60,420,'#ffcf80',.5+.2*Math.sin(time*3.6));
      ctx.save();ctx.translate(-330,170);ctx.rotate(.3);shape(()=>ctx.rect(-30,-36,60,52),'rgba(32,50,50,.9)',OL,3);for(let i=-1;i<=1;i++)line([i*20,-36,i*24,16],3,'#8a6a3e');shape(()=>{ctx.moveTo(-34,-36);ctx.lineTo(34,-36);ctx.lineTo(18,-52);ctx.lineTo(-18,-52);ctx.closePath();},'#8a6a3e',OL,2);ctx.restore();
      for(let i=0;i<10;i++){const u=(time*.15+i*.1)%1;soulAt(-330+Math.sin(i*1.7+time)*60*u,150-u*520,1,1-u);}},
    // 结局二：魂火从碎灯里升起，越过城墙，飞向天光
    rise(t){stageIn();stageFill([[0,'#f4b878'],[.25,'#8a5a78'],[.6,'#2a2a48'],[1,'#10142a']]);bloom(0,-380,520,'#ffd9a0',.55);
      ctx.fillStyle='#161a30';ctx.beginPath();ctx.moveTo(-800,330);for(let x=-800;x<=800;x+=50){const h=Math.floor((x+800)/50)%3===0?40:0;ctx.lineTo(x,140-h);ctx.lineTo(x+25,140-h);}ctx.lineTo(800,330);ctx.fill();towerSil(-260,-160,.9,'#11142a',0);
      const r=rng(4242);for(let i=0;i<28;i++){const sp=.05+r()*.04,ph=r(),x0=-520+r()*1040,sz=.7+r()*.6,u=(time*sp+ph)%1;soulAt(x0+Math.sin(time+i)*20,330-u*720,sz,Math.min(1,u*5)*(1-u*.7));}},
    // 结局三：驿站里，烛叟抬起头，一点绿色的火停在他的灯上
    merchant(t){stageIn();stageFill([[0,'#1c1410'],[.7,'#2a1c12'],[1,'#120c08']]);ctx.fillStyle='#1a120c';ctx.fillRect(-3000,176,6000,400);ctx.save();ctx.translate(-150,176);ctx.scale(2.2,2.2);line([-26,0,22,-14],5,'#5a3d27',OL);line([26,0,-22,-14],5,'#6a4a2f',OL);fl(0,-6,1.9);fl(-8,-4,1.2);fl(8,-4,1.3);ctx.restore();bloom(-150,140,260,'#ffa040',.6+.05*Math.sin(time*9));
      box(-35,152,86,7,'#6a4a33');box(-28,159,7,17,'#513927');box(36,159,7,17,'#513927');
      drawArt('soup',-10,141,28);drawArt('soup',25,141,28);
      ctx.save();ctx.translate(130,176);ctx.scale(-2.3,2.3);merchantModel(time,t);ctx.restore();
      const landing=clamp(t/1.35,0,1),distance=(1-landing)*(1-landing);
      const gx=130-30*2.3-235*distance+lanternSignal(t-1.35)*15;
      const gy=176-70*2.3-95*distance;
      bloom(gx,gy,70,'#9be36a',.48);if(landing<1)fl(gx,gy+8,.55,['#3f9a3a','#9be36a','#eaffc8']);},
    // 结局四：天亮了。钟楼的阳台上，小引灯人提着灯，青围巾在风里飘
    dawn(t){stageIn();stageFill([[0,'#ffcf94'],[.35,'#f39a72'],[.7,'#6a4a6a'],[1,'#2a2440']]);bloom(-220,60,420,'#fff0c8',.65);circle(-220,60,58,'#ffe8c0');
      ctx.fillStyle='#4a3352';ctx.beginPath();ctx.moveTo(-800,330);for(let x=-800;x<=800;x+=30)ctx.lineTo(x,170-50*Math.sin(x*.005+1)-20*Math.sin(x*.013));ctx.lineTo(800,330);ctx.fill();
      {const r=rng(1313);for(let i=0;i<12;i++){const x=-520+r()*1040,y=-320+r()*200;soulAt(x,y,.5,.35+.3*Math.sin(time*2+i));}}
      towerSil(240,-260,1.15,'#2a1f30',.8);shape(()=>ctx.rect(150,-30,180,14),'#1f1626',OL,2);for(let i=0;i<7;i++)box(158+i*26,-60,5,30,'#1f1626');
      const sw=Math.sin(time*2.4),pal=heroPal();ribbon(252,-76,290,-90+sw*9,326,-78+sw*15,11,3.4,pal.scarf,OL,12);ghostAt(240,-30,2.2,-1,pal,true);
      box(-285,155,31,18,'#453341');poly([-291,155,-270,141,-249,155],'#3b2935');
      bloom(-269,163,25,'#b6e796',.5);box(-273,160,8,6,'#d8efb0');},
    cells(t){staged(t,{sky:[[0,'#071018'],[.55,'#163044'],[1,'#0c161e']],wall:'#121c26',floor:'#1c2c36',glow:'#9fd4ff',keeper:true,child:true,mote:'#d5e8f4',flame:['#2f6a88','#9fd4ff','#f4fbff']});},
    well(t){staged(t,{sky:[[0,'#070b10'],[.6,'#121820'],[1,'#070b10']],wall:'#10161c',floor:'#182026',glow:'#d7e4ee',keeper:true,dip:110,mote:'#e4eef4',flame:['#4a5a64','#d7e4ee','#ffffff']});for(let i=0;i<3;i++){ctx.strokeStyle='rgba(190,200,210,.45)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(-40+i*90,-150+Math.sin(time+i)*6,28+i*4,0,TAU);ctx.stroke();}},
    chapel(t){staged(t,{sky:[[0,'#1a100c'],[.6,'#3a2418'],[1,'#140e0c']],wall:'#2a1c16',floor:'#3a2a20',glow:'#ffb060',keeper:true,mote:'#ffd7a8'});},
    cistern(t){staged(t,{sky:[[0,'#06110c'],[.6,'#123024'],[1,'#07140e']],wall:'#102018',floor:'#163028',glow:'#9be36a',water:'rgba(170,240,140,.7)',mote:'#dff8c8',flame:['#2f6a32','#9be36a','#f4ffe8'],dip:150});},
    nest(t){staged(t,{sky:[[0,'#07140c'],[1,'#102418']],wall:'#143022',floor:'#1c3828',glow:'#b6f08a',water:'rgba(180,255,150,.55)',mote:'#eaffc8',flame:['#3f7a32','#c8f08a','#f4ffe4']});},
    wall(t){staged(t,{sky:[[0,'#2a1840'],[.35,'#c86858'],[.7,'#ffc48a'],[1,'#ffd9a0']],wall:'#3a2844',floor:'#4a3848',glow:'#ffb070',mote:'#ffe0c0',face:-1});},
    crypt(t){staged(t,{sky:[[0,'#100818'],[.6,'#241430'],[1,'#0c0812']],wall:'#1c1424',floor:'#2a2030',glow:'#d8b3ff',mote:'#f0e0ff',flame:['#5a3a78','#d8b3ff','#f8f0ff']});},
    gate(t){staged(t,{sky:[[0,'#241428'],[.4,'#a85048'],[1,'#ffd0a0']],wall:'#342430',floor:'#403038',glow:'#ffc080',mote:'#ffe4c4'});},
    banner(t){staged(t,{sky:[[0,'#1a1028'],[.5,'#4a2858'],[1,'#120c18']],wall:'#241830',floor:'#2c2038',glow:'#e0c0ff',mote:'#f4e8ff',flame:['#6a4078','#e0c0ff','#fff8ff']});},
    beast(t){staged(t,{sky:[[0,'#101820'],[.6,'#243848'],[1,'#101820']],wall:'#182430',floor:'#243440',glow:'#e2ad6b',keeper:true,mote:'#f0d8b0',flame:['#8a5a28','#e2ad6b','#fff0d0']});},
    spire(t){staged(t,{sky:[[0,'#140c0a'],[.55,'#3a2018'],[1,'#120c0a']],wall:'#2a1814',floor:'#3a241c',glow:'#ffb060',warden:true,mote:'#ffd8b0'});towerSil(0,-280,.8,'#1a100e',.6);}};
  function ledge(a){const r=rng(a.x+17),b=a.y+a.h;patRect(stonePat(),a.x,a.y+6,a.w,a.h-6,0);
    box(a.x,a.y,a.w,3,T.ledge[0]);box(a.x,a.y+3,a.w,3,T.ledge[1]);box(a.x,b-3,a.w,3,'#141d25');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(a.x,a.y,a.w,a.h);
    const cap=Math.min(16,a.w/4);box(a.x+2,a.y,cap,2,'rgba(250,244,212,.46)');box(a.x+a.w-cap-2,a.y,cap,2,'rgba(250,244,212,.46)');
    poly([a.x+4,b,a.x+20,b,a.x+12,b+11],'#22303b',OL,1);poly([a.x+a.w-20,b,a.x+a.w-4,b,a.x+a.w-12,b+11],'#22303b',OL,1);
    const n=Math.floor(a.w/24);for(let i=0;i<n;i++){const x=a.x+8+r()*(a.w-16),v=r(),q=r();
      if(v<.42){const len=8+q*28,sw=Math.sin(time*1.3+x*.05)*2;ctx.strokeStyle=q<.5?T.moss[0]:T.moss[1];ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x,b);ctx.quadraticCurveTo(x+sw*.5,b+len*.6,x+sw,b+len);ctx.stroke();if(q>.6)circle(x+sw,b+len,1.6,T.moss[1]);}
      else if(v<.78){circle(x,a.y+.5,2.4+q*2,T.moss[0]);circle(x+3,a.y-.5,1.8+q,T.moss[1]);}
      else if(v<.85){box(x-1.5,a.y-7,3,7,'#d9cfb5');flame(x,a.y-7,.35,x);addLight(x-cam,a.y-10,42,'#ffcf86',.35);}}}
  function spikes(s){const x=s[0],n=s[1],warn=!!s.warn,wob=warn?Math.sin(time*42)*2.4:0,c0=warn?'#ffb35c':T.spikeC[0],c1=warn?'#ff6a3a':T.spikeC[1];box(x-2+wob,FLOOR-3,n*20,3,warn?'#6a3a22':'#3a4148');if(warn){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.5;circle(x+n*10,FLOOR-12,24+Math.sin(time*30)*5,'#ffb35c');ctx.restore();text('！',x+n*10,FLOOR-36-Math.abs(Math.sin(time*20))*6,16,'#ffd2a0','center',true);}for(let k=0;k<n;k++){const sx=x+k*20+wob;poly([sx,FLOOR-2,sx+8,FLOOR-20,sx+16,FLOOR-2],c0,OL,1.2);poly([sx+8,FLOOR-20,sx+16,FLOOR-2,sx+10,FLOOR-2],c1);poly([sx+6.5,FLOOR-15,sx+8,FLOOR-20,sx+9.5,FLOOR-15],'#8a4a3a');}}
  function chest(c){const x=c.x,y=c.y;if(!c.open)addLight(x-cam,y-14,64,'#ffd38a',.32+Math.sin(time*3)*.08);
    box(x-19,y-24,38,24,'#6a4a2f');box(x-19,y-24,38,4,'#7f5a39');for(let k=-12;k<=12;k+=8)box(x+k,y-20,1.5,18,'#5a3d27');box(x-19,y-14,38,3,'#4a4f55');box(x-15,y-24,3,24,'#4a4f55');box(x+12,y-24,3,24,'#4a4f55');ctx.strokeStyle=OL;ctx.lineWidth=1.5;ctx.strokeRect(x-19,y-24,38,24);
    // 开箱动画：先抖两下，再掀开盖子，金光从缝里射出来
    if(c.open){const k=c.openT==null?1:c.openT,ease=k<.3?0:1-Math.pow(1-(k-.3)/.7,3),ang=-1.15*ease+(k<.3?Math.sin(time*70)*.06*(k/.3):0);
      if(k<1){const a=clamp((k-.25)/.3,0,1);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a*.5;ctx.fillStyle='#ffd88a';for(let i=0;i<5;i++){const t=-Math.PI/2+(i-2)*.33+Math.sin(time*3+i)*.05,len=50+100*a;ctx.beginPath();ctx.moveTo(x-7,y-25);ctx.lineTo(x+7,y-25);ctx.lineTo(x+Math.cos(t+.07)*len,y-25+Math.sin(t+.07)*len);ctx.lineTo(x+Math.cos(t-.07)*len,y-25+Math.sin(t-.07)*len);ctx.closePath();ctx.fill();}ctx.restore();addLight(x-cam,y-40,40+120*a,'#ffd38a',.2+.6*a);}
      ctx.save();ctx.translate(x-19,y-24);ctx.rotate(ang);box(0,-9,38,9,'#7f5a39');box(0,-6,38,2,'#4a4f55');ctx.strokeStyle=OL;ctx.strokeRect(0,-9,38,9);ctx.restore();box(x-16,y-27,32,3,k<1?'rgba(255,236,180,.8)':'rgba(255,226,160,.25)');}
    else{poly([x-21,y-24,x+21,y-24,x+19,y-34,x-19,y-34],'#86603c',OL,1.5);box(x-21,y-27,42,3,'#4a4f55');box(x-3,y-27,6,8,'#e2bd6e');box(x-1,y-24,2,3,'#3a2a1a');for(let i=0;i<2;i++){const a=time*1.6+i*3.1;circle(x+Math.cos(a)*16,y-30+Math.sin(a*1.3)*8,1.2,'#ffe6a6');}}}
  function brazier(at,lit){const x=at==null?(L.checkpoint||CHECKPOINT):at,y=FLOOR,on=lit!=null?lit:!!checkpoint;box(x-12,y-26,24,26,'#3d454c');box(x-12,y-26,4,26,'#2d343a');box(x-16,y-6,32,6,'#4a535a');poly([x-22,y-32,x+22,y-32,x+16,y-24,x-16,y-24],'#a7803f',OL,1.5);box(x-23,y-34,46,3,'#d7b064');
    if(on){flame(x-7,y-33,1.3,1.3);flame(x+7,y-33,1.15,2.1);flame(x,y-33,1.8,.4);addLight(x-cam,y-48,170,'#ffa040',.62+Math.sin(time*11)*.05);}
    else{circle(x-5,y-34,2,'#7a3a22');circle(x+3,y-34,1.6,'#9a4a2a');addLight(x-cam,y-36,44,'#c0603a',.18);if(p&&Math.abs(p.x-x)<260)text('钟火',x,y-50,13,'#cfd9da','center',true);}}
  // Boss 场地后方吊着的沉钟：典狱长进入二阶段时会被敲响（摇晃 + 裂纹发光）
  function greatBell(){const x=L.bell||3990,top=Math.min(38,viewY),len=150-top,sw=Math.sin(time*.6)*.03+Math.sin(time*7)*.09*bellRing;ctx.save();ctx.translate(x,top);ctx.rotate(sw);
    chain(-26,0,len+4,'#2c343b');chain(26,0,len+4,'#2c343b');ctx.translate(0,len);box(-40,-6,80,10,'#3a2f25');box(-40,-6,80,3,'#5a4632');
    ctx.fillStyle=vgrad('bell',0,150,[[0,'#6e5130'],[.6,'#4a341f'],[1,'#2e2015']]);ctx.beginPath();ctx.moveTo(-18,4);ctx.quadraticCurveTo(-30,8,-34,40);ctx.quadraticCurveTo(-38,100,-62,138);ctx.lineTo(62,138);ctx.quadraticCurveTo(38,100,34,40);ctx.quadraticCurveTo(30,8,18,4);ctx.closePath();ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=2.5;ctx.stroke();
    box(-36,52,72,6,'#5d4528');box(-64,134,128,10,'#5d4528');box(-64,134,128,3,'#8a6a3e');
    ctx.fillStyle='rgba(255,210,150,.12)';ctx.beginPath();ctx.moveTo(14,10);ctx.quadraticCurveTo(26,40,30,100);ctx.lineTo(40,132);ctx.lineTo(24,132);ctx.quadraticCurveTo(20,80,8,12);ctx.closePath();ctx.fill();
    ctx.strokeStyle=bellRing>0?'rgba(255,140,70,'+(.35+bellRing*.4).toFixed(2)+')':'#1d140c';ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(-12,60);ctx.lineTo(-20,84);ctx.lineTo(-12,104);ctx.lineTo(-24,130);ctx.moveTo(16,70);ctx.lineTo(22,96);ctx.lineTo(15,118);ctx.stroke();
    circle(Math.sin(time*7)*8*bellRing,146,7,'#2a1d12',OL,1.5);ctx.restore();addLight(x-cam,top+len+80,190,'#ff8a40',.12+bellRing*.35);}
  // ---- 前景剪影、飘尘、雾、暗角 ----
  function drawFore(){if(lowFx)return;const off=cam*1.35;ctx.fillStyle='rgba(4,7,10,.48)';ctx.strokeStyle='rgba(4,7,10,.56)';
    for(const o of decor.fore){const x=o.x-off;if(x<-120||x>W+120)continue;
      if(o.k==='chain'){ctx.lineWidth=5;for(let y=viewY-10;y<210+o.s*120;y+=14){ctx.beginPath();ctx.ellipse(x,y+7,4,7,0,0,TAU);ctx.stroke();}}
      else for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(x+i*9,viewY+H+10);ctx.quadraticCurveTo(x+i*9+6,FLOOR-20,x+i*9+(i%2?14:-6),FLOOR-60-(i*13)%40);ctx.lineTo(x+i*9+5,viewY+H+10);ctx.fill();}}}
  function drawMotes(z){const n=lowFx?14:36;if(motes.length!==n){motes=[];for(let i=0;i<n;i++)motes.push({x:Math.random()*W,y:viewY+Math.random()*H,vx:(Math.random()-.5)*8,vy:-3-Math.random()*8,s:.6+Math.random()*1.3,f:.4+Math.random()*.8,ph:Math.random()*TAU,warm:Math.random()<.3});}
    const dt=clamp(time-motesT,0,.05),dc=cam-motesCam;motesT=time;motesCam=cam;
    for(const m of motes){m.x+=m.vx*dt-dc*m.f;m.y+=(m.vy-(m.warm?z*22:0))*dt;if(m.x<-10)m.x+=W+20;if(m.x>W+10)m.x-=W+20;if(m.y<viewY-10)m.y=viewY+H+5;if(m.y>viewY+H+10)m.y=viewY-5;
      ctx.globalAlpha=.25+.25*Math.sin(time*2+m.ph);ctx.fillStyle=m.warm?'#ffc98a':'#cfe4ea';ctx.fillRect(m.x,m.y,m.s,m.s);}ctx.globalAlpha=1;}
  function drawFog(){if(lowFx)return;ctx.fillStyle=vgrad('fog'+L.theme,FLOOR-120,FLOOR+30,[[0,'rgba('+T.fog+',0)'],[.65,'rgba('+T.fog+',.13)'],[1,'rgba('+T.fog+',0)']]);ctx.globalAlpha=.75+.25*Math.sin(time*.6);ctx.fillRect(-10,FLOOR-120,W+20,150);ctx.globalAlpha=1;}
  function drawVignette(z){const k=Math.round(W)+'x'+Math.round(H);if(k!==vigKey){vigKey=k;const R=Math.max(W,H);vig=ctx.createRadialGradient(W/2,H*.48,R*.28,W/2,H*.48,R*.78);vig.addColorStop(0,'rgba(0,0,0,0)');vig.addColorStop(1,'rgba(2,4,8,.32)');}
    ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);if(z>0){ctx.fillStyle='rgba('+(BOSSES[L.bossKind]?BOSSES[L.bossKind].tint:'60,40,20')+','+(z*.18).toFixed(3)+')';ctx.fillRect(0,0,W,H);}}   // 首领房各有自己的氛围色

  // ---- 角色 ----
  // 刀光：以 (cx,cy) 为圆心、r1~r2 的扇环，从角度 a0 扫到 a1
  function smear(cx,cy,r1,r2,a0,a1,alpha,c){if(alpha<=0)return;const t0=Math.PI/2-a0,t1=Math.PI/2-a1,ccw=t1<t0;ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=c;ctx.beginPath();ctx.arc(cx,cy,r2,t0,t1,ccw);ctx.arc(cx,cy,r1,t1,t0,!ccw);ctx.closePath();ctx.fill();
    ctx.globalAlpha=Math.min(1,alpha*1.8);ctx.strokeStyle='#fffaf0';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(cx,cy,r2,t0+(t1-t0)*.55,t1,ccw);ctx.stroke();ctx.restore();}
  // 主角的刀光：画在挥刀判定椭圆里，外缘就是能砍到的边界。先在单位圆里画月牙，再缩放成椭圆
  function crescent(T,skew){const n=14;ctx.beginPath();for(let i=0;i<=n;i++){const s=-Math.PI/2+Math.PI*i/n;ctx.lineTo(Math.cos(s),Math.sin(s));}for(let i=n;i>=0;i--){const u=i/n,s=-Math.PI/2+Math.PI*u,r=1-T*Math.pow(Math.sin(Math.PI*u),.8)*(1+skew*(u-.5));ctx.lineTo(Math.cos(s)*r,Math.sin(s)*r);}ctx.closePath();ctx.fill();}
  function drawSlash(){if(!p||!(p.attack>0)||p.roll>0)return;if(p.char==='bow'&&p.slash!=='down')return;const C=CHARS[p.char]||CHARS.lamp,k=1-p.attack/C.swing;if(k<.18||k>.77)return;const A=slashArea(),bell=p.char==='bell',heavy=p.slash==='side'&&p.combo===0,th=p.slash==='up'?-Math.PI/2:p.slash==='down'?Math.PI/2:p.atkFace>0?0:Math.PI,skew=p.slash==='side'?(p.combo===2?-.6:.6):0,a=Math.min(1,(k-.18)/.13)*Math.min(1,(.77-k)/.39);
    ctx.save();ctx.translate(A.x,A.y);ctx.scale(A.rx,A.ry);ctx.rotate(th);if(th===Math.PI)ctx.scale(1,-1);
    ctx.globalAlpha=a*.55;ctx.fillStyle=p.skin?'#ffb35c':heavy||bell?'#ffd88a':'#dfeaff';crescent(heavy?.5:bell?.46:.42,skew);ctx.globalAlpha=a;ctx.fillStyle=p.skin?'#ffe2a8':heavy?'#fff1cf':bell?'#fff4dc':'#ffffff';crescent(heavy?.2:.16,skew);ctx.restore();}
  function boot(x,y,c){poly([x-3,y-4,x+3,y-4,x+6.5,y-1,x+6.5,y+.5,x-3.5,y+.5],c,OL,1.2);}
  // 小幽灵：圆头 + 三道波浪下摆，大黑眼睛，青色围巾；身体里那团暖光就是“余火”
  function ghostPath(t){ctx.beginPath();ctx.moveTo(-14,-12);ctx.lineTo(-14,-31);ctx.arc(0,-31,14,Math.PI,0,false);ctx.lineTo(14,-12);for(let i=0;i<3;i++){const x0=14-i*28/3,x1=x0-28/3,dip=5.5+Math.sin(t+i*1.9)*2.2;ctx.quadraticCurveTo((x0+x1)/2,-12+dip*2,x1,-12);}ctx.closePath();}
  function oval(x,y,rx,ry,c){ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();}
  function drawGhost(P,t,look){ghostPath(t);ctx.fillStyle=P.body;ctx.fill();ctx.save();ctx.clip();oval(-12,-24,8,26,P.shade);const sheen=ctx.createLinearGradient(-12,-45,12,-8);sheen.addColorStop(0,'rgba(255,255,255,.35)');sheen.addColorStop(.55,'rgba(255,255,255,0)');sheen.addColorStop(1,'rgba(72,135,137,.2)');ctx.fillStyle=sheen;ctx.fillRect(-18,-48,36,46);ctx.fillStyle=P.scarf;ctx.fillRect(-16,-22,32,5);ctx.fillStyle=P.scarfDark;ctx.fillRect(-16,-18,32,1.5);ctx.restore();ghostPath(t);ctx.strokeStyle=OL;ctx.lineWidth=2;ctx.stroke();
    const ey=-33+look,phase=time%4.7,blink=phase>4.48?Math.max(.12,Math.abs(phase-4.59)/.11):1;oval(2.4,ey,2.7,4*blink,P.eye);oval(9.2,ey,2.5,3.8*blink,P.eye);if(blink>.5){circle(3.3,ey-1.5,.85,'#ffffff');circle(10,ey-1.3,.7,'#ffffff');}}
  // 待战动画只参与绘制，不改变人物位置、攻击时序和碰撞。
  function ghostEmber(P,ready){const breath=.5+.5*Math.sin(time*2.8);ctx.save();ghostPath(time*6);ctx.clip();
    const glow=ctx.createRadialGradient(0,-15,0,0,-15,11);glow.addColorStop(0,'rgba(255,212,134,'+(.45+breath*.2)+')');glow.addColorStop(1,'rgba(255,171,75,0)');ctx.fillStyle=glow;ctx.fillRect(-12,-27,24,24);
    ctx.translate(0,-13);ctx.scale(.85+breath*.15,1+breath*.12);shape(()=>{ctx.moveTo(0,1);ctx.bezierCurveTo(-5,-1,-3,-5,0,-9);ctx.bezierCurveTo(-1,-5,5,-3,2,0);ctx.closePath();},'#ffd39a');oval(0,-2,1,2,'#fff5dc');ctx.restore();
    if(ready){ctx.save();ctx.globalAlpha*=.35;const q=(time*.35)%1;circle(-8+Math.sin(time*2)*2,-21-q*21,(1-q)*1.1,'#ffe2aa');ctx.restore();}}
  // 翻滚时蜷成一团：围巾斜裹在身上，下摆从背后露出来
  function ghostBall(P){circle(0,0,12,P.body,OL,2);ctx.save();ctx.beginPath();ctx.arc(0,0,11,0,TAU);ctx.clip();oval(-7,3,9,11,P.shade);ctx.rotate(.5);ctx.fillStyle=P.scarf;ctx.fillRect(-13,1,26,4.5);ctx.restore();
    oval(3,-4,1.9,2.8,P.eye);oval(7.6,-3.4,1.7,2.6,P.eye);for(let i=0;i<3;i++){const a=2.3+i*.55;circle(Math.cos(a)*12.3,Math.sin(a)*12.3,2.4,P.body);}}
  // 刀：a 是画布角度（向前为 0，向下为正）
  function nail(x,y,a,P,len){const dx=Math.cos(a),dy=Math.sin(a),nx=-dy,ny=dx,bx=x+dx*2.5,by=y+dy*2.5,tx=x+dx*len,ty=y+dy*len;line([x-dx*4,y-dy*4,x+dx*1.5,y+dy*1.5],2.4,P.hilt,OL);line([x+dx*1.5+nx*3.5,y+dy*1.5+ny*3.5,x+dx*1.5-nx*3.5,y+dy*1.5-ny*3.5],2,P.hilt,OL);
    poly([bx+nx*1.6,by+ny*1.6,tx+nx*1.1,ty+ny*1.1,tx+dx*2.6,ty+dy*2.6,tx-nx*1.1,ty-ny*1.1,bx-nx*1.6,by-ny*1.6],P.nail,OL,1.2);line([bx+nx*.5,by+ny*.5,tx+nx*.3,ty+ny*.3],.7,P.nailHi);}
  // Weapon and shoulders share one stroke. Contact falls on the existing active frames.
  function strokePose(ch,atk){
    if(ch==='bow'&&(p.charge>0||((p.bowRecoil||0)>0&&atk<0))){
      const up=p.slash==='up',draw=p.charge>0?clamp(p.charge/(p.chargeMax||.45),0,1):0;
      const release=p.charge>0?0:p.bowRecoil/.17;
      return {bow:true,a:up?-1.44:-.06,hx:up?7:15+draw*4,hy:up?-37:-24,
        pull:p.charge>0?3+draw*14:Math.sin(release*Math.PI*3)*release*2,
        reach:draw,release,lean:up?-.16:-.06-draw*.12+release*.14,
        x:draw*-2-release*2,y:draw,compress:.018*draw};
    }
    if(atk<0)return null;
    const bell=ch==='bell',kick=ch==='bow',reverse=p.combo===2,heavy=p.combo===0;
    // Bias the short anticipation and follow-through toward their extreme poses.
    const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v);};
    const wind=smooth(atk/.22)*(1-smooth((atk-.22)/.21));
    const hit=smooth((atk-.22)/.23)*(1-smooth((atk-.56)/.44));
    const up=p.slash==='up',down=p.slash==='down';
    const rest=up?-1.2:down?.7:-.74;
    const windAngle=up?.55:down?-1.95:bell?-2.35:reverse?1.7:heavy?-2.3:-1.55;
    const endAngle=up?-2.25:down?1.52:bell?(heavy?1.16:.65):reverse?-1.1:heavy?.92:.45;
    return {kick,a:rest+(windAngle-rest)*wind+(endAngle-rest)*hit,
      hx:11-(bell?12:6)*wind+(up?-4:down?-2:bell?5:12)*hit,
      hy:-20-(bell?11:5)*wind+(up?-16:down?13:reverse?-5:3)*hit,
      lean:-(bell?.4:.26)*wind+(down?.33:up?-.15:bell?.48:.31)*hit,
      x:-3*wind+(bell?5:7)*hit,y:(bell?5:2)*wind+(up?-3:1)*hit,
      compress:(bell?.12:.06)*wind-.04*hit,wind,hit};
  }
  function sleeve(sx,sy,hx,hy,bend,P,far){
    const ex=(sx+hx)*.5+bend,ey=(sy+hy)*.5+Math.abs(bend)*.75+2;
    const cloth=far?P.scarfDark:P.scarf;
    line([sx,sy,ex,ey,hx,hy],far?4.3:5.4,OL);
    line([sx,sy,ex,ey],far?3.4:4.3,cloth);
    line([ex,ey,hx,hy],far?2.7:3.3,far?P.shade:P.body);
    circle(ex,ey,far?1.8:2.2,cloth);
    circle(hx,hy,far?2.6:3.1,far?P.shade:P.body,OL,1);
  }
  function combatHands(ch,P,q){
    const x=q.hx,y=q.hy,a=q.a,dx=Math.cos(a),dy=Math.sin(a);
    if(q.bow){
      const back=3+(p.charge>0?q.pull:2+18*q.release);
      sleeve(-7,-22,x-back*dx,y-back*dy,-7,P,true);
      bowW(x,y,a,q.pull);
      sleeve(5,-23,x+6*dx,y+6*dy,1,P,false);
    }else if(q.kick){
      bowW(-8,-19,1.08,0);sleeve(-6,-23,-8,-19,-3,P,true);
      const foot=joint(3,-11,.2+q.wind-.3*q.hit,-.9+1.15*q.hit,9,10);
      line([3,-11,...foot],5,P.shade,OL);boot(foot[2],foot[3],P.scarfDark);
      sleeve(5,-23,9+q.wind*4,-21-q.hit*8,4,P,false);
    }else{
      const len=28+p.skills.reach*4;
      if(ch==='bell'){
        sleeve(-6,-22,x+8*dx,y+8*dy,-5,P,true);
        hammer(x,y,a,len-3);
      }else{
        sleeve(-7,-22,-11+q.wind*4-q.hit*5,-12-q.hit*6,-4,P,true);
        nail(x,y,a,P,len);
        if(p.damage>=44)line([x+dx*5,y+dy*5,x+dx*len,y+dy*len],1.5,p.damage>=64?'#ffc070':'#ffe2b0');
      }
      sleeve(6,-22,x,y,4,P,false);
    }
  }
  function drawScarf(P,bob,f){const c=p.cape;if(!c)return;const cx=p.x+p.w/2,cy=p.y+p.h,n=c.length,pts=[];for(let i=0;i<n;i++)pts.push((c[i].x-cx)*f,c[i].y-cy-bob);
    const L=[],R=[];for(let i=0;i<n;i++){const i0=Math.max(0,i-1),i1=Math.min(n-1,i+1),dx=pts[i1*2]-pts[i0*2],dy=pts[i1*2+1]-pts[i0*2+1],d=Math.hypot(dx,dy)||1,w=3.4-i*.38,nx=-dy/d*w,ny=dx/d*w;L.push(pts[i*2]+nx,pts[i*2+1]+ny);R.unshift(pts[i*2]-nx,pts[i*2+1]-ny);}
    poly(L.concat(R),P.scarf,OL,1.5);line(pts,1,P.scarfDark);}
  function heroPal(){if(p.hurtT>.18)return GH_HURT;if(p.char==='bell')return GH_BELL;if(p.char==='bow')return GH_BOW;return GH_CHAPTER[clamp((L.chapter||1)-1,0,3)];}
  // 钟锤：木柄 + 喇叭口的铜锤头（像一口小钟）；a 是画布角度（向前为 0）
  function hammer(x,y,a,len){const dx=Math.cos(a),dy=Math.sin(a),hx=x+dx*len,hy=y+dy*len;line([x-dx*4,y-dy*4,hx,hy],2.8,'#7a5634',OL);ctx.save();ctx.translate(hx,hy);ctx.rotate(a);shape(()=>{ctx.moveTo(-6,-8);ctx.lineTo(4,-12);ctx.quadraticCurveTo(10,0,4,12);ctx.lineTo(-6,8);ctx.closePath();},lg(0,-12,0,12,'#f0cf8a','#c49a52','#7a5422'),OL,1.4);line([-2,-9,-2,9],1,'rgba(90,60,20,.7)');circle(7,0,1.6,'#5a3a12');ctx.restore();}
  // 弓：a 是瞄准方向，pull 是弦往后拉了多少（拉着时搭着一支箭）
  function bowW(x,y,a,pull){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.lineCap='round';ctx.strokeStyle=OL;ctx.lineWidth=4.2;ctx.beginPath();ctx.moveTo(-3,-15);ctx.quadraticCurveTo(10,-9,7,0);ctx.quadraticCurveTo(10,9,-3,15);ctx.stroke();ctx.strokeStyle='#8c6b3f';ctx.lineWidth=2.4;ctx.stroke();
    line([-3,-15,-3-pull,0,-3,15],.9,'#ddd6c4');if(pull>2){line([-3-pull,0,17,0],1.3,'#c9b48a');poly([17,-2.4,22,0,17,2.4],'#dfe3e0',OL,1);}ctx.restore();}
  // 角色身上的小东西：钟锤学徒围巾结上的铜铃、弓手的兜帽；箭袋背在身后
  function heroGear(ch){if(ch==='bell'){line([-9,-19,-9,-15],1,'#6a4a22');shape(()=>{ctx.moveTo(-9,-15.5);ctx.bezierCurveTo(-13.5,-15.5,-13,-9.5,-14.5,-7.5);ctx.lineTo(-3.5,-7.5);ctx.bezierCurveTo(-5,-9.5,-4.5,-15.5,-9,-15.5);},'#e6c078',OL,1);circle(-9,-6.4,1.3,'#6a4a22');}
    else if(ch==='bow')shape(()=>{ctx.moveTo(-15,-29);ctx.quadraticCurveTo(-16,-47,0,-47.5);ctx.quadraticCurveTo(14,-47.5,15.5,-35);ctx.quadraticCurveTo(8,-41.5,0,-41.5);ctx.quadraticCurveTo(-10,-41.5,-11.5,-27);ctx.closePath();},'#4f7f40',OL,1.4);}
  function quiver(){ctx.save();ctx.translate(-12,-27);ctx.rotate(-.5);shape(()=>ctx.rect(-4,-12,8,22),'#6a4a2f',OL,1.4);[-2,1.6].forEach(x=>{line([x,-12,x,-18],1.2,'#c9b48a');poly([x-2,-18,x,-23,x+2,-18],'#e8e0cc');});ctx.restore();}
  function heroWeapon(ch,P,pose,air,move){if(pose){combatHands(ch,P,pose);return;}const ready=!air&&move<.08&&p.hurtT<=0&&p.dash<=0;let na=air?.7:move>.2?.75:.6,hx=11,hy=-17;if(ready){na=-.94+Math.sin(time*2.8+.4)*.055;hx=12+Math.sin(time*2.8)*.5;hy=-18+Math.sin(time*2.8+.4)*.65;}if(ch==='bow'){bowW(9,-13,1.05,0);circle(9,-13,3,P.body,OL,1.3);return;}
    const bl=28+p.skills.reach*4;if(ch==='bell')hammer(hx,hy,na,bl-3);
    else{nail(hx,hy,na,P,bl);if(p.damage>=44&&P===GH_CHAPTER[clamp((L.chapter||1)-1,0,3)]){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.3+.12*Math.sin(time*6);line([hx+Math.cos(na)*5,hy+Math.sin(na)*5,hx+Math.cos(na)*(bl+1),hy+Math.sin(na)*(bl+1)],2.6,p.damage>=64?'#ffc070':'#ffe2b0');ctx.restore();}}
    circle(hx,hy,3.3,P.body,OL,1.4);}
  function drawHero(){if(state==='dead'){if(deathT<.5){const k=deathT/.5;ctx.save();ctx.translate(deathX,deathY+26);ctx.scale(p.face*(1+k*.3),1+k*.3);ctx.globalAlpha=1-k;drawGhost(GH_TRAIL,0,0);ctx.strokeStyle='rgba(20,30,40,'+(.8*(1-k)).toFixed(2)+')';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-2,-46);ctx.lineTo(3,-34);ctx.lineTo(-4,-24);ctx.lineTo(2,-14);ctx.moveTo(3,-34);ctx.lineTo(11,-30);ctx.stroke();ctx.restore();addLight(deathX-cam,deathY,120*(1-k)+40,'#cfefff',.5*(1-k));}return;}const P=heroPal(),f=p.roll<=0&&(p.attack>0||p.charge>0||p.bowRecoil>0)?p.atkFace:p.face,cx=p.x+p.w/2,cy=p.y+p.h,D=dirs(),C=CHARS[p.char]||CHARS.lamp,ch=C.id;
    footShadow(cx,cy-1,p.roll>0?11:16);
    for(const t of p.trail){ctx.save();ctx.globalAlpha=t.life/.2*.32;ctx.translate(t.x,t.y);ctx.scale(t.f,1);ctx.rotate(t.a);ghostBall(GH_TRAIL);ctx.restore();}
    if(p.dtrail)for(const t of p.dtrail){ctx.save();ctx.globalAlpha=t.life/.24*.45;ctx.translate(t.x,t.y-5);ctx.scale(t.f,1);line([-52,-20,-26,-26,12,-28],3,'#abf9ed');line([-36,-12,-18,-16,2,-16],2,'#78bad6');drawGhost(GH_SHADE,time*6,0);ctx.restore();}
    ctx.save();ctx.translate(cx,cy);if(p.inv>0&&p.roll<=0&&p.dash<=0&&p.domeT<=0&&Math.floor(time*16)%2===0)ctx.globalAlpha=.22;
    if(p.roll>0){const k=1-Math.max(0,p.roll)/ROLL;ctx.translate(0,-13);ctx.scale(f,1);ctx.save();ctx.globalAlpha*=.45;ctx.strokeStyle='#e6f7ff';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(0,0,16.5,Math.PI*.55,Math.PI*1.3);ctx.stroke();ctx.restore();ctx.rotate(k*TAU);ghostBall(P);ctx.restore();addLight(cx-cam,cy-14,46,'#cfefff',.25);return;}
    ctx.scale(f,1);
    // 平时贴地飘着上下浮动；移动时往前倾，起跳拉长、下落和落地压扁
    const air=!p.ground,atk=p.attack>0?1-p.attack/C.swing:-1,bob=air?-3:Math.sin(time*3)*1.6-5,move=Math.min(1.2,Math.abs(p.vx)/245),dash=p.dash>0;
    const pose=dash?null:strokePose(ch,atk);ctx.translate(0,bob);drawScarf(dash?GH_SHADE:P,bob,f);
    const ready=!air&&move<.08&&!pose&&p.hurtT<=0&&!dash;
    let lean=move*.14+(ready?Math.sin(time*1.4)*.025:0),sx=1+(ready?Math.sin(time*2.8)*.012:0),sy=1-(ready?Math.sin(time*2.8)*.018:0);if(air){if(p.vy<0){sx=.94;sy=1.07;}else{sx=1.03;sy=.98;}}if(p.landT>0){const q=p.landT/.12;sx+=.12*q;sy-=.12*q;}
    if(pose){lean=pose.lean;sx+=pose.compress;sy-=pose.compress;}if(p.hurtT>0)lean=-.3;if(dash){lean=.4;sx=1.22;sy=.86;}
    ctx.save();ctx.translate(pose?pose.x:0,-26+(pose?pose.y:0));ctx.rotate(lean);ctx.scale(sx,sy);ctx.translate(0,26);
    if(ch==='bow')quiver();drawGhost(dash?GH_SHADE:P,time*6+p.walk*1.2,D.u?-1.6:D.d?1.4:0);heroGear(ch);if((L.chapter||1)>1){circle(-8,-20,2.2,'#e3bb75',OL,1);if(L.chapter>2)poly([-10,-17,-7,-17,-6,-10,-10,-12],L.chapter>3?'#c898bc':'#a9d7cc',OL,1);}
    if(!dash&&p.hurtT<=.18)ghostEmber(P,ready);if(ready)oval(-10,-18+Math.sin(time*2.8)*.6,3.1,3.6,P.body);heroWeapon(ch,dash?GH_SHADE:P,pose,air,move);
    ctx.restore();ctx.restore();
    addLight(cx-cam+f*2,cy-28+bob,60,'#ffb062',.26);addLight(cx-cam,cy-26+bob,36,'#cfefff',.16);
    if(p.ringT>0)drawRing();if(p.domeT>0)drawDome();}
  // 魂灯环：三团魂火绕着转，快结束时闪烁
  function drawRing(){const k=p.ringT<.8&&Math.floor(time*12)%2?.4:1;for(let i=0;i<3;i++){const a=time*5+i*TAU/3,ox=p.x+p.w/2+Math.cos(a)*48,oy=p.y+p.h/2-4+Math.sin(a)*38;ctx.save();ctx.globalAlpha=k;ctx.beginPath();ctx.ellipse(p.x+p.w/2,p.y+p.h/2-4,48,38,0,a-.85,a);ctx.strokeStyle='#72cabc';ctx.lineWidth=2;ctx.stroke();fl(ox,oy+8,.72,['#2fa39b','#7fe6d4','#effff9']);ctx.restore();addLight(ox-cam,oy,46,'#76f1d1',.4*k);}}
  // 钟罩：半透明的铜钟罩住主角，边缘一道亮光
  function drawDome(){const cx=p.x+p.w/2,by=p.y+p.h+2,k=Math.min(1,p.domeT/.5);ctx.save();ctx.translate(cx,by);ctx.globalAlpha=.3*k+.05*Math.sin(time*9);ctx.fillStyle=lg(-34,0,34,0,'#ffe6a8','#d8a858','#8a5a22');ctx.beginPath();ctx.moveTo(0,-76);ctx.bezierCurveTo(-24,-76,-27,-42,-29,-15);ctx.quadraticCurveTo(-38,-5,-40,2);ctx.lineTo(40,2);ctx.quadraticCurveTo(38,-5,29,-15);ctx.bezierCurveTo(27,-42,24,-76,0,-76);ctx.closePath();ctx.fill();
    ctx.globalAlpha=.85*k;ctx.strokeStyle='#fff1c2';ctx.lineWidth=2;ctx.stroke();ctx.globalAlpha=.6*k;circle(0,-80,4,null,'#e6c078',2);ctx.restore();addLight(cx-cam,by-36,82,'#ffd27a',.35*k);}
  // 角色头像（选角色、结算解锁用）：同一套画法，静止姿势；没解锁的画成剪影
  const CPORT={};
  function heroFigure(ch){const P=ch==='bell'?GH_BELL:ch==='bow'?GH_BOW:GH;shape(()=>{ctx.moveTo(-10,-22);ctx.quadraticCurveTo(-24,-20,-30,-8);ctx.quadraticCurveTo(-22,-14,-12,-15);ctx.closePath();},P.scarf,OL,1.4);if(ch==='bow')quiver();drawGhost(P,1.3,0);heroGear(ch);
    if(ch==='bow')bowW(10,-14,1.05,0);else if(ch==='bell')hammer(11,-17,-1.1,24);else nail(11,-17,-1.2,P,28);circle(11,ch==='bow'?-14:-17,3.2,P.body,OL,1.3);}
  function charPortrait(id,dark){const k=id+(dark?'#':'');if(CPORT[k]!=null)return CPORT[k];let u='';const keep=ctx;
    try{const c=document.createElement('canvas');c.width=c.height=160;ctx=c.getContext('2d');ctx.translate(80,138);ctx.scale(2.35,2.35);ctx.lineCap='round';ctx.lineJoin='round';heroFigure(id);
      if(dark){ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-in';ctx.fillStyle='#1c232c';ctx.fillRect(0,0,160,160);ctx.globalCompositeOperation='source-over';}u=c.toDataURL();}catch(e){u='';}ctx=keep;CPORT[k]=u;return u;}
  // 被锁住的魂火仍是小幽灵的同类；区域身份由容器、制服和遗物表达。
  const SOUL_FOE={prison:{cloth:'#344b5b',dark:'#182733',metal:'#a2b5bb',fire:'#9be5df'},sewers:{cloth:'#40594c',dark:'#1c3432',metal:'#91ad8a',fire:'#c0ed9b'},ramparts:{cloth:'#8b4854',dark:'#382536',metal:'#c9b998',fire:'#ffdb9d'},ossuary:{cloth:'#665274',dark:'#2e263c',metal:'#c7bccd',fire:'#dec0ff'},tower:{cloth:'#796044',dark:'#342b29',metal:'#d8b87a',fire:'#ffcf80'}};
  function foeStyle(e){return SOUL_FOE[e.biome||L.theme]||SOUL_FOE.prison;}
  function captiveFace(x,y,S,flash){ctx.save();ctx.translate(x,y);shape(()=>{ctx.moveTo(-5,5);ctx.quadraticCurveTo(-8,-6,0,-7);ctx.quadraticCurveTo(8,-6,6,4);ctx.lineTo(3,3);ctx.lineTo(1,6);ctx.lineTo(-2,3);ctx.closePath();},flash?'#fff':S.fire,OL,1);oval(0,-1,1,2,'#14262c');oval(3.6,-1,1,2,'#14262c');ctx.restore();}
  function soulCage(x,y,S,flash){ctx.save();ctx.translate(x,y);shape(()=>{ctx.moveTo(-6,6);ctx.lineTo(-6,-5);ctx.quadraticCurveTo(0,-10,6,-5);ctx.lineTo(6,6);ctx.closePath();},flash?'#fff':S.dark,OL,1.3);captiveFace(0,0,S,flash);line([-6,6,6,6],2,S.metal);line([-3,-6,-3,5],1,S.metal);line([3,-6,3,5],1,S.metal);circle(0,-10,2,null,S.metal,1);ctx.restore();}
  function drawStoryGuard(e,P,w,sw,theme){const k=theme||e.biome||L.theme,S=SOUL_FOE[k]||SOUL_FOE.prison,flash=e.flash>0,ice=e.frozen>0,C=flash?'#fff':ice?'#a8dfff':S.cloth,D=flash?'#fff':ice?'#658da6':S.dark,M=flash?'#fff':ice?'#d5f5ff':S.metal,t=time*2+(e.seed||0),walk=Math.sin(e.walk||0),strike=sw>=0?Math.sin(Math.min(1,sw*2)*Math.PI):0;
    ctx.save();ctx.translate(0,Math.sin(t)*.7);ctx.rotate(-w*.16+strike*.12);
    if(k==='ramparts'){line([-7,-35,-12,-55],1.6,M);poly([-12,-54,-27,-50,-22,-43,-29,-37,-10,-42],C,OL,1.2);line([-22,-49,-15,-46],.7,M);}
    if(k==='sewers'){shape(()=>{ctx.moveTo(-12,-35);ctx.quadraticCurveTo(-22,-18,-13,-7);ctx.lineTo(-7,-30);ctx.closePath();},D,OL,1.5);for(let i=0;i<3;i++)line([-15+i*3,-29,-18+i*3+Math.sin(t+i)*2,-13+i*2],1.2,C);}
    line([-4,-14,-6+walk*3,-5,-7+walk*3,0],3.7,D,OL);line([4,-14,5-walk*3,-5,7-walk*3,0],4,C,OL);boot(-7+walk*3,0,M);boot(7-walk*3,0,M);
    shape(()=>{ctx.moveTo(-9,-36);ctx.quadraticCurveTo(-14,-24,-13,-9);ctx.lineTo(-6,-12);ctx.lineTo(-2,-7);ctx.lineTo(3,-11);ctx.lineTo(10,-8);ctx.quadraticCurveTo(12,-25,8,-36);ctx.closePath();},lg(-13,0,12,0,D,C,D),OL,1.8);
    line([-9,-30,-5,-13],1,M);line([8,-30,5,-13],1,M);soulCage(0,-24,S,flash);
    if(k==='prison'||k==='furnace'){shape(()=>{ctx.moveTo(-8,-37);ctx.lineTo(-9,-48);ctx.quadraticCurveTo(0,-56,9,-48);ctx.lineTo(9,-37);ctx.closePath();},D,OL,1.5);captiveFace(0,-43,S,flash);for(let i=-5;i<=5;i+=5)line([i,-50,i,-37],1.4,M);line([-10,-37,10,-37],2,M);line([-12,-28,-16,-17,-12,-13],1.5,M);circle(-12,-11,2,null,M,1.2);}
    else if(k==='sewers'){shape(()=>{ctx.moveTo(-9,-37);ctx.quadraticCurveTo(-12,-53,0,-54);ctx.quadraticCurveTo(12,-53,10,-37);ctx.closePath();},M,OL,1.7);oval(2,-44,6,5,D);captiveFace(2,-43,S,flash);line([-8,-37,10,-37],2,M);for(let i=0;i<3;i++)line([-8+i*6,-50,-10+i*6,-55-i%2*3],1,C);}
    else if(k==='ramparts'){poly([-9,-40,-8,-49,0,-53,9,-48,10,-40],M,OL,1.6);poly([-7,-41,0,-47,7,-41,5,-34,-3,-33],D,OL,1.2);captiveFace(1,-40,S,flash);poly([-7,-49,-14,-55,-17,-54,-13,-46],C,OL,1);}
    else if(k==='ossuary'){shape(()=>{ctx.moveTo(-12,-33);ctx.quadraticCurveTo(-11,-49,0,-56);ctx.quadraticCurveTo(12,-48,12,-33);ctx.lineTo(5,-36);ctx.lineTo(-5,-36);ctx.closePath();},C,OL,1.8);captiveFace(1,-42,S,flash);for(let i=0;i<5;i++)circle(-8+i*4,-33+Math.sin(i*Math.PI/4)*5,1.6,M,OL,.5);poly([-3,-18,3,-18,2,-7,-2,-5],M,OL,.7);}
    else{shape(()=>{ctx.moveTo(-8,-48);ctx.quadraticCurveTo(0,-54,8,-48);ctx.lineTo(10,-37);ctx.lineTo(-10,-37);ctx.closePath();},lg(-10,0,10,0,D,M,D),OL,1.6);line([-10,-37,10,-37],2,M);captiveFace(1,-43,S,flash);circle(-9,-31,4,D,M,1.3);for(let i=0;i<6;i++){const a=t+i*TAU/6;line([-9+Math.cos(a)*3,-31+Math.sin(a)*3,-9+Math.cos(a)*5,-31+Math.sin(a)*5],1.4,M);}line([0,-54,0,-50],2,M);}
    if(e.elite){poly([-10,-35,-20,-19,-16,-8,-8,-16],C,OL,1.3);line([-9,-51,-12,-60,-5,-54],1.7,M);line([7,-51,11,-60,11,-52],1.7,M);}
    const a=sw>=0?-2.2+Math.min(1,sw*2)*3.4:-.1-w*2.1,hx=6+Math.cos(a)*11,hy=-29+Math.sin(a)*11;line([5,-31,hx,hy],4,C,OL);circle(hx,hy,2.4,M,OL,1);
    ctx.save();ctx.translate(hx,hy);ctx.rotate(a);line([-4,0,19,0],2.3,M,OL);
    if(k==='sewers'){shape(()=>{ctx.moveTo(13,-2);ctx.quadraticCurveTo(27,-9,24,5);ctx.lineTo(19,8);ctx.lineTo(20,2);ctx.lineTo(13,2);ctx.closePath();},M,OL,1.3);}
    else if(k==='tower'){shape(()=>ctx.rect(12,-7,10,14),M,OL,1.5);line([15,-5,15,5],1,D);}
    else{poly([9,-2,22,-7,25,-2,19,4,9,2],M,OL,1.3);line([12,-2,22,-5],.8,'#eff7ed');}glint(23,-3,w);ctx.restore();if(sw>=0&&sw<.7)smear(6,-29,14,35,-2.2,a,.35*(1-sw),S.fire);ctx.restore();}
  function drawGuard(e,P,w,sw){drawStoryGuard(e,P,w,sw,'prison');}
  function drawLegacyGuard(e,P,w,sw){const ph=e.walk,s=Math.sin(ph),c=Math.cos(ph),bob=Math.sin(time*3+e.seed)*.6,hip=-21+bob;
    const L=joint(-3,hip,s*.45,-.1-Math.max(0,c)*.7,10,11),R=joint(3,hip,-s*.45,-.1-Math.max(0,-c)*.7,10,11);ctx.translate(0,-Math.max(L[3],R[3]));
    line([-3,hip,L[0],L[1],L[2],L[3]],5,P.pantsDark,OL);boot(L[2],L[3],P.boot);line([3,hip,R[0],R[1],R[2],R[3]],5.6,P.pants,OL);boot(R[2],R[3],P.boot);
    let wa=3.5,lean=0;if(sw>=0){const k=Math.min(1,(1-Math.pow(1-sw,2))*1.5);wa=3.95+(1.2-3.95)*k;lean=.2;}else if(w>0){wa=3.5+.9*w;lean=-.22*w;}   // 蓄力：刀往后收、身子后仰
    ctx.save();ctx.translate(0,hip+2*w);ctx.rotate(lean);
    const sx=2,sy=-15,dx=Math.sin(wa),dy=Math.cos(wa),g1x=sx+dx*5,g1y=sy+dy*5,g2x=sx+dx*11,g2y=sy+dy*11;
    line([-4,-15,(g1x-4)/2,(g1y-15)/2+3,g1x,g1y],3.4,P.armorDark,OL);
    if(e.elite){const cs=Math.sin(time*2+e.seed)*2;poly([-8,-17,4,-17,-2+cs,8,-8+cs,4,-14+cs,10],P.cape||'#3a2c14',OL,1.6);line([-8,-17,4,-17],1.4,P.trim||'#e0bd73');}   // 精英的金边短斗篷
    poly([-8,2,8,2,9.5,-17,-9.5,-17],P.armorDark,OL,2);poly([-7,0,7,0,8.5,-16,-8.5,-16],P.armor);box(-5.5,-14.5,4,6,P.armorHi);
    poly([-6.5,0,6.5,0,6,13,2,10,-1,13,-6,11],P.tabard,OL,1.4);box(-8,-1.5,16,3,P.belt);poly([-2,-5,2,-5,1.6,-9,0,-10.5,-1.6,-9],P.tabardDark);
    const hy=-24;if(e.elite){shape(()=>{ctx.moveTo(-5,hy-6);ctx.quadraticCurveTo(-12,hy-12,-11,hy-20);ctx.quadraticCurveTo(-8,hy-12,-2,hy-8);ctx.closePath();},P.trim||'#e0bd73',OL,1.2);shape(()=>{ctx.moveTo(4,hy-7);ctx.quadraticCurveTo(10,hy-13,8,hy-21);ctx.quadraticCurveTo(7,hy-13,1,hy-8);ctx.closePath();},P.trim||'#e0bd73',OL,1.2);}
    poly([-6.5,hy+6,6.5,hy+6,7,hy-5,3,hy-9,-3,hy-9,-7,hy-5],P.helm,OL,2);box(-6.5,hy+3.5,13,2.5,P.armorDark);box(.2,hy-6,2,10,P.visor);box(-5,hy-1.5,11,2.2,P.visor);circle(4,hy-.4,1.2,P.eye);
    ctx.beginPath();ctx.ellipse(-6,-15,5.5,4,-.2,Math.PI,0);ctx.fillStyle=P.armorHi;ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=1.5;ctx.stroke();
    const tx=sx+dx*31,ty=sy+dy*31,nx=-dy,ny=dx;line([sx-dx*5,sy-dy*5,tx,ty],2.6,P.haft,OL);
    poly([tx-dx*13+nx*.5,ty-dy*13+ny*.5,tx+nx*.5,ty+ny*.5,tx+dx*3+nx*10,ty+dy*3+ny*10,tx-dx*15+nx*8.5,ty-dy*15+ny*8.5],P.blade,OL,1.4);line([tx-dx*12+nx*7.5,ty-dy*12+ny*7.5,tx+dx*2+nx*9,ty+dy*2+ny*9],.9,P.bladeHi);
    if(sw>=0&&sw<.8)smear(sx,sy,16,44,3.95,wa,(1-sw)*.5,'#ffe0b0');
    line([5,-15,(g2x+5)/2,(g2y-15)/2+3,g2x,g2y],3.8,P.armor,OL);circle(g1x,g1y,2.1,P.glove);circle(g2x,g2y,2.2,P.glove);
    ctx.beginPath();ctx.ellipse(6,-15,6,4.5,.2,Math.PI,0);ctx.fillStyle=P.armorHi;ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=1.5;ctx.stroke();glint(tx+dx*3+nx*10,ty+dy*3+ny*10,w);ctx.restore();}
  // 出手前刃口 / 箭头上一闪：白色、一闪即逝，是唯一的出手提示
  function glint(x,y,w){if(!(w>0&&w<.5))return;const k=Math.sin(w/.5*Math.PI);ctx.save();ctx.globalCompositeOperation='lighter';sparkle2(x,y,3+6*k,'rgba(255,248,225,'+(.9*k).toFixed(2)+')');ctx.restore();}
  function drawArcher(e,P,w,sw){ctx.rotate(Math.sin(time*2+e.seed)*.035);
    line([-2,-18,-3,-9,-3.5,0],2.6,P.legs,OL);line([2,-18,3,-9,4,0],2.6,P.legs,OL);
    poly([-7,-34,6,-34,9,-12,6,-8,4,-11,1,-7,-2,-11,-5,-7,-8,-11],P.cloak,OL,1.8);poly([-7,-34,-2,-34,-3,-10,-5,-7,-8,-11],P.cloakDark);
    const hy=-38;ctx.beginPath();ctx.moveTo(-6,hy+5);ctx.quadraticCurveTo(-7,hy-7,1,hy-9);ctx.quadraticCurveTo(8,hy-7,7,hy+3);ctx.lineTo(4,hy+6);ctx.closePath();ctx.fillStyle=P.hood;ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=1.8;ctx.stroke();
    ctx.fillStyle=P.skull;ctx.beginPath();ctx.ellipse(3.2,hy,3.5,4.3,0,0,TAU);ctx.fill();circle(4.6,hy-.6,1.2,P.socket);circle(2,hy-.6,1,P.socket);circle(4.6,hy-.6,.5,P.eye);box(1.6,hy+2.4,3.8,.9,P.socket);
    captiveFace(3,-38,foeStyle(e),e.flash>0);line([-5,-45,-7,-49,-10,-45],1.3,P.bow);soulCage(-5,-20,foeStyle(e),e.flash>0);
    const bx=10,by=-27,pull=sw>=0?-Math.sin(sw*22)*(1-sw)*2:-w*9,sx=bx+1+pull;
    line([1,-31,bx+7,by],2.3,P.cloakDark,OL);
    ctx.strokeStyle=OL;ctx.lineWidth=4.4;ctx.beginPath();ctx.arc(bx-6,by,14,-1.05,1.05);ctx.stroke();ctx.strokeStyle=P.bow;ctx.lineWidth=2.4;ctx.stroke();
    line([bx+1,by-12.1,sx,by,bx+1,by+12.1],.8,P.string);
    if(w>.08&&sw<0){line([sx,by,sx+20,by],1.2,P.arrow);poly([sx+20,by-2.2,sx+24.5,by,sx+20,by+2.2],'#dfe3e0');glint(sx+24.5,by,w);}
    line([-1,-30,sx,by],2.3,P.cloak,OL);}
  // 各区域的守卫各有独立的造型：腐水爬行者、城墙哨兵、墓窟骸兽、钟楼机械守卫。蓄力时都有明显的起手（后仰、举起兵器、人立），出手时往前扑
  function drawBiomeGuard(e,P,w,sw){const t=time+e.seed,bob=Math.sin(t*3)*1.2,step=Math.sin(e.walk),atk=sw>=0?Math.sin(Math.min(1,sw*1.6)*Math.PI/2):0,k=L.theme;ctx.save();ctx.translate(0,bob);
    if(k==='sewers'){   // 腐水爬行者：佝偻着爬行，背上长满水藻，钩爪高高扬起再扑下
      ctx.rotate(-.34*w+.2*atk);line([-10,-8,-14+step*4,-2,-17,0],3.4,P.armorDark,OL);line([4,-8,8-step*4,-2,11,0],3.4,P.armorDark,OL);
      shape(()=>{ctx.moveTo(-18,-8);ctx.quadraticCurveTo(-21,-31,-4,-35);ctx.quadraticCurveTo(15,-35,19,-18);ctx.quadraticCurveTo(14,-6,0,-6);ctx.closePath();},lg(0,-35,0,-6,P.armorHi,P.armor),OL,2);
      shape(()=>{ctx.moveTo(-17,-20);ctx.quadraticCurveTo(-8,-40,11,-33);ctx.quadraticCurveTo(0,-30,-9,-18);ctx.closePath();},P.tabard,OL,1.4);for(let i=0;i<4;i++){const x=-13+i*7;line([x,-25+i,x+Math.sin(t*2+i)*2,-17+i+(i%2)*4],1.4,P.tabardDark);}
      circle(-6,-30,2.4,'#a7dc69',OL,1);circle(4,-33,1.8,'#a7dc69',OL,1);
      ctx.save();ctx.translate(16,-20);ctx.rotate(-.24*w);shape(()=>{ctx.moveTo(-4,-6);ctx.quadraticCurveTo(8,-10,12,-2);ctx.quadraticCurveTo(10,4,0,4);ctx.closePath();},P.helm,OL,1.6);circle(6,-3,2.2,'#0a0e14');circle(6.4,-3.2,1,P.eye);if(w>.15||atk>0){poly([2,3,5,6.5,8,3],'#e8e0c8',OL,.8);poly([7,3,10,6.5,12,2],'#e8e0c8',OL,.8);}ctx.restore();
      const ha=w>0?-.4-1.9*w:atk>0?-2.3+2.9*atk:.5,sx=8,sy=-22,ex=sx+Math.cos(ha)*11,ey=sy+Math.sin(ha)*11;line([sx,sy,ex,ey],3.6,P.armor,OL);
      ctx.save();ctx.translate(ex,ey);ctx.rotate(ha);shape(()=>{ctx.moveTo(0,-1.5);ctx.lineTo(12,-1.5);ctx.quadraticCurveTo(21,-1,19,8);ctx.quadraticCurveTo(15,3,12,3);ctx.lineTo(0,2);ctx.closePath();},lg(0,0,19,8,'#d8e0d0','#7a8478'),OL,1.2);glint(19,8,w);ctx.restore();
      if(sw>=0&&sw<.7)smear(sx,sy,12,34,3.6,.7,(1-sw)*.5,'#dff5c8');}
    else if(k==='ramparts'){   // 城墙哨兵：圆盾在前，长枪往后一收再刺出去
      ctx.rotate(-.12*w+.16*atk);line([-4,-18,-6+step*4,-2,-7,0],4,P.pantsDark,OL);line([4,-18,6-step*4,-2,8,0],4,P.pants,OL);boot(-7,0,P.boot);boot(8,0,P.boot);
      shape(()=>{ctx.moveTo(-8,-35);ctx.lineTo(-17,-12+Math.sin(t*2)*2);ctx.lineTo(-6,-15);ctx.closePath();},P.tabardDark,OL,1.4);
      shape(()=>{ctx.moveTo(-8,-16);ctx.lineTo(-9,-36);ctx.lineTo(9,-36);ctx.lineTo(8,-16);ctx.closePath();},lg(-9,0,9,0,P.armorDark,P.armor,P.armorHi),OL,1.8);shape(()=>{ctx.moveTo(-6,-26);ctx.lineTo(6,-26);ctx.lineTo(5,-8);ctx.lineTo(0,-11);ctx.lineTo(-5,-8);ctx.closePath();},P.tabard,OL,1.2);
      ctx.save();ctx.translate(1,-42);shape(()=>{ctx.moveTo(-7,4);ctx.lineTo(-7,-4);ctx.quadraticCurveTo(0,-11,7,-4);ctx.lineTo(7,4);ctx.closePath();},lg(0,-10,0,4,P.armorHi,P.helm||P.armor),OL,1.6);box(0,-2,7,2.4,P.visor||'#0a0e14');circle(4.5,-1,1,P.eye);shape(()=>{ctx.moveTo(-2,-8);ctx.quadraticCurveTo(-10,-15,-17+Math.sin(t*3)*2,-8);ctx.quadraticCurveTo(-9,-8,-3,-6);ctx.closePath();},'#c88879',OL,1);ctx.restore();
      const px=w>0?-14*w:atk*16,py=-30;line([px-18,py+2,px+46,py-2],2.4,P.haft,OL);poly([px+46,py-5.5,px+59,py-2,px+46,py+1.5],lg(0,-5,0,2,'#ffffff',P.blade),OL,1);glint(px+59,py-2,w);
      line([4,-32,px+8,py+1],3,P.armor,OL);circle(px+8,py+1,2.1,P.glove);
      shape(()=>ctx.ellipse(-1,-24,7,10.5,0,0,TAU),lg(-8,-34,6,-14,P.armorHi,P.tabard),OL,1.6);circle(-1,-24,2.2,P.armorHi,OL,.8);shape(()=>ctx.ellipse(-1,-24,4.5,7,0,0,TAU),null,'rgba(255,240,200,.35)',1);}
    else if(k==='ossuary'){   // 墓窟骸兽：四足的骨兽，起手时人立，落下时砸出地波
      ctx.save();ctx.translate(-12,0);ctx.rotate(-.4*w+.08*atk);ctx.translate(12,0);
      const bl=(x,o,near)=>{const s=Math.sin(e.walk+o),lift=w>.3&&x>0?6:0;line([x,-14,x+s*4,-6-lift,x+s*5-2,-lift],near?2.8:2.3,near?'#f0e8d4':P.armorHi,OL);};
      bl(-12,Math.PI,false);bl(10,0,false);for(let i=0;i<3;i++)circle(-21-i*4,-14+i*2+Math.sin(t*3+i),1.7,P.armorHi,OL,.6);
      const sp=()=>{ctx.moveTo(-19,-14);ctx.quadraticCurveTo(-4,-27,14,-18);};shape(sp,null,OL,5.4);shape(sp,null,'#f0e8d4',3.2);for(let i=0;i<4;i++){const x=-11+i*6;shape(()=>{ctx.moveTo(x,-20-i*.5);ctx.quadraticCurveTo(x+4,-12,x+1,-7);},null,'#e6dcc4',1.7);}
      bl(-12,0,true);bl(10,Math.PI,true);
      ctx.save();ctx.translate(16,-20);ctx.rotate(.1-.28*w);shape(()=>{ctx.moveTo(-4,-6);ctx.quadraticCurveTo(6,-10,12,-3);ctx.lineTo(12,2);ctx.quadraticCurveTo(4,4,-3,2);ctx.closePath();},lg(0,-10,0,4,'#fbf4e2','#cfc5ad'),OL,1.4);circle(5,-3,2.3,'#120c16');circle(5.4,-3.2,.9,P.eye);
      ctx.save();ctx.translate(0,2);ctx.rotate(w>.15?.4:atk>0?.12:0);poly([-2,0,11,0,9,4,0,4],'#e6dcc4',OL,1);for(let i=0;i<3;i++)poly([2+i*3,0,3.5+i*3,2.6,5+i*3,0],'#ffffff');ctx.restore();
      shape(()=>{ctx.moveTo(0,-6);ctx.quadraticCurveTo(-7,-15,-13,-13);ctx.quadraticCurveTo(-6,-10,-2,-4);ctx.closePath();},'#e6dcc4',OL,1);glint(13,1,w);ctx.restore();ctx.restore();}
    else{   // 钟楼机械守卫：胸口一只齿轮、活塞手臂、独眼镜片，举起铜锤再砸下
      line([-5,-14,-7+step*4,-1],4,P.armorDark,OL);line([5,-14,7-step*4,-1],4,P.armorDark,OL);boot(-7,0,P.boot);boot(8,0,P.boot);
      shape(()=>{ctx.moveTo(-10,-14);ctx.lineTo(-11,-36);ctx.lineTo(11,-36);ctx.lineTo(10,-14);ctx.closePath();},lg(-11,0,11,0,P.armorDark,P.armor,P.armorHi),OL,1.8);
      gear(0,-26,6,8,t*(w>0?9:2),'#d9a650');circle(0,-26,2,P.armorDark);line([-9,-16,9,-16],1.4,'rgba(255,230,170,.3)');
      ctx.save();ctx.translate(1,-42);shape(()=>{ctx.moveTo(-8,5);ctx.lineTo(-8,-2);ctx.quadraticCurveTo(0,-11,8,-2);ctx.lineTo(8,5);ctx.closePath();},lg(0,-11,0,5,P.armorHi,P.helm||P.armor),OL,1.6);circle(3,0,3.3,'#1a1410',OL,1);circle(3,0,1.9,w>0?'#fff0c0':P.eye);line([-6,-6,-9,-12],1.4,P.armorHi);circle(-9,-12,1.4,'#d9a650');ctx.restore();
      const ha=w>0?-.6-2.2*w:atk>0?-2.8+3.4*atk:.6,sx=7,sy=-32,hx=sx+Math.cos(ha)*14,hy=sy+Math.sin(ha)*14;line([sx,sy,hx,hy],3.8,P.armorHi,OL);
      ctx.save();ctx.translate(hx,hy);ctx.rotate(ha);line([0,0,15,0],2.4,'#5a4632',OL);shape(()=>ctx.rect(13,-6,9,12),lg(13,-6,22,6,'#f0cf8a','#a7803f'),OL,1.4);glint(22,-6,w);ctx.restore();}
    ctx.restore();}
  // 各区域的弓手：溺水的弓手（披着水藻）、城墙游侠（兜帽面巾、背着箭囊）、长角的骸骨弓手、铜皮机械弓手；拉满弓时箭头一闪
  function drawBiomeArcher(e,P,w,sw){const t=time+e.seed,bob=Math.sin(t*2.8)*1.1,k=L.theme;ctx.save();ctx.translate(0,bob);
    line([-3,-14,-5,0],2.6,P.legs,OL);line([3,-14,5,0],2.6,P.legs,OL);
    shape(()=>{ctx.moveTo(-8,-34);ctx.lineTo(7,-34);ctx.lineTo(10,-12);ctx.lineTo(6,-8);ctx.lineTo(3,-11);ctx.lineTo(0,-6);ctx.lineTo(-3,-11);ctx.lineTo(-6,-7);ctx.lineTo(-9,-12);ctx.closePath();},lg(-9,0,10,0,P.cloakDark,P.cloak),OL,1.8);
    const hy=-39;
    if(k==='sewers'){shape(()=>{ctx.moveTo(-7,hy+6);ctx.quadraticCurveTo(-9,hy-8,1,hy-10);ctx.quadraticCurveTo(9,hy-8,8,hy+4);ctx.lineTo(4,hy+7);ctx.closePath();},P.hood,OL,1.8);for(let i=0;i<4;i++)line([-6+i*3.5,hy+4,-6+i*3.5+Math.sin(t*2+i),hy+12+(i%2)*4],1.3,'#5f8a4f');oval(3,hy+.5,3.6,4.2,P.skull);circle(4.6,hy-.4,1.3,'#0a0e0a');circle(4.6,hy-.4,.7,P.eye);}
    else if(k==='ramparts'){shape(()=>ctx.rect(-12,-34,5,16),'#5a3d27',OL,1.2);for(let i=0;i<3;i++)line([-11+i*1.6,-34,-12+i*1.6,-39],1.2,'#d8c8a8');shape(()=>{ctx.moveTo(-7,hy+6);ctx.quadraticCurveTo(-8,hy-8,1,hy-10);ctx.quadraticCurveTo(9,hy-8,8,hy+4);ctx.lineTo(4,hy+7);ctx.closePath();},P.hood,OL,1.8);oval(3,hy,3.6,4.4,'#1a1214');box(0,hy+1.4,7,3,P.cloakDark);circle(4.4,hy-1,1,'#ffd27a');}
    else if(k==='ossuary'){oval(2,hy,5,5.6,P.skull);ctx.strokeStyle=OL;ctx.lineWidth=1.6;ctx.beginPath();ctx.ellipse(2,hy,5,5.6,0,0,TAU);ctx.stroke();circle(4,hy-.8,1.6,P.socket);circle(4.3,hy-.8,.8,P.eye);circle(0,hy-.8,1.4,P.socket);
      shape(()=>{ctx.moveTo(-2,hy-4);ctx.quadraticCurveTo(-10,hy-10,-8,hy-2);ctx.quadraticCurveTo(-8,hy-6,-3,hy-2);ctx.closePath();},P.skull,OL,1);for(let i=0;i<3;i++)line([0+i*2,hy+4,0+i*2,hy+6],.8,OL);}
    else{shape(()=>{ctx.moveTo(-7,hy+5);ctx.lineTo(-7,hy-2);ctx.quadraticCurveTo(0,hy-11,7,hy-2);ctx.lineTo(7,hy+5);ctx.closePath();},lg(0,hy-11,0,hy+5,'#d9b070','#8a6a3a'),OL,1.6);circle(3.5,hy,3,'#1a1410',OL,1);circle(3.5,hy,1.6,w>.08?'#fff0c0':P.eye||'#ffb04a');gear(-8,-31,4,7,t*3,'#a7803f');}
    const bx=10,by=-27,pull=sw>=0?-Math.sin(sw*22)*(1-sw)*2:-w*9,sx=bx+1+pull;line([1,-31,bx+7,by],2.3,P.cloakDark,OL);
    ctx.strokeStyle=OL;ctx.lineWidth=4.4;ctx.beginPath();ctx.arc(bx-6,by,14,-1.05,1.05);ctx.stroke();ctx.strokeStyle=P.bow;ctx.lineWidth=2.4;ctx.stroke();line([bx+1,by-12.1,sx,by,bx+1,by+12.1],.8,P.string);
    if(w>.08&&sw<0){line([sx,by,sx+20,by],1.2,P.arrow);poly([sx+20,by-2.2,sx+24.5,by,sx+20,by+2.2],'#dfe3e0');glint(sx+24.5,by,w);}
    line([-1,-30,sx,by],2.3,P.cloak,OL);ctx.restore();}
  // ---- 四位首领：各自独立的造型和动作（出招前的姿势就是预兆） ----
  // 渐细的带子（触须、布条）：沿二次贝塞尔取点，左右偏移
  function qpt(x0,y0,cx,cy,x1,y1,t){const u=1-t;return[u*u*x0+2*u*t*cx+t*t*x1,u*u*y0+2*u*t*cy+t*t*y1];}
  function ribbon(x0,y0,cx,cy,x1,y1,w0,w1,fill,stroke,n){n=n||10;const A=[],B=[];for(let i=0;i<=n;i++){const t=i/n,u=1-t,q=qpt(x0,y0,cx,cy,x1,y1,t),dx=2*u*(cx-x0)+2*t*(x1-cx),dy=2*u*(cy-y0)+2*t*(y1-cy),d=Math.hypot(dx,dy)||1,w=(w0+(w1-w0)*t)/2;A.push(q[0]-dy/d*w,q[1]+dx/d*w);B.unshift(q[0]+dy/d*w,q[1]-dx/d*w);}poly(A.concat(B),fill,stroke,1.6);}
  // 两节手臂的关节位置（肩 → 手）
  function ik(sx,sy,tx,ty,l1,l2,bend){const dx=tx-sx,dy=ty-sy,d=Math.max(1,Math.min(l1+l2-.01,Math.hypot(dx,dy))),a=Math.atan2(dy,dx),b=Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1))*(bend||1);return[sx+Math.cos(a-b)*l1,sy+Math.sin(a-b)*l1];}
  function link(x,y,ang,c,rx){ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.strokeStyle=OL;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,rx||4.2,(rx||4.2)*.62,0,0,TAU);ctx.stroke();ctx.strokeStyle=c;ctx.lineWidth=2.2;ctx.stroke();ctx.restore();}
  function padlock(P,broken,s){ctx.save();ctx.scale(s||1,s||1);const sh=broken?()=>ctx.arc(0,4,8,Math.PI,Math.PI*1.55):()=>ctx.arc(0,4,8,Math.PI,0);shape(sh,null,OL,6);shape(sh,null,P.brass,3.4);if(broken){ctx.translate(-6,14);ctx.rotate(.5);ctx.translate(6,-14);}
    shape(()=>{ctx.moveTo(-13,4);ctx.lineTo(13,4);ctx.lineTo(14,26);ctx.quadraticCurveTo(0,32,-14,26);ctx.closePath();},lg(-13,4,13,30,P.brassHi,P.brass,P.brassDark),OL,2.4);circle(0,13,3,OL);poly([-1.6,14,1.6,14,2.4,22,-2.4,22],OL);line([-11,8,11,8],1.2,'rgba(255,240,200,.45)');ctx.restore();}
  const LOCK={shell:'#8a744c',shellHi:'#d0ae6a',shellDark:'#4e3f28',band:'#5f4d31',iron:'#56606b',ironHi:'#909ca8',ironDark:'#2a3139',hide:'#3d3532',hideDark:'#27211f',brass:'#c99a4e',brassHi:'#f2d08a',brassDark:'#7a5a2a',glow:'#ffb04a',core:'#ff8a3a',claw:'#ddd4c0',chain:'#6f7a84',thread:'#2fa39b'};
  const BROOD={glass:'#1f4a33',glassHi:'#7fc89a',frame:'#3a4636',frameHi:'#7d9670',frameDark:'#1f281d',rust:'#7a5232',flame:'#9be36a',flameHi:'#f0ffd0',flameMid:'#c8f08a',pupil:'#14200f',tent:'#2b3b2c',tentHi:'#4f6a47',slime:'#86c060',weed:'#3f6f2f',barn:'#a8b48a',lamp:'#c8b070',lampLit:'#d8ff9a'};
  const STD={bone:'#ddd3bc',boneDark:'#9d927c',cloak:'#4b3462',cloakDark:'#2b1d3b',armor:'#706a7c',armorHi:'#aaa3b6',armorDark:'#3f3a4a',gold:'#c9a35a',goldHi:'#f0d48a',flag:'#7d3150',flagHi:'#a8506f',flagDark:'#4c1a30',pole:'#5d4630',spear:'#dfe4e6',spirit:'#c58bff',eye:'#e6ccff',socket:'#140c1c'};
  const WARDEN={bronze:'#a7803f',bronzeHi:'#ecc87e',bronzeDark:'#5f4321',iron:'#4b5059',ironHi:'#808894',ironDark:'#2a2d33',cape:'#3c1b20',capeDark:'#230e12',slit:'#0b0705',glow:'#ffb04a',soul:'#8be1ce',soulHi:'#effff9',chain:'#7c828a',leather:'#3b2a20',haft:'#4a3626',glass:'#203232'};
  const BOSS_PAL={lock:LOCK,brood:BROOD,standard:STD,warden:WARDEN};[LOCK,BROOD,STD,WARDEN].forEach(o=>Object.keys(o).forEach(k=>{FLASH[k]='#fff2df';}));
  const BOSS_CHUNKS={lock:[LOCK.shell,LOCK.brass,LOCK.iron,LOCK.hide],brood:[BROOD.frame,BROOD.glass,BROOD.tent,BROOD.flame],standard:[STD.bone,STD.armor,STD.flag,STD.cloak],warden:[WARDEN.bronze,WARDEN.iron,WARDEN.cape,WARDEN.soul]};
  // 守锁兽：四足的兽，锁只是项圈上的一小枚。砸地时人立，冲撞时伏低，甩链时身子不动、锁头沿弧线抡出去。
  function drawLock(e,P){const t=time+e.seed,m=e.move,w=e.wind>0?1-e.wind/(e.wt||.5):0,run=m==='charge'&&e.act>0;
    const tellSlam=m==='slam'&&e.wind>0,down=m==='slam'&&e.rec>0,tellCharge=m==='charge'&&e.wind>0;
    const sink=tellCharge?11*w:(run?4:0),rear=tellSlam?-.78*w:(e.roar?-.2:0),pitch=down?.48:0,wag=Math.sin(t*(run?6:2.1))*9;
    ctx.save();ctx.translate(0,sink);ctx.rotate(rear+pitch);
    ribbon(-44,-32,-70,-14+wag,-96,-30+wag,8,2.4,P.hide,OL,7);
    const leg=(x,ph,near,hip)=>{const lift=Math.max(0,Math.sin((e.walk||0)*(run?2:.75)+ph))*(run?15:5),reach=(down&&x>0?26:run?9:3),kx=x+5,ky=hip*.5-lift*.2,fx=x+reach,fy=-lift-sink;
      line([x,hip,kx,ky],near?9:7,near?P.hide:P.hideDark,OL);line([kx,ky,fx,fy],near?7:5.5,P.hideDark,OL);
      poly([fx-3,fy,fx+16,fy-1,fx+14,fy+5,fx-2,fy+5],P.claw,OL,1);for(let i=0;i<3;i++)poly([fx+1+i*4.2,fy,fx+4+i*4.2,fy-6,fx+8+i*4.2,fy],P.claw,OL,.6);};
    leg(-36,.2,false,-28);leg(-12,2.5,false,-26);
    shape(()=>{ctx.moveTo(-46,-22);ctx.quadraticCurveTo(-56,-50,-22,-58);ctx.quadraticCurveTo(10,-70,38,-52);ctx.quadraticCurveTo(50,-40,40,-18);ctx.quadraticCurveTo(12,-6,-18,-12);ctx.quadraticCurveTo(-38,-14,-46,-22);ctx.closePath();},lg(-30,-62,18,-10,P.shellHi,P.shell,P.shellDark),OL,2.5);
    shape(()=>{ctx.moveTo(-26,-18);ctx.quadraticCurveTo(6,-6,32,-20);ctx.quadraticCurveTo(8,-4,-24,-14);ctx.closePath();},P.hide,OL,1.1);
    for(let i=0;i<3;i++)line([-16+i*13,-50,-8+i*13,-22],1.7,P.ironDark);
    for(let i=0;i<5;i++)poly([6+i*6,-50,14+i*5,-72-i*2,22+i*4,-48],P.hideDark,OL,.7);
    line([18,-34,30,-18],2.6,P.chain);ctx.save();ctx.translate(28,-8);ctx.rotate(.15);ctx.scale(.34,.34);padlock(P,!!e.rage,1);ctx.restore();
    const neck=tellSlam?-6:0;line([30,-46,48,-60+neck],11,P.hide,OL);
    ctx.save();ctx.translate(52,-66+neck);ctx.rotate(run?.55:(tellCharge?.4*w:(tellSlam?-.5*w:(e.stun?.5:Math.sin(t*1.4)*.05))));
    poly([0,-2,-16,-28,10,-8],P.hideDark,OL,1.2);
    shape(()=>{ctx.moveTo(-16,-2);ctx.quadraticCurveTo(-8,-20,16,-14);ctx.quadraticCurveTo(30,-6,26,8);ctx.quadraticCurveTo(6,16,-14,10);ctx.closePath();},lg(-6,-16,14,10,P.hide,P.hideDark),OL,2.1);
    shape(()=>{ctx.moveTo(8,0);ctx.lineTo(34,-2);ctx.lineTo(36,8);ctx.lineTo(6,9);ctx.closePath();},P.shell,OL,1.5);
    circle(4,-2,3.3,'#140e0a');circle(5.1,-3.2,1.25,(e.rage||e.roar||w>.15)?P.glow:'#ffe7b8');
    const open=!!(e.roar||e.stun||(tellSlam&&w>.3)||tellCharge||run);
    if(open){shape(()=>{ctx.moveTo(12,4);ctx.lineTo(32,3);ctx.lineTo(30,13);ctx.lineTo(10,11);ctx.closePath();},'#24160f',OL,1.1);for(let i=0;i<4;i++)poly([15+i*4,4,16.4+i*4,9,19+i*4,4],'#f4efe6',OL,.5);}
    else line([14,5,30,4],1.4,'#24160f');
    ctx.restore();
    leg(8,1.2,true,-24);leg(26,3.4,true,-22);
    if(tellCharge){ctx.globalAlpha=.5;line([22,2,-6,7],2,'#e7eef2');line([10,4,-18,9],1.6,'#e7eef2');ctx.globalAlpha=1;}
    if(e.stun)for(let i=0;i<3;i++)sparkle2(16+Math.cos(t*4+i)*14,-74,3.4,'#ffe08a');
    ctx.restore();
    if(m==='lash'){const k=e.wind>0?0:(e.act>0&&e.at?1-e.act/e.at:1),th=-2.5+2.7*(1-Math.pow(1-k,2)),hx=80+Math.cos(th)*190,hy=Math.min(-14,-30+Math.sin(th)*190),sx=34,sy=-40;
      for(let i=1;i<=11;i++){const u=i/11;link(sx+(hx-sx)*u,sy+(hy-sy)*u-Math.sin(u*Math.PI)*(e.wind>0?22:5),th+(i%2?0:1.15),P.chain,3.3);}
      ctx.save();ctx.translate(hx,hy);ctx.rotate(th+.5);ctx.scale(.72,.72);padlock(P,false,1);ctx.restore();}}
  // 溺灯：从污水里浮起的巨灯。玻璃灯室里一团绿火，火里有一道竖瞳；灯身缠着锈链、空灯罩和水草，触须垂进水里
  function drawBrood(e,P){const t=time+e.seed,m=e.move,w=e.wind>0?1-e.wind/e.wt:0,a=e.act>0&&e.at?1-e.act/e.at:0,bob=Math.sin(t*1.7)*5,open=m==='spit'?(e.wind>0?w:e.rec>0&&e.rt?e.rec/e.rt:0):0,coil=m==='sweep'&&e.wind>0?w:0,lash=m==='sweep'&&e.act>0?Math.sin(a*Math.PI):0,swell=1+open*.45+(e.rage?.12:0)+(e.roar?.25:0),cy=-86+bob;
    const tent=(i,near)=>{const x0=-26+i*17,sw=Math.sin(t*2.1+i*1.7)*10,dir=x0>=0?1:-1;let tx=x0*1.9+sw-coil*16*dir,ty=-2-coil*40,cx=x0*1.2+sw*.6,cyy=cy+72-coil*24;
      if(near&&lash>0){tx=x0+lash*(150+i*14);ty=-4;cx=x0+lash*50;cyy=cy+44;}
      ribbon(x0,cy+30,cx,cyy,tx,ty,near?15:12,3,near?P.tentHi:P.tent,OL,14);
      if(near){for(let k=2;k<7;k++){const q=qpt(x0,cy+30,cx,cyy,tx,ty,k/8);circle(q[0],q[1],1.9,P.barn);}
        if(i%2===0){const q=qpt(x0,cy+30,cx,cyy,tx,ty,.6);ctx.save();ctx.translate(q[0],q[1]);ctx.rotate(Math.sin(t*1.5+i)*.3);poly([-6,0,6,0,4,9,-4,9],P.lamp,OL,1.2);ctx.restore();}}};
    for(let i=0;i<4;i++)tent(i,false);
    [-16,20].forEach((x,j)=>{const sw=Math.sin(t*1.4+j*2)*8;for(let k=0;k<9;k++){const u=k/8;link(x+sw*u*u,cy+46+u*(-cy-50),k%2?0:Math.PI/2,P.rust,2.6);}});   // 灯底垂下的两根锈链
    ctx.save();ctx.translate(0,cy);ctx.rotate(-open*.06+(e.roar?Math.sin(t*30)*.02:0));
    shape(()=>{ctx.moveTo(-38,28);ctx.lineTo(38,28);ctx.lineTo(26,44);ctx.quadraticCurveTo(0,50,-26,44);ctx.closePath();},lg(0,28,0,48,P.frame,P.frameDark),OL,2.4);
    line([-20,32,-16,44],2,P.rust);line([12,31,10,45],2,P.rust);[[-18,48],[4,51],[20,47]].forEach((q,i)=>shape(()=>{ctx.moveTo(q[0]-3,q[1]-4);ctx.quadraticCurveTo(q[0],q[1]+6+Math.sin(t*2+i)*2,q[0]+3,q[1]-4);},P.slime));
    const gw=38,glass=()=>{ctx.moveTo(-gw,30);ctx.quadraticCurveTo(-gw-7,-2,-gw+2,-34);ctx.lineTo(gw-2,-34);ctx.quadraticCurveTo(gw+7,-2,gw,30);ctx.closePath();};
    shape(glass,lg(-gw,0,gw,0,P.glass,P.glassHi,P.glass));
    ctx.save();ctx.beginPath();glass();ctx.clip();circle(0,4,46*swell,rg(0,4,46*swell,'rgba(230,255,170,.55)','rgba(155,227,106,.25)','rgba(80,140,60,0)'));
    const fh=34*swell,fy=24;[[1,P.flame],[.68,P.flameMid],[.38,P.flameHi]].forEach(q=>{const k=q[0],top=fy-fh*k*1.3+Math.sin(t*9+k*3)*2;shape(()=>{ctx.moveTo(0,top);ctx.bezierCurveTo(16*k*swell,fy-fh*k*.6,14*k*swell,fy,0,fy+2);ctx.bezierCurveTo(-14*k*swell,fy,-16*k*swell,fy-fh*k*.6,0,top);},q[1]);});
    shape(()=>ctx.ellipse(5+open*3,2,4.6*(1-open*.3),11-open*3,0,0,TAU),P.pupil);circle(6.5+open*3,-2,1.2,'rgba(255,255,255,.6)');
    shape(()=>{ctx.moveTo(-26,-28);ctx.quadraticCurveTo(-34,0,-28,26);ctx.lineTo(-22,26);ctx.quadraticCurveTo(-28,0,-20,-28);ctx.closePath();},'rgba(255,255,255,.16)');
    if(e.rage)shape(()=>{ctx.moveTo(-30,-20);ctx.lineTo(-18,-8);ctx.lineTo(-24,6);ctx.lineTo(-14,18);ctx.moveTo(-18,-8);ctx.lineTo(-6,-14);ctx.moveTo(22,-26);ctx.lineTo(14,-12);ctx.lineTo(26,2);},null,'rgba(235,255,225,.85)',1.4);
    ctx.restore();shape(glass,null,OL,2.6);
    [-gw+2,-13,13,gw-2].forEach((x,i)=>{const bulge=i===0?-6:i===3?6:0,b=()=>{ctx.moveTo(x,-34);ctx.quadraticCurveTo(x+bulge,-2,x*.98,30);};shape(b,null,OL,6);shape(b,null,P.frame,3.4);});
    if(open>0){ctx.save();ctx.translate(13,-2);ctx.scale(1-open*.85,1);shape(()=>ctx.rect(0,-30,-26,58),'rgba(36,82,56,.85)',OL,2);shape(()=>ctx.rect(-4,-26,-18,50),null,P.frameHi,1.4);ctx.restore();}
    shape(()=>ctx.rect(-gw-4,-38,2*gw+8,6),lg(0,-38,0,-32,P.frameHi,P.frame),OL,2);shape(()=>ctx.rect(-gw-2,26,2*gw+4,5),P.frame,OL,2);
    shape(()=>{ctx.moveTo(-46,-36);ctx.lineTo(46,-36);ctx.quadraticCurveTo(32,-44,28,-56);ctx.lineTo(-28,-56);ctx.quadraticCurveTo(-32,-44,-46,-36);ctx.closePath();},lg(0,-56,0,-36,P.frameHi,P.frame,P.frameDark),OL,2.6);
    line([-26,-52,26,-52],1.4,'rgba(200,230,180,.35)');shape(()=>ctx.rect(-7,-64,14,8),P.frame,OL,1.8);circle(0,-70,6,null,OL,4.4);circle(0,-70,6,null,P.frameHi,2.4);for(let i=1;i<4;i++)link(Math.sin(t+i)*2,-74-i*7,i%2?0:Math.PI/2,P.frameHi,2.8);
    for(let i=0;i<6;i++){const x=-40+i*16,len=22+(i*13)%20,sw=Math.sin(t*1.3+i)*3;ctx.strokeStyle=P.weed;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(x,-37);ctx.quadraticCurveTo(x+sw,-37+len*.6,x+sw*1.6,-37+len);ctx.stroke();}
    [[-34,22],[-30,-24],[32,14],[36,-18],[-12,40]].forEach(q=>{circle(q[0],q[1],2.6,P.barn,OL,1);circle(q[0],q[1],1,'#4a5440');});
    const lit=e.rage||(m==='moths'&&e.wind>0);[[-47,4,-.5],[43,-18,.6]].forEach(q=>{ctx.save();ctx.translate(q[0],q[1]);ctx.rotate(q[2]);shape(()=>ctx.rect(-5,-7,10,14),lit?P.lampLit:'#3a4a34',OL,1.4);shape(()=>{ctx.moveTo(-7,-7);ctx.lineTo(7,-7);ctx.lineTo(3,-12);ctx.lineTo(-3,-12);ctx.closePath();},P.lamp,OL,1.2);ctx.restore();});
    ctx.restore();for(let i=0;i<4;i++)tent(i,true);}
  // 无名旗手：瘦长的骸骨骑士，残破的胸甲下露出肋骨，半边头盔碎了，双手握着挂旗的长枪
  function drawStandard(e,P){const t=time+e.seed,m=e.move,w=e.wind>0?1-e.wind/e.wt:0,a=e.act>0&&e.at?1-e.act/e.at:0,ph=e.walk*.75,s=Math.sin(ph),c=Math.cos(ph);
    let th=.14,hx=12,hy=-64,lean=0,crouch=0,tuck=0;
    if(m==='thrust'){if(e.wind>0){th=1.5;hx=-12-10*w;hy=-60;lean=-.14*w;}else if(e.act>0){th=1.5;hx=26;hy=-60;lean=.22;}else{th=1.3;hx=16;lean=.08;}}
    else if(m==='plant'){if(e.wind>0){th=-.04;hx=4;hy=-104-12*w;lean=-.08;}else{th=.08;hx=30;hy=-50;lean=.2;crouch=6;}}
    else if(m==='gust'){if(e.wind>0){th=-1.15*w;hx=-2;hy=-82;lean=-.12*w;}else{th=1.3;hx=20;hy=-72;lean=.16;}}
    else if(m==='sweep'){if(e.wind>0){th=.1-.7*w;hx=0;hy=-68;}else if(e.act>0){th=-.6+2.1*a;hx=18;hy=-64;lean=.16;}else{th=1.45;hx=18;hy=-62;}}
    else if(m==='leap'){if(e.wind>0){crouch=14*w;th=.3;hy=-60+14*w;}else{th=Math.PI-.3;hx=14;hy=-46;crouch=4;tuck=1;}}
    if(e.roar){th=-.05;hx=4;hy=-112;lean=-.12;}
    const hipY=-50+crouch+(tuck?0:-Math.abs(s)*1.5),dxp=Math.sin(th),dyp=-Math.cos(th),gx=hx,gy=hy+crouch*.5,bx=gx-dxp*46,by=gy-dyp*46,tx=gx+dxp*112,ty=gy+dyp*112,sh=(x,y)=>[x*Math.cos(lean)-y*Math.sin(lean),hipY+x*Math.sin(lean)+y*Math.cos(lean)];
    // 披风
    const cs=Math.sin(t*1.6)*4+s*3,S0=sh(-10,-40),S1=sh(6,-40);poly([S0[0],S0[1],S1[0],S1[1],4+cs,-14,-6+cs,-6,-14+cs,-14,-22+cs,-4,-30+cs,-12,-34+cs*.6,-30],P.cloakDark,OL,2);
    const legDraw=(x,sg,near)=>{const J=tuck?joint(x,hipY,.9,-1.6,21,21):joint(x,hipY,sg*s*.42,-.1-Math.max(0,sg*c)*.7,21,21);line([x,hipY,J[0],J[1]],near?7.4:6.6,near?P.armor:P.armorDark,OL);line([J[0],J[1],J[2],J[3]],4,near?P.bone:P.boneDark,OL);shape(()=>ctx.rect(J[0]-4,J[1]+3,8,11),near?P.armorHi:P.armor,OL,1.4);poly([J[2]-5,J[3]-4,J[2]+6,J[3]-4,J[2]+10,J[3]+.5,J[2]-5,J[3]+.5],near?P.armorDark:P.ironDark||P.armorDark,OL,1.3);circle(J[0],J[1],3.6,near?P.armorHi:P.armor,OL,1.2);};
    legDraw(-4,-1,false);
    const far=sh(-8,-38),near=sh(8,-38),h2x=gx-dxp*20,h2y=gy-dyp*20,E1=ik(far[0],far[1],h2x,h2y,16,16,-1);line([far[0],far[1],E1[0],E1[1],h2x,h2y],5,P.armorDark,OL);
    // 旗：挂在枪头下的横杆上，随风摆动（二阶段燃起灵火）
    {const g=Math.min(1,Math.abs(Math.sin(th))),fdx=-Math.cos(th)*(1-g),fdy=g,fn=Math.hypot(fdx,fdy)||1,fx=fdx/fn,fy=fdy/fn,A=[gx+dxp*104,gy+dyp*104],B=[gx+dxp*54,gy+dyp*54],pts=[];
      for(let i=0;i<=4;i++){const u=i/4;pts.push(A[0]+(B[0]-A[0])*u,A[1]+(B[1]-A[1])*u);}
      for(let i=4;i>=0;i--){const u=i/4,ln=58+Math.sin(t*5+i*.9)*4-(i%2)*7,wv=Math.sin(t*4+i*.8)*4;pts.push(A[0]+(B[0]-A[0])*u+fx*ln+dxp*wv,A[1]+(B[1]-A[1])*u+fy*ln+dyp*wv);}
      poly(pts,lg(A[0],A[1],A[0]+fx*58,A[1]+fy*58,P.flagHi,P.flag,P.flagDark),OL,2);line([A[0],A[1],B[0],B[1]],3,P.gold,OL);
      const mx=(A[0]+B[0])/2+fx*28,my=(A[1]+B[1])/2+fy*28;ctx.save();ctx.translate(mx,my);ctx.rotate(Math.atan2(fy,fx)-Math.PI/2);shape(()=>{ctx.moveTo(0,-9);ctx.bezierCurveTo(-6,-9,-7,0,-8,6);ctx.lineTo(8,6);ctx.bezierCurveTo(7,0,6,-9,0,-9);},null,P.goldHi,1.6);line([-9,6,9,6],1.6,P.goldHi);ctx.restore();
      if(e.rage)for(let i=0;i<5;i++){const k=pts.length-2-i*2;if(k>=10){ctx.globalAlpha=.75;fl(pts[k],pts[k+1]+2,.55+.15*Math.sin(t*8+i),['#7a3aa8','#c58bff','#f4e6ff']);ctx.globalAlpha=1;}}}
    // 旗杆和枪头
    line([bx,by,tx,ty],4,P.pole,OL);ctx.save();ctx.translate(tx,ty);ctx.rotate(th);poly([-3,0,3,0,5,-12,0,-26,-5,-12],lg(-5,0,5,0,'#ffffff',P.spear,'#8a96a0'),OL,1.6);shape(()=>ctx.rect(-8,-2,16,4),P.gold,OL,1.4);ctx.restore();
    // 身体
    ctx.save();ctx.translate(0,hipY);ctx.rotate(lean);
    shape(()=>{ctx.moveTo(-12,-2);ctx.lineTo(12,-2);ctx.lineTo(15,-38);ctx.lineTo(-15,-38);ctx.closePath();},lg(-15,0,15,0,P.armorDark,P.armor,P.armorHi),OL,2.2);
    shape(()=>{ctx.moveTo(4,-34);ctx.lineTo(10,-26);ctx.lineTo(6,-18);ctx.lineTo(12,-8);ctx.lineTo(14,-34);ctx.closePath();},P.socket,OL,1.2);for(let i=0;i<3;i++)line([6,-30+i*7,13,-32+i*7],1.6,P.bone);
    shape(()=>{ctx.moveTo(-15,-36);ctx.lineTo(-9,-38);ctx.lineTo(13,-6);ctx.lineTo(7,-4);ctx.closePath();},P.flag,OL,1.4);shape(()=>ctx.rect(-13,-5,26,4),P.armorDark,OL,1.4);shape(()=>ctx.rect(-3,-6,6,6),P.gold,OL,1);
    poly([-9,-38,9,-38,7,-44,-7,-44],P.armorDark,OL,1.6);
    ctx.save();ctx.translate(2,-54);oval(0,0,9,10,P.bone);ctx.strokeStyle=OL;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,9,10,0,0,TAU);ctx.stroke();
    shape(()=>{ctx.moveTo(-3,7);ctx.lineTo(7,7);ctx.lineTo(6,12);ctx.lineTo(-2,12);ctx.closePath();},P.boneDark,OL,1.4);for(let i=0;i<3;i++)line([-1+i*3,8,-1+i*3,11],.8,OL);
    circle(4,-1,2.8,P.socket);circle(-3,-1,2.4,P.socket);circle(4.4,-1,1.1,P.eye);circle(-2.8,-1,.9,P.eye);
    shape(()=>{ctx.moveTo(-10,2);ctx.quadraticCurveTo(-12,-12,0,-13);ctx.quadraticCurveTo(6,-13,8,-9);ctx.lineTo(3,-6);ctx.lineTo(5,-3);ctx.lineTo(-1,-4);ctx.lineTo(-4,3);ctx.closePath();},lg(0,-13,0,3,P.armorHi,P.armor),OL,1.8);
    shape(()=>{ctx.moveTo(-4,-12);ctx.bezierCurveTo(-14,-22,-24,-14,-30+Math.sin(t*3)*3,-10);ctx.bezierCurveTo(-22,-10,-14,-8,-8,-8);ctx.closePath();},P.flag,OL,1.4);
    ctx.globalAlpha=.55+.3*Math.sin(t*5);fl(4,-2,.3+(e.rage?.12:0),['#7a3aa8','#c58bff','#f4e6ff']);ctx.globalAlpha=1;ctx.restore();
    ctx.restore();
    legDraw(4,1,true);
    const E2=ik(near[0],near[1],gx,gy,16,16,-1);line([near[0],near[1],E2[0],E2[1]],5.4,P.armor,OL);line([E2[0],E2[1],gx,gy],3.4,P.bone,OL);circle(gx,gy,3.2,P.armorDark,OL,1.2);circle(h2x,h2y,3,P.armorDark,OL,1.2);
    ctx.beginPath();ctx.ellipse(near[0],near[1]+1,8,6,lean,Math.PI,0);ctx.fillStyle=P.armorHi;ctx.fill();ctx.strokeStyle=OL;ctx.lineWidth=1.6;ctx.stroke();line([near[0]-7,near[1]+1,near[0]+7,near[1]+1],1.4,P.gold);
    if(m==='thrust'&&e.act>0){ctx.save();ctx.globalAlpha=.4;ctx.fillStyle='#f2e6ff';ctx.beginPath();ctx.moveTo(tx,ty-4);ctx.lineTo(tx-90,ty-1);ctx.lineTo(tx-90,ty+1);ctx.lineTo(tx,ty+4);ctx.closePath();ctx.fill();ctx.restore();}}
  // 沉钟典狱长：钟形铜甲、钟形头盔，一手提着装满魂火的灯，一手拎着钟锤
  function drawWarden(e,P){const t=time+e.seed,m=e.move,w=e.wind>0?1-e.wind/e.wt:0,a=e.act>0&&e.at?1-e.act/e.at:0,ph=e.walk*.65,s=Math.sin(ph),c=Math.cos(ph),bob=Math.sin(t*2.2)*.8;
    let ha=1.2,lean=0,lx=-30,ly=-60,lsw=Math.sin(t*1.8)*.25+s*.2;
    if(m==='slam'){if(e.wind>0){ha=1.2-3.55*(1-Math.pow(1-w,2));lean=-.12*w;}else{ha=.42;lean=.16;}}
    else if(m==='toll'){if(e.wind>0){ha=1.2-2.9*w;lean=-.1*w;}else{ha=-1.25;lean=-.04;}}
    else if(m==='lantern'){if(e.wind>0){lx=-16;ly=-118-6*w;lsw=Math.sin(t*6)*.15;}else{lx=26;ly=-88;lsw=.6;}}
    else if(m==='sweep'){if(e.wind>0){lx=-40;ly=-96;lsw=-.9*w;}else if(e.act>0){lx=-30+70*a;ly=-82;lsw=-.6+2*a;}else{lx=32;ly=-78;lsw=.8;}}
    if(e.roar){ha=-1.5;lx=-20;ly=-112;}
    const sx=(x,y)=>[x*Math.cos(lean)-y*Math.sin(lean)+0,x*Math.sin(lean)+y*Math.cos(lean)];
    // 披风
    const cs=Math.sin(t*1.5)*4+s*3;poly([-24,-98+bob,16,-98+bob,14+cs,-4,2+cs,2,-10+cs,-6,-22+cs,2,-36+cs,-4,-48+cs*.6,-34,-40,-80],P.cape,OL,2.4);poly([-24,-98+bob,-10,-98+bob,-30+cs,-4,-48+cs*.6,-34,-40,-80],P.capeDark);line([-24,-98+bob,16,-98+bob],2.4,P.bronzeDark);
    const legW=(x,sg,near)=>{const J=joint(x,-42,sg*s*.36,-.1-Math.max(0,sg*c)*.55,20,20),col=near?P.iron:P.ironDark;line([x,-42,J[0],J[1],J[2],J[3]],near?11:10,col,OL);circle(J[0],J[1],5.4,near?P.bronze:P.bronzeDark,OL,1.6);poly([J[2]-8,J[3]-8,J[2]+7,J[3]-8,J[2]+13,J[3]-2,J[2]+13,J[3]+.5,J[2]-8.5,J[3]+.5],near?P.ironDark:'#1d2024',OL,1.4);};
    legW(-6,-1,false);
    // 提灯的手（远侧）和魂灯
    const LS=sx(-20,-92+bob),EL=ik(LS[0],LS[1],lx,ly,22,22,1);line([LS[0],LS[1],EL[0],EL[1],lx,ly],7,P.ironDark,OL);circle(lx,ly,4,P.leather,OL,1.4);
    {ctx.save();ctx.translate(lx,ly);ctx.rotate(lsw);for(let i=1;i<=3;i++)link(0,i*5,i%2?0:Math.PI/2,P.chain,2.6);ctx.translate(0,30);
      shape(()=>{ctx.moveTo(-12,-12);ctx.lineTo(12,-12);ctx.lineTo(14,12);ctx.lineTo(-14,12);ctx.closePath();},P.glass,OL,2);
      ctx.save();ctx.beginPath();ctx.rect(-12,-11,24,22);ctx.clip();circle(0,0,16,'rgba(139,225,206,.35)');for(let i=0;i<6;i++){const an=t*(2.4+(m==='lantern'&&e.wind>0?4:0))+i*TAU/6,fx=Math.cos(an)*7,fy=Math.sin(an)*5+2;fl(fx,fy+4,.32,['#2fa39b',P.soul,P.soulHi]);}ctx.restore();
      [-12,-4,4,12].forEach(x=>line([x,-12,x*1.15,12],2,P.bronze,OL));shape(()=>{ctx.moveTo(-15,-12);ctx.lineTo(15,-12);ctx.lineTo(8,-20);ctx.lineTo(-8,-20);ctx.closePath();},lg(0,-20,0,-12,P.bronzeHi,P.bronze),OL,1.8);shape(()=>ctx.rect(-15,12,30,4),P.bronze,OL,1.6);
      if(e.rage)shape(()=>{ctx.moveTo(-8,-8);ctx.lineTo(-2,0);ctx.lineTo(-6,8);},null,'rgba(230,255,250,.9)',1.2);ctx.restore();}
    // 钟形铜甲
    ctx.save();ctx.translate(0,bob);ctx.rotate(lean);
    shape(()=>{ctx.moveTo(-20,-66);ctx.lineTo(20,-66);ctx.quadraticCurveTo(24,-48,33,-36);ctx.quadraticCurveTo(0,-28,-33,-36);ctx.quadraticCurveTo(-24,-48,-20,-66);ctx.closePath();},lg(-33,0,33,0,P.bronzeDark,P.bronze,P.bronzeHi),OL,2.4);
    shape(()=>{ctx.moveTo(-33,-36);ctx.quadraticCurveTo(0,-28,33,-36);},null,P.bronzeHi,2);line([-26,-50,26,-50],1.6,'rgba(70,45,15,.6)');line([-29,-43,29,-43],1.2,'rgba(255,230,170,.35)');
    ctx.save();ctx.translate(16,-46);ctx.rotate(Math.sin(t*2+s)*.2);circle(0,0,5,null,P.ironHi,1.8);for(let i=0;i<4;i++){const kx=-4+i*2.6;line([kx,4,kx,12+i%2*3],1.4,i%2?P.bronzeHi:P.ironHi);}ctx.restore();
    shape(()=>{ctx.moveTo(-22,-64);ctx.lineTo(22,-64);ctx.lineTo(27,-96);ctx.lineTo(-27,-96);ctx.closePath();},lg(-27,0,27,0,P.bronzeDark,P.bronze,P.bronzeHi),OL,2.4);line([0,-94,0,-66],1.6,'rgba(255,230,170,.35)');
    shape(()=>{ctx.moveTo(0,-90);ctx.bezierCurveTo(-7,-90,-8,-80,-9,-74);ctx.lineTo(9,-74);ctx.bezierCurveTo(8,-80,7,-90,0,-90);},null,'rgba(60,38,12,.7)',1.6);
    for(let i=0;i<8;i++)link(-22+i*6.4,-92+i*3.6,i%2?.6:2.2,P.chain,3.4);
    if(e.rage)shape(()=>{ctx.moveTo(-14,-90);ctx.lineTo(-8,-80);ctx.lineTo(-14,-70);ctx.moveTo(12,-86);ctx.lineTo(16,-74);ctx.lineTo(10,-62);ctx.moveTo(-18,-50);ctx.lineTo(-10,-40);},null,'#ff9a50',1.8);
    // 钟形头盔：竖缝里透着火光
    ctx.save();ctx.translate(0,-98);shape(()=>{ctx.moveTo(0,-30);ctx.bezierCurveTo(-13,-30,-14,-12,-15,-4);ctx.quadraticCurveTo(-19,1,-19,4);ctx.lineTo(19,4);ctx.quadraticCurveTo(19,1,15,-4);ctx.bezierCurveTo(14,-12,13,-30,0,-30);},lg(-19,0,19,0,P.bronzeDark,P.bronze,P.bronzeHi),OL,2.4);
    shape(()=>ctx.ellipse(0,4,19,3.4,0,0,TAU),P.bronzeHi,OL,1.6);circle(0,-34,4.6,null,OL,3.6);circle(0,-34,4.6,null,P.bronze,2);
    shape(()=>ctx.rect(4,-24,4.4,20),P.slit);const hot=e.rage||(m==='toll'&&e.wind>0)||e.roar;circle(6.2,-16,hot?2.2:1.6,hot?'#ffe6a0':P.glow);circle(6.2,-9,hot?1.8:1.3,hot?'#ffe6a0':P.glow);
    shape(()=>{ctx.moveTo(-9,-22);ctx.quadraticCurveTo(-12,-12,-12,-4);},null,'rgba(255,240,200,.5)',1.6);ctx.restore();
    // 肩甲（钟沿形）
    [[-22,P.bronzeDark],[22,P.bronze]].forEach(q=>{shape(()=>{ctx.moveTo(q[0]-11,-88);ctx.quadraticCurveTo(q[0],-104,q[0]+11,-88);ctx.quadraticCurveTo(q[0],-84,q[0]-11,-88);ctx.closePath();},q[1],OL,1.8);});
    ctx.restore();
    legW(6,1,true);
    // 钟锤（近侧手）
    const HS=sx(18,-92+bob),hxp=HS[0]+Math.cos(ha)*26,hyp=HS[1]+Math.sin(ha)*26,EH=ik(HS[0],HS[1],hxp,hyp,16,16,1);line([HS[0],HS[1],EH[0],EH[1],hxp,hyp],7.6,P.iron,OL);
    const ex=hxp+Math.cos(ha)*62,ey=hyp+Math.sin(ha)*62;line([hxp-Math.cos(ha)*12,hyp-Math.sin(ha)*12,ex,ey],4,P.haft,OL);circle(hxp,hyp,4.4,P.leather,OL,1.4);
    ctx.save();ctx.translate(ex,ey);ctx.rotate(ha+Math.PI/2);ctx.scale(.62,.62);shape(()=>{ctx.moveTo(0,-22);ctx.bezierCurveTo(-15,-22,-16,-4,-18,10);ctx.quadraticCurveTo(-24,16,-25,20);ctx.lineTo(25,20);ctx.quadraticCurveTo(24,16,18,10);ctx.bezierCurveTo(16,-4,15,-22,0,-22);},lg(-25,0,25,0,P.bronzeDark,P.bronze,P.bronzeHi),OL,3);shape(()=>ctx.ellipse(0,20,25,4,0,0,TAU),P.bronzeHi,OL,2);line([-17,4,17,4],2,'rgba(70,45,15,.6)');ctx.restore();
    if(m==='slam'&&e.rec>0&&e.rt&&e.rec>e.rt*.6){ctx.save();ctx.globalAlpha=.5*(e.rec-e.rt*.6)/(e.rt*.4);ctx.strokeStyle='#fff3d6';ctx.lineWidth=8;ctx.beginPath();ctx.arc(HS[0],HS[1],80,-2.4,.42);ctx.stroke();ctx.restore();}}
  function drawBossModel(e,P){const k=e.kind||'warden';if(k==='lock')drawLock(e,P);else if(k==='brood')drawBrood(e,P);else if(k==='standard')drawStandard(e,P);else drawWarden(e,P);}
  // 首领身上的光：守锁兽的钥匙孔眼缝和炉心、溺灯的灯火、旗手的眼窝、典狱长的眼缝和魂灯
  function bossLights(e){const ec=e.x+e.w/2-cam,f=e.face,y0=e.y+e.h,k=e.kind,t=time+e.seed;
    if(k==='lock'){addLight(ec+f*70,y0-50,60,'#ffb04a',.35+(e.wind>0?.3:0));if(e.rage)addLight(ec+f*58,y0-26,90,'#ff8a3a',.5);}
    else if(k==='brood'){const u=1-e.under;addLight(ec,y0-86+Math.sin(t*1.7)*5+e.under*e.h,130,'#9be36a',(.28+(e.move==='spit'&&e.wind>0?.3:0)+(e.rage?.12:0))*Math.max(.25,u));}
    else if(k==='standard'){addLight(ec+f*6,y0-100,46,'#c58bff',.4+(e.rage?.25:0));if(e.rage)addLight(ec-f*30,y0-150,90,'#c58bff',.3);}
    else{addLight(ec+f*6,y0-112,44,'#ffb04a',.35+(e.rage?.3:0));addLight(ec-f*26,y0-34,100,'#8be1ce',.4+(e.move==='lantern'&&e.wind>0?.4:0));}}
  // 被砍中时：先白闪，身体朝受力方向一歪、横向一压再弹回；精英放大一圈，盔上长角、披金边斗篷
  // 出手前没有任何警示框：小怪靠收刀的姿势和刃口一闪，首领靠各自的起手动作
  // ---- 新小怪的样子：出手前的动作就是全部提示 ----
  // 游魂蝠：空心骨头小脑袋，眼窝里一点余火，两片膜翅。蓄力时翅膀高高扬起、身子后仰；俯冲时翅膀收拢、头朝前
  function batWing(flap,c1,c2){const tx=-22,ty=-flap*18-4;shape(()=>{ctx.moveTo(3,-3);ctx.lineTo(tx*.45,ty*.8-4);ctx.lineTo(tx,ty);ctx.quadraticCurveTo(tx*.8+2,ty*.5+2,tx*.6,ty*.35+3);ctx.quadraticCurveTo(tx*.45,ty*.2+1,tx*.3,ty*.15+4);ctx.quadraticCurveTo(-3,2,0,3);ctx.closePath();},c1,OL,1.3);line([3,-3,tx*.45,ty*.8-4,tx,ty],1,c2);}
  function drawFlyer(e,P,w){const S=foeStyle(e),t=time*12+(e.seed||0),f=e.flash>0?'#fff':e.frozen>0?'#b8eaff':S.fire,flap=e.fly==='dive'?-.65:Math.sin(t)*.55;ctx.save();ctx.translate(0,-12);ctx.rotate(w*-.4+(e.fly==='dive'?.35:0));
    for(let side=-1;side<=1;side+=2){ctx.save();ctx.scale(side,1);ctx.rotate(flap);shape(()=>{ctx.moveTo(0,-3);ctx.quadraticCurveTo(-7,-18,-20,-15);ctx.quadraticCurveTo(-18,-5,-22,3);ctx.lineTo(-13,0);ctx.lineTo(-9,7);ctx.lineTo(-4,2);ctx.closePath();},e.flash>0?'#fff':S.cloth,OL,1.3);line([-3,-3,-17,-12,-13,-1],.8,S.metal);oval(-11,-7,3,2,f);oval(-11,-7,1.3,1.3,S.dark);ctx.restore();}
    soulCage(0,0,Object.assign({},S,{fire:f}),e.flash>0);line([-3,-10,-6,-16],1,S.metal);line([3,-10,7,-15],1,S.metal);line([-2,7,-4,12+Math.sin(t)*2],1.1,f);line([2,7,5,10+Math.cos(t)*2],1.1,f);glint(7,-2,w);ctx.restore();}
  // 持盾狱卒：一面比人还高的塔盾挡在身前，转身很慢；蓄力时盾往后收、身子后仰，然后整个人连盾撞过来。被重击破防时盾歪到一边、人往后踉跄
  function drawShieldFoe(e,P,w,sw){const ph=e.walk,s=Math.sin(ph),c=Math.cos(ph),hip=-21;const L1=joint(-3,hip,s*.35,-.1-Math.max(0,c)*.6,10,11),R1=joint(3,hip,-s*.35,-.1-Math.max(0,-c)*.6,10,11);ctx.translate(0,-Math.max(L1[3],R1[3]));
    line([-3,hip,L1[0],L1[1],L1[2],L1[3]],5.4,P.pantsDark,OL);boot(L1[2],L1[3],P.boot);line([3,hip,R1[0],R1[1],R1[2],R1[3]],6,P.pants,OL);boot(R1[2],R1[3],P.boot);
    const brk=e.brk>0,bash=sw>=0?Math.sin(Math.min(1,sw*1.8)*Math.PI/2):0,back=w>0?w:0;ctx.save();ctx.translate(0,hip);ctx.rotate(brk?-.28+Math.sin(time*20)*.04:-.2*back+.24*bash);
    line([-4,-15,-9,-6,-6,1],3.4,P.armorDark,OL);poly([-9,2,9,2,10,-18,-10,-18],P.armorDark,OL,2);poly([-8,0,8,0,9,-17,-9,-17],P.armor);box(-6,-15,4,6,P.armorHi);poly([-7,0,7,0,6,12,-6,12],P.tabard,OL,1.4);box(-9,-1.5,18,3,P.belt);
    const hy=-25;poly([-7,hy+7,7,hy+7,8,hy-6,0,hy-11,-8,hy-6],P.helm,OL,2);box(-1,hy-8,3,13,P.visor);box(-6,hy-1,13,2.4,P.visor);circle(4.5,hy,1.2,P.eye);
    captiveFace(1,hy,foeStyle(e),e.flash>0);for(let i=-5;i<=5;i+=5)line([i,hy-7,i,hy+5],1.2,P.helm);soulCage(-3,-9,foeStyle(e),e.flash>0);
    const sx=12+bash*10-back*5,sy=-12+(brk?6:0),body=()=>{ctx.moveTo(-5,-22);ctx.lineTo(6,-20);ctx.lineTo(7,15);ctx.quadraticCurveTo(1,25,-5,17);ctx.closePath();};
    ctx.save();ctx.translate(sx,sy);ctx.rotate(brk?.65:-.25*back);shape(body,lg(-5,0,7,0,P.shieldHi,P.shield,P.shieldDark),OL,1.8);line([1,-19,1.5,17],1.2,P.shieldDark);[[-2,-15],[4,-14],[-2,10],[4,11]].forEach(q=>circle(q[0],q[1],1,P.shieldHi));circle(1.5,-1,3.2,P.trim,OL,1);
    line([-3,-17,-3,14],1,P.shieldDark);line([4,-17,4,14],1,P.shieldDark);circle(1,-1,1.3,foeStyle(e).fire);if(e.blockT>0){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=e.blockT/.25;shape(body,'#fff1c2');ctx.restore();}ctx.restore();line([5,-15,9,-10,sx-4,sy],3.6,P.armor,OL);ctx.restore();}
  // 骨巫：长袍下摆飘着，手里一根挂灯的骨杖。施法时把杖举高、灯越来越亮；闪走时整个人淡成一缕烟
  function drawCaster(e,P,w,sw){const t=time*2+e.seed,raise=w>0?w:sw>=0?1-sw:0;if(e.blink>0)ctx.globalAlpha*=Math.max(.06,e.blink>.25?(e.blink-.25)/.25:(.25-e.blink)/.25);ctx.translate(0,Math.sin(t)*2-3);
    shape(()=>{ctx.moveTo(-9,-34);ctx.quadraticCurveTo(-13,-14,-14,0);for(let i=0;i<4;i++){const x0=-14+i*7;ctx.quadraticCurveTo(x0+3.5,4+Math.sin(t*3+i)*2,x0+7,0);}ctx.quadraticCurveTo(13,-14,9,-34);ctx.closePath();},lg(-12,0,12,0,P.robeDark,P.robe,P.robeDark),OL,1.6);
    shape(()=>{ctx.moveTo(-9,-34);ctx.quadraticCurveTo(-10,-50,1,-52);ctx.quadraticCurveTo(11,-50,10,-36);ctx.closePath();},P.hood,OL,1.6);shape(()=>ctx.ellipse(3,-42,4.4,5,0,0,TAU),P.skull,OL,1);circle(4.6,-42.5,1.3,P.socket);circle(1.8,-42.5,1.1,P.socket);circle(4.6,-42.5,.6,P.eye);box(1.6,-39,3.6,.9,P.socket);
    captiveFace(3,-42,foeStyle(e),e.flash>0);for(let i=0;i<7;i++)circle(-8+i*2.8,-31+Math.sin(i*Math.PI/6)*5,1.2,P.skull);poly([-3,-24,3,-24,2,-9,0,-5,-3,-9],P.skull,OL,.8);line([0,-22,0,-12],.8,P.robeDark);
    ctx.save();ctx.translate(9,-26);ctx.rotate(.15-raise*.55);line([0,26,0,-30],2.2,P.staff,OL);soulCage(0,-33,foeStyle(e),e.flash>0);ctx.restore();line([3,-30,9,-23],2.6,P.robe,OL);
    if(raise>0&&!e.dead)addLight(e.x+e.w/2-cam+e.face*12,e.y+e.h-60,40+raise*60,P.glow,.2+raise*.4);}
  // 投弹手：驼背，背一篓罐子；扔之前手臂往后抡，手里的罐子越来越亮
  function drawBomber(e,P,w,sw){const ph=e.walk,s=Math.sin(ph),hip=-18;line([-3,hip,-4+s*3,-8,-4+s*4,0],3,P.legs,OL);line([3,hip,3-s*3,-8,4-s*4,0],3.4,P.legs,OL);
    ctx.save();ctx.translate(0,hip);ctx.rotate(.22-(w>0?.22*w:0)+(sw>=0?.3*(1-sw):0));
    shape(()=>ctx.rect(-17,-22,11,18),P.pack,OL,1.5);[[-14.5,-26],[-9,-28]].forEach(q=>shape(()=>ctx.ellipse(q[0],q[1],2.6,4,0,0,TAU),P.flask,OL,1));
    shape(()=>{ctx.moveTo(-8,1);ctx.quadraticCurveTo(-10,-16,-4,-22);ctx.quadraticCurveTo(4,-26,8,-18);ctx.quadraticCurveTo(10,-8,8,2);ctx.closePath();},P.cloak,OL,1.6);circle(5,-24,5.5,P.mask,OL,1.4);box(4,-26.5,5.5,2.2,P.lens);circle(8.2,-25.4,1.3,P.eye);
    soulCage(-12,-16,foeStyle(e),e.flash>0);captiveFace(5,-24,foeStyle(e),e.flash>0);line([0,-26,10,-26],1.4,P.mask);poly([-3,-32,11,-32,8,-37,0,-38],P.pack,OL,1.2);
    const arm=w>0?.6-3*w:sw>=0?-2.4+3*Math.min(1,sw*2):.6,hx=2+Math.cos(arm)*12,hy=-17+Math.sin(arm)*12;line([2,-17,hx,hy],2.6,P.cloak,OL);
    if(!(sw>=0&&sw<.85)){shape(()=>ctx.ellipse(hx,hy-2,3.4,4.4,0,0,TAU),P.flask,OL,1);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.3+.6*w;circle(hx,hy-2,5+5*w,P.glow);ctx.restore();}ctx.restore();}
  // 教程的稻草人：木桩绑着草人，麻袋脑袋画着笑脸；挨打会晃
  function drawDummy(e){const k=e.hitT>0?Math.sin(e.hitT*40)*e.hitT*1.4:0;line([0,0,0,-52],3.2,'#6a4a2f',OL);ctx.save();ctx.translate(0,-30);ctx.rotate(k);line([-13,-6,13,-6],3,'#6a4a2f',OL);shape(()=>{ctx.moveTo(-9,-12);ctx.quadraticCurveTo(-12,4,-7,14);ctx.lineTo(7,14);ctx.quadraticCurveTo(12,4,9,-12);ctx.closePath();},'#c8a860',OL,1.4);line([-8,0,8,0],1.4,'#8a6a3a');line([-8,6,8,6],1.2,'#8a6a3a');
    circle(0,-18,7.5,'#d8c49a',OL,1.4);circle(-2.6,-19,1,'#3a2a1a');circle(2.6,-19,1,'#3a2a1a');ctx.strokeStyle='#3a2a1a';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-17,3,.3,Math.PI-.3);ctx.stroke();ctx.restore();}
  // 首领倒下的过场姿势：守锁兽瘫软、溺灯往水里沉、旗手跪下、典狱长往后仰
  function deathPose(e,k){if(e.kind==='lock')ctx.scale(1+.08*k,1-.16*k);else if(e.kind==='brood')ctx.translate(0,k*36);else if(e.kind==='standard'){ctx.translate(0,k*16);ctx.rotate(-e.face*.14*k);}else{ctx.translate(0,k*8);ctx.rotate(-e.face*.12*k);}}
  function drawLurker(e,P,w,sw){const crouch=4+w*7,lunge=sw>=0?sw:0;ctx.save();ctx.translate(lunge*10,crouch);
    shape(()=>{ctx.moveTo(-12,-8);ctx.quadraticCurveTo(-16,-20-w*4,0,-22-w*3);ctx.quadraticCurveTo(14,-18,12,-6);ctx.lineTo(8,2);ctx.quadraticCurveTo(0,6,-8,2);ctx.closePath();},P.cloth,OL,1.4);
    shape(()=>{ctx.moveTo(-8,-16);ctx.quadraticCurveTo(0,-24-w*4,8,-14);ctx.lineTo(6,-8);ctx.quadraticCurveTo(0,-12,-6,-8);ctx.closePath();},P.hood,OL,1.2);
    circle(-3,-15,1.5+w,P.eye);circle(4,-15,1.5+w,P.eye);if(w>0){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.35+w*.4;circle(0,-15,8+w*6,P.eye);ctx.restore();}
    line([-10,-2,-16,4+lunge*2],2,P.claw,OL);line([8,-2,16+lunge*8,2],2,P.claw,OL);line([-4,2,-6,8],1.6,P.clothHi);line([3,2,6,8],1.6,P.clothHi);ctx.restore();}
  function drawSpear(e,P,w,sw){const pull=w>0?-10*w:sw>=0?16*(1-sw):0;
    shape(()=>{ctx.moveTo(-7,0);ctx.lineTo(-8,-28);ctx.quadraticCurveTo(0,-40,8,-28);ctx.lineTo(7,0);ctx.closePath();},P.robe,OL,1.4);box(-8,-8,16,3,P.robeHi);
    shape(()=>{ctx.moveTo(-6,-30);ctx.quadraticCurveTo(0,-40,6,-30);ctx.lineTo(4,-24);ctx.lineTo(-4,-24);ctx.closePath();},P.helm,OL,1.2);circle(2,-32,1.3,P.eye);
    ctx.save();ctx.translate(8+pull,-18);ctx.rotate(-.35+ (sw>=0?.5*(1-sw):0));line([0,6,0,-22],2.4,P.haft,OL);poly([0,-22,-3,-16,3,-16],P.tip,OL,1.1);box(-1,4,2,6,P.wrap);ctx.restore();
    line([-5,0,-7,10],2,P.pants);line([4,0,6,10],2,P.pants);}
  function drawLampWard(e){
    const colors=wickArt[L.theme],open=e.phaseName==='open',aim=e.phaseName==='aim',strike=e.phaseName==='strike';
    const t=e.age/e.span,flap=Math.sin(time*3)*2,spread=open?10:aim?-2:1;
    ctx.save();ctx.rotate(strike?.38:aim?-.18:open?.12:0);
    for(const d of [-1,1]){
      const edge=d*(13+spread);
      poly([d*4,-36,edge,-29,edge+d*6,-10+flap,d*9,-17,d*4,-12],lg(0,-38,0,-8,'#5f6974','#303949','#1d2635'),OL,1.5);
      line([d*5,-34,edge,-27,edge+d*4,-14+flap],1.5,'#c39f70');
    }
    poly([-10,-41,-5,-47,3,-45,11,-48,10,-36,3,-29,-7,-32],lg(-9,0,11,0,'#495765','#9a9c91','#394350'),OL,1.4);
    line([1,-38,8,-39],aim?3:2,aim?'#ff9a73':colors[1]);livingFlame(0,-17,open?.73:.33,colors,e.slot);
    if(e.scout){
      for(const d of [-1,1])ribbon(d*7,-28,d*17,-33+flap,d*22,-37-flap,5,.7,colors[1],OL,6);
      circle(0,-36,2.5,aim?'#fff0ab':colors[1]);
    }
    box(-22,-55,44,4,'#25242a');box(-21,-54,42*e.hp/e.max,2,open?'#fff2bc':colors[1]);
    if(e.flash>0){ctx.save();ctx.globalAlpha=e.flash/.13;line([-8,-39,-3,-44,2,-41,8,-44],2,'#fff7d8');ctx.restore();}
    if(aim||strike){const reach=strike?35:11+8*t;line([6,-24,reach,-22,reach+16,-25],2.7,'#f0bb83',OL);}
    ctx.restore();
    if(aim){const dest=(e.aimX-e.x)*e.face,y=e.scout?e.aimY-e.y-e.h:-2;ctx.save();ctx.globalAlpha=.45+.3*t;line([0,e.scout?-e.h/2:-2,dest,y],2,'#ffab7d');circle(dest,y,3,'#ffe3bd');ctx.restore();}
  }
  function drawEnemy(e){const boss=e.type==='boss',el=e.elite,P0=boss?BOSS_PAL[e.kind]:el?PAL.elite:PAL[e.type]||PAL.guard,inCine=boss&&cine&&cine.e===e&&!cine.boom,P=e.flash>0||(inCine&&Math.floor(cine.t*14)%3===0)?FLASH:e.frozen>0?iceOf(P0):P0,w=e.wind>0&&!e.dead?1-e.wind/(e.wt||.48):0,sw=e.swing>0?1-e.swing/.22:-1;
    if(el&&!e.dead)addLight(e.x+e.w/2-cam,e.y+e.h*.5,70,'#ffc46a',.22+.05*Math.sin(time*6));
    if(inCine)cineRays(e);
    footShadow(e.x+e.w/2,e.type==='hanger'&&e.hang!=='land'?e.floor-2:e.y+e.h-1,Math.max(9,e.w*.42)*(e.type==='hanger'&&e.hang!=='land'?.55:1));
    ctx.save();if(boss&&e.under>0){ctx.beginPath();ctx.rect(e.x-260,viewY-60,e.w+520,FLOOR-viewY+62);ctx.clip();}
    ctx.translate(e.x+e.w/2,e.y+e.h+(boss?e.under*(e.h+40):0));
    if(e.dead){if(inCine){const k=Math.min(1,cine.t/2.1);ctx.translate((Math.random()-.5)*(2+9*k),(Math.random()-.5)*3*k);deathPose(e,k);}else if(boss){const k=Math.min(1,e.dieT/1.6);ctx.globalAlpha=Math.min(1,k*2.2);}else{const k=e.dieT/.45;ctx.globalAlpha=k;ctx.rotate(-e.face*(1-k)*1.15);}}
    if(e.hitT>0){const k=e.hitT/.2*(boss?.4:1);ctx.rotate((e.hitDir||0)*.16*k);ctx.scale(1+.12*k,1-.09*k);}
    if(boss&&talk&&talk.arena&&!e.dead){const beat=Math.sin(Math.min(1,sceneT/1.25)*Math.PI);ctx.rotate(e.face*beat*(e.kind==='standard'?.07:.035));ctx.scale(1+beat*.024,1-beat*.025);}ctx.scale(e.face,1);if(el)ctx.scale(1.35,1.35);const t=e.type;
    if(e.ward)drawLampWard(e);else if(boss)drawBossModel(e,P);else if(t==='flyer')drawFlyer(e,P,w);else if(t==='shield')drawShieldFoe(e,P,w,sw);else if(t==='caster')drawCaster(e,P,w,sw);else if(t==='bomber')drawBomber(e,P,w,sw);else if(t==='crawler')drawCrawler(e,P,w,sw);else if(t==='hanger')drawHanger(e,P,w);else if(t==='dummy')drawDummy(e);
    else if(t==='lurker')drawLurker(e,P,w,sw);else if(t==='spear')drawSpear(e,P,w,sw);else if(t==='archer'){if(L.theme==='prison')drawArcher(e,P,w,sw);else drawBiomeArcher(e,P,w,sw);}else drawStoryGuard(e,P,w,sw);
    ctx.restore();
    if(boss&&e.under>0&&!e.dead){const ec=e.x+e.w/2;ctx.strokeStyle='rgba(190,255,160,.5)';ctx.lineWidth=2;for(let i=0;i<3;i++){const r=(time*.9+i/3)%1;ctx.globalAlpha=(1-r)*e.under;ctx.beginPath();ctx.ellipse(ec,FLOOR-2,20+r*50,4+r*6,0,0,TAU);ctx.stroke();}ctx.globalAlpha=1;}
    if(e.dead){if(inCine)addLight(e.x+e.w/2-cam,e.y+e.h/2,140+cine.t*60,BOSSES[e.kind].color,.4+cine.t*.2);return;}
    if(e.frozen>0){for(let i=0;i<3;i++){const ix=e.x+e.w*(.2+.3*i),iy=e.y+e.h*(.3+.3*(i%2));poly([ix,iy-7,ix+3.5,iy,ix,iy+7,ix-3.5,iy],'rgba(230,247,255,.85)');}addLight(e.x+e.w/2-cam,e.y+e.h/2,54,'#a8dcff',.3);}
    if(e.daze>0||e.brk>0){ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<3;i++){const a=time*6+i*TAU/3;sparkle2(e.x+e.w/2+Math.cos(a)*13,e.y-9+Math.sin(a)*4,3.2,'rgba(255,240,180,.9)');}ctx.restore();}
    if(boss)bossLights(e);else if(t!=='dummy')addLight(e.x+e.w/2-cam+e.face*4,t==='flyer'?e.y+10:e.y+e.h-(el?62:t==='caster'?50:46),24,t==='caster'?P0.glow||'#c58bff':'#ff9a4a',.18);
    if(!boss&&!e.ward&&e.hp<e.max){box(e.x-6,e.y-20,e.w+12,4,'#2a2028');box(e.x-6,e.y-20,(e.w+12)*e.hp/e.max,4,el?'#e0b24f':'#d3977c');}}
  // 首领倒下时身上裂出的光柱，慢慢转
  function cineRays(e){const ec=e.x+e.w/2,ey=e.y+e.h/2,k=Math.min(1,cine.t/2.1),c=BOSSES[e.kind].color;ctx.save();ctx.globalCompositeOperation='lighter';ctx.translate(ec,ey);for(let i=0;i<9;i++){const a=i/9*TAU+time*.4,len=60+k*260,wd=.05+.03*Math.sin(time*7+i);ctx.globalAlpha=(.15+.35*k)*(.6+.4*Math.sin(time*9+i*2));ctx.fillStyle=i%2?c:'#fff1c2';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a-wd)*len,Math.sin(a-wd)*len);ctx.lineTo(Math.cos(a+wd)*len,Math.sin(a+wd)*len);ctx.closePath();ctx.fill();}ctx.restore();}
  // ---- 特效 ----
  // 飞行物：箭、典狱长的魂火（青白色、拖着尾巴）、溺灯的腐潮弹（绿色黏团）、灯蛾（扑着翅膀的小灯）
  function drawShots(){for(const s of shots){const t=s.t||0;ctx.save();ctx.translate(s.x,s.y);
      if(s.k==='flame'||s.flame){const a=Math.atan2(s.vy||0,s.vx);ctx.rotate(a);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.35;shape(()=>{ctx.moveTo(4,0);ctx.quadraticCurveTo(-10,-9,-34,0);ctx.quadraticCurveTo(-10,9,4,0);},'#5fd8c4');ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.rotate(-a);fl(0,8,.62+.08*Math.sin(t*20),['#2fa39b','#8be1ce','#effff9']);circle(-2,-1,1.1,'#0b2a28');circle(2,-1,1.1,'#0b2a28');ctx.restore();addLight(s.x-cam,s.y,52,'#8be1ce',.55);continue;}
      if(s.k==='glob'){const r=7+Math.sin(t*18),d=s.vx>=0?1:-1,c=s.fire?['#ffe6a8','#ff9a3a','#8a2a10']:['#e8ffb8','#8fd65a','#3f7a2a'];circle(-4*d,-r-1,2.6,c[1],OL,1);circle(-8*d,-r-6,1.7,c[1]);circle(0,0,r,rg(-2,-2,r+2,c[0],c[1],c[2]),OL,1.4);circle(-2,-3,1.6,'rgba(255,255,255,.7)');ctx.restore();addLight(s.x-cam,s.y,40,s.fire?'#ffb347':'#9be36a',.45);continue;}
      // 骨巫的魂火（钟楼里是橙色的）、弩炮的重弩箭
      if(s.k==='wisp'){const c=L.theme==='tower'?['#c4501c','#ffb347','#fff1c2']:['#6a3a9a','#c58bff','#f4eaff'];fl(0,8,.55+.06*Math.sin(t*22),c);circle(-2,-1,1,'#1a0a24');circle(2,-1,1,'#1a0a24');ctx.restore();addLight(s.x-cam,s.y,44,c[1],.5);continue;}
      if(s.k==='bolt'){ctx.scale(s.vx>0?1:-1,1);ctx.globalAlpha=.3;box(-48,-1,30,2,'#ffe6b0');ctx.globalAlpha=1;line([-24,0,14,0],3.6,'#7a5634',OL);poly([14,-5,26,0,14,5],'#aab3b8',OL,1.4);poly([-24,0,-31,-6,-27,0,-31,6],'#c9b48a',OL,1);ctx.restore();continue;}
      if(s.k==='moth'){const f=Math.sin(t*30);ctx.scale(s.vx>=0?1:-1,1);ctx.globalAlpha=.6;oval(-5,-5-f*3,7,3.5+f*2,'#dff5cc');oval(5,-5+f*3,7,3.5-f*2,'#dff5cc');ctx.globalAlpha=1;shape(()=>ctx.rect(-4,-5,8,10),'#d8ff9a',OL,1.2);shape(()=>{ctx.moveTo(-5,-5);ctx.lineTo(5,-5);ctx.lineTo(2,-9);ctx.lineTo(-2,-9);ctx.closePath();},'#8a7a50',OL,1);circle(0,0,1.6,'#ffffff');ctx.restore();addLight(s.x-cam,s.y,34,'#c8ff8a',.45);continue;}
      ctx.scale(s.vx>0?1:-1,1);ctx.rotate(Math.atan2(s.vy||0,Math.abs(s.vx)));ctx.globalAlpha=.25;box(-30,-.6,18,1.2,'#ffd9a0');ctx.globalAlpha=1;line([-12,0,8,0],1.5,'#c9b48a',OL);poly([8,-2.6,14,0,8,2.6],s.color||'#dfe3e0',OL,1);poly([-12,0,-16,-3.2,-13.5,0,-16,3.2],'#b9ad94');ctx.restore();}}
  // 冲击波：默认是从地里拱起的一道碎石；旗手的风是贴地的半透明气浪；典狱长的钟声是一圈圈高高的金色声纹
  function drawWaves(){for(const w of waves){const a=clamp(w.life/.4,0,1),t=w.t||0;ctx.save();ctx.globalAlpha=a;ctx.translate(w.x,FLOOR);ctx.scale(w.dir,1);
      if(w.k==='gust'){ctx.globalCompositeOperation='lighter';for(let i=0;i<3;i++){const o=i*12,h=(w.h||46)-i*8;ctx.globalAlpha=a*(.55-i*.13);ctx.strokeStyle=i?'#d8b3ff':'#f4eaff';ctx.lineWidth=5-i;ctx.beginPath();ctx.moveTo(-o-34,-3);ctx.quadraticCurveTo(-o+6,-h,-o+20,-3);ctx.stroke();}for(let i=0;i<4;i++){ctx.globalAlpha=a*.5;line([-50-i*14+Math.sin(t*20+i)*3,-8-i*8,-28-i*14,-8-i*8],1.4,'#e8d8ff');}ctx.restore();addLight(w.x-cam,FLOOR-20,60,'#d8b3ff',.3*a);continue;}
      if(w.k==='toll'){ctx.globalCompositeOperation='lighter';const h=w.h||150;for(let i=0;i<3;i++){ctx.globalAlpha=a*(.75-i*.22);ctx.strokeStyle=i?'#ffd89a':'#fff3d6';ctx.lineWidth=6-i*1.6;ctx.beginPath();ctx.ellipse(-i*14,-h/2,16+i*6+Math.sin(t*30)*1.5,h/2,0,-Math.PI/2,Math.PI/2);ctx.stroke();}ctx.restore();addLight(w.x-cam,FLOOR-70,90,'#ffcf80',.4*a);continue;}
      const j=Math.sin(t*40)*1.5;poly([-24,0,-15,-12+j,-6,-24,4,-16-j,11,-30+j,18,-12,26,0],'#8a7a66',OL,1.4);poly([-9,-6,-1,-19,6,-10],'#b8a68a');poly([8,-8,12,-22,16,-9],'#a8987e');ctx.strokeStyle='rgba(255,226,170,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-28,0);ctx.quadraticCurveTo(0,-36,28,0);ctx.stroke();ctx.restore();addLight(w.x-cam,FLOOR-12,50,'#ffb070',.22*a);}}
  // 首领的机关：落石（先掉灰再砸下）、腐水洼、灵枪（先冒紫烟、地面裂开，再刺出来）
  function drawHazards(){for(const h of hazards){
      if(h.k==='rock'){if(h.delay>0)continue;ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.r);ctx.scale(h.s,h.s);poly([-11,-6,-4,-12,8,-10,12,-2,7,9,-6,10,-12,3],'#7d776c',OL,1.6);poly([-6,-8,4,-9,6,-3,-4,-2],'#a39c8e');ctx.restore();continue;}
      if(h.k==='pool'){const k=clamp(h.life/.5,0,1),ww=h.w*(.6+.4*Math.min(1,(h.max-h.life)*6)),fire=h.fire;ctx.globalAlpha=k;ctx.fillStyle=fire?'rgba(255,140,50,.75)':'rgba(120,210,70,.75)';ctx.beginPath();ctx.ellipse(h.x,FLOOR+1,ww/2,4,0,0,TAU);ctx.fill();ctx.fillStyle=fire?'rgba(255,226,160,.9)':'rgba(215,255,170,.85)';for(let i=0;i<3;i++){const tt=(time*(fire?2.2:1.4)+i*.33)%1;ctx.globalAlpha=k*(1-tt);ctx.beginPath();ctx.arc(h.x-ww/3+i*ww/3,FLOOR-tt*(fire?14:8),1+tt*1.8,0,TAU);ctx.fill();}ctx.globalAlpha=1;if(fire)for(let i=-1;i<=1;i++)fl(h.x+i*ww/3,FLOOR,.42*k+.05*Math.sin(time*12+i));addLight(h.x-cam,FLOOR,ww,fire?'#ffb347':'#9be36a',.28*k);continue;}
      if(h.k==='spear'){if(h.delay>0){const k=1-clamp(h.delay/.5,0,1);ctx.strokeStyle='rgba(24,12,34,'+(.35+.45*k).toFixed(2)+')';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(h.x-14*k,FLOOR+1);ctx.lineTo(h.x-4,FLOOR-1);ctx.lineTo(h.x+3,FLOOR+1);ctx.lineTo(h.x+12*k,FLOOR);ctx.stroke();continue;}
        const tt=h.t||0,rise=Math.min(1,tt/.08),fade=clamp(h.life/.25,0,1),H=96*rise,c=h.warm?['rgba(200,90,30,.25)','rgba(255,180,100,.85)','rgba(255,244,220,.95)']:['rgba(140,80,200,.25)','rgba(200,150,255,.85)','rgba(250,238,255,.95)'];ctx.save();ctx.globalAlpha=fade;ctx.globalCompositeOperation='lighter';shape(()=>{ctx.moveTo(h.x-8,FLOOR);ctx.lineTo(h.x-4,FLOOR-H+18);ctx.lineTo(h.x,FLOOR-H);ctx.lineTo(h.x+4,FLOOR-H+18);ctx.lineTo(h.x+8,FLOOR);ctx.closePath();},lg(0,FLOOR,0,FLOOR-H-1,c[0],c[1],c[2]));ctx.restore();addLight(h.x-cam,FLOOR-50,70,h.warm?'#ffb04a':'#c58bff',.4*fade);}}}
  // 得到的东西：画成图，先弹起来再飞进主角怀里
  function drawLoot(){for(const o of loot){const k=Math.min(1,o.t/.15+.3),s=30+8*Math.sin(Math.min(1,o.t*2.5)*Math.PI);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.35*k;circle(o.x,o.y,s*.62,'#ffe2a8');ctx.restore();drawArt(o.id,o.x,o.y,s,k);}}
  // 开箱：盖子掀开后，三样奖励从箱子里浮起来，选的时候一直悬在箱子上方
  function drawReveal(){const c=revealC||(state==='chest'?chestC:null);if(!c||!offers.length)return;const k=state==='chest'?clamp((c.openT-.45)/.55,0,1):1;if(k<=0)return;const e=1-Math.pow(1-k,3);
    offers.forEach((o,i)=>{const x=c.x+(i-1)*46*e,y=c.y-34-58*e+Math.sin(time*2+i*2)*3;ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.45*e;circle(x,y,24,'#ffd9a0');ctx.restore();drawArt(o.id,x,y,42*e,e);});addLight(c.x-cam,c.y-80,130,'#ffd38a',.45*e);}
  function drawParticles(){for(const f of particles){if(f.glow||f.streak)continue;ctx.globalAlpha=clamp(f.life/f.max,0,1)*(f.soft?.5:1);ctx.fillStyle=f.color;if(f.soft){ctx.beginPath();ctx.arc(f.x,f.y,f.size,0,TAU);ctx.fill();}else ctx.fillRect(f.x,f.y,f.size,f.size);}
    ctx.globalCompositeOperation='lighter';ctx.lineCap='round';for(const f of particles){if(f.streak){ctx.globalAlpha=clamp(f.life/f.max,0,1);ctx.strokeStyle=f.color;ctx.lineWidth=f.size;ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x-f.vx*.035,f.y-f.vy*.035);ctx.stroke();continue;}if(!f.glow)continue;const a=clamp(f.life/f.max,0,1);ctx.globalAlpha=a;ctx.fillStyle=f.color;ctx.beginPath();ctx.arc(f.x,f.y,f.size,0,TAU);ctx.fill();ctx.globalAlpha=a*.22;ctx.beginPath();ctx.arc(f.x,f.y,f.size*3.2,0,TAU);ctx.fill();}
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;}
  function drawOrbs(){if(!orbs.length)return;ctx.globalCompositeOperation='lighter';for(const o of orbs){ctx.globalAlpha=.35;ctx.fillStyle='#ff9a3a';ctx.beginPath();ctx.arc(o.x,o.y,6,0,TAU);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#ffe1a6';ctx.beginPath();ctx.arc(o.x,o.y,2.2,0,TAU);ctx.fill();}ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;}
  // 伤害数字先弹大再回落，重劈的更大
  function drawFloats(){if(bossCardT>0)return;for(const f of floats){ctx.globalAlpha=clamp(f.life/.35,0,1);if(f.art){const k=f.life/1.2,sz=28*(k>.85?1+(k-.85)*2.2:1);drawArt(f.art,f.x-(f.t?11:0),f.y-4,sz);if(f.t)text(f.t,f.x+5,f.y+2,15,f.c,'left',true);continue;}const k=f.life/.75,s=(f.big?23:17)*(k>.82?1+(k-.82)*2.5:1);text(f.t,f.x,f.y,Math.round(s),f.c,'center',true);}ctx.globalAlpha=1;}
  // 斩痕：沿刀势的一道细长亮光，先拉长再变细消失；星芒：命中点一闪；冲击波：重劈和击杀时扩散的圆环
  function drawFx(){if(!fx.length)return;ctx.save();ctx.globalCompositeOperation='lighter';
    for(const f of fx){if(f.k==='icon')continue;const k=f.life/f.max,u=1-k;ctx.save();ctx.translate(f.x,f.y);
      if(f.k==='kindle'){const px=(f.toX-f.x)*u,py=(f.toY-f.y)*u-Math.sin(u*Math.PI)*16;
        ctx.globalAlpha=Math.sin(u*Math.PI);line([px-6,py+2,px,py],2,f.c);circle(px,py,3,f.c);}
      else if(f.k==='cut'){ctx.rotate(f.a);const len=f.len*(.55+.45*Math.min(1,u*3)),wd=(f.len>100?9:6)*k;ctx.globalAlpha=Math.min(1,k*1.6);ctx.fillStyle='#ffc86a';ctx.beginPath();ctx.moveTo(-len/2,0);ctx.quadraticCurveTo(0,-wd*1.8,len/2,0);ctx.quadraticCurveTo(0,wd*1.8,-len/2,0);ctx.fill();
        ctx.fillStyle='#ffffff';ctx.beginPath();ctx.moveTo(-len/2,0);ctx.quadraticCurveTo(0,-wd*.7,len/2,0);ctx.quadraticCurveTo(0,wd*.7,-len/2,0);ctx.fill();}
      else if(f.k==='star'){ctx.rotate(f.a);const r=f.r*(.6+u*.8);ctx.globalAlpha=k;ctx.fillStyle='#fff6dc';ctx.beginPath();for(let i=0;i<8;i++){const rr=i%2?r*.22:r,t=i*Math.PI/4;ctx.lineTo(Math.cos(t)*rr,Math.sin(t)*rr);}ctx.closePath();ctx.fill();ctx.globalAlpha=k*.5;ctx.beginPath();ctx.arc(0,0,r*.45,0,TAU);ctx.fill();addLight(f.x-cam,f.y,f.r*3,'#ffd27a',.6*k);}
      else if(f.k==='frost'){ctx.beginPath();ctx.arc(0,0,f.r*(.2+u*.8),0,TAU);ctx.globalAlpha=k*.16;ctx.fillStyle='#bfe8ff';ctx.fill();ctx.globalAlpha=k*.8;ctx.strokeStyle='#d8f2ff';ctx.lineWidth=4*k+1;ctx.stroke();}
      else{ctx.globalAlpha=k*.8;ctx.strokeStyle='#ffe2a8';ctx.lineWidth=3*k+1;ctx.beginPath();ctx.arc(0,0,f.r*(.3+u*.9),0,TAU);ctx.stroke();}
      ctx.restore();}
    ctx.restore();
    // 用掉的道具在主角头顶晃一下（比如摇响的寒霜铃）
    for(const f of fx){if(f.k!=='icon')continue;const k=f.life/f.max;ctx.save();ctx.translate(f.x,f.y-(1-k)*12);ctx.rotate(Math.sin((1-k)*26)*.35*k);drawArt(f.id,0,0,32,Math.min(1,k*2));ctx.restore();}}
  // 发光陶罐：裂缝里透出的光就是里面的东西（金色余烬、绿色疗伤、蓝色飞刀）
  function drawCaches(){for(const b of breakables){if(b.broken||b.x<cam-40||b.x>cam+W+40)continue;const color=['#ffc070','#8fe0b8','#a8d8f0'][b.kind],x=b.x,y=b.y,g=.6+.4*Math.sin(time*3+b.x);ctx.save();ctx.translate(x,y);
    shape(()=>ctx.arc(-11,-16,4.5,Math.PI*.5,Math.PI*1.5),null,OL,2.6);shape(()=>ctx.arc(11,-16,4.5,-Math.PI*.5,Math.PI*.5),null,OL,2.6);
    shape(()=>{ctx.moveTo(-10,0);ctx.quadraticCurveTo(-16,-12,-9,-22);ctx.lineTo(-6,-26);ctx.lineTo(6,-26);ctx.lineTo(9,-22);ctx.quadraticCurveTo(16,-12,10,0);ctx.closePath();},lg(-14,0,14,0,'#3a3030','#76645a','#3a3030'),OL,1.8);shape(()=>ctx.rect(-7,-29,14,4),'#8a7468',OL,1.4);line([-11,-12,11,-12],1.2,'rgba(255,230,200,.18)');
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=g;line([-4,-21,0,-14,-3,-8,1,-2],1.9,color);circle(0,-14,2.2,color);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.restore();addLight(x-cam,y-14,34,color,.14+.1*g);}}
  // 扔出去的东西也是画出来的：旋转的火油罐（布条在烧）、飞刀、魂火弹（拖着尾巴的青色火）
  function drawThrown(){for(const o of thrown){ctx.save();ctx.translate(o.x,o.y);
      if(o.k==='bomb'){ctx.rotate(o.r);drawArt('bomb',0,-2,24);ctx.restore();addLight(o.x-cam,o.y-8,34,'#ffb347',.5);}
      else if(o.k==='soul'){ctx.scale(o.vx>0?1:-1,1);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.4;shape(()=>{ctx.moveTo(6,0);ctx.quadraticCurveTo(-12,-11,-44,0);ctx.quadraticCurveTo(-12,11,6,0);},'#62e9d2');ctx.restore();ctx.rotate(-Math.PI/2);fl(0,10,.8+.08*Math.sin(time*30),['#2fa39b','#7fe6d4','#effff9']);ctx.restore();addLight(o.x-cam,o.y,72,'#76f1d1',.6);}
      // 弓手的箭（第三支重箭带青光）、穿云箭、钟锤的地波、灯雷
      else if(o.k==='arrow'){ctx.rotate(Math.atan2(o.vy,o.vx));ctx.globalAlpha=.3;box(-34,-.6,22,1.2,o.heavy?'#9ff3e0':'#ffe6b0');ctx.globalAlpha=1;line([-12,0,9,0],1.6,'#c9b48a',OL);poly([9,-2.8,15,0,9,2.8],'#e8eef0',OL,1);poly([-12,0,-17,-3.4,-14,0,-17,3.4],'#e8e0cc');ctx.restore();if(o.heavy)addLight(o.x-cam,o.y,30,'#9ff3e0',.3);}
      else if(o.k==='bigarrow'){ctx.scale(o.vx>0?1:-1,1);ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.45;shape(()=>{ctx.moveTo(30,0);ctx.lineTo(-90,-10);ctx.lineTo(-90,10);ctx.closePath();},'#ffe6a8');ctx.restore();ctx.scale(1.6,1.6);line([-16,0,12,0],2.4,'#e6c078',OL);poly([12,-4,22,0,12,4],'#fff1c2',OL,1.2);poly([-16,0,-23,-5,-19,0,-23,5],'#ffe2a8');ctx.restore();addLight(o.x-cam,o.y,90,'#ffd27a',.6);}
      else if(o.k==='pwave'){ctx.scale(o.dir,1);const a=clamp(o.life/.3,0,1);ctx.globalAlpha=a;ctx.globalCompositeOperation='lighter';ctx.strokeStyle='#ffe2a8';for(let i=0;i<3;i++){ctx.lineWidth=4-i;ctx.beginPath();ctx.moveTo(-26-i*8,0);ctx.quadraticCurveTo(-4-i*8,-34+i*8,8-i*8,0);ctx.stroke();}ctx.restore();addLight(o.x-cam,o.y-14,50,'#ffd27a',.3*a);}
      else if(o.k==='mine'){const armed=o.t>.45,bl=armed&&Math.floor(time*(o.life<2?12:5))%2;drawArt('sk_trap',0,-9,26);if(bl){ctx.globalCompositeOperation='lighter';circle(0,-9,6,'#9ff3e0');}ctx.restore();addLight(o.x-cam,o.y-8,armed?40:20,'#8be1ce',.3);}
      else{ctx.scale(o.vx>0?1:-1,1);ctx.globalAlpha=.3;box(-30,-.6,20,1.2,'#dfeaff');ctx.globalAlpha=1;shape(()=>{ctx.moveTo(-6,-2.2);ctx.lineTo(8,-1.2);ctx.lineTo(13,0);ctx.lineTo(8,1.2);ctx.lineTo(-6,2.2);ctx.closePath();},lg(0,-2,0,2,'#ffffff','#b8c8d0','#7f929c'),OL,1);box(-8,-3,2.4,6,'#8a96a0');box(-14,-1.6,6,3.2,'#5a3d27');circle(-16,0,2,null,'#9aa8b0',1.2);ctx.restore();}}}
  // 被冻住的敌人：整套配色混进冰蓝色
  const ICE=new Map();
  function mix(a,b,t){const x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16);let s='#';[16,8,0].forEach(k=>{const c=Math.round((x>>k&255)*(1-t)+(y>>k&255)*t);s+=(c<16?'0':'')+c.toString(16);});return s;}
  function iceOf(P){let q=ICE.get(P);if(!q){q={};Object.keys(P).forEach(k=>{q[k]=mix(P[k],'#a8dcff',.55);});ICE.set(P,q);}return q;}
  function drawChunks(){for(const c of chunks){ctx.save();ctx.globalAlpha=clamp(c.life/.4,0,1);ctx.translate(c.x,c.y);ctx.rotate(c.r);ctx.fillStyle=c.c;ctx.fillRect(-c.s/2,-c.s*.35,c.s,c.s*.7);ctx.strokeStyle=OL;ctx.lineWidth=1;ctx.strokeRect(-c.s/2,-c.s*.35,c.s,c.s*.7);ctx.restore();}}
  // ---- 机关、会动 / 会塌的平台、腐水深潭、灵灯、教程石碑、黑暗、过场和片尾 ----
  // 腐水深潭：一整片发绿光的水面，冒着泡
  function acidLake(x,w){const y=FLOOR+8;ctx.fillStyle='#10220f';ctx.fillRect(x,y,w,viewY+H-y+30);ctx.fillStyle='rgba(110,210,60,.8)';ctx.beginPath();ctx.moveTo(x,y+14);for(let i=0;i<=w;i+=16)ctx.lineTo(x+i,y+Math.sin(time*2.2+i*.06)*2.2);ctx.lineTo(x+w,y+14);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(205,255,160,.75)';for(let i=8;i<w-8;i+=22)ctx.fillRect(x+i,y-1+Math.sin(time*2.2+i*.06)*2.2,9,1.4);
    for(let i=0;i<6;i++){const t=(time*.7+i*.17)%1,n=Math.floor(time*.7+i*.17),bx=x+10+((i*97+n*61)%Math.max(1,w-20));circle(bx,y+6-t*14,1.4+t*2.4,'rgba(205,255,160,'+(.8-t*.8).toFixed(2)+')');}addLight(x+w/2-cam,y,w*.6,'#9be36a',.3);}
  // 会动的平台：监牢是铁链吊着的笼底，下水道是木筏，钟楼是黄铜齿轮台，其它地方是铁吊台
  function moverArt(a){const th=L.theme,x=a.x,y=a.y,w=a.w;
    if(th==='sewers'){for(let i=0;i<w;i+=15){box(x+i,y,Math.min(14,w-i),10,i%30?'#6a4a2f':'#5a3d27');box(x+i,y,Math.min(14,w-i),2,'#8a6a44');}ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x,y,w,10);line([x+8,y+2,x+8,y+9],1.4,'#c9b48a');line([x+w-8,y+2,x+w-8,y+9],1.4,'#c9b48a');line([x+w-16,y,x+w-16,y-16],1.6,'#5a3d27',OL);circle(x+w-16,y-19,3.4,'#ffd27a',OL,1);addLight(x+w-16-cam,y-19,40,'#ffcf86',.3);ctx.fillStyle='rgba(205,255,160,.35)';ctx.fillRect(x-4,y+10,w+8,2);return;}
    if(th==='tower'){gear(x+w/2,y+22,15,10,time*2*(a.mv.dx||a.mv.dy?1:0),'#6a5232');circle(x+w/2,y+22,4,'#3a2a1a');box(x,y,w,12,'#8a6a3a');box(x,y,w,3,'#c49a52');for(let i=4;i<w-4;i+=12)box(x+i,y-3,6,3,'#a7803f');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x,y,w,12);return;}
    const top=Math.min(viewY,0)-10;chain(x+10,top,y-top,'#3a434c');chain(x+w-10,top,y-top,'#3a434c');box(x,y,w,10,'#4a535a');box(x,y,w,3,'#7a848c');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x,y,w,10);
    if(th==='prison'){for(let i=6;i<w;i+=14)box(x+i,y-30,2.4,30,'rgba(58,67,76,.85)');box(x,y-32,w,3,'rgba(74,83,90,.9)');}}
  // 会塌的平台：城墙是裂开的石板，墓窟是一排骨头；踩上去先抖，再掉下去，过一会儿慢慢长回来
  function crumbleArt(a){const c=a.cr,bone=L.theme==='ossuary';let x=a.x,y=a.y,al=1;if(c.st===1)x+=Math.sin(time*70)*1.6;if(c.st===2){y+=c.fy;al=c.fy<240?1-c.fy/240:0;if(al<=0)return;}if(c.back>0)al=1-c.back/.5;
    ctx.save();ctx.globalAlpha=al;box(x,y,a.w,a.h,bone?'#8a8070':T.stone[0]);box(x,y,a.w,3,bone?'#d8cfb8':T.ledge[0]);box(x,y+3,a.w,3,bone?'#b5a991':T.ledge[1]);ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x,y,a.w,a.h);
    ctx.strokeStyle='rgba(10,8,6,.6)';ctx.beginPath();ctx.moveTo(x+a.w*.3,y);ctx.lineTo(x+a.w*.36,y+8);ctx.lineTo(x+a.w*.3,y+a.h);ctx.moveTo(x+a.w*.68,y+2);ctx.lineTo(x+a.w*.62,y+11);ctx.stroke();
    if(bone)for(let i=10;i<a.w-6;i+=22){circle(x+i,y+a.h-4,3.4,'#e8dfc8',OL,1);circle(x+i-1.2,y+a.h-4.5,.9,'#2a2420');circle(x+i+1.2,y+a.h-4.5,.9,'#2a2420');}ctx.restore();}
  // 机关分两遍画：back 是底座、刀刃、弩炮（画在主角身后），front 是喷出来的东西、落锤、风（画在主角前面）
  function drawTraps(front){for(const t of traps){const x0=t.x0!=null?t.x0:t.x-220,x1=t.x1!=null?t.x1:t.x+220;if(x1<cam-80||x0>cam+W+80)continue;const u=t.t/(t.per||3);
    if(t.k==='tspike'){if(front)continue;const n=t.n,warn=!!t.warn,h=u<.55-0.5/(t.per||3)?0:warn?3+Math.sin(time*46)*2.4:u<.6?18*(u-.55)/.05:u<.85?18:u<.9?18*(1-(u-.85)/.05):0,wob=warn?Math.sin(time*42)*2.4:0,c0=warn?'#ffb35c':T.spikeC[0],c1=warn?'#ff6a3a':T.spikeC[1];box(t.x-3+wob,FLOOR-3,n*20+2,4,warn?'#6a3a22':'#2a3036');if(warn){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.55;circle(t.x+n*10,FLOOR-8,28+Math.sin(time*30)*6,'#ffb35c');ctx.restore();text('！',t.x+n*10,FLOOR-28-Math.abs(Math.sin(time*20))*6,16,'#ffd2a0','center',true);}for(let k=0;k<n;k++){const sx=t.x+k*20+wob;box(sx+3,FLOOR-2,10,2,'#14181c');if(h>.5){poly([sx+1,FLOOR-2,sx+8,FLOOR-2-h,sx+15,FLOOR-2],c0,OL,1.1);poly([sx+8,FLOOR-2-h,sx+15,FLOOR-2,sx+10,FLOOR-2],c1);}}continue;}
    if(t.k==='pendulum'){if(!front)continue;const a=t.a!=null?t.a:t.amp*Math.sin(TAU*u),warn=!!t.warn,jx=warn?Math.sin(time*42)*2.6:0,bx=t.x+Math.sin(a)*t.len+jx,by=t.top+Math.cos(a)*t.len;box(t.x-16,t.top-10,32,10,warn?'#6a3a22':'#3a3028');circle(t.x,t.top,5,warn?'#ffb35c':'#6a5a48',OL,1.4);
      ctx.strokeStyle='#2c343b';ctx.lineWidth=3.4;ctx.beginPath();ctx.moveTo(t.x,t.top);ctx.lineTo(bx,by);ctx.stroke();ctx.strokeStyle='rgba(150,160,170,.5)';ctx.lineWidth=1;ctx.stroke();
      ctx.save();ctx.translate(bx,by);ctx.rotate(-a);shape(()=>{ctx.moveTo(-28,-6);ctx.quadraticCurveTo(0,31,28,-6);ctx.quadraticCurveTo(0,9,-28,-6);ctx.closePath();},warn?lg(0,-6,0,24,'#ffe0b0','#ff8a3a','#c4501c'):lg(0,-6,0,24,'#e8eef0','#9aa8b0','#5a646c'),OL,1.6);line([-23,-3,0,17,23,-3],1,'rgba(255,255,255,.75)');box(-4,-15,8,11,warn?'#ffb35c':'#4a4038');if(warn){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.45;circle(0,6,18,'#ffb35c');}ctx.restore();continue;}
    if(t.k==='spout'){const fire=t.fire,h=t.h||200;if(!front){box(t.x-16,FLOOR-4,32,5,fire?'#3a2a20':'#2a3a2a');for(let i=-12;i<=10;i+=6)box(t.x+i,FLOOR-3,3,3,'#0e140e');if(t.warn){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.25+.2*Math.sin(time*30);circle(t.x,FLOOR-4,14,fire?'#ffb347':'#9be36a');ctx.restore();}continue;}
      if(t.on){const k=Math.min(1,(u-.62)/.04),hh=h*k,fade=u>.86?clamp((.9-u)/.04,0,1):1,c=fire?['rgba(196,80,28,.85)','rgba(255,170,70,.9)','rgba(255,241,194,.95)']:['rgba(60,140,40,.85)','rgba(130,220,70,.9)','rgba(220,255,180,.95)'];ctx.save();ctx.globalAlpha=fade;if(fire)ctx.globalCompositeOperation='lighter';
        shape(()=>{ctx.moveTo(t.x-14,FLOOR);for(let y=0;y<=hh;y+=20)ctx.lineTo(t.x-12-Math.sin(time*18+y*.1)*4+y*.02,FLOOR-y);ctx.lineTo(t.x,FLOOR-hh-10);for(let y=Math.floor(hh/20)*20;y>=0;y-=20)ctx.lineTo(t.x+12+Math.sin(time*16+y*.12)*4-y*.02,FLOOR-y);ctx.closePath();},lg(0,FLOOR,0,FLOOR-hh-1,c[0],c[1],c[2]));
        for(let i=0;i<4;i++){const q=time*6+i*1.7;circle(t.x+Math.cos(q)*14,FLOOR-hh+Math.sin(q*1.3)*6,3,c[2]);}ctx.restore();addLight(t.x-cam,FLOOR-hh/2,hh*.7,fire?'#ffb347':'#9be36a',.4);}continue;}
    if(t.k==='vent'){const base=t.y||FLOOR,w=t.w||64,h=t.h||200;if(!front){box(t.x-w/2,base-5,w,6,'#4a4f55');for(let i=-w/2+5;i<w/2-4;i+=8)box(t.x+i,base-4,4,4,'#1a1e22');continue;}
      const k=t.on?1:u>.3?(u-.3)/.15*.3:0;if(k>0){ctx.save();for(let i=0;i<10;i++){const q=(time*(t.on?1.6:.6)+i/10)%1;ctx.globalAlpha=k*(1-q)*.42;circle(t.x+Math.sin(i*2.3+time*2)*w*.3,base-q*h,8+q*16,'#e8eef0');}if(t.on&&!lowFx){ctx.globalAlpha=.1;ctx.fillStyle='#ffffff';ctx.fillRect(t.x-w/2+6,base-h,w-12,h);}ctx.restore();}continue;}
    if(t.k==='wind'){if(!front||(!t.on&&!t.warn))continue;const k=t.on?1:.35,span=t.x1-t.x0;ctx.save();ctx.strokeStyle='rgba(255,236,210,.55)';ctx.lineWidth=1.6;for(let i=0;i<14;i++){const q=((time*(t.on?1.1:.4)*t.dir+i*.137)%1+1)%1,px=t.x0+q*span,py=230+(i*67)%230;ctx.globalAlpha=k*.6*Math.sin(q*Math.PI);ctx.beginPath();ctx.moveTo(px,py);ctx.quadraticCurveTo(px-t.dir*20,py-4,px-t.dir*46,py+2);ctx.stroke();}
      for(let i=0;i<6;i++){const q=((time*.8*t.dir+i*.19)%1+1)%1,px=t.x0+q*span,py=300+(i*41)%150+Math.sin(time*5+i)*12;ctx.globalAlpha=k*Math.sin(q*Math.PI);ctx.save();ctx.translate(px,py);ctx.rotate(time*6+i);poly([-4,0,0,-2,4,0,0,2],i%2?'#c4a44a':'#9a6a3a');ctx.restore();}ctx.restore();continue;}
    if(t.k==='ballista'){if(front)continue;const x=t.x,y=t.y,d=t.dir;if(t.broken){poly([x-26,y,x-14,y-10,x+4,y-6,x+22,y-12,x+28,y],'#5a3d27',OL,1.4);line([x-18,y-4,x+12,y-16],3,'#6a4a2f',OL);continue;}
      const pull=Math.min(1,u*1.25)*14,kick=t.kick>0?t.kick*30:0;box(x-22,y-16,44,16,'#5a5f66');box(x-22,y-16,44,3,'#7a838b');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x-22,y-16,44,16);
      ctx.save();ctx.translate(x-d*kick*.3,y-24);ctx.scale(d,1);line([-24,6,-18,0,22,0],5,'#6a4a2f',OL);ctx.strokeStyle=OL;ctx.lineWidth=4.4;ctx.beginPath();ctx.moveTo(10,-18);ctx.quadraticCurveTo(22,0,10,18);ctx.stroke();ctx.strokeStyle='#8a6a44';ctx.lineWidth=2.6;ctx.stroke();
      line([10,-18,10-pull,0,10,18],1,'#ddd6c4');if(u>.2){line([10-pull,0,30,0],2.4,'#7a5634',OL);poly([30,-4,38,0,30,4],'#aab3b8',OL,1);}ctx.restore();continue;}
    if(t.k==='jet'){const d=t.dir;if(!front){ctx.save();ctx.translate(t.x,t.y);ctx.scale(d,1);shape(()=>ctx.ellipse(2,0,9,10,0,0,TAU),'#d8cfb8',OL,1.4);const eg=t.warn?.5+.5*Math.sin(time*30):t.on?1:.15;circle(3,-3,2.4,'#1a1420');circle(-2,-3,2,'#1a1420');ctx.globalCompositeOperation='lighter';ctx.globalAlpha=eg;circle(3,-3,2.2,'#d8a8ff');circle(-2,-3,1.8,'#d8a8ff');ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';box(-1,3,8,3,'#1a1420');ctx.restore();if(t.warn)addLight(t.x-cam,t.y,30,'#c58bff',.3);continue;}
      if(t.on){const k=Math.min(1,(u-.62)/.04),len=t.len*k,fade=u>.86?clamp((.9-u)/.04,0,1):1;ctx.save();ctx.translate(t.x,t.y);ctx.scale(d,1);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=fade;['rgba(140,80,200,.55)','rgba(200,150,255,.6)','rgba(250,238,255,.7)'].forEach((c,i)=>{const wv=Math.sin(time*30+i)*2;shape(()=>{ctx.moveTo(8,-1);ctx.quadraticCurveTo(len*.5,-14+i*4+wv,len,-2+wv);ctx.quadraticCurveTo(len*.5,14-i*4-wv,8,5);ctx.closePath();},c);});ctx.restore();addLight(t.x+d*t.len/2-cam,t.y,t.len*.7,'#c58bff',.45);}continue;}
    if(t.k==='piston'){if(!front)continue;const w=t.w||80,hb=t.hb||pistonY(t),top=Math.min(viewY,0)-20;box(t.x+w/2-7,top,14,hb-50-top,'#3a3028');box(t.x+w/2-7,top,4,hb-50-top,'#5a4a3a');for(let y=hb-60;y>top;y-=26)box(t.x+w/2-9,y,18,4,'#2a221c');
      box(t.x,hb-50,w,50,'#5a5f66');box(t.x,hb-50,w,5,'#8a939a');box(t.x,hb-8,w,8,'#3a4048');ctx.strokeStyle=OL;ctx.lineWidth=1.4;ctx.strokeRect(t.x,hb-50,w,50);for(let i=10;i<w;i+=20){circle(t.x+i,hb-40,2,'#aab3b8');circle(t.x+i,hb-16,2,'#aab3b8');}
      if(u>=.7&&u<.86){ctx.save();ctx.globalAlpha=.35;for(let i=0;i<3;i++)circle(t.x+10+Math.random()*(w-20),hb+3+Math.random()*8,1.5,'#cfc8b8');ctx.restore();}}}}
  // 教程石碑：刻着要按的键（键盘显示改过的键位，触屏显示按钮名）
  const TOUCH_LABEL={left:'←',right:'→',up:'↑',down:'↓',jump:'跳',attack:'攻',roll:'滚',skill1:'技1',skill2:'技2',skill3:'技3',heal:'药',use:'物',cycle:'换',interact:'互',bag:'囊',map:'图'};
  function keycap(kx,ky,kw,lab,lit){shape(()=>{ctx.moveTo(kx-kw/2+3,ky-9);ctx.lineTo(kx+kw/2-3,ky-9);ctx.quadraticCurveTo(kx+kw/2,ky-9,kx+kw/2,ky-6);ctx.lineTo(kx+kw/2,ky+6);ctx.quadraticCurveTo(kx+kw/2,ky+9,kx+kw/2-3,ky+9);ctx.lineTo(kx-kw/2+3,ky+9);ctx.quadraticCurveTo(kx-kw/2,ky+9,kx-kw/2,ky+6);ctx.lineTo(kx-kw/2,ky-6);ctx.quadraticCurveTo(kx-kw/2,ky-9,kx-kw/2+3,ky-9);ctx.closePath();},lit?'#f2e3c4':'#c8b89a',OL,1.2);box(kx-kw/2+2,ky+5,kw-4,2,'rgba(60,40,20,.35)');text(lab,kx,ky+3.5,lab.length>2?7:lab.length>1?8:10,'#2a2420','center');}
  function drawSigns(){L.signs.forEach((s,i)=>{if(s.x<cam-80||s.x>cam+W+80)return;const x=s.x,y=FLOOR,near=i===signAt,n=s.keys.length,kw=n>2?15:18;
    shape(()=>{ctx.moveTo(x-28,y);ctx.lineTo(x-28,y-52);ctx.quadraticCurveTo(x-28,y-66,x-15,y-68);ctx.lineTo(x+15,y-68);ctx.quadraticCurveTo(x+28,y-66,x+28,y-52);ctx.lineTo(x+28,y);ctx.closePath();},lg(x-28,0,x+28,0,'#4a4038','#5e5248','#3a322c'),OL,1.6);ctx.strokeStyle='rgba(255,210,150,.25)';ctx.lineWidth=1;ctx.strokeRect(x-21,y-60,42,54);
    s.keys.forEach((a,j)=>{const lab=coarse()?TOUCH_LABEL[a]:K(a);keycap(x-(n-1)*(kw+3)/2+j*(kw+3),y-40,lab.length>2&&!coarse()?kw+6:kw,lab.length>4?lab.slice(0,4):lab,near);});
    if(near){ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.22+.12*Math.sin(time*4);circle(x,y-40,32,'#ffb35c');ctx.restore();}addLight(x-cam,y-40,near?90:50,'#ffb35c',near?.45:.2);});}
  // 墓窟的黑暗：只有主角身边、点亮的灵灯、飞着的魂火能照亮；黑暗里看得见敌人的眼睛
  let darkC=null;
  function drawDark(){const D=L.dark,k=clamp((p.x-D[0])/300,0,1)*clamp((D[1]-p.x)/200,0,1);if(k<=0||state==='menu')return;
    try{if(!darkC)darkC=document.createElement('canvas');const cw=Math.ceil(W/2),ch=Math.ceil(H/2);if(darkC.width!==cw||darkC.height!==ch){darkC.width=cw;darkC.height=ch;}
      const g=darkC.getContext('2d');g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.clearRect(0,0,cw,ch);g.fillStyle='rgba(4,3,9,'+(.73*k).toFixed(3)+')';g.fillRect(0,0,cw,ch);g.globalCompositeOperation='destination-out';
      const hole=(x,y,r)=>{const sx=(x-cam)/2,sy=(y-viewY)/2,R=r/2;if(sx<-R||sx>cw+R)return;const gr=g.createRadialGradient(sx,sy,R*.2,sx,sy,R);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(.6,'rgba(0,0,0,.7)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(sx,sy,R,0,TAU);g.fill();};
      hole(p.x+p.w/2,p.y+p.h/2-10,250);for(let i=0;i<run.litWicks;i++){const w=L.wicks[i];hole(w.x,w.y-55,330);}for(const o of thrown)hole(o.x,o.y,130);for(const s of shots)hole(s.x,s.y,90);for(const t of traps)if((t.k==='jet'||t.k==='spout')&&(t.on||t.warn))hole(t.x,t.y||FLOOR-40,t.on?280:100);for(const h of hazards)if(h.k==='spear'||h.k==='pool')hole(h.x,FLOOR-30,120);
      ctx.drawImage(darkC,0,viewY,W,H);}catch(e){}
    ctx.save();ctx.globalCompositeOperation='lighter';for(const e of enemies){if(e.dead||e.x<cam-40||e.x>cam+W+40)continue;const ex=e.x+e.w/2-cam+e.face*4,ey=e.type==='flyer'?e.y+10:e.y+8;ctx.globalAlpha=.85*k;circle(ex,ey,2.2,'#d8a8ff');ctx.globalAlpha=.25*k;circle(ex,ey,7,'#d8a8ff');}ctx.restore();}
  // 过场的上下黑边、首领倒下后的「安息」字样、最终钟声里越来越亮的晨光、闪白
  function drawCineOverlay(){if(cine){const k=cine.k==='boss'?Math.min(1,cine.t/.35)*(cine.t>cine.dur-.35?Math.max(0,(cine.dur-cine.t)/.35):1):Math.min(1,cine.t/.5),bh=H*.09*k;box(0,0,W,bh,'#000');box(0,H-bh,W,bh,'#000');
      if(cine.k==='boss'&&cine.t>2.15){const B=BOSSES[cine.kind],a=clamp((cine.t-2.15)/.3,0,1)*clamp((cine.dur-cine.t)/.3,0,1),y=tall?H*.36:H*.42;ctx.save();ctx.globalAlpha=a;text(B.name,W/2,y-30,14,'#d9c7a6','center',true);ctx.font='bold 46px "SimSun","Songti SC",Georgia,serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='rgba(5,8,12,.85)';ctx.strokeText('安　息',W/2,y+18);ctx.fillStyle=B.color;ctx.fillText('安　息',W/2,y+18);ctx.restore();}
      if(cine.k==='bell'){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'rgba(255,214,150,'+(.4*cine.dawn).toFixed(3)+')');g.addColorStop(1,'rgba(255,170,110,'+(.15*cine.dawn).toFixed(3)+')');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);if(cine.t>cine.dur-.6){ctx.fillStyle='rgba(255,248,232,'+clamp((cine.t-cine.dur+.6)/.6,0,1).toFixed(3)+')';ctx.fillRect(0,0,W,H);}}}
    if(flashT>0){ctx.fillStyle='rgba(255,250,236,'+Math.min(.85,flashT*2).toFixed(3)+')';ctx.fillRect(0,0,W,H);}}
  // 片尾字幕：黎明插画上压一层暗色，魂火一直往上飘，名字一行行往上走
  function drawCredits(){const t=credits.t;ctx.setTransform(scale,0,0,scale,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';try{if(SCENES.dawn)SCENES.dawn(t+6);else{ctx.fillStyle='#120c0a';ctx.fillRect(0,0,W,H);}}catch(e){ctx.fillStyle='#120c0a';ctx.fillRect(0,0,W,H);}
    ctx.setTransform(scale,0,0,scale,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='rgba(4,6,10,.55)';ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<40;i++){const q=(t*.05+i*.071)%1,x=(i*137.5)%W,y=H+20-q*(H+60);ctx.globalAlpha=Math.sin(q*Math.PI)*.8;circle(x+Math.sin(t+i)*12,y,1.6+i%3,i%5?'#9ff3e0':'#ffe2a8');}ctx.restore();
    const y0=H+20-t*42;CREDITS.forEach((l,i)=>{const y=y0+i*34;if(y<-40||y>H+40)return;ctx.globalAlpha=clamp(Math.min((y+20)/120,(H-y)/120),0,1);if(l[1]==='title'){ctx.font='bold 46px "SimSun","Songti SC",Georgia,serif';ctx.textAlign='center';ctx.fillStyle='#f2e3c4';ctx.fillText(l[0],W/2,y);}else if(l[0])text(l[0],W/2,y,l[1]==='h'?14:l[1]==='en'?13:l[1]==='end'?20:17,l[1]==='h'?'#c9b28a':l[1]==='end'?'#ffe2a8':'#e6dcc4','center',true);});
    ctx.globalAlpha=1;if(t>1.5)text(coarse()?'点一下跳过':'按任意键跳过',W-24,H-20,12,'rgba(220,210,190,.6)','right');if(t<1){ctx.fillStyle='rgba(255,248,232,'+(1-t).toFixed(3)+')';ctx.fillRect(0,0,W,H);}}
  function footShadow(x,y,rx){ctx.save();ctx.globalAlpha=.34;ctx.fillStyle='#05080c';ctx.beginPath();ctx.ellipse(x,y,Math.max(4,rx),Math.max(2.2,rx*.32),0,0,TAU);ctx.fill();ctx.restore();}
  function drawCrawler(e,P,w){const step=Math.sin((e.walk||0)+(e.seed||0)),crouch=w>0?.65:e.lunge>0?-.15:0;ctx.save();ctx.translate(0,-7-crouch*5);ctx.rotate(crouch*.35-(e.lunge>0?.25:0));
    line([-11,0,-16+step*4,5],2.6,P.claw,OL);line([9,0,14-step*4,5],2.6,P.claw,OL);line([-4,-2,-8+step*2,4],2,P.claw,OL);line([3,-2,7-step*2,4],2,P.claw,OL);
    shape(()=>{ctx.moveTo(-16,-1);ctx.quadraticCurveTo(-18,-15,0,-17);ctx.quadraticCurveTo(18,-15,16,-1);ctx.quadraticCurveTo(0,5,-16,-1);},lg(-16,-16,16,4,P.shellHi,P.shell,P.body),OL,1.6);
    shape(()=>{ctx.moveTo(-7,-13);ctx.quadraticCurveTo(0,-18,7,-13);ctx.quadraticCurveTo(0,-8,-7,-13);},P.shellHi);fl(0,-7,.32,[P.body,P.soul,'#f6fffb']);circle(-4,-9,1.35,'#120e0a');circle(4,-9,1.35,'#120e0a');circle(-3.6,-9.4,.45,P.eye);circle(4.4,-9.4,.45,P.eye);ctx.restore();}
  function drawHanger(e,P,w){ctx.save();const warn=e.hang==='warn',air=e.hang!=='land';
    if(air){ctx.strokeStyle=P.chain;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-78);ctx.quadraticCurveTo(warn?10:2,-40,Math.sin(time*(warn?18:3))*(warn?5:1.4),-18);ctx.stroke();}
    ctx.translate(warn?Math.sin(time*40)*2:0,0);ctx.rotate(e.hang==='drop'?.35:0);
    shape(()=>{ctx.moveTo(-9,-12);ctx.quadraticCurveTo(-12,2,-7,10);ctx.quadraticCurveTo(0,14,7,10);ctx.quadraticCurveTo(12,2,9,-12);ctx.closePath();},lg(-10,-12,10,10,P.clothHi,P.cloth),OL,1.5);
    shape(()=>ctx.rect(-7,-16,14,7),P.cage,OL,1.2);line([-7,-12,7,-12],1,P.chain);fl(0,-5,.4,[P.cloth,P.soul,'#fff']);circle(-2.2,-7,1.15,'#140e18');circle(2.6,-7,1.15,'#140e18');
    if(w>0||warn){ctx.globalAlpha=.45;line([-8,-18,-12,-26],1.4,P.soul);line([8,-18,12,-26],1.4,P.soul);}ctx.restore();}
  function drawClimbs(){if(!L.climbs)return;for(const c of L.climbs){const x=c[0],top=c[1],bot=c[2];if(x<cam-50||x>cam+W+50)continue;line([x,top,x,bot],2.6,'#6d5a40','#140e0a');
    for(let y=top+8;y<bot-6;y+=15){ctx.strokeStyle='#ecd8aa';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(x,y,4.4,.2,Math.PI-.2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,4.4,Math.PI+.2,TAU-.2);ctx.stroke();}
    flame(x,top+4,.45,x*.02);addLight(x-cam,top+6,64,'#ffcf86',.42);}}
  function drawSprings(){if(!L.springs)return;for(const s of L.springs){const x=s[0],y=s[1],w=s[2];if(x+w<cam-30||x>cam+W+30)continue;const k=.55+.45*Math.sin(time*6+x*.01);
    box(x,y-6,w,7,'#6a4424');box(x+2,y-6,w-4,2,'#3a2816');box(x,y-9-k*4,w,4,'#f2d48a');ctx.strokeStyle=OL;ctx.lineWidth=1.2;ctx.strokeRect(x,y-6,w,7);addLight(x+w/2-cam,y-10,42,'#ffd27a',.22+k*.2);}}
  function drawBandDress(){const b=currentBand();if(!b)return;const id=b[2];
    if(id==='well'||id==='belly'||id==='cistern'||id==='gears'){ctx.save();ctx.strokeStyle='rgba(190,202,210,.32)';ctx.lineWidth=3;for(let x=Math.floor((cam-90)/250)*250;x<cam+W+90;x+=250){ctx.beginPath();ctx.arc(x,112,34,0,TAU);ctx.stroke();line([x,78,x,28],2,'#3c464e');}ctx.restore();}
    if(id==='chapel'||id==='nave'||id==='nest'||id==='tongue'){for(let x=Math.floor(cam/210)*210+70;x<cam+W+20;x+=210){if(inGap(x))continue;flame(x,FLOOR-86,.55,x);addLight(x-cam,FLOOR-96,86,'#ffcf86',.34);}}
    if(id==='wall'||id==='tower'||id==='gate'){for(let x=Math.floor(cam/280)*280+40;x<cam+W;x+=280){ctx.save();ctx.translate(x,268);ctx.rotate(Math.sin(time*1.3+x)*.22);poly([0,-40,24,-24,18,30,0,16],'#8a3040',OL,1.1);ctx.restore();}}}
  function drawBandWash(){const b=currentBand();if(!b||state==='menu')return;const wash={cells:'16,28,42',well:'8,12,18',chapel:'52,30,16',drain:'12,28,18',cistern:'14,36,22',nest:'36,48,18',gate:'48,28,36',wall:'72,36,32',tower:'28,18,32',oss:'26,18,36',niche:'22,16,32',nave:'40,26,52',gears:'40,24,16',belly:'32,18,14',tongue:'52,30,18'}[b[2]];if(!wash)return;ctx.save();ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=.17;ctx.fillStyle='rgb('+wash+')';ctx.fillRect(0,0,W,H);ctx.restore();}
  function lessonDoor(){if(!L.lesson||!L.lesson.door)return;const x=L.lesson.door,open=!!run['les'+stage];
    box(x-18,FLOOR-200,20,200,'#3a444c');box(x+36,FLOOR-200,20,200,'#3a444c');box(x-24,FLOOR-214,82,16,'#5c666e');box(x-24,FLOOR-214,82,4,'#8a9298');
    if(open){text('开',x+18,FLOOR-228,13,'#cfe8c4','center',true);return;}
    box(x+2,FLOOR-192,34,192,'#12161a');for(let i=0;i<5;i++)box(x+7+i*5,FLOOR-190,3,190,'#c4a15a');
    const x0=x+54,x1=cam+W+60,y0=viewY-30;ctx.fillStyle='#161310';ctx.fillRect(x0,y0,x1-x0,FLOOR-y0+40);
    for(let y=y0;y<FLOOR;y+=26){const off=(Math.floor((y-y0)/26)%2)*16;for(let bx=x0-off;bx<x1;bx+=34){box(bx+1,y+1,32,24,'#2a261f');box(bx+1,y+1,32,3,'#3d362c');}}
    box(x+50,y0,16,FLOOR-y0,'#3a3228');text('石门',x+18,FLOOR-228,14,'#f0d8b0','center',true);}
  function draw(){if(credits){drawCredits();return;}if(talk&&SCENES[sceneA]){drawStory();return;}ctx.setTransform(scale,0,0,scale,0,0);ctx.imageSmoothingEnabled=false;ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';lights=[];shafts=[];const z=L.arena?clamp((cam-180)/500,0,1):0;
    ctx.save();ctx.translate(0,-viewY);if(shake&&settings.shake)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
    if(cine&&cine.k==='boss'&&cine.e){const zz=1+.07*Math.min(1,cine.t/1.6),fx=cine.e.x+cine.e.w/2-cam,fy=cine.e.y+cine.e.h/2;ctx.translate(fx,fy);ctx.scale(zz,zz);ctx.translate(-fx,-fy);}
    drawSky();drawBellTower(z);drawFar();drawMid();drawNear();drawShafts();drawCeiling();
    // Mist sits behind the playable plane so distant masonry recedes without muting traps or enemies.
    if(L.lesson){
      ctx.fillStyle=vgrad('horizon'+L.theme,FLOOR-390,FLOOR+28,[[0,'rgba('+T.fog+',0)'],[.65,'rgba('+T.fog+',.11)'],[1,'rgba('+T.fog+',.045)']]);
      ctx.fillRect(0,FLOOR-390,W,418);
    }
    ctx.save();ctx.translate(-cam,0);
    if(L.arena)drawBossArena();
    if(L.bell&&cam+W>L.bell-100&&cam<L.bell+100)greatBell();
    if(!T.outdoor)for(const pl of decor.pillars)if(pl.x>cam-60&&pl.x<cam+W+20)pillar(pl);
    if(T.lantern)for(let x=230;x<WORLD;x+=460)if(x>cam-40&&x<cam+W+40)lantern(x);
    drawWorldLandmark();drawFloor();drawTerrain();for(const a of platforms)if(!a.solid&&a.h<100&&a.x<cam+W+30&&a.x+a.w>cam-30){if(a.mv)moverArt(a);else if(a.cr)crumbleArt(a);else ledge(a);}
    drawClimbs();drawSprings();drawBandDress();
    for(const s of L.spikes)if(cam<s[0]+s[1]*20+20&&cam+W>s[0]-20)spikes(s);
    drawTraps(false);if(L.signs)drawSigns();if(secrets.length)drawSecrets();
    if(L.rest){if(Math.abs(L.fire-cam-W/2)<W)campfire(L.fire);if(Math.abs(L.shop-cam-W/2)<W)merchant(L.shop);}
    if(L.exit&&L.exit>cam-90&&L.exit<cam+W+90)exitDoor(L.exit);
    if(L.npc!=null&&L.npc<cam+W+80)keeper(L.npc);if(L.ink!=null&&L.ink>cam-120&&L.ink<cam+W+120)inkNPC(L.ink);if(L.lore&&L.lore.x>cam-120&&L.lore.x<cam+W+120)loreSpot(L.lore);
    drawCaches();for(const c of chests)if(c.x>cam-60&&c.x<cam+W+60)chest(c);
    if(L.wicks)L.wicks.forEach(drawWick);else if(L.checkpoint!=null&&L.checkpoint>cam-80&&L.checkpoint<cam+W+80)brazier(L.checkpoint,checkpoint);
    if(L.shortcut&&L.shortcut.door>cam-40&&L.shortcut.door<cam+W+40){const x=L.shortcut.door,open=!!run.shortcut;box(x-16,FLOOR-78,32,78,open?'#3a4a32':'#2a241c');box(x-12,FLOOR-70,24,54,open?'#6a8a4a':'#4a3a28');text(open?'捷径':'门',x,FLOOR-86,12,open?'#d7ecc0':'#cbb89a','center',true);}
    if(L.arena){if(L.gate>cam-60&&L.gate<cam+W+60)portcullis(L.gate,gateK);if(L.seal+44>cam-60&&L.seal+44<cam+W+60)portcullis(L.seal+44,sealK);}
    drawChunks();for(const e of enemies)if((!e.dead||e.dieT>0)&&e.x>cam-160&&e.x<cam+W+160)drawEnemy(e);
    if(state!=='menu')drawGuide();
    if(p&&state!=='menu')drawHero();
    drawTraps(true);
    if(L.arena&&L.bossKind==='brood')drawWater();
    drawReveal();drawSlash();drawShots();drawThrown();drawWaves();drawHazards();drawFx();drawParticles();drawOrbs();drawLoot();drawFloats();
    if(L.lesson)lessonDoor();
    ctx.restore();
    drawFore();drawMotes(z);drawWeather();
    ctx.save();ctx.globalCompositeOperation='lighter';const n=lowFx?Math.min(6,lights.length):lights.length;for(let i=0;i<n;i++)glow(lights[i]);ctx.restore();
    drawFog();if(L.dark)drawDark();ctx.restore();drawVignette(z);drawGrade();drawBandWash();drawCineOverlay();
    if(state==='play'){const boss=enemies.find(e=>e.type==='boss'&&!e.dead);if(boss&&L.arena&&p.x>L.trigger-120&&bossCardT<=0)drawBossBar(boss);drawBossCard();
      if(!coarse()&&W>800&&!L.tutorial&&!(run.guided&&stage===0&&p.x<1900))text(K('left')+' / '+K('right')+' 移动　'+K('jump')+' 跳　'+K('attack')+' 攻击　'+K('up')+' / '+K('down')+' + '+K('attack')+' 上挑 / 下劈　'+K('roll')+' 翻滚　'+K('skill1')+' '+K('skill2')+' '+K('skill3')+' 技能　'+K('heal')+' 治疗　'+K('use')+' 道具　'+K('interact')+' 互动　'+K('bag')+' 行囊　'+K('map')+' 地图　Esc 暂停',W/2,H-34,12,'#a9b8c0','center',true);}
    drawTitle();drawStory();frameN++;if(frameN%6===0)drawMinimap();}
  // 溺灯的蓄水池：脚下一层浅浅的污水，挡住脚踝
  function drawWater(){const x0=Math.max(L.gate-40,cam-20),x1=Math.min(L.seal+80,cam+W+20);if(x1<=x0)return;ctx.fillStyle='rgba(60,120,70,.34)';ctx.fillRect(x0,FLOOR-7,x1-x0,9);ctx.strokeStyle='rgba(190,255,170,.42)';ctx.lineWidth=1.4;ctx.beginPath();for(let x=x0;x<=x1;x+=12)ctx.lineTo(x,FLOOR-7+Math.sin(x*.05+time*2)*1.2);ctx.stroke();}
  // 首领血条：带端饰的细框，颜色跟首领走，中间一道刻度是二阶段
  function drawBossBar(boss){const B=BOSSES[L.bossKind],bw=Math.min(460,W*.62),bx=(W-bw)/2,by=H-52,k=Math.max(0,boss.hp/boss.max),phase=boss.phase||0;
    box(bx-6,by-18,bw+12,28,'rgba(5,8,12,.82)');ctx.strokeStyle=phase>=2?'#ffb35c':'rgba(220,200,160,.55)';ctx.lineWidth=1.2;ctx.strokeRect(bx-6.5,by-4.5,bw+13,16);
    box(bx,by,bw,7,'#221a26');const g=ctx.createLinearGradient(bx,0,bx+bw,0);g.addColorStop(0,tint(B.color,.5));g.addColorStop(1,phase>=2?'#ffd2a8':phase>=1?tint(B.color,1.2):B.color);ctx.fillStyle=g;ctx.fillRect(bx,by,bw*k,7);box(bx,by,bw*k,2,'rgba(255,255,255,.28)');
    [2/3,1/3].forEach(m=>box(bx+bw*m-1,by-2,2,11,'rgba(240,225,190,.9)'));
    text(B.name+' · '+(phase>=2?'终相':phase>=1?'二相':'初相'),W/2,by-10,13,'#e9dcc0','center',true);}
  // 首领名号卡：登场对白结束后淡入，小字是名号，大字是名字
  function drawBossCard(){if(bossCardT<=0||!L.arena)return;const B=BOSSES[L.bossKind],t=2.05-bossCardT,a=clamp(t/.25,0,1)*clamp(bossCardT/.45,0,1);if(a<=.01)return;const y=tall?H*.22:H*.2;
    ctx.save();ctx.globalAlpha=a;ctx.fillStyle='rgba(5,8,12,'+(.72*a).toFixed(3)+')';ctx.fillRect(0,y-28,W,78);
    ctx.fillStyle=B.color;ctx.fillRect(0,y-28,W,2);ctx.fillRect(0,y+48,W,2);
    text(B.sub,W/2,y-6,13,'#d9c7a6','center',true);
    ctx.font='bold 36px "SimSun","Songti SC",Georgia,serif';ctx.textAlign='center';ctx.fillStyle=B.color;ctx.fillText(B.title,W/2,y+32);ctx.restore();}
  // 进入新地图时的标题卡：先从黑场淡入，章节的纹章、层名停留一会儿再淡出
  const CH_ART=['carving','shade','flag','bell'];
  function drawTitle(){if(titleT<=0||(L&&L.arena)||state==='menu'||state==='cine'||state==='upgrade'||state==='chest'||state==='shop'||state==='bag'||state==='win'||state==='dead'||(talk&&talk.lines!==TALK.prologue)||sceneA)return;const a=clamp((titleT-1.9)/.7,0,1),b=clamp(titleT/.6,0,1)*clamp((2.6-titleT)/.35,0,1);
    if(a>0){ctx.fillStyle='rgba(4,6,10,'+a.toFixed(3)+')';ctx.fillRect(0,0,W,H);}
    if(b>0){const y=tall?H*.37:H*.45;ctx.globalAlpha=b;drawArt(L.rest?'fire':CH_ART[clamp((L.chapter||1)-1,0,3)],W/2,y-72,48);box(W/2-150,y-14,300,1,'rgba(219,188,135,.45)');text(L.rest?'歇 脚':L.n,W/2,y-24,14,'#c9b28a','center',true);text(L.name,W/2,y+26,34,'#f2e3c4','center',true);text(L.en,W/2,y+50,13,'#b6a58c','center',true);box(W/2-150,y+62,300,1,'rgba(219,188,135,.45)');ctx.globalAlpha=1;}}
  // 剧情插画：旁白的句子带着场景名时铺满画面，换场景时从黑场淡入
  function drawStory(){if(!talk||!sceneA||!SCENES[sceneA])return;ctx.save();ctx.setTransform(scale,0,0,scale,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    const blend=sceneB?clamp(sceneT/.45,0,1):1;
    if(blend<1&&SCENES[sceneB]){ctx.save();try{SCENES[sceneB](sceneT+1.4);}catch(e){}ctx.restore();}
    ctx.save();ctx.globalAlpha=blend;try{SCENES[sceneA](sceneT);}catch(e){}ctx.restore();ctx.restore();
    ctx.setTransform(scale,0,0,scale,0,0);const bar=Math.max(26,Math.min(62,H*.072));ctx.fillStyle='#05070b';ctx.fillRect(0,0,W,bar);ctx.fillRect(0,H-bar,W,bar);ctx.fillStyle='rgba(232,214,176,.85)';ctx.fillRect(0,bar-1.5,W,1.5);ctx.fillRect(0,H-bar,W,1.5);
    ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<22;i++){const q=(time*.07+i*.053)%1;ctx.globalAlpha=Math.sin(q*Math.PI)*.45;circle((i*149.3)%W,H*q,1.2+(i%3)*.4,i%4?'#ffc98a':'#9ff3e0');}ctx.restore();
    const vg=ctx.createRadialGradient(W/2,H*.45,Math.min(W,H)*.18,W/2,H*.45,Math.max(W,H)*.62);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.58)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
  }
  // 每帧的计算 + 绘制累计 2 秒都超过 11ms（手机一帧预算的 2/3）就自动关掉光柱、雾、前景剪影，减少光源和飘尘。
  // 按实际耗时判断，不按帧间隔：iOS 省电模式之类把刷新率限在 30 帧时并不需要降特效
  function drawCharIdles(){if(panel.hidden||panelView!=='chars')return;const keep=ctx;try{panel.querySelectorAll('canvas[data-idle]').forEach(c=>{const ch=c.dataset.idle,P=ch==='bell'?GH_BELL:ch==='bow'?GH_BOW:GH,b=Math.sin(time*2.8);ctx=c.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,240,240);ctx.save();ctx.translate(120,215);ctx.scale(3.5,3.5);oval(0,0,13-b,2,'rgba(0,0,0,.25)');ctx.translate(0,-4+b*1.6);ctx.rotate(Math.sin(time*1.4)*.025);ctx.scale(1+b*.012,1-b*.018);shape(()=>{ctx.moveTo(-10,-22);ctx.bezierCurveTo(-19,-24,-24,-14+b*3,-32,-15+b*3);ctx.quadraticCurveTo(-25,-7+b*3,-12,-17);ctx.closePath();},P.scarf,OL,1.3);if(ch==='bow')quiver();drawGhost(P,time*6,0);heroGear(ch);ghostEmber(P,true);oval(-10,-18+b*.6,3.1,3.6,P.body);const a=-.94+Math.sin(time*2.8+.4)*.055,y=-18+b*.65;if(ch==='bow')bowW(12,y,-.12+b*.035,0);else if(ch==='bell')hammer(12,y,a,24);else nail(12,y,a,P,28);circle(12,y,3.3,P.body,OL,1.3);ctx.restore();});}finally{ctx=keep;}}
  let lastMenuPaint=-Infinity;
  let simAcc=0;
  function frame(now){requestAnimationFrame(frame);if(!canvas.width)resize();const raw=last?Math.min(.05,(now-last)/1000):1/60;last=now;simAcc+=raw;const t0=performance.now();let steps=0;while(simAcc>=1/60&&steps<3){step(1/60);simAcc-=1/60;steps++;}
    if(state==='menu'&&panelView==='menu'){window.EmberTitle?.paint(now);return;}
    window.EmberTitle?.unmount();
    if((state==='menu'||paused)&&now-lastMenuPaint<32)return;lastMenuPaint=now;draw();paintTalkFace();drawCharIdles();if(state==='play'&&!paused&&settings.fx==='auto'){if(performance.now()-t0>11)slowT+=raw;else slowT=Math.max(0,slowT-raw*.5);if(slowT>2)lowFx=true;}}
  async function enterLandscape(){try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}catch(e){}try{if(window.screen&&screen.orientation&&screen.orientation.lock)await screen.orientation.lock('landscape');}catch(e){}resize();}
  resize();
  if(preview){
    window.emberExhibit=true;clears=4;unlocked=4;introSeen=true;
    FOES.forEach(f=>{codex.seen[f.id]=1;codex.kills[f.id]=1;});
    Object.keys(ITEMS).forEach(id=>{codex.items[id]=1;});
    LORE.forEach(l=>{codex.lore[l.id]=1;});BLUEPRINTS.forEach(id=>{codex.blue[id]=1;});
  }
  reset(true);applySettings();showMenu();cam=220;
  muteBtn.textContent=muted?'静音':'声音';if(muted)muteBtn.classList.add('off');
  window.EmberGame={get state(){return state;},get player(){return p;},get enemies(){return enemies;},get chests(){return chests;},get traps(){return traps;},get score(){return score;},get paused(){return paused;},get checkpoint(){return checkpoint;},get waves(){return waves;},get lowFx(){return lowFx;},get cam(){return cam;},get stage(){return stage;},get stageName(){return L.name;},get embers(){return embers;},set embers(v){embers=v;},get bag(){return bag;},get relics(){return relics;},get codex(){return codex;},get talking(){return !!talk;},get music(){return musicMode;},talkNext:talkNext,goto:loadStage,start:reset,respawn:respawn,version:VERSION};
  requestAnimationFrame(frame);
})();
