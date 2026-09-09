/** End the renderer session on context loss; callers clear handles before showing recovery. */
export function watchContextLoss(canvas: EventTarget, unavailable: () => void) {
  const lost = () => unavailable();
  canvas.addEventListener('webglcontextlost', lost, { once: true });
  return () => canvas.removeEventListener('webglcontextlost', lost);
}
