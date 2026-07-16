"use client"

import type { ReactNode } from "react"
import { MapPin, Play, Route, ShieldCheck } from "lucide-react"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"

interface AuthPageShellProps {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  variant?: "showcase" | "simple"
}

export function AuthPageShell({ eyebrow, title, description, children, variant = "showcase" }: AuthPageShellProps) {
  if (variant === "simple") {
    return (
      <main className="min-h-screen bg-zinc-50 text-zinc-950">
        <section className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10 sm:px-6">
          <TravelMapLogo
            className="mb-8 justify-center"
            markClassName="bg-red-600"
            textClassName="text-zinc-950"
          />

          <div className="rounded-xl border border-zinc-200 bg-[#ffffff] p-5 shadow-sm sm:p-7">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
            </div>

            {children}
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070707] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(239,68,68,0.22),transparent_28%),radial-gradient(circle_at_80%_8%,rgba(14,165,233,0.14),transparent_26%),linear-gradient(135deg,#070707_0%,#111113_46%,#070707_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(to_top,rgba(249,115,22,0.16),transparent)]" />
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40 backdrop-blur-xl lg:grid-cols-[0.92fr_1.08fr]">
          <aside className="relative hidden min-h-[620px] overflow-hidden bg-slate-950 lg:block">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80')] bg-cover bg-center" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/82" />
            <div className="relative flex h-full flex-col justify-between p-8">
              <TravelMapLogo
                className="text-white"
                markClassName="bg-red-600 shadow-lg shadow-red-950/30"
                textClassName="text-white"
              />

              <div className="space-y-5">
                <div className="flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
                  <Route className="h-3.5 w-3.5" />
                  Creator route studio
                </div>
                <blockquote className="max-w-sm text-2xl font-semibold leading-tight tracking-tight">
                  Map every stop, road, and moment your travel videos deserve.
                </blockquote>
                <div className="grid grid-cols-3 gap-2 text-xs text-white/75">
                  <div className="rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
                    <MapPin className="mb-2 h-4 w-4 text-red-300" />
                    Timestamp stops
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
                    <Play className="mb-2 h-4 w-4 text-red-300" />
                    Video sync
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/10 p-3 backdrop-blur">
                    <ShieldCheck className="mb-2 h-4 w-4 text-red-300" />
                    Creator access
                  </div>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex min-h-[620px] items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
            <div className="w-full max-w-[25rem]">
              <div className="mb-8 text-center lg:text-left">
                <TravelMapLogo
                  className="mb-7 justify-center lg:hidden"
                  markClassName="bg-red-600"
                  textClassName="text-white"
                />
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">{eyebrow}</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
                <p className="mt-3 text-sm leading-6 text-white/58">{description}</p>
              </div>

              {children}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
