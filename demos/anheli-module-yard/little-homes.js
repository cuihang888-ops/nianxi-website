import { Vector3 } from 'three';

const point = (x, y, z) => new Vector3(x, y, z);

function createRoom(kit, style) {
  const { house, block } = kit;
  const { front, wallTop, wallColor, frame } = style;
  const half = house.width / 2;
  const back = -house.depth / 2;
  const floor = house.door.y;
  const doorWidth = house.door.width;
  const doorHeight = house.door.height;
  const thickness = .18;
  const middleZ = (front + back) / 2;
  const depth = front - back;
  const height = wallTop - floor;
  const centerY = (wallTop + floor) / 2;
  const collision = [];
  function solid(x, y, z, width, h, d, color = wallColor) {
    block(x, y, z, width, h, d, color);
    collision.push({ x, z, width, depth: d });
  }

  block(0, floor / 2, middleZ, house.width, floor, depth, style.base);
  solid(0, centerY, back + thickness / 2, house.width, height, thickness);
  for (const side of [-1, 1]) {
    const edgeX = side * (half - thickness / 2);
    solid(edgeX, centerY, middleZ, thickness, height, depth);
    const segment = half - doorWidth / 2;
    solid(side * (doorWidth / 2 + segment / 2), centerY, front - thickness / 2, segment, height, thickness);
    block(side * (doorWidth * .5 + .035), floor + doorHeight / 2, front + .012, .07, doorHeight, .135, frame);
  }
  const lintel = wallTop - floor - doorHeight;
  if (lintel > .04) block(0, wallTop - lintel / 2, front - thickness / 2, doorWidth, lintel, thickness, wallColor);
  block(0, floor + doorHeight + .038, front + .014, doorWidth + .23, .092, .15, frame);
  block(0, floor * .43, front + .16, doorWidth + .23, floor * .86, .32, style.base);
  return { half, back, front, floor, doorWidth, doorHeight, solid, collision };
}

function fillGables(kit, room, eave, roofDepth, rise, color) {
  const { block } = kit;
  const centerZ = (room.front + room.back) / 2;
  for (const side of [-1, 1]) {
    const x = side * (room.half - .059);
    for (let level = .06; level < rise - .083; level += .12) {
      const rowWidth = Math.min(room.front - room.back, roofDepth * (1 - level / rise) - .18);
      block(x, eave + level, centerZ, .118, .128, rowWidth, color);
    }
  }
}

function makeBasket(kit, x, y, z, radius, goods, count) {
  const { add } = kit;
  add('post', x, y + .12, z, radius, .24, radius, '#ac7c4d');
  for (let ring = 0; ring < 3; ring++) {
    const width = radius * (1.03 + ring * .035);
    add('post', x, y + .055 + ring * .073, z, width, .023, width, ring === 2 ? '#e0ae6b' : '#c6945c');
  }
  add('post', x, y + .229, z, radius * .79, .023, radius * .79, '#674e39');
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count;
    add('leaf', x + Math.cos(angle) * radius * .25, y + .254 + (i % 2) * .027, z + Math.sin(angle) * radius * .24,
      radius * .31, .15, radius * .29, goods[i % goods.length], [0, angle, (i % 3 - 1) * .23]);
  }
}

function makeMerchant(kit) {
  const { house, block, add, beam, roof, pick, windowAt, flowerBox } = kit;
  const wallColor = '#e1c59c', frame = '#705742', indigo = '#507d80';
  const eave = house.door.y + 4.85;
  const outerFront = house.depth / 2;
  const room = createRoom(kit, {
    front: outerFront - 1.63, wallTop: eave, wallColor, frame, base: '#b5a08a',
  });
  const { half, back, front, floor, collision, solid } = room;
  const roomDepth = front - back;
  const middleZ = (front + back) / 2;
  roof({
    z: middleZ, width: house.width + .98, depth: roomDepth + 1.13, eave,
    ridge: eave + 1.45, colors: ['#916454','#a2725d','#b9856a','#ad7362'], trim: '#745345', sweep: .22,
  });

  fillGables(kit, room, eave, roomDepth + 1.13, 1.45, wallColor);

  // Raised joists and facade molding leave a tall, clear doorway to the ground floor.
  const second = floor + 2.52;
  block(0, second, middleZ, house.width - .20, .17, roomDepth - .11, '#9b7551');
  for (const z of [front, back]) {
    block(0, second, z, house.width + .05, .15, .15, frame);
    block(0, eave - .14, z, house.width + .08, .16, .14, frame);
  }
  for (const side of [-1, 1]) {
    const x = half * side * .6;
    windowAt(x, second + .73, front + .028, .81, .96, { frame, shutter: indigo });
    flowerBox(x, second + .71, front + .25, .83);
    windowAt(half * side, floor + 1.08, back + roomDepth * .48, .82, .87,
      { frame, shutter: indigo, rotation: side * Math.PI / 2 });
    windowAt(half * side, second + .74, back + roomDepth * .48, .82, .91,
      { frame, shutter: indigo, rotation: side * Math.PI / 2 });
  }
  windowAt(0, second + .73, front + .028, .73, .96, { frame, shutter: '#a97f57' });

  const porchBack = front + .055;
  const porchFront = outerFront - .035;
  const porchDepth = porchFront - porchBack;
  const porchMiddle = (porchFront + porchBack) / 2;
  block(0, floor * .34, porchMiddle, house.width - .12, floor * .68, porchDepth, '#bd9e7e');
  const highY = floor + 2.83;
  const lowY = floor + 2.30;
  const slant = Math.atan2(highY - lowY, porchDepth);
  const strips = 14;
  const stripWidth = (house.width + .19) / strips;
  const fabric = ['#588186','#e3c79c','#4d747a','#e5cda9'];
  for (let i = 0; i < strips; i++) {
    const x = (i + .5 - strips / 2) * stripWidth;
    const color = fabric[i % fabric.length];
    block(x, (highY + lowY) * .5, porchMiddle, stripWidth + .016, .056,
      Math.hypot(porchDepth,highY-lowY), color, [slant,0,0]);
    block(x, lowY - .078, porchFront + .02, stripWidth + .009, i % 2 ? .168 : .204, .061, fabric[i % fabric.length]);
  }
  block(0, lowY - .008, porchFront - .026, house.width + .14, .074, .095, frame);
  for (const side of [-1, 1]) {
    const x = (half - .28) * side;
    solid(x, lowY * .5, porchFront - .14, .145, lowY, .14, frame);
    beam(point(x, lowY - .50, porchFront - .13), point(x, lowY - .075, porchFront - .65), .062, frame);
  }

  const stallWidth = 1.72;
  for (const side of [-1, 1]) {
    const x = side * 1.67;
    const counterZ = porchFront - .56;
    const counterColor = side < 0 ? '#9c6c51' : '#ad815c';
    solid(x, floor + .43, counterZ, stallWidth, .76, .72, counterColor);
    block(x, floor + .845, counterZ, stallWidth + .12, .115, .80, '#c39a70');
    block(x, floor + .52, counterZ + .381, stallWidth - .12, .36, .03, side < 0 ? '#63878a' : '#a76454');
    for (let rail = 0; rail < 3; rail++) {
      block(x, floor + .42 + rail * .092, counterZ + .407, stallWidth - .26, .025, .023, '#cba57c');
    }
    const top = floor + .902;
    if (side < 0) {
      makeBasket(kit, x - .42, top, counterZ, .46, ['#de9c54','#eac172','#b36b55'], 6);
      makeBasket(kit, x + .25, top, counterZ + .024, .55, ['#75926b','#94a870','#ddb26a'], 8);
    } else {
      for (let i = 0; i < 3; i++) {
        const jarX = x + (i - 1) * .39;
        add('post', jarX, top + .126, counterZ, .27, .253, .25, pick(['#7e9b86','#b88c67','#987e60']));
        add('post', jarX, top + .277, counterZ, .179, .06, .18, '#d4ae81');
        add('post', jarX, top + .324, counterZ, .066, .05, .067, '#a67b56');
      }
    }
  }
  const boxX = half - .53;
  const boxZ = front - .48;
  solid(boxX, floor + .18, boxZ, .65, .36, .58, '#a77d55');
  makeBasket(kit, boxX, floor + .36, boxZ, .49, ['#d99865','#e6bf73'], 6);
  // A small dwelling area sits behind the market instead of occupying its aisle.
  const bedX = -half + .79;
  const bedZ = back + 1.03;
  solid(bedX, floor + .25, bedZ, 1.02, .48, 1.79, '#9a704e');
  block(bedX, floor + .48, bedZ + .19, 1.015, .18, 1.25, '#8c9e9d');
  block(bedX, floor + .53, bedZ - .62, .73, .19, .36, '#e7cfaa');
  block(bedX, floor + .54, bedZ + .57, 1.025, .045, .15, '#d3ad7e');

  return { collision };
}

function makeShed(kit) {
  const { house, block, add, beam, roof, pick } = kit;
  const timber = '#7c5c3d';
  const front = house.depth / 2 - .21;
  const wallTop = house.door.y + Math.max(2.24, house.door.height + .23);
  const room = createRoom(kit, {
    front, wallTop, wallColor: '#ad8a57', frame: timber, base: '#b6a084',
  });
  const { half, back, floor, doorWidth, collision, solid } = room;
  const centerZ = (front + back) / 2;
  const siding = ['#ae905e','#c2a06b','#b2915f','#c8a778','#a78350','#b49566'];
  for (const side of [-1, 1]) {
    const x = side * half;
    for (let z = back + .11; z < front - .05; z += .105) {
      add('post',x,wallTop*.50+.044,z,.07,wallTop-floor-.16,.067,pick(siding),[0,0,side*.006]);
    }
    const start = doorWidth / 2 + .12;
    for (let offset = start; offset < half; offset += .122) {
      add('post',offset*side,wallTop*.50+.052,front+.014,.076,wallTop-floor-.087,.072,pick(siding),
        [0,0,(Math.sin(offset*3.7) * .018)]);
    }
    for (const z of [back+.11,front-.02]){
      add('post',side*(half-.08),wallTop*.47+.03,z,.175,wallTop-.07,.18,timber,[0,0,side*.013]);
    }
    for (const y of [floor+.32,wallTop-.27]){
      block(x,y,centerZ,.084,.074,front-back+.04,timber);
      block(side*(half*.5+doorWidth*.25),y,front+.061,half-doorWidth*.5,.078,.085,timber);
    }
    const endX=(half-.16)*side;
    beam(point(endX, floor+.36, front+.069),point((doorWidth*.5+.13)*side,wallTop-.30,front+.082),.085,'#896a45');
  }
  roof({
    z: centerZ + .08, width:house.width + .78, depth:house.depth + 1.05, eave:wallTop,
    ridge:wallTop+.95, colors:['#936b43','#a87f4a','#b89057','#aa8150','#c0965f'], trim:'#705438', sweep:.085,
  });

  fillGables(kit, room, wallTop, house.depth + 1.05, .95, '#ad8a57');

  // Straw under the eave and the small roll mat make the shelter visibly usable.
  for (let x = -half - .29; x < half + .30; x += .093){
    const z = centerZ + .08 + (house.depth + 1.05) / 2;
    const y = wallTop - .006 + Math.sin(x * 66) * .047;
    block(x,y,z,.052,.13,.148,pick(siding),[.16,0,Math.sin(x*16)*.13]);
  }
  const bedX = -half + .60;
  const bedZ = back + .89;
  solid(bedX,floor+.115,bedZ,.91,.23,1.52,'#755840');
  block(bedX,floor+.27,bedZ,.89,.12,1.53,'#d6b884');
  block(bedX,floor+.327,bedZ+.25,.87,.04,.96,'#9a9971');
  block(bedX,floor+.383,bedZ-.54,.72,.18,.34,'#e5c796');
  for (let thread = 0; thread < 5; thread++){
    block(bedX-.35+thread*.172,floor+.351,bedZ+.254,.017,.015,.925,'#b8ae7d');
  }
  const stoolX = half-.53;
  solid(stoolX,floor+.17,back+.52,.44,.34,.42,timber);
  block(stoolX,floor+.36,back+.52,.51,.077,.47,'#bb915e');
  add('post',stoolX,floor+.506,back+.52,.24,.23,.23,'#d3945c');
  add('post',stoolX,floor+.637,back+.52,.163,.04,.16,'#bc8153');
  return { collision };
}

export function buildLittleHome(kit, id) {
  if (id === 'merchant') return makeMerchant(kit);
  if (id === 'simple_shed') return makeShed(kit);
}
