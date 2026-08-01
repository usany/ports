"use client"

import { useEffect, useRef } from "react"
import universities from "../universities.json"

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function popupHtml(row) {
  const p = row.properties || {}
  const parts = [`<b style="font-size:15px">${esc(row.title)}</b>`]
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
