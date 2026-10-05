"use client"

import { useEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { ScanSearch, Loader2, X, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LandmarkResult } from "@/lib/landmark-search"
import { getVideoFrameCrop } from "@/lib/video-frame-crop"

interface Props {
  previewRef: RefObject<HTMLDivElement | null>
  mapOverlayRef: RefObject<HTMLElement | null>
  onPause: () => void
  onDetected: (result: LandmarkResult) => void
}
type CaptureDevices = MediaDevices & { setCaptureHandleConfig?: (config: { handle: string; exposeOrigin: boolean; permittedOrigins: string[] }) => void }
type CaptureTrack = MediaStreamTrack & { getCaptureHandle?: () => { handle?: string; origin?: string } | null }

export function LandmarkSearchButton({ previewRef, mapOverlayRef, onPause, onDetected }: Props) {
  const [open, setOpen] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<LandmarkResult[]>([])
  const [searched, setSearched] = useState(false)
  const callbacks = useRef({ onPause, onDetected })
  const controller = useRef<AbortController | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const busyRef = useRef(false)
  useEffect(() => { callbacks.current = { onPause, onDetected } })
  useEffect(() => () => {
    generation.current++
    controller.current?.abort()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])
  const close = () => {
    generation.current++
    controller.current?.abort()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    busyRef.current = false
    setBusy(false)
    setOpen(false)
  }
  const begin = () => {
    const token = ++generation.current
    busyRef.current = true
    setBusy(true)
    setError(null)
    setResults([])
    setSearched(false)
    setImage(null)
    return token
  }
  const identify = async (nextImage: string, token: number) => {
    if (token !== generation.current) return
    setImage(nextImage)
    setOpen(true)
    const abort = new AbortController()
    controller.current = abort
    try {
      const response = await fetch("/api/creator/landmark-search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: nextImage }), signal: abort.signal,
      })
      const data = await response.json()
      if (token !== generation.current || abort.signal.aborted) return
      if (!response.ok) throw new Error(data.error || "Landmark search failed.")
      setResults(data.results ?? [])
      setSearched(true)
      // Always wait for a choice, even when Google returns one strong match.
    } catch (error) {
      if (token === generation.current && !abort.signal.aborted) setError(error instanceof Error ? error.message : "Landmark search failed.")
    } finally {
      if (token === generation.current) { busyRef.current = false; setBusy(false) }
    }
  }
  const capture = async () => {
    if (busyRef.current) return
    callbacks.current.onPause()
    const token = begin()
    setOpen(false)
    let stream: MediaStream | null = null
    const video = document.createElement("video")
    let nextImage: string | null = null
    try {
      const devices = navigator.mediaDevices as CaptureDevices | undefined
      if (!devices?.getDisplayMedia || !devices.setCaptureHandleConfig) throw new Error("Safe video capture is unavailable here. Use Chrome or upload a cropped video screenshot below.")
      const handle = crypto.randomUUID()
      devices.setCaptureHandleConfig({ handle, exposeOrigin: true, permittedOrigins: [window.location.origin] })
      previewRef.current?.scrollIntoView({ block: "center", behavior: "instant" })
      const options: DisplayMediaStreamOptions & { preferCurrentTab: boolean } = { video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true }
      stream = await devices.getDisplayMedia(options)
      streamRef.current = stream
      if (token !== generation.current) return
      const track = stream.getVideoTracks()[0] as CaptureTrack
      const captured = track?.getCaptureHandle?.()
      if (track?.getSettings().displaySurface !== "browser" || captured?.handle !== handle || captured?.origin !== window.location.origin) throw new Error("Choose this editor tab, not another tab, a window, or the entire screen. Nothing was sent to Google.")
      video.srcObject = stream
      video.muted = true
      await video.play()
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Unable to capture a frame. Try another screenshot.")), 5000)
        video.requestVideoFrameCallback(() => { window.clearTimeout(timeout); resolve() })
      })
      if (token !== generation.current) return
      const rect = previewRef.current?.getBoundingClientRect()
      if (!rect) throw new Error("Video preview is not visible.")
      const crop = getVideoFrameCrop(rect, window.innerWidth, window.innerHeight, video.videoWidth, video.videoHeight)
      if (!crop) throw new Error("The entire video must be visible. Reduce browser zoom or upload a cropped video screenshot.")
      const canvas = document.createElement("canvas")
      canvas.width = crop.width
      canvas.height = crop.height
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Unable to capture the video preview.")
      context.drawImage(video, crop.x, crop.y, crop.sourceWidth, crop.sourceHeight, 0, 0, crop.width, crop.height)
      nextImage = canvas.toDataURL("image/jpeg", 0.85)
    } catch (error) {
      if (token === generation.current) {
        setError(error instanceof DOMException && error.name === "NotAllowedError" ? "Capture cancelled or permission denied. Click Retry capture and choose this tab." : error instanceof Error ? error.message : "Capture failed.")
        setOpen(true)
        busyRef.current = false
        setBusy(false)
      }
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      video.srcObject = null
    }
    // Stop sharing before submission. Only cropped video pixels leave the browser.
    if (nextImage && token === generation.current) await identify(nextImage, token)
  }
  const upload = async (file: File | undefined) => {
    if (!file || busyRef.current) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10_000_000) { setError("Choose a cropped JPG, PNG, or WebP video screenshot under 10 MB."); return }
    callbacks.current.onPause()
    const token = begin()
    setOpen(true)
    let nextImage: string | null = null
    try {
      const bitmap = await createImageBitmap(file)
      try {
        const canvas = document.createElement("canvas")
        const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Unable to read this screenshot.")
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        nextImage = canvas.toDataURL("image/jpeg", 0.85)
      } finally { bitmap.close() }
    } catch { if (token === generation.current) { setError("Unable to read this screenshot."); busyRef.current = false; setBusy(false) } }
    if (nextImage && token === generation.current) await identify(nextImage, token)
  }
  const overlay = (
    <section aria-label="Landmark search results" className="absolute left-3 top-24 z-30 max-h-[calc(100%_-_7rem)] w-[calc(100%_-_1.5rem)] max-w-sm overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{busy ? "Searching video landmarks…" : "Which landmark is this?"}</h3><Button variant="ghost" size="icon" className="h-7 w-7" onClick={close} aria-label="Close landmark results"><X className="h-4 w-4" /></Button></div>
      {image ? <img src={image} alt="Video frame used for landmark search" className="my-2 max-h-28 w-full rounded object-contain" /> : null}
      {busy ? <p role="status" className="my-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Analyzing the video frame</p> : null}
      {error ? <p role="alert" className="my-2 text-sm text-red-500">{error}</p> : null}
      {results.length ? <div className="my-2 space-y-2"><p className="text-xs text-muted-foreground">Choose a suggestion to search its location on the map.</p>{results.map((result) => <Button key={`${result.name}:${result.lat}:${result.lng}`} variant="outline" className="h-auto min-h-10 w-full justify-start whitespace-normal text-left" onClick={() => { callbacks.current.onDetected(result); close() }}><MapPin className="mr-2 h-4 w-4 shrink-0" /><span>{result.name}<span className="block text-xs text-muted-foreground">Match score {result.score.toFixed(2)}</span></span></Button>)}</div> : null}
      {searched && !results.length ? <p role="status" className="my-2 text-sm">No landmark recognized. Try a clearer frame or Google Lens.</p> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">Capture sends only the video area to Google Vision. Recognition does not save timestamps.</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs"><button className="underline disabled:opacity-50" disabled={busy} onClick={() => void capture()}>Retry capture</button>{image ? <a className="underline" href={image} download="video-landmark.jpg">Download frame</a> : null}<a className="underline" href="https://lens.google/" target="_blank" rel="noopener noreferrer">Google Lens</a></div>
      <details className="mt-3 text-xs"><summary className="cursor-pointer">Upload a cropped video screenshot instead</summary><p className="my-2 text-muted-foreground">The selected image will be sent to Google Vision.</p><input aria-label="Upload cropped video screenshot" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="w-full" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = "" }} /></details>
    </section>
  )
  return <>
    <Button type="button" size="sm" className="h-8 px-2" onClick={() => void capture()} disabled={busy} aria-label="Search video landmark" title="Capture video area and search landmarks">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}</Button>
    {open && mapOverlayRef.current ? createPortal(overlay, mapOverlayRef.current) : null}
  </>
}
