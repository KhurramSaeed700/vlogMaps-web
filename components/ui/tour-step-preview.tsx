"use client"

import { Bookmark, Check, Cloud, Copy, MapPin, Pencil, Plane, Play, Search, Settings, Volume2 } from "lucide-react"
import type { TourPreviewKind } from "@/lib/tour-visuals"

function MiniMap({ flight = false }: { flight?: boolean }) {
  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg bg-[#edf4ee]">
      <svg viewBox="0 0 220 128" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M140 -10 Q95 50 148 138 L188 138 Q135 55 178 -10" fill="#cce5f1" />
        <path d="M-20 30 L230 93 M20 -10 L110 140 M90 -10 L30 140 M200 -10 L122 140" stroke="white" strokeWidth="9" />
        <path d="M-20 30 L230 93 M20 -10 L110 140 M90 -10 L30 140 M200 -10 L122 140" stroke="#dae2dc" strokeWidth="1" />
        <path d="M24 102 Q62 102 76 69 T130 62 T198 24" fill="none" stroke={flight ? "#38a6d2" : "#f1784f"} strokeWidth="3" strokeLinecap="round" className="tour-demo-route" />
        <circle cx="24" cy="102" r="5" fill="white" stroke="#f1784f" strokeWidth="2" />
        <circle cx="198" cy="24" r="5" fill="white" stroke="#38a6d2" strokeWidth="2" />
        <circle r="5" fill={flight ? "#0284c7" : "#f1784f"} stroke="white" strokeWidth="2" className="tour-demo-traveler" />
      </svg>
      <span className="absolute left-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[9px] font-semibold text-slate-600 shadow-sm">{flight ? "JFK · LHR" : "Your journey"}</span>
      {flight && <Plane className="absolute right-4 top-8 h-5 w-5 -rotate-12 text-sky-600" />}
    </div>
  )
}

function MiniPlayer() {
  return (
    <div className="relative flex min-h-28 items-center justify-center overflow-hidden rounded-lg bg-[#d9e7e9]">
      <svg viewBox="0 0 180 128" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path fill="#c4d9d5" d="M0 82L56 22L99 80L128 48L180 98V128H0Z" />
        <path fill="#91b8a5" d="M-10 128L62 59L118 128Z" />
        <path fill="#749c8a" d="M71 128L140 70L190 128Z" />
        <path fill="#f6f5e9" d="M43 128Q109 74 76 128Z" />
        <circle fill="#fff9dd" cx="145" cy="24" r="12" />
      </svg>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow"><Play className="ml-0.5 h-3.5 w-3.5 fill-slate-700 text-slate-700" /></span>
      <div className="absolute bottom-2 left-2 right-2 h-1 overflow-hidden rounded bg-white/55"><div className="tour-demo-progress h-full rounded bg-orange-500" /></div>
    </div>
  )
}

function TimestampRows({ editable = false }: { editable?: boolean }) {
  return <div className="space-y-2">{["City center", "Riverside", "Old town"].map((name, index) => (
    <div key={name} className={`flex items-center gap-2 rounded-lg border p-2 ${index === 1 ? "tour-demo-selected border-orange-200 bg-orange-50" : "border-slate-100 bg-white"}`}>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${index === 1 ? "bg-teal-500" : "bg-orange-400"}`}>{index + 1}</span>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold text-slate-700">{name}</div><div className="mt-0.5 text-[8px] text-slate-400">{["0:12", "0:28–0:40", "0:52"][index]}</div></div>
      {editable ? <Pencil className="h-3 w-3 text-slate-400" /> : <Play className="h-3 w-3 text-slate-400" />}
    </div>
  ))}</div>
}

export function TourStepPreview({ kind }: { kind: TourPreviewKind }) {
  let content
  switch (kind) {
    case "journey":
      content = <><div className="grid h-36 grid-cols-[0.9fr_1.1fr] gap-2"><MiniPlayer /><MiniMap /></div><div className="mt-3 flex items-center gap-2 text-[9px] text-slate-500"><span className="rounded-full bg-sky-50 px-2 py-1 font-semibold text-sky-700">Live map</span>The map follows the video<span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" /></div></>
      break
    case "timestamps":
      content = <div className="grid grid-cols-[1.1fr_0.9fr] gap-3"><TimestampRows /><MiniMap /></div>
      break
    case "settings":
      content = <div className="mx-auto w-[88%] rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div className="mb-4 flex items-center gap-2 text-xs font-bold text-slate-700"><Settings className="h-3.5 w-3.5" />Settings</div><div className="flex items-center justify-between text-[10px] text-slate-500"><span className="flex items-center gap-1.5"><Volume2 className="h-3 w-3" />Volume</span><span>60%</span></div><div className="my-3 h-1.5 rounded-full bg-slate-100"><div className="tour-demo-volume relative h-full rounded-full bg-indigo-500"><span className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-500 shadow" /></div></div><div className="mt-5 flex items-center justify-between text-[10px] text-slate-600">Quick tour<span className="rounded-md bg-indigo-50 px-2 py-1 font-semibold text-indigo-600">Replay</span></div></div>
      break
    case "share":
      content = <div className="mx-auto my-2 w-[90%] rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div className="text-xs font-bold text-slate-700">Share this journey</div><div className="my-3 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[9px] text-slate-400"><span className="flex-1 truncate">travelmap.app/watch/your-journey</span><Copy className="h-3 w-3" /></div><div className="tour-demo-selected flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-[10px] font-semibold text-white"><Check className="h-3 w-3" />Link copied</div></div>
      break
    case "tools":
    case "shortcuts":
      content = <><div className="mb-3 grid grid-cols-3 gap-2">{[["Point", "Q"], ["Stop", "W"], ["Flight", "E"]].map(([name,key])=><div key={key} className="rounded-lg border border-slate-200 bg-white py-2 text-center"><kbd className="tour-demo-key mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">{key}</kbd><span className="text-[9px] text-slate-500">{name}</span></div>)}</div><div className="h-24"><MiniMap /></div></>
      break
    case "search":
      content = <><div className="relative z-10 mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><Search className="h-3 w-3 text-slate-400" /><span className="text-[10px] text-slate-600">City center<span className="tour-demo-caret ml-0.5 border-r border-indigo-500" /></span><span className="ml-auto rounded bg-indigo-50 px-2 py-1 text-[8px] font-semibold text-indigo-600">Search</span></div><div className="h-32"><MiniMap /></div></>
      break
    case "flight":
      content = <><div className="mb-2 flex items-center justify-between rounded-lg bg-white px-3 py-2"><span className="text-[10px] font-semibold text-slate-600">JFK <span className="ml-1 text-[8px] font-normal text-slate-400">0:12</span></span><Plane className="h-4 w-4 text-sky-500" /><span className="text-[10px] font-semibold text-slate-600">LHR <span className="ml-1 text-[8px] font-normal text-slate-400">0:40</span></span></div><div className="h-32"><MiniMap flight /></div></>
      break
    case "edit":
      content = <div className="mx-auto w-[90%] rounded-xl border border-orange-100 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center gap-2 text-[10px] font-bold text-slate-700"><Pencil className="h-3 w-3 text-orange-500" />Edit timestamp</div><div className="mb-2 rounded-md border border-slate-200 px-2 py-2 text-[10px] text-slate-600">City center</div><div className="mb-3 flex gap-2">{["0:12", "Point"].map(text=><span key={text} className="flex-1 rounded-md bg-slate-50 p-2 text-[9px] text-slate-500">{text}</span>)}</div><div className="tour-demo-selected rounded-md bg-orange-500 py-2 text-center text-[10px] font-semibold text-white">Save changes</div></div>
      break
    case "saved":
      content = <div className="mx-auto w-[90%] rounded-xl border border-slate-100 bg-white p-3 shadow-sm"><div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-700"><Bookmark className="h-3.5 w-3.5 text-orange-500" />Saved places</div>{["Favorite café", "Home"].map(name=><div key={name} className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-[10px] text-slate-600"><MapPin className="h-3.5 w-3.5 text-teal-500" /><span className="flex-1">{name}</span><span className="text-lg leading-none text-indigo-500">+</span></div>)}</div>
      break
    case "autosave":
      content = <div className="flex min-h-44 flex-col items-center justify-center gap-3"><span className="tour-demo-selected flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50"><Cloud className="h-7 w-7 text-emerald-500" /></span><span className="text-xs font-semibold text-slate-700">Changes saved</span><div className="flex gap-2"><span className="rounded-full bg-white px-2 py-1 text-[9px] text-slate-500">Browser backup</span><span className="rounded-full bg-white px-2 py-1 text-[9px] text-slate-500">Cloud synced</span></div></div>
      break
    case "route":
      content = <div className="grid h-44 grid-cols-[0.8fr_1.2fr] gap-2"><div className="space-y-3 rounded-lg bg-white p-3"><div className="text-[9px] font-semibold text-slate-600">Trip route</div>{["Start", "End"].map((text,index)=><div key={text} className="flex items-center gap-2 text-[9px] text-slate-500"><span className={`h-2 w-2 rounded-full ${index ? "bg-sky-400" : "bg-orange-400"}`} />{text}</div>)}<div className="tour-demo-selected rounded bg-indigo-50 px-2 py-1.5 text-center text-[9px] font-semibold text-indigo-600">Preview</div></div><MiniMap /></div>
      break
  }
  return <div data-tour-preview={kind} aria-hidden="true" className="tour-demo pointer-events-none mt-4 overflow-hidden rounded-xl bg-slate-50 p-3">{content}</div>
}
