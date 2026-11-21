import Avatar from '../../src/open-world/vendor/avatar.cjs';

export const people = Object.freeze([
  {id:'daiGirl',name:'傣家姑娘',coat:'#bd655c',trim:'#efb280',lower:'#53506b',hair:'#3c2b2c',shoes:'#865143',background:'#c79986'},
  {id:'daiBoy',name:'傣家少年',coat:'#e2c595',trim:'#568477',lower:'#43645e',hair:'#382e28',shoes:'#745444',background:'#a0b18c'},
  {id:'fairYouth',name:'小院帮手',coat:'#66838e',trim:'#d8a561',lower:'#4e6376',hair:'#6e4832',shoes:'#dfc6a5',background:'#8aa7a0'},
]);

const catalog = Avatar.catalog();
const frameSize = 128;
const spriteHeight = 161;
const feetX = frameSize / 2;
const feetY = 146;
const adultHeight = 1.65;
const tau = Math.PI * 2;

function tint(color, amount) {
  const to = amount > 0 ? [255,244,218] : [42,30,37];
  const rgb = [1,3,5].map((i,j) => {
    const from = parseInt(color.slice(i,i+2),16);
    return Math.round(from+(to[j]-from)*Math.abs(amount));
  });
  return 'rgb('+rgb.join(',')+')';
}

function material(ctx,color,x,y,sx,sy) {
  const gradient = ctx.createLinearGradient(x,y,x+sx,y+sy);
  gradient.addColorStop(0,tint(color,.54));
  gradient.addColorStop(.34,tint(color,.15));
  gradient.addColorStop(.68,color);
  gradient.addColorStop(1,tint(color,-.48));
  return gradient;
}

function ellipse(ctx,x,y,rx,ry,fill,angle=0) {
  ctx.beginPath();
  ctx.ellipse(x,y,rx,ry,angle,0,tau);
  ctx.fillStyle=fill;
  ctx.fill();
}

function stroke(ctx,points,width,color) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  if(points.length===3) ctx.quadraticCurveTo(...points[1],...points[2]);
  else ctx.lineTo(...points[1]);
  ctx.lineWidth=width;
  ctx.strokeStyle=color;
  ctx.stroke();
}

function speckle(ctx,x,y,width,height,count,dark) {
  let seed=65739;
  const random=()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  };
  for(let i=0;i<count;i++){
    const tx=x+random()*width,ty=y+random()*height;
    ellipse(ctx,tx,ty,.0019+random()*.002,.0018,i%3?dark:'#fff7dc33',-.3);
  }
}

function drawFoot(ctx,look,x,y,step,side,far) {
  const pants=far?tint(look.lower,-.26):material(ctx,look.lower,x-.04,-.31,.10,.27);
  const toe=side?.027:0;
  stroke(ctx,[[x-step*.62,-.4],[x-step*.30,-.22],[x+step,y-.052]],.088,pants);
  const shoe=far?tint(look.shoes,-.24):material(ctx,look.shoes,x+step-.044,y-.058,.09,.064);
  ellipse(ctx,x+step+toe,y-.026,side?.079:.060,.025,tint(look.shoes,-.43));
  ellipse(ctx,x+step+toe,y-.042,side?.075:.056,.028,shoe,-.04);
  stroke(ctx,[[x+step+toe-.023,y-.052],[x+step+toe+.012,y-.063],[x+step+toe+.034,y-.05]],.006,'#fff2d94a');
}

function drawSleeve(ctx,look,shoulder,hand,y,far) {
  const arm=far?tint(look.coat,-.29):material(ctx,look.coat,shoulder-.046,-.61,.095,.125);
  const skin=far?tint(look.skin,-.26):material(ctx,look.skin,hand-.035,y-.035,.055,.078);
  stroke(ctx,[[shoulder,-.606],[hand,-.533],[hand,y-.016]],.076,arm);
  ellipse(ctx,hand,y,.031,.040,skin,hand>0?.13:-.13);
  stroke(ctx,[[hand-.028,y-.028],[hand,y-.015],[hand+.026,y-.025]],look.id==='daiBoy'?.016:.008,tint(look.trim,-.08));
}

function drawClothes(ctx,look,side,back,shoulder,hip,stride) {
  const mid=side?.012:0;
  const cloth=material(ctx,look.coat,mid-shoulder,-.655,.285,.34);
  ctx.beginPath();
  ctx.moveTo(mid-hip-.016,-.386);
  ctx.bezierCurveTo(mid-shoulder-.036,-.508,mid-shoulder-.012,-.631,mid-.064,-.655);
  ctx.quadraticCurveTo(mid,-.683,mid+.064,-.653);
  ctx.bezierCurveTo(mid+shoulder+.02,-.632,mid+shoulder+.006,-.481,mid+hip+.02,-.393);
  ctx.quadraticCurveTo(mid,-.357,mid-hip-.016,-.386);
  ctx.fillStyle=cloth;
  ctx.fill();
  ctx.save();
  ctx.clip();
  speckle(ctx,mid-shoulder,-.647,shoulder*2,.26,120,'#47312b24');
  ctx.restore();
  stroke(ctx,[[mid-hip,-.406],[mid,-.387],[mid+hip,-.409]],.022,material(ctx,look.trim,mid-.13,-.43,.27,.052));
  if(back) {
    stroke(ctx,[[mid,-.634],[mid+.005,-.544],[mid,-.455]],.007,'#432f2a3d');
    stroke(ctx,[[mid-.068,-.618],[mid,-.585],[mid+.066,-.62]],.009,'#fff4db47');
  } else {
    const front=side?.071:.009;
    stroke(ctx,[[front-.071,-.645],[front-.035,-.606],[front+.008,-.579]],.017,look.trim);
    stroke(ctx,[[front+.054,-.649],[front+.046,-.612],[front+.011,-.582]],.015,look.trim);
    stroke(ctx,[[front+.01,-.58],[front+.034,-.524],[front+.033,-.451]],.006,'#4b37373f');
    ellipse(ctx,front+.026,-.545,.010,.009,tint(look.trim,.56));
    ellipse(ctx,front+.032,-.504,.009,.008,tint(look.trim,.48));
    if(look.id==='fairYouth') {
      stroke(ctx,[[front-.078,-.58],[front-.05,-.51],[front-.068,-.419]],.019,'#dcab6d');
      stroke(ctx,[[front-.084,-.474],[front-.049,-.457],[front-.027,-.465]],.008,'#f1d297');
    }
  }
  if(look.id==='daiGirl') {
    const flare=side?stride*.023:stride*.011;
    ctx.beginPath();
    ctx.moveTo(-hip,-.41);
    ctx.quadraticCurveTo(-hip*1.03+flare,-.24,-hip*1.30+flare,-.099);
    ctx.quadraticCurveTo(flare,-.063,hip*1.30+flare,-.102);
    ctx.quadraticCurveTo(hip*1.12+flare,-.25,hip,-.406);
    ctx.closePath();
    ctx.fillStyle=material(ctx,look.lower,-.1,-.38,.18,.3);
    ctx.fill();
    ctx.save();
    ctx.clip();
    speckle(ctx,-.15,-.41,.31,.31,92,'#38263340');
    for(const offset of [-.067,-.012,.052]) stroke(ctx,[[offset,-.39],[offset*.90+flare,-.25],[offset*1.55+flare,-.106]],.006,'#f0c4a530');
    stroke(ctx,[[-hip*1.27+flare,-.127],[flare,-.10],[hip*1.27+flare,-.13]],.023,'#b56769');
    stroke(ctx,[[-hip*1.27+flare,-.127],[flare,-.11],[hip*1.27+flare,-.13]],.005,'#f2be8c');
    ctx.restore();
  }
}

function drawHair(ctx,look,x,y,side,back) {
  const hair=material(ctx,look.hair,x-.153,y-.171,.226,.302);
  if(look.hairStyle==='bun'){
    const bunX=x+(side?-.155:back?.016:-.032);
    ellipse(ctx,bunX,y-.134,.069,.061,hair,-.28);
    stroke(ctx,[[bunX-.048,y-.155],[bunX-.029,y-.181],[bunX+.016,y-.177]],.011,'#efc19d60');
    ellipse(ctx,bunX+(side?-.027:.035),y-.145,.021,.020,material(ctx,'#d59c60',bunX-.055,y-.17,.064,.066));
  }
  if(look.hairStyle==='ponytail') {
    const tailX=x+(side?-.143:back?.046:.119);
    ellipse(ctx,tailX,y+.080,.052,.119,hair,side?-.49:.33);
    ellipse(ctx,tailX,y+.016,.031,.023,look.trim,.16);
  }

  ctx.beginPath();
  if (back) {
    ctx.moveTo(x-.151,y+.062);
    ctx.bezierCurveTo(x-.231,y-.135,x-.079,y-.212,x+.066,y-.178);
    ctx.bezierCurveTo(x+.211,y-.168,x+.185,y+.029,x+.125,y+.103);
    ctx.quadraticCurveTo(x,y+.166,x-.151,y+.062);
  } else if(side) {
    ctx.moveTo(x-.138,y+.089);
    ctx.bezierCurveTo(x-.239,y-.058,x-.144,y-.213,x+.031,y-.17);
    ctx.quadraticCurveTo(x+.136,y-.156,x+.145,y-.081);
    ctx.quadraticCurveTo(x+.067,y-.094,x+.035,y-.048);
    ctx.quadraticCurveTo(x+.015,y+.038,x-.072,y+.039);
    ctx.lineTo(x-.091,y+.104);
  } else {
    const fringe=look.hairStyle==='short'?-.071:-.049;
    ctx.moveTo(x-.158,y+.043);
    ctx.bezierCurveTo(x-.219,y-.136,x-.109,y-.204,x+.052,y-.184);
    ctx.bezierCurveTo(x+.160,y-.165,x+.200,y-.106,x+.161,y+.026);
    ctx.quadraticCurveTo(x+.112,y-.025,x+.077,y-.101);
    ctx.quadraticCurveTo(x-.003,y+fringe,x-.103,y-.077);
    ctx.quadraticCurveTo(x-.141,y-.033,x-.158,y+.043);
  }
  ctx.closePath();
  ctx.fillStyle=hair;
  ctx.fill();
  ctx.save();
  ctx.clip();
  speckle(ctx,x-.189,y-.19,.38,.34,124,'#33201e50');
  const streak='#efd0a969';
  stroke(ctx,[[x-.156,y-.091],[x-.134,y-.17],[x-.047,y-.166]],.010,streak);
  stroke(ctx,[[x-.137,y-.078],[x-.108,y-.143],[x-.025,y-.157]],.006,'#f0caa244');
  if (back) stroke(ctx,[[x-.055,y-.138],[x+.009,y-.034],[x+.031,y+.052]],.008,'#f2c49d52');
  ctx.restore();
}

function drawHead(ctx,look,side,back) {
  const x=side?.019:0;
  const y=-.797;
  const skin=material(ctx,look.skin,x-.105,y-.145,.251,.267);
  stroke(ctx,[[x,-.683],[x,-.637]],.089,material(ctx,look.skin,-.047,-.69,.10,.081));
  if(!side) for(const earX of [-.154,.154]){
    ellipse(ctx,earX,y+.031,.032,.039,skin,earX>0?-.20:.20);
    if(!back) ellipse(ctx,earX*1.01,y+.035,.017,.022,'#ac6c5159',earX>0?-.20:.20);
  }

  ctx.beginPath();
  ctx.moveTo(x-.148,y-.027);
  ctx.bezierCurveTo(x-.158,y-.148,x-.082,y-.179,x+.019,y-.173);
  ctx.bezierCurveTo(x+.136,y-.166,x+.176,y-.088,x+.152,y-.021);
  if(side) {
    ctx.bezierCurveTo(x+.154,y+.012,x+.189,y+.019,x+.166,y+.043);
    ctx.bezierCurveTo(x+.148,y+.058,x+.154,y+.083,x+.112,y+.111);
  } else {
    ctx.bezierCurveTo(x+.170,y+.049,x+.116,y+.121,x+.069,y+.136);
  }
  ctx.bezierCurveTo(x-.026,y+.181,x-.155,y+.10,x-.148,y-.027);
  ctx.closePath();
  ctx.fillStyle=skin;
  ctx.fill();
  drawHair(ctx,look,x,y,side,back);

  if(!back) {
    const eyes=side?[x+.103]:[x-.060,x+.061];
    for(const ex of eyes) {
      const eyeY=y+.003;
      stroke(ctx,[[ex-.018,eyeY-.030],[ex,eyeY-.041],[ex+.018,eyeY-.033]],.0055,'#8f594a');
      stroke(ctx,[[ex-.018,eyeY+.001],[ex,eyeY-.010],[ex+.018,eyeY+.001]],.009,'#51392f');
      const cheekX=side?ex-.010:ex*1.63;
      const blush=ctx.createRadialGradient(cheekX,y+.054,0,cheekX,y+.054,.040);
      blush.addColorStop(0,'#d66a658f');
      blush.addColorStop(1,'#d66a6500');
      ellipse(ctx,cheekX,y+.054,.040,.023,blush);
    }
    if(side) {
      ellipse(ctx,x-.024,y+.034,.030,.040,skin,.16);
      stroke(ctx,[[x-.030,y+.024],[x-.011,y+.017],[x-.019,y+.041]],.006,'#b57357');
      stroke(ctx,[[x+.131,y+.067],[x+.144,y+.074],[x+.151,y+.060]],.007,'#9b5548');
    } else {
      ellipse(ctx,x,y+.043,.027,.017,material(ctx,look.skin,x-.018,y+.027,.044,.043));
      stroke(ctx,[[x-.022,y+.079],[x,y+.099],[x+.022,y+.079]],.008,'#9b5548');
    }
    if(look.id==='daiGirl') {
      const earringX=side?x-.021:-.153;
      ellipse(ctx,earringX,y+.073,.010,.013,'#f4c77f');
      ellipse(ctx,earringX-.001,y+.071,.003,.004,'#fff0ac');
      if(!side) ellipse(ctx,.153,y+.073,.010,.013,'#ecb879');
    }
  }

  if(look.headwear) {
    const cap=material(ctx,'#6c8879',x-.147,y-.196,.235,.16);
    ellipse(ctx,x-.01,y-.135,.162,.063,cap,-.07);
    ellipse(ctx,x+(side?.094:0),y-.095,side?.119:.170,.026,material(ctx,'#738e7d',x-.113,y-.131,.155,.089),side?.075:0);
    if(!back) ellipse(ctx,x+(side?.065:.024),y-.149,.018,.011,'#ebbf78',-.18);
    stroke(ctx,[[x-.101,y-.154],[x-.066,y-.174],[x-.025,y-.181]],.007,'#d6e1bc77');
  }
}

function drawCharacter(ctx,look,facing,stride,bob) {
  const side=facing==='e'||facing==='w';
  const back=facing==='n';
  ctx.lineCap='round';
  ctx.lineJoin='round';
  if(facing==='w') ctx.scale(-1,1);
  const sh=side?.104:.146;
  const hip=side?.087:.112;
  const gait=stride*(side?.133:.040);
  drawFoot(ctx,look,-hip*.49,-Math.max(0,stride)*.059,-gait,side,side);
  drawFoot(ctx,look,hip*.50,-Math.max(0,-stride)*.059,gait,side,false);
  ctx.translate(0,bob);
  drawSleeve(ctx,look,-sh*.86,-sh-.033+gait*.28,-.415,true);
  drawClothes(ctx,look,side,back,sh,hip,stride);
  drawSleeve(ctx,look,sh*.82,sh+.023-gait*.48,-.405,false);
  drawHead(ctx,look,side,back);
}

export function createPeople(createCanvas) {
  const frames=new Map();
  const looks=new Map(people.map(person=>{
    const preset=Avatar.applyPreset(person.id);
    return [person.id,{
      ...person,
      skin:catalog.skin.find(color=>color.id===preset.skin).c,
      height:catalog.height.find(height=>height.id===preset.height).m,
      hairStyle:preset.hair,headwear:preset.head==='cap',
    }];
  }));

  function spriteFor(id,facing,frame) {
    const key=id+'/'+facing+'/'+frame;
    if(!frames.has(key)){
      const look=looks.get(id);
      const sprite=createCanvas();
      sprite.width=frameSize;
      sprite.height=spriteHeight;
      const ctx=sprite.getContext('2d');
      ctx.translate(feetX,feetY);
      ctx.scale(frameSize*look.height,frameSize*look.height);
      const phase=Math.max(0,frame)*Math.PI/3;
      drawCharacter(ctx,look,facing,frame<0?0:Math.sin(phase),frame<0?0:-.021*Math.abs(Math.cos(phase)));
      frames.set(key,sprite);
    }
    return frames.get(key);
  }

  function draw(ctx,player,point,scale,time) {
    const frame=player.walking?Math.floor(time*11)%6:-1;
    const factor=adultHeight*scale/frameSize;
    ellipse(ctx,point.x,point.y,scale*.38,scale*.13,'#41533731');
    ellipse(ctx,point.x,point.y,scale*.23,scale*.074,'#41473527');
    ctx.drawImage(spriteFor(player.avatar,player.facing,frame),point.x-feetX*factor,point.y-feetY*factor,frameSize*factor,spriteHeight*factor);
  }

  function portrait(ctx,id,size) {
    const look=looks.get(id);
    const sprite=spriteFor(id,'s',-1);
    const center=size*.5;
    const background=material(ctx,look.background,size*.15,size*.05,size*.63,size*.86);
    ctx.save();
    ellipse(ctx,center,center+size*.022,size*.464,size*.464,'#624c3324');
    ellipse(ctx,center,center,size*.44,size*.44,background);
    ctx.clip();
    ellipse(ctx,center,center+size*.35,size*.36,size*.13,'#4f4a322d');
    ctx.drawImage(sprite,31,12,66,66,size*.028,size*.014,size*.944,size*.944);
    ctx.restore();
  }

  return {draw,portrait};
}
