import * as THREE from 'three';

const TAU = Math.PI * 2;
const grasses = ['#78854d','#657c49','#a09b5c','#8e9258','#729059'];
const stoneColors = ['#8b9384','#acaa8f','#b8b5a0','#999e95','#7d8b81'];
const brown = ['#786044','#8a6f48','#715b44'];

function reedBlades() {
  const positions = [];
  // Leaf mesh starts at its base and tapers while curving away from the stem.
  const rows = [
    [0,0,.022], [.24,.54,.046], [.57,.83,.037], [.87,.99,.017], [1,1.02,0],
  ];
  for(let row=1;row<rows.length;row++){
    const [ax,ay,aw]=rows[row-1];
    const [bx,by,bw]=rows[row];
    const a=[ax,ay,-aw],b=[ax,ay,aw],c=[bx,by,-bw],d=[bx,by,bw];
    positions.push(...a,...b,...c,...c,...b,...d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  return geometry;
}

export function addLakeBank({group,random,standard,batches,groundHeight,shorePoint,pathGap,waterLevel}) {
  const leaves=[],stems=[],heads=[],rocks=[],bench=[];
  const choose = palette => palette[Math.floor(random()*palette.length)];
  const gapClear = (x,z,radius=0) => pathGap(x,z)>=1+radius;

  const reedAngles = [-2.92,-2.67,-2.44,-2.05,-1.86,-1.48,-.95,-.75,-.46,-.18,.32,.80,1.71,2.23,2.54,2.73,2.99];
  for(const angle of reedAngles){
    const patch = shorePoint(angle + (random()-.5)*.12, .98+random()*.07);
    const size = .28+random()*.29;
    if(!gapClear(patch.x,patch.z,size)) continue;
    const stemsCount = 3+Math.floor(random()*4);
    for(let i=0;i<stemsCount;i++){
      const x=patch.x+(random()-.5)*size;
      const z=patch.z+(random()-.5)*size;
      const terrainY = groundHeight(x,z);
      if(terrainY<waterLevel-.14) continue;
      const root = Math.max(terrainY-.012,waterLevel-.055);
      const height = .58+random()*.64;
      const yaw = random()*TAU;
      stems.push([x,root+height*.5,z,.019,height,.019,yaw,choose(grasses)]);
      if(i%2===0){
        const topHeight = .12+random()*.065;
        heads.push([x,root+height-topHeight*.5+.015,z,.054,topHeight,.052,yaw,choose(brown)]);
      }
      for(const side of [0,Math.PI]) {
        const length = (.38+random()*.48)*height;
        leaves.push([x,root+height*(.10+random()*.28),z,.19+random()*.32,length,
          .45+random()*.23,yaw+side,choose(grasses)]);
      }
    }
  }

  const stoneAngles = [-3.02,-2.49,-2.22,-1.64,-1.13,-.69,-.30,.21,.56,1.18,1.37,1.89,2.07,2.46,2.75];
  for(const angle of stoneAngles){
    const shore = shorePoint(angle + (random()-.5)*.12,1.027+random()*.075);
    const count = 2+Math.floor(random()*3);
    for(let i=0;i<count;i++){
      const x=shore.x+(random()-.5)*.55;
      const z=shore.z+(random()-.5)*.44;
      const size=.11+random()*.34;
      if(!gapClear(x,z,size)) continue;
      const terrainY=groundHeight(x,z);
      if(terrainY<waterLevel-.065) continue;
      rocks.push([x,terrainY+size*.18-.04,z,size*(1.07+random()*.49),size*(.43+random()*.31),
        size*(.72+random()*.32),random()*TAU,choose(stoneColors),random()*.35,random()*.31]);
    }
  }

  const seat = {x:-16.1,z:1.7};
  if([seat.x-.9,seat.x,seat.x+.9].every(x=>gapClear(x,seat.z,.27))){
    const ground=groundHeight(seat.x,seat.z);
    const lengths=['#a38a62','#ae9268','#9b815d'];
    for(const side of [-1,1]){
      const x=seat.x+side*.66;
      const bottom=groundHeight(x,seat.z);
      bench.push([x,(ground+.37+bottom)*.5,seat.z,.15,ground+.37-bottom,.44,0,'#796d50']);
      bench.push([x,ground+.55,seat.z+.19,.075,.49,.074,0,'#887959',.09,0]);
    }
    for(let i=0;i<3;i++) bench.push([seat.x,ground+.39,seat.z-.155+i*.163,1.73,.070,.145,0,lengths[i]]);
    for(let i=0;i<2;i++) bench.push([seat.x,ground+.65+i*.128,seat.z+.22+i*.013,1.71,.095,.060,0,lengths[i+1],.09,0]);
  }

  const dull = standard();
  const slender = new THREE.CylinderGeometry(.39,.57,1,5);
  batches(group,reedBlades(),standard({side:THREE.DoubleSide}),leaves);
  batches(group,slender,dull,stems);
  batches(group,new THREE.CapsuleGeometry(.46,.15,2,6),dull,heads);
  batches(group,new THREE.DodecahedronGeometry(1,0),standard({flatShading:true}),rocks,{cast:true});
  batches(group,new THREE.BoxGeometry(),dull,bench,{cast:true});
}