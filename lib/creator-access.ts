export const demoCreatorEmails = ["creator@travelmap.dev", "adventure.seeker@example.com"]

export function isCreatorEmail(email?: string | null) {
  if (!email) {
    return false
  }

  return demoCreatorEmails.includes(email.toLowerCase())
}
