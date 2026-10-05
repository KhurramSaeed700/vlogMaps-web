/** Convert only the fully visible video rectangle to shared-tab pixels. */
export function getVideoFrameCrop(
  rect: { left: number; top: number; width: number; height: number },
  viewportWidth: number, viewportHeight: number, frameWidth: number, frameHeight: number,
) {
  if (![rect.left, rect.top, rect.width, rect.height, viewportWidth, viewportHeight, frameWidth, frameHeight].every(Number.isFinite) ||
    rect.width <= 0 || rect.height <= 0 || viewportWidth <= 0 || viewportHeight <= 0 || frameWidth <= 0 || frameHeight <= 0 ||
    rect.left < 0 || rect.top < 0 || rect.left + rect.width > viewportWidth || rect.top + rect.height > viewportHeight) return null
  const scale = Math.min(1, 1280 / Math.max(rect.width, rect.height))
  return { x: rect.left * frameWidth / viewportWidth, y: rect.top * frameHeight / viewportHeight,
    sourceWidth: rect.width * frameWidth / viewportWidth, sourceHeight: rect.height * frameHeight / viewportHeight,
    width: Math.max(1, Math.round(rect.width * scale)), height: Math.max(1, Math.round(rect.height * scale)) }
}
