"use client"

import React, { useEffect, useRef, useState } from "react"
import universities from "../universities.json"

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function popupHtml(row, onShowAirport) {
  const p = row.properties || {}
  const parts = [`<b style="font-size:15px">${esc(row.title)}</b>`]
  const a = row.nearestAirport
  if (a) {
    const code = a.iata || a.icao || ""
    const today = new Date().toISOString().split("T")[0]
    parts.push(
      `<div style="margin-top:4px;font-size:12px;color:#0f766e">✈ ${esc(a.name)}` +
        (code ? ` (${esc(code)})` : "") +
        ` &middot; ${a.distanceKm} km</div>` +
        `<form id="show-airport-form-${code || a.lat}-${a.lon}" style="margin-top:6px;display:flex;gap:6px;align-items:center">` +
        `<input type="date" id="airport-date-${code || a.lat}-${a.lon}" value="${today}" style="padding:4px 6px;font-size:12px;border:1px solid #ccc;border-radius:3px">` +
        `<button type="submit" style="padding:4px 8px;background:#0f766e;color:white;border:none;border-radius:3px;cursor:pointer;font-size:12px">Show on map</button>` +
        `</form>`
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
  const markersRef = useRef([])
  const shownAirportsRef = useRef(new Map())
  const [searchType, setSearchType] = useState("name")
  const [searchText, setSearchText] = useState("")

  const filterMarkers = (text, type) => {
    const searchTerm = text.toLowerCase()
    markersRef.current.forEach((markerData) => {
      let matches = false

      if (type === "name") {
        matches = markerData.name.toLowerCase().includes(searchTerm)
      } else if (type === "language") {
        const languages = markerData.language ? markerData.language.toLowerCase() : ""
        matches = languages.includes(searchTerm)
      } else if (type === "departments") {
        const departments = markerData.departments ? markerData.departments.toLowerCase() : ""
        matches = departments.includes(searchTerm)
      } else if (type === "country") {
        const country = markerData.country ? markerData.country.toLowerCase() : ""
        matches = country.includes(searchTerm)
      }

      if (matches || searchTerm === "") {
        markerData.marker.addTo(mapInstanceRef.current)
      } else {
        mapInstanceRef.current.removeLayer(markerData.marker)
        // Hide associated airport marker when location marker is hidden
        if (markerData.airport) {
          const airportKey = markerData.airport.iata || markerData.airport.icao || `${markerData.airport.lat},${markerData.airport.lon}`
          if (shownAirportsRef.current && shownAirportsRef.current.has(airportKey)) {
            const airportMarker = shownAirportsRef.current.get(airportKey)
            mapInstanceRef.current.removeLayer(airportMarker)
            shownAirportsRef.current.delete(airportKey)

            // Reset button state
            const formId = `show-airport-form-${airportKey}`
            const form = document.getElementById(formId)
            if (form) {
              const btn = form.querySelector("button[type='submit']")
              if (btn) {
                btn.textContent = "Show on map"
                btn.style.background = "#0f766e"
              }
            }
          }
        }
      }
    })
  }

  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return

    import("leaflet").then(({ default: L }) => {
      import("leaflet/dist/leaflet.css")

      const map = L.map(mapRef.current).setView([20, 0], 2)

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)

      const toggleAirportMarker = (airport, button, dateStr = null) => {
        const code = airport.iata || airport.icao
        const key = code || `${airport.lat},${airport.lon}`

        if (shownAirportsRef.current.has(key)) {
          const marker = shownAirportsRef.current.get(key)
          map.removeLayer(marker)
          shownAirportsRef.current.delete(key)
          button.textContent = "Show on map"
          button.style.background = "#0f766e"
          return
        }

        const marker = L.marker([airport.lat, airport.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:10px;height:10px;background:#f59e0b;border:2px solid #fff;border-radius:2px;transform:rotate(45deg);box-shadow:0 0 2px rgba(0,0,0,.5)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
        })
          .bindPopup(
            `<b style="font-size:14px">✈ ${esc(airport.name)}</b>` +
              `<div style="margin-top:2px;color:#555">${esc(airport.city)}${code ? " &middot; " + esc(code) : ""}</div>` +
              `<div id="flight-price-${code}" style="margin-top:8px;font-size:12px;color:#666"></div>`
          )
          .addTo(map)

        shownAirportsRef.current.set(key, marker)
        shownAirportsRef.current.set(`${key}-date`, dateStr)
        button.textContent = "Hide from map"
        button.style.background = "#d97706"

        marker.on("popupopen", async () => {
          if (!code) return
          const priceDiv = document.getElementById(`flight-price-${code}`)
          if (!priceDiv) return

          priceDiv.innerHTML = `<div style="color:#999">Loading prices...</div>`
          let finalDateStr = dateStr
          if (!finalDateStr) {
            const today = new Date()
            const futureDate = new Date(today.getTime() + 9 * 24 * 60 * 60 * 1000)
            finalDateStr = futureDate.toISOString().split("T")[0].replace(/-/g, "")
          }

          const flightData = await getFlightPrice("SEL", code, finalDateStr)
          console.log("Flight response for", code, ":", flightData)

          let html = ""
          let priceFound = false

          // Try to get price from flights array first
          if (flightData && flightData.flights && flightData.flights.length > 0) {
            const flight = flightData.flights[0]
            if (flight.price) {
              const priceStr = flight.price.toLocaleString()
              html = `<div style="margin-top:4px;font-size:12px;color:#059669"><b>₩${priceStr}</b></div>`
              priceFound = true

              // Show airline if available
              if (flight.airline) {
                html += `<div style="margin-top:2px;font-size:11px;color:#555">${flight.airline}</div>`
              }

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
          }

          // Fallback to main price from API if flights extraction failed
          if (!priceFound && flightData && flightData.price) {
            const priceStr = flightData.price.toLocaleString()
            html = `<div style="margin-top:4px;font-size:12px;color:#059669"><b>₩${priceStr}</b></div>`
            priceFound = true
          }

          // Show unavailable if no price found
          if (!priceFound) {
            html = `<div style="margin-top:4px;font-size:11px;color:#999">Price unavailable</div>`
          }

          priceDiv.innerHTML = html
        })

        marker.on("popupclose", () => {
          // Hide airport marker when its popup is closed
          const markerKey = code || `${airport.lat},${airport.lon}`
          if (shownAirportsRef.current.has(markerKey)) {
            const airportMarker = shownAirportsRef.current.get(markerKey)
            map.removeLayer(airportMarker)
            shownAirportsRef.current.delete(markerKey)

            // Update button state in location marker popup
            const formId = `show-airport-form-${markerKey}`
            const form = document.getElementById(formId)
            if (form) {
              const btn = form.querySelector("button[type='submit']")
              if (btn) {
                btn.textContent = "Show on map"
                btn.style.background = "#0f766e"
              }
            }
          }
        })

        marker.openPopup()
      }

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

      const addMarkers = (rows, color) => {
        rows.forEach((row) => {
          if (row.lat == null || row.lon == null) return
          const marker = L.circleMarker([row.lat, row.lon], {
            radius: 5,
            color: "#fff",
            weight: 1,
            fillColor: color,
            fillOpacity: 0.85,
          })
            .bindPopup(popupHtml(row))
            .addTo(map)

          // Track marker for filtering
          const properties = row.properties || {}
          markersRef.current.push({
            name: row.title,
            marker: marker,
            airport: row.nearestAirport,
            language: properties["Language(수학언어)"] || properties.Language || "",
            departments: properties.Departments || "",
            country: properties.Region || "",
          })

          marker.on("popupopen", () => {
            if (row.nearestAirport) {
              const code = row.nearestAirport.iata || row.nearestAirport.icao
              const formId = `show-airport-form-${code || row.nearestAirport.lat}-${row.nearestAirport.lon}`
              const dateId = `airport-date-${code || row.nearestAirport.lat}-${row.nearestAirport.lon}`
              const form = document.getElementById(formId)
              if (form && !form.dataset.attached) {
                form.dataset.attached = "true"
                form.addEventListener("submit", (e) => {
                  e.preventDefault()
                  const dateInput = document.getElementById(dateId)
                  const selectedDate = dateInput.value.replace(/-/g, "")
                  const submitBtn = form.querySelector("button[type='submit']")
                  toggleAirportMarker(row.nearestAirport, submitBtn, selectedDate)
                })
              }
            }
          })
        })
      }

      addMarkers(universities.exchange.rows, "#3b82f6")
      addMarkers(universities.study.rows, "#10b981")

      mapInstanceRef.current = map
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: "10px", padding: "10px", alignItems: "center" }}>
        <select
          value={searchType}
          onChange={(e) => {
            setSearchType(e.target.value)
            filterMarkers(searchText, e.target.value)
          }}
          style={{
            padding: "8px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
            zIndex: 1000,
          }}
        >
          <option value="name">Search by Name</option>
          <option value="language">Search by Language</option>
          <option value="country">Search by Country</option>
          <option value="departments">Search by Departments</option>
        </select>
        <input
          type="text"
          placeholder={
            searchType === "name"
              ? "Search university name..."
              : searchType === "language"
              ? "Search language..."
              : searchType === "departments"
              ? "Search departments..."
              : "Search country..."
          }
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value)
            filterMarkers(e.target.value, searchType)
          }}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
            zIndex: 1000,
          }}
        />
      </div>
      <div ref={mapRef} style={{ flex: 1, width: "100%" }} />
    </div>
  )
}
