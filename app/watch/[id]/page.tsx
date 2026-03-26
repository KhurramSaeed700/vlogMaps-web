"use client"

import { WatchPageClient } from "@/components/watch-page-client"

export default function WatchPage({ params }: { params: { id: string } }) {
  return <WatchPageClient id={params.id} />
}
