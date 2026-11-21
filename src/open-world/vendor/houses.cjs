/*! 念西 · 房屋模组 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NXHouses = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KX = 0.62, KY = 0.34, FH = 2.55;
  const TUNABLES = { rentPerComfort: 3.2, salvage: 0.4, wComfort: 0.6, wPrestige: 1.4, wTaste: 18 };

  /* ---------- 确定性随机 ---------- */
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 色板 ---------- */
  const PAL = {
    bamboo:  { wall: '#E3CD9A', dark: '#C6A970', line: '#A98A56', trim: '#F2E4BE' },
    plank:   { wall: '#C79A6A', dark: '#A87E51', line: '#8A6236', trim: '#E2C096' },
    lumber:  { wall: '#A87A50', dark: '#8A6139', line: '#684728', trim: '#C9A176' },
    plaster: { wall: '#EFE7DA', dark: '#D9CEBD', line: '#B4A794', trim: '#FFFFFF' },
    brick:   { wall: '#E2D3BC', dark: '#CBB99B', line: '#9E8B6F', trim: '#F8F2E7' },
    tileFace:{ wall: '#F3EDE3', dark: '#DBD1C0', line: '#B0A592', trim: '#FFFFFF' }
  };
  const ROOF = {
    thatch:  { a: '#C99152', b: '#AE7739', line: '#8C5A26', ridge: '#7A4C1F', soffit: '#8A5C2C' },
    tin:     { a: '#A9B4BC', b: '#8B959D', line: '#6E7981', ridge: '#5B656C', soffit: '#8F9AA2' },
    tileDark:{ a: '#5C5C68', b: '#474751', line: '#33333B', ridge: '#282830', soffit: '#4E4E58' },
    tileRed: { a: '#B06052', b: '#944E42', line: '#7A3D33', ridge: '#683328', soffit: '#9C574A' },
    shingle: { a: '#91714E', b: '#795B3B', line: '#5C4327', ridge: '#4C361F', soffit: '#7B5F40' },
    flat:    { a: '#DDD6C9', b: '#C9C1B2', line: '#ADA392', ridge: '#B6AB99', soffit: '#CFC7B8' }
  };

  /* ---------- 目录 ---------- */
  const STYLES = [
    { id: 'thatch_bamboo', name: '茅草竹楼', family: '杆栏',
      blurb: '竹木立架、棕叶铺顶，寨子边上最便宜的起手屋。',
      tags: ['传统', '低成本', '杆栏'], footprint: { w: 5.5, d: 4 },
      costs: [800, 1400, 2200], comfort: [10, 16, 22], prestige: [1, 3, 6], capacity: [2, 3, 3],
      params: { roof: 'thatch', wall: 'bamboo', stilt: 1.3, storeys: 1, pitch: 1.05 },
      tiers: [{}, { stilt: 1.5, deck: true, railing: true },
              { stilt: 1.6, deck: true, railing: true, lowerEave: true, plants: 1, ridgeOrnament: true }] },

    { id: 'tin_stilt', name: '铁皮杆栏楼', family: '杆栏',
      blurb: '木板墙配镀锌铁皮顶，边境寨子最普遍的一种。',
      tags: ['实用', '杆栏', '临路'], footprint: { w: 6, d: 4.2 },
      costs: [1600, 2600, 4200], comfort: [18, 26, 34], prestige: [4, 7, 11], capacity: [3, 4, 4],
      params: { roof: 'tin', wall: 'plank', stilt: 1.4, storeys: 1, deck: true, pitch: 0.62 },
      tiers: [{}, { railing: true, windows: 2 },
              { railing: true, lowerEave: true, plants: 1, windows: 3 }] },

    { id: 'lumber_cabin', name: '木楞房', family: '山地',
      blurb: '原木横叠、四角咬合，景颇山寨的老做法。',
      tags: ['传统', '山地', '山'], footprint: { w: 5, d: 4 },
      costs: [1800, 3000, 4600], comfort: [20, 28, 36], prestige: [3, 6, 10], capacity: [3, 4, 5],
      params: { roof: 'shingle', wall: 'lumber', stilt: 0.25, storeys: 1, pitch: 0.72, chimney: true },
      tiers: [{}, { windows: 2, plants: 1 },
              { windows: 3, lowerEave: true, plants: 1, annex: true }] },

    { id: 'veranda_wood', name: '前廊木楼', family: '砖木',
      blurb: '一道带栏杆的长廊朝着院子，晒谷纳凉待客都在这儿。',
      tags: ['传统', '临路', '有水'], footprint: { w: 6.5, d: 4.2 },
      costs: [2600, 4200, 6400], comfort: [26, 36, 46], prestige: [6, 10, 15], capacity: [3, 4, 5],
      params: { roof: 'tileDark', wall: 'plank', stilt: 0.9, storeys: 1, deck: true, railing: true, pitch: 0.78 },
      tiers: [{}, { windows: 3, ridgeOrnament: true },
              { storeys: 2, lowerEave: true, windows: 3, plants: 1 }] },

    { id: 'dai_stilt', name: '傣式黑瓦竹楼', family: '傣式',
      blurb: '陡坡黑瓦、高脚架空，屋脊两端起翘。',
      tags: ['傣式', '传统', '杆栏'], footprint: { w: 7, d: 4.6 },
      costs: [6000, 9000, 14000], comfort: [40, 52, 64], prestige: [14, 20, 28], capacity: [4, 5, 6],
      params: { roof: 'tileDark', wall: 'bamboo', stilt: 1.8, storeys: 1, deck: true, railing: true, pitch: 1.15, ridgeOrnament: true },
      tiers: [{}, { windows: 3, deck: true },
              { storeys: 2, lowerEave: true, windows: 3, plants: 2, annex: true }] },

    { id: 'brick_dai', name: '砖混傣式小楼', family: '砖混',
      blurb: '两层小楼，瓷砖贴面，阳台挑出。瑞丽街上最常见的新式傣宅。',
      tags: ['现代', '临路', '体面'], footprint: { w: 6.5, d: 5 },
      costs: [12000, 18000, 26000], comfort: [58, 70, 84], prestige: [22, 30, 40], capacity: [5, 6, 7],
      params: { roof: 'tileRed', wall: 'tileFace', stilt: 0, storeys: 2, pitch: 0.55, balcony: true, windows: 3 },
      tiers: [{}, { lowerEave: true, ridgeOrnament: true, plants: 1 },
              { lowerEave: true, ridgeOrnament: true, plants: 2, waterJar: true }] },

    { id: 'myanmar_villa', name: '缅式金顶宅院', family: '缅式',
      blurb: '院墙围合，屋脊立小金塔。做玉石、木材生意的边贸人家喜欢这么盖。',
      tags: ['缅式', '体面', '临路'], footprint: { w: 7.5, d: 5.5 },
      costs: [22000, 32000, 46000], comfort: [76, 88, 100], prestige: [34, 44, 56], capacity: [6, 7, 8],
      params: { roof: 'tileRed', wall: 'plaster', stilt: 0, storeys: 2, pitch: 1.0,
                courtyard: true, spire: true, ridgeOrnament: true, windows: 3 },
      tiers: [{}, { lowerEave: true, plants: 2 },
              { lowerEave: true, plants: 2, waterJar: true, annex: true }] },

    { id: 'border_shophouse', name: '口岸商住楼', family: '商住',
      blurb: '底商上住，卷帘门一拉开就是铺面，招牌朝着口岸那条街。',
      tags: ['现代', '临路', '商业'], footprint: { w: 6, d: 5.5 },
      costs: [30000, 45000, 65000], comfort: [70, 82, 95], prestige: [40, 52, 66], capacity: [6, 8, 10],
      params: { roof: 'flat', wall: 'plaster', stilt: 0, storeys: 3, windows: 3,
                shopfront: true, sign: true, awning: true },
      tiers: [{}, { plants: 1 }, { plants: 2, waterJar: true, lowerEave: true }] },

    { id: 'dai_compound', name: '傣式大院', family: '傣式',
      blurb: '门楼、院墙、水井、主楼带厢房，一个寨子里只有几户盖得起。',
      tags: ['傣式', '体面', '传统'], footprint: { w: 9, d: 6.5 },
      costs: [38000, 55000, 80000], comfort: [90, 105, 120], prestige: [55, 70, 90], capacity: [8, 10, 12],
      params: { roof: 'tileDark', wall: 'plaster', stilt: 1.2, storeys: 2, pitch: 1.05,
                courtyard: true, ridgeOrnament: true, windows: 3, plants: 2, waterJar: true, well: true },
      tiers: [{}, { lowerEave: true, annex: true },
              { lowerEave: true, annex: true, spire: true, plants: 3 }] }
  ];

  const STYLE_MAP = {};
  STYLES.forEach(function (s) { STYLE_MAP[s.id] = s; });

  const COST_BANDS = [
    { max: 1200, label: '起手', note: '自搭草棚的水准' },
    { max: 2600, label: '温饱', note: '竹楼、铁皮楼，能遮雨' },
    { max: 5200, label: '安稳', note: '木楞房、前廊木楼，像个家' },
    { max: 12000, label: '体面', note: '傣式黑瓦，寨子里过得去的门面' },
    { max: 26000, label: '殷实', note: '砖混小楼，开始讲究' },
    { max: 46000, label: '富户', note: '金顶院、商住楼' },
    { max: Infinity, label: '头人', note: '傣式大院那一档' }
  ];

  /* ---------- 查询 ---------- */
  function clampTier(t) { t = t | 0; return t < 0 ? 0 : t > 2 ? 2 : t; }
  function resolveParams(style, tier) {
    return Object.assign({}, style.params, style.tiers[clampTier(tier)] || {});
  }
  function variantFor(styleId, tier, seed) {
    return hash32(styleId + '|' + clampTier(tier) + '|' + (seed == null ? '' : String(seed)));
  }
  function bandOf(cost) {
    for (let i = 0; i < COST_BANDS.length; i++) if (cost <= COST_BANDS[i].max) return COST_BANDS[i];
    return COST_BANDS[COST_BANDS.length - 1];
  }
  function listBuilds() {
    const out = [];
    STYLES.forEach(function (s) {
      for (let t = 0; t < 3; t++) {
        out.push({ styleId: s.id, name: s.name, family: s.family, tier: t,
          tierName: ['简', '常', '精'][t], cost: s.costs[t], comfort: s.comfort[t],
          prestige: s.prestige[t], capacity: s.capacity[t], footprint: s.footprint,
          tags: s.tags, blurb: s.blurb });
      }
    });
    return out.sort(function (a, b) { return a.cost - b.cost; });
  }

  /* ---------- 经济 ---------- */
  function canBuild(styleId, tier, funds) {
    const s = STYLE_MAP[styleId];
    if (!s) return { ok: false, reason: '未知房型', cost: 0 };
    const cost = s.costs[clampTier(tier)];
    if (funds < cost) return { ok: false, reason: '安币不足', cost: cost, short: cost - funds };
    return { ok: true, cost: cost, short: 0 };
  }
  function upgradeCost(styleId, fromTier, toTier) {
    const s = STYLE_MAP[styleId];
    if (!s) return null;
    let a = clampTier(fromTier), b = clampTier(toTier), total = 0;
    if (b <= a) return 0;
    for (let t = a; t < b; t++) total += s.costs[t + 1] - s.costs[t] * TUNABLES.salvage;
    return Math.round(total);
  }
  function dailyRent(styleId, tier) {
    const s = STYLE_MAP[styleId];
    return s ? Math.round(s.comfort[clampTier(tier)] * TUNABLES.rentPerComfort) : 0;
  }

  /* ---------- 居民选房 ---------- */
  function chooseHouseForResident(resident, options) {
    const opt = options || {};
    const budget = resident && typeof resident.budget === 'number' ? resident.budget : 4000;
    const taste = (resident && resident.taste) || [];
    const maxTier = opt.maxTier == null ? 2 : clampTier(opt.maxTier);
    const rid = (resident && resident.id) || 'anon';
    let best = null;
    STYLES.forEach(function (s) {
      for (let t = 0; t <= maxTier; t++) {
        const cost = s.costs[t];
        if (cost > budget) continue;
        let score = s.comfort[t] * TUNABLES.wComfort + s.prestige[t] * TUNABLES.wPrestige;
        taste.forEach(function (tag) { if (s.tags.indexOf(tag) >= 0) score += TUNABLES.wTaste; });
        score += (hash32(rid + '|' + s.id + '|' + t) % 1000) / 10000;
        if (!best || score > best.score) best = { score: score, styleId: s.id, tier: t, cost: cost };
      }
    });
    if (!best) return { styleId: 'thatch_bamboo', tier: 0, cost: 800, seed: rid, budget: budget, fallback: true };
    best.seed = rid; best.budget = budget;
    return best;
  }

  /* ---------- 存档 ---------- */
  function newBuildRecord(styleId, tier, seed) {
    return { styleId: styleId, tier: clampTier(tier), seed: seed == null ? '' : String(seed) };
  }
  function normalizeBuildRecord(rec) {
    if (!rec || typeof rec !== 'object') return null;
    const id = STYLE_MAP[rec.styleId] ? rec.styleId : 'thatch_bamboo';
    return { styleId: id, tier: clampTier(typeof rec.tier === 'number' ? rec.tier : 0),
             seed: rec.seed == null ? '' : String(rec.seed) };
  }

  /* ---------- 绘制 ---------- */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(Math.min(255, Math.max(0, r * (1 + amt))));
    g = Math.round(Math.min(255, Math.max(0, g * (1 + amt))));
    b = Math.round(Math.min(255, Math.max(0, b * (1 + amt))));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function poly(ctx, pts, fill, stroke, lw) {
    if (!pts || !pts.length) return;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 0.05; ctx.stroke(); }
  }
  function seg(ctx, a, b, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw || 0.05; ctx.stroke();
  }

  function measureHouse(styleId, tier) {
    const s = STYLE_MAP[styleId];
    if (!s) return { w: 10, h: 10, ox: 5, oy: 9 };
    const p = resolveParams(s, clampTier(tier));
    const top = p.stilt + FH * p.storeys;
    const out = p.roof === 'thatch' ? 1.05 : p.roof === 'flat' ? 0.22 : 0.85;
    const rise = p.roof === 'flat' ? 0.9 : (p.pitch || 0.9) * (s.footprint.d / 2 + out * 0.5);
    const xmin = -out - (p.courtyard ? 1.1 : 0);
    const xmax = s.footprint.w + out + (s.footprint.d + out) * KX + 0.3;
    const ytop = -(top + rise) - (s.footprint.d / 2) * KY - 0.4;
    const ybot = (p.courtyard ? 2.0 : 1.4) * KY + 0.3;
    return { w: xmax - xmin, h: ybot - ytop, ox: -xmin, oy: -ytop };
  }

  function drawHouse(ctx, o) {
    const style = STYLE_MAP[o.styleId];
    if (!style) return;
    const tier = clampTier(o.tier);
    const p = resolveParams(style, tier);
    const pal = PAL[p.wall] || PAL.plank;
    const rp = ROOF[p.roof] || ROOF.thatch;
    const rng = mulberry32(variantFor(style.id, tier, o.seed));
    const W = style.footprint.w, D = style.footprint.d;
    const st = p.stilt, top = st + FH * p.storeys;
    const out = p.roof === 'thatch' ? 1.05 : p.roof === 'flat' ? 0.22 : 0.85;
    const rise = p.roof === 'flat' ? 0.9 : (p.pitch || 0.9) * (D / 2 + out * 0.5);
    const ridgeY = D / 2, ridgeZ = top + rise;
    const xL = -out, xR = W + out, yF = -out, yB = D + out, eaveZ = top - 0.06;

    const P = function (x, y, z) { return [x + y * KX, -z - y * KY]; };
    const L1 = 0.045, L2 = 0.08;

    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.translate(o.x || 0, o.y || 0);
    ctx.scale(o.s || 20, o.s || 20);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // 地面阴影
    ctx.save(); ctx.globalAlpha *= 0.16;
    poly(ctx, [P(-0.4, -0.6, 0), P(W + 0.4, -0.6, 0), P(W + 0.4, D + 0.5, 0), P(-0.4, D + 0.5, 0)], '#3A2A18');
    ctx.restore();

    // 架空层
    if (st > 0.15) {
      poly(ctx, [P(0.12, 0.12, st - 0.06), P(W - 0.12, 0.12, st - 0.06),
                 P(W - 0.12, D - 0.12, st - 0.06), P(0.12, D - 0.12, st - 0.06)], '#2C2014');
      const n = Math.max(3, Math.round(W / 1.7) + 1);
      for (let i = 0; i < n; i++) {
        const x = 0.2 + i * (W - 0.4) / (n - 1);
        poly(ctx, [P(x - 0.085, 0.3, 0), P(x + 0.085, 0.3, 0),
                   P(x + 0.085, 0.3, st), P(x - 0.085, 0.3, st)], shade(pal.wall, -0.2), pal.line, L1 * 0.7);
      }
      const m = Math.max(2, Math.round(D / 1.8));
      for (let i = 0; i < m; i++) {
        const y = 0.45 + i * (D - 0.9) / (m - 1);
        poly(ctx, [P(W - 0.13, y - 0.07, 0), P(W - 0.13, y + 0.07, 0),
                   P(W - 0.13, y + 0.07, st), P(W - 0.13, y - 0.07, st)], shade(pal.wall, -0.28), pal.line, L1 * 0.7);
      }
    }

    // 晒台
    if (p.deck) {
      const dy = -1.05;
      poly(ctx, [P(-0.35, dy, st), P(W + 0.35, dy, st), P(W + 0.35, 0.18, st), P(-0.35, 0.18, st)], shade(pal.trim, -0.06));
      poly(ctx, [P(-0.35, dy, st), P(W + 0.35, dy, st), P(W + 0.35, dy, st - 0.18), P(-0.35, dy, st - 0.18)],
           shade(pal.dark, -0.12), pal.line, L1);
      if (p.railing) {
        const n = Math.max(4, Math.round(W / 1.1));
        for (let i = 0; i <= n; i++) {
          const x = -0.3 + i * (W + 0.6) / n;
          poly(ctx, [P(x - 0.045, dy, st), P(x + 0.045, dy, st),
                     P(x + 0.045, dy, st + 0.72), P(x - 0.045, dy, st + 0.72)], shade(pal.trim, -0.02), pal.line, L1 * 0.6);
        }
        seg(ctx, P(-0.35, dy, st + 0.72), P(W + 0.35, dy, st + 0.72), shade(pal.trim, -0.1), L2 * 0.9);
      }
    }

    // 墙体
    poly(ctx, [P(0, 0, st), P(W, 0, st), P(W, 0, top), P(0, 0, top)], pal.wall, pal.line, L1);
    poly(ctx, [P(W, 0, st), P(W, D, st), P(W, D, top), P(W, 0, top)], pal.dark, pal.line, L1);

    if (p.wall === 'plank' || p.wall === 'lumber' || p.wall === 'bamboo') {
      const step = p.wall === 'lumber' ? 0.42 : 0.33;
      for (let z = st + step; z < top - 0.1; z += step) {
        seg(ctx, P(0, 0, z), P(W, 0, z), shade(pal.line, 0.06), L1 * 0.55);
        seg(ctx, P(W, 0.02, z), P(W, D, z), shade(pal.line, -0.16), L1 * 0.55);
      }
    } else {
      for (let f = 1; f < p.storeys; f++) {
        const z = st + f * FH;
        poly(ctx, [P(-0.02, -0.02, z - 0.1), P(W + 0.02, -0.02, z - 0.1),
                   P(W + 0.02, -0.02, z), P(-0.02, -0.02, z)], pal.trim, pal.line, L1 * 0.6);
      }
    }

    // 门窗
    function win(x0, z0, w, h, side) {
      const q = side
        ? [P(W, x0, z0), P(W, x0 + w, z0), P(W, x0 + w, z0 + h), P(W, x0, z0 + h)]
        : [P(x0, 0, z0), P(x0 + w, 0, z0), P(x0 + w, 0, z0 + h), P(x0, 0, z0 + h)];
      poly(ctx, q, shade(pal.trim, 0.04), pal.line, L1 * 0.7);
      const q2 = side
        ? [P(W, x0 + w * 0.16, z0 + h * 0.16), P(W, x0 + w * 0.84, z0 + h * 0.16),
           P(W, x0 + w * 0.84, z0 + h * 0.84), P(W, x0 + w * 0.16, z0 + h * 0.84)]
        : [P(x0 + w * 0.16, 0, z0 + h * 0.16), P(x0 + w * 0.84, 0, z0 + h * 0.16),
           P(x0 + w * 0.84, 0, z0 + h * 0.84), P(x0 + w * 0.16, 0, z0 + h * 0.84)];
      const glassy = p.wall === 'plaster' || p.wall === 'tileFace';
      poly(ctx, q2, glassy ? '#8FA3AA' : '#3E3226');
      if (p.windows >= 3 || p.storeys > 1) seg(ctx,
        side ? P(W, x0 + w / 2, z0 + h * 0.2) : P(x0 + w / 2, 0, z0 + h * 0.2),
        side ? P(W, x0 + w / 2, z0 + h * 0.8) : P(x0 + w / 2, 0, z0 + h * 0.8), shade(pal.line, 0.1), L1 * 0.5);
    }

    const nWin = p.windows || 2;
    for (let f = 0; f < p.storeys; f++) {
      const z0 = st + f * FH + 0.78;
      if (f === 0 && (p.shopfront || !p.deck)) {
        const dw = 0.95, dx = W * 0.5 - dw * 0.5;
        if (p.shopfront) {
          poly(ctx, [P(0.25, 0, st + 0.15), P(W - 0.25, 0, st + 0.15),
                     P(W - 0.25, 0, st + 1.7), P(0.25, 0, st + 1.7)], '#6F8A93');
          for (let i = 1; i < 3; i++) {
            const xx = 0.25 + (W - 0.5) * i / 3;
            seg(ctx, P(xx, 0, st + 0.15), P(xx, 0, st + 1.7), '#DCE7EA', L1 * 0.9);
          }
        } else {
          poly(ctx, [P(dx, 0, st + 0.02), P(dx + dw, 0, st + 0.02),
                     P(dx + dw, 0, st + 1.75), P(dx, 0, st + 1.75)], '#4A3624', pal.line, L1);
          poly(ctx, [P(dx + 0.08, 0, st + 0.1), P(dx + dw - 0.08, 0, st + 0.1),
                     P(dx + dw - 0.08, 0, st + 1.66), P(dx + 0.08, 0, st + 1.66)], '#2F2318');
        }
        if (nWin >= 2) {
          win(W * 0.07, z0, 0.85, 1.0);
          win(W - 0.92, z0, 0.85, 1.0);
        }
      } else {
        for (let i = 0; i < nWin; i++) {
          const span = W / (nWin + 1), ww = Math.min(1.05, span * 0.62);
          win(span * (i + 1) - ww / 2, z0, ww, 1.0);
        }
      }
    }
    if (p.storeys > 1) win(D * 0.42, st + FH + 0.85, 1.0, 0.95, true);

    // 重檐
    if (p.lowerEave && p.roof !== 'flat') {
      const hz = p.storeys > 1 ? st + FH * (p.storeys - 1) : st + FH * 0.62;
      poly(ctx, [P(-0.62, -0.66, hz), P(W + 0.62, -0.66, hz),
                 P(W + 0.62, 0.16, hz + 0.5), P(-0.62, 0.16, hz + 0.5)], rp.a, rp.line, L1);
      poly(ctx, [P(W + 0.62, -0.66, hz), P(W + 0.62, D + 0.4, hz),
                 P(W + 0.05, D + 0.4, hz + 0.5), P(W + 0.05, -0.66, hz + 0.5)], shade(rp.a, -0.14), rp.line, L1);
      seg(ctx, P(-0.62, -0.66, hz), P(W + 0.62, -0.66, hz), shade(rp.ridge, 0.08), L2);
    }

    // 阳台
    if (p.balcony) {
      const bz = st + FH * (p.storeys - 1) + 0.12;
      poly(ctx, [P(0.4, -0.85, bz), P(W - 0.4, -0.85, bz), P(W - 0.4, 0.1, bz), P(0.4, 0.1, bz)], shade(pal.trim, -0.04));
      poly(ctx, [P(0.4, -0.85, bz), P(W - 0.4, -0.85, bz),
                 P(W - 0.4, -0.85, bz - 0.22), P(0.4, -0.85, bz - 0.22)], shade(pal.dark, -0.06), pal.line, L1);
      for (let x = 0.5; x < W - 0.4; x += 0.32) seg(ctx, P(x, -0.85, bz), P(x, -0.85, bz + 0.72), shade(pal.trim, -0.12), L1 * 0.8);
      seg(ctx, P(0.4, -0.85, bz + 0.72), P(W - 0.4, -0.85, bz + 0.72), shade(pal.trim, -0.05), L2 * 0.85);
    }

    // 屋顶
    if (p.roof === 'flat') {
      poly(ctx, [P(0, 0, top), P(W, 0, top), P(W, D, top), P(0, D, top)], shade(rp.a, -0.05));
      poly(ctx, [P(-0.12, -0.12, top), P(W + 0.12, -0.12, top),
                 P(W + 0.12, -0.12, top + 0.52), P(-0.12, -0.12, top + 0.52)], rp.a, rp.line, L1);
      poly(ctx, [P(W + 0.12, -0.12, top), P(W + 0.12, D + 0.12, top),
                 P(W + 0.12, D + 0.12, top + 0.52), P(W + 0.12, -0.12, top + 0.52)], shade(rp.b, -0.05), rp.line, L1);
      poly(ctx, [P(W * 0.55, D * 0.3, top), P(W * 0.55 + 1.6, D * 0.3, top),
                 P(W * 0.55 + 1.6, D * 0.3, top + 1.4), P(W * 0.55, D * 0.3, top + 1.4)], shade(pal.wall, -0.05), pal.line, L1);
      poly(ctx, [P(W * 0.55 - 0.4, D * 0.3 - 0.4, top + 1.4), P(W * 0.55 + 2.0, D * 0.3 - 0.4, top + 1.4),
                 P(W * 0.55 + 2.0, D * 0.3 + 0.05, top + 1.9), P(W * 0.55 - 0.4, D * 0.3 + 0.05, top + 1.9)],
           ROOF.tileRed.a, ROOF.tileRed.line, L1);
    } else {
      poly(ctx, [P(xR, yF, eaveZ), P(xR, yB, eaveZ), P(xR, ridgeY, ridgeZ)], rp.soffit, rp.line, L1);
      poly(ctx, [P(W, 0, top), P(W, D, top), P(W, ridgeY, ridgeZ)], pal.dark, pal.line, L1 * 0.75);
      poly(ctx, [P(xL, yF, eaveZ), P(xR, yF, eaveZ), P(xR, ridgeY, ridgeZ), P(xL, ridgeY, ridgeZ)], rp.a, rp.line, L1);

      const rows = p.roof === 'thatch' ? 14 : p.roof === 'tin' ? 5 : 10;
      for (let i = 1; i < rows; i++) {
        const f = i / rows, y = yF + (ridgeY - yF) * f, z = eaveZ + (ridgeZ - eaveZ) * f;
        seg(ctx, P(xL, y, z), P(xR, y, z), shade(rp.a, -0.1 - rng() * 0.07), L1 * 0.62);
      }
      if (p.roof === 'tin') {
        for (let x = xL + 0.5; x < xR; x += 0.55) seg(ctx, P(x, yF, eaveZ), P(x, ridgeY, ridgeZ), shade(rp.a, -0.13), L1 * 0.5);
        poly(ctx, [P(xL, yF, eaveZ + 0.22), P(xR, yF, eaveZ + 0.22),
                   P(xR, yF + 0.5, eaveZ + 0.5), P(xL, yF + 0.5, eaveZ + 0.5)], 'rgba(255,255,255,0.16)');
      }
      if (p.roof === 'thatch') {
        for (let x = xL - 0.1; x < xR; x += 0.26) seg(ctx, P(x, yF, eaveZ), P(x + 0.06, yF - 0.12, eaveZ - 0.16), shade(rp.b, -0.02), L1 * 0.7);
      }
      poly(ctx, [P(xL, yF, eaveZ), P(xR, yF, eaveZ), P(xR, yF, eaveZ - 0.16), P(xL, yF, eaveZ - 0.16)], shade(rp.ridge, 0.05));
      seg(ctx, P(xL - 0.1, ridgeY, ridgeZ), P(xR + 0.1, ridgeY, ridgeZ), rp.ridge, L2 * 1.5);
      if (p.ridgeOrnament) {
        const ends = [[xL, -1], [xR, 1]];
        for (let i = 0; i < 2; i++) {
          const x = ends[i][0], d = ends[i][1];
          seg(ctx, P(x, ridgeY, ridgeZ), P(x + d * 0.1, ridgeY, ridgeZ + 0.55), rp.ridge, L2 * 0.85);
          seg(ctx, P(x + d * 0.1, ridgeY, ridgeZ + 0.55), P(x + d * 0.32, ridgeY, ridgeZ + 0.42), rp.ridge, L2 * 0.6);
        }
      }
    }

    // 金顶
    if (p.spire) {
      const bx = W * 0.5 + ridgeY * KX, by = -ridgeZ - ridgeY * KY;
      ctx.beginPath(); ctx.moveTo(bx - 0.34, by - 0.18); ctx.lineTo(bx + 0.34, by - 0.18); ctx.lineTo(bx, by + 0.12);
      ctx.closePath(); ctx.fillStyle = '#D9A93C'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx, by - 0.12); ctx.lineTo(bx, by - 1.05);
      ctx.strokeStyle = '#D9A93C'; ctx.lineWidth = 0.13; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, by - 1.16, 0.13, 0, Math.PI * 2); ctx.fillStyle = '#F0CC72'; ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by - 0.08, 0.17, 0, Math.PI * 2); ctx.fillStyle = '#EBC264'; ctx.fill();
    }

    // 院墙与门楼
    if (p.courtyard) {
      const wz = 1.05, wy = -1.75;
      poly(ctx, [P(-0.9, wy, 0), P(-0.9 + W * 0.32, wy, 0),
                 P(-0.9 + W * 0.32, wy, wz), P(-0.9, wy, wz)], shade(pal.wall, -0.06), pal.line, L1);
      poly(ctx, [P(W * 0.62, wy, 0), P(W + 0.9, wy, 0),
                 P(W + 0.9, wy, wz), P(W * 0.62, wy, wz)], shade(pal.wall, -0.06), pal.line, L1);
      poly(ctx, [P(W * 0.32 - 0.28, wy, 0), P(W * 0.32 + 0.28, wy, 0),
                 P(W * 0.32 + 0.28, wy, wz + 0.9), P(W * 0.32 - 0.28, wy, wz + 0.9)], shade(pal.trim, -0.04), pal.line, L1);
      poly(ctx, [P(W * 0.62 - 0.28, wy, 0), P(W * 0.62 + 0.28, wy, 0),
                 P(W * 0.62 + 0.28, wy, wz + 0.9), P(W * 0.62 - 0.28, wy, wz + 0.9)], shade(pal.trim, -0.04), pal.line, L1);
      poly(ctx, [P(W * 0.32 - 0.75, wy - 0.5, wz + 0.85), P(W * 0.62 + 0.75, wy - 0.5, wz + 0.85),
                 P(W * 0.62 + 0.75, wy + 0.3, wz + 1.35), P(W * 0.32 - 0.75, wy + 0.3, wz + 1.35)], rp.a, rp.line, L1);
    }

    // 招牌与雨棚
    if (p.sign) {
      const sz = st + FH * 0.78;
      poly(ctx, [P(0.3, 0, sz), P(W - 0.3, 0, sz), P(W - 0.3, 0, sz + 0.62), P(0.3, 0, sz + 0.62)], '#B8443A', '#7E2C25', L1);
      for (let i = 0; i < 4; i++) {
        const cx = 0.65 + i * 1.15;
        if (cx + 0.3 > W - 0.4) break;
        poly(ctx, [P(cx, 0, sz + 0.12), P(cx + 0.32, 0, sz + 0.12),
                   P(cx + 0.32, 0, sz + 0.5), P(cx, 0, sz + 0.5)], '#F5E6C8');
      }
    }
    if (p.awning) {
      poly(ctx, [P(0.2, 0, st + 1.85), P(W - 0.2, 0, st + 1.85),
                 P(W - 0.2, -1.35, st + 1.45), P(0.2, -1.35, st + 1.45)], 'rgba(206,150,90,0.92)', '#9A6A38', L1);
    }

    // 厢房
    if (p.annex) {
      const aw = 2.6, ad = 2.6, az = st * 0.55, ax = W + 0.1;
      poly(ctx, [P(ax, D - ad, az), P(ax + aw, D - ad, az),
                 P(ax + aw, D - ad, az + 2.0), P(ax, D - ad, az + 2.0)], shade(pal.wall, -0.12), pal.line, L1);
      poly(ctx, [P(ax + aw, D - ad, az), P(ax + aw, D, az),
                 P(ax + aw, D, az + 2.0), P(ax + aw, D - ad, az + 2.0)], shade(pal.dark, -0.1), pal.line, L1);
      poly(ctx, [P(ax - 0.5, D - ad - 0.5, az + 2.0), P(ax + aw + 0.5, D - ad - 0.5, az + 2.0),
                 P(ax + aw + 0.5, D + 0.4, az + 2.7), P(ax - 0.5, D + 0.4, az + 2.7)], rp.a, rp.line, L1);
    }

    // 水缸与水井
    if (p.waterJar) {
      poly(ctx, [P(W * 0.2 - 0.3, -1.25, 0.02), P(W * 0.2 + 0.3, -1.25, 0.02),
                 P(W * 0.2 + 0.24, -1.25, 0.62), P(W * 0.2 - 0.24, -1.25, 0.62)], '#7A6E62', '#5C5248', L1);
    }
    if (p.well) {
      const jx = W * 0.86, jy = -1.15;
      poly(ctx, [P(jx - 0.42, jy, 0), P(jx + 0.42, jy, 0), P(jx + 0.42, jy, 0.58), P(jx - 0.42, jy, 0.58)], '#9AA0A2', '#6E7476', L1);
      seg(ctx, P(jx - 0.55, jy, 0.58), P(jx - 0.55, jy, 1.45), '#7A5A34', L2 * 0.8);
      seg(ctx, P(jx + 0.55, jy, 0.58), P(jx + 0.55, jy, 1.45), '#7A5A34', L2 * 0.8);
      poly(ctx, [P(jx - 0.72, jy - 0.35, 1.45), P(jx + 0.72, jy - 0.35, 1.45),
                 P(jx + 0.72, jy + 0.35, 1.75), P(jx - 0.72, jy + 0.35, 1.75)], ROOF.tileDark.a, ROOF.tileDark.line, L1);
    }

    // 植物
    function plant(px, py, h, palm) {
      const b = P(px, py, 0);
      seg(ctx, b, [b[0], b[1] - h], palm ? '#5C6B3A' : '#4E6B3C', L2 * 0.7);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.42, len = h * (0.42 + (i % 2) * 0.14);
        ctx.beginPath();
        ctx.moveTo(b[0], b[1] - h);
        ctx.quadraticCurveTo(b[0] + Math.cos(a) * len * 0.5, b[1] - h - h * 0.12,
                             b[0] + Math.cos(a) * len, b[1] - h + Math.sin(a) * len * 0.5 + h * 0.34);
        ctx.strokeStyle = palm ? '#6F8347' : '#5A7C46';
        ctx.lineWidth = 0.09; ctx.stroke();
      }
    }
    const nP = p.plants || 0;
    if (nP >= 1) plant(-0.95, -1.5, 2.0, true);
    if (nP >= 2) plant(W + 1.15, -1.2, 2.3, true);
    if (nP >= 3) plant(W * 0.72, -1.85, 1.7, false);

    ctx.restore();
  }

  return {
    TUNABLES: TUNABLES, COST_BANDS: COST_BANDS, STYLES: STYLES, STYLE_MAP: STYLE_MAP,
    listBuilds: listBuilds, resolveParams: resolveParams, variantFor: variantFor, bandOf: bandOf,
    canBuild: canBuild, upgradeCost: upgradeCost, dailyRent: dailyRent,
    chooseHouseForResident: chooseHouseForResident,
    newBuildRecord: newBuildRecord, normalizeBuildRecord: normalizeBuildRecord,
    measureHouse: measureHouse, drawHouse: drawHouse
  };
});
