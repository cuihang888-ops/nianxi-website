// Syntax lowering does not provide newer built-in APIs on older game runtimes.
if (typeof Object.hasOwn !== "function") {
  Object.defineProperty(Object, "hasOwn", {
    value: function hasOwn(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key);
    },
    writable: true,
    configurable: true,
  });
}
