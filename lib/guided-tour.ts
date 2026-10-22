export function getGuidedTourPlacement(
  target: { top: number; bottom: number; left: number; width: number },
  viewport: { width: number; height: number },
  panelHeight: number,
  preferFullHeight = false,
) {
  const margin = 16
  const gap = 16
  const width = Math.min(350, Math.max(0, viewport.width - margin * 2))
  const height = Math.min(panelHeight, Math.max(0, viewport.height - margin * 2))
  const clampLeft = (left: number) => Math.max(margin, Math.min(left, viewport.width - width - margin))
  const clampTop = (top: number, maxHeight = height) => Math.max(margin, Math.min(top, viewport.height - maxHeight - margin))
  const spaceBelow = viewport.height - target.bottom - gap - margin
  const spaceAbove = target.top - gap - margin
  const requiredHeight = Math.min(height, preferFullHeight ? height : 280)
  let side: "above" | "below" | "left" | "right" | "floating"
  let left = clampLeft(target.left)
  let top: number
  let maxHeight = height

  // Keep the tip beside the highlighted tool when the viewport has room.
  if (target.left + target.width + gap + width <= viewport.width - margin) {
    side = "right"
    left = target.left + target.width + gap
    top = clampTop(target.top)
  } else if (target.left - gap - width >= margin) {
    side = "left"
    left = target.left - gap - width
    top = clampTop(target.top)
  } else if (spaceBelow >= requiredHeight) {
    side = "below"
    maxHeight = Math.min(height, spaceBelow)
    top = target.bottom + gap
  } else if (spaceAbove >= requiredHeight) {
    side = "above"
    maxHeight = Math.min(height, spaceAbove)
    top = target.top - gap - maxHeight
  } else if (Math.max(spaceBelow, spaceAbove) >= Math.min(height, 180)) {
    // Small screens still have room for a scrollable card outside the target.
    const below = spaceBelow >= spaceAbove
    side = below ? "below" : "above"
    maxHeight = Math.min(height, below ? spaceBelow : spaceAbove)
    top = below ? target.bottom + gap : target.top - gap - maxHeight
  } else {
    // A full-screen map cannot fit a card beside it. Use a compact bottom sheet
    // instead of covering the entire highlighted area with the full tutorial.
    side = "floating"
    maxHeight = Math.min(height, Math.max(180, viewport.height * 0.45))
    left = clampLeft((viewport.width - width) / 2)
    top = clampTop(viewport.height - maxHeight - margin, maxHeight)
  }
  return { width, left, top, below: side === "below", maxHeight, side }
}
