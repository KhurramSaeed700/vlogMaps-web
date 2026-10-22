import { CreatorStudio } from "@/components/creator/creator-studio"

export default async function CreatorDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams
  const initialView = view === "overview" ? "overview" : "content"
  return <CreatorStudio key={initialView} initialView={initialView} />
}
