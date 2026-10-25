import { CreatorStudio } from "@/components/creator/creator-studio"

export default async function CreatorDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string; url?: string }> }) {
  const { view, url } = await searchParams
  const initialView = view === "overview" ? "overview" : "content"
  return <CreatorStudio key={`${initialView}:${url ?? ""}`} initialView={initialView} initialUrl={typeof url === "string" ? url : ""} />
}
