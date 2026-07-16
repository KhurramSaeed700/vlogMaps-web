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
      className="flex min-h-[320px] w-full items-center justify-center overflow-hidden px-4 py-8"
    >
      <div className="flex w-full max-w-xl flex-col items-center justify-center">
        <img
          src="/vmap-loading.svg"
          width={237}
          height={237}
          alt=""
          aria-hidden="true"
          className="h-auto w-40 select-none sm:w-48 md:w-52"
          draggable={false}
        />
        <div className="relative mt-1 h-24 w-[min(92vw,30rem)] overflow-hidden sm:h-32">
          <img
            src="/loading-text.svg"
            width={1920}
            height={1080}
            alt=""
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-auto w-full -translate-y-1/2 select-none"
            draggable={false}
          />
        </div>
        <span className="sr-only">{loadingDescription}</span>
      </div>
    </div>
  )
}
