'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../dist/js/ember.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.vtest={get W(){return W},get H(){return H},get stick(){return stick},stickMove};})();');
function boot(width,height){const nodes={},events={},frames=[],context={};const noop=()=>{};
  function node(id){return nodes[id]||(nodes[id]={hidden:false,style:{},classList:{add:noop,remove:noop},getContext:()=>context,querySelectorAll:()=>[],addEventListener:noop,getBoundingClientRect:()=>({left:30,top:40,width:400,height:200}),clientWidth:100,clientHeight:100});}
  const s={document:{getElementById:node,querySelectorAll:()=>[],addEventListener:noop},innerWidth:width,innerHeight:height,devicePixelRatio:3,localStorage:{getItem:()=>null,setItem:noop},addEventListener:(k,f)=>events[k]=f,requestAnimationFrame:f=>frames.push(f),setTimeout:f=>f(),matchMedia:()=>({matches:true}),console,Math,Set};s.window=s;
  vm.runInNewContext(source,s);return{s,nodes,events,frames,context};}
const a=boot(390,844);assert.equal(a.nodes.world.height,1688);assert(a.s.EmberGame,'portrait startup completes');
a.s.innerWidth=844;a.s.innerHeight=390;a.events.resize();assert.equal(a.nodes.world.height,596);assert.equal(a.nodes.world.width,1688);assert.equal(a.context.imageSmoothingEnabled,false);
const mapped=a.s.mapTouchToCanvas(230,140);assert(Math.abs(mapped.x-a.s.vtest.W/2)<1e-8);assert.equal(mapped.y,a.s.vtest.H/2);
a.s.vtest.stickMove({clientX:430,clientY:140});assert.equal(a.s.vtest.stick.x,1);assert.equal(a.s.vtest.stick.y,0);
a.s.innerWidth=390;a.s.innerHeight=844;a.events.resize();assert.equal(a.s.vtest.stick.x,0);
const b=boot(0,0);assert(b.s.EmberGame);const retry=b.frames.shift();b.s.innerWidth=844;b.s.innerHeight=390;retry();assert(b.nodes.world.width>0);
const previous=b.nodes.world.width;b.s.innerWidth=0;b.s.innerHeight=0;b.events.resize();assert.equal(b.nodes.world.width,previous,'keep last valid buffer during rotation');
b.s.visualViewport={width:740,height:360};b.events.resize();assert.equal(b.nodes.world.width,1480);assert.equal(b.nodes.world.height,536);
console.log('PASS portrait cold start, landscape recovery, capped DPR, smoothing, zero-size recovery, visual viewport and scaled joystick coordinates');
