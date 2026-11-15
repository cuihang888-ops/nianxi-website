// The scoped Three adapter adds browser properties and event methods to its canvas.
// Keep those changes on a JavaScript wrapper, away from the native WeChat object.
export function createThreeCanvas(source, createImage) {
  if (!source || typeof source.getContext !== "function") throw new TypeError("A native canvas is required");
  class ThreeCanvas {
    get width() { return source.width; }
    set width(value) { if (source.width !== value) source.width = value; }
    get height() { return source.height; }
    set height(value) { if (source.height !== value) source.height = value; }
    getContext(...args) { return source.getContext(...args); }
    createImage() {
      if (typeof source.createImage === "function") return source.createImage();
      if (typeof createImage === "function") return createImage();
      throw new TypeError("Image creation is unavailable");
    }
  }
  return new ThreeCanvas();
}
