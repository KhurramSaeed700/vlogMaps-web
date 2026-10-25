import { redirect } from "next/navigation"

// Keep existing bookmarks working without maintaining a second creator library.
export default async function NewCreatorVideoPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams
  redirect(`/creator/dashboard${typeof url === "string" && url ? `?${new URLSearchParams({ url })}` : ""}`)
}
