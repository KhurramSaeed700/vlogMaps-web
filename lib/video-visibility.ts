export const videoVisibilities = ["private", "unlisted", "public"] as const
export type VideoVisibility = (typeof videoVisibilities)[number]

export const videoVisibilityLabels: Record<VideoVisibility, string> = {
  private: "Private",
  unlisted: "Unlisted",
  public: "Public",
}

export const videoVisibilityDescriptions: Record<VideoVisibility, string> = {
  private: "Only you can watch on TravelMap.",
  unlisted: "Anyone with the link can watch; hidden from feeds and search.",
  public: "Anyone can find and watch on TravelMap.",
}

export function isVideoVisibility(value: unknown): value is VideoVisibility {
  return value === "private" || value === "unlisted" || value === "public"
}

// Missing visibility is a legacy public upload. Unknown values fail closed.
export function normalizeVideoVisibility(value: unknown): VideoVisibility {
  return value === undefined || value === null ? "public" : isVideoVisibility(value) ? value : "private"
}

export const publicVideoWhere = { status: "published", visibility: "public" } as const
export const linkAccessibleVideoWhere = { status: "published", visibility: { in: ["public", "unlisted"] } }
