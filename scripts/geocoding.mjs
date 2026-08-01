import fs from "node:fs"

const FILE = "scripts/universities.json"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const data = JSON.parse(fs.readFileSync(FILE, "utf8"))

async function geocode(query) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=" +
    encodeURIComponent(query)
  const res = await fetch(url, {
    headers: { "user-agent": "khu-university-list-geocoder/1.0 (outbound.mobility@khu.ac.kr)" },
  })
  if (res.status === 429) {
    await sleep(5000)
    return geocode(query)
  }
  if (!res.ok) throw new Error("geocode " + res.status + " for " + query)
  const j = await res.json()
  if (!j || !j.length) return null
  return { lat: Number(j[0].lat), lon: Number(j[0].lon), display: j[0].display_name }
}

function buildQuery(row) {
  const p = row.properties || {}
  const campus = (p.Campus || "").trim()
  const isSinglePlace = campus && campus !== "All campuses" && !campus.includes(",") && !campus.includes(";") && campus.length < 40
  const region = (p.Region || "").trim()
  let q = row.title
  if (isSinglePlace) q = `${q}, ${campus}`
  if (region) q = `${q}, ${region}`
  return q
}

function cleanTitle(title) {
  return title
    .replace(/[\uAC00-\uD7A3]/g, " ")
    .replace(/\s*Study Abroad Program\s*/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[|].*$/g, "")
    .replace(/\s*-\s*.*$/g, "")
    .replace(/_.*$/g, "")
    .replace(/\(.*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function buildQueries(row) {
  const region = (row.properties && row.properties.Region || "").trim()
  const primary = buildQuery(row)
  const cleaned = cleanTitle(row.title)
  const queries = []
  const push = (q) => {
    const s = q.replace(/\s+/g, " ").trim()
    if (s && s.length > 3 && !queries.includes(s)) queries.push(s)
  }
  push(primary)
  push(cleaned + (region ? `, ${region}` : ""))
  push(cleaned.split(",")[0] + (region ? `, ${region}` : ""))
  const kw = cleaned.match(/^(.{3,}?)\s+(University|Université|Univeristy|Universitat|Hochschule|Institute|Institut|School|College|Polytechnic|Technical|Academy|University of Applied Sciences|대학|유니버시티)/i)
  if (kw && kw[1]) push(kw[1] + (region ? `, ${region}` : ""))
  return queries
}

const MANUAL = {
  "University of Applied Sciences BFI Vienna": "BFI Vienna, Austria",
  "Aix-Marseille University (Faculty of Arts & Humanities)": "Aix-Marseille Université, France",
  "University of Limoges - Faculty of Arts and Humanities": "Université de Limoges, France",
  "Université Paris Dauphine – PSL": "Université Paris-Dauphine, France",
  "Ritsumeikan Asia Pacific University": "立命館アジア太平洋大学",
  "Yamanashi Gakuin University(iCLA)": "山梨学院大学",
  "HU University of Applied Sciences": "Hogeschool Utrecht, Netherlands",
  "University of Navarra(School of Economics and Business)": "Universidad de Navarra, Spain",
  "University of Navarra": "Universidad de Navarra, Spain",
  "OST Eastern Switzerland University of Applied Sciences": "Ostschweizer Fachhochschule Campus Rapperswil Jona, Switzerland",
}

const rows = [...data.lists.exchange.rows, ...data.lists.study.rows]
const done = rows.filter((r) => r.lat != null && r.lon != null)
console.log(`rows total: ${rows.length}, already geocoded: ${done.length}`)

let ok = 0
let fail = 0
let idx = 0
for (const row of rows) {
  if (row.lat != null && row.lon != null) continue
  const queries = buildQueries(row)
  if (MANUAL[row.title]) queries.push(MANUAL[row.title])
  let result = null
  for (const query of queries) {
    result = await geocode(query)
    if (result) break
    await sleep(1100)
  }
  if (result) {
    row.lat = result.lat
    row.lon = result.lon
    row.geocode = result.display
    ok++
  } else {
    row.lat = null
    row.lon = null
    fail++
    console.log("NO RESULT:", row.title)
  }
  idx++
  if (idx % 10 === 0) console.log(`progress: ${idx}/${rows.length} ok=${ok} fail=${fail}`)
  await sleep(1100)
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
console.log(`DONE. ok=${ok} fail=${fail}`)
console.log("saved", FILE)
