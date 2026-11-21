import * as THREE from 'three';

const paddockEdges = [
  [12.45,2,17.70,2],
  [12.45,2,12.45,8.10],
  [17.70,2,17.70,8.10],
  [12.45,8.10,13.45,8.10],
  [15.55,8.10,17.70,8.10],
];

const weatheredWood = ['#ad895d','#9b7955','#b49264','#a48258'];
const stone = ['#aa9f83','#bdb296','#918c76'];
const tiles = ['#6c846e','#77917a','#81957d','#718a76','#89977a'];
const straw = ['#d5b071','#c69e64','#dcbc78','#cfaa68'];

export function addStable({group,standard,batches,groundHeight}) {
  const woodwork=[],roofing=[],masonry=[],hay=[];
  const fenceCorners=new Set();
  const front=3.83;
  const rear=2.38;
  const left=14.21;
  const right=17.10;
  const midX=(left+right)*.5;
  const midZ=(front+rear)*.5;
  const floor=groundHeight(midX,midZ)+.087;

  function post(x,z,top,width=.12,color='#997451') {
    const ground=groundHeight(x,z);
    woodwork.push([x,(top+ground)*.5,z,width,top-ground,width,0,color]);
  }

  for(const [x0,z0,x1,z1] of paddockEdges){
    const dx=x1-x0,dz=z1-z0,length=Math.hypot(dx,dz);
    const segments=Math.ceil(length/1.35);
    const angle=-Math.atan2(dz,dx);
    for(let index=0;index<=segments;index++){
      const x=x0+dx*index/segments,z=z0+dz*index/segments;
      const key=x.toFixed(3)+'/'+z.toFixed(3);
      if(!fenceCorners.has(key)){
        fenceCorners.add(key);
        const y=groundHeight(x,z);
        const wood=weatheredWood[fenceCorners.size%weatheredWood.length];
        post(x,z,y+.96,.116,wood);
        woodwork.push([x,y+.96,z,.146,.069,.146,.12,weatheredWood[1]]);
      }
      if(index===segments) continue;
      const xNext=x0+dx*(index+1)/segments,zNext=z0+dz*(index+1)/segments;
      const groundStart=groundHeight(x,z),groundEnd=groundHeight(xNext,zNext);
      const tilt=Math.atan2(groundEnd-groundStart,length/segments);
      for(const height of [.35,.66]){
        woodwork.push([(x+xNext)*.5,(groundStart+groundEnd)*.5+height,(z+zNext)*.5,
          length/segments+.055,.082,.091,angle,weatheredWood[(index+(height>.5?1:0))%weatheredWood.length],0,tilt]);
      }
    }
  }

  masonry.push([midX,floor-.098,midZ,right-left+.09,.18,front-rear+.14,0,'#9b8969']);
  woodwork.push([midX,floor-.018,midZ,right-left,.056,front-rear,0,'#b4976b']);

  const highRear=floor+2.48;
  const lowFront=floor+2.10;
  for(const x of [left,right]){
    post(x,rear,highRear,.16,'#886849');
    post(x,front,lowFront,.17,'#886849');
    for(const z of [rear,front]){
      masonry.push([x,groundHeight(x,z)+.044,z,.25,.12,.24,0,stone[z===rear?0:1]]);
    }
    // Short side boards leave an opening across the entire front bay.
    for(let index=0;index<6;index++){
      const z=rear+.11+index*.141;
      woodwork.push([x,floor+.46,z,.079,.96,.147,0,weatheredWood[index%weatheredWood.length]]);
    }
    woodwork.push([x,floor+.81,rear+.46,.08,.077,.90,0,'#886749']);
  }
  post(midX,rear,highRear,.13,'#9b7854');
  for(let index=0;index<16;index++){
    const x=left+.10+index*(right-left-.20)/15;
    const height=1.91-(index%3)*.025;
    woodwork.push([x,floor+height*.5,rear,.168,height,.077,0,weatheredWood[index%weatheredWood.length]]);
  }
  woodwork.push([midX,highRear-.09,rear,right-left+.16,.154,.16,0,'#85694b']);
  woodwork.push([midX,lowFront-.052,front,right-left+.23,.143,.15,0,'#85694b']);
  const slant=Math.atan2(highRear-lowFront,front-rear);
  const roofDepth=front-rear+.41;
  for(const x of [left,midX,right]){
    woodwork.push([x,(highRear+lowFront)*.5,midZ,.106,.122,
      Math.hypot(roofDepth,highRear-lowFront),0,'#8c6c50',slant]);
  }

  const tileRows=6,tileCount=13;
  const roofWidth=right-left+.38;
  for(let row=0;row<tileRows;row++){
    const z=rear-.20+(row+.48)*roofDepth/tileRows;
    let y=highRear-(z-rear)*Math.tan(slant)+.036;
    if(row===0) y+=.02;
    const rowOffset=row%2*.038;
    for(let column=0;column<tileCount;column++){
      const x=midX-roofWidth/2+(column+.5)*roofWidth/tileCount+rowOffset;
      roofing.push([x,y+Math.sin(column*6+row*2)*.012,z,roofWidth/tileCount-.009,.075,
        roofDepth/tileRows+.058,0,tiles[(column*3+row*2)%tiles.length],slant]);
    }
  }

  // Trough and wrapped hay bales sit at the sheltered right rear corner.
  const troughX=16.47,troughZ=3.24;
  for(const x of [troughX-.40,troughX+.40]){
    woodwork.push([x,floor+.142,troughZ,.10,.285,.35,0,'#8b6a4d']);
  }
  woodwork.push([troughX,floor+.26,troughZ,1.00,.09,.43,0,'#876749']);
  for(const side of [-1,1]){
    woodwork.push([troughX,floor+.36,troughZ+side*.183,1.06,.175,.067,0,'#a37c51',side*.10]);
    woodwork.push([troughX+side*.489,floor+.36,troughZ,.067,.175,.37,0,'#9f7a53']);
  }
  woodwork.push([troughX,floor+.307,troughZ,.89,.024,.31,0,'#788d7f']);
  for(const [x,dy,z,yaw] of [[16.68,.14,2.72,.06],[16.10,.13,2.67,-.09],[16.41,.34,2.72,.02]]){
    hay.push([x,floor+dy,z,.55,.23,.37,yaw,straw[0]]);
    for(const band of [-.15,.15]){
      hay.push([x+band,floor+dy+.115,z,.028,.021,.39,yaw,'#a98a58']);
      hay.push([x+band,floor+dy,z+.179,.025,.24,.016,yaw,'#a98a58']);
    }
    for(let i=0;i<5;i++){
      hay.push([x-.20+i*.10,floor+dy+.05+(i%2)*.035,z+.183,.073,.027,.017,
        yaw,straw[i%straw.length],0,Math.sin(i*3.18)*.16]);
    }
  }

  const box=new THREE.BoxGeometry();
  const matte=standard();
  batches(group,box,matte,woodwork,{cast:true});
  batches(group,box,matte,roofing,{cast:true});
  batches(group,box,matte,hay,{cast:true});
  batches(group,new THREE.DodecahedronGeometry(.72,0),standard({flatShading:true}),masonry,{cast:true});
}