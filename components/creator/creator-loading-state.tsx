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
  const loadingDescription = [title, ...steps.map((step) => step.label)].join(". ")

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed inset-0 z-50 flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background p-4"
    >
      <div className="flex items-center justify-center">
        <img
          src="/vmap-loading.svg"
          width={237}
          height={237}
          alt=""
          aria-hidden="true"
          className="h-auto w-40 select-none sm:w-48 md:w-52"
          draggable={false}
        />
        <span className="sr-only">{loadingDescription}</span>
      </div>
    </div>
  )
}
