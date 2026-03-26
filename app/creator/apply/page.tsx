"use client"

import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { MapPin, Upload, Youtube, Shield, CheckCircle, AlertCircle, ArrowLeft, FileText, Camera } from "lucide-react"
import Link from "next/link"
import { RedirectToSignIn, useUser } from "@clerk/nextjs"

function CreatorApplicationContent() {
  const router = useRouter()
  const { user } = useUser()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [formData, setFormData] = useState({
    fullName: user?.fullName || "",
    email: user?.primaryEmailAddress?.emailAddress || "",
    channelName: "",
    channelUrl: "",
    subscriberCount: "",
    monthlyViews: "",
    travelContentPercentage: "",
    bio: "",
    sampleVideoUrl: "",
    agreeToTerms: false,
    agreeToVerification: false,
  })
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    setFormData((prev) => ({
      ...prev,
      fullName: prev.fullName || user.fullName || "",
      email: prev.email || user.primaryEmailAddress?.emailAddress || "",
    }))
  }, [user])

  const handleInputChange = (field: string, value: string | boolean) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (validationErrors.length > 0) {
      setSubmitMessage(`Please complete: ${validationErrors.join(", ")}.`)
      return
    }

    setSubmitMessage("Submitting your creator application...")
    setIsSubmitting(true)

    setTimeout(() => {
      setIsSubmitting(false)
      setIsSubmitted(true)
      setSubmitMessage("Application submitted. Our review queue would persist this in a real backend.")
    }, 2000)
  }

  const validationErrors = useMemo(() => {
    const errors: string[] = []

    if (!formData.fullName.trim()) {
      errors.push("full name")
    }
    if (!formData.email.trim()) {
      errors.push("email")
    }
    if (!formData.channelName.trim()) {
      errors.push("channel name")
    }
    if (!formData.channelUrl.trim()) {
      errors.push("channel URL")
    }
    if (!formData.subscriberCount.trim()) {
      errors.push("subscriber count")
    }
    if (!formData.travelContentPercentage.trim()) {
      errors.push("travel content percentage")
    }
    if (!formData.agreeToTerms) {
      errors.push("creator terms")
    }
    if (!formData.agreeToVerification) {
      errors.push("verification consent")
    }
    if (uploadedFiles.length === 0) {
      errors.push("verification files")
    }

    return errors
  }, [formData, uploadedFiles.length])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <ArrowLeft className="h-5 w-5" />
            <MapPin className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">TravelMap</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {isSubmitted && (
          <Card className="mx-auto mb-8 max-w-2xl border-green-200 bg-green-50">
            <CardContent className="space-y-6 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-7 w-7 text-green-700" />
              </div>
              <div className="space-y-2">
                <p className="text-2xl font-semibold text-green-950">Form submitted</p>
                <p className="text-sm text-green-900">
                  Your creator application has been submitted successfully. In a real backend flow, this would now be
                  sent to the review queue.
                </p>
              </div>
              <div className="flex justify-center">
                <Button onClick={() => router.push("/dashboard")}>Go Back</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header Section */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Shield className="h-8 w-8 text-green-600" />
            <h1 className="text-3xl font-bold text-gray-900">Creator Application</h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Apply to become a verified creator and link your travel videos to interactive maps. Our verification process
            ensures only authentic content creators can use this feature.
          </p>
        </div>

        {!isSubmitted && (
          <>
        {/* Requirements Card */}
        <Card className="mb-8 border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              Requirements
            </CardTitle>
            <CardDescription>Make sure you meet these requirements before applying</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm">Own and operate a YouTube channel</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm">Minimum 1,000 subscribers</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm">At least 50% travel content</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm">Active channel (uploaded in last 30 days)</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm">Provide verification documents</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm">Agree to creator guidelines</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Application Form */}
        <Card>
          <CardHeader>
            <CardTitle>Application Form</CardTitle>
            <CardDescription>
              Please fill out all required fields accurately. Our team will verify the information provided.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {submitMessage && (
                <div
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    validationErrors.length > 0 && !isSubmitted
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-blue-200 bg-blue-50 text-blue-900"
                  }`}
                >
                  {submitMessage}
                </div>
              )}

              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Personal Information
                </h3>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      placeholder="Your full legal name"
                      value={formData.fullName}
                      onChange={(e) => handleInputChange("fullName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Channel Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Youtube className="h-5 w-5 text-red-600" />
                  YouTube Channel Information
                </h3>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="channelName">Channel Name *</Label>
                    <Input
                      id="channelName"
                      placeholder="Your YouTube channel name"
                      value={formData.channelName}
                      onChange={(e) => handleInputChange("channelName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channelUrl">Channel URL *</Label>
                    <Input
                      id="channelUrl"
                      placeholder="https://youtube.com/@yourchannel"
                      value={formData.channelUrl}
                      onChange={(e) => handleInputChange("channelUrl", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="subscriberCount">Subscriber Count *</Label>
                    <Input
                      id="subscriberCount"
                      placeholder="e.g., 5000"
                      value={formData.subscriberCount}
                      onChange={(e) => handleInputChange("subscriberCount", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthlyViews">Monthly Views</Label>
                    <Input
                      id="monthlyViews"
                      placeholder="e.g., 50000"
                      value={formData.monthlyViews}
                      onChange={(e) => handleInputChange("monthlyViews", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="travelContentPercentage">Travel Content % *</Label>
                    <Input
                      id="travelContentPercentage"
                      placeholder="e.g., 80"
                      value={formData.travelContentPercentage}
                      onChange={(e) => handleInputChange("travelContentPercentage", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sampleVideoUrl">Sample Travel Video URL</Label>
                  <Input
                    id="sampleVideoUrl"
                    placeholder="https://youtube.com/watch?v=..."
                    value={formData.sampleVideoUrl}
                    onChange={(e) => handleInputChange("sampleVideoUrl", e.target.value)}
                  />
                  <p className="text-xs text-gray-500">Provide a link to one of your best travel videos for review</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">About Your Channel</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell us about your channel, your travel content, and why you want to join TravelMap..."
                    value={formData.bio}
                    onChange={(e) => handleInputChange("bio", e.target.value)}
                    rows={4}
                  />
                </div>
              </div>

              {/* Verification Documents */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Verification Documents
                </h3>
                <p className="text-sm text-gray-600">
                  Upload documents to verify your identity and channel ownership. Accepted formats: PDF, JPG, PNG
                </p>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 mb-2">Upload verification documents</p>
                  <p className="text-xs text-gray-500 mb-4">
                    Required: Government ID, Channel ownership proof (screenshot of YouTube Studio)
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    Choose Files
                  </Button>
                  <p className="mt-3 text-xs text-gray-500">
                    {uploadedFiles.length > 0
                      ? `${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"} selected`
                      : "No files selected yet"}
                  </p>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Uploaded Files:</p>
                    <div className="flex flex-wrap gap-2">
                      {uploadedFiles.map((file, index) => (
                        <Badge key={index} variant="secondary" className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {file.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Terms and Conditions */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Terms and Verification
                </h3>

                <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="agreeToTerms"
                      checked={formData.agreeToTerms}
                      onCheckedChange={(checked) => handleInputChange("agreeToTerms", checked as boolean)}
                    />
                    <Label htmlFor="agreeToTerms" className="text-sm leading-relaxed">
                      I agree to the{" "}
                      <Link href="/creator/terms" className="text-blue-600 hover:underline">
                        Creator Terms of Service
                      </Link>{" "}
                      and{" "}
                      <Link href="/creator/guidelines" className="text-blue-600 hover:underline">
                        Content Guidelines
                      </Link>
                    </Label>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="agreeToVerification"
                      checked={formData.agreeToVerification}
                      onCheckedChange={(checked) => handleInputChange("agreeToVerification", checked as boolean)}
                    />
                    <Label htmlFor="agreeToVerification" className="text-sm leading-relaxed">
                      I understand that my application will be reviewed by the TravelMap team and that providing false
                      information may result in permanent account suspension. I consent to the verification process
                      which may include contacting me directly.
                    </Label>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 mb-1">Important Notice</p>
                  <p className="text-amber-700">
                    Only apply if you genuinely own and operate the YouTube channel you're submitting. False
                    applications will result in permanent account suspension and may be reported to relevant
                    authorities.
                  </p>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-gray-500">
                  {validationErrors.length === 0
                    ? "Everything looks ready to submit."
                    : `${validationErrors.length} item${validationErrors.length === 1 ? "" : "s"} still needed.`}
                </p>
                <Button type="submit" size="lg" disabled={isSubmitting} className="px-8">
                  {isSubmitting ? "Submitting Application..." : "Submit Application"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* What Happens Next */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>What Happens Next?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
                  1
                </div>
                <h4 className="font-semibold mb-2">Review Process</h4>
                <p className="text-sm text-gray-600">
                  Our team will review your application and verify your documents within 2 business days.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
                  2
                </div>
                <h4 className="font-semibold mb-2">Verification Call</h4>
                <p className="text-sm text-gray-600">
                  If approved, we'll schedule a brief verification call to confirm your identity and channel ownership.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3">
                  3
                </div>
                <h4 className="font-semibold mb-2">Creator Access</h4>
                <p className="text-sm text-gray-600">
                  Once verified, you'll get access to the creator dashboard to start linking your videos to maps.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>
    </div>
  )
}

export default function CreatorApplicationPage() {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) {
    return <div className="p-8 text-sm text-gray-500">Loading application form...</div>
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />
  }

  return <CreatorApplicationContent />
}
