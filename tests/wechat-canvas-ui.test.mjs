import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createCanvasUI } = require("../wechat/vendor/canvas-ui.cjs");
const Daily = require("../wechat/vendor/daily-state.cjs");
const DAY = "2026-11-13";

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
    fillText(value, x, y) {
      const width = this.measureText(value).width;
      const height = Number(this.font.match(/[\d.]+(?=px)/)?.[0] || 12);
      const left = x - (this.textAlign === "center" ? width / 2 : this.textAlign === "right" ? width : 0);
      calls.push({ type: "text", value, x, y, left, right: left + width, top: y - height / 2, bottom: y + height / 2, color: this.fillStyle });
    },
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, calls };
}

function fixture(options = {}) {
  const drawing = fakeCanvas();
  const state = Daily.defaultState();
  Daily.refreshDaily(state, DAY);
  let time = 0, saves = 0;
  const ui = createCanvasUI({
    canvas: drawing.canvas, state, today: () => DAY, now: () => time,
    save: () => { saves++; return { ok: true }; }, ...options,
  });
  ui.resize(320, 568, 2);
  return { ...drawing, state, ui, time: value => { time = value; }, saves: () => saves };
}

function tap(ui, id) {
  const rect = ui.getHitRects().find(button => button.id === id);
  assert.ok(rect, `Missing ${id} control`);
  assert.equal(ui.handleTap(rect.x + rect.w / 2, rect.y + rect.h / 2), true);
}

function findHallControl(ui, id) {
  for (let page = 0; page < 8; page++) {
    const rects = ui.getHitRects();
    if (rects.some(rect => rect.id === id)) return;
    if (!rects.some(rect => rect.id === "hall-next" && rect.enabled)) break;
    tap(ui, "hall-next");
  }
  assert.fail("Missing hall control " + id);
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function assertTextWithin(calls, bounds) {
  for (const call of calls.filter(call => call.type === "text")) {
    assert.ok(call.left >= bounds.left - 0.01, `${call.value} overflows left: ${call.left}`);
    assert.ok(call.right <= bounds.right + 0.01, `${call.value} overflows right: ${call.right}`);
    assert.ok(call.top >= bounds.top - 0.01, `${call.value} overflows top: ${call.top}`);
    assert.ok(call.bottom <= bounds.bottom + 0.01, `${call.value} overflows bottom: ${call.bottom}`);
  }
}

test("basket badge respects safe insets, avoids long weather labels and only redraws on change", () => {
  for (const [width, height, insets] of [[320, 568, { safeTop: 44, safeBottom: 34, safeLeft: 12, safeRight: 12 }], [667, 375, { safeTop: 20, safeBottom: 24, safeLeft: 44, safeRight: 44 }]]) {
    const { ui, calls } = fixture({ onNextScene() {} });
    ui.resize(width, height, 2, insets);
    ui.setSceneName("瑞丽坝 · 雨季傍晚细雨绵绵，安静等候天晴");
    ui.setBasket("背篓 9999999 件 · 胡萝卜鸡蛋羊毛兔绒");
    ui.draw();
    const badge = calls.find(call => call.type === "text" && call.value.startsWith("背篓"));
    const scene = calls.find(call => call.type === "text" && call.value.startsWith("瑞丽坝"));
    assert.ok(badge && scene); assert.ok(badge.bottom < scene.top);
    assertTextWithin(calls, { left: insets.safeLeft, right: width - insets.safeRight, top: insets.safeTop, bottom: height - insets.safeBottom });
    assert.equal(ui.update(), false);
    ui.setBasket("背篓 9999999 件 · 胡萝卜鸡蛋羊毛兔绒"); assert.equal(ui.update(), false);
    ui.setBasket(null); assert.equal(ui.update(), true); ui.draw();
    assert.equal(calls.some(call => call.type === "text" && call.value.startsWith("背篓")), false);
    assert.equal(ui.getHitRects().some(rect => rect.id.includes("basket")), false, "status badge adds no action hit area");
  }
});

test("travel chooser preserves each road or teleport price label", () => {
  const { ui, calls } = fixture();
  ui.openTeleport([{ id: "road", label: "古道去瑞丽坝", right: "免费" }, { id: "teleport", label: "传送瑞丽坝", right: "0.5 安币" }], () => ({ ok: true }));
  ui.draw();
  const texts = calls.filter(call => call.type === "text").map(call => call.value);
  assert.ok(texts.includes("免费")); assert.ok(texts.includes("0.5 安币"));
  assert.ok(texts.includes("行旅免费 · 传送 0.5 安币"));
  assert.equal(texts.includes("每次 0.5 安币"), false);
  assertTextWithin(calls, { left: 0, right: 320, top: 0, bottom: 568 });
});

test("narrow action buttons keep numeric coin amounts intact on one line", () => {
  const { ui, calls } = fixture();
  for (const [label, amount] of [["摆摊卖货 · +120 安币", "+120 安币"], ["摆摊卖货 · +12345.5 安币", "+12345.5 安币"], ["在此安家 · 400 安币", "400 安币"]]) {
    ui.setAction(label, () => {}); ui.draw();
    const rect = ui.getHitRects().find(item => item.id === "action");
    const actionText = calls.filter(call => call.type === "text" && call.color === "#fff8e6");
    assert.ok(actionText.some(call => call.value.includes(amount)), label);
    assertTextWithin(actionText, { left: rect.x, right: rect.x + rect.w, top: rect.y, bottom: rect.y + rect.h });
  }
});

test("collected album notes are fully readable across narrow and landscape detail pages", () => {
  for (const [width, height, insets] of [[320, 568, { safeTop: 44, safeBottom: 34, safeLeft: 12, safeRight: 12 }], [667, 375, { safeTop: 20, safeBottom: 24, safeLeft: 44, safeRight: 44 }]]) {
    const { ui, calls } = fixture();
    ui.resize(width, height, 2, insets);
    const note = "山水之间有一条安静的古道，走过林荫，听见河水。".repeat(18);
    ui.openAlbum([{ type: "group", text: "德宏手记" }, { type: "item", name: "瑞丽江畔的古道", got: true, note }, { type: "item", name: "未到之处", got: false, hint: "走近看看", note: "隐藏的手记" }]);
    ui.draw();
    assert.ok(ui.getHitRects().some(rect => rect.id === "al:1"));
    assert.equal(ui.getHitRects().some(rect => rect.id === "al:2"), false);
    tap(ui, "al:1");
    let read = "", pages = 0;
    for (let i = 0; i < 50; i++) {
      ui.draw(); pages++;
      const rects = ui.getHitRects(), back = rects.find(rect => rect.id === "album-back"), close = rects.find(rect => rect.id === "album-close");
      const next = rects.find(rect => rect.id === "album-detail-next");
      assert.ok(back && close && next);
      const body = calls.filter(call => call.type === "text" && call.color === "#5a5344" && call.top > back.y + back.h && call.bottom < next.y);
      read += body.map(call => call.value).join("");
      for (const line of body) assert.ok(line.top > back.y + back.h && line.bottom < next.y);
      assertTextWithin(calls, { left: insets.safeLeft, right: width - insets.safeRight, top: insets.safeTop, bottom: height - insets.safeBottom });
      assert.equal(ui.getHitRects().some(rect => rect.id === "al:1"), false, "detail traps item clicks");
      if (!next.enabled) break;
      tap(ui, "album-detail-next");
    }
    assert.ok(pages > 1); assert.equal(read, note);
    tap(ui, "album-back"); assert.equal(ui.isAlbumOpen(), true);
    assert.ok(ui.getHitRects().some(rect => rect.id === "al:1"));
    tap(ui, "al:1"); tap(ui, "album-close"); assert.equal(ui.isAlbumOpen(), false);
    ui.openAlbum([{ type: "item", name: "新手记", got: true, note: "新的内容" }]);
    assert.ok(ui.getHitRects().some(rect => rect.id === "al:0"));
    assert.equal(ui.getHitRects().some(rect => rect.id === "album-back"), false, "opening a new album clears old detail state");
  }
});

test("safe area keeps all controls and text visible at 320px width and 375px landscape height", () => {
  for (const [width, height, insets] of [
    [320, 568, { safeLeft: 0, safeRight: 0, safeTop: 44, safeBottom: 34 }],
    [667, 375, { safeLeft: 44, safeRight: 44, safeTop: 20, safeBottom: 24 }],
    [320, 375, { safeLeft: 12, safeRight: 12, safeTop: 30, safeBottom: 20 }],
  ]) {
    const { ui, calls, state, canvas } = fixture({ onNextScene() {} });
    state.home = { label: "瑞丽江畔安和里家园" };
    ui.resize(width, height, 2, insets);
    ui.setSceneName("德宏原野 · 瑞丽江畔");
    ui.setAction("在瑞丽江畔安家", () => {});
    ui.setJoystickVisible(true);
    ui.draw();
    assert.equal(canvas.width, width * 2);
    assert.equal(canvas.height, height * 2);
    const bounds = { left: insets.safeLeft, right: width - insets.safeRight, top: insets.safeTop, bottom: height - insets.safeBottom };
    assertTextWithin(calls, bounds);
    const rects = ui.getHitRects();
    for (const rect of rects) {
      assert.ok(rect.x >= bounds.left && rect.y >= bounds.top);
      assert.ok(rect.x + rect.w <= bounds.right && rect.y + rect.h <= bounds.bottom);
      for (const other of rects) if (other !== rect) assert.equal(overlaps(rect, other), false);
    }
    const joystick = ui.getJoystickGeometry();
    const joystickRect = { x: joystick.x - joystick.radius, y: joystick.y - joystick.radius, w: joystick.radius * 2, h: joystick.radius * 2 };
    for (const rect of rects) assert.equal(overlaps(joystickRect, rect), false);
    ui.openPanel();
    ui.draw();
    assertTextWithin(calls, bounds);
    const panel = ui.getHitRects().find(rect => rect.id === "panel");
    const foundRows = new Set();
    for (let page = 0; page < 4; page++) {
      const rects = ui.getHitRects();
      const rows = rects.filter(rect => ["jingxin", "signin", "quest", "go-home"].includes(rect.id));
      for (const row of rows) {
        foundRows.add(row.id);
        assert.ok(row.h >= 38);
        assert.ok(row.y >= panel.y && row.y + row.h < panel.y + panel.h);
        for (const other of rows) if (other !== row) assert.equal(overlaps(row, other), false);
      }
      assertTextWithin(calls, bounds);
      if (!rects.some(rect => rect.id === "hall-next" && rect.enabled)) break;
      tap(ui, "hall-next");
    }
    assert.equal(foundRows.size, 4);
    assert.equal(ui.getHitRects().some(rect => rect.id === "next-scene"), false);
    assert.equal(ui.containsControl(0, 0), true);
  }
});

test("long toast and daily quest copy wrap without leaving the safe viewport", () => {
  const { ui, calls } = fixture();
  ui.resize(320, 568, 1, { safeLeft: 12, safeRight: 12, safeTop: 24, safeBottom: 30 });
  ui.openPanel();
  const message = "签到成功 · 本月累计二十五天，里程碑奖励已经到账，回来看看你的动物和家园吧";
  ui.toast(message);
  ui.draw();
  const toastLines = calls.filter(call => call.type === "text" && call.color === "#f2ecd8");
  assert.ok(toastLines.length >= 3);
  assert.equal(toastLines.map(line => line.value).join(""), message);
  const footer = calls.filter(call => call.type === "text" && (call.value.includes("喂动物") || call.value.includes("摸摸动物")));
  assert.ok(footer.length >= 2);
  assertTextWithin(calls, { left: 12, right: 308, top: 24, bottom: 538 });
});

test("scene switch, context action and home callbacks remain distinct", () => {
  let sceneChanges = 0, actions = 0;
  const external = [];
  const { ui, state } = fixture({ onNextScene: () => sceneChanges++, onExternal: value => external.push(value) });
  ui.setAction("搭草棚", () => actions++);
  tap(ui, "action");
  assert.equal(actions, 1);
  assert.equal(sceneChanges, 0);
  tap(ui, "next-scene");
  assert.equal(sceneChanges, 1);
  tap(ui, "open-hall");
  state.home = { label: "瑞丽" };
  ui.markDirty();
  tap(ui, "go-home");
  assert.deepEqual(external, ["go-home"]);
  const rects = ui.getHitRects();
  rects[0].x = -1000;
  assert.notEqual(ui.getHitRects()[0].x, -1000);
  tap(ui, "close");
  assert.equal(ui.isPanelOpen(), false);
  assert.equal(ui.containsControl(160, 180), false);
});

test("joystick follows the safe area, normalizes motion and stops when hidden or covered", () => {
  const { ui } = fixture();
  ui.resize(667, 375, 1, { safeLeft: 44, safeRight: 44, safeBottom: 20 });
  ui.setJoystickVisible(true);
  const j = ui.getJoystickGeometry();
  assert.ok(j.x - j.radius >= 44);
  assert.equal(ui.joystickStart(j.x, j.y), true);
  ui.joystickMove(j.x + 1000, j.y + 1000);
  assert.ok(Math.abs(Math.hypot(ui.getMove().x, ui.getMove().y) - 1) < 1e-12);
  assert.equal(ui.containsControl(j.x, j.y), true);
  ui.openPanel();
  assert.deepEqual(ui.getMove(), { x: 0, y: 0, active: false });
  assert.equal(ui.joystickStart(j.x, j.y), false);
  ui.closePanel();
  assert.equal(ui.joystickStart(j.x, j.y), true);
  ui.setJoystickVisible(false);
  assert.deepEqual(ui.getMove(), { x: 0, y: 0, active: false });
  assert.equal(ui.joystickStart(j.x, j.y), false);
});

test("meditation starts at clock zero and completes once after five foreground seconds", () => {
  const { ui, state, time, saves } = fixture();
  ui.openPanel();
  tap(ui, "jingxin");
  time(4999);
  ui.update();
  assert.equal(saves(), 0);
  assert.equal(state.jingxinDate, "");
  ui.closePanel();
  ui.setJoystickVisible(true);
  const j = ui.getJoystickGeometry();
  ui.joystickStart(j.x, j.y);
  time(5000);
  ui.update();
  assert.equal(saves(), 1);
  assert.equal(state.jingxinDate, DAY);
  assert.equal(state.quests.jingxin, true);
  ui.update();
  time(9000);
  ui.update();
  assert.equal(saves(), 1);
});

test("injected foreground clock controls toast expiration", () => {
  const { ui, calls, time } = fixture();
  ui.toast("欢迎回来");
  ui.draw();
  assert.ok(calls.some(call => call.value === "欢迎回来"));
  for (let index = 0; index < 3; index++) ui.update();
  ui.draw();
  assert.ok(calls.some(call => call.value === "欢迎回来"));
  time(2600);
  ui.update();
  ui.draw();
  assert.equal(calls.some(call => call.value === "欢迎回来"), false);
});

test("save failures never show a success toast and preserve the host-restored state object", () => {
  for (const operation of ["signin", "quest", "jingxin"]) {
    const state = Daily.defaultState();
    Daily.refreshDaily(state, DAY);
    if (operation === "quest") Object.assign(state.quests, { fed: true, harvest: true, jingxin: true });
    const snapshot = structuredClone(state);
    const { ui, calls, time } = fixture({ state, save() {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, structuredClone(snapshot));
      return { ok: false, error: { code: "STORAGE_WRITE_FAILED" } };
    } });
    ui.openPanel();
    tap(ui, operation);
    if (operation === "jingxin") { time(5000); ui.update(); }
    ui.draw();
    assert.deepEqual(state, snapshot);
    const toastLines = calls.filter(call => call.type === "text" && call.color === "#f2ecd8");
    assert.equal(toastLines.map(call => call.value).join(""), "本机保存失败，请重试");
  }
});

test("storage exceptions are reported without escaping the input handler", () => {
  const { ui, calls } = fixture({ save() { throw new Error("disk unavailable"); } });
  ui.openPanel();
  assert.doesNotThrow(() => tap(ui, "signin"));
  ui.draw();
  assert.ok(calls.some(call => call.value === "本机保存失败，请重试"));
});

test("coin balance preserves half coins and other fractions in both HUD and hall", () => {
  for (const coins of [1200, 1200.5, 1200.25]) {
    const { ui, state, calls } = fixture();
    state.coins = coins;
    ui.resize(667, 375, 1);
    ui.openPanel();
    ui.draw();
    assert.ok(calls.some(call => call.value === "安币 " + coins));
    assert.ok(calls.some(call => call.value === "安币 " + coins + " · 本月签到 0 天"));
    assert.equal(state.coins, coins);
  }
});

test("input hit testing keeps pending texture refresh dirty", () => {
  const { ui } = fixture();
  ui.draw();
  assert.equal(ui.update(), false);
  ui.setAction("搭草棚", () => {});
  const action = ui.getHitRects().find(rect => rect.id === "action");
  assert.ok(action);
  assert.equal(ui.containsControl(action.x + 1, action.y + 1), true);
  assert.equal(ui.update(), true);
  ui.draw();
  assert.equal(ui.update(), false);
});

test("teleport modal traps input, stops movement and separates four destinations from cancel", () => {
  for (const [width, height] of [[320, 568], [667, 375], [320, 375]]) {
    let destination = null;
    const { ui, calls } = fixture();
    ui.resize(width, height, 1, { safeTop: 30, safeBottom: 20, safeLeft: 12, safeRight: 12 });
    ui.setJoystickVisible(true);
    const joystick = ui.getJoystickGeometry();
    ui.joystickStart(joystick.x, joystick.y);
    ui.openTeleport(["ruili", "yingjiang", "longchuan", "lianghe"].map(id => ({ id, label: { ruili: "瑞丽坝", yingjiang: "盈江坝", longchuan: "陇川坝", lianghe: "梁河" }[id] })), id => { destination = id; });
    assert.equal(ui.isPanelOpen(), true);
    assert.equal(ui.isTeleportOpen(), true);
    assert.equal(ui.getMove().active, false);
    assert.equal(ui.joystickStart(joystick.x, joystick.y), false);
    assert.equal(ui.containsControl(0, 0), true);
    ui.draw();
    assertTextWithin(calls, { left: 12, right: width - 12, top: 30, bottom: height - 20 });
    const choices = ui.getHitRects().filter(rect => rect.id !== "teleport-panel");
    assert.equal(choices.length, 5);
    for (const a of choices) for (const b of choices) if (a !== b) assert.equal(overlaps(a, b), false);
    tap(ui, "tp:lianghe");
    assert.equal(destination, "lianghe");
    assert.equal(ui.isTeleportOpen(), false);
  }
});

test("hall extra row fits low screens and dispatches only when enabled", () => {
  const external = [];
  const { ui, state, calls } = fixture({ onExternal: id => external.push(id) });
  state.home = { label: "芒市坝家园" };
  ui.resize(320, 375, 1, { safeTop: 30, safeBottom: 20, safeLeft: 12, safeRight: 12 });
  ui.setExtraRow({ id: "buy-horse", label: "陇川骏马 · 领养", right: "1200 安币", enabled: true });
  ui.openPanel();
  ui.draw();
  assertTextWithin(calls, { left: 12, right: 308, top: 30, bottom: 355 });
  findHallControl(ui, "buy-horse");
  tap(ui, "buy-horse");
  assert.deepEqual(external, ["buy-horse"]);
  ui.setExtraRow({ id: "horse-owned", label: "陇川骏马", right: "已领养 ✓", enabled: false });
  tap(ui, "horse-owned");
  assert.deepEqual(external, ["buy-horse"]);
});

test("album paginates every entry on small and landscape screens without blocking its close control", () => {
  const lines = [];
  for (const [group, count] of [["足迹", 23], ["生灵", 4], ["节日", 3]]) {
    lines.push({ type: "group", text: group + " 1 / " + count });
    for (let index = 0; index < count; index++) lines.push({ type: "item", name: group + "条目" + index, got: index === 0, hint: "位于坝区东侧的山脚下" });
  }
  for (const [width, height] of [[320, 568], [667, 375], [320, 375]]) {
    const { ui, calls } = fixture();
    ui.resize(width, height, 1, { safeTop: 30, safeBottom: 20, safeLeft: 12, safeRight: 12 });
    ui.setJoystickVisible(true);
    const joystick = ui.getJoystickGeometry();
    ui.joystickStart(joystick.x, joystick.y);
    ui.openAlbum(lines);
    assert.equal(ui.isAlbumOpen(), true);
    assert.equal(ui.isPanelOpen(), true);
    assert.equal(ui.getMove().active, false);
    const seen = new Set();
    for (let page = 0; page < 30; page++) {
      ui.draw();
      assertTextWithin(calls, { left: 12, right: width - 12, top: 30, bottom: height - 20 });
      for (const call of calls) if (call.type === "text" && call.value.includes("条目")) seen.add(call.value);
      const rects = ui.getHitRects();
      assert.ok(rects.every(rect => rect.id.startsWith("album-")));
      const controls = rects.filter(rect => rect.id !== "album-panel");
      for (const a of controls) for (const b of controls) if (a !== b) assert.equal(overlaps(a, b), false);
      if (!rects.some(rect => rect.id === "album-next" && rect.enabled)) break;
      tap(ui, "album-next");
    }
    assert.equal(seen.size, 30);
    tap(ui, "album-prev");
    assert.equal(ui.isAlbumOpen(), true);
    tap(ui, "album-close");
    assert.equal(ui.isAlbumOpen(), false);
    assert.equal(ui.isPanelOpen(), false);
  }
});

test("album hall entry dispatches onAlbum and modal closes back to the hall", () => {
  const f = fixture({ onAlbum() { f.ui.openAlbum([{ type: "group", text: "足迹" }, { type: "item", name: "总佛寺", got: true }]); } });
  f.state.home = { label: "芒市坝家园" };
  f.ui.resize(320, 375, 1, { safeTop: 30, safeBottom: 20 });
  f.ui.setAlbumRow("已收录 1 条");
  f.ui.setExtraRow({ id: "buy-horse", label: "陇川骏马 · 领养", right: "1200 安币", enabled: true });
  f.ui.openPanel();
  findHallControl(f.ui, "album");
  tap(f.ui, "album");
  assert.equal(f.ui.isAlbumOpen(), true);
  assert.equal(f.ui.handleTap(0, 0), true);
  assert.equal(f.ui.isAlbumOpen(), false);
  assert.equal(f.ui.isPanelOpen(), true);
});

test("failed teleport stays open for retry and tap hit testing keeps texture updates pending", () => {
  const { ui } = fixture();
  let attempts = 0;
  ui.openTeleport([{ id: "ruili", label: "瑞丽坝" }], () => ({ ok: ++attempts > 1 }));
  tap(ui, "tp:ruili");
  assert.equal(ui.isTeleportOpen(), true);
  assert.equal(ui.update(), true);
  tap(ui, "tp:ruili");
  assert.equal(ui.isTeleportOpen(), false);
  assert.equal(attempts, 2);
  ui.draw();
  ui.setAction("搭草棚", () => {});
  assert.equal(ui.handleTap(160, 180), false);
  assert.equal(ui.update(), true);
});
