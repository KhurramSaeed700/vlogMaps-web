export interface YouTubeLinkPreviewData {
  kind: "playlist" | "video"
  title: string
  creator: string
  thumbnail: string | null
  totalVideos?: number | null
  durationSeconds?: number | null
  views?: number | null
  added: boolean | null
  editVideoId: string | null
}
