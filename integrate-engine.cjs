const fs=require('fs');const file='dist/js/ember.js';let s=fs.readFileSync(file,'utf8');
function rep(a,b){if(!s.includes(a))throw Error('missing '+a.slice(0,80));s=s.replace(a,b);}
const core=fs.readFileSync('engine-core.js','utf8');s=core+'\n'+s;
rep("const VERSION='5.4'","const VERSION='5.5'");
rep('  // 声音分两路',`  const inputQueue=new EmberCore.InputQueue(),physics=new EmberCore.Physics(),heroFSM=new EmberCore.HeroFSM(attackEvent);
  let audioPool=null,verticalBase=0;
  // 声音分两路`);
rep("if(a==='jump')p.buffer=.15;if(a==='attack')attack();if(a==='roll')roll();", "if(a==='jump')p.buffer=.2;if(a==='attack'){inputQueue.push(1);if(p.atkCd<=0&&p.roll<=0&&p.dash<=0){inputQueue.take(1);attack();}}if(a==='roll'){inputQueue.push(2);if(p.rollCd<=0&&heroFSM.canCancel()){inputQueue.take(2);roll();}}" );
rep('function clearHeld(){held={};','function clearHeld(){inputQueue.clear();held={};');
rep('p.hit=new Set();p.pogo=false;',"p.hit.clear();p.pogo=false;heroFSM.enter('attack','combat',C.swing);}\n  function attackEvent(){");
rep('p.inv=Math.max(0,p.inv-dt);','inputQueue.tick(dt);p.inv=Math.max(0,p.inv-dt);');
rep('    updatePlatforms(dt);','    heroFSM.tick(dt,p);if(p.rollCd<=0&&heroFSM.canCancel()&&inputQueue.take(2))roll();if(p.atkCd<=0&&p.roll<=0&&p.dash<=0&&inputQueue.take(1))attack();\n    updatePlatforms(dt);');
rep('Math.min(1,dt*17)','Math.min(1,dt*(p.ground?22:(m?11:2)))');
const start=s.indexOf('    const oldX=p.x;'),end=s.indexOf('    if(!was&&p.ground)',start);
if(start<0||end<0)throw Error('physics block');
s=s.slice(0,start)+`    if(p.drop&&p.y>=p.drop.y)p.drop=null;if(p.dash>0)p.vy=0;else p.vy+=1420*dt;
    physics.move(p,(p.vx+(p.kickX||0))*dt,p.vy*dt,platforms,FLOOR);p.x=clamp(p.x,12,WORLD-45);p.on=null;
    if(p.kickX){p.kickX*=Math.pow(.0001,dt);if(Math.abs(p.kickX)<4)p.kickX=0;}
    const landed=physics.landed;if(landed){const a=landed;if(a.mv||a.cr)p.on=a;if(a.cr&&!a.cr.st){a.cr.st=1;a.cr.t=.5;beep(220,.05,'square',.02);}if(a.w>=120&&!a.mv&&!a.cr){p.safeX=clamp(p.x,a.x+40,a.x+a.w-p.w-40);p.safeY=a.y-p.h;}}
    const cameraTarget=Math.min(verticalBase,p.y-120);viewY+=(cameraTarget-viewY)*Math.min(1,dt*8);
`+s.slice(end);
rep("const SA=p.attack>.1&&", "const SA=heroFSM.hitbox&&p.attack>.1&&");
// Reuse voice nodes: Web Audio source nodes for music remain separate.
const b0=s.indexOf('  function beep('),b1=s.indexOf('\n',b0);
s=s.slice(0,b0)+`  function beep(freq,duration,type,vol){const a=audio();if(!a||settings.sfx<=0)return;try{if(!audioPool)audioPool=new EmberCore.AudioPool(a,sfxBus||a.destination,16);audioPool.play(freq,duration,type,vol);}catch(e){}}
`+s.slice(b1+1);
// Physical drawing area ends above the touch controls; stage still holds the UI.
rep('cw=Math.max(1,Math.round(vw*d)),ch=Math.max(1,Math.round(vh*d))','playH=vh>vw||!coarse()?vh:Math.max(120,vh-132),cw=Math.max(1,Math.round(vw*d)),ch=Math.max(1,Math.round(playH*d))');
rep("canvas.style.height=vh+'px'","canvas.style.height=playH+'px'");
rep('W=H*vw/vh;scale=canvas.height/H;viewY=coarse()?60:0;', 'W=H*vw/playH;scale=canvas.height/H;viewY=0;');
rep('viewY=0;}}','viewY=0;}verticalBase=viewY;}');
// Frame scheduling survives a render exception, and reports it to the console.
rep('function frame(now){if(!canvas.width)resize();','function frame(now){requestAnimationFrame(frame);if(!canvas.width)resize();');
rep('if(slowT>2)lowFx=true;}requestAnimationFrame(frame);}', 'if(slowT>2)lowFx=true;}}');
// Cache the stationary sky gradient in an offscreen canvas (HTML canvas fallback).
rep('  function drawSky(){ctx.fillStyle=vgrad(\'sky\'+L.theme,0,620,T.sky);ctx.fillRect(-20,viewY-20,W+40,H+40);if(T.outdoor)drawSun();}',`  let skyLayer=null,skyTheme='',skyWidth=0,skyHeight=0;
  function drawSky(){if(!skyLayer||skyTheme!==L.theme||skyWidth!==Math.ceil(W)||skyHeight!==Math.ceil(H)){skyWidth=Math.ceil(W);skyHeight=Math.ceil(H);skyTheme=L.theme;skyLayer=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(skyWidth,skyHeight):document.createElement('canvas');skyLayer.width=skyWidth;skyLayer.height=skyHeight;const g=skyLayer.getContext('2d'),gradient=g.createLinearGradient(0,0,0,skyHeight);for(let i=0;i<T.sky.length;i++)gradient.addColorStop(T.sky[i][0],T.sky[i][1]);g.fillStyle=gradient;g.fillRect(0,0,skyWidth,skyHeight);}ctx.drawImage(skyLayer,0,viewY,W,H);if(T.outdoor)drawSun();}`);
// Convert particle/projectile object literal emission to positional pool writes.
function splitTop(str){let parts=[],start=0,depth=0,q='';for(let i=0;i<str.length;i++){let c=str[i];if(q){if(c==='\\')i++;else if(c===q)q='';continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth--;else if(c===','&&depth===0){parts.push(str.slice(start,i));start=i+1;}}parts.push(str.slice(start));return parts;}
for(const name of ['particles','shots']){const re=new RegExp(name+'\\.push\\(\\{','g'),occ=[],keys=[];let m;
  while((m=re.exec(s))){let i=re.lastIndex,depth=1,q='';for(;i<s.length;i++){const c=s[i];if(q){if(c==='\\')i++;else if(c===q)q='';continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='{')depth++;if(c==='}'&&!--depth)break;if(c==='}')depth++;} // balanced brace scan below replaces this simple scan
    // Locate the object end while respecting all strings and nesting.
    i=re.lastIndex;depth=1;q='';for(;i<s.length;i++){const c=s[i];if(q){if(c==='\\')i++;else if(c===q)q='';continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)break;}
    if(s[i+1]!==')')throw Error('multi emission '+name);const props={};for(const part of splitTop(s.slice(re.lastIndex,i))){const colon=part.indexOf(':');if(colon<0)throw Error(part);const key=part.slice(0,colon).trim();props[key]=part.slice(colon+1);if(!keys.includes(key))keys.push(key);}occ.push({start:m.index,end:i+2,props});re.lastIndex=i+2;
  }
  for(let i=occ.length-1;i>=0;i--){const o=occ[i];s=s.slice(0,o.start)+'emit_'+name+'('+keys.map(k=>o.props[k]||'undefined').join(',')+')'+s.slice(o.end);}
  const pool=name+'Pool',code='\n  const '+pool+'=new EmberCore.ObjectPool('+ (name==='particles'?512:256)+',()=>({'+keys.map(k=>k+':undefined').join(',')+'}),o=>{});\n  function emit_'+name+'('+keys.join(',')+'){const o='+pool+'.acquire();if(!o)return;'+keys.map(k=>'o.'+k+'='+k+';').join('')+name+'.push(o);}\n';
  rep('  const inputQueue=',code+'  const inputQueue=');
  // Release expired instances while compacting the same active array.
  const filter=name==='particles'?'particles=particles.filter(f=>f.life>0);if(particles.length>320)particles.splice(0,particles.length-320);':'shots=shots.filter(s=>s.life>0&&s.x>0&&s.x<WORLD&&s.y<FLOOR+200);';
  rep(filter,'{let n=0;for(let i=0;i<'+name+'.length;i++){const o='+name+'[i];if('+(name==='particles'?'o.life>0':'o.life>0&&o.x>0&&o.x<WORLD&&o.y<FLOOR+200')+')'+name+'[n++]=o;else '+pool+'.release(o);}'+name+'.length=n;}');
  // Pool resets accompany every non-declaration array reset.
  const init=s.indexOf(name+'=[]');s=s.slice(0,init+name.length+3)+s.slice(init+name.length+3).replaceAll(name+'=[]',name+'=[];'+pool+'.clear()');
}
fs.writeFileSync(file,s);let html=fs.readFileSync('dist/index.html','utf8').replaceAll('?v=5.4','?v=5.5');fs.writeFileSync('dist/index.html',html);
