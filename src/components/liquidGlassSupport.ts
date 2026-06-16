// liquid-dom renders real WebGPU "liquid glass" but needs TWO things the average browser lacks:
//   1. WebGPU (navigator.gpu)
//   2. the experimental HTML-in-Canvas API, behind Chrome's flag: chrome://flags/#canvas-draw-element
// When either is missing we render a normal frosted-glass panel so the UI NEVER blanks for anyone.
//
// Kept in its own module (not in LiquidGlass.tsx) so that file exports ONLY a component — otherwise
// React Fast Refresh disables itself for it ("incompatible export").
export function isLiquidGlassSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const hasWebGPU = "gpu" in navigator && Boolean((navigator as { gpu?: unknown }).gpu);
  // The Canvas Draw Element flag adds drawElement() to the 2D context — best-effort capability probe.
  const hasDrawElement =
    typeof CanvasRenderingContext2D !== "undefined" &&
    "drawElement" in CanvasRenderingContext2D.prototype;
  return hasWebGPU && hasDrawElement;
}
