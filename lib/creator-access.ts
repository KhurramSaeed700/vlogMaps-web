export const demoCreatorEmails = [
  "creator@travelmap.dev",
  "adventure.seeker@example.com",
  "euro.explorer@example.com",
  "kssuper007@gmail.com",
]

export function isCreatorEmail(email?: string | null) {
  if (!email) {
    return false
  }

  return demoCreatorEmails.includes(email.toLowerCase())
}
