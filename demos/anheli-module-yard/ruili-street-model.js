import * as THREE from 'three';
import {createHouseModel} from './house-model.js';
import {marketHall,marketPlanters,marketSquare,squareStalls,streetHomes} from './ruili-street.js';

const paving=['#baad91','#c6b799','#cabb9f','#bcad93','#b5a98f','#cfbca1'];
const timber=['#9e7652','#856347','#b58b61','#795943'];

function signTexture(createCanvas,title) {
  const canvas=createCanvas();
  canvas.width=512;
  canvas.height=120;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#77513d';
  ctx.fillRect(0,0,512,120);
  ctx.strokeStyle='#dcb789';
  ctx.lineWidth=3;
  ctx.strokeRect(11,11,490,98);
  ctx.textAlign='center';
  ctx.textBaseline='middle';
  ctx.font='700 56px "Microsoft YaHei", "PingFang SC", serif';
  ctx.fillStyle='#fae7bd';
  ctx.fillText(title,256,62);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=4;
  return texture;
}

export function createVacantSign(site,groundHeight,createCanvas) {
  const sign=new THREE.Group();
  const x=site.x+1.72,z=site.z+5.56;
  sign.position.set(x,groundHeight(x,z),z);
  sign.rotation.y=.22;
  const wood=new THREE.MeshStandardMaterial({color:'#845e43',roughness:.95});
  const post=new THREE.Mesh(new THREE.BoxGeometry(.096,1.33,.10),wood);
  post.position.y=.68;
  sign.add(post);
  const board=new THREE.Mesh(new THREE.BoxGeometry(1.70,.44,.075),wood);
  board.position.y=1.11;
  sign.add(board);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(1.60,.375),
    new THREE.MeshStandardMaterial({map:signTexture(createCanvas,'闲置待售'),roughness:.9,emissive:'#6d4f36',emissiveIntensity:.18}));
  face.position.set(0,1.11,.041);
  sign.add(face);
  return sign;
}

export function addRuiliStreet({group,groundHeight,avenueZ,random,standard,batches,createCanvas}){
  const plaza=new THREE.Group();
  plaza.name='瑞丽集市';
  group.add(plaza);
  const houseRows=new THREE.Group();
  houseRows.name='瑞丽大道街区';
  group.add(houseRows);
  const stones=[],wood=[],plaster=[],cloth=[],baskets=[],wares=[],greens=[];
  const warmLights=[];
  function piece(list,x,y,z,w,h,d,color,yaw=0,pitch=0,roll=0){
    list.push([x,groundHeight(x,z)+y,z,w,h,d,yaw,color,pitch,roll]);
  }
  function placeStones(x,z,spreadX,spreadZ,n){
    for(let i=0;i<n;i++){
      const cx=x+(random()-.5)*spreadX,cz=z+(random()-.5)*spreadZ;
      const size=.19+random()*.34;
      piece(stones,cx,.033,cz,size,.09,size*.76,paving[i%paving.length],random()*Math.PI);
    }
  }
  const {west,east,north,south}=marketSquare;
  // A layered stone surface aligns with the public road and the house approaches.
  const floorMaterial=standard({color:'#b7aa8c',polygonOffset:true,polygonOffsetFactor:-1});
  function pavingStrip(x,z,w,d){
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(w,d),floorMaterial);
    floor.rotation.x=-Math.PI/2;
    floor.position.set(x,groundHeight(x,z)+.029,z);
    floor.receiveShadow=true;
    plaza.add(floor);
  }
  pavingStrip((west+east)/2,(north+south)/2,east-west,south-north);
  pavingStrip(34,10.96,3.15,1.08);
  for(let row=0;row<13;row++){
    const z=north+.29+row*.52;
    for(let column=0;column<25;column++){
      const x=west+.20+column*.51+(row%2===0?.04:.20);
      const n=Math.floor(random()*paving.length);
      piece(stones,x,.038,z,.42+random()*.04,.056,.43+random()*.05,paving[n],(random()-.5)*.12);
    }
  }
  placeStones(34,10.98,3.05,1.16,24);

  for(const {house,x,z,yaw} of streetHomes){
    const model=createHouseModel(house.id,{street:true});
    model.position.set(x,groundHeight(x,z),z);
    model.rotation.y=yaw;
    houseRows.add(model);
    const approach=z+(yaw===0?1:-1)*house.approach.z;
    const roadSide=avenueZ(x)+(yaw===0?-1:1)*1.52;
    const length=Math.min(2.6,Math.abs(roadSide-approach)+.42);
    placeStones(x,(roadSide+approach)*.5+Math.sign(approach-roadSide)*Math.max(0,Math.abs(roadSide-approach)-length)*.5,1.39,length,15);
  }

  for(const stall of squareStalls){
    const {x,z,w,d}=stall;
    const front=x<marketHall.x?1:-1;
    piece(wood,x,.76,z,w,.19,d*.68,timber[1]);
    for(const sx of [-1,1]){
      piece(wood,x+sx*(w*.5-.12),.38,z,.16,.72,d*.57,timber[2]);
      for(const sz of [-1,1]){
        piece(wood,x+sx*(w*.5-.08),1.23,z+sz*(d*.50-.06),.10,2.46,.115,timber[3]);
      }
    }
    for(let stripe=0;stripe<7;stripe++){
      const cx=x+(stripe-3)*w/7;
      piece(cloth,cx,2.48,z,w/7+.01,.058,d+.22,stripe%2?stall.trim:stall.cloth,0,-.12*front);
      piece(cloth,cx,2.35,z+.47,w/7+.005,.22,.047,stripe%2?stall.trim:stall.cloth);
    }
    for(let slot=0;slot<3;slot++){
      const cx=x+(slot-1)*w*.29;
      piece(baskets,cx,.90,z,.47,.18,.39,slot===0?'#b18d5d':'#c6a676',slot*.58);
      const colors=stall.type==='fish'?['#b5c2bd','#8baaa4','#c9cfbc']:
        stall.type==='goods'?['#c0a8b9','#8ca39d','#e0b594']:['#d29a62','#c79a51','#91a469'];
      for(let item=0;item<6;item++){
        const length=stall.type==='fish'?.14:.10;
        piece(wares,cx+(random()-.5)*.29,.995+random()*.085,z+(random()-.5)*.23,
          length,.07,.09,colors[item%3],random()*6.28);
      }
    }
  }

  const {x:hallX,z:hallZ,w:hallW,d:hallD}=marketHall;
  piece(plaster,hallX,.095,hallZ,hallW,.19,hallD,'#c5b292');
  piece(wood,hallX,.83,hallZ-.18,hallW-.73,.21,.62,timber[1]);
  piece(plaster,hallX,1.40,hallZ-hallD*.47,hallW-.22,2.48,.13,'#d0bd97');
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=hallX+sx*(hallW*.5-.17),z=hallZ+sz*(hallD*.5-.12);
    piece(stones,x,.18,z,.32,.32,.33,'#b7a88b');
    piece(wood,x,1.50,z,.195,2.65,.195,timber[3]);
    piece(wood,x,2.63,z,.32,.16,.32,timber[2]);
  }
  for(const side of [-1,1]){
    const angle=side*.40;
    const slant=(hallD*.5+.35)/Math.cos(angle);
    piece(wood,hallX,2.65,hallZ+side*hallD*.46,hallW+.38,.15,.18,timber[1]);
    piece(wood,hallX,2.25,hallZ+side*hallD*.46,hallW+.12,.10,.12,timber[0]);
    for(let tile=0;tile<21;tile++){
      const cx=hallX+(tile-10)*.255;
      const color=['#7e9782','#748979','#849686','#687f70'][tile%4];
      piece(cloth,cx,2.98,hallZ+side*(hallD*.5+.35)*.5,.28,.12,slant,color,0,angle);
    }
  }
  piece(wood,hallX,3.33,hallZ,hallW+.58,.19,.22,'#6e8271');
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.72,.62),standard({
    map:signTexture(createCanvas,'瑞丽集市'),emissive:'#7a5338',emissiveIntensity:.17,roughness:.85,
  }));
  sign.position.set(hallX,groundHeight(hallX,hallZ)+2.39,hallZ+hallD*.5+.16);
  plaza.add(sign);
  for(const side of [-1,1]){
    piece(wood,hallX+side*1.82,2.22,hallZ+hallD*.5,.037,.40,.035,timber[3]);
    piece(warmLights,hallX+side*1.82,1.94,hallZ+hallD*.5,.23,.34,.23,'#dea265');
  }
  for(const {x,z} of marketPlanters){
    piece(wood,x,.18,z,.64,.34,.59,timber[2]);
    piece(greens,x,.41,z,.48,.31,.36,'#82955f',random()*6.28);
    for(let petal=0;petal<6;petal++){
      const angle=petal*2.39;
      piece(greens,x+Math.cos(angle)*.21,.51+random()*.15,z+Math.sin(angle)*.17,.12,.1,.108,
        petal%2?'#d9b783':'#c88c80',angle);
    }
  }
  const box=new THREE.BoxGeometry(1,1,1);
  const pebble=new THREE.DodecahedronGeometry(1,0);
  const round=new THREE.IcosahedronGeometry(1,0);
  batches(plaza,pebble,standard(),stones);
  batches(plaza,box,standard(),wood,{cast:true});
  batches(plaza,box,standard(),plaster,{cast:true});
  batches(plaza,box,standard(),cloth,{cast:true});
  batches(plaza,new THREE.CylinderGeometry(.63,.48,1,8),standard(),baskets);
  batches(plaza,round,standard(),wares);
  batches(plaza,round,standard(),greens);
  batches(plaza,round,standard({emissive:'#c77d48',emissiveIntensity:.5}),warmLights);
}
