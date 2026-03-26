import { WatchPageClient } from "@/components/watch-page-client"

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <WatchPageClient id={id} />
}
