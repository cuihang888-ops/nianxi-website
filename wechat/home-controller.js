import Daily from "./vendor/daily-state.cjs";
import Discovery from "./vendor/preview-discovery.cjs";

const KINDS = ["chicken", "sheep", "rabbit"];
const ANIMAL_NAMES = { chicken: "鸡", sheep: "羊", rabbit: "兔" };
const DESTINATIONS = [
  { id: "mangshi", label: "芒市坝", scene: 2 },
  { id: "ruili", label: "瑞丽坝", scene: 3 },
  { id: "yingjiang", label: "盈江坝", scene: 4 },
  { id: "longchuan", label: "陇川坝", scene: 5 },
  { id: "lianghe", label: "梁河", scene: 6 },
];
const SPOT_REASON = {
  water: "离水太近，再往岸上走走", solid: "这里有山石建筑，换个开阔处", site: "离公共基址太近",
  hall: "离大厅太近，给来往的人留些空间", crystal: "离传送点太近", taken: "离已有地块太近",
  bounds: "离地图边缘太近", invalid: "这里暂时不能安家",
};

export function createHomeController({ state, transact, ui, getMangshi, getDamWorld, setScene, now = Date.now, today, setFestivalAction = () => false }) {
  let lastAccrualAt = -Infinity;
  let activeDam = null, activeWorld = null;
  const nowSeconds = () => Math.floor(now() / 1000);
  const worldOf = dam => getDamWorld ? getDamWorld(dam || "mangshi") : getMangshi();
  const damOf = active => DESTINATIONS.find(value => value.scene === active)?.id;
  const sceneOf = dam => DESTINATIONS.find(value => value.id === (dam || "mangshi"))?.scene;

  function restoreVisual(world, dam = "mangshi") {
    if (!world) return;
    world.setCrystalLit?.(!!state.lit?.[dam]);
    if (state.horse?.owned && (state.horse.dam || "mangshi") === dam && !world.isMounted?.()) {
      const position = world.getHorsePos?.();
      if (!position) world.showHorse(state.horse.x, state.horse.z);
    }
    if (state.horse?.owned && (state.horse.dam || "mangshi") === dam) world.setHorseBond?.(state.horse.bond);
    const h = state.home;
    if (!h || (h.dam || "mangshi") !== dam) return;
    if (h.custom && !world.getPlots().some(value => value.site === -1 && value.idx === -1)) world.claimCustomPlot?.(h.custom.x, h.custom.z);
    const plot = world.getPlots().find(value => value.site === h.site && value.idx === h.plot);
    if (!plot) return;
    if (!plot.claimed) world.markClaimed(h.site, h.plot);
    if (h.house >= 1 && !plot.hut) world.buildHut(h.site, h.plot);
    if (h.house >= 2 && plot.house < 2) world.upgradeBamboo(h.site, h.plot);
    if (h.field) {
      const stage = h.beds.crop ? (nowSeconds() >= h.beds.readyAt ? 2 : 1) : 0;
      if (!plot.field) world.openField(h.site, h.plot, stage);
      else if (plot.fieldStage !== stage) world.setFieldStage(h.site, h.plot, stage);
    }
    for (const kind of KINDS) {
      for (let count = plot.animals?.[kind] || 0; count < h.animals[kind]; count++) world.addAnimal(h.site, h.plot, kind);
    }
    if (Object.values(h.produce).some(count => count > 0)) world.showHarvestBasket?.(h.site, h.plot);
    else world.hideHarvestBasket?.();
  }

  function commit(mutator, after) {
    const result = transact(mutator);
    ui.markDirty();
    if (!result.ok) {
      const code = result.error?.code || "";
      ui.toast(code.startsWith("SAVE_") || code.startsWith("STORAGE_") ? "本机保存失败，请重试" : result.msg || result.error?.message || "这次操作未完成，请重试");
      return result;
    }
    for (const dam of new Set([state.home?.dam || "mangshi", state.horse?.dam || "mangshi"])) restoreVisual(worldOf(dam), dam);
    if (after) after(result.result);
    else if (result.result?.msg) ui.toast(result.result.msg);
    return result;
  }

  function accrue() {
    const time = now();
    if (!Number.isFinite(time) || (time >= lastAccrualAt && time - lastAccrualAt < 1000)) return;
    lastAccrualAt = time;
    if (!state.home) return;
    const seconds = Math.floor(time / 1000);
    // Check a draft first so idle frames never write unchanged save data.
    const draft = JSON.parse(JSON.stringify(state));
    if (Daily.accrueProduce(draft, seconds)) commit(value => Daily.accrueProduce(value, seconds));
    else restoreVisual(worldOf(state.home.dam), state.home.dam || "mangshi");
  }

  function saveHorse(draft, world) {
    if (!draft.horse?.owned || !world) return { ok: true };
    const position = world.getHorsePos();
    if (!position) return { ok: true };
    return Daily.setHorsePosition(draft, position.x, position.z, draft.horse.dam || "mangshi");
  }

  function beforeSceneChange() {
    if (!state.horse?.owned) return true;
    const world = worldOf(state.horse.dam);
    const position = world.getHorsePos();
    if (!position || (!world.isMounted() && position.x === state.horse.x && position.z === state.horse.z)) return true;
    const result = commit(draft => saveHorse(draft, world));
    if (result.ok) world.setMounted(false);
    return result.ok;
  }

  function teleport(selection) {
    const byRoad = typeof selection === "string" && selection.startsWith("road:");
    const id = byRoad ? selection.slice(5) : selection;
    const destination = DESTINATIONS.find(value => value.id === id);
    if (!destination) return;
    if (byRoad && state.lit[id]) return { ok: false, msg: "这座传送点已点亮，请重新选择" };
    const world = state.horse?.owned ? worldOf(state.horse.dam) : null;
    return commit(value => {
      if (!byRoad) {
        const paid = Daily.payTeleport(value, id);
        if (!paid.ok) return paid;
      }
      return saveHorse(value, world);
    }, () => {
      world?.setMounted?.(false);
      ui.closeTeleport();
      setScene(destination.scene);
      const destinationWorld = worldOf(id);
      const arrival = destinationWorld.getSpawn?.() || { x: 4, z: 52 };
      destinationWorld.teleportPlayerTo(arrival.x, arrival.z);
      ui.toast(byRoad ? "沿古道到了" + destination.label + " · 去点亮这里的传送点吧" : "到了" + destination.label);
    });
  }

  function openTeleport(active) {
    const world = worldOf(damOf(active));
    world.setMoveInput(0, 0);
    ui.openTeleport(DESTINATIONS.filter(value => value.scene !== active).map(({ id, label }) => state.lit[id]
      ? { id, label, right: Daily.ECONOMY.teleportPrice + " 安币" }
      : { id: "road:" + id, label: label + " · 古道行旅", right: "未点亮 · 免费" }), teleport);
  }

  function handleExternal(id) {
    if (id === "go-home") return goHome();
    if (id === "buy-horse") return commit(Daily.buyHorse);
    if (id === "call-horse") return callHorse();
    return false;
  }

  function canCallHorse() {
    if (!activeDam || !activeWorld || !state.horse?.owned || state.horse.bond < Daily.BOND.CALL_AT || activeWorld.isMounted?.()) return false;
    if (state.horse.dam !== activeDam) return true;
    const position = activeWorld.getPlayerPos();
    const horse = activeWorld.getHorsePos() || state.horse;
    return Math.hypot(position.x - horse.x, position.z - horse.z) > 30;
  }

  function callHorse() {
    if (!canCallHorse()) return false;
    const old = worldOf(state.horse.dam);
    const world = activeWorld, dam = activeDam;
    const player = world.getPlayerPos();
    const position = world.resolveLandPosition?.(player.x + 3.5, player.z + 2);
    if (!position) { ui.toast("附近暂时没有合适的落脚处"); return false; }
    return commit(draft => Daily.callHorse(draft, position.x, position.z, dam), () => {
      old.hideHorse();
      world.showHorse(position.x, position.z);
      world.setHorseBond(state.horse.bond);
      ui.closePanel();
      ui.toast("它跑来了 · 心意相通，唤一声就到");
    });
  }

  function customAction(world, dam) {
    if (state.home || !world.checkPlotSpot || !world.getPlayerPos) { ui.setAction("", null); return; }
    const position = world.getPlayerPos();
    const checked = world.checkPlotSpot(position.x, position.z);
    if (!checked.ok) {
      ui.setAction("换个开阔处安家", () => ui.toast(SPOT_REASON[checked.reason] || "这里不合适，换个地方走走"));
      return;
    }
    ui.setAction("在此安家 · " + Daily.HOME.CUSTOM_PLOT_PRICE + " 安币（自选）", () => {
      const current = world.getPlayerPos();
      const next = world.checkPlotSpot(current.x, current.z);
      if (!next.ok) { ui.toast(SPOT_REASON[next.reason] || "这里暂时不能安家"); return false; }
      return commit(draft => Daily.claimCustomHome(draft, current.x, current.z, dam));
    });
  }

  function marketAction(world, dam) {
    const market = Discovery.MARKET_POS[dam];
    const value = Daily.basketValue(state);
    if (!market || value <= 0 || !world.getPlayerPos) return false;
    const nearby = () => {
      const position = world.getPlayerPos();
      return Math.hypot(position.x - market.x, position.z - market.z) < 13;
    };
    if (!nearby()) return false;
    ui.setAction("摆摊卖货 · +" + value + " 安币", () => {
      if (!nearby() || world.isMounted?.()) return false;
      const position = world.getPlayerPos();
      return commit(Daily.sellBasket, result => {
        world.showStall(position.x, position.z, Math.atan2(market.x - position.x, market.z - position.z));
        ui.toast(result.msg);
      });
    });
    return true;
  }

  function homeAction(world) {
    const h = state.home;
    const seconds = nowSeconds();
    if (h.house === 0) {
      ui.setAction("搭草棚 · 免费", () => commit(Daily.buildHomeHut));
      return;
    }
    if (!h.field) {
      ui.setAction("开第一块田 · 免费", () => commit(Daily.openHomeField));
      return;
    }
    const produce = Daily.produceValue(state);
    if (produce > 0) {
      ui.setAction("把出产收进背篓", () => commit(value => Daily.collectHomeProduce(value, nowSeconds())));
      return;
    }
    if (h.beds.crop && seconds >= h.beds.readyAt) {
      const count = Daily.HOME.BEDS * Daily.HOME.CARROT_YIELD_PER_BED;
      ui.setAction("收获萝卜 · 入背篓 ×" + count, () => commit(value => Daily.harvestCarrots(value, nowSeconds(), today())));
      return;
    }
    const plant = () => {
      const cost = Daily.HOME.CARROT_SEED_PER_BED * Daily.HOME.BEDS;
      ui.setAction("种萝卜 · " + cost + " 安币", () => commit(value => Daily.plantCarrots(value, nowSeconds())));
    };
    if (!h.beds.crop && h.harvests === 0) { plant(); return; }
    for (const kind of KINDS) {
      if (!h.animals[kind]) {
        ui.setAction("领养一只" + ANIMAL_NAMES[kind] + " · " + Daily.HOME.ANIMAL_PRICE[kind] + " 安币", () => commit(value => Daily.buyHomeAnimal(value, kind, nowSeconds())));
        return;
      }
    }
    if (h.house === 1) {
      ui.setAction("升级傣家竹楼 · " + Daily.HOME.BAMBOO_PRICE + " 安币", () => commit(Daily.upgradeHomeBamboo));
      return;
    }
    if (!h.beds.crop) { plant(); return; }
    ui.setAction("在屋前歇一歇 · 萝卜还差 " + Math.max(0, Math.ceil(h.beds.readyAt - seconds)) + " 秒", () => {
      const target = world.nearestInteractable();
      if (world.isMounted?.() || target?.type !== "plot" || target.site !== h.site || target.idx !== h.plot) return false;
      world.setMoveInput(0, 0); world.setResting(true);
      const label = Daily.computeSky(now()).label;
      ui.toast(/夜|暮/.test(label) ? "今晚的坝子很静 · 在屋前坐一会儿，晚安"
        : /晨/.test(label) ? "晨光刚起来 · 先坐一会儿，再忙"
          : /黄昏|傍晚/.test(label) ? "黄昏正好 · 在屋前歇一歇" : "坐在屋前 · 风都是慢的");
      return true;
    });
  }

  function update(active, world) {
    activeDam = damOf(active); activeWorld = world;
    if (activeDam) world.setCrystalLit?.(!!state.lit?.[activeDam]);
    accrue();
    const basketCount = Daily.basketCount(state);
    ui.setBasket?.(basketCount ? "背篓 · " + basketCount + " 件货 · 值 " + Daily.basketValue(state) + " 安币" : null);
    ui.setExtraRow?.(state.horse?.owned
      ? canCallHorse() ? { id: "call-horse", label: "唤马 · 亲密度 " + state.horse.bond, right: "它会跑来", enabled: true }
        : { id: "horse-owned", label: "陇川骏马 · 亲密度 " + state.horse.bond, right: Daily.bondTier(state.horse.bond), enabled: false }
      : { id: "buy-horse", label: "陇川骏马 · 领养", right: Daily.HOME.HORSE_PRICE + " 安币", enabled: true });
    if (ui.isPanelOpen()) { ui.setAction("", null); return; }
    const dam = damOf(active);
    if (!dam || !world) { ui.setAction("", null); return; }
    if (world.isDancing?.()) {
      ui.setAction("纵歌中 · 迈步就停", null);
      return;
    }
    if (world.isResting?.()) {
      ui.setAction("起身", () => world.setResting(false));
      return;
    }
    if (world.isMounted?.()) {
      ui.setAction("下马", () => {
        if (beforeSceneChange()) ui.toast("下马了 · 它会在这里等你");
      });
      return;
    }
    const target = world.nearestInteractable();
    if (target?.type === "horse" && state.horse?.owned && (state.horse.dam || "mangshi") === dam) {
      const count = state.horse.careDate === today() ? state.horse.careCount : 0;
      if (count < Daily.BOND.DAILY_CARES) {
        const kind = count === 0 ? "feed" : "brush";
        ui.setAction(kind === "feed" ? "喂马 · 吃把青草" : "刷马 · 理理鬃毛", () => commit(draft => Daily.careHorse(draft, kind, today()), result => {
          world.horseCare(); world.setHorseBond(state.horse.bond); ui.toast(result.msg);
        }));
        return;
      }
      ui.setAction("上马", () => { world.setMoveInput(0, 0); world.setMounted(true); ui.toast("上马了"); });
      return;
    }
    if (marketAction(world, dam)) return;
    if (setFestivalAction(dam, world)) return;
    if (!target) { customAction(world, dam); return; }
    if (target.type === "crystal") {
      if (!state.lit[dam]) {
        ui.setAction("点亮这座传送点 · 免费", () => {
          if (world.nearestInteractable()?.type !== "crystal" || world.isMounted?.()) return false;
          return commit(draft => Daily.lightCrystal(draft, dam), () => {
            world.setCrystalLit(true); ui.toast("传送点亮了 · " + Daily.ECONOMY.DAMS[dam].name);
          });
        });
      } else ui.setAction("传送 · " + Daily.ECONOMY.teleportPrice + " 安币", () => openTeleport(active));
    } else if (target.type === "hall") {
      ui.setAction("进入安和里大厅", () => { world.setMoveInput(0, 0); ui.openPanel(); });
    } else if (target.type === "plot" && !target.claimed) {
      ui.setAction("在此安家 · " + Daily.ECONOMY.plotPrice + " 安币", () => commit(value => Daily.claimHome(value, target.site, target.idx, dam)));
    } else if (target.type === "plot" && (state.home?.dam || "mangshi") === dam && state.home?.site === target.site && state.home.plot === target.idx) {
      homeAction(world);
    } else ui.setAction("", null);
  }

  function goHome() {
    if (!state.home) return false;
    if (!beforeSceneChange()) return false;
    const h = state.home;
    const world = worldOf(h.dam);
    const plot = world.getPlots().find(value => value.site === h.site && value.idx === h.plot);
    const center = plot && (h.custom ? world.getHallPos() : world.getSites()[plot.site]);
    if (!plot || !center) return false;
    ui.closePanel();
    setScene(sceneOf(h.dam));
    const length = Math.hypot(plot.x - center.x, plot.z - center.z) || 1;
    world.teleportPlayerTo(plot.x - (plot.x - center.x) / length * 5.5, plot.z - (plot.z - center.z) / length * 5.5);
    ui.toast("回家了");
    return true;
  }

  return { update, restoreVisual, goHome, handleExternal, beforeSceneChange };
}
