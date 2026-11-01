/** Keep the canvas mounted so the browser can restore its existing WebGL context. */
export function bindContextRecovery(canvas: EventTarget, callbacks: {
  lost: () => void;
  restored: () => void;
  failed: () => void;
}, timeoutMs = 8000): () => void {
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lost = (event: Event) => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    callbacks.lost();
    timer = setTimeout(() => { if (pending) callbacks.failed(); }, timeoutMs);
  };
  const restored = () => {
    if (!pending) return;
    pending = false;
    clearTimeout(timer);
    callbacks.restored();
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  return () => {
    pending = false;
    clearTimeout(timer);
    canvas.removeEventListener("webglcontextlost", lost);
    canvas.removeEventListener("webglcontextrestored", restored);
  };
}
