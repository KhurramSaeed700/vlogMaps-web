"use client"

import { SignIn, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const { isLoaded, isSignedIn } = useUser()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <MapPin className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">TravelMap</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome back</h1>
          <p className="text-gray-600">Sign in with Clerk to keep your dashboard and watch history in one place.</p>
        </div>

        {!isLoaded || !isSignedIn ? (
          <div className="flex justify-center">
            <SignIn path="/auth/login" routing="path" signUpUrl="/auth/register" />
          </div>
        ) : (
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <p className="text-sm text-gray-600">You are already signed in.</p>
              <Link href="/dashboard">
                <Button className="w-full">Go to Dashboard</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
