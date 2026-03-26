"use client"

import { SignUp, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin } from "lucide-react"
import Link from "next/link"

export default function RegisterPage() {
  const { isLoaded, isSignedIn } = useUser()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <MapPin className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900">TravelMap</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create your account</h1>
          <p className="text-gray-600">Start your interactive travel journey with a proper account flow.</p>
        </div>

        {!isLoaded || !isSignedIn ? (
          <div className="flex justify-center">
            <SignUp path="/auth/register" routing="path" signInUrl="/auth/login" />
          </div>
        ) : (
          <Card>
            <CardContent className="space-y-4 p-6 text-center">
              <p className="text-sm text-gray-600">Your account is already active.</p>
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
