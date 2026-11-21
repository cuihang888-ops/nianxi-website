import * as THREE from 'three';
import {houseChoices} from './houses.js';
import {buildEstate} from './estate-models.js';
import {buildLittleHome} from './little-homes.js';

const designs = {
  lumber_cabin: {
    floors: 1, ridge: 5.12, sweep: .13, bend: .28, skew: .14,
    plaster: '#e7cfa6', timber: '#80624c', stone: ['#ad9884','#c6ae91','#d2bda4','#9c8e81'],
    roof: ['#657d71','#6c8274','#75897c','#667c72','#7d8f80'], fascia: '#455d56', shutters: '#7b9a90',
  },
  brick_dai: {
    floors: 2, ridge: 6.96, sweep: .15, bend: .25, skew: 0,
    plaster: '#e9cdb4', timber: '#a17d61', stone: ['#bda490','#e2c6ad','#c4ad98','#d5ba9e'],
    roof: ['#ae6f61','#b97a6a','#bd806e','#aa6d61','#c48874'], fascia: '#805347', shutters: '#a48469',
  },
  myanmar_villa: {
    floors: 2, ridge: 7.72, sweep: .55, bend: .54, skew: .24,
    plaster: '#f2dbab', timber: '#8c633f', stone: ['#b19b7c','#d1b993','#c9b298','#e2c6a3'],
    roof: ['#9f654e','#aa6b52','#b07557','#b77c5e','#b17956'], fascia: '#764631', shutters: '#8c9c7c',
  },
  dai_stilt: {
    floors: 1, ridge: 7.05, sweep: .68, bend: .63, skew: 0,
    plaster: '#d1a571', timber: '#8f6849', stone: ['#b6a082','#d5bea0','#a99274','#c7b295'],
    roof: ['#4d6666','#546d6c','#5e746f','#627975','#6a7d73'], fascia: '#384d49', shutters: '#a38158',
  },
};

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
}

function bevelBox(radius=.065) {
  const shape = new THREE.Shape();
  shape.moveTo(-.5+radius,-.5);
  shape.lineTo(.5-radius,-.5);
  shape.quadraticCurveTo(.5,-.5,.5,-.5+radius);
  shape.lineTo(.5,.5-radius);
  shape.quadraticCurveTo(.5,.5,.5-radius,.5);
  shape.lineTo(-.5+radius,.5);
  shape.quadraticCurveTo(-.5,.5,-.5,.5-radius);
  shape.lineTo(-.5,-.5+radius);
  shape.quadraticCurveTo(-.5,-.5,-.5+radius,-.5);
  const geometry = new THREE.ExtrudeGeometry(shape,{
    depth:1-2*radius,bevelEnabled:true,bevelSegments:1,bevelSize:radius*.44,bevelThickness:radius,curveSegments:2,
  });
  geometry.translate(0,0,radius-.5);
  const extent = 1+2*radius*.44;
  geometry.scale(1/extent,1/extent,1);
  return geometry;
}

function tileGeometry(street) {
  const shape = new THREE.Shape();
  shape.moveTo(-.5,-.40);
  shape.quadraticCurveTo(-.5,-.49,-.39,-.5);
  shape.quadraticCurveTo(.04,-.59,.41,-.49);
  shape.quadraticCurveTo(.49,-.48,.5,-.37);
  shape.lineTo(.47,.47);
  shape.lineTo(-.47,.5);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape,{
    depth:.84,curveSegments:street?1:3,bevelEnabled:!street,bevelSegments:1,bevelSize:.025,bevelThickness:.08,
  });
  geometry.translate(0,0,-.42);
  geometry.rotateX(-Math.PI/2);
  return geometry;
}

function archGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-.5,0);
  shape.lineTo(-.5,.66);
  shape.bezierCurveTo(-.5,.88,-.27,1,0,1);
  shape.bezierCurveTo(.27,1,.5,.88,.5,.66);
  shape.lineTo(.5,0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:8});
}

function geometryFromGrid(points,rows,columns) {
  const coordinates = points.flatMap(point=>[point.x,point.y,point.z]);
  const indices=[];
  for(let row=0;row<rows;row++) {
    for(let column=0;column<columns;column++){
      const top=row*(columns+1)+column;
      const bottom=top+columns+1;
      indices.push(top,top+1,bottom,top+1,bottom+1,bottom);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(coordinates,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createHouseModel(id,{street=false}={}) {
  const house=houseChoices.find(choice=>choice.id===id)??houseChoices[0];
  const design=designs[house.id]??designs.lumber_cabin;
  const product=house.product;
  const group=new THREE.Group();
  group.name='House: '+house.name;
  const random=seededRandom(Math.round(house.width*11003));
  const stub=new THREE.Object3D();
  const color=new THREE.Color();
  const half=house.width/2,front=house.depth/2,base=house.door.y;
  const wallTop=base+2.55*design.floors;
  const sky=new THREE.Vector3(0,1,0);

  const buckets=new Map([
    ['block',{geometry:street?new THREE.BoxGeometry(1,1,1):bevelBox(),items:[],roughness:.89}],
    ['arch',{geometry:archGeometry(),items:[],roughness:.84}],
    ['post',{geometry:new THREE.CylinderGeometry(.5,.57,1,7),items:[],roughness:.87}],
    ['tile',{geometry:tileGeometry(street),items:[],roughness:.93}],
    ['leaf',{geometry:new THREE.IcosahedronGeometry(.5,0),items:[],roughness:.96}],
    ['glass',{geometry:archGeometry(),items:[],roughness:.43,emissive:0x433019}],
  ]);
  function add(kind,x,y,z,width,height,depth,paint,rotation=[0,0,0],orientation=null){
    stub.position.set(x,y,z);
    stub.scale.set(width,height,depth);
    if(orientation) stub.quaternion.copy(orientation);
    else stub.rotation.set(...rotation);
    stub.updateMatrix();
    buckets.get(kind).items.push({matrix:stub.matrix.clone(),paint});
  }
  function beam(a,b,width,paint,kind='block'){
    const span=b.clone().sub(a);
    const center=a.clone().lerp(b,.5);
    const orientation=new THREE.Quaternion().setFromUnitVectors(sky,span.clone().normalize());
    add(kind,center.x,center.y,center.z,width,span.length(),width,paint,undefined,orientation);
  }
  function block(x,y,z,width,height,depth,paint,rotation){
    add('block',x,y,z,width,height,depth,paint,rotation);
  }
  function pick(palette){
    return palette[Math.floor(random()*palette.length)];
  }
  function stoneRow(xLeft,xRight,y,z,scale=1,angle=0) {
    for(let cursor=xLeft;cursor<xRight-.07;){
      const length=Math.min(xRight-cursor,(.27+random()*.27)*scale);
      const position=cursor+length*.5;
      const center=angle ? [z,position] : [position,z];
      const raise=(random()-.5)*.028;
      block(center[0],y+raise,center[1],Math.max(.085,length-.02),(.175+random()*.042)*scale,.17,
        pick(design.stone),[0,angle,(random()-.5)*.035]);
      cursor+=length;
    }
  }
  function opening(x,y,z,width,height,angle=0,door=false,frame,shutter){
    const turn=(dx,dz)=>[x+dx*Math.cos(angle)+dz*Math.sin(angle),z+dz*Math.cos(angle)-dx*Math.sin(angle)];
    const panel=(kind,dx,dy,dz,w,h,d,paint)=>{
      const [px,pz]=turn(dx,dz);
      add(kind,px,y+dy,pz,w,h,d,paint,[0,angle,0]);
    };
    panel('arch',0,-.035,-.006,width+.24,height+.14,.092,frame ?? (door ? '#d7ae82' : '#ddbc9d'));
    panel('arch',0,0,.087,width,height,.065,door ? '#513c34' : '#62574d');
    panel(door?'arch':'glass',-.025,.075,.151,width-.13,height-.17,.018,door?'#936e51':'#a8a879');
    if(door){
      for(const i of [-1,0,1])panel('block',i*.16,height*.47,.177,.027,height*.76,.028,'#72543d');
      panel('block',0,.28,.18,width-.19,.075,.055,'#a9855e');
      panel('leaf',width*.29,height*.43,.225,.081,.082,.077,'#ddb566');
      panel('block',0,.035,.225,width+.13,.073,.28,'#b59d83');
    }else{
      panel('block',0,height*.44,.18,.048,height*.8,.052,design.timber);
      panel('block',0,height*.39,.18,width-.1,.048,.058,design.timber);
      panel('block',0,-.025,.17,width+.19,.085,.20,'#c5ab90');
      if(shutter){
        for(const side of [-1,1])panel('block',side*(width*.5+.13),height*.49,.105,.22,height*.81,.075,shutter);
      }
    }
  }
  function shrub(x,y,z,spread,height,flowers=false){
    const greens=['#6a8057','#829764','#a7aa70','#9ba771','#788c5b'];
    for(let i=0;i<25;i++){
      const dx=(random()-.5)*spread;
      const dz=(random()-.5)*spread*.62;
      const dy=Math.pow(random(),.78)*height;
      const size=.105+random()*.16;
      add('leaf',x+dx,y+dy,z+dz,size,size*.78,size*.82,pick(greens),[0,random()*3.14,random()]);
      if(flowers&&i%5===0){
        add('leaf',x+dx,y+dy+.082,z+dz+.055,.115,.088,.105,i%2?'#e7ab8b':'#f3ce9d');
        add('leaf',x+dx,y+dy+.12,z+dz+.09,.041,.047,.040,'#f0d180');
      }
    }
  }
  function flowerBox(x,y,z,width){
    block(x,y+.045,z,width,.15,.28,'#a67658');
    block(x,y+.119,z+.021,width+.09,.057,.31,'#c18f70');
    shrub(x,y+.13,z,width*.92,.35,true);
  }

  function finish() {
    for(const {geometry,items,roughness,emissive} of buckets.values()){
      if(!items.length)continue;
      const material = new THREE.MeshStandardMaterial({roughness,color:0xffffff,emissive:emissive??0,emissiveIntensity:.65});
      const mesh=new THREE.InstancedMesh(geometry,material,items.length);
      items.forEach(({matrix,paint},index)=>{
        mesh.setMatrixAt(index,matrix);
        mesh.setColorAt(index,color.set(paint));
      });
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      group.add(mesh);
    }
  }

  if(house.role&&house.id!=='lumber_cabin'){
    const kit={
      house,block,add,beam,pick,flowerBox,stoneRow,shrub,
      roof:({x=0,z=0,width,depth,eave,ridge,colors,trim,sweep=.15})=>
        roof(ridge,width/2,depth/2,z,x,.15,sweep,eave,false,colors,trim),
      windowAt:(x,y,z,w,h,{frame,shutter,rotation=0}={})=>
        opening(x,y,z,w,h,rotation,false,frame,shutter),
      doorAt:(x,y,z,w,h,frame)=>opening(x,y,z,w,h,0,true,frame),
    };
    const model=house.court?buildEstate(kit,house.id):buildLittleHome(kit,house.id);
    group.userData.collision=model.collision;
    finish();
    return group;
  }

  // Ground and house shell.
  if(house.id==='merchant'){
    const merchant=buildLittleHome({house,block,add,beam,roof,pick,windowAt:opening,doorAt:(x,y,z,w,h)=>opening(x,y,z,w,h,0,true),flowerBox,stoneRow,shrub},house.id);
    group.userData.collision=merchant.collision;
    finish();
    return group;
  }

  if(house.id==='simple_shed'){
    const shed=buildLittleHome({house,block,add,beam,roof,pick,windowAt:opening,doorAt:(x,y,z,w,h)=>opening(x,y,z,w,h,0,true)},house.id);
    group.userData.collision=shed.collision;
    finish();
    return group;
  }

  if(house.raised){
    for(const x of [-half+.19,0,half-.19]){
      for(const z of [-front+.18,front-.19,front+.8]){
        block(x,.095,z,.34,.19,.32,pick(design.stone));
        add('post',x,(base+.08)*.5,z,.25,base-.04,.25,design.timber);
      }
    }
    for(const z of [-front+.19,front-.19,front+.8])block(0,base-.16,z,house.width+.14,.22,.19,design.timber);
    for(let i=0;i<22;i++){
      const x=-half+(i+.5)*house.width/22;
      block(x,base-.045,front+.53,house.width/22-.016,.12,1.15,i%3?'#ad8762':'#c19b71');
    }
  }else{
    block(0,base*.5,0,house.width+.02,base,house.depth+.035,design.stone[0]);
    stoneRow(-half,half,.13,front+.014);
    stoneRow(-front,front,.13,half+.013,1,Math.PI/2);
  }
  block(0,(base+wallTop)*.5,0,house.width-.045,wallTop-base,house.depth-.05,design.plaster);
  for(const x of [-half+.11,half-.11]){
    if(house.raised||house.id==='lumber_cabin'){
      block(x,(base+wallTop)*.5,front, .18,wallTop-base,.114,design.timber);
      block(x,(base+wallTop)*.5,-front,.18,wallTop-base,.114,design.timber);
    }else{
      for(let y=base+.21;y<wallTop-.11;y+=.33){
        const width=(Math.floor(y*3)&1)?.29:.21;
        block(x,y,front+.008,width,.217,.105,pick(design.stone));
      }
    }
  }
  if(house.raised){
    for(let y=base+.18;y<wallTop-.11;y+=.17){
      block(0,y,front,house.width-.25,.10,.089,pick(['#c59a69','#d2ad7b','#d9b98b']));
      block(0,y,-front,house.width-.25,.10,.089,design.plaster);
      for(const x of [-half,half])block(x,y,0,.087,.10,house.depth-.16,design.plaster);
    }
  }else{
    for(const y of [base+.23,base+.43])stoneRow(-half+.02,half-.01,y,front+.008);
    for(const x of [-half,half]){
      for(const y of [base+.23,base+.43])stoneRow(-front,front,y,x,.95,Math.PI/2);
    }
  }
  if(house.id==='lumber_cabin'){
    for(const z of [-front,front]){
      block(0,base+.57,z,house.width-.05,.15,.14,design.timber);
      block(0,wallTop-.105,z,house.width+.05,.16,.15,design.timber);
      for(const x of [-half*.48,half*.48]){
        block(x,(base+wallTop)*.5,z,.12,wallTop-base,.13,design.timber,[0,0,(x<0?1:-1)*.044]);
      }
    }
  }

  // Deep aprons make the stone facade, glazing and shutters read independently.
  opening(0,base,front,house.door.width,house.door.height,0,true);
  if(!house.raised)block(0,.065,front+.22,1.30,.13,.45,design.stone[1]);
  for(const direction of [-1,1]){
    for(const x of [-half*.53,half*.53])opening(x,base+.92,front*direction,.67,.88,direction===1?0:Math.PI);
    for(const z of [-front*.5,front*.52])opening(half*direction,base+.92,z,.69,.86,direction*Math.PI/2);
  }
  if(design.floors===2){
    const second=base+2.62;
    for(const x of [-half*.59,0,half*.59]){
      opening(x,second+.66,front,.66,.87);
      opening(x,second+.66,-front,.66,.87,Math.PI);
      if(x!==0)flowerBox(x,second+.59,front+.18,.76);
    }
    for(const direction of [-1,1]){
      opening(half*direction,second+.68,front*.31,.63,.85,direction*Math.PI/2);
      opening(half*direction,second+.68,-front*.5,.63,.85,direction*Math.PI/2);
    }
  }
  if(house.id==='lumber_cabin'||house.raised){
    for(const side of [-1,1]){
      const window=half*.53*side;
      flowerBox(window,base+.86,front+.21,.77);
      block(window+side*.53,base+1.34,front+.067,.265,.69,.075,design.shutters,[0,side*.10,side*.055]);
      if(!house.raised)shrub(half*side,.13,front+.23,.56,.45,true);
    }
  }
  add('post',.77,base+1.39,front+.20,.21,.29,.22,'#e3b370');
  block(.77,base+1.56,front+.20,.24,.05,.24,'#785b43');
  block(.77,base+1.23,front+.20,.225,.045,.215,'#785b43');

  if(house.raised||house.id==='brick_dai'){
    const outer=front+(house.raised?1.04:.68);
    const level=house.raised?base:base+2.61;
    if(!house.raised)block(0,level-.09,front+.32,house.width*.71,.18,.79,'#bfab94');
    for(const side of [-1,1]){
      const inner=house.raised?.64:0;
      const end=half*(house.raised?.93:.70);
      const rail=level+.55;
      block((end+inner)*.5*side,rail,outer,end-inner,.082,.09,design.timber);
      for(let i=0;i<6;i++){
        const x=(inner+(end-inner)*i/5)*side;
        add('post',x,(rail+level)*.5,outer,.063,rail-level,.062,design.timber);
      }
    }
  }
  if(house.raised){
    for(let i=0;i<6;i++){
      const height=base*(6-i)/6;
      block(0,height-.075,front+1.15+i*.302,1.25,.15,.33,i%2?'#ad875d':'#be976d');
    }
    for(const side of [-1,1]){
      const x=.68*side;
      const top=new THREE.Vector3(x,base+.52,front+1.02);
      const bottom=new THREE.Vector3(x,.48,front+2.96);
      beam(top,bottom,.095,design.timber);
      for(let i=0;i<3;i++){
        const amount=i/2;
        const point=top.clone().lerp(bottom,amount);
        block(point.x,point.y-.24,point.z,.085,.58,.085,design.timber);
      }
    }
  }

  // Main roof geometry carries a curved profile and individually tinted, staggered tiles.
  function roof(ridgeY,width,length,lineZ=0,centerX=0,bend=design.bend,sweep=design.sweep,eaveY=wallTop,gables=false,
    colors=design.roof,trim=design.fascia) {
    function point(u,t,direction){
      const rise=ridgeY+(eaveY-ridgeY)*t-bend*Math.sin(Math.PI*t);
      const riseAtTip=sweep*Math.abs(u)**3*(.29+.71*t);
      return new THREE.Vector3(centerX+(width+.055*t)*u,rise+riseAtTip, lineZ+direction*length*t+design.skew*u*.30);
    }
    if(gables){
      for(const side of [-1,1]){
        const shape=new THREE.Shape();
        shape.moveTo(-front,wallTop-.10);
        for(let i=0;i<=16;i++){
          const z=-front+2*front*i/16;
          const sample=point(half*side/width,Math.abs(z)/length,Math.sign(z));
          shape.lineTo(z,sample.y-.025);
        }
        shape.lineTo(front,wallTop-.10);
        shape.closePath();
        const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),
          new THREE.MeshStandardMaterial({color:design.plaster,side:THREE.DoubleSide,roughness:.93}));
        mesh.rotation.y=-Math.PI/2;
        mesh.position.x=half*side;
        mesh.castShadow=true;
        mesh.receiveShadow=true;
        group.add(mesh);
      }
    }
    for(const direction of [-1,1]){
      const rows=Math.min(10,Math.max(3,Math.ceil(length*3.4)));
      const columns=Math.min(25,Math.max(4,Math.ceil(width*4.8)));
      const points=[];
      for(let row=0;row<=rows;row++){
        for(let column=0;column<=columns;column++)points.push(point(-1+2*column/columns,row/rows,direction));
      }
      const mesh=new THREE.Mesh(geometryFromGrid(points,rows,columns),
        new THREE.MeshStandardMaterial({color:trim,roughness:.97,side:THREE.DoubleSide}));
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      group.add(mesh);
      for(let row=0;row<rows;row++){
        for(let column=0;column<columns;column++){
          const u=-1+2*(column+.50+(row%2?.17:0))/columns,t=(row+.48)/rows;
          const position=point(u,t,direction);
          const right=point(u+.045,t,direction).sub(position).normalize();
          const forward=point(u,t+.022,direction).sub(position).normalize().multiplyScalar(direction);
          const normal=forward.clone().cross(right).normalize();
          const orientation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4()
            .makeBasis(right,normal,forward));
          const size=(.85+random()*.17);
          add('tile',position.x,position.y+.054,position.z,width*2/columns*1.05*size,.086,
            length/rows*1.56, pick(colors),undefined,orientation);
        }
      }
      for(const end of [-1,1]){
        const pointsAtEdge=Array.from({length:12},(_,index)=>point(end,index/11,direction));
        pointsAtEdge.slice(1).forEach((p,index)=>beam(pointsAtEdge[index],p,.118,trim));
      }
      const edge=Array.from({length:14},(_,index)=>point(-1+2*index/13,1,direction));
      edge.slice(1).forEach((p,index)=>beam(edge[index],p,.10,trim));
    }
    const caps=16;
    for(let i=0;i<caps;i++){
      const p=point(-1+2*(i+.5)/caps,0,1);
      add('post',p.x,p.y+.088,p.z,.19,width*2/caps+.018,.205,pick(colors),[0,0,Math.PI/2]);
    }
  }

  roof(design.ridge,half+.62,front+.68,0,0,design.bend,design.sweep,wallTop,true);
  if(house.id==='lumber_cabin'){
    const chimneyX=half*.50,chimneyZ=-.46;
    const chimneyBase=design.ridge-.68,chimneyTop=design.ridge+.71;
    block(chimneyX,(chimneyBase+chimneyTop)*.5,chimneyZ,.61,chimneyTop-chimneyBase,.63,design.stone[0]);
    for(let y=chimneyBase+.09;y<chimneyTop;y+=.18){
      stoneRow(chimneyX-.31,chimneyX+.30,y,chimneyZ+.305,.74);
      stoneRow(chimneyZ-.32,chimneyZ+.31,y,chimneyX+.303,.76,Math.PI/2);
    }
    block(chimneyX,chimneyTop-.06,chimneyZ,.76,.16,.75,design.stone[1]);
    block(chimneyX,chimneyTop+.025,chimneyZ,.32,.03,.25,'#645a50');
    const awningY=base+1.8;
    const left=new THREE.Vector3(-.96,awningY,front+.76);
    const right=new THREE.Vector3(.96,awningY,front+.76);
    const leftBack=new THREE.Vector3(-.96,awningY+.42,front+.01);
    const rightBack=new THREE.Vector3(.96,awningY+.42,front+.01);
    const vertices=[left,right,leftBack,rightBack];
    const canopy=new THREE.Mesh(geometryFromGrid(vertices,1,1),
      new THREE.MeshStandardMaterial({color:design.roof[1],roughness:.92,side:THREE.DoubleSide}));
    canopy.castShadow=true;
    canopy.receiveShadow=true;
    group.add(canopy);
    beam(left,right,.12,design.fascia);
    beam(leftBack,left,.095,design.fascia);
    beam(rightBack,right,.095,design.fascia);
    for(const side of [-1,1]){
      const rootX=half*side*.90;
      let previous=new THREE.Vector3(rootX,.21,front+.14);
      for(let i=0;i<10;i++){
        const point=new THREE.Vector3(rootX+Math.sin(i*.65+side)*.15,.26+i*.13,front+.13);
        beam(previous,point,.023,'#687955','post');
        add('leaf',point.x+.105*side,point.y+.04,point.z+.04,.20,.145,.08,i%2?'#839a73':'#a6aa76',[0,0,i*.2]);
        previous=point;
      }
    }
  }
  if(house.id==='myanmar_villa'){
    const gateX=house.approach.x,gateZ=front+1.67;
    for(const side of [-1,1]){
      const a=side===1?gateX+.72:-half;
      const b=side===1?half:gateX-.72;
      block((a+b)*.5,.35,gateZ,b-a,.69,.235,'#bfa685');
      for(const y of [.10,.31,.54])stoneRow(a,b,y,gateZ+.10);
      block((a+b)*.5,.69,gateZ,b-a+.04,.095,.30,design.stone[1]);
      const pier=gateX+side*.69;
      block(pier,.72,gateZ,.245,1.45,.33,design.stone[2]);
      shrub(pier+side*.29,.72,gateZ+.03,.39,.44,true);
    }
    roof(1.99,1.0,.50,gateZ,gateX,.12,.16,1.51);
    for(let i=0;i<4;i++){
      const size=.42-i*.078;
      add('post',.14,design.ridge+.15+i*.13,.03,size,.18,size,'#c6a165');
    }
    add('leaf',.14,design.ridge+.67,.03,.16,.21,.16,'#ebc57c');
  }

  finish();
  return group;
}
