import * as THREE from 'three';
import {addLakeBank} from './lake-bank.js';
import {addAvenueMarker} from './avenue-marker.js';
import {addStable} from './stable.js';
import {plotSize} from './livestock.js';
import {addSeasonalWater} from './lake-season-water.js';
import {avenueEastStops,streetReserved,streetTerrainBlend} from './ruili-street.js';
import {addRuiliStreet} from './ruili-street-model.js';

const lake={x:-15.5,z:-5.9,rx:7.4,rz:4.75,level:-.28};
const TAU=Math.PI*2;
const seasonalLooks={
  spring:{land:['#b6ba78','#527653','#a28a69'],woods:['#96af70','#6c925d'],meadow:['#9cb26c','#749867'],petals:['#e9a5a8','#ecd49f']},
  summer:{land:['#acb779','#436a50','#938364'],woods:['#709a65','#487958'],meadow:['#8ea45e','#698d56'],petals:['#dfac85','#dac4d2']},
  autumn:{land:['#c3aa6e','#7c7850','#a79168'],woods:['#c49558','#768954'],meadow:['#bca466','#9a9c65'],petals:['#e1bb81','#c99579']},
  winter:{land:['#b5b194','#697e70','#9b947f'],woods:['#a3ab91','#6b8779'],meadow:['#adad91','#819484'],petals:['#dbcabb','#b2b7aa']},
};
function outline(angle) {
  const original=1+.052*Math.sin(angle*3+.65)+.032*Math.cos(angle*5-.85);
  const shoreZ=lake.z+Math.sin(angle)*lake.rz*original;
  const northernEdge=THREE.MathUtils.smoothstep(-shoreZ,8.12,9.94);
  const width=.68+.42*Math.max(0,-Math.cos(angle))+.16*Math.sin(angle*4+.4);
  return original*(1+northernEdge*width);
}
const fixedTrees=[
  [-8.3,-9,6.5],[5.9,-7.65,7.7],[-6.7,-13,8.3],[10.5,-8.4,6.2],[-13.4,3.7,5.7],
  [22.1,6.8,7.8],[-16.4,7.5,5.2],[16.4,-2.5,7.4],[19,16.3,4.8],
  [1.2,-13.2,8.1],[-14.8,-12.7,8],[-21.8,-11.8,7.1],[-24.8,-5,6.9],
  [-22.3,2.4,5.5],[19.4,1.8,7.9],[21.1,-8.7,8.1],
];
const avenueStops=[
  [-35,10.4],[-23.5,11.55],[-17.3,11.7],[-10,12.5],[-1.05,12.5],
  [5.9,12.55],[12.7,11.85],[17.4,11.85],...avenueEastStops,
];
const avenueHalfWidth=1.57;

function avenueZ(x) {
  for(let i=1;i<avenueStops.length;i++){
    const [right,zRight]=avenueStops[i];
    if(x>right)continue;
    const [left,zLeft]=avenueStops[i-1];
    return THREE.MathUtils.lerp(zLeft,zRight,THREE.MathUtils.smoothstep(x,left,right));
  }
  return avenueStops.at(-1)[1];
}

const avenueGap=(x,z)=>Math.abs(z-avenueZ(x));
export const onAvenue=(x,z)=>avenueGap(x,z)<=avenueHalfWidth;

function shorePoint(angle,radial=1) {
  const radius=outline(angle)*radial;
  return {x:lake.x+Math.cos(angle)*lake.rx*radius,z:lake.z+Math.sin(angle)*lake.rz*radius};
}

function lakeRadius(x,z) {
  const u=(x-lake.x)/lake.rx,v=(z-lake.z)/lake.rz;
  return Math.hypot(u,v)/outline(Math.atan2(v,u));
}

const hill=(x,z,cx,cz,rx,rz)=>Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
export function groundHeight(x,z) {
  const edge=THREE.MathUtils.smoothstep(Math.max(Math.abs(x)/13,z/11,-z/9),.69,1.46);
  const height=edge*(2.6*hill(x,z,-22,-19,11,11)+3.4*hill(x,z,15,-21,11,10)+.65*Math.sin(x*.2)*Math.cos(z*.20));
  const radius=lakeRadius(x,z);
  const underwater=lake.level-.46*(1-THREE.MathUtils.smoothstep(radius,.50,1));
  const land=THREE.MathUtils.lerp(underwater,height,THREE.MathUtils.smoothstep(radius,1,1.18));
  const shoulder=THREE.MathUtils.smoothstep(avenueGap(x,z),avenueHalfWidth+.25,avenueHalfWidth+2);
  return THREE.MathUtils.lerp(.035,land,shoulder*(1-streetTerrainBlend(x,z)));
}
export const pondBlocks=(x,z)=>lakeRadius(x,z)<1.038;
export const lakesideTrail=[
  [-.55,3.0],[-3.6,3.0],[-6.6,2.1],[-9.2,1.5],[-12.1,.95],[-16,.4],
  [-19.4,-.1],[-21.95,-1.15],[-23.0,-2.95],
];

function randomSource(seed) {
  return () => {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
}
const standard=(options={})=>new THREE.MeshStandardMaterial({roughness:.92,...options});
function batches(parent,geometry,material,items,{cast=false,receive=true}={}) {
  if(!items.length) return;
  const mesh=new THREE.InstancedMesh(geometry,material,items.length);
  const node=new THREE.Object3D();
  const tint=new THREE.Color();
  for(const [i,[x,y,z,sx,sy,sz,yaw,color,pitch=0,roll=0]] of items.entries()) {
    node.position.set(x,y,z);
    node.scale.set(sx,sy,sz);
    node.rotation.set(pitch,yaw,roll);
    node.updateMatrix();
    mesh.setMatrixAt(i,node.matrix);
    mesh.setColorAt(i,tint.set(color));
  }
  mesh.castShadow=cast;
  mesh.receiveShadow=receive;
  parent.add(mesh);
  return mesh;
}

function makeTerrain(random) {
  const geometry=new THREE.PlaneGeometry(104,104,148,148).rotateX(-Math.PI/2);
  const points=geometry.attributes.position;
  const colors=new Float32Array(points.count*3);
  const meadowWeight=new Float32Array(points.count);
  const shoreWeight=new Float32Array(points.count);
  for(let i=0;i<points.count;i++){
    const oldX=points.getX(i),z=points.getZ(i);
    const x=oldX>18?18+(oldX-18)*1.5:oldX;
    const y=groundHeight(x,z);
    points.setX(i,x);
    points.setY(i,y);
    const weight=.24+.38*hill(x,z,-3,2,18,13)+Math.sin(x*.61+Math.sin(z*.37))*.072+Math.cos(z*.58+x*.2)*.095+random()*.16;
    meadowWeight[i]=THREE.MathUtils.clamp(weight,.06,.97);
    const radius=lakeRadius(x,z);
    shoreWeight[i]=.69*(1-THREE.MathUtils.smoothstep(Math.abs(radius-1),.015,.16));
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,standard({vertexColors:true}));
  mesh.receiveShadow=true;
  function setColors(palette){
    const [light,shadow,mud]=palette.map(value=>new THREE.Color(value));
    const color=new THREE.Color();
    for(let i=0;i<points.count;i++){
      color.copy(shadow).lerp(light,meadowWeight[i]).lerp(mud,shoreWeight[i]);
      color.toArray(colors,i*3);
    }
    geometry.attributes.color.needsUpdate=true;
  }
  return {mesh,setColors};
}

function seasonalTint(mesh,strength) {
  const original=mesh.instanceColor.array.slice();
  const matrices=mesh.instanceMatrix.array;
  const tone=new THREE.Color();
  const variant=new THREE.Color();
  return palette=>{
    const [light,shade]=palette.map(value=>new THREE.Color(value));
    for(let i=0;i<mesh.count;i++){
      const x=matrices[i*16+12],z=matrices[i*16+14];
      const band=.5+.5*Math.sin(x*.51+z*.37+Math.sin(z*.3)*1.4);
      const weight=THREE.MathUtils.smoothstep(band,.23,.74);
      variant.copy(shade).lerp(light,weight);
      tone.fromArray(original,i*3).lerp(variant,strength);
      mesh.setColorAt(i,tone);
    }
    mesh.instanceColor.needsUpdate=true;
  };
}

function clusterGeometry() {
  const geometry=new THREE.IcosahedronGeometry(1,2);
  const points=geometry.attributes.position;
  for(let i=0;i<points.count;i++){
    const x=points.getX(i),y=points.getY(i),z=points.getZ(i);
    const surface=1+.115*Math.sin(x*10.2+y*4.3)*Math.cos(z*11.4-y*3.1)+.063*Math.sin(x*15-z*4+y*6);
    points.setXYZ(i,x*surface,y*surface,z*surface);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function bladeGeometry() {
  const pos=[];
  const rgb=[];
  const random=randomSource(119);
  for(let n=0;n<10;n++){
    const angle=random()*Math.PI*2;
    const x=(random()-.5)*.74,z=(random()-.5)*.72;
    const dy=.30+random()*.72;
    const dx=Math.sin(angle)*.33,dz=Math.cos(angle)*.33;
    const w=.015+random()*.030;
    const wx=Math.cos(angle)*w,wz=Math.sin(angle)*w;
    const footA=[x-wx,0,z-wz],footB=[x+wx,0,z+wz];
    const midA=[x-wx*.53+dx*.32,dy*.55,z-wz*.53+dz*.32],midB=[x+wx*.53+dx*.32,dy*.55,z+wz*.53+dz*.32];
    const tip=[x+dx,dy,z+dz];
    pos.push(...footA,...footB,...midA,...midA,...footB,...midB,...midA,...midB,...tip);
    for(const value of [.48,.54,.85,.85,.54,.90,.85,.90,1.12]) rgb.push(value,value,value);
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geom.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  geom.computeVertexNormals();
  return geom;
}

function addForest(group,random) {
  const groves=new Map();
  const groveSize=10;
  const greens=['#71985e','#7da263','#93ad6d','#698e5e','#527b54','#658e59'];
  const oaks=[...fixedTrees,[-13.7,-16.4,7.4],[-16.1,-17.6,9.1],[-20.3,-17.8,7.1],
    [-25.8,-16.1,7.5],[-29.3,-11.2,8.4],[-30.5,-7.6,7.8],[-9.15,-14.1,6.7]];
  for(let i=0;i<85;i++){
    const angle=i/85*Math.PI*2;
    if(Math.sin(angle)>.47&&Math.abs(Math.cos(angle))<.84) continue;
    const radius=25+random()*14;
    oaks.push([Math.cos(angle)*radius,Math.sin(angle)*radius,5+random()*6]);
  }
  const bark=['#987b51','#936d45','#856b50','#776b52'];
  for(const [x,z,h] of oaks){
    if(pondBlocks(x,z)||trailGap(x,z)<1.14||avenueGap(x,z)<2.52) continue;
    const groveKey=Math.floor(x/groveSize)+','+Math.floor(z/groveSize);
    let grove=groves.get(groveKey);
    if(!grove){
      grove={twigs:[],canopy:[],leaves:[]};
      groves.set(groveKey,grove);
    }
    // Keep the original random sequence for the established woodland.
    const {twigs,canopy,leaves}=streetReserved(x,z,.8)?{twigs:[],canopy:[],leaves:[]}:grove;
    const y=groundHeight(x,z);
    const size=h*.27;
    const tone=bark[Math.floor(random()*bark.length)];
    for(let n=0;n<3;n++){
      const angle=n*2.07+random();
      const dx=Math.cos(angle)*size*.30,dz=Math.sin(angle)*size*.33;
      twigs.push([x+dx*.3,y+h*.24,z+dz*.3,h*.051,h*.52,h*.055,angle,tone,.16*Math.cos(angle),.21*Math.sin(angle)]);
      twigs.push([x+dx*.52,y+h*.56,z+dz*.52,h*.032,h*.32,h*.036,angle,tone,.4*Math.cos(angle),.5*Math.sin(angle)]);
    }
    for(let j=0;j<8;j++){
      const bearing=j*2.39996;
      const r=(j===7?0:.38+random()*.37)*size;
      const cx=x+Math.cos(bearing)*r,cz=z+Math.sin(bearing)*r;
      const level=y+h*(.64+random()*.22);
      const lx=size*(.61+random()*.27),ly=size*(.50+random()*.28),lz=size*(.62+random()*.15);
      const green=greens[Math.floor(random()*greens.length)];
      canopy.push([cx,level,cz,lx,ly,lz,bearing,green]);
      if(Math.hypot(x,z)>22) continue;
      for(let k=0;k<28;k++){
        const az=random()*Math.PI*2;
        const elevation=random()*1.98-.5;
        const f=Math.cos(elevation);
        leaves.push([cx+Math.cos(az)*lx*f*.91,level+Math.sin(elevation)*ly*.92,cz+Math.sin(az)*lz*f*.91,
          .10+random()*.26,.055+random()*.11,.09+random()*.16,az,greens[(k+j)%greens.length],.48,.36]);
      }
    }
  }
  const barkGeom=new THREE.CylinderGeometry(.56,1.13,1,7);
  const canopyGeom=clusterGeometry();
  const leafGeom=new THREE.IcosahedronGeometry(1,0);
  const barkMaterial=standard(),canopyMaterial=standard(),leafMaterial=standard();
  const tints=[];
  for(const {twigs,canopy,leaves} of groves.values()){
    if(twigs.length)batches(group,barkGeom,barkMaterial,twigs,{cast:true});
    if(canopy.length)tints.push(seasonalTint(batches(group,canopyGeom,canopyMaterial,canopy,{cast:true}),.78));
    if(leaves.length)tints.push(seasonalTint(batches(group,leafGeom,leafMaterial,leaves),.73));
  }
  return palette=>{for(const tint of tints)tint(palette);};
}

const pathPoints=[[-1.67,-1.2],[-1.97,.2],[-1.65,1.8],[-.55,3.0],[-.97,4.75],[-.6,6.5],[-.9,10.2],[-1.05,11.48]];
function routeGap(x,z,route) {
  let gap=Infinity;
  for(let i=1;i<route.length;i++){
    const [a,b]=route[i-1], [c,d]=route[i];
    const dx=c-a,dz=d-b;
    const t=THREE.MathUtils.clamp(((x-a)*dx+(z-b)*dz)/(dx*dx+dz*dz),0,1);
    gap=Math.min(gap,Math.hypot(x-a-dx*t,z-b-dz*t));
  }
  return gap;
}

const trailGap=(x,z)=>Math.min(routeGap(x,z,pathPoints),routeGap(x,z,lakesideTrail));

export function fieldTerrainBlock(x,z) {
  if(lakeRadius(x,z)<1.11)return '这块地贴着水岸。';
  if(avenueGap(x,z)<1.9||trailGap(x,z)<.85)return '这块地占用公共道路。';
  if(streetReserved(x,z,.1))return '这块地属于街区或公共集市。';
  if(fixedTrees.some(([treeX,treeZ])=>Math.hypot(x-treeX,z-treeZ)<.73))return '这块地上有树。';
  return '';
}

function addMeadow(group,random) {
  const grasses=[], rocks=[], flowerStems=[], petals=[], cores=[], shrubbery=[];
  const mosses=['#71894d','#9da957','#9ab365','#798f4f','#bed17b','#6d8e54'];
  const rockColors=['#b1a58a','#908e71','#cdbea0','#8d927f','#b7ad94'];
  const petalPalette=['#dc9279','#bd9bc4','#f8e5be','#dfae62','#9386bd','#ecb2a6'];
  for(let i=0;i<3600;i++) {
    const x=(random()-.5)*48,z=(random()-.46)*41;
    if(pondBlocks(x,z)||avenueGap(x,z)<1.85 || (x>12.2&&x<17.94&&z>1.75&&z<8.5) ||
      (Math.abs(x+1.8)<4.2 && Math.abs(z+3.4)<3.12) || trailGap(x,z)<.83+random()*.25) continue;
    if(x>-8.7&&x<-2.1&&z>4.45&&z<7.02) continue;
    const inClearing=Math.abs(x)<11&&z>0&&z<8;
    const dense=Math.sin(x*.88+z*.44)*Math.sin(z*1.16)+random()*.60>.31;
    if(inClearing&&!dense&&random()<.84) continue;
    const size=.25+random()*.62;
    const height=size*(inClearing?.82:1.32);
    const grass=[x,groundHeight(x,z),z,size,height,size,random()*6.28,mosses[Math.floor(random()*mosses.length)]];
    if(!streetReserved(x,z,.25))grasses.push(grass);
  }
  const beds=[[-8.3,2.4,1.4],[-8,8.7,1.9],[2.8,-2.3,1.15],[3.0,.2,1.3],[12.6,6,1.2],[5.6,9.1,1.4],[-5.2,-1.1,.85],[-10.8,5.7,1.6],[1.6,11.7,1.4],[-12.1,-.54,1.1],[10.8,9.9,1.8],[2.97,2.22,.78],[-17.1,1.86,1.2],[-21.7,1.14,1.12],[-24,-1.2,.85]];
  for(const [x,side] of [[-21,-1],[-17,1],[-12,-1],[-7,1],[-4,-1],[2,1],[6.6,-1],[9.6,1],[13,-1],[16,1]]){
    beds.push([x,avenueZ(x)+side*2.55,1.08]);
  }
  for(const [cx,cz,r] of beds){
    const color=petalPalette[Math.floor(random()*petalPalette.length)];
    for(let i=0;i<30;i++){
      const angle=random()*Math.PI*2,radius=r*Math.sqrt(random());
      const x=cx+Math.cos(angle)*radius,z=cz+Math.sin(angle)*radius;
      if(pondBlocks(x,z)||avenueGap(x,z)<1.88||trailGap(x,z)<.82) continue;
      const y=groundHeight(x,z),h=.18+random()*.42;
      flowerStems.push([x,y+h*.46,z,.018,h*.93,.018,angle,'#667f42',0,.14]);
      const headSize=.054+random()*.04;
      cores.push([x-.018,y+h,z,headSize*.54,headSize*.50,headSize*.54,0,'#ddbe74']);
      for(let k=0;k<5;k++){
        const a=k*Math.PI*2/5+angle;
        petals.push([x+Math.cos(a)*headSize*.73-.018,y+h-.006,z+Math.sin(a)*headSize*.73,
          headSize*.67,headSize*.24,headSize*.54,a,color]);
      }
      if(i%8===0) shrubbery.push([x,y+.23,z,.28+random()*.29,.28+random()*.29,.34,angle,mosses[i%mosses.length]]);
    }
  }
  for(let i=0;i<105;i++){
    const x=(random()-.5)*41,z=(random()-.5)*38;
    if((Math.abs(x)<10&&z>-.9&&z<10.0)||pondBlocks(x,z)||avenueGap(x,z)<2.1||trailGap(x,z)<.9) continue;
    const unit=.16+random()**2*.65;
    const rock=[x,groundHeight(x,z)+unit*.19,z,unit*1.4,unit*.66,unit,random()*6.28,rockColors[i%rockColors.length],.12,.13];
    if(!streetReserved(x,z,.25))rocks.push(rock);
  }
  const flower=new THREE.IcosahedronGeometry(1,0);
  const grass=batches(group,bladeGeometry(),standard({side:THREE.DoubleSide,vertexColors:true}),grasses);
  const blooms=batches(group,flower,standard(),petals);
  const shrubs=batches(group,new THREE.IcosahedronGeometry(1,1),standard(),shrubbery,{cast:true});
  const tintGrass=seasonalTint(grass,.73);
  const tintBlooms=seasonalTint(blooms,.57);
  const tintShrubs=seasonalTint(shrubs,.76);
  const meadow=[grass,blooms,shrubs,
    batches(group,new THREE.DodecahedronGeometry(1,0),standard({flatShading:true}),rocks,{cast:true}),
    batches(group,flower,standard(),cores),
    batches(group,new THREE.CylinderGeometry(.58,1,1,3),standard(),flowerStems),
  ].filter(Boolean).map(mesh=>({
    mesh,transforms:mesh.instanceMatrix.array.slice(),hidden:new Uint8Array(mesh.count),
  }));
  const transform=new THREE.Matrix4();
  const zeroScale=new THREE.Vector3(0,0,0);
  const halfPlot=plotSize/2;
  let previousPlots=[];
  function setMeadowPlots(plots) {
    if(plots===previousPlots)return false;
    const sameSites=plots.length===previousPlots.length&&plots.every(({x,z},index)=>{
      const previous=previousPlots[index];
      return x===previous.x&&z===previous.z;
    });
    previousPlots=plots;
    if(sameSites)return false;
    let shadowsChanged=false;
    for(const {mesh,transforms,hidden} of meadow){
      let changed=false;
      for(let i=0;i<mesh.count;i++){
        const offset=i*16;
        const x=transforms[offset+12],z=transforms[offset+14];
        const inPlot=plots.some(plot=>Math.abs(plot.x-x)<halfPlot&&Math.abs(plot.z-z)<halfPlot);
        if(inPlot===Boolean(hidden[i]))continue;
        hidden[i]=Number(inPlot);
        transform.fromArray(transforms,offset);
        if(inPlot)transform.scale(zeroScale);
        mesh.setMatrixAt(i,transform);
        changed=true;
      }
      if(changed){
        mesh.instanceMatrix.needsUpdate=true;
        if(mesh.castShadow)shadowsChanged=true;
      }
    }
    return shadowsChanged;
  }
  function setColors(look){
    tintGrass(look.meadow);
    tintShrubs(look.woods);
    tintBlooms(look.petals);
  }
  return {setMeadowPlots,setColors};
}

function addStoneWalk(group,random) {
  const slabs=[];
  const soil=[];
  const shades=['#c6b48b','#bbb091','#b7aa8e','#d0bf9c','#b5a180','#c7bfa2'];
  for(const route of [pathPoints,lakesideTrail]){
    const curve=new THREE.CatmullRomCurve3(route.map(([x,z])=>new THREE.Vector3(x,0,z)));
    const samples=Math.ceil(curve.getLength()*3);
    const byLake=route===lakesideTrail;
    for(let index=0;index<=samples;index++){
      const point=curve.getPointAt(index/samples),tangent=curve.getTangentAt(index/samples);
      const angle=Math.atan2(-tangent.z,tangent.x)-Math.PI/2;
      soil.push([point.x,groundHeight(point.x,point.z)+.013,point.z,byLake?.66:.82,.13,.36,
        angle,byLake?'#a99c76':'#ad9c71']);
      const stoneWidth=byLake?.74:1;
      for(const side of [-1,0,1]){
        const offset=side*(.47+random()*.13)*stoneWidth;
        const x=point.x+tangent.z*offset+(random()-.5)*.18;
        const z=point.z-tangent.x*offset+(random()-.5)*.17;
        slabs.push([x,groundHeight(x,z)+.018,z,(.18+random()*.21)*stoneWidth,.24+random()*.18,
          .17+random()*.17,random()*TAU,shades[index%shades.length],.04,.06]);
      }
    }
  }
  batches(group,new THREE.CylinderGeometry(1,1,.25,12),standard(),soil);
  batches(group,new THREE.CylinderGeometry(.87,1,.20,7,1),standard(),slabs);
}

function addAvenue(group,random) {
  const positions=[],colors=[],indices=[],stones=[];
  const tints=['#bba481','#c6ae89','#b39f7d','#ccb897','#a59171','#b19a75'].map(color=>new THREE.Color(color));
  const tones=[-.03,.04,.09,.13,.065,.03,-.04];
  const columns=tones.length;
  const color=new THREE.Color();
  const formerRows=180;
  const extensionRows=84;
  for(let row=0;row<=formerRows+extensionRows;row++){
    const x=row<=formerRows?-35+row*65/formerRows:30+(row-formerRows)*30/extensionRows;
    const center=avenueZ(x);
    const width=avenueHalfWidth+.07*Math.sin(x*.54)+.07*Math.cos(x*.87);
    for(let column=0;column<columns;column++){
      const z=center+(column*2/(columns-1)-1)*width;
      positions.push(x,groundHeight(x,z)+.022,z);
      color.copy(tints[column%2?0:1]).lerp(tints[4],.19+random()*.40-tones[column]);
      colors.push(color.r,color.g,color.b);
      if(row===0||column===0)continue;
      const corner=(row-1)*columns+column-1;
      indices.push(corner,corner+1,corner+columns,corner+1,corner+columns+1,corner+columns);
    }
  }
  const road=new THREE.BufferGeometry();
  road.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  road.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  road.setIndex(indices);
  road.computeVertexNormals();
  const surface=new THREE.Mesh(road,standard({vertexColors:true}));
  surface.receiveShadow=true;
  group.add(surface);
  for(let i=0;i<365;i++){
    const x=-34+i*.254+(random()-.5)*.19;
    const edge=i%5!==0;
    const side=i%2===0?-1:1;
    const drift=edge?1.36+random()*.29:.60+random()*.35;
    const z=avenueZ(x)+side*drift;
    if(trailGap(x,z)<.76 || (i%11===0&&edge))continue;
    const size=edge?.11+random()*.14:.065+random()*.085;
    const height=.033+random()*.034;
    stones.push([x,groundHeight(x,z)+.024+height*.17,z,size*1.32,height,size*.79,
      random()*TAU,tints[(i+2)%tints.length],.04,.08]);
  }
  batches(group,new THREE.DodecahedronGeometry(1,0),standard({flatShading:true}),stones);
}

function addWaterlineStones(group,random) {
  const pebbles=[];
  const colors=['#a2a69a','#788d85','#a7aaa1','#98a399','#b3ae9a'];
  const inlets=[-2.80,-2.22,-1.85,-1.47,-.89,-.54,.37,1.59,2.02,2.67];
  for(const angle of inlets){
    for(let i=0;i<9;i++){
      const radius=.986+random()*.075;
      const {x,z}=shorePoint(angle+(random()-.5)*.15,radius);
      if(trailGap(x,z)<.82)continue;
      const size=.14+random()**1.8*(angle<0?.57:.41);
      const ground=groundHeight(x,z);
      const height=ground+size*.19;
      if(height+size*.53<=lake.level)continue;
      pebbles.push([x,height,z,size*1.29,size*.53,size*.82,random()*TAU,colors[i%colors.length],.15,.17]);
    }
  }
  batches(group,new THREE.DodecahedronGeometry(1,0),standard({flatShading:true}),pebbles);
}

const fence=[
  [4.3,1.6,11.6,1.6],[11.6,1.6,11.6,7.6],[4.3,1.6,4.3,3.5],
  [4.3,5.7,4.3,7.6],[4.3,7.6,11.6,7.6],
];
export function createWoodland(garden,{createCanvas=()=>document.createElement('canvas'),survival=false}={}) {
  const group=new THREE.Group();
  const random=randomSource(2008);
  const wood=['#958060','#ac906a','#c2a77d','#b59770'];
  const box=new THREE.BoxGeometry(1,1,1);
  const terrain=makeTerrain(random);
  group.add(terrain.mesh);
  const tintWoods=addForest(group,random);
  const waterSurface=addSeasonalWater(group,{level:lake.level,shorePoint,lakeRadius,random:randomSource(4513),batches,standard});
  const meadow=addMeadow(group,random);
  addAvenue(group,randomSource(5881));
  addRuiliStreet({group,groundHeight,avenueZ,random:randomSource(38265),standard,batches,createCanvas});
  addStoneWalk(group,random);
  addLakeBank({group,random:randomSource(4515),standard,batches,groundHeight,shorePoint,pathGap:trailGap,waterLevel:lake.level});
  addWaterlineStones(group,randomSource(4526));
  addAvenueMarker(group,groundHeight,createCanvas);
  addStable({group,standard,batches,groundHeight});
  const posts=[],rails=[];
  for(const [x0,z0,x1,z1] of fence){
    const length=Math.hypot(x1-x0,z1-z0),segments=Math.ceil(length/1.37);
    for(let i=0;i<=segments;i++){
      const x=x0+(x1-x0)*i/segments,z=z0+(z1-z0)*i/segments,ground=groundHeight(x,z);
      posts.push([x,ground+.45,z,.145,.9+random()*.10,.17,.1,wood[i%4],(random()-.5)*.08,(random()-.5)*.08]);
      if(i===segments) continue;
      for(const height of [.32,.62]){
        const cx=x+(x1-x0)/segments*.5,cz=z+(z1-z0)/segments*.5;
        rails.push([cx,groundHeight(cx,cz)+height,cz,length/segments+.04,.082+random()*.028,.075,
          Math.atan2(z0-z1,x1-x0),wood[(i+1)%4],0,(random()-.5)*.07]);
      }
    }
  }
  batches(group,box,standard(),posts,{cast:true});
  batches(group,box,standard(),rails,{cast:true});

  const soil=[];
  const planks=[];
  const stems=[], greens=[], heads=[];
  for(const bed of garden){
    const {id,x,z,w,d}=bed;
    soil.push([x,.11,z,w,.235,d,0,'#79644a']);
    for(const side of [-1,1]){
      planks.push([x,.143,z+side*d/2,w+.10,.29,.15,0,'#ad8660']);
      planks.push([x+side*w/2,.143,z,.16,.29,d,0,'#a7835f']);
    }
    for(let j=0;j<5;j++) for(const side of [-1,1]){
      const sx=x+(j-2)*.56,sz=z+side*.38;
      const h=.17+random()*.13;
      stems.push([sx,.21+h*.48,sz,.019,h,.019,0,'#7f9952']);
      for(let k=0;k<5;k++){
        const a=k*6.28/5+random()*.27;
        const rowColor=id==='rice'?'#a8b66b':'#739b5a';
        greens.push([sx+Math.cos(a)*.083,.30+h*.24,sz+Math.sin(a)*.083,.141,.042,.071,-a,rowColor,.31,.24]);
      }
      if(id==='rice') heads.push([sx,.29+h,sz,.045,.125,.045,random()*6,'#cbba69',.27,.17]);
    }
  }
  const cropGeometry=new THREE.IcosahedronGeometry(1,0);
  const earth=batches(group,box,standard(),soil,{cast:true});
  batches(group,box,standard(),planks,{cast:true});
  batches(group,box,standard(),stems);
  batches(group,cropGeometry,standard(),greens);
  batches(group,cropGeometry,standard(),heads);
  const dropletGeometry=new THREE.SphereGeometry(.046,7,6);
  const drops=[-2,-1,0,1,2].map(()=>{
    const drop=new THREE.Mesh(dropletGeometry,standard({color:'#8bc2bd',roughness:.23}));
    drop.visible=false;
    group.add(drop);
    return drop;
  });
  function water(index,time,at) {
    earth.setColorAt(index,new THREE.Color('#4e5a42'));
    earth.instanceColor.needsUpdate=true;
    const bed=garden[index];
    const passed=time-at;
    for(const [i,drop] of drops.entries()){
      drop.visible=passed<.7;
      drop.position.set(bed.x+(i-2)*.35,.86-passed*.91+Math.sin(i)*.17,bed.z+.20*Math.cos(i));
    }
  }
  let currentSeason;
  function setSeason(season) {
    if(season===currentSeason||!Object.hasOwn(seasonalLooks,season))return false;
    const look=seasonalLooks[season];
    terrain.setColors(look.land);
    tintWoods(look.woods);
    meadow.setColors(look);
    waterSurface.setSeason(season);
    currentSeason=season;
    return true;
  }
  setSeason('spring');
  return {group,water,animateLake:waterSurface.animate,setMeadowPlots:meadow.setMeadowPlots,setSeason};
}
