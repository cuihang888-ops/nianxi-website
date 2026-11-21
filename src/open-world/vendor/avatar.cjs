/*! 念西 · 玩家外观模组 / avatar-modules.js
 * 分层矢量合成，无贴图依赖；浏览器 canvas 与微信小游戏 canvas 通用。
 * 存档只落 desc 对象（17 个目录 ID），分享/QA 用 18 字符外观码。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NXAvatar = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ================= 1. 目录 ================= */

  const GENDERS = [{ id: 'f', name: '女' }, { id: 'm', name: '男' }];

  // 身体比例：headF 头占比，legF 腿占比，肩/胯宽按身高比例
  const AGES = [
    { id: 'child',  name: '儿童', headF: 0.270, legF: 0.335, sh: 0.150, hip: 0.128, arm: 0.300 },
    { id: 'teen',   name: '少年', headF: 0.230, legF: 0.410, sh: 0.158, hip: 0.126, arm: 0.360 },
    { id: 'young',  name: '青年', headF: 0.212, legF: 0.455, sh: 0.172, hip: 0.132, arm: 0.400 },
    { id: 'middle', name: '中年', headF: 0.214, legF: 0.435, sh: 0.184, hip: 0.146, arm: 0.378 },
    { id: 'elder',  name: '老年', headF: 0.220, legF: 0.418, sh: 0.166, hip: 0.136, arm: 0.358 },
  ];

  const BUILDS = [
    { id: 0, name: '清瘦', w: 0.88, belly: 0 },
    { id: 1, name: '匀称', w: 1.00, belly: 0 },
    { id: 2, name: '壮实', w: 1.14, belly: 0.012 },
    { id: 3, name: '微胖', w: 1.26, belly: 0.030 },
  ];

  const SKINS = [
    { id: 0, name: '白皙', c: '#F4D8BE' }, { id: 1, name: '自然', c: '#EAC3A1' },
    { id: 2, name: '小麦', c: '#D9A87F' }, { id: 3, name: '蜜色', c: '#C08B5F' },
    { id: 4, name: '深麦', c: '#A5703F' }, { id: 5, name: '棕',   c: '#7C4E2C' },
  ];

  const FACES = [
    { id: 'oval',   name: '鹅蛋', w: 1.00, jaw: 0.90 },
    { id: 'round',  name: '圆脸', w: 1.07, jaw: 1.02 },
    { id: 'long',   name: '长脸', w: 0.93, jaw: 0.85 },
    { id: 'square', name: '方脸', w: 1.03, jaw: 1.08 },
    { id: 'heart',  name: '瓜子', w: 0.97, jaw: 0.76 },
    { id: 'wide',   name: '宽脸', w: 1.11, jaw: 1.04 },
  ];

  // g: 建议性别（随机时参考，玩家可任选）
  const HAIRS = [
    { id: 'short',    name: '短发',     g: ['m'], kind: 'short' },
    { id: 'buzz',     name: '寸头',     g: ['m'], kind: 'buzz' },
    { id: 'fringe',   name: '齐刘海',   g: ['f'], kind: 'fringe' },
    { id: 'bob',      name: '内扣短发', g: ['f'], kind: 'bob' },
    { id: 'longStraight', name: '长直发', g: ['f'], kind: 'longStraight' },
    { id: 'longWavy', name: '长卷发',   g: ['f'], kind: 'longWavy' },
    { id: 'ponytail', name: '马尾',     g: ['f'], kind: 'ponytail' },
    { id: 'twinTail', name: '双马尾',   g: ['f', 'm'], kind: 'twinTail' },
    { id: 'bun',      name: '盘发',     g: ['f'], kind: 'bun' },
    { id: 'topknot',  name: '束发',     g: ['m'], kind: 'topknot' },
    { id: 'braid',    name: '长辫',     g: ['f'], kind: 'braid' },
    { id: 'curly',    name: '短卷',     g: ['m', 'f'], kind: 'curly' },
    { id: 'shaved',   name: '光头',     g: ['m'], kind: 'shaved' },
    { id: 'wrapped',  name: '盘头',     g: ['f'], kind: 'wrapped' },
  ];

  const HAIR_COLORS = [
    { id: 0, name: '乌黑', c: '#1C1A18' }, { id: 1, name: '深棕', c: '#2E2622' },
    { id: 2, name: '栗棕', c: '#4A3628' }, { id: 3, name: '棕',   c: '#6B4A32' },
    { id: 4, name: '浅棕', c: '#8C6A45' }, { id: 5, name: '花白', c: '#A8A29A' },
    { id: 6, name: '银白', c: '#D8D4CC' }, { id: 7, name: '染红', c: '#7A2E22' },
  ];

  /* 上装：kind 决定画法；bottom 决定可搭配的下装（'any' 不限制） */
  const TOPS = [
    { id: 'tee',        name: '圆领T恤',    kind: 'tee',       g: ['m', 'f'], bottom: 'any' },
    { id: 'shirt',      name: '短袖衬衫',   kind: 'shirt',     g: ['m', 'f'], bottom: 'any' },
    { id: 'longshirt',  name: '长袖衬衫',   kind: 'longshirt', g: ['m', 'f'], bottom: 'any' },
    { id: 'jacket',     name: '夹克',       kind: 'jacket',    g: ['m', 'f'], bottom: 'any' },
    { id: 'vest',       name: '背心',       kind: 'vest',      g: ['m', 'f'], bottom: 'any' },
    { id: 'hoodie',     name: '卫衣',       kind: 'hoodie',    g: ['m', 'f'], bottom: 'any' },
    { id: 'daiBlouse',  name: '傣式立领短衫', kind: 'daiF',    g: ['f'],      bottom: ['skirtTube', 'skirtLong', 'skirtPleat'] },
    { id: 'daiMan',     name: '傣式对襟男衫', kind: 'daiM',    g: ['m'],      bottom: ['pants', 'jeans', 'shorts'] },
    { id: 'jingpoTop',  name: '景颇织锦上衣', kind: 'ethnic',  g: ['f', 'm'], bottom: 'any' },
    { id: 'achangTop',  name: '阿昌织锦上衣', kind: 'ethnic',  g: ['f', 'm'], bottom: 'any' },
    { id: 'deangTop',   name: '德昂黑红上衣', kind: 'ethnic',  g: ['f', 'm'], bottom: 'any' },
    { id: 'lisuoTop',   name: '傈僳彩线上衣', kind: 'ethnic',  g: ['f', 'm'], bottom: 'any' },
    { id: 'uniform',    name: '校服上衣',   kind: 'shirt',     g: ['m', 'f'], bottom: ['shorts', 'pants', 'skirtPleat'] },
    { id: 'apronTop',   name: '围裙上衣',   kind: 'apron',     g: ['f', 'm'], bottom: 'any' },
    { id: 'raincoat',   name: '雨衣',       kind: 'rain',      g: ['m', 'f'], bottom: 'any' },
    { id: 'workTop',    name: '工装上衣',   kind: 'jacket',    g: ['m', 'f'], bottom: 'any' },
    { id: 'myanTop',    name: '缅式短衫',   kind: 'daiM',      g: ['m', 'f'], bottom: 'any' },
    { id: 'festiveTop', name: '节庆盛装',   kind: 'ethnic',    g: ['f'],      bottom: ['skirtTube', 'skirtLong'] },
    { id: 'childVest',  name: '小童背心',   kind: 'vest',      g: ['m', 'f'], bottom: ['childShorts', 'shorts'] },
  ];

  const TOP_COLORS = [
    { id: 0, name: '藏青', c: '#2F4A6B' }, { id: 1, name: '白',  c: '#F2F0EA' },
    { id: 2, name: '靛蓝', c: '#35566F' }, { id: 3, name: '朱红', c: '#A8402F' },
    { id: 4, name: '墨绿', c: '#34523C' }, { id: 5, name: '姜黄', c: '#C08A3E' },
    { id: 6, name: '粉',   c: '#D08A93' }, { id: 7, name: '浅蓝', c: '#A8C3D6' },
    { id: 8, name: '黑',   c: '#23262A' }, { id: 9, name: '灰',   c: '#6E7175' },
  ];

  const BOTTOMS = [
    { id: 'pants',      name: '长裤',   kind: 'pants' },
    { id: 'jeans',      name: '牛仔裤', kind: 'pants' },
    { id: 'shorts',     name: '短裤',   kind: 'shorts' },
    { id: 'skirtLong',  name: '长裙',   kind: 'skirtLong' },
    { id: 'skirtTube',  name: '筒裙',   kind: 'skirtTube' },
    { id: 'skirtPleat', name: '百褶裙', kind: 'skirtPleat' },
    { id: 'sarong',     name: '笼基',   kind: 'sarong' },
    { id: 'workpants',  name: '工装裤', kind: 'pants' },
    { id: 'leggings',   name: '紧身裤', kind: 'pants' },
    { id: 'childShorts',name: '小童短裤', kind: 'shorts' },
  ];

  const BOTTOM_COLORS = [
    { id: 0, name: '黑',   c: '#23262A' }, { id: 1, name: '深蓝', c: '#2C3E52' },
    { id: 2, name: '藏青', c: '#2F4A6B' }, { id: 3, name: '卡其', c: '#9C8358' },
    { id: 4, name: '灰',   c: '#6E7175' }, { id: 5, name: '白',   c: '#EDEAE2' },
    { id: 6, name: '墨绿', c: '#2E4A38' }, { id: 7, name: '酒红', c: '#6B2C2C' },
    { id: 8, name: '深棕', c: '#4A3A2A' }, { id: 9, name: '牛仔蓝', c: '#4A6A8C' },
  ];

  const SHOES = [
    { id: 'slipper',  name: '拖鞋',   kind: 'flat' },
    { id: 'flipflop', name: '人字拖', kind: 'flip' },
    { id: 'rubber',   name: '胶鞋',   kind: 'boot' },
    { id: 'sneaker',  name: '运动鞋', kind: 'shoe' },
    { id: 'cloth',    name: '布鞋',   kind: 'flat' },
    { id: 'sandal',   name: '凉鞋',   kind: 'flip' },
    { id: 'boot',     name: '长靴',   kind: 'boot' },
    { id: 'barefoot', name: '赤脚',   kind: 'none' },
  ];

  const SHOE_COLORS = [
    { id: 0, name: '黑',   c: '#23262A' }, { id: 1, name: '白',   c: '#EDEAE2' },
    { id: 2, name: '胶绿', c: '#3E5A3A' }, { id: 3, name: '棕',   c: '#5A4230' },
    { id: 4, name: '粉',   c: '#C9899A' }, { id: 5, name: '红',   c: '#A33A32' },
  ];

  const HEADWEAR = [
    { id: 'none',      name: '无',       kind: 'none' },
    { id: 'towel',     name: '白包头巾', kind: 'towel' },
    { id: 'conical',   name: '竹编尖帽', kind: 'conical' },
    { id: 'strawHat',  name: '斗笠',     kind: 'straw' },
    { id: 'wideHat',   name: '宽檐草帽', kind: 'wide' },
    { id: 'silverCrown', name: '银冠',   kind: 'crown' },
    { id: 'cap',       name: '棒球帽',   kind: 'cap' },
    { id: 'headband',  name: '织锦头带', kind: 'band' },
    { id: 'scarf',     name: '缠头',     kind: 'towel' },
    { id: 'helmet',    name: '头盔',     kind: 'cap' },
  ];

  const ACCS = [
    { id: 'none',    name: '无',     kind: 'none' },
    { id: 'silverNeck', name: '银项圈', kind: 'neck' },
    { id: 'earring', name: '银耳坠', kind: 'ear' },
    { id: 'beads',   name: '珠串',   kind: 'neck' },
    { id: 'glasses', name: '眼镜',   kind: 'glass' },
    { id: 'bag',     name: '筒帕',   kind: 'bag' },
    { id: 'basket',  name: '腰篓',   kind: 'basket' },
    { id: 'bracelet',name: '手镯',   kind: 'wrist' },
    { id: 'flower',  name: '鬓边花', kind: 'ear' },
    { id: 'phone',   name: '手机',   kind: 'phone' },
  ];

  const PATTERNS = [
    { id: 'none',   name: '无',   kind: 'none' },
    { id: 'stripe', name: '横条', kind: 'stripe' },
    { id: 'weave',  name: '织锦菱形', kind: 'weave' },
    { id: 'floral', name: '花',   kind: 'floral' },
    { id: 'check',  name: '格',   kind: 'check' },
    { id: 'jacquard', name: '提花', kind: 'weave' },
  ];

  const HEIGHTS = [
    { id: 0, name: '偏矮', m: 0.94 }, { id: 1, name: '稍矮', m: 0.97 },
    { id: 2, name: '中等', m: 1.00 }, { id: 3, name: '稍高', m: 1.035 },
    { id: 4, name: '高个', m: 1.07 },
  ];

  /* ================= 2. 字段定义（顺序即编码顺序，勿调换） ================= */

  const FIELDS = [
    ['gender', GENDERS], ['age', AGES], ['build', BUILDS], ['skin', SKINS],
    ['face', FACES], ['hair', HAIRS], ['hairColor', HAIR_COLORS],
    ['top', TOPS], ['topColor', TOP_COLORS], ['pattern', PATTERNS],
    ['bottom', BOTTOMS], ['bottomColor', BOTTOM_COLORS],
    ['shoes', SHOES], ['shoeColor', SHOE_COLORS],
    ['head', HEADWEAR], ['acc', ACCS], ['height', HEIGHTS],
  ];

  const IDX = {};
  FIELDS.forEach(function (f) { IDX[f[0]] = f[1]; });
  function indexOf(field, id) {
    const list = IDX[field];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return 0;
  }
  function at(field, i) {
    const list = IDX[field];
    return list[i] || list[0];
  }

  /* ================= 3. 外观码（每字段 1 个字符，共 18 位） ================= */

  const B64 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';

  function packCode(desc) {
    const d = normalizeDesc(desc);
    let s = 'A';
    FIELDS.forEach(function (f) { s += B64[indexOf(f[0], d[f[0]])]; });
    return s;
  }
  function parseCode(code) {
    if (typeof code !== 'string' || code.length !== 1 + FIELDS.length || code[0] !== 'A') return null;
    const d = {};
    for (let i = 0; i < FIELDS.length; i++) {
      const v = B64.indexOf(code[i + 1]);
      if (v < 0) return null;
      const list = FIELDS[i][1];
      if (v >= list.length) return null;   // 目录缩过或码被改坏
      d[FIELDS[i][0]] = list[v].id;
    }
    return normalizeDesc(d);
  }

  /* ================= 4. 归一化 / 随机 / 预设 ================= */

  function normalizeDesc(d) {
    const src = d || {};
    const out = {};
    FIELDS.forEach(function (f) {
      const field = f[0], list = f[1];
      let hit = null;
      for (let i = 0; i < list.length; i++) if (list[i].id === src[field]) { hit = list[i]; break; }
      out[field] = hit ? hit.id : list[0].id;
    });
    if (out.shoes === 'barefoot' && (!src || src.shoes == null)) out.shoes = 'flipper';
    if (out.shoes === 'flipper') out.shoes = 'slipper';
    return out;
  }

  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rngFrom(seed) {
    let a = hash32(String(seed == null ? Math.random() : seed));
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(list, rnd) { return list[Math.floor(rnd() * list.length) % list.length]; }

  /** 兼容性：上装→下装 */
  function compatible(topId, bottomId) {
    const t = IDX.top[indexOf('top', topId)];
    if (!t) return true;
    if (t.bottom === 'any') return true;
    return t.bottom.indexOf(bottomId) >= 0;
  }

  /**
   * 随机生成一套。options:
   *   { seed, gender:'f'|'m'|null, age:'young'|null, festive:bool }
   */
  function randomDesc(options) {
    const opt = options || {};
    const rnd = rngFrom(opt.seed);

    const gender = opt.gender || (rnd() < 0.5 ? 'f' : 'm');
    const ageList = opt.age ? AGES.filter(function (a) { return a.id === opt.age; }) : AGES;
    // 青年权重高一点，寨子里年轻人多
    const age = opt.age ? ageList[0] : (rnd() < 0.52 ? AGES[2] : pick(ageList, rnd));

    const hwise = HAIRS.filter(function (h) { return h.g.indexOf(gender) >= 0; });
    const hair = pick(hwise, rnd);

    let tops = TOPS.filter(function (t) {
      if (t.g.indexOf(gender) < 0) return false;
      if (age.id === 'child') return t.id === 'childVest' || t.id === 'tee' || t.id === 'shirt' || t.id === 'hoodie' || t.id === 'daiMan';
      if (age.id === 'elder') return t.id !== 'uniform' && t.id !== 'festiveTop';
      return true;
    });
    if (opt.festive) tops = tops.filter(function (t) { return t.id === 'festiveTop' || t.kind === 'ethnic'; });
    if (!tops.length) tops = TOPS;
    const top = pick(tops, rnd);

    const allowed = top.bottom === 'any' ? BOTTOMS :
      BOTTOMS.filter(function (b) { return top.bottom.indexOf(b.id) >= 0; });
    let bottom = pick(allowed, rnd);
    if (age.id === 'child' && top.bottom !== 'any') bottom = allowed[0];

    const shortTop = top.kind === 'vest' || top.kind === 'tee';
    const head = rnd() < 0.55 ? 'none' : pick(HEADWEAR, rnd).id;
    const acc = rnd() < 0.4 ? 'none' : pick(ACCS, rnd).id;

    return normalizeDesc({
      gender: gender, age: age.id, build: pick(BUILDS, rnd).id, skin: pick(SKINS, rnd).id,
      face: pick(FACES, rnd).id, hair: hair.id, hairColor: pick(HAIR_COLORS, rnd).id,
      top: top.id, topColor: pick(TOP_COLORS, rnd).id,
      pattern: rnd() < 0.65 ? 'none' : pick(PATTERNS, rnd).id,
      bottom: bottom.id, bottomColor: pick(BOTTOM_COLORS, rnd).id,
      shoes: opt.festive ? 'sandal' : pick(SHOES, rnd).id, shoeColor: pick(SHOE_COLORS, rnd).id,
      head: head, acc: acc, height: pick(HEIGHTS, rnd).id,
    });
  }

  const PRESETS = {
    daiGirl:  { gender: 'f', age: 'young', top: 'daiBlouse', topColor: 'pink', pattern: 'weave',
                bottom: 'skirtTube', bottomColor: 'black', hair: 'bun', hairColor: 'black',
                head: 'none', acc: 'silverNeck', shoes: 'sandal', shoeColor: 'red', skin: 'natural', height: 'medium' },
    daiBoy:   { gender: 'm', age: 'young', top: 'daiMan', topColor: 'white', pattern: 'none',
                bottom: 'pants', bottomColor: 'black', hair: 'short', hairColor: 'black',
                head: 'none', acc: 'bracelet', shoes: 'flipflop', shoeColor: 'black', skin: 'wheat', height: 'tall' },
    jingpoMum:{ gender: 'f', age: 'middle', top: 'jingpoTop', topColor: 'black', pattern: 'weave',
                bottom: 'skirtTube', bottomColor: 'black', hair: 'wrapped', hairColor: 'black',
                head: 'headband', acc: 'basket', shoes: 'cloth', shoeColor: 'black', skin: 'honey', height: 'slightLow' },
    fairYouth:{ gender: 'f', age: 'young', top: 'tee', topColor: 'bluePale', pattern: 'none',
                bottom: 'jeans', bottomColor: 'denim', hair: 'ponytail', hairColor: 'brown',
                head: 'cap', acc: 'phone', shoes: 'sneaker', shoeColor: 'white', skin: 'natural', height: 'medium' },
    oldMan:   { gender: 'm', age: 'elder', top: 'daiMan', topColor: 'indigo', pattern: 'none',
                bottom: 'workpants', bottomColor: 'darkBrown', hair: 'shaved', hairColor: 'gray',
                head: 'towel', acc: 'none', shoes: 'rubber', shoeColor: 'green', skin: 'deepWheat', height: 'short' },
    kid:      { gender: 'f', age: 'child', top: 'childVest', topColor: 'red', pattern: 'floral',
                bottom: 'childShorts', bottomColor: 'blue', hair: 'twinTail', hairColor: 'black',
                head: 'none', acc: 'flower', shoes: 'sandal', shoeColor: 'pink', skin: 'fair', height: 'low' },
  };

  /* 兼容别名，避免上面写中文键出错 */
  const ALIAS = {
    skin: { fair: 0, natural: 1, wheat: 2, honey: 3, deepWheat: 4 },
    height: { short: 0, low: 0, slightLow: 1, medium: 2, tall: 4 },
    hairColor: { black: 0, darkBrown: 1, brown: 3, gray: 5 },
    topColor: { navy: 0, white: 1, indigo: 2, red: 3, green: 4, yellow: 5, pink: 6, bluePale: 7, black: 8, gray: 9 },
    bottomColor: { black: 0, blue: 1, navy: 2, khaki: 3, gray: 4, white: 5, green: 6, wine: 7, darkBrown: 8, denim: 9 },
    shoeColor: { black: 0, white: 1, green: 2, brown: 3, pink: 4, red: 5 },
  };

  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return normalizeDesc(null);
    const d = Object.assign({}, p);
    Object.keys(ALIAS).forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(ALIAS[field], d[field])) d[field] = ALIAS[field][d[field]];
    });
    return normalizeDesc(d);
  }

  /* ================= 5. 绘制 ================= */
  /* 归一化坐标：脚底中心为 (0,0)，头顶为 (0,-1)，单位 = 身高。 */

  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(hex, amt) {
    const c = hexToRgb(hex);
    const f = function (v) { return Math.round(Math.min(255, Math.max(0, v * (1 + amt)))); };
    return '#' + ((1 << 24) + (f(c[0]) << 16) + (f(c[1]) << 8) + f(c[2])).toString(16).slice(1);
  }
  function path(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function fillPoly(ctx, pts, fill) { path(ctx, pts); ctx.fillStyle = fill; ctx.fill(); }
  function ell(ctx, cx, cy, rx, ry, fill) {
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    else { ctx.save(); ctx.translate(cx, cy); ctx.scale(rx, ry); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.restore(); }
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function rr(ctx, x, y, w, h, r, fill) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }

  /* 姿势参数 */
  const POSES = {
    idle:  { bob: 0, legSwing: 0, armSwing: 0, lean: 0, headDx: 0, legSplay: 0.0, sit: 0, armUp: 0 },
    walk:  { bob: 1, legSwing: 1, armSwing: 1, lean: 0, headDx: 0, legSplay: 0.0, sit: 0, armUp: 0 },
    sit:   { bob: 0, legSwing: 0, armSwing: 0, lean: 0, headDx: 0, legSplay: 0.06, sit: 1, armUp: 0 },
    pray:  { bob: 0, legSwing: 0, armSwing: 0, lean: 0.02, headDx: 0, legSplay: 0.02, sit: 0, armUp: 1 },
    bow:   { bob: 0, legSwing: 0, armSwing: 0, lean: 0.09, headDx: 0, legSplay: 0.02, sit: 0, armUp: 0.4 },
    carry: { bob: 0, legSwing: 0, armSwing: 0, lean: -0.02, headDx: 0, legSplay: 0.02, sit: 0, armUp: 1.3 },
    ride:  { bob: 0, legSwing: 0, armSwing: 0, lean: 0.03, headDx: 0, legSplay: 0.22, sit: 0.7, armUp: 0.6 },
  };

  /**
   * 绘制角色。
   * @param ctx  CanvasRenderingContext2D
   * @param desc 外观描述
   * @param o    { x, y, s, dir:'s'|'n'|'e'|'w', pose, frame, alpha }
   *             s = 身高对应像素
   */
  function drawAvatar(ctx, desc, o) {
    const d = normalizeDesc(desc);
    const opt = o || {};
    const S = opt.s || 64;
    const dir = opt.dir || 's';
    const pose = POSES[opt.pose || 'idle'] || POSES.idle;
    const frame = (opt.frame || 0) % 4;

    const age = at('age', indexOf('age', d.age));
    const build = at('build', indexOf('build', d.build));
    const face = at('face', indexOf('face', d.face));
    const skin = at('skin', indexOf('skin', d.skin)).c;
    const hair = at('hair', indexOf('hair', d.hair));
    const hc = at('hairColor', indexOf('hairColor', d.hairColor)).c;
    const top = at('top', indexOf('top', d.top));
    const tc = at('topColor', indexOf('topColor', d.topColor)).c;
    const pat = at('pattern', indexOf('pattern', d.pattern));
    const bot = at('bottom', indexOf('bottom', d.bottom));
    const bc = at('bottomColor', indexOf('bottomColor', d.bottomColor)).c;
    const shoe = at('shoes', indexOf('shoes', d.shoes));
    const sc = at('shoeColor', indexOf('shoeColor', d.shoeColor)).c;
    const head = at('head', indexOf('head', d.head));
    const acc = at('acc', indexOf('acc', d.acc));
    const hMul = at('height', indexOf('height', d.height)).m;

    const LINE = 'rgba(38,30,22,0.55)';
    const LW = 0.0075;

    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
    ctx.translate(opt.x || 0, opt.y || 0);
    if (dir === 'w') ctx.scale(-1, 1);
    ctx.scale(S * hMul, S * hMul);      // 头顶为负 y，与 Canvas 屏幕坐标一致
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    /* --- 姿势解算 --- */
    const t = frame / 4 * Math.PI * 2;
    const swing = pose.legSwing ? Math.sin(t) : 0;
    const bob = pose.bob ? Math.abs(Math.cos(t)) * 0.012 : 0;
    const sitOff = pose.sit * 0.16;

    const headF = age.headF;
    const legF = age.legF - sitOff * 0.55;
    const hipY = -legF;
    const neckY = -1 + headF;
    const shoulderY = neckY + 0.024;
    const torsoH = hipY - shoulderY;
    const wMul = build.w;
    const shW = age.sh * wMul;
    const hipW = age.hip * wMul;
    const headW = headF * 0.80 * face.w;
    const headCY = -1 + headF * 0.5;
    const lean = pose.lean;

    const cx = 0;
    const bodyShift = bob - sitOff * 0.15;

    /* --- 地面投影 --- */
    ctx.save();
    ctx.globalAlpha *= 0.18;
    ell(ctx, 0, 0.005, shW * 1.25, 0.028, '#2A1E12');
    ctx.restore();

    /* --- 后层头发 --- */
    drawHairBack(ctx, hair.kind, cx, headCY, headW, headF, hc, dir);

    /* --- 腿 / 鞋 --- */
    const legW = Math.max(0.030, hipW * 0.40);
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? -1 : 1;
      const sw = swing * sgn * 0.030;
      const lift = pose.legSwing ? Math.max(0, -swing * sgn) * 0.014 : 0;
      const lx = sgn * hipW * 0.40 + sw + sgn * pose.legSplay * 0.2;
      const footY = 0 + lift;
      drawLeg(ctx, lx, hipY, footY, legW, bot, bc, legF, pose.sit, dir);
      drawShoe(ctx, lx, footY, legW, shoe, sc, sgn, dir);
    }

    /* --- 下装 --- */
    drawBottom(ctx, bot, bc, hipW, hipY, torsoH, shoulderY, legW, pose, dir);

    /* --- 躯干 / 上装 --- */
    ctx.save();
    ctx.translate(0, bodyShift);
    if (lean) { ctx.translate(0, shoulderY); ctx.rotate(lean); ctx.translate(0, -shoulderY); }
    drawTorso(ctx, top, tc, pat, shW, hipW, shoulderY, hipY, torsoH, build.belly, skin, dir);
    // 手臂
    drawArms(ctx, top, tc, skin, shW, shoulderY, age.arm, hipY, pose, swing, dir);
    // 配饰：颈 / 包
    drawAccBody(ctx, acc, shW, shoulderY, hipY, torsoH, dir);
    ctx.restore();

    /* --- 头 --- */
    ctx.save();
    ctx.translate(0, bodyShift);
    if (lean) { ctx.translate(0, shoulderY); ctx.rotate(lean * 1.2); ctx.translate(0, -shoulderY); }
    drawNeck(ctx, skin, headW, neckY);
    drawHead(ctx, skin, face, cx, headCY, headW, headF, dir, d.age);
    drawHairFront(ctx, hair.kind, cx, headCY, headW, headF, hc, dir);
    drawHeadwear(ctx, head, cx, headCY, headW, headF, hc, dir);
    drawAccHead(ctx, acc, cx, headCY, headW, headF, dir);
    ctx.restore();

    ctx.restore();
  }

  function drawNeck(ctx, skin, headW, neckY) {
    rr(ctx, -headW * 0.16, neckY - 0.03, headW * 0.32, 0.06, 0.012, shade(skin, -0.1));
  }

  function drawLeg(ctx, x, hipY, footY, w, bot, bc, legF, sit, dir) {
    const col = bot.kind === 'pants' || bot.kind === 'shorts' || bot.kind === 'skirtLong' ||
                bot.kind === 'skirtTube' || bot.kind === 'skirtPleat' || bot.kind === 'sarong' ? shade(bc, 0.02) : '#EAC3A1';
    rr(ctx, x - w / 2, footY + (sit ? 0.02 : 0.03), w, hipY - footY - 0.02, w * 0.42, col);
  }

  function drawShoe(ctx, x, footY, legW, shoe, sc, sgn, dir) {
    if (shoe.kind === 'none') return;
    const y = footY + 0.012;
    const w = legW * 1.35, h = 0.028;
    if (shoe.kind === 'boot') {
      rr(ctx, x - w / 2, y - 0.055, w, h + 0.055, 0.010, sc);
    } else if (shoe.kind === 'flip') {
      rr(ctx, x - w / 2, y, w, h * 0.7, 0.006, sc);
      rr(ctx, x - w * 0.12, y + h * 0.7, 0.008, 0.016, 0.004, sc);
    } else {
      rr(ctx, x - w / 2, y, w, h, 0.008, sc);
    }
  }

  function drawBottom(ctx, bot, bc, hipW, hipY, torsoH, shoulderY, legW, pose, dir) {
    const topY = hipY + torsoH * 0.42;
    switch (bot.kind) {
      case 'pants':
        rr(ctx, -hipW, hipY - torsoH * 0.10, hipW * 2, torsoH * 0.30, 0.012, bc);
        break;
      case 'shorts':
        rr(ctx, -hipW * 1.02, hipY - torsoH * 0.10, hipW * 2.04, torsoH * 0.52, 0.012, bc);
        break;
      case 'skirtLong':
        fillPoly(ctx, [[-hipW * 1.0, hipY + torsoH * 0.06], [hipW * 1.0, hipY + torsoH * 0.06],
                       [hipW * 1.45, 0.03], [-hipW * 1.45, 0.03]], bc);
        break;
      case 'skirtPleat':
        fillPoly(ctx, [[-hipW * 1.0, hipY + torsoH * 0.06], [hipW * 1.0, hipY + torsoH * 0.06],
                       [hipW * 1.55, 0.05], [-hipW * 1.55, 0.05]], bc);
        for (let i = -4; i <= 4; i++) {
          const xx = i * hipW * 0.36;
          ctx.beginPath(); ctx.moveTo(xx * 0.72, hipY + torsoH * 0.06);
          ctx.lineTo(xx, 0.05); ctx.strokeStyle = shade(bc, -0.18); ctx.lineWidth = 0.006; ctx.stroke();
        }
        break;
      case 'skirtTube':
        fillPoly(ctx, [[-hipW * 0.92, hipY + torsoH * 0.10], [hipW * 0.92, hipY + torsoH * 0.10],
                       [hipW * 0.80, 0.045], [-hipW * 0.80, 0.045]], bc);
        // 筒裙常见横条织纹
        for (let y = 0.10; y < 0.62; y += 0.09) {
          ctx.beginPath(); ctx.moveTo(-hipW, -y); ctx.lineTo(hipW, -y);
          ctx.strokeStyle = shade(bc, 0.22); ctx.lineWidth = 0.010; ctx.stroke();
        }
        break;
      case 'sarong':
        fillPoly(ctx, [[-hipW * 0.95, hipY + torsoH * 0.12], [hipW * 0.95, hipY + torsoH * 0.12],
                       [hipW * 0.88, 0.02], [-hipW * 0.88, 0.02]], bc);
        fillPoly(ctx, [[-hipW * 0.96, hipY + torsoH * 0.12], [hipW * 0.96, hipY + torsoH * 0.12],
                       [hipW * 0.96, hipY + torsoH * 0.20], [-hipW * 0.96, hipY + torsoH * 0.20]], shade(bc, -0.2));
        break;
      default:
        rr(ctx, -hipW, hipY - torsoH * 0.10, hipW * 2, torsoH * 0.30, 0.012, bc);
    }
  }

  function drawTorso(ctx, top, tc, pat, shW, hipW, shoulderY, hipY, torsoH, belly, skin, dir) {
    const pts = [
      [-shW, shoulderY],
      [-shW * 0.98, shoulderY + torsoH * 0.26],
      [-hipW - belly, hipY + torsoH * 0.06],
      [hipW + belly, hipY + torsoH * 0.06],
      [shW * 0.98, shoulderY + torsoH * 0.26],
      [shW, shoulderY],
      [shW * 0.3, shoulderY - 0.018],
      [-shW * 0.3, shoulderY - 0.018],
    ];
    fillPoly(ctx, pts, tc);
    ctx.strokeStyle = 'rgba(38,30,22,0.35)'; ctx.lineWidth = 0.006; path(ctx, pts); ctx.stroke();

    // 领口（露肤）
    const collar = top.kind === 'daiF' ? 'high' : top.kind === 'daiM' ? 'crossed' :
                   top.kind === 'vest' ? 'deep' : 'round';
    if (collar === 'high') {
      fillPoly(ctx, [[-shW * 0.30, shoulderY - 0.018], [shW * 0.30, shoulderY - 0.018],
                     [shW * 0.16, shoulderY + 0.045], [-shW * 0.16, shoulderY + 0.045]], tc);
      fillPoly(ctx, [[-shW * 0.19, shoulderY - 0.010], [shW * 0.19, shoulderY - 0.010],
                     [0, shoulderY + 0.030]], shade(skin, 0.02));
    } else if (collar === 'crossed') {
      fillPoly(ctx, [[-shW * 0.22, shoulderY - 0.012], [shW * 0.22, shoulderY - 0.012],
                     [shW * 0.10, shoulderY + 0.09], [-shW * 0.02, shoulderY + 0.05]], shade(skin, 0.04));
      ctx.beginPath(); ctx.moveTo(-shW * 0.22, shoulderY - 0.012); ctx.lineTo(shW * 0.10, shoulderY + 0.09);
      ctx.strokeStyle = shade(tc, -0.3); ctx.lineWidth = 0.008; ctx.stroke();
    } else if (collar === 'deep') {
      fillPoly(ctx, [[-shW * 0.34, shoulderY], [shW * 0.34, shoulderY],
                     [0, shoulderY + 0.11]], shade(skin, 0.02));
    } else {
      ell(ctx, 0, shoulderY + 0.006, shW * 0.24, 0.032, shade(skin, 0.02));
    }

    // 门襟
    if (top.kind === 'shirt' || top.kind === 'longshirt' || top.kind === 'jacket') {
      ctx.beginPath(); ctx.moveTo(0, shoulderY + 0.01); ctx.lineTo(0, hipY + torsoH * 0.05);
      ctx.strokeStyle = shade(tc, -0.3); ctx.lineWidth = 0.007; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const yy = shoulderY + 0.06 + i * torsoH * 0.30;
        ell(ctx, 0.012, yy, 0.010, 0.010, shade(tc, -0.4));
      }
    }
    if (top.kind === 'apron') {
      fillPoly(ctx, [[-shW * 0.55, shoulderY + torsoH * 0.18], [shW * 0.55, shoulderY + torsoH * 0.18],
                     [shW * 0.75, hipY + torsoH * 0.24], [-shW * 0.75, hipY + torsoH * 0.24]], '#EFE7DA');
      ctx.strokeStyle = '#B9AA94'; ctx.lineWidth = 0.006;
      path(ctx, [[-shW * 0.55, shoulderY + torsoH * 0.18], [shW * 0.55, shoulderY + torsoH * 0.18],
                 [shW * 0.75, hipY + torsoH * 0.24], [-shW * 0.75, hipY + torsoH * 0.24]]); ctx.stroke();
    }
    if (top.kind === 'rain') {
      ctx.beginPath();
      ctx.moveTo(-shW * 1.02, shoulderY + 0.01);
      ctx.quadraticCurveTo(0, shoulderY - 0.06, shW * 1.02, shoulderY + 0.01);
      ctx.lineTo(shW * 1.10, hipY + torsoH * 0.18);
      ctx.lineTo(-shW * 1.10, hipY + torsoH * 0.18);
      ctx.closePath();
      ctx.fillStyle = 'rgba(120,160,150,0.55)'; ctx.fill();
    }

    // 纹样
    if (pat.kind !== 'none') drawPattern(ctx, pat.kind, tc, shW, shoulderY, hipY, torsoH);
  }

  function drawPattern(ctx, kind, base, shW, shoulderY, hipY, torsoH) {
    ctx.save();
    ctx.strokeStyle = shade(base, 0.45); ctx.lineWidth = 0.009;
    const y0 = shoulderY + torsoH * 0.12, y1 = hipY + torsoH * 0.02;
    if (kind === 'stripe') {
      for (let y = y0; y < y1; y += 0.045) {
        ctx.beginPath(); ctx.moveTo(-shW * 0.9, y); ctx.lineTo(shW * 0.9, y); ctx.stroke();
      }
    } else if (kind === 'check') {
      for (let y = y0; y < y1; y += 0.05) { ctx.beginPath(); ctx.moveTo(-shW * 0.9, y); ctx.lineTo(shW * 0.9, y); ctx.stroke(); }
      for (let x = -shW * 0.9; x < shW * 0.9; x += 0.05) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
    } else if (kind === 'weave') {
      for (let y = y0; y < y1; y += 0.075) {
        for (let x = -shW * 0.85; x < shW * 0.85; x += 0.075) {
          ctx.beginPath();
          ctx.moveTo(x, y - 0.022); ctx.lineTo(x + 0.024, y); ctx.lineTo(x, y + 0.022); ctx.lineTo(x - 0.024, y);
          ctx.closePath(); ctx.stroke();
        }
      }
    } else if (kind === 'floral') {
      for (let y = y0 + 0.02; y < y1; y += 0.09) {
        for (let x = -shW * 0.7; x < shW * 0.7; x += 0.10) {
          for (let i = 0; i < 5; i++) {
            const a = i / 5 * Math.PI * 2;
            ell(ctx, x + Math.cos(a) * 0.012, y + Math.sin(a) * 0.012, 0.008, 0.008, shade(base, 0.4));
          }
        }
      }
    }
    ctx.restore();
  }

  function drawArms(ctx, top, tc, skin, shW, shoulderY, armLen, hipY, pose, swing, dir) {
    const sleeve = top.kind === 'vest' ? 0 : top.kind === 'tee' || top.kind === 'shirt' ? 0.42 :
                   top.kind === 'rain' ? 1 : 0.92;
    for (let i = 0; i < 2; i++) {
      const sgn = i === 0 ? -1 : 1;
      const sx = sgn * shW * 0.94;
      const sw = swing * sgn * 0.028 * (pose.armSwing ? 1 : 0);
      let ex = sx + sw + sgn * 0.012;
      let ey = shoulderY + armLen;
      if (pose.armUp) {
        ex = sx + sgn * 0.012 + (pose.armUp > 1 ? sgn * 0.03 : 0);
        ey = shoulderY + armLen * (1 - Math.min(1, pose.armUp) * 0.62);
      }
      ctx.beginPath(); ctx.moveTo(sx, shoulderY + 0.01); ctx.lineTo(ex, ey);
      ctx.strokeStyle = tc; ctx.lineWidth = shW * 0.40; ctx.lineCap = 'round'; ctx.stroke();

      const cut = shoulderY + 0.01 + (ey - shoulderY - 0.01) * sleeve;
      if (sleeve < 1) {
        ctx.beginPath(); ctx.moveTo(sx, cut); ctx.lineTo(ex, ey);
        ctx.strokeStyle = skin; ctx.lineWidth = shW * 0.30; ctx.stroke();
        ell(ctx, ex, ey, shW * 0.16, shW * 0.16, skin);
      }
    }
  }

  function drawAccBody(ctx, acc, shW, shoulderY, hipY, torsoH, dir) {
    switch (acc.kind) {
      case 'neck':
        ctx.beginPath(); ctx.arc(0, shoulderY + 0.012, shW * 0.34, 0.15, Math.PI - 0.15);
        ctx.strokeStyle = '#C9CBD0'; ctx.lineWidth = 0.012; ctx.stroke();
        break;
      case 'bag':
        ctx.beginPath(); ctx.moveTo(-shW * 0.9, shoulderY + 0.02); ctx.lineTo(shW * 0.55, hipY + torsoH * 0.02);
        ctx.strokeStyle = '#8A5C34'; ctx.lineWidth = 0.014; ctx.stroke();
        rr(ctx, shW * 0.42, hipY - torsoH * 0.02, shW * 0.62, torsoH * 0.30, 0.012, '#A87448');
        break;
      case 'basket':
        rr(ctx, -shW * 1.35, hipY + torsoH * 0.10, shW * 0.62, torsoH * 0.34, 0.014, '#B79A62');
        break;
      case 'phone':
        rr(ctx, shW * 0.75, hipY + torsoH * 0.10, shW * 0.26, torsoH * 0.16, 0.006, '#2B2F33');
        break;
      default: break;
    }
  }

  function drawHead(ctx, skin, face, cx, cy, w, h, dir, ageId) {
    const rx = w * 0.5, ry = h * 0.5;
    ell(ctx, cx, cy, rx, ry, skin);
    if (face.jaw !== 1) ell(ctx, cx, cy + ry * 0.30, rx * (0.72 + face.jaw * 0.22), ry * 0.34, skin);
    // 耳
    ell(ctx, cx - rx * 0.98, cy + ry * 0.04, rx * 0.14, ry * 0.20, shade(skin, -0.06));
    ell(ctx, cx + rx * 0.98, cy + ry * 0.04, rx * 0.14, ry * 0.20, shade(skin, -0.06));

    // 五官
    const eyeY = cy - ry * 0.10;
    const eyeX = rx * 0.40;
    const eyeR = rx * 0.085;
    const dark = '#2A2320';
    ell(ctx, cx - eyeX, eyeY, eyeR, eyeR * 1.15, dark);
    ell(ctx, cx + eyeX, eyeY, eyeR, eyeR * 1.15, dark);
    // 眉
    ctx.strokeStyle = 'rgba(40,32,26,0.65)'; ctx.lineWidth = 0.006;
    ctx.beginPath(); ctx.moveTo(cx - eyeX - eyeR, eyeY - ry * 0.16); ctx.lineTo(cx - eyeX + eyeR, eyeY - ry * 0.13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + eyeX - eyeR, eyeY - ry * 0.13); ctx.lineTo(cx + eyeX + eyeR, eyeY - ry * 0.16); ctx.stroke();
    // 鼻
    ctx.beginPath(); ctx.moveTo(cx, eyeY + ry * 0.06); ctx.lineTo(cx + rx * 0.04, eyeY + ry * 0.24);
    ctx.strokeStyle = shade(skin, -0.14); ctx.lineWidth = 0.005; ctx.stroke();
    // 嘴
    if (ageId === 'elder') {
      ctx.beginPath(); ctx.moveTo(cx - rx * 0.16, eyeY + ry * 0.42); ctx.lineTo(cx + rx * 0.16, eyeY + ry * 0.42);
      ctx.strokeStyle = '#8A4A42'; ctx.lineWidth = 0.005; ctx.stroke();
    } else {
      ell(ctx, cx, eyeY + ry * 0.42, rx * 0.14, ry * 0.055, '#A85A50');
    }
  }

  function drawHairBack(ctx, kind, cx, cy, w, h, c, dir) {
    const rx = w * 0.5, ry = h * 0.5;
    if (kind === 'longStraight' || kind === 'longWavy' || kind === 'braid') {
      const drop = kind === 'braid' ? 0.55 : 0.78;
      fillPoly(ctx, [[cx - rx * 1.06, cy - ry * 0.1], [cx + rx * 1.06, cy - ry * 0.1],
                     [cx + rx * 1.20, cy + ry * (1 + drop)], [cx - rx * 1.20, cy + ry * (1 + drop)]], c);
    }
    if (kind === 'bun' || kind === 'wrapped') {
      ell(ctx, cx, cy - ry * 1.02, rx * 0.52, ry * 0.42, c);
    }
    if (kind === 'twinTail') {
      ell(ctx, cx - rx * 1.16, cy + ry * 0.9, rx * 0.26, ry * 0.44, c);
      ell(ctx, cx + rx * 1.16, cy + ry * 0.9, rx * 0.26, ry * 0.44, c);
    }
    if (kind === 'ponytail') {
      fillPoly(ctx, [[cx + rx * 0.55, cy - ry * 0.5], [cx + rx * 1.25, cy - ry * 0.2],
                     [cx + rx * 1.05, cy + ry * 1.5], [cx + rx * 0.6, cy + ry * 1.0]], c);
    }
  }

  function drawHairFront(ctx, kind, cx, cy, w, h, c, dir) {
    const rx = w * 0.5, ry = h * 0.5;
    const cap = function (dropY, extraW) {
      // Keep the fringe above the eye line; a full ellipse covers the face.
      const side = rx * (1.04 + (extraW || 0));
      const fringe = cy - ry * (0.42 - dropY * 0.45);
      ctx.beginPath(); ctx.moveTo(cx - side, cy + ry * 0.12);
      ctx.quadraticCurveTo(cx - side * 1.08, cy - ry * 1.12, cx, cy - ry * 1.10);
      ctx.quadraticCurveTo(cx + side * 1.08, cy - ry * 1.12, cx + side, cy + ry * 0.12);
      ctx.lineTo(cx + rx * 0.82, fringe);
      ctx.quadraticCurveTo(cx + rx * 0.3, fringe - ry * 0.15, cx - rx * 0.25, fringe);
      ctx.lineTo(cx - rx * 0.78, fringe + ry * 0.05); ctx.closePath(); ctx.fillStyle = c; ctx.fill();
    };
    switch (kind) {
      case 'buzz': cap(-0.16); break;
      case 'shaved': break;
      case 'short': cap(0.06); break;
      case 'fringe': cap(-0.02, 0.04); break;
      case 'bob': cap(0.18, 0.08); break;
      case 'curly':
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (1.06 + i * 0.145);
          ell(ctx, cx + Math.cos(a) * rx * 0.85, cy + ry * 0.25 + Math.sin(a) * ry * 0.95, rx * 0.30, ry * 0.28, c);
        }
        break;
      case 'topknot':
        cap(0.02);
        ell(ctx, cx, cy - ry * 1.18, rx * 0.28, ry * 0.26, c);
        break;
      default: cap(0.10);
    }
    if (kind === 'longWavy') {
      for (let i = 0; i < 3; i++) {
        ell(ctx, cx - rx * (0.9 + i * 0.10), cy + ry * (0.2 + i * 0.5), rx * 0.30, ry * 0.30, c);
        ell(ctx, cx + rx * (0.9 + i * 0.10), cy + ry * (0.2 + i * 0.5), rx * 0.30, ry * 0.30, c);
      }
    }
  }

  function drawHeadwear(ctx, hw, cx, cy, w, h, hc, dir) {
    const rx = w * 0.5, ry = h * 0.5;
    const topY = cy - ry;
    switch (hw.kind) {
      case 'towel':
        ell(ctx, cx, cy - ry * 0.75, rx * 1.18, ry * 0.50, '#EFEAE0');
        fillPoly(ctx, [[cx - rx * 1.15, cy - ry * 0.5], [cx + rx * 1.15, cy - ry * 0.5],
                       [cx + rx * 1.0, cy - ry * 0.95], [cx - rx * 1.0, cy - ry * 0.95]], '#F6F2EA');
        break;
      case 'conical':
        fillPoly(ctx, [[cx - rx * 1.5, topY - ry * 0.05], [cx + rx * 1.5, topY - ry * 0.05],
                       [cx, topY - ry * 1.35]], '#C9A468');
        ctx.beginPath(); ctx.moveTo(cx - rx * 1.5, topY - ry * 0.05); ctx.lineTo(cx, topY - ry * 0.05);
        ctx.strokeStyle = '#A98647'; ctx.lineWidth = 0.006; ctx.stroke();
        break;
      case 'straw':
        fillPoly(ctx, [[cx - rx * 1.55, topY + ry * 0.02], [cx + rx * 1.55, topY + ry * 0.02],
                       [cx, topY - ry * 1.05]], '#D8BE84');
        break;
      case 'wide':
        ell(ctx, cx, topY + ry * 0.10, rx * 1.85, ry * 0.55, '#DCC48E');
        ell(ctx, cx, topY - ry * 0.24, rx * 0.85, ry * 0.42, '#C8AE78');
        break;
      case 'crown':
        fillPoly(ctx, [[cx - rx * 1.1, cy - ry * 0.62], [cx + rx * 1.1, cy - ry * 0.62],
                       [cx + rx * 0.9, cy - ry * 1.35], [cx - rx * 0.9, cy - ry * 1.35]], '#C9CBD0');
        for (let i = -2; i <= 2; i++) ell(ctx, cx + i * rx * 0.42, cy - ry * 0.90, rx * 0.09, ry * 0.09, '#F0F2F5');
        break;
      case 'cap':
        ell(ctx, cx, topY - ry * 0.10, rx * 1.06, ry * 0.45, '#3A4A5E');
        fillPoly(ctx, [[cx - rx * 1.02, topY + ry * 0.10], [cx - rx * 1.85, topY + ry * 0.02],
                       [cx - rx * 1.02, topY - ry * 0.25]], '#2F3C4C');
        break;
      case 'band':
        fillPoly(ctx, [[cx - rx * 1.05, cy - ry * 0.62], [cx + rx * 1.05, cy - ry * 0.62],
                       [cx + rx * 1.05, cy - ry * 0.82], [cx - rx * 1.05, cy - ry * 0.82]], '#B8402F');
        break;
      default: break;
    }
  }

  function drawAccHead(ctx, acc, cx, cy, w, h, dir) {
    const rx = w * 0.5, ry = h * 0.5;
    if (acc.kind === 'ear') {
      ell(ctx, cx - rx * 1.02, cy - ry * 0.10, rx * 0.08, ry * 0.16, '#D8B24A');
      ell(ctx, cx + rx * 1.02, cy - ry * 0.10, rx * 0.08, ry * 0.16, '#D8B24A');
    }
    if (acc.kind === 'glass') {
      ctx.strokeStyle = 'rgba(60,60,66,0.8)'; ctx.lineWidth = 0.006;
      if (ctx.ellipse) {
        ctx.beginPath(); ctx.ellipse(cx - rx * 0.40, cy - ry * 0.10, rx * 0.22, ry * 0.20, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx + rx * 0.40, cy - ry * 0.10, rx * 0.22, ry * 0.20, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(cx - rx * 0.18, cy - ry * 0.10); ctx.lineTo(cx + rx * 0.18, cy - ry * 0.10); ctx.stroke();
    }
  }

  /* ================= 6. 离屏缓存（微信 / 浏览器通用） ================= */

  function makeCanvas(w, h) {
    if (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') {
      const c = wx.createCanvas(); c.width = w; c.height = h; return c;
    }
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    return null;
  }

  /**
   * LRU 精灵缓存。同屏几十人时用它，不要逐帧走 drawAvatar。
   * 用法：const sp = cache.get(desc, 'idle', 0, 's'); ctx.drawImage(sp.canvas, x - sp.ox, y - sp.oy);
   */
  function createSpriteCache(options) {
    const opt = options || {};
    const max = opt.max || 160;
    const S = opt.size || 96;
    const createCanvas = opt.createCanvas || makeCanvas;
    const map = new Map();

    function keyOf(d, pose, frame, dir) {
      return packCode(d) + '|' + pose + '|' + (frame | 0) + '|' + dir;
    }
    function make(d, pose, frame, dir) {
      const width = Math.ceil(S * 1.6), height = Math.ceil(S * 1.9);
      const cv = createCanvas(width,height);
      if (!cv) return null;
      cv.width = width;
      cv.height = height;
      const cx2 = cv.getContext('2d');
      cx2.clearRect(0, 0, cv.width, cv.height);
      const ox = cv.width / 2, oy = cv.height - S * 0.18;
      drawAvatar(cx2, d, { x: ox, y: oy, s: S, pose: pose, frame: frame, dir: dir });
      return { canvas: cv, ox: ox, oy: oy };
    }
    return {
      get: function (d, pose, frame, dir) {
        const k = keyOf(d, pose, frame, dir);
        let v = map.get(k);
        if (v) { map.delete(k); map.set(k, v); return v; }   // LRU 提升
        v = make(d, pose, frame, dir);
        if (!v) return null;
        map.set(k, v);
        if (map.size > max) {
        const oldest = map.keys().next().value;
        const cached = map.get(oldest);
        cached.canvas.width = cached.canvas.height = 0;
        map.delete(oldest);
      }
        return v;
      },
      clear: function () {
        for (const {canvas} of map.values()) canvas.width = canvas.height = 0;
        map.clear();
      },
      stats: function () { return { size: map.size, max: max }; },
    };
  }

  /* ================= 7. 目录与统计 ================= */

  function catalog() {
    return {
      gender: GENDERS, age: AGES, build: BUILDS, skin: SKINS, face: FACES,
      hair: HAIRS, hairColor: HAIR_COLORS, top: TOPS, topColor: TOP_COLORS,
      pattern: PATTERNS, bottom: BOTTOMS, bottomColor: BOTTOM_COLORS,
      shoes: SHOES, shoeColor: SHOE_COLORS, head: HEADWEAR, acc: ACCS, height: HEIGHTS,
    };
  }

  function stats() {
    let total = 1, visual = 1;
    FIELDS.forEach(function (f) { total *= f[1].length; });
    visual = HAIRS.length * TOPS.length * BOTTOMS.length * HEADWEAR.length * TOP_COLORS.length;
    return { totalCombos: total, visualBuckets: visual, fields: FIELDS.length };
  }

  return {
    catalog: catalog, stats: stats,
    packCode: packCode, parseCode: parseCode,
    normalizeDesc: normalizeDesc, randomDesc: randomDesc,
    applyPreset: applyPreset, PRESETS: PRESETS, compatible: compatible,
    drawAvatar: drawAvatar, createSpriteCache: createSpriteCache,
    POSES: POSES,
  };
});
