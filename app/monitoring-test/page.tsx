import { notFound } from "next/navigation"
import { MonitoringTest } from "./test-client"

export default function MonitoringTestPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return <MonitoringTest />
}
