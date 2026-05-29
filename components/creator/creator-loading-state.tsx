import { Loader2 } from "lucide-react"

export type CreatorLoadingStepStatus = "pending" | "active" | "complete"

export interface CreatorLoadingStep {
  label: string
  status?: CreatorLoadingStepStatus
}

interface CreatorLoadingStateProps {
  title?: string
  steps?: CreatorLoadingStep[]
}

export function CreatorLoadingState({
  title = "Opening creator tools",
  steps = [{ label: "Preparing workspace", status: "active" }],
}: CreatorLoadingStateProps) {
  return (
    <div className="flex min-h-[240px] w-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-sm shadow-black/5 dark:border-white/10 dark:bg-zinc-950 dark:shadow-black/30">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20">
            <Loader2 className="h-4 w-4 animate-spin text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <div className="mt-3 space-y-2">
              {steps.map((step, index) => {
                const status = step.status ?? (index === 0 ? "active" : "pending")
                const dotClassName =
                  status === "complete"
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : status === "active"
                      ? "bg-red-600 dark:bg-red-400"
                      : "bg-slate-300 dark:bg-zinc-600"
                const textClassName =
                  status === "active"
                    ? "text-foreground"
                    : status === "complete"
                      ? "text-muted-foreground"
                      : "text-slate-500 dark:text-zinc-400"

                return (
                  <div key={`${step.label}-${index}`} className={`flex items-center gap-2 text-xs ${textClassName}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
                    <span>{step.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
