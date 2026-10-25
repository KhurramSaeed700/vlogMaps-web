export const playlistIdPattern = /^[A-Za-z0-9_-]{10,150}$/
export function playlistIds(tags: readonly string[] = []) {
  return [...new Set(tags.filter(tag => tag.startsWith("playlist:") && playlistIdPattern.test(tag.slice(9))).map(tag => tag.slice(9)))]
}

// Only change membership and metadata for the requested playlist.
export function updatePlaylistTags(tags: string[], id: string, title: string, position: number | null) {
  const next = tags.filter(tag => tag !== `playlist:${id}` && !tag.startsWith(`playlist-name:${id}:`) && !tag.startsWith(`playlist-order:${id}:`))
  if (position !== null) next.push(`playlist:${id}`, `playlist-name:${id}:${title}`, `playlist-order:${id}:${position}`)
  return next
}
