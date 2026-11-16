/*! 念西 · 天气与节庆模组 / content-weather-festival.js
 * 天气影响种植节奏；节庆只读日历，不写日历。
 */
(function (root) {
  const C = root.NXContent;
  if (!C) throw new Error('先加载 content-registry.js');

  /* ---------- 天气 ---------- */
  const SEASONS = [
    { id: 'dry',  name: '干季', months: [11, 12, 1, 2, 3, 4], growth: 0.75, note: '晴、雾、少雨' },
    { id: 'rain', name: '雨季', months: [5, 6, 7, 8, 9, 10], growth: 1.15, note: '午后雷雨、湿热' },
  ];

  const WEATHER = [
    { id: 'clear',  name: '晴',   rain: 0,    fog: 0,    tint: '#FFE9C8', amb: 1.00, wind: 0.2 },
    { id: 'cloudy', name: '多云', rain: 0,    fog: 0.04, tint: '#CFD6DC', amb: 0.94, wind: 0.4 },
    { id: 'mist',   name: '晨雾', rain: 0,    fog: 0.42, tint: '#DCE4E8', amb: 0.88, wind: 0.05, morning: true },
    { id: 'drizzle',name: '小雨', rain: 0.35, fog: 0.18, tint: '#A8B4BC', amb: 0.82, wind: 0.5 },
    { id: 'rain',   name: '雨',   rain: 0.75, fog: 0.22, tint: '#94A2AC', amb: 0.76, wind: 0.8 },
    { id: 'storm',  name: '雷雨', rain: 1.00, fog: 0.30, tint: '#7A8894', amb: 0.68, wind: 1.0, lightning: true },
  ];

  function seasonOf(month) {
    for (let i = 0; i < SEASONS.length; i++) if (SEASONS[i].months.indexOf(month) >= 0) return SEASONS[i];
    return SEASONS[0];
  }

  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /** 确定性天气：同一天永远是同一个天气，读档重进不会变 */
  function weatherFor(dayKey) {
    const h = hash32('wx:' + dayKey);
    const r = h / 4294967296;
    const month = parseInt(String(dayKey).split('-')[1], 10) || 1;
    const s = seasonOf(month);
    if (s.id === 'rain') {
      if (r < 0.44) return WEATHER[4];
      if (r < 0.60) return WEATHER[3];
      if (r < 0.68) return WEATHER[5];
      if (r < 0.86) return WEATHER[1];
      return WEATHER[0];
    }
    if (r < 0.14) return WEATHER[2];
    if (r < 0.24) return WEATHER[1];
    if (r < 0.30) return WEATHER[3];
    return WEATHER[0];
  }

  /** 雨滴粒子。只给绘制用，不入档。 */
  function makeRain(o) {
    const opt = o || {}, n = opt.count || 160, W = opt.w || 400, H = opt.h || 700;
    const drops = [];
    for (let i = 0; i < n; i++) {
      drops.push({ x: Math.random() * W, y: Math.random() * H, v: 8 + Math.random() * 10, l: 8 + Math.random() * 16 });
    }
    return {
      step: function (dt, intensity) {
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          d.y += d.v * dt * 60 * intensity; d.x += d.v * dt * 8 * intensity;
          if (d.y > H) { d.y = -10; d.x = Math.random() * W; }
          if (d.x > W) d.x -= W;
        }
      },
      draw: function (ctx, alpha) {
        ctx.save(); ctx.globalAlpha = 0.42 * alpha; ctx.strokeStyle = '#C8D8E0'; ctx.lineWidth = 1.2;
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.l); ctx.stroke();
        }
        ctx.restore();
      },
    };
  }

  /* ---------- 节庆 ----------
   * date 用公历近似值；lunar:true 的必须由主项目日历换算，这里只放规则和活动。
   * 本模组只读日期，绝不写日历、不改日历校验。
   */
  const FESTIVALS = [
    { id: 'water', name: '泼水节', people: '傣族', lunar: false, month: 4, day: 13, span: 3,
      places: ['ruili', 'mangshi'],
      steps: ['采花', '浴佛', '泼水', '赛龙舟', '赶摆'],
      note: '傣历新年，最热闹的一场',
      items: ['清水', '彩线', '花环'] },
    { id: 'munao', name: '目瑙纵歌', people: '景颇族', lunar: true, month: 1, day: 15, span: 3,
      places: ['longchuan', 'ruili'],
      steps: ['立目瑙柱', '祭鬼', '纵歌', '织锦展'],
      note: '万人共舞，鼓点一起就停不下来',
      items: ['银泡', '织锦筒裙', '长刀'] },
    { id: 'aluwo', name: '阿露窝罗节', people: '阿昌族', lunar: true, month: 1, day: 4, span: 2,
      places: ['lianghe', 'longchuan'],
      steps: ['祭祖', '蹬窝罗', '户撒刀展'],
      note: '户撒刀是这一天的主角',
      items: ['户撒刀', '葫芦笙'] },
    { id: 'jiaohua', name: '浇花节', people: '德昂族', lunar: false, month: 4, day: 12, span: 3,
      places: ['ruili', 'yingjiang'],
      steps: ['采花', '浴佛', '浇花'],
      note: '与泼水节同期，但仪式更静',
      items: ['鲜花', '清水'] },
    { id: 'kuoshi', name: '阔时节', people: '傈僳族', lunar: false, month: 12, day: 20, span: 3,
      places: ['yingjiang', 'ruili'],
      steps: ['祭山', '射弩', '对歌', '上刀杆'],
      note: '一年的开始',
      items: ['弩', '彩线'] },
  ];

  function festivalsIn(regionId, month, day) {
    return FESTIVALS.filter(function (f) {
      if (f.places.indexOf(regionId) < 0) return false;
      const start = f.month * 100 + f.day, cur = month * 100 + day;
      const end = start + f.span - 1;
      return cur >= start && cur <= end;
    });
  }

  root.NXWeather = {
    SEASONS: SEASONS, WEATHER: WEATHER, FESTIVALS: FESTIVALS,
    seasonOf: seasonOf, weatherFor: weatherFor, makeRain: makeRain, festivalsIn: festivalsIn,
  };

  if (C) {
    C.definePack({
      id: 'weather', name: '天气与节庆', version: 1, saveNs: 'weather',
      defaults: { day: null, activeFestival: null },
      requires: ['flora'],
      data: { weather: WEATHER, festivals: FESTIVALS },
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
