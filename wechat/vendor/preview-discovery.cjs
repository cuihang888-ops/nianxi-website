"use strict";

function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// Gregorian windows configure the free preview, not an authoritative local festival calendar.
const FESTIVALS = freeze([
  { id: "munao", name: "目瑙纵歌节", dam: "longchuan", from: [2, 12], to: [2, 18], site: { x: -52, z: 26 }, r: 18, wish: "歌声起处，众心同归 · 纵歌快乐" },
  { id: "songkran", name: "泼水节", dam: "mangshi", from: [4, 10], to: [4, 16], site: { x: 0, z: 40 }, r: 15, wish: "水花落处，旧尘尽洗 · 新年安康" },
  { id: "dengdeng", name: "点灯节", dam: "all", from: [10, 20], to: [10, 26], site: null, r: 14, wish: "一盏心灯，照亮归途 · 平安顺遂" },
]);
const ALBUM_CATALOG = freeze({
  landmarks: [
    { id: "ms-temple", name: "芒市寺院", hint: "芒市坝" }, { id: "ms-lake", name: "孔雀湖", hint: "芒市坝" }, { id: "ms-market", name: "芒市集市", hint: "芒市坝" },
    { id: "rl-pagoda", name: "姐勒金塔", hint: "瑞丽坝" }, { id: "rl-mori", name: "莫里瀑布", hint: "瑞丽坝" }, { id: "rl-banyan", name: "独树成林", hint: "瑞丽坝" }, { id: "rl-lake", name: "弄莫湖", hint: "瑞丽坝" }, { id: "rl-ferry", name: "瑞丽江渡口", hint: "瑞丽坝" },
    { id: "yj-pagoda", name: "允燕塔", hint: "盈江坝" }, { id: "yj-lake", name: "凯邦亚湖", hint: "盈江坝" }, { id: "yj-banyan", name: "榕树王", hint: "盈江坝" }, { id: "yj-tiger", name: "虎跳石", hint: "盈江坝" }, { id: "yj-wheel", name: "大盈江水车", hint: "盈江坝" },
    { id: "lc-zongge", name: "目瑙纵歌场", hint: "陇川坝" }, { id: "lc-farm", name: "陇川马场", hint: "陇川坝" }, { id: "lc-res", name: "麻栗坝水库", hint: "陇川坝" }, { id: "lc-gate", name: "护国古关", hint: "陇川坝" }, { id: "lc-forge", name: "户撒刀坊", hint: "陇川坝" },
    { id: "lh-tea", name: "回龙茶山", hint: "梁河" }, { id: "lh-pagoda", name: "勐底大金塔", hint: "梁河" }, { id: "lh-yamen", name: "南甸宣抚司署", hint: "梁河" }, { id: "lh-gourd", name: "帮盖金葫芦", hint: "梁河" }, { id: "lh-spring", name: "金塔温泉", hint: "梁河" },
  ],
  animals: [{ id: "chicken", name: "土鸡" }, { id: "rabbit", name: "野兔" }, { id: "sheep", name: "山羊" }, { id: "horse", name: "陇川骏马" }],
  festivals: FESTIVALS.map(({ id, name }) => ({ id, name })),
});
// These notes describe the game's imagined places and moments, not local history.
const ALBUM_NOTES = freeze({
  "ms-temple": "芒市坝里的寺院安安静静。走到檐下，把赶路的心放慢一点，再继续今天的旅程。",
  "ms-lake": "湖面把天光收进怀里。沿着岸边走一小段，不必赶路，也不必急着找到什么。",
  "ms-market": "坝子中心留着一片空地，水晶在一旁等候。带着背篓来，摆个小摊，把院子里的收成换成下一份期待。",
  "rl-pagoda": "金色塔影立在瑞丽坝的远处。走散了方向时，抬头看一眼，心里便又有了一个路标。",
  "rl-mori": "山间水声先到，瀑布随后映入眼帘。在这片游戏里的山林中，停一停也是旅程的一部分。",
  "rl-banyan": "枝叶撑起一片树荫，路走到这里便慢下来。站在树下看一会儿远处，什么也不用完成。",
  "rl-lake": "湖水安静地留在坝子的一角。白天看云影，暮色里看天光，一次路过也可以记很久。",
  "rl-ferry": "江边有一处可以歇脚的渡口。望着水面想想下一站，今天到这里，也已经很好。",
  "yj-pagoda": "塔影在盈江坝上留下一个清楚的轮廓。绕着空地走走，把这次相遇收进足迹里。",
  "yj-lake": "山与湖在远处相接。来到这里时不妨慢一点，让眼前的水光陪你待一会儿。",
  "yj-banyan": "大树把枝叶伸向四周，像给路过的人留了一把宽伞。树荫里没有要赶的时间。",
  "yj-tiger": "江边巨石静静守着水面。沿岸走近，看看水与石头相逢的地方，再把脚步交还给古道。",
  "yj-wheel": "水车在江边缓缓转动。看它转过一圈，再转过一圈，心里的事情也可以慢一点。",
  "lc-zongge": "纵歌柱旁留着宽阔的空地。游戏里的节日到来时，可以一起迈几步，让这片坝子热闹一会儿。",
  "lc-farm": "草场给骏马留了奔跑的地方。来看看它们，也想想往后的路上，身边有个伙伴会是什么样。",
  "lc-res": "水面安静地铺在山脚下。风吹过时，明暗一层层移动，像这片坝子正在轻轻呼吸。",
  "lc-gate": "关口立在古道旁，提醒旅人前面还有路。走过这里，给这次远行留下一枚安静的记号。",
  "lc-forge": "刀坊把一角空地留给炉火与手艺。在这片原始世界里，许多事情都值得耐心地做。",
  "lh-tea": "茶山的绿沿坡面慢慢铺开。沿着山边走走，今天不必走得很远，也能遇见新的颜色。",
  "lh-pagoda": "金塔在梁河的天光里静立。把脚步放轻，望一望塔尖，再回到属于自己的日常。",
  "lh-yamen": "深深的院落给这片坝子添了一份宁静。走到门前看一看，让这次路过成为图鉴里的一页。",
  "lh-gourd": "金葫芦给梁河留下一个温暖的轮廓。走到它身边时，把今天的小心愿也轻轻记住。",
  "lh-spring": "温泉旁升起一层轻雾。赶路之后在附近停一停，接下来去哪里，可以一会儿再想。",
  chicken: "院子里的小鸡把寻常一天变得有声有色。来看看它，收一份产出，家就多了一点让人惦记的事。",
  rabbit: "小兔在院子里陪你过慢日子。偶尔走近看一眼，柔软的小身影就成了今天的一份好心情。",
  sheep: "羊在院里安静地待着，给家添了一点踏实。把收好的羊毛放进背篓，等下次去集市时再带上。",
  horse: "陪伴让你和骏马一点点熟悉。喂草、梳理鬃毛，日子久了，它会跟着你，也会听见你的呼唤。",
  songkran: "游戏里的水花轻轻散开，把祝愿送给眼前的人。领过节日礼物之后，也可以再来玩一会儿。",
  munao: "游戏里的节日空地上，脚步跟着节奏轻轻移动。不必跳得熟练，愿意加入就是快乐的一部分。",
  dengdeng: "在游戏里点一盏心灯，看它慢慢升起。把心愿放轻一点，让这一小段安静留在今晚。",
});
const LANDMARK_SPOTS = freeze({
  mangshi: [{ id: "ms-temple", x: -58, z: -58, r: 27 }, { id: "ms-lake", x: 112, z: -18, r: 36 }, { id: "ms-market", x: 4, z: 34, r: 20 }],
  ruili: [{ id: "rl-pagoda", x: 152, z: -118, r: 26 }, { id: "rl-mori", x: -158, z: -104, r: 22 }, { id: "rl-banyan", x: 128, z: 26, r: 17 }, { id: "rl-lake", x: -108, z: 64, r: 26 }, { id: "rl-ferry", x: 8, z: 144, r: 19 }],
  yingjiang: [{ id: "yj-pagoda", x: 96, z: -30, r: 24 }, { id: "yj-lake", x: -168, z: 148, r: 28 }, { id: "yj-banyan", x: -128, z: -88, r: 17 }, { id: "yj-tiger", x: -2, z: 108, r: 17 }, { id: "yj-wheel", x: 15, z: 30, r: 15 }],
  longchuan: [{ id: "lc-zongge", x: -52, z: 26, r: 21 }, { id: "lc-farm", x: 86, z: -58, r: 26 }, { id: "lc-res", x: -52, z: -96, r: 28 }, { id: "lc-gate", x: -150, z: 96, r: 17 }, { id: "lc-forge", x: -96, z: -30, r: 15 }],
  lianghe: [{ id: "lh-tea", x: -142, z: -30, r: 34 }, { id: "lh-pagoda", x: 128, z: -64, r: 26 }, { id: "lh-yamen", x: -20, z: -18, r: 19 }, { id: "lh-gourd", x: -59, z: 89, r: 15 }, { id: "lh-spring", x: 104, z: -34, r: 17 }],
});
const FEST_ACT = freeze({ songkran: "泼水节 · 送上祝福", munao: "目瑙纵歌 · 入场同舞", dengdeng: "点灯节 · 点一盏心灯" });
const MARKET_POS = freeze({
  mangshi: { x: 4, z: 34 }, ruili: { x: 2, z: 18 }, yingjiang: { x: -16, z: -8 },
  longchuan: { x: 16, z: 18 }, lianghe: { x: 26, z: 66 },
});
const FESTIVAL_SITES = freeze({
  songkran: { mangshi: { x: 0, z: 40 }, ruili: { x: 2, z: 18 } },
  munao: { longchuan: { x: -52, z: 26 } },
  dengdeng: { mangshi: { x: -38, z: -44 }, ruili: { x: -27, z: -8 }, yingjiang: { x: -40, z: 6 }, longchuan: { x: -8, z: 30 }, lianghe: { x: -6, z: 8 } },
});
function festSiteFor(fest, dam) {
  const id = typeof fest === "string" ? fest : fest?.id;
  return Object.hasOwn(FESTIVAL_SITES, id) && Object.hasOwn(FESTIVAL_SITES[id], dam) ? FESTIVAL_SITES[id][dam] : null;
}

module.exports = { FESTIVALS, ALBUM_CATALOG, ALBUM_NOTES, LANDMARK_SPOTS, FEST_ACT, FESTIVAL_SITES, MARKET_POS, festSiteFor };
