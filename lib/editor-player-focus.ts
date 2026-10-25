/** Return iframe focus once after interaction, without polling or leaving this player. */
export function returnEditorPlayerFocus(wrapper: HTMLElement | null, doc: Document, allowOwnedFullscreen = false) {
  const active = doc.activeElement
  if (!wrapper || doc.hidden || !doc.hasFocus() || !(active instanceof HTMLIFrameElement) || !wrapper.contains(active)) return
  const fullscreen = doc.fullscreenElement
  if (fullscreen && (!allowOwnedFullscreen || (fullscreen !== wrapper && !wrapper.contains(fullscreen)))) return
  if (wrapper.dataset.playerFullscreen === "true" && !allowOwnedFullscreen) return
  wrapper.focus({ preventScroll: true })
}
