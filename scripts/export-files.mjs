import fs from "node:fs"

const data = JSON.parse(fs.readFileSync("scripts/universities.json", "utf8"))

const clean = {}
for (const [key, list] of Object.entries(data.lists)) {
  clean[key] = {
    label: list.label,
    generatedAt: data.generatedAt,
    rows: list.rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      lat: r.lat ?? null,
      lon: r.lon ?? null,
      geocode: r.geocode ?? null,
      properties: Object.fromEntries(
        Object.entries(r.properties).map(([pid, p]) => [p.name, p.value])
      ),
      content: r.content,
    })),
  }
}
fs.writeFileSync("universities.json", JSON.stringify(clean, null, 2))
console.log("wrote universities.json")
