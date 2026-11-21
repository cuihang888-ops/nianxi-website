import Flora from '../../src/open-world/vendor/content-flora.cjs';
import {streetBlocks,streetEast} from './ruili-street.js';

export const bounds = {minX:-34.5,maxX:streetEast,minZ:-34,maxZ:24};
export const houseSite = {x:-1.8,z:-3.4};
const gardenBeds = [
  {x:-7.4,z:5.3,w:3.2,d:1.6,id:'herbs',label:'茶苗',plant:'tea'},
  {x:-3.6,z:6.1,w:3.2,d:1.6,id:'rice',label:'稻苗',plant:'rice'},
];
const pen = {left:4.3,right:11.6,top:1.6,bottom:7.6,gateTop:3.5,gateBottom:5.7};
const fenceSections = [
  [pen.left,pen.top,pen.right,pen.top],[pen.right,pen.top,pen.right,pen.bottom],
  [pen.left,pen.top,pen.left,pen.gateTop],[pen.left,pen.gateBottom,pen.left,pen.bottom],
  [pen.left,pen.bottom,pen.right,pen.bottom],
];
const trees = [
  {x:-9.35,z:-5.65,size:6.65,seed:41,colors:['#527e5f','#7e9c68','#a6b77b','#d2ca8c'],bloom:'#f5d796'},
  {x:6.75,z:-5.8,size:7.15,seed:92,colors:['#446d5c','#678b6a','#93ae77','#c3c78a']},
  {x:13.3,z:1.2,size:7,seed:64,colors:['#436658','#648d6e','#96aa76','#c7c286']},
  {x:-14.4,z:2.5,size:6,seed:162,colors:['#456953','#698660','#95ac73','#c4bf7e']},
];
const shrubs = [
  [-7.6,-1.55,1.05,'rose'],[2.9,-1.6,.90,'peach'],[-10.5,3.7,.88,'peach'],
  [11.55,8.3,.91,'rose'],[12.2,-2.8,1.18,'rose'],[-11.8,8.4,1.04,'rose'],
  [2.6,8.8,.73,'peach'],[9.2,-2.8,.68,'peach'],
];

function randomSource(seed) {
  return () => {
    seed = (Math.imul(seed,1664525)+1013904223)>>>0;
    return seed / 2**32;
  };
}
function oval(ctx,x,y,rx,ry,color,rotation=0) {
  ctx.beginPath();
  ctx.ellipse(x,y,rx,ry,rotation,0,Math.PI*2);
  ctx.fillStyle=color;
  ctx.fill();
}
function poly(ctx,points,fill) {
  ctx.beginPath();
  ctx.moveTo(points[0].x,points[0].y);
  for(const point of points.slice(1)) ctx.lineTo(point.x,point.y);
  ctx.closePath();
  ctx.fillStyle=fill;
  ctx.fill();
}
function plane(ctx,project,vertices,color) {
  poly(ctx,vertices.map(([x,z,y])=>project(x,z,y)),color);
}
function line(ctx,points,color,width) {
  ctx.beginPath();
  ctx.moveTo(points[0].x,points[0].y);
  for(const point of points.slice(1)) ctx.lineTo(point.x,point.y);
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.lineJoin='round';
  ctx.lineCap='round';
  ctx.stroke();
}
function softShadow(ctx,x,y,rx,ry,alpha=.29) {
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(rx,ry);
  const shade=ctx.createRadialGradient(0,0,.12,0,0,1);
  shade.addColorStop(0,'rgba(49,78,65,'+alpha+')');
  shade.addColorStop(.58,'rgba(49,78,65,'+alpha*.57+')');
  shade.addColorStop(1,'rgba(49,78,65,0)');
  oval(ctx,0,0,1,1,shade);
  ctx.restore();
}
function blossom(ctx,x,y,r,petals,center) {
  for(let index=0;index<5;index++){
    const angle=index*Math.PI*2/5;
    oval(ctx,x+Math.cos(angle)*r*.66,y+Math.sin(angle)*r*.66,r*.62,r*.53,petals,angle);
  }
  oval(ctx,x,y,r*.40,r*.35,center);
}

function backdrop(ctx,w,h) {
  const sky=ctx.createLinearGradient(0,0,0,h*.59);
  sky.addColorStop(0,'#98c1ba');
  sky.addColorStop(.52,'#cee1c9');
  sky.addColorStop(1,'#f6e9c8');
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,w,h);

  const lightX=w*.23,lightY=h*.24;
  const glow=ctx.createRadialGradient(lightX,lightY,0,lightX,lightY,h*.32);
  glow.addColorStop(0,'rgba(255,244,201,.96)');
  glow.addColorStop(.28,'rgba(255,237,189,.58)');
  glow.addColorStop(1,'rgba(255,239,189,0)');
  ctx.fillStyle=glow;
  ctx.fillRect(0,0,w,h*.72);
  oval(ctx,lightX,lightY,h*.030,h*.030,'#fff2cd');
  for (const [cx,cy,size] of [[.12,.158,.10],[.44,.22,.14],[.78,.13,.16],[.94,.29,.12]]) {
    for (const [offset,height,radius] of [[-.66,.04,.54],[-.26,-.14,.56],[.12,-.19,.51],[.57,.04,.49]]) {
      oval(ctx,w*(cx+size*offset),h*(cy+size*height),w*size*radius,h*size*.105,'rgba(255,250,226,.16)');
    }
    oval(ctx,w*cx,h*(cy+size*.13),w*size*.89,h*size*.074,'rgba(255,250,226,.13)');
  }

  for (const [phase,base,height,top,foot] of [
    [.7,.48,.17,'#a3bcb2','#ddd8bb'],[3.8,.53,.14,'#8eaFA3','#c1cfab'],
    [1.1,.59,.128,'#81a993','#b4c5a0'],[3.2,.655,.15,'#799f83','#a9be90'],
  ]) {
    const fill=ctx.createLinearGradient(0,h*(base-height),0,h*base);
    fill.addColorStop(0,top);
    fill.addColorStop(1,foot);
    ctx.beginPath();
    ctx.moveTo(0,h);
    for(let index=0;index<=86;index++){
      const u=index/86;
      const rise=Math.sin(u*11.5+phase)*.36+Math.sin(u*21-phase)*.12+Math.cos(u*37+phase)*.047;
      ctx.lineTo(u*w,h*(base-height*(rise+.84)));
    }
    ctx.lineTo(w,h);
    ctx.fillStyle=fill;
    ctx.fill();
  }
  const haze=ctx.createLinearGradient(0,h*.38,0,h*.61);
  haze.addColorStop(0,'rgba(247,239,203,0)');
  haze.addColorStop(.56,'rgba(247,239,203,.34)');
  haze.addColorStop(1,'rgba(247,239,203,0)');
  ctx.fillStyle=haze;
  ctx.fillRect(0,h*.38,w,h*.23);
}

function createTreeArt(canvas,tree) {
  canvas.width=250;
  canvas.height=260;
  const ctx=canvas.getContext('2d');
  const random=randomSource(tree.seed);
  const trunk=ctx.createLinearGradient(106,0,147,0);
  trunk.addColorStop(0,'#b49772');
  trunk.addColorStop(.46,'#a68262');
  trunk.addColorStop(1,'#765f51');
  ctx.fillStyle=trunk;
  ctx.beginPath();
  ctx.moveTo(104,244);
  ctx.bezierCurveTo(124,229,113,202,127,130);
  ctx.bezierCurveTo(131,104,130,88,145,65);
  ctx.bezierCurveTo(135,131,151,200,146,221);
  ctx.quadraticCurveTo(147,236,159,242);
  ctx.quadraticCurveTo(135,239,131,253);
  ctx.quadraticCurveTo(130,244,104,244);
  ctx.fill();
  line(ctx,[{x:132,y:176},{x:109,y:131},{x:76,y:107}],'#8f775d',9);
  line(ctx,[{x:139,y:180},{x:163,y:138},{x:187,y:123}],'#8f775d',7);

  const canopy=[
    [121,104,75,51],[64,117,48,39],[173,120,61,45],[110,63,56,43],
    [168,72,55,47],[64,78,48,38],[204,99,35,32],[132,50,45,38],
    [160,51,32,30],[92,47,32,28],[99,132,43,26],[170,145,44,24],
  ];
  for(const [index,[x,y,rx,ry]] of canopy.entries()){
    const tint=ctx.createLinearGradient(x-rx*.42,y-ry,x+rx*.38,y+ry);
    tint.addColorStop(0,tree.colors[index<3?1:2]);
    tint.addColorStop(1,tree.colors[index<3?0:1]);
    oval(ctx,x,y,rx,ry,tint,-.17+random()*.3);
    for(let i=0;i<40;i++){
      const angle=random()*Math.PI*2;
      const reach=Math.sqrt(random())*.9;
      const px=x+Math.cos(angle)*rx*reach,py=y+Math.sin(angle)*ry*reach;
      const s=1.3+random()*3.3;
      const leaf=tree.colors[i%3===0?0:3]+(i%3===0?'70':'90');
      oval(ctx,px,py,s*1.75,s*.73,leaf,angle-.55);
      oval(ctx,px+s*.8,py+s*.48,s*1.05,s*.55,leaf,angle+.35);
    }
  }
  if(tree.bloom) {
    for(const [x,y] of [[60,81],[75,58],[114,44],[133,82],[175,70],[202,106],[73,128],[151,127],[169,107]]) {
      blossom(ctx,x,y,3.8,tree.bloom,'#c89673');
      oval(ctx,x+8,y-4,2.7,2.2,'#f5e8ad');
    }
  }
}

function grassTuft(createCanvas, seed, tip) {
  const canvas=createCanvas();
  canvas.width=72;
  canvas.height=48;
  const ctx=canvas.getContext('2d');
  const random=randomSource(seed);
  const blade=ctx.createLinearGradient(0,8,0,43);
  blade.addColorStop(0,tip);
  blade.addColorStop(1,'#537252');
  ctx.fillStyle=blade;
  for(let i=0;i<28;i++){
    const x=10+random()*52;
    const y=30+random()*12;
    const height=8+random()*19;
    const lean=(random()-.44)*21;
    ctx.beginPath();
    ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x+lean*.1,y-height*.6,x+lean,y-height);
    ctx.quadraticCurveTo(x+lean*.45,y-height*.49,x+1.5+random()*2,y);
    ctx.fill();
  }
  return canvas;
}

function paintPaver(ctx,project,stone) {
  const {x,z,rx,rz,shape,material}=stone;
  const rim=shape.map(([dx,dz])=>[x+rx*dx,z+rz*dz]);
  plane(ctx,project,rim.map(([px,pz])=>[px+.055,pz+.12]),'#74694e75');
  const face=rim.map(([px,pz])=>[px,pz,.025]);
  plane(ctx,project,face,material);
  line(ctx,face.slice(3,6).map(point=>project(...point)),'#f8e5c099',.65);
}

export function createCourtyard(createCanvas,{survival=false}={}) {
  const garden=survival?[]:gardenBeds.map(bed=>({...bed,wateredAt:null}));
  const treeArt=trees.map(tree=>{
    const canvas=createCanvas();
    createTreeArt(canvas,tree);
    return canvas;
  });
  const random=randomSource(83);
  const grassMarks=Array.from({length:970},()=>({
    x:random()*50-25,z:random()*38-15,variant:random(),size:random(),
  }));
  const tuftArt=['#a7bc73','#d2ce82','#779857'].map((tip,i)=>grassTuft(createCanvas,51+i*23,tip));
  const border=[
    [-12.8,-4.1,4.2,1.2],[-12.9,7.9,3.5,1.5],[-9.5,9.8,3.5,1],
    [-4.8,9.9,2.8,.9],[.5,10.4,4.4,1.2],[5.9,9.8,3.4,1.2],
    [10.8,8.55,3.5,1.05],[12.4,5.1,1.2,3.15],[11,-3.8,4,1.6],
    [-6.15,-2.1,2.7,.67],[2.61,-3.1,1.35,1.4],[2.58,-.95,1.6,.95],
    [3.19,2.99,1.15,.61],[-9.46,5.99,1.65,.65],
  ];
  const tufts=border.flatMap(([x,z,rx,rz])=>Array.from({length:26},()=>{
    const angle=random()*Math.PI*2;
    const reach=Math.sqrt(random());
    return {
      x:x+Math.cos(angle)*rx*reach,z:z+Math.sin(angle)*rz*reach,
      size:.30+random()*.65,variant:Math.floor(random()*tuftArt.length),
      alpha:.43+random()*.46,
    };
  })).sort((a,b)=>a.z-b.z);
  const path=Array.from({length:18},(_,index)=>({
    x:houseSite.x+Math.sin(index*.33)*.42,z:-1.12+index*.66,
  }));
  const stoneColors=['#d4bf98','#deca9f','#e5d2ab','#c8b590','#d7c4a6','#e7d7ba'];
  const pavers=path.flatMap(({x,z},i)=>[-1,0,1].map((side,index)=>({
    x:x+side*(.54+random()*.06)+(random()-.5)*.22,
    z:z+(random()-.5)*.23+side*.09,
    rx:.26+random()*.13,rz:.24+random()*.13,
    material:stoneColors[(i*3+index+Math.floor(random()*4))%stoneColors.length],
    shape:Array.from({length:7},(_,segment)=>{
      const angle=segment*Math.PI*2/7;
      const radius=.81+random()*.18;
      return [Math.cos(angle)*radius,Math.sin(angle)*radius];
    }),
  })));
  const meadows=[[-9,7.85],[-6.9,9.2],[.75,7.2],[3.5,6.4],[9,8.6],[-6.2,1],[2.6,.6],[11.8,5]];
  const flowers=meadows.flatMap(([x,z])=>Array.from({length:9},()=>({
    x:x+(random()-.5)*2.3,z:z+(random()-.5)*1.9,h:.12+random()*.32,color:random(),
  })));
  const seeds=Array.from({length:16},()=>({x:random(),z:random(),phase:random()*6.28,drift:random()}));

  function drawGround(ctx,project,scale,w,h) {
    backdrop(ctx,w,h);
    const grass=ctx.createLinearGradient(0,h*.39,0,h);
    grass.addColorStop(0,'#92ac78');
    grass.addColorStop(.32,'#b7c791');
    grass.addColorStop(.68,'#a8ba7e');
    grass.addColorStop(1,'#6c8d6a');
    const edge=Array.from({length:33},(_,i)=>[-46+i*2.9,-8.3+Math.sin(i*.74)*.52]);
    plane(ctx,project,[...edge,[48,44],[-46,44]],grass);
    const sunPatch=project(-3.4,2.65);
    ctx.save();
    ctx.translate(sunPatch.x,sunPatch.y);
    ctx.rotate(.13);
    ctx.scale(scale*14,scale*4);
    const warm=ctx.createRadialGradient(-.23,-.10,0,0,0,1);
    warm.addColorStop(0,'#f1dc9c8c');
    warm.addColorStop(.55,'#f3dfa54a');
    warm.addColorStop(1,'#f3dfa500');
    oval(ctx,0,0,1,1,warm);
    ctx.restore();
    const lake=project(-19,-3.5);
    oval(ctx,lake.x,lake.y,scale*9.3,scale*1.72,'#7e986e',.037);
    oval(ctx,lake.x-scale*.12,lake.y-scale*.05,scale*8.98,scale*1.57,'#bdc297',.037);
    const water=ctx.createLinearGradient(0,lake.y-scale,0,lake.y+scale*1.4);
    water.addColorStop(0,'#a3c9a8');
    water.addColorStop(.45,'#82b7a9');
    water.addColorStop(1,'#538b85');
    oval(ctx,lake.x-scale*.37,lake.y-scale*.14,scale*8.45,scale*1.22,water,.037);
    for(let i=0;i<9;i++){
      const x=lake.x+(5.7-i*1.4)*scale,y=lake.y+Math.sin(i*2.2)*scale*.53;
      line(ctx,[{x,y},{x:x+scale*(.54+i*.055),y:y+.25}],'#edf3c894',Math.max(.65,scale*.04));
    }
    for(const dot of grassMarks){
      if(dot.z < -7.9 || ((dot.x+19)/9.3)**2+((dot.z+3.5)/4.8)**2<1) continue;
      const p=project(dot.x,dot.z);
      if(p.x<0||p.x>w||p.y<0||p.y>h) continue;
      const radius=scale*(.025+dot.size*.15);
      oval(ctx,p.x,p.y,radius,scale*(.027+dot.size*.033),dot.variant>.79?'#e7e9b37d':dot.variant>.43?'#c9d998a2':'#7fa47354',-.1);
      if(dot.variant>.952) line(ctx,[p,{x:p.x+radius*.6,y:p.y-radius*1.3}],'#789b64a1',Math.max(.65,radius*.38));
    }
    const houseShadow=project(houseSite.x+.9,houseSite.z+1.6);
    softShadow(ctx,houseShadow.x,houseShadow.y,scale*5.6,scale*1.55,.52);
    for(const tree of trees){
      const p=project(tree.x,tree.z);
      softShadow(ctx,p.x+scale*1.22,p.y+scale*.35,scale*tree.size*.81,scale*tree.size*.18,.44);
      for(let i=-2;i<=2;i++){
        softShadow(ctx,p.x+scale*(1.4+i*.39),p.y+scale*(.36+i*.09),
          scale*tree.size*.31,scale*tree.size*.076,.15);
      }
    }
    ctx.save();
    for(const tuft of tufts){
      const point=project(tuft.x,tuft.z);
      const size=tuft.size*scale;
      if(point.x<-size||point.x>w+size||point.y<-size||point.y>h+size) continue;
      ctx.globalAlpha=tuft.alpha;
      ctx.drawImage(tuftArt[tuft.variant],point.x-size*.67,point.y-size*.69,size*1.34,size*.90);
    }
    ctx.restore();
    const trace=path.map(p=>project(p.x,p.z));
    strokeWalkway(ctx,trace,scale*1.75);
    strokeWalkway(ctx,[project(-7,3.9),project(-3.8,3.3),project(-1.4,3),project(4.3,4.55)],scale*.84);
    for(const stone of pavers) paintPaver(ctx,project,stone);
    const paddock=project(7.9,4.7);
    oval(ctx,paddock.x,paddock.y,scale*4.25,scale*1.07,'#c6d59c80',-.009);
    for(const f of flowers){
      const p=project(f.x,f.z);
      const y=p.y-f.h*scale;
      line(ctx,[p,{x:p.x+scale*.036,y}],'#76976c',Math.max(.7,scale*.033));
      oval(ctx,p.x-scale*.054,p.y-scale*f.h*.43,scale*.077,scale*.035,'#9ab080',.5);
      blossom(ctx,p.x+scale*.04,y,scale*(.064+f.color*.022),f.color>.76?'#db967f':f.color>.50?'#b8a7d0':f.color>.26?'#f6ebc6':'#dec480','#bf8263');
    }
  }

  function strokeWalkway(ctx,points,width) {
    line(ctx,points,'#c1b18669',width*1.15);
    line(ctx,points,'#b39f7c',width);
    line(ctx,points,'#c9b58e',width*.81);
  }

  function drawShrub(ctx,project,scale,[x,z,amount,tint],index) {
    const p=project(x,z);
    const size=amount*scale;
    softShadow(ctx,p.x,p.y,size*.85,size*.2);
    const shades=['#7e9d77','#99b087','#adc095'];
    for(const [i,[dx,dy,r]] of [[-.34,-.23,.42],[.36,-.25,.44],[-.22,-.55,.42],[.17,-.57,.49],[.01,-.31,.59]].entries()){
      oval(ctx,p.x+size*dx,p.y+size*dy,size*r,size*r*.72,shades[i%3],-.13);
    }
    for(let i=0;i<8;i++){
      const t=i*2.39+index;
      const spread=.25+(i%4)*.10;
      blossom(ctx,p.x+Math.cos(t)*size*spread,p.y-size*.46+Math.sin(t)*size*spread*.54,
        size*(.075+i%3*.022),tint==='rose'?['#f3c1ba','#e59d9d','#ffdec9'][i%3]:['#f2cca6','#f8dcab','#f9e5be'][i%3],'#c48872');
    }
  }

  function drawFence(ctx,project,scale,[x0,z0,x1,z1]) {
    const steps=Math.ceil(Math.hypot(x1-x0,z1-z0)/1.19);
    for(const elevation of [.31,.63]){
      line(ctx,[project(x0,z0,elevation-.035),project(x1,z1,elevation-.035)],'#81776758',.19*scale);
      line(ctx,[project(x0,z0,elevation),project(x1,z1,elevation)],'#c9a787',.15*scale);
      line(ctx,[project(x0,z0,elevation+.046),project(x1,z1,elevation+.046)],'#ecd2ae',.05*scale);
    }
    for(let i=0;i<=steps;i++){
      const x=x0+(x1-x0)*i/steps,z=z0+(z1-z0)*i/steps;
      const foot=project(x,z);
      oval(ctx,foot.x,foot.y,scale*.18,scale*.069,'#71826742');
      line(ctx,[foot,project(x,z,.89)],'#a6876b',.176*scale);
      line(ctx,[project(x-.045,z,.035),project(x-.045,z,.9)],'#d8ba96',.095*scale);
      const cap=project(x-.024,z,.895);
      oval(ctx,cap.x,cap.y,scale*.072,scale*.045,'#efd6b2');
    }
  }

  function drawBed(ctx,project,scale,bed,time) {
    const l=bed.x-bed.w/2,r=bed.x+bed.w/2,t=bed.z-bed.d/2,b=bed.z+bed.d/2;
    const p=project(bed.x,bed.z);
    softShadow(ctx,p.x+scale*.16,p.y+scale*.085,scale*2.15,scale*.45,.3);
    plane(ctx,project,[[l,b],[r,b],[r,b,.20],[l,b,.20]],'#a37f64');
    plane(ctx,project,[[r,b],[r,t],[r,t,.20],[r,b,.20]],'#b9936c');
    plane(ctx,project,[[l,b,.20],[r,b,.20],[r,t,.20],[l,t,.20]],bed.wateredAt===null?'#b29272':'#907865');
    const rim=[[l,b,.20],[r,b,.20],[r,t,.20],[l,t,.20],[l,b,.20]];
    line(ctx,rim.map(point=>project(...point)),'#ddbc94',scale*.075);
    for(const z of [bed.z-.36,bed.z+.29]){
      line(ctx,[project(l+.27,z+.09,.201),project(r-.27,z+.09,.201)],'#725e4d45',scale*.086);
      for(let index=0;index<4;index++){
        const plant=project(l+.51+index*.72,z,.20);
        Flora.drawFlora(ctx,bed.plant,{x:plant.x,y:plant.y,s:scale*(bed.plant==='rice'?.3:.43),seed:bed.id+index,t:0,wind:0});
        oval(ctx,plant.x-scale*.035,plant.y-scale*(bed.plant==='rice'?.13:.31),scale*.070,scale*.033,'#dce7a77a',-.34);
      }
    }
    const since=bed.wateredAt===null?Infinity:time-bed.wateredAt;
    if(since<.92){
      ctx.save();
      ctx.globalAlpha=1-since/.92;
      for(let i=-2;i<=2;i++){
        const droplet=project(bed.x+i*.38,bed.z+i*.11,.82+Math.sin(since*4+i*.2)*.37);
        oval(ctx,droplet.x,droplet.y,scale*.044,scale*.093,'#b9dce1',-.2);
      }
      ctx.restore();
    }
  }

  function scenery(ctx,project,scale,time) {
    return [
      ...trees.map((tree,i)=>({z:tree.z,paint(){
        const p=project(tree.x,tree.z),size=scale*tree.size;
        ctx.drawImage(treeArt[i],p.x-size*.524,p.y-size*.964,size,size);
      }})),
      ...shrubs.map((shrub,i)=>({z:shrub[1],paint:()=>drawShrub(ctx,project,scale,shrub,i)})),
      ...fenceSections.map(segment=>({z:(segment[1]+segment[3])/2,paint:()=>drawFence(ctx,project,scale,segment)})),
      ...garden.map(bed=>({z:bed.z+.4,paint:()=>drawBed(ctx,project,scale,bed,time)})),
    ];
  }

  function ambience(ctx,w,h,time,still) {
    ctx.save();
    for(const dot of seeds){
      const x=w*((dot.x+(still?0:time*.008))%1);
      const y=h*(.33+dot.z*.52)+(still?0:Math.sin(time*.73+dot.phase)*7);
      ctx.globalAlpha=.26+dot.drift*.3;
      oval(ctx,x,y,1.05+dot.drift*1.52,.76+dot.drift*.73,'#fff2d1',-.34);
    }
    ctx.restore();
  }

  function blocked(x,z,house,site=houseSite,
    volumes=house?[{x:0,z:0,width:house.width,depth:house.depth}]:[]) {
    const insideHouse=volumes.some(volume=>
      Math.abs(x-site.x-volume.x)<volume.width/2+.19 &&
      Math.abs(z-site.z-volume.z)<volume.depth/2+.19);
    const insideBed=garden.some(bed=>Math.abs(x-bed.x)<bed.w/2+.17&&Math.abs(z-bed.z)<bed.d/2+.13);
    const insideFence=fenceSections.some(([x0,z0,x1,z1])=>(
      x>=Math.min(x0,x1)-.22 && x<=Math.max(x0,x1)+.22 &&
      z>=Math.min(z0,z1)-.22 && z<=Math.max(z0,z1)+.22
    ));
    return insideHouse||insideBed||insideFence||streetBlocks(x,z);
  }
  function water(player,time) {
    if(!garden.length)return null;
    const nearby=garden.reduce((best,bed)=>Math.hypot(bed.x-player.x,bed.z-player.z)<
      Math.hypot(best.x-player.x,best.z-player.z)?bed:best);
    if(Math.hypot(nearby.x-player.x,nearby.z-player.z)>4) return null;
    nearby.wateredAt=time;
    return nearby.label;
  }
  return {drawGround,scenery,ambience,blocked,water,describe:()=>garden.map(bed=>({...bed}))};
}
