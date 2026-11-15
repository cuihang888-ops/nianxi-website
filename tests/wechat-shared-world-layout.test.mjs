import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Village from "../wechat/vendor/shared-village.cjs";
import { projectRuiliVillagePlots } from "../wechat/shared-world-layout.js";
import { createWorldClient } from "../wechat/platform/world-client.js";
import { createWorldStore } from "../service/world-store.mjs";

function listing() {
  return {
    ok: true, worldId: Village.WORLD_ID, villageId: Village.VILLAGE_ID,
    plots: Village.SAMPLE_PLOTS.map((plot, index) => {
      const plotId = `${Village.VILLAGE_ID}-plot-${String(index + 1).padStart(2, "0")}`;
      const owner = index === 0 ? null : { playerId: "actual-neighbour", nickname: "Neighbour" };
      const origin = { ...plot.origin, y: 0 }, bounds = Village.plotPolygon(plot);
      return {
        plotId, worldId: Village.WORLD_ID, regionId: Village.REGION_ID, villageId: Village.VILLAGE_ID,
        revision: index + 3, priceMinor: 40000 + index * 100, origin, bounds, owner,
        home: owner === null ? null : {
          homeId: "neighbour-home", owner: { ...owner }, revision: 1,
          address: { worldId: Village.WORLD_ID, regionId: Village.REGION_ID, villageId: Village.VILLAGE_ID, plotId },
          origin: { ...origin }, bounds: structuredClone(bounds), house: null, beds: [], animals: [],
        },
      };
    }),
  };
}

test("a complete owned-home response passes the world client before projection", async t => {
  const client = createWorldClient({
    request(options) {
      options.success({ statusCode: 200, data: listing() });
      return { abort() {} };
    },
  }, { backendBaseUrl: "https://world.example.test" }, {
    now: () => 1000,
    getSession: () => ({
      guest: false, playerId: "layout-player",
      sessionToken: "layout-test-session-token", expiresAt: 2000,
    }),
  });
  t.after(() => client.dispose());
  const response = await client.listPlots({ worldId: Village.WORLD_ID, villageId: Village.VILLAGE_ID });
  assert.equal(response.ok, true);
  const result = projectRuiliVillagePlots(response.data);
  assert.equal(result.ok, true);
  assert.deepEqual(result.plots.map(plot => plot.purchasable), [true, false]);
});

test("scene IDs bind to authoritative IDs, revisions and prices without depending on response order", () => {
  const response = listing();
  response.plots.reverse();
  const before = structuredClone(response);
  const result = projectRuiliVillagePlots(response);
  assert.equal(result.ok, true);
  assert.deepEqual(result.plots.map(plot => plot.scenePlotId), Village.SAMPLE_PLOTS.map(plot => plot.id));
  assert.deepEqual(result.plots.map(plot => plot.plotId), [
    "ruili-river-0001-plot-01", "ruili-river-0001-plot-02",
  ]);
  assert.deepEqual(result.plots.map(plot => plot.revision), [3, 4]);
  assert.deepEqual(result.plots.map(plot => plot.priceMinor), [40000, 40100]);
  assert.deepEqual(result.plots.map(plot => plot.purchasable), [true, false]);
  assert.deepEqual(result.plots[1].owner, before.plots[0].owner);
  assert.deepEqual(result.plots[0].origin, { x: -84, y: 0, z: 64 });
  assert.deepEqual(result.plots[0].bounds, Village.plotPolygon(Village.SAMPLE_PLOTS[0]).map(Village.toDamCoords));
  assert.deepEqual(response, before, "projection does not mutate the server catalog");
  result.plots[1].owner.nickname = "Changed";
  result.plots[0].bounds[0].x += 50;
  assert.deepEqual(response, before, "projected data shares no mutable owner or boundary objects");
});

test("server bounds are already village coordinates and are never translated by the plot origin twice", () => {
  const response = listing();
  response.plots[0].bounds = structuredClone(Village.SAMPLE_PLOTS[0].bounds);
  assert.equal(projectRuiliVillagePlots(response).error.code, "LAYOUT_MISMATCH");
  for (const shift of [-1, 1]) {
    const moved = listing();
    moved.plots[0].origin.x += shift;
    assert.equal(projectRuiliVillagePlots(moved).error.code, "LAYOUT_MISMATCH");
  }
  const changed = listing();
  changed.plots[0].bounds[0].x -= 0.1;
  assert.equal(projectRuiliVillagePlots(changed).error.code, "LAYOUT_MISMATCH");
});

test("equivalent polygon winding and starting corners retain the same scene location", () => {
  for (let offset = 0; offset < 4; offset++) {
    for (const reverse of [false, true]) {
      const response = listing();
      const points = response.plots[0].bounds;
      response.plots[0].bounds = [...points.slice(offset), ...points.slice(0, offset)];
      if (reverse) response.plots[0].bounds.reverse();
      const result = projectRuiliVillagePlots(response);
      assert.equal(result.ok, true);
      assert.deepEqual(result.plots[0].origin, { x: -84, y: 0, z: 64 });
    }
  }
});

test("unloaded villages, duplicate slots and reserved expansion plots cannot become purchasable", () => {
  const elsewhere = listing();
  elsewhere.villageId = "ruili-river-0002";
  assert.equal(projectRuiliVillagePlots(elsewhere).error.code, "VILLAGE_NOT_LOADED");
  for (const change of [
    value => value.plots.pop(),
    value => value.plots.push({ ...value.plots[0], plotId: "ruili-river-0001-plot-03" }),
    value => { value.plots[1] = structuredClone(value.plots[0]); },
    value => { value.plots[0].plotId = Village.SAMPLE_PLOTS[0].id; },
    value => { value.plots[0].plotId = "ruili-river-0001-plot-03"; },
    value => { value.plots[0].villageId = "ruili-river-0002"; },
    value => { value.plots[0].regionId = "mangshi"; },
  ]) {
    const response = listing();
    change(response);
    assert.deepEqual(projectRuiliVillagePlots(response), {
      ok: false, error: { code: "PLOT_CATALOG_MISMATCH" }, purchasable: false, plots: [],
    });
  }
});

test("malformed geometry and unconfirmed prices or revisions fail closed", () => {
  for (const change of [
    value => { value.origin.x = NaN; },
    value => { value.origin.y = 1; },
    value => { value.bounds = []; },
    value => { value.bounds[1].z = Infinity; },
    value => { value.bounds = [value.bounds[0], value.bounds[2], value.bounds[1], value.bounds[3]]; },
    value => { value.revision = 0; },
    value => { value.revision = 2147483648; },
    value => { value.priceMinor = 0.5; },
    value => { value.priceMinor = -1; },
    value => { delete value.owner; },
  ]) {
    const response = listing();
    change(response.plots[0]);
    const result = projectRuiliVillagePlots(response);
    assert.equal(result.ok, false);
    assert.equal(result.purchasable, false);
    assert.deepEqual(result.plots, []);
  }
});

test("the real provisional store is rejected without rewriting its geometry, ownership or receipts", async t => {
  const root = fileURLToPath(new URL("../reports/shared-world-layout-tests/", import.meta.url));
  await mkdir(root, { recursive: true });
  const physicalRoot = await realpath(root);
  if (process.platform === "win32") assert.equal(path.parse(physicalRoot).root.toUpperCase(), "D:\\");
  const directory = await mkdtemp(path.join(physicalRoot, "case-"));
  const store = createWorldStore({ filename: path.join(directory, "world.sqlite") });
  t.after(async () => {
    store.close();
    const physicalDirectory = await realpath(directory);
    assert.equal(path.dirname(physicalDirectory), physicalRoot);
    await rm(physicalDirectory, { recursive: true, force: true });
  });
  const playerId = "layout-review-player";
  const registered = store.registerPlayer(playerId, { commandId: "register-layout-review", avatarId: "farmer" });
  const before = store.listPlots({ worldId: Village.WORLD_ID, villageId: Village.VILLAGE_ID });
  assert.deepEqual(projectRuiliVillagePlots(before), {
    ok: false, error: { code: "LAYOUT_MISMATCH" }, purchasable: false, plots: [],
  });
  assert.deepEqual(store.listPlots({ worldId: Village.WORLD_ID, villageId: Village.VILLAGE_ID }), before);
  assert.deepEqual(store.getReceipt(playerId, "register-layout-review"), registered);
  assert.equal(store.getBootstrap(playerId).wallet.balanceMinor, 100000);
  assert.equal(store.getBootstrap(playerId).home, null);
});
