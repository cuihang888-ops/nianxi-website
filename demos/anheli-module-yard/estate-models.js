const estateStyles = {
  grand_estate:{
    walls:'#e7ceb0', stone:'#c6ad91', cap:'#e6c9a8', wood:'#92634f', dark:'#573e38',
    shutter:'#8d9e88', path:'#d8bf9c', tile:['#965e55','#a16a5e','#af7968','#a26759','#b27c6e'],
    gateTile:['#996053','#aa6d5e','#b67b63'], metal:'#b88d57', accent:'#b67162',
  },
  landlord:{
    walls:'#dec4a0', stone:'#bda787', cap:'#d8c1a1', wood:'#97734f', dark:'#654d3b',
    shutter:'#778765', path:'#cab08c', tile:['#7f7967','#8c826b','#9f8d72','#8c816b','#968774'],
    gateTile:['#897d63','#99856a','#9c8d74'], metal:'#af905e', accent:'#a88c63',
  },
  official:{
    walls:'#e2d4b8', stone:'#b8ada3', cap:'#d9cbaf', wood:'#825a49', dark:'#543e3e',
    shutter:'#758b83', path:'#cabbab', tile:['#5a6770','#657074','#6c777d','#62717c','#748482'],
    gateTile:['#59676d','#6a777a','#707b7e'], metal:'#c6a475', accent:'#a86a58',
  },
};

export function buildEstate(kit,id) {
  const color = estateStyles[id] ?? estateStyles.grand_estate;
  const {house,block,add,roof,windowAt,doorAt,flowerBox,stoneRow,shrub} = kit;
  const half = house.width/2;
  const edge = house.depth/2;
  const gateZ = edge-.37;
  const backZ = -edge+.22;
  const collision = [];
  const occupy = (x,z,width,depth) => collision.push({x,z,width,depth});
  const roofColors = (x,z,width,depth,eave,ridge,sweep=.15,colors=color.tile) =>
    roof({x,z,width,depth,eave,ridge,colors,trim:color.dark,sweep});

  function wall(x,z,width,depth,height,angle=0) {
    block(x,height/2,z,width,height,depth,color.walls);
    block(x,.16,z,width+.04,.32,depth+.04,color.stone);
    const stoneLength = angle ? depth : width;
    const courseCenter = angle ? z : x;
    const courseFace = angle ? x+width/2 : z+depth/2;
    stoneRow(courseCenter-stoneLength/2,courseCenter+stoneLength/2,.16,courseFace,.8,angle);
    block(x,height-.04,z,width+.12,.11,depth+.10,color.cap);
    occupy(x,z,width+.04,depth+.04);
  }

  function enclosure(opening,wallHeight) {
    const rail = half-.25;
    const sideLength = gateZ-backZ;
    wall(-rail,(gateZ+backZ)/2,.30,sideLength,wallHeight,Math.PI/2);
    wall(rail,(gateZ+backZ)/2,.30,sideLength,wallHeight,Math.PI/2);
    wall(0,backZ,rail*2,.28,wallHeight);
    const wingWidth = rail-opening/2;
    for(const sign of [-1,1]){
      wall(sign*(opening/2+wingWidth/2),gateZ,wingWidth,.28,wallHeight*.94);
    }
  }

  function gate(opening,height,columns=2) {
    const pillarX = opening/2+.10;
    const pillarWidth = .27;
    const frontZ = gateZ+.03;
    for(const sign of [-1,1]){
      for(let index=0;index<columns;index++){
        const spacing=.45;
        const z=frontZ-index*spacing;
        const x=sign*pillarX;
        block(x,.13,z,.38,.26,.38,color.stone);
        block(x,(height+.16)*.5,z,pillarWidth,height-.16,pillarWidth,color.wood);
        block(x,height-.11,z,.40,.16,.42,color.accent);
        occupy(x,z,.35,.38);
      }
    }
    block(0,.027,frontZ-.34,opening+.16,.05,.89,color.path);
    block(0,height-.11,frontZ-.20,opening+.43,.22,.68,color.dark);
    block(0,height-.23,frontZ+.22,opening*.56,.27,.12,color.accent);
    roofColors(0,frontZ-.24,opening+.64,.88,height-.04,height+.61,.20,color.gateTile);
    for(const sign of [-1,1]){
      block(sign*(pillarX-.24),height-.42,frontZ+.15,.13,.24,.12,color.metal);
    }
  }

  function building({x=0,z,width,depth,level=.18,wallTop,ridge,roofWidth=width+.86,
    sweep=.18,windows=[-.33,.33],upper=[],style='house',frontShelter=false}) {
    const front = z+depth/2;
    const rear = z-depth/2;
    block(x,level/2,z,width+.02,level,depth+.02,color.stone);
    block(x,(level+wallTop)/2,z,width,wallTop-level,depth,color.walls);
    stoneRow(x-width/2,x+width/2,.22,front+.025,.92);
    stoneRow(rear,front,.22,x+width/2,.92,Math.PI/2);

    for(const offset of [-.48,.48]){
      block(x+width*offset,(level+wallTop)/2,front,.11,wallTop-level,.12,color.wood);
      block(x+width*offset,(level+wallTop)/2,rear,.11,wallTop-level,.12,color.wood);
    }
    for(const band of [level+.48,wallTop-.13]){
      block(x,band,front,width+.1,.10,.12,color.wood);
      block(x,band,rear,width+.1,.10,.12,color.wood);
      block(x+width/2,band,z,.12,.10,depth+.08,color.wood);
    }
    const doorWidth = style==='barn' ? 1.14 : .94;
    doorAt(x,level,front,doorWidth,1.78,color.dark);
    for(const offset of windows){
      windowAt(x+width*offset,level+.75,front,.63,.84,{frame:color.wood,shutter:color.shutter});
    }
    for(const offset of upper){
      windowAt(x+width*offset,level+2.6,front,.66,.84,{frame:color.wood,shutter:color.shutter});
    }
    for(const sign of [-1,1]){
      windowAt(x+sign*width/2,level+.74,z-.14,.57,.71,{frame:color.wood,rotation:sign*Math.PI/2});
    }
    block(x,.065,front+.19,doorWidth+.31,.13,.40,color.cap);
    roofColors(x,z,roofWidth,depth+.89,wallTop,ridge,sweep);
    if(frontShelter){
      const porchZ = front+.30;
      for(const side of [-1,1])block(x+side*width*.39,1.09,porchZ,.105,2.18,.11,color.wood);
      roofColors(x,porchZ-.03,width*.83,.86,2.06,2.48,.06);
    }
    occupy(x,z,width+.025,depth+.025);
  }

  function paving(x,z,width,depth,colorSet=[color.path,color.cap,color.path]){
    const count = Math.ceil(depth/.56);
    for(let index=0;index<count;index++){
      const position=z-depth/2+(index+.5)*depth/count;
      const offset=Math.sin(index*1.7)*.055;
      block(x+offset,.027,position,width+(index%2)*.055,.049,depth/count-.035,colorSet[index%colorSet.length],
        [0,Math.sin(index*2.3)*.05,0]);
    }
  }

  function seat(x,z,rotation=0) {
    block(x,.39,z,.91,.11,.32,color.cap,[0,rotation,0]);
    for(const dx of [-.30,.30]){
      block(x+dx*Math.cos(rotation),.19,z-dx*Math.sin(rotation),.13,.36,.24,color.stone,[0,rotation,0]);
    }
  }

  if(id==='grand_estate'){
    enclosure(house.doorWidth,1.04);
    gate(house.doorWidth,2.45);
    building({z:-2.65,width:6.85,depth:2.53,wallTop:4.68,ridge:6.40,sweep:.31,
      windows:[-.36,-.18,.18,.36],upper:[-.30,-.13,.13,.30]});
    roofColors(0,-1.55,5.95,1.60,2.28,3.01,.25);
    for(const sign of [-1,1]){
      const x=sign*4.36;
      building({x,z:.23,width:2.46,depth:3.93,wallTop:2.40,ridge:3.51,sweep:.14,windows:[-.31,.31]});
      flowerBox(x,1.06,2.17,.80);
      flowerBox(sign*2.36,1.26,-1.37,.86);
      block(sign*1.53,.085,.93,.77,.17,1.16,color.cap);
      shrub(sign*1.53,.15,.93,.56,.52,true);
      occupy(sign*1.53,.93,.74,1.13);
      seat(sign*1.99,2.67,Math.PI/2);
    }
    paving(0,.99,1.25,4.74);
    const bowlZ = -.12;
    add('post',0,.125,bowlZ,.83,.25,.83,color.stone);
    add('post',0,.27,bowlZ,.99,.13,.99,color.cap);
    add('post',0,.34,bowlZ,.80,.035,.80,'#98b0a2');
    occupy(0,bowlZ,.72,.72);
  }else if(id==='landlord'){
    enclosure(house.doorWidth,.71);
    gate(house.doorWidth,2.04);
    building({x:-.64,z:-2.23,width:5.35,depth:2.68,wallTop:3.13,ridge:5.12,sweep:.14,
      windows:[-.35,.35],frontShelter:true});
    building({x:2.89,z:-1.89,width:2.74,depth:2.87,wallTop:2.36,ridge:3.65,windows:[],style:'barn'});
    building({x:-3.51,z:.63,width:2.54,depth:2.21,wallTop:2.13,ridge:3.03,sweep:.09,windows:[],style:'barn'});
    const dryX=2.77,dryZ=1.38;
    block(dryX,.066,dryZ,2.93,.13,2.65,color.stone);
    for(let row=0;row<4;row++){
      const z=dryZ-.93+row*.57;
      block(dryX,.14,z,2.22,.038,.40,row%2?'#cfac69':'#d4b479',[0,row%2?.05:-.03,0]);
      for(let bit=0;bit<12;bit++){
        const x=dryX-1.06+bit*.19;
        add('leaf',x,.18,z+Math.sin(bit*3+row)*.10,.14,.085,.16,bit%3?'#ddbc72':'#bf985e');
      }
    }
    for(const offset of [-.25,.26]){
      const x=-3.85+offset;
      add('post',x,.28,2.02,.37,.55,.36,color.wood);
      add('post',x,.24,2.02,.39,.06,.38,color.dark);
      add('post',x,.37,2.02,.40,.055,.38,color.dark);
      occupy(x,2.02,.38,.38);
    }
    for(let index=0;index<3;index++){
      block(3.77,.44+index*.20,-.06,.72,.19,.44,'#bc9c58');
      block(3.77,.44+index*.20,.18,.78,.048,.06,'#9d8458');
    }
    occupy(3.77,.07,.75,.46);
    block(-2.85,.47,1.91,.055,.92,.05,color.wood,[.24,0,.19]);
    block(-2.76,.23,2.08,.27,.20,.055,'#848782',[.22,0,.19]);
    paving(0,1.30,1.12,3.89);
    shrub(-2.73,.02,2.96,.48,.43,true);
    shrub(4.41,.02,2.92,.59,.46,false);
  }else{
    enclosure(house.doorWidth,1.10);
    gate(house.doorWidth,2.59);
    building({z:-2.29,width:6.80,depth:2.68,wallTop:4.52,ridge:6.18,sweep:.30,
      windows:[-.36,-.18,.18,.36],upper:[-.31,-.13,.13,.31]});
    const terraceZ = -.69;
    block(0,.09,terraceZ,6.98,.18,.87,color.stone);
    block(0,.056,terraceZ+.58,2.43,.11,.45,color.cap);
    roofColors(0,-.90,6.15,1.21,2.49,3.28,.34,color.gateTile);
    for(const x of [-2.5,-1.28,1.28,2.5]){
      block(x,.18,terraceZ+.34,.30,.32,.33,color.stone);
      block(x,1.33,terraceZ+.34,.17,2.32,.18,color.accent);
      occupy(x,terraceZ+.34,.28,.29);
    }
    for(const sign of [-1,1]){
      const x=sign*3.18,z=1.83;
      const plinthTop=.21;
      block(x,.105,z,2.18,.21,1.81,color.stone);
      for(const dx of [-.88,.88]){
        for(const dz of [-.62,.62]){
          block(x+dx,1.10,z+dz,.115,1.78,.115,color.wood);
          occupy(x+dx,z+dz,.15,.15);
        }
      }
      roofColors(x,z,2.56,2.16,1.98,2.91,.25,color.gateTile);
      seat(x,1.88);
      seat(sign*1.86,.92,Math.PI/2);
      const lanternX=sign*1.14;
      add('post',lanternX,.30,2.93,.23,.60,.23,color.stone);
      block(lanternX,.62,2.93,.35,.22,.35,color.cap);
      add('post',lanternX,.77,2.93,.49,.15,.49,color.dark);
      occupy(lanternX,2.93,.35,.35);
      shrub(sign*4.23,.03,.04,.54,.65,true);
    }
    paving(0,1.92,1.23,3.43);
  }

  return {collision};
}