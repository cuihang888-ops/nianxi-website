import Village from "./vendor/shared-village.cjs";

const SAMPLE_BINDINGS = Object.freeze(Village.SAMPLE_PLOTS.map((plot, index) => Object.freeze({
  scenePlotId: plot.id,
  plotId: `${Village.VILLAGE_ID}-plot-${String(index + 1).padStart(2, "0")}`,
})));
const finite = value => typeof value === "number" && Number.isFinite(value);
const same = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 1e-8;
const failure = code => ({ ok: false, error: { code }, purchasable: false, plots: [] });

function samePolygon(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length
    || !actual.every(point => point && finite(point.x) && finite(point.z))) return false;
  // The API may start at any corner and use either winding, but cannot move a corner.
  return expected.some((_, start) => [1, -1].some(direction => actual.every((point, index) => {
    const corner = expected[(start + direction * index + expected.length) % expected.length];
    return same(point.x, corner.x) && same(point.z, corner.z);
  })));
}

function matchesLayout(plot, layout) {
  return plot.origin && same(plot.origin.x, layout.origin.x)
    && same(plot.origin.y, 0) && same(plot.origin.z, layout.origin.z)
    && samePolygon(plot.bounds, Village.plotPolygon(layout));
}

// Input must first pass world-client response validation. This never sends a command
// or imports local assets; mismatched provisional server geometry stays unavailable.
export function projectRuiliVillagePlots(response) {
  if (!response || response.ok !== true || response.worldId !== Village.WORLD_ID
    || response.villageId !== Village.VILLAGE_ID) return failure("VILLAGE_NOT_LOADED");
  if (!Array.isArray(response.plots) || response.plots.length !== SAMPLE_BINDINGS.length) {
    return failure("PLOT_CATALOG_MISMATCH");
  }
  const byId = new Map(response.plots.map(plot => [plot?.plotId, plot]));
  if (byId.size !== SAMPLE_BINDINGS.length) return failure("PLOT_CATALOG_MISMATCH");
  const projected = [];
  for (const [index, binding] of SAMPLE_BINDINGS.entries()) {
    const plot = byId.get(binding.plotId);
    if (!plot || plot.worldId !== Village.WORLD_ID || plot.regionId !== Village.REGION_ID
      || plot.villageId !== Village.VILLAGE_ID) return failure("PLOT_CATALOG_MISMATCH");
    if (!Number.isSafeInteger(plot.revision) || plot.revision < 1 || plot.revision > 2147483647
      || !Number.isSafeInteger(plot.priceMinor) || plot.priceMinor < 0
      || (plot.owner !== null && (typeof plot.owner?.playerId !== "string" || !plot.owner.playerId))) {
      return failure("INVALID_PLOT_RESPONSE");
    }
    const layout = Village.SAMPLE_PLOTS[index];
    if (!matchesLayout(plot, layout)) return failure("LAYOUT_MISMATCH");
    const center = Village.toDamCoords(layout.origin);
    projected.push({
      scenePlotId: binding.scenePlotId,
      plotId: plot.plotId,
      villageId: plot.villageId,
      revision: plot.revision,
      priceMinor: plot.priceMinor,
      owner: plot.owner === null ? null : { playerId: plot.owner.playerId, nickname: plot.owner.nickname },
      purchasable: plot.owner === null,
      origin: { x: center.x, y: 0, z: center.z },
      bounds: plot.bounds.map(point => Village.toDamCoords(point)),
    });
  }
  return { ok: true, plots: projected };
}
