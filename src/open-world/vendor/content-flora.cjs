/*! 念西 · 植被与农作模组 / content-flora.js
 * 20 种德宏常见植物，同一份数据既用于地图装饰，也用于种养的作物表。
 */
(function (root) {
  const C = root.NXContent;
  if (!C) throw new Error('先加载 content-registry.js');

  const KX = 0.62, KY = 0.34;   // 必须与 house-modules 一致

  const SPECIES = [
    /* id, 名, 画法, 高, 冠幅, 颜色, 生境, 用途 */
    { id: 'banyan',   name: '大青树', kind: 'banyan',  h: 7.0, w: 6.5, c: '#3E5B34', c2: '#557545', biomes: ['寨内', '寺院', '路边'], note: '独树成林，气根垂地' },
    { id: 'bamboo',   name: '凤尾竹', kind: 'clump',   h: 6.0, w: 3.2, c: '#4C6B36', c2: '#6C8C48', biomes: ['寨内', '水边', '路边'], note: '傣家竹楼的材料' },
    { id: 'rubber',   name: '橡胶树', kind: 'rowTree', h: 8.5, w: 4.0, c: '#2E4A32', c2: '#436A46', biomes: ['山地', '坝区'], note: '成排割胶，破晓前作业', row: true },
    { id: 'banana',   name: '芭蕉',   kind: 'banana',  h: 3.2, w: 2.6, c: '#4E7A38', c2: '#79A24A', biomes: ['寨内', '水边'], crop: { item: '芭蕉', yield: 3, days: 40, season: ['雨'] } },
    { id: 'areca',    name: '槟榔',   kind: 'palm',    h: 7.5, w: 2.2, c: '#5A6E38', c2: '#7A9048', biomes: ['寨内'], note: '嚼槟榔的老习惯' },
    { id: 'mango',    name: '芒果',   kind: 'canopy',  h: 4.6, w: 4.4, c: '#3E6034', c2: '#5E8442', biomes: ['寨内', '坝区'], crop: { item: '芒果', yield: 5, days: 90, season: ['干'] } },
    { id: 'jackfruit',name: '菠萝蜜', kind: 'canopy',  h: 5.2, w: 4.8, c: '#33542E', c2: '#4E7439', biomes: ['寨内'], crop: { item: '菠萝蜜', yield: 4, days: 120, season: ['雨'] } },
    { id: 'teak',     name: '柚木',   kind: 'canopy',  h: 9.0, w: 5.0, c: '#4A5E2E', c2: '#6C8440', biomes: ['山地'], note: '落叶，干季光枝' },
    { id: 'tea',      name: '茶',     kind: 'shrub',   h: 1.1, w: 1.6, c: '#37562E', c2: '#527A3C', biomes: ['山地'], crop: { item: '茶叶', yield: 2, days: 30, season: ['雨', '干'] } },
    { id: 'coffee',   name: '咖啡',   kind: 'shrub',   h: 1.9, w: 1.5, c: '#37562E', c2: '#A8402F', biomes: ['山地'], crop: { item: '咖啡豆', yield: 3, days: 60, season: ['干'] } },
    { id: 'rice',     name: '水稻',   kind: 'field',   h: 0.9, w: 3.0, c: '#7E9A3A', c2: '#C0B24E', biomes: ['坝区', '水边'], crop: { item: '稻谷', yield: 8, days: 110, season: ['雨'] } },
    { id: 'sugarcane',name: '甘蔗',   kind: 'cane',    h: 2.8, w: 3.4, c: '#6E8A3A', c2: '#93A84E', biomes: ['坝区'], crop: { item: '甘蔗', yield: 6, days: 240, season: ['干'] } },
    { id: 'dragon',   name: '火龙果', kind: 'post',    h: 1.8, w: 0.9, c: '#4A6B3C', c2: '#C0403A', biomes: ['山地', '坝区'], crop: { item: '火龙果', yield: 4, days: 45, season: ['雨'] } },
    { id: 'dendrobium', name: '石斛', kind: 'epiphyte',h: 0.8, w: 0.7, c: '#5A7A3E', c2: '#C8B24E', biomes: ['山地'], crop: { item: '石斛', yield: 1, days: 150, season: ['雨', '干'] } },
    { id: 'bougain',  name: '三角梅', kind: 'shrub',   h: 2.2, w: 2.2, c: '#3E6034', c2: '#C0507A', biomes: ['寨内', '路边'], note: '几乎全年开' },
    { id: 'lotus',    name: '睡莲',   kind: 'water',   h: 0.35, w: 1.4, c: '#4E7A44', c2: '#E0A0B8', biomes: ['水边'] },
    { id: 'fern',     name: '野蕨',   kind: 'fern',    h: 0.9, w: 1.3, c: '#3E6B34', c2: '#5E8C42', biomes: ['山地', '水边'] },
    { id: 'bodhi',    name: '菩提树', kind: 'banyan',  h: 8.0, w: 7.0, c: '#44603A', c2: '#5E7C4A', biomes: ['寺院'], note: '寺院必有' },
    { id: 'talipot',  name: '贝叶棕', kind: 'palms',   h: 9.5, w: 4.2, c: '#4E6B3A', c2: '#6E8C48', biomes: ['寺院'], note: '贝叶经的叶子' },
    { id: 'kapok',    name: '木棉',   kind: 'canopy',  h: 8.0, w: 4.6, c: '#4A4A30', c2: '#B8443A', biomes: ['路边', '坝区'], note: '干季先花后叶' },
  ];

  const MAP = {};
  SPECIES.forEach(function (s) { MAP[s.id] = s; });

  const BIOMES = ['寨内', '坝区', '山地', '水边', '路边', '寺院'];

  function byBiome(b) { return SPECIES.filter(function (s) { return s.biomes.indexOf(b) >= 0; }); }
  function crops() { return SPECIES.filter(function (s) { return !!s.crop; }); }

  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function drawFlora(ctx, spec, o) {
    const sp = typeof spec === 'string' ? MAP[spec] : spec;
    if (!sp) return;
    const s = o.s || 20;
    const wind = o.wind || 0;
    const sway = Math.sin((o.t || 0) * 1.6 + ((o.x || 0) * 0.01)) * wind * 0.06;
    const rnd = (hash32(sp.id + (o.seed || '')) % 1000) / 1000;

    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    const H = sp.h * (0.85 + rnd * 0.3);
    const W = sp.w * (0.9 + rnd * 0.2);

    // 地面阴影
    ctx.save(); ctx.globalAlpha *= 0.15;
    ctx.beginPath(); ctx.ellipse ? ctx.ellipse(0, 0, W * 0.42, W * 0.16, 0, 0, Math.PI * 2)
      : ctx.arc(0, 0, W * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#2A2012'; ctx.fill(); ctx.restore();

    const K = sp.kind;
    if (K === 'banyan') {
      ctx.strokeStyle = '#5A4A34'; ctx.lineWidth = W * 0.13;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sway * 8, -H * 0.5, sway * 16, -H * 0.72); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.12 + i * 0.19), r = W * (0.34 + (i % 2) * 0.10);
        ctx.beginPath();
        ctx.ellipse ? ctx.ellipse(Math.cos(a) * W * 0.3 + sway * 14, -H * 0.74 + Math.sin(a) * H * 0.10, r, H * 0.13, 0, 0, Math.PI * 2)
          : ctx.arc(Math.cos(a) * W * 0.3, -H * 0.74, r, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? sp.c : sp.c2; ctx.fill();
      }
      // 气根
      ctx.strokeStyle = 'rgba(120,98,70,0.55)'; ctx.lineWidth = W * 0.018;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath(); ctx.moveTo(i * W * 0.11, -H * 0.62);
        ctx.quadraticCurveTo(i * W * 0.13 + sway * 4, -H * 0.3, i * W * 0.14, 0); ctx.stroke();
      }
    } else if (K === 'clump' || K === 'cane' || K === 'field') {
      const n = K === 'field' ? 9 : 6;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1) - 0.5) * W * 0.62;
        const hh = H * (0.72 + ((i * 7) % 5) / 12);
        ctx.strokeStyle = i % 2 ? sp.c : sp.c2; ctx.lineWidth = W * 0.035;
        ctx.beginPath(); ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + sway * 10, -hh * 0.55, x + sway * 22 + (i - n / 2) * W * 0.05, -hh);
        ctx.stroke();
      }
      if (K === 'field') {
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = 'rgba(200,186,88,0.5)';
          ctx.beginPath();
          ctx.ellipse ? ctx.ellipse((i - 2) * W * 0.16, -H * 0.2, W * 0.10, H * 0.05, 0, 0, Math.PI * 2)
            : ctx.arc((i - 2) * W * 0.16, -H * 0.2, W * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (K === 'canopy' || K === 'rowTree' || K === 'shrub') {
      const trunkH = K === 'shrub' ? H * 0.28 : H * 0.55;
      ctx.strokeStyle = '#54432E'; ctx.lineWidth = W * (K === 'shrub' ? 0.04 : 0.075);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sway * 10, -trunkH); ctx.stroke();
      const cy = -trunkH - (H - trunkH) * 0.45;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * (1.12 + i * 0.24);
        const r = (H - trunkH) * 0.46;
        ctx.beginPath();
        ctx.ellipse ? ctx.ellipse(Math.cos(a) * W * 0.22 + sway * 12, cy + Math.sin(a) * r * 0.4, r * 0.78, r * 0.62, 0, 0, Math.PI * 2)
          : ctx.arc(Math.cos(a) * W * 0.22, cy, r * 0.78, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? sp.c : sp.c2; ctx.fill();
      }
      if (sp.crop && sp.crop.item) {
        ctx.fillStyle = '#C88A3A';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse ? ctx.ellipse((i - 1) * W * 0.14, cy + 0.1, 0.06, 0.05, 0, 0, Math.PI * 2)
            : ctx.arc((i - 1) * W * 0.14, cy + 0.1, 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (K === 'palm' || K === 'palms') {
      ctx.strokeStyle = '#6E5E42'; ctx.lineWidth = W * 0.06;
      ctx.beginPath(); ctx.moveTo(sway * 2, 0); ctx.quadraticCurveTo(sway * 10, -H * 0.5, sway * 14, -H); ctx.stroke();
      const fronds = K === 'palms' ? 9 : 6;
      for (let i = 0; i < fronds; i++) {
        const a = -Math.PI / 2 + (i - (fronds - 1) / 2) * 0.42;
        const len = W * (0.42 + (i % 2) * 0.10);
        ctx.beginPath(); ctx.moveTo(sway * 14, -H);
        ctx.quadraticCurveTo(sway * 14 + Math.cos(a) * len * 0.5, -H - H * 0.06,
                             sway * 14 + Math.cos(a) * len, -H + Math.sin(a) * len * 0.55);
        ctx.strokeStyle = i % 2 ? sp.c : sp.c2; ctx.lineWidth = W * 0.045; ctx.stroke();
      }
    } else if (K === 'banana') {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.34;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a) * W * 0.28, -H * 0.5, Math.cos(a) * W * 0.5 + sway * 8, -H * 0.9);
        ctx.strokeStyle = i % 2 ? sp.c : sp.c2; ctx.lineWidth = W * 0.11; ctx.stroke();
      }
    } else if (K === 'post') {   // 火龙果水泥柱
      ctx.fillStyle = '#B8B0A2';
      ctx.fillRect(-W * 0.06, -H, W * 0.12, H);
      ctx.fillStyle = sp.c;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse ? ctx.ellipse((i % 2 ? 1 : -1) * W * 0.10, -H * (0.3 + i * 0.16), W * 0.09, H * 0.10, 0, 0, Math.PI * 2)
          : ctx.arc(0, -H * 0.5, W * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = sp.c2;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(W * 0.12 * (i ? 1 : -1), -H * 0.7, 0.07, 0, Math.PI * 2); ctx.fill(); }
    } else if (K === 'epiphyte') {   // 石斛绑在树干上
      ctx.strokeStyle = '#54432E'; ctx.lineWidth = W * 0.10;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -H * 2.2); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? sp.c : sp.c2;
        ctx.beginPath();
        ctx.ellipse ? ctx.ellipse((i - 1.5) * W * 0.16, -H * (0.8 + i * 0.14), W * 0.14, H * 0.10, 0, 0, Math.PI * 2)
          : ctx.arc(0, -H * 0.9, W * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (K === 'water') {
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, r = W * (0.1 + (i % 3) * 0.07);
        ctx.beginPath();
        ctx.ellipse ? ctx.ellipse(Math.cos(a) * W * 0.3, -H * 0.1 + Math.sin(a) * H * 0.16, r, r * 0.5, 0, 0, Math.PI * 2)
          : ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0 ? sp.c2 : sp.c; ctx.fill();
      }
    } else if (K === 'fern') {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.32;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a) * W * 0.2, -H * 0.7, Math.cos(a) * W * 0.42, -H * 0.85);
        ctx.strokeStyle = i % 2 ? sp.c : sp.c2; ctx.lineWidth = W * 0.06; ctx.stroke();
      }
    }
    ctx.restore();
  }

  /* 精灵缓存：同屏植物多，必须预合成 */
  function createFloraCache(opts) {
    const o = opts || {}, max = o.max || 400, S = o.size || 48;
    const map = new Map();
    function canvasOf(w, h) {
      if (typeof o.createCanvas !== 'function') return null;
      const c = o.createCanvas(); c.width = w; c.height = h; return c;
    }
    return {
      get: function (spec, seed, wind) {
        const id = (typeof spec === 'string' ? spec : spec.id);
        const sp = MAP[id]; if (!sp) return null;
        const w = Math.ceil(sp.w * S * 0.9) + 8, h = Math.ceil(sp.h * S) + 8;
        const k = id + '|' + seed + '|' + Math.round(wind * 10);
        let v = map.get(k);
        if (v) { map.delete(k); map.set(k, v); return v; }
        const cv = canvasOf(w * 2, h + 16); if (!cv) return null;
        const cx2 = cv.getContext('2d');
        drawFlora(cx2, sp, { x: cv.width / 2, y: cv.height - 8, s: S, seed: seed, wind: 0 });
        v = { canvas: cv, ox: cv.width / 2, oy: cv.height - 8 };
        map.set(k, v);
        if (map.size > max) map.delete(map.keys().next().value);
        return v;
      },
      clear: function () { map.clear(); },
    };
  }

  root.NXFlora = {
    KX: KX, KY: KY, SPECIES: SPECIES, MAP: MAP, BIOMES: BIOMES,
    byBiome: byBiome, crops: crops, drawFlora: drawFlora, createFloraCache: createFloraCache,
  };

  if (C) {
    C.definePack({
      id: 'flora', name: '植被与农作', version: 1, saveNs: 'flora',
      defaults: { planted: [], harvested: 0 },
      data: { species: SPECIES, biomes: BIOMES },
    });
  }
})(module.exports = { NXContent: require('./content-registry.cjs') });
module.exports = module.exports.NXFlora;
