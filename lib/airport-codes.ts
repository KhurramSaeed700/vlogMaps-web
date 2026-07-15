export interface AirportCodeLocation {
  code: string
  name: string
  lat: number
  lng: number
}

const airportCodeLocations: Record<string, AirportCodeLocation> = {
  ATL: { code: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", lat: 33.6407, lng: -84.4277 },
  CDG: { code: "CDG", name: "Paris Charles de Gaulle Airport", lat: 49.0097, lng: 2.5479 },
  DCA: { code: "DCA", name: "Ronald Reagan Washington National Airport", lat: 38.8512, lng: -77.0402 },
  DEL: { code: "DEL", name: "Indira Gandhi International Airport", lat: 28.5562, lng: 77.1 },
  DXB: { code: "DXB", name: "Dubai International Airport", lat: 25.2532, lng: 55.3657 },
  EWR: { code: "EWR", name: "Newark Liberty International Airport", lat: 40.6895, lng: -74.1745 },
  IAD: { code: "IAD", name: "Washington Dulles International Airport", lat: 38.9531, lng: -77.4565 },
  IST: { code: "IST", name: "Istanbul Airport", lat: 41.2753, lng: 28.7519 },
  JFK: { code: "JFK", name: "John F. Kennedy International Airport", lat: 40.6413, lng: -73.7781 },
  KHI: { code: "KHI", name: "Jinnah International Airport", lat: 24.9065, lng: 67.1608 },
  LAX: { code: "LAX", name: "Los Angeles International Airport", lat: 33.9416, lng: -118.4085 },
  LHE: { code: "LHE", name: "Allama Iqbal International Airport", lat: 31.5216, lng: 74.4036 },
  LHR: { code: "LHR", name: "London Heathrow Airport", lat: 51.47, lng: -0.4543 },
  ORD: { code: "ORD", name: "Chicago O'Hare International Airport", lat: 41.9742, lng: -87.9073 },
  PEK: { code: "PEK", name: "Beijing Capital International Airport", lat: 40.0799, lng: 116.6031 },
  SFO: { code: "SFO", name: "San Francisco International Airport", lat: 37.6213, lng: -122.379 },
}

export function getAirportCodeLocation(code: string) {
  return airportCodeLocations[code.trim().toUpperCase()] ?? null
}
