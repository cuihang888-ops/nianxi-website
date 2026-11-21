const PRIMARY = Object.freeze({
  grand_estate: {
    户型: '望林大宅', 形态: '顶级大户 · 前庭正厅',
    生活场景: '一家人围着前庭生活，适合待客、节庆和邻里聚会',
    可扩建: ['茶亭'],
  },
  landlord: {
    户型: '丰谷庄', 形态: '地主庄院 · 谷场',
    生活场景: '收粮、晒谷和照看牲畜，院子里有持续经营的忙碌感',
    可扩建: ['粮仓'],
  },
  official: {
    户型: '清和府', 形态: '门楼府院 · 礼序',
    生活场景: '穿过门楼进入正堂，适合静坐、迎客和举办仪式',
    可扩建: [],
  },
  merchant: {
    户型: '街边铺宅', 形态: '商住合一 · 临街铺面',
    生活场景: '白天在檐下摆摊做买卖，晚上回到楼上休息',
    可扩建: ['招牌与侧货架'],
  },
  lumber_cabin: {
    户型: '林间木屋', 形态: '一层木屋 · 小家庭',
    生活场景: '靠近林地和菜畦，安静生活、烧火做饭、照看花箱',
    可扩建: [],
  },
  simple_shed: {
    户型: '竹木草棚', 形态: '简陋棚子 · 起步居所',
    生活场景: '先有一个能遮雨的小家，慢慢攒材料再搬进更大的屋子',
    可扩建: [],
  },
});

const productCard = id => {
  const card = PRIMARY[id];
  if (!card) return null;
  const result = { id, ...card, lifestyle: card.生活场景, expansions: [...card.可扩建] };
  result['户型'] = card.户型;
  result['形态'] = card.形态;
  result['生活场景'] = card.生活场景;
  result['可扩建'] = [...card.可扩建];
  return Object.freeze(result);
};

const rect = (x, z, width, depth) => ({ x, z, width, depth });

function addSign(kit, x, z, y, label, palette) {
  const { block, beam, add } = kit;
  block(x, y + .03, z, 1.82, .58, .10, palette.board);
  block(x, y + .06, z + .058, 1.56, .34, .018, palette.face);
  for (const side of [-1, 1]) {
    beam({x: x + side * .65, y, z}, {x: x + side * .65, y: y + .95, z}, .045, palette.post);
  }
  block(x, y + .16, z + .073, .12, .12, .024, palette.letter);
  block(x + .32, y + .16, z + .073, .12, .12, .024, palette.letter);
  add('leaf', x - .71, y + .44, z + .10, .12, .16, .10, palette.flower);
  add('leaf', x + .73, y + .40, z + .10, .11, .14, .10, palette.flower);
  return { label };
}

function merchantExpansion(kit, variant = 0) {
  const { house, block, add } = kit;
  const half = house.width / 2;
  const z = house.depth / 2 + .62;
  const shelfX = half + .87;
  const shelfZ = variant % 2 ? .72 : .46;
  const palette = {
    board: variant % 2 ? '#7b5b4b' : '#836047',
    face: variant % 2 ? '#507d80' : '#b56c58',
    post: '#6b4d3d', letter: '#f0cd8b', flower: '#e4a579',
  };
  addSign(kit, 0, z, house.door.y + 2.15, '街边铺宅', palette);
  block(shelfX, house.door.y + .37, shelfZ, 1.34, .74, .68, '#9c6c51');
  block(shelfX, house.door.y + .78, shelfZ, 1.48, .11, .78, '#d0a06f');
  for (let i = 0; i < 4; i++) {
    const x = shelfX - .47 + i * .31;
    add('post', x, house.door.y + .93, shelfZ, .19, .28, .18,
      ['#dc9c63', '#9ba86e', '#c17859'][i % 3]);
    add('post', x, house.door.y + 1.105, shelfZ, .14, .05, .14, '#e1bd7e');
  }
  block(shelfX, house.door.y + .10, shelfZ - .34, 1.54, .16, .05, '#6b4d3d');
  return {
    id: 'merchant-signage-shelf',
    collision: [rect(shelfX, shelfZ, 1.58, .84)],
    interaction: { kind: 'market-stall', label: '打开商人货架' },
  };
}

function addSack(kit, x, y, z, color, rotation = 0) {
  const { add, block } = kit;
  add('leaf', x, y + .14, z, .38, .28, .30, color, [0, rotation, .08]);
  block(x, y + .30, z, .24, .035, .20, '#d6b47d');
}

function landlordExpansion(kit, variant = 0) {
  const { house, block, add, beam, roof, pick } = kit;
  const x = house.width / 2 + 1.38;
  const z = variant % 2 ? -.35 : -.62;
  const width = 2.45;
  const depth = 3.25;
  const floor = house.door.y;
  const eave = floor + 1.92;
  const back = z - depth / 2;
  const front = z + depth / 2;
  const wall = '#b38b5f';
  const timber = '#6f513b';

  block(x, floor + .08, z, width, .16, depth, '#a17b59');
  for (const side of [-1, 1]) {
    const sideX = x + side * (width / 2 - .07);
    block(sideX, floor + .93, z, .14, 1.72, depth, timber);
  }
  block(x, floor + .93, back, width, 1.72, .14, wall);
  block(x, floor + 1.70, front, width, .12, .14, timber);
  for (const side of [-1, 1]) {
    const postX = x + side * (width / 2 - .38);
    beam({x: postX, y: floor + .16, z: front}, {x: postX, y: eave, z: front}, .08, timber);
  }
  roof({
    x, z: z, width: width + .55, depth: depth + .38, eave, ridge: eave + .92,
    colors: ['#9b714d', '#b38555', '#c69962'], trim: '#6d4d36', sweep: .10,
  });
  for (let i = 0; i < 5; i++) {
    addSack(kit, x - .76 + (i % 3) * .64, floor + .12, back + .55 + Math.floor(i / 3) * .46,
      pick(['#c39a68', '#d0ad7a', '#a98461']));
  }
  for (let i = 0; i < 3; i++) {
    add('post', x + .42 + i * .35, floor + .34, front + .08, .24, .56, .24,
      ['#9bb17f', '#d1ab69', '#b9825e'][i]);
  }
  return {
    id: 'landlord-grain-shed',
    collision: [rect(x, z, width, depth)],
    interaction: { kind: 'grain-shed', label: '查看粮仓' },
  };
}

function teaCup(kit, x, z, y) {
  const { add } = kit;
  add('post', x, y, z, .11, .10, .11, '#d6aa74');
  add('post', x, y + .07, z, .07, .035, .07, '#f0d7a3');
}

function grandTeaPavilion(kit, variant = 0) {
  const { house, block, beam, roof, add } = kit;
  const x = -house.width / 2 - 2.15;
  const z = variant % 2 ? .42 : .08;
  const width = 3.25;
  const depth = 2.82;
  const floor = house.door.y;
  const eave = floor + 1.70;
  const side = width / 2 - .18;
  const front = z + depth / 2;
  const back = z - depth / 2;
  const wood = '#7d5c45';
  const tile = ['#849b87', '#759083', '#8ea48a'][variant % 3];

  block(x, floor + .08, z, width, .16, depth, '#b5966c');
  for (const px of [-side, side]) {
    for (const pz of [back + .15, front - .15]) {
      beam({x: x + px, y: floor + .16, z: pz}, {x: x + px, y: eave, z: pz}, .075, wood);
    }
  }
  beam({x: x - side, y: eave, z: front}, {x: x + side, y: eave, z: front}, .075, wood);
  beam({x: x - side, y: eave, z: back}, {x: x + side, y: eave, z: back}, .075, wood);
  roof({
    x, z, width: width + .50, depth: depth + .43, eave, ridge: eave + .78,
    colors: [tile, '#9bad8e', '#b4bd99'], trim: wood, sweep: .08,
  });
  block(x, floor + .30, z, 1.60, .16, .95, '#8c694d');
  block(x, floor + .40, z, 1.42, .08, .83, '#cba571');
  teaCup(kit, x - .38, z, floor + .50);
  teaCup(kit, x + .38, z, floor + .50);
  add('leaf', x - 1.06, floor + .70, z + .17, .18, .38, .16, '#8ba376');
  add('leaf', x + 1.06, floor + .70, z + .17, .18, .38, .16, '#8ba376');
  return {
    id: 'grand-tea-pavilion',
    collision: [
      rect(x - side, back + .15, .16, .16), rect(x + side, back + .15, .16, .16),
      rect(x - side, front - .15, .16, .16), rect(x + side, front - .15, .16, .16),
    ],
    interaction: { kind: 'tea-pavilion', label: '坐下喝茶' },
  };
}

export function buildOptionalExpansion(kit, id, variant = 0) {
  if (!kit || !kit.house) throw new TypeError('A house kit is required');
  if (id === 'merchant') return merchantExpansion(kit, variant);
  if (id === 'landlord') return landlordExpansion(kit, variant);
  if (id === 'grand_estate') return grandTeaPavilion(kit, variant);
  return null;
}

export { productCard };
