import Daily from "./vendor/daily-state.cjs";
import Discovery from "./vendor/preview-discovery.cjs";

const GROUPS = [["landmarks", "足迹 · 去过的地方"], ["animals", "生灵 · 陪伴过的"], ["festivals", "节日 · 赶上过的热闹"]];
const PLAY_ACTIONS = {
  songkran: { label: "泼一捧水 · 送祝福", method: "playSplash", lines: ["水花落处，旧尘尽洗", "这一捧，泼给你平安", "笑声和水花一起飞", "新年新水，万事顺遂", "泼出去的，都是福气"] },
  munao: { label: "跟着队伍 · 绕场一圈", method: "joinDance" },
  dengdeng: { label: "再放一盏心灯", method: "releaseLantern", lines: ["灯升起来了 · 愿望也跟着亮", "一盏小灯，照一段归途", "心灯不灭，日子慢慢来"] },
};

export function createDiscoveryController({ state, transact, ui, today, now = Date.now }) {
  const visibleFestivals = new WeakMap();
  let lastDiscovery = -Infinity;

  function commit(mutator) {
    const result = transact(mutator);
    ui.markDirty();
    if (!result.ok) ui.toast(result.msg || "本机保存失败，请重试");
    return result;
  }

  function syncWorld(dam, world) {
    if (!world?.setFestivalVisible) return;
    const festival = Daily.activeFestival(today());
    const visible = festival && Discovery.festSiteFor(festival, dam) ? festival.id : null;
    if (visible !== "munao" && (world.isDancing?.() || visibleFestivals.get(world) === "munao")) world.stopDance?.();
    if (!visibleFestivals.has(world) || visibleFestivals.get(world) !== visible) {
      world.setFestivalVisible(visible);
      visibleFestivals.set(world, visible);
    }
  }

  function update(dam, world) {
    const count = GROUPS.reduce((total, [group]) => total
      + Discovery.ALBUM_CATALOG[group].filter(entry => state.album?.[group]?.[entry.id]).length, 0);
    ui.setAlbumRow(count ? "已收录 " + count + " 条" : "还空着 · 出去走走");
    syncWorld(dam, world);
    if (world?.consumeDanceDone?.()) ui.toast("一圈跳完了 · 歌声还在耳朵里打转");
    if (!dam || !world?.getPlayerPos) return;
    const time = now();
    if (!Number.isFinite(time) || (time >= lastDiscovery && time - lastDiscovery < 1000)) return;
    lastDiscovery = time;
    const position = world.getPlayerPos();
    const found = (Discovery.LANDMARK_SPOTS[dam] || []).filter(spot => !state.album.landmarks[spot.id]
      && Math.hypot(position.x - spot.x, position.z - spot.z) < spot.r);
    if (!found.length) return;
    const result = commit(draft => {
      for (const spot of found) Daily.albumAdd(draft, "landmarks", spot.id);
    });
    if (result.ok) {
      const names = found.map(spot => Discovery.ALBUM_CATALOG.landmarks.find(entry => entry.id === spot.id)?.name).filter(Boolean);
      ui.toast("图鉴收录 · " + names.join("、"));
    }
  }

  function setAction(dam, world) {
    const day = today();
    const festival = Daily.activeFestival(day);
    if (!festival) return false;
    const year = Number(day.slice(0, 4));
    if (state.festJoined[festival.id] > year) return false;
    const site = Discovery.festSiteFor(festival, dam);
    if (!site || !world?.getPlayerPos || world.isMounted?.()) return false;
    const nearby = () => {
      const position = world.getPlayerPos();
      return Math.hypot(position.x - site.x, position.z - site.z) < festival.r;
    };
    if (!nearby()) return false;
    const available = () => {
      const currentDay = today();
      return Number(currentDay.slice(0, 4)) === year && Daily.activeFestival(currentDay)?.id === festival.id
        && nearby() && !world.isMounted?.();
    };
    if (state.festJoined[festival.id] === year) {
      const play = PLAY_ACTIONS[festival.id];
      if (!play || typeof world[play.method] !== "function") return false;
      ui.setAction(play.label, () => {
        if (!available() || state.festJoined[festival.id] !== year || world.isDancing?.()) return false;
        const result = world[play.method]();
        if (result === false) return false;
        if (play.lines) ui.toast(play.lines[Math.floor(Math.random() * play.lines.length)]);
        return true;
      });
      return true;
    }
    ui.setAction(Discovery.FEST_ACT[festival.id] || festival.name, () => {
      if (!available()) return false;
      const result = commit(draft => Daily.joinFestival(draft, festival.id, today()));
      if (result.ok) ui.toast(result.result.msg);
      return result;
    });
    return true;
  }

  function openAlbum() {
    const lines = [];
    for (const [group, title] of GROUPS) {
      const entries = Discovery.ALBUM_CATALOG[group];
      const found = entries.filter(entry => state.album?.[group]?.[entry.id]).length;
      lines.push({ type: "group", text: title + "  " + found + " / " + entries.length });
      for (const entry of entries) lines.push({ type: "item", name: entry.name, got: !!state.album?.[group]?.[entry.id], hint: entry.hint || "", note: Discovery.ALBUM_NOTES[entry.id] || "" });
    }
    ui.openAlbum(lines);
  }

  return { update, syncWorld, setAction, openAlbum };
}
