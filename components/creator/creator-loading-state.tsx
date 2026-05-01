import { Loader2 } from "lucide-react"

export type CreatorLoadingStepStatus = "pending" | "active" | "complete"

export interface CreatorLoadingStep {
  label: string
  status?: CreatorLoadingStepStatus
}

interface CreatorLoadingStateProps {
  title?: string
  description?: string
  steps?: CreatorLoadingStep[]
}

export function CreatorLoadingState({
  title = "Opening creator tools",
  description,
  steps = [{ label: "Preparing workspace", status: "active" }],
}: CreatorLoadingStateProps) {
  return (
    <div className="flex min-h-[240px] w-full items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50">
            <Loader2 className="h-4 w-4 animate-spin text-red-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
            <div className="mt-3 space-y-2">
              {steps.map((step, index) => {
                const status = step.status ?? (index === 0 ? "active" : "pending")
                const dotClassName =
                  status === "complete"
                    ? "bg-emerald-500"
                    : status === "active"
                      ? "bg-red-600"
                      : "bg-slate-300"
                const textClassName =
                  status === "active"
                    ? "text-slate-800"
                    : status === "complete"
                      ? "text-slate-600"
                      : "text-slate-400"

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
