import threeModule from "./vendor/threejs-miniprogram.cjs";
import sceneModule from "./vendor/anheli-scene.cjs";
import pastureModule from "./vendor/pasture-scene.cjs";
import mangshiModule from "./vendor/mangshi-scene.cjs";
import ruiliModule from "./vendor/ruili-scene.cjs";
import yingjiangModule from "./vendor/yingjiang-scene.cjs";
import longchuanModule from "./vendor/longchuan-scene.cjs";
import liangheModule from "./vendor/lianghe-scene.cjs";
import damWorldModule from "./vendor/dam-world.cjs";
import Daily from "./vendor/daily-state.cjs";
import uiModule from "./vendor/canvas-ui.cjs";
import { createPreviewSave } from "./platform/preview-save.js";
import { createHomeController } from "./home-controller.js";
import { createDiscoveryController } from "./discovery-controller.js";

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const SCENE_NAMES = ["总佛寺 · 庭院", "溪山牧场 · 家园", "芒市坝", "瑞丽坝", "盈江坝", "陇川坝", "梁河"];
const DAMS = [null, null, "mangshi", "ruili", "yingjiang", "longchuan", "lianghe"];

function disposeScene(world) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  world?.scene?.traverse?.(object => {
    if (object.geometry?.dispose) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material || materials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture && value.dispose) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export function createGame(context) {
  if (!context?.canvas || !context?.input?.subscribe || !context.createOverlayCanvas) throw new TypeError("A game host context is required");
  const clock = context.now || Date.now;
  const today = () => Daily.todayShanghai(clock());
  const session = createPreviewSave(context.platform.storage, clock);
  const state = session.state;
  const THREE = context.three || threeModule.createScopedThreejs(context.canvas);
  const worlds = new Map();
  let renderer, overlayScene, ui, texture, overlayMaterial, unsubscribe, homeController, discoveryController;
  let active = 0, world, viewport = context.viewport;
  let elapsed = 0, disposed = false, paused = false, lastDay = today();
  let gesture = null, joyId = null, pinch = 0, pinchBlocked = false;
  let keyboard = { x: 0, y: 0 };
  let lastSkyAt = -Infinity, skyState = null;

  function applySky(force = false) {
    const time = clock();
    if (!force && time >= lastSkyAt && time - lastSkyAt < 30000) return;
    skyState = Daily.computeSky(time); lastSkyAt = time;
    worlds.forEach(value => value.setSky?.(skyState));
    ui.setSceneName(SCENE_NAMES[active] + " · " + skyState.label);
  }

  function clearInput() {
    gesture = null; joyId = null; pinch = 0; pinchBlocked = false;
    keyboard = { x: 0, y: 0 };
    ui?.joystickEnd();
    worlds.forEach(value => value.setMoveInput?.(0, 0));
  }

  function persist(mutator) {
    const result = session.transact(mutator);
    ui.markDirty();
    if (!result.ok) ui.toast(result.msg || "本机保存失败，请重试");
    return result;
  }

  const events = {
    cropRegrowthSeconds: Daily.ECONOMY.cropRegrowthSeconds,
    onPet(kind) {
      const result = persist(draft => {
        const quest = Daily.markQuest(draft, today(), "fed");
        if (quest.ok === false) return quest;
        Daily.albumAdd(draft, "animals", kind);
      });
      if (!result.ok) return false;
      ui.toast("摸摸" + ({ chicken: "鸡", sheep: "羊", rabbit: "兔" }[kind] || "动物"));
      return true;
    },
    onHarvest(crop) {
      const result = persist(draft => {
        const quest = Daily.markQuest(draft, today(), "harvest");
        if (quest.ok === false) return quest;
        if (crop === "carrot") draft.coins += Daily.ECONOMY.carrotSale;
      });
      if (!result.ok) return false;
      ui.toast(crop === "carrot" ? "收了萝卜 +" + Daily.ECONOMY.carrotSale + " 安币" : "收了草料");
      return true;
    },
  };

  function getWorld(index) {
    if (!worlds.has(index)) {
      const created = index === 0 ? sceneModule.createAnheliScene(THREE)
        : index === 1 ? pastureModule.createPastureScene(THREE, events)
          : index === 2 ? mangshiModule.createMangshiScene(THREE)
            : index === 3 ? ruiliModule.createRuiliScene(THREE, damWorldModule)
              : index === 4 ? yingjiangModule.createYingjiangScene(THREE, damWorldModule)
                : index === 5 ? longchuanModule.createLongchuanScene(THREE, damWorldModule) : liangheModule.createLiangheScene(THREE, damWorldModule);
      worlds.set(index, created);
      if (index >= 2) homeController.restoreVisual(created, DAMS[index]);
    }
    return worlds.get(index);
  }

  function setScene(index) {
    if (disposed || !Number.isInteger(index) || index < 0 || index >= SCENE_NAMES.length) return;
    if (homeController && !homeController.beforeSceneChange()) return;
    world?.stopDance?.();
    world?.setResting?.(false);
    clearInput();
    active = index;
    world = getWorld(index);
    if (viewport) world.resize(viewport.width, viewport.height);
    ui.setSceneName(SCENE_NAMES[index]);
    ui.setJoystickVisible(index >= 2);
    ui.setAction("", null);
    discoveryController?.syncWorld(DAMS[index], world);
    applySky(true);
  }

  function resize(size) {
    if (disposed || !size) return;
    clearInput(); viewport = size;
    const dpr = Math.min(2, Math.max(1, finite(size.pixelRatio, 1)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.width, size.height, false);
    world?.resize(size.width, size.height);
    ui.resize(size.width, size.height, dpr, size);
    // WebGL texture allocation is immutable on some runtimes after its first upload.
    texture?.dispose();
    texture = new THREE.CanvasTexture(ui.canvas);
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    overlayMaterial.map = texture;
    overlayMaterial.needsUpdate = true;
    ui.draw(); texture.needsUpdate = true;
  }

  function input(event) {
    if (disposed || paused) return;
    if (event.type === "cancel") { clearInput(); return; }
    const touches = event.touches || [], changed = event.changedTouches || [];
    if (event.type === "start") {
      for (const point of changed) {
        if (joyId === null && ui.joystickStart(point.x, point.y)) { joyId = point.id; gesture = null; }
      }
      const otherTouches = touches.filter(point => point.id !== joyId);
      if (otherTouches.length === 1 && changed.some(point => point.id === otherTouches[0].id)) {
        const point = otherTouches[0];
        gesture = { id: point.id, start: point, last: point, time: clock(), moved: false, blocked: ui.containsControl(point.x, point.y) };
      } else if (otherTouches.length > 1) {
        pinchBlocked = !!gesture?.blocked || otherTouches.some(point => ui.containsControl(point.x, point.y));
        gesture = null; pinch = distance(otherTouches[0], otherTouches[1]);
      }
    } else if (event.type === "move") {
      if (joyId !== null) {
        const point = touches.find(value => value.id === joyId);
        if (point) ui.joystickMove(point.x, point.y);
      }
      const otherTouches = touches.filter(point => point.id !== joyId);
      if (otherTouches.length > 1) {
        gesture = null;
        const next = distance(otherTouches[0], otherTouches[1]);
        if (!pinchBlocked && !ui.isPanelOpen() && pinch > 0 && next > 0) world.handlePinch(next / pinch);
        pinch = next;
      } else if (otherTouches.length === 1 && gesture && otherTouches[0].id === gesture.id) {
        const point = otherTouches[0];
        gesture.moved ||= distance(point, gesture.start) > 8;
        if (gesture.moved && !gesture.blocked && !ui.isPanelOpen()) world.handleDrag(point.x - gesture.last.x, point.y - gesture.last.y);
        gesture.last = point;
      }
    } else if (event.type === "end") {
      if (changed.some(point => point.id === joyId)) { ui.joystickEnd(); joyId = null; }
      const point = gesture && changed.find(value => value.id === gesture.id);
      if (point) {
        const tap = !gesture.moved && distance(point, gesture.start) <= 8 && clock() - gesture.time < 500;
        gesture = null;
        if (tap && !ui.handleTap(point.x, point.y) && !ui.isPanelOpen()) world.handleTap?.(point.x, point.y, viewport.width, viewport.height);
        if (ui.isPanelOpen()) clearInput();
      }
      if (touches.filter(point => point.id !== joyId).length < 2) { pinch = 0; pinchBlocked = false; }
    }
  }

  function dispose() {
    if (disposed) return;
    homeController?.beforeSceneChange();
    clearInput(); disposed = true;
    unsubscribe?.();
    worlds.forEach(disposeScene); worlds.clear();
    disposeScene({ scene: overlayScene });
    renderer?.dispose();
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas: context.canvas, antialias: true });
    renderer.autoClear = false;
    if ("outputEncoding" in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    const uiCanvas = context.createOverlayCanvas();
    ui = uiModule.createCanvasUI({ canvas: uiCanvas, state, save: session.save, today, now: () => elapsed * 1000,
      onExternal: id => homeController.handleExternal(id), onAlbum: () => discoveryController.openAlbum(),
      onNextScene: () => setScene((active + 1) % SCENE_NAMES.length) });
    discoveryController = createDiscoveryController({ state, transact: session.transact, ui, today, now: clock });
    homeController = createHomeController({ state, transact: session.transact, ui, getDamWorld: dam => getWorld(DAMS.indexOf(dam)),
      setScene, now: clock, today, setFestivalAction: discoveryController.setAction });
    overlayScene = new THREE.Scene();
    const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    texture = new THREE.CanvasTexture(uiCanvas);
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    overlayMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    overlayScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayMaterial));
    setScene(0);
    if (session.ok) session.transact(draft => Daily.refreshDaily(draft, lastDay));
    else ui.toast("原存档无法读取，已保留；当前进度不能保存");
    if (viewport) resize(viewport);
    unsubscribe = context.input.subscribe(input);
    return {
      resize,
      update(dt) {
        if (disposed || paused) return;
        const delta = Math.min(0.05, Math.max(0, finite(dt)));
        elapsed += delta;
        applySky();
        const currentDay = today();
        if (currentDay !== lastDay) { lastDay = currentDay; persist(draft => Daily.refreshDaily(draft, currentDay)); }
        if (active >= 2) {
          const movement = ui.getMove();
          const blocked = ui.isPanelOpen();
          world.setMoveInput(blocked ? 0 : movement.active ? movement.x : keyboard.x, blocked ? 0 : movement.active ? -movement.y : keyboard.y);
        }
        world.update(delta, elapsed);
        discoveryController.update(DAMS[active], world);
        homeController.update(active, world);
        if (ui.update()) { ui.draw(); texture.needsUpdate = true; }
      },
      render() {
        if (disposed) return;
        renderer.clear(); renderer.render(world.scene, world.camera);
        renderer.clearDepth(); renderer.render(overlayScene, overlayCamera);
      },
      pause() { paused = true; world?.stopDance?.(); clearInput(); homeController.beforeSceneChange(); },
      resume() { paused = false; },
      setMoveInput(x, y) { keyboard = { x: Math.max(-1, Math.min(1, finite(x))), y: Math.max(-1, Math.min(1, finite(y))) }; },
      zoom(ratio) { if (!disposed && !ui.isPanelOpen() && Number.isFinite(ratio) && ratio > 0) world.handlePinch(ratio); },
      dispose,
      ...(context.debug ? { debug: { ui, getWorld: () => world, setScene, getState: () => JSON.parse(JSON.stringify(state)), getActive: () => active } } : {}),
    };
  } catch (error) { dispose(); throw error; }
}
