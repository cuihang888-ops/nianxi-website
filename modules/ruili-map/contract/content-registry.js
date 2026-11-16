/*! 念西 · 内容包契约 / content-registry.js
 * 目的：所有模组共用一套注册、存档命名空间和校验。换地区只换数据包。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NXContent = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 1;
  const packs = Object.create(null);
  const namespaces = Object.create(null);

  function fail(msg) { throw new Error('[NXContent] ' + msg); }

  /**
   * 注册一个内容包。所有模组都走这里，不允许各自往存档根上塞字段。
   * @param {object} p { id, name, version, saveNs, requires?, data }
   */
  function definePack(p) {
    if (!p || !p.id) fail('缺少 id');
    if (packs[p.id]) fail('重复注册: ' + p.id);
    if (!p.saveNs) p.saveNs = p.id;
    if (namespaces[p.saveNs]) fail('存档命名空间冲突: ' + p.saveNs);
    p.version = p.version || 1;
    p.requires = p.requires || [];
    namespaces[p.saveNs] = p.id;
    packs[p.id] = p;
    return p;
  }

  function get(id) { return packs[id] || null; }
  function list() { return Object.keys(packs).map(function (k) { return packs[k]; }); }

  /** 校验依赖的包是否都在。开发期直接抛，生产期只告警。 */
  function resolve(opts) {
    const strict = !opts || opts.strict !== false;
    const missing = [];
    list().forEach(function (p) {
      p.requires.forEach(function (dep) {
        if (!packs[dep]) missing.push(p.id + ' → ' + dep);
      });
    });
    if (missing.length && strict) fail('依赖缺失: ' + missing.join(', '));
    return missing;
  }

  /* ---------- 存档：根只有一个 mods 对象 ---------- */
  function emptySave() { return { schema: SCHEMA, mods: {} }; }

  function ensureSave(save) {
    const s = save || emptySave();
    if (!s.mods) s.mods = {};
    if (typeof s.schema !== 'number') s.schema = SCHEMA;
    return s;
  }

  /** 取某个包的存档分区，首次访问时初始化为默认值 */
  function ns(save, packId) {
    const p = packs[packId];
    if (!p) fail('未注册的包: ' + packId);
    const s = ensureSave(save);
    if (!s.mods[p.saveNs]) {
      s.mods[p.saveNs] = p.defaults ? JSON.parse(JSON.stringify(p.defaults)) : {};
    }
    return s.mods[p.saveNs];
  }

  /** 迁移：只做增量补默认，绝不删字段、绝不改结构 */
  function migrate(save) {
    const s = ensureSave(save);
    list().forEach(function (p) {
      const cur = s.mods[p.saveNs];
      if (cur == null) { s.mods[p.saveNs] = JSON.parse(JSON.stringify(p.defaults || {})); return; }
      const from = cur.__v || 0;
      if (from < p.version) {
        if (typeof p.migrate === 'function') p.migrate(cur, from, p.version);
        cur.__v = p.version;
      }
    });
    s.schema = SCHEMA;
    return s;
  }

  return {
    SCHEMA: SCHEMA, definePack: definePack, get: get, list: list,
    resolve: resolve, emptySave: emptySave, ensureSave: ensureSave,
    ns: ns, migrate: migrate,
  };
});
