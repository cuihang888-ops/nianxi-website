import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../wechat/platform/runtime-compat.js", import.meta.url), "utf8");

function legacyRuntime() {
  const context = vm.createContext({});
  vm.runInContext("delete Object.hasOwn", context);
  vm.runInContext(source, context);
  return context;
}

test("missing hasOwn supports own properties, null prototypes, symbols and primitives", () => {
  const context = legacyRuntime();
  const result = vm.runInContext(`
    const inherited = { inherited: true };
    const value = Object.create(inherited);
    value.own = undefined;
    value.hasOwnProperty = null;
    const bare = Object.create(null);
    bare.own = 1;
    const symbol = Symbol("own");
    bare[symbol] = 2;
    [Object.hasOwn(value, "own"), !Object.hasOwn(value, "inherited"),
      !Object.hasOwn(value, "missing"), Object.hasOwn(bare, "own"),
      Object.hasOwn(bare, symbol), Object.hasOwn("abc", 1), !Object.hasOwn(7, "own")]
      .every(Boolean);
  `, context);
  assert.equal(result, true);
});

test("hasOwn fallback rejects null and undefined without invoking property getters", () => {
  const context = legacyRuntime();
  for (const value of ["null", "undefined"]) {
    assert.throws(() => vm.runInContext(`Object.hasOwn(${value}, "key")`, context), error => error.name === "TypeError");
  }
  assert.equal(vm.runInContext(`
    const value = {};
    Object.defineProperty(value, "hidden", { get() { throw new Error("must not read value"); } });
    Object.hasOwn(value, "hidden");
  `, context), true);
});

test("hasOwn fallback is non-enumerable and repeated installation keeps its identity", () => {
  const context = legacyRuntime();
  const installed = vm.runInContext("Object.hasOwn", context);
  const descriptor = vm.runInContext("Object.getOwnPropertyDescriptor(Object, 'hasOwn')", context);
  assert.equal(descriptor.enumerable, false);
  assert.equal(descriptor.writable, true);
  assert.equal(descriptor.configurable, true);
  assert.equal(installed.length, 2);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext("Object.hasOwn", context), installed);
});

test("runtime compatibility preserves an existing hasOwn implementation", () => {
  const context = vm.createContext({});
  const existing = vm.runInContext("Object.hasOwn", context);
  const descriptor = vm.runInContext("Object.getOwnPropertyDescriptor(Object, 'hasOwn')", context);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext("Object.hasOwn", context), existing);
  const after = vm.runInContext("Object.getOwnPropertyDescriptor(Object, 'hasOwn')", context);
  assert.equal(after.enumerable, descriptor.enumerable);
  assert.equal(after.writable, descriptor.writable);
  assert.equal(after.configurable, descriptor.configurable);
});

test("legacy runtime can validate game saves after compatibility initialization", () => {
  const context = legacyRuntime();
  const modules = {};
  context.require = name => modules[name];
  for (const name of ["preview-economy", "preview-discovery", "preview-sky", "daily-state"]) {
    context.module = { exports: {} };
    const code = fs.readFileSync(new URL(`../wechat/vendor/${name}.cjs`, import.meta.url), "utf8");
    vm.runInContext(`(function (module, require) {\n${code}\n})(module, require);`, context);
    modules[`./${name}.cjs`] = context.module.exports;
  }
  const daily = modules["./daily-state.cjs"];
  assert.equal(daily.validateState(daily.defaultState()), true);
});
