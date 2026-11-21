import {createYardApp} from './app.js';

const canvas=document.getElementById('yard');
const contextOptions={antialias:true,alpha:false,powerPreference:'high-performance'};
if(canvas.getContext('webgl2',contextOptions)){
  let storage;
  try { storage=window.localStorage; } catch { /* The yard can run in a temporary session. */ }
  const app=createYardApp({
    document,canvas,storage,
    createCanvas:()=>document.createElement('canvas'),
    createOption:(text,value)=>new Option(text,value),
    pixelRatio:()=>Math.min(devicePixelRatio||1,1.4),
    survival:new URLSearchParams(location.search).get('survival')==='1',
  });
  canvas.addEventListener('pointerdown',app.pointerDown);
  canvas.addEventListener('pointermove',app.pointerMove);
  canvas.addEventListener('pointerup',app.pointerUp);
  canvas.addEventListener('pointercancel',app.cancelInput);
  const stick=document.getElementById('yard-stick');
  let stickId=null;
  function moveStick(event){
    if(stickId!==event.pointerId)return;
    const box=stick.getBoundingClientRect();
    const x=event.clientX-box.left-box.width/2,y=event.clientY-box.top-box.height/2;
    const reach=26,scale=Math.max(reach,Math.hypot(x,y));
    app.setMovement(x/scale,y/scale);
    stick.style.setProperty('--stick-x',x/scale*reach+'px');
    stick.style.setProperty('--stick-y',y/scale*reach+'px');
  }
  function releaseStick(){
    stickId=null;
    app.setMovement(0,0);
    stick.style.removeProperty('--stick-x');
    stick.style.removeProperty('--stick-y');
  }
  stick.addEventListener('pointerdown',event=>{
    if(stickId!==null)return;
    stickId=event.pointerId;
    stick.setPointerCapture(stickId);
    moveStick(event);
  });
  stick.addEventListener('pointermove',moveStick);
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    stick.addEventListener(type,event=>{if(stickId===event.pointerId)releaseStick();});
  }
  addEventListener('keydown',app.keyDown);
  addEventListener('keyup',app.keyUp);
  addEventListener('blur',()=>{releaseStick();app.cancelInput();});
  new ResizeObserver(()=>app.resize()).observe(canvas);
  window.__moduleYard={project:app.project,snapshot:app.snapshot};
  function frame(timestamp){
    app.step(timestamp);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}else{
  document.getElementById('message').textContent='此浏览器暂时无法启用 3D。请打开 Chrome 或 Edge 的图形加速后再试。';
}
