import * as THREE from 'three';
import {plotWidth} from './yard-land.js';

const surveyColors={available:'#70c793',blocked:'#cf958a',owned:'#70bce9'};
const selectionColors={available:['#a7dd77','#e7f7ab'],blocked:['#dc8b77','#ffd0b0'],owned:['#75b5df','#c6eaff']};
const fenceMaterial=new THREE.MeshStandardMaterial({roughness:.93});
const fenceBox=new THREE.BoxGeometry(1,1,1);
const fenceColors=['#9e8057','#b39669','#ac895f','#bb9b6e'];

function padMaterial(options) {
  return new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,...options});
}

function addPad(positions,colors,groundHeight,x,z,width,depth,elevation,color) {
  const columns=Math.ceil(width/.55),rows=Math.ceil(depth/.55);
  const left=x-width/2,top=z-depth/2;
  const points=[];
  for(let row=0;row<=rows;row++){
    for(let column=0;column<=columns;column++){
      const px=left+column*width/columns,pz=top+row*depth/rows;
      points.push([px,groundHeight(px,pz)+elevation,pz]);
    }
  }
  for(let row=0;row<rows;row++){
    for(let column=0;column<columns;column++){
      const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1;
      for(const index of [a,c,b,b,c,d]){
        positions.push(...points[index]);
        if(color)colors.push(color.r,color.g,color.b);
      }
    }
  }
}

function padGeometry(positions,colors) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(colors)geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}

export function createLandSurvey(group,groundHeight) {
  const survey=new THREE.Mesh(new THREE.BufferGeometry(),padMaterial({vertexColors:true,opacity:.64}));
  const fill=new THREE.Mesh(new THREE.BufferGeometry(),padMaterial({opacity:.23}));
  const outline=new THREE.Mesh(new THREE.BufferGeometry(),padMaterial({opacity:.99}));
  survey.renderOrder=2;
  fill.renderOrder=3;
  outline.renderOrder=4;
  group.add(survey,fill,outline);
  survey.visible=fill.visible=outline.visible=false;
  let shownCells=null;
  let selected=null;

  function setGeometry(mesh,geometry) {
    mesh.geometry.dispose();
    mesh.geometry=geometry;
  }

  function showSurvey(cells) {
    if(shownCells!==cells){
      const positions=[],colors=[];
      const tint=new THREE.Color();
      for(const cell of cells){
        const size=cell.markerSize??plotWidth(cell);
        const color=tint.set(surveyColors[cell.state]??surveyColors.blocked);
        const elevation=cell.state==='owned'?.216:.115;
        addPad(positions,colors,groundHeight,cell.x,cell.z,size,size,elevation,color);
      }
      setGeometry(survey,padGeometry(positions,colors));
      shownCells=cells;
    }
    survey.visible=cells.length>0;
  }

  function select(spot,state) {
    const {x,z}=spot;
    const size=plotWidth(spot);
    if(selected?.x!==x||selected.z!==z||selected.size!==size){
      const face=[],marks=[];
      const half=size/2;
      const width=.115;
      addPad(face,null,groundHeight,x,z,size,size,.229);
      for(const edge of [-1,1]){
        addPad(marks,null,groundHeight,x,z+edge*(half-width/2),size,width,.244);
        addPad(marks,null,groundHeight,x+edge*(half-width/2),z,width,size-2*width,.244);
      }
      setGeometry(fill,padGeometry(face));
      setGeometry(outline,padGeometry(marks));
      selected={x,z,size};
    }
    const status=state===true?'available':state===false?'blocked':state;
    const [face,stroke]=selectionColors[status]??selectionColors.blocked;
    fill.material.color.set(face);
    outline.material.color.set(stroke);
    fill.visible=outline.visible=true;
  }

  return {
    select,showSurvey,
    clearSelection(){fill.visible=outline.visible=false;},
    hideSurvey(){survey.visible=false;},
  };
}

const gateHalf=plot=>Math.min(.56,plotWidth(plot)*.28);

export function paddockGate(plot) {
  return {x:plot.x,z:plot.z+plotWidth(plot)/2};
}

export function paddockBlocks(x,z,plot,pad=.2) {
  const dx=Math.abs(x-plot.x),dz=z-plot.z,half=plotWidth(plot)/2;
  return (Math.abs(dx-half)<=pad&&Math.abs(dz)<=half+pad)
    ||(dx<=half+pad&&Math.abs(dz+half)<=pad)
    ||(dx>=gateHalf(plot)-pad&&dx<=half+pad&&Math.abs(dz-half)<=pad);
}

function makePaddock(plot,groundHeight) {
  const half=plotWidth(plot)/2;
  const west=plot.x-half,east=plot.x+half,north=plot.z-half,south=plot.z+half;
  const gate=gateHalf(plot);
  const parts=[];
  const posts=new Set();
  for(const [fromX,fromZ,toX,toZ] of [[west,north,east,north],[west,north,west,south],
    [east,north,east,south],[west,south,plot.x-gate,south],[plot.x+gate,south,east,south]]){
    const count=Math.ceil(Math.hypot(toX-fromX,toZ-fromZ)/1.25);
    const stepX=(toX-fromX)/count,stepZ=(toZ-fromZ)/count;
    for(let i=0;i<=count;i++){
      const x=fromX+stepX*i,z=fromZ+stepZ*i;
      const y=groundHeight(x,z);
      const key=`${x.toFixed(4)}:${z.toFixed(4)}`;
      if(!posts.has(key)){
        posts.add(key);
        parts.push({x,y:y+.43,z,width:.14,height:.88,depth:.14,yaw:0,tilt:0});
      }
      if(i===count)continue;
      const nextY=groundHeight(x+stepX,z+stepZ);
      const width=Math.hypot(stepX,stepZ);
      for(const level of [.32,.61]){
        parts.push({x:x+stepX/2,y:(y+nextY)/2+level,z:z+stepZ/2,
          width:Math.hypot(width,nextY-y)+.034,height:.078,depth:.077,
          yaw:Math.atan2(-stepZ,stepX),tilt:Math.atan2(nextY-y,width)});
      }
    }
  }
  const mesh=new THREE.InstancedMesh(fenceBox,fenceMaterial,parts.length);
  const node=new THREE.Object3D();
  const color=new THREE.Color();
  parts.forEach(({x,y,z,width,height,depth,yaw,tilt},index)=>{
    node.position.set(x,y,z);
    node.rotation.set(0,yaw,tilt,'YXZ');
    node.scale.set(width,height,depth);
    node.updateMatrix();
    mesh.setMatrixAt(index,node.matrix);
    mesh.setColorAt(index,color.set(fenceColors[index%fenceColors.length]));
  });
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  return mesh;
}

export function createPaddocks(group,groundHeight) {
  const fences=new Map();
  return function updatePaddocks(plots) {
    if(plots.length===fences.size&&plots.every(plot=>fences.get(plot.id)?.plot===plot))return false;
    const ids=new Set(plots.map(plot=>plot.id));
    let changed=false;
    for(const [id,entry] of fences){
      if(ids.has(id))continue;
      group.remove(entry.mesh);
      entry.mesh.dispose();
      fences.delete(id);
      changed=true;
    }
    for(const plot of plots){
      const old=fences.get(plot.id);
      if(old?.x===plot.x&&old.z===plot.z&&old.size===plotWidth(plot)){
        old.plot=plot;
        continue;
      }
      if(old){
        group.remove(old.mesh);
        old.mesh.dispose();
      }
      const mesh=makePaddock(plot,groundHeight);
      group.add(mesh);
      fences.set(plot.id,{mesh,plot,x:plot.x,z:plot.z,size:plotWidth(plot)});
      changed=true;
    }
    return changed;
  };
}
