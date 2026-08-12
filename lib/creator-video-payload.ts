import { z } from "zod"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import type { TravelVideo } from "@/lib/demo-data"
import { maxVideoLocationSummaries, summarizeVideoLocations } from "@/lib/video-locations"

const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/
const maxCreatorPoints = 300
const maxRouteShapePoints = 2500
const maxTimestampRouteLegs = 300
const maxStringArrayItems = 40
const maxSavedPlaces = 100

const safeText = (max: number) => z.string().trim().max(max)
const nonNegativeFiniteNumber = z.number().finite().min(0)
const latitude = z.number().finite().min(-90).max(90)
const longitude = z.number().finite().min(-180).max(180)

const routeShapePointSchema = z.object({
  lat: latitude,
  lng: longitude,
})

const videoKeyframeSchema = z
  .object({
    time: nonNegativeFiniteNumber,
    stopEndTime: nonNegativeFiniteNumber.optional(),
    lat: latitude,
    lng: longitude,
    location: safeText(255).default("Saved location"),
    description: safeText(1000).default(""),
    pointType: z.enum(["point", "stop", "flight"]).default("point"),
    flightId: safeText(160).optional(),
    flightPhase: z.enum(["takeoff", "landing"]).optional(),
  })
  .transform((point) => ({
    ...point,
    stopEndTime: point.pointType === "stop" && point.stopEndTime && point.stopEndTime > point.time ? point.stopEndTime : undefined,
    flightId: point.pointType === "flight" ? point.flightId : undefined,
    flightPhase: point.pointType === "flight" ? point.flightPhase : undefined,
  }))

const creatorPointSchema = videoKeyframeSchema.and(
  z.object({
    id: safeText(160),
  }),
)

const tripLocationSchema = z.object({
  lat: latitude,
  lng: longitude,
  name: safeText(255).optional(),
})

const tripRouteSchema = z.object({
  start: tripLocationSchema.nullable(),
  end: tripLocationSchema.nullable(),
})

const routeShapesSchema = z
  .object({
    trip: z.array(routeShapePointSchema).max(maxRouteShapePoints),
    timestampLegs: z.record(safeText(180), z.array(routeShapePointSchema).max(maxRouteShapePoints)),
  })
  .superRefine((routeShapes, context) => {
    const legEntries = Object.entries(routeShapes.timestampLegs)
    if (legEntries.length > maxTimestampRouteLegs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timestampLegs"],
        message: `Timestamp route legs must not exceed ${maxTimestampRouteLegs}.`,
      })
    }

    const totalShapePoints = routeShapes.trip.length + legEntries.reduce((total, [, points]) => total + points.length, 0)
    if (totalShapePoints > maxRouteShapePoints) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["timestampLegs"],
        message: `Route shape points must not exceed ${maxRouteShapePoints}.`,
      })
    }
  })

const savedPlaceSchema = z.object({
  id: safeText(160).min(1),
  name: safeText(120).min(1),
  lat: latitude,
  lng: longitude,
})

const creatorVideoStateSchema = z.object({
  points: z.array(creatorPointSchema).max(maxCreatorPoints),
  tripRoute: tripRouteSchema,
  routeShapes: routeShapesSchema,
  savedPlaces: z.array(savedPlaceSchema).max(maxSavedPlaces).default([]),
})

const videoLocationsSchema = z.preprocess(
  (value) =>
    Array.isArray(value) && value.every((item) => typeof item === "string")
      ? summarizeVideoLocations(value)
      : value,
  z.array(safeText(255)).max(maxVideoLocationSummaries).default([]),
)

const travelVideoSchema = z.object({
  id: safeText(160).min(1),
  title: safeText(500).min(1),
  creator: safeText(255).default("Creator"),
  creatorChannelUrl: safeText(500).url().or(z.literal("")).default(""),
  youtubeId: z.string().trim().regex(youtubeIdPattern, "YouTube video id must be 11 characters."),
  thumbnail: safeText(500).url().or(z.literal("")).default(""),
  durationSeconds: nonNegativeFiniteNumber.default(0).transform(Math.round),
  views: nonNegativeFiniteNumber.default(0).transform(Math.round),
  mapViews: nonNegativeFiniteNumber.default(0).transform(Math.round),
  likes: nonNegativeFiniteNumber.default(0).transform(Math.round),
  status: z.enum(["draft", "published"]).default("draft"),
  createdAt: safeText(64).default(() => new Date().toISOString()),
  description: safeText(5000).default(""),
  locations: videoLocationsSchema,
  keyframes: z.array(videoKeyframeSchema).max(maxCreatorPoints).default([]),
  tags: z.array(safeText(80)).max(maxStringArrayItems).default([]),
})

export function formatValidationError(error: z.ZodError) {
  const firstIssue = error.issues[0]
  if (!firstIssue) {
    return "Invalid payload."
  }

  const path = firstIssue.path.length ? `${firstIssue.path.join(".")}: ` : ""
  return `${path}${firstIssue.message}`
}

export function parseTravelVideoPayload(value: unknown) {
  const result = travelVideoSchema.safeParse(value)
  if (!result.success) {
    return {
      success: false as const,
      error: formatValidationError(result.error),
    }
  }

  return {
    success: true as const,
    data: result.data satisfies TravelVideo,
  }
}

export function parseCreatorVideoStatePayload(value: unknown) {
  const result = creatorVideoStateSchema.safeParse(value)
  if (!result.success) {
    return {
      success: false as const,
      error: formatValidationError(result.error),
    }
  }

  return {
    success: true as const,
    data: result.data satisfies CreatorVideoState,
  }
}

export function isValidYouTubeVideoId(value: string) {
  return youtubeIdPattern.test(value)
}
