"use client"

import { useRef } from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { MapboxTravelMap } from "@/components/mapbox-travel-map"
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Settings,
  Share2,
  Heart,
  MapPin,
  Layers,
  ArrowLeft,
} from "lucide-react"
import Link from "next/link"

// Mock video data with keyframes
const videoData = {
  id: 1,
  title: "Epic Road Trip: New York to Los Angeles",
  creator: "AdventureSeeker",
  duration: 2732, // seconds
  views: "125K",
  likes: "3.2K",
  description: "Join me on an incredible cross-country road trip adventure spanning 2,800 miles across America!",
  keyframes: [
    {
      time: 0,
      lat: 40.7128,
      lng: -74.006,
      location: "New York City",
      description: "Starting our journey in the Big Apple!",
    },
    {
      time: 300,
      lat: 40.7589,
      lng: -73.9851,
      location: "Times Square",
      description: "Last stop in NYC before hitting the road",
    },
    {
      time: 600,
      lat: 41.8781,
      lng: -87.6298,
      location: "Chicago",
      description: "Windy City pit stop for deep dish pizza",
    },
    {
      time: 1200,
      lat: 39.7392,
      lng: -104.9903,
      location: "Denver",
      description: "Mile High City with stunning mountain views",
    },
    {
      time: 1800,
      lat: 36.1699,
      lng: -115.1398,
      location: "Las Vegas",
      description: "Bright lights and desert landscapes",
    },
    {
      time: 2400,
      lat: 34.0522,
      lng: -118.2437,
      location: "Los Angeles",
      description: "Finally made it to the City of Angels!",
    },
  ],
}

export default function WatchPage({ params }: { params: { id: string } }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(75)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<"split" | "map-focus" | "video-focus">("split")
  const [currentLocation, setCurrentLocation] = useState(videoData.keyframes[0])

  const videoRef = useRef<HTMLVideoElement>(null)

  // Update current location based on video time
  useEffect(() => {
    const currentKeyframe = videoData.keyframes
      .slice()
      .reverse()
      .find((keyframe) => currentTime >= keyframe.time)

    if (currentKeyframe && currentKeyframe !== currentLocation) {
      setCurrentLocation(currentKeyframe)
    }
  }, [currentTime, currentLocation])

  // Simulate video time progression
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= videoData.duration) {
            setIsPlaying(false)
            return videoData.duration
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isPlaying])

  const togglePlay = () => setIsPlaying(!isPlaying)
  const toggleMute = () => setIsMuted(!isMuted)
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)

  const handleTimeSeek = (newTime: number[]) => {
    setCurrentTime(newTime[0])
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const jumpToKeyframe = (keyframe: (typeof videoData.keyframes)[0]) => {
    setCurrentTime(keyframe.time)
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="bg-black/80 backdrop-blur-sm text-white p-4 absolute top-0 left-0 right-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">{videoData.title}</h1>
              <p className="text-sm text-gray-300">by {videoData.creator}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Heart className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Share2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* View Mode Controls */}
      <div className="absolute top-20 right-4 z-40 flex flex-col gap-2">
        <Button
          variant={viewMode === "split" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("split")}
          className="text-xs"
        >
          <Layers className="h-4 w-4 mr-1" />
          Split
        </Button>
        <Button
          variant={viewMode === "map-focus" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("map-focus")}
          className="text-xs"
        >
          <MapPin className="h-4 w-4 mr-1" />
          Map
        </Button>
        <Button
          variant={viewMode === "video-focus" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("video-focus")}
          className="text-xs"
        >
          <Play className="h-4 w-4 mr-1" />
          Video
        </Button>
      </div>

      {/* Main Content */}
      <div className="pt-20 h-screen flex">
        {/* Video Section */}
        <div
          className={`relative bg-black flex items-center justify-center ${
            viewMode === "split" ? "w-1/2" : viewMode === "video-focus" ? "w-full" : "w-80"
          } ${viewMode === "map-focus" ? "absolute top-20 right-4 z-30" : ""}`}
        >
          {/* Mock Video Player */}
          <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
            <img
              src="/placeholder.svg?height=400&width=600"
              alt="Video frame"
              className="max-w-full max-h-full object-contain"
            />

            {/* Video Controls Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
              <div className="absolute bottom-0 left-0 right-0 p-4 space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <Slider
                    value={[currentTime]}
                    max={videoData.duration}
                    step={1}
                    onValueChange={handleTimeSeek}
                    className="w-full [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&_[role=slider]]:bg-red-500 [&_[role=slider]]:w-3 [&_[role=slider]]:h-3 [&_[role=slider]]:border-0 [&>span:first-child_span]:bg-red-500"
                  />
                  <div className="flex justify-between text-xs text-white">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(videoData.duration)}</span>
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:bg-white/20">
                      {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                    </Button>

                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                      <SkipBack className="h-5 w-5" />
                    </Button>

                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                      <SkipForward className="h-5 w-5" />
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={toggleMute} className="text-white hover:bg-white/20">
                        {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                      </Button>
                      <Slider
                        value={[isMuted ? 0 : volume]}
                        max={100}
                        step={1}
                        onValueChange={(value) => setVolume(value[0])}
                        className="w-20 [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&_[role=slider]]:bg-white [&_[role=slider]]:w-3 [&_[role=slider]]:h-3 [&_[role=slider]]:border-0 [&>span:first-child_span]:bg-white"
                      />
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFullscreen}
                    className="text-white hover:bg-white/20"
                  >
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Map Section */}
        <div
          className={`relative ${
            viewMode === "split" ? "w-1/2" : viewMode === "map-focus" ? "w-full" : "w-0 overflow-hidden"
          }`}
        >
          <MapboxTravelMap
            keyframes={videoData.keyframes}
            currentKeyframe={currentLocation}
            onLocationClick={jumpToKeyframe}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Keyframes Timeline */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm text-white p-4">
        <div className="flex items-center gap-4 overflow-x-auto">
          <span className="text-sm font-medium whitespace-nowrap">Journey Points:</span>
          {videoData.keyframes.map((keyframe, index) => (
            <Button
              key={index}
              variant={currentLocation === keyframe ? "default" : "ghost"}
              size="sm"
              onClick={() => jumpToKeyframe(keyframe)}
              className="whitespace-nowrap text-xs"
            >
              <MapPin className="h-3 w-3 mr-1" />
              {keyframe.location}
              <span className="ml-2 text-xs opacity-70">{formatTime(keyframe.time)}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
