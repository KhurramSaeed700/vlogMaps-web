import { Button } from "@/components/ui/button"
import { preferenceOptions, type PreferenceId } from "./home-preferences"

interface PreferenceFilterProps {
  selectedPreference: PreferenceId
  onPreferenceChange: (preference: PreferenceId) => void
}

export function PreferenceFilter({ selectedPreference, onPreferenceChange }: PreferenceFilterProps) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2">
        {preferenceOptions.map((option) => {
          const Icon = option.icon
          const isSelected = selectedPreference === option.id

          return (
            <Button
              key={option.id}
              type="button"
              variant={isSelected ? "default" : "outline"}
              className="shrink-0 rounded-full"
              onClick={() => onPreferenceChange(option.id)}
            >
              <Icon className="mr-2 h-4 w-4" />
              {option.label}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
