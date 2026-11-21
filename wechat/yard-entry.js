import * as THREE from 'three';
import {createYardApp} from '../demos/anheli-module-yard/app.js';
import {createYardCanvasUI,createYardControls} from './yard-controls.js';

const maxWorldPixels=1_800_000;
const maxWorldRatio=2.35;
function renderRatio({width,height,pixelRatio}){
  return Math.min(pixelRatio,maxWorldRatio,Math.sqrt(maxWorldPixels/(width*height)));
}

function makeRendererCanvas(source,getViewport){
  return {
    get width(){return source.width;},
    set width(value){if(source.width!==value)source.width=value;},
    get height(){return source.height;},
    set height(value){if(source.height!==value)source.height=value;},
    getContext(type,options){return source.getContext(type,options);},
    addEventListener(type,listener,options){source.addEventListener?.(type,listener,options);},
    removeEventListener(type,listener,options){source.removeEventListener?.(type,listener,options);},
    getBoundingClientRect(){
      const {width,height}=getViewport();
      return {left:0,top:0,right:width,bottom:height,width,height};
    },
  };
}

function makeOverlay(canvas,ui){
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);
  camera.position.z=1;
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  const geometry=new THREE.PlaneGeometry(2,2);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  scene.add(new THREE.Mesh(geometry,material));
  return {
    render(renderer){
      if(ui.draw())texture.needsUpdate=true;
      const {autoClear}=renderer;
      renderer.autoClear=false;
      renderer.render(scene,camera);
      renderer.autoClear=autoClear;
    },
    dispose(){texture.dispose();geometry.dispose();material.dispose();},
  };
}

export function createGame(context){
  let viewport=context.viewport;
  let app,ui,overlay,unsubscribe;
  let elapsed=0,worldTouch=null,overlayTouch=null;
  const wxApi=context.wx||(typeof wx!=='undefined'?wx:null);
  context.setStage?.('ui-canvas');
  const controls=createYardControls();
  const createCanvas=()=>context.createOverlayCanvas();
  const overlayCanvas=createCanvas();
  ui=createYardCanvasUI(controls,overlayCanvas);
  ui.resize(viewport,renderRatio(viewport));
  overlay=makeOverlay(overlayCanvas,ui);
  const canvas=makeRendererCanvas(context.canvas,()=>viewport);
  const pointer=point=>({pointerId:point.id,clientX:point.x,clientY:point.y,button:0});
  function movePlayer(){
    const {x,y}=ui.movement();
    app?.setMovement(x,y);
  }
  function cancel(){
    worldTouch=null;
    overlayTouch=null;
    ui.cancel();
    app?.cancelInput();
  }
  function input(event){
    if(event.type==='cancel'){cancel();return;}
    const changed=event.changedTouches;
    if(event.type==='end'&&!changed.length){cancel();return;}
    const points=event.type==='move'&&!changed.length?event.touches:changed;
    for(const point of points){
      if(event.type==='start'){
        if(ui.joystickStart(point)){movePlayer();continue;}
        if(ui.hitsControl(point)){
          if(overlayTouch===null&&ui.touchStart(point))overlayTouch=point.id;
          continue;
        }
        if(worldTouch===null){worldTouch=point.id;app.pointerDown(pointer(point));}
      }else if(ui.joystickTouch(point,event.type)){
        movePlayer();
      }else if(point.id===overlayTouch){
        if(event.type==='move')ui.touchMove(point);
        else if(event.type==='end'){ui.touchEnd(point);overlayTouch=null;}
      }else if(point.id===worldTouch){
        if(event.type==='move')app.pointerMove(pointer(point));
        else if(event.type==='end'){app.pointerUp(pointer(point));worldTouch=null;}
      }
    }
  }
  try{
    context.setStage?.('renderer');
    app=createYardApp({
      ...controls,canvas,createCanvas,overlay,
      storage:context.platform.storage,
      pixelRatio:()=>renderRatio(viewport),
      survival:true,renderCards:false,
    });
    unsubscribe=context.input.subscribe(input);
  }catch(error){overlay.dispose();throw error;}
  const game={
    resize(value){viewport=value;cancel();ui.resize(value,renderRatio(value));app.resize();},
    update(dt){elapsed+=dt;},
    render(){app.step(elapsed*1000+16);},
    pause:cancel,resume:cancel,
    dispose(){cancel();unsubscribe?.();overlay.dispose();app.dispose?.();if(wxApi?.__yard===game)delete wxApi.__yard;},
    snapshot(){return {...app.snapshot(),ui:ui.snapshot()};},
    project:app.project,
  };
  // Simulation uses the same real Canvas and touch callback path.
  if(wxApi?.__test)wxApi.__yard=game;
  return game;
}
