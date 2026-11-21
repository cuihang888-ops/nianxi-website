import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {cropStage} from './livestock.js';
import {createLandSurvey,createPaddocks} from './land-models.js';
import {plotPurpose,plotWidth} from './yard-land.js';

const seedbedHeight=.15;
const sphere=new THREE.SphereGeometry(1,7,4);
const stalk=new THREE.CylinderGeometry(.65,1,2,6);
const foliageMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.89});
const drySoil=new THREE.MeshStandardMaterial({color:'#ac7c59',vertexColors:true,roughness:.96});
const dampSoil=new THREE.MeshStandardMaterial({color:'#785d4c',vertexColors:true,roughness:.94});
const paddySoil=new THREE.MeshStandardMaterial({color:'#697d74',vertexColors:true,roughness:.76});
const fertilizedSoil=new THREE.MeshStandardMaterial({color:'#4d3b30',vertexColors:true,roughness:.96});
const fertilizedPaddy=new THREE.MeshStandardMaterial({color:'#475f50',vertexColors:true,roughness:.76});
const soilTint=new THREE.Color();
const colorTint=new THREE.Color();
const cache=new Map();

function makeBed(x,z,size,groundHeight) {
  const sections=6*size;
  const half=size/2;
  const bed=new THREE.PlaneGeometry(size,size,sections,sections).rotateX(-Math.PI/2);
  const points=bed.attributes.position;
  const colors=new Float32Array(points.count*3);
  for(let i=0;i<points.count;i++){
    const localX=points.getX(i),localZ=points.getZ(i);
    const edge=THREE.MathUtils.smoothstep(Math.max(Math.abs(localX),Math.abs(localZ)),half-.32,half);
    const furrow=(.5+.5*Math.cos(localX*Math.PI*2/.9))**2;
    const ripple=Math.sin(localX*19+localZ*23)*Math.sin(localX*11-localZ*13)*.041;
    const height=THREE.MathUtils.lerp(.032,.127+furrow*.058,1-edge);
    points.setY(i,groundHeight(x+localX,z+localZ)+height);
    const tint=THREE.MathUtils.lerp(.75+furrow*.24+ripple,1.09,edge);
    soilTint.setRGB(tint,tint,tint).toArray(colors,i*3);
  }
  bed.setAttribute('color',new THREE.BufferAttribute(colors,3));
  bed.computeVertexNormals();
  return bed;
}

function plantGeometry(parts) {
  const pieces=parts.map(({shape,color,x,y,z,sx,sy,sz,yaw,roll})=>{
    const piece=shape.clone().scale(sx,sy,sz).rotateZ(roll).rotateY(yaw).translate(x,y,z);
    const rgb=new Float32Array(piece.attributes.position.count*3);
    colorTint.set(color);
    for(let i=0;i<rgb.length;i+=3)colorTint.toArray(rgb,i);
    piece.setAttribute('color',new THREE.BufferAttribute(rgb,3));
    return piece;
  });
  const joined=mergeGeometries(pieces);
  for(const piece of pieces)piece.dispose();
  return joined;
}

function leaf(parts,color,x,y,z,sx,sy,sz,yaw=0,roll=0) {
  parts.push({shape:sphere,color,x,y,z,sx,sy,sz,yaw,roll});
}

function stem(parts,color,y,radius,height,x=0,z=0,yaw=0,roll=0) {
  parts.push({shape:stalk,color,x,y,z,sx:radius,sy:height/2,sz:radius,yaw,roll});
}

function seedling() {
  const parts=[];
  stem(parts,'#71965a',.098,.016,.194);
  leaf(parts,'#7c9d58',-.073,.15,0,.101,.027,.044,.21,-.43);
  leaf(parts,'#a2b867',.085,.17,0,.108,.025,.049,-.30,.42);
  return parts;
}

function rice(mature) {
  const parts=[];
  const blades=['#708e3c','#9da651','#c1af55','#879447','#a8a34d'];
  for(let i=0;i<5;i++){
    const yaw=i*Math.PI*2/5;
    const height=.37+(i%3)*.095;
    leaf(parts,mature?blades[i]:'#729449',Math.cos(yaw)*.061,height*.43,-Math.sin(yaw)*.061,.023,height*.52,.023,yaw,-.38);
    if(!mature)continue;
    const radius=.153;
    leaf(parts,'#dbb96b',Math.cos(yaw)*radius,height*.91,-Math.sin(yaw)*radius,.101,.035,.038,yaw,-.21);
  }
  return parts;
}

function corn(mature) {
  const parts=[];
  stem(parts,'#78924b',.54,.039,1.08);
  for(let i=0;i<5;i++){
    const yaw=.58+i*2.28;
    const x=Math.cos(yaw)*.13,z=-Math.sin(yaw)*.13;
    leaf(parts,i%2?'#6a8d49':'#97af66',x,.25+i*.141,z,.196,.035,.082,yaw,.27);
  }
  if(mature){
    leaf(parts,'#d2b76e',.022,1.13,0,.065,.134,.062,.21,-.24);
    leaf(parts,'#52764b',.083,.613,.06,.071,.177,.081,.14,-.30);
    leaf(parts,'#e5b956',.136,.663,.098,.064,.135,.068,.14,-.30);
  }
  return parts;
}

function tobacco(mature) {
  const parts=[];
  stem(parts,'#77965a',.30,.032,.61);
  for(let i=0;i<6;i++){
    const angle=i*2.40;
    const distance=.143-i*.011;
    const x=Math.cos(angle)*distance,z=-Math.sin(angle)*distance;
    const tint=['#75a161','#90b476','#608855'][i%3];
    leaf(parts,tint,x,.18+i*.056,z,.266-i*.018,.027,.146-i*.008,angle,-.12);
    leaf(parts,'#a7c17c',x,.202+i*.056,z,.173-i*.014,.010,.013,angle,-.12);
  }
  if(mature){
    stem(parts,'#91a95b',.64,.013,.24);
    leaf(parts,'#d9a7a4',0,.777,0,.081,.042,.077);
    leaf(parts,'#eacfb7',.011,.805,-.008,.043,.032,.045);
  }
  return parts;
}

function coffee(mature) {
  const parts=[];
  stem(parts,'#816446',.255,.033,.51);
  for(let i=0;i<5;i++){
    const yaw=i*2.39;
    const distance=i===4?.10:.16;
    const x=Math.cos(yaw)*distance,z=-Math.sin(yaw)*distance;
    leaf(parts,i%2?'#416744':'#598158',x,.31+i*.070,z,.211,.077,.119,yaw,.23);
    if(mature&&i<4){
      leaf(parts,'#ad5148',x*.94,.256+i*.067,z*.94,.061,.056,.056);
      leaf(parts,'#c96753',x*1.4,.262+i*.067,z*1.4,.058,.049,.051);
    }
  }
  return parts;
}

function tea(mature) {
  const parts=[];
  leaf(parts,'#486d46',0,.179,0,.351,.175,.245);
  leaf(parts,'#658658',-.15,.268,-.035,.239,.177,.204,.18,.12);
  leaf(parts,'#789b5b',.16,.262,.038,.235,.173,.181,.09,-.14);
  leaf(parts,'#819b5a',0,.336,-.048,.23,.14,.161,.13,.11);
  if(mature){
    for(let i=0;i<4;i++){
      const x=-.25+i*.158;
      leaf(parts,'#b3bc75',x,.417+Math.sin(i)*.039,.036,.105,.028,.063,i*.37,.25);
    }
  }
  return parts;
}

const species={rice,corn,tobacco,coffee,tea};

function modelFor(crop,stage) {
  const key=stage==='dry'?stage:crop+'-'+stage;
  if(!cache.has(key)){
    const parts=stage==='dry'?seedling():species[crop](stage==='ready');
    cache.set(key,plantGeometry(parts));
  }
  return cache.get(key);
}

function makePlants(plot,stage,groundHeight) {
  const size=plotWidth(plot);
  const rows=Math.round(size/.95);
  const rice=plot.crop==='rice';
  const columns=Math.round(size/(rice?.59:.96));
  const patch=new THREE.InstancedMesh(modelFor(plot.crop,stage),foliageMaterial,rows*columns);
  const plant=new THREE.Object3D();
  let index=0;
  for(let row=0;row<rows;row++){
    const localX=(row-(rows-1)/2)*(size-.3)/rows;
    for(let j=0;j<columns;j++){
      const x=plot.x+localX+Math.sin(j*2.9+localX)*.049;
      const z=plot.z+(j-(columns-1)/2)*(size-(rice?.55:.60))/columns+Math.cos(localX*7+j)*.052;
      const plantSize=.9+.13*Math.sin(x*3.71+z*2.9);
      const growth=stage==='growing'?.63:1;
      plant.position.set(x,groundHeight(x,z)+seedbedHeight+.033,z);
      plant.rotation.y=plot.crop==='tea'?Math.sin(x+z)*.22:x*2.77+z*1.18;
      plant.scale.setScalar(plantSize*growth);
      const lightness=.88+.17*Math.sin(x*1.89-z*1.49);
      plant.updateMatrix();
      patch.setMatrixAt(index,plant.matrix);
      patch.setColorAt(index++,colorTint.setRGB(lightness,lightness,lightness));
    }
  }
  patch.receiveShadow=true;
  return patch;
}

export function createFields(group,groundHeight,surveyHeight=groundHeight) {
  const plotsById=new Map();
  const selection=createLandSurvey(group,surveyHeight);
  const updatePaddocks=createPaddocks(group,groundHeight);
  let previousPlots=null;
  let fieldPlots=[];

  function update(plots,now) {
    if(previousPlots!==plots){
      fieldPlots=plots.filter(plot=>plotPurpose(plot)==='field');
      const currentIds=new Set(fieldPlots.map(plot=>plot.id));
      for(const [id,entry] of plotsById){
        if(currentIds.has(id))continue;
        group.remove(entry.bed,entry.plants);
        entry.bed.geometry.dispose();
        entry.plants?.dispose();
        plotsById.delete(id);
      }
      previousPlots=plots;
    }
    for(const plot of fieldPlots){
      let entry=plotsById.get(plot.id);
      const size=plotWidth(plot);
      if(entry&&(entry.x!==plot.x||entry.z!==plot.z||entry.size!==size)){
        group.remove(entry.bed,entry.plants);
        entry.bed.geometry.dispose();
        entry.plants?.dispose();
        entry=null;
      }
      if(!entry){
        const bed=new THREE.Mesh(makeBed(plot.x,plot.z,size,groundHeight),drySoil);
        bed.position.set(plot.x,0,plot.z);
        bed.receiveShadow=true;
        group.add(bed);
        entry={bed,plants:null,crop:null,stage:null,x:plot.x,z:plot.z,size};
        plotsById.set(plot.id,entry);
      }
      const stage=cropStage(plot,now);
      const wet=stage==='growing'||stage==='ready';
      const rice=plot.crop==='rice';
      if(!wet)entry.bed.material=drySoil;
      else if(plot.fertilized)entry.bed.material=rice?fertilizedPaddy:fertilizedSoil;
      else entry.bed.material=rice?paddySoil:dampSoil;
      if(entry.crop===plot.crop&&entry.stage===stage)continue;
      if(entry.plants){
        group.remove(entry.plants);
        entry.plants.dispose();
      }
      entry.crop=plot.crop;
      entry.stage=stage;
      entry.plants=stage==='empty'?null:makePlants(plot,stage,groundHeight);
      if(entry.plants)group.add(entry.plants);
    }
  }

  return {update,updatePaddocks,...selection};
}
