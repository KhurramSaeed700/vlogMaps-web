import { withSentryConfig } from "@sentry/nextjs/config"

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
    ],
  },
}

// Skip Sentry build instrumentation as well as runtime capture during development.
const sentryEnabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED !== "false" &&
  (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true")

export default sentryEnabled ? withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? "snb-pd",
  project: process.env.SENTRY_PROJECT ?? "vlogmaps-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  telemetry: false,
  tunnelRoute: "/_reports",
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
}) : nextConfig
