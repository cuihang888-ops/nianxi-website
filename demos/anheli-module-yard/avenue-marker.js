import * as THREE from 'three';

const markerPosition = {x:-2.75,z:10.1};
const boardWidth = 2.20;
const boardHeight = .57;
const boardDepth = .12;
const plankHeight = 1.76;

function lettering(createCanvas) {
  const paper = createCanvas();
  paper.width = 768;
  paper.height = 196;
  const ctx = paper.getContext('2d');
  const grain = ctx.createLinearGradient(0,0,0,paper.height);
  grain.addColorStop(0,'#b17c4c');
  grain.addColorStop(.48,'#8d5e3c');
  grain.addColorStop(1,'#774d34');
  ctx.fillStyle = grain;
  ctx.fillRect(0,0,paper.width,paper.height);

  for(let line=0;line<11;line++){
    const y=8+line*18;
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.bezierCurveTo(235,y-4-line%3,502,y+11,768,y-3);
    ctx.strokeStyle=line%3===1?'#e8bd7862':'#573b2c55';
    ctx.lineWidth=line%2+1;
    ctx.stroke();
  }
  ctx.strokeStyle='#e1b878';
  ctx.lineWidth=4;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(13,13,paper.width-26,paper.height-26,13);
  else ctx.rect(13,13,paper.width-26,paper.height-26);
  ctx.stroke();
  for (const x of [37,paper.width-37]) {
    ctx.beginPath();
    ctx.ellipse(x,paper.height/2,6,6,0,0,Math.PI*2);
    ctx.fillStyle='#ddb085';
    ctx.fill();
  }

  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.font='700 111px "Noto Serif CJK SC", "Source Han Serif SC", "Microsoft YaHei", "PingFang SC", serif';
  ctx.strokeStyle='#4e3227';
  ctx.lineJoin='round';
  ctx.lineWidth=5.5;
  const title='瑞丽大道';
  const letters=Array.from(title);
  for(let i=0;i<letters.length;i++){
    const x=paper.width*.5+(i-1.5)*134;
    ctx.strokeText(letters[i],x,101);
    ctx.fillStyle='#fae8bc';
    ctx.fillText(letters[i],x,98);
  }

  const texture=new THREE.CanvasTexture(paper);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
}

export function addAvenueMarker(group,groundHeight,createCanvas) {
  const marker=new THREE.Group();
  marker.name='瑞丽大道';
  const {x,z}=markerPosition;
  marker.position.set(x,groundHeight(x,z),z);
  group.add(marker);

  const frontMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,map:lettering(createCanvas),emissive:'#4d3628',emissiveIntensity:.17});
  const timber=new THREE.MeshStandardMaterial({color:'#866346',roughness:.96});
  const endGrain=new THREE.MeshStandardMaterial({color:'#a89066',roughness:.96});
  const stone=new THREE.MeshStandardMaterial({color:'#a9a18c',roughness:.98});
  const foliage=new THREE.MeshStandardMaterial({color:'#8b9b66',roughness:.95});
  const box=new THREE.BoxGeometry();
  const pebble=new THREE.DodecahedronGeometry(1,0);

  function mesh(geometry,material,sx,sy,sz,mx,my,mz) {
    const part=new THREE.Mesh(geometry,material);
    part.position.set(mx,my,mz);
    part.scale.set(sx,sy,sz);
    part.castShadow=true;
    part.receiveShadow=true;
    marker.add(part);
    return part;
  }

  const board = mesh(box,[timber,timber,endGrain,timber,frontMaterial,frontMaterial],
    boardWidth,boardHeight,boardDepth,0,plankHeight,0);
  board.rotation.z=-.019;

  for(const sign of [-1,1]){
    const offset=sign*.80;
    const heightOffset=groundHeight(x+offset,z)-marker.position.y;
    const postHeight=plankHeight-boardHeight*.5+.055-heightOffset;
    const post=mesh(box,timber,.15,postHeight,.15,offset,heightOffset+postHeight*.5,0);
    post.rotation.z=sign*.021;
    mesh(box,endGrain,.20,.077,.20,offset,plankHeight-boardHeight*.5-.04,0);
    const rock=mesh(pebble,stone,.22,.12,.18,offset+sign*.09,heightOffset+.045,.022);
    rock.rotation.y=sign*.77;
  }
  const leaves=new THREE.IcosahedronGeometry(1,0);
  for(let index=0;index<3;index++){
    const ox=-.92-index*.055, oz=.08+index*.055;
    const bottom=groundHeight(x+ox,z+oz)-marker.position.y;
    const sprig=mesh(leaves,foliage,.058,.13,.074,ox,bottom+.13,oz);
    sprig.rotation.z=.31+index*.21;
  }
  return marker;
}
