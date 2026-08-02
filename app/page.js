"use client"

import { useEffect, useRef } from "react"
import universities from "../universities.json"

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function popupHtml(row) {
  const p = row.properties || {}
  const parts = [`<b style="font-size:15px">${esc(row.title)}</b>`]
  const a = row.nearestAirport
  if (a) {
    const code = a.iata || a.icao || ""
    parts.push(
      `<div style="margin-top:4px;font-size:12px;color:#0f766e">✈ ${esc(a.name)}` +
        (code ? ` (${esc(code)})` : "") +
        ` &middot; ${a.distanceKm} km</div>`
    )
  }
  const add = (k, label) => {
    const v = p[k]
    if (v && String(v).trim()) parts.push(`<div style="margin-top:4px"><b>${label}:</b> ${esc(v)}</div>`)
  }
  if (p.Region) parts.push(`<div style="margin-top:2px;color:#555">${esc(p.Region)}</div>`)
  add("Language(수학언어)", "Language")
  add("Features", "Test scores")
  add("Slots(모집인원)", "Slots")
  add("Slots (모집인원)", "Slots")
  add("Departments", "Departments")
  add("Application Due", "Application due")
  add("Nomination due", "Nomination due")
  add("Semester dates", "Semester dates")
  const links = []
  if (p.Website) links.push(`<a href="${esc(p.Website)}" target="_blank" rel="noreferrer">Website</a>`)
  if (p.Factsheet) links.push(`<a href="${esc(p.Factsheet)}" target="_blank" rel="noreferrer">Factsheet</a>`)
  if (links.length) parts.push(`<div style="margin-top:6px">${links.join(" &middot; ")}</div>`)
  return parts.join("")
}

export default function Home() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return

    import("leaflet").then(({ default: L }) => {
      import("leaflet/dist/leaflet.css")

      const map = L.map(mapRef.current).setView([20, 0], 2)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      const addMarkers = (rows, color) => {
        rows.forEach((row) => {
          if (row.lat == null || row.lon == null) return
          L.circleMarker([row.lat, row.lon], {
            radius: 5,
            color: "#fff",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.85,
          })
            .bindPopup(popupHtml(row))
            .addTo(map)
        })
      }

      addMarkers(universities.exchange.rows, "#3b82f6")
      addMarkers(universities.study.rows, "#10b981")

      const getFlightPrice = async (origin, destination, date) => {
        try {
          const url = `/api/flight-price?origin=${origin}&destination=${destination}&date=${date}`
          console.log("Fetching flight prices from:", url)
          const response = await fetch(url)
          const data = await response.json()
          console.log("Flight price response:", data)
          return data
        } catch (error) {
          console.error("Error fetching flight price:", error)
          return { error: error.message }
        }
      }

      const addAirports = () => {
        const seen = new Set()
        const airports = []
        const collect = (rows) =>
          rows.forEach((row) => {
            const a = row.nearestAirport
            if (!a) return
            const key = a.iata || a.icao || `${a.lat},${a.lon}`
            if (seen.has(key)) return
            seen.add(key)
            airports.push(a)
          })
        collect(universities.exchange.rows)
        collect(universities.study.rows)
        airports.forEach((a) => {
          const code = a.iata || a.icao
          const marker = L.marker([a.lat, a.lon], {
            icon: L.divIcon({
              className: "",
              html: `<div style="width:10px;height:10px;background:#f59e0b;border:2px solid #fff;border-radius:2px;transform:rotate(45deg);box-shadow:0 0 2px rgba(0,0,0,.5)"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            }),
          })
            .bindPopup(
              `<b style="font-size:14px">✈ ${esc(a.name)}</b>` +
                `<div style="margin-top:2px;color:#555">${esc(a.city)}${code ? " &middot; " + esc(code) : ""}</div>` +
                `<div id="flight-price-${code}" style="margin-top:8px;font-size:12px;color:#666"></div>`
            )
            .addTo(map)

          marker.on("popupopen", async () => {
            if (!code) return
            const priceDiv = document.getElementById(`flight-price-${code}`)
            if (!priceDiv) return

            priceDiv.innerHTML = `<div style="color:#999">Loading prices...</div>`
            const today = new Date()
            const futureDate = new Date(today.getTime() + 9 * 24 * 60 * 60 * 1000)
            const dateStr = futureDate.toISOString().split("T")[0].replace(/-/g, "")

            const flightData = await getFlightPrice("SEL", code, dateStr)

            if (flightData && flightData.success && flightData.price) {
              const priceStr = flightData.price.toLocaleString()
              let html = `<div style="margin-top:4px;font-size:12px;color:#059669"><b>₩${priceStr}</b></div>`

              // Show flight details if available
              if (flightData.flights && flightData.flights.length > 0) {
                const flight = flightData.flights[0]
                if (flight.duration || flight.stops !== null || flight.isDirect) {
                  html += `<div style="margin-top:3px;font-size:10px;color:#666">`

                  if (flight.isDirect) {
                    html += `직항`
                  } else if (flight.stops !== null && flight.stops > 0) {
                    html += `${flight.stops}회 경유`
                  }

                  if (flight.duration) {
                    const hasPreviousInfo = flight.isDirect || (flight.stops !== null && flight.stops > 0)
                    html += hasPreviousInfo ? ` · ` : ``
                    html += flight.duration
                  }

                  html += `</div>`
                }
              }

              priceDiv.innerHTML = html
            } else {
              priceDiv.innerHTML = `<div style="margin-top:4px;font-size:11px;color:#999">Price unavailable</div>`
            }
          })
        })
      }
      addAirports()

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
