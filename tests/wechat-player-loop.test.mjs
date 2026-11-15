import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Daily = require("../wechat/vendor/daily-state.cjs");
const Economy = require("../wechat/vendor/preview-economy.cjs");
const { createHomeController } = await import("../wechat/home-controller.js");
const { createPreviewSave } = await import("../wechat/platform/preview-save.js");
const { createCanvasUI } = require("../wechat/vendor/canvas-ui.cjs");

const DAY = "2026-11-15";
const T0 = Date.parse(DAY + "T00:00:00.000Z");
const T0SEC = Math.floor(T0 / 1000);
const ID = "local-m3x9k2-ab12cd";

// —— 状态层：注册与取名规则 ——

test("registration: name rules, reserved names and id format are enforced", () => {
  for (const bad of ["", "一二三四五六七八九十甲", "有 空格", "安和里", "系统", "Codex", "游客"]) {
    const state = Daily.newPlayerState();
    const result = Daily.registerPlayer(state, bad, { at: T0, id: ID });
    assert.equal(result.ok, false, `name ${JSON.stringify(bad)} must be rejected`);
    assert.equal(result.error.code, "INVALID_NAME");
    assert.equal(state.coins, 0);
    assert.equal(state.player, null);
  }
  const state = Daily.newPlayerState();
  assert.equal(Daily.registerPlayer(state, "松岚", { at: T0, id: "server-issued-1" }).error.code, "INVALID_PLAYER_ID");
  assert.equal(Daily.registerPlayer(state, "松岚", { at: -1, id: ID }).error.code, "INVALID_TIME");
  assert.equal(Daily.validateState(state), true, "failed attempts leave the save valid and untouched");
});

test("registration grant is idempotent across re-entry, rename and repeated calls", () => {
  const state = Daily.newPlayerState();
  assert.equal(Daily.registrationPending(state), true);
  const first = Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
  assert.equal(first.ok, true);
  assert.equal(first.amount, Economy.registrationGrant);
  assert.equal(state.coins, 1000);
  assert.deepEqual(state.grant, { registration1000: { at: T0, amount: 1000 } });
  assert.equal(Daily.registrationPending(state), false);
  assert.equal(Daily.validateState(state), true);
  const again = Daily.registerPlayer(state, "望舒", { at: T0 + 1000, id: "local-zzzzzz-yyyyyy" });
  assert.equal(again.ok, false);
  assert.equal(again.error.code, "ALREADY_REGISTERED");
  assert.equal(state.coins, 1000, "重复登记不重复发钱");
  assert.equal(Daily.renamePlayer(state, "望舒").ok, true);
  assert.equal(state.player.name, "望舒");
  assert.equal(state.player.id, ID, "改名不动登记编号");
  assert.equal(state.coins, 1000, "改名不重发安家金");
  assert.equal(Daily.validateState(state), true);
});

test("legacy saves never register and never receive the grant", () => {
  const legacy = Daily.defaultState();
  assert.equal(Object.hasOwn(legacy, "player"), false);
  assert.equal(Daily.registrationPending(legacy), false);
  const result = Daily.registerPlayer(legacy, "松岚", { at: T0, id: ID });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "REGISTRATION_UNAVAILABLE");
  assert.equal(legacy.coins, Economy.initialCoins, "老存档余额一律不动");
  assert.equal(Daily.validateState(legacy), true);
});

test("forged registration states fail validation", () => {
  const wrongAmount = Daily.newPlayerState();
  wrongAmount.player = { id: ID, name: "松岚" };
  wrongAmount.grant = { registration1000: { at: T0, amount: 999 } };
  assert.equal(Daily.validateState(wrongAmount), false);
  const noGrant = Daily.newPlayerState();
  noGrant.player = { id: ID, name: "松岚" };
  assert.equal(Daily.validateState(noGrant), false, "有登记无发放标记 = 半套档案");
  const noPlayer = Daily.newPlayerState();
  noPlayer.grant = { registration1000: { at: T0, amount: 1000 } };
  assert.equal(Daily.validateState(noPlayer), false, "有发放标记无登记 = 半套档案");
  const reserved = Daily.newPlayerState();
  reserved.player = { id: ID, name: "安和里" };
  reserved.grant = { registration1000: { at: T0, amount: 1000 } };
  assert.equal(Daily.validateState(reserved), false, "保留名不得出现在合法存档里");
  const badHomeName = Daily.newPlayerState();
  Daily.registerPlayer(badHomeName, "松岚", { at: T0, id: ID });
  Daily.claimHome(badHomeName, 0, 0, "ruili");
  badHomeName.home.name = "坏\x01名字";
  assert.equal(Daily.validateState(badHomeName), false);
});

// —— 状态层：完整闭环余额走查 ——

test("full player loop at the state layer balances exactly against the price table", () => {
  const state = Daily.newPlayerState();
  Daily.refreshDaily(state, DAY);
  assert.equal(state.coins, 0, "新档从 0 起，安家金在登记时发");
  assert.equal(Daily.registerPlayer(state, "松岚", { at: T0, id: ID }).ok, true);
  assert.equal(state.coins, 1000);
  assert.equal(Daily.validateState(state), true);

  assert.equal(Daily.claimHome(state, 0, 0, "ruili").ok, true);
  assert.equal(state.coins, 1000 - Economy.plotPrice, "认领样板地 A 扣 400");
  assert.equal(state.home.name, "松岚的家", "家名默认 = 玩家名 + 的家");
  assert.ok(state.home.label.includes("湖畔"), "地址 label 仍保留坝/基址信息");
  assert.equal(Daily.validateState(state), true);

  assert.equal(Daily.buildHomeHut(state).ok, true);
  assert.equal(Daily.openHomeField(state).ok, true);
  assert.equal(state.coins, 600, "草棚与开田免费");
  assert.equal(Daily.plantCarrots(state, T0SEC).ok, true);
  assert.equal(state.coins, 600 - Economy.HOME.BEDS * Economy.HOME.CARROT_SEED_PER_BED, "播种扣 4 畦种子钱 = 72");

  const harvest = Daily.harvestCarrots(state, T0SEC + Economy.HOME.CARROT_GROW_SEC + 1, DAY);
  assert.equal(harvest.ok, true);
  assert.equal(harvest.count, Economy.HOME.BEDS * Economy.HOME.CARROT_YIELD_PER_BED);
  assert.equal(state.home.basket.carrot, 8, "收获入背篓，不直接变钱");
  assert.equal(state.coins, 528);
  assert.equal(state.quests.harvest, true);

  const sale = Daily.sellBasket(state);
  assert.equal(sale.ok, true);
  assert.equal(sale.gain, 8 * Economy.HOME.CARROT_SELL, "8 根萝卜 × 15 = 120");
  assert.equal(state.coins, 648);

  assert.equal(Daily.buyHomeAnimal(state, "chicken", T0SEC + 61).ok, true);
  assert.equal(state.coins, 648 - Economy.HOME.ANIMAL_PRICE.chicken, "鸡 140");
  const collected = Daily.collectHomeProduce(state, T0SEC + 61 + Economy.HOME.PRODUCE_INTERVAL.chicken);
  assert.equal(collected.ok, true);
  assert.equal(state.home.basket.egg, 1, "鸡产出入背篓");
  assert.equal(Daily.sellBasket(state).gain, Economy.HOME.PRODUCE_SELL.egg);
  assert.equal(state.coins, 524);

  assert.equal(Daily.doSignin(state, DAY).ok, true);
  assert.equal(state.coins, 524 + Economy.signinCoins, "签到 +5");
  assert.equal(Daily.markQuest(state, DAY, "fed").changed, true);
  assert.equal(Daily.doJingxin(state, DAY).ok, true);
  assert.equal(Daily.questAllDone(state), true, "喂/收/静心三件齐了");
  assert.equal(Daily.claimQuest(state, DAY).ok, true);
  assert.equal(state.coins, 529 + Economy.questReward, "小确幸 +40");

  const coinsBeforePrayer = state.coins;
  assert.equal(Daily.markPagodaPrayer(state, T0 + 9999).ok, true);
  assert.equal(state.rites.pagodaAt, T0 + 9999, "金塔祈福留下完成标记");
  assert.equal(state.coins, coinsBeforePrayer, "祈福不发币");
  assert.equal(Daily.validateState(state), true);
  assert.equal(state.coins, 1000 - 400 - 72 + 120 - 140 + 16 + 5 + 40, "整圈余额与价格表逐项对齐 = 569");
});

// —— 存档入口：全新存储种入新档，老档原样 ——

function memoryStorage(legacy) {
  const entries = new Map(legacy === undefined ? [] : [["anheli-minigame-v1", legacy]]);
  return { entries, getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

test("preview save seeds a registration-pending state only for brand-new storage", () => {
  const store = memoryStorage();
  const session = createPreviewSave(store, () => 100);
  assert.equal(session.ok, true);
  assert.equal(session.state.player, null);
  assert.equal(session.state.grant, null);
  assert.equal(session.state.coins, 0);
  assert.equal(Daily.registrationPending(session.state), true);
  const reopened = createPreviewSave(store, () => 100);
  assert.equal(reopened.state.player, null, "重开仍是同一份待登记存档，不重复种入");
  assert.equal(reopened.state.coins, 0);
});

test("preview save migrates legacy progress without inventing a registration", () => {
  const original = Daily.defaultState();
  original.coins = 987;
  delete original.latestDay;
  const session = createPreviewSave(memoryStorage(JSON.stringify(original)), () => 100);
  assert.equal(session.ok, true);
  assert.equal(session.state.coins, 987);
  assert.equal(Object.hasOwn(session.state, "player"), false, "老存档不补登记键");
  assert.equal(session.transact(state => Daily.registerPlayer(state, "松岚", { at: T0, id: ID })).ok, false);
  assert.equal(session.state.coins, 987);
});

// —— 控制器层：登记门槛 → 取名面板 → 认领 → 引导线 ——

function loopFixture(initial) {
  const state = initial;
  Daily.refreshDaily(state, DAY);
  let time = T0;
  const toasts = [];
  let actionLabel = "", actionFn = null, namePanelConfig = null;
  const plots = [{ site: 0, idx: 0, claimed: false, hut: false, house: 0, field: false, fieldStage: 0, animals: { chicken: 0, rabbit: 0, sheep: 0 } }];
  let target = null, playerPos = { x: -84, z: 64 };
  const world = {
    setCrystalLit() {}, isDancing: () => false, isResting: () => false, setResting() {},
    isMounted: () => false, setMounted() {}, setMoveInput() {},
    nearestInteractable: () => target?.type === "plot"
      ? { ...target, claimed: plots.find(p => p.site === target.site && p.idx === target.idx)?.claimed ?? target.claimed }
      : target,
    getPlayerPos: () => ({ ...playerPos }),
    getPrayerSite: () => null,
    teleportPlayerTo(x, z) { playerPos = { x, z }; },
    setPlayerYaw() {}, setPrayerPose() {}, setGuideRingVisible() {},
    checkPlotSpot: () => ({ ok: false, reason: "invalid" }),
    getPlots: () => plots.map(p => ({ ...p, animals: { ...p.animals } })),
    getSites: () => [{ x: -64, z: 66 }],
    getHallPos: () => ({ x: -27, z: -8 }),
    getHorsePos: () => null, showHorse() {}, hideHorse() {}, setHorseBond() {},
    markClaimed(site, idx) { plots.find(p => p.site === site && p.idx === idx).claimed = true; },
    buildHut(site, idx) { const p = plots.find(p => p.site === site && p.idx === idx); p.hut = true; p.house = 1; },
    upgradeBamboo(site, idx) { plots.find(p => p.site === site && p.idx === idx).house = 2; },
    openField(site, idx, stage) { const p = plots.find(p => p.site === site && p.idx === idx); p.field = true; p.fieldStage = stage; },
    setFieldStage(site, idx, stage) { plots.find(p => p.site === site && p.idx === idx).fieldStage = stage; },
    addAnimal(site, idx, kind) { plots.find(p => p.site === site && p.idx === idx).animals[kind]++; },
    showHarvestBasket() {}, hideHarvestBasket() {}, showStall() {},
  };
  const ui = {
    markDirty() {}, toast: m => toasts.push(m),
    setAction(label, fn) { actionLabel = label || ""; actionFn = fn || null; },
    setBasket() {}, setExtraRow() {}, isPanelOpen: () => false,
    closePanel() {}, closeTeleport() {}, openPanel() {}, openTeleport() {},
    openNamePanel(config) { namePanelConfig = config; },
  };
  const controller = createHomeController({
    state,
    transact: fn => {
      const draft = structuredClone(state);
      const result = fn(draft);
      if (result?.ok === false) return result;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, draft);
      return { ok: true, result };
    },
    ui, getDamWorld: () => world, setScene() {},
    now: () => time, today: () => DAY,
  });
  return {
    controller, world, state, toasts,
    advance(ms) { time += ms; },
    action: () => ({ label: actionLabel, fn: actionFn }),
    setTarget(value) { target = value; },
    setPlayer(x, z) { playerPos = { x, z }; },
    namePanel: () => namePanelConfig,
    debugClaimPlot(site, idx) { plots.find(p => p.site === site && p.idx === idx).claimed = true; },
  };
}

test("controller gates claiming behind registration, then the loop runs on plot A", () => {
  const f = loopFixture(Daily.newPlayerState());
  f.setTarget({ type: "plot", site: 0, idx: 0, id: "plot_ruili_river_0001_a", reserved: false, claimed: false });
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "先登记入住 · 领安家金再安家", "未登记时动作钮先指向登记");
  assert.equal(f.action().fn(), true);
  assert.ok(f.namePanel(), "登记动作打开取名面板");
  assert.equal(f.state.player, null, "跳过取名可以先逛，不强制登记");
  f.namePanel().onConfirm("松岚");
  assert.equal(f.state.player.name, "松岚");
  assert.equal(f.state.coins, 1000, "确认名字即发放安家金");
  assert.equal(Daily.validateState(f.state), true);

  f.controller.update(3, f.world);
  assert.equal(f.action().label, "在此安家 · 400 安币");
  assert.ok(f.action().fn().ok);
  assert.equal(f.state.coins, 600);
  assert.equal(f.state.home.name, "松岚的家");

  f.controller.update(3, f.world);
  assert.equal(f.action().label, "搭草棚 · 免费");
  f.action().fn();
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "开第一块田 · 免费");
  f.action().fn();
  f.controller.update(3, f.world);
  assert.ok(f.action().label.startsWith("种萝卜"));
  f.action().fn();
  assert.equal(f.state.coins, 528);
  f.advance((Economy.HOME.CARROT_GROW_SEC + 2) * 1000);
  f.controller.update(3, f.world);
  assert.ok(f.action().label.startsWith("收获萝卜"), f.action().label);
  f.action().fn();
  assert.equal(f.state.home.basket.carrot, 8);
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "背篓有货了 · 去集市摆摊卖", "收完第一篓，引导指向集市");

  f.setTarget(null);
  f.setPlayer(2, 18); // 瑞丽集市卖货点
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "摆摊卖货 · +120 安币");
  f.action().fn();
  assert.equal(f.state.coins, 648, "卖货入账与价格表一致");
  assert.equal(Daily.basketValue(f.state), 0);
});

test("controller keeps the legacy claim flow and the reserved-plot refusal", () => {
  const legacy = loopFixture(Daily.defaultState());
  legacy.setTarget({ type: "plot", site: 0, idx: 0, id: "plot_ruili_river_0001_a", reserved: false, claimed: false });
  legacy.controller.update(3, legacy.world);
  assert.equal(legacy.action().label, "在此安家 · 400 安币", "老存档不被登记门槛拦住");

  const f = loopFixture(Daily.newPlayerState());
  f.namePanel; // 未登记也不影响预留地的拒绝口径
  f.setTarget({ type: "plot", site: 0, idx: 2, id: "plot_ruili_river_0001_c", reserved: true, claimed: false });
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "预留地 · 尚未开放", "C 地块保持预留");
  const coins = f.state.coins;
  assert.equal(f.action().fn(), true);
  assert.equal(f.state.coins, coins);
  assert.equal(f.state.home, null);
});

test("guidance points a registered, established home to the pagoda until the prayer is marked", () => {
  const state = Daily.newPlayerState();
  Daily.registerPlayer(state, "松岚", { at: T0, id: ID });
  Daily.claimHome(state, 0, 0, "ruili");
  Daily.buildHomeHut(state);
  Daily.openHomeField(state);
  Daily.plantCarrots(state, T0SEC);
  Daily.harvestCarrots(state, T0SEC + 61, DAY);
  Daily.sellBasket(state);
  for (const kind of ["chicken", "rabbit", "sheep"]) Daily.buyHomeAnimal(state, kind, T0SEC + 61);
  state.coins += 1000; // 测试内补足竹楼钱，余额断言只看引导标签
  Daily.upgradeHomeBamboo(state);
  Daily.plantCarrots(state, T0SEC + 61);
  const f = loopFixture(state);
  f.debugClaimPlot(0, 0);
  f.setTarget({ type: "plot", site: 0, idx: 0, claimed: true });
  f.controller.update(3, f.world);
  assert.equal(f.action().label, "去金塔祈福 · 在瑞丽坝东北塔山");
  assert.equal(f.action().fn(), true);
  Daily.markPagodaPrayer(state, T0 + 5000);
  f.controller.update(3, f.world);
  assert.notEqual(f.action().label, "去金塔祈福 · 在瑞丽坝东北塔山", "祈福完成后引导收起");
});

// —— 界面层：大厅登记行与取名面板 ——

function fakeCanvas() {
  const calls = [];
  const ctx = {
    font: "12px sans-serif", textAlign: "left", fillStyle: "",
    setTransform() {}, clearRect() { calls.length = 0; },
    beginPath() {}, closePath() {}, moveTo() {},
    fill() {}, stroke() {}, fillRect() {},
    arc(x, y, radius) { calls.push({ type: "arc", x, y, radius }); },
    arcTo(x, y) { calls.push({ type: "point", x, y }); },
    measureText(value) {
      const size = Number(this.font.match(/[\d.]+(?=px)/)?.[0] || 12);
      return { width: Array.from(String(value)).reduce((width, char) => width + size * (/[^\x00-\x7f]/.test(char) ? 1 : 0.55), 0) };
    },
    fillText(value, x, y) { calls.push({ type: "text", value: String(value) }); },
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, calls };
}

function uiFixture(state, options = {}) {
  const drawing = fakeCanvas();
  const ui = createCanvasUI({
    canvas: drawing.canvas, state, today: () => DAY, now: () => 0,
    save: () => ({ ok: true }), ...options,
  });
  ui.resize(390, 844, 2);
  return { ui, calls: drawing.calls };
}

function tap(ui, id) {
  const rect = ui.getHitRects().find(button => button.id === id);
  assert.ok(rect, `Missing ${id} control`);
  return ui.handleTap(rect.x + rect.w / 2, rect.y + rect.h / 2);
}

test("hall offers registration only to pending saves and name rows after", () => {
  const external = [];
  const pending = uiFixture(Daily.newPlayerState(), { onExternal: id => external.push(id) });
  pending.ui.openPanel();
  tap(pending.ui, "register");
  assert.deepEqual(external, ["register"]);

  const registered = Daily.newPlayerState();
  Daily.registerPlayer(registered, "松岚", { at: T0, id: ID });
  Daily.claimHome(registered, 0, 0, "ruili");
  const settled = uiFixture(registered, { onExternal: id => external.push(id) });
  settled.ui.openPanel();
  const ids = settled.ui.getHitRects().map(rect => rect.id);
  assert.ok(!ids.includes("register"), "登记完成后不再出现登记行");
  const texts = settled.calls.filter(call => call.type === "text").map(call => call.value).join(" ");
  assert.ok(texts.includes("松岚的家"), "大厅显示家的名字");
});

test("name panel picks a name in two taps and never claims to be online", () => {
  const state = Daily.newPlayerState();
  const { ui, calls } = uiFixture(state);
  let confirmed = null;
  ui.openNamePanel({
    title: "登记入住 · 安和里",
    subtitle: "给自己取个名字，登记后领 1000 安币安家金。名字和安家金先记在这台设备上。",
    names: Daily.NAME_IDEAS, confirmLabel: "就这个名字", skipLabel: "先逛逛",
    onConfirm: name => { confirmed = name; },
  });
  assert.equal(ui.isPanelOpen(), true);
  tap(ui, "nm-ok"); // 未选名字时确认键禁用，点了不该有反应
  assert.equal(confirmed, null);
  tap(ui, "nm:0");
  tap(ui, "nm-ok");
  assert.equal(confirmed, Daily.NAME_IDEAS[0]);
  assert.equal(ui.isPanelOpen(), false);
  const drawn = calls.filter(call => call.type === "text").map(call => call.value).join(" ");
  assert.ok(!/已联网|云存档|服务器已保存/.test(drawn), "界面文案不假称联网/云存档");
});
