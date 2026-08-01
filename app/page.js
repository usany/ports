"use client"

import { useEffect, useRef } from "react"

const MARKERS = [
  { position: [25.2854, 51.531], name: "Doha" },
  { position: [39.9042, 116.4074], name: "Beijing" },
  { position: [37.5665, 126.978], name: "Seoul" },
  { position: [35.7087, 139.7206], name: "Waseda" },
]

const WASEDA_POPUP = `
<b style="font-size:16px">Waseda University</b>
<div style="margin-top:6px">
Political Science &middot; Law &middot; Commerce &middot; Engineering &middot; Horticulture &middot; Humanities &middot; Liberal Studies &middot; Social Sciences &middot; Culture Media and Society &middot; Education &middot; Science &middot; Sports &middot; <b>All of the Waseda campuses</b>
</div>
<hr/>
*We do not require nominations in advance but please kindly be informed that in the application documents, we do require to submit the nomination letter by using our certain format so kindly please ask your students to act accordingly then.
<br/><br/>
- <b>Spring semester</b>: November 20<br/>
- <b>Fall semester</b>: March 1<br/>
- <b>Spring semester</b>: April - July<br/>
- <b>Fall semester</b>: September 21 - March 15, 2027
<br/><br/>
Academic calendar: <a href="https://www.waseda.jp/top/en/about/work/organizations/academic-affairs-division/academic-calendar" target="_blank" rel="noreferrer">https://www.waseda.jp/top/en/about/work/organizations/academic-affairs-division/academic-calendar</a>
<br/><br/>
Each school / graduate school has its own specific requirement. Please check the &quot;Lists of Schools (Requirements)&quot; carefully.
<br/><br/>
<a href="https://www.waseda.jp/inst/cie/en/exchange/application" target="_blank" rel="noreferrer">https://www.waseda.jp/inst/cie/en/exchange/application</a>
<br/><br/>
Only the schools/departments listed in the webpage are open to exchange students.<br/>
- At Waseda, in principle, students should take courses from the School they are enrolled in. The options for them to take courses from other schools are quite limited, so please do not rely on taking courses outside the school they apply to.
<br/><br/>
<b>Housing</b><br/>
Dormitories for exchange students are located a few minutes' walk from the Waseda campus. Since they are extremely popular, only a limited number of students are able to move in. Please note that it is not possible to meet all students' requests. For students looking for housing during their stay in Japan, the Residence Life Center website introduces the affiliated companies that offer significant number of student dormitories, shared houses and apartments that are easy for overseas students to apply for. Please make sure to do your own search and make your decision. However, as many of these accommodations are located in the area that require a commute of 40-60 minutes by public transport, we recommend that you search for a room as soon as possible to find one that is close to your requirements.
<br/><br/>
<a href="https://www.waseda.jp/inst/rlc/en/student_dormitory/exchange/" target="_blank" rel="noreferrer">https://www.waseda.jp/inst/rlc/en/student_dormitory/exchange/</a>
<br/><br/>
*Each school / graduate school has its own specific requirement. Please check the &quot;Lists of Schools (Requirements)&quot; above carefully. Applicants must meet ALL the requirements such as GPA and language proficiency.<br/>
*GPA 3.21/4.3 or above<br/>
*Applicants must have completed at least 1 semester at the time of application.
<br/><br/>
<b>Application Guidelines 2026</b><br/>
*At the time of application, applicants must have completed at least one semester at home university.<br/>
*Before coming to Japan, it is strongly recommended to buy travel insurance in your home country which covers the entire exchange period.<br/>
*All exchange students residing with a visa lasting three months or longer are required to enroll Japan's National Health Insurance at the city office they reside. With this insurance, medical expenses will be reduced to 20-30% of total amount (with some exceptions at certain medical facilities). Monthly insurance fee may vary by your residential area (city/ward), but usually around 2,000 yen or less.<br/>
*Additional fee: Differ depending on individual life styles, but the average monthly cost is 80,000 yen for housing, and 80,000 yen for living expenses (food, transportation and daily necessities). More information on insurance will be provided at the general orientation.
<br/><br/>
<b>1 slot</b>
`

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

      const seoul = MARKERS.find((m) => m.name === "Seoul")
      let line = null
      let textMarker = null
      let lineTo = null

      const placeText = (name, points) => {
        const mid = points[Math.floor(points.length / 2)]
        const icon = L.divIcon({
          className: "",
          html: `<span class="pop-text" style="font-size:18px;font-weight:bold;color:#ef4444;background:#fff;padding:4px 10px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap">${name}</span>`,
          iconSize: [0, 0],
        })

        if (!textMarker) {
          textMarker = L.marker(mid, { icon, interactive: false }).addTo(map)
        } else {
          textMarker.setLatLng(mid)
          textMarker.setIcon(icon)
        }
      }

      const removeLine = () => {
        if (line) {
          line.remove()
          line = null
        }
        if (textMarker) {
          textMarker.remove()
          textMarker = null
        }
      }

      const drawLine = (from, to, name) => {
        const points = curvePoints(from, to)
        if (line) {
          line.setLatLngs(points)
          line.addTo(map)
        } else {
          line = L.polyline(points, {
            color: "#ef4444",
            weight: 3,
            dashArray: "6 6",
          }).addTo(map)
        }
        placeText(name, points)
      }

      MARKERS.forEach(({ position, name }) => {
        const marker = L.marker(position, { icon }).addTo(map)

        if (name === "Waseda") {
          marker.bindPopup(WASEDA_POPUP)
        } else if (name !== "Seoul") {
          marker.bindPopup(
            `<b>${name}</b><br/><label class="switch"><input type="checkbox" class="line-toggle"/><span class="slider"></span></label><span class="line-check">&#10003;</span>`
          )

          marker.on("popupopen", () => {
            const el = marker.getPopup().getElement()
            const toggle = el.querySelector(".line-toggle")
            toggle.checked = lineTo === name

            toggle.addEventListener("change", () => {
              if (toggle.checked) {
                drawLine(seoul.position, position, name)
                lineTo = name
              } else {
                removeLine()
                lineTo = null
              }
            })
          })
        } else {
          marker.bindPopup(`<b>${name}</b>`)
        }
      })

      const curvePoints = (a, b) => {
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        const dist = Math.sqrt((a[1] - b[1]) ** 2 + (a[0] - b[0]) ** 2)
        const bulge = Math.min(dist * 0.3, 60)
        const control = [mid[0] + bulge, mid[1]]
        const points = []
        for (let t = 0; t <= 1; t += 0.02) {
          const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * control[0] + t ** 2 * b[0]
          const y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * control[1] + t ** 2 * b[1]
          points.push([x, y])
        }
        return points
      }

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
