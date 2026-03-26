"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, Play, Users, Shield, Zap, Globe } from "lucide-react"
import Link from "next/link"
import { UserButton, useUser } from "@clerk/nextjs"

export default function HomePage() {
  const { isLoaded, isSignedIn } = useUser()
  const showSignedIn = isLoaded && isSignedIn

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">TravelMap</span>
          </div>
          <div className="flex items-center gap-4">
            {!showSignedIn ? (
              <>
              <Link href="/auth/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/auth/register">
                <Button>Get Started</Button>
              </Link>
              </>
            ) : (
              <>
              <Link href="/dashboard">
                <Button variant="ghost">Dashboard</Button>
              </Link>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <Badge className="mb-4" variant="secondary">
            <Zap className="h-4 w-4 mr-1" />
            Interactive Travel Experience
          </Badge>
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Watch Travel Videos with
            <span className="text-blue-600"> Live Interactive Maps</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">
            Experience travel content like never before. Watch YouTube travel videos while following the journey on an
            interactive map that updates in real-time with the video.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {!showSignedIn ? (
              <Link href="/auth/register">
                <Button size="lg" className="text-lg px-8">
                  <Play className="h-5 w-5 mr-2" />
                  Start Watching
                </Button>
              </Link>
            ) : (
              <Link href="/dashboard">
                <Button size="lg" className="text-lg px-8">
                  <Play className="h-5 w-5 mr-2" />
                  Go to Dashboard
                </Button>
              </Link>
            )}
            <Link href="/creator/apply">
              <Button size="lg" variant="outline" className="text-lg px-8">
                <MapPin className="h-5 w-5 mr-2" />
                I'm a Creator
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Two Ways to Experience Travel</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Whether you're exploring the world from your couch or sharing your adventures, we've got you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Viewers */}
            <Card className="border-2 hover:border-blue-200 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle>For Viewers</CardTitle>
                    <CardDescription>Explore the world through interactive travel videos</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Watch videos with synchronized interactive maps</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Multiple viewing modes: split-screen or fullscreen map</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Scrub through video to jump to different locations</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Follow the journey in real-time on the map</p>
                </div>
              </CardContent>
            </Card>

            {/* Creators */}
            <Card className="border-2 hover:border-green-200 transition-colors">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Globe className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>For Creators</CardTitle>
                    <CardDescription>Link your travel videos to interactive maps</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Easy dashboard to add keyframes and coordinates</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Verified creator program with security checks</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Link only your own YouTube videos</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-600 rounded-full mt-2"></div>
                  <p className="text-sm text-gray-600">Enhance viewer engagement with your content</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">Simple steps to start your interactive travel experience</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">Sign Up</h3>
              <p className="text-gray-600">
                Create your account and start as a viewer. Upgrade to creator later if you make travel content.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">Watch & Explore</h3>
              <p className="text-gray-600">
                Browse travel videos with interactive maps. Follow journeys in real-time as you watch.
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">Create & Share</h3>
              <p className="text-gray-600">
                Apply to become a verified creator and link your own travel videos to interactive maps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-16 px-4 bg-white">
        <div className="container mx-auto text-center max-w-3xl">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Shield className="h-8 w-8 text-green-600" />
            <h2 className="text-3xl font-bold text-gray-900">Secure & Verified</h2>
          </div>
          <p className="text-lg text-gray-600 mb-8">
            We take security seriously. Only verified creators can link their own YouTube videos to our interactive
            maps. Our verification process ensures authenticity and prevents misuse.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="p-6 bg-green-50 rounded-lg">
              <h3 className="font-semibold text-green-800 mb-2">Creator Verification</h3>
              <p className="text-sm text-green-700">Multi-step verification process to confirm channel ownership</p>
            </div>
            <div className="p-6 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Secure Authentication</h3>
              <p className="text-sm text-blue-700">Enterprise-grade security for all user accounts</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <MapPin className="h-6 w-6" />
            <span className="text-xl font-bold">TravelMap</span>
          </div>
          <p className="text-gray-400 mb-6">Experience travel content like never before with interactive maps.</p>
          <div className="flex justify-center gap-6 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
