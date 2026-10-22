/** Keep editor shortcuts reachable without polling or changing focus in fullscreen. */
export function returnEditorPlayerFocus(wrapper: HTMLElement | null, doc: Document) {
  const active = doc.activeElement
  if (!wrapper || doc.hidden || !doc.hasFocus() || doc.fullscreenElement ||
    wrapper.dataset.playerFullscreen === "true" || !(active instanceof HTMLIFrameElement) || !wrapper.contains(active)) return
  wrapper.focus({ preventScroll: true })
}
