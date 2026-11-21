import * as THREE from 'three';
import {createHouseModel} from './house-model.js';
import {createVillager,createLamb} from './figures.js';
import {createLivestockModel} from './livestock-models.js';
import {createFields} from './field-models.js';
import {createWoodland,groundHeight} from './woodland.js';
import {marketCenter} from './ruili-street.js';
import {createVacantSign} from './ruili-street-model.js';

const entryYaw=.40;
const entryPitch=.60;
const worldDistance=37;
const ray=new THREE.Raycaster();
const cursor=new THREE.Vector2();
const point=new THREE.Vector3();
const target=new THREE.Vector3();
const floor=new THREE.Plane(new THREE.Vector3(0,1,0));
const colorSpace=THREE.SRGBColorSpace;

const skyStops=[
  [0,'#283c59','#8da6df','#a3b6ef',1.12,.58],
  [5,'#344665','#90abdf','#a8bbf1',1.16,.62],
  [7,'#edbd98','#ffe7c5','#ffc891',1.52,2.3],
  [10,'#cbd9ad','#eaf2e2','#ffe4b4',1.66,2.57],
  [16,'#cbd9ad','#eaf2e2','#ffe4b4',1.66,2.57],
  [18.7,'#e2a58d','#d9bed4','#ffae75',1.26,2.31],
  [20.7,'#364763','#90a9df','#a5b6ee',1.18,.62],
  [24,'#283c59','#8da6df','#a3b6ef',1.12,.58],
].map(([hour,sky,ambient,sun,fill,key])=>({hour,sky:new THREE.Color(sky),ambient:new THREE.Color(ambient),sun:new THREE.Color(sun),fill,key}));

function lighting(scene) {
  const ambient=new THREE.HemisphereLight('#eaf2e2','#626d60',1.66);
  scene.add(ambient);
  const sunlight=new THREE.DirectionalLight('#ffe4b4',2.57);
  sunlight.position.set(-13,22,10);
  sunlight.target.position.set(0,0,-2);
  sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(1536,1536);
  sunlight.shadow.camera.left=-25;
  sunlight.shadow.camera.right=23;
  sunlight.shadow.camera.bottom=-24;
  sunlight.shadow.camera.top=20;
  sunlight.shadow.camera.near=1;
  sunlight.shadow.camera.far=63;
  sunlight.shadow.normalBias=.039;
  sunlight.shadow.bias=-.00014;
  sunlight.shadow.radius=2.5;
  scene.add(sunlight,sunlight.target);
  return {ambient,sunlight};
}

function createFishingVisual(scene) {
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.014,.026,1,7),
    new THREE.MeshStandardMaterial({color:'#ad7951',roughness:.88}));
  const float=new THREE.Group();
  float.add(new THREE.Mesh(new THREE.SphereGeometry(.1,10,8),
    new THREE.MeshStandardMaterial({color:'#eb805e',roughness:.56,emissive:'#bb4929',emissiveIntensity:.16})));
  const tip=new THREE.Mesh(new THREE.SphereGeometry(.069,8,6),
    new THREE.MeshStandardMaterial({color:'#f3df9f',roughness:.84,emissive:'#e5ad5b',emissiveIntensity:.1}));
  tip.position.y=.067;
  float.add(tip);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.79,1,30).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({color:'#ddf0cf',side:THREE.DoubleSide,transparent:true,depthWrite:false}));
  const lineGeometry=new THREE.BufferGeometry();
  const positions=new THREE.BufferAttribute(new Float32Array(9),3);
  lineGeometry.setAttribute('position',positions);
  const line=new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:'#fff3d8',transparent:true,opacity:.7}));
  line.frustumCulled=false;
  const group=new THREE.Group();
  group.add(rod,float,line,ring);
  group.visible=false;
  scene.add(group);
  const handle=new THREE.Vector3(),rodTip=new THREE.Vector3(),axis=new THREE.Vector3();
  const up=new THREE.Vector3(0,1,0);
  return (player,cast,time)=>{
    group.visible=cast.phase==='waiting'||cast.phase==='bite';
    if(!group.visible)return;
    const {bobber}=cast.spot;
    const heading=player.heading;
    const dx=Math.sin(heading),dz=Math.cos(heading);
    const y=groundHeight(player.x,player.z);
    const bite=cast.phase==='bite';
    handle.set(player.x+dx*.20+dz*.18,y+.95,player.z+dz*.20-dx*.18);
    rodTip.set(handle.x+dx*1.22,y+1.83+Math.sin(time*2)*.028,handle.z+dz*1.22);
    axis.subVectors(rodTip,handle);
    rod.position.copy(handle).lerp(rodTip,.5);
    rod.scale.y=axis.length();
    rod.quaternion.setFromUnitVectors(up,axis.normalize());
    float.position.set(bobber.x,-.226+Math.sin(time*(bite?12:2))*(bite?.056:.012),bobber.z);
    positions.setXYZ(0,rodTip.x,rodTip.y,rodTip.z);
    positions.setXYZ(1,(rodTip.x+bobber.x)*.5,(rodTip.y+float.position.y)*.38,(rodTip.z+bobber.z)*.5);
    positions.setXYZ(2,bobber.x,float.position.y,bobber.z);
    positions.needsUpdate=true;
    const wave=(time*(bite?2:.63))%1;
    ring.position.set(bobber.x,-.265,bobber.z);
    ring.scale.setScalar(.1+wave*(bite?.68:.39));
    ring.material.opacity=(1-wave)*(bite?.9:.51);
  };
}

function makeContactShadow(radius,createCanvas) {
  const paper=createCanvas();
  paper.width=paper.height=64;
  const ctx=paper.getContext('2d');
  const shade=ctx.createRadialGradient(32,32,4,32,32,32);
  shade.addColorStop(0,'#20372b69');
  shade.addColorStop(.47,'#20372b44');
  shade.addColorStop(1,'#20372b00');
  ctx.fillStyle=shade;
  ctx.fillRect(0,0,64,64);
  const tex=new THREE.CanvasTexture(paper);
  tex.colorSpace=colorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(radius,radius),new THREE.MeshBasicMaterial({
    map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
  }));
  mesh.rotation.x=-Math.PI/2;
  return mesh;
}

function makeHeart() {
  const shape=new THREE.Shape();
  shape.moveTo(0,-.11);
  shape.bezierCurveTo(-.045,-.07,-.19,.015,-.16,.093);
  shape.bezierCurveTo(-.138,.161,-.05,.155,0,.087);
  shape.bezierCurveTo(.05,.155,.138,.161,.16,.093);
  shape.bezierCurveTo(.19,.015,.045,-.07,0,-.11);
  return new THREE.Mesh(new THREE.ShapeGeometry(shape,12),
    new THREE.MeshBasicMaterial({color:'#ec917f',side:THREE.DoubleSide,transparent:true,depthWrite:false}));
}

export function createYardView(canvas,{garden,houseSite,animalIds,createCanvas=()=>document.createElement('canvas'),survival=false,pixelRatio=()=>1,overlay}) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  let renderStats={calls:0,triangles:0};
  renderer.outputColorSpace=colorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.08;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#cbd9ad');
  scene.fog=new THREE.Fog('#cbd9ad',42,83);
  const lights=lighting(scene);
  const renderFishing=createFishingVisual(scene);

  const woodland=createWoodland(garden,{createCanvas,survival});
  scene.add(woodland.group);
  const fields=createFields(scene,groundHeight);
  let visibleSeason;
  function updateSky(day) {
    if(day.season!==visibleSeason){
      woodland.setSeason(day.season);
      visibleSeason=day.season;
    }
    const index=skyStops.findIndex(stop=>stop.hour>day.hour);
    const before=skyStops[index-1],after=skyStops[index];
    const blend=THREE.MathUtils.smoothstep(day.hour,before.hour,after.hour);
    scene.background.copy(before.sky).lerp(after.sky,blend);
    scene.fog.color.copy(scene.background);
    lights.ambient.color.copy(before.ambient).lerp(after.ambient,blend);
    lights.sunlight.color.copy(before.sun).lerp(after.sun,blend);
    lights.ambient.intensity=THREE.MathUtils.lerp(before.fill,after.fill,blend);
    lights.sunlight.intensity=THREE.MathUtils.lerp(before.key,after.key,blend);
  }
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,115);
  let easternShadows=false;
  let yaw=entryYaw,pitch=entryPitch,width=1,height=1,zoom=false,survey=false;
  const houses=new Map();
  const villagers=new Map();
  const stock=new Map();
  const lambs=animalIds.map((id,i)=>{
    const model=createLamb(i);
    const heart=makeHeart();
    const shadow=makeContactShadow(1.7,createCanvas);
    heart.visible=false;
    scene.add(model.root,heart,shadow);
    return {id,...model,heart,shadow};
  });
  const playerShadow=makeContactShadow(1.14,createCanvas);
  scene.add(playerShadow);
  let house=null,houseBounds=null,activeVillager=null,visualHeading=.35,lastWetIndex=-1,lastWetAt=null;
  let vacancySign;
  function setEstateVacant(vacant) {
    if(vacant&&!vacancySign){
      vacancySign=createVacantSign(houseSite,groundHeight,createCanvas);
      scene.add(vacancySign);
    }
    if(vacancySign)vacancySign.visible=vacant;
  }
  const construction=new THREE.Group();
  const plank=new THREE.BoxGeometry(1,1,1);
  const wood=new THREE.MeshStandardMaterial({color:'#a67f54',roughness:.96});
  const stone=new THREE.MeshStandardMaterial({color:'#aaa087',roughness:1});
  const soil=new THREE.MeshStandardMaterial({color:'#a18b67',roughness:1,polygonOffset:true,polygonOffsetFactor:-1});
  scene.add(construction);

  function setConstruction(project) {
    construction.clear();
    renderer.shadowMap.needsUpdate=true;
    if(!project)return;
    const {site,width,depth}=project;
    construction.position.set(site.x,groundHeight(site.x,site.z),site.z);
    function piece(material,x,y,z,span,height,length){
      const mesh=new THREE.Mesh(plank,material);
      mesh.position.set(x,y,z);
      mesh.scale.set(span,height,length);
      mesh.castShadow=material!==soil;
      mesh.receiveShadow=true;
      construction.add(mesh);
    }
    const x=width*.48,z=depth*.48;
    piece(soil,0,.036,0,x*2,.07,z*2);
    for(const side of [-1,1]){
      piece(stone,0,.10,z*side,x*2,.15,.19);
      piece(stone,x*side,.10,0,.19,.15,z*2);
      for(const end of [-1,1])piece(wood,x*side,.31,z*end,.16,.60,.16);
    }
    for(let layer=0;layer<3;layer++){
      piece(wood,-x*.57,.15+layer*.13,z*.55,Math.min(width*.37,1.65),.115,.28);
    }
  }

  function houseModel(id) {
    if(!houses.has(id)) houses.set(id,createHouseModel(id));
    return houses.get(id);
  }
  function villager(id) {
    if(!villagers.has(id)) villagers.set(id,createVillager(id));
    return villagers.get(id);
  }
  function setHouse(id,site) {
    if(house) scene.remove(house);
    if(id===null){
      house=null;
      houseBounds=null;
      renderer.shadowMap.needsUpdate=true;
      return [];
    }
    house=houseModel(id);
    house.position.set(site.x,groundHeight(site.x,site.z),site.z);
    scene.add(house);
    house.updateMatrixWorld(true);
    houseBounds=new THREE.Box3().setFromObject(house);
    renderer.shadowMap.needsUpdate=true;
    return house.userData.collision;
  }

  function updateCamera(player,cast) {
    const aspect=width/height;
    const compact=aspect<1.1;
    let vertical=(compact?Math.max(17.6,20.3/aspect):15.65)*(zoom?.645:1);
    const byLake=THREE.MathUtils.smoothstep(-player.x,6,15);
    target.set(THREE.MathUtils.lerp(compact?.5:-1.3,-17.3,byLake),2.05,
      THREE.MathUtils.lerp(.88,-4.3,byLake));
    if (zoom) {
      const anchor=house?.position??houseSite;
      target.x=THREE.MathUtils.lerp(anchor.x,player.x,.68+.32*byLake);
      target.z=THREE.MathUtils.lerp(anchor.z,player.z,.77+.23*byLake);
      target.y=2.00;
    }
    else if(byLake>.3) {
      target.x+=Math.min(0,player.x+17)*.58;
    }
    const byAvenue=THREE.MathUtils.smoothstep(player.z,6.8,11.8);
    const byStable=THREE.MathUtils.smoothstep(player.x,8.8,14.5);
    const byStreet=THREE.MathUtils.smoothstep(player.x,17,28);
    target.x=THREE.MathUtils.lerp(target.x,player.x-1,byStable);
    target.z=THREE.MathUtils.lerp(target.z,player.z-1.1,byStable);
    target.x=THREE.MathUtils.lerp(target.x,player.x,byAvenue*.95);
    target.z=THREE.MathUtils.lerp(target.z,player.z-1.9,byAvenue);
    const squareFocus=(1-THREE.MathUtils.smoothstep(Math.abs(player.x-marketCenter.x),5,11))*byStreet;
    target.x=THREE.MathUtils.lerp(target.x,player.x+.55,byStreet);
    target.z=THREE.MathUtils.lerp(target.z,player.z-2.35,byStreet);
    target.z=THREE.MathUtils.lerp(target.z,marketCenter.z-.8,squareFocus*.52);
    target.y+=byStreet*.45;
    if(!zoom)vertical=Math.max(vertical,18.2*byStreet);
    if((!easternShadows&&player.x>27)||(easternShadows&&player.x<21)){
      easternShadows=!easternShadows;
      const offset=easternShadows?marketCenter.x:0;
      lights.sunlight.position.x=-13+offset;
      lights.sunlight.target.position.x=offset;
      renderer.shadowMap.needsUpdate=true;
    }
    if(survey){
      vertical=Math.max(vertical,14.8,22/aspect);
      target.set(player.x,1.9,player.z);
    }else if(cast?.spot){
      vertical*=1.10;
      target.x=THREE.MathUtils.lerp(target.x,player.x,.27);
      target.z=THREE.MathUtils.lerp(target.z,player.z,.18);
    }
    const streetPitch=Math.min(1.18,pitch+byStreet*.22);
    camera.position.set(
      target.x+Math.sin(yaw)*Math.cos(streetPitch)*worldDistance,
      target.y+Math.sin(streetPitch)*worldDistance,
      target.z+Math.cos(yaw)*Math.cos(streetPitch)*worldDistance
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
    let centerX=0,centerY=0;
    if(houseBounds&&!survey&&!zoom&&byLake===0&&byAvenue===0&&byStable===0&&houseBounds.max.x-houseBounds.min.x>7.6){
      const cameraBounds=new THREE.Box3();
      const corners=new THREE.Vector3();
      for(const x of [houseBounds.min.x,houseBounds.max.x]){
        for(const y of [houseBounds.min.y,houseBounds.max.y]){
          for(const z of [houseBounds.min.z,houseBounds.max.z]){
            cameraBounds.expandByPoint(corners.set(x,y,z).applyMatrix4(camera.matrixWorldInverse));
          }
        }
      }
      const margin=.55;
      const {min,max}=cameraBounds;
      vertical=Math.max(vertical,max.y-min.y+margin*2,(max.x-min.x+margin*2)/aspect);
      const horizontal=vertical*aspect;
      centerX=THREE.MathUtils.clamp(0,max.x+margin-horizontal/2,min.x-margin+horizontal/2);
      centerY=THREE.MathUtils.clamp(0,max.y+margin-vertical/2,min.y-margin+vertical/2);
    }
    camera.left=centerX-vertical*aspect/2;
    camera.right=centerX+vertical*aspect/2;
    camera.bottom=centerY-vertical/2;
    camera.top=centerY+vertical/2;
    camera.updateProjectionMatrix();
  }

  function resize(w,h,player,ratio=pixelRatio()) {
    width=w;
    height=h;
    renderer.setDrawingBufferSize(w,h,ratio);
    updateCamera(player);
  }

  function project(x,z,y=0) {
    const ndc=point.set(x,groundHeight(x,z)+y,z).project(camera);
    return {x:(1+ndc.x)*width*.5,y:(1-ndc.y)*height*.5};
  }

  function pickGround(x,y) {
    cursor.set(x/width*2-1,1-y/height*2);
    ray.setFromCamera(cursor,camera);
    floor.constant=0;
    if(!ray.ray.intersectPlane(floor,point)) return null;
    for(let i=0;i<3;i++){
      floor.constant=-groundHeight(point.x,point.z);
      ray.ray.intersectPlane(floor,point);
    }
    return {x:point.x,z:point.z};
  }

  function hitSheep(x,y,width) {
    let picked=null;
    let nearest=Infinity;
    for(const lamb of lambs){
      const pos=lamb.root.position;
      const p=project(pos.x,pos.z,.56);
      const feet=project(pos.x,pos.z);
      const distance=Math.hypot(x-p.x,y-p.y);
      const radius=Math.max(width<560?16:15,Math.abs(feet.y-p.y)*1.63);
      if(distance<radius&&distance<nearest){nearest=distance;picked=lamb.id;}
    }
    return picked;
  }

  function updateStock(records,player,time) {
    const ids=new Set(records.map(record=>record.id));
    for(const [id,model] of stock){
      if(ids.has(id))continue;
      scene.remove(model.root,model.shadow);
      stock.delete(id);
    }
    for(const record of records){
      let model=stock.get(record.id);
      if(!model){
        const variant=record.slot??0;
        model=record.species==='sheep'?createLamb(variant%3):createLivestockModel(record.species,variant);
        model.shadow=makeContactShadow(record.species==='horse'||record.species==='cattle'?2.25:1.0,createCanvas);
        scene.add(model.root,model.shadow);
        stock.set(record.id,model);
      }
      const mounted=record.id===player.mountedId;
      const {x,z}=mounted?player:record;
      const ground=groundHeight(x,z);
      model.root.position.set(x,ground+.016,z);
      model.shadow.position.set(x,ground+.013,z);
      model.root.rotation.y=mounted?visualHeading:record.heading??0;
      model.animate(time,mounted?player.walking:record.moving);
    }
  }

  function hitHorse(x,y) {
    for(const [id,model] of stock){
      if(!model.riderHeight)continue;
      const position=model.root.position;
      const center=project(position.x,position.z,.9);
      const foot=project(position.x,position.z);
      const radius=Math.max(15,Math.abs(foot.y-center.y)*1.34);
      if(Math.hypot(x-center.x,y-center.y)<radius)return id;
    }
    return null;
  }

  function frame(player,flock,records,time,wateredIndex,wateredAt,dt,plots,now,day,cast) {
    updateCamera(player,cast);
    updateSky(day);
    woodland.animateLake(time,THREE.MathUtils.smoothstep(lights.sunlight.intensity,.55,2.57));
    if(woodland.setMeadowPlots(plots))renderer.shadowMap.needsUpdate=true;
    fields.update(plots,now);
    if (activeVillager?.root !== villager(player.avatar).root){
      if (activeVillager) scene.remove(activeVillager.root);
      activeVillager=villager(player.avatar);
      scene.add(activeVillager.root);
    }
    const angleDelta=THREE.MathUtils.euclideanModulo(player.heading-visualHeading+Math.PI,Math.PI*2)-Math.PI;
    visualHeading+=angleDelta*Math.min(1,dt*16);
    updateStock(records,player,time);
    const saddle=stock.get(player.mountedId)?.riderHeight;
    activeVillager.root.position.set(player.x,groundHeight(player.x,player.z)+(saddle?saddle-.49:.018),player.z);
    activeVillager.root.rotation.y=visualHeading;
    activeVillager.animate(time,player.walking,Boolean(saddle),cast.phase==='waiting'||cast.phase==='bite');
    renderFishing(player,cast,time);
    playerShadow.visible=!saddle;
    playerShadow.position.set(player.x,groundHeight(player.x,player.z)+.011,player.z);
    flock.forEach((sheep,index)=>{
      const lamb=lambs[index];
      const dx=sheep.x-lamb.root.position.x;
      const dz=sheep.z-lamb.root.position.z;
      const passed=sheep.petAt===null?Infinity:time-sheep.petAt;
      const resting=passed<1.55;
      const facing=resting?Math.atan2(player.x-sheep.x,player.z-sheep.z):Math.atan2(dx,dz);
      if(resting||Math.hypot(dx,dz)>.0001){
        const delta=THREE.MathUtils.euclideanModulo(facing-lamb.root.rotation.y+Math.PI,Math.PI*2)-Math.PI;
        lamb.root.rotation.y+=delta*Math.min(1,dt*8);
      }
      const ground=groundHeight(sheep.x,sheep.z);
      lamb.root.position.set(sheep.x,ground+.02,sheep.z);
      lamb.animate(time+index*.35,!resting,resting?passed/1.55:0);
      lamb.shadow.position.set(sheep.x,ground+.012,sheep.z);
      lamb.heart.visible=resting;
      if(resting){
        lamb.heart.position.set(sheep.x,ground+1.37+passed*.35,sheep.z);
        lamb.heart.quaternion.copy(camera.quaternion);
        lamb.heart.material.opacity=Math.min(1,(1.55-passed)*2.8);
      }
    });
    if(wateredIndex>=0&&(wateredIndex!==lastWetIndex||wateredAt!==lastWetAt||time-wateredAt<.75)){
      woodland.water(wateredIndex,time,wateredAt);
      if(time-wateredAt>=.7){lastWetIndex=wateredIndex;lastWetAt=wateredAt;}
    }
    renderer.render(scene,camera);
    const {calls,triangles}=renderer.info.render;
    renderStats={calls,triangles};
    overlay?.render(renderer);
  }

  const thumbnailScene=new THREE.Scene();
  thumbnailScene.background=new THREE.Color('#d6d9bd');
  thumbnailScene.add(new THREE.HemisphereLight('#fff8df','#718371',2.6));
  const thumbnailSun=new THREE.DirectionalLight('#ffddb3',2.5);
  thumbnailSun.position.set(-3,7,7);
  thumbnailScene.add(thumbnailSun);
  const thumbCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,55);
  const faceCamera=new THREE.PerspectiveCamera(32,1,.1,25);

  function fillCard(destination,preview,cameraToUse) {
    const viewport=renderer.getSize(new THREE.Vector2());
    const ratio=renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(destination.width,destination.height,false);
    thumbnailScene.add(preview);
    renderer.render(thumbnailScene,cameraToUse);
    destination.getContext('2d').drawImage(canvas,0,0);
    thumbnailScene.remove(preview);
    renderer.setPixelRatio(ratio);
    renderer.setSize(viewport.x,viewport.y,false);
  }
  function houseCard(destination,id) {
    const preview=houseModel(id).clone();
    preview.position.set(0,0,0);
    const box=new THREE.Box3().setFromObject(preview,true);
    const center=box.getCenter(new THREE.Vector3());
    const size=box.getSize(new THREE.Vector3());
    const span=Math.max(size.x*.89,size.y,size.z*.95)*1.28;
    thumbCamera.left=-span*destination.width/destination.height/2;
    thumbCamera.right=-thumbCamera.left;
    thumbCamera.bottom=-span/2;
    thumbCamera.top=-thumbCamera.bottom;
    thumbCamera.position.copy(center).add(new THREE.Vector3(8,6,11));
    thumbCamera.lookAt(center);
    thumbCamera.updateProjectionMatrix();
    fillCard(destination,preview,thumbCamera);
  }
  function portrait(destination,id) {
    const preview=villager(id).root.clone();
    faceCamera.position.set(.39,1.48,1.92);
    faceCamera.lookAt(0,1.24,0);
    fillCard(destination,preview,faceCamera);
  }

  return {
    resize,frame,project,pickGround,hitSheep,hitHorse,setHouse,setConstruction,setEstateVacant,houseCard,portrait,fields,
    dispose(){renderer.dispose();},
    setSurvey(value){survey=value;},
    getHouseBounds(){return houseBounds&&{min:houseBounds.min.toArray(),max:houseBounds.max.toArray()};},
    setZoom(value){zoom=value;},
    orbit(dx,dy){yaw-=dx*.007;pitch=THREE.MathUtils.clamp(pitch+dy*.004,.35,1.15);},
    getCamera(){return {yaw,pitch,zoom};},
    getStats(){return {...renderStats,pixelRatio:renderer.getPixelRatio(),bufferWidth:canvas.width,bufferHeight:canvas.height};},
  };
}
