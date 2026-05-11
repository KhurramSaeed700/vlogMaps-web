"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { RedirectToSignIn, useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  FileText,
  Globe,
  Shield,
  Upload,
  User,
  Youtube,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { isCreatorEmail } from "@/lib/creator-access"

const applicationDraftStorageKey = "travelmap:creator-application:v2"

interface CreatorApplicationFormData {
  fullName: string
  displayName: string
  email: string
  phone: string
  country: string
  city: string
  channelName: string
  channelUrl: string
  channelHandle: string
  ownershipEmail: string
  subscriberCount: string
  monthlyViews: string
  uploadCadence: string
  channelStartedAt: string
  travelContentPercentage: string
  recentTravelUploads: string
  travelRegions: string
  channelFocus: string
  whyTravelMap: string
  verificationCode: string
  verificationPlacement: string
  ownershipProof: string
  sampleVideoUrlOne: string
  sampleVideoUrlTwo: string
  sampleVideoUrlThree: string
  managerRole: string
  notes: string
  agreeOwnership: boolean
  agreeTravelOnly: boolean
  agreeManualReview: boolean
}

function isYoutubeUrl(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized.includes("youtube.com/") || normalized.includes("youtu.be/")
}

function parseIntegerValue(value: string) {
  const numeric = Number.parseInt(value.replace(/[^\d]/g, ""), 10)
  return Number.isFinite(numeric) ? numeric : null
}

function buildInitialFormData({
  fullName,
  email,
  verificationCode,
}: {
  fullName?: string | null
  email?: string | null
  verificationCode: string
}): CreatorApplicationFormData {
  return {
    fullName: fullName || "",
    displayName: "",
    email: email || "",
    phone: "",
    country: "",
    city: "",
    channelName: "",
    channelUrl: "",
    channelHandle: "",
    ownershipEmail: email || "",
    subscriberCount: "",
    monthlyViews: "",
    uploadCadence: "",
    channelStartedAt: "",
    travelContentPercentage: "",
    recentTravelUploads: "",
    travelRegions: "",
    channelFocus: "",
    whyTravelMap: "",
    verificationCode,
    verificationPlacement: "",
    ownershipProof: "",
    sampleVideoUrlOne: "",
    sampleVideoUrlTwo: "",
    sampleVideoUrlThree: "",
    managerRole: "",
    notes: "",
    agreeOwnership: false,
    agreeTravelOnly: false,
    agreeManualReview: false,
  }
}

function CreatorApplicationContent() {
  const router = useRouter()
  const { user } = useUser()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const verificationCode = useMemo(() => {
    const seed = user?.id?.slice(0, 6).toUpperCase() || "VERIFY"
    return `TRAVELMAP-${seed}`
  }, [user?.id])
  const [formData, setFormData] = useState<CreatorApplicationFormData>(() =>
    buildInitialFormData({
      fullName: user?.fullName,
      email: user?.primaryEmailAddress?.emailAddress,
      verificationCode,
    }),
  )
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user || typeof window === "undefined") {
      return
    }

    const rawDraft = window.localStorage.getItem(applicationDraftStorageKey)
    const defaults = buildInitialFormData({
      fullName: user.fullName,
      email: user.primaryEmailAddress?.emailAddress,
      verificationCode,
    })

    if (!rawDraft) {
      setFormData(defaults)
      return
    }

    try {
      const parsed = JSON.parse(rawDraft) as Partial<CreatorApplicationFormData>
      setFormData({
        ...defaults,
        ...parsed,
        fullName: parsed.fullName || defaults.fullName,
        email: parsed.email || defaults.email,
        ownershipEmail: parsed.ownershipEmail || defaults.ownershipEmail,
        verificationCode,
      })
    } catch {
      setFormData(defaults)
    }
  }, [user, verificationCode])

  useEffect(() => {
    if (typeof window === "undefined" || isSubmitted) {
      return
    }

    window.localStorage.setItem(applicationDraftStorageKey, JSON.stringify(formData))
  }, [formData, isSubmitted])

  const handleInputChange = <K extends keyof CreatorApplicationFormData>(
    field: K,
    value: CreatorApplicationFormData[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      const nextFiles = Array.from(files)
      setUploadedFiles((prev) => {
        const existingNames = new Set(prev.map((file) => file.name))
        return [...prev, ...nextFiles.filter((file) => !existingNames.has(file.name))]
      })
      setSubmitMessage(null)
    }

    event.target.value = ""
  }

  const validationErrors = useMemo(() => {
    const errors: string[] = []
    const travelPercentage = parseIntegerValue(formData.travelContentPercentage)
    const travelUploads = parseIntegerValue(formData.recentTravelUploads)
    const sampleUrls = [
      formData.sampleVideoUrlOne,
      formData.sampleVideoUrlTwo,
      formData.sampleVideoUrlThree,
    ].filter((value) => value.trim().length > 0)

    if (!formData.fullName.trim()) {
      errors.push("legal name")
    }
    if (!formData.email.trim()) {
      errors.push("contact email")
    }
    if (!formData.country.trim()) {
      errors.push("country")
    }
    if (!formData.channelName.trim()) {
      errors.push("channel name")
    }
    if (!isYoutubeUrl(formData.channelUrl)) {
      errors.push("valid YouTube channel URL")
    }
    if (!formData.channelHandle.trim()) {
      errors.push("channel handle")
    }
    if (!formData.ownershipEmail.trim()) {
      errors.push("ownership email")
    }
    if (!formData.managerRole.trim()) {
      errors.push("role on channel")
    }
    if (travelPercentage === null || travelPercentage < 50) {
      errors.push("travel content percentage of at least 50%")
    }
    if (travelUploads === null || travelUploads < 3) {
      errors.push("at least 3 recent travel uploads")
    }
    if (!formData.travelRegions.trim()) {
      errors.push("travel regions covered")
    }
    if (!formData.channelFocus.trim()) {
      errors.push("travel channel focus")
    }
    if (!formData.ownershipProof.trim()) {
      errors.push("ownership proof details")
    }
    if (!formData.verificationPlacement.trim()) {
      errors.push("verification code placement")
    }
    if (sampleUrls.length < 2 || sampleUrls.some((value) => !isYoutubeUrl(value))) {
      errors.push("2 valid sample travel video URLs")
    }
    if (uploadedFiles.length === 0) {
      errors.push("verification files")
    }
    if (!formData.agreeOwnership) {
      errors.push("ownership confirmation")
    }
    if (!formData.agreeTravelOnly) {
      errors.push("travel content confirmation")
    }
    if (!formData.agreeManualReview) {
      errors.push("manual review consent")
    }

    return errors
  }, [formData, uploadedFiles.length])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (validationErrors.length > 0) {
      setSubmitMessage(`Please complete: ${validationErrors.join(", ")}.`)
      return
    }

    setSubmitMessage("Submitting verification packet...")
    setIsSubmitting(true)

    window.setTimeout(() => {
      setIsSubmitting(false)
      setIsSubmitted(true)
      setSubmitMessage("Verification form submitted. In a production flow this would enter the review queue.")
      window.localStorage.removeItem(applicationDraftStorageKey)
    }, 1800)
  }

  const reviewerSignals = [
    "Channel URL and handle",
    "Travel content percentage",
    "Recent travel uploads count",
    "Ownership proof statement",
    "Verification code placement",
    "Sample travel videos",
    "Identity or studio screenshots",
  ]

  const uploadedFileNames = uploadedFiles.map((file) => file.name)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <TravelMapLogo />
          </div>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            Creator Verification
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-8">
        {isSubmitted ? (
          <Card className="mx-auto max-w-3xl border-emerald-200 bg-emerald-50">
            <CardContent className="space-y-6 p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle className="h-7 w-7 text-emerald-700" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold text-emerald-950">Verification form submitted</h1>
                  <p className="text-sm text-emerald-900">
                    Your creator application is ready for manual review. This prototype does not persist to a real
                    backend yet, but the form now collects the exact review details your team would need.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-emerald-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-900">Channel submitted</p>
                  <p className="mt-1 text-sm text-slate-600">{formData.channelName}</p>
                  <p className="mt-2 text-xs text-slate-500">{formData.channelUrl}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-900">Verification code</p>
                  <p className="mt-1 text-sm text-slate-600">{formData.verificationCode}</p>
                  <p className="mt-2 text-xs text-slate-500">{formData.verificationPlacement}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {uploadedFileNames.map((fileName) => (
                  <Badge key={fileName} variant="secondary" className="bg-white text-slate-700">
                    {fileName}
                  </Badge>
                ))}
              </div>

              <div className="flex gap-3">
                <Button onClick={() => router.push("/")}>Back to Home</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSubmitted(false)
                    setSubmitMessage(null)
                  }}
                >
                  Edit submission
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <section className="space-y-4">
                <Badge className="border-0 bg-red-600 text-white">Travel YouTube creators only</Badge>
                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold text-slate-950">Creator verification form</h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-600">
                    Use this form to apply for creator access. We only approve applicants who own or directly manage a
                    legitimate travel-focused YouTube channel and want to add accurate timestamps and route points for
                    viewers on TravelMap.
                  </p>
                </div>
              </section>

              <Card className="border-slate-200">
                <CardContent className="grid gap-4 p-6 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900">Who should apply</p>
                    <p className="text-sm text-slate-600">Owners or channel managers of travel-related YouTube channels.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900">What we verify</p>
                    <p className="text-sm text-slate-600">Channel ownership, travel relevance, and reviewable sample videos.</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-900">What access enables</p>
                    <p className="text-sm text-slate-600">Add video timestamps and map points for approved creator videos.</p>
                  </div>
                </CardContent>
              </Card>

              <form onSubmit={handleSubmit} className="space-y-6">
                {submitMessage && (
                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      validationErrors.length > 0
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-blue-200 bg-blue-50 text-blue-900"
                    }`}
                  >
                    {submitMessage}
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Identity and contact
                    </CardTitle>
                    <CardDescription>The reviewer needs a real person to verify against the channel.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Legal name *</Label>
                      <Input
                        id="fullName"
                        value={formData.fullName}
                        onChange={(event) => handleInputChange("fullName", event.target.value)}
                        placeholder="Full legal name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display name</Label>
                      <Input
                        id="displayName"
                        value={formData.displayName}
                        onChange={(event) => handleInputChange("displayName", event.target.value)}
                        placeholder="Public name if different from legal name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Contact email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(event) => handleInputChange("email", event.target.value)}
                        placeholder="name@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone or WhatsApp</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(event) => handleInputChange("phone", event.target.value)}
                        placeholder="Optional reviewer contact number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country *</Label>
                      <Input
                        id="country"
                        value={formData.country}
                        onChange={(event) => handleInputChange("country", event.target.value)}
                        placeholder="Country of residence"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(event) => handleInputChange("city", event.target.value)}
                        placeholder="City or base location"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Youtube className="h-5 w-5 text-red-600" />
                      YouTube channel details
                    </CardTitle>
                    <CardDescription>These details establish the channel identity your team is approving.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="channelName">Channel name *</Label>
                      <Input
                        id="channelName"
                        value={formData.channelName}
                        onChange={(event) => handleInputChange("channelName", event.target.value)}
                        placeholder="YouTube channel name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="channelHandle">Channel handle *</Label>
                      <Input
                        id="channelHandle"
                        value={formData.channelHandle}
                        onChange={(event) => handleInputChange("channelHandle", event.target.value)}
                        placeholder="@yourchannel"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="channelUrl">Channel URL *</Label>
                      <Input
                        id="channelUrl"
                        value={formData.channelUrl}
                        onChange={(event) => handleInputChange("channelUrl", event.target.value)}
                        placeholder="https://youtube.com/@yourchannel"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ownershipEmail">Email tied to the channel *</Label>
                      <Input
                        id="ownershipEmail"
                        type="email"
                        value={formData.ownershipEmail}
                        onChange={(event) => handleInputChange("ownershipEmail", event.target.value)}
                        placeholder="Channel owner or manager email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="managerRole">Your role on the channel *</Label>
                      <Input
                        id="managerRole"
                        value={formData.managerRole}
                        onChange={(event) => handleInputChange("managerRole", event.target.value)}
                        placeholder="Owner, co-owner, editor, producer"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subscriberCount">Subscriber count</Label>
                      <Input
                        id="subscriberCount"
                        value={formData.subscriberCount}
                        onChange={(event) => handleInputChange("subscriberCount", event.target.value)}
                        placeholder="e.g. 125000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="monthlyViews">Approx. monthly views</Label>
                      <Input
                        id="monthlyViews"
                        value={formData.monthlyViews}
                        onChange={(event) => handleInputChange("monthlyViews", event.target.value)}
                        placeholder="e.g. 450000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="channelStartedAt">Channel started</Label>
                      <Input
                        id="channelStartedAt"
                        value={formData.channelStartedAt}
                        onChange={(event) => handleInputChange("channelStartedAt", event.target.value)}
                        placeholder="Month and year"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="uploadCadence">Upload cadence</Label>
                      <Input
                        id="uploadCadence"
                        value={formData.uploadCadence}
                        onChange={(event) => handleInputChange("uploadCadence", event.target.value)}
                        placeholder="Weekly, twice a month, seasonal"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Travel relevance
                    </CardTitle>
                    <CardDescription>
                      This is the filter that keeps creator access limited to valid travel channels.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="travelContentPercentage">Travel content percentage *</Label>
                        <Input
                          id="travelContentPercentage"
                          value={formData.travelContentPercentage}
                          onChange={(event) => handleInputChange("travelContentPercentage", event.target.value)}
                          placeholder="e.g. 85"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="recentTravelUploads">Recent travel uploads in last 90 days *</Label>
                        <Input
                          id="recentTravelUploads"
                          value={formData.recentTravelUploads}
                          onChange={(event) => handleInputChange("recentTravelUploads", event.target.value)}
                          placeholder="e.g. 6"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="travelRegions">Regions or countries covered *</Label>
                      <Textarea
                        id="travelRegions"
                        value={formData.travelRegions}
                        onChange={(event) => handleInputChange("travelRegions", event.target.value)}
                        rows={3}
                        placeholder="List the places your channel regularly covers"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="channelFocus">What kind of travel content do you publish? *</Label>
                      <Textarea
                        id="channelFocus"
                        value={formData.channelFocus}
                        onChange={(event) => handleInputChange("channelFocus", event.target.value)}
                        rows={4}
                        placeholder="Road trips, city guides, long-form itineraries, hiking vlogs, food-focused travel, rail journeys..."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="whyTravelMap">Why do you want TravelMap creator access?</Label>
                      <Textarea
                        id="whyTravelMap"
                        value={formData.whyTravelMap}
                        onChange={(event) => handleInputChange("whyTravelMap", event.target.value)}
                        rows={4}
                        placeholder="Explain how you plan to add timestamps and map points for viewers."
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Ownership verification
                    </CardTitle>
                    <CardDescription>
                      Give the reviewer a clean way to confirm that you control the channel you are submitting.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="verificationCode">Verification code</Label>
                        <Input id="verificationCode" value={formData.verificationCode} readOnly />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="verificationPlacement">Where will you place this code? *</Label>
                        <Input
                          id="verificationPlacement"
                          value={formData.verificationPlacement}
                          onChange={(event) => handleInputChange("verificationPlacement", event.target.value)}
                          placeholder="About page, pinned comment, community post"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="ownershipProof">Describe your ownership proof *</Label>
                      <Textarea
                        id="ownershipProof"
                        value={formData.ownershipProof}
                        onChange={(event) => handleInputChange("ownershipProof", event.target.value)}
                        rows={4}
                        placeholder="Example: I will upload a YouTube Studio screenshot showing the dashboard and channel handle, and place the verification code in the About page."
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Extra notes for reviewer</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(event) => handleInputChange("notes", event.target.value)}
                        rows={3}
                        placeholder="Anything that helps your team verify the channel faster."
                      />
                    </div>

                    <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                      <Upload className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                      <p className="text-sm font-medium text-slate-900">Upload verification files</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Suggested: government ID, YouTube Studio screenshot, business proof, or channel manager proof.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <Button type="button" variant="outline" className="mt-4" onClick={() => fileInputRef.current?.click()}>
                        Choose Files
                      </Button>
                      <p className="mt-3 text-xs text-slate-500">
                        {uploadedFiles.length > 0
                          ? `${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"} selected`
                          : "No files selected yet"}
                      </p>
                    </div>

                    {uploadedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {uploadedFiles.map((file) => (
                          <Badge key={file.name} variant="secondary" className="bg-slate-100 text-slate-700">
                            {file.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Sample videos for review
                    </CardTitle>
                    <CardDescription>
                      Share the travel videos your team should judge when deciding whether this channel qualifies.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="sampleVideoUrlOne">Sample travel video 1 *</Label>
                      <Input
                        id="sampleVideoUrlOne"
                        value={formData.sampleVideoUrlOne}
                        onChange={(event) => handleInputChange("sampleVideoUrlOne", event.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sampleVideoUrlTwo">Sample travel video 2 *</Label>
                      <Input
                        id="sampleVideoUrlTwo"
                        value={formData.sampleVideoUrlTwo}
                        onChange={(event) => handleInputChange("sampleVideoUrlTwo", event.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sampleVideoUrlThree">Sample travel video 3</Label>
                      <Input
                        id="sampleVideoUrlThree"
                        value={formData.sampleVideoUrlThree}
                        onChange={(event) => handleInputChange("sampleVideoUrlThree", event.target.value)}
                        placeholder="Optional third review link"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      Declarations
                    </CardTitle>
                    <CardDescription>
                      These confirmations protect the platform from impersonation and non-travel applications.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="agreeOwnership"
                        checked={formData.agreeOwnership}
                        onCheckedChange={(checked) => handleInputChange("agreeOwnership", checked as boolean)}
                      />
                      <Label htmlFor="agreeOwnership" className="text-sm leading-6">
                        I confirm that I own this YouTube channel or have direct permission to manage it on behalf of
                        the owner.
                      </Label>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="agreeTravelOnly"
                        checked={formData.agreeTravelOnly}
                        onCheckedChange={(checked) => handleInputChange("agreeTravelOnly", checked as boolean)}
                      />
                      <Label htmlFor="agreeTravelOnly" className="text-sm leading-6">
                        I understand that TravelMap creator access is reserved for travel-related channels and that
                        non-travel or misleading applications can be rejected or removed later.
                      </Label>
                    </div>

                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="agreeManualReview"
                        checked={formData.agreeManualReview}
                        onCheckedChange={(checked) => handleInputChange("agreeManualReview", checked as boolean)}
                      />
                      <Label htmlFor="agreeManualReview" className="text-sm leading-6">
                        I consent to manual review by the TravelMap team, including follow-up questions, ownership
                        checks, and verification of the public code placement above.
                      </Label>
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      False ownership claims, copied channels, or fabricated travel credentials should be rejected and
                      may lead to permanent creator access denial.
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-500">
                    {validationErrors.length === 0
                      ? "Verification packet is ready to submit."
                      : `${validationErrors.length} review item${validationErrors.length === 1 ? "" : "s"} still missing.`}
                  </p>
                  <Button type="submit" size="lg" disabled={isSubmitting} className="px-8">
                    {isSubmitting ? "Submitting..." : "Submit for Verification"}
                  </Button>
                </div>
              </form>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>Reviewer checklist</CardTitle>
                  <CardDescription>What your team should be able to confirm from this form.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {reviewerSignals.map((signal) => (
                    <div key={signal} className="flex items-start gap-3 text-sm text-slate-700">
                      <CheckCircle className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <span>{signal}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Approval standard</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <p>Approve creators who clearly own a real travel-focused YouTube channel.</p>
                  <p>Reject channels that are generic entertainment, reposts, or missing ownership proof.</p>
                  <p>Grant creator access only after review, then let approved accounts add timestamps and route points.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Helpful links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Link href="/creator/terms" className="block text-blue-600 hover:underline">
                    Creator terms
                  </Link>
                  <Link href="/creator/guidelines" className="block text-blue-600 hover:underline">
                    Content guidelines
                  </Link>
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}

export default function CreatorApplicationPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  const isApprovedCreator = isCreatorEmail(email)

  useEffect(() => {
    if (isLoaded && isSignedIn && isApprovedCreator) {
      router.replace("/creator/dashboard")
    }
  }, [isApprovedCreator, isLoaded, isSignedIn, router])

  if (!isLoaded) {
    return <div className="p-8 text-sm text-slate-500">Loading creator application...</div>
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />
  }

  if (isApprovedCreator) {
    return <div className="p-8 text-sm text-slate-500">Opening creator dashboard...</div>
  }

  return <CreatorApplicationContent />
}
