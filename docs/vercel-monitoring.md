# Vercel monitoring

The root layout mounts `SpeedInsights` from `@vercel/speed-insights/next` and
`Analytics` from `@vercel/analytics/next` once for the web app. The Next.js
integrations handle route changes. No custom tracking is added to map or player
animation loops, and no API keys are needed in application environment files.

Web Analytics measures visits/page views. Speed Insights measures real-user
performance; adding it does not itself improve the PageSpeed score.

After the GitHub deployment finishes, visit the production site and navigate
between pages. Check the project's Analytics and Speed Insights dashboards.
Browser content blockers can prevent collection. Collection has not been
verified until production events appear.

Both services must be enabled for the Vercel project. Web Analytics was already
enabled when this integration was added. No paid plan or Plus upgrade was made.

Official setup:
- https://vercel.com/docs/analytics/quickstart
- https://vercel.com/docs/speed-insights/quickstart
