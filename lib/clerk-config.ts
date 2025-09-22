export const clerkConfig = {
  publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
  secretKey: process.env.CLERK_SECRET_KEY!,
}

// Validate environment variables
if (!clerkConfig.publishableKey) {
  throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY environment variable")
}

if (!clerkConfig.secretKey) {
  throw new Error("Missing CLERK_SECRET_KEY environment variable")
}
