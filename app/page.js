"use client"

import { useEffect, useRef } from "react"

const MARKERS = [
  { position: [25.2854, 51.531], name: "Doha" },
  { position: [39.9042, 116.4074], name: "Beijing" },
]

export default function Home() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return

    import("leaflet").then(({ default: L }) => {
      import("leaflet/dist/leaflet.css")

      const map = L.map(mapRef.current).setView(MARKERS[0].position, 4)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      })

      MARKERS.forEach(({ position, name }) => {
        L.marker(position, { icon }).addTo(map).bindPopup(`<b>${name}</b>`)
      })

      mapInstanceRef.current = map
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  return <div ref={mapRef} style={{ height: "100vh", width: "100%" }} />
}
