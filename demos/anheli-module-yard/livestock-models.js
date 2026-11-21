import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const round = new THREE.SphereGeometry(1, 10, 7);
const tapered = new THREE.CylinderGeometry(.32, 1, 2, 9);
const material = new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92});
const cache = new Map();
const eyes = '#46342c';
const glint = '#fff1d3';

function oval(color, position, scale, rotation = [0,0,0]) {
  return {color,position,scale,rotation,shape:round};
}

function sprout(color,position,scale,rotation) {
  return {color,position,scale,rotation,shape:tapered};
}

function geometry(parts) {
  const pieces = parts.map(({color,position,scale,rotation,shape})=>{
    const piece=shape.clone();
    piece.scale(...scale);
    piece.rotateX(rotation[0]);
    piece.rotateY(rotation[1]);
    piece.rotateZ(rotation[2]);
    piece.translate(...position);
    const tint=new THREE.Color(color);
    const channels=new Float32Array(piece.attributes.position.count*3);
    for(let i=0;i<channels.length;i+=3){
      channels[i]=tint.r;
      channels[i+1]=tint.g;
      channels[i+2]=tint.b;
    }
    piece.setAttribute('color',new THREE.BufferAttribute(channels,3));
    return piece;
  });
  const joined=mergeGeometries(pieces);
  for(const piece of pieces)piece.dispose();
  return joined;
}

function joint(parent,meshGeometry,offset=[0,0,0]){
  const pivot=new THREE.Group();
  pivot.position.set(...offset);
  const mesh=new THREE.Mesh(meshGeometry,material);
  mesh.castShadow=mesh.receiveShadow=true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

function brightEye(side,x,y,z,size){
  return [
    oval(eyes,[x*side,y,z],[size,size*1.23,size*.62],[0,side*.50,0]),
    oval(glint,[(x-.006)*side,y+.007,z+size*.47],[size*.29,size*.31,size*.24]),
  ];
}

const birdLooks = {
  chicken:{body:['#ecd5b2','#d7aa78','#985b46'],wing:'#a97c61',bill:'#d5a051',feet:'#bb8c57',
    headHeight:.626,headZ:.265,legHeight:.17,comb:true,tail:'#886c5a'},
  duck:{body:['#e9d9a8','#f2dfba','#cfb389'],wing:'#d7bc83',bill:'#da9a55',feet:'#ca8f61',
    headHeight:.566,headZ:.294,legHeight:.13,tail:'#c7ac7b'},
  goose:{body:['#eedfc7','#e6dfce','#c4d0c5'],wing:'#c0c6b5',bill:'#ca8954',feet:'#bd8659',
    headHeight:1.06,headZ:.317,legHeight:.235,longNeck:true,tail:'#b3b8a4'},
};

function bird(species,index){
  const look=birdLooks[species],color=look.body[index];
  const isChicken=species==='chicken',isGoose=species==='goose';
  const body=[
    oval(color,[0,isGoose?.47:.37,-.04],[isGoose?.285:.265,isGoose?.25:.22,isChicken?.345:.402]),
    oval(color,[0,isGoose?.50:.40,.15],[.203,.193,.249],[-.25,0,0]),
  ];
  for(const side of [-1,1]){
    body.push(
      oval(look.wing,[side*.193,isGoose?.47:.37,-.087],[.104,.126,.278],[.13,0,side*.16]),
      oval(color,[side*.220,isGoose?.51:.41,-.056],[.088,.105,.235],[.17,0,side*.17]),
      oval(look.tail,[side*.045,isGoose?.48:.406,-.340],[.095,.081,.139],[isChicken?.86:.36,0,side*.13]),
    );
  }
  if(isChicken)body.push(oval(look.tail,[0,.55,-.336],[.116,.205,.084],[.8,0,0]));
  const neck = look.longNeck ? [
    oval(color,[0,-.285,-.071],[.109,.321,.106],[.19,0,0]),
    oval(color,[0,-.143,-.009],[.093,.182,.089],[.38,0,0]),
  ] : [oval(color,[0,-.132,-.033],[.128,.158,.136],[.22,0,0])];
  const head=[
    ...neck,
    oval(color,[0,0,0],[isGoose?.123:.143,isGoose?.122:.142,.137]),
    oval(look.bill,[0,-.035,isChicken?.138:.179],[isChicken?.065:.091,isChicken?.043:.049,isChicken?.073:.101],[-.12,0,0]),
    oval('#ae7445',[0,-.056,isChicken?.160:.201],[isChicken?.047:.077,.016,.071],[-.09,0,0]),
  ];
  for(const side of [-1,1])head.push(...brightEye(side,.099,.025,.090,.023));
  if (look.comb) {
    head.push(oval('#b96350',[0,-.105,.100],[.030,.066,.036]));
    for(const [i,size] of [.055,.066,.045].entries()){
      head.push(oval('#c66d5b',[0,.139+(i===1?.028:.008),.069-i*.057],[.035,size,.043]));
    }
  }
  const foot=[
    oval(look.feet,[0,-look.legHeight*.55,0],[.037,look.legHeight*.59,.044]),
    oval(look.feet,[0,-look.legHeight+.025,.047],[isChicken?.051:.085,.027,.106]),
  ];
  for(const side of [-1,1])foot.push(oval(look.feet,[side*.038,-look.legHeight+.015,.087],[.022,.017,.064],[0,side*.20,0]));
  return {
    body:geometry(body),head:geometry(head),foot:geometry(foot),headOffset:[0,look.headHeight,look.headZ],
    feet:[[-.103,look.legHeight,.047],[.103,look.legHeight,.047]], motion:'bird',
  };
}

function bunny(index){
  const fur=['#e2cbb7','#b99f88','#f2dfcc'][index];
  const body=[
    oval(fur,[0,.319,-.103],[.263,.279,.352],[-.11,0,0]),
    oval('#f3dfc8',[0,.310,.142],[.173,.184,.149]),
    oval('#eddfd5',[.016,.363,-.428],[.109,.113,.106]),
  ];
  const head=[
    oval(fur,[0,0,0],[.209,.192,.184]),
    oval('#f2dfcd',[0,-.062,.142],[.143,.103,.082]),
    oval('#b57972',[0,-.038,.211],[.036,.026,.022]),
    oval('#72545a',[0,-.070,.216],[.009,.016,.010]),
  ];
  for(const side of [-1,1]){
    head.push(
      oval(fur,[side*.093,.213,-.021],[.066,.242,.068],[side*.12,0,side*-.19]),
      oval('#d3a091',[side*.113,.239,.034],[.039,.178,.022],[side*.12,0,side*-.19]),
      ...brightEye(side,.130,.019,.134,.026),
    );
  }
  const foot=geometry([
    oval(fur,[0,-.070,.017],[.075,.114,.097]),
    oval(fur,[0,-.128,.083],[.073,.054,.102]),
  ]);
  return {body:geometry(body),head:geometry(head),foot,headOffset:[0,.527,.198],
    feet:[[-.145,.181,-.19],[.145,.181,-.19],[-.109,.181,.187],[.109,.181,.187]],motion:'hop'};
}

function grazingAnimal(species,index){
  const horse=species==='horse';
  const hide=(horse?['#a57254','#735044','#d7b58b']:['#e2cab0','#ad7758','#d7bda4'])[index];
  const dark=horse?['#5d443a','#4a3836','#8a6450'][index]:'#805c4a';
  const hoof='#5d4b42';
  const legHeight=horse?.68:.55;
  const torsoHeight=horse?.98:.81;
  const body=[
    oval(hide,[0,torsoHeight,-.15],[horse?.350:.433,.373,horse?.650:.603]),
    oval(hide,[0,torsoHeight+.010,.386],[horse?.318:.379,.352,.324],[-.21,0,0]),
    oval(hide,[0,torsoHeight+.020,-.581],[horse?.337:.393,.350,.316]),
  ];

  if(horse){
    body.push(
      oval(hide,[0,1.262,.491],[.223,.555,.261],[.53,0,0]),
      oval(dark,[0,1.390,.342],[.117,.486,.132],[.51,0,0]),
      oval('#829890',[0,1.261,-.126],[.369,.135,.409]),
      oval('#745247',[0,1.373,-.145],[.297,.076,.319]),
      oval('#b98658',[0,1.420,-.316],[.252,.092,.114]),
      oval('#a97650',[0,1.434,.080],[.218,.087,.103]),
    );
    for(const side of [-1,1]){
      body.push(
        oval('#7c5748',[side*.335,1.15,-.117],[.080,.195,.187],[.11,0,side*-.20]),
        oval('#caab75',[side*.355,.977,-.113],[.076,.034,.101]),
      );
    }
  }else{
    body.push(
      oval('#cfb194',[0,.941,.403],[.291,.367,.326],[.32,0,0]),
      oval('#cfad9a',[0,.485,-.395],[.209,.099,.214]),
    );
    for(const side of [-1,1]){
      body.push(
        oval(dark,[side*.373,.902,-.24],[.106,.204,.205],[.28,0,side*.13]),
        oval(dark,[side*.341,1.008,.130],[.098,.147,.161],[0,.21,side*.21]),
      );
    }
  }

  const face=[
    oval(hide,[0,0,0],[horse?.205:.254,horse?.245:.217,.246],[horse?-.32:0,0,0]),
    oval(horse?'#b7876d':'#ba8b75',[0,-.123,.178],[horse?.155:.217,.105,.146],[.14,0,0]),
  ];
  for(const side of [-1,1]){
    face.push(
      ...brightEye(side,horse?.160:.185,.036,.133,.032),
      oval('#765046',[side*.078,-.110,.303],[.025,.016,.013],[0,side*.24,0]),
    );
    if(horse){
      face.push(
        oval(hide,[side*.112,.225,-.031],[.067,.163,.068],[.10,0,-side*.24]),
        oval('#d2a18a',[side*.126,.262,.014],[.032,.107,.028],[.10,0,-side*.24]),
        oval(dark,[side*.073,.174,.120],[.100,.089,.143],[.11,side*.18,side*.40]),
        oval('#a67b58',[side*.159,-.108,.161],[.020,.042,.106],[.07,side*.12,0]),
      );
    }else{
      face.push(
        oval(hide,[side*.285,.083,-.013],[.152,.071,.091],[.11,0,side*.31]),
        oval('#cc9c85',[side*.300,.084,.044],[.097,.041,.035],[0,0,side*.27]),
        sprout('#e9d5a7',[side*.218,.219,-.052],[.057,.138,.061],[.08,0,-side*.36]),
      );
    }
  }
  const foot=[
    oval(hide,[0,-legHeight*.34,0],[horse?.082:.104,legHeight*.49,.090],[-.064,0,0]),
    oval(hide,[0,-legHeight*.74,.006],[horse?.064:.078,legHeight*.31,.071],[.10,0,0]),
    oval(hoof,[0,-legHeight+.055,.028],[horse?.084:.094,.056,.098]),
  ];
  const tail=[
    oval(horse?dark:hide,[0,-.165,-.051],[horse?.071:.045,.219,horse?.066:.043],[-.26,0,0]),
    oval(dark,[0,-.327,-.109],[horse?.077:.081,horse?.180:.102,.069],[-.14,0,0]),
  ];
  return {
    body:geometry(body),head:geometry(face),foot:geometry(foot),tail:geometry(tail),
    headOffset:horse?[0,1.58,.740]:[0,1.136,.601],
    feet:[[-.218,legHeight,-.553],[.218,legHeight,-.553],[-.203,legHeight,.374],[.203,legHeight,.374]],
    tailOffset:[0,torsoHeight+.15,-.783],motion:horse?'trot':'walk',
  };
}

const builders = {
  chicken:index=>bird('chicken',index),duck:index=>bird('duck',index),goose:index=>bird('goose',index),
  rabbit:bunny,cattle:index=>grazingAnimal('cattle',index),horse:index=>grazingAnimal('horse',index),
};

export function createLivestockModel(species,variant=0){
  const kind=species==='cow'?'cattle':species;
  if(!Object.hasOwn(builders,kind))throw new RangeError('Unsupported livestock: '+species);
  const index=Math.abs(Math.trunc(Number(variant)||0))%3;
  const key=kind+':'+index;
  if(!cache.has(key)){
    const model=builders[kind](index);
    model.foot.computeBoundingBox();
    model.foot.translate(0,-model.foot.boundingBox.min.y-model.feet[0][1],0);
    cache.set(key,model);
  }
  const model=cache.get(key);
  const root=new THREE.Group();
  const body=joint(root,model.body);
  const head=joint(body,model.head,model.headOffset);
  const legs=model.feet.map(offset=>joint(root,model.foot,offset));
  const tail=model.tail?joint(body,model.tail,model.tailOffset):null;
  const speed={bird:13,hop:10,walk:7.3,trot:10.5}[model.motion];
  const horse=kind==='horse';

  return {
    root,
    riderHeight:horse?1.51:undefined,
    animate(time,moving,stroke=0){
      const phase=time*speed+index*.81;
      const stride=moving?Math.sin(phase):0;
      const pet=Math.sin(Math.PI*Math.min(1,Math.max(0,stroke)));
      const leap=model.motion==='hop'&&moving?Math.max(0,Math.sin(phase))*.115:0;
      body.position.y=leap+Math.abs(stride)*(horse?.029:.022)+(horse?.012:.044)*pet;
      body.rotation.z=stride*(model.motion==='bird'?.045:.019);
      head.rotation.x=Math.sin(time*2.31+index)*.048-stride*.04-pet*.135;
      head.rotation.y=Math.sin(time*1.48+index)*.065;
      if(tail)tail.rotation.z=Math.sin(time*3+index)*.15+stride*.13;
      for(let i=0;i<legs.length;i++){
        const sign=legs.length===2?i===0?1:-1:i===0||i===3?1:-1;
        const step=model.motion==='hop'?stride*(i<2?1:-.72):stride*sign;
        legs[i].rotation.x=step*(horse?.45:.38);
        legs[i].position.y=model.feet[i][1]+leap+Math.max(0,step)*(horse?.049:.027);
      }
    },
  };
}
