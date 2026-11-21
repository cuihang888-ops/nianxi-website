import Houses from '../../src/open-world/vendor/houses.cjs';

const KX = .62;
const KY = .34;
const productData = {
  grand_estate:{paidTier:'legendary',floorPlan:'U形合院',silhouette:'前门楼+正厅+双厢房',experience:'沿中轴穿过前庭，在水钵边歇息后进入正厅，左右院落都可漫步。',expansion:'可追加后花园、客房与观景廊。'},
  landlord:{paidTier:'premium',floorPlan:'轴线庄院',silhouette:'主屋+双侧仓棚+晒谷场',experience:'从宽门进入晒场，收粮、整理农具，再回主屋休息。',expansion:'可追加谷仓、牲畜棚与作坊。'},
  official:{paidTier:'prestige',floorPlan:'中轴礼院',silhouette:'门楼+正堂+对称亭廊',experience:'通过仪式门楼进入前庭，在两侧凉亭和中轴正堂之间游走。',expansion:'可追加石灯路、书房与后院。'},
  merchant:{paidTier:'premium',floorPlan:'窄面深进',silhouette:'高层铺面+连续雨棚',experience:'门前檐下摆摊，穿过铺面进入后部起居空间。',expansion:'可追加货架、仓房与二层阳台。'},
  lumber_cabin:{paidTier:'starter',floorPlan:'偏置小屋',silhouette:'矮木屋+偏门廊+烟囱',experience:'推门就是小院，花箱、柴堆和烟囱构成安静的林间角落。',expansion:'可追加柴棚、菜畦与小露台。'},
  simple_shed:{paidTier:'free',floorPlan:'单间敞棚',silhouette:'低矮草棚+单侧斜檐',experience:'一张床、一只凳子和半开放门廊，适合最初安家。',expansion:'可追加侧棚、储物架与篱笆。'},
};const choices = [
  {id:'lumber_cabin',name:'林间木屋',role:'平民',description:'一层木石住宅，窗前有花箱，进门只需迈过一阶石台。',tier:0,base:.25,approachDepth:.85},
  {id:'brick_dai',name:'红瓦小楼',description:'红瓦、浅色砖墙和二楼阳台。',tier:0,base:.14,approachDepth:.85},
  {id:'myanmar_villa',name:'金顶院落',description:'浅墙红瓦，穿过院门就是家门。',tier:0,base:.14,approachDepth:2.15},
  {id:'dai_stilt',name:'傣家竹楼',description:'传统高脚竹楼，从前梯上晒台。',tier:0,raised:true,approachDepth:3.15},
];

const existingHouses = choices.map(choice => {
  const style = Houses.STYLE_MAP[choice.id];
  const {w:width,d:depth} = style.footprint;
  const {stilt} = Houses.resolveParams(style,choice.tier);
  const door = Object.freeze({x:0,z:depth/2,y:choice.raised ? stilt : choice.base,width:.95,height:choice.raised ? 1.78 : 1.73});
  const approach = Object.freeze({x:choice.id === 'myanmar_villa' ? width * -.03 : 0,z:depth/2+choice.approachDepth});
  return Object.freeze({...choice,width,depth,door,approach,raised:Boolean(choice.raised),artworkStilt:stilt,product:productData[choice.id]});
});

const newHouses = [
  {id:'grand_estate', name:'望林大宅', role:'顶级大户', width:12.4, depth:9, doorWidth:2.45, court:true,
    description:'前门、前庭和后面的正厅排成一线，两侧是厢房。'},
  {id:'landlord', name:'丰谷庄', role:'地主', width:10.5, depth:8, doorWidth:2.7, court:true,
    description:'谷仓、农具棚和晒谷场围着庄院，粮车可以从宽门进出。'},
  {id:'official', name:'清和府', role:'官员', width:10.4, depth:8.3, doorWidth:2.2, court:true,
    description:'青瓦门楼、石灯和礼仪前庭，沿中轴走到正堂。'},
  {id:'merchant', name:'街边铺宅', role:'商人', width:6.6, depth:5.9, doorWidth:1.15,
    description:'街边檐下摆货，进门是铺面，楼上是住处。'},
  {id:'simple_shed', name:'竹木草棚', role:'简陋棚子', width:3.35, depth:2.65, doorWidth:1.06, base:.10,
    description:'竹木撑起草顶，屋里有床铺，门口可以避雨。'},
].map(choice => Object.freeze({
  ...choice,
  raised:false,
  product:productData[choice.id],
  door:Object.freeze({x:0,z:choice.depth/2,y:choice.base??.14,width:choice.doorWidth,height:choice.court?2.7:1.96}),
  approach:Object.freeze({x:0,z:choice.depth/2+.65}),
}));

export const heritageHouses = Object.freeze(existingHouses.slice(1));
export const primaryHouses = Object.freeze([...newHouses.slice(0,4),existingHouses[0],newHouses[4]]);
export const houseChoices = Object.freeze([...primaryHouses,...heritageHouses]);

export function houseAnchor(house, site) {
  return house.role && house.id!=='lumber_cabin'
    ? {x:site.x,z:site.z+2-house.depth/2}
    : site;
}

const designs = {
  lumber_cabin:{roof:['#b0baa0','#758c79','#4b665a','#455e55'],walls:['#e7cd9e','#b39269','#ae8e6a'],stone:['#d7c4a7','#a88f72','#b7a586'],crest:5.07,curve:.24,sweep:.19,kind:'timber',trim:'#885e43',width:.66,tile:.47},
  brick_dai:{roof:['#e4a28b','#bf7e68','#975b53','#754a45'],walls:['#eedac0','#c8ad94','#c0a38d'],stone:['#e3cdb3','#b19b86','#cdb49e'],crest:6.99,curve:.29,sweep:.25,kind:'plaster',trim:'#956c55',width:.62,tile:.44},
  myanmar_villa:{roof:['#e4ad8e','#c28168','#a26155','#81534b'],walls:['#f1dfbe','#cdb795','#bfa587'],stone:['#e2caa6','#b39a74','#c2a785'],crest:7.83,curve:.61,sweep:.62,kind:'plaster',trim:'#9b7558',width:.68,tile:.46},
  dai_stilt:{roof:['#9fb4a1','#657f78','#4a6261','#394e51'],walls:['#e7cf9c','#c19a67','#aa865c'],stone:['#c4ad80','#927658','#a58966'],crest:7.05,curve:.59,sweep:.76,kind:'bamboo',trim:'#876544',width:.57,tile:.47},
};
const clamp = (value,low,high)=>Math.min(high,Math.max(low,value));
const blend = (a,b,t) => {
  const start=parseInt(a.slice(1),16), end=parseInt(b.slice(1),16);
  const channel=shift=>Math.round((start>>shift&255)*(1-t)+(end>>shift&255)*t);
  return 'rgb('+channel(16)+','+channel(8)+','+channel(0)+')';
};
function randomFrom(seed){
  let value=seed;
  return ()=>{
    value=(Math.imul(1664525,value)+1013904223)>>>0;
    return value/4294967296;
  };
}
function path(ctx,points,rounded=0) {
  ctx.beginPath();
  for(let i=0;i<points.length;i++){
    const [x,y]=points[i];
    if(!rounded){
      if(i===0)ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
      continue;
    }
    const previous=points[(i+points.length-1)%points.length];
    const next=points[(i+1)%points.length];
    const tangent=target=>{
      const distance=Math.hypot(target[0]-x,target[1]-y);
      const mix=distance ? Math.min(.34,rounded/distance) : 0;
      return [x+(target[0]-x)*mix,y+(target[1]-y)*mix];
    };
    const a=tangent(previous),b=tangent(next);
    if(i===0)ctx.moveTo(...a);
    else ctx.lineTo(...a);
    ctx.quadraticCurveTo(x,y,...b);
  }
  ctx.closePath();
}
function fill(ctx,points,color,rounded=0){
  path(ctx,points,rounded);
  ctx.fillStyle=color;
  ctx.fill();
}
function stroke(ctx,points,color,width){
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for(const point of points.slice(1))ctx.lineTo(...point);
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.stroke();
}
function gradient(ctx,top,bottom,light,dark){
  const fade=ctx.createLinearGradient(0,top,0,bottom);
  fade.addColorStop(0,light);
  fade.addColorStop(1,dark);
  return fade;
}
function ellipse(ctx,x,y,rx,ry,color,angle=0){
  ctx.beginPath();
  ctx.ellipse(x,y,rx,ry,angle,0,Math.PI*2);
  ctx.fillStyle=color;
  ctx.fill();
}
function frontArch(ctx,x,bottom,width,height){
  const side=width/2, curve=Math.min(side,height*.45);
  const top=bottom-height;
  ctx.beginPath();
  ctx.moveTo(x-side,bottom);
  ctx.lineTo(x-side,top+curve);
  ctx.bezierCurveTo(x-side,top+curve*.4,x-side*.52,top,x,top);
  ctx.bezierCurveTo(x+side*.55,top,x+side,top+curve*.42,x+side,top+curve);
  ctx.lineTo(x+side,bottom);
  ctx.closePath();
}
function drawOpening(ctx,x,bottom,width,height,trim,door=false){
  frontArch(ctx,x,bottom+.015,width+.15,height+.09);
  ctx.fillStyle=door ? '#c29c72' : '#e3c5a3';
  ctx.fill();
  frontArch(ctx,x,bottom,width,height);
  ctx.fillStyle=door ? '#573d32' : '#62665c';
  ctx.fill();
  ctx.save();
  frontArch(ctx,x-.018,bottom-.04,width-.08,height-.12);
  ctx.clip();
  ctx.fillStyle=door ? gradient(ctx,bottom-height,bottom,'#9e7754','#654839') : gradient(ctx,bottom-height,bottom,'#657f76','#ead197');
  ctx.fillRect(x-width/2,bottom-height,width,height+.02);
  if(door){
    for(let column=-1;column<=1;column++) stroke(ctx,[[x+column*.16-.035,bottom-height],[x+column*.16-.035,bottom]],'#604633',.025);
    stroke(ctx,[[x-width/2,bottom-.31],[x+width/2,bottom-.31]],'#9d7958',.06);
    ellipse(ctx,x+width*.28,bottom-height*.44,.045,.035,'#e5be78');
  }else{
    fill(ctx,[[x-width*.36,bottom-height*.64],[x+width*.12,bottom-height*.84],[x-width*.16,bottom-height*.46],[x-width*.37,bottom-height*.47]],'#fff1c46f',.05);
    stroke(ctx,[[x-width/2,bottom-height*.48],[x+width/2,bottom-height*.48]],trim,.052);
    stroke(ctx,[[x,bottom-height],[x,bottom]],trim,.046);
  }
  ctx.restore();
  if(!door)stroke(ctx,[[x-width/2-.02,bottom+.035],[x+width/2+.02,bottom+.035]],'#c9a27b',.069);
}
function drawMasonry(ctx,project,x0,x1,face,base,top,colors,random){
  const points=[project(x0,face,base),project(x1,face,base),project(x1,face,top),project(x0,face,top)];
  ctx.save();
  path(ctx,points,.08);
  ctx.clip();
  fill(ctx,points,colors[1]);
  const rows=Math.ceil((top-base)/.22);
  for(let row=0;row<rows;row++){
    const y=base+(top-base)*row/rows;
    const end=base+(top-base)*(row+1)/rows;
    for(let x=x0-(row%2)*.28;x<x1;){
      const length=.26+random()*.38;
      const next=x+length;
      const tint=blend(colors[0],colors[2],random()*.7);
      fill(ctx,[project(x+.013,face,y+.013),project(next-.015,face,y+.018),project(next-.025,face,end-.018),project(x+.02,face,end-.013)],tint,.055);
      x=next;
    }
  }
  ctx.restore();
}
function drawHouseWalls(ctx,house,design,project,wallTop,random){
  const half=house.width/2,face=house.depth/2,base=house.door.y;
  const rounded=.12;
  const side=[project(half,face,base),project(half,-face,base),project(half,-face,wallTop),project(half,face,wallTop)];
  fill(ctx,side,gradient(ctx,side[2][1],side[0][1],design.walls[1],design.walls[2]),rounded);
  if(design.kind!=='plaster'){
    ctx.save();
    path(ctx,side,rounded);
    ctx.clip();
    for(let row=base+.21;row<wallTop;row+=.22){
      stroke(ctx,[project(half,face,row),project(half,-face,row)],'#765f4a75',.023);
      stroke(ctx,[project(half,face,row+.031),project(half,-face,row+.031)],'#f7e1ae34',.024);
    }
    ctx.restore();
  }
  const facade=[project(-half,face,base),project(half,face,base),project(half,face,wallTop),project(-half,face,wallTop)];
  const frontFill=ctx.createLinearGradient(facade[0][0],facade[2][1],facade[1][0],facade[0][1]);
  frontFill.addColorStop(0,design.walls[0]);
  frontFill.addColorStop(.57,design.walls[0]);
  frontFill.addColorStop(1,design.walls[1]);
  fill(ctx,facade,frontFill,rounded);
  ctx.save();
  path(ctx,facade,rounded);
  ctx.clip();
  for(let i=0;i<105;i++){
    const x=(random()-.5)*house.width;
    const height=base+(wallTop-base)*random();
    const [px,py]=project(x,face,height);
    ellipse(ctx,px,py,.035+random()*.105,.016+random()*.036,i%5?'#ebd4aa48':'#9d78573c',.05);
  }
  if(design.kind!=='plaster'){
    for(let row=base+.21;row<wallTop;row+=.22){
      const left=project(-half,face,row),right=project(half,face,row);
      ctx.beginPath();
      ctx.moveTo(...left);
      ctx.bezierCurveTo(left[0]+house.width*.25,left[1]-.045,left[0]+house.width*.74,left[1]+.036,...right);
      ctx.strokeStyle='#8967466c';
      ctx.lineWidth=.028;
      ctx.stroke();
    }
    for(const x of [-half+.12,half-.10]) stroke(ctx,[project(x,face,base),project(x,face,wallTop)],design.trim,.15);
  }
  ctx.restore();
  if(!house.raised){
    fill(ctx,[project(half,face,0),project(half,-face,0),project(half,-face,base),project(half,face,base)],design.stone[1],.055);
    drawMasonry(ctx,project,-half,half,face,0,base,design.stone,random);
  }
  if(!house.raised){
    const stoneTop=base+(design.kind==='timber' ? .38 : .46);
    drawMasonry(ctx,project,-half,half,face,base,stoneTop,design.stone,random);
    for(const x of [-half+.14,half-.14]){
      const stoneEdge = design.kind === 'timber' ? stoneTop+.40 : wallTop-.36;
      for(let row=stoneTop+.25; row<stoneEdge;row+=.38){
        const width=(Math.round(row*3)%2?.15:.24);
        const start=project(x-width,face,row);
        const end=project(x+width,face,row+.23);
        fill(ctx,[[start[0],start[1]],[end[0],start[1]],[end[0],end[1]],[start[0],end[1]]],'#bc9c7952',.045);
      }
    }
  }
}

function drawRoof(ctx,house,design,project,wallTop,random){
  const half=house.width/2,front=house.depth/2+.70;
  const span=half+.71;
  const {crest,curve,sweep}=design;
  function tilePoint(u,t,direction=1){
    const vertical=crest+(wallTop-.025-crest)*t-curve*Math.sin(Math.PI*t);
    const width=span+.08*t;
    const lift=sweep*(Math.abs(u)**3)*(.24+.76*t);
    const lean = house.id === 'lumber_cabin' ? u*.18*(1-t)-.09*Math.sin(Math.PI*t) : 0;
    return project(width*u,front*t*direction,vertical+lift+lean);
  }

  const end=Array.from({length:9},(_,i)=>tilePoint(1,1-i/8));
  const farEnd=Array.from({length:8},(_,i)=>tilePoint(1,(i+1)/8,-1));
  const visibleEnd=[...end,...farEnd,project(half,-house.depth/2,wallTop-.06),project(half,house.depth/2,wallTop-.06)];
  fill(ctx,visibleEnd,gradient(ctx,visibleEnd[8][1],visibleEnd[0][1],design.walls[1],design.walls[2]),.06);
  for(let row=wallTop+.17;row<crest-.22;row+=.23){
    const limit=house.depth/2*clamp((crest-row)/(crest-wallTop),0,1);
    stroke(ctx,[project(half,limit,row),project(half,-limit,row)],'#715d5150',.025);
  }
  const fascia=[...end,...farEnd];
  stroke(ctx,fascia,design.roof[3],.145);
  stroke(ctx,fascia,design.roof[0],.034);

  const eave=Array.from({length:15},(_,i)=>tilePoint(-1+2*i/14,1));
  const ridge=Array.from({length:15},(_,i)=>tilePoint(1-2*i/14,0));
  const leftEnd=Array.from({length:8},(_,i)=>tilePoint(-1,(i+1)/9));
  const outline=[...eave,...end.slice(1),...ridge.slice(1),...leftEnd];
  const roof=ctx.createLinearGradient(0,ridge[7][1],0,eave[7][1]);
  roof.addColorStop(0,design.roof[0]);
  roof.addColorStop(.55,design.roof[1]);
  roof.addColorStop(1,design.roof[2]);
  fill(ctx,outline,roof,.06);
  ctx.save();
  path(ctx,outline,.05);
  ctx.clip();
  const rows=11;
  const rowSpacing=design.tile/span;
  for(let row=0;row<rows;row++){
    const base=row/rows,top=(row+1)/rows;
    for(let column=-1-(row%2)*rowSpacing*.5;column<1;column+=rowSpacing){
      const left=column+.007;
      const right=column+rowSpacing-.007;
      const variation=random()*.8;
      const start=tilePoint(left,base),rightTop=tilePoint(right,base);
      const endRight=tilePoint(right,top-.007),endLeft=tilePoint(left,top-.003);
      const tileColor=blend(design.roof[0],design.roof[2],clamp(.21+top*.43+(variation-.4)*.42,0,1));
      fill(ctx,[start,rightTop,endRight,tilePoint((left+right)/2,top+.017),endLeft],tileColor,.065);
      stroke(ctx,[endLeft,tilePoint((left+right)/2,top+.012),endRight],design.roof[3],.025);
      if(variation>.55)stroke(ctx,[tilePoint(left+.014,base+.026),tilePoint(right-.014,base+.026)],'#fff1bf39',.023);
    }
  }
  ctx.restore();
  stroke(ctx,eave,design.roof[3],.148);
  stroke(ctx,eave.map(([x,y])=>[x,y-.055]),design.roof[0],.037);
  stroke(ctx,ridge,design.roof[3],.174);
  stroke(ctx,ridge.map(([x,y])=>[x,y-.04]),design.roof[0],.049);
}
function drawPorch(ctx,left,right,inner,outer,level,project,colors,start=0){
  fill(ctx,[project(left,outer,start),project(right,outer,start),project(right,outer,level),project(left,outer,level)],colors[1],.04);
  fill(ctx,[project(right,outer,start),project(right,inner,start),project(right,inner,level),project(right,outer,level)],colors[2],.04);
  fill(ctx,[project(left,outer,level),project(right,outer,level),project(right,inner,level),project(left,inner,level)],colors[0],.07);
}
function drawPlant(ctx,x,y,scale,random,flowers=true){
  for(let i=0;i<13;i++){
    const angle=(random()-.5)*2;
    const height=(.38+random()*.62)*scale;
    const dx=angle*height*.59;
    const tip=[x+dx,y-height];
    stroke(ctx,[[x,y],[x+dx*.40,y-height*.53],tip],i%2?'#68794d':'#84925b',.032*scale);
    ellipse(ctx,x+dx*.75-.035,y-height*.7,.12*scale,.047*scale,i%2?'#87935c':'#a6a678',angle-.62);
    ellipse(ctx,x+dx*.69+.058,y-height*.52,.12*scale,.051*scale,i%2?'#879561':'#71875c',angle+.64);
    if(flowers && i%2===0){
      ellipse(ctx,tip[0],tip[1],.11*scale,.071*scale,i%4?'#efbb9b':'#ebc891',angle);
      ellipse(ctx,tip[0]-.03*scale,tip[1]-.024*scale,.043*scale,.033*scale,'#fff0c9',angle);
    }
  }
}
function drawWindowBox(ctx,x,y,width,random){
  fill(ctx,[[x-width*.58,y-.046],[x+width*.58,y-.046],[x+width*.47,y+.14],[x-width*.49,y+.14]],'#9c7353',.04);
  stroke(ctx,[[x-width*.59,y-.045],[x+width*.59,y-.045]],'#c89367',.054);
  drawPlant(ctx,x-.025,y-.025,width*.57,random);
}
function drawChimney(ctx,project,house,design,wallTop,random){
  const half=house.width*.5,x=half*.43,z=-.28;
  const base=wallTop+.44,top=design.crest+.67;
  const left=x-.3,right=x+.26;
  const front=project(left,z,top), back=project(right,z-.52,top);
  fill(ctx,[project(right,z,base),project(right,z-.52,base),back,project(right,z,top)],'#9b8268',.04);
  drawMasonry(ctx,project,left,right,z,base,top,design.stone,random);
  fill(ctx,[project(left-.05,z+.06,top),project(right+.05,z+.06,top),project(right+.05,z-.58,top),project(left-.05,z-.58,top)],'#c4ad8d',.04);
  ellipse(ctx,(front[0]+back[0])*.5,(front[1]+back[1])*.5,.15,.045,'#736655',-.15);
}
function drawCarvedTips(ctx,project,house,design,upper){
  const roofEdge=house.width*.5+.69;
  for(const side of [-1,1]){
    const [x,y]=project(roofEdge*side,0,upper+.15);
    ctx.beginPath();
    ctx.moveTo(x-side*.14,y+.12);
    ctx.quadraticCurveTo(x+side*.16,y-.02,x+side*.20,y-.34);
    ctx.quadraticCurveTo(x+side*.27,y-.65,x+side*.43,y-.58);
    ctx.strokeStyle=design.roof[3];
    ctx.lineWidth=.08;
    ctx.stroke();
    ellipse(ctx,x+side*.43,y-.58,.055,.047,'#ddab69');
  }
}
function drawFront(ctx,house,design,project,wallTop,random){
  const {door,width,depth}=house,face=depth/2;
  const double=house.id==='brick_dai'||house.id==='myanmar_villa';
  const villa=house.id==='myanmar_villa';
  const cottage=house.id==='lumber_cabin';

  if(house.raised){
    const deck=face+1.02;
    drawPorch(ctx,-width/2-.11,width/2+.11,face,deck,door.y,project,['#bd9b6f','#8f6f50','#766447'],door.y-.18);
    for(const x of [-width*.32,width*.32]) drawPorch(ctx,x-.09,x+.09,deck-.20,deck-.03,door.y,project,['#9c7652','#896648','#65523d']);
    for(const sign of [-1,1]){
      const a=sign*.66,b=sign*(width/2-.12);
      stroke(ctx,[project(a,deck,door.y+.61),project(b,deck,door.y+.61)],'#a68457',.105);
      for(let i=0;i<=5;i++){
        const x=a+(b-a)*i/5;
        stroke(ctx,[project(x,deck,door.y),project(x,deck,door.y+.62)],'#b59464',.050);
      }
    }
    for(let i=0;i<6;i++){
      const z=deck+i*.30;
      drawPorch(ctx,-.58,.58,z,z+.30,door.y*(6-i)/6,project,['#bc9a70','#8f6c50','#74634d'],Math.max(0,door.y*(6-i)/6-.34));
    }
  }else{
    drawPorch(ctx,-.69,.69,face,face+.36,Math.min(.12,door.y),project,design.stone);
  }

  const [doorX,doorY]=project(0,face,door.y);
  drawOpening(ctx,doorX,doorY,door.width,door.height,design.trim,true);

  const [shutterX,shutterY]=project(width/2,-depth*.08,door.y+1.59);
  const windowSlope=KY/KX;
  const sidePoint=(offset,elevation)=>[shutterX+offset,shutterY-offset*windowSlope-elevation];
  fill(ctx,[sidePoint(-.4,-.64),sidePoint(.34,-.65),sidePoint(.34,.055),sidePoint(-.41,.06)],'#a4896c',.06);
  fill(ctx,[sidePoint(-.33,-.56),sidePoint(.26,-.56),sidePoint(.26,-.03),sidePoint(-.34,-.03)],'#7c8879',.05);
  fill(ctx,[sidePoint(-.26,-.53),sidePoint(.20,-.52),sidePoint(.2,-.28),sidePoint(-.27,-.29)],'#cab68d',.025);
  stroke(ctx,[sidePoint(-.31,-.34),sidePoint(.23,-.34)],design.trim,.035);
  stroke(ctx,[sidePoint(-.035,-.56),sidePoint(-.035,-.046)],design.trim,.038);
  stroke(ctx,[sidePoint(-.45,-.68),sidePoint(.35,-.68)],'#c9a67c',.07);
  for(const side of [-1,1]){
    const [x,bottom]=project(side*width*.30,face,door.y+.95);
    drawOpening(ctx,x,bottom,design.width,.86,design.trim);
    if(cottage||house.raised) drawWindowBox(ctx,x,bottom+.10,design.width,random);
  }

  if(double){
    const base=door.y+2.62;
    for(const portion of [-.28,0,.28]){
      const [x,bottom]=project(portion*width,face,base+.62);
      drawOpening(ctx,x,bottom,design.width*.92,.84,design.trim);
      if(villa&&portion) drawWindowBox(ctx,x,bottom+.08,design.width,random);
    }
    if(!villa){
      const balcony=face+.48;
      const a=project(-width*.34,balcony,base),b=project(width*.34,balcony,base);
      fill(ctx,[a,b,project(width*.34,face,base),project(-width*.34,face,base)],'#d0ae8b',.04);
      stroke(ctx,[a,b],'#a98869',.14);
      for(let index=0;index<13;index++){
        const x=-width*.32+index*width*.64/12;
        stroke(ctx,[project(x,balcony,base),project(x,balcony,base+.53)],'#d4b996',.044);
      }
      stroke(ctx,[project(-width*.35,balcony,base+.54),project(width*.35,balcony,base+.54)],'#d7b993',.086);
      drawPlant(ctx,...project(width*.29,balcony,base+.045),.35,random);
      drawPlant(ctx,...project(-width*.29,balcony,base+.045),.39,random);
    }
  }

  if(cottage){
    const hoodHalf=.92,hoodZ=face+.30,shoulder=door.y+1.94;
    const crown=project(.07,face-.06,shoulder+.55);
    const hood=[project(-hoodHalf,hoodZ,shoulder),crown,project(hoodHalf,hoodZ,shoulder)];
    fill(ctx,[...hood,project(hoodHalf,hoodZ+.08,shoulder-.10),project(-hoodHalf,hoodZ+.08,shoulder-.10)],design.roof[2],.09);
    stroke(ctx,hood,design.roof[0],.058);
    stroke(ctx,[project(-.76,face+.15,door.y+1.65),project(-.86,hoodZ,shoulder)],'#836449',.065);
    stroke(ctx,[project(.76,face+.15,door.y+1.65),project(.86,hoodZ,shoulder)],'#836449',.065);
    drawPlant(ctx,...project(-width*.48,face+.065,.035),1.06,random);
    drawPlant(ctx,...project(width*.49,face+.064,.025),.79,random);
  }
  const [lampX,lampY]=project(.73,face,door.y+1.52);
  stroke(ctx,[[lampX-.06,lampY-.14],[lampX+.09,lampY-.14],[lampX+.09,lampY-.03]],'#7f6552',.045);
  ellipse(ctx,lampX+.084,lampY+.12,.115,.131,'#976848');
  ellipse(ctx,lampX+.082,lampY+.115,.076,.088,'#f3c47b');
  ellipse(ctx,lampX+.082,lampY+.115,.045,.054,'#f8dca3');

  if(villa){
    const front=face+1.70;
    const gateX=house.approach.x;
    const cap=.71;
    for(const [a,b] of [[-width/2,gateX-.72],[gateX+.72,width/2]]){
      drawMasonry(ctx,project,a,b,front,0,cap,design.stone,random);
      stroke(ctx,[project(a,front,cap),project(b,front,cap)],'#cbaf85',.085);
    }
    for(const side of [-1,1]){
      const x=gateX+side*.68;
      drawMasonry(ctx,project,x-.13,x+.13,front,0,1.46,design.stone,random);
      drawPlant(ctx,...project(x+side*.39,front-.04,cap+.018),.65,random);
    }
    fill(ctx,[project(gateX-.99,front+.19,1.48),project(gateX+.98,front+.19,1.48),
      project(gateX+.87,front-.24,1.83),project(gateX-.91,front-.24,1.83)],design.roof[1],.11);
    stroke(ctx,[project(gateX-1,front+.19,1.48),project(gateX+1,front+.19,1.48)],design.roof[3],.08);
  }
}
const sprites = new Map();

export function drawModuleHouse(ctx,styleId,{x,y,scale}) {
  const house=existingHouses.find(choice=>choice.id===styleId)??existingHouses[0];
  const document=ctx.canvas?.ownerDocument;
  if(!document){
    paintHouse(ctx,house,{x,y,scale});
    return;
  }
  let sprite=sprites.get(house.id);
  if(!sprite){
    const density=56,halfWidth=house.width/2+(house.depth/2+2.4)*KX+1.1;
    const upper=designs[house.id].crest+2.1,lower=(house.approach.z+.65)*KY+.5;
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(2*halfWidth*density);
    canvas.height=Math.ceil((upper+lower)*density);
    paintHouse(canvas.getContext('2d'),house,{x:halfWidth*density,y:upper*density,scale:density});
    sprite={canvas,halfWidth,upper,density};
    sprites.set(house.id,sprite);
  }
  ctx.drawImage(sprite.canvas,x-sprite.halfWidth*scale,y-sprite.upper*scale,
    sprite.canvas.width*scale/sprite.density,sprite.canvas.height*scale/sprite.density);
}

function paintHouse(ctx,house,{x,y,scale}){
  const design=designs[house.id],half=house.width/2,face=house.depth/2;
  const {door}=house;
  const {storeys}=Houses.resolveParams(Houses.STYLE_MAP[house.id],house.tier);
  const wallTop=door.y+2.55*storeys;
  const random=randomFrom(Houses.variantFor(house.id,house.tier,'module-yard'));
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.lineJoin='round';
  ctx.lineCap='round';
  const project=(wx,wz,elevation)=>[wx-wz*KX,wz*KY-elevation];
  if(house.raised){
    for(const postX of [-half+.2,0,half-.2]){
      for(const z of [-face+.18,face-.12]){
        drawPorch(ctx,postX-.115,postX+.115,z-.085,z+.112,door.y,project,['#c7a477','#a98460','#7e694f']);
      }
    }
    stroke(ctx,[project(-half,face,door.y-.08),project(half,face,door.y-.08)],'#8d7854',.145);
  }
  drawHouseWalls(ctx,house,design,project,wallTop,random);
  drawRoof(ctx,house,design,project,wallTop,random);
  drawFront(ctx,house,design,project,wallTop,random);
  if(house.id==='lumber_cabin'){
    drawChimney(ctx,project,house,design,wallTop,random);
  }
  if(house.id==='myanmar_villa'){
    const [goldX,goldY]=project(0,0,design.crest);
    fill(ctx,[[goldX-.33,goldY+.035],[goldX+.31,goldY+.035],[goldX+.21,goldY-.18],[goldX-.21,goldY-.18]],'#d2ad65',.045);
    stroke(ctx,[[goldX,goldY-.14],[goldX,goldY-.67]],'#d7b775',.11);
    ellipse(ctx,goldX,goldY-.70,.092,.105,'#f3d493');
  }
  if(house.raised||house.id==='myanmar_villa')drawCarvedTips(ctx,project,house,design,design.crest);
  ctx.restore();
}
